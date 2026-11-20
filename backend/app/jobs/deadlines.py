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
    hom_nay = date.today()
    moc_nhac_han = hom_nay + timedelta(days=3)
    cong_viec_can_nhac = db.execute(
        select(Task, Project)
        .join(Project, Project.id == Task.project_id)
        .join(KanbanColumn, KanbanColumn.id == Task.column_id)
        .where(
            Task.assignee_id.is_not(None),
            Task.due_date.is_not(None),
            Task.due_date <= moc_nhac_han,
            KanbanColumn.is_done.is_(False),
        )
    ).all()
    so_thong_bao_moi = 0
    for cong_viec, du_an in cong_viec_can_nhac:
        loai_thong_bao = (
            "task_overdue" if cong_viec.due_date < hom_nay else "deadline_soon"
        )
        da_thong_bao = db.scalar(
            select(Notification.id).where(
                Notification.user_id == cong_viec.assignee_id,
                Notification.kind == loai_thong_bao,
                Notification.entity_id == cong_viec.id,
            )
        )
        if da_thong_bao:
            continue
        noi_dung = (
            f"Task overdue: {cong_viec.title}"
            if loai_thong_bao == "task_overdue"
            else f"Deadline approaching: {cong_viec.title}"
        )
        db.add(
            Notification(
                user_id=cong_viec.assignee_id,
                workspace_id=du_an.workspace_id,
                kind=loai_thong_bao,
                message=noi_dung,
                entity_id=cong_viec.id,
            )
        )
        so_thong_bao_moi += 1
    db.commit()
    return so_thong_bao_moi


def main():
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            with SessionLocal() as db:
                so_thong_bao_moi = run_once(db)
            logger.info("Deadline worker created %s notifications", so_thong_bao_moi)
        except Exception as exc:
            logger.error("Deadline worker failed: %s", type(exc).__name__)
        if "--once" in sys.argv:
            break
        time.sleep(3600)


if __name__ == "__main__":
    main()
