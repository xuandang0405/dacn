from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.realtime import hub
from app.db import get_db
from app.models import (
    Activity,
    KanbanColumn,
    Project,
    ProjectDocument,
    ProjectMember,
    Subtask,
    Task,
    User,
    WorkspaceMember,
)
from app.services import storage
from app.schemas import ColumnIn, ColumnOut, ProjectIn, ProjectOut
from app.security import current_user, project_access, workspace_access

router = APIRouter(tags=["Projects"])
DEFAULT_COLUMNS = [
    ("BACKLOG", False),
    ("TODO", False),
    ("IN_PROGRESS", False),
    ("REVIEW", False),
    ("DONE", True),
]


@router.get(
    "/workspaces/{workspace_id}/projects",
    response_model=list[ProjectOut],
    summary="Accessible projects",
)
def list_projects(
    workspace_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    thanh_vien = workspace_access(db, workspace_id, user)
    truy_van = select(Project).where(Project.workspace_id == workspace_id)
    if thanh_vien.role == "MEMBER":
        truy_van = truy_van.join(ProjectMember).where(ProjectMember.user_id == user.id)
    return db.scalars(truy_van.order_by(Project.created_at.desc())).all()


@router.post(
    "/workspaces/{workspace_id}/projects",
    response_model=ProjectOut,
    status_code=201,
    summary="Create project",
)
def create_project(
    workspace_id: int,
    data: ProjectIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    workspace_access(db, workspace_id, user, {"OWNER", "ADMIN"})
    du_an = Project(workspace_id=workspace_id, created_by=user.id, **data.model_dump())
    db.add(du_an)
    db.flush()
    for vi_tri, (ten_cot, la_cot_hoan_thanh) in enumerate(DEFAULT_COLUMNS):
        db.add(
            KanbanColumn(
                project_id=du_an.id,
                name=ten_cot,
                position=vi_tri,
                is_done=la_cot_hoan_thanh,
            )
        )
    db.add(ProjectMember(project_id=du_an.id, user_id=user.id))
    db.add(
        Activity(
            project_id=du_an.id,
            actor_id=user.id,
            action="project.created",
            entity="project",
            entity_id=du_an.id,
        )
    )
    db.commit()
    db.refresh(du_an)
    return du_an


@router.get(
    "/projects/{project_id}", response_model=ProjectOut, summary="Project detail"
)
def get_project(
    project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    return project_access(db, project_id, user)


@router.put(
    "/projects/{project_id}", response_model=ProjectOut, summary="Update project"
)
def update_project(
    project_id: int,
    data: ProjectIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    du_an = project_access(db, project_id, user, manage=True)
    for ten_truong, gia_tri in data.model_dump().items():
        setattr(du_an, ten_truong, gia_tri)
    db.commit()
    return du_an


@router.delete("/projects/{project_id}", status_code=204, summary="Delete project")
def delete_project(
    project_id: int,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    du_an = project_access(db, project_id, user, manage=True)
    khoa_tep = list(
        db.scalars(
            select(ProjectDocument.storage_key).where(
                ProjectDocument.project_id == project_id
            )
        )
    )
    db.delete(du_an)
    db.commit()
    background_tasks.add_task(storage.remove_deleted_documents, khoa_tep)
    background_tasks.add_task(
        hub.publish,
        project_id,
        "project.deleted",
        du_an.workspace_id,
        project_id,
        user.id,
        {},
    )


@router.get(
    "/projects/{project_id}/members",
    response_model=list[int],
    summary="Project member identifiers",
)
def project_members(
    project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    project_access(db, project_id, user)
    return db.scalars(
        select(ProjectMember.user_id).where(ProjectMember.project_id == project_id)
    ).all()


@router.post(
    "/projects/{project_id}/members/{user_id}",
    status_code=201,
    summary="Add project member",
)
def add_project_member(
    project_id: int,
    user_id: int,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    du_an = project_access(db, project_id, user, manage=True)
    workspace_id = du_an.workspace_id
    quyen_tham_gia = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == du_an.workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == "ACTIVE",
        )
    )
    if not quyen_tham_gia:
        raise HTTPException(422, "User must be a workspace member")
    if db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    ):
        raise HTTPException(409, "Already a project member")
    db.add(ProjectMember(project_id=project_id, user_id=user_id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Already a project member")
    background_tasks.add_task(
        hub.publish,
        project_id,
        "project.members_changed",
        workspace_id,
        project_id,
        user.id,
        {},
    )
    background_tasks.add_task(
        hub.publish_user,
        user_id,
        "notification.created",
        {"kind": "project_access_changed", "project_id": project_id},
    )
    return {"user_id": user_id}


@router.delete(
    "/projects/{project_id}/members/{user_id}",
    status_code=204,
    summary="Remove project member",
)
def remove_project_member(
    project_id: int,
    user_id: int,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    project = project_access(db, project_id, user, manage=True)
    workspace_id = project.workspace_id
    thanh_vien = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    if not thanh_vien:
        raise HTTPException(404, "Member not found")
    from sqlalchemy import update

    ma_task = db.scalars(select(Task.id).where(Task.project_id == project_id)).all()
    db.execute(
        update(Task)
        .where(Task.project_id == project_id, Task.assignee_id == user_id)
        .values(assignee_id=None, version=Task.version + 1)
    )
    if ma_task:
        db.execute(
            update(Subtask)
            .where(Subtask.task_id.in_(ma_task), Subtask.assignee_id == user_id)
            .values(assignee_id=None, version=Subtask.version + 1)
        )
    db.delete(thanh_vien)
    db.commit()
    background_tasks.add_task(
        hub.publish,
        project_id,
        "project.members_changed",
        workspace_id,
        project_id,
        user.id,
        {},
    )
    background_tasks.add_task(
        hub.publish_user,
        user_id,
        "notification.created",
        {"kind": "project_access_changed", "project_id": project_id},
    )


@router.get(
    "/projects/{project_id}/columns",
    response_model=list[ColumnOut],
    summary="Kanban columns",
)
def columns(
    project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    project_access(db, project_id, user)
    return db.scalars(
        select(KanbanColumn)
        .where(KanbanColumn.project_id == project_id)
        .order_by(KanbanColumn.position)
    ).all()


@router.post(
    "/projects/{project_id}/columns",
    response_model=ColumnOut,
    status_code=201,
    summary="Create Kanban column",
)
def create_column(
    project_id: int,
    data: ColumnIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    project_access(db, project_id, user, manage=True)
    cac_cot = db.scalars(
        select(KanbanColumn)
        .where(KanbanColumn.project_id == project_id)
        .order_by(KanbanColumn.position)
        .with_for_update()
    ).all()
    cot_moi = KanbanColumn(
        project_id=project_id,
        name=data.name,
        is_done=data.is_done,
        position=len(cac_cot),
    )
    db.add(cot_moi)
    db.commit()
    db.refresh(cot_moi)
    return cot_moi
