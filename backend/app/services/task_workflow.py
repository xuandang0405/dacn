from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Activity, KanbanColumn, Notification, Project, Task, TaskRequirement, User
from app.schemas import TaskIn, TaskMove, TaskOut, TaskPatch
from app.security import current_user, project_access, validate_assignee
from app.services.task_transactions import lock_columns, lock_task, siblings, reorder, snapshot


def task_access(db: Session, task_id: int, user: User) -> tuple[Task, Project]:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task, project_access(db, task.project_id, user)


def event_activity(db: Session, project: Project, actor: User, action: str, task_id: int, detail: dict | None = None):
    db.add(Activity(project_id=project.id, actor_id=actor.id, action=action, entity="task", entity_id=task_id, detail=detail or {}))


def reload_after_lock(db: Session, task_id: int) -> Task:
    task = db.scalar(select(Task).where(Task.id == task_id).execution_options(populate_existing=True))
    if not task:
        raise HTTPException(404, "Task no longer exists")
    return task


def list_tasks(project_id: int, assignee_id: int | None = None, column_id: int | None = None, status: str | None = None, priority: Literal["LOW", "MEDIUM", "HIGH", "URGENT"] | None = None, q: str | None = None, due_before: date | None = None, sort: Literal["position", "due_date", "created_at", "priority"] = "position", direction: Literal["asc", "desc"] = "asc", page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=100), user: User = Depends(current_user), db: Session = Depends(get_db)):
    project_access(db, project_id, user)
    stmt = select(Task).where(Task.project_id == project_id)
    if assignee_id is not None:
        stmt = stmt.where(Task.assignee_id == assignee_id)
    if column_id is not None:
        stmt = stmt.where(Task.column_id == column_id)
    if status:
        stmt = stmt.join(KanbanColumn, KanbanColumn.id == Task.column_id).where(KanbanColumn.name == status)
    if priority:
        stmt = stmt.where(Task.priority == priority)
    if q:
        stmt = stmt.where(Task.title.ilike(f"%{q[:100]}%"))
    if due_before:
        stmt = stmt.where(Task.due_date <= due_before)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    sort_col = {"position": Task.position, "due_date": Task.due_date, "created_at": Task.created_at, "priority": Task.priority}[sort]
    ordering = sort_col.desc() if direction == "desc" else sort_col.asc()
    rows = db.scalars(stmt.order_by(ordering, Task.id).offset((page - 1) * size).limit(size)).all()
    return {"items": [TaskOut.model_validate(row).model_dump(mode="json") for row in rows], "total": total, "page": page, "size": size}


def create_task(project_id: int, data: TaskIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = project_access(db, project_id, user)
    validate_assignee(db, p, data.assignee_id)
    column = db.get(KanbanColumn, data.column_id) if data.column_id else db.scalar(select(KanbanColumn).where(KanbanColumn.project_id == project_id).order_by(KanbanColumn.position))
    if not column or column.project_id != project_id:
        raise HTTPException(422, "Invalid column")
    lock_columns(db, [column.id])
    position = len(siblings(db, column.id))
    task = Task(column_id=column.id, reporter_id=user.id, position=position, **data.model_dump(exclude={"column_id"}))
    db.add(task)
    db.flush()
    snapshot(db, task, user.id)
    event_activity(db, p, user, "task.created", task.id)
    if task.assignee_id:
        event_activity(db, p, user, "task.assigned", task.id, {"assignee_id": task.assignee_id})
    if task.assignee_id and task.assignee_id != user.id:
        db.add(Notification(user_id=task.assignee_id, workspace_id=p.workspace_id, kind="task_assigned", message=f"Assigned: {task.title}", entity_id=task.id))
    db.commit()
    db.refresh(task)
    return task, p

def get_task(task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return task_access(db, task_id, user)[0]


def required_skills(task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task_access(db, task_id, user)
    return db.scalars(select(TaskRequirement.name).where(TaskRequirement.task_id == task_id).order_by(TaskRequirement.name)).all()


def update_task(task_id: int, data: TaskPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task, p = task_access(db, task_id, user)
    task = lock_task(db, task_id)
    if task.version != data.version:
        raise HTTPException(409, "Task changed; reload before saving")
    changes = data.model_dump(exclude_unset=True, exclude={"version"})
    start = changes.get("start_date", task.start_date)
    due = changes.get("due_date", task.due_date)
    if start and due and due < start:
        raise HTTPException(422, "Due date must not precede start date")
    old_estimate = float(task.estimated_hours)
    old_assignee = task.assignee_id
    if "assignee_id" in changes:
        validate_assignee(db, p, changes["assignee_id"])
    for key, value in changes.items():
        setattr(task, key, value)
    if "estimated_hours" in changes and float(changes["estimated_hours"]) != old_estimate:
        task.estimate_source = "HUMAN"
    task.version += 1
    if "estimated_hours" in changes and float(changes["estimated_hours"]) != old_estimate:
        snapshot(db, task, user.id)
    event_activity(db, p, user, "task.updated", task.id)
    assignment_changed = "assignee_id" in changes and task.assignee_id != old_assignee
    if assignment_changed:
        event_activity(db, p, user, "task.assigned", task.id, {"previous_assignee_id": old_assignee, "assignee_id": task.assignee_id})
    if assignment_changed and task.assignee_id and task.assignee_id != user.id:
        db.add(Notification(user_id=task.assignee_id, workspace_id=p.workspace_id, kind="task_assigned", message=f"Assigned: {task.title}", entity_id=task.id))
    db.commit()
    db.refresh(task)
    return task, p, assignment_changed

def move_task(task_id: int, data: TaskMove, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task, p = task_access(db, task_id, user)
    col = db.get(KanbanColumn, data.column_id)
    if not col or col.project_id != p.id:
        raise HTTPException(422, "Invalid column")
    source = task.column_id
    lock_columns(db, [source, col.id])
    task = lock_task(db, task_id)
    if task.version != data.version or task.column_id != source:
        raise HTTPException(409, "Task changed; reload board")
    previous = db.get(KanbanColumn, source)
    ordered = {}
    for column_id in sorted({source, col.id}):
        rows = sorted(siblings(db, column_id, task.id), key=lambda row: (row.position, row.id))
        if column_id == col.id:
            rows.insert(min(data.position, len(rows)), task)
        ordered[column_id] = rows
    task.column_id = col.id
    for rows in ordered.values():
        for i, row in enumerate(rows):
            if row.position != i and row.id != task.id:
                row.version += 1
            row.position = i
    task.version += 1
    event_activity(db, p, user, "task.moved", task.id)
    if col.is_done and not previous.is_done:
        event_activity(db, p, user, "task.completed", task.id)
    db.commit()
    db.refresh(task)
    return task, p

def delete_task(task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task, p = task_access(db, task_id, user)
    old_column = task.column_id
    lock_columns(db, [old_column])
    task = lock_task(db, task_id)
    if task.column_id != old_column:
        raise HTTPException(409, "Task moved; reload board")
    db.delete(task)
    db.flush()
    reorder(sorted(siblings(db, old_column), key=lambda row: (row.position, row.id)))
    event_activity(db, p, user, "task.deleted", task_id)
    db.commit()
    return p

