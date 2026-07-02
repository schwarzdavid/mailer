import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// End-to-end config. Mirrors the unit config (SWC transform for decorator
// metadata) but targets the `test/` suite that boots the full Nest app.
export default defineConfig({
    plugins: [swc.vite()],
    // Hand TypeScript transformation entirely to SWC (see vitest.config.ts).
    oxc: false,
    test: {
        globals: true,
        environment: 'node',
        root: './',
        include: ['test/**/*.e2e-spec.ts'],
        // Shared containers + migrations are started once for the whole run.
        globalSetup: ['./test/support/global-setup.ts'],
        // Test files share one database, so run them sequentially to keep the
        // seeded state deterministic (and avoid concurrent bootstrap writes).
        fileParallelism: false,
        // Testcontainers may pull images and boot Postgres/Redis on first run.
        hookTimeout: 300_000,
        testTimeout: 60_000,
    },
});
