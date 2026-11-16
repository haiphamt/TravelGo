const { chromium } = await import(process.env.TRAVELGO_PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../../../backend/docs/evidence/', import.meta.url);
await mkdir(output, {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: true});
const contexts = [];
const errors = [];
async function account(role) {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:8000/__moderation_test/login/${role}`);
  await page.getByRole('heading', {name: 'Đóng góp địa điểm', exact: true}).waitFor();
  return page;
}
try {
  const user = await account('user');
  const name = 'TravelGo Demo Browser ' + Date.now();
  await user.locator('input[name=name]').fill(name);
  await user.locator('tg-proposal-form input[name=area]').fill('Địa chỉ demo, TP.HCM');
  await user.locator('textarea[name=description]').fill('Dữ liệu tự tạo để kiểm thử.');
  await user.locator('input[name=hcm]').check();
  await user.locator('textarea[name=reason]').fill('Đề xuất demo cho kiểm thử trình duyệt.');
  await user.locator('tg-proposal-form button[type=submit]').click();
  await user.getByText('Đang chờ', {exact: true}).first().waitFor();
  const mine = await (await user.request.get('http://127.0.0.1:8000/api/contributions')).json();
  const item = mine.data.find(item => item.patch?.name === name);
  assert.ok(item, 'Contribution must exist in the actual MySQL-backed API.');
  await user.screenshot({path: fileURLToPath(new URL('contribution-desktop.png', output)), fullPage: true});
  const admin = await account('admin');
  await admin.goto('http://127.0.0.1:8000/quan-tri');
  await admin.getByRole('button', {name: 'Đối chiếu · ' + name, exact: true}).click();
  await admin.locator('dialog textarea').fill('Đã kiểm tra fixture bằng chứng.');
  await admin.getByRole('button', {name: 'Duyệt đề xuất', exact: true}).click();
  await admin.locator('dialog').getByText('Đã duyệt', {exact: true}).first().waitFor();
  await admin.screenshot({path: fileURLToPath(new URL('moderation-desktop.png', output)), fullPage: true});
  const owner = await account('owner');
  await owner.goto('http://127.0.0.1:8000/chu-co-so?view=claim&place=' + encodeURIComponent(item.placeId));
  await owner.locator('textarea[name=evidence]').fill('Mô tả demo quyền quản lý, không có thông tin cá nhân.');
  await owner.locator('input[name=agreement]').check();
  await owner.locator('textarea[name=reason]').fill('Xin quyền quản lý cơ sở demo.');
  await owner.locator('tg-proposal-form button[type=submit]').click();
  await owner.getByText('Đang chờ', {exact: true}).first().waitFor();
  await admin.goto('http://127.0.0.1:8000/quan-tri');
  await admin.getByRole('button', {name: 'Đối chiếu · ' + name, exact: true}).click();
  await admin.locator('dialog textarea').fill('Đã đối chiếu quyền quản lý fixture.');
  await admin.getByRole('button', {name: 'Cấp quyền quản lý', exact: true}).click();
  await admin.locator('dialog').getByText('Đã duyệt', {exact: true}).first().waitFor();
  await owner.goto('http://127.0.0.1:8000/chu-co-so?view=manage&place=' + encodeURIComponent(item.placeId));
  await owner.getByRole('heading', {name, exact: true}).waitFor();
  await owner.screenshot({path: fileURLToPath(new URL('owner-desktop.png', output)), fullPage: true});
  await owner.setViewportSize({width: 390, height: 844});
  await owner.screenshot({path: fileURLToPath(new URL('owner-mobile.png', output)), fullPage: true});
  assert.equal(await owner.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Mobile layout must not overflow horizontally.');
  await admin.setViewportSize({width: 390, height: 844});
  await admin.screenshot({path: fileURLToPath(new URL('moderation-mobile.png', output)), fullPage: true});
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await user.goto('http://127.0.0.1:8000/quan-tri');
  await user.waitForURL('**/tai-khoan');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({result: 'passed', actualApi: true, viewport: ['1440x1000', '390x844'], flow: ['submit', 'approve', 'claim', 'grant', 'owner-scope', 'role-guard'], screenshots: 5}));
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
