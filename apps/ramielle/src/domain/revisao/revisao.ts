import type { Modelo } from '@piluvitu/ia/custo'
import { ClaudeRecusou } from '@piluvitu/ia/erros'
import { dividirBlocos, restaurarBordas } from './markdown-blocos'
import {
  hooksSystem,
  INSTRUCAO_PADRAO,
  PROOFREAD_LOTE_SYSTEM,
  PROOFREAD_SYSTEM,
  REFINE_SYSTEM,
  SHORTEN_SYSTEM,
} from './prompts'

export type PedidoChat = {
  modelo: Modelo
  system: string
  user: string
  maxTokens: number
  formatoJson?: object
}

export type Chat = (pedido: PedidoChat) => Promise<string>

export const MODELO_PROOFREAD: Modelo = 'claude-sonnet-5-5'
export const MODELO_HOOKS: Modelo = 'claude-haiku-5-5'

const MAX_TOKENS_PROOFREAD = 4096

// Contas em "Revisão em lotes" no CLAUDE.md do ramielle.
export const TETO_CARACTERES_LOTE = 5000
export const MAX_LOTES_PROOFREAD = 10

export const FORMATO_LOTE = {
  type: 'object',
  properties: { blocos: { type: 'array', items: { type: 'string' } } },
  required: ['blocos'],
  additionalProperties: false,
} as const

export const MAX_TOKENS_HOOKS = 1024

export const LIMITES: Record<string, number> = { bluesky: 300, mastodon: 500 }
export const LIMITE_PADRAO = 280

export function limiteDaPlataforma(plataforma: string): number {
  return Object.hasOwn(LIMITES, plataforma)
    ? (LIMITES[plataforma] as number)
    : LIMITE_PADRAO
}

// O limite das redes conta caracteres (code points), como o len() do Python;
// String.length contaria cada emoji como dois.
export function truncar(texto: string, limite: number): string {
  const caracteres = Array.from(texto)
  if (caracteres.length <= limite) return texto
  let corte = caracteres.slice(0, limite)
  const indice = Math.max(
    corte.lastIndexOf(' '),
    corte.lastIndexOf('\n'),
    corte.lastIndexOf('\t'),
  )
  if (indice > Math.floor(limite / 2)) corte = corte.slice(0, indice)
  return corte.join('').trim()
}

function tamanho(texto: string): number {
  return Array.from(texto).length
}

export async function ajustarAoLimite(
  texto: string,
  limite: number,
  chat: Chat,
): Promise<string> {
  if (tamanho(texto) <= limite) return texto

  let encurtado: string
  try {
    encurtado = await chat({
      modelo: MODELO_HOOKS,
      system: SHORTEN_SYSTEM,
      user: `Encurte para no máximo ${limite} caracteres, mantendo o tom e o sentido, sem link/URL. Responda só com o texto:\n\n${texto}`,
      maxTokens: MAX_TOKENS_HOOKS,
    })
  } catch {
    return truncar(texto, limite)
  }

  const despido = encurtado.trim()
  if (despido && tamanho(despido) <= limite) return despido
  return truncar(despido || texto, limite)
}

export class TextoGrandeDemais extends Error {
  readonly lotes: number
  readonly maximo: number

  constructor(lotes: number) {
    super(
      `O texto é grande demais para revisar de uma vez: precisaria de ${lotes} pedidos à Claude, e o máximo é ${MAX_LOTES_PROOFREAD} (cada pedido leva até ${TETO_CARACTERES_LOTE / 1000} mil caracteres de prosa). Revise o artigo em partes.`,
    )
    this.name = 'TextoGrandeDemais'
    this.lotes = lotes
    this.maximo = MAX_LOTES_PROOFREAD
  }
}

