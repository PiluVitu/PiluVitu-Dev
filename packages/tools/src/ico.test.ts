import { icoDePngs, imagensDoIco } from './ico'

const ASSINATURA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// Só o que o empacotador lê: a assinatura e o IHDR com largura e altura; o resto é carga.
function pngFalso(largura: number, altura: number, carga = [1, 2, 3]) {
  const bytes = new Uint8Array(24 + carga.length)
  const dados = new DataView(bytes.buffer)
  bytes.set(ASSINATURA, 0)
  dados.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  dados.setUint32(16, largura)
  dados.setUint32(20, altura)
  bytes.set(carga, 24)
  return bytes
}

function ler(ico: Uint8Array) {
  const dados = new DataView(ico.buffer, ico.byteOffset, ico.byteLength)
  const total = dados.getUint16(4, true)
  return {
    reservado: dados.getUint16(0, true),
    tipo: dados.getUint16(2, true),
    total,
    entradas: Array.from({ length: total }, (_, i) => {
      const base = 6 + i * 16
      return {
        largura: ico[base],
        altura: ico[base + 1],
        cores: ico[base + 2],
        reservado: ico[base + 3],
        planos: dados.getUint16(base + 4, true),
        bits: dados.getUint16(base + 6, true),
        tamanho: dados.getUint32(base + 8, true),
        posicao: dados.getUint32(base + 12, true),
      }
    }),
  }
}

describe('icoDePngs', () => {
  it('cabeçalho de ícone (tipo 1) e uma entrada de 32 bits por PNG, na ordem recebida', () => {
    const pngs = [pngFalso(16, 16), pngFalso(32, 32, [9, 9]), pngFalso(48, 48)]
    const ico = ler(icoDePngs(pngs))
    expect([ico.reservado, ico.tipo, ico.total]).toEqual([0, 1, 3])
    expect(ico.entradas).toEqual([
      {
        largura: 16,
        altura: 16,
        cores: 0,
        reservado: 0,
        planos: 1,
        bits: 32,
        tamanho: 27,
        posicao: 54,
      },
      {
        largura: 32,
        altura: 32,
        cores: 0,
        reservado: 0,
        planos: 1,
        bits: 32,
        tamanho: 26,
        posicao: 81,
      },
      {
        largura: 48,
        altura: 48,
        cores: 0,
        reservado: 0,
        planos: 1,
        bits: 32,
        tamanho: 27,
        posicao: 107,
      },
    ])
  })

  it('os PNGs vão inteiros, cada um na posição da entrada dele', () => {
    const pngs = [pngFalso(16, 16, [7]), pngFalso(32, 32, [8, 8])]
    const ico = icoDePngs(pngs)
    for (const [i, entrada] of ler(ico).entradas.entries())
      expect(
        ico.slice(entrada.posicao, entrada.posicao + entrada.tamanho),
      ).toEqual(pngs[i])
    expect(ico.length).toBe(6 + 2 * 16 + pngs[0].length + pngs[1].length)
  })

  // O formato guarda o lado num byte: 256 vira 0.
  it('256 px vira 0 na entrada, e o lado retangular fica como está', () => {
    const [entrada, retangulo] = ler(
      icoDePngs([pngFalso(256, 256), pngFalso(32, 16)]),
    ).entradas
    expect([entrada.largura, entrada.altura]).toEqual([0, 0])
    expect([retangulo.largura, retangulo.altura]).toEqual([32, 16])
  })

  it('recusa lista vazia, arquivo que não é PNG e lado acima de 256 px', () => {
    expect(() => icoDePngs([])).toThrow('pelo menos um PNG')
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Array(20).fill(0)])
    expect(() => icoDePngs([jpeg])).toThrow('não é PNG')
    expect(() => icoDePngs([new Uint8Array(4)])).toThrow('não é PNG')
    expect(() => icoDePngs([pngFalso(512, 512)])).toThrow('até 256 px')
    expect(() => icoDePngs([pngFalso(0, 16)])).toThrow('até 256 px')
  })
})

describe('imagensDoIco', () => {
  it('devolve o lado e o PNG de cada entrada (ida e volta)', () => {
    const pngs = [pngFalso(16, 16), pngFalso(256, 256, [5, 5, 5, 5])]
    expect(imagensDoIco(icoDePngs(pngs))).toEqual([
      { largura: 16, altura: 16, png: pngs[0] },
      { largura: 256, altura: 256, png: pngs[1] },
    ])
  })

  it('recusa o que não é ícone', () => {
    expect(() => imagensDoIco(pngFalso(16, 16))).toThrow('não é ICO')
    expect(() => imagensDoIco(new Uint8Array(3))).toThrow('não é ICO')
  })
})
