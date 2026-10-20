from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Activity, KanbanColumn, MemberSkill, Project, Skill, Task, User, WorkspaceMember
from app.schemas import SkillIn, SkillLevelIn
from app.security import current_user, project_access, workspace_access
from app.services.analytics import project_analytics, workload

router = APIRouter(tags=["Insights and skills"])

@router.get("/workspaces/{workspace_id}/skills", summary="Skill matrix")
def skills(workspace_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace_access(db, workspace_id, user)
    rows = db.scalars(select(Skill).where(Skill.workspace_id == workspace_id).order_by(Skill.name)).all()
    levels = db.execute(select(MemberSkill, Skill).join(Skill).where(Skill.workspace_id == workspace_id)).all()
    return {"skills": [{"id": s.id, "name": s.name} for s in rows], "levels": [{"skill_id": s.id, "user_id": m.user_id, "level": m.level} for m, s in levels]}

@router.post("/workspaces/{workspace_id}/skills", status_code=201, summary="Add skill")
def add_skill(workspace_id: int, data: SkillIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace_access(db, workspace_id, user, {"OWNER", "ADMIN"})
    if db.scalar(select(Skill).where(Skill.workspace_id == workspace_id, Skill.name == data.name.strip())):
        raise HTTPException(409, "Skill already exists")
    s = Skill(workspace_id=workspace_id, name=data.name.strip())
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name}

@router.put("/skills/{skill_id}/members", summary="Set member skill level")
def set_skill_level(skill_id: int, data: SkillLevelIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    skill = db.get(Skill, skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    workspace_access(db, skill.workspace_id, user, {"OWNER", "ADMIN"})
    if not db.scalar(select(WorkspaceMember).where(WorkspaceMember.workspace_id == skill.workspace_id, WorkspaceMember.user_id == data.user_id, WorkspaceMember.status == "ACTIVE")):
        raise HTTPException(422, "User is not a member")
    row = db.scalar(select(MemberSkill).where(MemberSkill.skill_id == skill_id, MemberSkill.user_id == data.user_id))
    if row:
        row.level = data.level
    else:
        db.add(MemberSkill(skill_id=skill_id, user_id=data.user_id, level=data.level))
    db.commit()
    return {"skill_id": skill_id, "user_id": data.user_id, "level": data.level}

@router.get("/workspaces/{workspace_id}/workload", summary="Member workload")
def get_workload(workspace_id: int, start: date | None = None, end: date | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    workspace_access(db, workspace_id, user)
    start = start or (date.today() - timedelta(days=date.today().weekday()))
    end = end or (start + timedelta(days=6))
    try:
        return {"start": start.isoformat(), "end": end.isoformat(), "members": workload(db, workspace_id, start, end)}
    except ValueError as exc:
        raise HTTPException(422, str(exc))

@router.get("/projects/{project_id}/analytics", summary="Project analytics and MAPE")
def analytics(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    project_access(db, project_id, user)
    return project_analytics(db, project_id)

@router.get("/workspaces/{workspace_id}/dashboard", summary="Workspace dashboard")
def dashboard(workspace_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    member = workspace_access(db, workspace_id, user)
    stmt = select(Project).where(Project.workspace_id == workspace_id)
    if member.role == "MEMBER":
        from app.models import ProjectMember
        stmt = stmt.join(ProjectMember).where(ProjectMember.user_id == user.id)
    projects = db.scalars(stmt).all()
    summaries = [project_analytics(db, p.id) for p in projects]
    project_ids = [p.id for p in projects]
    activity_stmt = select(Activity).where(Activity.workspace_id == workspace_id)
    if member.role == "MEMBER":
        from sqlalchemy import or_
        activity_stmt = activity_stmt.where(or_(Activity.project_id.in_(project_ids), Activity.project_id.is_(None)))
    recent = db.scalars(activity_stmt.order_by(Activity.created_at.desc()).limit(12)).all()
    active_tasks = db.execute(select(Task, KanbanColumn).join(KanbanColumn, Task.column_id == KanbanColumn.id).where(Task.project_id.in_(project_ids), KanbanColumn.is_done.is_(False))).all() if project_ids else []
    upcoming = sorted((t for t, _ in active_tasks if t.due_date and date.today() <= t.due_date <= date.today() + timedelta(days=7)), key=lambda t: t.due_date)[:8]
    return {"total_projects": len(projects), "active_projects": sum(p.status == "ACTIVE" for p in projects), "total_tasks": sum(s["total_tasks"] for s in summaries), "completed_tasks": sum(s["completed_tasks"] for s in summaries), "in_progress_tasks": sum(c.name == "IN_PROGRESS" for _, c in active_tasks), "overdue_tasks": sum(s["overdue_tasks"] for s in summaries), "upcoming_deadlines": [{"task_id": t.id, "project_id": t.project_id, "title": t.title, "due_date": t.due_date.isoformat()} for t in upcoming], "recent_activities": [{"id": a.id, "action": a.action, "entity": a.entity, "entity_id": a.entity_id, "actor_id": a.actor_id, "created_at": a.created_at.isoformat()} for a in recent], "workload": workload(db, workspace_id, date.today(), date.today() + timedelta(days=6))}
