import type { Meta, StoryObj } from '@storybook/nextjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateSessionForm } from './create-session-form'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const meta: Meta<typeof CreateSessionForm> = {
  title: 'Votacao/CreateSessionForm',
  component: CreateSessionForm,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <div className="mx-auto max-w-md">
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof CreateSessionForm>

export const Default: Story = {}
