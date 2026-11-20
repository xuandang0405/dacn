from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile
from typing import Literal
from datetime import timedelta
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import (
    AIRequest,
    Activity,
    KanbanColumn,
    Notification,
    Project,
    ProjectDocument,
    Skill,
    Subtask,
    Task,
    TaskRequirement,
    User,
    utcnow,
)
from app.realtime import hub
from app.schemas import AIConfirm, AIProjectQuery, AIStory, ProjectDocumentOut
from app.security import (
    current_user,
    project_access,
    workspace_access,
    validate_assignee,
)
from app.services.documents import (
    MAX_DOCUMENTS_PER_PROJECT,
    MAX_UPLOAD_BYTES,
    read_document,
)
from app.services.gemini import answer_project, decompose
from app.services import storage
from app.services import ai_planning as planning
from app.services.task_transactions import lock_columns, siblings, snapshot

router = APIRouter(prefix="/ai", tags=["AI assistant"])


def project_documents(db: Session, project_id: int) -> list[ProjectDocument]:
    cau_truy_van = (
        select(ProjectDocument)
        .where(ProjectDocument.project_id == project_id)
        .order_by(ProjectDocument.created_at, ProjectDocument.id)
    )
    return db.scalars(cau_truy_van).all()


def access_after_provider(db: Session, project_id: int, user: User):
    nguoi_dung_moi = db.get(User, user.id)
    if (
        not nguoi_dung_moi
        or not nguoi_dung_moi.active
        or nguoi_dung_moi.token_version != user.token_version
    ):
        raise HTTPException(401, "Session revoked; sign in again")
    return project_access(db, project_id, nguoi_dung_moi)


def documents_after_provider(db, project_id, user, fingerprint):
    access_after_provider(db, project_id, user)
    if planning.document_fingerprint(project_documents(db, project_id)) != fingerprint:
        raise HTTPException(409, "Project documents changed; analyze them again")


def answer_response(row, documents, cached=False):
    cac_ten_tep = []
    for tai_lieu in documents:
        cac_ten_tep.append(tai_lieu.filename)
    luong_su_dung = row.response.get("_meta", {}).get("usage", {})
    if cached:
        luong_su_dung = {"provider_calls": 0, "total_tokens": 0}
    return {
        "answer": row.response["answer"],
        "context_id": row.id,
        "documents": cac_ten_tep,
        "cached": cached,
        "usage": luong_su_dung,
    }


