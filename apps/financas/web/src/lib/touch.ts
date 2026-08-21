/**
 * Área de toque mínima — a regra, num lugar só.
 *
 * ⚠️ **O defeito que originou isto foi MEDIDO em Chrome real a 390×844**
 * (o Android do dono, o dispositivo primário deste app): TODOS os alvos
 * interativos das telas ficavam abaixo de 44×44 px, e os **destrutivos eram
 * os menores** — `apagar` do extrato a **40×16 px**, a **12 px** de `editar`
 * (33,7×16), repetido em 30 linhas. O `page.tap()` do Playwright acerta
 * porque mira no centro geométrico; um polegar (~34 px de contato nesse
 * layout) não — e errar ali apaga dinheiro.
 *
 * 44×44 é a recomendação do Apple HIG e o alvo do WCAG 2.5.5 (AAA); o
 * mínimo de AA (2.5.8) é 24×24. Ficamos nos 44.
 *
 * ⚠️ **Crescer a área de toque NÃO é crescer a fonte nem o espaço visual.**
 * Todas as constantes abaixo mantêm `text-xs`/`text-sm` e a mesma posição
 * do texto — quem cresce é a caixa clicável, via `min-height`/`padding`.
 * Uma tela que vira lista de botões gigantes seria pior que o defeito.
 */

/** Lado mínimo, em px. Exportado pra teste poder afirmar o número, não uma classe. */
export const ALVO_MIN_PX = 44

/**
 * Link de texto em linha (o caso de `apagar`/`editar`/`excluir`): a caixa
 * cresce pros 44 px de altura e o padding lateral entra, mas o `-mx-2`
 * devolve o deslocamento — **o texto continua começando exatamente no mesmo
 * x de antes**, então nada na tela se mexe de lugar.
 *
 * Sem margem vertical negativa de propósito: ela faria a área invadir a
 * linha de cima (no extrato, outra linha com seus próprios botões), e
 * sobrepor alvo a alvo é exatamente o defeito que estamos corrigindo, só
 * que invisível.
 */
export const ALVO_LINK = 'inline-flex min-h-11 items-center px-2 -mx-2'

/**
 * Igual ao `ALVO_LINK`, mas empurrado pra outra ponta da linha (`ml-auto`).
 *
 * ⚠️ **Existe porque tamanho sozinho não conserta o defeito de `apagar`.** O
 * problema medido não era só ele ter 40×16: era estar a **12 px** de
 * `editar`, o botão de uso rotineiro. Dois alvos pequenos e colados fazem do
 * erro o resultado esperado — e aqui errar apaga dinheiro. `ml-auto` troca
 * esses 12 px por todo o espaço que sobrar na linha.
 *
 * ⚠️ **Não dá pra `cn(ALVO_LINK, 'ml-auto')`, e isso foi MEDIDO por teste**
 * (`extrato.test.tsx`): `tailwind-merge` não considera `mx` e `ml` o mesmo
 * grupo nessa ordem, então as duas classes SOBREVIVEM e quem vence passa a
 * depender da ordem no CSS emitido, não do código. Invertendo a ordem,
 * `p-0` mata o `px-2` e a área de toque horizontal some. Por isso a variante
 * é explícita: `-mr-2` só do lado direito, `ml-auto` sem rival.
 */
export const ALVO_LINK_FIM =
  'ml-auto inline-flex min-h-11 items-center px-2 -mr-2'

/**
 * Só levanta a altura pros 44 px, sem tocar no eixo x. Dois usos:
 *
 * - **Linha inteira clicável** (`<label>` que embrulha um checkbox): o alvo
 *   real é o rótulo, não o quadradinho de 13,6×16 do `<input>`.
 * - **Botão pequeno numa faixa de ações** (`size="sm"`, com borda e fundo
 *   próprios — os `Editar`/`Pausar`/`Excluir` de `pages/regras.tsx`, MEDIDOS
 *   a 60×32 / 65,5×32 / 62,6×32 px em Chrome real a 390×844).
 *
 * ⚠️ **Num botão com borda, use ESTE e não `ALVO_LINK`.** O `-mx-2` de lá
 * existe pra devolver o deslocamento de um link de TEXTO; num botão que
 * desenha a própria caixa, ele puxaria a borda pra cima do vizinho —
 * trocaria alvo pequeno por alvos sobrepostos, que é o mesmo defeito com
 * outra cara. A separação horizontal fica por conta do `gap` do container.
 */
export const ALVO_LINHA = 'flex min-h-11 items-center'

/**
 * Item de menu (`dropdown-menu`): 44 px de altura **e** um respiro entre
 * itens. Os 9 itens do menu "Mais" mediam 32 px com **0 px de gap** — dois
 * destinos colados são um só alvo para um polegar.
 */
export const ALVO_ITEM_MENU = 'min-h-11 my-0.5'
