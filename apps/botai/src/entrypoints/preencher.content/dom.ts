import type { FieldDescriptor } from '@piluvitu/tools/campos'
import { browser } from 'wxt/browser'

export type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

const TIPOS_SEM_DADO = new Set([
  'hidden',
  'checkbox',
  'radio',
  'file',
  'submit',
  'button',
  'reset',
  'image',
  'range',
  'color',
])

export function ehCampo(n: Element): n is Campo {
  return (
    n instanceof HTMLInputElement ||
    n instanceof HTMLSelectElement ||
    n instanceof HTMLTextAreaElement
  )
}

export function tipoNaoPreenchivel(el: Campo): boolean {
  return el instanceof HTMLInputElement && TIPOS_SEM_DADO.has(el.type)
}

export function preenchivel(el: Campo): boolean {
  if (tipoNaoPreenchivel(el) || el.matches(':disabled')) return false
  if (el instanceof HTMLSelectElement) return !el.multiple
  return !el.readOnly
}

function sobAriaHidden(el: Element): boolean {
  for (let atual: Element | null = el; atual; ) {
    if (atual.closest('[aria-hidden="true"]')) return true
    const raiz = atual.getRootNode()
    atual = raiz instanceof ShadowRoot ? raiz.host : null
  }
  return false
}

export function visivel(el: Campo): boolean {
  if (!el.isConnected) return false
  if (
    !el.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true,
      contentVisibilityAuto: true,
    })
  )
    return false
  if (sobAriaHidden(el)) return false
  // select2 e afins escondem o <select> nativo, mas continuam escutando o change dele.
  if (el instanceof HTMLSelectElement) return true
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  return r.right + window.scrollX > 0 && r.bottom + window.scrollY > 0
}

type ComRaizFechada = Element & {
  readonly openOrClosedShadowRoot?: ShadowRoot | null
}

function raizSombra(el: Element): ShadowRoot | null {
  if (el.shadowRoot) return el.shadowRoot
  if (!(el instanceof HTMLElement)) return null
  // O Firefox não tem browser.dom: o equivalente é um atributo do elemento (não método), só em content scripts.
  return import.meta.env.FIREFOX
    ? ((el as ComRaizFechada).openOrClosedShadowRoot ?? null)
    : (browser.dom.openOrClosedShadowRoot(el) ?? null)
}

export function* campos(raiz: Document | ShadowRoot): Generator<Campo> {
  const caminhante = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT)
  for (let n = caminhante.nextNode(); n; n = caminhante.nextNode()) {
    if (!(n instanceof Element)) continue
    if (ehCampo(n)) yield n
    const sombra = raizSombra(n)
    if (sombra) yield* campos(sombra)
  }
}

function textoSemControles(n: Element): string {
  const copia = n.cloneNode(true) as Element
  copia
    .querySelectorAll('input,select,textarea,button,option,script,style')
    .forEach((x) => x.remove())
  return (copia.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function rotulo(el: Campo): string {
  const partes = Array.from(el.labels ?? [], (label) =>
    textoSemControles(label),
  )
  const raiz = el.getRootNode() as Document | ShadowRoot
  for (const id of (el.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)) {
    const referido = raiz.getElementById(id)
    if (referido) partes.push(textoSemControles(referido))
  }
  return partes.join(' ').slice(0, 160)
}

function secao(el: Campo): string {
  const legenda = el.closest('fieldset')?.querySelector(':scope > legend')
  return legenda ? textoSemControles(legenda) : ''
}

export function descrever(el: Campo): FieldDescriptor {
  return {
    tag: el.tagName.toLowerCase() as FieldDescriptor['tag'],
    type: el.type,
    name: el.getAttribute('name') ?? '',
    id: el.id,
    autocomplete: el.getAttribute('autocomplete') ?? '',
    placeholder: el.getAttribute('placeholder') ?? '',
    label: rotulo(el),
    ariaLabel: el.getAttribute('aria-label') ?? '',
    maxLength:
      el instanceof HTMLSelectElement || el.maxLength < 0 ? null : el.maxLength,
    inputMode: el.getAttribute('inputmode') ?? undefined,
    pattern: el.getAttribute('pattern') ?? undefined,
    options:
      el instanceof HTMLSelectElement
        ? Array.from(el.options, (opcao) => ({
            value: opcao.value,
            text: opcao.text,
          }))
        : undefined,
    section: secao(el),
  }
}

function posicaoEntreIrmaos(el: Element): number {
  const irmaos = Array.from(
    (el.parentNode as ParentNode | null)?.children ?? [],
  )
  return irmaos.filter((irmao) => irmao.tagName === el.tagName).indexOf(el) + 1
}

export function seletor(el: Campo): string {
  const tag = el.tagName.toLowerCase()
  const raiz = el.getRootNode() as Document | ShadowRoot
  const unico = (css: string) => raiz.querySelectorAll(css).length === 1
  const nome = el.getAttribute('name')
  let proprio: string
  if (el.id && unico(`#${CSS.escape(el.id)}`))
    proprio = `${tag}#${CSS.escape(el.id)}`
  else if (nome && unico(`${tag}[name="${CSS.escape(nome)}"]`))
    proprio = `${tag}[name="${nome}"]`
  else proprio = `${tag}:nth-of-type(${posicaoEntreIrmaos(el)})`
  return raiz instanceof ShadowRoot
    ? `${raiz.host.tagName.toLowerCase()} › ${proprio}`
    : proprio
}

function setterNativo(el: Campo): (valor: string) => void {
  const prototipo =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototipo, 'value')?.set
  if (!setter) throw new Error('setter nativo de value ausente')
  return (valor) => setter.call(el, valor)
}

export function escrever(el: Campo, valor: string): void {
  const bolha = { bubbles: true, composed: true }
  // Foco sintético, nunca el.focus(): com o popup aberto a página não tem foco, e popup, atalho e menu seguem o mesmo caminho.
  el.dispatchEvent(new FocusEvent('focus'))
  el.dispatchEvent(new FocusEvent('focusin', bolha))
  // Setter do protótipo: no mundo MAIN o React intercepta o setter da instância e engoliria o onChange.
  setterNativo(el)(valor)
  el.dispatchEvent(new Event('input', bolha))
  el.dispatchEvent(new Event('change', bolha))
  el.dispatchEvent(new FocusEvent('blur'))
  el.dispatchEvent(new FocusEvent('focusout', bolha))
}

const digitos = (s: string) => s.replace(/\D/g, '')

export function leuDeVolta(el: Campo, valor: string): boolean {
  if (el.value === valor) return true
  const esperado = digitos(valor)
  return esperado.length > 0 && digitos(el.value) === esperado
}

export function cabe(
  valor: string,
  d: Pick<FieldDescriptor, 'maxLength'>,
): boolean {
  return d.maxLength === null || valor.length <= d.maxLength
}

export function elementoEmFoco(doc: Document): Element | null {
  let atual = doc.activeElement
  while (atual) {
    const dentro = raizSombra(atual)?.activeElement
    if (!dentro) break
    atual = dentro
  }
  return atual === doc.body ? null : atual
}
