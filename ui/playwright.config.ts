import { defineConfig } from '@playwright/test';

const globalChromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (process.platform === 'darwin'
    ? '/Applications/Chromium.app/Contents/MacOS/Chromium'
    : undefined);

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:8000',
    launchOptions: globalChromiumExecutable
      ? { executablePath: globalChromiumExecutable }
      : undefined,
  },
  webServer: [
    {
      command: 'PORT=8001 HOST=127.0.0.1 pnpm --dir ../server debug:server',
      url: 'http://127.0.0.1:8001/api/v1/health',
      reuseExistingServer: true,
    },
    {
      command: 'pnpm debug:ui',
      url: 'http://127.0.0.1:8000/api/e2e-health',
      reuseExistingServer: true,
    },
  ],
});
