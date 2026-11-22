from datetime import date
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import (
    Activity,
    KanbanColumn,
    Notification,
    Project,
    Task,
    TaskRequirement,
    User,
)
from app.realtime import hub
from app.schemas import TaskIn, TaskMove, TaskOut, TaskPatch
from app.security import current_user, project_access, validate_assignee
from app.services.task_transactions import (
    lock_columns,
    lock_task,
    siblings,
    reorder,
    snapshot,
)

from starlette.concurrency import run_in_threadpool
from app.services import task_workflow
from app.services.assignment_advice import AssignmentAdvice, assignment_advice
from app.services.task_workflow import task_access, event_activity

router = APIRouter(tags=["Tasks"])


async def refresh_assignees(task_id: int, project_id: int, *user_ids: int | None):
    # Chỉ báo dữ liệu đã đổi; người nhận vẫn phải qua phân quyền khi tải lại task.
    cac_ma_nguoi = set()
    for ma_nguoi in user_ids:
        if ma_nguoi is not None:
            cac_ma_nguoi.add(ma_nguoi)
    for user_id in sorted(cac_ma_nguoi):
        await hub.publish_user(
            user_id, "task.changed", {"task_id": task_id, "project_id": project_id}
        )


@router.get("/projects/{project_id}/tasks", summary="Search and filter project tasks")
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
    return task_workflow.list_tasks(
        project_id,
        assignee_id,
        column_id,
        status,
        priority,
        q,
        due_before,
        sort,
        direction,
        page,
        size,
        user,
        db,
        include_subtasks,
    )


@router.post(
    "/projects/{project_id}/tasks",
    response_model=TaskOut,
    status_code=201,
    summary="Create task",
)
async def create_task(
    project_id: int,
    data: TaskIn,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(
        default=None, min_length=8, max_length=128, pattern=r"^[A-Za-z0-9._:-]+$"
    ),
):
    task, du_an, da_tao = await run_in_threadpool(
        task_workflow.create_task, project_id, data, user, db, idempotency_key
    )
    response.headers["Idempotency-Replayed"] = "true" if da_tao else "false"
    if da_tao:
        return task
    await hub.publish(
        project_id,
        "task.created",
        du_an.workspace_id,
        task.id,
        user.id,
        TaskOut.model_validate(task).model_dump(mode="json"),
    )
    if task.assignee_id and task.assignee_id != user.id:
        await hub.publish_user(
            task.assignee_id,
            "notification.created",
            {"kind": "task_assigned", "task_id": task.id},
        )
    await refresh_assignees(task.id, du_an.id, task.assignee_id)
    return task


@router.get("/tasks/{task_id}", response_model=TaskOut, summary="Task detail")
def get_task(
    task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    return task_workflow.get_task(task_id, user, db)


@router.get(
    "/tasks/{task_id}/required-skills",
    response_model=list[str],
    summary="Skills required by this task",
)
def required_skills(
    task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    return task_workflow.required_skills(task_id, user, db)


@router.get(
    "/tasks/{task_id}/assignment-advice",
    response_model=AssignmentAdvice | None,
    summary="Get overload warning and a qualified replacement for a task",
)
def get_assignment_advice(
    task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    task, project = task_access(db, task_id, user)
    project_access(db, project.id, user, manage=True)
    return assignment_advice(db, task, project)


@router.patch(
    "/tasks/{task_id}", response_model=TaskOut, summary="Update task with version check"
)
async def update_task(
    task_id: int,
    data: TaskPatch,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    task, du_an, da_doi_nguoi_nhan, nguoi_nhan_cu = await run_in_threadpool(
        task_workflow.update_task, task_id, data, user, db
    )
    await hub.publish(
        du_an.id,
        "task.updated",
        du_an.workspace_id,
        task.id,
        user.id,
        TaskOut.model_validate(task).model_dump(mode="json"),
    )
    if da_doi_nguoi_nhan and task.assignee_id and task.assignee_id != user.id:
        await hub.publish_user(
            task.assignee_id,
            "notification.created",
            {"kind": "task_assigned", "task_id": task.id},
        )
    await refresh_assignees(task.id, du_an.id, nguoi_nhan_cu, task.assignee_id)
    return task


@router.post(
    "/tasks/{task_id}/move", response_model=TaskOut, summary="Move task atomically"
)
async def move_task(
    task_id: int,
    data: TaskMove,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    task, du_an = await run_in_threadpool(
        task_workflow.move_task, task_id, data, user, db
    )
    await hub.publish(
        du_an.id,
        "task.moved",
        du_an.workspace_id,
        task.id,
        user.id,
        TaskOut.model_validate(task).model_dump(mode="json"),
    )
    await refresh_assignees(task.id, du_an.id, task.assignee_id)
    return task


@router.delete("/tasks/{task_id}", status_code=204, summary="Delete task")
async def delete_task(
    task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    du_an, assignee_id = await run_in_threadpool(
        task_workflow.delete_task, task_id, user, db
    )
    await hub.publish(
        du_an.id, "task.deleted", du_an.workspace_id, task_id, user.id, {}
    )
    await refresh_assignees(task_id, du_an.id, assignee_id)
