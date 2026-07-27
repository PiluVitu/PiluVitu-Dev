/**
 * Classes Tailwind pra elementos nativos que `@piluvitu/ui` não cobre hoje
 * (14 componentes, nenhum `Select`/`Table`). Copiadas à mão das de `Input`
 * (`packages/ui/src/input.tsx`), sem os modificadores `file:*` (irrelevantes
 * pra `<select>`) — mesmo padrão que `blocos/BlocoCategorias.tsx` (Task 8)
 * já usava pro `<input type="month">`.
 *
 * ⚠️ Fix round 1 (Task 9): morava copiado verbatim (280 caracteres) em
 * `accounts.tsx`, `DividasPage.tsx`, `debt-detail.tsx` e `new-entry.tsx` —
 * quatro lugares pra esquecer no dia em que o design system ganhar um
 * `Select` de verdade. Um `const` só, importado pelos quatro.
 */
export const SELECT_CLASSNAME =
  'border-input focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Idem, pra `<input type="checkbox">` — `@piluvitu/ui` não tem `Checkbox`.
 * Morava só como `const` local em `new-entry.tsx` (Task 6/`pages`); extraído
 * pra cá na Task 5 da fatia ⑥ (`recorrentes.tsx` também precisa de
 * checkbox pro toggle "varia?"/"Ativa") — mesma lição de `SELECT_CLASSNAME`
 * acima: um `const` só, não uma cópia por tela.
 */
export const CHECKBOX_CLASSNAME =
  'border-input accent-primary h-4 w-4 rounded focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-hidden'
