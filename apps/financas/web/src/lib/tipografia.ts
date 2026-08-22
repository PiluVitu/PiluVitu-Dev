/**
 * A assinatura tipográfica do admin (`apps/web`), trazida pra cá como fonte
 * ÚNICA — o rótulo em versalete mono é o que faz um card daqui e um card de
 * lá parecerem o mesmo produto.
 *
 * ⚠️ **Os valores foram CONFERIDOS contra o admin, não copiados de um
 * briefing.** `ROTULO` bate byte a byte com
 * `apps/web/components/admin/stat-card.tsx:19`. `ROTULO_SECAO` bate com
 * `apps/web/components/admin/admin-sidebar.tsx:109` **menos o `px-2`**, que é
 * posicional (espaçamento dentro da sidebar), não tipográfico — quem precisa
 * dele acrescenta no call site.
 *
 * ⚠️ **Nada de `shadow-ds` junto.** O `StatCard` do admin a usa, mas ela é
 * `0 18px 40px rgb(0 0 0 / 0.45)` — desenhada pro tema escuro do site. No
 * claro do finanças (o padrão aqui) 45% de preto a 40px de blur vira borrão
 * cinza em volta de todo card, não profundidade.
 */

/**
 * Rótulo de um número (o "label" do `StatCard`). 12px (`text-xs`).
 *
 * Fonte: `apps/web/components/admin/stat-card.tsx:19` — idêntico.
 */
export const ROTULO =
  'text-muted-foreground font-mono text-xs font-semibold tracking-[0.18em] uppercase'

/**
 * Cabeçalho de um GRUPO de itens (o título de seção da sidebar do admin).
 * Menor e com tracking maior que `ROTULO`, porque agrupa em vez de nomear.
 *
 * ⚠️ **10px, não 11px** — `apps/web/components/admin/admin-sidebar.tsx:109`
 * é `text-[10px]`. `App.tsx` tinha nascido com `text-[11px]` numa cópia
 * literal desse mesmo papel; passou a consumir esta constante pra não existir
 * duas grafias do mesmo rótulo no app.
 */
export const ROTULO_SECAO =
  'text-muted-foreground font-mono text-[10px] font-semibold tracking-[0.2em] uppercase'

/**
 * ⚠️ **A escala de número, com a regra dura junto — ver `blocos/NumeroCard.tsx`.**
 *
 * O `text-4xl` (36px) do admin **não serve aqui**: lá os valores são `6`,
 * `1`, `5` (contagens). MEDIDO em Chrome real a 390×844: `R$ 21.122,50` a 36px
 * pede **233,1px**, e num grid de 2 colunas a caixa útil de um card é
 * **137px** (358 do shell − 16 de gap = 342, ÷2 = 171, − 32 de padding, − 2 de
 * borda).
 *
 * | papel                          | classe                              | px |
 * | ------------------------------ | ----------------------------------- | -- |
 * | número herói (card de largura total) | `text-3xl font-semibold tabular-nums` | 30 |
 * | número em grid de 2 colunas    | `text-2xl font-semibold tabular-nums` | 24 |
 * | corpo                          | `text-sm`                           | 14 |
 * | rótulo/meta                    | `ROTULO`                            | 12 |
 */
export const NUMERO_HEROI = 'text-3xl font-semibold tabular-nums'
export const NUMERO_GRID = 'text-2xl font-semibold tabular-nums'
