import type { Preview } from '@storybook/nextjs'
import '../app/globals.css'

const preview: Preview = {
  initialGlobals: { tema: 'escuro' },
  globalTypes: {
    tema: {
      description: 'Tema da landing',
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
        <div className="bg-background text-foreground min-h-svh p-6">
          <Story />
        </div>
      )
    },
  ],
}

export default preview
