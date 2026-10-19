// ESLint flat config: Next.js core web vitals + TypeScript rules, with React hooks enforced.
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'design/**',
      'tools/**',
      'coverage/**',
      '.pglite/**',
      'test-results/**',
      'playwright-report/**',
      'next-env.d.ts',
      'lib/db/types.ts',
    ],
  },
  {
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-console': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Logos and the venue photo are small static files served as-is (no image optimiser on the droplet).
      '@next/next/no-img-element': 'off',
    },
  },
]

export default config
