"""Create an isolated database and apply the real Alembic migration chain."""
import os
from pathlib import Path
import secrets
import subprocess
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core import settings

name='dacn_verify_20261013_'+secrets.token_hex(3)
url=make_url(settings.database_url)
engine=create_engine(url.set(database=None))
with engine.connect() as db:
    db.execute(text(f'CREATE DATABASE `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'))
Path('.integration').mkdir(exist_ok=True)
Path('.integration/database.txt').write_text(name)
env=os.environ.copy();env['DATABASE_URL']=url.set(database=name).render_as_string(hide_password=False)
subprocess.run([sys.executable,'-m','alembic','upgrade','head'],env=env,check=True)
print(name)
