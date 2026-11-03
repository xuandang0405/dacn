from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Activity, KanbanColumn, Project, ProjectMember, Subtask, Task, User, WorkspaceMember
from app.schemas import ColumnIn, ColumnOut, ProjectIn, ProjectOut
from app.security import current_user, project_access, workspace_access

router = APIRouter(tags=["Projects"])
DEFAULT_COLUMNS = [("BACKLOG", False), ("TODO", False), ("IN_PROGRESS", False), ("REVIEW", False), ("DONE", True)]

@router.get("/workspaces/{workspace_id}/projects", response_model=list[ProjectOut], summary="Accessible projects")
def list_projects(workspace_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    member = workspace_access(db, workspace_id, user)
    stmt = select(Project).where(Project.workspace_id == workspace_id)
    if member.role == "MEMBER":
        stmt = stmt.join(ProjectMember).where(ProjectMember.user_id == user.id)
    return db.scalars(stmt.order_by(Project.created_at.desc())).all()

@router.post("/workspaces/{workspace_id}/projects", response_model=ProjectOut, status_code=201, summary="Create project")
def create_project(workspace_id: int, data: ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace_access(db, workspace_id, user, {"OWNER", "ADMIN"})
    p = Project(workspace_id=workspace_id, created_by=user.id, **data.model_dump())
    db.add(p)
    db.flush()
    for position, (name, is_done) in enumerate(DEFAULT_COLUMNS):
        db.add(KanbanColumn(project_id=p.id, name=name, position=position, is_done=is_done))
    db.add(ProjectMember(project_id=p.id, user_id=user.id))
    db.add(Activity(project_id=p.id, actor_id=user.id, action="project.created", entity="project", entity_id=p.id))
    db.commit()
    db.refresh(p)
    return p

@router.get("/projects/{project_id}", response_model=ProjectOut, summary="Project detail")
def get_project(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return project_access(db, project_id, user)

@router.put("/projects/{project_id}", response_model=ProjectOut, summary="Update project")
def update_project(project_id: int, data: ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = project_access(db, project_id, user, manage=True)
    for key, value in data.model_dump().items():
        setattr(p, key, value)
    db.commit()
    return p

@router.delete("/projects/{project_id}", status_code=204, summary="Delete project")
def delete_project(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = project_access(db, project_id, user, manage=True)
    db.delete(p)
    db.commit()

@router.get("/projects/{project_id}/members", response_model=list[int], summary="Project member identifiers")
def project_members(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project_access(db, project_id, user)
    return db.scalars(select(ProjectMember.user_id).where(ProjectMember.project_id == project_id)).all()

@router.post("/projects/{project_id}/members/{user_id}", status_code=201, summary="Add project member")
def add_project_member(project_id: int, user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = project_access(db, project_id, user, manage=True)
    membership = db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == p.workspace_id, WorkspaceMember.user_id == user_id, WorkspaceMember.status == "ACTIVE"))
    if not membership:
        raise HTTPException(422, "User must be a workspace member")
    if db.scalar(select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)):
        raise HTTPException(409, "Already a project member")
    db.add(ProjectMember(project_id=project_id, user_id=user_id))
    db.commit()
    return {"user_id": user_id}

@router.delete("/projects/{project_id}/members/{user_id}", status_code=204, summary="Remove project member")
def remove_project_member(project_id: int, user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project_access(db, project_id, user, manage=True)
    member = db.scalar(select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id))
    if not member:
        raise HTTPException(404, "Member not found")
    from sqlalchemy import update
    task_ids = db.scalars(select(Task.id).where(Task.project_id == project_id)).all()
    db.execute(update(Task).where(Task.project_id == project_id, Task.assignee_id == user_id).values(assignee_id=None))
    if task_ids:
        db.execute(update(Subtask).where(Subtask.task_id.in_(task_ids), Subtask.assignee_id == user_id).values(assignee_id=None))
    db.delete(member)
    db.commit()

@router.get("/projects/{project_id}/columns", response_model=list[ColumnOut], summary="Kanban columns")
def columns(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project_access(db, project_id, user)
    return db.scalars(select(KanbanColumn).where(KanbanColumn.project_id == project_id).order_by(KanbanColumn.position)).all()

@router.post("/projects/{project_id}/columns", response_model=ColumnOut, status_code=201, summary="Create Kanban column")
def create_column(project_id: int, data: ColumnIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project_access(db, project_id, user, manage=True)
    cols = db.scalars(select(KanbanColumn).where(KanbanColumn.project_id == project_id).order_by(KanbanColumn.position).with_for_update()).all()
    c = KanbanColumn(project_id=project_id, name=data.name, is_done=data.is_done, position=len(cols))
    db.add(c)
    db.commit()
    db.refresh(c)
    return c
