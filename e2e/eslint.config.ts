import globals from 'globals'
import pluginVitest from '@vitest/eslint-plugin'
import tseslint from 'typescript-eslint'
import { defineBaseConfig } from '../eslint.config.ts'

export default tseslint.config(
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
        files: ['**/*.spec.ts'],
    },
)
