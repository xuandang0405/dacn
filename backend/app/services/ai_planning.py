"""Lưu ngữ cảnh riêng và gợi ý người nhận theo kỹ năng, tải công việc."""

import hashlib
import json
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core import settings
from app.models import (
    AIRequest,
    MemberSkill,
    Project,
    ProjectMember,
    Skill,
    User,
    WorkspaceMember,
    utcnow,
)
from app.schemas import AIPlan
from app.services.analytics import workload

PROMPT_VERSION = "planner-20261105-v2"


def document_fingerprint(documents):
    thong_tin_tep = []
    for tai_lieu in documents:
        thong_tin_tep.append((tai_lieu.id, tai_lieu.sha256))
    noi_dung = json.dumps(thong_tin_tep, sort_keys=True)
    return hashlib.sha256(noi_dung.encode()).hexdigest()


def cache_key(kind, project, fingerprint, language, text, context_id, extras=None):
    thong_tin = [
        PROMPT_VERSION,
        settings.gemini_model,
        kind,
        project.name,
        fingerprint,
        language,
        text.strip(),
        context_id,
        extras,
    ]
    noi_dung = json.dumps(thong_tin, ensure_ascii=False)
    return hashlib.sha256(noi_dung.encode()).hexdigest()


def recent_requests(db: Session, project_id: int, user_id: int):
    cau_truy_van = (
        select(AIRequest)
        .where(AIRequest.project_id == project_id, AIRequest.user_id == user_id)
        .order_by(AIRequest.id.desc())
        .limit(40)
    )
    return db.scalars(cau_truy_van).all()


def cached_request(db, project_id, user_id, key):
    moc_thoi_gian = utcnow() - timedelta(hours=24)
    for yeu_cau in recent_requests(db, project_id, user_id):
        thong_tin = yeu_cau.response.get("_meta", {})
        if yeu_cau.created_at >= moc_thoi_gian and thong_tin.get("cache_key") == key:
            return yeu_cau
    return None


def read_context(db, context_id, project_id, user_id, fingerprint):
    """Đọc tối đa ba lượt từ DB, không nhận câu trả lời do client tự khai báo."""
    cac_luot = []
    da_doc = set()
    while context_id and len(cac_luot) < 3 and context_id not in da_doc:
        da_doc.add(context_id)
        yeu_cau = db.get(AIRequest, context_id)
        if (
            not yeu_cau
            or yeu_cau.project_id != project_id
            or yeu_cau.user_id != user_id
        ):
            raise HTTPException(404, "AI context not found")
        thong_tin = yeu_cau.response.get("_meta", {})
        if (
            thong_tin.get("kind") != "answer"
            or thong_tin.get("document_fingerprint") != fingerprint
        ):
            raise HTTPException(409, "Project documents changed; analyze them again")
        cac_luot.append(
            {
                "id": yeu_cau.id,
                "question": yeu_cau.story,
                "answer": yeu_cau.response["answer"],
            }
        )
        context_id = thong_tin.get("context_id")
    cac_luot.reverse()
    cac_doan = []
    for luot in cac_luot:
        cac_doan.append(f"Question: {luot['question']}\nAnswer: {luot['answer']}")
    noi_dung = "\n\n".join(cac_doan)
    # Giữ phần mới nhất khi hội thoại dài hơn giới hạn ngữ cảnh.
    return cac_luot, noi_dung[-12000:]


def latest_context(db, project_id, user_id, fingerprint, language):
    for yeu_cau in recent_requests(db, project_id, user_id):
        thong_tin = yeu_cau.response.get("_meta", {})
        if (
            thong_tin.get("kind") == "answer"
            and thong_tin.get("document_fingerprint") == fingerprint
            and thong_tin.get("language") == language
        ):
            cac_luot, _ = read_context(db, yeu_cau.id, project_id, user_id, fingerprint)
            return {"context_id": yeu_cau.id, "turns": cac_luot}
    return {"context_id": None, "turns": []}


def team_data(db: Session, project: Project):
    cau_truy_van = (
        select(WorkspaceMember, User)
        .join(User, User.id == WorkspaceMember.user_id)
        .outerjoin(
            ProjectMember,
            (ProjectMember.user_id == User.id)
            & (ProjectMember.project_id == project.id),
        )
        .where(
            WorkspaceMember.workspace_id == project.workspace_id,
            WorkspaceMember.status == "ACTIVE",
            User.active.is_(True),
            or_(
                WorkspaceMember.role.in_(["OWNER", "ADMIN"]),
                ProjectMember.id.is_not(None),
            ),
        )
    )
    cac_thanh_vien = db.execute(cau_truy_van).all()
    cau_truy_van_ky_nang = (
        select(MemberSkill, Skill)
        .join(Skill, Skill.id == MemberSkill.skill_id)
        .where(Skill.workspace_id == project.workspace_id)
    )
    muc_ky_nang = {}
    for danh_gia, ky_nang in db.execute(cau_truy_van_ky_nang).all():
        if danh_gia.user_id not in muc_ky_nang:
            muc_ky_nang[danh_gia.user_id] = {}
        muc_ky_nang[danh_gia.user_id][ky_nang.name.casefold()] = danh_gia.level

    tai_theo_nguoi = {}
    for tai in workload(
        db, project.workspace_id, date.today(), date.today() + timedelta(days=6)
    ):
        tai_theo_nguoi[tai["user_id"]] = tai

    ket_qua = []
    for _, nguoi_dung in cac_thanh_vien:
        thanh_vien = {
            "user_id": nguoi_dung.id,
            "name": nguoi_dung.name,
            "skills": muc_ky_nang.get(nguoi_dung.id, {}),
        }
        for ten_truong, gia_tri in tai_theo_nguoi.get(nguoi_dung.id, {}).items():
            if ten_truong != "user_id":
                thanh_vien[ten_truong] = gia_tri
        ket_qua.append(thanh_vien)
    return ket_qua