export function agruparEmLotes<T extends { texto: string }>(
  blocos: T[],
  teto: number = TETO_CARACTERES_LOTE,
): T[][] {
  const lotes: T[][] = []
  let atual: T[] = []
  let tamanhoAtual = 0
  for (const bloco of blocos) {
    if (atual.length > 0 && tamanhoAtual + bloco.texto.length > teto) {
      lotes.push(atual)
      atual = []
      tamanhoAtual = 0
    }
    atual.push(bloco)
    tamanhoAtual += bloco.texto.length
  }
  if (atual.length > 0) lotes.push(atual)
  return lotes
}

function lerLote(resposta: string, esperados: number): string[] {
  let corpo: unknown
  try {
    corpo = JSON.parse(resposta)
  } catch {
    throw new ClaudeRecusou('formato')
  }
  const blocos =
    typeof corpo === 'object' && corpo !== null
      ? (corpo as { blocos?: unknown }).blocos
      : undefined
  if (
    !Array.isArray(blocos) ||
    blocos.length !== esperados ||
    !blocos.every((b) => typeof b === 'string')
  ) {
    throw new ClaudeRecusou('formato')
  }
  return blocos
}

export function pedidoDoLote(textos: string[]): PedidoChat {
  return {
    modelo: MODELO_PROOFREAD,
    system: `${PROOFREAD_SYSTEM}\n\n${PROOFREAD_LOTE_SYSTEM}`,
    user: JSON.stringify({ blocos: textos }),
    maxTokens: MAX_TOKENS_PROOFREAD,
    formatoJson: FORMATO_LOTE,
  }
}

export async function proofread(texto: string, chat: Chat): Promise<string> {
  const blocos = dividirBlocos(texto)
  const prosa = blocos
    .map((bloco, indice) => ({ ...bloco, indice }))
    .filter((b) => b.tipo === 'prosa' && b.texto.trim() !== '')

  const lotes = agruparEmLotes(prosa)
  if (lotes.length > MAX_LOTES_PROOFREAD) {
    throw new TextoGrandeDemais(lotes.length)
  }

  const corrigidas = new Map<number, string>()
  for (const lote of lotes) {
    const resposta = await chat(pedidoDoLote(lote.map((b) => b.texto)))
    lerLote(resposta, lote.length).forEach((corrigido, i) => {
      const bloco = lote[i] as (typeof lote)[number]
      corrigidas.set(
        bloco.indice,
        restaurarBordas(bloco.texto, corrigido.trim()),
      )
    })
  }
  return blocos.map((bloco, i) => corrigidas.get(i) ?? bloco.texto).join('')
}

export async function refine(
  plataforma: string,
  texto: string,
  instrucao: string,
  chat: Chat,
): Promise<string> {
  const limite = limiteDaPlataforma(plataforma)
  const saida = await chat({
    modelo: MODELO_HOOKS,
    system: REFINE_SYSTEM,
    user: `Plataforma: ${plataforma} (limite ${limite} chars)\nInstrução: ${instrucao || INSTRUCAO_PADRAO}\n\nTexto atual:\n${texto}`,
    maxTokens: MAX_TOKENS_HOOKS,
  })
  return ajustarAoLimite(saida.trim(), limite, chat)
}

export type ArtigoHooks = {
  title: string
  excerpt: string
  url: string
  tags: string[]
  voiceSample: string
}

export type Hook = { platform: string; text: string }

export async function gerarHooks(
  artigo: ArtigoHooks,
  plataformas: string[],
  chat: Chat,
): Promise<Hook[]> {
  const hooks: Hook[] = []
  for (const plataforma of plataformas) {
    const limite = limiteDaPlataforma(plataforma)
    const texto = await chat({
      modelo: MODELO_HOOKS,
      system: hooksSystem(plataforma, limite),
      user: `Título: ${artigo.title}\nResumo: ${artigo.excerpt}\nTags: ${artigo.tags.join(', ')}\n\nTrecho do meu artigo (referência de voz):\n${artigo.voiceSample}`,
      maxTokens: MAX_TOKENS_HOOKS,
    })
    hooks.push({
      platform: plataforma,
      text: await ajustarAoLimite(texto.trim(), limite, chat),
    })
  }
  return hooks
}
