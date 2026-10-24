import type { Modelo } from '@piluvitu/ia/custo'
import { dividirBlocos, restaurarBordas } from './markdown-blocos'
import {
  hooksSystem,
  INSTRUCAO_PADRAO,
  PROOFREAD_SYSTEM,
  REFINE_SYSTEM,
  SHORTEN_SYSTEM,
} from './prompts'

export type PedidoChat = {
  modelo: Modelo
  system: string
  user: string
  maxTokens: number
}

export type Chat = (pedido: PedidoChat) => Promise<string>

export const MODELO_PROOFREAD: Modelo = 'claude-sonnet-5-5'
export const MODELO_HOOKS: Modelo = 'claude-haiku-5-5'

const MAX_TOKENS_PROOFREAD = 4096
const MAX_TOKENS_HOOKS = 1024

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

export async function proofread(texto: string, chat: Chat): Promise<string> {
  const partes: string[] = []
  for (const bloco of dividirBlocos(texto)) {
    if (bloco.tipo === 'passthrough' || bloco.texto.trim() === '') {
      partes.push(bloco.texto)
      continue
    }
    const corrigido = await chat({
      modelo: MODELO_PROOFREAD,
      system: PROOFREAD_SYSTEM,
      user: bloco.texto,
      maxTokens: MAX_TOKENS_PROOFREAD,
    })
    partes.push(restaurarBordas(bloco.texto, corrigido.trim()))
  }
  return partes.join('')
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
