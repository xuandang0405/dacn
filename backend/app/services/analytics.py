from datetime import date, timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import (
    KanbanColumn,
    Project,
    Subtask,
    Task,
    TaskEstimateVersion,
    WorkspaceMember,
)


def relative_deviation(estimated: float, actual: float) -> float | None:
    if actual > 0:
        sai_so = abs(actual - estimated) / actual * 100
        return round(sai_so, 2)
    return None


def mape(pairs: list[tuple[float, float]]) -> float | None:
    cac_sai_so = []
    for gio_uoc_luong, gio_thuc_te in pairs:
        if gio_thuc_te > 0:
            cac_sai_so.append(relative_deviation(gio_uoc_luong, gio_thuc_te))
    if not cac_sai_so:
        return None
    return round(sum(cac_sai_so) / len(cac_sai_so), 2)


def workload(db: Session, workspace_id: int, start: date, end: date):
    if end < start or (end - start).days > 365:
        raise ValueError("Invalid date interval")
    so_ngay_lam = 0
    for thu_tu in range((end - start).days + 1):
        ngay = start + timedelta(days=thu_tu)
        if ngay.weekday() < 5:
            so_ngay_lam += 1
    danh_sach_thanh_vien = db.scalars(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.status == "ACTIVE",
        )
    ).all()
    ma_du_an = db.scalars(
        select(Project.id).where(Project.workspace_id == workspace_id)
    ).all()
    cac_task = (
        db.execute(
            select(Task, KanbanColumn)
            .join(KanbanColumn, Task.column_id == KanbanColumn.id)
            .where(Task.project_id.in_(ma_du_an), KanbanColumn.is_done.is_(False))
        ).all()
        if ma_du_an
        else []
    )
    ket_qua = {}
    for thanh_vien in danh_sach_thanh_vien:
        ket_qua[thanh_vien.user_id] = {
            "user_id": thanh_vien.user_id,
            "capacity_hours": round(thanh_vien.capacity_hours * so_ngay_lam / 5, 2),
            "assigned_hours": 0.0,
            "task_count": 0,
        }
    ma_task = [task.id for task, _ in cac_task]
    cac_viec_con = (
        db.scalars(select(Subtask).where(Subtask.task_id.in_(ma_task))).all()
        if ma_task
        else []
    )
    viec_con_theo_task = {}
    task_theo_nguoi = {}
    for ma_nguoi in ket_qua:
        task_theo_nguoi[ma_nguoi] = set()
    for viec_con in cac_viec_con:
        viec_con_theo_task.setdefault(viec_con.task_id, []).append(viec_con)
    for task, _ in cac_task:
        # Giữ phạm vi ngày của báo cáo tải hiện tại.
        if task.start_date and task.start_date > end:
            continue
        # Việc quá hạn nhưng chưa hoàn thành vẫn là khối lượng còn phải làm.
        danh_sach_viec_con = viec_con_theo_task.get(task.id, [])
        tong_gio_viec_con = 0
        for viec_con in danh_sach_viec_con:
            tong_gio_viec_con += float(viec_con.estimated_hours)
        gio_con_lai_cua_cha = max(0.0, float(task.estimated_hours) - tong_gio_viec_con)
        if task.assignee_id in ket_qua:
            ket_qua[task.assignee_id]["assigned_hours"] += gio_con_lai_cua_cha
            task_theo_nguoi[task.assignee_id].add(task.id)
        for viec_con in danh_sach_viec_con:
            if viec_con.done:
                continue
            if viec_con.due_date and viec_con.due_date > end:
                continue
            nguoi_nhan = viec_con.assignee_id or task.assignee_id
            if nguoi_nhan in ket_qua:
                ket_qua[nguoi_nhan]["assigned_hours"] += float(viec_con.estimated_hours)
                task_theo_nguoi[nguoi_nhan].add(task.id)
    for dong in ket_qua.values():
        dong["task_count"] = len(task_theo_nguoi[dong["user_id"]])
        dong["assigned_hours"] = round(dong["assigned_hours"], 2)
        nang_luc = dong["capacity_hours"]
        dong["percentage"] = None
        if nang_luc > 0:
            dong["percentage"] = round(dong["assigned_hours"] / nang_luc * 100, 1)
        ty_le = dong["percentage"]
        if ty_le is None:
            dong["status"] = "NO_CAPACITY"
        elif ty_le > 100:
            dong["status"] = "OVERLOADED"
        elif ty_le >= 90:
            dong["status"] = "HIGH"
        elif ty_le >= 70:
            dong["status"] = "BUSY"
        else:
            dong["status"] = "NORMAL"
    return list(ket_qua.values())


