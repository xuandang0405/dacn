from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from app.core import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

def get_db():
    with SessionLocal() as db:
        yield db

