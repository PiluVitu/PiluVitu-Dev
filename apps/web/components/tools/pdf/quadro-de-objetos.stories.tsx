import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, fn, userEvent } from 'storybook/test'
import type { ObjetoNaTela } from './motor'
import { ESTILOS_PADRAO, type Ferramenta } from './objetos'
import { QuadroDeObjetos } from './quadro-de-objetos'

const A4 = { largura: 595, altura: 842 }

const OBJETOS: ObjetoNaTela[] = [
  {
    id: 'cobrir',
    tipo: 'cobrir',
    x: 60,
    y: 90,
    largura: 220,
    altura: 26,
  },
  {
    id: 'texto',
    tipo: 'texto',
    x: 64,
    y: 94,
    largura: 150,
    altura: 18,
    conteudo: 'Rua Nova, 123',
    fonte: 'helvetica',
    negrito: false,
    italico: false,
    tamanho: 18,
    cor: '#000000',
  },
  {
    id: 'marca',
    tipo: 'marca-texto',
    x: 60,
    y: 200,
    largura: 300,
    altura: 20,
    cor: '#facc15',
  },
  {
    id: 'elipse',
    tipo: 'elipse',
    x: 320,
    y: 380,
    largura: 160,
    altura: 90,
    cor: '#dc2626',
    espessura: 3,
  },
  {
    id: 'seta',
    tipo: 'seta',
    x: 160,
    y: 420,
    largura: 150,
    altura: 30,
    inicio: 'inferior-esquerdo',
    cor: '#1d4ed8',
    espessura: 3,
  },
]

// O quadro guarda só o arraste em curso; a story faz o papel da tela e guarda os objetos.
function QuadroNaFolha({
  ferramenta,
  inicial,
}: {
  ferramenta: Ferramenta
  inicial: ObjetoNaTela[]
}) {
  const [objetos, setObjetos] = useState(inicial)
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const quadroRef = useRef<HTMLDivElement>(null)
  return (
    <div className="space-y-2">
      <div
        className="relative bg-white shadow-sm"
        style={{ width: 357, height: 505 }}
      >
        <QuadroDeObjetos
          numeroDaPagina={1}
          tamanho={A4}
          objetos={objetos}
          selecionado={selecionado}
          ferramenta={ferramenta}
          urlsDasImagens={new Map()}
          nomesDasImagens={new Map()}
          estiloDoDesenho={ESTILOS_PADRAO.traco}
          idDasInstrucoes="instrucoes"
          quadroRef={quadroRef}
          registrar={() => {}}
          aoFocar={setSelecionado}
          aoMudar={(novo) =>
            setObjetos((todos) =>
              todos.map((o) => (o.id === novo.id ? novo : o)),
            )
          }
          aoApagar={(id) =>
            setObjetos((todos) => todos.filter((o) => o.id !== id))
          }
          aoEditarTexto={fn()}
          aoSoltar={() => setSelecionado(null)}
          aoCriar={fn()}
          aoDesenhar={fn()}
          aoClicarNaPagina={fn()}
        />
      </div>
      <p id="instrucoes" className="text-muted-foreground max-w-sm text-xs">
        Setas movem, Alt com as setas muda o tamanho, Delete apaga.
      </p>
    </div>
  )
}

const meta = {
  title: 'Tools/PDF/QuadroDeObjetos',
  component: QuadroNaFolha,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { ferramenta: 'selecionar', inicial: OBJETOS },
} satisfies Meta<typeof QuadroNaFolha>

export default meta
type Story = StoryObj<typeof meta>

export const Objetos: Story = {}

export const MoverPeloTeclado: Story = {
  play: async ({ canvas }) => {
    const elipse = canvas.getByRole('button', {
      name: /^Elipse, em 320 por 380/,
    })
    elipse.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}')
    await expect(
      canvas.getByRole('button', { name: /^Elipse, em 330 por 380/ }),
    ).toHaveFocus()
  },
}

export const DesenhoLigado: Story = { args: { ferramenta: 'desenho' } }

export const Vazio: Story = { args: { inicial: [] } }
