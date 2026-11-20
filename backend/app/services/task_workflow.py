from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, select, or_
from sqlalchemy.orm import Session
from app.services.idempotency import reserve_task_creation
from app.db import get_db
from app.models import (
    Activity,
    KanbanColumn,
    Notification,
    Project,
    Task,
    TaskRequirement,
    Subtask,
    User,
)
from app.schemas import ProjectOut, TaskIn, TaskMove, TaskOut, TaskPatch
from app.security import current_user, project_access, validate_assignee
from app.services.task_transactions import (
    lock_columns,
    lock_task,
    siblings,
    reorder,
    snapshot,
)


def task_access(db: Session, task_id: int, user: User) -> tuple[Task, Project]:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task, project_access(db, task.project_id, user)


def event_activity(
    db: Session,
    project: Project,
    actor: User,
    action: str,
    task_id: int,
    detail: dict | None = None,
):
    db.add(
        Activity(
            project_id=project.id,
            actor_id=actor.id,
            action=action,
            entity="task",
            entity_id=task_id,
            detail=detail or {},
        )
    )


def event_result(db: Session, task: Task, project: Project):
    # Chép dữ liệu trả về trước khi trả kết nối DB về pool.
    # WebSocket sẽ kiểm tra quyền bằng một phiên DB riêng sau bước này.
    ket_qua = TaskOut.model_validate(task), ProjectOut.model_validate(project)
    db.rollback()
    return ket_qua


def reload_after_lock(db: Session, task_id: int) -> Task:
    task = db.scalar(
        select(Task).where(Task.id == task_id).execution_options(populate_existing=True)
    )
    if not task:
        raise HTTPException(404, "Task no longer exists")
    return task


def list_tasks(
    project_id: int,
    assignee_id: int | None = None,
    column_id: int | None = None,
    status: str | None = None,
    priority: Literal["LOW", "MEDIUM", "HIGH", "URGENT"] | None = None,
    q: str | None = None,
    due_before: date | None = None,
    sort: Literal["position", "due_date", "created_at", "priority"] = "position",
    direction: Literal["asc", "desc"] = "asc",
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    include_subtasks: bool = False,
):
    project_access(db, project_id, user)
    truy_van = select(Task).where(Task.project_id == project_id)
    if assignee_id is not None:
        dieu_kien_nguoi_nhan = Task.assignee_id == assignee_id
        if include_subtasks:
            co_viec_con = (
                select(Subtask.id)
                .where(Subtask.task_id == Task.id, Subtask.assignee_id == assignee_id)
                .exists()
            )
            dieu_kien_nguoi_nhan = or_(dieu_kien_nguoi_nhan, co_viec_con)
        truy_van = truy_van.where(dieu_kien_nguoi_nhan)
    if column_id is not None:
        truy_van = truy_van.where(Task.column_id == column_id)
    if status:
        truy_van = truy_van.join(KanbanColumn, KanbanColumn.id == Task.column_id).where(
            KanbanColumn.name == status
        )
    if priority:
        truy_van = truy_van.where(Task.priority == priority)
    if q:
        truy_van = truy_van.where(Task.title.ilike(f"%{q[:100]}%"))
    if due_before:
        truy_van = truy_van.where(Task.due_date <= due_before)
    tong_so = db.scalar(select(func.count()).select_from(truy_van.subquery()))
    thu_tu_uu_tien = case(
        {"LOW": 0, "MEDIUM": 1, "HIGH": 2, "URGENT": 3}, value=Task.priority, else_=4
    )
    cot_sap_xep = {
        "position": Task.position,
        "due_date": Task.due_date,
        "created_at": Task.created_at,
        "priority": thu_tu_uu_tien,
    }[sort]
    chieu_sap_xep = cot_sap_xep.desc() if direction == "desc" else cot_sap_xep.asc()
    cac_task = db.scalars(
        truy_van.order_by(chieu_sap_xep, Task.id).offset((page - 1) * size).limit(size)
    ).all()
    return {
        "items": [
            TaskOut.model_validate(task_trong_cot).model_dump(mode="json")
            for task_trong_cot in cac_task
        ],
        "total": tong_so,
        "page": page,
        "size": size,
    }


