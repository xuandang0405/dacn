import { test, expect } from "@playwright/test";

test("lost creation response survives reload; assigned subtasks and dashboard stay current", async ({
  browser,
  request,
}) => {
  const api = process.env.E2E_API_URL || "http://localhost:8000";
  const ui = process.env.E2E_UI_URL || "http://localhost:3000";
  const stamp = Date.now().toString(36);
  const password = "Stability-Test-Only-2026!";
  async function account(prefix: string) {
    const email = `${prefix}${stamp}@example.com`;
    expect(
      (
        await request.post(`${api}/api/v1/auth/register`, {
          data: {
            email,
            username: `${prefix}${stamp}`,
            name: prefix,
            password,
          },
        })
      ).status(),
    ).toBe(201);
    const login = await request.post(`${api}/api/v1/auth/login`, {
      data: { email, password },
    });
    const headers = {
      Authorization: `Bearer ${(await login.json()).access_token}`,
    };
    const user = await (
      await request.get(`${api}/api/v1/auth/me`, { headers })
    ).json();
    return { email, headers, id: user.id };
  }
  const owner = await account("stabo");
  const member = await account("stabm");
  const ws = await (
    await request.post(`${api}/api/v1/workspaces`, {
      headers: owner.headers,
      data: { name: `Stability ${stamp}` },
    })
  ).json();
  const project = await (
    await request.post(`${api}/api/v1/workspaces/${ws.id}/projects`, {
      headers: owner.headers,
      data: { name: `Project ${stamp}` },
    })
  ).json();
  await request.post(`${api}/api/v1/workspaces/${ws.id}/members`, {
    headers: owner.headers,
    data: { email: member.email },
  });
  const invite = (
    await (
      await request.get(`${api}/api/v1/invitations`, {
        headers: member.headers,
      })
    ).json()
  )[0];
  await request.post(`${api}/api/v1/invitations/respond`, {
    headers: member.headers,
    data: { token: invite.token, accept: true },
  });
  await request.post(
    `${api}/api/v1/projects/${project.id}/members/${member.id}`,
    { headers: owner.headers },
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(ui);
    await page.getByLabel("Email", { exact: true }).fill(owner.email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    const nav = (name: string) =>
      page
        .locator("aside nav")
        .getByRole("button", { name, exact: true })
        .click();
    await nav("Bảng công việc");
    const title = `Lost response ${stamp}`;
    await page.locator(".task-create-form input").fill(title);
    let key = "";
    await page.route(
      `**/api/v1/projects/${project.id}/tasks`,
      async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        key = route.request().headers()["idempotency-key"];
        expect((await route.fetch()).status()).toBe(201);
        await route.abort("failed");
      },
    );
    await page.locator(".task-create-form button[type=submit]").click();
    await expect(page.locator(".error")).toBeVisible();
    expect(key).toBeTruthy();
    await page.unroute(`**/api/v1/projects/${project.id}/tasks`);
    await page.reload();
    await nav("Bảng công việc");
    await page.locator(".task-create-form input").fill(title);
    const replay = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().endsWith(`/projects/${project.id}/tasks`),
    );
    await page.locator(".task-create-form button[type=submit]").click();
    const result = await replay;
    expect(result.status()).toBe(201);
    expect(result.headers()["idempotency-replayed"]).toBe("true");
    expect(result.request().headers()["idempotency-key"]).toBe(key);
    const task = await result.json();
    const tasks = await (
      await request.get(
        `${api}/api/v1/projects/${project.id}/tasks?q=${encodeURIComponent(title)}`,
        { headers: owner.headers },
      )
    ).json();
    expect(tasks.total).toBe(1);
    const child = await (
      await request.post(`${api}/api/v1/tasks/${task.id}/subtasks`, {
        headers: owner.headers,
        data: {
          title: "Member child",
          assignee_id: member.id,
          estimated_hours: 2,
        },
      })
    ).json();
    expect(child.version).toBe(1);
    await page.locator(".task-card").filter({ hasText: title }).click();
    await page
      .locator(".subtask-row")
      .filter({ hasText: "Member child" })
      .getByRole("button", { name: "Sửa", exact: true })
      .click();
    const edit = page.getByRole("form", { name: "Sửa việc con", exact: true });
    await edit
      .getByLabel("Tên việc con", { exact: true })
      .fill("Member child edited");
    await edit.getByLabel("Giờ dự kiến việc con", { exact: true }).fill("3");
    await edit.getByLabel("Giờ thực tế việc con", { exact: true }).fill("1");
    await edit
      .getByRole("button", { name: "Lưu việc con", exact: true })
      .click();
    await expect(edit).toHaveCount(0);
    const savedChild = (
      await (
        await request.get(`${api}/api/v1/tasks/${task.id}/subtasks`, {
          headers: owner.headers,
        })
      ).json()
    )[0];
    expect(savedChild).toMatchObject({
      title: "Member child edited",
      estimated_hours: 3,
      actual_hours: 1,
      version: 2,
    });
    await page
      .getByRole("dialog", { name: "Chi tiết công việc", exact: true })
      .getByRole("button", { name: "Đóng", exact: true })
      .click();
    await nav("Thành viên");
    const capacity = page.getByRole("spinbutton", {
      name: "Năng lực mỗi tuần stabm",
      exact: true,
    });
    await capacity.fill("20");
    const capacitySaved = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/members/${member.id}/capacity`) &&
        r.request().method() === "PATCH",
    );
    await capacity.press("Tab");
    expect((await capacitySaved).status()).toBe(200);
    await expect(
      page.getByRole("spinbutton", {
        name: "Năng lực mỗi tuần stabm",
        exact: true,
      }),
    ).toHaveValue("20");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await nav("Tổng quan");
    const before = await (
      await request.get(`${api}/api/v1/workspaces/${ws.id}/dashboard`, {
        headers: owner.headers,
      })
    ).json();
    expect(before.total_tasks).toBe(1);
    const changed = page.waitForResponse(
      async (r) =>
        r.url().endsWith(`/workspaces/${ws.id}/dashboard`) &&
        r.status() === 200 &&
        (await r.json()).total_tasks === 2,
    );
    await request.post(`${api}/api/v1/projects/${project.id}/tasks`, {
      headers: owner.headers,
      data: { title: "Refresh dashboard" },
    });
    expect((await (await changed).json()).total_tasks).toBe(2);
    const assigned = await (
      await request.get(
        `${api}/api/v1/projects/${project.id}/tasks?assignee_id=${member.id}&include_subtasks=true`,
        { headers: member.headers },
      )
    ).json();
    expect(
      assigned.items.some((item: { id: number }) => item.id === task.id),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});
