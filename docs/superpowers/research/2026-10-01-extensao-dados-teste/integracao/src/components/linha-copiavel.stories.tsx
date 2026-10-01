import type { Meta, StoryObj } from '@storybook/react-vite'
import { LinhaCopiavel } from './linha-copiavel'

const meta: Meta<typeof LinhaCopiavel> = { component: LinhaCopiavel }
export default meta

export const Normal: StoryObj<typeof LinhaCopiavel> = {
  args: { rotulo: 'CPF', valor: '529.982.247-25', copiado: false },
}
export const Copiado: StoryObj<typeof LinhaCopiavel> = {
  args: { rotulo: 'CPF', valor: '529.982.247-25', copiado: true },
}
