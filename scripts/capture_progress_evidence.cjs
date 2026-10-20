// Real UI/API evidence. Requires Playwright and a running seeded Docker stack.
const { chromium, request } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/progress-02/evidence');
const SHOTS = path.join(OUT, 'screenshots');
const password = process.env.DEMO_PASSWORD || 'STM-Demo-Only-2026!';
const apiURL = process.env.EVIDENCE_API_URL || 'http://localhost:8000';
const uiURL = process.env.EVIDENCE_UI_URL || 'http://localhost:3000';
fs.mkdirSync(SHOTS, { recursive: true });
const evidence = { started_utc: new Date().toISOString(), real_ui: true, mocked_network: false,
  database: 'Docker MySQL 8.4', checks: [], websocket_events: [], api_samples: [] };
function check(name, detail) { evidence.checks.push({ name, passed: true, detail }); }
async function shot(page, name) {
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.drawer')?.scrollTo(0, 0); });
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
}
async function login(page, email) {
  page.on('websocket', socket => socket.on('framereceived', frame => {
    try { const msg = JSON.parse(String(frame.payload));
      evidence.websocket_events.push({ actor: email.split('@')[0], event: msg.event,
        entity_id: msg.entity_id, received_utc: new Date().toISOString() });
    } catch {}
  }));
  await page.goto(uiURL);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  const loginResponse = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  const result = await loginResponse;
  assert.equal(result.status(), 200, 'UI login must succeed');
  const token = (await result.json()).access_token;
  await page.locator('.sidebar-bottom').getByText(email, { exact: true }).waitFor();
  await page.locator('.workspace-select').selectOption({ label: 'Demo Workspace' });
  return token;
}
async function board(page) {
  await page.getByRole('button', { name: 'Dự án', exact: true }).click();
  await page.locator('.project-row').filter({ hasText: 'Smart Task Manager' }).click();
  await page.locator('.task-card').first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.kanban-column').length === 5);
}
async function main() {
  const api = await request.newContext({ baseURL: apiURL });
  const lr = await api.post('/api/v1/auth/login', { data: { email: 'owner@demo.example.com', password } });
  assert.equal(lr.status(), 200);
  const headers = { Authorization: 'Bearer ' + (await lr.json()).access_token };
  const ws = await (await api.get('/api/v1/workspaces', { headers })).json();
  const workspace = ws.find(w => w.name === 'Demo Workspace');
  const projects = await (await api.get(`/api/v1/workspaces/${workspace.id}/projects`, { headers })).json();
  const project = projects.find(p => p.name === 'Smart Task Manager');
  const members = await (await api.get(`/api/v1/workspaces/${workspace.id}/members`, { headers })).json();
  const lan = members.find(m => m.email === 'lan@demo.example.com');
  const columns = await (await api.get(`/api/v1/projects/${project.id}/columns`, { headers })).json();
  const browser = await chromium.launch({ headless: true,
    ...(process.env.EVIDENCE_CHROME ? { executablePath: process.env.EVIDENCE_CHROME } : {}) });
  try {
    const ownerContext = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
    const memberContext = await browser.newContext({ viewport: { width: 1600, height: 1050 } });
    const owner = await ownerContext.newPage(), member = await memberContext.newPage();
    await owner.goto(uiURL); await owner.getByLabel('Email', { exact: true }).waitFor();
    await shot(owner, '01-login');
    const [, memberToken] = await Promise.all([login(owner, 'owner@demo.example.com'), login(member, 'lan@demo.example.com')]);
    await owner.locator('.stat-card').first().waitFor();
    await shot(owner, '02-dashboard');
    await Promise.all([board(owner), board(member)]);
    check('Two isolated browser sessions', 'OWNER and MEMBER logged in through the real login form');
    const title = 'Nghiệm thu vòng đời task ' + new Date().toISOString().replace(/[:.]/g, '-');
    await owner.getByPlaceholder('Tên công việc mới...').fill(title);
    const createdPromise = owner.waitForResponse(r => r.url().endsWith(`/api/v1/projects/${project.id}/tasks`) && r.request().method() === 'POST');
    await owner.getByRole('button', { name: 'Tạo công việc', exact: true }).click();
    const created = await createdPromise; assert.equal(created.status(), 201);
    const task = await created.json();
    evidence.api_samples.push({ operation: 'Create task through UI', method: 'POST', endpoint: `/api/v1/projects/${project.id}/tasks`, status: 201, response: task });
    await member.getByRole('heading', { name: title, exact: true }).waitFor();
    check('Create and realtime delivery', { task_id: task.id, member_saw_without_reload: true });
    await owner.getByRole('heading', { name: title, exact: true }).click();
    await owner.getByLabel(/Người thực hiện/).selectOption(String(lan.user_id));
    await owner.getByLabel('Ước lượng (giờ)', { exact: true }).fill('4');
    const updatePromise = owner.waitForResponse(r => r.url().endsWith(`/api/v1/tasks/${task.id}`) && r.request().method() === 'PATCH');
    await owner.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    assert.equal((await updatePromise).status(), 200);
    await shot(owner, '03-task-detail');
    await owner.getByRole('button', { name: 'Đóng', exact: true }).click();
    await member.getByRole('heading', { name: title, exact: true }).click();
    await member.getByLabel('Thực tế (giờ)', { exact: true }).fill('5');
    const invalidInputs = await member.getByLabel('Thực tế (giờ)', { exact: true }).evaluate(input => Array.from(input.form.elements).filter(n => n.willValidate && !n.validity.valid).map(n => ({type:n.type,value:n.value,reason:n.validationMessage})));
    assert.deepEqual(invalidInputs, [], 'Member form has invalid fields');
    const actualPromise = member.waitForResponse(r => r.url().endsWith(`/api/v1/tasks/${task.id}`) && r.request().method() === 'PATCH');
    await member.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    assert.equal((await actualPromise).status(), 200);
    await member.getByRole('button', { name: 'Đóng', exact: true }).click();
    await member.waitForFunction(title => Array.from(document.querySelectorAll('.task-card')).some(n => n.textContent.includes(title) && n.textContent.includes('ACT 5h')), title);
    const card = member.locator('.task-card').filter({ has: member.getByRole('heading', { name: title, exact: true }) });
    const done = member.locator('.kanban-column').filter({ has: member.locator('.column-head strong', { hasText: 'DONE' }) });
    const movedPromise = member.waitForResponse(r => r.url().endsWith(`/api/v1/tasks/${task.id}/move`) && r.request().method() === 'POST');
    const transfer = await member.evaluateHandle(() => new DataTransfer());
    await card.dispatchEvent('dragstart', { dataTransfer: transfer });
    await done.dispatchEvent('dragover', { dataTransfer: transfer });
    await done.dispatchEvent('drop', { dataTransfer: transfer });
    assert.equal((await movedPromise).status(), 200);
    await owner.locator('.kanban-column').filter({ has: owner.locator('.column-head strong', { hasText: 'DONE' }) }).getByRole('heading', { name: title, exact: true }).waitFor();
    check('Member completes assigned task', { actual_hours: 5, owner_saw_done_without_reload: true });
    await shot(owner, '04-kanban-realtime');
    await member.reload(); await board(member);
    await member.locator('.kanban-column').filter({ has: member.locator('.column-head strong', { hasText: 'DONE' }) }).getByRole('heading', { name: title, exact: true }).waitFor();
    const persisted = await api.get(`/api/v1/tasks/${task.id}`, { headers });
    const saved = await persisted.json(); assert.equal(saved.actual_hours, 5); assert.equal(saved.assignee_id, lan.user_id);
    assert.equal(saved.column_id, columns.find(c => c.is_done).id);
    evidence.api_samples.push({ operation: 'Read persisted task', method: 'GET', endpoint: `/api/v1/tasks/${task.id}`, status: persisted.status(), response: saved });
    check('Reload and database persistence', { task_id: task.id, version: saved.version });
    for (const [label, data, expected] of [
      ['Stale version', { version: task.version, title: 'Stale write' }, 409],
      ['Null required title', { version: saved.version, title: null }, 422],
    ]) {
      const r = await api.patch(`/api/v1/tasks/${task.id}`, { headers, data }); assert.equal(r.status(), expected);
      evidence.api_samples.push({ operation: label, method: 'PATCH', endpoint: `/api/v1/tasks/${task.id}`, request: data, status: r.status(), response: await r.json() });
    }
    const unauthorized = await api.get('/api/v1/auth/me', { headers: { Authorization: 'Bearer invalid-demo-token' } });
    assert.equal(unauthorized.status(), 401);
    evidence.api_samples.push({ operation: 'Invalid access token', method: 'GET', endpoint: '/api/v1/auth/me', status: 401, response: await unauthorized.json() });
    const memberHeaders = { Authorization: 'Bearer ' + memberToken };
    const badInvite = await api.post('/api/v1/invitations/respond', { headers: memberHeaders, data: { token: 'invalid', accept: true } });
    assert.equal(badInvite.status(), 400);
    evidence.api_samples.push({ operation: 'Invalid invitation', method: 'POST', endpoint: '/api/v1/invitations/respond', request: { token: 'invalid', accept: true }, status: 400, response: await badInvite.json() });
    const forbidden = await api.post(`/api/v1/workspaces/${workspace.id}/skills`, { headers: memberHeaders, data: { name: 'Forbidden demo skill' } });
    assert.equal(forbidden.status(), 403);
    evidence.api_samples.push({ operation: 'MEMBER cannot edit skills', method: 'POST', endpoint: `/api/v1/workspaces/${workspace.id}/skills`, status: 403, response: await forbidden.json() });
    check('Real API error branches', [400, 401, 403, 409, 422]);
    await owner.getByRole('button', { name: 'Khối lượng', exact: true }).click();
    await owner.locator('.panel').first().waitFor(); await shot(owner, '05-workload');
    await owner.getByRole('button', { name: 'Phân tích', exact: true }).click();
    await owner.locator('.panel').first().waitFor(); await shot(owner, '06-analytics');
    await owner.getByRole('button', { name: 'AI Assistant', exact: true }).click();
    await owner.locator('input[type=file]').waitFor({ state: 'attached' });
    const docs = await (await api.get(`/api/v1/ai/projects/${project.id}/documents`, { headers })).json();
    if (!docs.some(d => d.filename === 'demo-project-brief.txt')) {
      const uploadPromise = owner.waitForResponse(r => r.url().endsWith(`/api/v1/ai/projects/${project.id}/documents`) && r.request().method() === 'POST');
      await owner.locator('input[type=file]').setInputFiles({ name: 'demo-project-brief.txt', mimeType: 'text/plain',
        buffer: Buffer.from('Smart Task Manager demo project. Stack: Next.js, FastAPI, MySQL. Scope: workspace roles, Kanban task lifecycle, realtime updates. A manager assigns work and a member reports actual hours. No payment, warehouse, Redis or autonomous execution is implemented. This is synthetic demo documentation, not an AI quality result.') });
      assert.equal((await uploadPromise).status(), 201);
    }
    await owner.getByText('demo-project-brief.txt', { exact: true }).waitFor();
    await shot(owner, '07-ai-document');
    check('Project document upload through UI', 'Private file storage and MySQL metadata; no paid Gemini request');
    await owner.getByRole('button', { name: 'EN', exact: true }).click();
    await owner.getByRole('button', { name: 'Analytics', exact: true }).click();
    await shot(owner, '08-english');
    await owner.getByRole('button', { name: 'VI', exact: true }).click();
    await owner.setViewportSize({ width: 390, height: 844 });
    await shot(owner, '09-mobile');
    const swagger = await ownerContext.newPage();
    await swagger.goto(apiURL + '/docs'); await swagger.locator('.opblock').first().waitFor();
    const block = swagger.locator('.opblock').filter({ hasText: '/api/v1/tasks/{task_id}' }).filter({ has: swagger.locator('.opblock-summary-method', { hasText: 'GET' }) }).first();
    await block.locator('.opblock-summary').click(); await block.scrollIntoViewIfNeeded();
    await swagger.screenshot({ path: path.join(SHOTS, '10-swagger.png') });
    const dbEnv = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter(x => x.includes('=')).map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
    const admin = await ownerContext.newPage(); await admin.goto('http://localhost:8081');
    await admin.locator('input[name="auth[username]"]').fill(dbEnv.MYSQL_USER || 'smart_task');
    await admin.locator('input[name="auth[password]"]').fill(dbEnv.MYSQL_PASSWORD);
    await admin.locator('input[name="auth[db]"]').fill(dbEnv.MYSQL_DATABASE || 'smart_task_manager');
    await admin.getByRole('button', { name: 'Login', exact: true }).click();
    await admin.getByText('alembic_version', { exact: true }).first().waitFor();
    await shot(admin, '11-database-tables');
    const queryURL = new URL(admin.url()); queryURL.searchParams.set('sql', '');
    await admin.goto(queryURL.toString());
    await admin.locator('textarea[name=query]').fill("SELECT 'users' AS entity, COUNT(*) AS records FROM users UNION ALL SELECT 'workspaces',COUNT(*) FROM workspaces UNION ALL SELECT 'skills',COUNT(*) FROM skills UNION ALL SELECT 'projects',COUNT(*) FROM projects UNION ALL SELECT 'tasks',COUNT(*) FROM tasks UNION ALL SELECT 'task_estimate_versions',COUNT(*) FROM task_estimate_versions; SELECT * FROM alembic_version;");
    await admin.locator('input[name=execute]').click();
    await admin.getByText('0005', { exact: true }).waitFor();
    await shot(admin, '12-database-counts');
    check('Database admin evidence', 'Actual tables, migration revision and COUNT queries in Adminer');
  } finally { await browser.close(); await api.dispose(); }
  evidence.finished_utc = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'browser-e2e.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: evidence.checks.length, websocket_events: evidence.websocket_events.length, api_samples: evidence.api_samples.length }));
}
main().catch(e => { fs.writeFileSync(path.join(OUT, 'browser-failure.json'), JSON.stringify({ error: e.message, checks: evidence.checks }, null, 2)); console.error(e.stack); process.exit(1); });
