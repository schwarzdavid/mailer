import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import { theme, useOpenapi } from 'vitepress-openapi/client'
import 'vitepress-openapi/dist/style.css'
import '@fontsource/noto-sans/400.css'
import '@fontsource/noto-sans/500.css'
import '@fontsource/noto-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './custom.css'
import spec from '../../../backend/openapi.json' with { type: 'json' }

export default {
    extends: DefaultTheme,
    enhanceApp(context) {
        useOpenapi({ spec })
        theme.enhanceApp(context)
    },
} satisfies Theme
