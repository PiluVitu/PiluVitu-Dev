import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'
import css from './aviso.css?inline'
import { construirAviso, type OpcoesAviso } from './aviso-dom'

export async function montarAviso(
  ctx: ContentScriptContext,
  opcoes: Omit<OpcoesAviso, 'onFechar'> & { aoSair: () => void },
): Promise<void> {
  const { aoSair, ...aviso } = opcoes
  const ui = await createShadowRootUi(ctx, {
    name: 'piluvitu-aviso',
    position: 'inline',
    anchor: 'html',
    css,
    onMount(recipiente) {
      recipiente.append(
        construirAviso(document, { ...aviso, onFechar: () => ui.remove() }),
      )
    },
    onRemove: aoSair,
  })
  ui.mount()
}
