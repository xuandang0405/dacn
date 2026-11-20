import { test, expect, type Page } from "@playwright/test";

const apiUrl = process.env.E2E_API_URL || "http://localhost:8000";
const password = "Review-Only-Strong-2026!";

async function nav(page: Page, name: string) {
  await page
    .locator("aside nav")
    .getByRole("button", { name, exact: true })
    .click();
}

test("assignment stays correct across two users, access changes and the simplified UI", async ({
  browser,
  request,
}, testInfo) => {
  const stamp = Date.now().toString(36);
  async function account(prefix: string, name: string) {
    const username = `${prefix}${stamp}`;
    const email = `${username}@example.com`;
    expect(
      (
        await request.post(`${apiUrl}/api/v1/auth/register`, {
          data: { username, email, name, password },
        })
      ).status(),
    ).toBe(201);
    const login = await request.post(`${apiUrl}/api/v1/auth/login`, {
      data: { email, password },
    });
    expect(login.status()).toBe(200);
    const headers = {
      Authorization: `Bearer ${(await login.json()).access_token}`,
    };
    const user = await (
      await request.get(`${apiUrl}/api/v1/auth/me`, { headers })
    ).json();
    return { email, username, headers, id: user.id, name };
  }
  const owner = await account("reviewo", "Review Owner");
  const first = await account("reviewa", "Review Member A");
  const second = await account("reviewb", "Review Member B");
  const workspace = await (
    await request.post(`${apiUrl}/api/v1/workspaces`, {
      headers: owner.headers,
      data: { name: `Assignment review ${stamp}` },
    })
  ).json();
  const project = await (
    await request.post(`${apiUrl}/api/v1/workspaces/${workspace.id}/projects`, {
      headers: owner.headers,
      data: { name: `Assignment project ${stamp}` },
    })
  ).json();
  for (const person of [first, second]) {
    expect(
      (
        await request.post(
          `${apiUrl}/api/v1/workspaces/${workspace.id}/members`,
          { headers: owner.headers, data: { email: person.email } },
        )
      ).status(),
    ).toBe(201);
    const invite = (
      await (
        await request.get(`${apiUrl}/api/v1/invitations`, {
          headers: person.headers,
        })
      ).json()
    )[0];
    expect(
      (
        await request.post(`${apiUrl}/api/v1/invitations/respond`, {
          headers: person.headers,
          data: { token: invite.token, accept: true },
        })
      ).status(),
    ).toBe(200);
  }
  expect(
    (
      await request.post(
        `${apiUrl}/api/v1/projects/${project.id}/members/${first.id}`,
        { headers: owner.headers },
      )
    ).status(),
  ).toBe(201);
  const ownerContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const memberContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const manager = await ownerContext.newPage();
  const member = await memberContext.newPage();
  const pageErrors: string[] = [];
  for (const page of [manager, member])
    page.on("pageerror", (error) => pageErrors.push(error.message));
  async function login(page: Page, email: string) {
    await page.goto(process.env.E2E_UI_URL || "http://localhost:3000");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
    await expect(page.locator(".workspace-select")).toHaveValue(
      String(workspace.id),
    );
  }
  let taskId = 0;
  const title = `Công việc được giao ${stamp}`;
  const detail = () =>
    manager.getByRole("dialog", { name: "Chi tiết công việc", exact: true });
  async function saveAssignee(value: string) {
    await detail()
      .getByLabel("Người thực hiện", { exact: true })
      .selectOption(value);
    const response = manager.waitForResponse(
      (r) =>
        r.url().endsWith(`/tasks/${taskId}`) &&
        r.request().method() === "PATCH",
    );
    await detail()
      .getByRole("button", { name: "Lưu thay đổi", exact: true })
      .click();
    expect((await response).status()).toBe(200);
    await expect(detail().getByRole("status")).toContainText("Đã lưu thay đổi");
  }
  try {
    await Promise.all([
      login(manager, owner.email),
      login(member, first.email),
    ]);
    await nav(manager, "Bảng công việc");
    await nav(member, "Công việc của tôi");
    await expect(
      member.getByText("Chưa có công việc nào được phân công.", {
        exact: true,
      }),
    ).toBeVisible();

    await test.step("Only eligible people can receive a task; assignment is available during creation", async () => {
      const assignee = manager.getByLabel("Giao cho", { exact: true });
      await expect(assignee.locator(`option[value='${first.id}']`)).toHaveCount(
        1,
      );
      await expect(
        assignee.locator(`option[value='${second.id}']`),
      ).toHaveCount(0);
      await manager
        .getByLabel("Thêm thành viên dự án", { exact: true })
        .selectOption({ label: second.name });
      await expect(
        assignee.locator(`option[value='${second.id}']`),
      ).toHaveCount(1);
      await manager.getByLabel("Công việc mới", { exact: true }).fill(title);
      await assignee.selectOption(String(first.id));
      const created = manager.waitForResponse(
        (r) =>
          r.url().endsWith(`/projects/${project.id}/tasks`) &&
          r.request().method() === "POST",
      );
      await manager
        .getByRole("button", { name: "Tạo công việc", exact: true })
        .click();
      const response = await created;
      expect(response.status()).toBe(201);
      const task = await response.json();
      taskId = task.id;
      expect(task.assignee_id).toBe(first.id);
      // API/AI estimates need not be multiples of a quarter-hour.
      expect(
        (
          await request.patch(`${apiUrl}/api/v1/tasks/${task.id}`, {
            headers: owner.headers,
            data: { version: task.version, estimated_hours: 1.1 },
          })
        ).status(),
      ).toBe(200);
      await expect(
        manager
          .locator(".task-card")
          .filter({ hasText: title })
          .locator(".task-assignee"),
      ).toContainText(first.name);
      await expect(
        member.locator(".project-row").filter({ hasText: title }),
      ).toBeVisible();
    });

    await test.step("My tasks opens the chosen task directly, not just its project", async () => {
      await member.locator(".project-row").filter({ hasText: title }).click();
      const drawer = member.getByRole("dialog", {
        name: "Chi tiết công việc",
        exact: true,
      });
      await expect(drawer.getByLabel("Tiêu đề", { exact: true })).toHaveValue(
        title,
      );
      await expect(
        drawer.getByLabel("Người thực hiện", { exact: true }),
      ).toHaveValue(String(first.id));
      await expect(
        drawer.getByLabel("Ước lượng (giờ)", { exact: true }),
      ).toHaveValue("1.1");
      expect(
        await drawer
          .getByLabel("Ước lượng (giờ)", { exact: true })
          .evaluate((input: HTMLInputElement) => input.validity.valid),
      ).toBe(true);
      await drawer.getByRole("button", { name: "Đóng", exact: true }).click();
      await nav(member, "Công việc của tôi");
    });

    await test.step("Reassigning, restoring and clearing assignment updates My tasks without reload", async () => {
      await manager.locator(".task-card").filter({ hasText: title }).click();
      await saveAssignee(String(second.id));
      await expect(
        member.locator(".project-row").filter({ hasText: title }),
      ).toHaveCount(0);
      await saveAssignee(String(first.id));
      await expect(
        member.locator(".project-row").filter({ hasText: title }),
      ).toBeVisible();
      await saveAssignee("0");
      await expect(
        member.locator(".project-row").filter({ hasText: title }),
      ).toHaveCount(0);
      await detail().getByRole("button", { name: "Đóng", exact: true }).click();
      await manager
        .getByLabel("Lọc người thực hiện", { exact: true })
        .selectOption("-1");
      await expect(
        manager.locator(".task-card").filter({ hasText: title }),
      ).toBeVisible();
      await manager
        .getByLabel("Lọc người thực hiện", { exact: true })
        .selectOption("0");
    });

    await test.step("Unsaved edits require a deliberate discard and conflicts preserve the draft", async () => {
      await manager.locator(".task-card").filter({ hasText: title }).click();
      await detail()
        .getByLabel("Tiêu đề", { exact: true })
        .fill(`${title} chưa lưu`);
      manager.once("dialog", (dialog) => dialog.dismiss());
      await detail().getByRole("button", { name: "Đóng", exact: true }).click();
      await expect(detail()).toBeVisible();
      manager.once("dialog", (dialog) => dialog.accept());
      await detail().getByRole("button", { name: "Đóng", exact: true }).click();
      await expect(detail()).toHaveCount(0);
      await manager.locator(".task-card").filter({ hasText: title }).click();
      await expect(detail().getByLabel("Tiêu đề", { exact: true })).toHaveValue(
        title,
      );
      await detail()
        .getByLabel("Tiêu đề", { exact: true })
        .fill(`${title} draft`);
      const task = await (
        await request.get(`${apiUrl}/api/v1/tasks/${taskId}`, {
          headers: first.headers,
        })
      ).json();
      expect(
        (
          await request.patch(`${apiUrl}/api/v1/tasks/${taskId}`, {
            headers: first.headers,
            data: { version: task.version, actual_hours: 2 },
          })
        ).status(),
      ).toBe(200);
      await expect(detail().getByRole("status")).toContainText(
        "Bản sửa của bạn vẫn được giữ",
      );
      await detail()
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await expect(detail().getByRole("alert")).toBeVisible();
      await detail()
        .getByRole("button", {
          name: "Bỏ bản sửa và tải dữ liệu mới",
          exact: true,
        })
        .click();
      await expect(detail().getByLabel("Tiêu đề", { exact: true })).toHaveValue(
        title,
      );
      await expect(
        detail().getByLabel("Thực tế (giờ)", { exact: true }),
      ).toHaveValue("2");
      await detail().getByRole("button", { name: "Đóng", exact: true }).click();
    });

    await test.step("Failed offline creation reports an error, then retry stores a single task", async () => {
      const offlineTitle = `Thử mất mạng ${stamp}`;
      await manager
        .getByLabel("Công việc mới", { exact: true })
        .fill(offlineTitle);
      await ownerContext.setOffline(true);
      await manager
        .getByRole("button", { name: "Tạo công việc", exact: true })
        .click();
      await expect(manager.locator(".error")).toBeVisible();
      await expect(
        manager.locator(".task-card").filter({ hasText: offlineTitle }),
      ).toHaveCount(0);
      await ownerContext.setOffline(false);
      await manager
        .getByRole("button", { name: "Tạo công việc", exact: true })
        .click();
      await expect(
        manager.locator(".task-card").filter({ hasText: offlineTitle }),
      ).toHaveCount(1);
    });

    await test.step("VI/EN, bundled fonts and a narrow screen remain usable", async () => {
      await manager.getByRole("button", { name: "EN", exact: true }).click();
      await expect(
        manager.getByLabel("Assign to", { exact: true }),
      ).toBeVisible();
      await manager.getByRole("button", { name: "VI", exact: true }).click();
      await manager.evaluate(() => document.fonts.ready);
      const fonts = await manager.evaluate(() => {
        const style = getComputedStyle(document.body);
        return {
          family: style.fontFamily,
          bundled: style.getPropertyValue("--font-inter").trim(),
        };
      });
      expect(fonts.bundled).not.toBe("");
      expect(fonts.family).not.toContain("Times New Roman");
      await manager.screenshot({
        path: testInfo.outputPath("assignment-board-desktop.png"),
        fullPage: true,
      });
      await manager.setViewportSize({ width: 390, height: 844 });
      expect(
        await manager.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
      ).toBe(false);
      await manager.screenshot({
        path: testInfo.outputPath("assignment-board-mobile.png"),
        fullPage: true,
      });
      await manager
        .getByRole("button", { name: "Mở menu", exact: true })
        .click();
      await nav(manager, "Công việc của tôi");
      await expect(
        manager.getByRole("heading", {
          name: "Công việc được giao",
          exact: true,
        }),
      ).toBeVisible();
      expect(
        await manager.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
      ).toBe(false);
    });
    expect(pageErrors).toEqual([]);
  } finally {
    await Promise.allSettled([ownerContext.close(), memberContext.close()]);
    // Delete only the workspace created by this test, preserving seeded demo data.
    if (workspace.id)
      await request.delete(`${apiUrl}/api/v1/workspaces/${workspace.id}`, {
        headers: owner.headers,
      });
  }
});
