import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'

Object.assign(global, { TextEncoder, TextDecoder })

// O jsdom não tem matchMedia, e o next-themes o consulta para o tema do sistema.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// O jsdom também não tem IntersectionObserver, que o next/link usa para o prefetch.
class IntersectionObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
Object.assign(window, { IntersectionObserver: IntersectionObserverFalso })
