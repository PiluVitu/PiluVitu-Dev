import type { Preview } from '@storybook/nextjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../app/globals.css'

// Cliente único pras stories — sem retry pra falhas de fetch (não há API no
// Storybook) aparecerem rápido como estado de erro em vez de pendurar.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  // Toda story roda com o QueryClientProvider (componentes que usam TanStack
  // Query, ex.: mídia) + o tema dark do DS V2 (`.dark` cascateia os tokens).
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="dark bg-background text-foreground min-h-svh p-6">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
}

export default preview
