import re
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.tasks import task_access
from app.db import get_db
from app.models import (
    Activity,
    Comment,
    Mention,
    Notification,
    Subtask,
    User,
    WorkspaceMember,
)
from app.realtime import hub
from app.schemas import CommentIn, CommentOut, SubtaskIn, SubtaskOut, SubtaskUpdate
from app.security import current_user, validate_assignee

router = APIRouter(tags=["Collaboration"])


@router.get("/tasks/{task_id}/activity", summary="Task activity history")
def task_activity(
    task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    task, project = task_access(db, task_id, user)
    cac_dong = db.scalars(
        select(Activity)
        .where(
            Activity.project_id == project.id,
            Activity.entity == "task",
            Activity.entity_id == task.id,
        )
        .order_by(Activity.created_at.desc())
        .limit(100)
    ).all()
    ket_qua = []
    for hoat_dong in cac_dong:
        ket_qua.append(
            {
                "id": hoat_dong.id,
                "action": hoat_dong.action,
                "actor_id": hoat_dong.actor_id,
                "created_at": hoat_dong.created_at.isoformat(),
                "detail": hoat_dong.detail,
            }
        )
    return ket_qua


@router.get(
    "/tasks/{task_id}/subtasks",
    response_model=list[SubtaskOut],
    summary="Task subtasks",
)
def subtasks(
    task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    task_access(db, task_id, user)
    return db.scalars(
        select(Subtask).where(Subtask.task_id == task_id).order_by(Subtask.id)
    ).all()


@router.post(
    "/tasks/{task_id}/subtasks",
    response_model=SubtaskOut,
    status_code=201,
    summary="Create subtask",
)
def create_subtask(
    task_id: int,
    data: SubtaskIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    _, project = task_access(db, task_id, user)
    validate_assignee(db, project, data.assignee_id)
    viec_con = Subtask(task_id=task_id, **data.model_dump())
    db.add(viec_con)
    db.commit()
    db.refresh(viec_con)
    ket_qua = SubtaskOut.model_validate(viec_con)
    background_tasks.add_task(
        hub.publish,
        project.id,
        "subtask.created",
        project.workspace_id,
        viec_con.id,
        user.id,
        ket_qua.model_dump(mode="json"),
    )
    db.rollback()
    return ket_qua


@router.put(
    "/subtasks/{subtask_id}", response_model=SubtaskOut, summary="Update subtask"
)
def update_subtask(
    subtask_id: int,
    data: SubtaskUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    viec_con = db.get(Subtask, subtask_id)
    if not viec_con:
        raise HTTPException(404, "Subtask not found")
    _, project = task_access(db, viec_con.task_id, user)
    viec_con = db.scalar(
        select(Subtask)
        .where(Subtask.id == subtask_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if viec_con is None:
        raise HTTPException(404, "Subtask not found")
    if viec_con.version != data.version:
        raise HTTPException(409, "Subtask changed; reload before saving")
    validate_assignee(db, project, data.assignee_id)
    for ten_truong, gia_tri in data.model_dump(exclude={"version"}).items():
        setattr(viec_con, ten_truong, gia_tri)
    viec_con.version += 1
    db.commit()
    ket_qua = SubtaskOut.model_validate(viec_con)
    background_tasks.add_task(
        hub.publish,
        project.id,
        "subtask.updated",
        project.workspace_id,
        viec_con.id,
        user.id,
        ket_qua.model_dump(mode="json"),
    )
    db.rollback()
    return ket_qua


@router.delete("/subtasks/{subtask_id}", status_code=204, summary="Delete subtask")
def delete_subtask(
    subtask_id: int,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    viec_con = db.get(Subtask, subtask_id)
    if not viec_con:
        raise HTTPException(404, "Subtask not found")
    _, project = task_access(db, viec_con.task_id, user)
    task_id = viec_con.task_id
    db.delete(viec_con)
    db.commit()
    background_tasks.add_task(
        hub.publish,
        project.id,
        "subtask.deleted",
        project.workspace_id,
        subtask_id,
        user.id,
        {"task_id": task_id},
    )
    db.rollback()


@router.get(
    "/tasks/{task_id}/comments",
    response_model=list[CommentOut],
    summary="Task comments",
)
def comments(
    task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    task_access(db, task_id, user)
    return db.scalars(
        select(Comment).where(Comment.task_id == task_id).order_by(Comment.created_at)
    ).all()


@router.post(
    "/tasks/{task_id}/comments",
    response_model=CommentOut,
    status_code=201,
    summary="Comment and notify mentions",
)
def create_comment(
    task_id: int,
    data: CommentIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    _, project = task_access(db, task_id, user)
    comment = Comment(task_id=task_id, author_id=user.id, content=data.content.strip())
    db.add(comment)
    db.flush()
    ten_duoc_nhac = set(
        re.findall(
            r"(?<!\w)@([A-Za-z][A-Za-z0-9_]{2,39})(?![A-Za-z0-9_@.+-])", data.content
        )
    )
    email_duoc_nhac = set(
        re.findall(r"@([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})", data.content)
    )
    ma_nguoi_duoc_nhac = []
    # Một người có thể được nhắc bằng username hoặc email; chỉ gửi một thông báo.
    cac_dinh_danh = set()
    for ten_tai_khoan in ten_duoc_nhac:
        cac_dinh_danh.add(ten_tai_khoan.lower())
    for email in email_duoc_nhac:
        cac_dinh_danh.add(email.lower())
    for dinh_danh in cac_dinh_danh:
        nguoi_duoc_nhac = db.scalar(
            select(User)
            .join(WorkspaceMember, WorkspaceMember.user_id == User.id)
            .where(
                (User.username == dinh_danh) | (User.email == dinh_danh),
                WorkspaceMember.workspace_id == project.workspace_id,
                WorkspaceMember.status == "ACTIVE",
            )
        )
        if nguoi_duoc_nhac:
            try:
                from app.security import project_access

                project_access(db, project.id, nguoi_duoc_nhac)
            except HTTPException:
                continue
            if nguoi_duoc_nhac.id not in ma_nguoi_duoc_nhac:
                db.add(Mention(comment_id=comment.id, user_id=nguoi_duoc_nhac.id))
                db.add(
                    Notification(
                        user_id=nguoi_duoc_nhac.id,
                        workspace_id=project.workspace_id,
                        kind="mention",
                        message=f"{user.name} mentioned you",
                        entity_id=task_id,
                    )
                )
                ma_nguoi_duoc_nhac.append(nguoi_duoc_nhac.id)
    db.add(
        Activity(
            project_id=project.id,
            actor_id=user.id,
            action="comment.created",
            entity="comment",
            entity_id=comment.id,
        )
    )
    db.commit()
    db.refresh(comment)
    ket_qua = CommentOut.model_validate(comment)
    background_tasks.add_task(
        hub.publish,
        project.id,
        "comment.created",
        project.workspace_id,
        comment.id,
        user.id,
        ket_qua.model_dump(mode="json"),
    )
    for ma_nguoi in ma_nguoi_duoc_nhac:
        background_tasks.add_task(
            hub.publish_user,
            ma_nguoi,
            "notification.created",
            {"kind": "mention", "task_id": task_id},
        )
    db.rollback()
    return ket_qua


@router.get("/notifications", summary="My notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    cac_dong = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
    ).all()
    ket_qua = []
    for thong_bao in cac_dong:
        ket_qua.append(
            {
                "id": thong_bao.id,
                "kind": thong_bao.kind,
                "message": thong_bao.message,
                "entity_id": thong_bao.entity_id,
                "read": thong_bao.read_at is not None,
                "created_at": thong_bao.created_at.isoformat(),
            }
        )
    return ket_qua


@router.get("/notifications/unread-count", summary="Unread notification count")
def unread_count(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from sqlalchemy import func

    return {
        "count": db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        )
    }


@router.post(
    "/notifications/{notification_id}/read",
    status_code=204,
    summary="Mark notification read",
)
def mark_read(
    notification_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    from app.models import utcnow

    thong_bao = db.get(Notification, notification_id)
    if not thong_bao or thong_bao.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    thong_bao.read_at = utcnow()
    db.commit()


@router.post(
    "/notifications/read-all", status_code=204, summary="Mark all notifications read"
)
def read_all(user: User = Depends(current_user), db: Session = Depends(get_db)):
    from sqlalchemy import update
    from app.models import utcnow

    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    db.commit()
