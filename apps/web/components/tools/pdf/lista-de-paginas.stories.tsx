import { useRef } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, fn, userEvent } from 'storybook/test'
import {
  BarraDaSelecao,
  ListaDaBancada,
  type ChaveDaBarra,
} from './lista-de-paginas'
import { TEXTOS } from './textos'

// A miniatura de mentira: uma folha com o número, como a do renderizador falso.
const miniatura = (numero: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210 297" width="210" height="297"><rect width="100%" height="100%" fill="#fff"/><text x="50%" y="257" text-anchor="middle" font-family="sans-serif" font-size="56" fill="#18181b">${numero}</text></svg>`,
  )}`

// O cartão da Bancada, com o rótulo pela posição e a origem (arquivo e página) embaixo.
const daBancada = [
  { id: 'a0p0', origem: { arquivo: 0, indice: 0 }, giro: 0 as const },
  { id: 'a0p3', origem: { arquivo: 0, indice: 3 }, giro: 90 as const },
  { id: 'a1p0', origem: { arquivo: 1, indice: 0 }, giro: 0 as const },
  { id: 'a0p1', origem: { arquivo: 0, indice: 1 }, giro: 0 as const },
  { id: 'a0p5', origem: { arquivo: 0, indice: 5 }, giro: 0 as const },
]

const miniaturasDaBancada = {
  urls: new Map(
    daBancada
      .filter(({ id }) => id !== 'a0p5')
      .map(({ id }, i) => [id, miniatura(i + 1)]),
  ),
  falhas: new Set(['a0p5']),
  observar: () => () => {},
}

const meta = {
  title: 'Tools/PDF/ListaDePaginas',
  component: ListaDaBancada,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="w-60">
        <h2 id="titulo-paginas" className="mb-2 font-semibold">
          {TEXTOS.editar.paginasDoDocumento.titulo}
        </h2>
        <Story />
        <p id="dica-unica" className="text-muted-foreground mt-2 text-xs">
          {TEXTOS.organizar.dicas.ultimaPagina}
        </p>
      </div>
    ),
  ],
  args: {
    paginas: daBancada,
    nomesDosArquivos: ['contrato.pdf', 'anexo-rg.pdf'],
    marcadas: new Set<string>(),
    aberta: 'a0p3',
    miniaturas: miniaturasDaBancada,
    bloqueado: false,
    idDoTitulo: 'titulo-paginas',
    idDaDicaUnica: 'dica-unica',
    aoAgir: fn(),
    aoMover: fn(),
    registrarCaixa: fn(),
  },
} satisfies Meta<typeof ListaDaBancada>

export default meta
type Story = StoryObj<typeof meta>

export const CartoesDaBancada: Story = {
  args: { marcadas: new Set(['a0p1']) },
  play: async ({ canvas, args }) => {
    await expect(canvas.getAllByRole('listitem')).toHaveLength(5)
    await expect(
      canvas.getByRole('button', { name: 'Abrir a página 2' }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(canvas.getByText('girada 90°')).toBeVisible()
    await expect(canvas.getByText('contrato.pdf, pág. 4')).toBeVisible()
    await expect(canvas.getByText('anexo-rg.pdf, pág. 1')).toBeVisible()
    await expect(
      canvas.getByRole('checkbox', { name: 'Selecionar página 4' }),
    ).toBeChecked()
    await expect(canvas.getByText(TEXTOS.organizar.semMiniatura)).toBeVisible()
    await userEvent.click(
      canvas.getByRole('button', { name: 'Abrir a página 5' }),
    )
    await expect(args.aoAgir).toHaveBeenCalledWith({
      tipo: 'abrir',
      id: 'a0p5',
    })
    await userEvent.click(
      canvas.getByRole('button', { name: 'Girar a página 1 à direita' }),
    )
    await expect(args.aoAgir).toHaveBeenCalledWith({
      tipo: 'girar',
      id: 'a0p0',
    })
  },
}

export const UmaPaginaSo: Story = {
  args: { paginas: [daBancada[0]], aberta: 'a0p0' },
  play: async ({ canvas }) => {
    const apagar = canvas.getByRole('button', { name: 'Apagar a página 1' })
    await expect(apagar).toBeDisabled()
    await expect(apagar).toHaveAccessibleDescription(
      TEXTOS.organizar.dicas.ultimaPagina,
    )
  },
}

export const Bloqueada: Story = {
  args: { bloqueado: true, marcadas: new Set(['a0p0']) },
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
        botoes={(
          [
            'girarEsquerda',
            'girarDireita',
            'moverAntes',
            'moverDepois',
            'apagar',
            'extrair',
            'selecionarTodas',
            'desfazer',
          ] as const
        ).map((chave) => ({
          chave,
          motivo:
            chave === 'moverAntes'
              ? 'noComeco'
              : chave === 'desfazer'
                ? 'nadaParaDesfazer'
                : null,
        }))}
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

function BarraCompacta() {
  const botoesRef = useRef(new Map<ChaveDaBarra, HTMLButtonElement>())
  return (
    <div className="w-60">
      <BarraDaSelecao
        botoes={(
          [
            'girarEsquerda',
            'girarDireita',
            'moverAntes',
            'moverDepois',
            'apagar',
            'desfazer',
            'extrair',
            'selecionarTodas',
          ] as const
        ).map((chave) => ({
          chave,
          motivo: chave === 'desfazer' ? 'nadaParaDesfazer' : null,
        }))}
        botoesRef={botoesRef}
        idDaDica={(motivo) => `dica-${motivo}`}
        aoUsar={fn()}
        prefixo="editar-pdf"
        soIcone={[
          'girarEsquerda',
          'girarDireita',
          'moverAntes',
          'moverDepois',
          'apagar',
          'desfazer',
        ]}
        rotulos={{ desfazer: TEXTOS.editar.paginasDoDocumento.desfazer }}
      />
      <p id="dica-nadaParaDesfazer" className="text-muted-foreground text-xs">
        {TEXTOS.organizar.dicas.nadaParaDesfazer}
      </p>
    </div>
  )
}

export const BarraDaBancada: Story = {
  render: () => <BarraCompacta />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: 'Desfazer nas páginas' }),
    ).toHaveAccessibleDescription(TEXTOS.organizar.dicas.nadaParaDesfazer)
    await expect(
      canvas.getByRole('button', { name: 'Extrair as selecionadas' }),
    ).toBeVisible()
  },
}

// Editor único, PR 5: a página em branco no cartão, sem miniatura do pdf.js, com o tamanho na origem.
const comBrancas = [
  daBancada[0],
  {
    id: 'b0',
    origem: { branca: { largura: 595.28, altura: 841.89 } },
    giro: 0 as const,
  },
  {
    id: 'b1',
    origem: { branca: { largura: 841.89, altura: 595.28 } },
    giro: 0 as const,
  },
  {
    id: 'b2',
    origem: { branca: { largura: 612, altura: 792 } },
    giro: 90 as const,
  },
]

export const CartaoDaPaginaEmBranco: Story = {
  render: () => (
    <div className="w-60">
      <ListaDaBancada
        paginas={comBrancas}
        nomesDosArquivos={['contrato.pdf']}
        marcadas={new Set(['b1'])}
        aberta="b1"
        miniaturas={miniaturasDaBancada}
        bloqueado={false}
        idDoTitulo="titulo-paginas"
        idDaDicaUnica="dica-unica"
        aoAgir={fn()}
        aoMover={fn()}
        registrarCaixa={fn()}
      />
    </div>
  ),
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText('Página em branco, A4')).toBeVisible()
    await expect(canvas.getByText('Página em branco, A4 deitada')).toBeVisible()
    await expect(
      canvas.getByText('Página em branco, 21,6 × 27,9 cm'),
    ).toBeVisible()
    await expect(
      canvas.getByRole('checkbox', { name: 'Selecionar página 3' }),
    ).toBeChecked()
    await expect(
      canvasElement.querySelectorAll('[data-testid="editar-pdf-folha-branca"]'),
    ).toHaveLength(3)
  },
}
