/**
 * `gerarResumo` com um `Chat` falso: o que vai ao modelo (só prosa, cortada em
 * fronteira de bloco) e a validação estrita da resposta (Review Focus 5 do
 * plano da IA fase 1): fora do formato vira `ClaudeRecusou('formato')`, nunca
 * um campo truncado.
 */
import { ClaudeRecusou } from '@piluvitu/ia/erros'
import { estimativaMicroUsd } from '@piluvitu/ia/custo'
import { describe, expect, it } from 'vitest'
import { TETOS_RAMIELLE } from '../../lib/ia'
import { RESUMO_SYSTEM } from './prompts'
import type { Chat, PedidoChat } from './revisao'
import {
  CorpoGrandeDemais,
  FORMATO_RESUMO,
  gerarResumo,
  lerResumo,
  MAX_CARACTERES_CORPO_RESUMO,
  MAX_TOKENS_RESUMO,
  MODELO_RESUMO,
  ParagrafoGrandeDemais,
  pedidoDoResumo,
  prosaParaResumo,
  SemProsa,
  TETO_CARACTERES_RESUMO,
} from './resumo'

const VALIDO = {
  tldr: 'Escrevi sobre como levei a revisão de posts para a Claude dentro do Worker.',
  metaDescription:
    'Como a revisão de posts do blog saiu do Mac e foi para a Claude num Worker da Cloudflare.',
  tags: ['cloudflare', 'claude', 'workers'],
}

function chatEspiao(resposta: string | (() => Promise<string>)): {
  chat: Chat
  chamadas: PedidoChat[]
} {
  const chamadas: PedidoChat[] = []
  const chat: Chat = async (p) => {
    chamadas.push(p)
    return typeof resposta === 'string' ? resposta : resposta()
  }
  return { chat, chamadas }
}

async function formatoInvalido(promessa: Promise<unknown>) {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  )
  expect(erro).toBeInstanceOf(ClaudeRecusou)
  expect((erro as ClaudeRecusou).motivo).toBe('formato')
}

