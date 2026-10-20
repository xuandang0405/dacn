from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Activity, KanbanColumn, Notification, Project, Task, TaskRequirement, User
from app.realtime import hub
from app.schemas import TaskIn, TaskMove, TaskOut, TaskPatch
from app.security import current_user, project_access, validate_assignee
from app.services.task_transactions import lock_columns, lock_task, siblings, reorder, snapshot

from starlette.concurrency import run_in_threadpool
from app.services import task_workflow
from app.services.task_workflow import task_access, event_activity

router = APIRouter(tags=["Tasks"])

@router.get("/projects/{project_id}/tasks", summary="Search and filter project tasks")
def list_tasks(project_id: int, assignee_id: int | None = None, column_id: int | None = None, status: str | None = None, priority: Literal["LOW", "MEDIUM", "HIGH", "URGENT"] | None = None, q: str | None = None, due_before: date | None = None, sort: Literal["position", "due_date", "created_at", "priority"] = "position", direction: Literal["asc", "desc"] = "asc", page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=100), user: User = Depends(current_user), db: Session = Depends(get_db)):
    return task_workflow.list_tasks(project_id, assignee_id, column_id, status, priority, q, due_before, sort, direction, page, size, user, db)

@router.post("/projects/{project_id}/tasks", response_model=TaskOut, status_code=201, summary="Create task")
async def create_task(project_id: int, data: TaskIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task, p = await run_in_threadpool(task_workflow.create_task, project_id, data, user, db)
    await hub.publish(project_id, "task.created", p.workspace_id, task.id, user.id, TaskOut.model_validate(task).model_dump(mode="json"))
    if task.assignee_id and task.assignee_id != user.id:
        await hub.publish_user(task.assignee_id, "notification.created", {"kind": "task_assigned", "task_id": task.id})
    return task


@router.get("/tasks/{task_id}", response_model=TaskOut, summary="Task detail")
def get_task(task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return task_workflow.get_task(task_id, user, db)

@router.get("/tasks/{task_id}/required-skills", response_model=list[str], summary="Skills required by this task")
def required_skills(task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return task_workflow.required_skills(task_id, user, db)

@router.patch("/tasks/{task_id}", response_model=TaskOut, summary="Update task with version check")
async def update_task(task_id: int, data: TaskPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task, p, assignment_changed = await run_in_threadpool(task_workflow.update_task, task_id, data, user, db)
    await hub.publish(p.id, "task.updated", p.workspace_id, task.id, user.id, TaskOut.model_validate(task).model_dump(mode="json"))
    if assignment_changed and task.assignee_id and task.assignee_id != user.id:
        await hub.publish_user(task.assignee_id, "notification.created", {"kind": "task_assigned", "task_id": task.id})
    return task


@router.post("/tasks/{task_id}/move", response_model=TaskOut, summary="Move task atomically")
async def move_task(task_id: int, data: TaskMove, user: User = Depends(current_user), db: Session = Depends(get_db)):
    task, p = await run_in_threadpool(task_workflow.move_task, task_id, data, user, db)
    await hub.publish(p.id, "task.moved", p.workspace_id, task.id, user.id, TaskOut.model_validate(task).model_dump(mode="json"))
    return task


@router.delete("/tasks/{task_id}", status_code=204, summary="Delete task")
async def delete_task(task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = await run_in_threadpool(task_workflow.delete_task, task_id, user, db)
    await hub.publish(p.id, "task.deleted", p.workspace_id, task_id, user.id, {})


