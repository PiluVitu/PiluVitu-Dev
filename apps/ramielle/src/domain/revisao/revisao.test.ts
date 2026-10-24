/**
 * Porte de `apps/promeia/src/promeia/revisao_test.py`, com um `Chat` falso.
 * O que mudou de propósito: não há mais `careful` (sempre Sonnet), nem
 * temperatura (Sonnet 5.5 e Haiku 5.5 recusam valor não padrão).
 */
import { describe, expect, it } from 'vitest'
import {
  INSTRUCAO_PADRAO,
  PROOFREAD_SYSTEM,
  REFINE_SYSTEM,
  SHORTEN_SYSTEM,
} from './prompts'
import {
  ajustarAoLimite,
  gerarHooks,
  LIMITE_PADRAO,
  LIMITES,
  limiteDaPlataforma,
  MODELO_HOOKS,
  MODELO_PROOFREAD,
  proofread,
  refine,
  truncar,
  type Chat,
  type PedidoChat,
} from './revisao'

function chatEspiao(opts: { resposta?: string; respostas?: string[] } = {}): {
  chat: Chat
  chamadas: PedidoChat[]
} {
  const chamadas: PedidoChat[] = []
  const fila = opts.respostas ? [...opts.respostas] : null
  const chat: Chat = async (p) => {
    chamadas.push(p)
    if (fila && fila.length > 0) return fila.shift() as string
    return opts.resposta ?? 'corrigido'
  }
  return { chat, chamadas }
}

describe('modelos', () => {
  it('proofread usa Sonnet; refine, encurtar e hooks usam Haiku', () => {
    expect(MODELO_PROOFREAD).toBe('claude-sonnet-5-5')
    expect(MODELO_HOOKS).toBe('claude-haiku-5-5')
  })
})

describe('proofread', () => {
  it('manda ao chat SÓ os blocos de prosa', async () => {
    const entrada =
      'Olá mundo.\n\n```py\nprint(1)\n```\n\n| a | b |\n\nTchau.\n'
    const { chat, chamadas } = chatEspiao({ resposta: 'CORRIGIDO' })
    const saida = await proofread(entrada, chat)

    expect(chamadas.map((c) => c.user)).toEqual(['Olá mundo.\n', 'Tchau.\n'])
    expect(chamadas.some((c) => c.user.includes('print(1)'))).toBe(false)
    expect(chamadas.some((c) => c.user.includes('| a | b |'))).toBe(false)
    expect(saida).toContain('```py\nprint(1)\n```')
    expect(saida).toContain('| a | b |')
  })

  it('cerca não fechada, tabela, JSX e citação saem byte a byte', async () => {
    const passthrough = [
      '| col | outra |\n|---|---|\n| x | y |\n',
      '<Aviso tipo="info">\n  não corrija isto\n</Aviso>\n',
      '> citação com erro de digitaçao\n',
      '![imagem](/x.png)\n',
      '```ts\nconst naoFechada = 1\n\nmais codigo\n',
    ]
    const entrada = `Paragrafo um.\n\n${passthrough.slice(0, 4).join('\n')}\nParagrafo dois.\n\n${passthrough[4]}`
    const { chat, chamadas } = chatEspiao({ resposta: 'TROCADO' })
    const saida = await proofread(entrada, chat)

    for (const trecho of passthrough) expect(saida).toContain(trecho)
    expect(chamadas.map((c) => c.user)).toEqual([
      'Paragrafo um.\n',
      'Paragrafo dois.\n',
    ])
  })

  it('manda cada título sozinho, sem contexto ao redor', async () => {
    const entrada = 'Antes.\n\n## Subtítulo\n\n### Seção\n\nDepois.\n'
    const { chat, chamadas } = chatEspiao({ resposta: 'X' })
    await proofread(entrada, chat)
    expect(chamadas.map((c) => c.user)).toEqual([
      'Antes.\n',
      '## Subtítulo\n',
      '### Seção\n',
      'Depois.\n',
    ])
  })

  it('usa o prompt literal, Sonnet e maxTokens 4096 por bloco', async () => {
    const { chat, chamadas } = chatEspiao()
    await proofread('texto\n', chat)
    expect(chamadas[0]).toEqual({
      modelo: 'claude-sonnet-5-5',
      system: PROOFREAD_SYSTEM,
      user: 'texto\n',
      maxTokens: 4096,
    })
  })

  it('preserva o espaçamento entre blocos', async () => {
    const { chat } = chatEspiao({ resposta: '  X  ' })
    expect(await proofread('Primeiro.\n\nSegundo.\n', chat)).toBe('X\n\nX\n')
  })

  it('texto sem prosa não chama o chat', async () => {
    const { chat, chamadas } = chatEspiao()
    const entrada = '```py\nso codigo\n```\n'
    expect(await proofread(entrada, chat)).toBe(entrada)
    expect(chamadas).toEqual([])
  })

  it('texto vazio não chama o chat', async () => {
    const { chat, chamadas } = chatEspiao()
    expect(await proofread('', chat)).toBe('')
    expect(chamadas).toEqual([])
  })

  it('uma falha do chat propaga, sem devolver texto pela metade', async () => {
    const chat: Chat = async () => {
      throw new Error('caiu')
    }
    await expect(proofread('a\n\nb\n', chat)).rejects.toThrow('caiu')
  })
})

