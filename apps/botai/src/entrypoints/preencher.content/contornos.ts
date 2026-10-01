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

// Longhands também: com só `outline-color` inline o shorthand lê '' e removê-lo apaga os longhands.
const PROPRIEDADES = [
  'outline',
  'outline-color',
  'outline-style',
  'outline-width',
  'outline-offset',
] as const

type Original = [propriedade: string, valor: string, prioridade: string][]

export function criarContornos(
  agendar: (acao: () => void, ms: number) => void,
): Contornos {
  const originais = new WeakMap<HTMLElement, Original>()
  const marcados = new Map<HTMLElement, TipoContorno>()
  const piscando = new Map<HTMLElement, number>()
  let geracao = 0

  function guardarOriginal(el: HTMLElement) {
    if (originais.has(el)) return
    originais.set(
      el,
      PROPRIEDADES.map((propriedade) => [
        propriedade,
        el.style.getPropertyValue(propriedade),
        el.style.getPropertyPriority(propriedade),
      ]),
    )
  }

  function pintar(el: HTMLElement, outline: string) {
    el.style.setProperty('outline', outline, 'important')
    el.style.setProperty('outline-offset', '1px', 'important')
  }

  function restaurar(el: HTMLElement) {
    const original = originais.get(el)
    if (!original) return
    el.style.removeProperty('outline')
    el.style.removeProperty('outline-offset')
    for (const [propriedade, valor, prioridade] of original)
      if (valor) el.style.setProperty(propriedade, valor, prioridade)
  }

  return {
    marcar(el, tipo) {
      guardarOriginal(el)
      marcados.set(el, tipo)
      pintar(el, OUTLINE[tipo])
    },
    destacar(el) {
      guardarOriginal(el)
      const minha = ++geracao
      piscando.set(el, minha)
      const atual = () => piscando.get(el) === minha
      PISCA.forEach((outline, passo) => {
        if (passo === 0) pintar(el, outline)
        else
          agendar(() => {
            if (atual()) pintar(el, outline)
          }, passo * PISCA_MS)
      })
      agendar(() => {
        if (!atual()) return
        piscando.delete(el)
        const tipo = marcados.get(el)
        if (tipo) pintar(el, OUTLINE[tipo])
        else restaurar(el)
      }, PISCA.length * PISCA_MS)
    },
    limpar() {
      for (const el of new Set([...marcados.keys(), ...piscando.keys()]))
        restaurar(el)
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
