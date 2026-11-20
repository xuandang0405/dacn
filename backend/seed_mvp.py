"""Create a separate, repeatable MVP dataset without changing existing workspaces.

Run inside the backend environment after Alembic migration. Existing sessions are
left intact; choose another --session value to rehearse again with fresh data.
"""
import argparse
import json
import os
from datetime import date, timedelta

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import (
    KanbanColumn, MemberSkill, Project, ProjectMember, Skill, Subtask, Task,
    TaskEstimateVersion, TaskRequirement, User, Workspace, WorkspaceMember,
)
from app.security import hash_password, verify_password
from app.services.analytics import project_analytics
from app.services.task_transactions import snapshot


WORKSPACE = "MVP Nhóm 3C - 06-11-2026"
PROJECT = "Smart Task Manager - Demo MVP"
MARKER = "mvp-demo-3c-v1"
ACCOUNTS = [
    ("demo.dang@stm.example.com", "mvp_dang", "Nguyễn Xuân Đăng", "OWNER"),
    ("demo.duong@stm.example.com", "mvp_duong", "Phạm Minh Dương", "ADMIN"),
    ("demo.dat@stm.example.com", "mvp_dat", "Phạm Tấn Đạt", "MEMBER"),
    ("demo.khoa@stm.example.com", "mvp_khoa", "Trần Đăng Khoa", "MEMBER"),
]
TASKS = [
    ("BACKLOG", "Đối chiếu yêu cầu demo với các Use Case", 3, 0),
    ("BACKLOG", "Rà soát nhãn giao diện tiếng Anh", 4, 0),
    ("BACKLOG", "Chuẩn bị ca kiểm thử mất mạng", 4, 0),
    ("BACKLOG", "Hoàn thiện hướng dẫn triển khai", 3, 0),
    ("TODO", "Kiểm tra bộ lọc người thực hiện", 4, 0),
    ("TODO", "Kiểm tra tìm kiếm công việc", 3, 0),
    ("TODO", "Rà soát giao diện trên điện thoại", 4, 0),
    ("TODO", "Chuẩn bị video dự phòng", 2, 0),
    ("IN_PROGRESS", "Tích hợp API thống kê tiến độ", 6, 2),
    ("IN_PROGRESS", "Kiểm tra luồng phân công công việc", 4, 1),
    ("IN_PROGRESS", "Kiểm tra tải tài liệu theo dự án", 5, 2),
    ("IN_PROGRESS", "Bổ sung nội dung báo cáo kiểm thử", 4, 1),
    ("REVIEW", "Rà soát phân quyền giao diện MEMBER", 4, 3),
    ("REVIEW", "Đối chiếu lịch sử ước lượng", 3, 2),
    ("REVIEW", "Kiểm tra thông báo cá nhân", 4, 3),
    ("REVIEW", "Kiểm tra biểu đồ khối lượng công việc", 4, 3),
    ("DONE", "Đăng ký và đăng nhập bằng JWT", 4, 4),
    ("DONE", "Làm mới phiên đăng nhập", 5, 5),
    ("DONE", "Quản lý workspace và thành viên", 6, 6),
    ("DONE", "Lưu và đọc bảng Kanban từ MySQL", 5, 5),
]


