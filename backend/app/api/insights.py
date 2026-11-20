from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.db import get_db
from app.models import (
    Activity,
    KanbanColumn,
    MemberSkill,
    Project,
    Skill,
    Task,
    User,
    WorkspaceMember,
)
from app.schemas import SkillIn, SkillLevelIn
from app.security import current_user, project_access, workspace_access
from app.services.analytics import project_analytics, workload

router = APIRouter(tags=["Insights and skills"])


@router.get("/workspaces/{workspace_id}/skills", summary="Skill matrix")
def skills(
    workspace_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    workspace_access(db, workspace_id, user)
    cac_ky_nang = db.scalars(
        select(Skill).where(Skill.workspace_id == workspace_id).order_by(Skill.name)
    ).all()
    cac_muc_ky_nang = db.execute(
        select(MemberSkill, Skill).join(Skill).where(Skill.workspace_id == workspace_id)
    ).all()
    danh_sach_ky_nang = []
    for ky_nang in cac_ky_nang:
        danh_sach_ky_nang.append({"id": ky_nang.id, "name": ky_nang.name})
    danh_sach_muc = []
    for muc_ky_nang, ky_nang in cac_muc_ky_nang:
        danh_sach_muc.append(
            {
                "skill_id": ky_nang.id,
                "user_id": muc_ky_nang.user_id,
                "level": muc_ky_nang.level,
            }
        )
    return {"skills": danh_sach_ky_nang, "levels": danh_sach_muc}


@router.post("/workspaces/{workspace_id}/skills", status_code=201, summary="Add skill")
def add_skill(
    workspace_id: int,
    data: SkillIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    workspace_access(db, workspace_id, user, {"OWNER", "ADMIN"})
    if db.scalar(
        select(Skill).where(
            Skill.workspace_id == workspace_id, Skill.name == data.name.strip()
        )
    ):
        raise HTTPException(409, "Skill already exists")
    ky_nang = Skill(workspace_id=workspace_id, name=data.name.strip())
    db.add(ky_nang)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Skill already exists")
    db.refresh(ky_nang)
    return {"id": ky_nang.id, "name": ky_nang.name}


@router.put("/skills/{skill_id}/members", summary="Set member skill level")
def set_skill_level(
    skill_id: int,
    data: SkillLevelIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    ky_nang = db.get(Skill, skill_id)
    if not ky_nang:
        raise HTTPException(404, "Skill not found")
    workspace_access(db, ky_nang.workspace_id, user, {"OWNER", "ADMIN"})
    if not db.scalar(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == ky_nang.workspace_id,
            WorkspaceMember.user_id == data.user_id,
            WorkspaceMember.status == "ACTIVE",
        )
    ):
        raise HTTPException(422, "User is not a member")
    muc_ky_nang = db.scalar(
        select(MemberSkill).where(
            MemberSkill.skill_id == skill_id, MemberSkill.user_id == data.user_id
        )
    )
    if data.level == 0:
        if muc_ky_nang:
            db.delete(muc_ky_nang)
    elif muc_ky_nang:
        muc_ky_nang.level = data.level
    else:
        db.add(MemberSkill(skill_id=skill_id, user_id=data.user_id, level=data.level))
    db.commit()
    return {"skill_id": skill_id, "user_id": data.user_id, "level": data.level}


@router.get("/workspaces/{workspace_id}/workload", summary="Member workload")
def get_workload(
    workspace_id: int,
    start: date | None = None,
    end: date | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    workspace_access(db, workspace_id, user)
    start = start or (date.today() - timedelta(days=date.today().weekday()))
    end = end or (start + timedelta(days=6))
    try:
        return {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "members": workload(db, workspace_id, start, end),
        }
    except ValueError as loi:
        raise HTTPException(422, str(loi))


@router.get("/projects/{project_id}/analytics", summary="Project analytics and MAPE")
def analytics(
    project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    project_access(db, project_id, user)
    return project_analytics(db, project_id)


@router.get("/workspaces/{workspace_id}/dashboard", summary="Workspace dashboard")
def dashboard(
    workspace_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    thanh_vien = workspace_access(db, workspace_id, user)
    truy_van_du_an = select(Project).where(Project.workspace_id == workspace_id)
    if thanh_vien.role == "MEMBER":
        from app.models import ProjectMember

        truy_van_du_an = truy_van_du_an.join(ProjectMember).where(
            ProjectMember.user_id == user.id
        )
    cac_du_an = db.scalars(truy_van_du_an).all()
    cac_thong_ke = []
    ma_du_an = []
    for du_an in cac_du_an:
        cac_thong_ke.append(project_analytics(db, du_an.id))
        ma_du_an.append(du_an.id)
    truy_van_hoat_dong = select(Activity).where(Activity.workspace_id == workspace_id)
    if thanh_vien.role == "MEMBER":
        from sqlalchemy import or_

        truy_van_hoat_dong = truy_van_hoat_dong.where(
            or_(Activity.project_id.in_(ma_du_an), Activity.project_id.is_(None))
        )
    hoat_dong_gan_day = db.scalars(
        truy_van_hoat_dong.order_by(Activity.created_at.desc()).limit(12)
    ).all()
    task_chua_xong = []
    if ma_du_an:
        task_chua_xong = db.execute(
            select(Task, KanbanColumn)
            .join(
                KanbanColumn,
                Task.column_id == KanbanColumn.id,
            )
            .where(Task.project_id.in_(ma_du_an), KanbanColumn.is_done.is_(False))
        ).all()

    # Tổng hợp từng con số riêng để dễ đối chiếu với các thẻ trên Dashboard.
    so_du_an_dang_lam = 0
    for du_an in cac_du_an:
        if du_an.status == "ACTIVE":
            so_du_an_dang_lam += 1
    tong_task = 0
    so_task_hoan_thanh = 0
    so_task_qua_han = 0
    for thong_ke in cac_thong_ke:
        tong_task += thong_ke["total_tasks"]
        so_task_hoan_thanh += thong_ke["completed_tasks"]
        so_task_qua_han += thong_ke["overdue_tasks"]

    so_task_dang_lam = 0
    task_sap_den_han = []
    for task, cot in task_chua_xong:
        if cot.name == "IN_PROGRESS":
            so_task_dang_lam += 1
        if task.due_date and date.today() <= task.due_date <= date.today() + timedelta(
            days=7
        ):
            task_sap_den_han.append(task)
    task_sap_den_han.sort(key=lambda task: task.due_date)
    cac_han_gan = []
    for task in task_sap_den_han[:8]:
        cac_han_gan.append(
            {
                "task_id": task.id,
                "project_id": task.project_id,
                "title": task.title,
                "due_date": task.due_date.isoformat(),
            }
        )
    cac_hoat_dong = []
    for hoat_dong in hoat_dong_gan_day:
        cac_hoat_dong.append(
            {
                "id": hoat_dong.id,
                "action": hoat_dong.action,
                "entity": hoat_dong.entity,
                "entity_id": hoat_dong.entity_id,
                "actor_id": hoat_dong.actor_id,
                "created_at": hoat_dong.created_at.isoformat(),
            }
        )
    return {
        "total_projects": len(cac_du_an),
        "active_projects": so_du_an_dang_lam,
        "total_tasks": tong_task,
        "completed_tasks": so_task_hoan_thanh,
        "in_progress_tasks": so_task_dang_lam,
        "overdue_tasks": so_task_qua_han,
        "upcoming_deadlines": cac_han_gan,
        "recent_activities": cac_hoat_dong,
        "workload": workload(
            db, workspace_id, date.today(), date.today() + timedelta(days=6)
        ),
    }
