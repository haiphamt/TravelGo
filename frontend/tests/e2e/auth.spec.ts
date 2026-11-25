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
  const loginBox = await dialog.boundingBox();
  await expect(dialog.locator(".auth-modes button[aria-pressed=true]")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect.poll(() => dialog.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);

  await signUp.click();
  await expect(dialog.getByLabel("Xác nhận mật khẩu")).toBeVisible();
  expect(await dialog.boundingBox()).toEqual(loginBox);
  await expect(dialog.locator(".auth-modes button[aria-pressed=true]")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(dialog.getByRole("button", { name: "Đăng nhập ngay" })).toBeInViewport({ ratio: 1 });
  await expect.poll(() => dialog.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);

  await page.goto("/tai-khoan?dang-nhap=1");
  await expect(dialog).toHaveAccessibleName("Đăng nhập TravelGo");
  await expect(dialog).toBeFocused();
  await expect(dialog).toHaveCSS("outline-style", "none");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Đóng hộp thoại" })).toBeFocused();
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

  const account = page.getByRole("button", { name: "Menu tài khoản", exact: true });
  const options = page.getByRole("navigation", { name: "Tùy chọn tài khoản", exact: true });
  const profile = options.getByRole("link", { name: "Tài khoản của bạn", exact: true });
  await expect(account).toHaveText("KT");
  await expect(account).toHaveCSS("color", "rgb(255, 255, 255)");
  await account.focus();
  await page.keyboard.press("Enter");
  await expect(account).toHaveAttribute("aria-expanded", "true");
  await expect(options.getByRole("link", { name: "Quản trị", exact: true })).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(profile).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
  await expect(account).toBeFocused();
  await account.click();
  await profile.click();
  await expect(options).toBeHidden();
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /Địa điểm yêu thích/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Quản trị viên/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Chỉnh sửa" }).click();
  const profileName = page.getByRole("textbox", { name: "Họ và tên", exact: true });
  const saveProfile = page.getByRole("button", { name: "Lưu thay đổi" });
  await expect(profileName).toBeFocused();
  await profileName.fill(" ");
  await saveProfile.click();
  await expect(page.getByRole("alert")).toContainText("Hãy nhập họ và tên");
  await page.getByRole("button", { name: "Hủy" }).click();
  await expect(page.getByText("Khách TravelGo", { exact: true }).filter({ visible: true })).toBeVisible();

  await page.getByRole("button", { name: "Chỉnh sửa" }).click();
  await profileName.fill("Du khách TravelGo");
  await saveProfile.click();
  await expect(page.getByRole("status").filter({ hasText: "Đã cập nhật họ và tên" })).toBeVisible();
  await expect(account).toHaveText("DT");
  await page.reload();
  await expect(page.getByText(email, { exact: false })).toBeVisible();
  await expect(page.getByText("Du khách TravelGo", { exact: true }).filter({ visible: true })).toBeVisible();
  await account.click();
  await page.getByRole("heading", { name: "Hoạt động của bạn", exact: true }).click();
  await expect(options).toBeHidden();
  await account.click();
  await options.getByRole("button", { name: "Đăng xuất", exact: true }).click();
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
