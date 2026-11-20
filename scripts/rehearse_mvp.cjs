// Rehearse with two isolated browser sessions and the real API/MySQL stack.
const {chromium, request} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseURL = process.env.MVP_API_URL || 'http://localhost:8100';
const uiURL = process.env.MVP_UI_URL || 'http://localhost:3100';
const password = process.env.MVP_DEMO_PASSWORD || 'STM-MVP-Demo-2026!';
const workspaceName = process.env.MVP_WORKSPACE || 'MVP Nhóm 3C - 06-11-2026 - Diễn tập';
const out = path.resolve(process.env.MVP_EVIDENCE_DIR || 'docs/demo-mvp/evidence');
fs.mkdirSync(out, {recursive:true});
const evidence = {started_utc:new Date().toISOString(), workspace:workspaceName,
  real_api:true, real_database:true, mocked_network:false, checks:[], events:[], page_errors:[], server_errors:[]};
function check(name, detail) { evidence.checks.push({name,passed:true,detail}); }
async function shot(page, name) {
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'});
}
async function login(page,email) {
  page.on('pageerror', e=>evidence.page_errors.push(e.message));
  page.on('response', r=>{if(r.status()>=500 && r.url().startsWith(baseURL))evidence.server_errors.push({status:r.status(),url:r.url()});});
  page.on('websocket', ws=>ws.on('framereceived', frame=>{
    try {const msg=JSON.parse(String(frame.payload)); if(msg.event)evidence.events.push({actor:email,event:msg.event,entity_id:msg.entity_id});}catch{}
  }));
  await page.goto(uiURL);
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login') && r.request().method()==='POST');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const r=await response;assert.equal(r.status(),200);
  const token=(await r.json()).access_token;
  await page.locator('.workspace-select').selectOption({label:workspaceName});
  await page.locator('.stat-card').first().waitFor();
  return {Authorization:'Bearer '+token};
}
async function board(page,isOwner) {
  await page.getByRole('button',{name:'Dự án',exact:true}).click();
  assert.equal(await page.getByPlaceholder('Tên dự án mới').count(),isOwner?1:0);
  await page.locator('.project-row').filter({hasText:'Smart Task Manager - Demo MVP'}).click();
  await page.locator('.task-card').first().waitFor();
}
async function main() {
  const api=await request.newContext({baseURL});
  const browser=await chromium.launch({headless:true,...(process.env.MVP_CHROME?{executablePath:process.env.MVP_CHROME}:{})});
  try {
    const ownerContext=await browser.newContext({viewport:{width:1680,height:1000}});
    const memberContext=await browser.newContext({viewport:{width:1680,height:1000}});
    const owner=await ownerContext.newPage(), member=await memberContext.newPage();
    const [oh,mh]=await Promise.all([login(owner,'demo.dang@stm.example.com'),login(member,'demo.dat@stm.example.com')]);
    const workspaces=await (await api.get('/api/v1/workspaces',{headers:oh})).json();
    const workspace=workspaces.find(w=>w.name===workspaceName);assert.ok(workspace);
    const projects=await (await api.get(`/api/v1/workspaces/${workspace.id}/projects`,{headers:oh})).json();
    const project=projects.find(p=>p.name==='Smart Task Manager - Demo MVP');assert.ok(project);
    const members=await (await api.get(`/api/v1/workspaces/${workspace.id}/members`,{headers:oh})).json();
    const dat=members.find(m=>m.email==='demo.dat@stm.example.com');assert.ok(dat);
    const columns=await (await api.get(`/api/v1/projects/${project.id}/columns`,{headers:oh})).json();
    const before=await (await api.get(`/api/v1/projects/${project.id}/analytics`,{headers:oh})).json();
    evidence.initial=before;
    await Promise.all([board(owner,true),board(member,false)]);
    check('Two isolated logins and role-aware UI',{owner:'OWNER',member:'MEMBER'});
    const title='DEMO trực tiếp - Kiểm thử thông báo giao việc '+new Date().toISOString().replace(/[:.]/g,'-');
    await owner.getByPlaceholder('Tên công việc mới...').fill(title);
    const cp=owner.waitForResponse(r=>r.url().endsWith(`/api/v1/projects/${project.id}/tasks`) && r.request().method()==='POST');
    const [cr]=await Promise.all([cp,owner.getByRole('button',{name:'Tạo công việc',exact:true}).click()]);
    assert.equal(cr.status(),201);const task=await cr.json();
    await member.getByRole('heading',{name:title,exact:true}).waitFor();
    check('Create through UI and deliver realtime without reloading',{task_id:task.id,status:201});
    await owner.getByRole('heading',{name:title,exact:true}).click();
    await owner.getByLabel(/Người thực hiện/).selectOption(String(dat.user_id));
    await owner.getByLabel('Ước lượng (giờ)',{exact:true}).fill('4');
    const up=owner.waitForResponse(r=>r.url().endsWith(`/api/v1/tasks/${task.id}`) && r.request().method()==='PATCH');
    const [updated]=await Promise.all([up,owner.getByRole('button',{name:'Lưu thay đổi',exact:true}).click()]);
    assert.equal(updated.status(),200);
    await shot(owner,'01-owner-assignment');
    await owner.getByRole('button',{name:'Đóng',exact:true}).click();
    await member.getByRole('heading',{name:title,exact:true}).click();
    assert.equal(await member.getByLabel('Ước lượng (giờ)',{exact:true}).inputValue(),'4');
    assert.equal(await member.getByLabel(/Người thực hiện/).inputValue(),String(dat.user_id));
    await member.getByLabel('Thực tế (giờ)',{exact:true}).fill('5');
    const mp=member.waitForResponse(r=>r.url().endsWith(`/api/v1/tasks/${task.id}`) && r.request().method()==='PATCH');
    const [actual]=await Promise.all([mp,member.getByRole('button',{name:'Lưu thay đổi',exact:true}).click()]);
    assert.equal(actual.status(),200);
    const move=member.waitForResponse(r=>r.url().endsWith(`/api/v1/tasks/${task.id}/move`) && r.request().method()==='POST');
    const [moved]=await Promise.all([move,member.getByLabel(/Chuyển sang cột/).selectOption(String(columns.find(c=>c.is_done).id))]);
    assert.equal(moved.status(),200);
    await member.getByRole('button',{name:'Đóng',exact:true}).click();
    const ownerDone=owner.locator('.kanban-column').filter({has:owner.locator('.column-head strong',{hasText:'Hoàn thành'})});
    await ownerDone.getByRole('heading',{name:title,exact:true}).waitFor();
    check('Member saves actual hours and moves to Done; owner sees realtime',{estimated_hours:4,actual_hours:5});
    await shot(owner,'02-owner-realtime-done');
    await owner.reload();await owner.locator('.stat-card').first().waitFor();
    await board(owner,true);
    await owner.getByRole('heading',{name:title,exact:true}).waitFor();
    const saved=await (await api.get(`/api/v1/tasks/${task.id}`,{headers:oh})).json();
    assert.equal(saved.actual_hours,5);assert.equal(saved.assignee_id,dat.user_id);assert.equal(saved.column_id,columns.find(c=>c.is_done).id);
    check('Reload retains the task, assignment and hours', {task_id:task.id,version:saved.version});
    const result=await (await api.get(`/api/v1/projects/${project.id}/analytics`,{headers:oh})).json();
    assert.equal(result.total_tasks,before.total_tasks+1);assert.equal(result.completed_tasks,before.completed_tasks+1);
    assert.equal(result.mape_sample_count,before.mape_sample_count+1);
    const expected=Math.round((before.mape*before.mape_sample_count+20)/result.mape_sample_count*100)/100;
    assert.equal(result.mape,expected);
    evidence.final=result;evidence.task=saved;evidence.project_id=project.id;evidence.workspace_id=workspace.id;
    check('Analytics reads the new committed data',{total_tasks:result.total_tasks,completed_tasks:result.completed_tasks,mape:result.mape});
    await owner.getByRole('button',{name:'Phân tích',exact:true}).click();await owner.locator('.analytics-card').first().waitFor();
    await shot(owner,'03-analytics-from-db');
    for(const [name,method,url,headers,data,status] of [
      ['Stale version','patch',`/api/v1/tasks/${task.id}`,oh,{version:task.version,title:'Stale change'},409],
      ['Null required title','patch',`/api/v1/tasks/${task.id}`,oh,{version:saved.version,title:null},422],
      ['Negative hours','patch',`/api/v1/tasks/${task.id}`,oh,{version:saved.version,actual_hours:-1},422],
      ['Member cannot manage skills','post',`/api/v1/workspaces/${workspace.id}/skills`,mh,{name:'Forbidden demo edit'},403],
    ]) {
      const r=await api[method](url,{headers,data});assert.equal(r.status(),status,name);check(name,{status});
    }
    assert.ok(evidence.events.some(e=>e.actor==='demo.dat@stm.example.com' && e.event==='task.created' && e.entity_id===task.id));
    assert.ok(evidence.events.some(e=>e.actor==='demo.dang@stm.example.com' && e.event==='task.moved' && e.entity_id===task.id));
    assert.deepEqual(evidence.page_errors,[]);assert.deepEqual(evidence.server_errors,[]);
    check('No browser crash or HTTP 5xx during the rehearsal',{});
    evidence.status='passed';evidence.completed_utc=new Date().toISOString();
  } finally {
    await browser.close();await api.dispose();
  }
  fs.writeFileSync(path.join(out,'rehearsal-result.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({status:evidence.status,checks:evidence.checks.length,workspace:workspaceName,task_id:evidence.task.id,metrics:evidence.final},null,2));
}
main().catch(e=>{evidence.status='failed';evidence.failure=e.message;fs.writeFileSync(path.join(out,'rehearsal-failure.json'),JSON.stringify(evidence,null,2));console.error(e.stack);process.exitCode=1;});
