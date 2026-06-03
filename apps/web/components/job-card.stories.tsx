import type { Meta, StoryObj } from '@storybook/nextjs'
import { JobCard } from './job-card'

const meta: Meta<typeof JobCard> = {
  title: 'Home/JobCard',
  component: JobCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof JobCard>

const base = {
  id: 'viralizeplus',
  orgName: 'ViralizePlus',
  orgDescription: 'Sua comunidade de desenvolvimento open source.',
  orgLink: 'https://www.viralizeplus.com.br/',
  altImage: 'V+',
  title: 'Site Reliability Engineer',
  location: 'Remoto',
  date: 'Dez 2024 — Atual',
  atribuitions: [
    'Reestruturação das entregas com GitHub Actions, acelerando releases em ~60%.',
    'Eficiência na AWS com economia de ~40% na fatura mensal.',
    'Monitoramento com Grafana e Prometheus para visibilidade 24/7.',
  ],
  current: true,
  tags: ['Remoto'],
}

export const Atual: Story = { args: base }
export const Passado: Story = {
  args: { ...base, current: false, date: 'Dez 2023 — Out 2024', tags: [] },
}
