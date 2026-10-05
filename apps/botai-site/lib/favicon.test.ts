import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { imagensDoIco } from '@piluvitu/tools/ico'
import { ICONES_DA_EXTENSAO, LADOS_DO_FAVICON, faviconDoBotai } from './favicon'

describe('faviconDoBotai', () => {
  // O ícone do site é o da extensão: os PNGs que vão no manifest, sem redesenhar.
  it('lê os ícones da própria extensão, no apps/botai', () => {
    expect(ICONES_DA_EXTENSAO).toMatch(/apps\/botai\/public\/icon$/)
  })

  it('empacota os PNGs de 16, 32 e 48 px da extensão, byte a byte', () => {
    const imagens = imagensDoIco(faviconDoBotai())
    expect(imagens.map(({ largura, altura }) => [largura, altura])).toEqual([
      [16, 16],
      [32, 32],
      [48, 48],
    ])
    imagens.forEach(({ png }, i) =>
      expect(png).toEqual(
        new Uint8Array(
          readFileSync(join(ICONES_DA_EXTENSAO, `${LADOS_DO_FAVICON[i]}.png`)),
        ),
      ),
    )
  })

  // Sem os ícones o build tem de quebrar: em silêncio, o site sairia sem favicon.
  it('pasta sem os ícones quebra', () => {
    expect(() => faviconDoBotai('/caminho/que/nao/existe')).toThrow()
  })
})
