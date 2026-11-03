from datetime import timedelta
import secrets
from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import WorkspaceInvitation, utcnow, Activity, Notification, Project, ProjectMember, Subtask, Task, User, Workspace, WorkspaceMember
from app.schemas import InviteIn, MemberOut, RoleIn, WorkspaceIn, WorkspaceOut
from app.realtime import hub
from app.security import current_user, workspace_access

router = APIRouter(prefix="/workspaces", tags=["Workspaces"])

@router.get("", response_model=list[WorkspaceOut], summary="My workspaces")
def list_workspaces(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Workspace).join(WorkspaceMember).where(WorkspaceMember.user_id == user.id, WorkspaceMember.status == "ACTIVE").order_by(Workspace.created_at.desc())).all()

@router.post("", response_model=WorkspaceOut, status_code=201, summary="Create workspace")
def create_workspace(data: WorkspaceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ws = Workspace(name=data.name.strip(), description=data.description, owner_id=user.id)
    db.add(ws)
    db.flush()
    db.add(WorkspaceMember(workspace_id=ws.id, user_id=user.id, role="OWNER"))
    db.commit()
    db.refresh(ws)
    return ws

@router.get("/{workspace_id}", response_model=WorkspaceOut, summary="Workspace detail")
def get_workspace(workspace_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace_access(db, workspace_id, user)
    return db.get(Workspace, workspace_id)

@router.put("/{workspace_id}", response_model=WorkspaceOut, summary="Update workspace")
def update_workspace(workspace_id: int, data: WorkspaceIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace_access(db, workspace_id, user, {"OWNER", "ADMIN"})
    ws = db.get(Workspace, workspace_id)
    ws.name, ws.description = data.name.strip(), data.description
    db.commit()
    return ws

@router.delete("/{workspace_id}", status_code=204, summary="Delete workspace")
def delete_workspace(workspace_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace_access(db, workspace_id, user, {"OWNER"})
    db.delete(db.get(Workspace, workspace_id))
    db.commit()

@router.get("/{workspace_id}/members", response_model=list[MemberOut], summary="Workspace members")
def members(workspace_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace_access(db, workspace_id, user)
    rows = db.execute(select(WorkspaceMember, User).join(User, User.id == WorkspaceMember.user_id).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.status == "ACTIVE")).all()
    return [MemberOut(user_id=u.id, name=u.name, email=u.email, username=u.username, role=m.role, capacity_hours=m.capacity_hours) for m, u in rows]

@router.post("/{workspace_id}/members", status_code=201, summary="Send a pending workspace invitation")
async def invite(workspace_id: int, data: InviteIn, actor: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace_access(db, workspace_id, actor, {"OWNER", "ADMIN"})
    user = db.scalar(select(User).where(User.email == data.email.lower(), User.active.is_(True)))
    if not user:
        raise HTTPException(404, "Account not found; ask the person to register first")
    member = db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id, WorkspaceMember.status == "ACTIVE"))
    if member:
        raise HTTPException(409, "Already a member")
    row = db.scalar(select(WorkspaceInvitation).where(WorkspaceInvitation.workspace_id == workspace_id, WorkspaceInvitation.user_id == user.id).with_for_update())
    if row and row.status == "PENDING" and row.expires_at > utcnow():
        raise HTTPException(409, "Invitation already pending")
    now = utcnow()
    if row:
        row.status, row.role, row.invited_by = "PENDING", data.role, actor.id
        row.nonce = secrets.token_hex(16)
        row.expires_at, row.created_at, row.responded_at = now + timedelta(days=7), now, None
    else:
        row = WorkspaceInvitation(workspace_id=workspace_id, user_id=user.id, invited_by=actor.id, role=data.role, expires_at=now + timedelta(days=7))
        db.add(row)
    db.add(Notification(user_id=user.id, workspace_id=workspace_id, kind="invitation", message="Workspace invitation awaiting your response", entity_id=workspace_id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Invitation already pending")
    await hub.publish_user(user.id, "notification.created", {"kind": "invitation", "workspace_id": workspace_id})
    return {"id": row.id, "user_id": user.id, "status": row.status, "expires_at": row.expires_at}

@router.patch("/{workspace_id}/members/{user_id}", response_model=MemberOut, summary="Change member role")
async def change_role(workspace_id: int, user_id: int, data: RoleIn, actor: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace_access(db, workspace_id, actor, {"OWNER"})
    member = db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id, WorkspaceMember.status == "ACTIVE"))
    if not member or member.role == "OWNER":
        raise HTTPException(404, "Member not found")
    member.role = data.role
    db.add(Notification(user_id=user_id, workspace_id=workspace_id, kind="role_changed", message=f"Your role is now {data.role}", entity_id=workspace_id))
    db.add(Activity(workspace_scope_id=workspace_id, actor_id=actor.id, action="member.role_changed", entity="user", entity_id=user_id))
    db.commit()
    await hub.publish_user(user_id, "notification.created", {"kind": "role_changed", "workspace_id": workspace_id})
    user = db.get(User, user_id)
    return MemberOut(user_id=user.id, name=user.name, email=user.email, username=user.username, role=member.role, capacity_hours=member.capacity_hours)

@router.delete("/{workspace_id}/members/{user_id}", status_code=204, summary="Remove member")
def remove_member(workspace_id: int, user_id: int, actor: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace_access(db, workspace_id, actor, {"OWNER", "ADMIN"})
    member = db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id, WorkspaceMember.status == "ACTIVE"))
    if not member or member.role == "OWNER" or (member.role == "ADMIN" and actor.id != db.get(Workspace, workspace_id).owner_id):
        raise HTTPException(403, "Cannot remove this member")
    member.status = "REMOVED"
    project_ids = db.scalars(select(Project.id).where(Project.workspace_id == workspace_id)).all()
    if project_ids:
        from sqlalchemy import update
        task_ids = db.scalars(select(Task.id).where(Task.project_id.in_(project_ids))).all()
        db.execute(update(Task).where(Task.project_id.in_(project_ids), Task.assignee_id == user_id).values(assignee_id=None))
        if task_ids:
            db.execute(update(Subtask).where(Subtask.task_id.in_(task_ids), Subtask.assignee_id == user_id).values(assignee_id=None))
    for pm in db.scalars(select(ProjectMember).where(ProjectMember.user_id == user_id, ProjectMember.project_id.in_(project_ids))).all():
        db.delete(pm)
    db.commit()
