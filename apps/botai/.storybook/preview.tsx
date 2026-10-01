import { config } from '@fortawesome/fontawesome-svg-core'
import type { Preview } from '@storybook/react-vite'
import '../src/styles.css'

config.autoAddCss = false

const preview: Preview = {
  initialGlobals: { tema: 'escuro' },
  globalTypes: {
    tema: {
      description: 'Tema do popup',
      toolbar: {
        title: 'Tema',
        icon: 'mirror',
        items: [
          { value: 'claro', title: 'Claro' },
          { value: 'escuro', title: 'Escuro' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, { globals }) => {
      document.documentElement.classList.toggle(
        'dark',
        globals.tema !== 'claro',
      )
      return (
        <div className="bg-background text-foreground">
          <Story />
        </div>
      )
    },
  ],
}

export default preview
