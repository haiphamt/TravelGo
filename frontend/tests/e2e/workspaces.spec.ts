import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  await dialog.getByLabel("Mật khẩu", { exact: true }).fill("password");
  await dialog.locator("form").getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function checkWorkspace(page: Page, workspace: {
  label: string;
  path: string;
  heading: string;
  image: string;
}) {
  await expect(page.getByRole("heading", { name: workspace.heading, exact: true })).toBeVisible();
  const brand = page.getByRole("link", { name: "TravelGo – Trang chủ " + workspace.label, exact: true });
  await expect(brand).toHaveText("TravelGo");
  await expect(brand).toHaveAttribute("href", workspace.path);
  await expect(brand.locator("img")).toHaveAttribute("src", "images/travelgo-mark.svg");
  await expect(page.getByRole("search", { name: "Tìm phường hoặc xã" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toHaveCount(0);
  await expect(page.getByText("Dữ liệu theo tài khoản của bạn", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Về trang Người dùng", { exact: true })).toHaveCount(0);
  await expect(page.getByText("TravelGo · Bản dùng thử", { exact: true })).toHaveCount(0);

  await brand.click();
  await expect(page).toHaveURL(new RegExp(workspace.path + "$"));
  const cover = page.locator(`img[src="images/workspaces/${workspace.image}"]`);
  await expect(cover).toBeVisible();
  await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(520);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

  const menu = page.getByRole("button", { name: "Mở menu khu vực" });
  if (await menu.isVisible()) {
    await menu.click();
    const rail = page.getByRole("dialog", { name: "Menu " + workspace.label });
    await expect(rail.getByRole("navigation", { name: "Điều hướng " + workspace.label })).toBeVisible();
    await rail.getByRole("button", { name: "Đóng menu khu vực" }).click();
    await expect(rail).toBeHidden();
  }
  await page.getByRole("link", { name: "Tài khoản của bạn", exact: true }).click();
  await expect(page).toHaveURL(/\/tai-khoan$/);
  await expect(page.getByRole("heading", { name: "Thông tin cá nhân", exact: true })).toBeVisible();
}

test("owner and admin use their own workspace with enforced roles and account access", async ({ page }) => {
  await page.goto("/chu-co-so");
  await expect(page).toHaveURL(/\/tai-khoan$/);

  await page.goto("/");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await signIn(page, "itinerary-browser-a@example.invalid");
  const coffeeId = "tg-demo-11111111-1111-4111-8111-111111111111";
  await page.request.get("/api/auth/session");
  const csrf = (await page.context().cookies()).find(cookie => cookie.name === "XSRF-TOKEN");
  expect(csrf).toBeDefined();
  const review = await page.request.post("/api/reviews", {
    headers: { "X-XSRF-TOKEN": decodeURIComponent(csrf!.value), Accept: "application/json" },
    data: {placeId: coffeeId, rating: 4, text: "Đánh giá kiểm thử", visitedOn: null, photos: []},
  });
  await expect(review).toBeOK();
  await page.goto("/quan-tri");
  await expect(page).toHaveURL(/\/tai-khoan$/);
  await expect(page.getByRole("status").filter({ hasText: "Đổi tài khoản" })).toBeVisible();
  const account = page.getByRole("button", { name: "Menu tài khoản", exact: true });
  const options = page.getByRole("navigation", { name: "Tùy chọn tài khoản", exact: true });
  await account.click();
  await expect(options.getByRole("link", { name: "Quản trị", exact: true })).toHaveCount(0);
  await options.getByRole("link", { name: "Chủ cơ sở", exact: true }).click();
  await expect(page).toHaveURL(/\/chu-co-so$/);
  await page.goto("/chu-co-so?view=claim");
  await checkWorkspace(page, {
    label: "Chủ cơ sở",
    path: "/chu-co-so",
    heading: "Xin quyền quản lý",
    image: "cho-binh-tay.webp",
  });

  await account.click();
  await options.getByRole("button", { name: "Đổi tài khoản", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/\/tai-khoan$/);
  await signIn(page, "moderation-browser@example.invalid");
  await expect(page).toHaveURL(/\/quan-tri$/);
  await expect(page.getByRole("heading", { name: "Tổng quan quản trị", exact: true })).toBeVisible();
  await page.goto("/quan-tri?loai=claim");
  await checkWorkspace(page, {
    label: "Quản trị viên",
    path: "/quan-tri",
    heading: "Yêu cầu quản lý",
    image: "bao-tang-thanh-pho.webp",
  });
  await account.click();
  await options.getByRole("link", { name: "Quản trị", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tổng quan quản trị", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hoạt động trên TravelGo", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Địa điểm được đánh giá nhiều nhất", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /TravelGo Demo Cà phê Một/ })).toHaveAttribute("href", "/dia-diem/" + coffeeId);

  await page.goto("/quan-tri?view=queue");
  await expect(page.getByRole("heading", { name: "Hàng đợi xét duyệt", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Danh sách yêu cầu", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
