import type { PedidoClaude, RespostaClaude } from '@piluvitu/ia/claude'
import { estimativaMicroUsd } from '@piluvitu/ia/custo'
import { dividirBlocos } from '../src/domain/revisao/markdown-blocos'
import { hooksSystem, PROOFREAD_SYSTEM } from '../src/domain/revisao/prompts'
import {
  gerarHooks,
  limiteDaPlataforma,
  MAX_TOKENS_HOOKS,
  MODELO_HOOKS,
  MODELO_PROOFREAD,
  proofread,
  type ArtigoHooks,
  type Chat,
} from '../src/domain/revisao/revisao'

export type ErroPlantado = { tipo: string; trecho: string; aceitos: string[] }
export type Esperado = { descricao: string; erros: ErroPlantado[] }
export type CasoProofread = { id: string; original: string; esperado: Esperado }
export type EntradaHooks = { artigo: ArtigoHooks; plataformas: string[] }

export type NotaProofread = {
  passthroughIdentico: boolean
  errosCorrigidos: number
  errosTotal: number
  mudancasExtras: number
}

export type NotaHook = {
  dentroDoLimite: boolean
  semUrl: boolean
  semNome: boolean
}

export type Resultado = {
  proofread: { id: string; obtido: string; nota: NotaProofread }[]
  hooks: { plataforma: string; limite: number; texto: string; nota: NotaHook }[]
}

export type Consolidado = {
  passthrough: { ok: number; total: number }
  erros: { corrigidos: number; total: number }
  maxExtrasPorArtigo: number
  hooks: { ok: number; total: number }
  aprovado: boolean
  falhas: string[]
}

export type Medicao = {
  chamadas: number
  custoMicro: number
  tokensEntrada: number
  tokensSaida: number
}

export const CRITERIO = {
  fracaoMinimaDeErros: 0.9,
  maxExtrasPorArtigo: 1,
} as const

const URL_REGEX =
  /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|br|dev|io|net|org|app)\b/i
const NOME_REGEX = /\b(?:paulo|victor|piluvitu|pilu)\b/i

function contar(texto: string, trecho: string): number {
  return texto.split(trecho).length - 1
}

function palavras(texto: string): string[] {
  return texto.split(/\s+/).filter((p) => p !== '')
}

// Conta trechos contíguos diferentes (hunks) no diff por palavra, via LCS.
function trechosDiferentes(a: string[], b: string[]): number {
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  let i = 0
  let j = 0
  let trechos = 0
  let dentro = false
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i++
      j++
      dentro = false
      continue
    }
    if (!dentro) trechos++
    dentro = true
    if (j >= b.length || (i < a.length && lcs[i + 1][j] >= lcs[i][j + 1])) i++
    else j++
  }
  return trechos
}

function passthroughPreservado(original: string, obtido: string): boolean {
  let cursor = 0
  for (const bloco of dividirBlocos(original)) {
    if (bloco.tipo !== 'passthrough' || bloco.texto.trim() === '') continue
    const achado = obtido.indexOf(bloco.texto, cursor)
    if (achado === -1) return false
    cursor = achado + bloco.texto.length
  }
  return true
}

export function avaliarProofread(
  original: string,
  esperado: Esperado,
  obtido: string,
): NotaProofread {
  let ideal = original
  let errosCorrigidos = 0
  for (const erro of esperado.erros) {
    const aceito = erro.aceitos.find((a) => obtido.includes(a))
    if (aceito === undefined) continue
    ideal = ideal.replace(erro.trecho, aceito)
    if (contar(obtido, erro.trecho) === 0) errosCorrigidos++
  }
  return {
    passthroughIdentico: passthroughPreservado(original, obtido),
    errosCorrigidos,
    errosTotal: esperado.erros.length,
    mudancasExtras: trechosDiferentes(palavras(ideal), palavras(obtido)),
  }
}

export function avaliarHook(texto: string, limite: number): NotaHook {
  return {
    dentroDoLimite: Array.from(texto).length <= limite,
    semUrl: !URL_REGEX.test(texto),
    semNome: !NOME_REGEX.test(texto),
  }
}

export async function rodarAvaliacao(
  casos: CasoProofread[],
  entradaHooks: EntradaHooks,
  chat: Chat,
): Promise<Resultado> {
  const resultadoProofread: Resultado['proofread'] = []
  for (const caso of casos) {
    const obtido = await proofread(caso.original, chat)
    resultadoProofread.push({
      id: caso.id,
      obtido,
      nota: avaliarProofread(caso.original, caso.esperado, obtido),
    })
  }

  const hooks = await gerarHooks(
    entradaHooks.artigo,
    entradaHooks.plataformas,
    chat,
  )
  return {
    proofread: resultadoProofread,
    hooks: hooks.map((h) => {
      const limite = limiteDaPlataforma(h.platform)
      return {
        plataforma: h.platform,
        limite,
        texto: h.text,
        nota: avaliarHook(h.text, limite),
      }
    }),
  }
}

function porcentagem(parte: number, total: number): number {
  return total === 0 ? 100 : Math.round((parte / total) * 100)
}

