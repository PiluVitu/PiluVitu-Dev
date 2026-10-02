import type { Meta, StoryObj } from '@storybook/nextjs'
import { Hero } from './hero'

const meta = {
  title: 'Landing/Hero',
  component: Hero,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Hero>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