def create_task(
    project_id: int,
    data: TaskIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    idempotency_key: str | None = None,
):
    du_an = project_access(db, project_id, user)
    yeu_cau, da_tao = reserve_task_creation(
        db, user.id, project_id, idempotency_key, data
    )
    # Kiểm tra lại quyền sau khi chờ request trước/rollback do trùng key.
    du_an = project_access(db, project_id, user)
    if da_tao:
        task = TaskOut.model_validate(yeu_cau.response)
        ket_qua = task, ProjectOut.model_validate(du_an), True
        db.rollback()
        return ket_qua
    validate_assignee(db, du_an, data.assignee_id)
    if data.column_id:
        cot = db.get(KanbanColumn, data.column_id)
    else:
        cot = db.scalar(
            select(KanbanColumn)
            .where(KanbanColumn.project_id == project_id)
            .order_by(KanbanColumn.position)
        )
    if not cot or cot.project_id != project_id:
        raise HTTPException(422, "Invalid column")
    lock_columns(db, [cot.id])
    vi_tri = len(siblings(db, cot.id))
    task = Task(
        column_id=cot.id,
        reporter_id=user.id,
        position=vi_tri,
        **data.model_dump(exclude={"column_id"}),
    )
    db.add(task)
    db.flush()
    snapshot(db, task, user.id)
    event_activity(db, du_an, user, "task.created", task.id)
    if task.assignee_id:
        event_activity(
            db, du_an, user, "task.assigned", task.id, {"assignee_id": task.assignee_id}
        )
    if task.assignee_id and task.assignee_id != user.id:
        db.add(
            Notification(
                user_id=task.assignee_id,
                workspace_id=du_an.workspace_id,
                kind="task_assigned",
                message=f"Assigned: {task.title}",
                entity_id=task.id,
            )
        )
    # Lấy giá trị MySQL đã chuẩn hóa (DATETIME, NUMERIC) trước khi lưu kết quả.
    db.flush()
    db.refresh(task)
    task_out = TaskOut.model_validate(task)
    if yeu_cau is not None:
        yeu_cau.response = task_out.model_dump(mode="json")
    db.commit()
    project_out = ProjectOut.model_validate(du_an)
    db.rollback()
    return task_out, project_out, False


