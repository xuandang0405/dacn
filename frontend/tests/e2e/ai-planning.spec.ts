import { test, expect } from "@playwright/test";
import fs from "node:fs";

const apiUrl = process.env.E2E_API_URL || "http://localhost:8000";
const password = "AI-Review-Only-2026!";

test("live Gemini: reuse answers, assign, review, confirm and record token usage", async ({ browser, request }, testInfo) => {
  test.skip(process.env.E2E_LIVE_AI !== "1", "Opt in: calls the configured Gemini provider");
  test.setTimeout(300000);
  const stamp = Date.now().toString(36);
  async function call(method: string, path: string, headers: Record<string, string>, data?: unknown) {
    let response = await request.fetch(`${apiUrl}/api/v1${path}`, { method, headers, data, timeout: 90000 });
    // Sequential suites can legitimately exhaust the single-IP auth window.
    for (let attempt = 0; response.status() === 429 && attempt < 2; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 31000));
      response = await request.fetch(`${apiUrl}/api/v1${path}`, { method, headers, data, timeout: 90000 });
    }
    expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBe(true);
    return response.status() === 204 ? null : response.json();
  }
  async function account(prefix: string, name: string) {
    const username = `${prefix}${stamp}`;
    const email = `${username}@example.com`;
    await call("POST", "/auth/register", {}, { username, email, name, password });
    const login = await call("POST", "/auth/login", {}, { email, password });
    const headers = { Authorization: `Bearer ${login.access_token}` };
    const me = await call("GET", "/auth/me", headers);
    return { email, headers, id: me.id, name };
  }
  const owner = await account("aipowner", "AI Review Owner");
  const apiMember = await account("aipapi", "API Developer");
  const uiMember = await account("aipui", "UI Developer");
  const ws = await call("POST", "/workspaces", owner.headers, { name: `AI review ${stamp}` });
  const p = await call("POST", `/workspaces/${ws.id}/projects`, owner.headers, { name: `Delivery plan ${stamp}` });
  const root = `/ai/projects/${p.id}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  let browserProviderRequests = 0;
  page.on("request", r => {
    if (r.method() === "POST" && /\/ai\/(decompose-task|projects\/\d+\/query)$/.test(r.url())) browserProviderRequests++;
  });
  page.on("pageerror", e => errors.push(e.message));
  const evidence: Record<string, unknown> = { measured_at: new Date().toISOString(), synthetic_fixture: true, cases: [] };
  try {
    for (const person of [apiMember, uiMember]) {
      await call("POST", `/workspaces/${ws.id}/members`, owner.headers, { email: person.email });
      const invitations = await call("GET", "/invitations", person.headers);
      await call("POST", "/invitations/respond", person.headers, { token: invitations[0].token, accept: true });
      await call("POST", `/projects/${p.id}/members/${person.id}`, owner.headers);
    }
    // No special skill for the owner; specialists should receive their matching tasks.
    for (const [name, person] of [["Python", apiMember], ["React", uiMember]] as const) {
      const skill = await call("POST", `/workspaces/${ws.id}/skills`, owner.headers, { name });
      await call("PUT", `/skills/${skill.id}/members`, owner.headers, { user_id: person.id, level: 5 });
    }
    const brief = [
      "PROJECT SCOPE / PHẠM VI: Build a small team task manager with a Python REST API and React UI.",
      "Deliverables: validated task creation API; React form with loading and error handling; automated tests and integration verification.",
      "No payments, billing, hardware, tickets or ecommerce. Use existing login and database, do not rebuild them.",
      "Work should fit into 3-6 tasks. The team reviews assignments before saving. Required skills are Python and React.",
      ...Array.from({ length: 180 }, (_, i) => `Reference ${i + 1}: Historical interface review note. Keep labels understandable, show validation errors, verify persisted data and accessibility. This appendix adds no new deliverable or technology.`),
    ].join("\n");
    const upload = await request.post(`${apiUrl}/api/v1${root}/documents`, { headers: owner.headers, multipart: { file: { name: "delivery-brief.txt", mimeType: "text/plain", buffer: Buffer.from(brief) } } });
    expect(upload.status()).toBe(201);
    await page.goto(process.env.E2E_UI_URL || "http://localhost:3000");
    await page.getByLabel("Email", { exact: true }).fill(owner.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page.locator(".workspace-select").locator(`option[value='${ws.id}']`)).toHaveCount(1);
    await page.locator(".workspace-select").selectOption(String(ws.id));
    await page.locator("aside nav").getByRole("button", { name: "Trợ lý AI", exact: true }).click();
    await expect(page.getByText("delivery-brief.txt", { exact: true })).toBeVisible();
    const analysisResponse = page.waitForResponse(r => r.url().endsWith(`${root}/query`) && r.request().method() === "POST", { timeout: 90000 });
    await page.getByRole("button", { name: "Phân tích dự án và hướng dẫn", exact: true }).click();
    const analysisHttp = await analysisResponse;
    expect(analysisHttp.status(), await analysisHttp.text()).toBe(200);
    const analysis = await analysisHttp.json();
    await expect(page.locator(".ai-answer")).toContainText("delivery-brief.txt");
    const planResponse = page.waitForResponse(r => r.url().endsWith("/ai/decompose-task"), { timeout: 90000 });
    await page.getByRole("button", { name: "Lập kế hoạch và phân công từ câu trả lời này", exact: true }).click();
    const planHttp = await planResponse;
    expect(planHttp.status(), await planHttp.text()).toBe(200);
    const proposal = await planHttp.json();
    evidence.model = proposal.usage.model;
    expect(proposal.context_turns).toBe(1);
    expect(proposal.plan.tasks.length).toBeGreaterThanOrEqual(3);
    expect(proposal.plan.tasks.every((t: { assignee_id: number | null }) => t.assignee_id !== null)).toBe(true);
    expect((await call("GET", `/projects/${p.id}/tasks`, owner.headers)).total).toBe(0);
    await expect(page.locator(".ai-task")).toHaveCount(proposal.plan.tasks.length);
    await page.locator(".ai-task").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("ai-first-task-desktop.png") });
    await page.screenshot({ path: testInfo.outputPath("ai-assigned-draft-desktop.png"), fullPage: true });
    const first = page.locator(".ai-task").first();
    await first.getByLabel("Người thực hiện", { exact: true }).selectOption(String(uiMember.id));
    await first.getByRole("textbox", { name: "Tên công việc", exact: true }).fill("Công việc đã được người dùng duyệt");
    const cached = await call("POST", "/ai/decompose-task", owner.headers, { project_id: p.id, context_id: analysis.context_id });
    expect(cached.cached).toBe(true);
    expect(cached.usage.provider_calls).toBe(0);
    expect(cached.request_id).toBe(proposal.request_id);
    const vietnameseCase = { language: "vi", analysis_usage: analysis.usage, context_plan_usage: proposal.usage, cache_usage: cached.usage, plan: proposal.plan, full_document_plan_usage: undefined as unknown };
    (evidence.cases as unknown[]).push(vietnameseCase);
    // Optional comparison calls are separate from the functional workflow.
    if (process.env.E2E_AI_BASELINE === "1") {
      const baseline = await call("POST", "/ai/decompose-task", owner.headers, { project_id: p.id, story: "Lập kế hoạch API Python, giao diện React và kiểm thử theo phạm vi tài liệu.", language: "vi" });
      vietnameseCase.full_document_plan_usage = baseline.usage;
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("ai-assigned-draft-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    const savedResponse = page.waitForResponse(r => r.url().endsWith(`/ai/requests/${proposal.request_id}/confirm`));
    await page.getByRole("button", { name: /Xác nhận và giao việc/ }).click();
    const savedHttp = await savedResponse;
    expect(savedHttp.status(), await savedHttp.text()).toBe(201);
    const saved = await savedHttp.json();
    const task = await call("GET", `/tasks/${saved.task_ids[0]}`, owner.headers);
    expect(task.assignee_id).toBe(uiMember.id);
    expect(task.title).toBe("Công việc đã được người dùng duyệt");
    const notifications = await call("GET", "/notifications", uiMember.headers);
    expect(notifications.some((n: { kind: string; entity_id: number }) => n.kind === "task_assigned" && n.entity_id === task.id)).toBe(true);
    evidence.reviewed_assignment_persisted = true;
    const englishAnswer = await call("POST", `${root}/query`, owner.headers, { mode: "analyze", language: "en" });
    const english = await call("POST", "/ai/decompose-task", owner.headers, { project_id: p.id, context_id: englishAnswer.context_id, language: "en" });
    const englishCase = { language: "en", analysis_usage: englishAnswer.usage, context_plan_usage: english.usage, plan: english.plan, full_document_plan_usage: undefined as unknown };
    (evidence.cases as unknown[]).push(englishCase);
    if (process.env.E2E_AI_BASELINE === "1") {
      const englishBaseline = await call("POST", "/ai/decompose-task", owner.headers, { project_id: p.id, story: "Plan the Python API, React UI and tests within the documented scope.", language: "en" });
      englishCase.full_document_plan_usage = englishBaseline.usage;
    }
    for (const result of [proposal, english]) {
      const tasks = result.plan.tasks;
      expect(tasks.every((t: { estimated_hours: number; subtasks: { estimated_hours: number }[] }) => t.estimated_hours <= 20 && t.subtasks.reduce((sum, child) => sum + child.estimated_hours, 0) <= t.estimated_hours)).toBe(true);
      const skills = new Set(tasks.flatMap((t: { required_skills: string[] }) => t.required_skills));
      expect(skills.has("Python") && skills.has("React")).toBe(true);
      expect(tasks.some((t: { title: string }) => /payment|billing|thanh toán|blockchain|IoT/i.test(t.title))).toBe(false);
    }
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await page.locator("aside nav").getByRole("button", { name: "AI Assistant", exact: true }).click();
    await expect(page.locator(".ai-answer")).toContainText(englishAnswer.answer.slice(0, 50));
    await expect(page.getByRole("button", { name: "Plan and assign from this answer", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "VI", exact: true }).click();
    const callsBeforeReload = browserProviderRequests;
    await page.reload();
    await page.locator(".workspace-select").selectOption(String(ws.id));
    await page.locator("aside nav").getByRole("button", { name: "Trợ lý AI", exact: true }).click();
    await expect(page.locator(".ai-answer")).toContainText(analysis.answer.slice(0, 50));
    expect(browserProviderRequests).toBe(callsBeforeReload);
    expect(errors).toEqual([]);
    evidence.restored_without_provider_call = true;
    evidence.page_errors = errors;
  } finally {
    fs.writeFileSync(testInfo.outputPath("live-ai-evaluation.json"), JSON.stringify(evidence, null, 2));
    await context.close();
    await call("DELETE", `/workspaces/${ws.id}`, owner.headers);
  }
});
