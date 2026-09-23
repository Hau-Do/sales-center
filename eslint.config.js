import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Domain purity, enforced by lint.
 *
 * `src/domain/` must be a pure function of its inputs. Ambient time and ambient
 * randomness are the two things that make a "pure" module silently impure, and
 * they are exactly what breaks deterministic tests. Time, ids and randomness
 * enter the domain through injected ports instead (see `src/ports/`).
 *
 * `new Date(epochMs)` stays legal — it is a pure conversion. Only the
 * zero-argument form reads the ambient clock.
 *
 * This is belt-and-braces with `src/domain/__tests__/domain-purity.test.ts`,
 * which catches the import-escape case that a syntax rule cannot see. The two
 * fail differently and that is the point.
 */
const NO_AMBIENT_NONDETERMINISM = [
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message:
      'No ambient clock in the domain layer. Take a Clock port and call clock.now(). `new Date(epochMs)` is fine.',
  },
  {
    selector: "MemberExpression[object.name='Date'][property.name='now']",
    message: 'No ambient clock in the domain layer. Take a Clock port and call clock.now().',
  },
  {
    selector: "MemberExpression[object.name='Math'][property.name='random']",
    message: 'No ambient randomness in the domain layer. Take an Rng port and call rng.next().',
  },
  {
    selector: "MemberExpression[object.name='crypto'][property.name='randomUUID']",
    message: 'No ambient id generation in the domain layer. Take an IdGenerator port.',
  },
]

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'node_modules',
    'cypress/videos',
    'cypress/screenshots',
    'cypress/downloads',
    'public/mockServiceWorker.js',
    '.vitest',
  ]),

  // ---------------------------------------------------------------- app source
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // ------------------------------------------------------------- react surface
  // NOTE: reactHooks.configs['recommended-latest'] still ships the legacy
  // eslintrc shape (`plugins` as a string array) in v7.1.1 and throws under
  // flat config. `configs.flat.recommended` is the flat-native one.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
  },

  // ---------------------------------------------------------- the domain layer
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_AMBIENT_NONDETERMINISM],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-*',
                '@tanstack/*',
                'zustand',
                'msw',
                '@/app/*',
                '@/api/*',
                '@/data/*',
                '@/mocks/*',
                '@/features/*',
                '@/components/*',
                '@/observability/*',
              ],
              message:
                'src/domain must not depend on React, data access, or framework code. It is pure TypeScript.',
            },
          ],
        },
      ],
    },
  },

  // The app shell must not read the ambient clock either — every ticking clock
  // in the UI descends from the single injected Clock, so freezing it in a test
  // freezes the whole app.
  {
    files: ['src/app/**/*.{ts,tsx}', 'src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_AMBIENT_NONDETERMINISM],
    },
  },

  // -------------------------------------------------------------- node scripts
  {
    files: ['scripts/**/*.mjs', '*.config.{ts,js}', 'cypress.config.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },

  // ------------------------------------------------------------- cypress specs
  {
    files: ['cypress/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.mocha, cy: 'readonly', Cypress: 'readonly' },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          // Fixed sleeps are how E2E suites rot into flakes. Wait on the app's
          // own quiescence signal instead: cy.settled() reads data-app-busy,
          // which is driven by useIsFetching() + useIsMutating().
          selector: "CallExpression[callee.object.name='cy'][callee.property.name='wait']",
          message: 'No cy.wait(). Use cy.settled() — it waits on data-app-busy, not on the clock.',
        },
        {
          // MSW owns request mocking. cy.intercept stubs fetch/XHR inside the
          // page so requests never reach the service worker, which means the
          // two layers silently fight. Pick one; we picked MSW.
          selector: "CallExpression[callee.object.name='cy'][callee.property.name='intercept']",
          message:
            'No cy.intercept(). MSW is the single mocking layer — mixing them means requests never reach the worker.',
        },
      ],
      '@typescript-eslint/no-namespace': 'off',
    },
  },

  // ---------------------------------------------------------------- test files
  {
    files: ['**/*.{test,spec}.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },

  prettier,
])
