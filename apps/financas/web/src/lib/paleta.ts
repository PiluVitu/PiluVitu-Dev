/**
 * A paleta NEUTRA de dados — a ordem em que uma série categórica recebe cor.
 *
 * ⚠️ **Neutra de propósito: nenhuma destas cores significa risco.**
 * `--destructive` e `--primary` já carregam sentido em toda outra tela
 * (vermelho = dinheiro saindo, azul = normal); reusá-las numa legenda de
 * categoria faria "Mercado" parecer um alerta só por ter caído na posição
 * errada da lista. `--chart-1..5` existem em `packages/ui` exatamente pra
 * isto.
 *
 * ⚠️ Cor aqui NUNCA é o único canal — toda legenda que a usa escreve o nome
 * e o valor ao lado da bolinha.
 */
export const LEGENDA_CORES = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
] as const
