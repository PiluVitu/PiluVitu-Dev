import { useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, fn, userEvent } from 'storybook/test'
import {
  BarraDaSelecao,
  ListaDePaginas,
  ORDEM_DA_BARRA,
  type ChaveDaBarra,
} from './lista-de-paginas'
import { TEXTOS } from './textos'

// A miniatura de mentira: uma folha com o número, como a do renderizador falso.
const miniatura = (numero: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210" height="297"><rect width="100%" height="100%" fill="#fff"/><text x="50%" y="257" text-anchor="middle" font-family="sans-serif" font-size="56" fill="#18181b">${numero}</text></svg>`,
  )}`

const miniaturas = {
  urls: new Map(Array.from({ length: 5 }, (_, i) => [i, miniatura(i + 1)])),
  falhas: new Set([5]),
  observar: () => () => {},
}

const plano = [
  { indice: 0, giro: 0 as const },
  { indice: 1, giro: 90 as const },
  { indice: 2, giro: 0 as const },
  { indice: 3, giro: 0 as const },
  { indice: 4, giro: 180 as const },
  { indice: 5, giro: 0 as const },
]

const meta = {
  title: 'Tools/PDF/ListaDePaginas',
  component: ListaDePaginas,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <h2 id="titulo-paginas" className="mb-2 font-semibold">
          {TEXTOS.organizar.titulo}
        </h2>
        <Story />
        <p id="dica-unica" className="text-muted-foreground mt-2 text-xs">
          {TEXTOS.organizar.dicas.ultimaPagina}
        </p>
      </div>
    ),
  ],
  args: {
    plano,
    selecionadas: new Set<number>(),
    miniaturas,
    bloqueado: false,
    idDoTitulo: 'titulo-paginas',
    idDaDicaUnica: 'dica-unica',
    aoAgir: fn(),
    aoMover: fn(),
    registrarCaixa: fn(),
  },
} satisfies Meta<typeof ListaDePaginas>

export default meta
type Story = StoryObj<typeof meta>

export const Paginas: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(6)
    await expect(canvas.getByText('girada 90°')).toBeVisible()
    await expect(canvas.getByText(TEXTOS.organizar.semMiniatura)).toBeVisible()
  },
}

export const ComSelecao: Story = {
  args: { selecionadas: new Set([1, 3]) },
  play: async ({ canvas, args }) => {
    await expect(
      canvas.getByRole('checkbox', { name: 'Selecionar página 2' }),
    ).toBeChecked()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Girar a página 1 à direita' }),
    )
    await expect(args.aoAgir).toHaveBeenCalledWith({ tipo: 'girar', indice: 0 })
  },
}

export const UmaPaginaSo: Story = {
  args: { plano: [plano[0]] },
  play: async ({ canvas }) => {
    const apagar = canvas.getByRole('button', { name: 'Apagar a página 1' })
    await expect(apagar).toBeDisabled()
    await expect(apagar).toHaveAccessibleDescription(
      TEXTOS.organizar.dicas.ultimaPagina,
    )
  },
}

export const Bloqueada: Story = {
  args: { bloqueado: true, selecionadas: new Set([0]) },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('checkbox', { name: 'Selecionar página 1' }),
    ).toBeDisabled()
  },
}

function BarraComSelecao({
  aoUsar,
}: {
  aoUsar: (chave: ChaveDaBarra) => void
}) {
  const botoesRef = useRef(new Map<ChaveDaBarra, HTMLButtonElement>())
  return (
    <div className="space-y-2">
      <BarraDaSelecao
        botoes={ORDEM_DA_BARRA.filter((chave) => chave !== 'limparSelecao').map(
          (chave) => ({
            chave,
            motivo:
              chave === 'moverAntes'
                ? 'noComeco'
                : chave === 'desfazer'
                  ? 'nadaParaDesfazer'
                  : null,
          }),
        )}
        botoesRef={botoesRef}
        idDaDica={(motivo) => `dica-${motivo}`}
        aoUsar={aoUsar}
      />
      <ul className="text-muted-foreground text-xs">
        <li id="dica-noComeco">{TEXTOS.organizar.dicas.noComeco}</li>
        <li id="dica-nadaParaDesfazer">
          {TEXTOS.organizar.dicas.nadaParaDesfazer}
        </li>
      </ul>
    </div>
  )
}

const aoUsarDaBarra = fn()

export const BarraDaSelecaoComSetas: Story = {
  render: () => <BarraComSelecao aoUsar={aoUsarDaBarra} />,
  play: async ({ canvas }) => {
    const toolbar = canvas.getByRole('toolbar')
    await expect(toolbar).toHaveAccessibleName(TEXTOS.organizar.barra)
    const primeiro = canvas.getByRole('button', { name: 'Girar à esquerda' })
    primeiro.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(
      canvas.getByRole('button', { name: 'Girar à direita' }),
    ).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(
      canvas.getByRole('button', { name: 'Mover para depois' }),
    ).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(aoUsarDaBarra).toHaveBeenCalledWith('moverDepois')
    await expect(
      canvas.getByRole('button', { name: 'Mover para antes' }),
    ).toHaveAccessibleDescription(TEXTOS.organizar.dicas.noComeco)
  },
}
