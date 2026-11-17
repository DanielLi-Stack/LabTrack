import { test, expect, type Page } from "@playwright/test";

const password = process.env.E2E_PASSWORD!;
async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
}
async function logout(page: Page) { await page.getByRole("button", { name: "退出登录" }).click(); await expect(page).toHaveURL(/\/login/); }
const future = () => new Date(Date.now() + 72 * 3_600_000).toISOString().slice(0, 16);

test("administrator creates a persistent asset; members borrow and hand over", async ({ page }) => {
  test.skip(!password, "Set E2E_PASSWORD or use npm run test:e2e:local");
  await login(page, "e2e_admin");
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.goto("/equipment/new");
  await page.locator('input[name="assetCode"]').fill("EQ-E2E-UI");
  await page.locator('input[name="name"]').fill("浏览器测试仪器");
  await page.locator('input[name="category"]').fill("测试设备");
  await page.getByRole("button", { name: "创建设备" }).click();
  await expect(page.getByText("操作成功")).toBeVisible();
  await page.reload();
  await expect(page.getByText("浏览器测试仪器")).toBeVisible();
  await page.goto("/admin/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /设备台账/ }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/labtrack-equipment.*\.csv/);
  await logout(page);

  await login(page, "e2e_a");
  await page.goto("/equipment/new");
  await expect(page).toHaveURL(/\/equipment$/);
  const forbidden = await page.request.get("/api/export/loans");
  expect(forbidden.status()).toBe(403);
  await page.goto("/equipment");
  await page.locator('input[name="q"]').fill("EQ-E2E-SEED");
  await page.getByRole("button", { name: "搜索" }).click();
  await page.getByRole("link", { name: "查看详情" }).click();
  await page.locator('input[name="purpose"]').fill("浏览器借用测试");
  await page.locator('input[name="expectedReturnAt"]').fill(future());
  await page.getByRole("button", { name: "确认领用设备" }).click();
  await expect(page.getByText("操作成功")).toBeVisible();
  await page.goto("/my");
  await page.getByText("发起成员间交接").click();
  await page.locator('select[name="toUserId"]').selectOption({ label: "成员 B (e2e_b)" });
  await page.locator('input[name="expectedReturnAt"]').fill(future());
  await page.getByRole("button", { name: "发起交接" }).click();
  await expect(page.getByText("操作成功")).toBeVisible();
  await logout(page);

  await login(page, "e2e_b");
  await page.goto("/handovers");
  await page.getByRole("button", { name: "同意接收" }).first().click();
  await expect(page.getByText("操作成功")).toBeVisible();
  await logout(page);

  await login(page, "e2e_a");
  await page.goto("/handovers");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "确认已交出" }).first().click();
  await expect(page.getByText("操作成功")).toBeVisible();
  await logout(page);

  await login(page, "e2e_b");
  await page.goto("/handovers");
  await page.locator('input[name="bodyOk"]').first().check();
  await page.locator('input[name="accessoriesOk"]').first().check();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "确认已收到" }).first().click();
  await expect(page.getByText("操作成功")).toBeVisible();
  await page.goto("/my");
  await expect(page.getByRole("heading", { name: /当前借用/ })).toContainText("1 件");
  await expect(page.locator("article").getByRole("link", { name: "测试设备" }).first()).toBeVisible();
});
