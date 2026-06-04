import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { ProjectForm } from './project-form'

const meta: Meta<typeof ProjectForm> = {
  title: 'Admin/Content/ProjectForm',
  component: ProjectForm,
  tags: ['autodocs'],
  args: { onSubmit: fn() },
}
export default meta
type Story = StoryObj<typeof ProjectForm>

export const New: Story = {}

export const Editing: Story = {
  args: {
    initial: {
      projectSlug: 'live-prs',
      order: 0,
      projectName: 'Live PRs',
      subtitle: 'agregador',
      projectLogo: '/x.svg',
      description: 'desc',
      tags: ['Go'],
      deployLink: 'https://x',
      repoLink: '',
      image: '/i.png',
      altImage: 'LPR',
    },
  },
}
