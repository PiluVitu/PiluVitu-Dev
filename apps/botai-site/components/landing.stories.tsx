import type { Meta, StoryObj } from '@storybook/nextjs'
import { modeloDaLanding } from '@/lib/modelo'
import { Landing } from './landing'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }
const NAS_QUATRO = {
  chromeUrl: 'https://chromewebstore.google.com/detail/botai/abc',
  firefoxUrl: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/',
  edgeUrl: 'https://microsoftedge.microsoft.com/addons/detail/botai/xyz',
  operaUrl: 'https://addons.opera.com/pt-br/extensions/details/botai/',
}

const meta = {
  title: 'Landing/Página',
  component: Landing,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Landing>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: modeloDaLanding(SEM_LOJA) }
export const SoFirefox: Story = {
  args: modeloDaLanding({ ...SEM_LOJA, firefoxUrl: NAS_QUATRO.firefoxUrl }),
}
export const NasQuatroLojas: Story = { args: modeloDaLanding(NAS_QUATRO) }
export const EmBreveClaro: Story = {
  args: modeloDaLanding(SEM_LOJA),
  globals: { tema: 'claro' },
}
