import type { MetaView } from '../lib/metas'
import { CartaoDaMeta, type CartaoDaMetaProps } from './metas'

// CSF puro, no padrão de insight.stories.tsx: o apps/financas/web não tem
// Storybook instalado. metas.test.tsx renderiza cada story.
type Story = { args: Partial<CartaoDaMetaProps> }

const base: MetaView = {
  id: 'meta-exemplo',
  name: 'Viagem',
  target_cents: 500000,
  target_date: '2027-06-30',
  account_id: 'conta-exemplo',
  account_name: 'Poupança',
  balance_cents: 125000,
  pct: 25,
  status: 'em_andamento',
  missing_cents: 375000,
  months_left: 10,
  monthly_needed_cents: 37500,
  editable: true,
  reserve_overlap: false,
}

const meta = {
  title: 'Finanças/Metas/Cartão',
  component: CartaoDaMeta,
  args: {
    meta: base,
    confirmando: false,
    ocupado: false,
    erro: null,
    onEditar: () => {},
    onExcluir: () => {},
    onConfirmarExclusao: () => {},
    onCancelarExclusao: () => {},
  } satisfies CartaoDaMetaProps,
}

export default meta

export const EmAndamento: Story = { args: {} }

export const SemPrazo: Story = {
  args: {
    meta: {
      ...base,
      target_date: null,
      months_left: null,
      monthly_needed_cents: null,
    },
  },
}

export const Concluida: Story = {
  args: {
    meta: {
      ...base,
      balance_cents: 500000,
      pct: 100,
      status: 'concluida',
      missing_cents: 0,
      months_left: null,
      monthly_needed_cents: null,
    },
  },
}

export const Atrasada: Story = {
  args: {
    meta: {
      ...base,
      target_date: '2026-03-31',
      status: 'atrasada',
      months_left: null,
      monthly_needed_cents: null,
    },
  },
}

export const ContaArquivada: Story = {
  args: { meta: { ...base, editable: false } },
}

export const NaReserva: Story = {
  args: { meta: { ...base, reserve_overlap: true } },
}
