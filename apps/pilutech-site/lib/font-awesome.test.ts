import { config } from '@fortawesome/fontawesome-svg-core'
import './font-awesome'

// Injetado em runtime, fora de camada, o CSS do Font Awesome venceria o `hidden` e o `size-*`.
it('o Font Awesome não injeta CSS: ele vem do globals.css, na camada base', () => {
  expect(config.autoAddCss).toBe(false)
})
