from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from app.core import settings

pool_options = {} if settings.database_url.startswith("sqlite") else {
    "pool_size": settings.db_pool_size,
    "max_overflow": settings.db_max_overflow,
    "pool_timeout": settings.db_pool_timeout,
}
engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=1800, **pool_options)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

def get_db():
    with SessionLocal() as db:
        yield db

