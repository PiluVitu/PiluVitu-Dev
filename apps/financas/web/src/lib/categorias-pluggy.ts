/**
 * Traduz a categoria que o Pluggy manda na transação para uma categoria deste
 * app, por FAMÍLIA — os 2 primeiros dígitos do `categoryId`.
 *
 * A ligação é o `slug` `pluggy-NN`, semeado pela migration `0010`. Categoria
 * nova do Pluggy dentro de uma família existente passa a funcionar sem código
 * novo; família nova exige uma linha de migration (ver
 * `scripts/pluggy-categorias.mjs`, que detecta).
 */

export type CategoriaParaMapa = {
  id: string
  slug?: string | null
}

/** Família do `categoryId` do Pluggy, ou `null` se não for um id reconhecível. */
export function familiaPluggy(
  categoryId: string | null | undefined,
): string | null {
  if (typeof categoryId !== 'string') return null
  const fam = categoryId.trim().slice(0, 2)
  return /^\d{2}$/.test(fam) ? fam : null
}

/**
 * A categoria deste app para a transação, ou `null` quando não há como saber.
 *
 * ⚠️ A família 05 (Transferências) escolhe pelo SINAL: no Pluggy ela só diz
 * que o meio foi transferência, não quem pagou quem. Um PIX recebido de
 * terceiro é receita; achatar os dois num registro só erraria o fluxo de caixa.
 */
export function categoriaDoPluggy(
  categoryId: string | null | undefined,
  amountCents: number,
  categorias: CategoriaParaMapa[],
): string | null {
  const fam = familiaPluggy(categoryId)
  if (fam === null) return null

  // 99 é o balde de "não sei" do Pluggy: sem sugestão é mais honesto que uma
  // categoria chamada "Outros" com cara de classificação.
  if (fam === '99') return null

  const slug =
    fam === '05'
      ? amountCents >= 0
        ? 'pluggy-05-in'
        : 'pluggy-05-out'
      : `pluggy-${fam}`

  return categorias.find((c) => c.slug === slug)?.id ?? null
}
