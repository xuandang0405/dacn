from datetime import timedelta
import jwt
from fastapi import HTTPException
from sqlalchemy import select
from app.core import settings
from app.models import WorkspaceInvitation, WorkspaceMember, utcnow


def invitation_token(row):
    # MySQL DATETIME(0) can round created_at into the next second. JWT iat
    # records issuance now; it must not inherit the database rounding.
    return jwt.encode({"type": "invitation", "sub": str(row.user_id), "inv": row.id,
        "nonce": row.nonce, "iat": utcnow(), "exp": row.expires_at}, settings.jwt_secret, algorithm="HS256")


def respond(db, user, raw, accept):
    try:
        data = jwt.decode(raw, settings.jwt_secret, algorithms=["HS256"], options={"require": ["exp", "sub", "inv", "iat"]})
        if data.get("type") != "invitation" or data["sub"] != str(user.id):
            raise ValueError()
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(400, "Invalid invitation token")
    row = db.scalar(select(WorkspaceInvitation).where(WorkspaceInvitation.id == data["inv"], WorkspaceInvitation.user_id == user.id).with_for_update().execution_options(populate_existing=True))
    if not row or row.status != "PENDING" or row.expires_at <= utcnow() or row.nonce != data.get("nonce"):
        raise HTTPException(409, "Invitation expired or already answered")
    # An invitation loses authority when its issuer no longer manages the workspace.
    manager = db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == row.workspace_id, WorkspaceMember.user_id == row.invited_by, WorkspaceMember.status == "ACTIVE", WorkspaceMember.role.in_(["OWNER", "ADMIN"])))
    if not manager:
        raise HTTPException(409, "Invitation issuer no longer has permission")
    row.status = "ACCEPTED" if accept else "DECLINED"
    row.responded_at = utcnow()
    if accept:
        member = db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == row.workspace_id, WorkspaceMember.user_id == user.id).with_for_update())
        if member and member.status == "ACTIVE":
            raise HTTPException(409, "Already a member")
        if member:
            member.status, member.role, member.joined_at = "ACTIVE", row.role, utcnow()
        else:
            db.add(WorkspaceMember(workspace_id=row.workspace_id, user_id=user.id, role=row.role))
    db.commit()
    return {"status": row.status, "workspace_id": row.workspace_id}
