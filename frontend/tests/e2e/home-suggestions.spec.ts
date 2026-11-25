import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8'));
const image = '/images/osm/node-4633807289.jpg';
const photo = {
  image, images: [image], photoCredit: 'Kiểm thử',
  photoSource: { url: 'https://example.invalid/photo', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' },
};
const coffee = { ...catalog.places[0], ...photo };
const park = { ...catalog.places[2], ...photo };

test('home suggestions show and can be used while the full catalog is pending', async ({ page }, testInfo) => {
  const releaseCatalog = Promise.withResolvers<void>();
  const requests: URLSearchParams[] = [];
  let parkAttempts = 0;
  await page.route(/\/api\/places\?/, async route => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    if (params.get('per_page') === '200') {
      await releaseCatalog.promise;
      await route.fulfill({ json: {
        data: catalog.places, meta: { current_page: 1, last_page: 1, per_page: 200, total: catalog.places.length },
      } });
      return;
    }
    const nature = params.get('category') === 'nature';
    if (nature && ++parkAttempts === 1) {
      await route.fulfill({ status: 503, json: { message: 'Test retry' } });
      return;
    }
    await route.fulfill({ json: {
      data: [nature ? park : coffee], meta: { current_page: 1, last_page: 1, per_page: 8, total: 1 },
    } });
  });

  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const coffeeCard = page.getByRole('link', { name: coffee.name, exact: true });
    await expect(coffeeCard).toBeVisible();
    expect(Object.fromEntries(requests[0])).toEqual({ category: 'coffee', has_image: '1', per_page: '8' });
    await expect.poll(() => requests.some(params => params.get('per_page') === '200')).toBe(true);
    const recent = page.getByRole('heading', { name: 'Bạn đã xem gần đây', exact: true });
    await expect(recent).toHaveCount(0);

    await page.getByRole('button', { name: `Thêm ${coffee.name} vào lịch trình`, exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Đã thêm vào lịch trình của bạn.' })).toBeVisible();
    if (testInfo.project.name === 'desktop') {
      await page.getByRole('button', { name: /Đổi danh mục gợi ý/ }).click();
      await page.getByRole('button', { name: 'Gợi ý Công viên', exact: true }).click();
      await expect(coffeeCard).toHaveCount(0);
      await page.getByRole('button', { name: 'Thử lại gợi ý', exact: true }).click();
      await expect(page.getByRole('link', { name: park.name, exact: true })).toBeVisible();
      expect(parkAttempts).toBe(2);
    }
    await expect(recent).toHaveCount(0);

    releaseCatalog.resolve();
    await expect(recent).toBeVisible();
  } finally {
    releaseCatalog.resolve();
  }
});
