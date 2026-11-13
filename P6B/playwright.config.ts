import { defineConfig } from '@playwright/test';

// E2E tests run the production build in Chromium, including the real Surfer WASM viewer.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173', viewport: { width: 1440, height: 900 }, screenshot: 'only-on-failure' },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 120_000 },
});
