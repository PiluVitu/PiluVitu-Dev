import css from '@/assets/tailwind.css?inline'
import { createRoot } from 'react-dom/client'
import { pessoaItem, type ResultadoPreencher } from '@/utils/pessoa'
import { Toast } from './Toast'

const MAPA: Record<string, 'nome' | 'cpf' | 'cep' | 'email'> = {
  nome: 'nome',
  name: 'nome',
  cpf: 'cpf',
  cep: 'cep',
  email: 'email',
}

function setValor(el: HTMLInputElement, valor: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set?.call(el, valor)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  noScriptStartedPostMessage: true,
  async main(ctx): Promise<ResultadoPreencher> {
    const p = await pessoaItem.getValue()
    const campos = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input:not([type=hidden]), textarea, select',
      ),
    )
    const naoReconhecidos: ResultadoPreencher['naoReconhecidos'] = []
    let preenchidos = 0
    for (const el of campos) {
      const chave = MAPA[(el.name || el.id || '').toLowerCase()]
      if (p && chave) {
        setValor(el, p[chave])
        el.style.outline = '2px solid #38bdf8'
        preenchidos++
      } else {
        el.style.outline = '2px dashed #f5b82e'
        naoReconhecidos.push({
          rotulo: el.labels?.[0]?.textContent ?? el.name,
          seletor: el.name ? `[name="${el.name}"]` : el.tagName.toLowerCase(),
        })
      }
    }

    const ui = await createShadowRootUi(ctx, {
      name: 'piluvitu-toast',
      css: css
        .replaceAll(':root', ':host')
        .replace(/\.dark\s*\{/g, ':host(.dark){'),
      position: 'inline',
      anchor: 'body',
      append: 'last',
      onMount(container, _shadow, host) {
        host.classList.add('dark')
        container.classList.add('dark')
        const root = createRoot(container)
        root.render(
          <Toast
            preenchidos={preenchidos}
            total={campos.length}
            onClose={() => ui.remove()}
          />,
        )
        return root
      },
      onRemove(root) {
        root?.unmount()
      },
    })
    ui.mount()
    ctx.setTimeout(() => ui.remove(), 4000)

    return { preenchidos, total: campos.length, naoReconhecidos }
  },
})
