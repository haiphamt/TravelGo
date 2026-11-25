import { expect, test } from "@playwright/test";

test("gates contributions and rooms while preserving destination after sign-in", async ({ page }) => {
  const contribution = "/dong-gop?place=tg-demo-11111111-1111-4111-8111-111111111111";
  const invitation = "/phong-cung-di?invite=12ab34cd";
  const gate = page.getByRole("dialog", { name: "Cần đăng nhập" });
  const protectedRequests: string[] = [];
  page.on("request", request => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/api\/(rooms|moderation)(\/|$)/.test(pathname)) protectedRequests.push(pathname);
  });

  await page.goto(contribution);
  await expect(gate).toContainText("theo dõi kết quả xét duyệt");
  await expect(gate).toHaveCSS("text-align", "center");
  expect(await gate.evaluate(dialog => getComputedStyle(dialog, "::backdrop").backdropFilter)).toBe("blur(5px)");
  expect(await gate.evaluate(dialog => {
    const { x, y, width, height } = dialog.getBoundingClientRect();
    return Math.abs(x + width / 2 - innerWidth / 2) < 2 && Math.abs(y + height / 2 - innerHeight / 2) < 2;
  })).toBe(true);
  await expect(page).toHaveURL(url => url.pathname + url.search === contribution);
  await expect(page.getByRole("heading", { name: "Đóng góp địa điểm", exact: true })).toHaveCount(0);
  await gate.getByRole("link", { name: "Về trang chủ" }).click();
  await expect(page).toHaveURL(url => url.pathname === "/");

  await page.goto(invitation);
  await expect(gate).toContainText("tham gia bằng mã mời");
  await expect(page.locator("#lobby-invite")).toHaveCount(0);
  expect(protectedRequests).toEqual([]);
  const signIn = gate.getByRole("button", { name: "Đăng nhập", exact: true });
  const dialog = page.getByRole("dialog", { name: "Đăng nhập TravelGo" });
  await signIn.click();
  await expect(dialog).toBeVisible();
  await expect(gate).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(signIn).toBeFocused();
  await signIn.click();

  await dialog.getByLabel("Email", { exact: true }).fill("itinerary-browser-a@example.invalid");
  await dialog.getByLabel("Mật khẩu", { exact: true }).fill("password");
  await dialog.locator("form").getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page.locator("#lobby-invite")).toHaveValue("12AB34CD", { timeout: 12_000 });
  await expect(gate).toHaveCount(0);
  await expect(page).toHaveURL(url => url.pathname + url.search === invitation);

  await page.goto(contribution);
  await expect(page.getByRole("heading", { name: "Đóng góp địa điểm", exact: true })).toBeVisible();
  await expect(page.getByText("Unauthenticated.", { exact: true })).toHaveCount(0);
});
