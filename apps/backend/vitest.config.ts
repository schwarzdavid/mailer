import swc from 'unplugin-swc'
import { coverageConfigDefaults, defineConfig } from 'vitest/config'

// SWC handles the TypeScript transform so that NestJS's `emitDecoratorMetadata`
// (required for type-based dependency injection) is preserved — Vitest's default
// esbuild transform drops it.
export default defineConfig({
    plugins: [swc.vite()],
    // Hand TypeScript transformation entirely to SWC. Vite 8 / Vitest 4 transform
    // with Oxc by default, which (like esbuild) does not emit decorator metadata.
    oxc: false,
    test: {
        globals: true,
        environment: 'node',
        root: './',
        coverage: {
            provider: 'v8',
            reportsDirectory: './coverage',
            include: ['src/**/*.ts'],
            exclude: [
                ...coverageConfigDefaults.exclude,
                'src/main.ts',
                'src/openapi.ts',
                'src/migrate.ts',
                'src/migrations/**',
                'src/**/*.module.ts',
                'src/**/*.interface.ts',
                'src/**/*.model.ts',
                'src/**/*.dto.ts',
            ],
        },
        projects: [
            {
                extends: true,
                test: {
                    name: 'unit',
                    include: ['src/**/*.spec.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'e2e',
                    include: ['test/**/*.e2e-spec.ts'],
                    // Shared containers + migrations are started once for the whole run.
                    globalSetup: ['./test/support/global-setup.ts'],
                    setupFiles: [
                        './test/support/env.ts',
                        './test/support/throttle-reset.ts',
                        './test/support/queue-reset.ts',
                    ],
                    // Test files share one database, so run them sequentially to keep the
                    // seeded state deterministic (and avoid concurrent bootstrap writes).
                    fileParallelism: false,
                    // Testcontainers may pull images and boot Postgres/Redis on first run.
                    hookTimeout: 300_000,
                    testTimeout: 60_000,
                },
            },
        ],
    },
})
