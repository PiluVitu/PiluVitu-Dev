import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faChrome,
  faEdge,
  faFirefoxBrowser,
  faOpera,
} from '@fortawesome/free-brands-svg-icons'
import type { Loja } from '@piluvitu/tools/pilulabs'

export const LOJA_UI: Record<Loja, { rotulo: string; icone: IconDefinition }> =
  {
    chrome: { rotulo: 'Chrome Web Store', icone: faChrome },
    firefox: { rotulo: 'Firefox Add-ons', icone: faFirefoxBrowser },
    edge: { rotulo: 'Microsoft Edge Add-ons', icone: faEdge },
    opera: { rotulo: 'Opera add-ons', icone: faOpera },
  }
