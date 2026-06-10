import type { Meta, StoryObj } from '@storybook/nextjs'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DistributionPanel } from './distribution-panel'

const meta: Meta<typeof DistributionPanel> = {
  title: 'Admin/Posts/DistributionPanel',
  component: DistributionPanel,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof DistributionPanel>

export const Default: Story = {
  args: {
    post: {
      slug: 'meu-post',
      title: 'Meu Post',
      excerpt: 'resumo do artigo',
      body: '# corpo\n\nConteúdo do artigo aqui.',
      tags: ['go', 'ai'],
    },
  },
}
