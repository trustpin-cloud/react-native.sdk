import tseslint from 'typescript-eslint';

export default tseslint.config(
  // The example apps are standalone projects and lint with their own config.
  { ignores: ['lib/', 'plugin/build/', 'node_modules/', 'coverage/', 'example/', 'example-expo/'] },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // The config plugin runs in Node during prebuild and ships as CommonJS:
    // app.plugin.js is the entry point Expo requires by convention, and the
    // plugin reads the package manifest for its run-once identity.
    files: ['app.plugin.js', 'plugin/src/index.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  }
);
