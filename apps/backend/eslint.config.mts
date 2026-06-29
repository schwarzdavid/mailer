import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineBaseConfig } from '../../eslint.config.ts';

export default tseslint.config(
  ...defineBaseConfig({ tsconfigRootDir: import.meta.dirname }),
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
    },
  },
);