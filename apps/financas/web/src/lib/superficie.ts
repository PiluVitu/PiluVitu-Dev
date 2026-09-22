/**
 * A anatomia das superfícies do redesenho, num lugar só.
 *
 * ⚠️ **Os nomes de raio do Tailwind NÃO batem com os px do design.**
 * `packages/ui/src/styles.css` reaponta `--radius-lg` pra `--radius`
 * (1.125rem = 18px) e deixa `--radius-xl` no default do Tailwind (12px) —
 * ou seja, `rounded-lg` é MAIOR que `rounded-xl` neste design system.
 * Escrever o raio à mão em cada call site é como a divergência entra; as
 * constantes abaixo já carregam o certo.
 */

/**
 * Cartão de seção: a superfície de nível 1 (18px de raio).
 *
 * ⚠️ `rounded-lg` sobrescreve o `rounded-xl` que `Card` traz — via `cn()`,
 * que resolve o conflito pelo último. Passar os dois sem `cn()` deixa o
 * vencedor por conta da ordem no CSS emitido, não do código.
 */
export const CARTAO_SECAO = 'rounded-lg'

/** Cartão de KPI: 16px de raio, o passo abaixo do cartão de seção. */
export const CARTAO_KPI = 'bg-card rounded-2xl border px-4 py-4 sm:px-[18px]'

/**
 * Painel rebaixado dentro de um cartão — faixa de flags, bloco de texto do
 * modelo, formulário no pé de uma coluna.
 *
 * ⚠️ `bg-background` é o "sunken" deste design system, e funciona nos DOIS
 * temas porque `--background` fica dos dois lados de `--card`: mais escuro
 * que o branco do card no claro, mais escuro que o cinza do card no escuro.
 * `bg-muted` NÃO serve — é o mesmo valor de `--secondary`, já gasto em chip.
 */
export const PAINEL_SUNKEN = 'bg-background rounded-[14px] border p-4'

/** Sub-cartão dentro de um cartão de seção (os PJ/PF de Saldos). */
export const SUBCARTAO = 'bg-background rounded-[14px] border p-4'

/**
 * Linha de lista — o padrão que substituiu as tabelas de 3+ colunas nas
 * telas de leitura. Separador de 1px, sem borda na última.
 */
export const LINHA_LISTA =
  'flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-3 last:border-b-0 last:pb-0'

/** Pílula mono de estado/escopo (`PJ`, `FALTA PAGAR`, `PAUSADA`). */
export const CHIP_MONO =
  'inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.1em] uppercase'

/** Faixa de alerta dentro de um cartão — nunca no topo da página. */
export const FAIXA_ALERTA =
  'bg-destructive/[0.07] text-destructive rounded-xl border border-destructive/25 px-3 py-2 text-sm'

/** Grid da faixa de KPIs: 2–4 cartões que se acomodam sozinhos. */
export const GRID_KPI =
  'grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3'

/** Grid dos blocos de conteúdo (Início, colunas de detalhe). */
export const GRID_BLOCOS =
  'grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4'

/** Trilho de uma barra de proporção. A altura vem do call site. */
export const TRILHO_BARRA = 'bg-secondary w-full overflow-hidden rounded-full'
