import globals from 'globals';
import pluginVitest from '@vitest/eslint-plugin';
import tseslint from 'typescript-eslint';
// @ts-expect-error - allowTsImport is not possible due to nestjs
import { defineBaseConfig } from '../../eslint.config.ts';

export default tseslint.config(
    ...defineBaseConfig({ tsconfigRootDir: import.meta.dirname }),
    {
        languageOptions: {
            globals: {
                ...globals.node,
            },
            sourceType: 'commonjs',
        },
    },
    {
        ...pluginVitest.configs.recommended,
        files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
        rules: {
            ...pluginVitest.configs.recommended.rules,
            // Supertest's chained `.expect()` is the assertion in e2e tests; teach the
            // rule to recognise it so those tests aren't flagged as assertion-less.
            'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'request.**.expect'] }],
        },
    },
);
