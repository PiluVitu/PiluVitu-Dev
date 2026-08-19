/**
 * Contraste WCAG 2.1 dos tokens de cor do design system.
 *
 * POR QUE ISTO EXISTE, e por que aqui: `src/styles.css` (mesmo diretório) é a
 * fonte ÚNICA dos tokens `--primary`/`--destructive`/`--success`/… para os DOIS
 * consumidores (`apps/web` e `apps/financas/web`). Mudar um valor ali muda a
 * cor dos dois apps de uma vez — e, antes desta função existir, nada no
 * repositório media a consequência: o tema claro chegou à produção com
 * `--primary` a 2,10:1 sobre `--card` (reprovando até o mínimo de 3:1 de
 * componente gráfico, quanto mais os 4,5:1 de texto), `--destructive` a 3,78:1
 * e `--success` a 3,06:1, alcançando todo link e todo `role="alert"` dos dois
 * apps sem que nenhuma suíte piscasse.
 *
 * Tudo aqui é PURO: recebe o texto do CSS (ou valores já parseados) e devolve
 * número. Quem lê o arquivo do disco é o teste colocado ao lado
 * (`contraste.test.ts`), que é o gate de verdade.
 *
 * Fórmulas: WCAG 2.1, §"relative luminance" e §"contrast ratio"
 * (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
 */

export type Hsl = { readonly h: number; readonly s: number; readonly l: number }
export type Rgb = { readonly r: number; readonly g: number; readonly b: number }

/** Mapa `nome-do-token` (sem os dois hífens) → valor cru, como está no CSS. */
export type MapaDeTokens = Readonly<Record<string, string>>

export type TokensPorTema = {
  readonly claro: MapaDeTokens
  readonly escuro: MapaDeTokens
}

/** Mínimo AA para texto normal (WCAG 2.1, 1.4.3). */
export const MINIMO_AA_TEXTO = 4.5

/** Mínimo AA para componente gráfico / de interface (WCAG 2.1, 1.4.11). */
export const MINIMO_AA_GRAFICO = 3

/**
 * Os tokens ficam no CSS no formato "canal HSL sem função" (`198 93% 26%`),
 * porque `@theme` os embrulha com `hsl(var(--x))` — é isso que permite
 * `bg-primary/90` (alpha) funcionar. Devolve `null` para qualquer coisa que
 * não seja esse formato (ex.: `--radius: 1.125rem`), nunca lança: o chamador
 * itera sobre o bloco inteiro, onde nem todo token é cor.
 */
export function parseHsl(valor: string): Hsl | null {
  const m = valor.trim().match(/^(-?[\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
  if (!m) return null

  const h = Number(m[1])
  const s = Number(m[2])
  const l = Number(m[3])
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) {
    return null
  }

  return { h, s, l }
}

export function hslParaRgb({ h, s, l }: Hsl): Rgb {
  const sat = s / 100
  const lig = l / 100
  const c = (1 - Math.abs(2 * lig - 1)) * sat
  const hh = ((h % 360) + 360) % 360
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = lig - c / 2

  let r = 0
  let g = 0
  let b = 0
  if (hh < 60) [r, g, b] = [c, x, 0]
  else if (hh < 120) [r, g, b] = [x, c, 0]
  else if (hh < 180) [r, g, b] = [0, c, x]
  else if (hh < 240) [r, g, b] = [0, x, c]
  else if (hh < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

/** Luminância relativa WCAG — NÃO é a média dos canais nem o `l` do HSL. */
export function luminanciaRelativa({ r, g, b }: Rgb): number {
  const canal = (v: number): number => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

/** Sempre ≥ 1 e simétrica: a ordem dos argumentos não muda o resultado. */
export function razaoDeContraste(a: Rgb, b: Rgb): number {
  const la = luminanciaRelativa(a)
  const lb = luminanciaRelativa(b)
  const claro = Math.max(la, lb)
  const escuro = Math.min(la, lb)

  return (claro + 0.05) / (escuro + 0.05)
}

/**
 * Razão entre dois TOKENS do mesmo tema. Lança se algum não existir ou não for
 * uma cor HSL — silenciar aqui faria o gate passar por vacuidade num token
 * renomeado, que é exatamente o cenário contra o qual ele existe.
 */
export function contrasteEntreTokens(
  tokens: MapaDeTokens,
  a: string,
  b: string,
): number {
  return razaoDeContraste(corDoToken(tokens, a), corDoToken(tokens, b))
}

export function corDoToken(tokens: MapaDeTokens, nome: string): Rgb {
  const bruto = tokens[nome]
  if (bruto === undefined) {
    throw new Error(`token --${nome} não existe neste tema`)
  }

  const hsl = parseHsl(bruto)
  if (hsl === null) {
    throw new Error(
      `token --${nome} não é uma cor HSL: ${JSON.stringify(bruto)}`,
    )
  }

  return hslParaRgb(hsl)
}

/**
 * Extrai os blocos `:root` (tema claro) e `.dark` (tema escuro) do CSS.
 *
 * ⚠️ Comentários são REMOVIDOS antes do parse, de propósito. As explicações
 * dentro do `:root` citam tokens por nome (`--primary 2,10:1`) e, sem essa
 * limpeza, uma linha de comentário poderia ser lida como declaração — um token
 * fantasma com valor inválido derrubaria o gate por motivo errado.
 */
export function lerTokensPorTema(css: string): TokensPorTema {
  const semComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')

  return {
    claro: declaracoesDoSeletor(semComentarios, ':root'),
    escuro: declaracoesDoSeletor(semComentarios, '.dark'),
  }
}

function declaracoesDoSeletor(css: string, seletor: string): MapaDeTokens {
  const corpo = corpoDoBloco(css, seletor)
  const out: Record<string, string> = {}

  for (const linha of corpo.split('\n')) {
    const m = linha.match(/^\s*--([a-z0-9-]+)\s*:\s*([^;]+);/)
    if (m) out[m[1]] = m[2].trim()
  }

  return out
}

/**
 * Contagem de chaves em vez de regex `{[^}]*}`: o `@theme` deste arquivo tem
 * `@keyframes` ANINHADO, então um `[^}]*` pararia na primeira chave interna e
 * devolveria meio bloco. Aqui o `:root`/`.dark` não aninham hoje, mas a regra
 * de parse não deve depender disso continuar verdade.
 */
function corpoDoBloco(css: string, seletor: string): string {
  const alvo = new RegExp(`(^|[\\s}])${escaparRegex(seletor)}\\s*\\{`, 'm')
  const achado = css.match(alvo)
  if (achado?.index === undefined) {
    throw new Error(`bloco ${seletor} não encontrado no CSS`)
  }

  const abre = css.indexOf('{', achado.index)
  let profundidade = 0
  for (let i = abre; i < css.length; i++) {
    if (css[i] === '{') profundidade++
    else if (css[i] === '}') {
      profundidade--
      if (profundidade === 0) return css.slice(abre + 1, i)
    }
  }

  throw new Error(`bloco ${seletor} não fecha`)
}

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
