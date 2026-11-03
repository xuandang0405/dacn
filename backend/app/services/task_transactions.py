"""Lock only affected rows. Column locks serialize order changes, not content edits."""
from fastapi import HTTPException
from sqlalchemy import select
from app.models import KanbanColumn, Task, TaskEstimateVersion


def lock_columns(db, column_ids):
    # One PK lookup at a time makes lock acquisition order explicit on InnoDB.
    for column_id in sorted(set(column_ids)):
        if db.scalar(select(KanbanColumn.id).where(KanbanColumn.id == column_id).with_for_update()) is None:
            raise HTTPException(409, "Column changed; reload board")


def lock_task(db, task_id):
    task = db.scalar(select(Task).where(Task.id == task_id).with_for_update().execution_options(populate_existing=True))
    if not task:
        raise HTTPException(404, "Task no longer exists")
    return task


def siblings(db, column_id, exclude_id=None):
    query = select(Task).where(Task.column_id == column_id)
    if exclude_id is not None:
        query = query.where(Task.id != exclude_id)
    return db.scalars(query.order_by(Task.id).with_for_update().execution_options(populate_existing=True)).all()


def reorder(rows):
    for position, task in enumerate(rows):
        if task.position != position:
            task.position = position
            task.version += 1


def snapshot(db, task, actor_id):
    db.add(TaskEstimateVersion(task_id=task.id, task_version=task.version,
        estimated_hours=task.estimated_hours, source=task.estimate_source, actor_id=actor_id))