describe('refine', () => {
  it('usa o prompt de reescrita e o Haiku', async () => {
    const { chat, chamadas } = chatEspiao({ resposta: 'curto' })
    await refine('bluesky', 'texto', 'deixa mais direto', chat)
    expect(chamadas[0]?.system).toBe(REFINE_SYSTEM)
    expect(chamadas[0]?.modelo).toBe('claude-haiku-5-5')
  })

  it('sem instrução usa a padrão literal', async () => {
    const { chat, chamadas } = chatEspiao({ resposta: 'curto' })
    await refine('bluesky', 'texto', '', chat)
    expect(chamadas[0]?.user).toContain(INSTRUCAO_PADRAO)
  })

  it('manda plataforma e limite no corpo, no formato do promeia', async () => {
    const { chat, chamadas } = chatEspiao({ resposta: 'curto' })
    await refine('mastodon', 'texto', 'instrução', chat)
    expect(chamadas[0]?.user).toBe(
      'Plataforma: mastodon (limite 500 chars)\nInstrução: instrução\n\nTexto atual:\ntexto',
    )
  })

  it.each([
    ['bluesky', 300],
    ['mastodon', 500],
    ['desconhecida', LIMITE_PADRAO],
  ])('limite de %s é %i', (plataforma, esperado) => {
    expect(limiteDaPlataforma(plataforma)).toBe(esperado)
  })

  it('LIMITES e o padrão são os do promeia', () => {
    expect(LIMITES).toEqual({ bluesky: 300, mastodon: 500 })
    expect(LIMITE_PADRAO).toBe(280)
  })

  it('o que cabe no limite não chama o encurtador', async () => {
    const { chat, chamadas } = chatEspiao({ resposta: 'cabe' })
    expect(await refine('bluesky', 't', 'i', chat)).toBe('cabe')
    expect(chamadas).toHaveLength(1)
  })

  it('o que estoura chama o encurtador e usa o resultado', async () => {
    const { chat, chamadas } = chatEspiao({
      respostas: ['x'.repeat(400), 'versão curta'],
    })
    expect(await refine('bluesky', 't', 'i', chat)).toBe('versão curta')
    expect(chamadas).toHaveLength(2)
    expect(chamadas[1]?.system).toBe(SHORTEN_SYSTEM)
    expect(chamadas[1]?.modelo).toBe('claude-haiku-5-5')
    expect(chamadas[1]?.user).toBe(
      `Encurte para no máximo 300 caracteres, mantendo o tom e o sentido, sem link/URL. Responda só com o texto:\n\n${'x'.repeat(400)}`,
    )
  })

  it('trunca quando o encurtador também estoura, usando o encurtado', async () => {
    const { chat } = chatEspiao({
      respostas: ['x'.repeat(400), 'y'.repeat(350)],
    })
    const saida = await refine('bluesky', 't', 'i', chat)
    expect(saida.length).toBeLessThanOrEqual(300)
    expect(saida.startsWith('y')).toBe(true)
  })

  it('trima o resultado do chat', async () => {
    const { chat } = chatEspiao({ resposta: '\n  Olá pessoal!  \n\n' })
    expect(await refine('bluesky', 't', 'i', chat)).toBe('Olá pessoal!')
  })

  it('trima antes de medir o limite: sem chamada extra ao encurtador', async () => {
    const conteudo = 'y'.repeat(300)
    const { chat, chamadas } = chatEspiao({ resposta: `\n  ${conteudo}  \n\n` })
    expect(await refine('bluesky', 't', 'i', chat)).toBe(conteudo)
    expect(chamadas).toHaveLength(1)
  })

  it('encurtador que falha vira truncar (fail-soft)', async () => {
    const chamadas: PedidoChat[] = []
    const chat: Chat = async (p) => {
      chamadas.push(p)
      if (p.system === SHORTEN_SYSTEM) throw new Error('caiu no encurtamento')
      return 'x'.repeat(400)
    }
    const saida = await refine('bluesky', 't', 'i', chat)
    expect(saida).toBe('x'.repeat(300))
    expect(chamadas).toHaveLength(2)
  })

  it('a falha da chamada principal propaga', async () => {
    const chat: Chat = async () => {
      throw new Error('caiu')
    }
    await expect(refine('bluesky', 't', 'i', chat)).rejects.toThrow('caiu')
  })
})

