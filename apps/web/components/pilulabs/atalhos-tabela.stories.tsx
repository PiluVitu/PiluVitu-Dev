import type { Meta, StoryObj } from '@storybook/nextjs'
import { AtalhosTabela } from './atalhos-tabela'

const CHROMIUM = { windows: 'Ctrl+Shift+Y', mac: '⌥⇧P', linux: 'Ctrl+Shift+Y' }

const meta = {
  title: 'PiluLabs/AtalhosTabela',
  component: AtalhosTabela,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AtalhosTabela>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {
  args: {
    atalhos: {
      chrome: CHROMIUM,
      edge: CHROMIUM,
      opera: CHROMIUM,
      firefox: { ...CHROMIUM, linux: 'Alt+Shift+P' },
    },
  },
}
