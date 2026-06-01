import { TextEncoder, TextDecoder } from 'util'

Object.assign(global, { TextEncoder, TextDecoder })

import { webcrypto } from 'crypto'

// jsdom exposes crypto.getRandomValues/randomUUID but not SubtleCrypto.
// Node 20+ also exposes globalThis.crypto as a read-only getter, so
// Object.assign silently fails. Use defineProperty to override it with
// Node's webcrypto (which includes .subtle) so entropy.ts SHA-256 works.
if (!(globalThis.crypto as Crypto | undefined)?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    writable: true,
    configurable: true,
  })
}
