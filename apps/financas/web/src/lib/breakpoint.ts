import { useEffect, useState } from 'react'

/**
 * Mesmo valor do breakpoint `sm` padrão do Tailwind v4 (nenhum breakpoint
 * customizado em `packages/ui/src/styles.css`).
 */
export const BREAKPOINT_SM = 640

/**
 * Mesmo valor do breakpoint `md` padrão do Tailwind v4 — a fronteira entre
 * "celular" (tab bar fixa embaixo) e "desktop" (sidebar à esquerda).
 */
export const BREAKPOINT_MD = 768

function larguraAbaixoDeSm(): boolean {
  return window.innerWidth < BREAKPOINT_SM
}

function larguraAbaixoDeMd(): boolean {
  return window.innerWidth < BREAKPOINT_MD
}

/**
 * `true` quando o viewport é mais estreito que `sm` — o sinal pra trocar uma
 * tabela de várias colunas por um card por linha.
 *
 * ⚠️ **Nasceu em `pages/DividasPage.tsx` (Important 3 do fix final): em
 * ~390px (Android, o dispositivo PRIMÁRIO do dono pra registrar gasto), uma
 * tabela de 5 colunas cortava as DUAS colunas de dinheiro atrás de um drag
 * horizontal sem indicação nenhuma.** Extraído pra cá na SEGUNDA cópia
 * (extrato), não na terceira — mesma disciplina de
 * `lib/mutar-e-recarregar.ts`: o que estava sendo copiado não é a chamada, é
 * a regra (qual largura, medida como, e por que só um dos dois markups
 * existe por vez).
 *
 * `window.innerWidth` (não `ResizeObserver`/medição de container, ao
 * contrário de `blocos/GraficoComprometido.tsx`) porque o problema aqui É de
 * viewport: as duas telas que usam isto vivem na coluna única de `AppShell`
 * (`max-w-2xl`), nunca dentro de um grid que aperte o card — é decisão de
 * layout de PÁGINA (tabela vs. cards), o mesmo tipo de breakpoint que o
 * `sm:` do Tailwind já resolve em CSS. jsdom suporta `innerWidth` e o evento
 * `resize` nativamente (constatação da Task 6, ver CLAUDE.md), então dá pra
 * testar sem stub nenhum.
 *
 * ⚠️ Quem consome renderiza SÓ UM dos dois markups por vez — nunca os dois
 * com `hidden`/`sm:block`. jsdom não computa CSS, então os dois estariam no
 * DOM ao mesmo tempo durante os testes, duplicando todo texto que
 * `getByText`/`getByRole` procura.
 */
export function useMenorQueSm(): boolean {
  const [menor, setMenor] = useState(larguraAbaixoDeSm)
  useEffect(() => {
    const onResize = () => setMenor(larguraAbaixoDeSm())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return menor
}

/**
 * `true` quando o viewport é mais estreito que `md` — o sinal pra trocar a
 * sidebar de desktop pela dupla top bar + tab bar de celular.
 *
 * ⚠️ **A ARMADILHA que este hook existe pra evitar é a mesma já documentada
 * em `useMenorQueSm`, e aqui ela seria pior.** A saída "óbvia" pra ter dois
 * navs seria `md:hidden` na tab bar e `hidden md:flex` na sidebar — os dois
 * markups ficariam no DOM ao mesmo tempo, jsdom não computa CSS, e cada um
 * dos ~20 `getByRole('link', { name: … })` da suíte passaria a achar DOIS
 * "Extrato". Renderizar UM SÓ dos dois navs é o que mantém a árvore
 * acessível honesta (um leitor de tela também anunciaria os dois) e a suíte
 * sem ambiguidade.
 *
 * `window.innerWidth` pelo mesmo motivo de `useMenorQueSm`: a decisão é de
 * layout de PÁGINA (nav de celular × nav de desktop), não de um container
 * espremido por grid.
 */
export function useMenorQueMd(): boolean {
  const [menor, setMenor] = useState(larguraAbaixoDeMd)
  useEffect(() => {
    const onResize = () => setMenor(larguraAbaixoDeMd())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return menor
}
