import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { theme, useOpenapi } from 'vitepress-openapi/client'
import 'vitepress-openapi/dist/style.css'
import spec from '../../../backend/openapi.json' with { type: 'json' }

export default {
    extends: DefaultTheme,
    enhanceApp(context) {
        useOpenapi({ spec })
        theme.enhanceApp(context)
    },
} satisfies Theme
