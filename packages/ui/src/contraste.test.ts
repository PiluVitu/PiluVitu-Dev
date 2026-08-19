import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  MINIMO_AA_GRAFICO,
  MINIMO_AA_TEXTO,
  contrasteEntreTokens,
  corDoToken,
  hslParaRgb,
  lerTokensPorTema,
  luminanciaRelativa,
  parseHsl,
  razaoDeContraste,
  type MapaDeTokens,
} from './contraste'

/**
 * O GATE DE CONTRASTE. Lê `styles.css` — o arquivo de verdade, nunca uma
 * cópia dos valores — e falha se qualquer token de TEXTO cair abaixo de
 * 4,5:1 no tema em que é usado.
 *
 * Ele mora aqui, em `packages/ui`, e não num app, por três motivos medidos:
 *
 * 1. É onde o token VIVE. `apps/web` e `apps/financas/web` só consomem
 *    `@piluvitu/ui/styles.css`; um gate dentro de um app mediria a cor dos
 *    dois apps a partir de um deles, e o outro passaria a depender de um
 *    teste que não é dele. Mudar `--primary` muda os DOIS (medido: 56
 *    ocorrências de `text-primary`/`text-destructive` em `apps/web`, 72 no
 *    finanças) — a regra pertence à fonte única.
 * 2. `packages/ui` tem `test` declarado no `package.json` E um step dedicado
 *    em `ci.yml` (job `web` → "Test (ui package)"), com `--filter` explícito
 *    em vez de `pnpm -r test` justamente porque o recursivo pula em silêncio
 *    quem não declara o script. Ou seja: este gate roda no CI de PR de fato,
 *    não só na máquina de quem lembrar.
 * 3. Colocation é lei do projeto: `styles.css` e `contraste.test.ts` no mesmo
 *    diretório.
 *
 * CSS não roda em jsdom (nenhuma cascata, nenhum `getComputedStyle` útil) —
 * por isso o teste lê o arquivo como TEXTO, mesmo padrão de
 * `apps/financas/web/src/styles.test.ts`.
 */

const CSS = readFileSync(join(__dirname, 'styles.css'), 'utf8')

const TEMAS = lerTokensPorTema(CSS)

/**
 * Tokens usados como COR DE TEXTO sobre uma superfície neutra
 * (`text-primary` num link, `text-destructive` num `role="alert"`,
 * `text-muted-foreground` num rótulo). São os que precisam dos 4,5:1.
 *
 * `--border`/`--input`/`--ring` ficam de fora de propósito: não são texto.
 * `--ring` tem checagem própria mais abaixo, contra o mínimo de 3:1.
 */
const TOKENS_DE_TEXTO = [
  'foreground',
  'muted-foreground',
  'primary',
  'destructive',
  'success',
  'ok',
  'warn',
  'win',
] as const

/** As duas superfícies em que esse texto de fato aparece. */
const SUPERFICIES = ['card', 'background'] as const

const CADA_TEMA = [
  ['claro (:root)', TEMAS.claro],
  ['escuro (.dark)', TEMAS.escuro],
] as const

/** Pares `--x-foreground` sobre `--x` — descobertos, nunca listados à mão. */
function paresDeSuperficie(tokens: MapaDeTokens): [string, string][] {
  return Object.keys(tokens)
    .filter((nome) => nome.endsWith('-foreground'))
    .map((nome): [string, string] => [nome, nome.replace(/-foreground$/, '')])
    .filter(([, base]) => tokens[base] !== undefined)
}

