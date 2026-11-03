const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const originalFetch = global.fetch;
const originalWindow = global.window;

function loadSource(relative) {
  const filename = path.resolve(__dirname, relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loaded = new Module(filename, module);
  loaded._compile(compiled.outputText, filename);
  return loaded.exports;
}
function client() {
  global.window = new EventTarget();
  return loadSource('../src/lib/api.ts');
}
const response = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
afterEach(() => { global.fetch = originalFetch; global.window = originalWindow; });

test('parallel expired requests rotate the refresh cookie only once', async () => {
  const api = client();
  api.setToken('expired');
  let rotations = 0;
  global.fetch = async (url, init) => {
    if (url.endsWith('/auth/refresh')) {
      rotations++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return response(200, { access_token: 'fresh' });
    }
    return init.headers.get('Authorization') === 'Bearer fresh'
      ? response(200, { ok: true }) : response(401, { detail: 'Expired' });
  };
  const values = await Promise.all([api.api.get('/workspaces'), api.api.get('/notifications'), api.api.get('/projects/1')]);
  assert.equal(rotations, 1);
  assert.equal(values.length, 3);
  assert.equal(api.getToken(), 'fresh');
});

test('the account endpoint refreshes an expired session too', async () => {
  const api = client();
  api.setToken('expired');
  global.fetch = async (url, init) => url.endsWith('/auth/refresh')
    ? response(200, { access_token: 'fresh' })
    : init.headers.get('Authorization') === 'Bearer fresh'
      ? response(200, { id: 1 }) : response(401, { detail: 'Expired' });
  assert.equal((await api.api.get('/auth/me')).id, 1);
});

test('a refresh response cannot restore a session cleared while it was in flight', async () => {
  const api = client();
  let release;
  global.fetch = async () => { await new Promise(resolve => { release = resolve; }); return response(200, { access_token: 'late' }); };
  const pending = api.refresh();
  await new Promise(resolve => setTimeout(resolve, 0));
  api.setToken(null);
  release();
  assert.equal(await pending, false);
  assert.equal(api.getToken(), null);
});

test('a network failure is reported as a readable API error', async () => {
  const api = client();
  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(api.api.get('/workspaces'), error => error instanceof api.ApiError && error.status === 0);
});

test('AI draft keys stay stable after edits and are excluded from confirmation payloads', () => {
  const { toDraft, toPlan } = loadSource('../src/lib/ai-draft.ts');
  const plan = { summary: 'Plan', tasks: [{ title: 'Task', description: 'Work', estimated_hours: 4, priority: 'MEDIUM', required_skills: [], subtasks: [{ title: 'Child', description: 'Detail', estimated_hours: 2 }] }] };
  const draft = toDraft(plan);
  const taskKey = draft.tasks[0].localId;
  const childKey = draft.tasks[0].subtasks[0].localId;
  assert.ok(taskKey && childKey && taskKey !== childKey);
  assert.deepEqual(toPlan(draft), plan);
  const edited = { ...draft, tasks: draft.tasks.map(task => ({ ...task, title: 'Edited' })) };
  assert.equal(edited.tasks[0].localId, taskKey);
  assert.equal(edited.tasks[0].subtasks[0].localId, childKey);
  assert.equal(JSON.stringify(toPlan(edited)).includes('localId'), false);
});