@router.get(
    "/projects/{project_id}/documents",
    response_model=list[ProjectDocumentOut],
    summary="Project documents available to AI",
)
def list_documents(
    project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    project_access(db, project_id, user)
    return project_documents(db, project_id)


@router.post(
    "/projects/{project_id}/documents",
    response_model=ProjectDocumentOut,
    status_code=201,
    summary="Upload a project document",
)
def upload_document(
    project_id: int,
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # Kiểm tra tệp, lưu nội dung riêng rồi lưu thông tin tệp vào MySQL.
    project_access(db, project_id, user)
    ten_tep = (file.filename or "").replace("\\", "/").split("/")[-1][:255]
    try:
        noi_dung = file.file.read(MAX_UPLOAD_BYTES + 1)
    finally:
        file.file.close()
    loai_tep, van_ban = read_document(ten_tep, noi_dung)
    db.scalar(select(Project.id).where(Project.id == project_id).with_for_update())
    cau_truy_van = (
        select(ProjectDocument.id)
        .where(ProjectDocument.project_id == project_id)
        .with_for_update()
    )
    cac_ma = db.scalars(cau_truy_van).all()
    if len(cac_ma) >= MAX_DOCUMENTS_PER_PROJECT:
        raise HTTPException(409, "Project already has the maximum of 3 documents")
    khoa_luu, ma_kiem_tra = storage.put(noi_dung)
    tai_lieu = ProjectDocument(
        project_id=project_id,
        uploaded_by=user.id,
        filename=ten_tep,
        media_type=loai_tep,
        size_bytes=len(noi_dung),
        storage_key=khoa_luu,
        sha256=ma_kiem_tra,
        extracted_text=van_ban,
    )
    try:
        db.add(tai_lieu)
        db.commit()
    except Exception:
        db.rollback()
        storage.remove(khoa_luu)
        raise
    db.refresh(tai_lieu)
    return tai_lieu


@router.delete(
    "/documents/{document_id}", status_code=204, summary="Remove a project document"
)
def delete_document(
    document_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    tai_lieu = db.get(ProjectDocument, document_id)
    if not tai_lieu:
        raise HTTPException(404, "Document not found")
    du_an = project_access(db, tai_lieu.project_id, user)
    quyen_tham_gia = workspace_access(db, du_an.workspace_id, user)
    if tai_lieu.uploaded_by != user.id and quyen_tham_gia.role not in {
        "OWNER",
        "ADMIN",
    }:
        raise HTTPException(
            403, "Only the uploader or a manager may remove this document"
        )
    khoa_luu = tai_lieu.storage_key
    db.delete(tai_lieu)
    db.commit()
    storage.remove(khoa_luu)


@router.get(
    "/projects/{project_id}/context",
    summary="Restore my recent document-based AI conversation",
)
def get_context(
    project_id: int,
    language: Literal["vi", "en"] = "vi",
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    project_access(db, project_id, user)
    cac_tai_lieu = project_documents(db, project_id)
    return planning.latest_context(
        db, project_id, user.id, planning.document_fingerprint(cac_tai_lieu), language
    )


@router.post(
    "/projects/{project_id}/query",
    summary="Analyze or ask about uploaded project documents",
)
async def query_project(
    project_id: int,
    data: AIProjectQuery,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # Ưu tiên câu trả lời còn cache; chỉ gọi Gemini khi cần nội dung mới.
    du_an = project_access(db, project_id, user)
    cac_tai_lieu = project_documents(db, project_id)
    if not cac_tai_lieu:
        raise HTTPException(409, "Upload a project document before asking AI")
    if data.mode == "ask" and not data.question.strip():
        raise HTTPException(422, "Question is required")
    dau_tai_lieu = planning.document_fingerprint(cac_tai_lieu)
    cac_luot, ngu_canh = planning.read_context(
        db, data.context_id, project_id, user.id, dau_tai_lieu
    )
    khoa_luu = planning.cache_key(
        data.mode, du_an, dau_tai_lieu, data.language, data.question, data.context_id
    )
    ban_luu = planning.cached_request(db, project_id, user.id, khoa_luu)
    # Hỏi lại đúng câu vừa trả lời không cần tạo thêm lượt gọi Gemini.
    if (
        not ban_luu
        and cac_luot
        and data.mode == "ask"
        and cac_luot[-1]["question"] == data.question.strip()
    ):
        yeu_cau_truoc = db.get(AIRequest, data.context_id)
        if yeu_cau_truoc.response.get("_meta", {}).get(
            "language"
        ) == data.language and yeu_cau_truoc.created_at >= utcnow() - timedelta(
            hours=24
        ):
            ban_luu = yeu_cau_truoc
    if ban_luu:
        return answer_response(ban_luu, cac_tai_lieu, True)
    # Không giữ kết nối đọc DB trong lúc chờ dịch vụ bên ngoài.
    db.expunge_all()
    db.rollback()
    luong_su_dung = {}
    cau_tra_loi = await answer_project(
        du_an.name,
        cac_tai_lieu,
        data.mode,
        data.question.strip(),
        data.language,
        context=ngu_canh,
        usage=luong_su_dung,
    )
    documents_after_provider(db, project_id, user, dau_tai_lieu)
    noi_dung_yeu_cau = data.question.strip()
    if not noi_dung_yeu_cau:
        noi_dung_yeu_cau = (
            "Phân tích dự án" if data.language == "vi" else "Analyze project"
        )
    ban_ghi = AIRequest(
        project_id=project_id,
        user_id=user.id,
        story=noi_dung_yeu_cau,
        response={
            "answer": cau_tra_loi,
            "_meta": {
                "kind": "answer",
                "cache_key": khoa_luu,
                "document_fingerprint": dau_tai_lieu,
                "language": data.language,
                "context_id": data.context_id,
                "usage": luong_su_dung,
            },
        },
    )
    db.add(ban_ghi)
    db.commit()
    db.refresh(ban_ghi)
    return answer_response(ban_ghi, cac_tai_lieu)


@router.post("/decompose-task", summary="Generate a plan for review")
async def decompose_task(
    data: AIStory, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    # Tạo bản nháp từ tài liệu và ngữ cảnh; chưa tạo task tại bước này.
    du_an = project_access(db, data.project_id, user)
    cac_tai_lieu = project_documents(db, du_an.id)
    if not cac_tai_lieu:
        raise HTTPException(409, "Upload a project document before asking AI")
    dau_tai_lieu = planning.document_fingerprint(cac_tai_lieu)
    cac_luot, ngu_canh = planning.read_context(
        db, data.context_id, du_an.id, user.id, dau_tai_lieu
    )
    cau_truy_van = (
        select(Skill.name)
        .where(Skill.workspace_id == du_an.workspace_id)
        .order_by(Skill.name)
    )
    cac_ky_nang = list(db.scalars(cau_truy_van).all())[:60]
    khoa_luu = planning.cache_key(
        "plan",
        du_an,
        dau_tai_lieu,
        data.language,
        data.story,
        data.context_id,
        cac_ky_nang,
    )
    ban_luu = planning.cached_request(db, du_an.id, user.id, khoa_luu)
    if ban_luu:
        if ban_luu.confirmed_at:
            raise HTTPException(409, "Plan already confirmed")
        return planning.proposal_response(
            ban_luu, planning.team_data(db, du_an), data.language, True
        )
    db.expunge_all()
    db.rollback()
    luong_su_dung = {}
    ke_hoach = await decompose(
        data.story.strip(),
        du_an.name,
        cac_tai_lieu,
        data.language,
        context=ngu_canh,
        usage=luong_su_dung,
        known_skills=cac_ky_nang,
    )
    documents_after_provider(db, data.project_id, user, dau_tai_lieu)
    cac_thanh_vien = planning.team_data(db, du_an)
    noi_dung_phan_hoi = ke_hoach.model_dump(mode="json")
    noi_dung_phan_hoi["_meta"] = {
        "kind": "plan",
        "cache_key": khoa_luu,
        "document_fingerprint": dau_tai_lieu,
        "language": data.language,
        "context_id": data.context_id,
        "context_turns": len(cac_luot),
        "usage": luong_su_dung,
    }
    yeu_cau = AIRequest(
        project_id=du_an.id,
        user_id=user.id,
        story=data.story.strip(),
        response=noi_dung_phan_hoi,
    )
    db.add(yeu_cau)
    db.commit()
    db.refresh(yeu_cau)
    return planning.proposal_response(yeu_cau, cac_thanh_vien, data.language)


@router.get(
    "/projects/{project_id}/suggest-members",
    summary="Suggest eligible members for task skills",
)
def suggest_members(
    project_id: int,
    skills: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    du_an = project_access(db, project_id, user)
    ky_nang_can = set()
    for ten in skills.split(","):
        if ten.strip():
            ky_nang_can.add(ten.strip().casefold())
    ket_qua = []
    for thanh_vien in planning.team_data(db, du_an):
        ket_qua.append(
            {
                "user_id": thanh_vien["user_id"],
                "name": thanh_vien["name"],
                "skill_match": planning.skill_match(thanh_vien, ky_nang_can),
                "workload_percent": thanh_vien.get("percentage"),
                "overloaded": thanh_vien.get("status") == "OVERLOADED",
            }
        )

    def thu_tu_goi_y(thanh_vien):
        return -thanh_vien["skill_match"], thanh_vien["workload_percent"] or 0

    return sorted(ket_qua, key=thu_tu_goi_y)


@router.post(
    "/requests/{request_id}/confirm", status_code=201, summary="Save reviewed AI plan"
)
def confirm_plan(
    request_id: int,
    data: AIConfirm,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    # Lưu trọn kế hoạch đã duyệt một lần, rồi mới phát các sự kiện realtime.
    yeu_cau = db.scalar(
        select(AIRequest).where(AIRequest.id == request_id).with_for_update()
    )
    if not yeu_cau or yeu_cau.user_id != user.id:
        raise HTTPException(404, "AI request not found")
    du_an = project_access(db, yeu_cau.project_id, user)
    if yeu_cau.confirmed_at:
        raise HTTPException(409, "Plan already confirmed")
    thong_tin = yeu_cau.response.get("_meta", {})
    if thong_tin.get("kind") == "answer":
        raise HTTPException(409, "Generate a task plan before confirming")
    if (
        thong_tin.get("document_fingerprint")
        and planning.document_fingerprint(project_documents(db, du_an.id))
        != thong_tin["document_fingerprint"]
    ):
        raise HTTPException(409, "Project documents changed; analyze them again")
    cac_nguoi_nhan = set()
    for cong_viec in data.plan.tasks:
        if cong_viec.assignee_id is not None:
            cac_nguoi_nhan.add(cong_viec.assignee_id)
    for assignee_id in cac_nguoi_nhan:
        validate_assignee(db, du_an, assignee_id)
    cau_truy_van_cot = (
        select(KanbanColumn)
        .where(KanbanColumn.project_id == du_an.id)
        .order_by(KanbanColumn.position)
    )
    cot = db.scalar(cau_truy_van_cot)
    if not cot:
        raise HTTPException(409, "Project has no Kanban column")
    lock_columns(db, [cot.id])
    vi_tri = len(siblings(db, cot.id))
    cac_ma = []
    viec_theo_nguoi = {}
    for viec_de_xuat in data.plan.tasks:
        cong_viec = Task(
            column_id=cot.id,
            title=viec_de_xuat.title,
            description=viec_de_xuat.description,
            priority=viec_de_xuat.priority,
            estimated_hours=viec_de_xuat.estimated_hours,
            actual_hours=0,
            reporter_id=user.id,
            assignee_id=viec_de_xuat.assignee_id,
            position=vi_tri,
            estimate_source="AI",
        )
        db.add(cong_viec)
        db.flush()
        snapshot(db, cong_viec, user.id)
        cac_ma.append(cong_viec.id)
        db.add(
            Activity(
                project_id=du_an.id,
                actor_id=user.id,
                action="task.created",
                entity="task",
                entity_id=cong_viec.id,
                detail={"source": "AI"},
            )
        )
        if cong_viec.assignee_id:
            if cong_viec.assignee_id not in viec_theo_nguoi:
                viec_theo_nguoi[cong_viec.assignee_id] = []
            viec_theo_nguoi[cong_viec.assignee_id].append(cong_viec.id)
            db.add(
                Activity(
                    project_id=du_an.id,
                    actor_id=user.id,
                    action="task.assigned",
                    entity="task",
                    entity_id=cong_viec.id,
                    detail={"source": "AI", "assignee_id": cong_viec.assignee_id},
                )
            )
            if cong_viec.assignee_id != user.id:
                db.add(
                    Notification(
                        user_id=cong_viec.assignee_id,
                        workspace_id=du_an.workspace_id,
                        kind="task_assigned",
                        message=f"Assigned: {cong_viec.title}",
                        entity_id=cong_viec.id,
                    )
                )
        vi_tri += 1
        cac_ten_ky_nang = set()
        for ten in viec_de_xuat.required_skills:
            if ten.strip():
                cac_ten_ky_nang.add(ten.strip().casefold())
        for ten_ky_nang in cac_ten_ky_nang:
            db.add(TaskRequirement(task_id=cong_viec.id, name=ten_ky_nang))
        for viec_con in viec_de_xuat.subtasks:
            db.add(
                Subtask(
                    task_id=cong_viec.id,
                    title=viec_con.title,
                    description=viec_con.description,
                    estimated_hours=viec_con.estimated_hours,
                    actual_hours=0,
                )
            )
    yeu_cau.reviewed_plan = data.plan.model_dump(mode="json")
    yeu_cau.confirmed_at = utcnow()
    db.commit()
    for task_id in cac_ma:
        background_tasks.add_task(
            hub.publish,
            du_an.id,
            "task.created",
            du_an.workspace_id,
            task_id,
            user.id,
            {"source": "AI"},
        )
    for assignee_id, task_ids in viec_theo_nguoi.items():
        background_tasks.add_task(
            hub.publish_user,
            assignee_id,
            "task.changed",
            {"project_id": du_an.id, "task_id": task_ids[0]},
        )
        if assignee_id != user.id:
            background_tasks.add_task(
                hub.publish_user,
                assignee_id,
                "notification.created",
                {"kind": "task_assigned", "task_ids": task_ids},
            )
    db.rollback()
    return {"task_ids": cac_ma}
