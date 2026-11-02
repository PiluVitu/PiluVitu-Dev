type ComViewTransition = Document & {
  startViewTransition?: (atualizar: () => unknown) => {
    finished?: Promise<unknown>
  }
}

const PAUSANDO = 'transicao-de-tema'

function proximoQuadro(janela: Window): Promise<void> {
  return new Promise((resolver) =>
    janela.requestAnimationFrame(() => resolver()),
  )
}

/** Troca o tema com um crossfade (View Transitions API), ou na hora quando o
 * navegador não suporta ou o sistema pede menos movimento. */
export function trocarTemaComTransicao(
  aplicar: () => void,
  {
    documento = document,
    janela = window,
  }: { documento?: Document; janela?: Window } = {},
): void {
  const doc = documento as ComViewTransition
  const reduzir = janela.matchMedia?.(
    '(prefers-reduced-motion: reduce)',
  ).matches
  if (reduzir || typeof doc.startViewTransition !== 'function') {
    aplicar()
    return
  }
  const html = doc.documentElement
  html.classList.add(PAUSANDO)
  const transicao = doc.startViewTransition(async () => {
    aplicar()
    await proximoQuadro(janela)
  })
  const soltar = () => html.classList.remove(PAUSANDO)
  if (transicao?.finished) transicao.finished.then(soltar, soltar)
  else soltar()
}
