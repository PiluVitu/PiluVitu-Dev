import { defineConfig, globalIgnores } from 'eslint/config'
import nextTs from 'eslint-config-next/typescript'
import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier/flat'
import storybook from 'eslint-plugin-storybook'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...storybook.configs['flat/recommended'],
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'next-env.d.ts',
    'storybook-static/**',
    'node_modules/**',
    'test-results/**',
    'playwright-report/**',
    '**/*.tsbuildinfo',
  ]),
])
