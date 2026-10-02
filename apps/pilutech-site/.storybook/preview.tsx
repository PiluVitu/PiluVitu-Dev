import type { Preview } from '@storybook/nextjs'
import { cn } from '@piluvitu/ui/cn'
import '../app/globals.css'
import '../lib/font-awesome'

// As seções claras dependem de NÃO estar dentro de .dark: a story de uma delas usa fundo claro.
const preview: Preview = {
  initialGlobals: { fundo: 'escuro' },
  globalTypes: {
    fundo: {
      description: 'Contexto de cor atrás do componente',
      toolbar: {
        title: 'Fundo',
        icon: 'mirror',
        items: [
          { value: 'claro', title: 'Claro (Névoa)' },
          { value: 'escuro', title: 'Escuro (Noite)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, { globals, parameters }) => (
      <div
        className={cn(
          globals.fundo === 'claro' ? undefined : 'dark',
          'bg-background text-foreground min-h-svh',
          parameters.layout === 'fullscreen' ? undefined : 'p-6',
        )}
      >
        <Story />
      </div>
    ),
  ],
}

export default preview
