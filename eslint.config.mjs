// ESM because @stylistic/eslint-plugin ships only as ESM, and the test job
// runs on Node 18, which cannot require() an ES module.
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

export default [
  js.configs.recommended,
  // The preset at its defaults, except semicolons, which this repository has
  // always required.
  stylistic.configs.customize({ semi: true }),
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'error',
    },
  },
  {
    files: ['test/**/*.js'],
    rules: {
      'no-control-regex': 'off',
    },
  },
];
