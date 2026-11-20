"""Một key chỉ tạo một task trong 24 giờ, kể cả nhiều request đồng thời."""

import hashlib
import json
from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.models import TaskCreationRequest, utcnow


def reserve_task_creation(db, user_id, project_id, key, data):
    if key is None:
        return None, False
    khoa_bam = hashlib.sha256(key.encode()).hexdigest()
    noi_dung = json.dumps(
        data.model_dump(mode="json"), sort_keys=True, ensure_ascii=False
    )
    noi_dung_bam = hashlib.sha256(noi_dung.encode()).hexdigest()
    ban_ghi = TaskCreationRequest(
        user_id=user_id,
        project_id=project_id,
        key_hash=khoa_bam,
        payload_hash=noi_dung_bam,
        expires_at=utcnow() + timedelta(hours=24),
    )
    try:
        db.add(ban_ghi)
        # UNIQUE của InnoDB chờ giao dịch đang dùng cùng key kết thúc.
        db.flush()
        return ban_ghi, False
    except IntegrityError:
        # Chưa sửa task ở bước này nên rollback không mất thay đổi nghiệp vụ.
        db.rollback()
        ban_ghi = db.scalar(
            select(TaskCreationRequest)
            .where(
                TaskCreationRequest.user_id == user_id,
                TaskCreationRequest.project_id == project_id,
                TaskCreationRequest.key_hash == khoa_bam,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if ban_ghi is None:
            raise
    if ban_ghi.expires_at <= utcnow():
        ban_ghi.payload_hash = noi_dung_bam
        ban_ghi.response = None
        ban_ghi.expires_at = utcnow() + timedelta(hours=24)
        return ban_ghi, False
    if ban_ghi.payload_hash != noi_dung_bam:
        raise HTTPException(409, "Idempotency key was used with different task data")
    if ban_ghi.response is None:
        raise HTTPException(
            409, "Task creation is still in progress; retry with the same key"
        )
    return ban_ghi, True
