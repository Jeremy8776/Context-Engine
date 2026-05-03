import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Files that are inside tsconfig.json's `include` list and are checked by
// `npm run typecheck`. These get the TypeScript-aware ESLint rules
// (no-floating-promises, no-misused-promises, only-throw-error). Other .js
// files only get the recommended-JS rules.
const TYPECHECKED_JS = [
  'server/server.js',
  'server/lib/config.js',
  'server/lib/chunker.js',
  'server/lib/embeddings.js',
  'server/lib/http.js',
  'server/lib/tool-registry.js',
  'server/lib/tool-detection.js',
  'server/lib/vectorstore.js',
  'ui/store.js',
  'ui/compile.js',
  'ui/dashboard.js',
  'scripts/**/*.js',
  'electron/**/*.cjs',
];

export default [
  {
    ignores: [
      'node_modules/**',
      'data/**',
      'skills/**',
      'cli/**',
      'dist/**',
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

  // TypeScript-aware rules for the typechecked .js + .cjs files.
  // The TS parser reads JSDoc + .d.ts files via the project config, so
  // promise-handling rules work the same way they would on real .ts code.
  ...tseslint.config({
    files: [...TYPECHECKED_JS, '**/*.ts'],
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
      // The recommended-type-checked set is opinionated about safety, but
      // this codebase mixes JS-with-JSDoc and bridges to dynamic globals
      // (DS, Toast, AppDialog). Relax the rules that punish that pattern
      // without giving up the promise-handling guarantees we actually want.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-redundant-type-constituents': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      // CommonJS codebase — require() imports are by design.
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      // Useful but not blocking — keep them as warnings so they show up
      // without failing CI on every minor refactor.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
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
        DashboardTab: 'readonly',
        SkillsTab: 'readonly',
        AppDialog: 'readonly',
        DEFAULT_RULES: 'readonly',
        loadSkillData: 'readonly',
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
