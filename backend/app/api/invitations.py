from fastapi import APIRouter, Depends
from pydantic import Field
from app.schemas import InputModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User, Workspace, WorkspaceInvitation, utcnow
from app.security import current_user
from app.services.invitations import invitation_token, respond

router = APIRouter(prefix="/invitations", tags=["Invitations"])


class InvitationResponse(InputModel):
    token: str = Field(min_length=1, max_length=4096)
    accept: bool = Field(strict=True)


@router.get("", summary="My pending workspace invitations")
def inbox(user: User = Depends(current_user), db: Session = Depends(get_db)):
    danh_sach_loi_moi = db.execute(
        select(WorkspaceInvitation, Workspace.name)
        .join(Workspace)
        .where(
            WorkspaceInvitation.user_id == user.id,
            WorkspaceInvitation.status == "PENDING",
            WorkspaceInvitation.expires_at > utcnow(),
        )
    ).all()
    return [
        {
            "id": loi_moi.id,
            "workspace": ten_nhom,
            "role": loi_moi.role,
            "expires_at": loi_moi.expires_at,
            "token": invitation_token(loi_moi),
        }
        for loi_moi, ten_nhom in danh_sach_loi_moi
    ]


@router.post("/respond", summary="Accept or decline a workspace invitation")
def answer(
    data: InvitationResponse,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    return respond(db, user, data.token, data.accept)
