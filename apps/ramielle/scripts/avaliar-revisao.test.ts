/**
 * Testa só a nota do conjunto de avaliação, nunca a API: o `Chat` daqui é
 * falso e devolve as respostas gravadas em `__fixtures__/avaliacao/`. Quem
 * chama a Claude de verdade é `rodar-avaliacao-revisao.mjs`, e só com o OK
 * do dono (`pnpm --filter @piluvitu/ramielle eval:revisao`).
 */
import { describe, expect, it } from 'vitest'
import type { RespostaClaude } from '@piluvitu/ia/claude'
import { dividirBlocos } from '../src/domain/revisao/markdown-blocos'
import { estimativaMicroUsd } from '@piluvitu/ia/custo'
import {
  pedidoDoLote,
  type Chat,
  type PedidoChat,
} from '../src/domain/revisao/revisao'
import {
  avaliarHook,
  avaliarProofread,
  consolidar,
  criarChatMedido,
  estimarCustoMicro,
  formatarRelatorio,
  rodarAvaliacao,
  type CasoProofread,
  type Esperado,
  type EntradaHooks,
} from './avaliar-revisao'
import artigo01 from './__fixtures__/avaliacao/01-crase-e-cerca.md?raw'
import esperado01 from './__fixtures__/avaliacao/01-crase-e-cerca.esperado.json'
import artigo02 from './__fixtures__/avaliacao/02-tabela.md?raw'
import esperado02 from './__fixtures__/avaliacao/02-tabela.esperado.json'
import artigo03 from './__fixtures__/avaliacao/03-jsx.md?raw'
import esperado03 from './__fixtures__/avaliacao/03-jsx.esperado.json'
import artigo04 from './__fixtures__/avaliacao/04-citacao-e-imagem.md?raw'
import esperado04 from './__fixtures__/avaliacao/04-citacao-e-imagem.esperado.json'
import artigo05 from './__fixtures__/avaliacao/05-cerca-aberta.md?raw'
import esperado05 from './__fixtures__/avaliacao/05-cerca-aberta.esperado.json'
import artigoHooks from './__fixtures__/avaliacao/artigo-hooks.json'
import gravadas from './__fixtures__/avaliacao/respostas-gravadas.json'
import ciYml from '../../../.github/workflows/ci.yml?raw'
import pacote from '../package.json'

const CASOS: CasoProofread[] = [
  { id: '01-crase-e-cerca', original: artigo01, esperado: esperado01 },
  { id: '02-tabela', original: artigo02, esperado: esperado02 },
  { id: '03-jsx', original: artigo03, esperado: esperado03 },
  { id: '04-citacao-e-imagem', original: artigo04, esperado: esperado04 },
  { id: '05-cerca-aberta', original: artigo05, esperado: esperado05 },
]

const HOOKS: EntradaHooks = artigoHooks

function contar(texto: string, trecho: string): number {
  return texto.split(trecho).length - 1
}

// Chat falso: o proofread manda os blocos em lote ({"blocos": [...]}) e cada
// bloco é respondido pela gravação dele; hooks, pela plataforma que aparece no
// system. Pedido sem gravação falha o teste, em vez de inventar.
function chatGravado(): { chat: Chat; pedidos: PedidoChat[] } {
  const pedidos: PedidoChat[] = []
  const chat: Chat = async (pedido) => {
    pedidos.push(pedido)
    if (pedido.formatoJson) {
      const { blocos } = JSON.parse(pedido.user) as { blocos: string[] }
      return JSON.stringify({
        blocos: blocos.map((bloco) => {
          const gravada = gravadas.proofread.find((g) => g.entrada === bloco)
          if (!gravada) {
            throw new Error(`bloco sem resposta gravada: ${bloco.slice(0, 60)}`)
          }
          return gravada.saida
        }),
      })
    }
    const hook = gravadas.hooks.find((g) =>
      pedido.system.includes(`Plataforma: ${g.plataforma}.`),
    )
    if (hook) return hook.saida
    throw new Error(`pedido sem resposta gravada: ${pedido.user.slice(0, 60)}`)
  }
  return { chat, pedidos }
}

