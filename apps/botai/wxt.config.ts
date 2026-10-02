import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'wxt'

// No Windows e no Linux o Chrome reserva Alt+Shift+P ("criar novo grupo de abas") e não o cede à extensão.
const ATALHO_CHROMIUM = { default: 'Ctrl+Shift+Y', mac: 'Alt+Shift+P' }
// No Linux o Firefox usa Ctrl+Shift+Y para os Downloads e também não cede a tecla.
const ATALHO_FIREFOX = { ...ATALHO_CHROMIUM, linux: 'Alt+Shift+P' }
const raizDoMonorepo = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  srcDir: 'src',
  imports: false,
  // Sem isto, o -b firefox gera MV2.
  manifestVersion: 3,
  targetBrowsers: ['chrome', 'firefox', 'opera'],
  webExt: { disabled: true },
  dev: { server: { port: 3018 }, reloadCommand: false },
  zip: {
    name: 'botai',
    sourcesRoot: raizDoMonorepo,
    // Arquivo oculto só entra citado pelo nome (.npmrc).
    includeSources: [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.npmrc',
      'scripts/check-tailwind-source.mjs',
      'apps/botai/**',
      'packages/tools/**',
      'packages/ui/**',
    ],
    // Com sourcesRoot na raiz, a exclusão automática do outDir do WXT não pega estas pastas.
    excludeSources: [
      'apps/botai/.output/**',
      'apps/botai/.wxt/**',
      '**/storybook-static/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  manifest: ({ browser, mode }) => {
    const firefox = browser === 'firefox'
    return {
      name: 'Botaí',
      short_name: 'Botaí',
      description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      homepage_url: 'https://botai.pilutech.com.br',
      ...(firefox
        ? {
            browser_specific_settings: {
              gecko: {
                id: 'botai@pilutech.com.br',
                strict_min_version: '153.0',
                data_collection_permissions: { required: ['none'] },
              },
            },
          }
        : { minimum_chrome_version: '123' }),
      permissions: [
        'activeTab',
        'scripting',
        'contextMenus',
        'storage',
        // Libera o menus.getTargetElement no content script do Firefox (o Inserir no campo clicado).
        ...(firefox ? ['menus'] : []),
      ],
      commands: {
        'botai-preencher': {
          suggested_key: firefox ? ATALHO_FIREFOX : ATALHO_CHROMIUM,
          description: 'Preencher esta página',
        },
      },
      ...(mode === 'e2e' && { host_permissions: ['http://teste.local/*'] }),
    }
  },
  vite: ({ browser }) => ({
    plugins: [react(), tailwindcss()],
    // A loja do Opera recusa código próprio minificado.
    ...(browser === 'opera' && { build: { minify: false } }),
  }),
})
