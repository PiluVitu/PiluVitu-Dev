import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { CarreiraForm } from './carreira-form'

const meta: Meta<typeof CarreiraForm> = {
  title: 'Admin/Content/CarreiraForm',
  component: CarreiraForm,
  tags: ['autodocs'],
  args: { onSubmit: fn() },
}
export default meta
type Story = StoryObj<typeof CarreiraForm>

export const New: Story = {}

export const Editing: Story = {
  args: {
    initial: {
      orgSlug: 'aride',
      order: 1,
      orgName: 'Aride',
      orgDescription: 'Seguro de bikes',
      orgLink: 'https://aride.com.br',
      image: '',
      altImage: 'AR',
      title: 'Software Developer',
      location: 'Remoto',
      date: 'Mar, 2024 - Atualmente',
      atribuitions: ['Criação de componentes'],
      current: true,
      tags: ['Remoto'],
    },
  },
}
