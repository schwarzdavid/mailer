import globals from 'globals'
import pluginVitest from '@vitest/eslint-plugin'
import pluginPlaywright from 'eslint-plugin-playwright'
import tseslint from 'typescript-eslint'
import { defineBaseConfig } from '../../eslint.config.ts'

export default tseslint.config(
    { ignores: ['.vitepress/cache/**', '.vitepress/dist/**'] },
    ...defineBaseConfig({ tsconfigRootDir: import.meta.dirname }),
    {
        languageOptions: {
            globals: {
                ...globals.node,
            },
            sourceType: 'module',
        },
    },
    {
        ...pluginVitest.configs.recommended,
        files: ['scripts/**/__tests__/*.spec.ts'],
    },
    {
        ...pluginPlaywright.configs['flat/recommended'],
        files: ['screenshots/**/*.ts'],
        rules: {
            ...pluginPlaywright.configs['flat/recommended'].rules,
            'playwright/expect-expect': ['warn', { assertFunctionNames: ['capture', 'captureElement'] }],
        },
    },
)
