import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8'));
const places = catalog.places as { id: string; name: string }[];

async function login(request: APIRequestContext, account: 'a' | 'b') {
  const session = await request.get('/api/itineraries/session');
  expect(session.ok()).toBeTruthy();
  const { csrfToken } = await session.json();
  const response = await request.post('/__itinerary_test/login', {
    headers: { 'X-CSRF-TOKEN': csrfToken, Accept: 'application/json' }, data: { account },
  });
  expect(response.ok()).toBeTruthy();
}

async function clearTrips(request: APIRequestContext) {
  const session = await request.get('/api/itineraries/session');
  const { csrfToken } = await session.json();
  const response = await request.get('/api/itineraries');
  expect(response.ok()).toBeTruthy();
  for (const trip of (await response.json()).data) {
    expect((await request.delete('/api/itineraries/' + trip.id, { headers: { 'X-CSRF-TOKEN': csrfToken, Accept: 'application/json' } })).status()).toBe(204);
  }
}

async function addPlace(page: Page, index: number) {
  await page.getByPlaceholder('Tên, món chính hoặc địa chỉ').fill(places[index].name);
  await page.getByRole('list', { name: 'Kết quả tìm địa điểm' }).getByRole('button').filter({ hasText: places[index].name }).click();
}

async function dates(page: Page) {
  await page.getByRole('button', { name: /Ngày đi/ }).click();
  await page.getByLabel('Ngày bắt đầu').fill('2026-12-01');
  await page.getByLabel('Ngày kết thúc').fill('2026-12-02');
}

test.beforeEach(async ({ context }) => {
  await context.route('**/itinerary-config.json', route => route.fulfill({ json: { storage: 'api' } }));
  // Only catalog delivery is a fixture; all itinerary/auth/CSRF requests reach Laravel/MySQL.
  await context.route('**/data/catalog.json', route => route.fulfill({ json: catalog }));
  for (const account of ['a', 'b'] as const) {
    await login(context.request, account);
    await clearTrips(context.request);
  }
  await login(context.request, 'a');
});

test('manual itinerary saves through Laravel, reloads, reorders and separates two users', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Real HTTP requests must carry CSRF, unlike Laravel's in-process test bypass.
  expect((await context.request.post('/api/itineraries', { data: {} })).status()).toBe(419);
  await page.goto('/lich-trinh/tao-thu-cong');
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Chuyến đi kiểm thử MySQL');
  await dates(page);
  await addPlace(page, 0); await addPlace(page, 1);
  await page.getByRole('button', { name: 'Đưa điểm 2 lên trước', exact: true }).click();
  const created = page.waitForResponse(response => response.url().endsWith('/api/itineraries') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Lưu lịch trình', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const trip = (await response.json()).data;
  expect(trip.points.map((p: { placeId: string }) => p.placeId)).toEqual([places[1].id, places[0].id]);
  expect(trip.budget).toBeNull(); expect(trip.points[0].snapshot.price).toBe(0);
  await expect(page).toHaveURL(/\/lich-trinh\/chinh-sua$/);
  await page.reload();
  await expect(page.getByLabel('Tên chuyến đi', { exact: true })).toHaveValue('Chuyến đi kiểm thử MySQL');
  const updated = page.waitForResponse(r => r.url().endsWith('/api/itineraries/' + trip.id) && r.request().method() === 'PUT');
  await page.getByRole('button', { name: 'Đưa ' + places[0].name + ' lên trước', exact: true }).click();
  expect((await updated).status()).toBe(200);
  await page.reload();
  const saved = await context.request.get('/api/itineraries/' + trip.id);
  expect((await saved.json()).data.points.map((p: { placeId: string }) => p.placeId)).toEqual([places[0].id, places[1].id]);
  await expect(page.getByLabel('Tên chuyến đi', { exact: true })).toHaveValue('Chuyến đi kiểm thử MySQL');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await test.info().attach('manual-mysql', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await login(context.request, 'b');
  expect((await context.request.get('/api/itineraries/' + trip.id)).status()).toBe(404);
  await page.goto('/lich-trinh');
  await expect(page.getByText('Chưa có lịch trình nào. Tạo mới để bắt đầu.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a network failure preserves the manual draft and retry persists it', async ({ page }) => {
  await page.goto('/lich-trinh/tao-thu-cong');
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Bản nháp được giữ');
  await addPlace(page, 0);
  const saveButton = page.getByRole('button', { name: 'Lưu lịch trình', exact: true });
  await expect(saveButton).toBeEnabled();
  let interrupted = false;
  await page.route('**/api/itineraries', async route => {
    if (route.request().method() === 'POST') { interrupted = true; await route.abort('connectionfailed'); }
    else await route.continue();
  });
  await saveButton.click();
  await expect.poll(() => interrupted).toBe(true);
  await expect(page.getByRole('alert')).toContainText('Bản nháp vẫn được giữ');
  await page.unroute('**/api/itineraries');
  await expect(page.getByLabel('Tên chuyến đi', { exact: true })).toHaveValue('Bản nháp được giữ');
  await page.reload();
  await expect(page.getByLabel('Tên chuyến đi', { exact: true })).toHaveValue('Bản nháp được giữ');
  await page.getByRole('button', { name: 'Lưu lịch trình', exact: true }).click();
  await expect(page).toHaveURL(/\/lich-trinh\/chinh-sua$/);
});

test('suggestion preview uses real database IDs and only confirmation saves a trip', async ({ page, context }) => {
  await page.goto('/lich-trinh/tao-ai');
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill('Gợi ý kiểm thử MySQL');
  await dates(page);
  await page.getByRole('button', { name: 'Tạo gợi ý lịch trình', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Xem trước lịch trình', exact: true })).toBeVisible();
  await expect(page.getByText(/Gợi ý mô phỏng từ danh mục TravelGo/)).toBeVisible();
  const list = await context.request.get('/api/itineraries');
  expect((await list.json()).data).toEqual([]);
  await test.info().attach('preview-mysql', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  const created = page.waitForResponse(r => r.url().endsWith('/api/itineraries') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Lưu lịch trình và chỉnh sửa', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const trip = (await response.json()).data;
  expect(trip.source).toBe('ai-demo');
  expect(trip.points.every((p: { placeId: string }) => places.some(place => place.id === p.placeId))).toBe(true);
  await expect(page).toHaveURL(/\/lich-trinh\/chinh-sua$/);
  await page.reload();
  await expect(page.getByLabel('Tên chuyến đi', { exact: true })).toHaveValue('Gợi ý kiểm thử MySQL');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
