import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { ProjectList } from './project-list'

const meta: Meta<typeof ProjectList> = {
  title: 'Admin/Content/ProjectList',
  component: ProjectList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onReorder: fn(), onEdit: fn(), onDelete: fn() },
}
export default meta
type Story = StoryObj<typeof ProjectList>

export const Default: Story = {
  args: {
    entries: [
      {
        slug: 'live-prs',
        data: {
          projectSlug: 'live-prs',
          order: 0,
          projectName: 'Live PRs',
          subtitle: 'agregador',
          projectLogo: '',
          description: '',
          tags: [],
          deployLink: '',
          repoLink: '',
          image: '',
          altImage: '',
        },
      },
    ],
  },
}
