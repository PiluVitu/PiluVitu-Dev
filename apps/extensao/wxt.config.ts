import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  imports: false,
  webExt: { disabled: true },
  dev: { server: { port: 3018 }, reloadCommand: false },
  manifest: ({ mode }) => ({
    name: 'piluvitu · dados de teste',
    minimum_chrome_version: '121',
    permissions: ['activeTab', 'scripting', 'contextMenus', 'storage'],
    commands: {
      'preencher-pagina': {
        suggested_key: { default: 'Alt+Shift+P' },
        description: 'Preencher esta página',
      },
    },
    ...(mode === 'e2e' && { host_permissions: ['http://teste.local/*'] }),
  }),
  vite: () => ({ plugins: [react(), tailwindcss()] }),
})
