import type { Modelo } from '@piluvitu/ia/custo'
import { ClaudeRecusou } from '@piluvitu/ia/erros'
import { dividirBlocos } from './markdown-blocos'
import { RESUMO_SYSTEM } from './prompts'
import type { Chat, PedidoChat } from './revisao'

export const MODELO_RESUMO: Modelo = 'claude-haiku-5-5'

// O Haiku 5.5 pensa por padrão e o pensamento conta no max_tokens: ver
// "Resumo do post" no CLAUDE.md do ramielle.
export const MAX_TOKENS_RESUMO = 4096

export const TETO_CARACTERES_RESUMO = 24_000
export const MAX_CARACTERES_CORPO_RESUMO = 200_000
export const MAX_CARACTERES_TITULO_RESUMO = 300

const TLDR_MAX = 400
const META_MIN = 50
const META_MAX = 160
const TAGS_MAX = 5
const TAG_VALIDA = /^[a-z0-9-]+$/
const CAMPOS = ['metaDescription', 'tags', 'tldr']

export const FORMATO_RESUMO = {
  type: 'object',
  properties: {
    tldr: { type: 'string' },
    metaDescription: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['tldr', 'metaDescription', 'tags'],
  additionalProperties: false,
} as const

export type Resumo = { tldr: string; metaDescription: string; tags: string[] }

export class SemProsa extends Error {
  constructor() {
    super(
      'O artigo não tem texto em prosa para resumir (só código, tabela ou componente).',
    )
    this.name = 'SemProsa'
  }
}

export class ParagrafoGrandeDemais extends Error {
  constructor(tamanho: number) {
    super(
      `O primeiro parágrafo tem ${tamanho} caracteres, e o resumo lê no máximo ${TETO_CARACTERES_RESUMO / 1000} mil. Divida esse parágrafo em partes.`,
    )
    this.name = 'ParagrafoGrandeDemais'
  }
}

export class CorpoGrandeDemais extends Error {
  constructor(tamanho: number) {
    super(
      `O artigo tem ${tamanho} caracteres, e o máximo para resumir é ${MAX_CARACTERES_CORPO_RESUMO / 1000} mil.`,
    )
    this.name = 'CorpoGrandeDemais'
  }
}

const SEPARADOR = '\n\n'

export function prosaParaResumo(body: string): string {
  const paragrafos = dividirBlocos(body)
    .filter((b) => b.tipo === 'prosa')
    .map((b) => b.texto.trim())
    .filter((t) => t !== '')
  if (paragrafos.length === 0) throw new SemProsa()

  const primeiro = paragrafos[0] as string
  if (primeiro.length > TETO_CARACTERES_RESUMO) {
    throw new ParagrafoGrandeDemais(primeiro.length)
  }

  let prosa = primeiro
  for (const paragrafo of paragrafos.slice(1)) {
    const proxima = prosa + SEPARADOR + paragrafo
    if (proxima.length > TETO_CARACTERES_RESUMO) break
    prosa = proxima
  }
  return prosa
}

export function pedidoDoResumo(title: string, prosa: string): PedidoChat {
  return {
    modelo: MODELO_RESUMO,
    system: RESUMO_SYSTEM,
    user: `Título: ${title}\n\nTexto do artigo:\n${prosa}`,
    maxTokens: MAX_TOKENS_RESUMO,
    formatoJson: FORMATO_RESUMO,
  }
}

function recusar(): never {
  throw new ClaudeRecusou('formato')
}

export function lerResumo(resposta: string): Resumo {
  let corpo: unknown
  try {
    corpo = JSON.parse(resposta)
  } catch {
    recusar()
  }
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) {
    recusar()
  }
  const chaves = Object.keys(corpo).sort()
  if (chaves.join() !== CAMPOS.join()) recusar()

  const { tldr, metaDescription, tags } = corpo as Record<string, unknown>
  if (typeof tldr !== 'string' || typeof metaDescription !== 'string') {
    recusar()
  }
  const tldrLimpo = tldr.trim()
  const metaLimpa = metaDescription.trim()
  if (tldrLimpo.length < 1 || tldrLimpo.length > TLDR_MAX) recusar()
  if (metaLimpa.length < META_MIN || metaLimpa.length > META_MAX) recusar()

  if (
    !Array.isArray(tags) ||
    tags.length < 1 ||
    tags.length > TAGS_MAX ||
    !tags.every((t) => typeof t === 'string' && TAG_VALIDA.test(t))
  ) {
    recusar()
  }

  return { tldr: tldrLimpo, metaDescription: metaLimpa, tags }
}

export async function gerarResumo(
  entrada: { title: string; body: string },
  chat: Chat,
): Promise<Resumo> {
  if (entrada.body.length > MAX_CARACTERES_CORPO_RESUMO) {
    throw new CorpoGrandeDemais(entrada.body.length)
  }
  const prosa = prosaParaResumo(entrada.body)
  const resposta = await chat(pedidoDoResumo(entrada.title, prosa))
  return lerResumo(resposta)
}
