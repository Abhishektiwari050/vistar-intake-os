import { defineConfig, devices } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const cachedChromium = path.join(
  process.env.LOCALAPPDATA || '',
  'ms-playwright',
  'chromium-1234',
  'chrome-win64',
  'chrome.exe'
);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3020',
    trace: 'on-first-retry',
    ...(fs.existsSync(cachedChromium)
      ? { launchOptions: { executablePath: cachedChromium } }
      : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node node_modules/next/dist/bin/next start -p 3020 -H 127.0.0.1',
    cwd: __dirname,
    url: 'http://127.0.0.1:3020',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
