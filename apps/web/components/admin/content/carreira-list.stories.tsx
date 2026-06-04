import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { CarreiraList } from './carreira-list'

const meta: Meta<typeof CarreiraList> = {
  title: 'Admin/Content/CarreiraList',
  component: CarreiraList,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { onReorder: fn(), onEdit: fn(), onDelete: fn() },
}
export default meta
type Story = StoryObj<typeof CarreiraList>

export const Default: Story = {
  args: {
    entries: [
      {
        slug: 'aride',
        data: {
          orgSlug: 'aride',
          order: 0,
          orgName: 'Aride',
          orgDescription: '',
          orgLink: '',
          image: '',
          altImage: 'AR',
          title: 'Software Developer',
          location: 'Remoto',
          date: 'Mar 2024 — Atual',
          atribuitions: [],
          current: true,
          tags: [],
        },
      },
      {
        slug: 'dev-hatt',
        data: {
          orgSlug: 'dev-hatt',
          order: 1,
          orgName: 'Dev Hatt',
          orgDescription: '',
          orgLink: '',
          image: '',
          altImage: 'DH',
          title: 'DevOps / SRE',
          location: 'Remoto',
          date: 'Dez 2023 — Out 2024',
          atribuitions: [],
          current: false,
          tags: [],
        },
      },
    ],
  },
}
