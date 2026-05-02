import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'node_modules/**',
      'data/**',
      'skills/**',
      'cli/**',
      'ui/**',
      '!ui/types.d.ts',
      '!ui/store.js',
      '!ui/compile.js',
      '!ui/dashboard.js',
      'server/compiler.js',
      'server/router.js',
      'server/lib/app-version.js',
      'server/lib/backup.js',
      'server/lib/crypto.js',
      'server/lib/modes.js',
      'server/lib/skills.js',
      'server/lib/validation.js',
      'server.out.log',
      'server.err.log',
    ],
  },
  js.configs.recommended,
  ...tseslint.config({
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/only-throw-error': 'error',
    },
  }),
  {
    files: ['server/**/*.js', 'electron/**/*.cjs', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['electron/preload.cjs'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['ui/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        DS: 'readonly',
        Toast: 'readonly',
        SKILL_DATA: 'readonly',
        SS: 'readonly',
        MS: 'readonly',
        RS: 'readonly',
        ModesTab: 'readonly',
        MemoryTab: 'readonly',
        ConfigTab: 'readonly',
        CompileTab: 'readonly',
        switchTab: 'readonly',
        switchTabByName: 'readonly',
        openTab: 'readonly',
        animateCount: 'readonly',
        esc: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
