import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'

// O react-dom/server (renderToStaticMarkup, no teste do acordeão) usa os dois, e o jsdom não os traz.
Object.assign(global, { TextEncoder, TextDecoder })
