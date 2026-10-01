import { ehCampo } from './dom'

export type TipoContorno = 'preenchido' | 'nao-reconhecido'

export interface Contornos {
  marcar(el: HTMLElement, tipo: TipoContorno): void
  destacar(el: HTMLElement): void
  limpar(): void
}

const OUTLINE: Record<TipoContorno, string> = {
  preenchido: '2px solid #38bdf8',
  'nao-reconhecido': '2px dashed #f5b82e',
}
const APAGADO = '2px dashed transparent'
const PISCA = [
  OUTLINE['nao-reconhecido'],
  APAGADO,
  OUTLINE['nao-reconhecido'],
  APAGADO,
  OUTLINE['nao-reconhecido'],
]
const PISCA_MS = 200

interface Original {
  outline: [string, string]
  deslocamento: [string, string]
}

export function criarContornos(
  agendar: (acao: () => void, ms: number) => void,
): Contornos {
  const originais = new WeakMap<HTMLElement, Original>()
  const marcados = new Map<HTMLElement, TipoContorno>()
  const piscando = new Set<HTMLElement>()

  function guardarOriginal(el: HTMLElement) {
    if (originais.has(el)) return
    originais.set(el, {
      outline: [
        el.style.getPropertyValue('outline'),
        el.style.getPropertyPriority('outline'),
      ],
      deslocamento: [
        el.style.getPropertyValue('outline-offset'),
        el.style.getPropertyPriority('outline-offset'),
      ],
    })
  }

  function pintar(el: HTMLElement, outline: string) {
    el.style.setProperty('outline', outline, 'important')
    el.style.setProperty('outline-offset', '1px', 'important')
  }

  function restaurar(el: HTMLElement) {
    const original = originais.get(el)
    if (!original) return
    el.style.setProperty('outline', ...original.outline)
    el.style.setProperty('outline-offset', ...original.deslocamento)
  }

  return {
    marcar(el, tipo) {
      guardarOriginal(el)
      marcados.set(el, tipo)
      pintar(el, OUTLINE[tipo])
    },
    destacar(el) {
      guardarOriginal(el)
      piscando.add(el)
      PISCA.forEach((outline, passo) => {
        if (passo === 0) pintar(el, outline)
        else agendar(() => pintar(el, outline), passo * PISCA_MS)
      })
      agendar(() => {
        piscando.delete(el)
        const tipo = marcados.get(el)
        if (tipo) pintar(el, OUTLINE[tipo])
        else restaurar(el)
      }, PISCA.length * PISCA_MS)
    },
    limpar() {
      for (const el of new Set([...marcados.keys(), ...piscando])) restaurar(el)
      marcados.clear()
    },
  }
}

export function cliqueDoUsuarioEmCampo(
  evento: Pick<Event, 'isTrusted' | 'composedPath'>,
): boolean {
  if (!evento.isTrusted) return false
  const alvo = evento.composedPath()[0]
  return alvo instanceof Element && ehCampo(alvo)
}
