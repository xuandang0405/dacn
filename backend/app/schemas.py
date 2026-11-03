from datetime import date, datetime
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

PositiveId = Annotated[int, Field(strict=True, ge=1)]

def patch_schema(schema):
    for name in ("title", "description", "priority", "estimated_hours", "actual_hours"):
        prop = schema["properties"][name]
        options = [item for item in prop.pop("anyOf", []) if item.get("type") != "null"]
        if len(options) == 1:
            prop.update(options[0])
        prop.pop("default", None)

class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    @field_validator("name", "title", "content", "story", check_fields=False, mode="before")
    @classmethod
    def trim_text(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def ordered_dates(self):
        start = getattr(self, "start_date", None)
        end = getattr(self, "due_date", None) or getattr(self, "end_date", None)
        if start and end and end < start:
            raise ValueError("End date must not precede start date")
        return self

class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)

class UserOut(ORM):
    id: int
    email: EmailStr
    username: str
    name: str
    active: bool

class RegisterIn(InputModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z][a-zA-Z0-9_]*$")
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=10, max_length=128)

class LoginIn(InputModel):
    email: EmailStr
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class PasswordChange(InputModel):
    old_password: str
    new_password: str = Field(min_length=10, max_length=128)

class ForgotIn(InputModel):
    email: EmailStr

class ResetIn(InputModel):
    token: str
    new_password: str = Field(min_length=10, max_length=128)

class WorkspaceIn(InputModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = ""

class WorkspaceOut(ORM):
    id: int
    name: str
    description: str
    owner_id: int
    created_at: datetime

class MemberOut(BaseModel):
    user_id: int
    name: str
    email: str
    username: str
    role: str
    capacity_hours: int

class InviteIn(InputModel):
    email: EmailStr
    role: Literal["ADMIN", "MEMBER"] = "MEMBER"

class RoleIn(InputModel):
    role: Literal["ADMIN", "MEMBER"]

class ProjectIn(InputModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = ""
    status: Literal["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] = "PLANNING"
    start_date: date | None = None
    end_date: date | None = None

class ProjectOut(ORM):
    id: int
    workspace_id: int
    name: str
    description: str
    status: str
    start_date: date | None
    end_date: date | None
    created_at: datetime

class ColumnOut(ORM):
    id: int
    project_id: int
    name: str
    position: int
    is_done: bool

class ColumnIn(InputModel):
    name: str = Field(min_length=1, max_length=80)
    is_done: bool = False

class TaskIn(InputModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=240)
    description: str = ""
    priority: Literal["LOW", "MEDIUM", "HIGH", "URGENT"] = "MEDIUM"
    assignee_id: PositiveId | None = None
    estimated_hours: float = Field(default=0, ge=0, le=99999)
    actual_hours: float = Field(default=0, ge=0, le=99999)
    start_date: date | None = None
    due_date: date | None = None
    column_id: PositiveId | None = None

class TaskPatch(InputModel):
    model_config = ConfigDict(extra="forbid", json_schema_extra=patch_schema)
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = None
    priority: Literal["LOW", "MEDIUM", "HIGH", "URGENT"] | None = None
    assignee_id: PositiveId | None = None
    estimated_hours: float | None = Field(default=None, ge=0, le=99999)
    actual_hours: float | None = Field(default=None, ge=0, le=99999)
    start_date: date | None = None
    due_date: date | None = None
    version: PositiveId

    @field_validator("title", "description", "priority", "estimated_hours", "actual_hours", mode="before")
    @classmethod
    def reject_explicit_null(cls, value):
        if value is None:
            raise ValueError("This field cannot be null; omit it to keep the current value")
        return value

class TaskOut(ORM):
    id: int
    project_id: int
    column_id: int
    title: str
    description: str
    priority: str
    assignee_id: int | None
    reporter_id: int
    estimated_hours: float
    actual_hours: float
    estimate_source: str
    start_date: date | None
    due_date: date | None
    position: int
    version: int
    created_at: datetime
    updated_at: datetime

class TaskMove(InputModel):
    column_id: PositiveId
    position: int = Field(strict=True, ge=0)
    version: PositiveId

class SubtaskIn(InputModel):
    title: str = Field(min_length=1, max_length=240)
    description: str = ""
    done: bool = False
    assignee_id: PositiveId | None = None
    estimated_hours: float = Field(default=0, ge=0, le=99999)
    actual_hours: float = Field(default=0, ge=0, le=99999)
    due_date: date | None = None

class SubtaskOut(SubtaskIn, ORM):
    id: int
    task_id: int

class SkillIn(InputModel):
    name: str = Field(min_length=1, max_length=100)

class SkillLevelIn(InputModel):
    user_id: PositiveId
    level: int = Field(strict=True, ge=1, le=5)

class CommentIn(InputModel):
    content: str = Field(min_length=1, max_length=5000)

class CommentOut(ORM):
    id: int
    task_id: int
    author_id: int
    content: str
    created_at: datetime

class AISubtask(InputModel):
    title: str = Field(min_length=1, max_length=240)
    description: str = ""
    estimated_hours: float = Field(ge=0, le=1000)

class AITask(InputModel):
    title: str = Field(min_length=1, max_length=240)
    description: str
    estimated_hours: float = Field(ge=0, le=1000)
    priority: Literal["LOW", "MEDIUM", "HIGH", "URGENT"]
    required_skills: list[str] = Field(max_length=12)
    subtasks: list[AISubtask] = Field(max_length=15)

    @field_validator("required_skills")
    @classmethod
    def normalize_skills(cls, values: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(name.strip() for name in values if name.strip()))
        if any(len(name) > 100 for name in cleaned):
            raise ValueError("Skill name is too long")
        return cleaned

class AIPlan(InputModel):
    summary: str
    tasks: list[AITask] = Field(min_length=1, max_length=20)

class AIStory(InputModel):
    project_id: PositiveId
    story: str = Field(min_length=10, max_length=4000)
    language: Literal["vi", "en"] = "vi"

class AIConfirm(InputModel):
    plan: AIPlan

class AIProjectQuery(InputModel):
    mode: Literal["analyze", "ask"]
    question: str = Field(default="", max_length=2000)
    language: Literal["vi", "en"] = "vi"

class ProjectDocumentOut(ORM):
    id: int
    project_id: int
    filename: str
    media_type: str
    size_bytes: int
    uploaded_by: int
    created_at: datetime