describe('avaliarProofread', () => {
  const original =
    'Fui devido a mudança.\n\n```ts\n// nao mexer\nconst a = 1\n```\n\nO resto ficou igual aqui.\n'
  const esperado: Esperado = {
    descricao: 'mínimo',
    erros: [
      {
        tipo: 'crase',
        trecho: 'devido a mudança',
        aceitos: ['devido à mudança'],
      },
    ],
  }
  const corrigido = original.replace('devido a mudança', 'devido à mudança')

  it('resposta perfeita: passthrough idêntico, todos os erros e nenhuma extra', () => {
    expect(avaliarProofread(original, esperado, corrigido)).toEqual({
      passthroughIdentico: true,
      errosCorrigidos: 1,
      errosTotal: 1,
      mudancasExtras: 0,
    })
  })

  it('cerca de código alterada dá passthroughIdentico: false', () => {
    const obtido = corrigido.replace('// nao mexer', '// não mexer')
    expect(
      avaliarProofread(original, esperado, obtido).passthroughIdentico,
    ).toBe(false)
  })

  it('uma palavra trocada fora dos erros plantados dá mudancasExtras: 1', () => {
    const obtido = corrigido.replace('ficou igual', 'permaneceu igual')
    const nota = avaliarProofread(original, esperado, obtido)
    expect(nota.mudancasExtras).toBe(1)
    expect(nota.errosCorrigidos).toBe(1)
  })

  it('erro não corrigido conta só como não corrigido, nunca também como extra', () => {
    expect(avaliarProofread(original, esperado, original)).toEqual({
      passthroughIdentico: true,
      errosCorrigidos: 0,
      errosTotal: 1,
      mudancasExtras: 0,
    })
  })

  it('aceita qualquer uma das correções listadas', () => {
    const esp: Esperado = {
      descricao: 'alternativas',
      erros: [
        {
          tipo: 'concordância',
          trecho: 'a gente vamos',
          aceitos: ['a gente vai', 'nós vamos'],
        },
      ],
    }
    const nota = avaliarProofread(
      'Hoje a gente vamos testar.\n',
      esp,
      'Hoje nós vamos testar.\n',
    )
    expect(nota.errosCorrigidos).toBe(1)
    expect(nota.mudancasExtras).toBe(0)
  })

  it('corrigir o erro e manter o trecho errado em outro lugar não conta', () => {
    const nota = avaliarProofread(
      original,
      esperado,
      corrigido + '\nFui devido a mudança.\n',
    )
    expect(nota.errosCorrigidos).toBe(0)
  })

  it('cerca não fechada no fim: alterar a última linha também quebra o passthrough', () => {
    const aberta = 'Texto certo aqui.\n\n```ts\n// excessao\nconst b = 2\n'
    const esp: Esperado = { descricao: 'aberta', erros: [] }
    expect(
      avaliarProofread(aberta, esp, aberta.replace('excessao', 'exceção'))
        .passthroughIdentico,
    ).toBe(false)
    expect(avaliarProofread(aberta, esp, aberta).passthroughIdentico).toBe(true)
  })

  it('mudança só de branco entre palavras não conta como extra', () => {
    const nota = avaliarProofread(
      original,
      esperado,
      corrigido.replace('O resto ficou', 'O resto  ficou'),
    )
    expect(nota.mudancasExtras).toBe(0)
  })
})

describe('avaliarHook', () => {
  it('hook com https:// dá semUrl: false', () => {
    expect(
      avaliarHook('Escrevi sobre Workers: https://piluvitu.com.br/x', 300)
        .semUrl,
    ).toBe(false)
  })

  it('domínio sem protocolo também conta como URL', () => {
    expect(avaliarHook('Leia em piluvitu.com.br', 300).semUrl).toBe(false)
  })

  it('hook limpo passa nos três critérios', () => {
    expect(
      avaliarHook('Opa, pessoal! Migrei a API inteira para Workers.', 300),
    ).toEqual({ dentroDoLimite: true, semUrl: true, semNome: true })
  })

  it('cita o nome do autor dá semNome: false', () => {
    expect(avaliarHook('Aqui é o Paulo, e escrevi um post.', 300).semNome).toBe(
      false,
    )
    expect(avaliarHook('Post novo no blog #PiluVitu', 300).semNome).toBe(false)
  })

  it('limite conta code points: emoji conta um', () => {
    expect(avaliarHook('🚀'.repeat(10), 10).dentroDoLimite).toBe(true)
    expect(avaliarHook('a'.repeat(11), 10).dentroDoLimite).toBe(false)
  })
})

