import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: 'jsdom',
            exclude: [...configDefaults.exclude, 'e2e/**'],
            root: fileURLToPath(new URL('./', import.meta.url)),
            setupFiles: [fileURLToPath(new URL('./src/__tests__/setup.ts', import.meta.url))],
            // Vuetify's auto-import injects per-component `.css` imports. Inline the
            // package so Vite strips them instead of Node's ESM loader choking on `.css`.
            server: {
                deps: {
                    inline: ['vuetify'],
                },
            },
            coverage: {
                provider: 'v8',
                reportsDirectory: './coverage',
                include: ['src/**/*.{ts,vue}'],
            },
        },
    }),
)
