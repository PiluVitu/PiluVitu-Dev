import type { LinhaOrcamento } from '../lib/orcamento'
import { LinhaDoOrcamento } from './orcamento'

// CSF puro, no padrão de insight.stories.tsx: o apps/financas/web não tem
// Storybook instalado. orcamento.test.tsx renderiza cada story.
type Story = { args: Partial<Props> }
type Props = React.ComponentProps<typeof LinhaDoOrcamento>

const base: LinhaOrcamento = {
  category_id: 'cat-exemplo',
  category_name: 'Mercado',
  parent_name: null,
  budget_cents: 40000,
  spent_cents: 10000,
  budgetable: true,
}

const meta = {
  title: 'Finanças/Orçamento/Linha',
  component: LinhaDoOrcamento,
  args: {
    linha: base,
    onSalvar: async () => null,
    onRemover: async () => null,
  } satisfies Props,
}

export default meta

export const Dentro: Story = { args: {} }

export const ExatamenteCem: Story = {
  args: { linha: { ...base, spent_cents: 40000 } },
}

export const Estourado: Story = {
  args: { linha: { ...base, spent_cents: 52000 } },
}

export const SemOrcamento: Story = {
  args: { linha: { ...base, budget_cents: null, spent_cents: 12000 } },
}

export const NaoOrcavel: Story = {
  args: {
    linha: {
      ...base,
      category_name: 'Antiga',
      spent_cents: 2500,
      budgetable: false,
    },
  },
}
