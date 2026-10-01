import type { FieldDescriptor, FieldKind } from '@piluvitu/tools/campos'
import { valorPara } from '@piluvitu/tools/campos-formatar'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import {
  cabe,
  descrever,
  ehCampo,
  elementoEmFoco,
  escrever,
  leuDeVolta,
  preenchivel,
  tipoNaoPreenchivel,
} from './dom'

export type ResultadoInsercao =
  | { ok: true }
  | { ok: false; motivo: 'sem-foco' | 'recusado' }

const TEXTO_LIVRE: FieldDescriptor = {
  tag: 'textarea',
  type: 'textarea',
  name: '',
  id: '',
  autocomplete: '',
  placeholder: '',
  label: '',
  ariaLabel: '',
  maxLength: null,
  section: '',
}

export function inserirNoFoco(
  pessoa: Pessoa,
  kind: FieldKind,
): ResultadoInsercao {
  const alvo = elementoEmFoco(document)
  if (alvo && ehCampo(alvo) && !tipoNaoPreenchivel(alvo)) {
    if (!preenchivel(alvo)) return { ok: false, motivo: 'recusado' }
    const descritor = descrever(alvo)
    const valor = valorPara(kind, pessoa, descritor)
    if (valor === null || !cabe(valor, descritor))
      return { ok: false, motivo: 'recusado' }
    if (alvo.value !== valor) escrever(alvo, valor)
    return leuDeVolta(alvo, valor)
      ? { ok: true }
      : { ok: false, motivo: 'recusado' }
  }
  if (alvo instanceof HTMLElement && alvo.isContentEditable) {
    const valor = valorPara(kind, pessoa, TEXTO_LIVRE)
    if (valor !== null && document.execCommand('insertText', false, valor))
      return { ok: true }
    return { ok: false, motivo: 'recusado' }
  }
  return { ok: false, motivo: 'sem-foco' }
}
