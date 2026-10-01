import { defineContentScript } from 'wxt/utils/define-content-script'
import { criarApi, type ComBotai } from './api'

export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  noScriptStartedPostMessage: true,
  main(ctx) {
    ;(globalThis as ComBotai).__botai = criarApi(ctx)
  },
})
