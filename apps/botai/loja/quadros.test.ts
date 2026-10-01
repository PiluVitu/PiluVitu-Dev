import { describe, expect, it } from 'vitest'
import {
  BRANCO_DA_OPERA,
  CORES,
  escaparHtml,
  htmlDestaque,
  htmlIcone,
  htmlPagina,
  htmlTile,
} from './quadros'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"></svg>'
const PNG = 'data:image/png;base64,AAAA'
const FONTE = 'data:font/woff2;base64,AAAA'

const ler = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const estilo = (html: string) => ler(html).querySelector('style')!.textContent!

const destaque = (extra: Partial<Parameters<typeof htmlDestaque>[0]> = {}) =>
  htmlDestaque({
    svg: SVG,
    popup: PNG,
    titulo: 'Título',
    subtitulo: 'Subtítulo',
    tema: 'escuro',
    fonte: FONTE,
    ...extra,
  })

describe('quadros das capturas', () => {
  it('ícone: a arte no tamanho pedido, centrada num fundo transparente', () => {
    const html = htmlIcone({ svg: SVG, arte: 96 })
    const img = ler(html).querySelector('img')!
    expect(img.getAttribute('width')).toBe('96')
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(estilo(html)).toContain('background: transparent')
  })

  it('destaque: fundo do tema, ou branco para o Opera', () => {
    expect(estilo(destaque())).toContain(`background: ${CORES.escuro.fundo}`)
    expect(estilo(destaque({ tema: 'claro', fundoBranco: true }))).toContain(
      `background: ${BRANCO_DA_OPERA}`,
    )
  })

  it('destaque: título e subtítulo entram como texto, nunca como HTML', () => {
    const doc = ler(destaque({ titulo: '<b>CPF</b> & CEP' }))
    expect(doc.querySelector('h1')!.textContent).toBe('<b>CPF</b> & CEP')
    expect(doc.querySelector('h1 b')).toBeNull()
    expect(escaparHtml('"<&>"')).toBe('&quot;&lt;&amp;&gt;&quot;')
  })

  it('página preenchida: o fundo da extensão real e o popup por cima', () => {
    const imgs = ler(
      htmlPagina({ fundo: PNG, popup: `${PNG}B` }),
    ).querySelectorAll('img')
    expect([...imgs].map((i) => i.className)).toEqual(['fundo', 'popup'])
    expect(imgs[1].getAttribute('src')).toBe(`${PNG}B`)
  })

  it('o nome aparece como Botaí, com acento, e nada vira caixa alta', () => {
    for (const html of [destaque(), htmlTile({ svg: SVG, fonte: FONTE })]) {
      expect(ler(html).body.textContent).toContain('Botaí')
      expect(estilo(html)).not.toContain('uppercase')
    }
  })
})
