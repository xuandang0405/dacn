from datetime import date, timedelta

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import KanbanColumn, Project, Subtask, Task, TaskRequirement
from app.services.ai_planning import skill_match, team_data
from app.services.analytics import has_remaining_subtask_hours, parent_task_hours


class Replacement(BaseModel):
    user_id: int
    name: str
    skill_match: int | None
    projected_percentage: float


class AssignmentAdvice(BaseModel):
    version: int
    assignee_name: str
    assigned_hours: float
    capacity_hours: float
    percentage: float | None
    replacement: Replacement | None


def assignment_advice(db: Session, task: Task, project: Project) -> AssignmentAdvice | None:
    today = date.today()
    end = today + timedelta(days=6)
    if task.assignee_id is None or (task.start_date and task.start_date > end):
        return None
    column = db.get(KanbanColumn, task.column_id)
    if column is None or column.is_done:
        return None

    members = team_data(db, project, today)
    assignee = next((member for member in members if member["user_id"] == task.assignee_id), None)
    if assignee is None or assignee["assigned_hours"] <= assignee["capacity_hours"]:
        return None

    subtasks = list(db.scalars(select(Subtask).where(Subtask.task_id == task.id)))
    # Chỉ chuyển phần việc của người nhận task cha. Người nhận riêng ở việc con giữ nguyên.
    hours = parent_task_hours(task, subtasks)
    for subtask in subtasks:
        if subtask.assignee_id is None and has_remaining_subtask_hours(subtask, end):
            hours += float(subtask.estimated_hours)

    required = set(db.scalars(select(TaskRequirement.name).where(TaskRequirement.task_id == task.id)))
    eligible = []
    if hours > 0:
        for member in members:
            if member["user_id"] == task.assignee_id or member["capacity_hours"] <= 0:
                continue
            if any(not member["skills"].get(skill.casefold()) for skill in required):
                continue
            projected_hours = member["assigned_hours"] + hours
            if projected_hours > member["capacity_hours"]:
                continue
            percent = projected_hours / member["capacity_hours"] * 100
            match = skill_match(member, required) if required else None
            eligible.append(Replacement(
                user_id=member["user_id"],
                name=member["name"],
                skill_match=match,
                projected_percentage=round(percent, 1),
            ))

    replacement = min(
        eligible,
        key=lambda member: (-(member.skill_match or 0), member.projected_percentage, member.user_id),
        default=None,
    )
    return AssignmentAdvice(
        version=task.version,
        assignee_name=assignee["name"],
        assigned_hours=assignee["assigned_hours"],
        capacity_hours=assignee["capacity_hours"],
        percentage=assignee["percentage"],
        replacement=replacement,
    )
