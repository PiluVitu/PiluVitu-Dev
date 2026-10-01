import type { Meta, StoryObj } from '@storybook/nextjs'
import { BotoesLoja } from './botoes-loja'

const meta = {
  title: 'PiluLabs/BotoesLoja',
  component: BotoesLoja,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof BotoesLoja>

export default meta
type Story = StoryObj<typeof meta>

export const Nenhuma: Story = { args: { lojas: [] } }

export const UmaLoja: Story = {
  args: {
    lojas: [
      {
        loja: 'firefox',
        url: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/',
      },
    ],
  },
}

export const AsQuatro: Story = {
  args: {
    lojas: [
      {
        loja: 'chrome',
        url: 'https://chromewebstore.google.com/detail/botai/abc',
      },
      {
        loja: 'firefox',
        url: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/',
      },
      {
        loja: 'edge',
        url: 'https://microsoftedge.microsoft.com/addons/detail/botai/xyz',
      },
      {
        loja: 'opera',
        url: 'https://addons.opera.com/pt-br/extensions/details/botai/',
      },
    ],
  },
}
