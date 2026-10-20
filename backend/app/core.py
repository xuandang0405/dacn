from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://smart_task:smart_task@localhost:3306/smart_task_manager?charset=utf8mb4"
    jwt_secret: str = Field(min_length=32)
    frontend_origin: str = "http://localhost:3000"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    document_storage_dir: str = "data/project_documents"
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @field_validator("jwt_secret")
    @classmethod
    def reject_example(cls, value: str) -> str:
        if value.startswith("replace-with-"):
            raise ValueError("Set JWT_SECRET to a random value")
        return value

settings = Settings()
