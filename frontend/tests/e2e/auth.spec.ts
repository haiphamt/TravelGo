import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("keeps both account forms fully visible in the available browser viewport", async ({ page }, testInfo) => {
  await page.setViewportSize(testInfo.project.name === "desktop"
    ? { width: 1270, height: 598 }
    : { width: 390, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const signUp = dialog.getByRole("button", { name: "Đăng ký ngay" });
  await expect(signUp).toBeInViewport({ ratio: 1 });
  await expect.poll(() => dialog.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);

  await signUp.click();
  await expect(dialog.getByLabel("Xác nhận mật khẩu")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Đăng nhập ngay" })).toBeInViewport({ ratio: 1 });
  await expect.poll(() => dialog.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
});

test("registers, restores the session, signs out and signs back in through TravelGo", async ({ page }) => {
  const email = `travelgo-${randomUUID()}@example.test`;
  const password = "TravelGo-test-2026!";
  await page.goto("/");
  const open = page.getByRole("button", { name: "Đăng nhập", exact: true });
  const dialog = page.getByRole("dialog");
  await open.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Tiếp tục với Google" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();

  await open.click();
  await dialog.getByRole("button", { name: "Đăng ký", exact: true }).click();
  await dialog.getByLabel("Họ và tên").fill("Khách TravelGo");
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await dialog.getByLabel("Xác nhận mật khẩu").fill("wrong-confirmation");
  const register = dialog.getByRole("button", { name: "Tạo tài khoản", exact: true });
  await register.click();
  await expect(dialog.getByRole("alert")).toContainText("chưa khớp");
  await dialog.getByLabel("Xác nhận mật khẩu").fill(password);
  await register.click();
  await expect(dialog).toBeHidden();

  const account = page.getByRole("link", { name: "Tài khoản của bạn", exact: true });
  await account.click();
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Đăng xuất", exact: true }).click();
  await expect(open).toBeVisible();

  await open.click();
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog.getByLabel("Mật khẩu", { exact: true }).fill("wrong-password");
  const login = dialog.locator("form").getByRole("button", { name: "Đăng nhập", exact: true });
  await login.click();
  await expect(dialog.getByRole("alert")).toContainText("Email hoặc mật khẩu");
  await dialog.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await login.click();
  await expect(account).toBeVisible();
  await expect(dialog).toBeHidden();
});
