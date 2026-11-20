import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from jwt import InvalidTokenError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.core import settings
from app.db import get_db
from app.models import (
    Project,
    ProjectMember,
    RefreshToken,
    User,
    WorkspaceMember,
    utcnow,
)

hasher = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return hasher.hash(password)


def verify_password(password: str, digest: str) -> bool:
    return hasher.verify(password, digest)


def token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def access_token(user_id: int, token_version: int = 0) -> str:
    thoi_diem_hien_tai = datetime.now(timezone.utc)
    noi_dung_token = {
        "sub": str(user_id),
        "type": "access",
        "ver": token_version,
        "iat": thoi_diem_hien_tai,
        "exp": thoi_diem_hien_tai + timedelta(minutes=15),
    }
    return jwt.encode(noi_dung_token, settings.jwt_secret, algorithm="HS256")


def user_from_token(raw: str, db: Session) -> User:
    try:
        noi_dung_token = jwt.decode(
            raw,
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub", "type"]},
        )
        if noi_dung_token["type"] != "access":
            raise ValueError()
        ma_nguoi_dung = int(noi_dung_token["sub"])
    except (InvalidTokenError, ValueError, KeyError, TypeError):
        raise HTTPException(401, "Invalid or expired token")
    nguoi_dung = db.get(User, ma_nguoi_dung)
    if not nguoi_dung or not nguoi_dung.active:
        raise HTTPException(401, "Account inactive or missing")
    if noi_dung_token.get("ver") != nguoi_dung.token_version:
        raise HTTPException(401, "Session revoked; sign in again")
    return nguoi_dung


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(401, "Authentication required")
    nguoi_dung = user_from_token(credentials.credentials, db)
    # Trả kết nối DB ngay sau xác thực để các yêu cầu khác không phải chờ.
    # expunge giữ thông tin user khi rollback kết thúc giao dịch đọc.
    db.expunge(nguoi_dung)
    db.rollback()
    return nguoi_dung


def issue_refresh(db: Session, user_id: int) -> str:
    raw = secrets.token_urlsafe(48)
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=token_hash(raw),
            expires_at=utcnow() + timedelta(days=14),
        )
    )
    return raw


def rotate_refresh(db: Session, raw: str | None) -> tuple[User, str]:
    if not raw:
        raise HTTPException(401, "Refresh token missing")
    phien_lam_moi = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash(raw))
    )
    if (
        not phien_lam_moi
        or phien_lam_moi.revoked_at
        or phien_lam_moi.expires_at < utcnow()
    ):
        raise HTTPException(401, "Refresh token invalid")
    nguoi_dung = db.scalar(
        select(User)
        .where(User.id == phien_lam_moi.user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    # Đọc lại sau khi khóa: một request khác có thể vừa dùng cookie này.
    phien_lam_moi = db.scalar(
        select(RefreshToken)
        .where(RefreshToken.token_hash == token_hash(raw))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if phien_lam_moi.revoked_at or phien_lam_moi.expires_at < utcnow():
        raise HTTPException(401, "Refresh token invalid")
    if not nguoi_dung or not nguoi_dung.active:
        raise HTTPException(401, "Account inactive")
    phien_lam_moi.revoked_at = utcnow()
    return nguoi_dung, issue_refresh(db, nguoi_dung.id)


def require_origin(request: Request):
    dia_chi_nguon = request.headers.get("origin")
    if dia_chi_nguon != settings.frontend_origin:
        raise HTTPException(403, "Invalid origin")


def workspace_access(
    db: Session, workspace_id: int, user: User, roles: set[str] | None = None
) -> WorkspaceMember:
    thanh_vien = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user.id,
            WorkspaceMember.status == "ACTIVE",
        )
    )
    if not thanh_vien:
        raise HTTPException(404, "Workspace not found")
    if roles and thanh_vien.role not in roles:
        raise HTTPException(403, "Insufficient workspace role")
    return thanh_vien


def project_access(
    db: Session, project_id: int, user: User, manage: bool = False
) -> Project:
    # OWNER/ADMIN quản lý mọi dự án; MEMBER cần quyền tham gia từng dự án.
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    thanh_vien = workspace_access(db, project.workspace_id, user)
    if thanh_vien.role not in {"OWNER", "ADMIN"}:
        quyen_du_an = db.scalar(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id, ProjectMember.user_id == user.id
            )
        )
        if not quyen_du_an:
            raise HTTPException(404, "Project not found")
        if manage:
            raise HTTPException(403, "Manager role required")
    return project


def validate_assignee(db: Session, project: Project, assignee_id: int | None):
    # Bỏ trống người nhận là hợp lệ. Có chọn thì phải thuộc đúng phạm vi.
    if assignee_id is None:
        return
    thanh_vien = db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == project.workspace_id,
            WorkspaceMember.user_id == assignee_id,
            WorkspaceMember.status == "ACTIVE",
        )
    )
    quyen_du_an = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project.id, ProjectMember.user_id == assignee_id
        )
    )
    if not thanh_vien or (
        thanh_vien.role not in {"OWNER", "ADMIN"} and not quyen_du_an
    ):
        raise HTTPException(422, "Assignee must belong to project")