def get_task(
    task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    return task_access(db, task_id, user)[0]


def required_skills(
    task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    task_access(db, task_id, user)
    return db.scalars(
        select(TaskRequirement.name)
        .where(TaskRequirement.task_id == task_id)
        .order_by(TaskRequirement.name)
    ).all()


def update_task(
    task_id: int,
    data: TaskPatch,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    task, du_an = task_access(db, task_id, user)
    task = lock_task(db, task_id)
    if task.version != data.version:
        raise HTTPException(409, "Task changed; reload before saving")
    cac_thay_doi = data.model_dump(exclude_unset=True, exclude={"version"})
    ngay_bat_dau = cac_thay_doi.get("start_date", task.start_date)
    ngay_het_han = cac_thay_doi.get("due_date", task.due_date)
    if ngay_bat_dau and ngay_het_han and ngay_het_han < ngay_bat_dau:
        raise HTTPException(422, "Due date must not precede start date")
    gio_uoc_luong_cu = float(task.estimated_hours)
    nguoi_nhan_cu = task.assignee_id
    if "assignee_id" in cac_thay_doi:
        validate_assignee(db, du_an, cac_thay_doi["assignee_id"])
    for ten_truong, gia_tri in cac_thay_doi.items():
        setattr(task, ten_truong, gia_tri)
    if (
        "estimated_hours" in cac_thay_doi
        and float(cac_thay_doi["estimated_hours"]) != gio_uoc_luong_cu
    ):
        task.estimate_source = "HUMAN"
    task.version += 1
    if (
        "estimated_hours" in cac_thay_doi
        and float(cac_thay_doi["estimated_hours"]) != gio_uoc_luong_cu
    ):
        snapshot(db, task, user.id)
    event_activity(db, du_an, user, "task.updated", task.id)
    da_doi_nguoi_nhan = (
        "assignee_id" in cac_thay_doi and task.assignee_id != nguoi_nhan_cu
    )
    if da_doi_nguoi_nhan:
        event_activity(
            db,
            du_an,
            user,
            "task.assigned",
            task.id,
            {"previous_assignee_id": nguoi_nhan_cu, "assignee_id": task.assignee_id},
        )
    if da_doi_nguoi_nhan and task.assignee_id and task.assignee_id != user.id:
        db.add(
            Notification(
                user_id=task.assignee_id,
                workspace_id=du_an.workspace_id,
                kind="task_assigned",
                message=f"Assigned: {task.title}",
                entity_id=task.id,
            )
        )
    db.commit()
    db.refresh(task)
    task_tra_ve, du_an_tra_ve = event_result(db, task, du_an)
    return task_tra_ve, du_an_tra_ve, da_doi_nguoi_nhan, nguoi_nhan_cu


def move_task(
    task_id: int,
    data: TaskMove,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    task, du_an = task_access(db, task_id, user)
    cot_dich = db.get(KanbanColumn, data.column_id)
    if not cot_dich or cot_dich.project_id != du_an.id:
        raise HTTPException(422, "Invalid column")
    ma_cot_cu = task.column_id
    # Khóa cột theo thứ tự cố định rồi mới khóa task để giữ đúng thứ tự giao dịch.
    lock_columns(db, [ma_cot_cu, cot_dich.id])
    task = lock_task(db, task_id)
    if task.version != data.version or task.column_id != ma_cot_cu:
        raise HTTPException(409, "Task changed; reload board")
    cot_cu = db.get(KanbanColumn, ma_cot_cu)
    task_theo_cot = {}
    for column_id in sorted({ma_cot_cu, cot_dich.id}):
        cac_task = sorted(
            siblings(db, column_id, task.id),
            key=lambda task_trong_cot: (task_trong_cot.position, task_trong_cot.id),
        )
        if column_id == cot_dich.id:
            cac_task.insert(min(data.position, len(cac_task)), task)
        task_theo_cot[column_id] = cac_task
    task.column_id = cot_dich.id
    for cac_task in task_theo_cot.values():
        for vi_tri_moi, task_trong_cot in enumerate(cac_task):
            if task_trong_cot.position != vi_tri_moi and task_trong_cot.id != task.id:
                task_trong_cot.version += 1
            task_trong_cot.position = vi_tri_moi
    task.version += 1
    event_activity(db, du_an, user, "task.moved", task.id)
    if cot_dich.is_done and not cot_cu.is_done:
        event_activity(db, du_an, user, "task.completed", task.id)
    db.commit()
    db.refresh(task)
    return event_result(db, task, du_an)


def delete_task(
    task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    task, du_an = task_access(db, task_id, user)
    ma_cot_cu = task.column_id
    lock_columns(db, [ma_cot_cu])
    task = lock_task(db, task_id)
    if task.column_id != ma_cot_cu:
        raise HTTPException(409, "Task moved; reload board")
    assignee_id = task.assignee_id
    db.delete(task)
    db.flush()
    reorder(
        sorted(
            siblings(db, ma_cot_cu),
            key=lambda task_trong_cot: (task_trong_cot.position, task_trong_cot.id),
        )
    )
    event_activity(db, du_an, user, "task.deleted", task_id)
    db.commit()
    ket_qua = ProjectOut.model_validate(du_an)
    db.rollback()
    return ket_qua, assignee_id
