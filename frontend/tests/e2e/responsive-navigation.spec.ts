import { expect, test } from "@playwright/test";

test("compact navigation keeps search, area filters and account access usable", async ({ page, context }, testInfo) => {
  const width = testInfo.project.name === "desktop" ? 960 : 320;
  await page.setViewportSize({ width, height: 820 });
  await page.goto("/");

  const mobileNav = page.getByRole("navigation", { name: "Điều hướng trên điện thoại" });
  await expect(mobileNav).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: "Trang chủ" })).toHaveAttribute("aria-current", "page");
  const vouchers = page.getByRole("list", { name: "Các voucher minh họa" });
  const voucherBounds = await vouchers.evaluate(list => {
    const viewport = list.getBoundingClientRect();
    const cards = [...list.children].map(card => card.getBoundingClientRect());
    return { right: viewport.right, first: cards[0].right, second: cards[1].right, scrollable: list.scrollWidth > list.clientWidth };
  });
  expect(voucherBounds.scrollable).toBe(true);
  expect(voucherBounds.first).toBeLessThan(voucherBounds.right);
  if (testInfo.project.name === "desktop") expect(voucherBounds.second).toBeLessThanOrEqual(voucherBounds.right + 1);
  const searchButton = page.getByRole("button", { name: "Mở tìm kiếm" });
  const keyword = page.getByRole("textbox", { name: "Tìm địa điểm hoặc món ăn tại TP.HCM" });
  await expect(keyword).toBeHidden();
  await searchButton.click();
  await expect(keyword).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(searchButton).toBeFocused();
  await expect(keyword).toBeHidden();

  await searchButton.click();
  await keyword.fill("cà phê");
  await page.getByRole("searchbox", { name: "Lọc theo phường hoặc xã trong địa chỉ nguồn" }).fill("Quận 1");
  await page.getByRole("button", { name: "Áp dụng tìm phường hoặc xã" }).click();
  await expect(page).toHaveURL(/\/kham-pha\?/);
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toMatchObject({ q: "cà phê", area: "Quận 1" });
  await expect(keyword).toBeHidden();
  await expect(mobileNav.getByRole("link", { name: "Khám phá" })).toHaveAttribute("aria-current", "page");

  await mobileNav.getByRole("link", { name: "Hồ sơ" }).click();
  await expect(page).toHaveURL(/\/tai-khoan$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 10.777, longitude: 106.700 });
  await page.getByRole("link", { name: "Tìm gần vị trí của bạn" }).click();
  await expect(page.getByText("Danh sách địa điểm trong bán kính 5 km quanh bạn.")).toBeVisible();
  await expect(page).toHaveURL(/\/ban-do$/);
});
