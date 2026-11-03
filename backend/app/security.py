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
from app.models import Project, ProjectMember, RefreshToken, User, WorkspaceMember, utcnow

hasher = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    return hasher.hash(password)

def verify_password(password: str, digest: str) -> bool:
    return hasher.verify(password, digest)

def token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()

def access_token(user_id: int, token_version: int = 0) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": str(user_id), "type": "access", "ver": token_version, "iat": now, "exp": now + timedelta(minutes=15)}, settings.jwt_secret, algorithm="HS256")

def user_from_token(raw: str, db: Session) -> User:
    try:
        data = jwt.decode(raw, settings.jwt_secret, algorithms=["HS256"], options={"require": ["exp", "sub", "type"]})
        if data["type"] != "access":
            raise ValueError()
        user_id = int(data["sub"])
    except (InvalidTokenError, ValueError, KeyError, TypeError):
        raise HTTPException(401, "Invalid or expired token")
    user = db.get(User, user_id)
    if not user or not user.active:
        raise HTTPException(401, "Account inactive or missing")
    if data.get("ver") != user.token_version:
        raise HTTPException(401, "Session revoked; sign in again")
    return user

def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(401, "Authentication required")
    return user_from_token(credentials.credentials, db)

def issue_refresh(db: Session, user_id: int) -> str:
    raw = secrets.token_urlsafe(48)
    db.add(RefreshToken(user_id=user_id, token_hash=token_hash(raw), expires_at=utcnow() + timedelta(days=14)))
    return raw

def rotate_refresh(db: Session, raw: str | None) -> tuple[User, str]:
    if not raw:
        raise HTTPException(401, "Refresh token missing")
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash(raw)))
    if not row or row.revoked_at or row.expires_at < utcnow():
        raise HTTPException(401, "Refresh token invalid")
    user = db.scalar(select(User).where(User.id == row.user_id).with_for_update().execution_options(populate_existing=True))
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash(raw)).with_for_update().execution_options(populate_existing=True))
    if row.revoked_at or row.expires_at < utcnow():
        raise HTTPException(401, "Refresh token invalid")
    if not user or not user.active:
        raise HTTPException(401, "Account inactive")
    row.revoked_at = utcnow()
    return user, issue_refresh(db, user.id)

def require_origin(request: Request):
    origin = request.headers.get("origin")
    if origin != settings.frontend_origin:
        raise HTTPException(403, "Invalid origin")

def workspace_access(db: Session, workspace_id: int, user: User, roles: set[str] | None = None) -> WorkspaceMember:
    member = db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user.id, WorkspaceMember.status == "ACTIVE"))
    if not member:
        raise HTTPException(404, "Workspace not found")
    if roles and member.role not in roles:
        raise HTTPException(403, "Insufficient workspace role")
    return member

def project_access(db: Session, project_id: int, user: User, manage: bool = False) -> Project:
    project = db.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    membership = workspace_access(db, project.workspace_id, user)
    if membership.role not in {"OWNER", "ADMIN"}:
        assigned = db.scalar(select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id))
        if not assigned:
            raise HTTPException(404, "Project not found")
        if manage:
            raise HTTPException(403, "Manager role required")
    return project

def validate_assignee(db: Session, project: Project, assignee_id: int | None):
    if assignee_id is None:
        return
    member = db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == project.workspace_id, WorkspaceMember.user_id == assignee_id, WorkspaceMember.status == "ACTIVE"))
    assigned = db.scalar(select(ProjectMember).where(ProjectMember.project_id == project.id, ProjectMember.user_id == assignee_id))
    if not member or (member.role not in {"OWNER", "ADMIN"} and not assigned):
        raise HTTPException(422, "Assignee must belong to project")

