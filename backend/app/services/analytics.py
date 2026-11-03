from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import KanbanColumn, Project, Subtask, Task, TaskEstimateVersion, WorkspaceMember

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
    task_ids = [t.id for t, _ in tasks]
    children = db.scalars(select(Subtask).where(Subtask.task_id.in_(task_ids))).all() if task_ids else []
    by_parent = {}
    assigned_tasks = {user_id: set() for user_id in result}
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
            assigned_tasks[task.assignee_id].add(task.id)
        for child in child_rows:
            if child.done:
                continue
            if child.due_date and not (start <= child.due_date <= end):
                continue
            assignee = child.assignee_id or task.assignee_id
            if assignee in result:
                result[assignee]["assigned_hours"] += float(child.estimated_hours)
                assigned_tasks[assignee].add(task.id)
    for row in result.values():
        row["task_count"] = len(assigned_tasks[row["user_id"]])
        row["assigned_hours"] = round(row["assigned_hours"], 2)
        cap = row["capacity_hours"]
        row["percentage"] = round(row["assigned_hours"] / cap * 100, 1) if cap > 0 else None
        pct = row["percentage"]
        row["status"] = "NO_CAPACITY" if pct is None else "OVERLOADED" if pct > 100 else "HIGH" if pct >= 90 else "BUSY" if pct >= 70 else "NORMAL"
    return list(result.values())

def project_analytics(db: Session, project_id: int):
    rows = db.execute(select(Task, KanbanColumn).join(KanbanColumn, Task.column_id == KanbanColumn.id).where(Task.project_id == project_id)).all()
    task_ids = [task.id for task, _ in rows]
    history = db.scalars(select(TaskEstimateVersion).where(TaskEstimateVersion.task_id.in_(task_ids)).order_by(TaskEstimateVersion.task_version, TaskEstimateVersion.id)).all() if task_ids else []
    baselines = {}
    for version in history:
        baselines.setdefault(version.task_id, version)
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
        baseline = baselines.get(task.id)
        if column.is_done and pair[1] > 0 and baseline is not None:
            comparison = (float(baseline.estimated_hours), pair[1])
            estimates.append(comparison)
            if baseline.source in by_source:
                by_source[baseline.source].append(comparison)
            if task.assignee_id:
                by_member.setdefault(task.assignee_id, []).append(comparison)
    return {"total_tasks": len(rows), "completed_tasks": completed, "overdue_tasks": overdue, "completion_rate": round(completed / len(rows) * 100, 1) if rows else 0, "by_status": by_status, "by_priority": by_priority, "estimated_hours": round(estimated_total, 2), "actual_hours": round(actual_total, 2), "mape": mape(estimates), "mape_by_member": {str(k): mape(v) for k, v in by_member.items()}, "ai_mape": mape(by_source["AI"]), "human_mape": mape(by_source["HUMAN"]), "mape_basis": "first_committed_estimate", "mape_sample_count": len(estimates), "ai_sample_count": len(by_source["AI"]), "human_sample_count": len(by_source["HUMAN"])}
