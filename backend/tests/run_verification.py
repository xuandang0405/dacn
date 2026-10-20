"""Reproduce API, migration, locking, HTTP load and WebSocket evidence on a fresh DB."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT));os.chdir(ROOT)
from app.core import settings
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--skip-load',action='store_true');parser.add_argument('--output-dir',type=Path);args=parser.parse_args()
    name='dacn_verify_'+datetime.now(timezone.utc).strftime('%Y%m%d')+'_'+secrets.token_hex(3)
    base=make_url(settings.database_url);engine=create_engine(base.set(database=None))
    with engine.begin() as db:db.execute(text(f'CREATE DATABASE `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'))
    engine.dispose()
    env=os.environ.copy();env['DATABASE_URL']=base.set(database=name).render_as_string(hide_password=False)
    env['TEST_DATABASE_URL']=env['DATABASE_URL'];env['JWT_SECRET']=secrets.token_urlsafe(48);env['GEMINI_API_KEY']=''
    local=ROOT/'.integration';local.mkdir(exist_ok=True);(local/'database.txt').write_text(name)
    output=args.output_dir.resolve() if args.output_dir else ROOT.parent/'docs/testing';output.mkdir(parents=True,exist_ok=True)
    env['VERIFICATION_OUTPUT_DIR']=str(output)
    started=datetime.now(timezone.utc).isoformat()
    subprocess.run([sys.executable,'-m','alembic','upgrade','head'],env=env,check=True)
    result=subprocess.run([sys.executable,'-m','pytest','-q','tests','--junitxml='+str(output/'integration-tests.xml')],env=env)
    junit=ET.parse(output/'integration-tests.xml');cases=junit.findall('.//testcase')
    summary={'started_utc':started,'finished_utc':datetime.now(timezone.utc).isoformat(),'database':'InnoDB','fresh_migration':'0001–0005','tests':len(cases),'failed':len(junit.findall('.//failure')),'errors':len(junit.findall('.//error')),'skipped':len(junit.findall('.//skipped')),'api_fixtures':'real relational database','seed_fixture':'separate ephemeral SQLite','live_gemini':False,'command':'python tests/run_verification.py'}
    (output/'verification-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    if result.returncode:raise SystemExit(result.returncode)
    if not args.skip_load:subprocess.run([sys.executable,'tests/run_innodb_evidence.py'],env=env,check=True)
    print(json.dumps(summary,ensure_ascii=True))


if __name__=='__main__':main()
