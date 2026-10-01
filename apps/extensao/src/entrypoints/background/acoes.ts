import type { FieldKind } from '@piluvitu/tools/campos'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import { browser } from 'wxt/browser'
import { obterOuGerarPessoa } from '../../lib/armazenamento'
import { hojeISO } from '../../lib/hoje'
import type { RespostaPreencher } from '../../lib/mensagens'
import { erroEhPaginaProibida } from '../../lib/paginas'
import { somarFrames } from '../../lib/resultado'
import { linhaNaoReconhecidos, tituloPreenchimento } from '../../lib/textos'
import type { ComPv } from '../preencher.content/api'

export const ARQUIVO_CONTENT = '/content-scripts/preencher.js'

interface Aviso {
  titulo: string
  linha2?: string
  erro?: boolean
}

export async function avisar(tabId: number, aviso: Aviso): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: (a: Aviso) => {
      ;(globalThis as ComPv).__pv?.aviso(a)
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
        (globalThis as ComPv).__pv?.preencher(p, hoje) ?? null,
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
    if (resumo.y > 0) {
      await avisar(tabId, {
        titulo: tituloPreenchimento(resumo.x, resumo.y),
        linha2: resumo.k > 0 ? linhaNaoReconhecidos(resumo.k) : undefined,
      })
    }
    return { ok: true, resumo }
  } catch (erro) {
    if (
      !erroEhPaginaProibida(erro instanceof Error ? erro.message : String(erro))
    )
      throw erro
    return { ok: false, motivo: await motivoDaRecusa(tabId) }
  }
}

export async function inserirNoCampo(
  tabId: number,
  frameId: number,
  kind: FieldKind,
): Promise<void> {
  const pessoa = await obterOuGerarPessoa()
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    files: [ARQUIVO_CONTENT],
  })
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (p: Pessoa, k: FieldKind) =>
      (globalThis as ComPv).__pv?.inserir(p, k) ?? null,
    args: [pessoa, kind],
  })
}

export async function mostrarCampo(
  tabId: number,
  documentId: string,
  idx: number,
): Promise<boolean> {
  const [resultado] = await browser.scripting.executeScript({
    target: { tabId, documentIds: [documentId] },
    func: (i: number) => (globalThis as ComPv).__pv?.mostrar(i) ?? false,
    args: [idx],
  })
  return resultado?.result === true
}