def prepare(session_name):
    password = os.environ.get("MVP_DEMO_PASSWORD", "STM-MVP-Demo-2026!")
    if len(password) < 10:
        raise SystemExit("MVP_DEMO_PASSWORD must contain at least 10 characters")
    with SessionLocal.begin() as db:
        users = []
        for email, username, name, role in ACCOUNTS:
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                if db.scalar(select(User.id).where(User.username == username)):
                    raise SystemExit(f"Reserved demo username already exists: {username}")
                user = User(email=email, username=username, name=name,
                            password_hash=hash_password(password))
                db.add(user)
                db.flush()
            elif not user.active or not verify_password(password, user.password_hash):
                raise SystemExit(f"Demo account has another password or is inactive: {email}. No password was overwritten.")
            users.append(user)
        workspace = db.scalar(select(Workspace).where(Workspace.name == session_name,
                                                       Workspace.owner_id == users[0].id))
        created = workspace is None
        if workspace is not None and MARKER not in workspace.description:
            raise SystemExit("Workspace name is already in use; choose another --session")
        if created:
            workspace = Workspace(name=session_name, owner_id=users[0].id,
                description=f"[{MARKER}] Dữ liệu mẫu lưu trong MySQL cho diễn tập MVP. Các nhiệm vụ, số giờ và mức kỹ năng là tình huống giả định, không phải nhật ký đóng góp thực tế.")
            db.add(workspace)
            db.flush()
            for user, account in zip(users, ACCOUNTS):
                db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id,
                                       role=account[3], capacity_hours=40))
            project = Project(workspace_id=workspace.id, name=PROJECT, status="ACTIVE",
                description="Quản lý công việc nhóm bằng FastAPI, MySQL và Next.js; phân công, Kanban, realtime và thống kê.",
                start_date=date(2026, 11, 2), end_date=date(2026, 11, 23),
                created_by=users[0].id)
            db.add(project)
            db.flush()
            for user in users:
                db.add(ProjectMember(project_id=project.id, user_id=user.id))
            columns = {}
            for i, name in enumerate(["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE"]):
                col = KanbanColumn(project_id=project.id, name=name, position=i,
                                   is_done=name == "DONE")
                db.add(col)
                db.flush()
                columns[name] = col
            skills = ["Python", "FastAPI", "MySQL", "React", "Next.js", "TypeScript",
                      "Docker", "Kiểm thử API", "Phân tích nghiệp vụ", "UI/UX", "Git", "WebSocket"]
            for i, name in enumerate(skills):
                skill = Skill(workspace_id=workspace.id, name=name)
                db.add(skill)
                db.flush()
                for j, user in enumerate(users):
                    db.add(MemberSkill(skill_id=skill.id, user_id=user.id, level=2 + (i + j) % 4))
            for i, (state, title, estimate, actual) in enumerate(TASKS):
                task = Task(column_id=columns[state].id, title=title,
                    description="Tình huống mẫu cho buổi demo; dữ liệu được lưu và đọc từ CSDL thật.",
                    priority=["MEDIUM", "HIGH", "MEDIUM", "LOW"][i % 4],
                    assignee_id=users[i % 4].id, reporter_id=users[0].id,
                    estimated_hours=estimate, actual_hours=actual, estimate_source="HUMAN",
                    start_date=date(2026, 11, 2), due_date=date(2026, 11, 9) + timedelta(days=i % 5),
                    position=i % 4)
                db.add(task)
                db.flush()
                snapshot(db, task, users[0].id)
                db.add(TaskRequirement(task_id=task.id, name=skills[i % len(skills)]))
                if i < 8:
                    db.add(Subtask(task_id=task.id, title="Chuẩn bị và kiểm tra kết quả",
                        assignee_id=task.assignee_id, estimated_hours=1, actual_hours=0))
            db.flush()
        else:
            project = db.scalar(select(Project).where(Project.workspace_id == workspace.id,
                                                       Project.name == PROJECT))
            if project is None:
                raise SystemExit("Demo workspace was modified. Choose a new --session; existing data was preserved.")
        analytics = project_analytics(db, project.id)
        skill_count = db.scalar(select(func.count()).select_from(Skill).where(Skill.workspace_id == workspace.id))
        snapshot_count = db.scalar(select(func.count()).select_from(TaskEstimateVersion)
            .join(Task, Task.id == TaskEstimateVersion.task_id).where(Task.project_id == project.id))
        result = {"created": created, "workspace": session_name, "workspace_id": workspace.id,
                  "project": project.name, "project_id": project.id,
                  "users": [{"email": a[0], "name": a[2], "role": a[3]} for a in ACCOUNTS],
                  "skills": skill_count, "snapshots": snapshot_count, "analytics": analytics,
                  "existing_data": "preserved", "password_source": "MVP_DEMO_PASSWORD or public demo default"}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", default=WORKSPACE, help="New name creates a fresh rehearsal without deleting any data")
    parser.add_argument("--rehearsal", action="store_true", help="Use a separate rehearsal workspace")
    args = parser.parse_args()
    name = args.session.strip() + (" - Diễn tập" if args.rehearsal else "")
    if not 1 <= len(name) <= 160:
        parser.error("Session name must contain 1-160 characters")
    prepare(name)
