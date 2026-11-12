import {
  CampoLancarSozinho,
  LinhaDaRecorrente,
  type CampoLancarSozinhoProps,
  type LinhaDaRecorrenteProps,
  type RecurringExpenseView,
} from './recorrentes'

// CSF puro, no padrão de insight.stories.tsx: o apps/financas/web não tem
// Storybook instalado. recorrentes.test.tsx renderiza cada story.
const base: RecurringExpenseView = {
  id: 'r-exemplo',
  description: 'Internet fibra',
  category_id: null,
  account_id: 'conta-exemplo',
  scope: 'PF',
  day_of_month: 10,
  amount_min_cents: 9990,
  amount_max_cents: 9990,
  starts_on: '2026-11-02',
  ends_on: null,
  active: 1,
  notes: null,
  frequency: 'monthly',
  generate_since: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
}

const linha = (patch: Partial<RecurringExpenseView>) => ({
  args: {
    recorrente: { ...base, ...patch },
    categoria: 'Casa',
    conta: patch.account_id === null ? null : 'Conta corrente',
    excluindo: false,
    onEditar: () => {},
    onExcluir: () => {},
  } satisfies LinhaDaRecorrenteProps,
  render: (p: LinhaDaRecorrenteProps) => (
    <ul>
      <LinhaDaRecorrente {...p} />
    </ul>
  ),
})

const campo = (patch: Partial<CampoLancarSozinhoProps>) => ({
  args: {
    ligado: false,
    temConta: true,
    ligadoDesde: null,
    onChange: () => {},
    ...patch,
  } satisfies CampoLancarSozinhoProps,
  render: (p: CampoLancarSozinhoProps) => <CampoLancarSozinho {...p} />,
})

const meta = { title: 'Finanças/Recorrentes' }
export default meta

export const LinhaMensal = linha({})

export const LinhaSemanal = linha({
  description: 'Academia',
  frequency: 'weekly',
  day_of_month: 2,
  amount_min_cents: 4000,
  amount_max_cents: 6000,
})

export const LinhaQuinzenal = linha({
  description: 'Diarista',
  frequency: 'biweekly',
  day_of_month: 2,
  amount_min_cents: 18000,
  amount_max_cents: 18000,
})

export const LinhaAnual = linha({
  description: 'Anuidade',
  frequency: 'annual',
  day_of_month: 5,
  starts_on: '2026-03-01',
  amount_min_cents: 12000,
  amount_max_cents: 12000,
})

export const LinhaLancaSozinha = linha({ generate_since: '2026-11-05' })

export const LinhaSemConta = linha({
  account_id: null,
  generate_since: '2026-11-05',
})

export const CampoDesligado = campo({})

export const CampoLigadoDesde = campo({
  ligado: true,
  ligadoDesde: '2026-11-05',
})

export const CampoSemConta = campo({ temConta: false })