describe('ajustarAoLimite', () => {
  it('não chama o chat quando já cabe', async () => {
    const { chat, chamadas } = chatEspiao()
    expect(await ajustarAoLimite('curto', 10, chat)).toBe('curto')
    expect(chamadas).toEqual([])
  })

  it('encurtado vazio cai no truncar do original', async () => {
    const { chat } = chatEspiao({ resposta: '   ' })
    expect(await ajustarAoLimite('z'.repeat(20), 10, chat)).toBe('z'.repeat(10))
  })
})

describe('truncar', () => {
  it('recua até a última palavra inteira', () => {
    const texto = 'palavra '.repeat(10)
    expect(truncar(texto, 30).endsWith('pala')).toBe(false)
    expect(truncar(texto, 30).length).toBeLessThanOrEqual(30)
  })

  it('não mexe no que já cabe', () => {
    expect(truncar('curto', 100)).toBe('curto')
  })

  it('corta no limite quando não há espaço útil', () => {
    expect(truncar('x'.repeat(100), 10)).toHaveLength(10)
  })

  it('conta caracteres, não bytes', () => {
    const acentuado = 'ã'.repeat(10)
    expect(truncar(acentuado, 10)).toBe(acentuado)
    const misto = `${'ã'.repeat(9)} ${'b'.repeat(20)}`
    expect(truncar(misto, 20)).toBe(`${'ã'.repeat(9)} ${'b'.repeat(10)}`)
  })

  it('recua também em \\n e \\t', () => {
    expect(truncar(`${'a'.repeat(8)}\n${'b'.repeat(10)}`, 12)).toBe(
      'a'.repeat(8),
    )
    expect(truncar(`${'a'.repeat(8)}\t${'b'.repeat(10)}`, 12)).toBe(
      'a'.repeat(8),
    )
  })

  it('conta emoji como um caractere, como o Python', () => {
    const emoji = '😀'.repeat(5)
    expect(truncar(emoji, 5)).toBe(emoji)
    expect(truncar('😀'.repeat(6), 5)).toBe(emoji)
  })
})

describe('gerarHooks', () => {
  const ARTIGO = {
    title: 'Título',
    excerpt: 'Resumo',
    url: 'https://blog/p',
    tags: ['go', 'rust'],
    voiceSample: 'V',
  }

  it('gera uma chamada por plataforma, na ordem', async () => {
    const { chat, chamadas } = chatEspiao({ resposta: 'chamada' })
    const r = await gerarHooks(ARTIGO, ['bluesky', 'mastodon'], chat)
    expect(r).toEqual([
      { platform: 'bluesky', text: 'chamada' },
      { platform: 'mastodon', text: 'chamada' },
    ])
    expect(chamadas).toHaveLength(2)
    expect(chamadas.every((c) => c.modelo === 'claude-haiku-5-5')).toBe(true)
  })

  it('põe o limite da plataforma no prompt de sistema', async () => {
    const { chat, chamadas } = chatEspiao({ resposta: 'c' })
    await gerarHooks(ARTIGO, ['bluesky', 'mastodon', 'outra'], chat)
    expect(chamadas[0]?.system).toContain('Limite ABSOLUTO: 300')
    expect(chamadas[1]?.system).toContain('Limite ABSOLUTO: 500')
    expect(chamadas[2]?.system).toContain(`Limite ABSOLUTO: ${LIMITE_PADRAO}`)
  })

  it('monta o corpo com título, resumo, tags e trecho', async () => {
    const { chat, chamadas } = chatEspiao({ resposta: 'c' })
    await gerarHooks(ARTIGO, ['bluesky'], chat)
    expect(chamadas[0]?.user).toBe(
      'Título: Título\nResumo: Resumo\nTags: go, rust\n\nTrecho do meu artigo (referência de voz):\nV',
    )
  })

  it('aplica o limite na saída', async () => {
    const { chat } = chatEspiao({ respostas: ['x'.repeat(400), 'curta'] })
    const r = await gerarHooks(ARTIGO, ['bluesky'], chat)
    expect(r[0]?.text).toBe('curta')
  })

  it('trima antes de medir o limite', async () => {
    const conteudo = 'y'.repeat(300)
    const { chat, chamadas } = chatEspiao({ resposta: `\n  ${conteudo}  \n\n` })
    const r = await gerarHooks(ARTIGO, ['bluesky'], chat)
    expect(r[0]?.text).toBe(conteudo)
    expect(chamadas).toHaveLength(1)
  })

  it('uma plataforma que falha derruba o lote', async () => {
    const chat: Chat = async (p) => {
      if (p.system.includes('mastodon')) throw new Error('modelo caiu')
      return 'ok'
    }
    await expect(
      gerarHooks(ARTIGO, ['bluesky', 'mastodon', 'outra'], chat),
    ).rejects.toThrow('modelo caiu')
  })
})
