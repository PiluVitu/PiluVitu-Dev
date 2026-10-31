type ComViewTransition = Document & {
  startViewTransition?: (atualizar: () => unknown) => unknown
}

function proximoQuadro(janela: Window): Promise<void> {
  return new Promise((resolver) =>
    janela.requestAnimationFrame(() =>
      janela.requestAnimationFrame(() => resolver()),
    ),
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
  doc.startViewTransition(async () => {
    aplicar()
    await proximoQuadro(janela)
  })
}
