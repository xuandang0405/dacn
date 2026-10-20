"""Seed synthetic demo records after migration; repeat without overwriting data."""
import os
from datetime import date, timedelta
from sqlalchemy import select
from app.db import SessionLocal
from app.models import Comment, KanbanColumn, MemberSkill, Notification, Project, ProjectMember, Skill, Subtask, Task, User, Workspace, WorkspaceMember
from app.security import hash_password
from app.services.task_transactions import snapshot


def seed_demo():
    password = os.getenv("DEMO_PASSWORD")
    if not password or len(password) < 10:
        raise SystemExit("Set DEMO_PASSWORD to at least 10 characters before seeding")
    names = [
        ("owner@demo.example.com", "Nguyễn Minh Anh"),
        ("admin@demo.example.com", "Trần Gia Huy"),
        ("lan@demo.example.com", "Phạm Ngọc Lan"),
        ("long@demo.example.com", "Lê Hải Long"),
        ("mai@demo.example.com", "Vũ Thảo Mai"),
        ("binh@demo.example.com", "Đỗ Quốc Bình"),
        ("owner2@demo.example.com", "Nguyễn Khánh Linh"),
        ("admin2@demo.example.com", "Trần Minh Quân"),
        ("an@demo.example.com", "Lê Bình An"),
        ("chi@demo.example.com", "Phạm Thảo Chi"),
    ]
    skill_names = ["React", "Next.js", "Python", "FastAPI", "MySQL", "UI/UX", "DevOps", "Machine Learning", "TypeScript", "Docker", "Kiểm thử API", "Phân tích nghiệp vụ"]
    created = 0
    with SessionLocal() as db:
        users = []
        digest = hash_password(password)
        for email, name in names:
            user = db.scalar(select(User).where(User.email == email))
            if not user:
                user = User(email=email, username=email.split("@")[0], name=name, password_hash=digest)
                db.add(user)
                db.flush()
            users.append(user)
        for workspace_name, owner_index in [("Demo Workspace", 0), ("Demo Product Team", 6)]:
            if db.scalar(select(Workspace).where(Workspace.name == workspace_name)):
                continue
            workspace = Workspace(name=workspace_name, description="Dữ liệu tổng hợp cho kiểm thử và demo", owner_id=users[owner_index].id)
            db.add(workspace)
            db.flush()
            for i, user in enumerate(users):
                role = "OWNER" if i == owner_index else "ADMIN" if i in (1, 7) else "MEMBER"
                db.add(WorkspaceMember(workspace_id=workspace.id, user_id=user.id, role=role, capacity_hours=40))
            skills = []
            for name in skill_names:
                skill = Skill(workspace_id=workspace.id, name=name)
                db.add(skill)
                db.flush()
                skills.append(skill)
            for i, user in enumerate(users):
                for j, skill in enumerate(skills):
                    if (i + j) % 3 != 0:
                        db.add(MemberSkill(skill_id=skill.id, user_id=user.id, level=1 + (i + j) % 5))
            for pidx, pname in enumerate(["Smart Task Manager", "Ứng dụng đặt lịch"]):
                project = Project(workspace_id=workspace.id, name=pname, description="Dự án mẫu cho buổi trình diễn", status="ACTIVE", created_by=users[owner_index].id)
                db.add(project)
                db.flush()
                for user in users:
                    db.add(ProjectMember(project_id=project.id, user_id=user.id))
                columns = []
                for position, name in enumerate(["BACKLOG", "TODO", "IN_PROGRESS", "REVIEW", "DONE"]):
                    column = KanbanColumn(project_id=project.id, name=name, position=position, is_done=name == "DONE")
                    db.add(column)
                    db.flush()
                    columns.append(column)
                for i in range(10):
                    task = Task(column_id=columns[(i + pidx) % 5].id, title=["Thiết kế cơ sở dữ liệu", "Xây dựng API", "Kiểm thử phân quyền", "Tạo giao diện", "Tối ưu dashboard"][i % 5] + f" #{i+1}", description="Dữ liệu demo tổng hợp; ước lượng minh họa không phải kết quả Gemini thật.", priority=["LOW", "MEDIUM", "HIGH", "URGENT"][i % 4], assignee_id=users[2 + i % 4].id, reporter_id=users[owner_index].id, estimated_hours=4 + i % 5, actual_hours=3 + i % 6 if (i + pidx) % 5 == 4 else 0, estimate_source="AI" if i % 2 else "HUMAN", due_date=date.today() + timedelta(days=i - 3), position=i // 5)
                    db.add(task)
                    db.flush()
                    snapshot(db, task, users[owner_index].id)
                    if i % 3 == 0:
                        db.add(Subtask(task_id=task.id, title="Kiểm tra và review", estimated_hours=1, actual_hours=0, assignee_id=task.assignee_id))
                    if i == 0:
                        db.add(Comment(task_id=task.id, author_id=users[1].id, content="Bắt đầu triển khai task này nhé."))
                        db.add(Notification(user_id=task.assignee_id, workspace_id=workspace.id, kind="task_assigned", message=f"Assigned: {task.title}", entity_id=task.id))
            created += 1
        db.commit()
    print(f"Seed complete: {created} new demo workspace(s); existing records and passwords preserved")


if __name__ in {"__main__", "<run_path>"}:
    seed_demo()
