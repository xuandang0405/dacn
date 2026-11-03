from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import AIRequest, Activity, KanbanColumn, MemberSkill, Project, ProjectDocument, Skill, Subtask, Task, TaskRequirement, User, WorkspaceMember, utcnow
from app.realtime import hub
from app.schemas import AIConfirm, AIProjectQuery, AIStory, ProjectDocumentOut
from app.security import current_user, project_access, workspace_access
from app.services.analytics import workload
from app.services.documents import MAX_DOCUMENTS_PER_PROJECT, MAX_UPLOAD_BYTES, read_document
from app.services.gemini import answer_project, decompose
from datetime import date, timedelta
from app.services import storage
from app.services.task_transactions import lock_columns, siblings, snapshot

router = APIRouter(prefix="/ai", tags=["AI assistant"])

def project_documents(db: Session, project_id: int) -> list[ProjectDocument]:
    return db.scalars(select(ProjectDocument).where(ProjectDocument.project_id == project_id).order_by(ProjectDocument.created_at, ProjectDocument.id)).all()

@router.get("/projects/{project_id}/documents", response_model=list[ProjectDocumentOut], summary="Project documents available to AI")
def list_documents(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project_access(db, project_id, user)
    return project_documents(db, project_id)

@router.post("/projects/{project_id}/documents", response_model=ProjectDocumentOut, status_code=201, summary="Upload a project document")
async def upload_document(project_id: int, file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    project_access(db, project_id, user)
    filename = (file.filename or "").replace("\\", "/").split("/")[-1][:255]
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()
    media_type, extracted_text = read_document(filename, content)
    db.scalar(select(Project.id).where(Project.id == project_id).with_for_update())
    ids = db.scalars(select(ProjectDocument.id).where(ProjectDocument.project_id == project_id).with_for_update()).all()
    if len(ids) >= MAX_DOCUMENTS_PER_PROJECT:
        raise HTTPException(409, "Project already has the maximum of 3 documents")
    key, digest = storage.put(content)
    document = ProjectDocument(project_id=project_id, uploaded_by=user.id, filename=filename, media_type=media_type, size_bytes=len(content), storage_key=key, sha256=digest, extracted_text=extracted_text)
    try:
        db.add(document)
        db.commit()
    except Exception:
        db.rollback()
        storage.remove(key)
        raise
    db.refresh(document)
    return document

@router.delete("/documents/{document_id}", status_code=204, summary="Remove a project document")
def delete_document(document_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    document = db.get(ProjectDocument, document_id)
    if not document:
        raise HTTPException(404, "Document not found")
    project = project_access(db, document.project_id, user)
    membership = workspace_access(db, project.workspace_id, user)
    if document.uploaded_by != user.id and membership.role not in {"OWNER", "ADMIN"}:
        raise HTTPException(403, "Only the uploader or a manager may remove this document")
    key = document.storage_key
    db.delete(document)
    db.commit()
    storage.remove(key)

@router.post("/projects/{project_id}/query", summary="Analyze or ask about uploaded project documents")
async def query_project(project_id: int, data: AIProjectQuery, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project = project_access(db, project_id, user)
    documents = project_documents(db, project_id)
    if not documents:
        raise HTTPException(409, "Upload a project document before asking AI")
    if data.mode == "ask" and not data.question.strip():
        raise HTTPException(422, "Question is required")
    answer = await answer_project(project.name, documents, data.mode, data.question.strip(), data.language)
    return {"answer": answer, "documents": [document.filename for document in documents]}

@router.post("/decompose-task", summary="Generate a plan for review")
async def decompose_task(data: AIStory, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project = project_access(db, data.project_id, user)
    documents = project_documents(db, project.id)
    if not documents:
        raise HTTPException(409, "Upload a project document before asking AI")
    plan = await decompose(data.story.strip(), project.name, documents, data.language)
    request = AIRequest(project_id=project.id, user_id=user.id, story=data.story.strip(), response=plan.model_dump(mode="json"))
    db.add(request)
    db.commit()
    db.refresh(request)
    return {"request_id": request.id, "plan": plan.model_dump(mode="json")}

@router.get("/projects/{project_id}/suggest-members", summary="Suggest eligible members for task skills")
def suggest_members(project_id: int, skills: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project = project_access(db, project_id, user)
    required = {s.strip().casefold() for s in skills.split(",") if s.strip()}
    members = db.execute(select(WorkspaceMember, User).join(User, User.id == WorkspaceMember.user_id).where(WorkspaceMember.workspace_id == project.workspace_id, WorkspaceMember.status == "ACTIVE")).all()
    skill_rows = db.execute(select(MemberSkill, Skill).join(Skill, Skill.id == MemberSkill.skill_id).where(Skill.workspace_id == project.workspace_id)).all()
    levels = {}
    for ms, skill in skill_rows:
        levels.setdefault(ms.user_id, {})[skill.name.casefold()] = ms.level
    current_workload = {w["user_id"]: w for w in workload(db, project.workspace_id, date.today(), date.today() + timedelta(days=6))}
    result = []
    for membership, member in members:
        try:
            project_access(db, project_id, member)
        except HTTPException:
            continue
        match = round(sum(levels.get(member.id, {}).get(s, 0) / 5 for s in required) / len(required) * 100) if required else 0
        load = current_workload.get(member.id, {})
        result.append({"user_id": member.id, "name": member.name, "skill_match": match, "workload_percent": load.get("percentage"), "overloaded": load.get("status") == "OVERLOADED"})
    return sorted(result, key=lambda r: (-r["skill_match"], r["workload_percent"] or 0))

@router.post("/requests/{request_id}/confirm", status_code=201, summary="Save reviewed AI plan")
async def confirm_plan(request_id: int, data: AIConfirm, user: User = Depends(current_user), db: Session = Depends(get_db)):
    request = db.scalar(select(AIRequest).where(AIRequest.id == request_id).with_for_update())
    if not request or request.user_id != user.id:
        raise HTTPException(404, "AI request not found")
    project = project_access(db, request.project_id, user)
    if request.confirmed_at:
        raise HTTPException(409, "Plan already confirmed")
    column = db.scalar(select(KanbanColumn).where(KanbanColumn.project_id == project.id).order_by(KanbanColumn.position))
    if not column:
        raise HTTPException(409, "Project has no Kanban column")
    lock_columns(db, [column.id])
    position = len(siblings(db, column.id))
    ids = []
    for item in data.plan.tasks:
        task = Task(column_id=column.id, title=item.title, description=item.description, priority=item.priority, estimated_hours=item.estimated_hours, actual_hours=0, reporter_id=user.id, position=position, estimate_source="AI")
        db.add(task)
        db.flush()
        snapshot(db, task, user.id)
        ids.append(task.id)
        db.add(Activity(project_id=project.id, actor_id=user.id, action="task.created", entity="task", entity_id=task.id, detail={"source": "AI"}))
        position += 1
        for skill_name in {name.strip().casefold() for name in item.required_skills if name.strip()}:
            db.add(TaskRequirement(task_id=task.id, name=skill_name))
        for child in item.subtasks:
            db.add(Subtask(task_id=task.id, title=child.title, description=child.description, estimated_hours=child.estimated_hours, actual_hours=0))
    request.reviewed_plan = data.plan.model_dump(mode="json")
    request.confirmed_at = utcnow()
    db.commit()
    for task_id in ids:
        await hub.publish(project.id, "task.created", project.workspace_id, task_id, user.id, {"source": "AI"})
    return {"task_ids": ids}
