import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(readFileSync(new URL('./fixtures/catalog.json', import.meta.url), 'utf8'));
const place = catalog.places[0];

test('retired priority links take visitors to the main catalog', async ({ page }) => {
  await page.route('**/api/places/detail?*', route => route.fulfill({ json: { data: place } }));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Khám phá theo nhu cầu' })).toBeVisible();
  await expect(page.getByRole('link', { name: '250 cơ sở ưu tiên' })).toHaveCount(0);

  await page.goto('/ho-so-uu-tien?status=licensed&q=TravelGo');
  await expect(page).toHaveURL(/\/kham-pha\?q=TravelGo$/);

  await page.goto(`/dia-diem/${place.id}?from=%2Fho-so-uu-tien&status=licensed&q=TravelGo`);
  await expect(page.getByRole('heading', { name: place.name })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Khám phá địa điểm', exact: true }))
    .toHaveAttribute('href', '/kham-pha?q=TravelGo');
});
