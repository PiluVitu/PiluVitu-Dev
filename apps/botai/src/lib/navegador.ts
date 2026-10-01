export type Navegador = 'chrome' | 'edge' | 'firefox' | 'opera'

interface ComMarcas {
  userAgentData?: { brands: readonly { brand: string }[] }
}

export function detectarNavegador(): Navegador {
  if (import.meta.env.FIREFOX) return 'firefox'
  if (import.meta.env.OPERA) return 'opera'
  // O Edge usa o zip do Chrome, e o Opera também instala pela Chrome Web Store: só o agente sabe quem é.
  const marcas =
    (navigator as Navigator & ComMarcas).userAgentData?.brands ?? []
  if (marcas.some(({ brand }) => brand === 'Microsoft Edge')) return 'edge'
  if (marcas.some(({ brand }) => brand.startsWith('Opera'))) return 'opera'
  return 'chrome'
}

// Edge e Opera: a confirmar no checklist manual do CLAUDE.md (plano B: edge:// e opera://extensions/shortcuts).
export const PAGINA_DE_ATALHOS: Record<
  Exclude<Navegador, 'firefox'>,
  string
> = {
  chrome: 'chrome://extensions/shortcuts',
  edge: 'chrome://extensions/shortcuts',
  opera: 'chrome://extensions/shortcuts',
}
