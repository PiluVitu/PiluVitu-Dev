import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs'
import { expect, fn, userEvent } from 'storybook/test'
import type { ObjetoNaTela } from './motor'
import { comMudanca } from './objetos'
import { PainelDoObjeto } from './painel-do-objeto'

const A4 = { largura: 595, altura: 842 }

const TEXTO: ObjetoNaTela = {
  id: 'texto',
  tipo: 'texto',
  x: 72,
  y: 96,
  largura: 120,
  altura: 15,
  conteudo: 'Paulo Victor',
  fonte: 'helvetica',
  negrito: false,
  italico: false,
  tamanho: 16,
  cor: '#000000',
}

const SETA: ObjetoNaTela = {
  id: 'seta',
  tipo: 'seta',
  x: 200,
  y: 300,
  largura: 120,
  altura: 40,
  inicio: 'superior-esquerdo',
  cor: '#dc2626',
  espessura: 2,
}

// O painel é controlado: a story guarda o objeto e aplica as mudanças como a tela faz.
function PainelControlado({ inicial }: { inicial: ObjetoNaTela }) {
  const [objeto, setObjeto] = useState(inicial)
  const textoRef = useRef<HTMLTextAreaElement>(null)
  return (
    <div className="max-w-sm">
      <PainelDoObjeto
        objeto={objeto}
        nomeDaImagem="logo.png"
        textoRef={textoRef}
        aoMudar={(mudanca) => setObjeto((o) => comMudanca(o, mudanca, A4))}
        aoApagar={fn()}
        aoVoltar={fn()}
      />
    </div>
  )
}

const meta = {
  title: 'Tools/PDF/PainelDoObjeto',
  component: PainelControlado,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: { inicial: TEXTO },
} satisfies Meta<typeof PainelControlado>

export default meta
type Story = StoryObj<typeof meta>

export const Texto: Story = {}

export const TextoComCaractereRecusado: Story = {
  play: async ({ canvas }) => {
    const campo = canvas.getByRole('textbox', { name: 'Texto' })
    await userEvent.type(campo, ' 😀')
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Este caractere não entra',
    )
    await expect(campo).toHaveValue('Paulo Victor ')
  },
}

export const Seta: Story = { args: { inicial: SETA } }

export const Imagem: Story = {
  args: {
    inicial: {
      id: 'imagem',
      tipo: 'imagem',
      imagem: 'logo',
      x: 40,
      y: 40,
      largura: 150,
      altura: 75,
    },
  },
}

export const Cobrir: Story = {
  args: {
    inicial: {
      id: 'cobrir',
      tipo: 'cobrir',
      x: 72,
      y: 200,
      largura: 160,
      altura: 32,
    },
  },
}
