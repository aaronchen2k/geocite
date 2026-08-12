import { defineConfig } from '@playwright/test';

const globalChromiumExecutable =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ??
  (process.platform === 'darwin'
    ? '/Applications/Chromium.app/Contents/MacOS/Chromium'
    : undefined);

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: 'http://127.0.0.1:8100',
    launchOptions: globalChromiumExecutable
      ? { executablePath: globalChromiumExecutable }
      : undefined,
  },
  webServer: [
    {
      command: 'NODE_ENV=test pnpm --dir ../server debug:server',
      url: 'http://127.0.0.1:8101/api/v1/health',
      reuseExistingServer: false,
    },
    {
      command: 'set -a && . ./.env.test && set +a && pnpm debug:ui',
      url: 'http://127.0.0.1:8100/api/e2e-health',
      reuseExistingServer: false,
    },
  ],
});
