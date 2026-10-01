import type { FieldKind } from '@piluvitu/tools/campos'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import {
  primeiroNaoReconhecido,
  type ResultadoFrame,
} from '../../lib/resultado'
import { montarAviso } from './aviso'
import { cliqueDoUsuarioEmCampo, criarContornos } from './contornos'
import { inserirNoFoco, type ResultadoInsercao } from './inserir'
import { preencherDocumento } from './preencher'
import { criarRegistro } from './registro'

export interface ApiPv {
  preencher(pessoa: Pessoa, hojeISO: string): ResultadoFrame
  inserir(pessoa: Pessoa, kind: FieldKind): ResultadoInsercao
  mostrar(idx: number): boolean
  aviso(a: { titulo: string; linha2?: string; erro?: boolean }): void
}

export type ComPv = typeof globalThis & { __pv?: ApiPv }

const LIMPEZA_NOS_FRAMES_FILHOS_MS = 4000

export function criarApi(ctx: ContentScriptContext): ApiPv {
  const registro = criarRegistro()
  const contornos = criarContornos((acao, ms) => ctx.setTimeout(acao, ms))
  let ultimo: ResultadoFrame | null = null

  ctx.onInvalidated(() => contornos.limpar())
  for (const tipo of ['pointerdown', 'focusin'] as const) {
    ctx.addEventListener(
      document,
      tipo,
      (evento: Event) => {
        if (cliqueDoUsuarioEmCampo(evento)) contornos.limpar()
      },
      { capture: true },
    )
  }

  function mostrar(idx: number): boolean {
    const el = registro.buscar(idx)
    if (!el) return false
    el.scrollIntoView({ block: 'center' })
    contornos.destacar(el)
    return true
  }

  return {
    preencher(pessoa, hojeISO) {
      contornos.limpar()
      ultimo = preencherDocumento(pessoa, hojeISO, registro, contornos)
      if (window !== window.top)
        ctx.setTimeout(() => contornos.limpar(), LIMPEZA_NOS_FRAMES_FILHOS_MS)
      return ultimo
    },
    inserir: inserirNoFoco,
    mostrar,
    aviso(a) {
      const alvo =
        !a.erro && ultimo ? primeiroNaoReconhecido(ultimo) : undefined
      void montarAviso(ctx, {
        ...a,
        onIrParaNaoReconhecido:
          alvo === undefined ? undefined : () => void mostrar(alvo),
        aoSair: () => contornos.limpar(),
      })
    },
  }
}
