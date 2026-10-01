import { describe, expect, it, vi } from 'vitest'
import { construirAviso, type OpcoesAviso } from './aviso-dom'

function montar(extra: Partial<OpcoesAviso> = {}) {
  const onFechar = vi.fn()
  const aviso = construirAviso(document, {
    titulo: '21 de 23 campos preenchidos',
    onFechar,
    ...extra,
  })
  document.body.replaceChildren(aviso)
  return { aviso, onFechar }
}

describe('construirAviso', () => {
  it('mostra o título num status, com a marca e o botão Fechar', () => {
    const { aviso } = montar()
    expect(aviso).toHaveAttribute('role', 'status')
    expect(aviso).toHaveClass('toast')
    expect(aviso.querySelector('.titulo')).toHaveTextContent(
      '21 de 23 campos preenchidos',
    )
    expect(aviso.querySelector('svg.marca')).not.toBeNull()
    expect(aviso.querySelector('button.fechar')).toHaveAttribute(
      'aria-label',
      'Fechar',
    )
  })

  it('sem não reconhecidos não há 2ª linha', () => {
    expect(montar().aviso.querySelector('.linha2')).toBeNull()
  })

  it('o texto âmbar é um botão que leva ao primeiro não reconhecido', () => {
    const ir = vi.fn()
    const { aviso } = montar({
      linha2: '2 não reconhecidos',
      onIrParaNaoReconhecido: ir,
    })
    const botao = aviso.querySelector(
      '.linha2 button.warn',
    ) as HTMLButtonElement
    expect(botao).toHaveTextContent('2 não reconhecidos')
    expect(aviso.querySelector('.linha2')).toHaveTextContent(
      '2 não reconhecidos · contorno tracejado',
    )
    botao.click()
    expect(ir).toHaveBeenCalledTimes(1)
  })

  it('sem campo não reconhecido no frame do topo, o texto âmbar não é clicável', () => {
    const { aviso } = montar({ linha2: '1 não reconhecido' })
    expect(aviso.querySelector('.linha2 button')).toBeNull()
    expect(aviso.querySelector('.linha2 span.warn')).toHaveTextContent(
      '1 não reconhecido',
    )
  })

  it('o × e o fim da barra de tempo fecham', () => {
    const { aviso, onFechar } = montar()
    ;(aviso.querySelector('button.fechar') as HTMLButtonElement).click()
    aviso.querySelector('.barra')?.dispatchEvent(new Event('animationend'))
    expect(onFechar).toHaveBeenCalledTimes(2)
  })

  it('aviso de erro é um alert de uma linha só', () => {
    const { aviso } = montar({
      titulo: 'Nenhum campo nesta página',
      erro: true,
      linha2: 'ignorada',
    })
    expect(aviso).toHaveAttribute('role', 'alert')
    expect(aviso).toHaveClass('erro')
    expect(aviso.querySelector('.linha2')).toBeNull()
  })

  it('texto com marcação aparece literal (nada de innerHTML)', () => {
    const { aviso } = montar({ titulo: '<img src=x onerror=alert(1)>' })
    expect(aviso.querySelector('img')).toBeNull()
    expect(aviso.querySelector('.titulo')).toHaveTextContent(
      '<img src=x onerror=alert(1)>',
    )
  })
})