describe('fixtures do conjunto', () => {
  it.each(CASOS)(
    '$id: cada erro plantado aparece uma vez e nenhum aceito já está no original',
    ({ original, esperado }) => {
      expect(esperado.erros.length).toBeGreaterThan(0)
      for (const erro of esperado.erros) {
        expect(contar(original, erro.trecho), erro.trecho).toBe(1)
        for (const aceito of erro.aceitos) {
          expect(contar(original, aceito), aceito).toBe(0)
        }
      }
    },
  )

  it.each(CASOS)(
    '$id: os erros plantados ficam na prosa, nunca no passthrough',
    ({ original, esperado }) => {
      const passthrough = dividirBlocos(original)
        .filter((b) => b.tipo === 'passthrough')
        .map((b) => b.texto)
        .join('')
      for (const erro of esperado.erros) {
        expect(passthrough.includes(erro.trecho), erro.trecho).toBe(false)
      }
    },
  )

  it('o conjunto cobre cerca fechada, cerca não fechada, tabela, JSX, citação e imagem', () => {
    const passthrough = CASOS.flatMap(({ original }) =>
      dividirBlocos(original).filter(
        (b) => b.tipo === 'passthrough' && b.texto.trim() !== '',
      ),
    ).map((b) => b.texto.trim())
    expect(
      passthrough.some((t) => t.startsWith('```') && t.endsWith('```')),
    ).toBe(true)
    expect(artigo05.trimEnd().endsWith('```')).toBe(false)
    expect(passthrough.some((t) => t.startsWith('|'))).toBe(true)
    expect(passthrough.some((t) => t.startsWith('<'))).toBe(true)
    expect(passthrough.some((t) => t.startsWith('>'))).toBe(true)
    expect(passthrough.some((t) => t.startsWith('!['))).toBe(true)
  })

  it('os tipos plantados cobrem crase, concordância, acento e digitação', () => {
    const tipos = new Set(
      CASOS.flatMap((c) => c.esperado.erros.map((e) => e.tipo)),
    )
    expect([...tipos].sort()).toEqual([
      'acento',
      'concordância',
      'crase',
      'digitação',
    ])
  })

  it('o artigo dos hooks tem três plataformas, uma delas no limite padrão', () => {
    expect(HOOKS.plataformas).toEqual(['bluesky', 'mastodon', 'x'])
  })
})

describe('rodarAvaliacao com as respostas gravadas', () => {
  it('passa o mesmo código de produção: Sonnet com os blocos de prosa em lote e Haiku nos hooks', async () => {
    const { chat, pedidos } = chatGravado()
    await rodarAvaliacao(CASOS, HOOKS, chat)
    const blocosDeProsa = CASOS.flatMap(({ original }) =>
      dividirBlocos(original).filter(
        (b) => b.tipo === 'prosa' && b.texto.trim() !== '',
      ),
    )
    const proofreads = pedidos.filter((p) => p.modelo === 'claude-sonnet-5-5')
    expect(
      proofreads.flatMap(
        (p) => (JSON.parse(p.user) as { blocos: string[] }).blocos,
      ),
    ).toEqual(blocosDeProsa.map((b) => b.texto))
    // Cada artigo do conjunto cabe num lote só: um pedido ao Sonnet por artigo.
    expect(proofreads).toHaveLength(CASOS.length)
    expect(pedidos.filter((p) => p.modelo === 'claude-haiku-5-5')).toHaveLength(
      3,
    )
    for (const pedido of pedidos) {
      expect(pedido.user).not.toContain('```')
    }
  })

  it('as respostas gravadas passam no critério de aceite', async () => {
    const { chat } = chatGravado()
    const resultado = await rodarAvaliacao(CASOS, HOOKS, chat)
    const nota = consolidar(resultado)
    expect(nota).toMatchObject({
      passthrough: { ok: 5, total: 5 },
      erros: { corrigidos: 17, total: 17 },
      maxExtrasPorArtigo: 0,
      hooks: { ok: 3, total: 3 },
      aprovado: true,
      falhas: [],
    })
    expect(resultado.hooks.map((h) => [h.plataforma, h.limite])).toEqual([
      ['bluesky', 300],
      ['mastodon', 500],
      ['x', 280],
    ])
  })

  it('reprova e diz por quê quando um artigo passa do limite de extras', async () => {
    const { chat } = chatGravado()
    const resultado = await rodarAvaliacao(CASOS, HOOKS, chat)
    resultado.proofread[0].nota.mudancasExtras = 2
    resultado.hooks[2].nota.semUrl = false
    const nota = consolidar(resultado)
    expect(nota.aprovado).toBe(false)
    expect(nota.falhas).toEqual([
      '01-crase-e-cerca: 2 mudanças fora dos erros plantados (máximo 1)',
      'hook x: tem URL',
    ])
  })

  it('reprova com menos de 90% dos erros corrigidos', async () => {
    const { chat } = chatGravado()
    const resultado = await rodarAvaliacao(CASOS, HOOKS, chat)
    resultado.proofread[0].nota.errosCorrigidos = 2
    const nota = consolidar(resultado)
    expect(nota.erros).toEqual({ corrigidos: 15, total: 17 })
    expect(nota.aprovado).toBe(false)
    expect(nota.falhas).toEqual(['erros corrigidos: 15/17 (88%), mínimo 90%'])
  })
})