def project_analytics(db: Session, project_id: int):
    cac_dong = db.execute(
        select(Task, KanbanColumn)
        .join(KanbanColumn, Task.column_id == KanbanColumn.id)
        .where(Task.project_id == project_id)
    ).all()
    ma_task = [task.id for task, _ in cac_dong]
    lich_su = (
        db.scalars(
            select(TaskEstimateVersion)
            .where(TaskEstimateVersion.task_id.in_(ma_task))
            .order_by(TaskEstimateVersion.task_version, TaskEstimateVersion.id)
        ).all()
        if ma_task
        else []
    )
    uoc_luong_goc = {}
    for phien_ban in lich_su:
        # Task mới có thể chưa được ước lượng (0 giờ).
        # Chỉ dùng ước lượng dương đầu tiên đã lưu để so sánh với giờ thực tế.
        if float(phien_ban.estimated_hours) > 0:
            uoc_luong_goc.setdefault(phien_ban.task_id, phien_ban)
    theo_trang_thai, theo_uu_tien = {}, {}
    cac_cap_gio = []
    tong_gio_uoc_luong = 0.0
    tong_gio_thuc_te = 0.0
    theo_thanh_vien = {}
    theo_nguon = {"AI": [], "HUMAN": []}
    so_hoan_thanh = 0
    so_qua_han = 0
    hom_nay = date.today()
    for task, cot in cac_dong:
        theo_trang_thai[cot.name] = theo_trang_thai.get(cot.name, 0) + 1
        theo_uu_tien[task.priority] = theo_uu_tien.get(task.priority, 0) + 1
        so_hoan_thanh += int(cot.is_done)
        so_qua_han += int(
            bool(task.due_date and task.due_date < hom_nay and not cot.is_done)
        )
        cap_gio = (float(task.estimated_hours), float(task.actual_hours))
        tong_gio_uoc_luong += cap_gio[0]
        tong_gio_thuc_te += cap_gio[1]
        ban_goc = uoc_luong_goc.get(task.id)
        if cot.is_done and cap_gio[1] > 0 and ban_goc is not None:
            cap_so_sanh = (float(ban_goc.estimated_hours), cap_gio[1])
            cac_cap_gio.append(cap_so_sanh)
            if ban_goc.source in theo_nguon:
                theo_nguon[ban_goc.source].append(cap_so_sanh)
            if task.assignee_id:
                theo_thanh_vien.setdefault(task.assignee_id, []).append(cap_so_sanh)
    ty_le_hoan_thanh = 0
    if cac_dong:
        ty_le_hoan_thanh = round(so_hoan_thanh / len(cac_dong) * 100, 1)
    mape_thanh_vien = {}
    for ma_nguoi, cac_gio in theo_thanh_vien.items():
        mape_thanh_vien[str(ma_nguoi)] = mape(cac_gio)
    return {
        "total_tasks": len(cac_dong),
        "completed_tasks": so_hoan_thanh,
        "overdue_tasks": so_qua_han,
        "completion_rate": ty_le_hoan_thanh,
        "by_status": theo_trang_thai,
        "by_priority": theo_uu_tien,
        "estimated_hours": round(tong_gio_uoc_luong, 2),
        "actual_hours": round(tong_gio_thuc_te, 2),
        "mape": mape(cac_cap_gio),
        "mape_by_member": mape_thanh_vien,
        "ai_mape": mape(theo_nguon["AI"]),
        "human_mape": mape(theo_nguon["HUMAN"]),
        "mape_basis": "first_positive_committed_estimate",
        "mape_sample_count": len(cac_cap_gio),
        "ai_sample_count": len(theo_nguon["AI"]),
        "human_sample_count": len(theo_nguon["HUMAN"]),
    }
