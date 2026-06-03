import type { Meta, StoryObj } from '@storybook/nextjs'
import { ProjectCard } from './project-card'

const meta: Meta<typeof ProjectCard> = {
  title: 'Home/ProjectCard',
  component: ProjectCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof ProjectCard>

const base = {
  id: 'live-prs',
  projectName: 'Live PRs',
  subtitle: 'agregador de pull requests',
  projectLogo: '/pr-live-dark.svg',
  image: undefined,
  description:
    'Agrega os pull requests em que sua revisão foi solicitada, por repositório ou organização. Reúne tudo em cards com estado do PR, checks de CI e assignees.',
  tags: ['React', 'Next', 'Go', 'Tailwind', 'Docker', 'AWS', 'Grafana'],
  deployLink: 'https://example.com',
  repoLink: 'https://github.com/example',
  altImage: 'LPR',
}

export const Default: Story = { args: base }
export const SemSubtitulo: Story = {
  args: { ...base, subtitle: '', repoLink: '' },
}
