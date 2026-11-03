from datetime import datetime, timezone
import secrets
from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, UniqueConstraint, select, func
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, column_property

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

class Base(DeclarativeBase):
    pass

class Timestamps:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

class User(Base, Timestamps):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

class RefreshToken(Base, Timestamps):
    __tablename__ = "refresh_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime)

class PasswordReset(Base, Timestamps):
    __tablename__ = "password_resets"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)

class Workspace(Base, Timestamps):
    __tablename__ = "workspaces"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

class WorkspaceMember(Base, Timestamps):
    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16), default="MEMBER")
    status: Mapped[str] = mapped_column(String(16), default="ACTIVE")
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    capacity_hours: Mapped[int] = mapped_column(Integer, default=40)

class Project(Base, Timestamps):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="PLANNING")
    start_date: Mapped[datetime | None] = mapped_column(Date)
    end_date: Mapped[datetime | None] = mapped_column(Date)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))

class ProjectMember(Base, Timestamps):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

class KanbanColumn(Base, Timestamps):
    __tablename__ = "kanban_columns"
    __table_args__ = (UniqueConstraint("project_id", "position"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    position: Mapped[int] = mapped_column(Integer)
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)

class Task(Base, Timestamps):
    __tablename__ = "tasks"
    __table_args__ = (Index("ix_tasks_column_order", "column_id", "position"), CheckConstraint("estimated_hours >= 0"), CheckConstraint("actual_hours >= 0"))
    id: Mapped[int] = mapped_column(primary_key=True)
    column_id: Mapped[int] = mapped_column(ForeignKey("kanban_columns.id", ondelete="CASCADE"), index=True)
    project_id = column_property(select(KanbanColumn.project_id).where(KanbanColumn.id == column_id).correlate_except(KanbanColumn).scalar_subquery())
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str] = mapped_column(Text, default="")
    priority: Mapped[str] = mapped_column(String(16), default="MEDIUM", index=True)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    estimated_hours: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    actual_hours: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    estimate_source: Mapped[str] = mapped_column(String(16), default="HUMAN")
    start_date: Mapped[datetime | None] = mapped_column(Date)
    due_date: Mapped[datetime | None] = mapped_column(Date, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)

class TaskRequirement(Base, Timestamps):
    __tablename__ = "task_requirements"
    __table_args__ = (UniqueConstraint("task_id", "name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))

class Subtask(Base, Timestamps):
    __tablename__ = "subtasks"
    __table_args__ = (CheckConstraint("estimated_hours >= 0"), CheckConstraint("actual_hours >= 0"))
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(240))
    description: Mapped[str] = mapped_column(Text, default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    estimated_hours: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    actual_hours: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    due_date: Mapped[datetime | None] = mapped_column(Date)

class Skill(Base, Timestamps):
    __tablename__ = "skills"
    __table_args__ = (UniqueConstraint("workspace_id", "name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100))

class MemberSkill(Base, Timestamps):
    __tablename__ = "member_skills"
    __table_args__ = (UniqueConstraint("skill_id", "user_id"), CheckConstraint("level BETWEEN 1 AND 5"))
    id: Mapped[int] = mapped_column(primary_key=True)
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    level: Mapped[int] = mapped_column(Integer)

class Comment(Base, Timestamps):
    __tablename__ = "comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    content: Mapped[str] = mapped_column(Text)

class Mention(Base, Timestamps):
    __tablename__ = "mentions"
    __table_args__ = (UniqueConstraint("comment_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    comment_id: Mapped[int] = mapped_column(ForeignKey("comments.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

class Notification(Base, Timestamps):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    workspace_id: Mapped[int | None] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(String(500))
    entity_id: Mapped[int | None] = mapped_column(Integer)
    read_at: Mapped[datetime | None] = mapped_column(DateTime)

class Activity(Base, Timestamps):
    __tablename__ = "activities"
    __table_args__ = (CheckConstraint("(project_id IS NULL AND workspace_scope_id IS NOT NULL) OR (project_id IS NOT NULL AND workspace_scope_id IS NULL)", name="ck_activity_one_scope"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_scope_id: Mapped[int | None] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    workspace_id = column_property(func.coalesce(workspace_scope_id, select(Project.workspace_id).where(Project.id == project_id).correlate_except(Project).scalar_subquery()))
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(60))
    entity: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int] = mapped_column(Integer)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)

class AIRequest(Base, Timestamps):
    __tablename__ = "ai_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    story: Mapped[str] = mapped_column(Text)
    response: Mapped[dict] = mapped_column(JSON)
    reviewed_plan: Mapped[dict | None] = mapped_column(JSON)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime)

class ProjectDocument(Base, Timestamps):
    __tablename__ = "project_documents"
    __table_args__ = (Index("ix_project_documents_project_created", "project_id", "created_at"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    filename: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(100), unique=True)
    sha256: Mapped[str] = mapped_column(String(64))
    extracted_text: Mapped[str | None] = mapped_column(Text().with_variant(LONGTEXT, "mysql"))

class WorkspaceInvitation(Base, Timestamps):
    __tablename__ = "workspace_invitations"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    invited_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    role: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="PENDING")
    nonce: Mapped[str] = mapped_column(String(32), default=lambda: secrets.token_hex(16))
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime)

class TaskEstimateVersion(Base):
    __tablename__ = "task_estimate_versions"
    __table_args__ = (UniqueConstraint("task_id", "task_version"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    task_version: Mapped[int] = mapped_column(Integer)
    estimated_hours: Mapped[float] = mapped_column(Numeric(8, 2))
    source: Mapped[str] = mapped_column(String(16))
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
