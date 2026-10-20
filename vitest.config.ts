import path from 'node:path'
import { defineConfig } from 'vitest/config'

const root = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: {
      '@': root,
      // `server-only` throws outside a React Server Components build; tests run in plain Node.
      'server-only': path.join(root, 'tests/support/server-only.ts'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'features/**/*.test.ts', 'eval/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // React components and screens in a simulated browser (jsdom), with Testing Library.
        extends: true,
        test: {
          name: 'ui',
          include: ['components/**/*.test.tsx', 'features/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/support/ui-setup.ts'],
        },
      },
      {
        // SQL-level tests (RLS, triggers, functions) on PGlite: real Postgres, no server needed.
        extends: true,
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        // Route handlers end to end against PGlite exposed over the Postgres wire protocol.
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'components/**/*.tsx', 'features/**/*.{ts,tsx}'],
      exclude: ['**/*.test.{ts,tsx}', 'lib/db/types.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
