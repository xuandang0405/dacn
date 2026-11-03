import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

const apiUrl = process.env.E2E_API_URL || "http://localhost:8000";
const mailUrl = process.env.E2E_MAIL_URL || "http://localhost:8025";
const password = "E2E-Only-Strong-2026!";
const changedPassword = "E2E-Changed-Strong-2026!";
const recoveredPassword = "E2E-Recovered-Strong-2026!";

async function register(
  page: Page,
  email: string,
  username: string,
  name: string,
) {
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  await page.getByLabel("Họ tên", { exact: true }).fill(name);
  await page.getByLabel("Tên dùng để @mention", { exact: true }).fill(username);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  const login = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/login") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Tạo tài khoản", exact: true })
    .click();
  expect((await login).status()).toBe(200);
  await expect(page.locator(".sidebar-bottom")).toContainText(email);
}

async function nav(page: Page, label: string) {
  await page
    .locator("aside nav")
    .getByRole("button", { name: label, exact: true })
    .click();
}

test("real owner/member workflows, documents, realtime, session recovery and mobile", async ({
  browser,
  request,
}, testInfo) => {
  const stamp = Date.now().toString(36);
  const ownerEmail = `owner${stamp}@example.com`;
  const memberEmail = `member${stamp}@example.com`;
  const memberUsername = `member${stamp}`;
  const workspaceName = `Acceptance ${stamp}`;
  const projectName = `Project ${stamp}`;
  const taskTitle = `Task ${stamp}`;
  const memberContext = await browser.newContext({
    baseURL: process.env.E2E_UI_URL || "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
  });
  const ownerContext = await browser.newContext({
    baseURL: process.env.E2E_UI_URL || "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
  });
  const owner = await ownerContext.newPage();
  const member = await memberContext.newPage();
  owner.setDefaultTimeout(15000);
  member.setDefaultTimeout(15000);
  const errors: string[] = [];
  owner.on("pageerror", (error) => errors.push(error.message));
  member.on("pageerror", (error) => errors.push(error.message));
  let workspaceId = 0;
  let projectId = 0;
  let taskId = 0;
  let token = "";
  const apiHeaders = () => ({ Authorization: `Bearer ${token}` });
  try {
    await test.step("Login errors follow VI/EN and both users register through the UI", async () => {
      await owner.goto("/");
      await owner
        .getByLabel("Email", { exact: true })
        .fill("unknown@example.com");
      await owner.getByLabel("Mật khẩu", { exact: true }).fill(password);
      await owner
        .getByRole("button", { name: "Đăng nhập", exact: true })
        .click();
      await expect(owner.locator(".error")).toContainText(
        "Email hoặc mật khẩu không đúng",
      );
      await owner.getByRole("button", { name: "EN", exact: true }).click();
      await expect(owner.locator(".error")).toContainText(
        "Invalid credentials",
      );
      await owner.getByRole("button", { name: "VI", exact: true }).click();
      const loggedIn = owner.waitForResponse(
        (response) =>
          response.url().endsWith("/auth/login") && response.status() === 200,
      );
      await register(owner, ownerEmail, `owner${stamp}`, "Acceptance Owner");
      token = (await (await loggedIn).json()).access_token;
      await member.goto("/");
      await register(member, memberEmail, memberUsername, "Acceptance Member");
    });

    await test.step("Create workspace/project and accept a pending invitation", async () => {
      await owner
        .getByPlaceholder("Tên workspace", { exact: true })
        .fill(workspaceName);
      const createdWorkspace = owner.waitForResponse(
        (response) =>
          response.url().endsWith("/workspaces") &&
          response.request().method() === "POST",
      );
      await owner
        .getByRole("button", { name: "Tạo workspace", exact: true })
        .click();
      workspaceId = (await (await createdWorkspace).json()).id;
      await nav(owner, "Dự án");
      await owner
        .getByPlaceholder("Tên dự án mới", { exact: true })
        .fill(projectName);
      const createdProject = owner.waitForResponse(
        (response) =>
          response.url().endsWith(`/workspaces/${workspaceId}/projects`) &&
          response.request().method() === "POST",
      );
      await owner
        .getByRole("button", { name: "+ Tạo dự án", exact: true })
        .click();
      projectId = (await (await createdProject).json()).id;
      await nav(owner, "Thành viên");
      await owner.getByPlaceholder("email@company.com").fill(memberEmail);
      await owner
        .getByRole("button", { name: "Mời tài khoản", exact: true })
        .click();
      await expect(owner.locator(".success")).toContainText(
        "Người nhận cần chấp nhận",
      );
      await expect(owner.locator(".member-list")).not.toContainText(
        memberEmail,
      );
      const invitation = member
        .getByRole("region", { name: "Lời mời tham gia" })
        .locator(".inline-form")
        .filter({ hasText: workspaceName });
      await invitation
        .getByRole("button", { name: "Chấp nhận", exact: true })
        .click();
      await expect(member.locator(".workspace-select")).toContainText(
        workspaceName,
      );
      await nav(owner, "Dự án");
      await owner
        .locator(".project-row")
        .filter({ hasText: projectName })
        .click();
      await owner
        .getByLabel("Thêm thành viên dự án", { exact: true })
        .selectOption({ label: "Acceptance Member" });
      await member
        .locator(".workspace-select")
        .selectOption({ label: workspaceName });
      await nav(member, "Dự án");
      await expect(
        member.getByPlaceholder("Tên dự án mới", { exact: true }),
      ).toHaveCount(0);
      await member
        .locator(".project-row")
        .filter({ hasText: projectName })
        .click();
      await expect(
        member.getByRole("button", { name: "Cài đặt dự án", exact: true }),
      ).toHaveCount(0);
      await expect(
        member.getByPlaceholder("Tên cột mới", { exact: true }),
      ).toHaveCount(0);
    });

    await test.step("Create, assign and edit a task with real API and two live browser sessions", async () => {
      await owner
        .getByPlaceholder("Tên công việc mới...", { exact: true })
        .fill(taskTitle);
      const createdTask = owner.waitForResponse(
        (response) =>
          response.url().endsWith(`/projects/${projectId}/tasks`) &&
          response.request().method() === "POST",
      );
      await owner
        .getByRole("button", { name: "Tạo công việc", exact: true })
        .click();
      taskId = (await (await createdTask).json()).id;
      await expect(
        member.locator(".task-card").filter({ hasText: taskTitle }),
      ).toBeVisible();
      await owner.locator(".task-card").filter({ hasText: taskTitle }).click();
      const ownerDrawer = owner.getByRole("dialog", {
        name: "Chi tiết công việc",
      });
      await ownerDrawer
        .getByRole("combobox", { name: "Người thực hiện", exact: true })
        .selectOption({ label: "Acceptance Member" });
      await ownerDrawer
        .getByLabel("Ước lượng (giờ)", { exact: true })
        .fill("4");
      await ownerDrawer
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await expect(
        ownerDrawer.getByText("Lưu bản sửa trước khi chuyển cột.", {
          exact: true,
        }),
      ).toHaveCount(0);
      await member.locator(".task-card").filter({ hasText: taskTitle }).click();
      const memberDrawer = member.getByRole("dialog", {
        name: "Chi tiết công việc",
      });
      await memberDrawer.getByLabel("Thực tế (giờ)", { exact: true }).fill("8");
      await memberDrawer
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await expect(
        ownerDrawer.getByLabel("Thực tế (giờ)", { exact: true }),
      ).toHaveValue("8");
      await owner.screenshot({ path: testInfo.outputPath("task-owner.png") });
    });

    await test.step("Retain a dirty draft and reject its stale version instead of overwriting another member", async () => {
      const first = owner.getByRole("dialog", { name: "Chi tiết công việc" });
      const second = member.getByRole("dialog", { name: "Chi tiết công việc" });
      await first
        .getByLabel("Tiêu đề", { exact: true })
        .fill(`${taskTitle} draft`);
      await second.getByLabel("Thực tế (giờ)", { exact: true }).fill("10");
      await second
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await expect(first.getByLabel("Tiêu đề", { exact: true })).toHaveValue(
        `${taskTitle} draft`,
      );
      await expect
        .poll(
          async () =>
            (
              await (
                await request.get(`${apiUrl}/api/v1/tasks/${taskId}`, {
                  headers: apiHeaders(),
                })
              ).json()
            ).actual_hours,
        )
        .toBe(10);
      await first
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await expect(first.locator(".error")).toContainText(
        "người khác cập nhật",
      );
      await first
        .getByRole("button", {
          name: "Bỏ bản sửa và tải dữ liệu mới",
          exact: true,
        })
        .click();
      await expect(first.getByLabel("Tiêu đề", { exact: true })).toHaveValue(
        taskTitle,
      );
      await expect(
        first.getByLabel("Thực tế (giờ)", { exact: true }),
      ).toHaveValue("10");
    });

    await test.step("Subtasks and comments update both open drawers without reloading", async () => {
      const first = owner.getByRole("dialog", { name: "Chi tiết công việc" });
      const second = member.getByRole("dialog", { name: "Chi tiết công việc" });
      await first
        .getByPlaceholder("Tên việc con mới...", { exact: true })
        .fill("Live child task");
      await first
        .locator("form")
        .filter({
          has: owner.getByPlaceholder("Tên việc con mới...", { exact: true }),
        })
        .getByRole("button", { name: "+ Thêm", exact: true })
        .click();
      await expect(second.locator(".subtask-row")).toContainText(
        "Live child task",
      );
      await first
        .getByPlaceholder("Viết bình luận. Mention bằng @username...", {
          exact: true,
        })
        .fill(`@${memberUsername} please review`);
      await first
        .getByRole("button", { name: "Gửi bình luận", exact: true })
        .click();
      await expect(second.locator(".comment")).toContainText("please review");
      await first
        .getByRole("combobox", { name: "Chuyển sang cột", exact: true })
        .selectOption({ label: "Hoàn thành" });
      await expect
        .poll(
          async () =>
            (
              await (
                await request.get(
                  `${apiUrl}/api/v1/projects/${projectId}/analytics`,
                  { headers: apiHeaders() },
                )
              ).json()
            ).mape,
        )
        .toBe(60);
      await first.getByRole("button", { name: "Đóng", exact: true }).click();
      await second.getByRole("button", { name: "Đóng", exact: true }).click();
      await expect(
        member
          .locator(".kanban-column")
          .filter({ hasText: "Hoàn thành" })
          .locator(".task-card"),
      ).toContainText(taskTitle);
    });

    await test.step("Skill ratings can be cleared, and members cannot modify the matrix", async () => {
      await nav(owner, "Kỹ năng");
      await owner
        .getByPlaceholder("Thêm kỹ năng mới", { exact: true })
        .fill("Acceptance Skill");
      await owner
        .locator("form")
        .filter({
          has: owner.getByPlaceholder("Thêm kỹ năng mới", { exact: true }),
        })
        .getByRole("button", { name: "+ Thêm", exact: true })
        .click();
      const rating = owner.getByLabel("Acceptance Skill - Acceptance Member", {
        exact: true,
      });
      await rating.selectOption("3");
      await expect(rating).toHaveValue("3");
      await expect(rating).toBeEnabled();
      await rating.selectOption("0");
      await expect(rating).toHaveValue("0");
      await nav(member, "Kỹ năng");
      await expect(
        member.getByLabel("Acceptance Skill - Acceptance Member", {
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        member.getByPlaceholder("Thêm kỹ năng mới", { exact: true }),
      ).toHaveCount(0);
    });

    await test.step("Upload real PDF DOCX and text documents; AI requires project context", async () => {
      await nav(owner, "AI Assistant");
      await expect(
        owner.getByRole("button", { name: "Hỏi Gemini", exact: true }),
      ).toBeDisabled();
      const files = owner.locator('input[type="file"]');
      await expect(files).toBeEnabled();
      await files.setInputFiles({
        name: "invalid.exe",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("invalid"),
      });
      await expect(owner.locator(".error")).toContainText("Chỉ hỗ trợ PDF");
      const fixture = path.resolve(__dirname, "fixtures");
      for (const filename of ["project.txt", "project.pdf", "project.docx"]) {
        await expect(files).toBeEnabled();
        await files.setInputFiles(path.join(fixture, filename));
        await expect(
          owner.locator(".document-row").filter({ hasText: filename }),
        ).toBeVisible();
      }
      await expect(files).toBeDisabled();
      await owner
        .getByLabel("Câu hỏi về dự án", { exact: true })
        .fill("Mục tiêu chính của dự án là gì?");
      await expect(
        owner.getByRole("button", { name: "Hỏi Gemini", exact: true }),
      ).toBeEnabled();
      if (process.env.E2E_LIVE_AI === "1") {
        await owner
          .getByRole("button", { name: "Hỏi Gemini", exact: true })
          .click();
        await expect(owner.locator(".ai-answer")).toBeVisible({
          timeout: 90000,
        });
      }
      await owner.screenshot({ path: testInfo.outputPath("documents.png") });
    });

    await test.step("Settings persist, empty names show errors, and a second workspace can be created", async () => {
      await nav(owner, "Cài đặt");
      await owner
        .getByLabel("Tên workspace", { exact: true })
        .fill(`${workspaceName} updated`);
      await owner
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await expect(owner.locator(".success")).toContainText("Đã lưu workspace");
      await owner.getByLabel("Tên workspace", { exact: true }).fill("   ");
      await owner
        .getByRole("button", { name: "Lưu thay đổi", exact: true })
        .click();
      await expect(owner.locator(".error")).toBeVisible();
      await expect(owner.locator(".success")).toHaveCount(0);
      await owner
        .getByRole("button", { name: "Thêm workspace", exact: true })
        .click();
      await owner
        .locator(".new-workspace-form")
        .getByLabel("Tên workspace", { exact: true })
        .fill(`Second ${stamp}`);
      await owner
        .locator(".new-workspace-form")
        .getByRole("button", { name: "Tạo workspace", exact: true })
        .click();
      await expect(
        owner
          .locator(".workspace-select")
          .locator("option")
          .filter({ hasText: `Second ${stamp}` }),
      ).toHaveCount(1);
      await owner
        .locator(".workspace-select")
        .selectOption(String(workspaceId));
      await owner.reload();
      await expect(owner.locator(".workspace-select")).toContainText(
        `${workspaceName} updated`,
      );
    });

    await test.step("Mobile navigation and analytics remain usable", async () => {
      await owner.setViewportSize({ width: 390, height: 844 });
      await owner.getByRole("button", { name: "Mở menu", exact: true }).click();
      await nav(owner, "Phân tích");
      await expect.poll(async () => {
        const bounds = await owner.locator("aside").boundingBox();
        return bounds ? bounds.x + bounds.width : 0;
      }).toBeLessThanOrEqual(1);
      await expect(
        owner.locator(".analytics-card").filter({ hasText: projectName }),
      ).toContainText("60%");
      const overflow = await owner.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(overflow).toBe(false);
      await owner.screenshot({
        path: testInfo.outputPath("mobile-analytics.png"),
      });
      await owner.setViewportSize({ width: 1440, height: 1000 });
    });

    await test.step("Password change ends the current session and SMTP recovery uses a real local mailbox", async () => {
      await nav(owner, "Cài đặt");
      await owner
        .getByLabel("Mật khẩu hiện tại", { exact: true })
        .fill(password);
      await owner
        .getByLabel("Mật khẩu mới", { exact: true })
        .fill(changedPassword);
      await owner
        .getByRole("button", { name: "Cập nhật mật khẩu", exact: true })
        .click();
      await expect(
        owner.getByRole("button", { name: "Đăng nhập", exact: true }),
      ).toBeVisible();
      await expect(owner.locator(".success")).toContainText("Mật khẩu đã đổi");
      await owner
        .getByRole("button", { name: "Quên mật khẩu?", exact: true })
        .click();
      await owner.getByLabel("Email", { exact: true }).fill(ownerEmail);
      await owner
        .getByRole("button", { name: "Gửi email", exact: true })
        .click();
      await expect(owner.locator(".success")).toContainText(
        "liên kết khôi phục",
      );
      let mailId = "";
      await expect
        .poll(async () => {
          const messages = await (
            await request.get(`${mailUrl}/api/v1/messages`)
          ).json();
          const mail = messages.messages.find(
            (row: { To: unknown; ID: string }) =>
              JSON.stringify(row.To).includes(ownerEmail),
          );
          mailId = mail?.ID || "";
          return Boolean(mailId);
        })
        .toBe(true);
      const message = await (
        await request.get(`${mailUrl}/api/v1/message/${mailId}`)
      ).json();
      const reset = message.Text.match(
        /Reset your password:\s*(https?:\/\/\S+)/,
      )?.[1];
      expect(Boolean(reset)).toBe(true);
      if (!reset) throw new Error("Recovery email did not contain a reset link");
      await owner.goto(reset);
      await owner
        .getByLabel("Mật khẩu", { exact: true })
        .fill(recoveredPassword);
      await owner
        .getByRole("button", { name: "Đổi mật khẩu", exact: true })
        .click();
      await expect(
        owner.getByRole("button", { name: "Đăng nhập", exact: true }),
      ).toBeVisible();
      await owner.getByLabel("Email", { exact: true }).fill(ownerEmail);
      await owner
        .getByLabel("Mật khẩu", { exact: true })
        .fill(recoveredPassword);
      await owner
        .getByRole("button", { name: "Đăng nhập", exact: true })
        .click();
      await expect(owner.locator(".sidebar-bottom")).toContainText(ownerEmail);
      expect(
        (
          await request.get(`${apiUrl}/api/v1/auth/me`, {
            headers: apiHeaders(),
          })
        ).status(),
      ).toBe(401);
    });
    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([ownerContext.close(), memberContext.close()]);
  }
});
