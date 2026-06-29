import eslint from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import tseslint from 'typescript-eslint';

export interface BaseConfigOptions {
  /**
   * Directory that holds the consuming project's tsconfig. Passed to the
   * type-aware parser's project service so type-checked rules resolve against
   * the right project.
   */
  tsconfigRootDir: string;
}

/**
 * Project-independent ESLint base configuration shared by every package in the
 * monorepo. Projects spread the returned array and layer their own concerns
 * (globals, source type, framework plugins, rule tweaks) on top.
 */
export function defineBaseConfig({ tsconfigRootDir }: BaseConfigOptions) {
  return tseslint.config(
    // Outputs that should never be linted, regardless of project.
    {
      ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**'],
    },

    // Recommended JS + type-aware TypeScript rules.
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,

    // Wire the type-aware parser to the consuming project's tsconfig.
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
    },

    // Shared house style. Projects may override these.
    {
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'warn',
        '@typescript-eslint/no-unsafe-argument': 'warn',
      },
    },

    // Flat-config files aren't part of a tsconfig, so don't type-check them.
    {
      files: ['**/eslint.config.*'],
      extends: [tseslint.configs.disableTypeChecked],
    },

    // Disable formatting-related rules — Prettier runs as its own command.
    prettierConfig,
  );
}

export default defineBaseConfig({ tsconfigRootDir: import.meta.dirname });