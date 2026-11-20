from datetime import timedelta
import secrets
from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import (
    WorkspaceInvitation,
    utcnow,
    Activity,
    Notification,
    Project,
    ProjectMember,
    Subtask,
    Task,
    User,
    Workspace,
    WorkspaceMember,
)
from app.schemas import (
    InviteIn,
    MemberOut,
    RoleIn,
    WorkspaceIn,
    WorkspaceOut,
    CapacityIn,
)
from app.realtime import hub
from app.security import current_user, workspace_access
from app.models import ProjectDocument
from app.services import storage

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])


@router.patch(
    "/{workspace_id}/members/{user_id}/capacity",
    response_model=MemberOut,
    summary="Update weekly member capacity",
)
def change_capacity(
    workspace_id: int,
    user_id: int,
    data: CapacityIn,
    background_tasks: BackgroundTasks,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    workspace_access(db, workspace_id, actor, {"OWNER", "ADMIN"})
    member = db.scalar(
        select(WorkspaceMember)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == "ACTIVE",
        )
        .with_for_update()
    )
    if member is None:
        raise HTTPException(404, "Member not found")
    member.capacity_hours = data.capacity_hours
    db.commit()
    person = db.get(User, user_id)
    result = MemberOut(
        user_id=person.id,
        name=person.name,
        email=person.email,
        username=person.username,
        role=member.role,
        capacity_hours=member.capacity_hours,
    )
    db.rollback()
    background_tasks.add_task(hub.publish_workspace, workspace_id)
    return result


@router.get("", response_model=list[WorkspaceOut], summary="My workspaces")
def list_workspaces(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Workspace)
        .join(WorkspaceMember)
        .where(WorkspaceMember.user_id == user.id, WorkspaceMember.status == "ACTIVE")
        .order_by(Workspace.created_at.desc())
    ).all()


