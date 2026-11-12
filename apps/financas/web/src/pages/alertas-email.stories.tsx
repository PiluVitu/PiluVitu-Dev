import {
  CartaoAlertasEmail,
  type CartaoAlertasEmailProps,
} from './alertas-email'

// CSF puro, no padrão de insight.stories.tsx: o apps/financas/web não tem
// Storybook instalado. alertas-email.test.tsx renderiza cada story.
type Story = { args: Partial<CartaoAlertasEmailProps> }

const meta = {
  title: 'Finanças/Configurações/Alertas por e-mail',
  component: CartaoAlertasEmail,
  args: {
    ligado: true,
    erroCarga: null,
    salvando: false,
    recusa: null,
    onAlternar: () => {},
    onTentarDeNovo: () => {},
  } satisfies CartaoAlertasEmailProps,
}

export default meta

export const Carregando: Story = { args: { ligado: null } }

export const Ligado: Story = { args: {} }

export const Desligado: Story = { args: { ligado: false } }

export const Salvando: Story = { args: { salvando: true } }

export const Recusado: Story = {
  args: {
    recusa:
      'Muitas gravações em pouco tempo. Espere 10 segundos e tente de novo.',
  },
}

export const ErroAoCarregar: Story = {
  args: { ligado: null, erroCarga: 'O servidor não respondeu.' },
}
