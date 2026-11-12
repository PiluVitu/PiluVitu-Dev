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
    envio: {
      estado: 'pronto',
      modo: 'email_routing',
      em: '2026-11-10T09:00:12.000Z',
    },
    erroCarga: null,
    salvando: false,
    recusa: null,
    onAlternar: () => {},
    onTentarDeNovo: () => {},
  } satisfies CartaoAlertasEmailProps,
}

export default meta

export const Carregando: Story = { args: { ligado: null, envio: null } }

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
  args: { ligado: null, envio: null, erroCarga: 'O servidor não respondeu.' },
}

export const Pronto: Story = {
  args: {
    envio: {
      estado: 'pronto',
      modo: 'email_routing',
      em: '2026-11-11T09:00:07.000Z',
    },
  },
}

export const Aguardando: Story = {
  args: { envio: { estado: 'aguardando', modo: 'email_routing' } },
}

export const NaoConfigurado: Story = {
  args: {
    envio: {
      estado: 'nao_configurado',
      modo: 'email_routing',
      codigo: 'E_SENDER_NOT_VERIFIED',
      em: '2026-11-11T09:00:03.000Z',
    },
  },
}

export const Falhou: Story = {
  args: {
    envio: {
      estado: 'falhou',
      modo: 'email_routing',
      codigo: 'E_DELIVERY_FAILED',
      em: '2026-11-11T09:00:05.000Z',
    },
  },
}
