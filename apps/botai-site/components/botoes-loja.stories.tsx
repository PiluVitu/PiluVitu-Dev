import type { Meta, StoryObj } from '@storybook/nextjs'
import { botoesDasLojas } from '@/lib/modelo'
import { BotoesLoja } from './botoes-loja'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }
const NAS_QUATRO = {
  chromeUrl: 'https://chromewebstore.google.com/detail/botai/abc',
  firefoxUrl: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/',
  edgeUrl: 'https://microsoftedge.microsoft.com/addons/detail/botai/xyz',
  operaUrl: 'https://addons.opera.com/pt-br/extensions/details/botai/',
}

const meta = {
  title: 'Landing/BotoesLoja',
  component: BotoesLoja,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof BotoesLoja>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: { lojas: botoesDasLojas(SEM_LOJA) } }
export const SoFirefox: Story = {
  args: {
    lojas: botoesDasLojas({ ...SEM_LOJA, firefoxUrl: NAS_QUATRO.firefoxUrl }),
  },
}
export const NasQuatro: Story = { args: { lojas: botoesDasLojas(NAS_QUATRO) } }
export const Outline: Story = {
  args: { lojas: botoesDasLojas(NAS_QUATRO), variante: 'outline' },
}
