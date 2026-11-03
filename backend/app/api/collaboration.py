import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.tasks import task_access
from app.db import get_db
from app.models import Activity, Comment, Mention, Notification, Subtask, User, WorkspaceMember
from app.realtime import hub
from app.schemas import CommentIn, CommentOut, SubtaskIn, SubtaskOut
from app.security import current_user, validate_assignee

router = APIRouter(tags=["Collaboration"])

@router.get("/tasks/{task_id}/activity", summary="Task activity history")
def task_activity(task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task, project = task_access(db, task_id, user)
    rows = db.scalars(select(Activity).where(Activity.project_id == project.id, Activity.entity == "task", Activity.entity_id == task.id).order_by(Activity.created_at.desc()).limit(100)).all()
    return [{"id": a.id, "action": a.action, "actor_id": a.actor_id, "created_at": a.created_at.isoformat(), "detail": a.detail} for a in rows]

@router.get("/tasks/{task_id}/subtasks", response_model=list[SubtaskOut], summary="Task subtasks")
def subtasks(task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task_access(db, task_id, user)
    return db.scalars(select(Subtask).where(Subtask.task_id == task_id).order_by(Subtask.id)).all()

@router.post("/tasks/{task_id}/subtasks", response_model=SubtaskOut, status_code=201, summary="Create subtask")
def create_subtask(task_id: int, data: SubtaskIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _, project = task_access(db, task_id, user)
    validate_assignee(db, project, data.assignee_id)
    row = Subtask(task_id=task_id, **data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.put("/subtasks/{subtask_id}", response_model=SubtaskOut, summary="Update subtask")
def update_subtask(subtask_id: int, data: SubtaskIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.get(Subtask, subtask_id)
    if not row:
        raise HTTPException(404, "Subtask not found")
    _, project = task_access(db, row.task_id, user)
    validate_assignee(db, project, data.assignee_id)
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    db.commit()
    return row

@router.delete("/subtasks/{subtask_id}", status_code=204, summary="Delete subtask")
def delete_subtask(subtask_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.get(Subtask, subtask_id)
    if not row:
        raise HTTPException(404, "Subtask not found")
    task_access(db, row.task_id, user)
    db.delete(row)
    db.commit()

@router.get("/tasks/{task_id}/comments", response_model=list[CommentOut], summary="Task comments")
def comments(task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task_access(db, task_id, user)
    return db.scalars(select(Comment).where(Comment.task_id == task_id).order_by(Comment.created_at)).all()

@router.post("/tasks/{task_id}/comments", response_model=CommentOut, status_code=201, summary="Comment and notify mentions")
async def create_comment(task_id: int, data: CommentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _, project = task_access(db, task_id, user)
    comment = Comment(task_id=task_id, author_id=user.id, content=data.content.strip())
    db.add(comment)
    db.flush()
    handles = set(re.findall(r"(?<!\w)@([A-Za-z][A-Za-z0-9_]{2,39})(?![A-Za-z0-9_@.+-])", data.content))
    emails = set(re.findall(r"@([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})", data.content))
    mentioned_ids = []
    for identifier in {*(handle.lower() for handle in handles), *(email.lower() for email in emails)}:
        target = db.scalar(select(User).join(WorkspaceMember, WorkspaceMember.user_id == User.id).where((User.username == identifier) | (User.email == identifier), WorkspaceMember.workspace_id == project.workspace_id, WorkspaceMember.status == "ACTIVE"))
        if target:
            try:
                from app.security import project_access
                project_access(db, project.id, target)
            except HTTPException:
                continue
            if target.id not in mentioned_ids:
                db.add(Mention(comment_id=comment.id, user_id=target.id))
                db.add(Notification(user_id=target.id, workspace_id=project.workspace_id, kind="mention", message=f"{user.name} mentioned you", entity_id=task_id))
                mentioned_ids.append(target.id)
    db.add(Activity(project_id=project.id, actor_id=user.id, action="comment.created", entity="comment", entity_id=comment.id))
    db.commit()
    db.refresh(comment)
    await hub.publish(project.id, "comment.created", project.workspace_id, comment.id, user.id, CommentOut.model_validate(comment).model_dump(mode="json"))
    for mentioned_id in mentioned_ids:
        await hub.publish_user(mentioned_id, "notification.created", {"kind": "mention", "task_id": task_id})
    return comment

@router.get("/notifications", summary="My notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(100)).all()
    return [{"id": n.id, "kind": n.kind, "message": n.message, "entity_id": n.entity_id, "read": n.read_at is not None, "created_at": n.created_at.isoformat()} for n in rows]

@router.get("/notifications/unread-count", summary="Unread notification count")
def unread_count(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from sqlalchemy import func
    return {"count": db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)))}

@router.post("/notifications/{notification_id}/read", status_code=204, summary="Mark notification read")
def mark_read(notification_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    from app.models import utcnow
    n = db.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.read_at = utcnow()
    db.commit()

@router.post("/notifications/read-all", status_code=204, summary="Mark all notifications read")
def read_all(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from sqlalchemy import update
    from app.models import utcnow
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)).values(read_at=utcnow()))
    db.commit()
