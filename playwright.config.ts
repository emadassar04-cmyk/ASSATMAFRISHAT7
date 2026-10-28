import { defineConfig } from '@playwright/test';

const PORT = 3100;
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 1,
  use: { baseURL: `http://localhost:${PORT}`, locale: 'ar' },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
