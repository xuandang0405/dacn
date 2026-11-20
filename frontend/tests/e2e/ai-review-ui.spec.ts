import { test, expect } from "@playwright/test";

test("AI review UI contract (provider stub): restore VI/EN, edit assignee, confirm and fit mobile", async ({ page, request }) => {
  const api = process.env.E2E_API_URL || "http://localhost:8000";
  const stamp = Date.now().toString(36);
  const email = `aireview${stamp}@example.com`;
  const password = "UI-Contract-Only-2026!";
  const register = await request.post(`${api}/api/v1/auth/register`, { data: { email, username: `aireview${stamp}`, name: "Review User", password } });
  expect(register.status()).toBe(201);
  const session = await (await request.post(`${api}/api/v1/auth/login`, { data: { email, password } })).json();
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const me = await (await request.get(`${api}/api/v1/auth/me`, { headers })).json();
  const ws = await (await request.post(`${api}/api/v1/workspaces`, { headers, data: { name: `UI contract ${stamp}` } })).json();
  await request.post(`${api}/api/v1/workspaces/${ws.id}/projects`, { headers, data: { name: "AI review" } });
  let queryCalls = 0;
  let planCalls = 0;
  let reviewed: { plan: { tasks: { assignee_id: number | null; title: string; localId?: string }[] } } | null = null;
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  // Only the AI boundary is stubbed. This test verifies UI behavior, not Gemini quality or DB confirmation.
  await page.route("**/api/v1/ai/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/documents")) return route.fulfill({ json: [{ id: 1, filename: "ui-contract.txt", size_bytes: 100 }] });
    if (url.pathname.endsWith("/context")) {
      const answer = url.searchParams.get("language") === "en" ? "Build the documented API and interface." : "Xây dựng API và giao diện theo tài liệu.";
      return route.fulfill({ json: { context_id: 42, turns: [{ id: 42, question: "Scope", answer }] } });
    }
    if (url.pathname.endsWith("/query")) { queryCalls++; return route.fulfill({ status: 503, json: { detail: "Gemini daily quota exhausted; wait for the quota reset" } }); }
    if (url.pathname.endsWith("/decompose-task")) {
      planCalls++;
      expect(route.request().postDataJSON()).toMatchObject({ context_id: 42, story: "" });
      return route.fulfill({ json: { request_id: 43, cached: true, usage: { provider_calls: 0, total_tokens: 0 }, eligible_members: [{ user_id: me.id, name: "Review User" }], plan: { summary: "Provider stub for UI contract only", tasks: [{ title: "Build API", description: "Validate task creation", estimated_hours: 4, priority: "HIGH", required_skills: ["Python"], assignee_id: me.id, assignment_reason: "Khớp kỹ năng; đề xuất kiểm thử UI.", subtasks: [{ title: "Validate inputs", description: "Check required fields", estimated_hours: 2 }] }] } } });
    }
    if (url.pathname.endsWith("/confirm")) { reviewed = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { task_ids: [] } }); }
    return route.abort();
  });
  try {
    await page.goto(process.env.E2E_UI_URL || "http://localhost:3000");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await page.locator("aside nav").getByRole("button", { name: "Trợ lý AI", exact: true }).click();
    await expect(page.locator(".ai-answer")).toContainText("Xây dựng API và giao diện");
    await page.getByRole("button", { name: "Lập kế hoạch và phân công từ câu trả lời này", exact: true }).click();
    await expect(page.locator(".ai-task")).toHaveCount(1);
    await expect(page.getByLabel("Người thực hiện", { exact: true })).toHaveValue(String(me.id));
    await expect(page.locator(".ai-usage summary")).toContainText("không gọi AI lại");
    await page.getByLabel("Người thực hiện", { exact: true }).selectOption("");
    await page.getByRole("textbox", { name: "Tên công việc", exact: true }).fill("Reviewed task");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: /Xác nhận và giao việc/ }).click();
    await expect.poll(() => reviewed).not.toBeNull();
    expect(reviewed).toMatchObject({ plan: { tasks: [{ assignee_id: null, title: "Reviewed task" }] } });
    expect(JSON.stringify(reviewed)).not.toContain("localId");
    await page.locator("aside nav").getByRole("button", { name: "Trợ lý AI", exact: true }).click();
    await page.getByRole("button", { name: "EN", exact: true }).click();
    await expect(page.locator(".ai-answer")).toContainText("Build the documented API");
    await expect(page.getByRole("button", { name: "Plan and assign from this answer", exact: true })).toBeVisible();
    await page.reload();
    await page.locator("aside nav").getByRole("button", { name: "AI Assistant", exact: true }).click();
    await expect(page.locator(".ai-answer")).toContainText("Build the documented API");
    expect(queryCalls).toBe(0);
    expect(planCalls).toBe(1);
    // Quota failure keeps the restored answer and gives a readable message.
    await page.getByRole("button", { name: "Analyze project and guide me", exact: true }).click();
    await expect(page.locator(".ai-layout .error[role='alert']")).toContainText("daily quota exhausted");
    await expect(page.locator(".ai-answer")).toContainText("Build the documented API");
    expect(errors).toEqual([]);
  } finally {
    expect((await request.delete(`${api}/api/v1/workspaces/${ws.id}`, { headers })).status()).toBe(204);
  }
});
