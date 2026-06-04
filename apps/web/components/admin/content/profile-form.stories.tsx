import type { Meta, StoryObj } from '@storybook/nextjs'
import { fn } from 'storybook/test'
import { ProfileForm } from './profile-form'

const meta: Meta<typeof ProfileForm> = {
  title: 'Admin/Content/ProfileForm',
  component: ProfileForm,
  tags: ['autodocs'],
  args: { onSubmit: fn() },
}
export default meta
type Story = StoryObj<typeof ProfileForm>

export const Default: Story = {
  args: {
    initial: {
      displayName: 'Paulo Victor Torres Silva',
      avatarSrc: '/profile-2.jpg',
      avatarAlt: 'Paulo',
      roleHighlight: 'Site Reliability Engineering',
      companyName: 'Reapho',
      companyLink: 'https://reapho.app/en',
      companyLinkColor: '#14b8a6',
      bio: 'DevOps Engineer com 3 anos de experiência…',
      availabilityOpen: true,
      availabilityLabel: 'Disponível para oportunidades',
      location: 'Brasil · Remoto',
      disciplines: ['SRE', 'DevOps', 'Cloud'],
    },
  },
}