def skill_match(member, required):
    cac_ky_nang = set()
    for ten in required:
        if ten.strip():
            cac_ky_nang.add(ten.strip().casefold())
    if not cac_ky_nang:
        return 0
    tong_diem = 0
    for ten in cac_ky_nang:
        tong_diem += member["skills"].get(ten, 0) / 5
    return round(tong_diem / len(cac_ky_nang) * 100)


def assign_plan(plan: AIPlan, members, language):
    """Tính cả việc có sẵn và những việc đã phân trong chính bản nháp này."""
    gio_da_giao = {}
    for thanh_vien in members:
        gio_da_giao[thanh_vien["user_id"]] = float(thanh_vien.get("assigned_hours", 0))
    cac_viec = []
    for cong_viec in plan.tasks:
        gio_viec_con = sum(viec_con.estimated_hours for viec_con in cong_viec.subtasks)
        so_gio = max(cong_viec.estimated_hours, gio_viec_con)
        cac_ung_vien = []
        for thanh_vien in members:
            nang_luc = thanh_vien.get("capacity_hours", 0)
            if nang_luc <= 0:
                continue
            tai_du_kien = (gio_da_giao[thanh_vien["user_id"]] + so_gio) / nang_luc * 100
            do_khop = skill_match(thanh_vien, cong_viec.required_skills)
            cac_ung_vien.append((thanh_vien, do_khop, tai_du_kien))

        # Ưu tiên có kỹ năng, sau đó ưu tiên người chưa vượt 100% năng lực.
        co_ky_nang = []
        for ung_vien in cac_ung_vien:
            if ung_vien[1] > 0:
                co_ky_nang.append(ung_vien)
        if not co_ky_nang:
            co_ky_nang = cac_ung_vien
        chua_qua_tai = []
        for ung_vien in co_ky_nang:
            if ung_vien[2] <= 100:
                chua_qua_tai.append(ung_vien)
        danh_sach_chon = chua_qua_tai or co_ky_nang

        if danh_sach_chon:
            # Điểm bằng nhau thì chọn tải thấp hơn, tiếp đến user_id nhỏ hơn.
            def thu_tu_chon(ung_vien):
                thanh_vien, do_khop, tai_du_kien = ung_vien
                diem = do_khop * 0.7 - tai_du_kien * 0.3
                return -diem, tai_du_kien, thanh_vien["user_id"]

            nguoi_nhan, do_khop, tai_du_kien = min(danh_sach_chon, key=thu_tu_chon)
            ma_nguoi_nhan = nguoi_nhan["user_id"]
            gio_da_giao[ma_nguoi_nhan] += so_gio
            if language == "vi":
                ly_do = f"Khớp kỹ năng {do_khop}%; tải dự kiến {tai_du_kien:.1f}% trong tuần, đã tính các việc trước trong bản nháp."
            else:
                ly_do = f"Skill match {do_khop}%; projected weekly workload {tai_du_kien:.1f}%, including earlier draft tasks."
            if tai_du_kien > 100:
                if language == "vi":
                    ly_do += " Cần kiểm tra tình trạng quá tải."
                else:
                    ly_do += " Review this overload before confirming."
        else:
            ma_nguoi_nhan = None
            if language == "vi":
                ly_do = "Chưa có thành viên đủ điều kiện và có năng lực khả dụng; hãy chọn người thực hiện."
            else:
                ly_do = "No eligible member has available capacity; choose an assignee."
        viec_da_phan = cong_viec.model_copy(
            update={
                "assignee_id": ma_nguoi_nhan,
                "assignment_reason": ly_do,
            }
        )
        cac_viec.append(viec_da_phan)
    return plan.model_copy(update={"tasks": cac_viec})


def proposal_response(row, members, language, cached=False):
    ke_hoach = AIPlan.model_validate(
        {
            "summary": row.response["summary"],
            "tasks": row.response["tasks"],
        }
    )
    ke_hoach = assign_plan(ke_hoach, members, language)
    thong_tin = row.response.get("_meta", {})
    nguoi_du_dieu_kien = []
    for thanh_vien in members:
        nguoi_du_dieu_kien.append(
            {"user_id": thanh_vien["user_id"], "name": thanh_vien["name"]}
        )
    luong_su_dung = thong_tin.get("usage", {})
    if cached:
        luong_su_dung = {"provider_calls": 0, "total_tokens": 0}
    return {
        "request_id": row.id,
        "plan": ke_hoach.model_dump(mode="json"),
        "eligible_members": nguoi_du_dieu_kien,
        "cached": cached,
        "usage": luong_su_dung,
        "context_turns": thong_tin.get("context_turns", 0),
    }
