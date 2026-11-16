import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4300',
    browserName: 'chromium',
    ...(process.env.TRAVELGO_BROWSER_CHANNEL ? { channel: process.env.TRAVELGO_BROWSER_CHANNEL } : {}),
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    { command: 'node tests/e2e/run-backend.mjs', url: 'http://127.0.0.1:8002/up', reuseExistingServer: false, timeout: 60_000 },
    { command: 'node node_modules/@angular/cli/bin/ng.js serve --host 127.0.0.1 --port 4300 --proxy-config tests/e2e/proxy.conf.json', url: 'http://127.0.0.1:4300', reuseExistingServer: false, timeout: 60_000 },
  ],
});
