import { describe, expect, it } from 'vitest'
import { dividirBlocos, restaurarBordas } from './markdown-blocos'
import promeia from './__fixtures__/markdown-blocos-promeia.json'

// A INVARIANTE é o teste mais importante deste módulo: a concatenação dos
// blocos reproduz a entrada BYTE A BYTE. Sem ela, o proofread remonta o artigo
// perdendo ou inventando espaço em branco, e o resultado continua "parecendo"
// markdown, então a corrupção passa despercebida.
const ENTRADAS_HOSTIS: Array<[string, string]> = [
  ['vazio', ''],
  ['so-espacos-sem-quebra', '   '],
  ['so-quebras', '\n\n\n'],
  ['sem-quebra-final', 'uma linha sem quebra no fim'],
  ['com-quebra-final', 'com quebra no fim\n'],
  ['comeca-em-branco', '\n\ncomeca com linhas em branco'],
  ['termina-em-branco', 'termina com linhas em branco\n\n\n'],
  ['crlf', 'a\r\nb\r\n'],
  [
    'codigo-com-linha-em-branco',
    'prosa\n\n```py\ncodigo\n\ncom linha em branco\n```\n\nmais prosa\n',
  ],
  ['cerca-nao-fechada', 'prosa\n\n```py\nnunca fecha\n'],
  ['tabela', '| a | b |\n| - | - |\n\ntexto\n'],
  ['html', '<div>\n  <p>oi</p>\n</div>\n\ntexto\n'],
  ['jsx', '<Aviso tipo="info">\n  Conteúdo JSX\n</Aviso>\n\nprosa depois\n'],
  ['citacao', '> citação\n> segunda linha\n\ntexto\n'],
  ['imagem', '![alt](/img.png)\n\ntexto\n'],
  ['prosa-rica', '# Título\n\nParágrafo com *ênfase* e `código inline`.\n'],
  ['cerca-vazia', '```\n```\n'],
  ['cerca-colada', 'texto\n```\nfecha sem abrir label\n```\ndepois\n'],
  ['emoji', 'Olá 👋 pessoal 🎉\n\n🚀 emoji no começo\n'],
  ['crlf-com-cerca', 'Primeira\r\n\r\n```ts\r\nconst a = 1\r\n```\r\n\r\nfim'],
  ['bom-no-inicio', '\ufeff```py\ncodigo\n```\n'],
]

describe('dividirBlocos: invariante de reconstrução', () => {
  it.each(ENTRADAS_HOSTIS)('%s: join dos blocos === entrada', (_, entrada) => {
    expect(
      dividirBlocos(entrada)
        .map((b) => b.texto)
        .join(''),
    ).toBe(entrada)
  })
})

describe('dividirBlocos: paridade com o Python (fixture gerada do promeia)', () => {
  it.each(promeia.dividirBlocos.map((c) => [JSON.stringify(c.entrada), c]))(
    '%s',
    (_, caso) => {
      expect(dividirBlocos(caso.entrada)).toEqual(caso.blocos)
    },
  )
})

describe('dividirBlocos: classificação', () => {
  it('prosa é separada do código', () => {
    const blocos = dividirBlocos(
      'Olá mundo.\n\n```py\nprint(1)\n```\n\nTchau.\n',
    )
    const prosa = blocos.filter((b) => b.tipo === 'prosa').map((b) => b.texto)
    expect(prosa).toEqual(['Olá mundo.\n', 'Tchau.\n'])
    expect(prosa.join('')).not.toContain('print(1)')
  })

  it('bloco de código é ATÔMICO mesmo com linha em branco dentro', () => {
    // Sem atomicidade, a linha em branco quebraria a cerca em dois blocos e o
    // segundo pedaço iria pro modelo como se fosse prosa.
    const entrada = '```py\na = 1\n\nb = 2\n```\n'
    expect(dividirBlocos(entrada)).toEqual([
      { tipo: 'passthrough', texto: entrada },
    ])
  })

  it('cerca não fechada até o fim continua passthrough', () => {
    const blocos = dividirBlocos('```py\nnunca fecha\n')
    expect(blocos.every((b) => b.tipo === 'passthrough')).toBe(true)
  })

  it.each([
    ['|', 'tabela'],
    ['<', 'html/jsx'],
    ['>', 'citação'],
    ['![', 'imagem'],
  ])('não é prosa quando a primeira linha começa com %s (%s)', (inicio) => {
    expect(dividirBlocos(`${inicio} conteudo\n`).map((b) => b.tipo)).toEqual([
      'passthrough',
    ])
  })

  it('bloco só de espaço em branco é passthrough', () => {
    const brancos = dividirBlocos('texto\n\n   \n\noutro\n').filter(
      (b) => b.texto.trim() === '',
    )
    expect(brancos.length).toBeGreaterThan(0)
    expect(brancos.every((b) => b.tipo === 'passthrough')).toBe(true)
  })

  it('BOM não conta como espaço em branco (igual ao str.strip do Python)', () => {
    // O trim() do JS remove o U+FEFF; o strip() do Python não. Com trim(), a
    // cerca abaixo viraria passthrough aqui e prosa no promeia.
    expect(dividirBlocos('\ufeff\n\ntexto\n')).toEqual([
      { tipo: 'prosa', texto: '\ufeff\n' },
      { tipo: 'passthrough', texto: '\n' },
      { tipo: 'prosa', texto: 'texto\n' },
    ])
  })
})

describe('restaurarBordas', () => {
  it('devolve o espaçamento do original, incluindo espaços e tabs', () => {
    expect(restaurarBordas('\n\n  texto  \n\n', 'TEXTO')).toBe(
      '\n\n  TEXTO  \n\n',
    )
  })

  it('preserva a indentação de item de lista', () => {
    expect(restaurarBordas('  - item\n', '- item corrigido')).toBe(
      '  - item corrigido\n',
    )
  })

  it('sem bordas é identidade', () => {
    expect(restaurarBordas('texto', 'TEXTO')).toBe('TEXTO')
  })

  it.each(promeia.restaurarBordas.map((c) => [JSON.stringify(c.original), c]))(
    'paridade com o Python: %s',
    (_, caso) => {
      expect(restaurarBordas(caso.original, caso.corrigido)).toBe(caso.saida)
    },
  )
})
