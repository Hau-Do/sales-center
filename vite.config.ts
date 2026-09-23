/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },

  server: {
    port: 5173,
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', 'cypress/**', 'dist/**'],
    // A flake must fail the build rather than hide behind a retry.
    retry: 0,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.d.ts',
        // Seed data and MSW wiring are fixtures, not logic under test.
        'src/mocks/seed/**',
      ],
      // NOTE: Vitest has NO `global:` threshold key — that is Jest. Aggregate
      // thresholds are top-level fields inside `thresholds`; every OTHER key is
      // treated as a glob. The leading `**/` matters: a bare 'src/domain/**'
      // can fail to match resolved absolute paths and silently enforce nothing.
      // Proven by `npm run verify:determinism`, which deletes a domain test and
      // asserts the gate goes red.
      thresholds: {
        lines: 85,
        branches: 80,
        functions: 85,
        statements: 85,
        '**/src/domain/**': {
          lines: 100,
          branches: 100,
          functions: 100,
          statements: 100,
        },
      },
    },
  },
})