@router.post(
    "", response_model=WorkspaceOut, status_code=201, summary="Create workspace"
)
def create_workspace(
    data: WorkspaceIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    khong_gian = Workspace(
        name=data.name.strip(), description=data.description, owner_id=user.id
    )
    db.add(khong_gian)
    db.flush()
    db.add(WorkspaceMember(workspace_id=khong_gian.id, user_id=user.id, role="OWNER"))
    db.commit()
    db.refresh(khong_gian)
    return khong_gian


@router.get("/{workspace_id}", response_model=WorkspaceOut, summary="Workspace detail")
def get_workspace(
    workspace_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    workspace_access(db, workspace_id, user)
    return db.get(Workspace, workspace_id)


@router.put("/{workspace_id}", response_model=WorkspaceOut, summary="Update workspace")
def update_workspace(
    workspace_id: int,
    data: WorkspaceIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    workspace_access(db, workspace_id, user, {"OWNER", "ADMIN"})
    khong_gian = db.get(Workspace, workspace_id)
    khong_gian.name, khong_gian.description = data.name.strip(), data.description
    db.commit()
    return khong_gian


@router.delete("/{workspace_id}", status_code=204, summary="Delete workspace")
def delete_workspace(
    workspace_id: int,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    workspace_access(db, workspace_id, user, {"OWNER"})
    khoa_tep = list(
        db.scalars(
            select(ProjectDocument.storage_key)
            .join(Project, Project.id == ProjectDocument.project_id)
            .where(Project.workspace_id == workspace_id)
        )
    )
    db.delete(db.get(Workspace, workspace_id))
    db.commit()
    background_tasks.add_task(storage.remove_deleted_documents, khoa_tep)


@router.get(
    "/{workspace_id}/members",
    response_model=list[MemberOut],
    summary="Workspace members",
)
def members(
    workspace_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    workspace_access(db, workspace_id, user)
    cac_dong = db.execute(
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == "ACTIVE",
        )
    ).all()
    ket_qua = []
    for thanh_vien, tai_khoan in cac_dong:
        ket_qua.append(
            MemberOut(
                user_id=tai_khoan.id,
                name=tai_khoan.name,
                email=tai_khoan.email,
                username=tai_khoan.username,
                role=thanh_vien.role,
                capacity_hours=thanh_vien.capacity_hours,
            )
        )
    return ket_qua


@router.post(
    "/{workspace_id}/members",
    status_code=201,
    summary="Send a pending workspace invitation",
)
def invite(
    workspace_id: int,
    data: InviteIn,
    background_tasks: BackgroundTasks,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    workspace_access(db, workspace_id, actor, {"OWNER", "ADMIN"})
    user = db.scalar(
        select(User).where(User.email == data.email.lower(), User.active.is_(True))
    )
    if not user:
        raise HTTPException(404, "Account not found; ask the person to register first")
    thanh_vien = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == "ACTIVE",
        )
    )
    if thanh_vien:
        raise HTTPException(409, "Already a member")
    loi_moi = db.scalar(
        select(WorkspaceInvitation)
        .where(
            WorkspaceInvitation.workspace_id == workspace_id,
            WorkspaceInvitation.user_id == user.id,
        )
        .with_for_update()
    )
    if loi_moi and loi_moi.status == "PENDING" and loi_moi.expires_at > utcnow():
        raise HTTPException(409, "Invitation already pending")
    hien_tai = utcnow()
    if loi_moi:
        loi_moi.status, loi_moi.role, loi_moi.invited_by = (
            "PENDING",
            data.role,
            actor.id,
        )
        loi_moi.nonce = secrets.token_hex(16)
        loi_moi.expires_at, loi_moi.created_at, loi_moi.responded_at = (
            hien_tai + timedelta(days=7),
            hien_tai,
            None,
        )
    else:
        loi_moi = WorkspaceInvitation(
            workspace_id=workspace_id,
            user_id=user.id,
            invited_by=actor.id,
            role=data.role,
            expires_at=hien_tai + timedelta(days=7),
        )
        db.add(loi_moi)
    db.add(
        Notification(
            user_id=user.id,
            workspace_id=workspace_id,
            kind="invitation",
            message="Workspace invitation awaiting your response",
            entity_id=workspace_id,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Invitation already pending")
    ket_qua = {
        "id": loi_moi.id,
        "user_id": user.id,
        "status": loi_moi.status,
        "expires_at": loi_moi.expires_at,
    }
    background_tasks.add_task(
        hub.publish_user,
        user.id,
        "notification.created",
        {"kind": "invitation", "workspace_id": workspace_id},
    )
    db.rollback()
    return ket_qua


@router.patch(
    "/{workspace_id}/members/{user_id}",
    response_model=MemberOut,
    summary="Change member role",
)
def change_role(
    workspace_id: int,
    user_id: int,
    data: RoleIn,
    background_tasks: BackgroundTasks,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    workspace_access(db, workspace_id, actor, {"OWNER"})
    thanh_vien = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == "ACTIVE",
        )
    )
    if not thanh_vien or thanh_vien.role == "OWNER":
        raise HTTPException(404, "Member not found")
    du_an_mat_quyen = []
    if thanh_vien.role == "ADMIN" and data.role == "MEMBER":
        # ADMIN vốn xem được mọi dự án. Khi hạ vai trò, chỉ giữ các quyền đã cấp riêng.
        quyen_du_an_truc_tiep = select(ProjectMember.project_id).where(
            ProjectMember.user_id == user_id
        )
        du_an_mat_quyen = list(
            db.scalars(
                select(Project.id).where(
                    Project.workspace_id == workspace_id,
                    Project.id.not_in(quyen_du_an_truc_tiep),
                )
            )
        )
        if du_an_mat_quyen:
            ma_task = list(
                db.scalars(select(Task.id).where(Task.project_id.in_(du_an_mat_quyen)))
            )
            db.execute(
                update(Task)
                .where(
                    Task.project_id.in_(du_an_mat_quyen), Task.assignee_id == user_id
                )
                .values(assignee_id=None, version=Task.version + 1)
            )
            if ma_task:
                db.execute(
                    update(Subtask)
                    .where(Subtask.task_id.in_(ma_task), Subtask.assignee_id == user_id)
                    .values(assignee_id=None, version=Subtask.version + 1)
                )
    thanh_vien.role = data.role
    db.add(
        Notification(
            user_id=user_id,
            workspace_id=workspace_id,
            kind="role_changed",
            message=f"Your role is now {data.role}",
            entity_id=workspace_id,
        )
    )
    db.add(
        Activity(
            workspace_scope_id=workspace_id,
            actor_id=actor.id,
            action="member.role_changed",
            entity="user",
            entity_id=user_id,
        )
    )
    db.commit()
    for project_id in du_an_mat_quyen:
        background_tasks.add_task(
            hub.publish,
            project_id,
            "project.members_changed",
            workspace_id,
            project_id,
            actor.id,
            {},
        )
    background_tasks.add_task(
        hub.publish_user,
        user_id,
        "notification.created",
        {"kind": "role_changed", "workspace_id": workspace_id},
    )
    user = db.get(User, user_id)
    ket_qua = MemberOut(
        user_id=user.id,
        name=user.name,
        email=user.email,
        username=user.username,
        role=thanh_vien.role,
        capacity_hours=thanh_vien.capacity_hours,
    )
    db.rollback()
    return ket_qua


@router.delete(
    "/{workspace_id}/members/{user_id}", status_code=204, summary="Remove member"
)
def remove_member(
    workspace_id: int,
    user_id: int,
    background_tasks: BackgroundTasks,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    workspace_access(db, workspace_id, actor, {"OWNER", "ADMIN"})
    thanh_vien = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
            WorkspaceMember.status == "ACTIVE",
        )
    )
    if (
        not thanh_vien
        or thanh_vien.role == "OWNER"
        or (
            thanh_vien.role == "ADMIN"
            and actor.id != db.get(Workspace, workspace_id).owner_id
        )
    ):
        raise HTTPException(403, "Cannot remove this member")
    thanh_vien.status = "REMOVED"
    ma_du_an = db.scalars(
        select(Project.id).where(Project.workspace_id == workspace_id)
    ).all()
    if ma_du_an:
        from sqlalchemy import update

        ma_task = db.scalars(select(Task.id).where(Task.project_id.in_(ma_du_an))).all()
        db.execute(
            update(Task)
            .where(Task.project_id.in_(ma_du_an), Task.assignee_id == user_id)
            .values(assignee_id=None, version=Task.version + 1)
        )
        if ma_task:
            db.execute(
                update(Subtask)
                .where(Subtask.task_id.in_(ma_task), Subtask.assignee_id == user_id)
                .values(assignee_id=None, version=Subtask.version + 1)
            )
    for quyen_du_an in db.scalars(
        select(ProjectMember).where(
            ProjectMember.user_id == user_id, ProjectMember.project_id.in_(ma_du_an)
        )
    ).all():
        db.delete(quyen_du_an)
    db.commit()
    for project_id in ma_du_an:
        background_tasks.add_task(
            hub.publish,
            project_id,
            "project.members_changed",
            workspace_id,
            project_id,
            actor.id,
            {},
        )
    background_tasks.add_task(
        hub.publish_user,
        user_id,
        "notification.created",
        {"kind": "membership_removed", "workspace_id": workspace_id},
    )
