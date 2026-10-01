import { defineContentScript } from 'wxt/utils/define-content-script'
import { criarApi, type ComPv } from './api'

export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  noScriptStartedPostMessage: true,
  main(ctx) {
    ;(globalThis as ComPv).__pv = criarApi(ctx)
  },
})
