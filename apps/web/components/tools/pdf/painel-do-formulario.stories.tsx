import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, fn, userEvent } from 'storybook/test'
import type { Formulario } from '@piluvitu/tools/pdf-regras'
import { FORMULARIO_DE_TESTE } from './motor-falso'
import { PainelDoFormulario } from './painel-do-formulario'
import { useFormularioDoPdf } from './use-formulario-do-pdf'

// O painel só mostra; a story faz o papel da tela e guarda os valores pelo mesmo hook.
function PainelNaTela({
  formulario,
  erroNoNome,
}: {
  formulario: Formulario
  erroNoNome?: boolean
}) {
  const estado = useFormularioDoPdf(formulario)
  const erros = erroNoNome
    ? new Map([
        [
          0,
          'Este caractere não entra, porque as fontes do PDF não o escrevem: 😀. Use letras, números e sinais comuns.',
        ],
      ])
    : estado.erros
  return (
    <div className="max-w-md">
      <PainelDoFormulario
        formulario={formulario}
        valores={estado.valores}
        erros={erros}
        registrar={() => {}}
        aoMudar={estado.mudar}
        aoFocar={fn()}
      />
    </div>
  )
}

const meta = {
  title: 'Tools/PDF/PainelDoFormulario',
  component: PainelNaTela,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { formulario: FORMULARIO_DE_TESTE },
} satisfies Meta<typeof PainelNaTela>

export default meta
type Story = StoryObj<typeof meta>

export const TodosOsTipos: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('form', { name: 'Formulário do PDF' }),
    ).toBeVisible()
    const nome = canvas.getByRole('textbox', {
      name: 'Nome completo (obrigatório)',
    })
    await userEvent.type(nome, 'Ana Souza')
    await expect(canvas.getByText('9 de 40 caracteres')).toBeVisible()
    await expect(
      canvas.getByRole('radiogroup', { name: 'plano' }),
    ).toBeVisible()
    await expect(
      canvas.getByRole('combobox', { name: 'Estado' }),
    ).toHaveDisplayValue('SP')
  },
}

export const Hibrido: Story = {
  args: { formulario: { ...FORMULARIO_DE_TESTE, hibrido: true } },
}

export const Xfa: Story = {
  args: { formulario: { tipo: 'xfa' } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('form')).toBeNull()
  },
}

export const AssinadoDigitalmente: Story = {
  args: {
    formulario: { ...FORMULARIO_DE_TESTE, assinadoDigitalmente: true },
  },
}

export const SemFormulario: Story = { args: { formulario: { tipo: 'nenhum' } } }

export const ComErro: Story = {
  args: { erroNoNome: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      /fontes do PDF não o escrevem/,
    )
    await expect(
      canvas.getByRole('textbox', { name: 'Nome completo (obrigatório)' }),
    ).toHaveAttribute('aria-invalid', 'true')
  },
}
