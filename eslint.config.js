const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      semi: ['error', 'always'],
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
