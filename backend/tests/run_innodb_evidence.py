"""Real HTTP, independent InnoDB sessions, 100 accounts and two WebSocket clients.
Only runs against an explicitly isolated _verify_ database. No live Gemini calls.
"""
import concurrent.futures as futures
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
import httpx
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session
from websockets.sync.client import connect

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
name = (ROOT/'.integration/database.txt').read_text().strip()
assert '_verify_' in name
from sqlalchemy.engine import make_url
from dotenv import dotenv_values
configured = os.environ.get('TEST_DATABASE_URL') or os.environ.get('DATABASE_URL') or dotenv_values(ROOT/'.env').get('DATABASE_URL')
assert configured, 'Configure DATABASE_URL for a disposable verification database'
url = make_url(configured).set(database=name).render_as_string(hide_password=False)
os.environ['DATABASE_URL'] = url
os.environ['JWT_SECRET'] = 'verification-only-secret-not-for-deployment-20261013'
sys.path.insert(0, str(ROOT))
from app.models import User, Workspace, WorkspaceMember, Project, ProjectMember, KanbanColumn, Task
from app.security import access_token, hash_password
engine = create_engine(url, pool_size=20, max_overflow=20)
prefix = secrets.token_hex(4)
concurrency = int(os.environ.get('LOAD_CONCURRENCY', '100'))
assert 1 <= concurrency <= 100
headers=[]; ids=[]
with Session(engine) as db:
    version=db.execute(text('SELECT VERSION()')).scalar()
    isolation=db.connection().get_isolation_level()
    digest=hash_password('verification-password-only')
    users=[User(email=f'load{prefix}{i}@example.com', username=f'load{prefix}{i}', name=f'Load {i}', password_hash=digest) for i in range(100)]
    db.add_all(users);db.flush()
    ws=Workspace(name='100-account load verification',owner_id=users[0].id);db.add(ws);db.flush()
    p=Project(workspace_id=ws.id,name='InnoDB verification',created_by=users[0].id);db.add(p);db.flush();pid=p.id
    cols=[KanbanColumn(project_id=pid,name=f'C{i}',position=i,is_done=i==4) for i in range(5)]
    db.add_all(cols);db.flush();colids=[c.id for c in cols]
    for i,u in enumerate(users):
        db.add(WorkspaceMember(workspace_id=ws.id,user_id=u.id,role='OWNER' if i==0 else 'MEMBER'))
        db.add(ProjectMember(project_id=pid,user_id=u.id))
        t=Task(column_id=cols[i%5].id,title=f'Task {i}',reporter_id=u.id,assignee_id=u.id,position=i//5,estimated_hours=4,actual_hours=0)
        db.add(t);db.flush();ids.append(t.id)
        headers.append({'Authorization':'Bearer '+access_token(u.id,0)})
    db.commit()
log=(ROOT/'.integration/http-server.log').open('w',encoding='utf-8')
server=subprocess.Popen([sys.executable,'-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8820','--workers','1'],env=os.environ.copy(),stdout=log,stderr=log)
base='http://127.0.0.1:8820'
client=httpx.Client(base_url=base,timeout=20,limits=httpx.Limits(max_connections=150,max_keepalive_connections=150))
evidence={'date':datetime.now(timezone.utc).date().isoformat(),'database_version':version,'engine':'InnoDB','isolation':isolation,'accounts':100,'concurrent_accounts':concurrency,'api_workers':1,'live_gemini':False,'checks':[]}


def check(label, condition, detail):
    evidence['checks'].append({'name':label,'passed':bool(condition),'detail':detail})
    assert condition, (label,detail)


def concurrent_requests(functions):
    barrier=threading.Barrier(len(functions))
    def run(fn):
        barrier.wait(timeout=15);start=time.perf_counter();r=fn();return r,time.perf_counter()-start
    with futures.ThreadPoolExecutor(max_workers=len(functions)) as pool:
        return list(pool.map(run,functions))


try:
    for _ in range(60):
        try:
            if client.get('/health').status_code==200:break
        except httpx.ConnectError:pass
        time.sleep(.25)
    else:raise RuntimeError('Verification API did not start')
    # Holding one task row must not block an update to another task in the project.
    with engine.connect() as held:
        transaction=held.begin();held.execute(text('SELECT id FROM tasks WHERE id=:id FOR UPDATE'),{'id':ids[0]})
        start=time.perf_counter()
        r=client.patch(f'/api/v1/tasks/{ids[1]}',headers=headers[1],json={'title':'Independent row','version':1})
        elapsed=time.perf_counter()-start;transaction.rollback()
        check('independent_task_lock',r.status_code==200 and elapsed<2,{'status':r.status_code,'seconds':elapsed})
    # Holding column A must not block a move between columns B and C.
    with engine.connect() as held:
        transaction=held.begin();held.execute(text('SELECT id FROM kanban_columns WHERE id=:id FOR UPDATE'),{'id':colids[0]})
        task=client.get(f'/api/v1/tasks/{ids[2]}',headers=headers[2]).json();start=time.perf_counter()
        r=client.post(f'/api/v1/tasks/{ids[2]}/move',headers=headers[2],json={'column_id':colids[3],'position':0,'version':task['version']})
        elapsed=time.perf_counter()-start;transaction.rollback()
        check('independent_column_lock',r.status_code==200 and elapsed<2,{'status':r.status_code,'seconds':elapsed})
    t=client.get(f'/api/v1/tasks/{ids[5]}',headers=headers[5]).json()
    pair=concurrent_requests([lambda:client.patch(f'/api/v1/tasks/{ids[5]}',headers=headers[5],json={'title':'Race A','version':t['version']}),lambda:client.patch(f'/api/v1/tasks/{ids[5]}',headers=headers[5],json={'title':'Race B','version':t['version']})])
    check('same_task_lost_update',sorted(r.status_code for r,_ in pair)==[200,409],{'statuses':[r.status_code for r,_ in pair]})
    a=client.get(f'/api/v1/tasks/{ids[6]}',headers=headers[6]).json();b=client.get(f'/api/v1/tasks/{ids[7]}',headers=headers[7]).json()
    pair=concurrent_requests([lambda:client.post(f'/api/v1/tasks/{a["id"]}/move',headers=headers[6],json={'column_id':b['column_id'],'position':0,'version':a['version']}),lambda:client.post(f'/api/v1/tasks/{b["id"]}/move',headers=headers[7],json={'column_id':a['column_id'],'position':0,'version':b['version']})])
    check('opposite_moves_bounded',all(r.status_code in [200,409] for r,_ in pair) and max(d for _,d in pair)<5,{'statuses':[r.status_code for r,_ in pair],'seconds':[d for _,d in pair]})
    with engine.connect() as db:
        rows=db.execute(text('SELECT column_id,position FROM tasks WHERE column_id IN ('+','.join(map(str,colids))+') ORDER BY column_id,position')).all()
        grouped={c:[pos for cid,pos in rows if cid==c] for c in colids}
        check('kanban_contiguous_positions',all(v==list(range(len(v))) for v in grouped.values()),{'sizes':{str(c):len(v) for c,v in grouped.items()}})
    # Explicitly verify the DB trigger, not an application-only convention.
    current=client.get(f'/api/v1/tasks/{ids[9]}',headers=headers[9]).json()
    client.patch(f'/api/v1/tasks/{ids[9]}',headers=headers[9],json={'estimated_hours':8,'version':current['version']}).raise_for_status()
    with engine.connect() as db:
        failed=False
        try:db.execute(text('UPDATE task_estimate_versions SET estimated_hours=999 WHERE task_id=:id'),{'id':ids[9]})
        except Exception:failed=True;db.rollback()
        check('immutable_estimate_trigger',failed,{'update_rejected':failed})
    with connect(base.replace('http','ws')+f'/api/v1/ws/projects/{pid}',origin='http://localhost:3000',open_timeout=5) as s1, connect(base.replace('http','ws')+f'/api/v1/ws/projects/{pid}',origin='http://localhost:3000',open_timeout=5) as s2:
        for socket,i in [(s1,0),(s2,1)]:socket.send(headers[i]['Authorization'][7:]);assert json.loads(socket.recv(timeout=5))['event']=='connected'
        r=client.post(f'/api/v1/projects/{pid}/tasks',headers=headers[0],json={'title':'Realtime commit evidence'});r.raise_for_status()
        events=[json.loads(s.recv(timeout=5)) for s in (s1,s2)]
        check('two_websocket_clients_after_commit',all(e['entity_id']==r.json()['id'] and e['event']=='task.created' for e in events),{'events':[e['event'] for e in events]})
    metrics=[]
    for workload in ('list','update'):
        samples=[];statuses=[];started=time.perf_counter()
        for round_number in range(5):
            current=[client.get(f'/api/v1/tasks/{tid}',headers=h).json() for tid,h in zip(ids,headers)] if workload=='update' else None
            funcs=[]
            for i in range(100):
                if workload=='list':funcs.append(lambda i=i:client.get(f'/api/v1/projects/{pid}/tasks?size=100',headers=headers[i]))
                else:funcs.append(lambda i=i:client.patch(f'/api/v1/tasks/{ids[i]}',headers=headers[i],json={'title':f'Load {round_number} {i}','version':current[i]['version']}))
            for offset in range(0, len(funcs), concurrency):
                results=concurrent_requests(funcs[offset:offset+concurrency]);samples.extend(d*1000 for _,d in results);statuses.extend(r.status_code for r,_ in results)
        elapsed=time.perf_counter()-started;ordered=sorted(samples)
        metric={'workload':workload,'requests':len(samples),'concurrent_accounts':concurrency,'rounds':5,'p50_ms':round(ordered[len(ordered)//2],2),'p95_ms':round(ordered[int(len(ordered)*.95)-1],2),'max_ms':round(max(samples),2),'http_errors':sum(s!=200 for s in statuses),'wall_seconds_including_version_reads':round(elapsed,2)}
        metrics.append(metric);check('load_'+workload,metric['http_errors']==0,metric)
    evidence['load']=metrics
except Exception as exc:
    evidence['failure']={'type':type(exc).__name__,'message':str(exc)[:300]}
    raise
finally:
    client.close();server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill();server.wait()
    log.close()
    out=Path(os.environ.get('VERIFICATION_OUTPUT_DIR',str(ROOT.parent/'docs/testing')));out.mkdir(parents=True,exist_ok=True)
    (out/'innodb_evidence.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(evidence,ensure_ascii=True))
