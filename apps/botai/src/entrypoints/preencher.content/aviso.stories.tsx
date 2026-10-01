import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef } from 'react'
import { fn } from 'storybook/test'
import css from './aviso.css?inline'
import { construirAviso, type OpcoesAviso } from './aviso-dom'

const PAGINA_HOSTIL =
  "html { font-size: 10px } :root { --primary: 0 100% 50%; --radius: 0 } * { font-family: 'Comic Sans MS', cursive !important }"

function AvisoEmPaginaHostil(props: OpcoesAviso) {
  const pagina = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hostil = document.createElement('style')
    hostil.textContent = PAGINA_HOSTIL
    document.head.append(hostil)
    const host = document.createElement('botai-aviso')
    const sombra = host.attachShadow({ mode: 'open' })
    const estilo = document.createElement('style')
    estilo.textContent = css
    sombra.append(estilo, construirAviso(document, props))
    pagina.current?.append(host)
    return () => {
      host.remove()
      hostil.remove()
    }
  }, [props])

  return (
    <div ref={pagina} className="min-h-[220px] p-4">
      <h1>Site sendo testado</h1>
      <p>O CSS desta página tenta vazar para o aviso.</p>
    </div>
  )
}

const meta = {
  title: 'Página/1f · Aviso',
  component: AvisoEmPaginaHostil,
  args: { titulo: '21 de 23 campos preenchidos', onFechar: fn() },
} satisfies Meta<typeof AvisoEmPaginaHostil>

export default meta
type Story = StoryObj<typeof meta>

export const ComNaoReconhecidos: Story = {
  args: { linha2: '2 não reconhecidos', onIrParaNaoReconhecido: fn() },
}
export const TudoReconhecido: Story = {
  args: { titulo: '5 de 5 campos preenchidos' },
}
export const Singular: Story = { args: { titulo: '1 de 1 campo preenchido' } }
export const NaoReconhecidoEmIframe: Story = {
  args: { linha2: '1 não reconhecido' },
}
export const Erro: Story = {
  args: { titulo: 'Nenhum campo nesta página', erro: true },
}
