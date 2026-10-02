import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALTURA_DA_CAPTURA, CAPTURAS, LARGURA_DA_CAPTURA } from './capturas'

const PUBLIC = join(__dirname, '..', 'public')

// Largura e altura ficam nos bytes 16–23 do cabeçalho IHDR.
function tamanhoDoPng(caminho: string) {
  const png = readFileSync(caminho)
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) }
}

describe('CAPTURAS', () => {
  it('as 3 cenas do design, na ordem das abas', () => {
    expect(CAPTURAS.map((c) => [c.numero, c.titulo])).toEqual([
      ['01', 'Página preenchida'],
      ['02', 'Pessoa de teste'],
      ['03', 'Resultado'],
    ])
  })

  // Os nomes vêm do gerador das lojas (apps/botai/loja/pecas.ts): o número do arquivo muda com o tema.
  it('cada cena aponta para o PNG de cada tema', () => {
    expect(
      CAPTURAS.map((c) => [c.variantes.escuro.src, c.variantes.claro.src]),
    ).toEqual([
      [
        '/capturas/01-pagina-preenchida-escuro.png',
        '/capturas/02-pagina-preenchida-claro.png',
      ],
      [
        '/capturas/03-pessoa-de-teste-escuro.png',
        '/capturas/04-pessoa-de-teste-claro.png',
      ],
      ['/capturas/05-resultado-escuro.png', '/capturas/06-resultado-claro.png'],
    ])
  })

  it('todo PNG existe em public/ com 1280×800', () => {
    for (const captura of CAPTURAS)
      for (const { src } of Object.values(captura.variantes))
        expect([src, tamanhoDoPng(join(PUBLIC, src))]).toEqual([
          src,
          { largura: LARGURA_DA_CAPTURA, altura: ALTURA_DA_CAPTURA },
        ])
  })

  it('o alt descreve a cena e diz o tema', () => {
    for (const { variantes } of CAPTURAS) {
      expect(variantes.escuro.alt).toMatch(/^.{40,} \(tema escuro\)$/)
      expect(variantes.claro.alt).toMatch(/^.{40,} \(tema claro\)$/)
    }
  })
})
