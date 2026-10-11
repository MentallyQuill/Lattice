import { defineConfig } from '@playwright/test';
const port = process.env.LATTICE_TEST_PORT ?? '4178';
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
    testDir: './tests/browser',
    testMatch: '**/*.spec.mjs',
    fullyParallel: false,
    workers: 1,
    reporter: 'list',
    use: { baseURL, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
    webServer: { command: 'node tools/serve-harness.mjs', env: { PORT: port }, url: `${baseURL}/tests/browser/harness.html`, reuseExistingServer: !process.env.CI, timeout: 15000 },
});
