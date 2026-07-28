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

/**
 * Idem, pra `<input type="file">` — `Input` (`@piluvitu/ui/input`) não
 * cobre o caso: os modificadores `file:*` dele pressupõem um `<input>` de
 * texto/número com um botão embutido, mas o problema aqui é outro.
 *
 * ⚠️ Achado do print do dono (Task 2, fatia ⑨): "Arquivo (.ofx, .qfx ou
 * .csv)Choose File No file chosen" — rótulo colado no controle, sem
 * respiro. Causa raiz: `<label>` é `display: inline` por padrão (Preflight
 * não muda isso) e um `<input type="file">` SEM classe própria é
 * `inline-block` — os dois ficam na mesma linha, e como o JSX não insere
 * texto/espaço entre elementos-irmãos em linhas separadas, não sobra nem
 * um caractere de espaço entre o texto do rótulo e "Choose File". O
 * `space-y-1.5` do `<div>` pai não ajuda: margin-top não força quebra de
 * linha em elemento inline. `block` (aqui) resolve a causa raiz — o input
 * vira caixa de bloco, cai pra linha de baixo, e aí sim o `space-y-1.5`
 * do pai tem o que fazer. Único `<input type="file">` do app hoje
 * (`pages/importar.tsx`) — se um segundo aparecer, usar esta constante,
 * não copiar `className="text-sm"` de novo.
 */
export const FILE_INPUT_CLASSNAME =
  'text-foreground block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground'