describe('contraste — as fórmulas WCAG', () => {
  it('branco contra preto é 21:1 e uma cor contra si mesma é 1:1', () => {
    const branco = hslParaRgb({ h: 0, s: 0, l: 100 })
    const preto = hslParaRgb({ h: 0, s: 0, l: 0 })

    expect(razaoDeContraste(branco, preto)).toBeCloseTo(21, 5)
    expect(razaoDeContraste(preto, branco)).toBeCloseTo(21, 5)
    expect(razaoDeContraste(branco, branco)).toBeCloseTo(1, 5)
  })

  it('luminância NÃO é o `l` do HSL — amarelo e azul com o mesmo `l` diferem', () => {
    const amarelo = luminanciaRelativa(hslParaRgb({ h: 60, s: 100, l: 50 }))
    const azul = luminanciaRelativa(hslParaRgb({ h: 240, s: 100, l: 50 }))

    // Se alguém "simplificar" luminanciaRelativa para `l / 100`, os dois viram
    // 0.5 e esta asserção morre — que é o ponto: a média dos canais (ou o `l`)
    // dá contraste errado por um fator grande no amarelo/azul.
    expect(amarelo).toBeCloseTo(0.9278, 3)
    expect(azul).toBeCloseTo(0.0722, 3)
  })

  it('converte HSL para RGB nos vértices conhecidos', () => {
    expect(hslParaRgb({ h: 0, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 0 })
    expect(hslParaRgb({ h: 120, s: 100, l: 50 })).toEqual({
      r: 0,
      g: 255,
      b: 0,
    })
    expect(hslParaRgb({ h: 240, s: 100, l: 50 })).toEqual({
      r: 0,
      g: 0,
      b: 255,
    })
  })

  it('parseHsl aceita o formato dos tokens e recusa o que não é cor', () => {
    expect(parseHsl('198 93% 26%')).toEqual({ h: 198, s: 93, l: 26 })
    expect(parseHsl('  0 0% 100%  ')).toEqual({ h: 0, s: 0, l: 100 })
    // `--radius: 1.125rem` mora no mesmo bloco e não é cor.
    expect(parseHsl('1.125rem')).toBeNull()
    expect(parseHsl('hsl(198 93% 26%)')).toBeNull()
  })
})

describe('contraste — o parser não pode passar por vacuidade', () => {
  it('acha os dois temas com os tokens conhecidos', () => {
    // Sem estas âncoras, um parser que devolvesse `{}` faria TODO o gate
    // abaixo passar sem medir nada (os `for` iterariam sobre lista vazia).
    expect(Object.keys(TEMAS.claro).length).toBeGreaterThanOrEqual(30)
    expect(Object.keys(TEMAS.escuro).length).toBeGreaterThanOrEqual(30)

    for (const [, tokens] of CADA_TEMA) {
      for (const nome of [...TOKENS_DE_TEXTO, ...SUPERFICIES, 'ring']) {
        expect(parseHsl(tokens[nome] ?? '')).not.toBeNull()
      }
    }
  })

  it('ignora declaração que mora dentro de comentário', () => {
    // Os comentários do `:root` citam tokens por nome ao explicar as medições
    // ("antes: --primary 2,10:1"). Um deles escrito com dois-pontos — que é
    // como se documenta um valor ANTIGO — seria lido como declaração e
    // sobrescreveria o valor real, fazendo o gate medir a cor errada.
    // Fixture sintética de propósito: o `styles.css` de hoje não tem esse
    // formato, e é justamente por isso que o arquivo real não prova nada aqui.
    const { claro } = lerTokensPorTema(`
      @layer base {
        :root {
          --primary: 198 93% 26%;
          /* antes desta correção:
             --primary: 198 93% 60%;
             --so-existe-no-comentario: 1 2% 3%; */
        }
        .dark {
          --primary: 198 93% 60%;
        }
      }
    `)

    expect(claro['primary']).toBe('198 93% 26%')
    expect(claro['so-existe-no-comentario']).toBeUndefined()
    expect(Object.keys(claro)).toEqual(['primary'])
  })

  it('descobre os pares foreground/superfície nos dois temas', () => {
    for (const [nome, tokens] of CADA_TEMA) {
      expect(`${nome}: ${paresDeSuperficie(tokens).length}`).toBe(`${nome}: 11`)
    }
  })
})

describe.each(CADA_TEMA)(
  'contraste — tema %s: todo token de texto passa em AA (4,5:1)',
  (_nome, tokens) => {
    for (const token of TOKENS_DE_TEXTO) {
      for (const superficie of SUPERFICIES) {
        it(`--${token} sobre --${superficie}`, () => {
          const razao = contrasteEntreTokens(tokens, token, superficie)

          expect({
            token,
            superficie,
            razao: Number(razao.toFixed(2)),
            passa: razao >= MINIMO_AA_TEXTO,
          }).toEqual({
            token,
            superficie,
            razao: Number(razao.toFixed(2)),
            passa: true,
          })
        })
      }
    }
  },
)

describe.each(CADA_TEMA)(
  'contraste — tema %s: todo par --x-foreground sobre --x passa em AA',
  (_nome, tokens) => {
    // É o texto DENTRO de um bloco de cor: `bg-primary text-primary-foreground`
    // (Button default, pílula ativa do nav), `bg-destructive
    // text-destructive-foreground`. Antes desta correção, branco sobre o
    // `--destructive` claro dava 3,78:1 — o botão de ação destrutiva reprovava
    // AA e ninguém media.
    for (const [frente, fundo] of paresDeSuperficie(tokens)) {
      it(`--${frente} sobre --${fundo}`, () => {
        const razao = contrasteEntreTokens(tokens, frente, fundo)

        expect({
          par: `${frente}/${fundo}`,
          passa: razao >= MINIMO_AA_TEXTO,
        }).toEqual({ par: `${frente}/${fundo}`, passa: true })
      })
    }
  },
)

describe.each(CADA_TEMA)(
  'contraste — tema %s: além do texto',
  (_nome, tokens) => {
    it('--ring passa o mínimo de componente de interface (3:1) sobre --background', () => {
      const razao = contrasteEntreTokens(tokens, 'ring', 'background')

      expect(razao).toBeGreaterThanOrEqual(MINIMO_AA_GRAFICO)
    })

    it('--primary e --destructive continuam distinguíveis ENTRE SI', () => {
      // Os dois carregam significados opostos (ação × risco) e aparecem lado a
      // lado (barras do gráfico de Comprometido, botão de ação × botão de
      // excluir). Escurecer os dois para caberem no fundo claro aproxima as
      // luminâncias — este piso é o que impede a aproximação virar colapso.
      // Medido hoje: claro 1,48 · escuro 1,31 (antes da correção: 1,80 e 1,31).
      // ⚠️ Continua NÃO sendo suficiente sozinho: onde o risco é sinalizado,
      // o app usa canal não-cromático (tracejado + `%` escrito) — ver
      // `GraficoComprometido.tsx`.
      expect(tokens['primary']).not.toBe(tokens['destructive'])
      expect(
        contrasteEntreTokens(tokens, 'primary', 'destructive'),
      ).toBeGreaterThan(1.2)
    })

    it('--ok continua sendo alias exato de --success', () => {
      // O comentário do `@theme` promete isso ("--success é mantido como alias
      // de --ok"). Corrigir o contraste de um e esquecer o outro deixaria a
      // mesma cor semântica com dois valores.
      expect(tokens['ok']).toBe(tokens['success'])
      expect(tokens['ok-foreground']).toBe(tokens['success-foreground'])
    })
  },
)

describe('contraste — o tema escuro mantém a FOLGA que já tinha', () => {
  // A correção mexeu só no `:root`, porque o `.dark` já passava com sobra
  // (mínimo medido: 6,68:1). O piso aqui é bem acima dos 4,5 do gate de
  // propósito: é ele que transforma "não regrida o tema que está certo" numa
  // asserção, sem PINAR valor (pinar convidaria a editar o teste junto com a
  // paleta, que é como um gate deixa de ser gate).
  const FOLGA_MINIMA_ESCURO = 6

  for (const token of TOKENS_DE_TEXTO) {
    it(`--${token} do .dark segue acima de ${FOLGA_MINIMA_ESCURO}:1 sobre --card`, () => {
      expect(
        contrasteEntreTokens(TEMAS.escuro, token, 'card'),
      ).toBeGreaterThanOrEqual(FOLGA_MINIMA_ESCURO)
    })
  }
})

describe('contraste — corDoToken falha alto', () => {
  it('lança para token inexistente e para valor que não é cor', () => {
    expect(() => corDoToken(TEMAS.claro, 'nao-existe')).toThrow(/não existe/)
    expect(() => corDoToken(TEMAS.claro, 'radius')).toThrow(/não é uma cor/)
  })
})
