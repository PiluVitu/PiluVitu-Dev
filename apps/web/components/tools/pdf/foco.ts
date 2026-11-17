const TIPOS_SEM_TEXTO = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
])

export function podeTerFoco(
  elemento: Element | null | undefined,
): elemento is HTMLElement {
  return (
    elemento instanceof HTMLElement &&
    elemento.isConnected &&
    !(elemento as HTMLButtonElement).disabled
  )
}

/** Onde o Ctrl+Z e as setas são da pessoa escrevendo, não da tela. */
export function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  if (alvo.isContentEditable || alvo instanceof HTMLTextAreaElement) {
    return true
  }
  return alvo instanceof HTMLInputElement && !TIPOS_SEM_TEXTO.has(alvo.type)
}
