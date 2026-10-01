// Prototype of the DOM side (content script, ISOLATED world). Research artifact.
import { classificarFormulario, type FieldDescriptor } from './campos.ts'
import { valorPara, type Pessoa } from './formatar.ts'

type El = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
const NAO_PREENCHE = new Set([
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

declare const chrome: {
  dom?: { openOrClosedShadowRoot(el: HTMLElement): ShadowRoot | null }
}

function textoSemControles(n: Element): string {
  const c = n.cloneNode(true) as Element
  c.querySelectorAll(
    'input,select,textarea,button,option,script,style',
  ).forEach((x) => x.remove())
  return (c.textContent || '').replace(/\s+/g, ' ').trim()
}

function rotulo(el: El): string {
  const parts: string[] = []
  for (const l of Array.from(el.labels ?? [])) parts.push(textoSemControles(l))
  const root = el.getRootNode() as Document | ShadowRoot
  for (const id of (el.getAttribute('aria-labelledby') || '')
    .split(/\s+/)
    .filter(Boolean)) {
    const n = root.getElementById
      ? root.getElementById(id)
      : document.getElementById(id)
    if (n) parts.push(textoSemControles(n))
  }
  return parts.join(' ').slice(0, 160)
}

function secao(el: El): string {
  const lg = el.closest('fieldset')?.querySelector(':scope > legend')
  return lg ? textoSemControles(lg) : ''
}

function visivel(el: El): boolean {
  if (
    !el.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true,
      contentVisibilityAuto: true,
    })
  )
    return false
  if (el.closest('[aria-hidden="true"]')) return false
  if (el instanceof HTMLSelectElement) return true // select2 & co. hide the native select 1x1; it still drives the widget via 'change'
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  if (r.right + window.scrollX <= 0 || r.bottom + window.scrollY <= 0)
    return false
  return true
}

function* campos(root: Document | ShadowRoot): Generator<El> {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
  for (
    let n = tw.nextNode() as Element | null;
    n;
    n = tw.nextNode() as Element | null
  ) {
    if (
      n instanceof HTMLInputElement ||
      n instanceof HTMLSelectElement ||
      n instanceof HTMLTextAreaElement
    )
      yield n
    if (n instanceof HTMLElement) {
      const sr = n.shadowRoot ?? chrome.dom?.openOrClosedShadowRoot(n) ?? null
      if (sr) yield* campos(sr)
    }
  }
}

export function descrever(el: El): FieldDescriptor {
  const tag = el.tagName.toLowerCase() as FieldDescriptor['tag']
  return {
    tag,
    type:
      el instanceof HTMLInputElement
        ? el.type
        : el instanceof HTMLSelectElement
          ? el.type
          : 'textarea',
    name: el.getAttribute('name') || '',
    id: el.id || '',
    autocomplete: el.getAttribute('autocomplete') || '',
    placeholder: el.getAttribute('placeholder') || '',
    label: rotulo(el),
    ariaLabel: el.getAttribute('aria-label') || '',
    maxLength: 'maxLength' in el && el.maxLength >= 0 ? el.maxLength : null,
    inputMode: el.getAttribute('inputmode') || undefined,
    pattern: el.getAttribute('pattern') || undefined,
    options:
      el instanceof HTMLSelectElement
        ? Array.from(el.options).map((o) => ({ value: o.value, text: o.text }))
        : undefined,
    section: secao(el),
  }
}

export function seletor(el: El): string {
  const tag = el.tagName.toLowerCase()
  const root = el.getRootNode() as Document | ShadowRoot
  const unico = (s: string) => {
    try {
      return root.querySelectorAll(s).length === 1
    } catch {
      return false
    }
  }
  let s = ''
  if (el.id && unico(`#${CSS.escape(el.id)}`)) s = `${tag}#${CSS.escape(el.id)}`
  else if (
    el.getAttribute('name') &&
    unico(`${tag}[name="${CSS.escape(el.getAttribute('name')!)}"]`)
  )
    s = `${tag}[name="${el.getAttribute('name')}"]`
  else {
    const irmaos = Array.from(root.querySelectorAll(tag))
    s = `${tag}:nth-of-type(${irmaos.indexOf(el) + 1})`
  }
  return root instanceof ShadowRoot
    ? `${(root.host as Element).tagName.toLowerCase()} › ${s}`
    : s
}

function escrever(el: El, v: string): void {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
  const set = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  el.focus({ preventScroll: true })
  set.call(el, v)
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  el.blur()
}

const so = (s: string) => s.replace(/\D/g, '')

interface Registro {
  refs: Map<number, WeakRef<El>>
  seq: number
}
const reg: Registro = ((globalThis as any).__pvReg ??= {
  refs: new Map(),
  seq: 0,
})

export function preencher(p: Pessoa) {
  const els = Array.from(campos(document)).filter((el) => {
    if (el instanceof HTMLInputElement && NAO_PREENCHE.has(el.type))
      return false
    if (el.disabled || ('readOnly' in el && el.readOnly)) return false
    if (el instanceof HTMLSelectElement && el.multiple) return false
    return visivel(el)
  })
  const ds = els.map(descrever)
  const cls = classificarFormulario(ds)
  const preenchidos: unknown[] = [],
    naoReconhecidos: unknown[] = [],
    rejeitados: unknown[] = []
  let total = 0
  els.forEach((el, i) => {
    const c = cls[i]
    if (c?.kind === 'ignorar') return
    total++
    const idx = ++reg.seq
    reg.refs.set(idx, new WeakRef(el))
    const info = {
      idx,
      rotulo: ds[i].label || ds[i].placeholder || ds[i].name,
      seletor: seletor(el),
    }
    if (!c) {
      naoReconhecidos.push(info)
      return
    }
    const v = valorPara(c.kind, p, ds[i], c.dicas)
    if (v === null) {
      naoReconhecidos.push({ ...info, motivo: 'semOpcao' })
      return
    }
    if (el.value !== v) escrever(el, v)
    const ok = el.value === v || (so(v).length > 0 && so(el.value) === so(v))
    ;(ok ? preenchidos : rejeitados).push({
      ...info,
      kind: c.kind,
      via: c.via,
      conf: c.confidence,
      escrito: v,
      lido: el.value,
    })
  })
  return { total, preenchidos, naoReconhecidos, rejeitados }
}

export function mostrar(idx: number): boolean {
  const el = reg.refs.get(idx)?.deref()
  if (!el || !el.isConnected) return false
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const prev = [
    el.style.getPropertyValue('outline'),
    el.style.getPropertyPriority('outline'),
  ] as const
  el.style.setProperty('outline', '2px dashed #f5b82e', 'important')
  setTimeout(() => el.style.setProperty('outline', prev[0], prev[1]), 1600)
  return true
}

;(globalThis as any).__pv = { preencher, mostrar }