describe('gerarResumo: caminho feliz', () => {
  it('JSON válido passa e volta como Resumo', async () => {
    const { chat, chamadas } = chatEspiao(JSON.stringify(VALIDO))
    const resumo = await gerarResumo(
      { title: 'Claude no Worker', body: 'Um parágrafo de prosa.\n' },
      chat,
    )
    expect(resumo).toEqual(VALIDO)
    expect(chamadas).toHaveLength(1)
  })

  it('uma chamada ao Haiku, com o RESUMO_SYSTEM, o maxTokens do resumo e o schema dos três campos', async () => {
    const { chat, chamadas } = chatEspiao(JSON.stringify(VALIDO))
    await gerarResumo({ title: 'T', body: 'Prosa.\n' }, chat)
    expect(chamadas[0]).toEqual({
      modelo: 'claude-haiku-5-5',
      system: RESUMO_SYSTEM,
      user: expect.any(String),
      maxTokens: MAX_TOKENS_RESUMO,
      formatoJson: FORMATO_RESUMO,
    })
    expect(MODELO_RESUMO).toBe('claude-haiku-5-5')
    expect(FORMATO_RESUMO).toEqual({
      type: 'object',
      properties: {
        tldr: { type: 'string' },
        metaDescription: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['tldr', 'metaDescription', 'tags'],
      additionalProperties: false,
    })
  })

  it('o título e a prosa vão no user', async () => {
    const { chat, chamadas } = chatEspiao(JSON.stringify(VALIDO))
    await gerarResumo(
      { title: 'Meu título', body: 'Primeiro parágrafo.\n\nSegundo.\n' },
      chat,
    )
    const user = chamadas[0]?.user ?? ''
    expect(user).toContain('Meu título')
    expect(user).toContain('Primeiro parágrafo.')
    expect(user).toContain('Segundo.')
  })

  it('apara o branco de borda do tldr e da metaDescription', async () => {
    const { chat } = chatEspiao(
      JSON.stringify({
        ...VALIDO,
        tldr: `  ${VALIDO.tldr}\n`,
        metaDescription: ` ${VALIDO.metaDescription} `,
      }),
    )
    const resumo = await gerarResumo({ title: 'T', body: 'Prosa.\n' }, chat)
    expect(resumo.tldr).toBe(VALIDO.tldr)
    expect(resumo.metaDescription).toBe(VALIDO.metaDescription)
  })
})

describe('gerarResumo: só prosa vai ao modelo', () => {
  it('cerca de código (fechada e aberta), tabela e JSX nunca estão no user', async () => {
    const body = [
      'Parágrafo de abertura.\n',
      '\n',
      '```ts\nconst SEGREDO_DA_CERCA = 1\n```\n',
      '\n',
      '| COLUNA_DA_TABELA | b |\n|---|---|\n| 1 | 2 |\n',
      '\n',
      '<ComponenteJsx prop="X_DO_JSX" />\n',
      '\n',
      'Parágrafo do meio.\n',
      '\n',
      '```py\nCERCA_NAO_FECHADA = True\n',
    ].join('')
    const { chat, chamadas } = chatEspiao(JSON.stringify(VALIDO))
    await gerarResumo({ title: 'T', body }, chat)
    const user = chamadas[0]?.user ?? ''
    expect(user).toContain('Parágrafo de abertura.')
    expect(user).toContain('Parágrafo do meio.')
    for (const proibido of [
      'SEGREDO_DA_CERCA',
      '```',
      'COLUNA_DA_TABELA',
      'ComponenteJsx',
      'X_DO_JSX',
      'CERCA_NAO_FECHADA',
    ]) {
      expect(user).not.toContain(proibido)
    }
  })

  it(`corta em ${TETO_CARACTERES_RESUMO} caracteres na fronteira de um bloco, nunca no meio`, () => {
    const paragrafo = (i: number) => `P${i} ${'x'.repeat(995)}`
    const body = Array.from({ length: 40 }, (_, i) => paragrafo(i)).join('\n\n')
    const prosa = prosaParaResumo(body)
    expect(prosa.length).toBeLessThanOrEqual(TETO_CARACTERES_RESUMO)
    const partes = prosa.split('\n\n')
    partes.forEach((parte, i) => expect(parte).toBe(paragrafo(i)))
    expect(partes.length).toBeGreaterThan(20)
    expect(prosa).not.toContain(`P${partes.length} `)
  })

  it('prosa que cabe inteira vai inteira', () => {
    expect(prosaParaResumo('Um.\n\n```\ncodigo\n```\n\nDois.\n')).toBe(
      'Um.\n\nDois.',
    )
  })

  it('sem nenhum bloco de prosa lança SemProsa, sem chamar o chat', async () => {
    const { chat, chamadas } = chatEspiao(JSON.stringify(VALIDO))
    await expect(
      gerarResumo({ title: 'T', body: '```ts\nso codigo\n```\n\n   \n' }, chat),
    ).rejects.toBeInstanceOf(SemProsa)
    expect(chamadas).toHaveLength(0)
  })

  it(`primeiro parágrafo acima de ${TETO_CARACTERES_RESUMO} lança ParagrafoGrandeDemais, sem chamar o chat`, async () => {
    const { chat, chamadas } = chatEspiao(JSON.stringify(VALIDO))
    await expect(
      gerarResumo(
        { title: 'T', body: 'y'.repeat(TETO_CARACTERES_RESUMO + 1) },
        chat,
      ),
    ).rejects.toBeInstanceOf(ParagrafoGrandeDemais)
    expect(chamadas).toHaveLength(0)
  })

  it(`body acima de ${MAX_CARACTERES_CORPO_RESUMO} caracteres lança CorpoGrandeDemais, sem chamar o chat`, async () => {
    const { chat, chamadas } = chatEspiao(JSON.stringify(VALIDO))
    await expect(
      gerarResumo(
        { title: 'T', body: 'a'.repeat(MAX_CARACTERES_CORPO_RESUMO + 1) },
        chat,
      ),
    ).rejects.toBeInstanceOf(CorpoGrandeDemais)
    expect(chamadas).toHaveLength(0)
  })
})

describe('lerResumo: validação estrita (Review Focus 5)', () => {
  const casos: [string, unknown][] = [
    [
      'metaDescription com 161 caracteres',
      { ...VALIDO, metaDescription: 'm'.repeat(161) },
    ],
    [
      'metaDescription com 49 caracteres',
      { ...VALIDO, metaDescription: 'm'.repeat(49) },
    ],
    ['tldr vazio', { ...VALIDO, tldr: '' }],
    ['tldr só de espaço', { ...VALIDO, tldr: '   ' }],
    ['tldr com 401 caracteres', { ...VALIDO, tldr: 't'.repeat(401) }],
    ['tag "Next JS"', { ...VALIDO, tags: ['Next JS'] }],
    ['tag maiúscula', { ...VALIDO, tags: ['Nextjs'] }],
    ['tag com acento', { ...VALIDO, tags: ['programação'] }],
    ['tag vazia', { ...VALIDO, tags: [''] }],
    ['tags vazias', { ...VALIDO, tags: [] }],
    ['6 tags', { ...VALIDO, tags: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    ['tag que não é string', { ...VALIDO, tags: [1] }],
    ['tags fora de array', { ...VALIDO, tags: 'nextjs' }],
    ['campo extra', { ...VALIDO, autor: 'eu' }],
    ['campo faltando', { tldr: VALIDO.tldr, tags: VALIDO.tags }],
    ['tldr que não é string', { ...VALIDO, tldr: 3 }],
    ['tag repetida', { ...VALIDO, tags: ['nextjs', 'nextjs'] }],
    ['tag com 41 caracteres', { ...VALIDO, tags: ['a'.repeat(41)] }],
    [
      'tldr com caractere de controle',
      { ...VALIDO, tldr: `${VALIDO.tldr}\u0007` },
    ],
    [
      'tldr com controle bidi U+202E',
      { ...VALIDO, tldr: `\u202E${VALIDO.tldr}` },
    ],
    [
      'tldr com isolante bidi U+2066',
      { ...VALIDO, tldr: `\u2066${VALIDO.tldr}` },
    ],
    [
      'tldr com largura zero U+200B',
      { ...VALIDO, tldr: `a\u200Bb ${VALIDO.tldr}` },
    ],
    ['tldr com link https', { ...VALIDO, tldr: `${VALIDO.tldr} https://x.io` }],
    ['tldr com link www', { ...VALIDO, tldr: `${VALIDO.tldr} www.x.io` }],
    [
      'metaDescription com quebra de linha',
      { ...VALIDO, metaDescription: `${VALIDO.metaDescription}\nmais` },
    ],
    [
      'metaDescription com controle bidi U+2069',
      { ...VALIDO, metaDescription: `${VALIDO.metaDescription}\u2069` },
    ],
    [
      'metaDescription com link',
      { ...VALIDO, metaDescription: `${VALIDO.metaDescription} http://x.io` },
    ],
    ['array no lugar do objeto', [VALIDO]],
    ['null', null],
  ]

  it.each(casos)('%s ⇒ ClaudeRecusou formato', async (_, corpo) => {
    await formatoInvalido(
      Promise.resolve().then(() => lerResumo(JSON.stringify(corpo))),
    )
  })

  it('JSON quebrado ⇒ ClaudeRecusou formato', async () => {
    await formatoInvalido(
      Promise.resolve().then(() => lerResumo('{"tldr": "corta aqui')),
    )
  })

  it('limites exatos passam: tldr de 1 e de 400, meta de 50 e de 160, 1 e 5 tags', () => {
    expect(
      lerResumo(
        JSON.stringify({
          tldr: 'x',
          metaDescription: 'm'.repeat(50),
          tags: ['a'],
        }),
      ),
    ).toEqual({ tldr: 'x', metaDescription: 'm'.repeat(50), tags: ['a'] })
    const tags = ['a', 'b-2', 'c', 'next-js', 'x'.repeat(40)]
    expect(
      lerResumo(
        JSON.stringify({
          tldr: 't'.repeat(400),
          metaDescription: 'm'.repeat(160),
          tags,
        }),
      ).tags,
    ).toEqual(tags)
  })

  it('a resposta fora do formato derruba o gerarResumo inteiro', async () => {
    const { chat } = chatEspiao(
      JSON.stringify({ ...VALIDO, metaDescription: 'm'.repeat(161) }),
    )
    await formatoInvalido(gerarResumo({ title: 'T', body: 'Prosa.\n' }, chat))
  })

  it('o erro do chat (ex.: max_tokens já traduzido) sobe sem ser engolido', async () => {
    const { chat } = chatEspiao(() =>
      Promise.reject(new ClaudeRecusou('formato')),
    )
    await formatoInvalido(gerarResumo({ title: 'T', body: 'Prosa.\n' }, chat))
  })
})

describe('reserva do resumo contra o teto', () => {
  it('o pior pedido possível reserva menos de 1% do teto mensal do resumo', () => {
    const pedido = pedidoDoResumo(
      'T'.repeat(300),
      'p'.repeat(TETO_CARACTERES_RESUMO),
    )
    const caracteres =
      pedido.system.length +
      pedido.user.length +
      JSON.stringify(pedido.formatoJson).length
    const reserva = estimativaMicroUsd(
      MODELO_RESUMO,
      caracteres,
      MAX_TOKENS_RESUMO,
    )
    expect(reserva).toBeLessThan(TETOS_RAMIELLE.resumo / 100)
  })
})
