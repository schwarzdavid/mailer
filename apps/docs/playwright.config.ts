import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './screenshots',
    testMatch: /.*\.screenshots\.ts/,
    globalSetup: './screenshots/global-setup.ts',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 180_000,
    expect: { timeout: 15_000 },
    reporter: 'list',
    use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.DOCS_BASE_URL,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: 'light',
        actionTimeout: 15_000,
    },
    projects: [{ name: 'chromium' }],
})
