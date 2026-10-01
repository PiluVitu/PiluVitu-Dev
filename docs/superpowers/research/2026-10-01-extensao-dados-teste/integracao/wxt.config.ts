import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  webExt: { disabled: true },
  imports: false,
  manifest: ({ mode }) => ({
    name: 'PiluVitu Pessoa de Teste',
    permissions: ['activeTab', 'contextMenus', 'storage', 'scripting'],
    host_permissions: mode === 'e2e' ? ['http://teste.local/*'] : [],
    commands: {
      _execute_action: { suggested_key: { default: 'Alt+Shift+P' } },
    },
  }),
  vite: () => ({ plugins: [react(), tailwindcss()] }),
})
