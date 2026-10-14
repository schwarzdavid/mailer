import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import vuetify from 'vite-plugin-vuetify'
import vueI18n from '@intlify/unplugin-vue-i18n/vite'

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        vueDevTools(),
        vuetify({
            styles: { configFile: 'src/styles/settings.scss' },
        }),
        vueI18n({
            include: fileURLToPath(new URL('./src/locales/**', import.meta.url)),
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    server: {
        proxy: {
            '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:8000',
        },
    },
})
