import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['smoke/**/*.spec.ts'],
        fileParallelism: false,
        bail: 1,
        hookTimeout: 600_000,
        testTimeout: 300_000,
        reporters: ['verbose'],
    },
})
