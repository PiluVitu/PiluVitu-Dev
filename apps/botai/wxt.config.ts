import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  imports: false,
  webExt: { disabled: true },
  dev: { server: { port: 3018 }, reloadCommand: false },
  manifest: ({ mode }) => ({
    name: 'Botaí',
    short_name: 'Botaí',
    description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    minimum_chrome_version: '123',
    permissions: ['activeTab', 'scripting', 'contextMenus', 'storage'],
    commands: {
      'botai-preencher': {
        // No Windows e no Linux o Chrome reserva Alt+Shift+P para "criar novo grupo
        // de abas" e não o cede à extensão (o atalho ficaria vazio).
        suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Alt+Shift+P' },
        description: 'Preencher esta página',
      },
    },
    ...(mode === 'e2e' && { host_permissions: ['http://teste.local/*'] }),
  }),
  vite: () => ({ plugins: [react(), tailwindcss()] }),
})