export function consolidar(resultado: Resultado): Consolidado {
  const falhas: string[] = []
  let passthroughOk = 0
  let corrigidos = 0
  let total = 0
  let maxExtras = 0

  for (const { id, nota } of resultado.proofread) {
    if (nota.passthroughIdentico) passthroughOk++
    else falhas.push(`${id}: passthrough alterado`)
    if (nota.mudancasExtras > CRITERIO.maxExtrasPorArtigo) {
      falhas.push(
        `${id}: ${nota.mudancasExtras} mudanças fora dos erros plantados (máximo ${CRITERIO.maxExtrasPorArtigo})`,
      )
    }
    corrigidos += nota.errosCorrigidos
    total += nota.errosTotal
    maxExtras = Math.max(maxExtras, nota.mudancasExtras)
  }

  if (corrigidos < CRITERIO.fracaoMinimaDeErros * total) {
    falhas.push(
      `erros corrigidos: ${corrigidos}/${total} (${porcentagem(corrigidos, total)}%), mínimo ${CRITERIO.fracaoMinimaDeErros * 100}%`,
    )
  }

  let hooksOk = 0
  for (const { plataforma, limite, texto, nota } of resultado.hooks) {
    const motivos: string[] = []
    if (!nota.dentroDoLimite) {
      motivos.push(`passou do limite (${Array.from(texto).length}/${limite})`)
    }
    if (!nota.semUrl) motivos.push('tem URL')
    if (!nota.semNome) motivos.push('cita o nome do autor')
    if (motivos.length === 0) hooksOk++
    else falhas.push(`hook ${plataforma}: ${motivos.join(', ')}`)
  }

  return {
    passthrough: { ok: passthroughOk, total: resultado.proofread.length },
    erros: { corrigidos, total },
    maxExtrasPorArtigo: maxExtras,
    hooks: { ok: hooksOk, total: resultado.hooks.length },
    aprovado: falhas.length === 0,
    falhas,
  }
}

// Saída do proofread estimada do tamanho do próprio bloco; nos hooks, o teto
// de tokens, porque o texto sai do zero.
export function estimarCustoMicro(
  casos: CasoProofread[],
  entradaHooks: EntradaHooks,
): number {
  let micro = 0
  for (const { original } of casos) {
    for (const bloco of dividirBlocos(original)) {
      if (bloco.tipo !== 'prosa' || bloco.texto.trim() === '') continue
      micro += estimativaMicroUsd(
        MODELO_PROOFREAD,
        PROOFREAD_SYSTEM.length + bloco.texto.length,
        Math.ceil(bloco.texto.length / 2),
      )
    }
  }
  const artigo = JSON.stringify(entradaHooks.artigo).length
  for (const plataforma of entradaHooks.plataformas) {
    const system = hooksSystem(plataforma, limiteDaPlataforma(plataforma))
    micro += estimativaMicroUsd(
      MODELO_HOOKS,
      system.length + artigo,
      MAX_TOKENS_HOOKS,
    )
  }
  return micro
}

export function criarChatMedido(
  chamar: (pedido: PedidoClaude) => Promise<RespostaClaude>,
): { chat: Chat; medicao: () => Medicao } {
  const medicao: Medicao = {
    chamadas: 0,
    custoMicro: 0,
    tokensEntrada: 0,
    tokensSaida: 0,
  }
  const chat: Chat = async (pedido) => {
    const resposta = await chamar(pedido)
    medicao.chamadas++
    medicao.custoMicro += resposta.custoMicro
    medicao.tokensEntrada += resposta.uso.input_tokens
    medicao.tokensSaida += resposta.uso.output_tokens
    return resposta.texto
  }
  return { chat, medicao: () => ({ ...medicao }) }
}

function dolares(micro: number): string {
  return `US$ ${(micro / 1_000_000).toFixed(4).replace('.', ',')}`
}

export function formatarRelatorio(
  resultado: Resultado,
  nota: Consolidado,
  custo: { estimadoMicro: number; medicao: Medicao },
): string {
  const linhas: string[] = ['Proofread (Sonnet, um pedido por bloco de prosa):']
  for (const { id, nota: n } of resultado.proofread) {
    linhas.push(
      `  ${id}: passthrough ${n.passthroughIdentico ? 'ok' : 'ALTERADO'}, erros ${n.errosCorrigidos}/${n.errosTotal}, extras ${n.mudancasExtras}`,
    )
  }
  linhas.push('', 'Hooks (Haiku):')
  for (const { plataforma, limite, texto } of resultado.hooks) {
    linhas.push(
      `  ${plataforma} (${Array.from(texto).length}/${limite}): ${texto}`,
    )
  }
  const { corrigidos, total } = nota.erros
  linhas.push(
    '',
    'Nota:',
    `  passthrough idêntico: ${nota.passthrough.ok}/${nota.passthrough.total}`,
    `  erros corrigidos: ${corrigidos}/${total} (${porcentagem(corrigidos, total)}%)`,
    `  mudanças extras: no máximo ${nota.maxExtrasPorArtigo} por artigo`,
    `  hooks nos três critérios: ${nota.hooks.ok}/${nota.hooks.total}`,
    '',
    `custo estimado: ${dolares(custo.estimadoMicro)}`,
    `custo real: ${dolares(custo.medicao.custoMicro)} em ${custo.medicao.chamadas} chamadas (${custo.medicao.tokensEntrada} tokens de entrada, ${custo.medicao.tokensSaida} de saída)`,
    '',
    nota.aprovado ? 'APROVADO' : 'REPROVADO',
    ...nota.falhas.map((f) => `  - ${f}`),
  )
  return linhas.join('\n')
}
