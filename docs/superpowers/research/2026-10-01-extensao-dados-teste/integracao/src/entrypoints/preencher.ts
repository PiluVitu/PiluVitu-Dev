import { defineUnlistedScript } from 'wxt/utils/define-unlisted-script'

export default defineUnlistedScript(() => {
  const campo = document.querySelector<HTMLInputElement>('input[name="cpf"]')
  if (campo) {
    campo.value = '529.982.247-25'
    campo.dispatchEvent(new Event('input', { bubbles: true }))
  }
})
