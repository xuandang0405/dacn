from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import KanbanColumn, Project, Subtask, Task, WorkspaceMember

def relative_deviation(estimated: float, actual: float) -> float | None:
    return round(abs(actual - estimated) / actual * 100, 2) if actual > 0 else None

def mape(pairs: list[tuple[float, float]]) -> float | None:
    valid = [relative_deviation(e, a) for e, a in pairs if a > 0]
    return round(sum(valid) / len(valid), 2) if valid else None

def workload(db: Session, workspace_id: int, start: date, end: date):
    if end < start or (end - start).days > 365:
        raise ValueError("Invalid date interval")
    weekdays = sum((start + timedelta(days=i)).weekday() < 5 for i in range((end - start).days + 1))
    members = db.scalars(select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.status == "ACTIVE")).all()
    project_ids = db.scalars(select(Project.id).where(Project.workspace_id == workspace_id)).all()
    tasks = db.execute(select(Task, KanbanColumn).join(KanbanColumn, Task.column_id == KanbanColumn.id).where(Task.project_id.in_(project_ids), KanbanColumn.is_done.is_(False))).all() if project_ids else []
    result = {m.user_id: {"user_id": m.user_id, "capacity_hours": round(m.capacity_hours * weekdays / 5, 2), "assigned_hours": 0.0, "task_count": 0} for m in members}
    if not tasks:
        return list(result.values())
    task_ids = [t.id for t, _ in tasks]
    children = db.scalars(select(Subtask).where(Subtask.task_id.in_(task_ids))).all()
    by_parent = {}
    for child in children:
        by_parent.setdefault(child.task_id, []).append(child)
    for task, _ in tasks:
        if task.start_date and task.start_date > end or task.due_date and task.due_date < start:
            continue
        child_rows = by_parent.get(task.id, [])
        child_hours = sum(float(c.estimated_hours) for c in child_rows)
        parent_residual = max(0.0, float(task.estimated_hours) - child_hours)
        if task.assignee_id in result:
            result[task.assignee_id]["assigned_hours"] += parent_residual
            result[task.assignee_id]["task_count"] += 1
        for child in child_rows:
            if child.done:
                continue
            if child.due_date and not (start <= child.due_date <= end):
                continue
            assignee = child.assignee_id or task.assignee_id
            if assignee in result:
                result[assignee]["assigned_hours"] += float(child.estimated_hours)
    for row in result.values():
        cap = row["capacity_hours"]
        row["percentage"] = round(row["assigned_hours"] / cap * 100, 1) if cap > 0 else None
        pct = row["percentage"]
        row["status"] = "NO_CAPACITY" if pct is None else "OVERLOADED" if pct > 100 else "HIGH" if pct >= 90 else "BUSY" if pct >= 70 else "NORMAL"
    return list(result.values())

def project_analytics(db: Session, project_id: int):
    rows = db.execute(select(Task, KanbanColumn).join(KanbanColumn, Task.column_id == KanbanColumn.id).where(Task.project_id == project_id)).all()
    by_status, by_priority = {}, {}
    estimates = []
    estimated_total = 0.0
    actual_total = 0.0
    by_member = {}
    by_source = {"AI": [], "HUMAN": []}
    completed = 0
    overdue = 0
    today = date.today()
    for task, column in rows:
        by_status[column.name] = by_status.get(column.name, 0) + 1
        by_priority[task.priority] = by_priority.get(task.priority, 0) + 1
        completed += int(column.is_done)
        overdue += int(bool(task.due_date and task.due_date < today and not column.is_done))
        pair = (float(task.estimated_hours), float(task.actual_hours))
        estimated_total += pair[0]
        actual_total += pair[1]
        if pair[1] > 0:
            estimates.append(pair)
            by_source[task.estimate_source].append(pair)
            if task.assignee_id:
                by_member.setdefault(task.assignee_id, []).append(pair)
    return {"total_tasks": len(rows), "completed_tasks": completed, "overdue_tasks": overdue, "completion_rate": round(completed / len(rows) * 100, 1) if rows else 0, "by_status": by_status, "by_priority": by_priority, "estimated_hours": round(estimated_total, 2), "actual_hours": round(actual_total, 2), "mape": mape(estimates), "mape_by_member": {str(k): mape(v) for k, v in by_member.items()}, "ai_mape": mape(by_source["AI"]), "human_mape": mape(by_source["HUMAN"])}
