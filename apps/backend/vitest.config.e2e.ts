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
    },
});
