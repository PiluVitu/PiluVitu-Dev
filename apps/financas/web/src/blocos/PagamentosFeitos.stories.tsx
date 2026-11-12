import {
  PagamentosFeitos,
  type BillPaymentView,
  type PagamentosFeitosProps,
} from './PagamentosFeitos'

// CSF puro, no padrão de insight.stories.tsx: o apps/financas/web não tem
// Storybook instalado. PagamentosFeitos.test.tsx renderiza cada story.
type Story = { args: Partial<PagamentosFeitosProps> }

const base: BillPaymentView = {
  transfer_id: 'tr-exemplo',
  competence: '2026-08',
  paid_on: '2026-09-05',
  amount_cents: 184790,
  line_count: 40,
  from_account_id: 'conta-exemplo',
  from_account_name: 'Conta corrente',
}

const meta = {
  title: 'Finanças/Contas/Pagamentos feitos',
  component: PagamentosFeitos,
  args: {
    pagamentos: [base],
    erro: null,
    desabilitado: false,
    onDesfazer: () => {},
  } satisfies PagamentosFeitosProps,
}

export default meta

export const UmPagamento: Story = { args: {} }

export const VariosPagamentos: Story = {
  args: {
    pagamentos: [
      base,
      {
        ...base,
        transfer_id: 'tr-julho',
        competence: '2026-07',
        paid_on: '2026-08-04',
        amount_cents: 3000,
        line_count: 1,
        from_account_name: 'Poupança',
      },
    ],
  },
}

export const Travado: Story = { args: { desabilitado: true } }

export const ErroAoCarregar: Story = {
  args: { pagamentos: null, erro: 'o servidor não respondeu' },
}

export const SemPagamentos: Story = { args: { pagamentos: [] } }
