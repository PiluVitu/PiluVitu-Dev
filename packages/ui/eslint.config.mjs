import { defineConfig, globalIgnores } from 'eslint/config'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'
import globals from 'globals'

// Config própria do pacote (não estende a de apps/web): packages/ui não é
// um app Next — é consumido por apps/web hoje e por apps/financas/web
// (Vite SPA) na Task 4 — então fica sem @next/eslint-plugin-next e sem os
// plugins específicos de apps/web (tanstack-query, storybook).
//
// O objetivo é *restaurar* a cobertura que os 14 componentes tinham quando
// viviam em apps/web/components/ui (rules-of-hooks, exhaustive-deps,
// no-unused-vars via @typescript-eslint, um subconjunto de a11y) — não
// introduzir regras novas/mais estritas que os arquivos já existentes nunca
// passaram por. Por isso o subconjunto de jsx-a11y e o override de
// react/no-unknown-property abaixo espelham exatamente o que
// eslint-config-next/index.js já aplicava a estes arquivos antes do move
// (conferido lendo o dist do pacote instalado): regra nova nenhuma, só a
// mesma rede que existia.
export default defineConfig([
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  prettier,
  {
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // Componentes shadcn não declaram propTypes — os tipos vêm do TS.
      'react/prop-types': 'off',
      // cmdk usa o atributo customizado `cmdk-input-wrapper` (command.tsx)
      // pra estilização via CSS attribute selector — mesmo override que
      // eslint-config-next/index.js já tinha pra estes arquivos.
      'react/no-unknown-property': 'off',
      // @typescript-eslint/no-unused-vars substitui a regra base (evita
      // relatar o mesmo unused import duas vezes).
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      // Mesmo subconjunto de jsx-a11y que eslint-config-next/index.js
      // aplicava (não o `recommended` inteiro do plugin, que inclui regras
      // como heading-has-content — falso positivo em componentes forwardRef
      // cujo children vem só via props/spread, nunca JSX literal).
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-unsupported-elements': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',
    },
  },
  globalIgnores(['node_modules/**']),
])
