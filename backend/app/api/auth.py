import secrets
import smtplib
from datetime import timedelta
from email.message import EmailMessage
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core import settings
from app.db import get_db
from app.models import PasswordReset, RefreshToken, User, utcnow
from app.schemas import ForgotIn, LoginIn, PasswordChange, RegisterIn, ResetIn, TokenOut, UserOut
from app.security import access_token, current_user, hash_password, issue_refresh, require_origin, rotate_refresh, token_hash, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])

def set_cookie(response: Response, value: str):
    response.set_cookie("refresh_token", value, httponly=True, secure=settings.frontend_origin.startswith("https://"), samesite="lax", max_age=14 * 86400, path="/api/v1/auth")

@router.post("/register", response_model=UserOut, status_code=201, summary="Register an account")
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == data.email.lower())):
        raise HTTPException(409, "Email already registered")
    username = data.username.lower()
    if db.scalar(select(User).where(User.username == username)):
        raise HTTPException(409, "Username already registered")
    user = User(email=data.email.lower(), username=username, name=data.name.strip(), password_hash=hash_password(data.password))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email or username already registered")
    db.refresh(user)
    return user

@router.post("/login", response_model=TokenOut, summary="Sign in")
def login(data: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if not user or not verify_password(data.password, user.password_hash) or not user.active:
        raise HTTPException(401, "Invalid credentials")
    refresh = issue_refresh(db, user.id)
    db.commit()
    set_cookie(response, refresh)
    return TokenOut(access_token=access_token(user.id, user.token_version))

@router.post("/refresh", response_model=TokenOut, dependencies=[Depends(require_origin)], summary="Rotate refresh token")
def refresh(response: Response, db: Session = Depends(get_db), refresh_token: str | None = Cookie(None)):
    user, new_token = rotate_refresh(db, refresh_token)
    db.commit()
    set_cookie(response, new_token)
    return TokenOut(access_token=access_token(user.id, user.token_version))

@router.post("/logout", status_code=204, dependencies=[Depends(require_origin)], summary="Revoke refresh token")
def logout(response: Response, db: Session = Depends(get_db), refresh_token: str | None = Cookie(None)):
    if refresh_token:
        token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == token_hash(refresh_token)))
        if token:
            token.revoked_at = utcnow()
            db.commit()
    response.delete_cookie("refresh_token", path="/api/v1/auth")

@router.get("/me", response_model=UserOut, summary="Current account")
def me(user: User = Depends(current_user)):
    return user

@router.post("/change-password", status_code=204, summary="Change password and revoke sessions")
def change_password(data: PasswordChange, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True))
    if not verify_password(data.old_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1
    for token in db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))):
        token.revoked_at = utcnow()
    db.commit()

@router.post("/forgot-password", summary="Email a password reset link")
def forgot_password(data: ForgotIn, db: Session = Depends(get_db)):
    if not settings.smtp_host or not settings.smtp_from:
        raise HTTPException(503, "Password reset email is not configured")
    user = db.scalar(select(User).where(User.email == data.email.lower(), User.active.is_(True)))
    if user:
        raw = secrets.token_urlsafe(48)
        db.add(PasswordReset(user_id=user.id, token_hash=token_hash(raw), expires_at=utcnow() + timedelta(minutes=30)))
        db.commit()
        message = EmailMessage()
        message["From"] = settings.smtp_from
        message["To"] = user.email
        message["Subject"] = "Smart Task Manager password reset"
        message.set_content(f"Reset your password: {settings.frontend_origin}/?reset={raw}\nThis link expires in 30 minutes.")
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                smtp.starttls()
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
        except OSError:
            raise HTTPException(503, "Email service unavailable")
    return {"message": "If this account exists, a reset link has been sent"}

@router.post("/reset-password", status_code=204, summary="Set a new password")
def reset_password(data: ResetIn, db: Session = Depends(get_db)):
    row = db.scalar(select(PasswordReset).where(PasswordReset.token_hash == token_hash(data.token)).with_for_update())
    if not row or row.used_at or row.expires_at < utcnow():
        raise HTTPException(400, "Invalid or expired reset link")
    user = db.scalar(select(User).where(User.id == row.user_id).with_for_update().execution_options(populate_existing=True))
    user.password_hash = hash_password(data.new_password)
    user.token_version += 1
    row.used_at = utcnow()
    for token in db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))):
        token.revoked_at = utcnow()
    db.commit()
