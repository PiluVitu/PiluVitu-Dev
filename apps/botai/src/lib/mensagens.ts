import type { FieldKind } from '@piluvitu/tools/campos'
import { browser } from 'wxt/browser'
import type { ResumoPreenchimento } from './resultado'

export type Mensagem =
  | { tipo: 'preencher'; tabId: number }
  | { tipo: 'mostrar'; tabId: number; documentId: string; idx: number }
  | { tipo: 'inserir'; tabId: number; frameId: number; kind: FieldKind }

export type RespostaPreencher =
  | { ok: true; resumo: ResumoPreenchimento }
  | { ok: false; motivo: 'proibida' | 'arquivo-sem-acesso' }

export function enviar(m: Mensagem): Promise<unknown> {
  return browser.runtime.sendMessage(m)
}
