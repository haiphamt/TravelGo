import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8'));
const places = catalog.places as { id: string; name: string }[];

async function configure(context: BrowserContext) {
  await context.route('**/itinerary-config.json', route => route.fulfill({ json: { storage: 'api' } }));
  await context.route('**/data/catalog.json', route => route.fulfill({ json: catalog }));
}

async function login(request: APIRequestContext, account: 'a' | 'b') {
  const session = await request.get('/api/itineraries/session');
  const { csrfToken } = await session.json();
  expect((await request.post('/__itinerary_test/login', {
    headers: { 'X-CSRF-TOKEN': csrfToken, Accept: 'application/json' }, data: { account },
  })).ok()).toBeTruthy();
}

async function headers(request: APIRequestContext) {
  const session = await request.get('/api/itineraries/session');
  return { 'X-CSRF-TOKEN': (await session.json()).csrfToken, Accept: 'application/json' };
}

async function openRoom(page: Page, title: string) {
  await page.goto('/phong-cung-di');
  await page.getByRole('button', { name: 'Vào phòng ' + title, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lịch trình nhóm', exact: true })).toBeVisible();
}

test('room members copy the edited itinerary through MySQL, retry a lost response and edit independent personal copies', async ({ browser, context, page }) => {
  await configure(context);
  await login(context.request, 'a');
  const ownerHeaders = await headers(context.request);
  const list = await context.request.get('/api/itineraries');
  for (const trip of (await list.json()).data) {
    expect((await context.request.delete('/api/itineraries/' + trip.id, { headers: ownerHeaders })).status()).toBe(204);
  }
  const memberContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4300', viewport: page.viewportSize()! });
  try {
    await configure(memberContext);
    await login(memberContext.request, 'b');
    const memberHeaders = await headers(memberContext.request);
    const title = 'TravelGo Demo phòng sao chép ' + Date.now();
    let response = await context.request.post('/api/rooms', {
      headers: ownerHeaders, data: { title, date: '2026-12-01', desiredStops: 2 },
    });
    expect(response.status()).toBe(201);
    let room = (await response.json()).data;
    const roomUrl = '/api/rooms/' + room.code;
    expect((await memberContext.request.post('/api/itineraries/from-room', {
      headers: memberHeaders, data: { roomCode: room.code, roomRevision: room.revision },
    })).status()).toBe(403);
    expect((await memberContext.request.post('/api/rooms/join', {
      headers: memberHeaders, data: { code: room.code },
    })).ok()).toBeTruthy();
    for (const place of places.slice(0, 2)) {
      expect((await context.request.post(roomUrl + '/places', { headers: ownerHeaders, data: { placeId: place.id } })).ok()).toBeTruthy();
    }
    expect((await context.request.post(roomUrl + '/voting', { headers: ownerHeaders })).ok()).toBeTruthy();
    expect((await memberContext.request.put(roomUrl + '/votes', {
      headers: memberHeaders, data: { placeIds: [places[0].id] },
    })).ok()).toBeTruthy();
    response = await context.request.post(roomUrl + '/decision', {
      headers: ownerHeaders, data: { placeIds: [places[1].id, places[0].id] },
    });
    expect(response.ok()).toBeTruthy();
    room = (await response.json()).data;
    response = await context.request.put(roomUrl + '/itinerary', {
      headers: ownerHeaders, data: { revision: room.revision, stops: [
        { placeId: places[0].id, time: '11:15' }, { placeId: places[1].id, time: '13:45' },
      ] },
    });
    expect(response.ok()).toBeTruthy();
    room = (await response.json()).data;
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await openRoom(page, title);
    const copyButton = page.getByRole('button', { name: 'Lưu một bản lịch trình cá nhân', exact: true });
    await expect(copyButton).toBeEnabled();
    expect((await context.request.post('/api/itineraries/from-room', {
      data: { roomCode: room.code, roomRevision: room.revision },
    })).status()).toBe(419);

    // Let the first request commit in MySQL, then lose only its response.
    let firstId = '';
    await page.route('**/api/itineraries/from-room', async route => {
      const committed = await route.fetch();
      expect(committed.ok()).toBeTruthy();
      firstId = (await committed.json()).data.id;
      await route.abort('connectionfailed');
    });
    await copyButton.click();
    await expect(page.locator('.toast')).toContainText('Kết nối bị gián đoạn');
    await expect.poll(() => firstId).not.toBe('');
    await page.unroute('**/api/itineraries/from-room');
    const copied = page.waitForResponse(r => r.url().endsWith('/api/itineraries/from-room') && r.request().method() === 'POST');
    await copyButton.click();
    const mine = (await (await copied).json()).data;
    expect(mine.id).toBe(firstId);
    expect(mine.source).toBe('room');
    expect(mine.points.map((p: { placeId: string }) => p.placeId)).toEqual([places[0].id, places[1].id]);
    expect(mine.points.map((p: { time: string }) => p.time)).toEqual(['11:15', '13:45']);
    expect(mine.points[0].snapshot.price).toBeNull();
    expect(mine.points[1].snapshot.price).toBe(0);
    expect((await (await context.request.get('/api/itineraries')).json()).data).toHaveLength(1);
    const roomScreenshot = test.info().outputPath('room-copy.png');
    await page.screenshot({ path: roomScreenshot, fullPage: true });
    await test.info().attach('room-copy-mysql', { path: roomScreenshot, contentType: 'image/png' });

    const memberPage = await memberContext.newPage();
    await openRoom(memberPage, title);
    const memberCopy = memberPage.waitForResponse(r => r.url().endsWith('/api/itineraries/from-room') && r.request().method() === 'POST');
    await memberPage.getByRole('button', { name: 'Lưu một bản lịch trình cá nhân', exact: true }).click();
    const theirs = (await (await memberCopy).json()).data;
    expect(theirs.id).not.toBe(mine.id);
    expect((await memberContext.request.get('/api/itineraries/' + mine.id)).status()).toBe(404);
    expect((await context.request.get('/api/itineraries/' + theirs.id)).status()).toBe(404);

    await page.goto('/lich-trinh');
    await page.locator('section[aria-labelledby="saved-trips-title"]').getByRole('button').filter({ hasText: title }).click();
    const changed = page.waitForResponse(r => r.url().endsWith('/api/itineraries/' + mine.id) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Đưa ' + places[1].name + ' lên trước', exact: true }).click();
    expect((await changed).status()).toBe(200);
    await page.reload();
    await expect(page.getByLabel('Tên chuyến đi', { exact: true })).toHaveValue(title);
    const reloaded = (await (await context.request.get('/api/itineraries/' + mine.id)).json()).data;
    expect(reloaded.points.map((p: { placeId: string }) => p.placeId)).toEqual([places[1].id, places[0].id]);
    expect((await (await context.request.get(roomUrl)).json()).data).toEqual(room);
    const personalScreenshot = test.info().outputPath('copied-personal.png');
    await page.screenshot({ path: personalScreenshot, fullPage: true });
    await test.info().attach('copied-personal-mysql', { path: personalScreenshot, contentType: 'image/png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]);
  } finally { await memberContext.close(); }
});
