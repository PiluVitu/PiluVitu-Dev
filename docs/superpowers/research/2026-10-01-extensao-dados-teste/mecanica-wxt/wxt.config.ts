import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: () => ({
    name: 'piluvitu · dados de teste',
    description:
      'Gera uma pessoa brasileira falsa e coerente e preenche formulários.',
    permissions: ['activeTab', 'scripting', 'contextMenus', 'storage'],
    // E2E only: Playwright cannot produce the user gesture that grants activeTab.
    ...(process.env.WXT_E2E === '1'
      ? { host_permissions: ['http://127.0.0.1/*'] }
      : {}),
    commands: {
      'preencher-pagina': {
        suggested_key: { default: 'Alt+Shift+P' },
        description: 'Preencher esta página',
      },
    },
  }),
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  webExt: { disabled: true },
  outDirTemplate: process.env.WXT_E2E === '1' ? 'chrome-mv3-e2e' : undefined,
})
