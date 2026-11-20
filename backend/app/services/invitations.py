from datetime import timedelta
import jwt
from fastapi import HTTPException
from sqlalchemy import select
from app.core import settings
from app.models import WorkspaceInvitation, WorkspaceMember, utcnow


def invitation_token(row):
    # MySQL có thể làm tròn giây lưu DB; iat phải dùng lúc phát token thực tế.
    return jwt.encode(
        {
            "type": "invitation",
            "sub": str(row.user_id),
            "inv": row.id,
            "nonce": row.nonce,
            "iat": utcnow(),
            "exp": row.expires_at,
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


def respond(db, user, raw, accept):
    try:
        noi_dung_token = jwt.decode(
            raw,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "inv", "iat"]},
        )
        if noi_dung_token.get("type") != "invitation" or noi_dung_token["sub"] != str(
            user.id
        ):
            raise ValueError()
    except (jwt.InvalidTokenError, ValueError, KeyError):
        raise HTTPException(400, "Invalid invitation token")
    loi_moi = db.scalar(
        select(WorkspaceInvitation)
        .where(
            WorkspaceInvitation.id == noi_dung_token["inv"],
            WorkspaceInvitation.user_id == user.id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if (
        not loi_moi
        or loi_moi.status != "PENDING"
        or loi_moi.expires_at <= utcnow()
        or loi_moi.nonce != noi_dung_token.get("nonce")
    ):
        raise HTTPException(409, "Invitation expired or already answered")
    # Lời mời hết quyền sử dụng nếu người gửi không còn quản lý nhóm.
    nguoi_moi = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == loi_moi.workspace_id,
            WorkspaceMember.user_id == loi_moi.invited_by,
            WorkspaceMember.status == "ACTIVE",
            WorkspaceMember.role.in_(["OWNER", "ADMIN"]),
        )
    )
    if not nguoi_moi:
        raise HTTPException(409, "Invitation issuer no longer has permission")
    loi_moi.status = "ACCEPTED" if accept else "DECLINED"
    loi_moi.responded_at = utcnow()
    if accept:
        thanh_vien = db.scalar(
            select(WorkspaceMember)
            .where(
                WorkspaceMember.workspace_id == loi_moi.workspace_id,
                WorkspaceMember.user_id == user.id,
            )
            .with_for_update()
        )
        if thanh_vien and thanh_vien.status == "ACTIVE":
            raise HTTPException(409, "Already a member")
        if thanh_vien:
            thanh_vien.status, thanh_vien.role, thanh_vien.joined_at = (
                "ACTIVE",
                loi_moi.role,
                utcnow(),
            )
        else:
            db.add(
                WorkspaceMember(
                    workspace_id=loi_moi.workspace_id,
                    user_id=user.id,
                    role=loi_moi.role,
                )
            )
    db.commit()
    return {"status": loi_moi.status, "workspace_id": loi_moi.workspace_id}
