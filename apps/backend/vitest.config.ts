import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Unit-test config. SWC handles the TypeScript transform so that NestJS's
// `emitDecoratorMetadata` (required for type-based dependency injection) is
// preserved — Vitest's default esbuild transform drops it.
export default defineConfig({
  plugins: [swc.vite()],
  // Hand TypeScript transformation entirely to SWC. Vite 8 / Vitest 4 transform
  // with Oxc by default, which (like esbuild) does not emit decorator metadata.
  oxc: false,
  test: {
    globals: true,
    environment: 'node',
    root: './',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
    },
  },
});
