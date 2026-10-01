// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { COPIAS_PARA_O_SITE, ICONE, PECAS_DA_LOJA } from './pecas'

const LOJA = path.resolve(import.meta.dirname, 'imagens')
const SITE = path.resolve(
  import.meta.dirname,
  '../../web/public/pilulabs/botai',
)

// Largura, altura e tipo de cor vêm do cabeçalho IHDR, logo depois da assinatura de 8 bytes.
function cabecalhoPng(arquivo: string) {
  const png = readFileSync(arquivo)
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
  return {
    largura: png.readUInt32BE(16),
    altura: png.readUInt32BE(20),
    tipoDeCor: png[25],
  }
}

describe('imagens da loja (geradas por make capturas-botai)', () => {
  it.each(PECAS_DA_LOJA.map((p) => [p.arquivo, p] as const))(
    '%s tem o tamanho que a loja pede',
    (_, peca) => {
      const { largura, altura } = cabecalhoPng(path.join(LOJA, peca.arquivo))
      expect({ largura, altura }).toEqual({
        largura: peca.largura,
        altura: peca.altura,
      })
    },
  )

  it('o ícone 128 tem canal alfa (a margem de 16 px é transparente)', () => {
    expect(cabecalhoPng(path.join(LOJA, ICONE.arquivo)).tipoDeCor).toBe(6)
  })
})

describe('cópias para o site', () => {
  it.each(COPIAS_PARA_O_SITE.map((c) => [c.destino, c] as const))(
    'apps/web/public/pilulabs/botai/%s é idêntica à da loja',
    (_, { origem, destino }) => {
      expect(
        readFileSync(path.join(SITE, destino)).equals(
          readFileSync(path.join(LOJA, origem)),
        ),
      ).toBe(true)
    },
  )
})
