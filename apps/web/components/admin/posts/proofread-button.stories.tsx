import type { Meta, StoryObj } from '@storybook/nextjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fn } from 'storybook/test'
import { ProofreadButton } from './proofread-button'

const meta: Meta<typeof ProofreadButton> = {
  title: 'Admin/Posts/ProofreadButton',
  component: ProofreadButton,
  parameters: { layout: 'padded' },
  args: { onApply: fn() },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof ProofreadButton>

export const Default: Story = {
  args: { body: 'Um txeto com algums erros de digitaçao.' },
}

export const Disabled: Story = { args: { body: '' } }
