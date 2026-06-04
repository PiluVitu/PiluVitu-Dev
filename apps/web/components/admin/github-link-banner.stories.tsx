import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { GithubLinkBanner } from './github-link-banner'

const meta: Meta<typeof GithubLinkBanner> = {
  title: 'Admin/GithubLinkBanner',
  component: GithubLinkBanner,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onUnlink: fn() },
}
export default meta
type Story = StoryObj<typeof GithubLinkBanner>

export const NotLinked: Story = { args: { linked: false } }
export const Linked: Story = { args: { linked: true, login: 'piluvitu' } }
