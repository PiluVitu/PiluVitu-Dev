import type { Meta, StoryObj } from '@storybook/nextjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { LogoutButton } from './logout-button'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

const meta: Meta<typeof LogoutButton> = {
  title: 'Votacao/LogoutButton',
  component: LogoutButton,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof LogoutButton>

export const Default: Story = {}
