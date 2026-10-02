import { config } from '@fortawesome/fontawesome-svg-core'

// O CSS do Font Awesome entra pelo globals.css, na camada base: injetado em runtime, fora de camada, venceria o `hidden` e o `size-*`.
config.autoAddCss = false
