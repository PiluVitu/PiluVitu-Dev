import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { construirAviso, type OpcoesAviso } from './aviso-dom'

// O Vitest entrega CSS vazio por import (?raw/?inline): o arquivo é lido do disco.
const css = readFileSync(path.resolve(import.meta.dirname, 'aviso.css'), 'utf8')

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
    expect(aviso).toHaveClass('botai-toast')
    expect(aviso.querySelector('.botai-titulo')).toHaveTextContent(
      '21 de 23 campos preenchidos',
    )
    expect(aviso.querySelector('svg.botai-marca')).not.toBeNull()
    expect(aviso.querySelector('button.botai-fechar')).toHaveAttribute(
      'aria-label',
      'Fechar',
    )
  })

  it('sem não reconhecidos não há 2ª linha', () => {
    expect(montar().aviso.querySelector('.botai-linha2')).toBeNull()
  })

  it('o texto âmbar é um botão que leva ao primeiro não reconhecido', () => {
    const ir = vi.fn()
    const { aviso } = montar({
      linha2: '2 não reconhecidos',
      onIrParaNaoReconhecido: ir,
    })
    const botao = aviso.querySelector(
      '.botai-linha2 button.botai-warn',
    ) as HTMLButtonElement
    expect(botao).toHaveTextContent('2 não reconhecidos')
    expect(aviso.querySelector('.botai-linha2')).toHaveTextContent(
      '2 não reconhecidos · contorno tracejado',
    )
    botao.click()
    expect(ir).toHaveBeenCalledTimes(1)
  })

  it('sem campo não reconhecido no frame do topo, o texto âmbar não é clicável', () => {
    const { aviso } = montar({ linha2: '1 não reconhecido' })
    expect(aviso.querySelector('.botai-linha2 button')).toBeNull()
    expect(
      aviso.querySelector('.botai-linha2 span.botai-warn'),
    ).toHaveTextContent('1 não reconhecido')
  })

  it('o × e o fim da barra de tempo fecham', () => {
    const { aviso, onFechar } = montar()
    ;(aviso.querySelector('button.botai-fechar') as HTMLButtonElement).click()
    aviso
      .querySelector('.botai-barra')
      ?.dispatchEvent(new Event('animationend'))
    expect(onFechar).toHaveBeenCalledTimes(2)
  })

  it('aviso de erro é um alert de uma linha só', () => {
    const { aviso } = montar({
      titulo: 'Nenhum campo nesta página',
      erro: true,
      linha2: 'ignorada',
    })
    expect(aviso).toHaveAttribute('role', 'alert')
    expect(aviso).toHaveClass('botai-erro')
    expect(aviso.querySelector('.botai-linha2')).toBeNull()
  })

  it('texto com marcação aparece literal (nada de innerHTML)', () => {
    const { aviso } = montar({ titulo: '<img src=x onerror=alert(1)>' })
    expect(aviso.querySelector('img')).toBeNull()
    expect(aviso.querySelector('.botai-titulo')).toHaveTextContent(
      '<img src=x onerror=alert(1)>',
    )
  })

  it('toda classe do aviso tem o prefixo botai- e uma regra no aviso.css', () => {
    const classes = new Set(
      [
        montar({
          linha2: '2 não reconhecidos',
          onIrParaNaoReconhecido: vi.fn(),
        }).aviso,
        montar({ linha2: '1 não reconhecido' }).aviso,
        montar({ titulo: 'Nenhum campo nesta página', erro: true }).aviso,
      ].flatMap((aviso) =>
        [aviso, ...aviso.querySelectorAll('*')].flatMap((el) => [
          ...el.classList,
        ]),
      ),
    )
    expect(classes.size).toBe(10)
    for (const classe of classes) {
      expect(classe).toMatch(/^botai-/)
      expect(css).toContain(`.${classe}`)
    }
  })

  it('variáveis e animação do aviso.css usam o prefixo botai-', () => {
    const variaveis = css.match(/--[\w-]+/g) ?? []
    expect(variaveis.length).toBeGreaterThan(0)
    expect(variaveis.filter((v) => !v.startsWith('--botai-'))).toEqual([])
    expect(css.match(/@keyframes\s+([\w-]+)/g)).toEqual([
      '@keyframes botai-tempo',
    ])
    expect(css).toContain('animation: botai-tempo ')
  })
})
