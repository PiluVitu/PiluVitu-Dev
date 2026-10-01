import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

if (!('CSS' in globalThis)) {
  Object.defineProperty(globalThis, 'CSS', {
    value: { escape: (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`) },
    configurable: true,
  })
}

beforeEach(() => fakeBrowser.reset())
afterEach(() => cleanup())