describe('custo', () => {
  it('a estimativa do proofread conta um pedido por lote, com o system do lote e o schema', () => {
    const caso = CASOS[0] as CasoProofread
    const prosa = dividirBlocos(caso.original)
      .filter((b) => b.tipo === 'prosa' && b.texto.trim() !== '')
      .map((b) => b.texto)
    const pedido = pedidoDoLote(prosa)
    const esperado = estimativaMicroUsd(
      'claude-sonnet-5-5',
      pedido.system.length +
        pedido.user.length +
        JSON.stringify(pedido.formatoJson).length,
      Math.ceil(pedido.user.length / 2),
    )
    expect(estimarCustoMicro([caso], { ...HOOKS, plataformas: [] })).toBe(
      esperado,
    )
  })

  it('a estimativa da rodada fica abaixo de US$ 0,05', () => {
    const micro = estimarCustoMicro(CASOS, HOOKS)
    expect(micro).toBeGreaterThan(0)
    expect(micro).toBeLessThan(50_000)
  })

  it('criarChatMedido soma o custo real e as chamadas, sem expor nada além do texto', async () => {
    const resposta = (texto: string, custoMicro: number): RespostaClaude => ({
      texto,
      custoMicro,
      uso: { input_tokens: 10, output_tokens: 5 } as RespostaClaude['uso'],
    })
    const custos = [120, 30]
    const medido = criarChatMedido(async (p) =>
      resposta(`ok ${p.modelo}`, custos.shift() ?? 0),
    )
    const pedido: PedidoChat = {
      modelo: 'claude-haiku-5-5',
      system: 's',
      user: 'u',
      maxTokens: 10,
    }
    expect(await medido.chat(pedido)).toBe('ok claude-haiku-5-5')
    await medido.chat(pedido)
    expect(medido.medicao()).toEqual({
      chamadas: 2,
      custoMicro: 150,
      tokensEntrada: 20,
      tokensSaida: 10,
    })
  })

  it('o relatório traz a nota, o custo em dólar e o veredito', async () => {
    const { chat } = chatGravado()
    const resultado = await rodarAvaliacao(CASOS, HOOKS, chat)
    const texto = formatarRelatorio(resultado, consolidar(resultado), {
      estimadoMicro: 21_000,
      medicao: {
        chamadas: 21,
        custoMicro: 18_500,
        tokensEntrada: 9000,
        tokensSaida: 1500,
      },
    })
    expect(texto).toContain('passthrough idêntico: 5/5')
    expect(texto).toContain('erros corrigidos: 17/17 (100%)')
    expect(texto).toContain('hooks nos três critérios: 3/3')
    expect(texto).toContain('custo estimado: US$ 0,0210')
    expect(texto).toContain('custo real: US$ 0,0185 em 21 chamadas')
    expect(texto).toContain('APROVADO')
  })
})

describe('o eval nunca roda sozinho', () => {
  it('nem o test nem o lint do pacote chamam o script que fala com a API', () => {
    expect(pacote.scripts['eval:revisao']).toContain(
      'rodar-avaliacao-revisao.mjs',
    )
    expect(pacote.scripts.test).not.toContain('rodar-avaliacao')
    expect(pacote.scripts.test).not.toContain('eval')
    expect(pacote.scripts.lint).not.toContain('eval')
  })

  it('o CI não roda eval:revisao nem o script', () => {
    expect(ciYml).toContain('@piluvitu/ramielle run test')
    expect(ciYml).not.toContain('eval:revisao')
    expect(ciYml).not.toContain('rodar-avaliacao')
  })
})
