from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User, Workspace, WorkspaceInvitation, utcnow
from app.security import current_user
from app.services.invitations import invitation_token, respond

router = APIRouter(prefix="/invitations", tags=["Invitations"])


class InvitationResponse(BaseModel):
    token: str
    accept: bool


@router.get("", summary="My pending workspace invitations")
def inbox(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(WorkspaceInvitation, Workspace.name).join(Workspace).where(WorkspaceInvitation.user_id == user.id, WorkspaceInvitation.status == "PENDING", WorkspaceInvitation.expires_at > utcnow())).all()
    return [{"id": row.id, "workspace": name, "role": row.role, "expires_at": row.expires_at,
        "token": invitation_token(row)} for row, name in rows]


@router.post("/respond", summary="Accept or decline a workspace invitation")
def answer(data: InvitationResponse, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return respond(db, user, data.token, data.accept)
