import type { FieldKind } from '@piluvitu/tools/campos'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import { browser } from 'wxt/browser'
import { obterOuGerarPessoa } from '../../lib/armazenamento'
import { hojeISO } from '../../lib/hoje'
import type { RespostaPreencher } from '../../lib/mensagens'
import { erroEhPaginaProibida } from '../../lib/paginas'
import { somarFrames } from '../../lib/resultado'
import {
  AVISO_SEM_CAMPOS,
  avisoFalhaInserir,
  linhaNaoReconhecidos,
  tituloPreenchimento,
  type MotivoFalhaInserir,
} from '../../lib/textos'
import type { ComBotai } from '../preencher.content/api'
import type { ResultadoInsercao } from '../preencher.content/inserir'

export const ARQUIVO_CONTENT = '/content-scripts/preencher.js'

interface Aviso {
  titulo: string
  linha2?: string
  erro?: boolean
}

const mensagemDo = (erro: unknown) =>
  erro instanceof Error ? erro.message : String(erro)

export async function avisar(tabId: number, aviso: Aviso): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: (a: Aviso) => {
      ;(globalThis as ComBotai).__botai?.aviso(a)
    },
    args: [aviso],
  })
}

async function motivoDaRecusa(
  tabId: number,
): Promise<'proibida' | 'arquivo-sem-acesso'> {
  const aba = await browser.tabs.get(tabId)
  return aba.url?.startsWith('file:') ? 'arquivo-sem-acesso' : 'proibida'
}

export async function preencherPagina(
  tabId: number,
): Promise<RespostaPreencher> {
  const pessoa = await obterOuGerarPessoa()
  try {
    await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [ARQUIVO_CONTENT],
    })
    const resultados = await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (p: Pessoa, hoje: string) =>
        (globalThis as ComBotai).__botai?.preencher(p, hoje) ?? null,
      args: [pessoa, hojeISO()],
    })
    const resumo = somarFrames(
      resultados.map(({ documentId, frameId, result }) => ({
        documentId,
        frameId,
        result,
      })),
    )
    if (resumo.contentType === 'application/pdf')
      return { ok: false, motivo: 'proibida' }
    await avisar(
      tabId,
      resumo.y === 0
        ? { titulo: AVISO_SEM_CAMPOS, erro: true }
        : {
            titulo: tituloPreenchimento(resumo.x, resumo.y),
            linha2: resumo.k > 0 ? linhaNaoReconhecidos(resumo.k) : undefined,
          },
    )
    return { ok: true, resumo }
  } catch (erro) {
    if (!erroEhPaginaProibida(mensagemDo(erro))) throw erro
    return { ok: false, motivo: await motivoDaRecusa(tabId) }
  }
}

async function avisarFalhaAoInserir(
  tabId: number,
  frameIdDoClique: number,
  motivo: MotivoFalhaInserir,
): Promise<void> {
  try {
    if (frameIdDoClique !== 0) {
      await browser.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        files: [ARQUIVO_CONTENT],
      })
    }
    await avisar(tabId, { titulo: avisoFalhaInserir(motivo), erro: true })
  } catch (erro) {
    if (!erroEhPaginaProibida(mensagemDo(erro))) throw erro
  }
}

export async function inserirNoCampo(
  tabId: number,
  frameId: number,
  kind: FieldKind,
): Promise<void> {
  const pessoa = await obterOuGerarPessoa()
  let resultado: ResultadoInsercao | null | undefined
  try {
    await browser.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: [ARQUIVO_CONTENT],
    })
    const [injecao] = await browser.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: (p: Pessoa, k: FieldKind) =>
        (globalThis as ComBotai).__botai?.inserir(p, k) ?? null,
      args: [pessoa, kind],
    })
    resultado = injecao?.result
  } catch (erro) {
    if (!erroEhPaginaProibida(mensagemDo(erro))) throw erro
    if (frameId !== 0) await avisarFalhaAoInserir(tabId, frameId, 'iframe')
    return
  }
  if (resultado && !resultado.ok)
    await avisarFalhaAoInserir(tabId, frameId, resultado.motivo)
}

export async function mostrarCampo(
  tabId: number,
  documentId: string,
  idx: number,
): Promise<boolean> {
  try {
    const [resultado] = await browser.scripting.executeScript({
      target: { tabId, documentIds: [documentId] },
      func: (i: number) =>
        (globalThis as ComBotai).__botai?.mostrar(i) ?? false,
      args: [idx],
    })
    return resultado?.result === true
  } catch {
    return false
  }
}
