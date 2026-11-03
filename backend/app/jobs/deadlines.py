"""Hourly deadline notification worker. Run exactly one scheduler instance."""
import logging
import sys
import time
from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.models import KanbanColumn, Notification, Project, Task

logger = logging.getLogger(__name__)

def run_once(db: Session) -> int:
    today = date.today()
    upcoming = today + timedelta(days=3)
    rows = db.execute(select(Task, Project).join(Project, Project.id == Task.project_id).join(KanbanColumn, KanbanColumn.id == Task.column_id).where(Task.assignee_id.is_not(None), Task.due_date.is_not(None), Task.due_date <= upcoming, KanbanColumn.is_done.is_(False))).all()
    created = 0
    for task, project in rows:
        kind = "task_overdue" if task.due_date < today else "deadline_soon"
        existing = db.scalar(select(Notification.id).where(Notification.user_id == task.assignee_id, Notification.kind == kind, Notification.entity_id == task.id))
        if existing:
            continue
        message = f"Task overdue: {task.title}" if kind == "task_overdue" else f"Deadline approaching: {task.title}"
        db.add(Notification(user_id=task.assignee_id, workspace_id=project.workspace_id, kind=kind, message=message, entity_id=task.id))
        created += 1
    db.commit()
    return created

def main():
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            with SessionLocal() as db:
                count = run_once(db)
            logger.info("Deadline worker created %s notifications", count)
        except Exception as exc:
            logger.error("Deadline worker failed: %s", type(exc).__name__)
        if "--once" in sys.argv:
            break
        time.sleep(3600)

if __name__ == "__main__":
    main()
