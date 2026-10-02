# Botaí: landing própria em `botai.pilutech.com.br` (`apps/botai-site`) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um app Next 16 só da landing do Botaí (`/` e `/privacidade`), fiel ao design do Claude Design, estático, com SEO completo, servido por um projeto Vercel próprio em `https://botai.pilutech.com.br`; o `apps/web` deixa de servir o Botaí e passa a redirecionar para lá.

**Architecture:** `apps/botai-site` (`@pilutech/botai-site`) é um Next 16 App Router com Tailwind 4 e `@piluvitu/ui`, todas as rotas estáticas. No build ele lê as URLs das lojas do mesmo YAML do CMS do `apps/web` (`apps/web/content/pilulabs/botai/index.yaml`) e decide botões e fase com regras puras que saem do `apps/web/lib` para `@piluvitu/tools/pilulabs`, compartilhadas pelos dois apps (e, se der, pelo `wxt.config.ts` da extensão). Ilhas de cliente só para o tema, o atalho de quem visita e as abas das capturas. O `apps/web` ganha 308 nos caminhos antigos, e o `make capturas-botai` passa a copiar as imagens para o app novo.

**Tech Stack:** Next.js 16.3.8 (App Router, `next/font`, `next/image`, metadata files), React 19.2, TypeScript 5.9 strict, Tailwind CSS 4 + `@tailwindcss/typography`, `@piluvitu/ui`, `next-themes` 0.4.6, Font Awesome 7 (npm), `yaml` 2.9, Jest 30 + ts-jest + Testing Library, Storybook 10.3.1 (`@storybook/nextjs`), Playwright 1.59.1, `axe-core` 4.11.1, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-02-botai-landing-design.md` (leia inteira antes de qualquer tarefa). Fonte visual: `docs/superpowers/design/2026-10-02-botai-landing/Botai Landing.dc.html`, com `desktop-escuro.png` e `mobile-escuro.png` ao lado.

## Global Constraints

- **Branch e escopo:** trabalhe na `feat/botai-landing` já em checkout. Nunca troque de branch, nunca dê push, nunca toque outros worktrees (`.worktrees/`) nem `/Users/piluvitu/PILUTECH/Sombrai`.
- **Wrapper `rtk`:** o shell reescreve `git`, `grep`, `diff`, `find`, `ls`, `prettier`, `jest`, `vitest` e `gh` e **falsifica a saída**. Use `/usr/bin/git`, `/usr/bin/grep`, `/usr/bin/find`, `/bin/ls`, `/opt/homebrew/bin/gh` e os binários de `node_modules/.bin` (`./node_modules/.bin/jest` etc.), sempre terminando o comando com `; echo "exit=$?"`, e julgue pelo exit code.
- **Pasta e pacote:** `apps/botai-site`, pacote `@pilutech/botai-site` (grafia técnica `botai`, regra do `apps/botai/CLAUDE.md`). Em todo texto visível: "Botaí", com acento.
- **Stack:** "Next 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4 e `@piluvitu/ui`. Os tokens e o `Button` vêm do pacote, com `@source` para `packages/ui/src`. O `build` roda o gate `scripts/check-tailwind-source.mjs`."
- **Fontes e ícones:** "Plus Jakarta Sans e JetBrains Mono por `next/font`, como o `apps/web`. Font Awesome pelos pacotes npm, sem CDN."
- **Rotas:** "todas, sem `revalidate`. O build confere isso como o `apps/web` confere as rotas PiluLabs. O dev roda na porta 3020." Storybook na **6019**. E2E do `apps/web` na **3333**.
- **Portas livres antes de E2E:** confira com `lsof -nP -iTCP:<porta> -sTCP:LISTEN`. Se houver processo que você não subiu, **não mate**: pare e reporte. Rode Playwright com `CI=1` (sobe o próprio servidor e falha se a porta estiver ocupada).
- **Dependências (pnpm 11):** `minimumReleaseAge: 1440` e `allowBuilds` (ver `CLAUDE.md` raiz). Depois de mexer em dependência: `pnpm dedupe --check` e a trava do CodeMirror (`cd apps/web && ./node_modules/.bin/jest components/admin/posts/mdx-editor.codemirror.test.ts`). O diff do `pnpm-lock.yaml` pode acrescentar o importer `apps/botai-site` e snapshots novos de versões que já estão em `packages:` (o mesmo pacote com outro conjunto de peers); versão nova em `packages:` é defeito do plano (fixe no `package.json` a versão que o lock já tem).
- **Lei de comentários (CLAUDE.md raiz):** comentário em produção só com as três condições (porquê invisível, a ausência levaria a "consertar" e quebrar, não cabe em nome/teste/doc), 1 a 3 linhas. Teste é livre para explicar.
- **Colocation:** teste e story ao lado do fonte; E2E `.e2e.ts` ao lado da rota que testa.
- **Sentinela do gate:** nunca escreva o nome da classe sentinela por extenso em `apps/*` (nem em `.md`); cite `SENTINEL_SELECTOR` do script.
- **`next dev` reescreve `CLAUDE.md`/`AGENTS.md`:** quando detecta agente, ele anexa um bloco de regras (`nextjs-agent-rules`) no `CLAUDE.md` do app ou cria um `AGENTS.md`. Depois de rodar `next dev`, confira `/usr/bin/git status` e descarte o que ele gerou antes de commitar.
- **SEO, da spec:** `title` com até 60 caracteres; `description` de 140–160; "texto honesto: nada de 'disponível' antes das lojas"; "Sem `aggregateRating` (o Google proíbe copiar nota das lojas), sem `FAQPage` (rich result restrito a sites de governo e saúde desde 2023) e sem `HowTo` (descontinuado)"; o JSON-LD troca `<` por `<` antes de entrar no `<script>`, como o `serializarJsonLd` do `apps/web`.
- **Fora (spec §10):** inglês e `hreflang`; blog ou páginas extras; analytics (nada de `@vercel/analytics`/`speed-insights` neste app).
- **`$SCRATCH`:** onde um passo usa `$SCRATCH`, é a pasta de rascunho da sessão (a que o sistema indica). Cada chamada do Bash é um shell novo: declare `SCRATCH=<caminho>` no mesmo comando que a usa.
- **Commits:** mensagens no padrão do repo (`tipo(escopo): descrição em pt-BR`), um por tarefa, cada um com tsc, testes e build verdes. O hook de pre-commit roda o `lint-staged` (pode reformatar arquivos; confira `git status` depois).

## Review Focus

1. **URL de loja errada no CMS** (o dono cola o link de outra loja, ou `http:`, pelo `/admin/pilulabs`): o botão fica "Em breve", sem link; o selo e a nota não dizem que saiu; o JSON-LD não lista `installUrl`. Testes: `lib/modelo.test.ts` (Tarefa 3), `lib/json-ld.test.ts` (Tarefa 8) e, no build de produção com um YAML de teste, `app/lojas-publicadas.e2e.ts` (Tarefas 6 e 8).
2. **Tema escolhido diferente do sistema:** as capturas seguem a classe `.dark` do `<html>` (a escolha), não o `prefers-color-scheme`; só a variante visível é baixada; a escolha sobrevive ao reload. Testes: `components/imagem-por-tema.test.tsx` (Tarefa 5) e `app/pagina.e2e.ts` (Tarefa 6).
3. **Celular estreito (320 px):** topo com âncoras e botão de tema, 4 botões de loja com "Em breve" (cada um dentro da lista, não só sem rolagem da página), tabela de atalhos rolando numa região focável e a política com URL longa quebram linha sem rolagem horizontal. Testes: `app/pagina.e2e.ts` (Tarefa 6), `app/privacidade/privacidade.e2e.ts` (Tarefa 7) e o axe a 320 px do `app/seo.e2e.ts` (Tarefa 8).
4. **Build de preview ou local sem `SITE_URL`** (ou com valor sem esquema): canonical, `og:url`, JSON-LD, sitemap e robots ficam no domínio de produção, nunca num `*.vercel.app`. Testes: `lib/site.test.ts` e `app/seo.e2e.ts` (Tarefa 8).
5. **Links antigos com query** (`/pilulabs/botai?utm_source=loja`, a política colada nas lojas): 308 para o host novo, mantendo a query. Teste: `apps/web/app/(site)/pilulabs/pilulabs.e2e.ts` (Tarefa 9).

---

## Mapa de arquivos

**Novos (`packages/tools`):** `src/pilulabs.ts` (+ `.test.ts`).

**Novos (`apps/botai-site`):**

```
package.json  tsconfig.json  next.config.mjs  postcss.config.mjs  eslint.config.mjs
jest.config.ts  jest.setup.ts  playwright.config.ts  playwright.lojas.config.ts  vercel.json  vercel.test.ts
.env.example  CLAUDE.md
.storybook/main.ts  .storybook/preview.tsx
scripts/conferir-rotas-estaticas.mjs (+ .test.mjs)
app/globals.css  app/layout.tsx  app/page.tsx  app/pagina.e2e.ts  app/seo.e2e.ts
app/lojas-publicadas.e2e.ts  app/lojas-publicadas.yaml
app/opengraph-image.tsx  app/twitter-image.tsx  app/icon.png  app/apple-icon.png
app/sitemap.ts  app/robots.ts  app/manifest.ts (+ .test.ts de cada um)
app/privacidade/page.tsx (+ page.test.tsx)  app/privacidade/privacidade.e2e.ts
app/privacidade/opengraph-image.tsx  app/privacidade/twitter-image.tsx
lib/conteudo.ts  lib/cms.ts  lib/modelo.ts  lib/visitante.ts  lib/capturas.ts
lib/font-awesome.ts  lib/site.ts  lib/seo.ts  lib/json-ld.ts  lib/imagem-og.tsx  (+ .test.ts)
components/cabecalho-secao  tema-provider  botao-tema  selo-fase  lojas-ui  botoes-loja
components/atalho-local  tabela-atalhos  imagem-por-tema  capturas-abas  topo  rodape
components/landing  json-ld   (cada .tsx visual com .test.tsx e .stories.tsx)
public/icone-128.png  public/capturas/0{1..6}-*.png
```

**Alterados:** `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`, `Makefile`, `.github/workflows/ci.yml`, `CLAUDE.md` (raiz), `packages/tools/package.json`, `packages/tools/CLAUDE.md`, `packages/ui/CLAUDE.md`, `apps/web/**` (Tarefas 1 e 9), `apps/botai/{wxt.config.ts,loja/pecas.ts,loja/pecas.test.ts,loja/imagens.test.ts,loja/capturas.captura.ts,loja/README.md,README.md,CLAUDE.md}`.

**Removidos:** `apps/web/lib/pilulabs-regras.ts` (+ teste), `apps/web/app/(site)/pilulabs/botai/**`, `apps/web/components/pilulabs/{atalhos-tabela,botoes-loja,capturas-galeria}.*` (Tarefa 9), `apps/web/public/pilulabs/botai/capturas/` (Tarefa 10, depois de o `apps/botai` parar de conferi-las).

---

### Tarefa 1: Regras puras do PiluLabs em `@piluvitu/tools/pilulabs`

Move para o pacote as regras sem `node:fs` que os dois apps usam: tudo o que hoje está em `apps/web/lib/pilulabs-regras.ts` (`Loja`, `LOJAS`, `ehUrlDaLoja`, `ehHttps`, `TipoItem`, `TIPOS`, `TIPO_PADRAO`, `ehDataValida`) mais `lojasPublicadas`, `fase` e `ATALHOS` de `apps/web/lib/pilulabs.ts`. Mover o arquivo de regras inteiro evita duas cópias do `urlOuNulo`. `ATALHOS` passa a ser derivado das teclas do manifesto (`TECLAS_DO_MANIFESTO`), para o `wxt.config.ts` poder importar a mesma fonte na Tarefa 10. Nenhum comportamento muda no `apps/web`.

**Files:**

- Create: `packages/tools/src/pilulabs.ts`, `packages/tools/src/pilulabs.test.ts`
- Modify: `packages/tools/package.json` (exports), `packages/tools/CLAUDE.md`
- Modify (`apps/web`): `lib/pilulabs.ts`, `lib/pilulabs.test.ts`, `lib/pilulabs-conteudo.ts`, `lib/pilulabs-json-ld.ts`, `lib/admin/content-schemas.ts`, `components/admin/content/pilulabs-form.tsx`, `components/pilulabs/{lojas-ui.ts,atalhos-tabela.tsx,atalhos-tabela.test.tsx,botoes-loja.tsx,produto-card.tsx,status-produto.tsx,vitrine.tsx,vitrine.test.tsx}`, `app/(site)/pilulabs/page.tsx`, `app/(site)/pilulabs/botai/page.tsx`, `app/(site)/pilulabs/pilulabs.e2e.ts`, `CLAUDE.md`
- Delete: `apps/web/lib/pilulabs-regras.ts`, `apps/web/lib/pilulabs-regras.test.ts`

**Interfaces:**

- Consumes: nada.
- Produces (`@piluvitu/tools/pilulabs`, exatamente estes nomes):
  - `type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'`
  - `type TipoItem = 'extensao' | 'mobile' | 'web' | 'cli'`
  - `type Fase = 'em-breve' | 'disponivel'`
  - `type Sistema = 'windows' | 'mac' | 'linux'`
  - `type UrlsDasLojas = { chromeUrl: string; firefoxUrl: string; edgeUrl: string; operaUrl: string }`
  - `type LojaPublicada = { loja: Loja; url: string }`
  - `type TeclasSugeridas = { default: string; mac: string; linux?: string }`
  - `const LOJAS: readonly Loja[]` (`['chrome', 'firefox', 'edge', 'opera']`)
  - `const TIPOS: readonly ['extensao', 'mobile', 'web', 'cli']`, `const TIPO_PADRAO: TipoItem` (`'web'`)
  - `function ehHttps(valor: string): boolean`, `function ehUrlDaLoja(loja: Loja, valor: string): boolean`, `function ehDataValida(valor: string): boolean`
  - `function lojasPublicadas(urls: UrlsDasLojas): LojaPublicada[]`, `function fase(urls: UrlsDasLojas): Fase`
  - `const TECLAS_DO_MANIFESTO: { readonly chromium: TeclasSugeridas; readonly firefox: TeclasSugeridas }`
  - `function teclaNoMac(tecla: string): string`
  - `const ATALHOS: Record<Loja, Record<Sistema, string>>`

- [ ] **Step 1: Escreva o teste do módulo novo (falha: o módulo não existe)**

Crie `packages/tools/src/pilulabs.test.ts` (os casos de `apps/web/lib/pilulabs-regras.test.ts` e de `lojasPublicadas`/`fase`/`ATALHOS` de `apps/web/lib/pilulabs.test.ts`, mais os novos de `TECLAS_DO_MANIFESTO` e `teclaNoMac`):

```ts
import {
  ATALHOS,
  ehDataValida,
  ehHttps,
  ehUrlDaLoja,
  fase,
  LOJAS,
  lojasPublicadas,
  TECLAS_DO_MANIFESTO,
  teclaNoMac,
  TIPO_PADRAO,
  TIPOS,
} from './pilulabs'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }

const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'
const URL_FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'
const URL_EDGE = 'https://microsoftedge.microsoft.com/addons/detail/botai/xyz'
const URL_OPERA = 'https://addons.opera.com/pt-br/extensions/details/botai/'

describe('LOJAS e TIPOS', () => {
  it('as lojas em ordem fixa: chrome, firefox, edge, opera', () => {
    expect(LOJAS).toEqual(['chrome', 'firefox', 'edge', 'opera'])
  })

  // A vitrine agrupa nessa ordem: Extensões, Apps mobile, Apps web, CLIs.
  it('os tipos em ordem: extensao, mobile, web, cli', () => {
    expect(TIPOS).toEqual(['extensao', 'mobile', 'web', 'cli'])
  })

  // Sem status nem loja: o padrão mais neutro para um tipo ausente.
  it('o tipo padrão é web', () => {
    expect(TIPO_PADRAO).toBe('web')
  })
})

describe('ehUrlDaLoja', () => {
  it('aceita a URL https no host exato da loja, com espaços em volta', () => {
    expect(ehUrlDaLoja('chrome', ` ${URL_CHROME} `)).toBe(true)
    expect(ehUrlDaLoja('opera', URL_OPERA)).toBe(true)
  })

  it.each([
    [
      'http em vez de https',
      'http://chromewebstore.google.com/detail/botai/abc',
    ],
    [
      'host com sufixo',
      'https://chromewebstore.google.com.evil.io/detail/botai/abc',
    ],
    ['subdomínio', 'https://www.chromewebstore.google.com/detail/botai/abc'],
    ['host de outra loja', URL_FIREFOX],
    ['sem esquema', 'chromewebstore.google.com/detail/botai/abc'],
    ['javascript:', 'javascript:alert(1)'],
    ['vazio', ''],
  ])('recusa na Chrome Web Store: %s', (_caso, url) => {
    expect(ehUrlDaLoja('chrome', url)).toBe(false)
  })
})

describe('ehHttps', () => {
  it('aceita https e recusa o resto', () => {
    expect(ehHttps('https://sombrai.pilutech.com.br')).toBe(true)
    expect(ehHttps(' https://sombrai.pilutech.com.br ')).toBe(true)
    expect(ehHttps('http://sombrai.pilutech.com.br')).toBe(false)
    expect(ehHttps('javascript:alert(1)')).toBe(false)
    expect(ehHttps('sombrai.pilutech.com.br')).toBe(false)
    expect(ehHttps('')).toBe(false)
  })
})

describe('ehDataValida', () => {
  it('aceita AAAA-MM-DD de um dia que existe', () => {
    expect(ehDataValida('2026-10-01')).toBe(true)
    expect(ehDataValida('2024-02-29')).toBe(true)
  })

  it.each([
    '',
    '2026-13-01',
    '2026-02-30',
    '2025-02-29',
    '01/10/2026',
    '2026-1-1',
    '2026-10-01T00:00',
  ])('recusa %p', (valor) => {
    expect(ehDataValida(valor)).toBe(false)
  })
})

describe('lojasPublicadas', () => {
  it('sem URL nenhuma, nenhuma loja', () => {
    expect(lojasPublicadas(SEM_LOJA)).toEqual([])
  })

  it('aceita cada loja no host dela, na ordem fixa, seja qual for a ordem do YAML', () => {
    expect(
      lojasPublicadas({
        operaUrl: URL_OPERA,
        edgeUrl: URL_EDGE,
        firefoxUrl: URL_FIREFOX,
        chromeUrl: URL_CHROME,
      }),
    ).toEqual([
      { loja: 'chrome', url: URL_CHROME },
      { loja: 'firefox', url: URL_FIREFOX },
      { loja: 'edge', url: URL_EDGE },
      { loja: 'opera', url: URL_OPERA },
    ])
  })

  // As aprovações chegam em datas diferentes (o Opera pode levar meses).
  it('publica loja por loja', () => {
    expect(lojasPublicadas({ ...SEM_LOJA, firefoxUrl: URL_FIREFOX })).toEqual([
      { loja: 'firefox', url: URL_FIREFOX },
    ])
  })

  it('apara espaços antes de validar', () => {
    expect(
      lojasPublicadas({ ...SEM_LOJA, chromeUrl: `  ${URL_CHROME}\n` }),
    ).toEqual([{ loja: 'chrome', url: URL_CHROME }])
  })

  it.each([
    [
      'http em vez de https',
      'http://chromewebstore.google.com/detail/botai/abc',
    ],
    [
      'host com sufixo',
      'https://chromewebstore.google.com.evil.io/detail/botai/abc',
    ],
    ['subdomínio', 'https://www.chromewebstore.google.com/detail/botai/abc'],
    ['host de outra loja', URL_FIREFOX],
    ['sem esquema', 'chromewebstore.google.com/detail/botai/abc'],
    ['javascript:', 'javascript:alert(1)'],
  ])('recusa na Chrome Web Store: %s', (_caso, url) => {
    expect(lojasPublicadas({ ...SEM_LOJA, chromeUrl: url })).toEqual([])
  })
})

describe('fase', () => {
  it('em-breve sem loja publicada', () => {
    expect(fase(SEM_LOJA)).toBe('em-breve')
  })

  it('disponivel com uma loja publicada', () => {
    expect(fase({ ...SEM_LOJA, edgeUrl: URL_EDGE })).toBe('disponivel')
  })

  it('URL de host errado não conta como publicada', () => {
    expect(fase({ ...SEM_LOJA, chromeUrl: 'https://example.com/botai' })).toBe(
      'em-breve',
    )
  })
})

// É o suggested_key do manifesto do Botaí (apps/botai/wxt.config.ts).
describe('TECLAS_DO_MANIFESTO', () => {
  it('Chromium: Ctrl+Shift+Y por padrão e Alt+Shift+P no Mac', () => {
    expect(TECLAS_DO_MANIFESTO.chromium).toEqual({
      default: 'Ctrl+Shift+Y',
      mac: 'Alt+Shift+P',
    })
  })

  // No Firefox para Linux, Ctrl+Shift+Y abre os Downloads e não é cedido.
  it('Firefox: igual, mais Alt+Shift+P no Linux', () => {
    expect(TECLAS_DO_MANIFESTO.firefox).toEqual({
      default: 'Ctrl+Shift+Y',
      mac: 'Alt+Shift+P',
      linux: 'Alt+Shift+P',
    })
  })
})

describe('teclaNoMac', () => {
  it('troca os modificadores pelos símbolos do macOS, na ordem do manifesto', () => {
    expect(teclaNoMac('Alt+Shift+P')).toBe('⌥⇧P')
  })

  // No Mac o Chrome lê o Ctrl do suggested_key como Command; o Control é MacCtrl.
  it('Ctrl vira ⌘ e MacCtrl vira ⌃', () => {
    expect(teclaNoMac('Ctrl+Shift+Y')).toBe('⌘⇧Y')
    expect(teclaNoMac('MacCtrl+Shift+Y')).toBe('⌃⇧Y')
  })
})

describe('ATALHOS', () => {
  it('Chromium: Ctrl+Shift+Y no Windows e no Linux, ⌥⇧P no Mac', () => {
    for (const navegador of ['chrome', 'edge', 'opera'] as const) {
      expect(ATALHOS[navegador]).toEqual({
        windows: 'Ctrl+Shift+Y',
        mac: '⌥⇧P',
        linux: 'Ctrl+Shift+Y',
      })
    }
  })

  it('Firefox: igual, mas Alt+Shift+P no Linux', () => {
    expect(ATALHOS.firefox).toEqual({
      windows: 'Ctrl+Shift+Y',
      mac: '⌥⇧P',
      linux: 'Alt+Shift+P',
    })
  })

  it('cobre as 4 lojas', () => {
    expect(Object.keys(ATALHOS).sort()).toEqual([...LOJAS].sort())
  })
})
```

- [ ] **Step 2: Rode e confirme a falha**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/pilulabs.test.ts; echo "exit=$?"`
Expected: FAIL com `Cannot find module './pilulabs'`, `exit=1`.

- [ ] **Step 3: Crie o módulo e o subpath**

`packages/tools/src/pilulabs.ts`:

```ts
export type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'
export type TipoItem = 'extensao' | 'mobile' | 'web' | 'cli'
export type Fase = 'em-breve' | 'disponivel'
export type Sistema = 'windows' | 'mac' | 'linux'
export type UrlsDasLojas = {
  chromeUrl: string
  firefoxUrl: string
  edgeUrl: string
  operaUrl: string
}
export type LojaPublicada = { loja: Loja; url: string }
export type TeclasSugeridas = { default: string; mac: string; linux?: string }

export const LOJAS: readonly Loja[] = ['chrome', 'firefox', 'edge', 'opera']
export const TIPOS = [
  'extensao',
  'mobile',
  'web',
  'cli',
] as const satisfies readonly TipoItem[]
export const TIPO_PADRAO: TipoItem = 'web'

const HOST_DA_LOJA: Record<Loja, string> = {
  chrome: 'chromewebstore.google.com',
  firefox: 'addons.mozilla.org',
  edge: 'microsoftedge.microsoft.com',
  opera: 'addons.opera.com',
}

const CAMPO_DA_LOJA = {
  chrome: 'chromeUrl',
  firefox: 'firefoxUrl',
  edge: 'edgeUrl',
  opera: 'operaUrl',
} as const satisfies Record<Loja, keyof UrlsDasLojas>

const DATA = /^\d{4}-\d{2}-\d{2}$/

function urlOuNulo(valor: string): URL | null {
  try {
    return new URL(valor)
  } catch {
    return null
  }
}

export function ehHttps(valor: string): boolean {
  return urlOuNulo(valor.trim())?.protocol === 'https:'
}

export function ehUrlDaLoja(loja: Loja, valor: string): boolean {
  const url = urlOuNulo(valor.trim())
  return url?.protocol === 'https:' && url.hostname === HOST_DA_LOJA[loja]
}

export function ehDataValida(valor: string): boolean {
  if (!DATA.test(valor)) return false
  const data = new Date(`${valor}T00:00:00Z`)
  return (
    !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor
  )
}

export function lojasPublicadas(urls: UrlsDasLojas): LojaPublicada[] {
  return LOJAS.flatMap((loja) => {
    const url = urls[CAMPO_DA_LOJA[loja]].trim()
    return ehUrlDaLoja(loja, url) ? [{ loja, url }] : []
  })
}

export function fase(urls: UrlsDasLojas): Fase {
  return lojasPublicadas(urls).length > 0 ? 'disponivel' : 'em-breve'
}

// No Windows e no Linux o Chrome reserva Alt+Shift+P ("criar novo grupo de abas") e não o cede à extensão.
const TECLAS_CHROMIUM: TeclasSugeridas = {
  default: 'Ctrl+Shift+Y',
  mac: 'Alt+Shift+P',
}
// No Linux o Firefox usa Ctrl+Shift+Y para os Downloads e também não cede a tecla.
const TECLAS_FIREFOX: TeclasSugeridas = {
  ...TECLAS_CHROMIUM,
  linux: 'Alt+Shift+P',
}

export const TECLAS_DO_MANIFESTO = {
  chromium: TECLAS_CHROMIUM,
  firefox: TECLAS_FIREFOX,
} as const

// No Mac o Chrome lê o Ctrl do suggested_key como Command; o Control é MacCtrl.
const SIMBOLO_NO_MAC: ReadonlyMap<string, string> = new Map([
  ['Alt', '⌥'],
  ['Shift', '⇧'],
  ['Ctrl', '⌘'],
  ['Command', '⌘'],
  ['MacCtrl', '⌃'],
])

export function teclaNoMac(tecla: string): string {
  return tecla
    .split('+')
    .map((parte) => SIMBOLO_NO_MAC.get(parte) ?? parte)
    .join('')
}

function porSistema(teclas: TeclasSugeridas): Record<Sistema, string> {
  return {
    windows: teclas.default,
    mac: teclaNoMac(teclas.mac),
    linux: teclas.linux ?? teclas.default,
  }
}

export const ATALHOS: Record<Loja, Record<Sistema, string>> = {
  chrome: porSistema(TECLAS_CHROMIUM),
  edge: porSistema(TECLAS_CHROMIUM),
  opera: porSistema(TECLAS_CHROMIUM),
  firefox: porSistema(TECLAS_FIREFOX),
}
```

Em `packages/tools/package.json`, no fim de `exports` (depois de `"./campos-formatar"`), acrescente:

```json
    "./pilulabs": "./src/pilulabs.ts"
```

(Não entra no barrel `src/index.ts`: módulo novo só por subpath, regra do `packages/tools/CLAUDE.md`.)

- [ ] **Step 4: Rode e confirme que passa**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/pilulabs.test.ts; echo "exit=$?" && ./node_modules/.bin/tsc --noEmit; echo "exit=$?"`
Expected: todos PASS, `exit=0` duas vezes.

- [ ] **Step 5: Troque as importações do `apps/web` para o pacote**

Edite cada arquivo exatamente assim (só as linhas de import mudam, salvo onde dito):

1. `apps/web/lib/pilulabs.ts`:
   - troque o bloco de imports do topo (linhas 1–18) por:
     ```ts
     import { readdirSync } from 'node:fs'
     import { join } from 'node:path'
     import {
       ehDataValida,
       ehHttps,
       TIPO_PADRAO,
       TIPOS,
       type TipoItem,
     } from '@piluvitu/tools/pilulabs'
     import type { Metadata } from 'next'
     import type { Project } from '@/mocks/projects'
     import { DOMINIO_PILUTECH, urlPublica } from './pilutech-dominios'
     ```
   - apague `export type Fase = 'em-breve' | 'disponivel'`;
   - apague `export type LojaPublicada = …`, o `const CAMPO_DA_LOJA = {…} as const satisfies …` e `type UrlsDasLojas = …` (fica só `type Ordenavel = Pick<ItemPiluLabs, 'order' | 'slug'>`);
   - apague as funções `lojasPublicadas` e `fase`;
   - apague `export type Sistema = 'windows' | 'mac' | 'linux'`, o `const ATALHO_CHROMIUM` e o `export const ATALHOS` (com o comentário do Firefox).
2. `apps/web/lib/pilulabs-conteudo.ts`, linha 5: `import { ehDataValida, TIPOS } from '@piluvitu/tools/pilulabs'`.
3. `apps/web/lib/pilulabs-json-ld.ts`, linha 1 vira duas:
   ```ts
   import { lojasPublicadas } from '@piluvitu/tools/pilulabs'
   import type { Captura, ItemPiluLabs } from './pilulabs'
   ```
4. `apps/web/lib/admin/content-schemas.ts`, linhas 3–10: o mesmo bloco, com `from '@piluvitu/tools/pilulabs'`.
5. `apps/web/components/admin/content/pilulabs-form.tsx`, linha 7: `import { TIPOS, type TipoItem } from '@piluvitu/tools/pilulabs'`.
6. `apps/web/components/pilulabs/lojas-ui.ts`: `import type { Loja } from '@piluvitu/tools/pilulabs'`.
7. `apps/web/components/pilulabs/atalhos-tabela.tsx`: `import type { Loja, Sistema } from '@piluvitu/tools/pilulabs'`.
8. `apps/web/components/pilulabs/atalhos-tabela.test.tsx`: `import { ATALHOS } from '@piluvitu/tools/pilulabs'`.
9. `apps/web/components/pilulabs/botoes-loja.tsx`: `import type { LojaPublicada } from '@piluvitu/tools/pilulabs'`.
10. `apps/web/components/pilulabs/produto-card.tsx`: troque `import type { Fase, ItemPiluLabs, Loja } from '@/lib/pilulabs'` por
    ```ts
    import type { Fase, Loja } from '@piluvitu/tools/pilulabs'
    import type { ItemPiluLabs } from '@/lib/pilulabs'
    ```
11. `apps/web/components/pilulabs/status-produto.tsx`: `import type { Fase } from '@piluvitu/tools/pilulabs'`.
12. `apps/web/components/pilulabs/vitrine.tsx`: `import type { Fase, Loja, TipoItem } from '@piluvitu/tools/pilulabs'`.
13. `apps/web/components/pilulabs/vitrine.test.tsx`: `import type { TipoItem } from '@piluvitu/tools/pilulabs'`.
14. `apps/web/app/(site)/pilulabs/page.tsx`: troque o import de `@/lib/pilulabs` por
    ```ts
    import { fase, lojasPublicadas } from '@piluvitu/tools/pilulabs'
    import {
      itensListados,
      linkDoItem,
      metadataDaPagina,
      siglaDoItem,
    } from '@/lib/pilulabs'
    ```
15. `apps/web/app/(site)/pilulabs/botai/page.tsx`: troque o import de `@/lib/pilulabs` por
    ```ts
    import { ATALHOS, fase, lojasPublicadas } from '@piluvitu/tools/pilulabs'
    import { listarCapturas, metadataDoItem } from '@/lib/pilulabs'
    ```
16. `apps/web/app/(site)/pilulabs/pilulabs.e2e.ts`: troque o import de `../../../lib/pilulabs` por
    ```ts
    import { LOJAS, lojasPublicadas, TIPOS } from '@piluvitu/tools/pilulabs'
    import { itensListados, linkDoItem } from '../../../lib/pilulabs'
    ```

- [ ] **Step 6: Tire do `apps/web` os testes que se mudaram e o arquivo de regras**

Em `apps/web/lib/pilulabs.test.ts`:

- no import de `./pilulabs`, remova `ATALHOS`, `fase`, `LOJAS` e `lojasPublicadas`;
- apague as constantes `URL_FIREFOX`, `URL_EDGE` e `URL_OPERA` (fica `URL_CHROME`, que o `normalizarItem` usa, e `SEM_LOJA`, que o `item()` usa);
- apague os blocos `describe('lojasPublicadas', …)`, `describe('fase', …)` e `describe('ATALHOS', …)`.

Apague `apps/web/lib/pilulabs-regras.ts` e `apps/web/lib/pilulabs-regras.test.ts`:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git rm -q apps/web/lib/pilulabs-regras.ts apps/web/lib/pilulabs-regras.test.ts; echo "exit=$?"
```

Confira que nada mais aponta para o arquivo apagado:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web && /usr/bin/grep -rn --exclude-dir=node_modules --exclude-dir=.next --exclude='*.tsbuildinfo' "pilulabs-regras" . ; echo "exit=$?"
```

Expected: nenhuma linha, `exit=1` (o `CLAUDE.md` muda no Step 8; se só ele aparecer, siga). O `--exclude='*.tsbuildinfo'` tira o `tsconfig.tsbuildinfo` local (ignorado pelo git), que guarda o nome do arquivo apagado até o `tsc` do Step 7 o regravar.

- [ ] **Step 7: Verifique o `apps/web` inteiro**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web && ./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
./node_modules/.bin/jest; echo "jest exit=$?"
./node_modules/.bin/eslint .; echo "eslint exit=$?"
KEYSTATIC_GITHUB_CLIENT_ID=ci-dummy KEYSTATIC_GITHUB_CLIENT_SECRET=ci-dummy KEYSTATIC_SECRET=ci-dummy-secret-32-chars-padding-x NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG=ci-dummy pnpm run build:ci; echo "build exit=$?"
cd ../../packages/tools && ./node_modules/.bin/jest; echo "tools jest exit=$?"
```

Expected: os cinco `exit=0`. O `tsc` pega qualquer import esquecido (inclusive nos `.e2e.ts`). O build prova que o Next empacota o subpath novo também no bundle do cliente (o formulário do admin).

- [ ] **Step 8: Documentação**

`packages/tools/CLAUDE.md`: antes de `## Dependency policy`, acrescente:

```markdown
## Módulo `pilulabs` (regras do catálogo PiluLabs e do Botaí)

`pilulabs.ts`, exposto só por `@piluvitu/tools/pilulabs`, sem `node:fs` e importável no cliente. Saiu do `apps/web/lib` (era o `pilulabs-regras.ts` mais `lojasPublicadas`, `fase` e `ATALHOS`) porque dois apps decidem a mesma coisa: o `apps/web` (card da PiluLabs, formulário do admin) e o `apps/botai-site` (botões de loja, selo de fase, atalho de quem visita).

- `Loja`, `LOJAS` (ordem fixa) e `ehUrlDaLoja`: só `https:` no host exato da loja; `lojasPublicadas(urls)` e `fase(urls)` recebem as 4 URLs (`UrlsDasLojas`), e só URL válida conta.
- `TipoItem`, `TIPOS` (ordem da vitrine), `TIPO_PADRAO`, `ehHttps` e `ehDataValida`.
- `TECLAS_DO_MANIFESTO` é o `suggested_key` do Botaí (Chromium e Firefox) e `ATALHOS` sai dele (`teclaNoMac` troca `Alt`/`Shift`/`Ctrl` por `⌥`/`⇧`/`⌘`, como o Chrome mostra no Mac). Mudou a tecla da extensão? Mude aqui: os testes fixam os dois formatos.
```

`apps/web/CLAUDE.md`, seção PiluLabs, bullet "Regras (lógica pura, testada no Jest)":

- troque o sub-bullet que começa com "`lib/pilulabs-regras.ts`, sem `node:fs` e importável no cliente:" (com os 4 itens abaixo dele) por:
  ```markdown
  - `@piluvitu/tools/pilulabs` (`packages/tools/src/pilulabs.ts`), sem `node:fs`, importável no cliente e compartilhado com o `apps/botai-site`:
    - `Loja`, `LOJAS` e `ehUrlDaLoja`: só aceita `https:` no host exato da loja;
    - `lojasPublicadas`, `fase` e `ATALHOS` (derivado de `TECLAS_DO_MANIFESTO`, o `suggested_key` do Botaí);
    - `ehHttps`, `TipoItem` e `TIPOS` (na ordem da vitrine) e `ehDataValida`.
  ```
- no sub-bullet de `lib/pilulabs.ts`, troque "`lojasPublicadas`, `fase`, `listarCapturas`, `ATALHOS` e `metadataDaPagina`/`metadataDoItem`." por "`listarCapturas` e `metadataDaPagina`/`metadataDoItem`.";
- no ⚠️ de "Componentes", troque "ou vem de `@/lib/pilulabs-regras`, como os `TIPOS` do formulário do admin." por "ou vem de `@piluvitu/tools/pilulabs`, como os `TIPOS` do formulário do admin.".

- [ ] **Step 9: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add packages/tools apps/web && /usr/bin/git commit -m "refactor(pilulabs): regras puras do catálogo e do Botaí em @piluvitu/tools/pilulabs"; echo "exit=$?"
```

---

### Tarefa 2: Esqueleto do `apps/botai-site`

App Next 16 mínimo, já no padrão do repo: Tailwind 4 + `@piluvitu/ui` com `@source` e gate, `next/font`, Jest + Testing Library, Storybook próprio (6019), Playwright (3020, build de produção), ESLint, `tsc`, conferência de rotas estáticas, `vercel.json` com `ignoreCommand`, alvos do `Makefile` e job no CI. Todas as dependências do app entram aqui, num `pnpm install` só.

**Files:**

- Modify: `pnpm-workspace.yaml`, `pnpm-lock.yaml` (gerado), `.gitignore`, `Makefile`, `.github/workflows/ci.yml`
- Create (`apps/botai-site/`): `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `eslint.config.mjs`, `jest.config.ts`, `jest.setup.ts`, `playwright.config.ts`, `vercel.json`, `vercel.test.ts`, `.storybook/main.ts`, `.storybook/preview.tsx`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/pagina.e2e.ts`, `components/cabecalho-secao.tsx`, `components/cabecalho-secao.test.tsx`, `components/cabecalho-secao.stories.tsx`, `scripts/conferir-rotas-estaticas.mjs`, `scripts/conferir-rotas-estaticas.test.mjs`, `CLAUDE.md`

**Interfaces:**

- Consumes: `@piluvitu/ui/styles.css`, `scripts/check-tailwind-source.mjs` (raiz).
- Produces:
  - `CabecalhoSecao({ id, rotulo, contagem }: { id: string; rotulo: string; contagem?: number })` — `h2` com o `id` e a contagem com 2 dígitos ao lado.
  - `scripts/conferir-rotas-estaticas.mjs`: `export const ROTAS: string[]`; `export function rotasNaoEstaticas(rotasDoManifesto: Record<string, { initialRevalidateSeconds: number | false }>, rotas: string[]): string[]`. As Tarefas 7 e 8 acrescentam rotas em `ROTAS`.
  - Scripts do pacote: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, `storybook`, `build-storybook`, `prettier:check`, `prettier:fix`.

- [ ] **Step 1: Workspace, `package.json` e install**

Em `pnpm-workspace.yaml`, depois de `  - 'apps/botai'`, acrescente `  - 'apps/botai-site'`.

`apps/botai-site/package.json` (os ranges são os que o `apps/web` já usa, para o pnpm reaproveitar as versões do lock; o `axe-core` é o 4.11.1 que já está no lock):

```json
{
  "name": "@pilutech/botai-site",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3020",
    "build": "next build && node ../../scripts/check-tailwind-source.mjs .next && node scripts/conferir-rotas-estaticas.mjs",
    "start": "next start -p 3020",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "jest && node --test scripts/*.test.mjs",
    "test:e2e": "playwright test",
    "storybook": "storybook dev -p 6019",
    "build-storybook": "storybook build",
    "prettier:check": "prettier --check \"**/*.{js,mjs,ts,tsx,json,md,css}\"",
    "prettier:fix": "prettier --write \"**/*.{js,mjs,ts,tsx,json,md,css}\""
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{js,mjs,cjs,json,md,css}": "prettier --write"
  },
  "dependencies": {
    "@fortawesome/fontawesome-svg-core": "^7.2.0",
    "@fortawesome/free-brands-svg-icons": "^7.2.0",
    "@fortawesome/free-solid-svg-icons": "^7.2.0",
    "@fortawesome/react-fontawesome": "^3.3.0",
    "@piluvitu/tools": "workspace:*",
    "@piluvitu/ui": "workspace:*",
    "next": "16.3.8",
    "next-themes": "^0.4.6",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "yaml": "^2.9.0"
  },
  "devDependencies": {
    "@playwright/test": "1.59.1",
    "@storybook/nextjs": "10.3.1",
    "@tailwindcss/postcss": "^4.2.2",
    "@tailwindcss/typography": "^0.5.19",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/jest": "^30.0.0",
    "@types/node": "^25.5.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "axe-core": "4.11.1",
    "eslint": "^9.39.4",
    "eslint-config-next": "16.3.8",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-storybook": "10.3.1",
    "jest": "^30.4.2",
    "jest-environment-jsdom": "^30.4.1",
    "postcss": "^8.5.8",
    "prettier": "^3.8.1",
    "prettier-plugin-tailwindcss": "^0.7.2",
    "storybook": "10.3.1",
    "tailwindcss": "^4.2.2",
    "ts-jest": "^29.4.9",
    "typescript": "^5.9.3"
  }
}
```

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && pnpm install; echo "install exit=$?"
pnpm dedupe --check; echo "dedupe exit=$?"
/usr/bin/git diff --stat pnpm-lock.yaml
cd apps/web && ./node_modules/.bin/jest components/admin/posts/mdx-editor.codemirror.test.ts; echo "codemirror exit=$?"
```

Expected: os três `exit=0`. Abra `/usr/bin/git diff pnpm-lock.yaml`. O esperado (medido numa cópia dos manifestos com o pnpm 11.1.1, ~415 linhas a mais):

- o bloco novo `apps/botai-site:` em `importers:`;
- **nenhuma** linha nova ou mudada em `packages:`;
- em `snapshots:`, entradas novas de versões que já estão no lock, com outro conjunto de peers: `webpack@5.105.4:` sem o peer `esbuild@0.28.1` que a cópia do `apps/web` tem, e a cadeia webpack do Storybook que depende dele (`@storybook/nextjs@10.3.1(…)(webpack@5.105.4)`, `@storybook/builder-webpack5`, `@storybook/preset-react-webpack`, `babel-loader`, `css-loader` 6 e 7, `style-loader` 3 e 4, `sass-loader`, `postcss-loader`, `terser-webpack-plugin`, `html-webpack-plugin`, `webpack-dev-middleware` e outras);
- 5 linhas de `snapshots:` reescritas: a chave de peers do `eslint-import-resolver-typescript@3.10.1` (e do `eslint-module-utils` que a cita) fica mais curta.

Isso não é defeito e não se corrige fixando versão. O defeito é só versão nova em `packages:`: aí troque no `package.json` o range daquele pacote pela versão exata que o lock já tem (veja a do `apps/web`), rode `pnpm install` de novo e repita as três conferências.

- [ ] **Step 2: Configurações do app**

`apps/botai-site/tsconfig.json` (o mesmo do `apps/web`, que o Next 16 já normalizou):

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    },
    "target": "ES2017"
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

`apps/botai-site/next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { formats: ['image/avif', 'image/webp'] },
}

export default nextConfig
```

`apps/botai-site/postcss.config.mjs`:

```js
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
```

`apps/botai-site/eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from 'eslint/config'
import nextTs from 'eslint-config-next/typescript'
import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier/flat'
import storybook from 'eslint-plugin-storybook'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...storybook.configs['flat/recommended'],
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'next-env.d.ts',
    'storybook-static/**',
    'node_modules/**',
    'test-results/**',
    'playwright-report/**',
    '**/*.tsbuildinfo',
    'public/**',
  ]),
])
```

`apps/botai-site/jest.config.ts`:

```ts
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { moduleResolution: 'node' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@piluvitu/tools/(.*)$': '<rootDir>/../../packages/tools/src/$1',
  },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  modulePathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/storybook-static/'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/storybook-static/',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
}

export default config
```

`apps/botai-site/jest.setup.ts`:

```ts
import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'

Object.assign(global, { TextEncoder, TextDecoder })

// O jsdom não tem matchMedia, e o next-themes o consulta para o tema do sistema.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// O jsdom também não tem IntersectionObserver, que o next/link usa para o prefetch.
class IntersectionObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}
Object.assign(window, { IntersectionObserver: IntersectionObserverFalso })
```

`apps/botai-site/playwright.config.ts` (o E2E roda no build de produção: é o que a Vercel serve, e as checagens de SEO e de rede valem para ele):

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testMatch: ['**/*.e2e.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3020',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm run build && pnpm run start',
    url: 'http://localhost:3020',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    cwd: '.',
  },
})
```

`apps/botai-site/.storybook/main.ts`:

```ts
import type { StorybookConfig } from '@storybook/nextjs'

const config: StorybookConfig = {
  stories: ['../components/**/*.stories.@(ts|tsx)'],
  framework: { name: '@storybook/nextjs', options: {} },
  staticDirs: ['../public'],
}

export default config
```

`apps/botai-site/.storybook/preview.tsx`:

```tsx
import type { Preview } from '@storybook/nextjs'
import '../app/globals.css'

const preview: Preview = {
  initialGlobals: { tema: 'escuro' },
  globalTypes: {
    tema: {
      description: 'Tema da landing',
      toolbar: {
        title: 'Tema',
        icon: 'mirror',
        items: [
          { value: 'claro', title: 'Claro' },
          { value: 'escuro', title: 'Escuro' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, { globals }) => {
      document.documentElement.classList.toggle(
        'dark',
        globals.tema !== 'claro',
      )
      return (
        <div className="bg-background text-foreground min-h-svh p-6">
          <Story />
        </div>
      )
    },
  ],
}

export default preview
```

`apps/botai-site/app/globals.css`:

```css
@import 'tailwindcss';
@import '@piluvitu/ui/styles.css';
@source '../../../packages/ui/src';
/* A documentação do app não pode mudar o CSS da landing (o Tailwind varre os .md). */
@source not '../*.md';

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground font-sans antialiased;
  }
}
```

`apps/botai-site/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = { title: 'Botaí' }

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  )
}
```

`apps/botai-site/vercel.json` (o comando roda na Root Directory do projeto; `exit 0` cancela o build):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- . ../../packages/ui ../../packages/tools ../web/content/pilulabs/botai ../../pnpm-lock.yaml ../../pnpm-workspace.yaml ../../package.json ../../scripts/check-tailwind-source.mjs"
}
```

Em `.gitignore` (raiz), depois do bloco do Botaí (`apps/botai/web-ext.config.ts`), acrescente:

```gitignore
# Landing do Botaí: o storybook-static traz CSS compilado, e o Tailwind o varreria (o gate passaria sem medir nada)
apps/botai-site/storybook-static/
apps/botai-site/playwright-report/
```

- [ ] **Step 3: Testes do esqueleto (falham: os arquivos de código ainda não existem)**

`apps/botai-site/components/cabecalho-secao.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { CabecalhoSecao } from './cabecalho-secao'

describe('CabecalhoSecao', () => {
  // A seção aponta para ele com aria-labelledby.
  it('é um h2 com o id recebido', () => {
    render(<CabecalhoSecao id="recursos-heading" rotulo="O que ele bota" />)
    expect(
      screen.getByRole('heading', { level: 2, name: 'O que ele bota' }),
    ).toHaveAttribute('id', 'recursos-heading')
  })

  it('a contagem sai com dois dígitos, fora do título', () => {
    render(
      <CabecalhoSecao id="capturas-heading" rotulo="Capturas" contagem={3} />,
    )
    expect(screen.getByText('03')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      /^Capturas$/,
    )
  })

  it('sem contagem, nenhum número', () => {
    const { container } = render(
      <CabecalhoSecao id="uso-heading" rotulo="Como usar" />,
    )
    expect(container.textContent).toBe('Como usar')
  })
})
```

`apps/botai-site/vercel.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const { ignoreCommand } = JSON.parse(
  readFileSync(join(__dirname, 'vercel.json'), 'utf8'),
) as { ignoreCommand: string }

const [comando, caminhos] = ignoreCommand.split(' -- ')

describe('vercel.json (Ignored Build Step)', () => {
  // exit 0 cancela o build; o git diff --quiet sai 0 quando nada mudou.
  it('cancela o build só quando nada que a landing usa mudou', () => {
    expect(comando).toBe('git diff --quiet HEAD^ HEAD')
  })

  // A entrada do Botaí no CMS mora no apps/web: sem ela aqui, publicar uma loja pelo /admin não rebuilda a landing.
  it('vigia o app, os pacotes, a entrada do Botaí no CMS e os arquivos de install e build', () => {
    expect(caminhos.split(' ')).toEqual([
      '.',
      '../../packages/ui',
      '../../packages/tools',
      '../web/content/pilulabs/botai',
      '../../pnpm-lock.yaml',
      '../../pnpm-workspace.yaml',
      '../../package.json',
      '../../scripts/check-tailwind-source.mjs',
    ])
  })

  it('todo caminho vigiado existe (um rename deixaria o build preso no passado)', () => {
    for (const caminho of caminhos.split(' '))
      expect([caminho, existsSync(join(__dirname, caminho))]).toEqual([
        caminho,
        true,
      ])
  })
})
```

`apps/botai-site/scripts/conferir-rotas-estaticas.test.mjs`:

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rotasNaoEstaticas } from './conferir-rotas-estaticas.mjs'

const estatica = { initialRevalidateSeconds: false }

test('rota estática passa, com ou sem o sufixo de hash das imagens', () => {
  assert.deepEqual(
    rotasNaoEstaticas({ '/': estatica, '/opengraph-image-1a2b3c': estatica }, [
      '/',
      '/opengraph-image',
    ]),
    [],
  )
})

test('rota com revalidate falha', () => {
  assert.deepEqual(
    rotasNaoEstaticas({ '/': { initialRevalidateSeconds: 60 } }, ['/']),
    ['/'],
  )
})

test('rota fora do manifesto falha: virou dinâmica ou sumiu', () => {
  assert.deepEqual(rotasNaoEstaticas({}, ['/privacidade']), ['/privacidade'])
})

test('a rota não é confundida com uma filha', () => {
  assert.deepEqual(
    rotasNaoEstaticas({ '/privacidade/opengraph-image': estatica }, [
      '/privacidade',
    ]),
    ['/privacidade'],
  )
})
```

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest; echo "jest exit=$?"
node --test scripts/*.test.mjs; echo "node-test exit=$?"
```

Expected: `cabecalho-secao.test.tsx` FAIL (`Cannot find module './cabecalho-secao'`) com `jest exit=1` (o `vercel.test.ts` já passa); `node-test exit=1` (`Cannot find module`).

- [ ] **Step 4: Código do esqueleto**

`apps/botai-site/components/cabecalho-secao.tsx`:

```tsx
type CabecalhoSecaoProps = {
  id: string
  rotulo: string
  contagem?: number
}

export function CabecalhoSecao({ id, rotulo, contagem }: CabecalhoSecaoProps) {
  return (
    <div className="flex items-center gap-3">
      <h2
        id={id}
        className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.2em] uppercase"
      >
        {rotulo}
      </h2>
      {contagem === undefined ? null : (
        <span className="text-muted-foreground font-mono text-xs">
          {String(contagem).padStart(2, '0')}
        </span>
      )}
      <span aria-hidden className="bg-border h-px flex-1" />
    </div>
  )
}
```

`apps/botai-site/components/cabecalho-secao.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { CabecalhoSecao } from './cabecalho-secao'

const meta = {
  title: 'Landing/CabecalhoSecao',
  component: CabecalhoSecao,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CabecalhoSecao>

export default meta
type Story = StoryObj<typeof meta>

export const ComContagem: Story = {
  args: { id: 'recursos-heading', rotulo: 'O que ele bota', contagem: 5 },
}
export const SemContagem: Story = {
  args: { id: 'uso-heading', rotulo: 'Como usar' },
}
export const Claro: Story = {
  args: { id: 'capturas-heading', rotulo: 'Capturas', contagem: 3 },
  globals: { tema: 'claro' },
}
```

`apps/botai-site/scripts/conferir-rotas-estaticas.mjs`:

```js
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROTAS = ['/']

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function rotasNaoEstaticas(rotasDoManifesto, rotas) {
  const chaves = Object.keys(rotasDoManifesto)
  return rotas.filter((rota) => {
    const padrao = new RegExp(`^${escaparRegex(rota)}(-[a-z0-9]+)?$`)
    const chave = chaves.find((k) => padrao.test(k))
    return (
      chave === undefined ||
      rotasDoManifesto[chave].initialRevalidateSeconds !== false
    )
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifesto = JSON.parse(
    readFileSync(
      join(process.cwd(), '.next', 'prerender-manifest.json'),
      'utf8',
    ),
  )
  const falhas = rotasNaoEstaticas(manifesto.routes, ROTAS)
  if (falhas.length > 0) {
    console.error(
      `Rota que deixou de ser estática (ou sumiu do build): ${falhas.join(', ')}`,
    )
    process.exit(1)
  }
  console.log(`Rotas estáticas: ${ROTAS.join(', ')}`)
}
```

`apps/botai-site/app/page.tsx` (provisório; a Tarefa 6 troca pela landing):

```tsx
import { CabecalhoSecao } from '@/components/cabecalho-secao'

export default function Home() {
  return (
    <main className="mx-auto max-w-[1080px] px-6 py-8">
      <h1 className="text-[40px] font-bold">Botaí</h1>
      <CabecalhoSecao id="esqueleto-heading" rotulo="Em construção" />
    </main>
  )
}
```

`apps/botai-site/app/pagina.e2e.ts` (fumaça; cresce na Tarefa 6):

```ts
import { expect, test } from '@playwright/test'

test('/ responde com o h1 do Botaí', async ({ page }) => {
  const resposta = await page.goto('/')
  expect(resposta?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Botaí')
})
```

- [ ] **Step 5: Rode os testes e confirme que passam**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && pnpm run test; echo "test exit=$?"
```

Expected: Jest e `node --test` verdes, `test exit=0`.

- [ ] **Step 6: Lint, tsc, build (gate + rotas), Storybook e E2E de fumaça**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
pnpm run build; echo "build exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
lsof -nP -iTCP:3020 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test --retries=0; echo "e2e exit=$?"
```

Expected: tudo `exit=0`; o build termina com `Rotas estáticas: /` depois da linha de sucesso do gate. Prova do gate (obrigatória, uma vez): comente o `@source '../../../packages/ui/src';` do `globals.css`, rode `pnpm run build; echo "exit=$?"` → `exit=1` com a mensagem do gate; restaure a linha e rode de novo → `exit=0`. Depois do `next build`/`next start`, confira `/usr/bin/git status` (Global Constraints: arquivos que o Next gera para agentes).

- [ ] **Step 7: `Makefile`, CI e `CLAUDE.md` do app**

`Makefile`: acrescente `dev-botai-site build-botai-site test-botai-site test-e2e-botai-site storybook-botai-site` ao fim da lista do `.PHONY`; no alvo `stop`, troque `for p in 8081 8082 3333 6017 3018 6018; do` por `for p in 8081 8082 3333 6017 3018 6018 3020 6019; do`; e, depois do bloco do botai (alvo `capturas-botai`), acrescente:

```make
# --- botai-site (landing do Botaí, Next 16) ---
# Dev em 3020 e Storybook em 6019. O E2E builda e serve a produção; rode com CI=1.
dev-botai-site:
	pnpm --filter @pilutech/botai-site dev

build-botai-site:
	pnpm --filter @pilutech/botai-site build

test-botai-site:
	pnpm --filter @pilutech/botai-site test

test-e2e-botai-site:
	CI=1 pnpm --filter @pilutech/botai-site test:e2e

storybook-botai-site:
	pnpm --filter @pilutech/botai-site storybook
```

`.github/workflows/ci.yml`: depois do job `botai`, acrescente o job abaixo **dentro de `jobs:`**, com 2 espaços a mais em cada linha (o bloco está sem o recuo de `jobs:`; `botai-site:` fica na mesma coluna de `botai:`):

```yaml
botai-site:
  name: Botaí site (lint + tsc + test + build)
  runs-on: ubuntu-latest
  timeout-minutes: 15
  env:
    NEXT_TELEMETRY_DISABLED: '1'
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v4

    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: pnpm

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Lint
      run: pnpm --filter @pilutech/botai-site run lint

    - name: Typecheck
      run: pnpm --filter @pilutech/botai-site run typecheck

    - name: Test (jest + node --test)
      run: pnpm --filter @pilutech/botai-site run test

    # O build lê apps/web/content/pilulabs/botai/index.yaml, que o checkout traz inteiro.
    - name: Build (+ gate do @source + rotas estáticas)
      run: pnpm --filter @pilutech/botai-site run build
```

`apps/botai-site/CLAUDE.md` (inicial; a Tarefa 11 escreve a versão completa):

```markdown
# CLAUDE.md — `apps/botai-site` (`@pilutech/botai-site`)

Landing do Botaí em `https://botai.pilutech.com.br`: Next 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4 e `@piluvitu/ui`. O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz.

- **Spec:** `docs/superpowers/specs/2026-10-02-botai-landing-design.md`. **Plano:** `docs/superpowers/plans/2026-10-02-botai-landing.md`. **Design:** `docs/superpowers/design/2026-10-02-botai-landing/`.
- **Grafia:** "Botaí" em todo texto visível; `botai` no técnico (ver "Identidade" em `apps/botai/CLAUDE.md`).

## Comandos

| Comando                     | O quê                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| `make dev-botai-site`       | `next dev` em http://localhost:3020                                |
| `make build-botai-site`     | `next build` + gate do `@source` + conferência das rotas estáticas |
| `make test-botai-site`      | Jest + `node --test` (scripts)                                     |
| `make test-e2e-botai-site`  | build de produção + `next start` na 3020 + Playwright (com `CI=1`) |
| `make storybook-botai-site` | Storybook em http://localhost:6019                                 |
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev && make -n test-botai-site; echo "exit=$?"` → imprime `pnpm --filter @pilutech/botai-site test`, `exit=0`.

- [ ] **Step 8: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add pnpm-workspace.yaml pnpm-lock.yaml .gitignore Makefile .github/workflows/ci.yml apps/botai-site && /usr/bin/git status --short && /usr/bin/git commit -m "feat(botai-site): esqueleto da landing (Next 16, Tailwind 4, @piluvitu/ui, Jest, Storybook e Playwright)"; echo "exit=$?"
```

(Confira no `git status --short` que nada de `.next/`, `storybook-static/`, `test-results/`, `next-env.d.ts` ou bloco gerado pelo Next entrou.)

---

### Tarefa 3: Leitura do CMS e o modelo da página

Tudo o que a página decide sem React: as URLs das lojas lidas do YAML do CMS no build, os botões e a nota das lojas, a fase, o atalho por sistema de quem visita, as capturas por tema e os textos reaproveitados (página e JSON-LD). Copia para `public/` o ícone e as 6 capturas que o gerador das lojas já produz (a Tarefa 10 passa a cópia para o `make capturas-botai`).

**Files:**

- Create (`apps/botai-site/`): `lib/conteudo.ts`, `lib/conteudo.test.ts`, `lib/cms.ts`, `lib/cms.test.ts`, `lib/modelo.ts`, `lib/modelo.test.ts`, `lib/visitante.ts`, `lib/visitante.test.ts`, `lib/capturas.ts`, `lib/capturas.test.ts`, `public/icone-128.png`, `public/capturas/01-pagina-preenchida-escuro.png` … `06-resultado-claro.png`

**Interfaces:**

- Consumes (Tarefa 1): `Loja`, `LOJAS`, `Fase`, `Sistema`, `UrlsDasLojas`, `fase`, `lojasPublicadas`, `ATALHOS` de `@piluvitu/tools/pilulabs`.
- Produces:
  - `lib/conteudo.ts`: `NOME = 'Botaí'`; `PROPOSTA = 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)'`; `URL_DA_PILUTECH = 'https://pilutech.com.br'`; `EMAIL_DE_SUPORTE = 'pilutechinformatica@gmail.com'`; `type Recurso = { titulo: string; texto: string; icone: IconDefinition }`; `RECURSOS: Recurso[]`; `REQUISITOS: string` (frase visível); `REQUISITOS_DO_SOFTWARE: string` (frase do JSON-LD).
  - `lib/cms.ts`: `ITEM_NO_CMS: string`; `lerUrlsDasLojas(caminho?: string): UrlsDasLojas` (sem caminho, lê `BOTAI_CMS_ITEM` se definida, senão `ITEM_NO_CMS`; lança se o arquivo não existe). A `BOTAI_CMS_ITEM` só existe para o E2E das lojas publicadas (Tarefa 6).
  - `lib/modelo.ts`: `type BotaoDeLoja = { loja: Loja; url: string | null }`; `type ModeloDaLanding = { fase: Fase; lojas: BotaoDeLoja[]; notaDasLojas: string }`; `botoesDasLojas(urls: UrlsDasLojas): BotaoDeLoja[]`; `notaDasLojas(publicadas: readonly Loja[]): string`; `modeloDaLanding(urls: UrlsDasLojas): ModeloDaLanding`.
  - `lib/visitante.ts`: `type NavegadorDoVisitante = { userAgent: string; platform?: string; userAgentData?: { platform?: string } }`; `type AtalhoDoVisitante = { tecla: string; nomeDoSistema: string }`; `sistemaDoVisitante(nav: NavegadorDoVisitante): Sistema`; `ehFirefox(nav: Pick<NavegadorDoVisitante, 'userAgent'>): boolean`; `atalhoDoVisitante(sistema: Sistema, firefox: boolean): AtalhoDoVisitante`; `VISITANTE_DO_SERVIDOR: { sistema: Sistema; firefox: boolean }`.
  - `lib/capturas.ts`: `type Tema = 'escuro' | 'claro'`; `type VarianteDaCaptura = { src: string; alt: string }`; `type CapturaDaGaleria = { numero: string; titulo: string; texto: string; variantes: Record<Tema, VarianteDaCaptura> }`; `LARGURA_DA_CAPTURA = 1280`; `ALTURA_DA_CAPTURA = 800`; `CAPTURAS: CapturaDaGaleria[]`.

- [ ] **Step 1: Copie as imagens que o gerador das lojas já produziu**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && mkdir -p apps/botai-site/public/capturas \
  && cp apps/botai/loja/imagens/icone-128.png apps/botai-site/public/icone-128.png \
  && cp apps/botai/loja/imagens/capturas/1280x800/*.png apps/botai-site/public/capturas/ \
  && /bin/ls apps/botai-site/public apps/botai-site/public/capturas; echo "exit=$?"
```

Expected: `icone-128.png` e as 6 capturas (`01-pagina-preenchida-escuro.png`, `02-pagina-preenchida-claro.png`, `03-pessoa-de-teste-escuro.png`, `04-pessoa-de-teste-claro.png`, `05-resultado-escuro.png`, `06-resultado-claro.png`), `exit=0`.

- [ ] **Step 2: Escreva os testes (falham: os módulos não existem)**

`apps/botai-site/lib/conteudo.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RECURSOS, REQUISITOS, REQUISITOS_DO_SOFTWARE } from './conteudo'

const WXT_CONFIG = readFileSync(
  join(__dirname, '..', '..', 'botai', 'wxt.config.ts'),
  'utf8',
)

describe('conteúdo da landing', () => {
  it('os 5 recursos do design, na ordem', () => {
    expect(RECURSOS.map((r) => r.titulo)).toEqual([
      'Documentos',
      'Endereço',
      'Contato',
      'Empresa',
      'Cartão',
    ])
  })

  // A página promete versões mínimas: elas têm de ser as do manifesto da extensão.
  it('os pisos de versão do texto são os do wxt.config.ts do Botaí', () => {
    const chromium = /minimum_chrome_version: '(\d+)'/.exec(WXT_CONFIG)?.[1]
    const firefox = /strict_min_version: '(\d+)\.0'/.exec(WXT_CONFIG)?.[1]
    expect([chromium, firefox]).toEqual(['123', '153'])
    expect(REQUISITOS).toBe(
      `Chrome, Edge e Opera a partir do Chromium ${chromium}. Firefox a partir da versão ${firefox}.`,
    )
    expect(REQUISITOS_DO_SOFTWARE).toBe(
      `Chrome, Edge ou Opera com Chromium ${chromium} ou superior, ou Firefox ${firefox} ou superior`,
    )
  })
})
```

`apps/botai-site/lib/cms.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ehHttps } from '@piluvitu/tools/pilulabs'
import { ITEM_NO_CMS, lerUrlsDasLojas } from './cms'

const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'

describe('lerUrlsDasLojas', () => {
  let pasta: string

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'botai-cms-'))
  })
  afterEach(() => {
    rmSync(pasta, { recursive: true, force: true })
  })

  function yaml(conteudo: string): string {
    const caminho = join(pasta, 'index.yaml')
    writeFileSync(caminho, conteudo)
    return caminho
  }

  // O dono edita em /admin/pilulabs, que grava neste arquivo do apps/web.
  it('aponta para o item botai do CMS do apps/web', () => {
    expect(ITEM_NO_CMS).toMatch(
      /apps\/web\/content\/pilulabs\/botai\/index\.yaml$/,
    )
  })

  it('lê o item real: as 4 URLs, vazias ou https', () => {
    const urls = lerUrlsDasLojas()
    expect(Object.keys(urls).sort()).toEqual([
      'chromeUrl',
      'edgeUrl',
      'firefoxUrl',
      'operaUrl',
    ])
    for (const url of Object.values(urls))
      expect(url === '' || ehHttps(url)).toBe(true)
  })

  it('apara espaços e ignora o resto do item', () => {
    expect(
      lerUrlsDasLojas(
        yaml(
          `slug: botai\nnome: Botaí\nchromeUrl: '  ${URL_CHROME} '\nfirefoxUrl: ''\nedgeUrl: ''\noperaUrl: ''\n`,
        ),
      ),
    ).toEqual({
      chromeUrl: URL_CHROME,
      firefoxUrl: '',
      edgeUrl: '',
      operaUrl: '',
    })
  })

  // O Keystatic apaga do YAML o campo opcional vazio.
  it('campo ausente, nulo ou que não é texto vira vazio', () => {
    expect(
      lerUrlsDasLojas(yaml('chromeUrl: 12\nfirefoxUrl:\nedgeUrl: [a]\n')),
    ).toEqual({ chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' })
  })

  it('arquivo vazio: nenhuma loja', () => {
    expect(lerUrlsDasLojas(yaml(''))).toEqual({
      chromeUrl: '',
      firefoxUrl: '',
      edgeUrl: '',
      operaUrl: '',
    })
  })

  // Sem o YAML o build tem de quebrar: em silêncio, a landing sairia "Em breve" com a loja já publicada.
  it('arquivo que não existe lança', () => {
    expect(() => lerUrlsDasLojas(join(pasta, 'nao-existe.yaml'))).toThrow(
      /ENOENT/,
    )
  })

  // Só o playwright.lojas.config.ts define a variável: builda a landing com um YAML de teste.
  it('BOTAI_CMS_ITEM troca o arquivo lido por padrão', () => {
    process.env.BOTAI_CMS_ITEM = yaml(`chromeUrl: '${URL_CHROME}'\n`)
    try {
      expect(lerUrlsDasLojas().chromeUrl).toBe(URL_CHROME)
    } finally {
      delete process.env.BOTAI_CMS_ITEM
    }
  })
})
```

`apps/botai-site/lib/modelo.test.ts`:

```ts
import { botoesDasLojas, modeloDaLanding, notaDasLojas } from './modelo'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }
const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'
const URL_FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'

describe('botoesDasLojas', () => {
  it('as 4 lojas, na ordem fixa, sem URL antes da aprovação', () => {
    expect(botoesDasLojas(SEM_LOJA)).toEqual([
      { loja: 'chrome', url: null },
      { loja: 'firefox', url: null },
      { loja: 'edge', url: null },
      { loja: 'opera', url: null },
    ])
  })

  it('a loja publicada leva a URL dela, aparada', () => {
    expect(
      botoesDasLojas({ ...SEM_LOJA, firefoxUrl: ` ${URL_FIREFOX} ` }),
    ).toEqual([
      { loja: 'chrome', url: null },
      { loja: 'firefox', url: URL_FIREFOX },
      { loja: 'edge', url: null },
      { loja: 'opera', url: null },
    ])
  })

  // O dono cola o link pelo /admin/pilulabs: um link de outra loja ou em http não vira botão.
  it('URL de outro host ou sem https fica sem link', () => {
    expect(
      botoesDasLojas({
        ...SEM_LOJA,
        chromeUrl: URL_FIREFOX,
        edgeUrl: 'http://microsoftedge.microsoft.com/addons/detail/botai/x',
      }).map((b) => b.url),
    ).toEqual([null, null, null, null])
  })
})

describe('notaDasLojas', () => {
  it('sem loja: a promessa, sem dizer que saiu', () => {
    expect(notaDasLojas([])).toBe(
      'Chegando às lojas do Chrome, do Firefox, do Edge e do Opera',
    )
  })

  it('nas quatro', () => {
    expect(notaDasLojas(['chrome', 'firefox', 'edge', 'opera'])).toBe(
      'Chrome, Firefox, Edge e Opera · grátis e de código aberto',
    )
  })

  // As aprovações chegam em datas diferentes: a nota só cita as que saíram.
  it('só as publicadas', () => {
    expect(notaDasLojas(['firefox'])).toBe(
      'Firefox · grátis e de código aberto',
    )
    expect(notaDasLojas(['chrome', 'edge'])).toBe(
      'Chrome e Edge · grátis e de código aberto',
    )
  })
})

describe('modeloDaLanding', () => {
  it('em breve', () => {
    expect(modeloDaLanding(SEM_LOJA)).toEqual({
      fase: 'em-breve',
      lojas: botoesDasLojas(SEM_LOJA),
      notaDasLojas:
        'Chegando às lojas do Chrome, do Firefox, do Edge e do Opera',
    })
  })

  it('com o Chrome publicado', () => {
    const urls = { ...SEM_LOJA, chromeUrl: URL_CHROME }
    expect(modeloDaLanding(urls)).toEqual({
      fase: 'disponivel',
      lojas: botoesDasLojas(urls),
      notaDasLojas: 'Chrome · grátis e de código aberto',
    })
  })

  it('URL errada não muda a fase', () => {
    expect(modeloDaLanding({ ...SEM_LOJA, chromeUrl: URL_FIREFOX }).fase).toBe(
      'em-breve',
    )
  })
})
```

`apps/botai-site/lib/visitante.test.ts`:

```ts
import type { Sistema } from '@piluvitu/tools/pilulabs'
import {
  atalhoDoVisitante,
  ehFirefox,
  sistemaDoVisitante,
  VISITANTE_DO_SERVIDOR,
  type NavegadorDoVisitante,
} from './visitante'

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
const CHROME_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
const FIREFOX_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0'
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36'
const CHROMEOS =
  'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'

const CASOS: [string, NavegadorDoVisitante, Sistema][] = [
  [
    'Mac pelo userAgentData',
    {
      userAgent: CHROME_MAC,
      platform: 'MacIntel',
      userAgentData: { platform: 'macOS' },
    },
    'mac',
  ],
  [
    'Mac sem userAgentData (Safari, Firefox)',
    { userAgent: CHROME_MAC, platform: 'MacIntel' },
    'mac',
  ],
  [
    'Windows',
    {
      userAgent: CHROME_WINDOWS,
      platform: 'Win32',
      userAgentData: { platform: 'Windows' },
    },
    'windows',
  ],
  [
    'Linux',
    {
      userAgent: CHROME_LINUX,
      platform: 'Linux x86_64',
      userAgentData: { platform: 'Linux' },
    },
    'linux',
  ],
  [
    'Firefox no Linux',
    { userAgent: FIREFOX_LINUX, platform: 'Linux x86_64' },
    'linux',
  ],
  // O navigator.platform do Android diz "Linux": sem a exceção, o celular veria o atalho do Firefox para Linux.
  [
    'Android',
    { userAgent: CHROME_ANDROID, platform: 'Linux armv81' },
    'windows',
  ],
  [
    'ChromeOS, que usa o atalho padrão do manifesto',
    {
      userAgent: CHROMEOS,
      platform: 'Linux x86_64',
      userAgentData: { platform: 'Chrome OS' },
    },
    'windows',
  ],
  ['sem pista nenhuma', { userAgent: '' }, 'windows'],
]

describe('sistemaDoVisitante', () => {
  it.each(CASOS)('%s', (_caso, navegador, esperado) => {
    expect(sistemaDoVisitante(navegador)).toBe(esperado)
  })
})

describe('ehFirefox', () => {
  it('reconhece o Firefox pelo userAgent', () => {
    expect(ehFirefox({ userAgent: FIREFOX_LINUX })).toBe(true)
    expect(ehFirefox({ userAgent: CHROME_LINUX })).toBe(false)
  })
})

describe('atalhoDoVisitante', () => {
  it.each([
    ['mac', false, '⌥⇧P', 'macOS'],
    ['mac', true, '⌥⇧P', 'macOS'],
    ['windows', false, 'Ctrl+Shift+Y', 'Windows'],
    ['windows', true, 'Ctrl+Shift+Y', 'Windows'],
    ['linux', false, 'Ctrl+Shift+Y', 'Linux'],
    ['linux', true, 'Alt+Shift+P', 'Linux'],
  ] as const)('%s, Firefox %s: %s no %s', (sistema, firefox, tecla, nome) => {
    expect(atalhoDoVisitante(sistema, firefox)).toEqual({
      tecla,
      nomeDoSistema: nome,
    })
  })

  // O HTML do servidor não sabe quem visita: sai o atalho mais comum, trocado depois da hidratação.
  it('o servidor renderiza o do Windows', () => {
    expect(VISITANTE_DO_SERVIDOR).toEqual({
      sistema: 'windows',
      firefox: false,
    })
  })
})
```

`apps/botai-site/lib/capturas.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ALTURA_DA_CAPTURA, CAPTURAS, LARGURA_DA_CAPTURA } from './capturas'

const PUBLIC = join(__dirname, '..', 'public')

// Largura e altura ficam nos bytes 16–23 do cabeçalho IHDR.
function tamanhoDoPng(caminho: string) {
  const png = readFileSync(caminho)
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) }
}

describe('CAPTURAS', () => {
  it('as 3 cenas do design, na ordem das abas', () => {
    expect(CAPTURAS.map((c) => [c.numero, c.titulo])).toEqual([
      ['01', 'Página preenchida'],
      ['02', 'Pessoa de teste'],
      ['03', 'Resultado'],
    ])
  })

  // Os nomes vêm do gerador das lojas (apps/botai/loja/pecas.ts): o número do arquivo muda com o tema.
  it('cada cena aponta para o PNG de cada tema', () => {
    expect(
      CAPTURAS.map((c) => [c.variantes.escuro.src, c.variantes.claro.src]),
    ).toEqual([
      [
        '/capturas/01-pagina-preenchida-escuro.png',
        '/capturas/02-pagina-preenchida-claro.png',
      ],
      [
        '/capturas/03-pessoa-de-teste-escuro.png',
        '/capturas/04-pessoa-de-teste-claro.png',
      ],
      ['/capturas/05-resultado-escuro.png', '/capturas/06-resultado-claro.png'],
    ])
  })

  it('todo PNG existe em public/ com 1280×800', () => {
    for (const captura of CAPTURAS)
      for (const { src } of Object.values(captura.variantes))
        expect([src, tamanhoDoPng(join(PUBLIC, src))]).toEqual([
          src,
          { largura: LARGURA_DA_CAPTURA, altura: ALTURA_DA_CAPTURA },
        ])
  })

  it('o alt descreve a cena e diz o tema', () => {
    for (const { variantes } of CAPTURAS) {
      expect(variantes.escuro.alt).toMatch(/^.{40,} \(tema escuro\)$/)
      expect(variantes.claro.alt).toMatch(/^.{40,} \(tema claro\)$/)
    }
  })
})
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest lib; echo "exit=$?"`
Expected: os 5 arquivos FAIL com `Cannot find module`, `exit=1`.

- [ ] **Step 3: Implemente os módulos**

`apps/botai-site/lib/conteudo.ts`:

```ts
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faAddressBook,
  faBuilding,
  faCreditCard,
  faIdCard,
  faLocationDot,
} from '@fortawesome/free-solid-svg-icons'

export const NOME = 'Botaí'
export const PROPOSTA =
  'Gerador de dados fake para formulários (CPF, CNPJ, CEP)'
export const URL_DA_PILUTECH = 'https://pilutech.com.br'
export const EMAIL_DE_SUPORTE = 'pilutechinformatica@gmail.com'

export type Recurso = { titulo: string; texto: string; icone: IconDefinition }

export const RECURSOS: Recurso[] = [
  {
    titulo: 'Documentos',
    texto:
      'CPF, CNPJ, RG, PIS/NIS e título de eleitor, com os dígitos verificadores certos.',
    icone: faIdCard,
  },
  {
    titulo: 'Endereço',
    texto: 'CEP real, com rua, bairro, cidade e UF que batem com ele.',
    icone: faLocationDot,
  },
  {
    titulo: 'Contato',
    texto: 'Nome, data de nascimento, celular, e-mail e senha.',
    icone: faAddressBook,
  },
  {
    titulo: 'Empresa',
    texto: 'Razão social, nome fantasia e CNPJ.',
    icone: faBuilding,
  },
  {
    titulo: 'Cartão',
    texto:
      'O cartão de teste documentado da Stripe: número, nome impresso, validade e CVV.',
    icone: faCreditCard,
  },
]

export const REQUISITOS =
  'Chrome, Edge e Opera a partir do Chromium 123. Firefox a partir da versão 153.'
export const REQUISITOS_DO_SOFTWARE =
  'Chrome, Edge ou Opera com Chromium 123 ou superior, ou Firefox 153 ou superior'
```

`apps/botai-site/lib/cms.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UrlsDasLojas } from '@piluvitu/tools/pilulabs'
import { parse } from 'yaml'

// Lido no build (a rota é estática): o dono edita este item do apps/web em /admin/pilulabs.
export const ITEM_NO_CMS = join(
  process.cwd(),
  '..',
  'web',
  'content',
  'pilulabs',
  'botai',
  'index.yaml',
)

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

export function lerUrlsDasLojas(
  caminho: string = process.env.BOTAI_CMS_ITEM || ITEM_NO_CMS,
): UrlsDasLojas {
  const bruto: unknown = parse(readFileSync(caminho, 'utf8'))
  const item =
    typeof bruto === 'object' && bruto !== null
      ? (bruto as Record<string, unknown>)
      : {}
  return {
    chromeUrl: texto(item.chromeUrl),
    firefoxUrl: texto(item.firefoxUrl),
    edgeUrl: texto(item.edgeUrl),
    operaUrl: texto(item.operaUrl),
  }
}
```

`apps/botai-site/lib/modelo.ts`:

```ts
import {
  fase,
  LOJAS,
  lojasPublicadas,
  type Fase,
  type Loja,
  type UrlsDasLojas,
} from '@piluvitu/tools/pilulabs'

export type BotaoDeLoja = { loja: Loja; url: string | null }
export type ModeloDaLanding = {
  fase: Fase
  lojas: BotaoDeLoja[]
  notaDasLojas: string
}

const NOME_CURTO: Record<Loja, string> = {
  chrome: 'Chrome',
  firefox: 'Firefox',
  edge: 'Edge',
  opera: 'Opera',
}

export function botoesDasLojas(urls: UrlsDasLojas): BotaoDeLoja[] {
  const publicadas = new Map(
    lojasPublicadas(urls).map(({ loja, url }) => [loja, url]),
  )
  return LOJAS.map((loja) => ({ loja, url: publicadas.get(loja) ?? null }))
}

function emLista(nomes: string[]): string {
  if (nomes.length < 2) return nomes.join('')
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
}

export function notaDasLojas(publicadas: readonly Loja[]): string {
  if (publicadas.length === 0)
    return 'Chegando às lojas do Chrome, do Firefox, do Edge e do Opera'
  return `${emLista(publicadas.map((loja) => NOME_CURTO[loja]))} · grátis e de código aberto`
}

export function modeloDaLanding(urls: UrlsDasLojas): ModeloDaLanding {
  const lojas = botoesDasLojas(urls)
  return {
    fase: fase(urls),
    lojas,
    notaDasLojas: notaDasLojas(
      lojas.filter((botao) => botao.url !== null).map((botao) => botao.loja),
    ),
  }
}
```

`apps/botai-site/lib/visitante.ts`:

```ts
import { ATALHOS, type Sistema } from '@piluvitu/tools/pilulabs'

export type NavegadorDoVisitante = {
  userAgent: string
  platform?: string
  userAgentData?: { platform?: string }
}
export type AtalhoDoVisitante = { tecla: string; nomeDoSistema: string }

const NOME_DO_SISTEMA: Record<Sistema, string> = {
  windows: 'Windows',
  mac: 'macOS',
  linux: 'Linux',
}

export const VISITANTE_DO_SERVIDOR: { sistema: Sistema; firefox: boolean } = {
  sistema: 'windows',
  firefox: false,
}

export function sistemaDoVisitante(nav: NavegadorDoVisitante): Sistema {
  const plataforma = (
    nav.userAgentData?.platform ||
    nav.platform ||
    nav.userAgent
  ).toLowerCase()
  if (plataforma.includes('mac')) return 'mac'
  if (plataforma.includes('linux') && !/android/i.test(nav.userAgent))
    return 'linux'
  return 'windows'
}

export function ehFirefox(
  nav: Pick<NavegadorDoVisitante, 'userAgent'>,
): boolean {
  return /firefox\//i.test(nav.userAgent)
}

export function atalhoDoVisitante(
  sistema: Sistema,
  firefox: boolean,
): AtalhoDoVisitante {
  return {
    tecla: ATALHOS[firefox ? 'firefox' : 'chrome'][sistema],
    nomeDoSistema: NOME_DO_SISTEMA[sistema],
  }
}
```

`apps/botai-site/lib/capturas.ts`:

```ts
export type Tema = 'escuro' | 'claro'
export type VarianteDaCaptura = { src: string; alt: string }
export type CapturaDaGaleria = {
  numero: string
  titulo: string
  texto: string
  variantes: Record<Tema, VarianteDaCaptura>
}

export const LARGURA_DA_CAPTURA = 1280
export const ALTURA_DA_CAPTURA = 800

const CENAS: {
  titulo: string
  texto: string
  descricao: string
  arquivos: Record<Tema, string>
}[] = [
  {
    titulo: 'Página preenchida',
    texto:
      'Um atalho e o formulário inteiro recebe a mesma pessoa de teste: nome, documentos, endereço do CEP, celular e senha.',
    descricao:
      'Formulário de cadastro preenchido pelo Botaí, com o popup mostrando 12 de 14 campos preenchidos',
    arquivos: {
      escuro: '01-pagina-preenchida-escuro.png',
      claro: '02-pagina-preenchida-claro.png',
    },
  },
  {
    titulo: 'Pessoa de teste',
    texto:
      'O popup mostra a pessoa inteira, separada por grupo, e cada dado tem o seu botão de copiar.',
    descricao:
      'Popup do Botaí com a pessoa de teste separada por grupo e um botão de copiar em cada dado',
    arquivos: {
      escuro: '03-pessoa-de-teste-escuro.png',
      claro: '04-pessoa-de-teste-claro.png',
    },
  },
  {
    titulo: 'Resultado',
    texto:
      'Depois de preencher, o popup mostra quantos campos entraram e leva até os que ficaram de fora.',
    descricao:
      'Popup do Botaí depois de preencher: 12 de 14 campos e os 2 que ficaram de fora',
    arquivos: {
      escuro: '05-resultado-escuro.png',
      claro: '06-resultado-claro.png',
    },
  },
]

function variante(arquivo: string, descricao: string, tema: Tema) {
  return { src: `/capturas/${arquivo}`, alt: `${descricao} (tema ${tema})` }
}

export const CAPTURAS: CapturaDaGaleria[] = CENAS.map((cena, indice) => ({
  numero: String(indice + 1).padStart(2, '0'),
  titulo: cena.titulo,
  texto: cena.texto,
  variantes: {
    escuro: variante(cena.arquivos.escuro, cena.descricao, 'escuro'),
    claro: variante(cena.arquivos.claro, cena.descricao, 'claro'),
  },
}))
```

- [ ] **Step 4: Rode e confirme que passam**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest; echo "jest exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
./node_modules/.bin/eslint .; echo "eslint exit=$?"
```

Expected: todos PASS, os três `exit=0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai-site && /usr/bin/git commit -m "feat(botai-site): lojas e fase lidas do CMS, atalho por sistema e capturas por tema"; echo "exit=$?"
```

---

### Tarefa 4: Componentes de estado (tema, selo, lojas, atalho, tabela)

**Files:**

- Create (`apps/botai-site/`): `lib/font-awesome.ts` (+ `.test.ts`), `components/tema-provider.tsx` (+ `.test.tsx`), `components/botao-tema.tsx` (+ test + stories), `components/selo-fase.tsx` (+ test + stories), `components/lojas-ui.ts`, `components/botoes-loja.tsx` (+ test + stories), `components/atalho-local.tsx` (+ test + stories), `components/tabela-atalhos.tsx` (+ test + stories)
- Modify: `app/globals.css` (CSS do Font Awesome numa camada), `.storybook/preview.tsx` (import do `lib/font-awesome`)

**Interfaces:**

- Consumes: `Fase`, `Loja`, `Sistema`, `ATALHOS` (Tarefa 1); `BotaoDeLoja` (`lib/modelo.ts`), `sistemaDoVisitante`, `ehFirefox`, `atalhoDoVisitante`, `VISITANTE_DO_SERVIDOR` (`lib/visitante.ts`) da Tarefa 3; `Button` de `@piluvitu/ui/button`, `cn` de `@piluvitu/ui/cn`.
- Produces:
  - `TemaProvider({ children }: { children: ReactNode })` (client; `next-themes` com `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`).
  - `BotaoTema()` (client; botão "Alternar tema").
  - `SeloFase({ fase }: { fase: Fase })`.
  - `LOJA_UI: Record<Loja, { rotulo: string; icone: IconDefinition }>`.
  - `BotoesLoja({ lojas, variante, className }: { lojas: BotaoDeLoja[]; variante?: 'default' | 'outline'; className?: string })`.
  - `AtalhoLocal()` (client).
  - `TabelaAtalhos()`.

- [ ] **Step 1: Testes (falham)**

`apps/botai-site/lib/font-awesome.test.ts`:

```ts
import { config } from '@fortawesome/fontawesome-svg-core'
import './font-awesome'

// Injetado em runtime, fora de camada, o CSS do Font Awesome venceria o `hidden` e o `size-*`.
it('o Font Awesome não injeta CSS: ele vem do globals.css, na camada base', () => {
  expect(config.autoAddCss).toBe(false)
})
```

`apps/botai-site/components/tema-provider.test.tsx`:

```tsx
import { config } from '@fortawesome/fontawesome-svg-core'
import { render, screen } from '@testing-library/react'
import { TemaProvider } from './tema-provider'

describe('TemaProvider', () => {
  it('renderiza os filhos', () => {
    render(
      <TemaProvider>
        <p>conteúdo</p>
      </TemaProvider>,
    )
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
  })

  // O provider está em toda página: é ele quem desliga o CSS injetado do Font Awesome no cliente.
  it('desliga o CSS injetado do Font Awesome', () => {
    expect(config.autoAddCss).toBe(false)
  })
})
```

`apps/botai-site/components/botao-tema.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'next-themes'
import { BotaoTema } from './botao-tema'

function renderizar(temaInicial: 'dark' | 'light') {
  return render(
    <ThemeProvider
      attribute="class"
      defaultTheme={temaInicial}
      enableSystem={false}
    >
      <BotaoTema />
    </ThemeProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
})

describe('BotaoTema', () => {
  it('no escuro, troca para o claro e guarda a escolha', async () => {
    renderizar('dark')
    await userEvent.click(screen.getByRole('button', { name: 'Alternar tema' }))
    expect(document.documentElement).toHaveClass('light')
    expect(localStorage.getItem('theme')).toBe('light')
  })

  it('no claro, troca para o escuro', async () => {
    renderizar('light')
    await userEvent.click(screen.getByRole('button', { name: 'Alternar tema' }))
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  // A classe .dark do <html> sai do script do next-themes antes da hidratação: o ícone certo aparece sem piscar.
  it('os dois ícones vêm no HTML, e a classe dark decide qual aparece', () => {
    renderizar('dark')
    const botao = screen.getByRole('button', { name: 'Alternar tema' })
    expect(botao.querySelector('svg[data-icon="moon"]')).toHaveClass(
      'dark:hidden',
    )
    expect(botao.querySelector('svg[data-icon="sun"]')).toHaveClass(
      'hidden',
      'dark:block',
    )
  })
})
```

`apps/botai-site/components/selo-fase.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { SeloFase } from './selo-fase'

describe('SeloFase', () => {
  it('em-breve mostra "Em breve"', () => {
    const { container } = render(<SeloFase fase="em-breve" />)
    expect(container.textContent).toBe('Em breve')
  })

  it('disponivel mostra "Disponível", com o fundo da marca', () => {
    render(<SeloFase fase="disponivel" />)
    expect(screen.getByText('Disponível')).toHaveClass('bg-primary')
  })
})
```

`apps/botai-site/components/botoes-loja.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { BotoesLoja } from './botoes-loja'

const FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'
const LOJAS = [
  { loja: 'chrome', url: null },
  { loja: 'firefox', url: FIREFOX },
  { loja: 'edge', url: null },
  { loja: 'opera', url: null },
] as const

describe('BotoesLoja', () => {
  it('uma lista "Instalar pela loja" com as 4 lojas, na ordem recebida', () => {
    render(<BotoesLoja lojas={[...LOJAS]} />)
    const lista = screen.getByRole('list', { name: 'Instalar pela loja' })
    expect(
      within(lista)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      'Chrome Web Store Em breve',
      'Firefox Add-ons',
      'Microsoft Edge Add-ons Em breve',
      'Opera add-ons Em breve',
    ])
  })

  it('loja publicada: link para a loja, em aba nova', () => {
    render(<BotoesLoja lojas={[...LOJAS]} />)
    const link = screen.getByRole('link', { name: 'Firefox Add-ons' })
    expect(link).toHaveAttribute('href', FIREFOX)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // O href="#" do protótipo não vai para produção.
  it('loja sem URL: botão "Em breve" desabilitado, sem link', () => {
    const { container } = render(<BotoesLoja lojas={[...LOJAS]} />)
    expect(
      screen.getByRole('button', { name: 'Chrome Web Store Em breve' }),
    ).toBeDisabled()
    expect(container.querySelectorAll('a')).toHaveLength(1)
    expect(container.querySelector('a[href="#"]')).toBeNull()
  })

  it('variante outline, para o bloco de instalar', () => {
    render(<BotoesLoja lojas={[...LOJAS]} variante="outline" />)
    expect(screen.getByRole('link', { name: 'Firefox Add-ons' })).toHaveClass(
      'border-input',
    )
  })

  // A 320 px, "Microsoft Edge Add-ons Em breve" numa linha só (278 px) passa da lista (272 px) e
  // invade o gutter; o scrollWidth da página não acusa. O botão quebra o texto em vez de vazar.
  it('o botão quebra linha em vez de passar da largura da lista', () => {
    render(<BotoesLoja lojas={[...LOJAS]} />)
    for (const botao of [
      screen.getByRole('button', { name: 'Microsoft Edge Add-ons Em breve' }),
      screen.getByRole('link', { name: 'Firefox Add-ons' }),
    ]) {
      expect(botao).toHaveClass('whitespace-normal', 'max-w-full', 'min-h-10')
      expect(botao).not.toHaveClass('whitespace-nowrap')
    }
  })
})
```

`apps/botai-site/components/atalho-local.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { AtalhoLocal } from './atalho-local'

const FIREFOX_LINUX =
  'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0'

function simular(plataforma: string, userAgent = 'Mozilla/5.0') {
  jest.spyOn(navigator, 'platform', 'get').mockReturnValue(plataforma)
  jest.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
}

afterEach(() => {
  jest.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('AtalhoLocal', () => {
  it('o HTML do servidor traz o atalho do Windows', () => {
    simular('MacIntel')
    const raiz = document.createElement('div')
    raiz.innerHTML = renderToString(<AtalhoLocal />)
    expect(raiz.textContent).toBe('Ctrl+Shift+Y preenche a página no Windows')
  })

  // useSyncExternalStore: hidrata com o valor do servidor e só então troca, sem erro de hidratação.
  it('no Mac, depois da hidratação, ⌥⇧P e macOS, sem erro', async () => {
    simular('MacIntel')
    const raiz = document.createElement('div')
    raiz.innerHTML = renderToString(<AtalhoLocal />)
    document.body.append(raiz)
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {})
    await act(async () => {
      hydrateRoot(raiz, <AtalhoLocal />)
    })
    expect(raiz.textContent).toBe('⌥⇧P preenche a página no macOS')
    expect(erro).not.toHaveBeenCalled()
  })

  it('Firefox no Linux: Alt+Shift+P', () => {
    simular('Linux x86_64', FIREFOX_LINUX)
    render(<AtalhoLocal />)
    expect(screen.getByText('Alt+Shift+P').tagName).toBe('KBD')
  })
})
```

`apps/botai-site/components/tabela-atalhos.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { TabelaAtalhos } from './tabela-atalhos'

const LEGENDA = 'Atalho para preencher a página, por navegador e sistema'

describe('TabelaAtalhos', () => {
  it('tem legenda para leitor de tela', () => {
    render(<TabelaAtalhos />)
    expect(screen.getByRole('table', { name: LEGENDA })).toBeInTheDocument()
  })

  // A 320 px a tabela (~426 px) rola dentro da moldura. Sem foco nela, quem usa teclado não rola,
  // e o axe acusa scrollable-region-focusable (serious, WCAG 2.1.1).
  it('a moldura que rola é uma região focável, com o nome da legenda', () => {
    render(<TabelaAtalhos />)
    const regiao = screen.getByRole('region', { name: LEGENDA })
    expect(regiao).toHaveAttribute('tabindex', '0')
    expect(regiao).toHaveClass('overflow-x-auto', 'focus-visible:ring-2')
  })

  it('colunas de navegador, Windows, macOS e Linux', () => {
    render(<TabelaAtalhos />)
    expect(
      screen.getAllByRole('columnheader').map((th) => th.textContent),
    ).toEqual(['Navegador', 'Windows', 'macOS', 'Linux'])
  })

  // É o que a página publica: o Firefox no Linux é a exceção do manifesto.
  it('uma linha por navegador, com o atalho de cada sistema', () => {
    render(<TabelaAtalhos />)
    const [, ...linhas] = screen.getAllByRole('row')
    expect(
      linhas.map((linha) =>
        [...linha.querySelectorAll('th, td')].map((c) => c.textContent),
      ),
    ).toEqual([
      ['Chrome', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Edge', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Opera', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Firefox', 'Ctrl+Shift+Y', '⌥⇧P', 'Alt+Shift+P'],
    ])
  })
})
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest components lib/font-awesome; echo "exit=$?"`
Expected: os 7 arquivos novos FAIL (`Cannot find module`), `exit=1`.

- [ ] **Step 2: Implemente**

`apps/botai-site/lib/font-awesome.ts`:

```ts
import { config } from '@fortawesome/fontawesome-svg-core'

// O CSS do Font Awesome entra pelo globals.css, na camada base: injetado em runtime, fora de camada, venceria o `hidden` e o `size-*`.
config.autoAddCss = false
```

`apps/botai-site/app/globals.css`: logo depois de `@import 'tailwindcss';`, acrescente

```css
@import '@fortawesome/fontawesome-svg-core/styles.css' layer(base);
```

`apps/botai-site/.storybook/preview.tsx`: acrescente `import '../lib/font-awesome'` logo depois do `import '../app/globals.css'`.

`apps/botai-site/components/tema-provider.tsx`:

```tsx
'use client'

import '@/lib/font-awesome'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'

export function TemaProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </ThemeProvider>
  )
}
```

`apps/botai-site/components/botao-tema.tsx`:

```tsx
'use client'

import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useTheme } from 'next-themes'

export function BotaoTema() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <button
      type="button"
      aria-label="Alternar tema"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="border-input bg-background text-foreground hover:bg-accent focus-visible:ring-ring inline-flex size-9 cursor-pointer items-center justify-center rounded-md border outline-none focus-visible:ring-2"
    >
      <FontAwesomeIcon icon={faMoon} className="size-3.5 dark:hidden" />
      <FontAwesomeIcon icon={faSun} className="hidden size-3.5 dark:block" />
    </button>
  )
}
```

`apps/botai-site/components/selo-fase.tsx`:

```tsx
import type { Fase } from '@piluvitu/tools/pilulabs'
import { cn } from '@piluvitu/ui/cn'

const ROTULO: Record<Fase, string> = {
  'em-breve': 'Em breve',
  disponivel: 'Disponível',
}

export function SeloFase({ fase }: { fase: Fase }) {
  const disponivel = fase === 'disponivel'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm',
        disponivel
          ? 'bg-primary text-primary-foreground border-transparent font-medium'
          : 'border-border text-muted-foreground',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-1.5 rounded-full',
          disponivel ? 'bg-primary-foreground' : 'bg-warn',
        )}
      />
      {ROTULO[fase]}
    </span>
  )
}
```

`apps/botai-site/components/lojas-ui.ts`:

```ts
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faChrome,
  faEdge,
  faFirefoxBrowser,
  faOpera,
} from '@fortawesome/free-brands-svg-icons'
import type { Loja } from '@piluvitu/tools/pilulabs'

export const LOJA_UI: Record<Loja, { rotulo: string; icone: IconDefinition }> =
  {
    chrome: { rotulo: 'Chrome Web Store', icone: faChrome },
    firefox: { rotulo: 'Firefox Add-ons', icone: faFirefoxBrowser },
    edge: { rotulo: 'Microsoft Edge Add-ons', icone: faEdge },
    opera: { rotulo: 'Opera add-ons', icone: faOpera },
  }
```

`apps/botai-site/components/botoes-loja.tsx`:

```tsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import type { BotaoDeLoja } from '@/lib/modelo'
import { LOJA_UI } from './lojas-ui'

type BotoesLojaProps = {
  lojas: BotaoDeLoja[]
  variante?: 'default' | 'outline'
  className?: string
}

const BOTAO = 'h-auto min-h-10 max-w-full gap-2 px-5 py-2 whitespace-normal'

export function BotoesLoja({
  lojas,
  variante = 'default',
  className,
}: BotoesLojaProps) {
  return (
    <ul
      aria-label="Instalar pela loja"
      className={cn('flex flex-wrap gap-3', className)}
    >
      {lojas.map(({ loja, url }) => {
        const { rotulo, icone } = LOJA_UI[loja]
        return (
          <li key={loja} className="max-w-full">
            {url ? (
              <Button asChild variant={variante} size="lg" className={BOTAO}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <FontAwesomeIcon icon={icone} className="size-4" />
                  {rotulo}
                </a>
              </Button>
            ) : (
              <Button variant={variante} size="lg" className={BOTAO} disabled>
                <FontAwesomeIcon icon={icone} className="size-4" />
                {rotulo} <span className="font-mono text-xs">Em breve</span>
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
```

(O `Button` passa a classe pelo `cn`, que usa o `tailwind-merge`: `h-auto` e `whitespace-normal` substituem o `h-10` do `size="lg"` e o `whitespace-nowrap` da base. Com espaço, nada quebra e o desktop fica igual ao design.)

`apps/botai-site/components/atalho-local.tsx`:

```tsx
'use client'

import { useSyncExternalStore } from 'react'
import {
  atalhoDoVisitante,
  ehFirefox,
  sistemaDoVisitante,
  VISITANTE_DO_SERVIDOR,
} from '@/lib/visitante'

const semInscricao = () => () => {}

export function AtalhoLocal() {
  const sistema = useSyncExternalStore(
    semInscricao,
    () => sistemaDoVisitante(navigator),
    () => VISITANTE_DO_SERVIDOR.sistema,
  )
  const firefox = useSyncExternalStore(
    semInscricao,
    () => ehFirefox(navigator),
    () => VISITANTE_DO_SERVIDOR.firefox,
  )
  const { tecla, nomeDoSistema } = atalhoDoVisitante(sistema, firefox)
  return (
    <span className="inline-flex items-center gap-1.5">
      <kbd className="border-border bg-muted text-foreground rounded-[6px] border px-1.5 py-0.5 font-mono text-xs">
        {tecla}
      </kbd>{' '}
      preenche a página no {nomeDoSistema}
    </span>
  )
}
```

`apps/botai-site/components/tabela-atalhos.tsx`:

```tsx
import { ATALHOS, type Loja, type Sistema } from '@piluvitu/tools/pilulabs'

const NAVEGADORES: { loja: Loja; nome: string }[] = [
  { loja: 'chrome', nome: 'Chrome' },
  { loja: 'edge', nome: 'Edge' },
  { loja: 'opera', nome: 'Opera' },
  { loja: 'firefox', nome: 'Firefox' },
]

const SISTEMAS: { sistema: Sistema; nome: string }[] = [
  { sistema: 'windows', nome: 'Windows' },
  { sistema: 'mac', nome: 'macOS' },
  { sistema: 'linux', nome: 'Linux' },
]

const LEGENDA = 'tabela-atalhos-legenda'

export function TabelaAtalhos() {
  return (
    <div
      role="region"
      aria-labelledby={LEGENDA}
      tabIndex={0}
      className="bg-card border-border focus-visible:ring-ring overflow-x-auto rounded-lg border outline-none focus-visible:ring-2"
    >
      <table className="w-full border-collapse text-sm">
        <caption id={LEGENDA} className="sr-only">
          Atalho para preencher a página, por navegador e sistema
        </caption>
        <thead>
          <tr className="text-muted-foreground font-mono text-xs uppercase">
            <th scope="col" className="px-4 py-3 text-left font-semibold">
              Navegador
            </th>
            {SISTEMAS.map(({ sistema, nome }) => (
              <th
                key={sistema}
                scope="col"
                className="px-4 py-3 text-left font-semibold"
              >
                {nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {NAVEGADORES.map(({ loja, nome }) => (
            <tr key={loja} className="border-border border-t">
              <th scope="row" className="px-4 py-3 text-left font-medium">
                {nome}
              </th>
              {SISTEMAS.map(({ sistema }) => (
                <td key={sistema} className="px-4 py-3">
                  <kbd className="bg-muted rounded-[6px] px-1.5 py-0.5 font-mono text-xs">
                    {ATALHOS[loja][sistema]}
                  </kbd>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

(`rounded-[6px]` nos dois `kbd`, como o `.dc.html` (`border-radius: 6px`): no `@piluvitu/ui` o `rounded-md` vale `--radius` − 2 px = 16 px e viraria pílula. O anel de foco da moldura só aparece pelo teclado.)

- [ ] **Step 3: Stories**

`apps/botai-site/components/botao-tema.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { BotaoTema } from './botao-tema'

const meta = {
  title: 'Landing/BotaoTema',
  component: BotaoTema,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof BotaoTema>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
```

`apps/botai-site/components/selo-fase.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { SeloFase } from './selo-fase'

const meta = {
  title: 'Landing/SeloFase',
  component: SeloFase,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SeloFase>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: { fase: 'em-breve' } }
export const Disponivel: Story = { args: { fase: 'disponivel' } }
export const DisponivelClaro: Story = {
  args: { fase: 'disponivel' },
  globals: { tema: 'claro' },
}
```

`apps/botai-site/components/botoes-loja.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { botoesDasLojas } from '@/lib/modelo'
import { BotoesLoja } from './botoes-loja'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }
const NAS_QUATRO = {
  chromeUrl: 'https://chromewebstore.google.com/detail/botai/abc',
  firefoxUrl: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/',
  edgeUrl: 'https://microsoftedge.microsoft.com/addons/detail/botai/xyz',
  operaUrl: 'https://addons.opera.com/pt-br/extensions/details/botai/',
}

const meta = {
  title: 'Landing/BotoesLoja',
  component: BotoesLoja,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof BotoesLoja>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: { lojas: botoesDasLojas(SEM_LOJA) } }
export const SoFirefox: Story = {
  args: {
    lojas: botoesDasLojas({ ...SEM_LOJA, firefoxUrl: NAS_QUATRO.firefoxUrl }),
  },
}
export const NasQuatro: Story = { args: { lojas: botoesDasLojas(NAS_QUATRO) } }
export const Outline: Story = {
  args: { lojas: botoesDasLojas(NAS_QUATRO), variante: 'outline' },
}
```

`apps/botai-site/components/atalho-local.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { AtalhoLocal } from './atalho-local'

// Mostra o atalho do sistema de quem abre o Storybook.
const meta = {
  title: 'Landing/AtalhoLocal',
  component: AtalhoLocal,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AtalhoLocal>

export default meta
type Story = StoryObj<typeof meta>

export const DoSistemaAtual: Story = {}
```

`apps/botai-site/components/tabela-atalhos.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { TabelaAtalhos } from './tabela-atalhos'

const meta = {
  title: 'Landing/TabelaAtalhos',
  component: TabelaAtalhos,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof TabelaAtalhos>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
```

- [ ] **Step 4: Rode tudo**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest; echo "jest exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
pnpm run build; echo "build exit=$?"
```

Expected: todos `exit=0` (o build prova que o `@import … layer(base)` do Font Awesome resolve pelo `exports` do pacote).

- [ ] **Step 5: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai-site && /usr/bin/git commit -m "feat(botai-site): tema que lembra a escolha, selo de fase, botões de loja, atalho de quem visita e tabela de atalhos"; echo "exit=$?"
```

---

### Tarefa 5: Componentes de mídia e moldura (capturas por tema, abas, topo, rodapé)

**Files:**

- Create (`apps/botai-site/components/`): `imagem-por-tema.tsx`, `capturas-abas.tsx`, `topo.tsx`, `rodape.tsx` (cada um com `.test.tsx` e `.stories.tsx`)

**Interfaces:**

- Consumes: `CAPTURAS`, `CapturaDaGaleria`, `Tema`, `VarianteDaCaptura`, `LARGURA_DA_CAPTURA`, `ALTURA_DA_CAPTURA` (`lib/capturas.ts`); `URL_DA_PILUTECH`, `EMAIL_DE_SUPORTE` (`lib/conteudo.ts`); `BotaoTema` (Tarefa 4).
- Produces:
  - `ImagemPorTema({ variantes, sizes, destaque }: { variantes: Record<Tema, VarianteDaCaptura>; sizes: string; destaque?: boolean })` — duas `next/image` lazy, uma por tema, escondidas pela classe `.dark`; `destaque` põe `fetchPriority="high"` (Next 16: `loading="eager"`/`preload` baixariam as duas, ver "Theme detection" em `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`).
  - `CapturasAbas({ capturas, rotuladoPor }: { capturas: CapturaDaGaleria[]; rotuladoPor: string })` (client; tabs WAI-ARIA com ativação automática, setas, Home e End, foco itinerante; um `tabpanel` por captura, `painel-captura-NN`, todos no HTML do servidor e os inativos com `hidden`).
  - `type LinkDoTopo = { href: string; rotulo: string }`; `Topo({ voltar, ancoras }: { voltar: LinkDoTopo; ancoras?: LinkDoTopo[] })`.
  - `Rodape()`.

- [ ] **Step 1: Testes (falham)**

`apps/botai-site/components/imagem-por-tema.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { CAPTURAS } from '@/lib/capturas'
import { ImagemPorTema } from './imagem-por-tema'

const [PRIMEIRA] = CAPTURAS

function imagens(destaque?: boolean) {
  const { container } = render(
    <ImagemPorTema
      variantes={PRIMEIRA.variantes}
      sizes="100vw"
      destaque={destaque}
    />,
  )
  return [...container.querySelectorAll('img')]
}

describe('ImagemPorTema', () => {
  // Segue a classe .dark do <html> (a escolha de quem visita), não o prefers-color-scheme.
  it('as duas variantes vêm no HTML, e a classe dark decide qual aparece', () => {
    const [claro, escuro] = imagens()
    expect(claro).toHaveAttribute('alt', PRIMEIRA.variantes.claro.alt)
    expect(claro).toHaveClass('dark:hidden')
    expect(escuro).toHaveAttribute('alt', PRIMEIRA.variantes.escuro.alt)
    expect(escuro).toHaveClass('hidden', 'dark:block')
  })

  // Imagem lazy com display:none não é baixada: só a variante do tema ativo sai pela rede.
  it('nenhuma variante é eager, nem a do topo', () => {
    for (const img of [...imagens(), ...imagens(true)])
      expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('na captura do topo (o LCP), as duas pedem prioridade alta', () => {
    for (const img of imagens(true))
      expect(img).toHaveAttribute('fetchpriority', 'high')
  })

  it('fora do topo, sem prioridade', () => {
    for (const img of imagens())
      expect(img).not.toHaveAttribute('fetchpriority')
  })
})
```

`apps/botai-site/components/capturas-abas.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { CAPTURAS } from '@/lib/capturas'
import { CapturasAbas } from './capturas-abas'

function renderizar() {
  render(<CapturasAbas capturas={CAPTURAS} rotuladoPor="capturas-heading" />)
  return screen.getAllByRole('tab')
}

// O Google não interage com a página ("Google Search does not interact with your page", Search Central,
// "Fix lazy-loaded content"): o texto das cenas 02 e 03 só é indexado se vier no HTML, mesmo escondido.
it('os três painéis vêm no HTML do servidor, e só o ativo aparece', () => {
  const raiz = document.createElement('div')
  raiz.innerHTML = renderToString(
    <CapturasAbas capturas={CAPTURAS} rotuladoPor="capturas-heading" />,
  )
  const paineis = [...raiz.querySelectorAll('[role="tabpanel"]')]
  expect(paineis.map((p) => p.querySelector('h3')?.textContent)).toEqual(
    CAPTURAS.map((c) => c.titulo),
  )
  paineis.forEach((painel, indice) =>
    expect(painel.textContent).toContain(CAPTURAS[indice].texto),
  )
  expect(paineis.map((p) => p.hasAttribute('hidden'))).toEqual([
    false,
    true,
    true,
  ])
})

describe('CapturasAbas', () => {
  it('3 abas; a primeira selecionada e a única no Tab', () => {
    const abas = renderizar()
    expect(abas.map((a) => a.textContent)).toEqual([
      '01 · Página preenchida',
      '02 · Pessoa de teste',
      '03 · Resultado',
    ])
    expect(abas.map((a) => a.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(abas.map((a) => a.tabIndex)).toEqual([0, -1, -1])
    expect(screen.getByRole('tablist')).toHaveAttribute(
      'aria-labelledby',
      'capturas-heading',
    )
  })

  it('cada aba controla o próprio painel', () => {
    const abas = renderizar()
    expect(abas.map((a) => a.getAttribute('aria-controls'))).toEqual([
      'painel-captura-01',
      'painel-captura-02',
      'painel-captura-03',
    ])
  })

  // O painel escondido (atributo hidden) sai da árvore de acessibilidade: getByRole só acha o ativo.
  it('o painel visível é o da aba ativa, rotulado por ela, com a cena dela', async () => {
    const abas = renderizar()
    await userEvent.click(abas[1])
    const painel = screen.getByRole('tabpanel')
    expect(painel).toHaveAttribute('aria-labelledby', abas[1].id)
    expect(abas[1]).toHaveAttribute('aria-controls', painel.id)
    expect(
      screen.getByRole('heading', { level: 3, name: 'Pessoa de teste' }),
    ).toBeInTheDocument()
    expect(painel).toHaveTextContent('02 / 03')
  })

  it('setas, Home e End mudam a aba e o foco, dando a volta', async () => {
    const usuario = userEvent.setup()
    const abas = renderizar()
    await usuario.click(abas[0])
    await usuario.keyboard('{ArrowRight}')
    expect(abas[1]).toHaveFocus()
    expect(abas[1]).toHaveAttribute('aria-selected', 'true')
    await usuario.keyboard('{End}')
    expect(abas[2]).toHaveFocus()
    await usuario.keyboard('{ArrowRight}')
    expect(abas[0]).toHaveFocus()
    await usuario.keyboard('{ArrowLeft}')
    expect(abas[2]).toHaveFocus()
    await usuario.keyboard('{Home}')
    expect(abas[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('Tab sai das abas para o painel', async () => {
    const usuario = userEvent.setup()
    const abas = renderizar()
    await usuario.click(abas[0])
    await usuario.tab()
    expect(screen.getByRole('tabpanel')).toHaveFocus()
  })
})
```

`apps/botai-site/components/topo.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { Topo } from './topo'

describe('Topo', () => {
  it('voltar, âncoras e o botão de tema, numa navegação', () => {
    render(
      <Topo
        voltar={{ href: 'https://pilutech.com.br', rotulo: 'PiluLabs' }}
        ancoras={[
          { href: '#como-usar', rotulo: 'como usar' },
          { href: '#capturas', rotulo: 'capturas' },
        ]}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Topo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'PiluLabs' })).toHaveAttribute(
      'href',
      'https://pilutech.com.br',
    )
    expect(screen.getByRole('link', { name: 'como usar' })).toHaveAttribute(
      'href',
      '#como-usar',
    )
    expect(screen.getByRole('link', { name: 'capturas' })).toHaveAttribute(
      'href',
      '#capturas',
    )
    expect(
      screen.getByRole('button', { name: 'Alternar tema' }),
    ).toBeInTheDocument()
  })

  // A 320 px o voltar, as âncoras e o botão não cabem numa linha.
  it('quebra linha em tela estreita', () => {
    render(<Topo voltar={{ href: '/', rotulo: 'Botaí' }} />)
    expect(screen.getByRole('navigation')).toHaveClass('flex-wrap')
  })
})
```

`apps/botai-site/components/rodape.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { Rodape } from './rodape'

describe('Rodape', () => {
  it('é o contentinfo, com Powered by PiluTech e o suporte por e-mail', () => {
    render(<Rodape />)
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Powered by PiluTech' }),
    ).toHaveAttribute('href', 'https://pilutech.com.br')
    expect(screen.getByRole('link', { name: 'Suporte' })).toHaveAttribute(
      'href',
      'mailto:pilutechinformatica@gmail.com',
    )
  })
})
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest components/imagem-por-tema components/capturas-abas components/topo components/rodape; echo "exit=$?"`
Expected: 4 arquivos FAIL (`Cannot find module`), `exit=1`.

- [ ] **Step 2: Implemente**

`apps/botai-site/components/imagem-por-tema.tsx`:

```tsx
import { cn } from '@piluvitu/ui/cn'
import Image from 'next/image'
import {
  ALTURA_DA_CAPTURA,
  LARGURA_DA_CAPTURA,
  type Tema,
  type VarianteDaCaptura,
} from '@/lib/capturas'

type ImagemPorTemaProps = {
  variantes: Record<Tema, VarianteDaCaptura>
  sizes: string
  destaque?: boolean
}

const VISIVEL_NO: Record<Tema, string> = {
  claro: 'block dark:hidden',
  escuro: 'hidden dark:block',
}

export function ImagemPorTema({
  variantes,
  sizes,
  destaque = false,
}: ImagemPorTemaProps) {
  return (
    <>
      {(['claro', 'escuro'] as const).map((tema) => (
        <Image
          key={tema}
          src={variantes[tema].src}
          alt={variantes[tema].alt}
          width={LARGURA_DA_CAPTURA}
          height={ALTURA_DA_CAPTURA}
          sizes={sizes}
          className={cn('h-auto w-full', VISIVEL_NO[tema])}
          {...(destaque ? { fetchPriority: 'high' as const } : {})}
        />
      ))}
    </>
  )
}
```

`apps/botai-site/components/capturas-abas.tsx`:

```tsx
'use client'

import { cn } from '@piluvitu/ui/cn'
import { useRef, useState, type KeyboardEvent } from 'react'
import type { CapturaDaGaleria } from '@/lib/capturas'
import { ImagemPorTema } from './imagem-por-tema'

type CapturasAbasProps = {
  capturas: CapturaDaGaleria[]
  rotuladoPor: string
}

const PROXIMA: Record<string, (atual: number, total: number) => number> = {
  ArrowRight: (atual, total) => (atual + 1) % total,
  ArrowLeft: (atual, total) => (atual - 1 + total) % total,
  Home: () => 0,
  End: (_atual, total) => total - 1,
}

const idDaAba = (captura: CapturaDaGaleria) => `aba-captura-${captura.numero}`
const idDoPainel = (captura: CapturaDaGaleria) =>
  `painel-captura-${captura.numero}`

export function CapturasAbas({ capturas, rotuladoPor }: CapturasAbasProps) {
  const [ativa, setAtiva] = useState(0)
  const abas = useRef<(HTMLButtonElement | null)[]>([])
  const total = String(capturas.length).padStart(2, '0')

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>) {
    const proxima = PROXIMA[evento.key]?.(ativa, capturas.length)
    if (proxima === undefined) return
    evento.preventDefault()
    setAtiva(proxima)
    abas.current[proxima]?.focus()
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-labelledby={rotuladoPor}
        className="flex flex-wrap gap-2"
      >
        {capturas.map((item, indice) => {
          const selecionada = indice === ativa
          return (
            <button
              key={item.numero}
              ref={(elemento) => {
                abas.current[indice] = elemento
              }}
              type="button"
              role="tab"
              id={idDaAba(item)}
              aria-selected={selecionada}
              aria-controls={idDoPainel(item)}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => setAtiva(indice)}
              onKeyDown={aoTeclar}
              className={cn(
                'focus-visible:ring-ring cursor-pointer rounded-full border px-3.5 py-2 font-mono text-[13px] transition-colors outline-none focus-visible:ring-2',
                selecionada
                  ? 'bg-accent-soft border-accent-line text-primary'
                  : 'border-border text-muted-foreground',
              )}
            >
              {item.numero} · {item.titulo}
            </button>
          )
        })}
      </div>
      {capturas.map((captura, indice) => (
        <div
          key={captura.numero}
          role="tabpanel"
          id={idDoPainel(captura)}
          aria-labelledby={idDaAba(captura)}
          hidden={indice !== ativa}
          tabIndex={0}
          className="focus-visible:ring-ring flex flex-wrap items-center gap-6 rounded-lg outline-none focus-visible:ring-2"
        >
          <div className="bg-card border-border min-w-0 flex-[2_1_480px] overflow-hidden rounded-lg border">
            <ImagemPorTema
              variantes={captura.variantes}
              sizes="(min-width: 1080px) 640px, calc(100vw - 48px)"
            />
          </div>
          <div className="flex flex-[1_1_240px] flex-col gap-2.5">
            <p className="text-primary font-mono text-xs">
              {captura.numero} / {total}
            </p>
            <h3 className="text-2xl leading-[1.2] font-bold tracking-[-0.02em] text-balance">
              {captura.titulo}
            </h3>
            <p className="text-muted-foreground text-base leading-[1.55] text-pretty">
              {captura.texto}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
```

Todos os painéis saem no HTML, e o atributo `hidden` esconde os inativos (o preflight do Tailwind 4 tem `[hidden] { display: none !important }`, então o `flex` não o vence). As imagens dos painéis escondidos são lazy com `display: none` e não são baixadas, então o teste de rede da Tarefa 6 continua valendo. O `h3` usa `leading-[1.2]`, do `.dc.html`, e não `leading-tight` (1,25).

`apps/botai-site/components/topo.tsx`:

```tsx
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Link from 'next/link'
import { BotaoTema } from './botao-tema'

export type LinkDoTopo = { href: string; rotulo: string }

type TopoProps = { voltar: LinkDoTopo; ancoras?: LinkDoTopo[] }

export function Topo({ voltar, ancoras = [] }: TopoProps) {
  return (
    <nav
      aria-label="Topo"
      className="flex flex-wrap items-center justify-between gap-4"
    >
      <Link
        href={voltar.href}
        className="text-foreground inline-flex items-center gap-2 font-mono text-sm hover:underline"
      >
        <FontAwesomeIcon
          icon={faArrowLeft}
          className="text-primary size-[13px]"
        />
        {voltar.rotulo}
      </Link>
      <div className="flex items-center gap-2">
        {ancoras.map((ancora) => (
          <a
            key={ancora.href}
            href={ancora.href}
            className="text-muted-foreground px-2.5 py-2 font-mono text-[13px] hover:underline"
          >
            {ancora.rotulo}
          </a>
        ))}
        <BotaoTema />
      </div>
    </nav>
  )
}
```

`apps/botai-site/components/rodape.tsx`:

```tsx
import { faEnvelope } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { EMAIL_DE_SUPORTE, URL_DA_PILUTECH } from '@/lib/conteudo'

export function Rodape() {
  return (
    <footer className="border-border mt-[72px] flex flex-wrap items-center justify-between gap-4 border-t pt-6">
      <a
        href={URL_DA_PILUTECH}
        className="text-muted-foreground font-mono text-xs hover:underline"
      >
        Powered by PiluTech
      </a>
      <Button asChild variant="outline" className="gap-2">
        <a href={`mailto:${EMAIL_DE_SUPORTE}`}>
          <FontAwesomeIcon icon={faEnvelope} className="size-[13px]" />
          Suporte
        </a>
      </Button>
    </footer>
  )
}
```

- [ ] **Step 3: Stories**

`apps/botai-site/components/imagem-por-tema.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { CAPTURAS } from '@/lib/capturas'
import { ImagemPorTema } from './imagem-por-tema'

const meta = {
  title: 'Landing/ImagemPorTema',
  component: ImagemPorTema,
  parameters: { layout: 'padded' },
  args: { variantes: CAPTURAS[0].variantes, sizes: '100vw' },
} satisfies Meta<typeof ImagemPorTema>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
```

`apps/botai-site/components/capturas-abas.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { CAPTURAS } from '@/lib/capturas'
import { CapturasAbas } from './capturas-abas'

const meta = {
  title: 'Landing/CapturasAbas',
  component: CapturasAbas,
  parameters: { layout: 'padded' },
  args: { capturas: CAPTURAS, rotuladoPor: 'capturas-heading' },
} satisfies Meta<typeof CapturasAbas>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
```

`apps/botai-site/components/topo.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Topo } from './topo'

const meta = {
  title: 'Landing/Topo',
  component: Topo,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Topo>

export default meta
type Story = StoryObj<typeof meta>

export const DaLanding: Story = {
  args: {
    voltar: { href: 'https://pilutech.com.br', rotulo: 'PiluLabs' },
    ancoras: [
      { href: '#como-usar', rotulo: 'como usar' },
      { href: '#capturas', rotulo: 'capturas' },
    ],
  },
}
export const DaPolitica: Story = {
  args: { voltar: { href: '/', rotulo: 'Botaí' } },
}
```

`apps/botai-site/components/rodape.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Rodape } from './rodape'

const meta = {
  title: 'Landing/Rodape',
  component: Rodape,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Rodape>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
```

- [ ] **Step 4: Rode tudo**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest; echo "jest exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
```

Expected: os quatro `exit=0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai-site && /usr/bin/git commit -m "feat(botai-site): capturas que seguem o tema, abas WAI-ARIA, topo e rodapé"; echo "exit=$?"
```

---

### Tarefa 6: A página `/`, fiel ao design

`Landing` monta as seções na ordem do design com os componentes das Tarefas 4 e 5; `app/page.tsx` lê o CMS e passa o modelo. Um `h1` só: a proposta, com o nome em texto só para leitor de tela, porque o nome grande do design fica numa linha com o selo e não pode virar parte do título; assim o visual não muda. O layout ganha o `TemaProvider`.

O CMS real tem hoje as 4 URLs vazias, então o `pagina.e2e.ts` só exercita o "Em breve". A spec §8 pede Playwright com "botões de loja com e sem URL": um segundo config do Playwright (`playwright.lojas.config.ts`) builda a landing com um YAML de teste (`BOTAI_CMS_ITEM`, Tarefa 3) e roda `app/lojas-publicadas.e2e.ts` contra esse build. Ele roda **antes** do config principal e na mesma pasta `.next`, de propósito: um `distDir` à parte faria o `next build` acrescentar `<distDir>/types/**/*.ts` ao `include` do `tsconfig.json` (`getTypeDefinitionGlobPatterns(distDir)` em `next/dist/lib/typescript/writeConfigurationDefaults.js`) e pediria entradas novas de `.gitignore`/ESLint/Jest; em sequência, o build do config principal sobrescreve o de teste e o `.next` termina com o CMS real.

**Files:**

- Create (`apps/botai-site/`): `components/landing.tsx`, `components/landing.test.tsx`, `components/landing.stories.tsx`, `playwright.lojas.config.ts`, `app/lojas-publicadas.yaml`, `app/lojas-publicadas.e2e.ts`
- Modify: `app/page.tsx`, `app/layout.tsx`, `app/pagina.e2e.ts`, `playwright.config.ts` (`testIgnore`), `package.json` (`test:e2e`)

**Interfaces:**

- Consumes: `ModeloDaLanding`, `modeloDaLanding` (`lib/modelo.ts`), `lerUrlsDasLojas` (`lib/cms.ts`), `CAPTURAS`, `NOME`, `PROPOSTA`, `RECURSOS`, `REQUISITOS`, `URL_DA_PILUTECH`, e os componentes `AtalhoLocal`, `BotoesLoja`, `CabecalhoSecao`, `CapturasAbas`, `ImagemPorTema`, `Rodape`, `SeloFase`, `TabelaAtalhos`, `Topo`, `TemaProvider`, `LOJA_UI`.
- Produces: `Landing(props: ModeloDaLanding)`; ids de seção `porque-heading`, `recursos-heading`, `capturas` + `capturas-heading`, `como-usar` + `uso-heading`, `privacidade-heading`, `cuidados-heading`, `instalar-heading` (o JSON-LD e o E2E da Tarefa 8 contam com eles).

- [ ] **Step 1: Teste do componente (falha)**

`apps/botai-site/components/landing.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { modeloDaLanding } from '@/lib/modelo'
import { Landing } from './landing'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }
const FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'

function renderizar(urls = SEM_LOJA) {
  return render(<Landing {...modeloDaLanding(urls)} />)
}

describe('Landing', () => {
  // Um h1 com o nome e a proposta; o nome grande do design não é título.
  it('um único h1, com o nome e a proposta', () => {
    renderizar()
    const [h1, ...outros] = screen.getAllByRole('heading', { level: 1 })
    expect(outros).toEqual([])
    expect(h1).toHaveTextContent(
      'Botaí: Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    )
  })

  it('as seções na ordem do design', () => {
    renderizar()
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Por que existe',
      'O que ele bota',
      'Capturas',
      'Como usar',
      'Privacidade',
      'Cuidados',
      'Bota aí no seu navegador',
    ])
  })

  it('as âncoras do topo levam a seções que existem', () => {
    renderizar()
    for (const alvo of ['como-usar', 'capturas'])
      expect(document.getElementById(alvo)).not.toBeNull()
  })

  it('em breve: selo, nota e as 4 lojas desabilitadas nos dois blocos', () => {
    renderizar()
    // "Em breve" aparece no selo e dentro de cada botão de loja sem URL.
    expect(
      screen.getAllByText('Em breve').filter((el) => !el.closest('button')),
    ).toHaveLength(1)
    expect(
      screen.getByText(
        'Chegando às lojas do Chrome, do Firefox, do Edge e do Opera',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByRole('list', { name: 'Instalar pela loja' }),
    ).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /Em breve$/ })).toHaveLength(8)
    expect(screen.queryByText(/dispon[ií]vel/i)).toBeNull()
  })

  it('com o Firefox publicado: link nos dois blocos, o resto em breve', () => {
    renderizar({ ...SEM_LOJA, firefoxUrl: FIREFOX })
    const links = screen.getAllByRole('link', { name: 'Firefox Add-ons' })
    expect(links.map((a) => a.getAttribute('href'))).toEqual([FIREFOX, FIREFOX])
    expect(screen.getByText('Disponível')).toBeInTheDocument()
    expect(
      screen.getByText('Firefox · grátis e de código aberto'),
    ).toBeInTheDocument()
  })

  it('cinco recursos e três passos, cada um com o seu h3', () => {
    renderizar()
    const recursos = screen.getByRole('region', { name: 'O que ele bota' })
    expect(within(recursos).getAllByRole('heading', { level: 3 })).toHaveLength(
      5,
    )
    const uso = screen.getByRole('region', { name: 'Como usar' })
    expect(
      within(uso)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['A página inteira', 'Um campo só', 'Ver e copiar os dados'])
  })

  it('a política fica em /privacidade, e o rodapé leva à PiluTech', () => {
    renderizar()
    expect(
      screen.getByRole('link', { name: 'Política de privacidade' }),
    ).toHaveAttribute('href', '/privacidade')
    expect(
      screen.getByRole('link', { name: 'Powered by PiluTech' }),
    ).toHaveAttribute('href', 'https://pilutech.com.br')
  })
})
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest components/landing; echo "exit=$?"` → FAIL (`Cannot find module './landing'`), `exit=1`.

- [ ] **Step 2: Implemente a `Landing`**

`apps/botai-site/components/landing.tsx` (estrutura, textos e medidas do `.dc.html`; o `overflow: hidden` do design fica de fora da raiz para a checagem de 320 px medir o que transborda):

```tsx
import { faArrowRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { cn } from '@piluvitu/ui/cn'
import Image from 'next/image'
import Link from 'next/link'
import { CAPTURAS } from '@/lib/capturas'
import {
  NOME,
  PROPOSTA,
  RECURSOS,
  REQUISITOS,
  URL_DA_PILUTECH,
} from '@/lib/conteudo'
import type { ModeloDaLanding } from '@/lib/modelo'
import { AtalhoLocal } from './atalho-local'
import { BotoesLoja } from './botoes-loja'
import { CabecalhoSecao } from './cabecalho-secao'
import { CapturasAbas } from './capturas-abas'
import { ImagemPorTema } from './imagem-por-tema'
import { Rodape } from './rodape'
import { SeloFase } from './selo-fase'
import { TabelaAtalhos } from './tabela-atalhos'
import { Topo } from './topo'

const CARTAO = 'bg-card border-border rounded-lg border'
const TEXTO_DE_CARTAO = 'text-muted-foreground leading-[1.55] text-pretty'

export function Landing({ fase, lojas, notaDasLojas }: ModeloDaLanding) {
  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-accent-soft),transparent)]"
      />
      <div className="relative mx-auto max-w-[1080px] px-6 pt-8 pb-10">
        <Topo
          voltar={{ href: URL_DA_PILUTECH, rotulo: 'PiluLabs' }}
          ancoras={[
            { href: '#como-usar', rotulo: 'como usar' },
            { href: '#capturas', rotulo: 'capturas' },
          ]}
        />

        <header className="mt-[72px] flex flex-col gap-6">
          <p className="text-primary font-mono text-sm">~/pilulabs/botai</p>
          <div className="flex flex-wrap items-center gap-5">
            <Image
              src="/icone-128.png"
              alt={`Ícone do ${NOME}`}
              width={72}
              height={72}
              loading="eager"
              className="rounded-[20px]"
            />
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[56px] leading-none font-extrabold tracking-[-0.03em]">
                {NOME}
              </p>
              <SeloFase fase={fase} />
            </div>
          </div>
          <h1 className="max-w-[820px] text-[40px] leading-[1.12] font-bold tracking-[-0.02em] text-balance">
            <span className="sr-only">{NOME}: </span>
            {PROPOSTA}
          </h1>
          <p className="text-muted-foreground max-w-[680px] text-lg leading-[1.55] text-pretty">
            Uma extensão de navegador que gera uma pessoa brasileira de teste,
            falsa e coerente, e bota os dados nos campos do formulário num
            clique ou num atalho.
          </p>
          <BotoesLoja lojas={lojas} className="mt-2" />
          <div className="text-muted-foreground flex flex-wrap items-center gap-2.5 font-mono text-xs">
            <span>{notaDasLojas}</span>
            <span aria-hidden>·</span>
            <AtalhoLocal />
          </div>
          <div className={cn(CARTAO, 'mt-6 overflow-hidden shadow-sm')}>
            <ImagemPorTema
              variantes={CAPTURAS[0].variantes}
              sizes="(min-width: 1080px) 1032px, calc(100vw - 48px)"
              destaque
            />
          </div>
        </header>

        <main className="mt-24 flex flex-col gap-24">
          <section
            aria-labelledby="porque-heading"
            className="flex flex-col gap-6"
          >
            <CabecalhoSecao id="porque-heading" rotulo="Por que existe" />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-8">
              <div className="flex flex-col gap-4 text-lg leading-[1.6] text-pretty">
                <p>
                  Testar um cadastro brasileiro pede um CPF com os dígitos
                  verificadores certos, um CEP que existe e um endereço que bate
                  com ele. Digitar isso à mão a cada teste é lento, e dado
                  inventado costuma travar na validação.
                </p>
                <p className="text-muted-foreground">
                  O Botaí foi feito para quem desenvolve e testa formulários
                  brasileiros. Ele gera uma pessoa de teste falsa e coerente e
                  escreve os dados nos campos certos da página. A pessoa fica
                  guardada até você pedir outra, para repetir o mesmo cadastro.
                </p>
              </div>
              <div className={cn(CARTAO, 'flex flex-col gap-3 p-6 shadow-sm')}>
                <p className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
                  De onde vem o nome
                </p>
                <p className="text-primary text-[32px] font-bold tracking-[-0.02em]">
                  “bota aí”
                </p>
                <p className={cn(TEXTO_DE_CARTAO, 'text-base')}>
                  Expressão piauiense, e é o que a extensão faz: bota dados nos
                  campos do formulário.
                </p>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="recursos-heading"
            className="flex flex-col gap-6"
          >
            <CabecalhoSecao
              id="recursos-heading"
              rotulo="O que ele bota"
              contagem={RECURSOS.length}
            />
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
              {RECURSOS.map((recurso) => (
                <li
                  key={recurso.titulo}
                  className={cn(CARTAO, 'flex flex-col gap-3 p-5')}
                >
                  <div className="bg-accent-soft text-primary flex size-10 items-center justify-center rounded-[14px]">
                    <FontAwesomeIcon icon={recurso.icone} className="size-4" />
                  </div>
                  <h3 className="text-base font-semibold">{recurso.titulo}</h3>
                  <p className={cn(TEXTO_DE_CARTAO, 'text-sm')}>
                    {recurso.texto}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-sm">
              Funciona com React, Vue, máscaras (imask, jQuery Mask,
              react-number-format e outras) e sites que buscam o endereço pelo
              CEP.
            </p>
          </section>

          <section
            id="capturas"
            aria-labelledby="capturas-heading"
            className="flex scroll-mt-6 flex-col gap-6"
          >
            <CabecalhoSecao
              id="capturas-heading"
              rotulo="Capturas"
              contagem={CAPTURAS.length}
            />
            <CapturasAbas capturas={CAPTURAS} rotuladoPor="capturas-heading" />
          </section>

          <section
            id="como-usar"
            aria-labelledby="uso-heading"
            className="flex scroll-mt-6 flex-col gap-6"
          >
            <CabecalhoSecao id="uso-heading" rotulo="Como usar" />
            <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
              <li className={cn(CARTAO, 'flex flex-col gap-2.5 p-6')}>
                <span className="text-primary font-mono text-xs">01</span>
                <h3 className="text-lg font-semibold">A página inteira</h3>
                <p className={cn(TEXTO_DE_CARTAO, 'text-[15px]')}>
                  Use o atalho da tabela abaixo, ou clique no ícone do Botaí e
                  em “Preencher esta página”.
                </p>
              </li>
              <li className={cn(CARTAO, 'flex flex-col gap-2.5 p-6')}>
                <span className="text-primary font-mono text-xs">02</span>
                <h3 className="text-lg font-semibold">Um campo só</h3>
                <p className={cn(TEXTO_DE_CARTAO, 'text-[15px]')}>
                  Botão direito no campo ›{' '}
                  <span className="text-foreground font-mono text-[13px]">
                    Botaí › Inserir › CPF
                  </span>{' '}
                  (ou E-mail, CEP…), para o que a detecção automática errar.
                </p>
              </li>
              <li className={cn(CARTAO, 'flex flex-col gap-2.5 p-6')}>
                <span className="text-primary font-mono text-xs">03</span>
                <h3 className="text-lg font-semibold">Ver e copiar os dados</h3>
                <p className={cn(TEXTO_DE_CARTAO, 'text-[15px]')}>
                  O popup mostra a pessoa inteira, e “Nova pessoa” gera outra.
                  Depois de preencher, ele mostra quantos campos entraram e leva
                  até os que ficaram de fora.
                </p>
              </li>
            </ol>
            <TabelaAtalhos />
            <p className="text-muted-foreground text-sm">
              Se outro programa já usa a tecla, o popup mostra “definir atalho”
              e abre a página de atalhos do navegador.
            </p>
          </section>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-12">
            <section
              aria-labelledby="privacidade-heading"
              className="flex flex-col gap-4"
            >
              <CabecalhoSecao id="privacidade-heading" rotulo="Privacidade" />
              <p className="text-base leading-[1.6] text-pretty">
                Nada sai do seu navegador: o Botaí não tem servidor, não usa
                analytics e só guarda a pessoa fictícia que gerou. Ele só age na
                aba em que você o aciona.
              </p>
              <Link
                href="/privacidade"
                className="text-primary inline-flex items-center gap-2 text-[15px] hover:underline"
              >
                Política de privacidade
                <FontAwesomeIcon icon={faArrowRight} className="size-3" />
              </Link>
            </section>
            <section
              aria-labelledby="cuidados-heading"
              className="flex flex-col gap-4"
            >
              <CabecalhoSecao id="cuidados-heading" rotulo="Cuidados" />
              <ul className="flex list-disc flex-col gap-2.5 pl-5 text-[15px] leading-[1.55] text-pretty">
                <li>
                  A caixa de e-mail é pública. O e-mail gerado é do{' '}
                  <span className="font-mono text-[13px]">
                    tuamaeaquelaursa.com
                  </span>
                  , e qualquer um que souber o endereço lê as mensagens. Nunca
                  use para conta real.
                </li>
                <li>
                  CPF, CNPJ e celular gerados podem pertencer a alguém de
                  verdade. Use só em localhost e em ambientes de teste.
                </li>
                <li>
                  Iframe de outro domínio (Stripe Elements, Pagar.me) fica de
                  fora: o navegador só libera a página de cima.
                </li>
                <li>
                  Quando a aba navega, o navegador retira o acesso. A página
                  seguinte precisa de um novo gesto, e o atalho resolve.
                </li>
              </ul>
            </section>
          </div>

          <section
            aria-labelledby="instalar-heading"
            className={cn(
              CARTAO,
              'relative flex flex-col items-center gap-5 overflow-hidden rounded-[32px] px-8 py-12 text-center shadow-sm',
            )}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_0%,var(--color-accent-soft),transparent)]"
            />
            <Image
              src="/icone-128.png"
              alt=""
              width={56}
              height={56}
              className="relative rounded-2xl"
            />
            <h2
              id="instalar-heading"
              className="relative text-[36px] leading-[1.1] font-extrabold tracking-[-0.02em] text-balance"
            >
              Bota aí no seu navegador
            </h2>
            <p className="text-muted-foreground relative max-w-[520px] text-base leading-[1.55] text-pretty">
              {REQUISITOS}
            </p>
            <BotoesLoja
              lojas={lojas}
              variante="outline"
              className="relative mt-2 justify-center"
            />
          </section>
        </main>

        <Rodape />
      </div>
    </div>
  )
}
```

`apps/botai-site/components/landing.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { modeloDaLanding } from '@/lib/modelo'
import { Landing } from './landing'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }
const NAS_QUATRO = {
  chromeUrl: 'https://chromewebstore.google.com/detail/botai/abc',
  firefoxUrl: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/',
  edgeUrl: 'https://microsoftedge.microsoft.com/addons/detail/botai/xyz',
  operaUrl: 'https://addons.opera.com/pt-br/extensions/details/botai/',
}

const meta = {
  title: 'Landing/Página',
  component: Landing,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Landing>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: modeloDaLanding(SEM_LOJA) }
export const SoFirefox: Story = {
  args: modeloDaLanding({ ...SEM_LOJA, firefoxUrl: NAS_QUATRO.firefoxUrl }),
}
export const NasQuatroLojas: Story = { args: modeloDaLanding(NAS_QUATRO) }
export const EmBreveClaro: Story = {
  args: modeloDaLanding(SEM_LOJA),
  globals: { tema: 'claro' },
}
```

`apps/botai-site/app/page.tsx` (substitui o provisório):

```tsx
import { Landing } from '@/components/landing'
import { lerUrlsDasLojas } from '@/lib/cms'
import { modeloDaLanding } from '@/lib/modelo'

export default function Home() {
  return <Landing {...modeloDaLanding(lerUrlsDasLojas())} />
}
```

`apps/botai-site/app/layout.tsx`: importe `import { TemaProvider } from '@/components/tema-provider'` e troque `<body>{children}</body>` por `<body><TemaProvider>{children}</TemaProvider></body>` (o `suppressHydrationWarning` do `<html>` já está lá: o `next-themes` muda a classe antes da hidratação).

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest; echo "exit=$?"` → todos PASS, `exit=0`.

- [ ] **Step 3: E2E da página (substitui a fumaça)**

`apps/botai-site/app/pagina.e2e.ts`:

```ts
import { expect, test } from '@playwright/test'
import { LOJA_UI } from '../components/lojas-ui'
import { CAPTURAS } from '../lib/capturas'
import { lerUrlsDasLojas } from '../lib/cms'
import { botoesDasLojas } from '../lib/modelo'

// O esperado sai do mesmo YAML que a página lê no build.
const botoes = botoesDasLojas(lerUrlsDasLojas())

test.describe('/', () => {
  test('as seções do design, na ordem, sem erro de hidratação', async ({
    page,
  }) => {
    const erros: string[] = []
    page.on('console', (mensagem) => {
      if (
        mensagem.type() === 'error' &&
        /hydrat|#418|#423|#425/i.test(mensagem.text())
      )
        erros.push(mensagem.text())
    })
    const resposta = await page.goto('/')
    expect(resposta?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Botaí: Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    )
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      'Por que existe',
      'O que ele bota',
      'Capturas',
      'Como usar',
      'Privacidade',
      'Cuidados',
      'Bota aí no seu navegador',
    ])
    await page.waitForLoadState('networkidle')
    expect(erros).toEqual([])
  })

  test('botões de loja seguem o CMS: link na publicada, "Em breve" sem link na que falta', async ({
    page,
  }) => {
    await page.goto('/')
    for (const { loja, url } of botoes) {
      const rotulo = LOJA_UI[loja].rotulo
      if (url) {
        const links = page.getByRole('link', { name: rotulo, exact: true })
        await expect(links).toHaveCount(2)
        for (const link of await links.all()) {
          await expect(link).toHaveAttribute('href', url)
          await expect(link).toHaveAttribute('target', '_blank')
        }
      } else {
        const botoesDesabilitados = page.getByRole('button', {
          name: `${rotulo} Em breve`,
        })
        await expect(botoesDesabilitados).toHaveCount(2)
        for (const botao of await botoesDesabilitados.all())
          await expect(botao).toBeDisabled()
      }
    }
    await expect(page.locator('a[href="#"]')).toHaveCount(0)
  })

  test('as âncoras do topo levam às seções', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'como usar' }).click()
    await expect(page).toHaveURL(/#como-usar$/)
    await expect(
      page.getByRole('heading', { level: 2, name: 'Como usar' }),
    ).toBeInViewport()
  })

  test('abas das capturas pelo teclado (WAI-ARIA)', async ({ page }) => {
    await page.goto('/')
    const abas = page.getByRole('tab')
    await expect(abas).toHaveCount(3)
    await abas.first().focus()
    await page.keyboard.press('ArrowRight')
    await expect(abas.nth(1)).toBeFocused()
    await expect(abas.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).toContainText(CAPTURAS[1].titulo)
    await page.keyboard.press('End')
    await expect(abas.nth(2)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(abas.first()).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('ArrowLeft')
    await expect(abas.nth(2)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('tabpanel')).toBeFocused()
  })

  // Sem piscar: a classe tem de vir do script inline do next-themes, antes de qualquer JS do React.
  // Com os bundles bloqueados nada hidrata, e a leitura é uma só (toHaveClass repetiria por 5 s e
  // aceitaria uma classe posta depois da primeira pintura). O CSS também mora em /_next/static/chunks/
  // no build do Next 16: só o .js é bloqueado.
  test('tema: o escuro do sistema já vem do HTML, antes do JS do React', async ({
    page,
  }) => {
    await page.route(/\/_next\/static\/chunks\/.+\.js(\?.*)?$/, (rota) =>
      rota.abort(),
    )
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    expect(await page.locator('html').getAttribute('class')).toMatch(/\bdark\b/)
    const topo = page.getByRole('banner')
    await expect(
      topo.locator(`img[alt="${CAPTURAS[0].variantes.escuro.alt}"]`),
    ).toBeVisible()
    await expect(
      topo.locator(`img[alt="${CAPTURAS[0].variantes.claro.alt}"]`),
    ).toBeHidden()
  })

  test('tema: alterna, lembra a escolha e troca o ícone', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await expect(page.locator('html')).toHaveClass(/\bdark\b/)
    const botao = page.getByRole('button', { name: 'Alternar tema' })
    await expect(botao.locator('svg[data-icon="sun"]')).toBeVisible()
    await expect(botao.locator('svg[data-icon="moon"]')).toBeHidden()
    await botao.click()
    await expect(page.locator('html')).toHaveClass(/\blight\b/)
    await expect(botao.locator('svg[data-icon="moon"]')).toBeVisible()
    await page.reload()
    await expect(page.locator('html')).toHaveClass(/\blight\b/)
  })

  // Review Focus 2: a escolha manda, não o prefers-color-scheme, e a variante escondida não sai pela rede.
  test('a captura segue o tema ativo e só a variante dele é baixada', async ({
    page,
  }) => {
    const pedidas: string[] = []
    page.on('request', (pedido) => {
      const url = decodeURIComponent(pedido.url())
      if (url.includes('/capturas/')) pedidas.push(url)
    })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(
      pedidas.some((u) => u.includes('01-pagina-preenchida-escuro.png')),
    ).toBe(true)
    expect(pedidas.filter((u) => u.includes('-claro.png'))).toEqual([])
    await page.getByRole('button', { name: 'Alternar tema' }).click()
    await expect(
      page.getByRole('img', { name: CAPTURAS[0].variantes.claro.alt }).first(),
    ).toBeVisible()
    await expect
      .poll(() =>
        pedidas.some((u) => u.includes('02-pagina-preenchida-claro.png')),
      )
      .toBe(true)
  })

  test.describe('atalho de quem visita', () => {
    const CASOS = [
      [
        'MacIntel',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        '⌥⇧P',
        'macOS',
      ],
      [
        'Linux x86_64',
        'Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0',
        'Alt+Shift+P',
        'Linux',
      ],
      [
        'Win32',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        'Ctrl+Shift+Y',
        'Windows',
      ],
    ] as const

    for (const [plataforma, userAgent, tecla, sistema] of CASOS) {
      test(`${sistema}: ${tecla}`, async ({ page }) => {
        await page.addInitScript(
          ({ plataforma, userAgent }) => {
            Object.defineProperty(Navigator.prototype, 'platform', {
              get: () => plataforma,
            })
            Object.defineProperty(Navigator.prototype, 'userAgent', {
              get: () => userAgent,
            })
            Object.defineProperty(Navigator.prototype, 'userAgentData', {
              get: () => undefined,
            })
          },
          { plataforma, userAgent },
        )
        await page.goto('/')
        const cabecalho = page.getByRole('banner')
        await expect(cabecalho.locator('kbd')).toHaveText(tecla)
        await expect(cabecalho).toContainText(`preenche a página no ${sistema}`)
      })
    }

    test('sem JavaScript, o HTML do servidor já traz um atalho válido', async ({
      browser,
    }) => {
      const contexto = await browser.newContext({ javaScriptEnabled: false })
      const page = await contexto.newPage()
      await page.goto('/')
      await expect(page.getByRole('banner').locator('kbd')).toHaveText(
        'Ctrl+Shift+Y',
      )
      await contexto.close()
    })
  })

  // Review Focus 3.
  test.describe('a 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('sem rolagem horizontal', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const largura = await page.evaluate(() => ({
        rolavel: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }))
      expect(largura.rolavel).toBeLessThanOrEqual(largura.visivel)
    })

    // Um botão que vaza para dentro do gutter não aumenta o scrollWidth: confere cada um contra a lista.
    test('nenhum botão de loja passa da borda da lista', async ({ page }) => {
      await page.goto('/')
      const listas = page.getByRole('list', { name: 'Instalar pela loja' })
      await expect(listas).toHaveCount(2)
      const vazados = await listas.evaluateAll((elementos) =>
        elementos.flatMap((lista) => {
          const borda = lista.getBoundingClientRect().right
          return [...lista.querySelectorAll(':scope > li > *')]
            .filter(
              (botao) => botao.getBoundingClientRect().right > borda + 0.5,
            )
            .map((botao) => botao.textContent ?? '')
        }),
      )
      expect(vazados).toEqual([])
    })
  })
})
```

`apps/botai-site/app/lojas-publicadas.yaml` (só o que o `lerUrlsDasLojas` lê; é o caso do Review Focus 1, com uma loja publicada, um link de outra loja e um `http:`):

```yaml
# YAML de teste do playwright.lojas.config.ts, no lugar de apps/web/content/pilulabs/botai/index.yaml.
slug: botai
chromeUrl: https://microsoftedge.microsoft.com/addons/detail/botai/xyz
firefoxUrl: https://addons.mozilla.org/pt-BR/firefox/addon/botai/
edgeUrl: http://microsoftedge.microsoft.com/addons/detail/botai/xyz
operaUrl: ''
```

`apps/botai-site/playwright.lojas.config.ts`:

```ts
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testMatch: ['**/lojas-publicadas.e2e.ts'],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3020',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm run build && pnpm run start',
    url: 'http://localhost:3020',
    reuseExistingServer: false,
    timeout: 300_000,
    cwd: '.',
    env: { BOTAI_CMS_ITEM: join(__dirname, 'app', 'lojas-publicadas.yaml') },
  },
})
```

(`reuseExistingServer: false` sempre: um servidor já de pé na 3020 é o do CMS real, e este config tem de falhar em vez de testá-lo. O Playwright junta o `env` ao `process.env`.)

`apps/botai-site/playwright.config.ts`: em `defineConfig`, depois de `testMatch`, acrescente `testIgnore: ['**/lojas-publicadas.e2e.ts'],`.

`apps/botai-site/package.json`: `"test:e2e": "playwright test"` vira `"test:e2e": "playwright test -c playwright.lojas.config.ts && playwright test"` (o de teste primeiro, para o `.next` terminar com o CMS real).

`apps/botai-site/app/lojas-publicadas.e2e.ts`:

```ts
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { lerUrlsDasLojas } from '../lib/cms'

// Roda só pelo playwright.lojas.config.ts, que builda a landing com este YAML no lugar do CMS.
const URLS = lerUrlsDasLojas(join(__dirname, 'lojas-publicadas.yaml'))

test('a fixture: Firefox publicado, Chrome com link de outra loja, Edge em http', () => {
  expect(URLS.firefoxUrl).toMatch(/^https:\/\/addons\.mozilla\.org\//)
  expect(URLS.chromeUrl).toMatch(/^https:\/\/microsoftedge\.microsoft\.com\//)
  expect(URLS.edgeUrl).toMatch(/^http:\/\//)
  expect(URLS.operaUrl).toBe('')
})

test('Firefox publicado: link nos dois blocos, em aba nova', async ({
  page,
}) => {
  await page.goto('/')
  const links = page.getByRole('link', { name: 'Firefox Add-ons', exact: true })
  await expect(links).toHaveCount(2)
  for (const link of await links.all()) {
    await expect(link).toHaveAttribute('href', URLS.firefoxUrl)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
})

// Review Focus 1: link de outra loja ou em http não vira botão.
test('as outras três seguem "Em breve", desabilitadas e sem link', async ({
  page,
}) => {
  await page.goto('/')
  for (const rotulo of [
    'Chrome Web Store',
    'Microsoft Edge Add-ons',
    'Opera add-ons',
  ]) {
    const botoes = page.getByRole('button', { name: `${rotulo} Em breve` })
    await expect(botoes).toHaveCount(2)
    for (const botao of await botoes.all()) await expect(botao).toBeDisabled()
  }
  await expect(page.locator('a[href*="microsoftedge"]')).toHaveCount(0)
})

test('o selo diz "Disponível" e a nota cita só o Firefox', async ({ page }) => {
  await page.goto('/')
  const topo = page.getByRole('banner')
  await expect(topo.getByText('Disponível', { exact: true })).toBeVisible()
  await expect(
    topo.getByText('Firefox · grátis e de código aberto', { exact: true }),
  ).toBeVisible()
})
```

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && lsof -nP -iTCP:3020 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test -c playwright.lojas.config.ts --retries=0; echo "lojas exit=$?"
CI=1 ./node_modules/.bin/playwright test --retries=0 app/pagina.e2e.ts; echo "pagina exit=$?"
```

Expected: todos PASS, os dois `exit=0`, e nessa ordem (o segundo rebuilda com o CMS real). Se o teste do tema falhar porque o sol aparece no claro ou a lua no escuro, o CSS do Font Awesome está fora da camada `base` (Tarefa 4, `globals.css`) ou o `autoAddCss` voltou a injetar CSS no cliente: corrija lá, não no componente.

- [ ] **Step 4: Conferência visual contra o design**

Suba a produção em segundo plano (Bash com `run_in_background`): `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && pnpm run build && pnpm run start`. Quando `curl -sf http://localhost:3020 >/dev/null; echo "exit=$?"` der `exit=0`, fotografe (use a pasta de rascunho da sessão):

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site
./node_modules/.bin/playwright screenshot --full-page --viewport-size "1280, 800" --color-scheme dark http://localhost:3020 "$SCRATCH/landing-desktop-escuro.png"; echo "exit=$?"
./node_modules/.bin/playwright screenshot --full-page --viewport-size "390, 844" --color-scheme dark http://localhost:3020 "$SCRATCH/landing-mobile-escuro.png"; echo "exit=$?"
./node_modules/.bin/playwright screenshot --full-page --viewport-size "1280, 800" --color-scheme light http://localhost:3020 "$SCRATCH/landing-desktop-claro.png"; echo "exit=$?"
```

(`$SCRATCH` = a pasta de rascunho da sessão.) Abra as três com a ferramenta Read e compare com `docs/superpowers/design/2026-10-02-botai-landing/desktop-escuro.png` e `mobile-escuro.png`: ordem das seções, hierarquia tipográfica (nome 56 px, proposta 40 px, rótulos mono em caixa alta), espaçamentos entre seções (96 px), cartões, brilho radial no topo e no bloco final, botões de loja, tabela e rodapé. O que divergir se corrige nas classes da `Landing` (medidas do `.dc.html`) e repete este passo. Diferenças aceitas: o "Em breve" dentro dos botões de loja sem URL (o protótipo tinha `href="#"`) e a linha do topo que quebra só abaixo de ~330 px. Pare o `next start` que você subiu (o PID do `lsof -nP -iTCP:3020 -sTCP:LISTEN`) e confira `/usr/bin/git status`.

- [ ] **Step 5: Verificação e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
pnpm run build; echo "build exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai-site && /usr/bin/git commit -m "feat(botai-site): a landing do Botaí, fiel ao design, com lojas do CMS, tema e abas pelo teclado"; echo "exit=$?"
```

---

### Tarefa 7: `/privacidade` migrada para o app

A política sai do `apps/web` com o mesmo texto e entra no visual da landing (topo com o voltar para `/`, rodapé). Os links internos passam aos caminhos novos: o voltar é `/` e o histórico aponta para o arquivo novo. A data fica (o texto não muda). A rota velha do `apps/web` só sai na Tarefa 9, com o 308.

**Files:**

- Create (`apps/botai-site/`): `app/privacidade/page.tsx`, `app/privacidade/page.test.tsx`, `app/privacidade/privacidade.e2e.ts`
- Modify: `app/globals.css` (plugin de tipografia), `scripts/conferir-rotas-estaticas.mjs` (`ROTAS`)

**Interfaces:**

- Consumes: `Topo`, `Rodape` (Tarefa 5); `NOME`, `EMAIL_DE_SUPORTE` (Tarefa 3).
- Produces: rota estática `/privacidade`; `h1` "Política de privacidade do Botaí"; `<time dateTime="2026-10-01">`.

- [ ] **Step 1: Teste da página (falha)**

`apps/botai-site/app/privacidade/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import PrivacidadePage from './page'

describe('/privacidade', () => {
  beforeEach(() => {
    render(<PrivacidadePage />)
  })

  it('o título, a data e o resumo', () => {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Política de privacidade do Botaí',
    )
    const data = screen.getByText('1 de outubro de 2026')
    expect(data.tagName).toBe('TIME')
    expect(data).toHaveAttribute('dateTime', '2026-10-01')
  })

  it('as seções da política, na ordem', () => {
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Quem é o responsável',
      'O que o Botaí acessa, e quando',
      'O que fica guardado',
      'O que é enviado',
      'Sites que ele abre, só quando você clica',
      'Dados fictícios e pessoas reais',
      'Permissões',
      'Como apagar os dados',
      'Mudanças nesta política',
    ])
  })

  it('as 5 permissões; menus só no Firefox', () => {
    const linhas = screen.getAllByRole('row').slice(1)
    expect(
      linhas.map((linha) => linha.querySelector('th')?.textContent),
    ).toEqual(['activeTab', 'scripting', 'contextMenus', 'storage', 'menus'])
    expect(linhas[4]).toHaveTextContent('Só no Firefox')
  })

  it('contato por e-mail e o histórico no arquivo novo', () => {
    expect(
      screen.getByRole('link', { name: 'pilutechinformatica@gmail.com' }),
    ).toHaveAttribute('href', 'mailto:pilutechinformatica@gmail.com')
    expect(
      screen.getByRole('link', { name: 'histórico do código-fonte do site' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/botai-site/app/privacidade/page.tsx',
    )
  })

  it('o voltar leva à landing', () => {
    expect(screen.getByRole('link', { name: 'Botaí' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest app/privacidade; echo "exit=$?"` → FAIL (`Cannot find module './page'`), `exit=1`.

- [ ] **Step 2: A página**

`apps/botai-site/app/globals.css`: depois da linha `@source not '../*.md';`, acrescente `@plugin '@tailwindcss/typography';`.

`apps/botai-site/app/privacidade/page.tsx` (texto idêntico ao de `apps/web/app/(site)/pilulabs/botai/privacidade/page.tsx`, com `{produto.nome}` trocado por `{NOME}`):

```tsx
import { Rodape } from '@/components/rodape'
import { Topo } from '@/components/topo'
import { EMAIL_DE_SUPORTE, NOME } from '@/lib/conteudo'

// Data em texto pronto: formatar "2026-10-01" em BRT mostraria 30 de setembro.
const ATUALIZADA_EM = { iso: '2026-10-01', texto: '1 de outubro de 2026' }
const HISTORICO =
  'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/botai-site/app/privacidade/page.tsx'

const PERMISSOES = [
  {
    nome: 'activeTab',
    paraQue:
      'Acesso temporário só à aba em que você aciona a extensão (ícone, atalho ou menu), para ler os campos do formulário e escrever os dados de teste. O acesso acaba quando a aba navega.',
    onde: 'Todos',
  },
  {
    nome: 'scripting',
    paraQue:
      'Rodar, só nessa aba e só nesse momento, o script que reconhece e preenche os campos.',
    onde: 'Todos',
  },
  {
    nome: 'contextMenus',
    paraQue:
      'Os itens “Preencher esta página” e “Inserir › CPF / E-mail / CEP…” do botão direito.',
    onde: 'Todos',
  },
  {
    nome: 'storage',
    paraQue:
      'Guardar no seu navegador a pessoa fictícia gerada, para repetir o mesmo cadastro.',
    onde: 'Todos',
  },
  {
    nome: 'menus',
    paraQue:
      'Saber em qual campo você clicou com o botão direito, para o “Inserir” escrever nele.',
    onde: 'Só no Firefox',
  },
]

export default function PrivacidadePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-8 pb-10">
      <Topo voltar={{ href: '/', rotulo: NOME }} />
      <main className="mt-12">
        <article>
          <header className="border-border flex flex-col gap-4 border-b pb-8">
            <p className="text-primary font-mono text-sm break-all">
              ~/pilulabs/botai/privacidade
            </p>
            <h1 className="text-4xl leading-tight font-bold tracking-tight">
              Política de privacidade do {NOME}
            </h1>
            <p className="text-muted-foreground font-mono text-xs">
              Última atualização:{' '}
              <time dateTime={ATUALIZADA_EM.iso}>{ATUALIZADA_EM.texto}</time>
            </p>
            <p className="bg-accent-soft border-accent-line rounded-lg border p-4 text-pretty">
              <strong>Em resumo:</strong> o {NOME} não coleta nem envia dados.
              Ele só lê os formulários da aba em que você o aciona, no seu
              navegador, e guarda nele a pessoa fictícia que gerou.
            </p>
          </header>

          <div className="prose prose-neutral dark:prose-invert prose-a:text-primary prose-code:before:content-none prose-code:after:content-none mt-10 max-w-none">
            <h2>Quem é o responsável</h2>
            <p>
              O {NOME} é um produto da PiluTech. Dúvidas, pedidos sobre esta
              política e suporte:{' '}
              <a href={`mailto:${EMAIL_DE_SUPORTE}`}>{EMAIL_DE_SUPORTE}</a>.
            </p>

            <h2>O que o {NOME} acessa, e quando</h2>
            <ul>
              <li>
                Os campos de formulário da aba em que você aciona a extensão,
                pelo ícone, pelo atalho ou pelo menu do botão direito: o tipo, o
                nome, o rótulo, os atributos e o valor atual de cada campo. É
                para decidir o que escrever em cada um e conferir o que ficou
                escrito.
              </li>
              <li>
                O endereço dessa aba, para saber se o navegador deixa a extensão
                agir ali.
              </li>
              <li>
                No Firefox, qual campo recebeu o clique do botão direito, para o
                “Inserir” escrever nele.
              </li>
            </ul>
            <p>
              Quem libera o acesso é o próprio navegador, só no momento do gesto
              e só para aquela aba. Tudo acontece no seu computador: nada da
              página é guardado nem enviado.
            </p>

            <h2>O que fica guardado</h2>
            <p>
              Só a pessoa fictícia gerada (nome, documentos, endereço, contato,
              empresa e cartão de teste), no armazenamento local da extensão no
              seu navegador (<code>storage.local</code>). Assim você repete o
              mesmo cadastro até pedir outra pessoa. Ela não é sincronizada
              entre dispositivos.
            </p>

            <h2>O que é enviado</h2>
            <p>
              Nada. O {NOME} não tem servidor e não faz requisições de rede.
              Também não usa analytics, cookies nem anúncios, e não carrega
              código remoto: todo o código está no pacote publicado nas lojas.
              Na Firefox Add-ons, ele declara que não coleta dados.
            </p>

            <h2>Sites que ele abre, só quando você clica</h2>
            <ul>
              <li>
                <strong>Abrir caixa de entrada</strong> abre{' '}
                <code className="wrap-anywhere">
                  {'https://tuamaeaquelaursa.com/<usuário>'}
                </code>
                , a caixa pública do e-mail fictício gerado. É um serviço de
                terceiro, e qualquer pessoa que souber o endereço lê as
                mensagens. O {NOME} só abre a página e não chama a API do
                serviço.
              </li>
              <li>
                <strong>Powered by PiluTech</strong> abre{' '}
                <code>https://pilutech.com.br</code>.
              </li>
              <li>
                <strong>Alterar ou definir o atalho</strong> abre a página de
                atalhos do próprio navegador.
              </li>
            </ul>
            <p>
              O que esses sites fazem com os seus dados segue a política de cada
              um.
            </p>

            <h2>Dados fictícios e pessoas reais</h2>
            <p>
              Os documentos são gerados ao acaso, com dígitos verificadores
              válidos. Um CPF, um CNPJ ou um celular gerado pode pertencer a
              alguém de verdade: use o {NOME} só em localhost e em ambientes de
              teste.
            </p>

            <h2>Permissões</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Permissão</th>
                  <th scope="col">Para quê</th>
                  <th scope="col">Navegadores</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSOES.map((permissao) => (
                  <tr key={permissao.nome}>
                    <th scope="row">
                      <code>{permissao.nome}</code>
                    </th>
                    <td>{permissao.paraQue}</td>
                    <td>{permissao.onde}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              Ele não pede acesso a todos os sites e não lê histórico, abas,
              favoritos nem cookies.
            </p>

            <h2>Como apagar os dados</h2>
            <p>
              “Nova pessoa”, no popup, troca a pessoa guardada por outra.
              Remover a extensão apaga o armazenamento local dela.
            </p>

            <h2>Mudanças nesta política</h2>
            <p>
              Quando esta política mudar, a data no topo muda junto. As versões
              anteriores ficam no{' '}
              <a href={HISTORICO} target="_blank" rel="noopener noreferrer">
                histórico do código-fonte do site
              </a>
              .
            </p>
          </div>
        </article>
      </main>
      <Rodape />
    </div>
  )
}
```

Em `apps/botai-site/scripts/conferir-rotas-estaticas.mjs`: `export const ROTAS = ['/', '/privacidade']`.

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest; echo "exit=$?"` → todos PASS, `exit=0`.

- [ ] **Step 3: E2E da política**

`apps/botai-site/app/privacidade/privacidade.e2e.ts`:

```ts
import { expect, test } from '@playwright/test'

test.describe('/privacidade', () => {
  test('h1, data, contato, a tabela de permissões e o voltar para a landing', async ({
    page,
  }) => {
    const resposta = await page.goto('/privacidade')
    expect(resposta?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Política de privacidade do Botaí',
    )
    await expect(page.locator('time[datetime="2026-10-01"]')).toHaveText(
      '1 de outubro de 2026',
    )
    await expect(
      page.locator('a[href="mailto:pilutechinformatica@gmail.com"]').first(),
    ).toBeVisible()
    await expect(page.getByRole('row', { name: /^menus\b/ })).toContainText(
      'Só no Firefox',
    )
    await page.getByRole('link', { name: 'Botaí', exact: true }).click()
    await expect(page).toHaveURL('/')
  })

  test('a landing leva até aqui', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Política de privacidade' }).click()
    await expect(page).toHaveURL('/privacidade')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Política de privacidade',
    )
  })

  // Review Focus 3: a URL longa da caixa de e-mail, em <code>, empurrava a página a 375 px.
  test.describe('a 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('sem rolagem horizontal', async ({ page }) => {
      await page.goto('/privacidade')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const largura = await page.evaluate(() => ({
        rolavel: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }))
      expect(largura.rolavel).toBeLessThanOrEqual(largura.visivel)
    })
  })
})
```

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
./node_modules/.bin/eslint .; echo "eslint exit=$?"
lsof -nP -iTCP:3020 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test --retries=0; echo "e2e exit=$?"
```

Expected: os três `exit=0`; o build do E2E imprime `Rotas estáticas: /, /privacidade`. Se a tabela de permissões fizer a página rolar a 320 px, envolva o `<table>` numa moldura que rola, como a da `TabelaAtalhos` (Tarefa 4): `<div role="region" aria-labelledby="permissoes" tabIndex={0} className="focus-visible:ring-ring overflow-x-auto rounded-lg outline-none focus-visible:ring-2">`, com `id="permissoes"` no `<h2>Permissões</h2>`, e acrescente ao `page.test.tsx` o teste de que a região "Permissões" tem `tabindex="0"`. A página não pode rolar; a tabela pode, mas só com a moldura focável (sem ela o axe acusa `scrollable-region-focusable` no E2E de 320 px da Tarefa 8).

- [ ] **Step 4: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai-site && /usr/bin/git commit -m "feat(botai-site): política de privacidade em /privacidade, com o mesmo texto"; echo "exit=$?"
```

---

### Tarefa 8: SEO (metadata, OG/Twitter, JSON-LD, sitemap, robots, ícones, manifest, verificação)

Pesquisa feita em 2026-10-02 nas fontes oficiais (Google Search Central e a doc empacotada do Next 16), e o que ela decidiu:

- `title` e `description`: o Google não tem limite, trunca pela largura do dispositivo, pede texto descritivo, único por página e sem repetir palavra-chave (`developers.google.com/search/docs/appearance/title-link` e `/snippet`). Os limites de 60 e 140–160 da spec ficam como teste.
- `SoftwareApplication`: o rich result exige `aggregateRating` ou `review` (`/structured-data/software-app`, atualizado em 2026-09-08). Sem nota própria (copiar a das lojas é proibido: "Don't aggregate reviews or ratings from other websites", `/structured-data/review-snippet`), o markup fica pela compreensão da página e não gera rich result. Isso vai para o `CLAUDE.md`; a página não promete nada disso.
- `FAQPage`: só para sites de governo e saúde; `HowTo`: não aparece mais (doc do FAQ, 2026). Nenhum dos dois entra.
- `WebSite` com `name` e `url` na raiz do subdomínio dá o nome do site no Google (`/appearance/site-names`, subdomínio aceito).
- `Organization`: o `logo` tem de ser o logo da organização, ≥ 112×112 (`/structured-data/organization`). **Não existe logo da PiluTech no repo**: usar o ícone do Botaí faria o Google tomar o ícone de um produto pela marca da empresa. A `Organization` sai sem `logo` (a spec pede o campo; o desvio fica registrado no `CLAUDE.md`, e o `logo` entra quando houver o arquivo).
- Favicon: o Google aceita PNG (não SVG), quadrado, ≥ 8×8 e de preferência > 48×48, um por hostname (`/appearance/favicon-in-search`): `app/icon.png` 300×300.
- Next 16: `metadataBase` no layout; `alternates.canonical` relativo; `openGraph` de página substitui o do layout (rasa), e a imagem vem do `opengraph-image` do próprio segmento; `themeColor` só em `viewport`; `verification.google`; `sitemap.ts`, `robots.ts` e `manifest.ts` estáticos por padrão (docs em `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/` e `04-functions/generate-viewport.md`).
- Lighthouse: **não há ferramenta disponível** no repo nem no PATH (`lighthouse`/`lhci` ausentes). Pela spec, as checagens vão para o E2E: título, descrição, canonical, JSON-LD válido, `h1` único, níveis de título, `alt`, 320 px, e acessibilidade pelo `axe-core` (o mesmo motor do Lighthouse) nos dois temas.

**Files:**

- Create (`apps/botai-site/`): `lib/site.ts`, `lib/site.test.ts`, `lib/seo.ts`, `lib/seo.test.ts`, `lib/json-ld.ts`, `lib/json-ld.test.ts`, `lib/imagem-og.tsx`, `components/json-ld.tsx`, `components/json-ld.test.tsx`, `app/opengraph-image.tsx`, `app/twitter-image.tsx`, `app/privacidade/opengraph-image.tsx`, `app/privacidade/twitter-image.tsx`, `app/sitemap.ts`, `app/sitemap.test.ts`, `app/robots.ts`, `app/robots.test.ts`, `app/manifest.ts`, `app/manifest.test.ts`, `app/icon.png`, `app/apple-icon.png`, `app/seo.e2e.ts`, `.env.example`
- Modify: `app/layout.tsx`, `app/page.tsx`, `app/privacidade/page.tsx`, `scripts/conferir-rotas-estaticas.mjs`, `app/lojas-publicadas.e2e.ts`

**Interfaces:**

- Consumes: `lojasPublicadas`, `UrlsDasLojas` (Tarefa 1); `CAPTURAS`, `NOME`, `PROPOSTA`, `RECURSOS`, `REQUISITOS_DO_SOFTWARE`, `URL_DA_PILUTECH`, `lerUrlsDasLojas`, `modeloDaLanding` (Tarefa 3); `Landing` (Tarefa 6).
- Produces:
  - `lib/site.ts`: `SITE_DE_PRODUCAO = 'https://botai.pilutech.com.br'`; `urlDoSite(env?: Record<string, string | undefined>): string` (origem, sem barra final); `urlAbsoluta(caminho: string, siteUrl?: string): string`.
  - `lib/seo.ts`: `TITULO_DA_HOME`, `DESCRICAO_DA_HOME`, `TITULO_DA_PRIVACIDADE`, `DESCRICAO_DA_PRIVACIDADE`, `COR_DO_TEMA_CLARO = '#f7f9fc'`, `COR_DO_TEMA_ESCURO = '#090b11'`; `type PaginaDoSite = { caminho: string; titulo: string; descricao: string }`; `metadataDaPagina(pagina: PaginaDoSite): Metadata`; `metadataDoSite(siteUrl: string, env?: Record<string, string | undefined>): Metadata`; `VIEWPORT: Viewport`.
  - `lib/json-ld.ts`: `CONTEXTO = 'https://schema.org'`; `ID_DA_PILUTECH = 'https://pilutech.com.br/#organizacao'`; `type NoJsonLd = Record<string, unknown>`; `serializarJsonLd(dados: unknown): string`; `jsonLdDaHome(siteUrl: string, urls: UrlsDasLojas): { '@context': string; '@graph': NoJsonLd[] }`; `jsonLdDaPrivacidade(siteUrl: string): NoJsonLd`.
  - `lib/imagem-og.tsx`: `size = { width: 1200, height: 630 }`; `contentType = 'image/png'`; `type DadosDaImagemOg = { rotulo: string; titulo: string; subtitulo: string }`; `imagemOg(dados: DadosDaImagemOg): Promise<ImageResponse>`.
  - `components/json-ld.tsx`: `JsonLd({ dados }: { dados: unknown })`.

- [ ] **Step 1: Ícones (cópia do gerador das lojas; a Tarefa 10 o faz copiar sozinho)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && cp apps/botai/loja/imagens/edge-logo-300.png apps/botai-site/app/icon.png && cp apps/botai/loja/imagens/edge-logo-300.png apps/botai-site/app/apple-icon.png; echo "exit=$?"
```

(`edge-logo-300.png` é o ícone a 300×300 com a arte ocupando o quadro todo; o `icone-128.png` tem margem transparente de 16 px, pensada para a barra do navegador.)

- [ ] **Step 2: Testes da lógica (falham)**

`apps/botai-site/lib/site.test.ts`:

```ts
import { SITE_DE_PRODUCAO, urlAbsoluta, urlDoSite } from './site'

describe('urlDoSite', () => {
  it('sem SITE_URL, a produção', () => {
    expect(urlDoSite({})).toBe('https://botai.pilutech.com.br')
  })

  // Review Focus 4: o preview já responde com X-Robots-Tag: noindex, e o canonical aponta para a produção.
  it('o host do preview da Vercel nunca vira canonical', () => {
    expect(
      urlDoSite({
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'botai-site-git-x.vercel.app',
      }),
    ).toBe(SITE_DE_PRODUCAO)
  })

  it('SITE_URL vale como origem, sem a barra final', () => {
    expect(urlDoSite({ SITE_URL: 'http://localhost:3020/' })).toBe(
      'http://localhost:3020',
    )
  })

  it.each(['botai.local', 'ftp://botai.local', '   '])(
    'SITE_URL inválida (%p) cai na produção',
    (valor) => {
      expect(urlDoSite({ SITE_URL: valor })).toBe(SITE_DE_PRODUCAO)
    },
  )
})

describe('urlAbsoluta', () => {
  it('monta a URL a partir do site', () => {
    expect(urlAbsoluta('/privacidade', SITE_DE_PRODUCAO)).toBe(
      'https://botai.pilutech.com.br/privacidade',
    )
    expect(urlAbsoluta('/', SITE_DE_PRODUCAO)).toBe(
      'https://botai.pilutech.com.br/',
    )
  })
})
```

`apps/botai-site/lib/seo.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DESCRICAO_DA_HOME,
  DESCRICAO_DA_PRIVACIDADE,
  metadataDaPagina,
  metadataDoSite,
  TITULO_DA_HOME,
  TITULO_DA_PRIVACIDADE,
  VIEWPORT,
} from './seo'

const SITE = 'https://botai.pilutech.com.br'

describe('textos de busca', () => {
  it('título da home: até 60 caracteres, com o nome e o que ele gera', () => {
    expect(TITULO_DA_HOME).toBe(
      'Botaí: gerador de CPF, CNPJ e CEP para testar formulários',
    )
    expect(TITULO_DA_HOME.length).toBeLessThanOrEqual(60)
  })

  it('descrição da home: 140–160 caracteres, com os termos buscados', () => {
    expect(DESCRICAO_DA_HOME.length).toBeGreaterThanOrEqual(140)
    expect(DESCRICAO_DA_HOME.length).toBeLessThanOrEqual(160)
    for (const termo of [
      'Chrome, Firefox, Edge e Opera',
      'dados de teste',
      'CPF e CNPJ válidos',
      'CEP real',
      'formulário',
    ])
      expect(DESCRICAO_DA_HOME).toContain(termo)
  })

  it('a política tem título e descrição próprios', () => {
    expect(TITULO_DA_PRIVACIDADE).toBe('Política de privacidade do Botaí')
    expect(DESCRICAO_DA_PRIVACIDADE.length).toBeGreaterThanOrEqual(140)
    expect(DESCRICAO_DA_PRIVACIDADE.length).toBeLessThanOrEqual(160)
  })

  // Texto honesto: antes das lojas, nada de "disponível".
  it('nenhum texto de busca diz que já está disponível', () => {
    for (const texto of [
      TITULO_DA_HOME,
      DESCRICAO_DA_HOME,
      TITULO_DA_PRIVACIDADE,
      DESCRICAO_DA_PRIVACIDADE,
    ])
      expect(texto).not.toMatch(/dispon[ií]vel/i)
  })
})

describe('metadataDaPagina', () => {
  // O Next substitui o openGraph do layout inteiro: locale e siteName vêm de novo.
  it('canonical, Open Graph e Twitter da rota, sem declarar imagem', () => {
    expect(
      metadataDaPagina({
        caminho: '/privacidade',
        titulo: TITULO_DA_PRIVACIDADE,
        descricao: DESCRICAO_DA_PRIVACIDADE,
      }),
    ).toEqual({
      title: { absolute: TITULO_DA_PRIVACIDADE },
      description: DESCRICAO_DA_PRIVACIDADE,
      alternates: { canonical: '/privacidade' },
      openGraph: {
        type: 'website',
        locale: 'pt_BR',
        siteName: 'Botaí',
        url: '/privacidade',
        title: TITULO_DA_PRIVACIDADE,
        description: DESCRICAO_DA_PRIVACIDADE,
      },
      twitter: {
        card: 'summary_large_image',
        title: TITULO_DA_PRIVACIDADE,
        description: DESCRICAO_DA_PRIVACIDADE,
      },
    })
  })
})

describe('metadataDoSite', () => {
  // O tipo é `null | string | URL | undefined`: `.href` não compila no tsc (o ts-jest só transpila e
  // não acusaria), e `toEqual(new URL(…))` passaria sempre (URL não tem propriedade própria enumerável).
  it('metadataBase no site e a PiluTech como autora', () => {
    const metadata = metadataDoSite(SITE, {})
    expect(metadata.metadataBase?.toString()).toBe(`${SITE}/`)
    expect(metadata).toMatchObject({
      applicationName: 'Botaí',
      creator: 'PiluTech',
      publisher: 'PiluTech',
    })
    expect(metadata).not.toHaveProperty('verification')
  })

  it('GOOGLE_SITE_VERIFICATION vira a meta do Search Console', () => {
    expect(
      metadataDoSite(SITE, { GOOGLE_SITE_VERIFICATION: ' abc123 ' })
        .verification,
    ).toEqual({ google: 'abc123' })
  })

  it('vazia, nenhuma meta de verificação', () => {
    expect(
      metadataDoSite(SITE, { GOOGLE_SITE_VERIFICATION: '' }),
    ).not.toHaveProperty('verification')
  })
})

const CSS_DO_DESIGN_SYSTEM = readFileSync(
  join(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'styles.css'),
  'utf8',
)

function hslParaHex(h: number, s: number, l: number): string {
  const sat = s / 100
  const luz = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(luz, 1 - luz)
  const canal = (n: number) =>
    luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${[0, 8, 4]
    .map((n) =>
      Math.round(canal(n) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function fundoDoTema(seletor: ':root' | '.dark'): string {
  const bloco = CSS_DO_DESIGN_SYSTEM.slice(
    CSS_DO_DESIGN_SYSTEM.indexOf(`${seletor} {`),
  )
  const [, h, s, l] = /--background:\s*(\d+)\s+(\d+)%\s+(\d+)%/.exec(bloco)!
  return hslParaHex(Number(h), Number(s), Number(l))
}

// A barra do navegador acompanha o fundo de cada tema do @piluvitu/ui.
it('theme-color claro e escuro são o --background dos dois temas', () => {
  expect(VIEWPORT.themeColor).toEqual([
    { media: '(prefers-color-scheme: light)', color: fundoDoTema(':root') },
    { media: '(prefers-color-scheme: dark)', color: fundoDoTema('.dark') },
  ])
})
```

`apps/botai-site/lib/json-ld.test.ts`:

```ts
import {
  CONTEXTO,
  ID_DA_PILUTECH,
  jsonLdDaHome,
  jsonLdDaPrivacidade,
  serializarJsonLd,
  type NoJsonLd,
} from './json-ld'

const SITE = 'https://botai.pilutech.com.br'
const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }
const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'
const URL_FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'

function no(tipo: string, grafo: NoJsonLd[]): NoJsonLd | undefined {
  return grafo.find((n) => n['@type'] === tipo)
}

describe('jsonLdDaHome', () => {
  const dados = jsonLdDaHome(SITE, SEM_LOJA)

  it('um grafo com a PiluTech, o site e a aplicação', () => {
    expect(dados['@context']).toBe(CONTEXTO)
    expect(dados['@graph'].map((n) => n['@type'])).toEqual([
      'Organization',
      'WebSite',
      'SoftwareApplication',
    ])
  })

  // Sem logo: não há logo da PiluTech no repo, e o ícone do Botaí não é o logo da empresa.
  it('Organization: a PiluTech, sem logo', () => {
    expect(no('Organization', dados['@graph'])).toEqual({
      '@type': 'Organization',
      '@id': ID_DA_PILUTECH,
      name: 'PiluTech',
      url: 'https://pilutech.com.br',
    })
  })

  it('WebSite: o nome do site na raiz do subdomínio', () => {
    expect(no('WebSite', dados['@graph'])).toEqual({
      '@type': 'WebSite',
      '@id': `${SITE}/#site`,
      name: 'Botaí',
      url: `${SITE}/`,
      inLanguage: 'pt-BR',
      publisher: { '@id': ID_DA_PILUTECH },
    })
  })

  it('SoftwareApplication gratuito, de navegador, com as capturas', () => {
    expect(no('SoftwareApplication', dados['@graph'])).toEqual({
      '@type': 'SoftwareApplication',
      '@id': `${SITE}/#aplicacao`,
      name: 'Botaí',
      description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      applicationCategory: 'BrowserApplication',
      applicationSubCategory: 'Extensão de navegador',
      operatingSystem: 'Windows, macOS, Linux, ChromeOS',
      softwareRequirements:
        'Chrome, Edge ou Opera com Chromium 123 ou superior, ou Firefox 153 ou superior',
      featureList: [
        'Documentos: CPF, CNPJ, RG, PIS/NIS e título de eleitor, com os dígitos verificadores certos.',
        'Endereço: CEP real, com rua, bairro, cidade e UF que batem com ele.',
        'Contato: Nome, data de nascimento, celular, e-mail e senha.',
        'Empresa: Razão social, nome fantasia e CNPJ.',
        'Cartão: O cartão de teste documentado da Stripe: número, nome impresso, validade e CVV.',
      ],
      inLanguage: 'pt-BR',
      url: `${SITE}/`,
      image: `${SITE}/icon.png`,
      screenshot: [
        `${SITE}/capturas/01-pagina-preenchida-escuro.png`,
        `${SITE}/capturas/03-pessoa-de-teste-escuro.png`,
        `${SITE}/capturas/05-resultado-escuro.png`,
      ],
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
      publisher: { '@id': ID_DA_PILUTECH },
      author: { '@id': ID_DA_PILUTECH },
    })
  })

  // O Google proíbe copiar a nota das lojas.
  it('sem nota, review nem versão', () => {
    const aplicacao = no('SoftwareApplication', dados['@graph'])
    for (const campo of ['aggregateRating', 'review', 'softwareVersion'])
      expect(aplicacao).not.toHaveProperty(campo)
  })

  // Review Focus 1: só loja válida vira installUrl.
  it('installUrl só das lojas publicadas, na ordem fixa', () => {
    const aplicacao = no(
      'SoftwareApplication',
      jsonLdDaHome(SITE, {
        ...SEM_LOJA,
        firefoxUrl: URL_FIREFOX,
        chromeUrl: URL_CHROME,
        edgeUrl: URL_FIREFOX,
      })['@graph'],
    )
    expect(aplicacao?.installUrl).toEqual([URL_CHROME, URL_FIREFOX])
  })

  it('outro site muda as URLs da página, não a da PiluTech', () => {
    const local = jsonLdDaHome('http://localhost:3020', SEM_LOJA)
    expect(no('SoftwareApplication', local['@graph'])?.url).toBe(
      'http://localhost:3020/',
    )
    expect(no('Organization', local['@graph'])?.url).toBe(
      'https://pilutech.com.br',
    )
  })
})

describe('jsonLdDaPrivacidade', () => {
  it('a trilha Botaí › Política de privacidade', () => {
    expect(jsonLdDaPrivacidade(SITE)).toEqual({
      '@context': CONTEXTO,
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Botaí', item: `${SITE}/` },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Política de privacidade',
          item: `${SITE}/privacidade`,
        },
      ],
    })
  })
})

describe('serializarJsonLd', () => {
  // Um texto com </script> não pode fechar a tag.
  it('troca < por \\u003c', () => {
    expect(serializarJsonLd({ nome: '</script><b>' })).toBe(
      '{"nome":"\\u003c/script>\\u003cb>"}',
    )
  })
})
```

`apps/botai-site/components/json-ld.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { JsonLd } from './json-ld'

it('um script application/ld+json com o JSON escapado', () => {
  const { container } = render(<JsonLd dados={{ name: '</script>' }} />)
  const script = container.querySelector('script[type="application/ld+json"]')
  expect(script?.innerHTML).toBe('{"name":"\\u003c/script>"}')
})
```

`apps/botai-site/app/sitemap.test.ts`:

```ts
import sitemap from './sitemap'

const SITE_URL_ORIGINAL = process.env.SITE_URL
beforeEach(() => {
  delete process.env.SITE_URL
})
afterAll(() => {
  if (SITE_URL_ORIGINAL !== undefined) process.env.SITE_URL = SITE_URL_ORIGINAL
})

it('lista / e /privacidade, no domínio de produção', () => {
  expect(sitemap()).toEqual([
    { url: 'https://botai.pilutech.com.br/' },
    { url: 'https://botai.pilutech.com.br/privacidade' },
  ])
})
```

`apps/botai-site/app/robots.test.ts`:

```ts
import robots from './robots'

const SITE_URL_ORIGINAL = process.env.SITE_URL
beforeEach(() => {
  delete process.env.SITE_URL
})
afterAll(() => {
  if (SITE_URL_ORIGINAL !== undefined) process.env.SITE_URL = SITE_URL_ORIGINAL
})

it('libera tudo e aponta o sitemap', () => {
  expect(robots()).toEqual({
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://botai.pilutech.com.br/sitemap.xml',
  })
})
```

`apps/botai-site/app/manifest.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import manifest from './manifest'

function tamanhoDoPng(arquivo: string) {
  const png = readFileSync(join(__dirname, arquivo))
  return { largura: png.readUInt32BE(16), altura: png.readUInt32BE(20) }
}

it('nome, idioma, cores e o ícone de 300×300', () => {
  expect(manifest()).toEqual({
    name: 'Botaí',
    short_name: 'Botaí',
    description:
      'Extensão para Chrome, Firefox, Edge e Opera que gera dados de teste: CPF e CNPJ válidos, CEP real com endereço, e preenche o formulário com um atalho.',
    lang: 'pt-BR',
    start_url: '/',
    display: 'browser',
    background_color: '#090b11',
    theme_color: '#090b11',
    icons: [{ src: '/icon.png', sizes: '300x300', type: 'image/png' }],
  })
})

// O Google aceita favicon PNG quadrado; SVG não.
it('icon.png e apple-icon.png são PNG quadrados de 300 px', () => {
  for (const arquivo of ['icon.png', 'apple-icon.png'])
    expect([arquivo, tamanhoDoPng(arquivo)]).toEqual([
      arquivo,
      { largura: 300, altura: 300 },
    ])
})
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest lib/site lib/seo lib/json-ld components/json-ld app/sitemap app/robots app/manifest; echo "exit=$?"` → FAIL (`Cannot find module`), `exit=1`.

- [ ] **Step 3: Implemente a lógica e as rotas**

`apps/botai-site/lib/site.ts`:

```ts
export const SITE_DE_PRODUCAO = 'https://botai.pilutech.com.br'

export function urlDoSite(
  env: Record<string, string | undefined> = process.env,
): string {
  const valor = env.SITE_URL?.trim()
  if (!valor) return SITE_DE_PRODUCAO
  try {
    const url = new URL(valor)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : SITE_DE_PRODUCAO
  } catch {
    return SITE_DE_PRODUCAO
  }
}

export function urlAbsoluta(
  caminho: string,
  siteUrl: string = urlDoSite(),
): string {
  return new URL(caminho, `${siteUrl}/`).href
}
```

`apps/botai-site/lib/seo.ts`:

```ts
import type { Metadata, Viewport } from 'next'
import { NOME } from './conteudo'

export const TITULO_DA_HOME =
  'Botaí: gerador de CPF, CNPJ e CEP para testar formulários'
export const DESCRICAO_DA_HOME =
  'Extensão para Chrome, Firefox, Edge e Opera que gera dados de teste: CPF e CNPJ válidos, CEP real com endereço, e preenche o formulário com um atalho.'
export const TITULO_DA_PRIVACIDADE = 'Política de privacidade do Botaí'
export const DESCRICAO_DA_PRIVACIDADE =
  'Como o Botaí trata os dados: nada sai do seu navegador. O que a extensão acessa, o que guarda, as permissões de cada navegador e como apagar a pessoa gerada.'

export const COR_DO_TEMA_CLARO = '#f7f9fc'
export const COR_DO_TEMA_ESCURO = '#090b11'

export type PaginaDoSite = {
  caminho: string
  titulo: string
  descricao: string
}

export function metadataDaPagina({
  caminho,
  titulo,
  descricao,
}: PaginaDoSite): Metadata {
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: NOME,
      url: caminho,
      title: titulo,
      description: descricao,
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descricao,
    },
  }
}

export function metadataDoSite(
  siteUrl: string,
  env: Record<string, string | undefined> = process.env,
): Metadata {
  const google = env.GOOGLE_SITE_VERIFICATION?.trim()
  return {
    metadataBase: new URL(`${siteUrl}/`),
    applicationName: NOME,
    creator: 'PiluTech',
    publisher: 'PiluTech',
    formatDetection: { telephone: false, address: false, email: false },
    ...(google ? { verification: { google } } : {}),
  }
}

export const VIEWPORT: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: COR_DO_TEMA_CLARO },
    { media: '(prefers-color-scheme: dark)', color: COR_DO_TEMA_ESCURO },
  ],
}
```

`apps/botai-site/lib/json-ld.ts`:

```ts
import { lojasPublicadas, type UrlsDasLojas } from '@piluvitu/tools/pilulabs'
import { CAPTURAS } from './capturas'
import {
  NOME,
  PROPOSTA,
  RECURSOS,
  REQUISITOS_DO_SOFTWARE,
  URL_DA_PILUTECH,
} from './conteudo'
import { urlAbsoluta } from './site'

export const CONTEXTO = 'https://schema.org'
export const ID_DA_PILUTECH = `${URL_DA_PILUTECH}/#organizacao`

export type NoJsonLd = Record<string, unknown>

export function serializarJsonLd(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, '\\u003c')
}

export function jsonLdDaHome(
  siteUrl: string,
  urls: UrlsDasLojas,
): { '@context': string; '@graph': NoJsonLd[] } {
  const raiz = urlAbsoluta('/', siteUrl)
  const instalacao = lojasPublicadas(urls).map(({ url }) => url)
  const pilutech = { '@id': ID_DA_PILUTECH }
  return {
    '@context': CONTEXTO,
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ID_DA_PILUTECH,
        name: 'PiluTech',
        url: URL_DA_PILUTECH,
      },
      {
        '@type': 'WebSite',
        '@id': `${raiz}#site`,
        name: NOME,
        url: raiz,
        inLanguage: 'pt-BR',
        publisher: pilutech,
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${raiz}#aplicacao`,
        name: NOME,
        description: PROPOSTA,
        applicationCategory: 'BrowserApplication',
        applicationSubCategory: 'Extensão de navegador',
        operatingSystem: 'Windows, macOS, Linux, ChromeOS',
        softwareRequirements: REQUISITOS_DO_SOFTWARE,
        featureList: RECURSOS.map((r) => `${r.titulo}: ${r.texto}`),
        inLanguage: 'pt-BR',
        url: raiz,
        image: urlAbsoluta('/icon.png', siteUrl),
        screenshot: CAPTURAS.map((c) =>
          urlAbsoluta(c.variantes.escuro.src, siteUrl),
        ),
        ...(instalacao.length > 0 ? { installUrl: instalacao } : {}),
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
        publisher: pilutech,
        author: pilutech,
      },
    ],
  }
}

export function jsonLdDaPrivacidade(siteUrl: string): NoJsonLd {
  return {
    '@context': CONTEXTO,
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: NOME,
        item: urlAbsoluta('/', siteUrl),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Política de privacidade',
        item: urlAbsoluta('/privacidade', siteUrl),
      },
    ],
  }
}
```

`apps/botai-site/components/json-ld.tsx`:

```tsx
import { serializarJsonLd } from '@/lib/json-ld'

export function JsonLd({ dados }: { dados: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializarJsonLd(dados) }}
    />
  )
}
```

`apps/botai-site/lib/imagem-og.tsx` (o mesmo desenho do `apps/web/lib/og-pilulabs-image.tsx`; o ícone é lido no build, porque a rota é estática):

```tsx
/* eslint-disable @next/next/no-img-element -- ImageResponse (Satori) só suporta <img> */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export type DadosDaImagemOg = {
  rotulo: string
  titulo: string
  subtitulo: string
}

export async function imagemOg({
  rotulo,
  titulo,
  subtitulo,
}: DadosDaImagemOg): Promise<ImageResponse> {
  const icone = await readFile(join(process.cwd(), 'app', 'icon.png'), 'base64')
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: '#0b1220',
      }}
    >
      <div style={{ display: 'flex', fontSize: 30, color: '#38bdf8' }}>
        {rotulo}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
        <img
          src={`data:image/png;base64,${icone}`}
          width={168}
          height={168}
          alt=""
          style={{ borderRadius: 36 }}
        />
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: 1 }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: titulo.length > 14 ? 72 : 92,
              fontWeight: 700,
              color: '#f8fafc',
              letterSpacing: -2,
            }}
          >
            {titulo}
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 38,
              color: '#94a3b8',
              lineHeight: 1.3,
            }}
          >
            {subtitulo}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', fontSize: 28, color: '#64748b' }}>
        PiluLabs · Powered by PiluTech
      </div>
    </div>,
    { ...size },
  )
}
```

`apps/botai-site/app/opengraph-image.tsx`:

```tsx
import { NOME, PROPOSTA } from '@/lib/conteudo'
import { imagemOg } from '@/lib/imagem-og'

export { contentType, size } from '@/lib/imagem-og'
export const alt =
  'Botaí: gerador de dados fake para formulários (CPF, CNPJ, CEP)'

export default function Image() {
  return imagemOg({
    rotulo: '~/pilulabs/botai',
    titulo: NOME,
    subtitulo: PROPOSTA,
  })
}
```

`apps/botai-site/app/twitter-image.tsx`:

```tsx
export { alt, contentType, default, size } from './opengraph-image'
```

`apps/botai-site/app/privacidade/opengraph-image.tsx`:

```tsx
import { imagemOg } from '@/lib/imagem-og'

export { contentType, size } from '@/lib/imagem-og'
export const alt = 'Política de privacidade do Botaí: nada sai do seu navegador'

export default function Image() {
  return imagemOg({
    rotulo: '~/pilulabs/botai/privacidade',
    titulo: 'Política de privacidade',
    subtitulo: 'Botaí: nada sai do seu navegador',
  })
}
```

`apps/botai-site/app/privacidade/twitter-image.tsx`:

```tsx
export { alt, contentType, default, size } from './opengraph-image'
```

`apps/botai-site/app/sitemap.ts`:

```ts
import type { MetadataRoute } from 'next'
import { urlAbsoluta } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: urlAbsoluta('/') }, { url: urlAbsoluta('/privacidade') }]
}
```

`apps/botai-site/app/robots.ts`:

```ts
import type { MetadataRoute } from 'next'
import { urlAbsoluta } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: urlAbsoluta('/sitemap.xml'),
  }
}
```

`apps/botai-site/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'
import { NOME } from '@/lib/conteudo'
import { COR_DO_TEMA_ESCURO, DESCRICAO_DA_HOME } from '@/lib/seo'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOME,
    short_name: NOME,
    description: DESCRICAO_DA_HOME,
    lang: 'pt-BR',
    start_url: '/',
    display: 'browser',
    background_color: COR_DO_TEMA_ESCURO,
    theme_color: COR_DO_TEMA_ESCURO,
    icons: [{ src: '/icon.png', sizes: '300x300', type: 'image/png' }],
  }
}
```

`apps/botai-site/app/layout.tsx`: troque `export const metadata: Metadata = { title: 'Botaí' }` por

```tsx
export const metadata: Metadata = metadataDoSite(urlDoSite())
export const viewport: Viewport = VIEWPORT
```

com os imports `import type { Metadata, Viewport } from 'next'`, `import { metadataDoSite, VIEWPORT } from '@/lib/seo'` e `import { urlDoSite } from '@/lib/site'`.

`apps/botai-site/app/page.tsx` (versão final):

```tsx
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { Landing } from '@/components/landing'
import { lerUrlsDasLojas } from '@/lib/cms'
import { jsonLdDaHome } from '@/lib/json-ld'
import { modeloDaLanding } from '@/lib/modelo'
import { DESCRICAO_DA_HOME, metadataDaPagina, TITULO_DA_HOME } from '@/lib/seo'
import { urlDoSite } from '@/lib/site'

export const metadata: Metadata = metadataDaPagina({
  caminho: '/',
  titulo: TITULO_DA_HOME,
  descricao: DESCRICAO_DA_HOME,
})

export default function Home() {
  const urls = lerUrlsDasLojas()
  return (
    <>
      <JsonLd dados={jsonLdDaHome(urlDoSite(), urls)} />
      <Landing {...modeloDaLanding(urls)} />
    </>
  )
}
```

`apps/botai-site/app/privacidade/page.tsx`: acrescente os imports

```tsx
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { jsonLdDaPrivacidade } from '@/lib/json-ld'
import {
  DESCRICAO_DA_PRIVACIDADE,
  metadataDaPagina,
  TITULO_DA_PRIVACIDADE,
} from '@/lib/seo'
import { urlDoSite } from '@/lib/site'
```

o export

```tsx
export const metadata: Metadata = metadataDaPagina({
  caminho: '/privacidade',
  titulo: TITULO_DA_PRIVACIDADE,
  descricao: DESCRICAO_DA_PRIVACIDADE,
})
```

e, como primeiro filho do `<div>` raiz da página, `<JsonLd dados={jsonLdDaPrivacidade(urlDoSite())} />`.

`apps/botai-site/scripts/conferir-rotas-estaticas.mjs`:

```js
export const ROTAS = [
  '/',
  '/privacidade',
  '/opengraph-image',
  '/twitter-image',
  '/privacidade/opengraph-image',
  '/privacidade/twitter-image',
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest',
]
```

`apps/botai-site/.env.example`:

```bash
# URL pública (metadataBase, canonical, og:url, JSON-LD, sitemap e robots).
# Ausente, vale https://botai.pilutech.com.br, inclusive no preview da Vercel, que já
# responde com X-Robots-Tag: noindex. Só para conferir o site num host próprio:
# SITE_URL=http://localhost:3020

# Search Console: só o content da meta google-site-verification.
# GOOGLE_SITE_VERIFICATION=
```

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest; echo "jest exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
./node_modules/.bin/eslint .; echo "eslint exit=$?"
pnpm run build; echo "build exit=$?"
node -e 'console.log(Object.keys(require("./.next/prerender-manifest.json").routes).sort().join("\n"))'
```

Expected: os quatro `exit=0`; o build termina com as 9 rotas em `Rotas estáticas: …`; a listagem mostra as chaves reais (se uma imagem vier com sufixo de hash, o `conferir-rotas-estaticas` já casa). Se o build falhar só por uma rota de metadados (`/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`): procure-a na listagem; com outro nome, troque a entrada de `ROTAS` pela chave real; ausente de vez (o Next a serve sem passar pelo manifesto), tire-a de `ROTAS` e registre o fato medido em "Build" do `apps/botai-site/CLAUDE.md` na Tarefa 11. As rotas `/`, `/privacidade` e as quatro imagens nunca saem da lista.

- [ ] **Step 4: E2E das checagens de SEO e de acessibilidade**

`apps/botai-site/app/seo.e2e.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { lojasPublicadas } from '@piluvitu/tools/pilulabs'
import type { AxeResults, RunOptions } from 'axe-core'
import { lerUrlsDasLojas } from '../lib/cms'
import {
  DESCRICAO_DA_HOME,
  DESCRICAO_DA_PRIVACIDADE,
  TITULO_DA_HOME,
  TITULO_DA_PRIVACIDADE,
} from '../lib/seo'
import { SITE_DE_PRODUCAO } from '../lib/site'

const ROTAS = [
  {
    caminho: '/',
    titulo: TITULO_DA_HOME,
    descricao: DESCRICAO_DA_HOME,
    imagem: '/opengraph-image',
  },
  {
    caminho: '/privacidade',
    titulo: TITULO_DA_PRIVACIDADE,
    descricao: DESCRICAO_DA_PRIVACIDADE,
    imagem: '/privacidade/opengraph-image',
  },
] as const

const naProducao = (caminho: string) =>
  new URL(caminho, `${SITE_DE_PRODUCAO}/`).href

async function lerJsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const textos = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents()
  expect(textos.length).toBeGreaterThan(0)
  return textos.map((texto) => JSON.parse(texto) as Record<string, unknown>)
}

// O metadataBase é a produção; o servidor do teste é a 3020: só o caminho serve para pedir.
async function caminhoDaMeta(page: Page, seletor: string): Promise<string> {
  const conteudo = await page.locator(seletor).first().getAttribute('content')
  expect(conteudo).toBeTruthy()
  const url = new URL(conteudo as string)
  return url.pathname + url.search
}

async function tamanhoDoPng(page: Page, caminho: string) {
  const resposta = await page.request.get(caminho)
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toContain('image/png')
  const corpo = await resposta.body()
  return { largura: corpo.readUInt32BE(16), altura: corpo.readUInt32BE(20) }
}

for (const rota of ROTAS) {
  test.describe(`SEO de ${rota.caminho}`, () => {
    test('title, description, canonical, lang e indexável', async ({
      page,
    }) => {
      await page.goto(rota.caminho)
      await expect(page).toHaveTitle(rota.titulo)
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        rota.descricao,
      )
      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute('href')
      expect(new URL(canonical as string).href).toBe(naProducao(rota.caminho))
      await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
      await expect(
        page.locator('meta[name="robots"][content*="noindex"]'),
      ).toHaveCount(0)
    })

    test('Open Graph e Twitter, com a imagem 1200×630 do próprio segmento', async ({
      page,
    }) => {
      await page.goto(rota.caminho)
      const og = (propriedade: string) =>
        page.locator(`meta[property="og:${propriedade}"]`)
      await expect(og('type')).toHaveAttribute('content', 'website')
      await expect(og('locale')).toHaveAttribute('content', 'pt_BR')
      await expect(og('site_name')).toHaveAttribute('content', 'Botaí')
      await expect(og('title')).toHaveAttribute('content', rota.titulo)
      await expect(og('description')).toHaveAttribute('content', rota.descricao)
      const urlOg = await og('url').getAttribute('content')
      expect(new URL(urlOg as string).href).toBe(naProducao(rota.caminho))
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        'content',
        'summary_large_image',
      )
      const imagemOg = await caminhoDaMeta(page, 'meta[property="og:image"]')
      expect(imagemOg.startsWith(rota.imagem)).toBe(true)
      expect(await tamanhoDoPng(page, imagemOg)).toEqual({
        largura: 1200,
        altura: 630,
      })
      const imagemTwitter = await caminhoDaMeta(
        page,
        'meta[name="twitter:image"]',
      )
      expect(await tamanhoDoPng(page, imagemTwitter)).toEqual({
        largura: 1200,
        altura: 630,
      })
    })

    test('um h1 só e títulos sem pular nível', async ({ page }) => {
      await page.goto(rota.caminho)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      const niveis = await page
        .locator('h1, h2, h3, h4, h5, h6')
        .evaluateAll((titulos) => titulos.map((t) => Number(t.tagName[1])))
      expect(niveis[0]).toBe(1)
      for (let i = 1; i < niveis.length; i++)
        expect(niveis[i] - niveis[i - 1]).toBeLessThanOrEqual(1)
    })

    test('toda imagem tem alt, e as capturas um alt descritivo', async ({
      page,
    }) => {
      await page.goto(rota.caminho)
      await expect(page.locator('img:not([alt])')).toHaveCount(0)
      const alts = await page
        .locator('img[src*="capturas"]')
        .evaluateAll((imagens) =>
          imagens.map((i) => i.getAttribute('alt') ?? ''),
        )
      for (const alt of alts) expect(alt.length).toBeGreaterThan(40)
    })

    // A meta da spec é o Lighthouse mobile: a 320 px a tabela de atalhos rola dentro da moldura, e só
    // ali o axe vê o scrollable-region-focusable.
    for (const tema of ['light', 'dark'] as const)
      for (const largura of [1280, 320]) {
        test(`acessibilidade (axe, WCAG 2.1 A e AA), tema ${tema}, ${largura} px`, async ({
          page,
        }) => {
          await page.setViewportSize({ width: largura, height: 800 })
          await page.emulateMedia({ colorScheme: tema })
          await page.goto(rota.caminho)
          await page.addScriptTag({
            path: require.resolve('axe-core/axe.min.js'),
          })
          const violacoes = await page.evaluate(async () => {
            const { axe } = window as unknown as {
              axe: {
                run: (alvo: Document, opcoes: RunOptions) => Promise<AxeResults>
              }
            }
            const { violations } = await axe.run(document, {
              runOnly: {
                type: 'tag',
                values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
              },
            })
            return violations
              .filter((v) => v.impact === 'serious' || v.impact === 'critical')
              .map(
                (v) =>
                  `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
              )
          })
          expect(violacoes).toEqual([])
        })
      }
  })
}

test('JSON-LD de /: SoftwareApplication gratuito, sem nota, com as lojas do CMS', async ({
  page,
}) => {
  await page.goto('/')
  const [dados] = await lerJsonLd(page)
  const grafo = dados['@graph'] as Record<string, unknown>[]
  expect(grafo.map((n) => n['@type'])).toEqual([
    'Organization',
    'WebSite',
    'SoftwareApplication',
  ])
  const aplicacao = grafo[2]
  expect(aplicacao).toMatchObject({
    name: 'Botaí',
    applicationCategory: 'BrowserApplication',
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
  })
  expect(aplicacao).not.toHaveProperty('aggregateRating')
  const lojas = lojasPublicadas(lerUrlsDasLojas()).map((l) => l.url)
  if (lojas.length > 0) expect(aplicacao.installUrl).toEqual(lojas)
  else expect(aplicacao).not.toHaveProperty('installUrl')
})

test('JSON-LD de /privacidade: a trilha Botaí › Política', async ({ page }) => {
  await page.goto('/privacidade')
  const [dados] = await lerJsonLd(page)
  expect(dados['@type']).toBe('BreadcrumbList')
})

test('robots.txt libera tudo e aponta o sitemap', async ({ page }) => {
  const texto = await (await page.request.get('/robots.txt')).text()
  expect(texto).toContain('Allow: /')
  expect(texto).toContain(`Sitemap: ${SITE_DE_PRODUCAO}/sitemap.xml`)
})

test('sitemap.xml lista as duas rotas', async ({ page }) => {
  const xml = await (await page.request.get('/sitemap.xml')).text()
  expect(xml).toContain(`<loc>${SITE_DE_PRODUCAO}/</loc>`)
  expect(xml).toContain(`<loc>${SITE_DE_PRODUCAO}/privacidade</loc>`)
})

test('ícones, manifest e theme-color claro e escuro', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="icon"]')).toHaveCount(1)
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1)
  expect(await tamanhoDoPng(page, '/icon.png')).toEqual({
    largura: 300,
    altura: 300,
  })
  const manifesto = await (
    await page.request.get('/manifest.webmanifest')
  ).json()
  expect(manifesto.name).toBe('Botaí')
  await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2)
})
```

`apps/botai-site/app/lojas-publicadas.e2e.ts`: acrescente, no fim, o JSON-LD do build com a loja publicada (o `seo.e2e.ts` lê o CMS real, onde hoje não há loja, e não chega ao `installUrl`):

```ts
test('JSON-LD: installUrl só com o Firefox', async ({ page }) => {
  await page.goto('/')
  const texto = await page
    .locator('script[type="application/ld+json"]')
    .first()
    .textContent()
  const grafo = (
    JSON.parse(texto as string) as { '@graph': Record<string, unknown>[] }
  )['@graph']
  const aplicacao = grafo.find((no) => no['@type'] === 'SoftwareApplication')
  expect(aplicacao?.installUrl).toEqual([URLS.firefoxUrl])
})
```

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
lsof -nP -iTCP:3020 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test -c playwright.lojas.config.ts --retries=0; echo "lojas exit=$?"
CI=1 ./node_modules/.bin/playwright test --retries=0; echo "e2e exit=$?"
```

Expected: `exit=0` nos três, todos os E2E (lojas publicadas, página, política e SEO, com o axe a 1280 e a 320 px) verdes. Se o axe acusar `color-contrast`, ajuste a cor no componente com o token certo (nunca baixe o nível do teste); confira também se o alvo é o "Em breve" desabilitado (o axe ignora controle desabilitado; se não ignorou, o botão perdeu o `disabled`). Se ele acusar `scrollable-region-focusable` a 320 px, uma moldura com `overflow-x-auto` perdeu o `tabIndex={0}`/`role="region"` (a `TabelaAtalhos` da Tarefa 4, ou a tabela da política, Tarefa 7).

- [ ] **Step 5: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai-site && /usr/bin/git commit -m "feat(botai-site): SEO completo (metadata, Open Graph, JSON-LD, sitemap, robots, ícones e manifest) com as checagens no E2E"; echo "exit=$?"
```

---

### Tarefa 9: O `apps/web` deixa de servir o Botaí

Saem a página, a política e as imagens OG do Botaí; os dois caminhos respondem 308 para a landing, com a query, pelos `redirects` do `next.config.mjs` (rodam antes do `proxy.ts`, ver "Execution order" em `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). O item `botai` do CMS passa a `paginaPropria: false`, mantendo o `site`, e o card passa a abrir a landing (em aba nova, como o Sombraí). O que só a página usava sai junto, e nada sem importador fica. O `icone-128.png` fica: é o logo do card.

**Files:**

- Modify (`apps/web/`): `next.config.mjs`, `content/pilulabs/botai/index.yaml`, `lib/pilulabs.ts`, `lib/pilulabs.test.ts`, `lib/pilulabs-json-ld.ts`, `lib/pilulabs-json-ld.test.ts`, `lib/pilulabs-conteudo.test.ts`, `app/(site)/pilulabs/pilulabs.e2e.ts`, `app/(site)/pilulabs/subdominios.e2e.ts`, `app/(site)/pilulabs/chave-ligada.e2e.ts`, `CLAUDE.md`
- Delete: `app/(site)/pilulabs/botai/` (6 arquivos), `components/pilulabs/{atalhos-tabela,botoes-loja,capturas-galeria}.{tsx,test.tsx,stories.tsx}`
- **Fica para a Tarefa 10:** `public/pilulabs/botai/capturas/` (6 PNG). O `apps/botai/loja/imagens.test.ts` confere essas cópias (`COPIAS_PARA_O_SITE`) até a Tarefa 10 trocar a lista; apagá-las aqui deixaria vermelhos o Vitest do Botaí, o `make test` e o job `botai` do CI neste commit. Sem importador desde esta tarefa, elas ficam um commit como arquivos órfãos.

**Interfaces:**

- Consumes: nada novo (o pacote da Tarefa 1).
- Produces: 308 `GET /pilulabs/botai[?q]` → `https://botai.pilutech.com.br/[?q]` e `GET /pilulabs/botai/privacidade[?q]` → `https://botai.pilutech.com.br/privacidade[?q]`. Saem de `lib/pilulabs.ts`: `Captura`, `ROTULOS_CAPTURA`, `altDaCaptura`, `listarCapturas`, `metadataDoItem`. Saem de `lib/pilulabs-json-ld.ts`: `ItemTrilha`, `DetalhesSoftware`, `jsonLdBreadcrumb`, `jsonLdDoItem`.

- [ ] **Step 1: Escreva os E2E novos (falham: a rota velha ainda responde 200)**

Em `apps/web/app/(site)/pilulabs/pilulabs.e2e.ts`:

- troque os dois blocos `test.describe('/pilulabs/botai', …)` e `test.describe('/pilulabs/botai/privacidade', …)` por:

```ts
// O Botaí tem landing própria (apps/botai-site). Review Focus 5: link antigo, com query, segue valendo.
test.describe('o Botaí mora em botai.pilutech.com.br', () => {
  for (const [antiga, nova] of [
    [
      '/pilulabs/botai?utm_source=loja',
      'https://botai.pilutech.com.br/?utm_source=loja',
    ],
    [
      '/pilulabs/botai/privacidade?x=1',
      'https://botai.pilutech.com.br/privacidade?x=1',
    ],
  ] as const) {
    test(`${antiga} responde 308 para ${nova}`, async ({ page }) => {
      const resposta = await page.request.get(antiga, { maxRedirects: 0 })
      expect(resposta.status()).toBe(308)
      expect(new URL(resposta.headers()['location']).href).toBe(nova)
    })
  }

  test('o card do Botaí abre a landing, em aba nova', async ({ page }) => {
    const botai = doSlug('botai')
    await page.goto('/pilulabs')
    const link = page.locator(`a[href="${botai.site}"]`)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toContainText(botai.nome)
  })
})
```

- no bloco final "cabe na largura de um celular", troque a lista `['/pilulabs', '/pilulabs/botai', '/pilulabs/botai/privacidade']` por `['/pilulabs']`;
- no import do topo, tire `LOJA_UI` (a linha inteira) e, do `@piluvitu/tools/pilulabs`, `LOJAS` e `lojasPublicadas` (fica `import { TIPOS } from '@piluvitu/tools/pilulabs'`).

Run (porta livre, Global Constraints):

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web && lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test --retries=0 '\(site\)/pilulabs/pilulabs'; echo "exit=$?"
```

Expected: os dois testes de 308 FAIL (`Expected: 308, Received: 200`) e o do card FAIL (o `href` ainda é `/pilulabs/botai`), `exit=1`.

- [ ] **Step 2: Redirects, CMS e remoção**

`apps/web/next.config.mjs`: depois de `allowedDevOrigins: [...]`, acrescente

```js
  async redirects() {
    return [
      {
        source: '/pilulabs/botai',
        destination: 'https://botai.pilutech.com.br/',
        permanent: true,
      },
      {
        source: '/pilulabs/botai/privacidade',
        destination: 'https://botai.pilutech.com.br/privacidade',
        permanent: true,
      },
    ]
  },
```

`apps/web/content/pilulabs/botai/index.yaml`: `paginaPropria: true` → `paginaPropria: false` (o `site: https://botai.pilutech.com.br` fica).

Apague o que só o Botaí usava:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web && /usr/bin/git rm -rq "app/(site)/pilulabs/botai" \
  components/pilulabs/atalhos-tabela.tsx components/pilulabs/atalhos-tabela.test.tsx components/pilulabs/atalhos-tabela.stories.tsx \
  components/pilulabs/botoes-loja.tsx components/pilulabs/botoes-loja.test.tsx components/pilulabs/botoes-loja.stories.tsx \
  components/pilulabs/capturas-galeria.tsx components/pilulabs/capturas-galeria.test.tsx components/pilulabs/capturas-galeria.stories.tsx; echo "exit=$?"
```

`apps/web/lib/pilulabs.ts`:

- tire os imports `readdirSync` (`node:fs`) e `join` (`node:path`);
- apague `export type Captura = …`, `export const ROTULOS_CAPTURA`, `const PREFIXO_DE_ORDEM`, `const EXTENSAO_PNG`, `export function altDaCaptura`, o comentário "Roda no build: …" e `export function listarCapturas`;
- apague `export function metadataDoItem` (fica `metadataDaPagina` e o tipo `PaginaPiluLabs`, que a vitrine usa).

`apps/web/lib/pilulabs.test.ts`:

- tire do import `altDaCaptura`, `listarCapturas`, `metadataDoItem` e `ROTULOS_CAPTURA`, e a linha de imports de `node:fs`, `node:os` e `node:path` (só os blocos removidos os usam);
- apague `describe('listarCapturas', …)`, `describe('altDaCaptura', …)` e `describe('metadataDoItem', …)`.

`apps/web/lib/pilulabs-json-ld.ts`:

- troque as duas linhas de import (`lojasPublicadas` e `type Captura, type ItemPiluLabs`) por nada (o arquivo passa a importar só `urlPublica`);
- apague `export type ItemTrilha`, `export type DetalhesSoftware`, `type EntradaJsonLdItem`, `export function jsonLdBreadcrumb` e `export function jsonLdDoItem` (ficam `CONTEXTO_SCHEMA`, `ParteDaVitrine`, `absoluto`, `urlDaPagina`, `publicador` e `jsonLdVitrine`).

`apps/web/lib/pilulabs-json-ld.test.ts`:

- troque o topo por `import { CONTEXTO_SCHEMA, jsonLdVitrine } from './pilulabs-json-ld'` e `const SITE = 'https://piluvitu.com.br'`;
- apague `DETALHES`, `BOTAI`, `CAPTURAS`, `montar`, `describe('jsonLdDoItem', …)` e `describe('jsonLdBreadcrumb', …)` (fica `describe('jsonLdVitrine', …)` inteiro).

`apps/web/lib/pilulabs-conteudo.test.ts`, primeiro `it` do catálogo:

- título: `'o Botaí: extensão listada e em destaque, sem página aqui: o site é a landing do apps/botai-site'`;
- `paginaPropria: true` → `paginaPropria: false`.

`apps/web/app/(site)/pilulabs/subdominios.e2e.ts`:

- apague `function itemBotai()`, `const botai = itemBotai()`, o import de `lerItensDoConteudo` e o de `join`, e os testes `'botai.pilutech.localhost/ é a página do Botaí'` e `'botai.pilutech.localhost/privacidade é a política'`;
- no teste `'a página do subdomínio carrega os chunks do /_next sem erro'`, troque o host por `pilutech.localhost` e o heading esperado por `page.getByRole('heading', { level: 1, name: 'PiluLabs' })`; título do teste: `'a vitrine no host PiluTech carrega os chunks do /_next sem erro'`;
- no teste `'os arquivos saem no subdomínio sem reescrita'`, o host `botai.pilutech.localhost` (que o `apps/web` deixa de servir) vira `pilutech.localhost`, e o pedido ganha `{ maxRedirects: 0 }`: no apex, o que não é exceção responde 308 para `piluvitu.com.br`, e seguir o redirect daria 200 pela internet sem provar nada. Título: `'os arquivos saem no host PiluTech sem reescrita nem 308'`; o comentário acima dele passa a falar de "todo host PiluTech". O `status` 200 e o `content-type` `image/x-icon` ficam.

`apps/web/app/(site)/pilulabs/chave-ligada.e2e.ts`:

- apague o teste do 308 (agora no `pilulabs.e2e.ts`, que roda sempre), `'a página do Botaí no subdomínio: …'` e `'a política no subdomínio: …'`;
- apague `function doSlug` e `const botai = doSlug('botai')`. O `canonicalDaRaiz`, o `url` e o `itens` ficam: o teste da vitrine e o da home ainda os usam.

Confira que nada mais usa o que saiu:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web && /usr/bin/grep -rn --exclude-dir=node_modules --exclude-dir=.next --exclude='*.tsbuildinfo' -E "listarCapturas|altDaCaptura|ROTULOS_CAPTURA|metadataDoItem|jsonLdDoItem|jsonLdBreadcrumb|DetalhesSoftware|AtalhosTabela|BotoesLoja|CapturasGaleria|pilulabs/botai/capturas" . ; echo "exit=$?"
```

Expected: só ocorrências em `CLAUDE.md` (o Step 4 as trata) e as strings genéricas de exemplo de `lib/pilutech-dominios.test.ts`/`proxy.test.ts`; nenhuma em código.

- [ ] **Step 3: Verificação**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web && ./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
./node_modules/.bin/jest; echo "jest exit=$?"
./node_modules/.bin/eslint .; echo "eslint exit=$?"
KEYSTATIC_GITHUB_CLIENT_ID=ci-dummy KEYSTATIC_GITHUB_CLIENT_SECRET=ci-dummy KEYSTATIC_SECRET=ci-dummy-secret-32-chars-padding-x NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG=ci-dummy pnpm run build:ci; echo "build exit=$?"
node -e 'const { routes } = require("./.next/prerender-manifest.json"); const ks = Object.keys(routes); for (const r of ["/pilulabs", ...["opengraph-image", "twitter-image"].map((t) => ks.find((k) => new RegExp(`^/pilulabs/${t}(-[a-z0-9]+)?$`).test(k)) || `/pilulabs/${t}`)]) console.log(r, routes[r] ? routes[r].initialRevalidateSeconds : "NÃO ESTÁTICA")'
lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test --retries=0 '\(site\)/pilulabs/' '\(site\)/home'; echo "e2e exit=$?"
cd ../botai && ./node_modules/.bin/vitest run loja/; echo "botai vitest exit=$?"
```

Expected: os seis `exit=0` (o último prova que as capturas do `apps/web`, ainda conferidas pelo `apps/botai`, continuam lá); as três linhas do `node -e` terminam em `false`; o `chave-ligada` sai como skipped. Rode à parte o E2E com a chave ligada: `PILUTECH_SUBDOMINIOS=1 CI=1 ./node_modules/.bin/playwright test --retries=0 pilulabs/chave-ligada; echo "exit=$?"` → `exit=0`. Depois de cada E2E, confira `/usr/bin/git status` (o `next dev` reescreve o `apps/web/CLAUDE.md`).

- [ ] **Step 4: `apps/web/CLAUDE.md` (seção PiluLabs)**

Edite assim:

1. **Tabela "Rotas e hosts":** fica só a linha de `/pilulabs`. O parágrafo de baixo vira: "O Botaí e o Sombraí não têm rota aqui: `botai.pilutech.com.br` é a landing do `apps/botai-site` e `sombrai.pilutech.com.br` a do projeto do Sombraí, cada uma num projeto Vercel próprio; o link do card é o `site`. Os caminhos antigos do Botaí (`/pilulabs/botai` e `/pilulabs/botai/privacidade`) respondem 308 para a landing, com a query, pelos `redirects` do `next.config.mjs`, que rodam antes do `proxy.ts`, com a chave ligada ou não."
2. **⚠️ "Um YAML que o reader do Keystatic recusa derruba o build":** troque "home, `/pilulabs`, a página e a OG do Botaí, `/api/admin/stats` e o `next build`" por "home, `/pilulabs`, `/api/admin/stats` e o `next build`. O `apps/botai-site` lê o mesmo `content/pilulabs/botai/index.yaml` no build dele (só as 4 URLs de loja, pelo `yaml`, sem o reader)".
3. **"Regras":** no sub-bullet de `lib/pilulabs.ts`, troque "`listarCapturas` e `metadataDaPagina`/`metadataDoItem`." por "`metadataDaPagina`.".
4. **"Subdomínios" › "Local":** troque "`http://pilutech.localhost:3333` e `http://botai.pilutech.localhost:3333/privacidade`." por "`http://pilutech.localhost:3333`."
5. **"Passos do dono para ligar os subdomínios":** no passo 1, tire `botai.pilutech.com.br` da lista e acrescente "(o `botai.pilutech.com.br` vai no projeto do `apps/botai-site`; ver "Deploy" em `apps/botai-site/CLAUDE.md`)"; no passo 2, `CNAME botai` passa a ser "com o valor do projeto do `apps/botai-site`"; no passo 4, "Com `curl -sI https://botai.pilutech.com.br` respondendo 200" vira "Com `curl -sI https://pilutech.com.br` respondendo 200 (a vitrine, que a reescrita do apex serve com a chave desligada)", porque o `botai` deixa de ser servido por este projeto.
6. **"Novo item":** acrescente, depois do bloco "produto com página própria": "- **produto com landing própria** (o Botaí, no `apps/botai-site`; o Sombraí): `paginaPropria: false` e o `site` na URL da landing."
7. **"Lançar o Botaí":** "as URLs das lojas aprovadas entram pelo `/admin/pilulabs`; o card daqui e a landing (que relê o YAML no build, ver o `ignoreCommand` em `apps/botai-site/vercel.json`) mudam juntos. Edge e Opera entram quando aprovarem."
8. **⚠️ rotas estáticas:** o "Por quê" fica só com o `lib/og-pilulabs-image.tsx` (que lê o ícone de `public/`); o comando `node -e` passa a ser o do Step 3 (só `/pilulabs`), e "As nove linhas" vira "As três linhas".
9. **"Ícones e capturas":** o primeiro item vira "`public/pilulabs/botai/icone-128.png` (o logo do card) é gerado por `make capturas-botai`, no `apps/botai`, e versionado. Não edite à mão; as capturas do Botaí moram no `apps/botai-site/public/capturas/`."; apague os itens "a página as descobre no build…", "o `alt` sai do nome do arquivo…" e o parágrafo "PNG novo na `main`…". (O texto já descreve o fim da Tarefa 10, que apaga as cópias antigas daqui.)
10. **⚠️ SEO:** "cada uma das 3 rotas tem `opengraph-image.tsx` e `twitter-image.tsx` (…). Isso vale inclusive para a política, que é filha da página do produto." vira "a vitrine tem `opengraph-image.tsx` e `twitter-image.tsx` (o módulo é `lib/og-pilulabs-image.tsx`); uma página nova com `openGraph` próprio precisa dos dela."
11. **"JSON-LD":** ficam só "`CollectionPage` em `/pilulabs`, com o `linkDoItem` de cada listado em `hasPart`", "as URLs passam por `urlPublica`" e o item do `serializarJsonLd`.
12. **"Componentes":** tire `BotoesLoja`, `CapturasGaleria` e `AtalhosTabela` da lista.
13. **"Testes" › E2E:** "a 320 px, nenhuma das 3 rotas rola na horizontal: …" vira "a 320 px, a vitrine não rola na horizontal"; acrescente "os 308 dos caminhos antigos do Botaí, com a query (`pilulabs.e2e.ts`)"; no item da chave ligada, "confere links, `canonical` e `og:site_name` nos hosts PiluTech, e o 308 com a query" vira "confere a vitrine e a home nos hosts PiluTech"; e "sai como `5 skipped`" vira "sai como `2 skipped`".
14. **"Fora":** "página própria do Sombraí no `apps/web`, porque ele tem landing própria" vira "página do Botaí e do Sombraí no `apps/web`: os dois têm landing própria".

Confira a contagem real de skipped no E2E do Step 3 e ajuste o número do item 13 se diferir.

- [ ] **Step 5: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add -A apps/web && /usr/bin/git status --short apps/web && /usr/bin/git commit -m "feat(web): o Botaí sai do apps/web, com 308 para botai.pilutech.com.br e o card apontando para a landing"; echo "exit=$?"
```

---

### Tarefa 10: `apps/botai` alimenta a landing (capturas, ícones, atalho do manifesto e docs)

O `make capturas-botai` passa a copiar, além do ícone do card do `apps/web`, o ícone, os ícones do app e as 6 capturas para o `apps/botai-site`; o `loja/imagens.test.ts` confere as cópias. Só depois disso as capturas antigas do `apps/web` saem (a Tarefa 9 as deixou porque o teste ainda as conferia). O `wxt.config.ts` tenta importar `TECLAS_DO_MANIFESTO` do pacote (spec §3: "Se o `wxt.config.ts` do Botaí puder importar `ATALHOS` sem quebrar a reprodução do zip de fontes da AMO, ele importa. Senão, segue o espelho documentado de hoje.").

**Files:**

- Modify (`apps/botai/`): `loja/pecas.ts`, `loja/pecas.test.ts`, `loja/imagens.test.ts`, `loja/capturas.captura.ts`, `wxt.config.ts`, `loja/README.md`, `README.md`, `CLAUDE.md`
- Modify: `CLAUDE.md` (raiz: seção "Imagens do Botaí no `apps/web`" e a linha do `make capturas-botai` na tabela Commands), `Makefile` (comentário do alvo `capturas-botai`)
- Delete: `apps/web/public/pilulabs/botai/capturas/` (6 PNG)

**Interfaces:**

- Consumes: `TECLAS_DO_MANIFESTO` (Tarefa 1); os arquivos do `apps/botai-site` criados nas Tarefas 3 e 8.
- Produces: `loja/pecas.ts` troca `COPIAS_PARA_O_SITE` por `export const COPIAS: Copia[]`, com `export interface Copia { origem: string; destino: string }` e `destino` relativo a `apps/`.

- [ ] **Step 1: Testes das cópias (falham)**

`apps/botai/loja/pecas.test.ts`: troque `COPIAS_PARA_O_SITE` por `COPIAS` no import e o último `it` por:

```ts
// O apps/web só usa o ícone (o logo do card); a landing usa o ícone, os ícones do app e as capturas de 1280×800.
it('as cópias para os sites: o card do portfólio e a landing', () => {
  expect(COPIAS.slice(0, 4)).toEqual([
    {
      origem: 'icone-128.png',
      destino: 'web/public/pilulabs/botai/icone-128.png',
    },
    { origem: 'icone-128.png', destino: 'botai-site/public/icone-128.png' },
    { origem: 'edge-logo-300.png', destino: 'botai-site/app/icon.png' },
    { origem: 'edge-logo-300.png', destino: 'botai-site/app/apple-icon.png' },
  ])
  expect(COPIAS.slice(4)).toEqual(
    CAPTURAS.map((captura) => ({
      origem: `capturas/1280x800/${captura.nome}.png`,
      destino: `botai-site/public/capturas/${captura.nome}.png`,
    })),
  )
})
```

`apps/botai/loja/imagens.test.ts`: troque a constante `SITE` e o último `describe` por:

```ts
const APPS = path.resolve(import.meta.dirname, '../..')
```

```ts
describe('cópias para os sites (apps/web e apps/botai-site)', () => {
  it.each(COPIAS.map((c) => [c.destino, c] as const))(
    'apps/%s é idêntica à da loja',
    (_, { origem, destino }) => {
      expect(
        readFileSync(path.join(APPS, destino)).equals(
          readFileSync(path.join(LOJA, origem)),
        ),
      ).toBe(true)
    },
  )
})
```

(no import de `./pecas`, `COPIAS_PARA_O_SITE` vira `COPIAS`).

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run loja/pecas.test.ts loja/imagens.test.ts; echo "exit=$?"`
Expected: FAIL (`COPIAS` não é exportado), `exit=1`.

- [ ] **Step 2: As cópias**

`apps/botai/loja/pecas.ts`: troque `export const COPIAS_PARA_O_SITE … ]` por:

```ts
export interface Copia {
  origem: string
  destino: string
}

// destino relativo a apps/: o card do portfólio (apps/web) e a landing (apps/botai-site).
export const COPIAS: Copia[] = [
  { origem: ICONE.arquivo, destino: 'web/public/pilulabs/botai/icone-128.png' },
  { origem: ICONE.arquivo, destino: 'botai-site/public/icone-128.png' },
  { origem: LOGO_DO_EDGE.arquivo, destino: 'botai-site/app/icon.png' },
  { origem: LOGO_DO_EDGE.arquivo, destino: 'botai-site/app/apple-icon.png' },
  ...CAPTURAS.map((captura) => ({
    origem: arquivoDaCaptura(captura, TAMANHOS_DAS_CAPTURAS[0]),
    destino: `botai-site/public/capturas/${captura.nome}.png`,
  })),
]
```

`apps/botai/loja/capturas.captura.ts`:

- no import de `./pecas`, `COPIAS_PARA_O_SITE` vira `COPIAS`;
- troque a constante `SITE` por `const APPS = path.resolve(import.meta.dirname, '../..')`;
- troque o último teste por:

```ts
test('cópias para os sites (apps/web e apps/botai-site)', () => {
  for (const { origem, destino } of COPIAS) {
    mkdirSync(path.dirname(path.join(APPS, destino)), { recursive: true })
    copyFileSync(path.join(LOJA, origem), path.join(APPS, destino))
  }
})
```

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run loja/; echo "vitest exit=$?"
./node_modules/.bin/tsc --noEmit -p . ; echo "tsc exit=$?"
```

Expected: `exit=0` nos dois (as cópias das Tarefas 3 e 8 vieram dos mesmos arquivos, então são idênticas). Não rode o `make capturas-botai` agora: nenhuma cena mudou.

- [ ] **Step 3: As capturas antigas saem do `apps/web`**

Agora nenhum teste confere `apps/web/public/pilulabs/botai/capturas/`, e nenhum código do `apps/web` as lê desde a Tarefa 9:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git rm -rq apps/web/public/pilulabs/botai/capturas; echo "rm exit=$?"
/bin/ls apps/web/public/pilulabs/botai; echo "ls exit=$?"
(cd apps/botai && ./node_modules/.bin/vitest run loja/); echo "botai vitest exit=$?"
(cd apps/web && ./node_modules/.bin/jest lib/pilulabs); echo "web jest exit=$?"
```

Expected: o `ls` mostra só `icone-128.png`; os quatro `exit=0`.

- [ ] **Step 4: O `wxt.config.ts` importa as teclas do pacote (com prova de que nada muda)**

Guarde os manifestos de hoje:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && pnpm run build && pnpm run build:firefox && pnpm run build:opera; echo "build exit=$?"
mkdir -p "$SCRATCH/manifestos-antes" && for b in chrome firefox opera; do cp ".output/$b-mv3/manifest.json" "$SCRATCH/manifestos-antes/$b.json"; done; echo "exit=$?"
```

Em `apps/botai/wxt.config.ts`:

- acrescente `import { TECLAS_DO_MANIFESTO } from '@piluvitu/tools/pilulabs'` depois do import de `wxt`;
- apague as constantes `ATALHO_CHROMIUM` e `ATALHO_FIREFOX` e os dois comentários delas (os comentários foram para `packages/tools/src/pilulabs.ts` na Tarefa 1);
- em `commands.'botai-preencher'`, troque `suggested_key: firefox ? ATALHO_FIREFOX : ATALHO_CHROMIUM,` por `suggested_key: firefox ? TECLAS_DO_MANIFESTO.firefox : TECLAS_DO_MANIFESTO.chromium,`.

Builde de novo e compare:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && pnpm run build && pnpm run build:firefox && pnpm run build:opera; echo "build exit=$?"
for b in chrome firefox opera; do node -e 'const [a, d] = process.argv.slice(1).map((f) => JSON.parse(require("fs").readFileSync(f, "utf8"))); require("assert").deepStrictEqual(d, a); console.log("igual")' "$SCRATCH/manifestos-antes/$b.json" ".output/$b-mv3/manifest.json"; echo "$b exit=$?"; done
pnpm run lint; echo "lint exit=$?"
pnpm run test; echo "test exit=$?"
```

Expected: builds `exit=0`; `igual` e `exit=0` nos três manifestos; lint e test `exit=0`.

Agora a reprodução do zip de fontes da AMO, no ambiente do revisor (o Docker está disponível nesta máquina):

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && make zip-botai; echo "zip exit=$?"
V=$(node -p "require('./apps/botai/package.json').version") && docker run --rm -v "$PWD:/repo:ro" node:24.14.0 bash /repo/apps/botai/scripts/reproduzir-fontes.sh "/repo/apps/botai/.output/botai-$V-sources.zip" "/repo/apps/botai/.output/botai-$V-firefox.zip"; echo "reproducao exit=$?"
```

Expected: `IDENTICO: botai-<versão>-firefox.zip` e `reproducao exit=0`.

**Se** o `wxt build` não carregar o config (erro ao resolver `@piluvitu/tools/pilulabs`) **ou** a reprodução falhar: desfaça só o `wxt.config.ts` (`/usr/bin/git checkout apps/botai/wxt.config.ts`), troque os dois comentários das constantes por um só, de uma linha, acima de `ATALHO_CHROMIUM`: `// Espelha TECLAS_DO_MANIFESTO de @piluvitu/tools/pilulabs (o config não carrega o pacote: <o erro medido>); mude os dois juntos.`, e registre o erro medido no item "Atalho por sistema" do `apps/botai/CLAUDE.md` (Step 5).

- [ ] **Step 5: Docs do Botaí e da raiz**

`apps/botai/CLAUDE.md`:

- "Stack e configuração" › item "Atalho por sistema": troque o início "**Atalho por sistema (`suggested_key: { default: 'Ctrl+Shift+Y', mac: 'Alt+Shift+P' }`)**:" por "**Atalho por sistema (`suggested_key`, que o `wxt.config.ts` importa de `TECLAS_DO_MANIFESTO`, em `@piluvitu/tools/pilulabs`; a tabela de atalhos dos sites sai do mesmo lugar)**:" (no caminho do espelho: "…que o `wxt.config.ts` espelha de `TECLAS_DO_MANIFESTO` …, porque <erro medido>").
- "Multinavegador no `wxt.config.ts`": "(a página do Botaí no subdomínio PiluTech; ver "PiluLabs" no `apps/web/CLAUDE.md`)" vira "(a landing do `apps/botai-site`)".
- "Imagens das lojas": o item "Grava em `loja/imagens/` e copia…" vira: "Grava em `loja/imagens/` e copia, pela lista `COPIAS` de `loja/pecas.ts` (destino relativo a `apps/`): o ícone 128 para `apps/web/public/pilulabs/botai/` (o logo do card da PiluLabs) e para `apps/botai-site/public/`, o `edge-logo-300.png` para `apps/botai-site/app/icon.png` e `apple-icon.png`, e as 6 capturas de 1280×800 para `apps/botai-site/public/capturas/<NN>-<cena>-<tema>.png`. `loja/imagens.test.ts` confere os tamanhos e que toda cópia é idêntica à da loja."
- Tabela "Comandos", linha `make capturas-botai`: "imagens das lojas em `loja/imagens/` e cópias para o `apps/web` e o `apps/botai-site` (rode no Mac)".

`apps/botai/README.md`, "Publicação (para quem mantém)":

- passo 1: "**Domínios na Vercel:** `pilutech.com.br` e `www.pilutech.com.br` (redirecionando para o apex) no projeto do `apps/web`; `botai.pilutech.com.br` no projeto `botai-site` (Root Directory `apps/botai-site`; ver "Deploy" em `apps/botai-site/CLAUDE.md`). Antes, confira `NEXT_PUBLIC_SITE_URL=https://piluvitu.com.br` em Production (passo 0 da seção PiluLabs do `apps/web/CLAUDE.md`)."
- passo 2: "…(`A @`, `CNAME www`, e o `CNAME botai` com o valor do projeto `botai-site`)…"; e a frase "Com `curl -sI https://botai.pilutech.com.br` e `curl -sI https://botai.pilutech.com.br/privacidade` respondendo 200, ligue `PILUTECH_SUBDOMINIOS=1`…" vira "Com `curl -sI https://pilutech.com.br` respondendo 200 (a vitrine, servida pelo `apps/web`), ligue `PILUTECH_SUBDOMINIOS=1`…" (o `botai` agora é do projeto `botai-site`, conferido no "Deploy" do `apps/botai-site/CLAUDE.md`). O resto do passo fica;
- passo 9, item do `/admin/pilulabs`: acrescente "; a landing relê o YAML no build e troca o "Em breve" pelos botões das lojas".

`apps/botai/loja/README.md`, linha 7: "`imagens/`: gerado por `make capturas-botai`; não edite à mão. O ícone vai também para `apps/web/public/pilulabs/botai/` (o card) e, com o ícone de 300 px e as capturas de 1280×800, para `apps/botai-site/` (a landing)."

`Makefile`: o comentário acima de `capturas-botai`, "# Imagens das lojas em apps/botai/loja/imagens/ e cópias em apps/web/public/pilulabs/botai/.", vira "# Imagens das lojas em apps/botai/loja/imagens/ e cópias para o apps/web (ícone do card) e o apps/botai-site (landing).".

`CLAUDE.md` (raiz), tabela "Commands", linha do `make capturas-botai`: "Imagens das lojas do Botaí + cópias em `apps/web/public/pilulabs/botai/` (rode no Mac)" vira "Imagens das lojas do Botaí + cópias para o `apps/web` e o `apps/botai-site` (rode no Mac)".

`CLAUDE.md` (raiz): a seção "### Imagens do Botaí no `apps/web`" vira:

```markdown
### Imagens do Botaí nos sites

`apps/web/public/pilulabs/botai/icone-128.png` (o logo do card da PiluLabs) e, no `apps/botai-site`, `public/icone-128.png`, `app/icon.png`, `app/apple-icon.png` e `public/capturas/<NN>-<cena>-<tema>.png` são gerados por `make capturas-botai`, no `apps/botai` (o mesmo gerador das imagens das lojas, `apps/botai/loja/`, lista `COPIAS` de `loja/pecas.ts`), e versionados. Os sites só os leem. Não edite esses PNG à mão; o `apps/botai/loja/imagens.test.ts` falha se alguma cópia divergir da da loja.
```

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai CLAUDE.md Makefile && /usr/bin/git status --short && /usr/bin/git commit -m "feat(botai): capturas e ícones copiados para a landing, e o atalho do manifesto vindo de @piluvitu/tools/pilulabs"; echo "exit=$?"
```

(O `git rm` do Step 3 já está no índice: o `status` mostra os 6 `D` das capturas do `apps/web`. Na mensagem, se ficou o espelho, troque o fim por "e o atalho do manifesto espelhado de @piluvitu/tools/pilulabs".)

---

### Tarefa 11: Documentação e verificação final

**Files:**

- Modify: `apps/botai-site/CLAUDE.md` (versão completa), `CLAUDE.md` (raiz), `packages/ui/CLAUDE.md`

**Interfaces:**

- Consumes: tudo das Tarefas 1–10.
- Produces: documentação; nenhuma API nova.

- [ ] **Step 1: `apps/botai-site/CLAUDE.md` completo**

Substitua o arquivo por (sem escrever o nome da classe sentinela; cite `SENTINEL_SELECTOR`):

````markdown
# CLAUDE.md — `apps/botai-site` (`@pilutech/botai-site`)

Landing do Botaí em `https://botai.pilutech.com.br`: `/` e `/privacidade`. Next 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4 e `@piluvitu/ui`. O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz.

- **Spec:** `docs/superpowers/specs/2026-10-02-botai-landing-design.md`. **Plano:** `docs/superpowers/plans/2026-10-02-botai-landing.md`. **Design (fonte visual):** `docs/superpowers/design/2026-10-02-botai-landing/` (`Botai Landing.dc.html`, `desktop-escuro.png`, `mobile-escuro.png`).
- **Grafia:** "Botaí" em todo texto visível; `botai` no técnico (ver "Identidade" em `apps/botai/CLAUDE.md`).

## Estrutura

```
app/                  layout (fontes, tema, metadataBase), page (/), privacidade/, imagens OG e Twitter por rota,
                      icon.png, apple-icon.png, sitemap.ts, robots.ts, manifest.ts e os E2E
components/           landing e as peças (topo, rodapé, botões de loja, selo, atalho, tabela, abas, imagem por tema)
lib/                  conteúdo, leitura do CMS, modelo da página, visitante, capturas, site, seo, json-ld, imagem OG
public/               icone-128.png e capturas/ (gerados por make capturas-botai)
scripts/              conferir-rotas-estaticas.mjs (roda no build)
```

## A página

- **Lojas e fase saem do CMS do `apps/web`:** `lib/cms.ts` lê `apps/web/content/pilulabs/botai/index.yaml` no build (o dono edita em `/admin/pilulabs`), só as 4 URLs, pelo `yaml`. Arquivo ausente quebra o build de propósito: em silêncio, a landing sairia "Em breve" com a loja já publicada.
- **Regras compartilhadas:** `@piluvitu/tools/pilulabs` (`lojasPublicadas`, `fase`, `ATALHOS`); o card da PiluLabs no `apps/web` decide igual.
- **Botões de loja:** loja publicada → link em aba nova; sem URL → `<button disabled>` "Em breve", sem link. URL de outro host ou sem `https:` conta como sem URL. O botão quebra o texto (`whitespace-normal`, `max-w-full`) em vez de vazar da lista: a 320 px, "Microsoft Edge Add-ons Em breve" numa linha passa da largura, e o `scrollWidth` da página não acusa porque o vazamento fica no gutter.
- **Nota das lojas:** cita só as publicadas; antes de todas, "Chegando às lojas…". Nenhum texto diz "disponível" antes das lojas.
- **Tema:** `next-themes` (`attribute="class"`, `defaultTheme="system"`), o botão lembra a escolha no `localStorage`; o script do `next-themes` põe `.dark` antes da hidratação, e ícones e capturas trocam por CSS (`dark:`), sem piscar.
- **Capturas por tema:** `ImagemPorTema` põe as duas variantes, lazy, e esconde uma pela classe `.dark`; imagem lazy com `display: none` não é baixada. A do topo (LCP) leva `fetchPriority="high"`, nunca `loading="eager"`/`preload`, que baixariam as duas (ver "Theme detection" na doc do `next/image`).
- **Atalho de quem visita:** `useSyncExternalStore` com o atalho do Windows no servidor; depois da hidratação, `⌥⇧P` no Mac, `Alt+Shift+P` no Firefox para Linux e `Ctrl+Shift+Y` no resto (Android e ChromeOS inclusos).
- **Abas das capturas:** tabs WAI-ARIA com ativação automática, setas (dando a volta), Home e End, foco itinerante; o painel é focável. Os 3 painéis saem no HTML e os inativos levam `hidden`: o Google não interage com a página (Search Central, "Fix lazy-loaded content"), e o texto das cenas 02 e 03 só é indexado se estiver no DOM. As imagens dos painéis escondidos são lazy com `display: none` e não são baixadas.
- **Tabela de atalhos:** a 320 px ela rola dentro da moldura, que é uma região focável (`role="region"`, `tabIndex={0}`, nome da legenda): sem isso, quem usa teclado não rola, e o axe acusa `scrollable-region-focusable`.
- **Um `h1` só:** a proposta, com "Botaí: " só para leitor de tela; o nome grande do design é um `<p>` na linha do selo.
- ⚠️ **CSS do Font Awesome na camada `base`** (`@import … layer(base)` no `globals.css`) e `config.autoAddCss = false` (`lib/font-awesome.ts`, importado pelo `TemaProvider`): o CSS injetado em runtime fica fora de camada e vence as utilities, e o `hidden`/`size-*` dos ícones param de funcionar sem erro nenhum. O E2E do tema pega.

## `/privacidade`

A política do Botaí, fonte única do texto (o texto da AMO se copia daqui). A data da última atualização é texto pronto (formatar em BRT daria o dia anterior). O link de histórico aponta para `app/privacidade/page.tsx`; as versões de antes de 2026-10-02 estão no histórico de `apps/web/app/(site)/pilulabs/botai/privacidade/page.tsx`.

## SEO

- **URLs:** `metadataBase` = `urlDoSite()`: `https://botai.pilutech.com.br`, ou `SITE_URL` (só a origem; valor sem esquema é ignorado). Preview e local sem `SITE_URL` apontam canonical, `og:url`, JSON-LD, sitemap e robots para a produção, e o preview da Vercel já responde com `X-Robots-Tag: noindex`.
- **Textos (`lib/seo.ts`):** título da home com até 60 caracteres e descrição de 140–160, com os termos buscados; a política com os dela. O Google não tem limite e trunca pela largura do dispositivo (Search Central, "title link" e "snippet"); os limites são da spec e ficam no teste.
- **Open Graph e Twitter:** `metadataDaPagina` repete `type`, `locale`, `siteName`, `url`, `title` e `description` (o Next substitui o `openGraph` inteiro) e não declara imagem: cada rota tem `opengraph-image.tsx` e `twitter-image.tsx` estáticos (1200×630, `lib/imagem-og.tsx`, lendo `app/icon.png`).
- **JSON-LD (`lib/json-ld.ts`):** em `/`, `Organization` (PiluTech), `WebSite` e `SoftwareApplication` (`BrowserApplication`, preço 0 em BRL, `installUrl` só das lojas publicadas, capturas, PiluTech como `publisher` e `author`); em `/privacidade`, `BreadcrumbList`. `serializarJsonLd` troca `<` por `\u003c`.
  - Sem `aggregateRating`/`review` (o Google proíbe copiar a nota das lojas), sem `FAQPage` e sem `HowTo`.
  - ⚠️ O rich result de app exige nota ou review (Search Central, "Software app", 2026-09-08): o markup ajuda o Google a entender a página, mas não gera estrela nem preço no resultado. Não prometa isso.
  - A `Organization` sai **sem `logo`**: não há logo da PiluTech no repo, e o ícone do Botaí não é o logo da empresa. Entra quando houver o arquivo (≥ 112×112).
- **Sitemap e robots:** `/` e `/privacidade`; robots libera tudo e aponta o sitemap.
- **Ícones:** `app/icon.png` e `app/apple-icon.png` (300×300, cópias do `edge-logo-300.png` das lojas; o Google aceita PNG, não SVG), `app/manifest.ts` e `theme-color` claro e escuro (o `--background` dos dois temas do `@piluvitu/ui`, conferido no teste).
- **Search Console:** `GOOGLE_SITE_VERIFICATION` vira `metadata.verification.google`. Cadastrar o domínio é passo do dono.
- **Lighthouse:** não há ferramenta no repo nem no PATH; as checagens estão no `app/seo.e2e.ts` (título, descrição, canonical, OG com a imagem 1200×630, JSON-LD, `h1` único, níveis de título, `alt`, robots, sitemap, ícones, manifest e `axe-core` WCAG 2.1 A/AA nos dois temas) e a 320 px nos E2E das rotas.

## Build

- `pnpm build` = `next build` + o gate do `@source` (`scripts/check-tailwind-source.mjs .next`; a classe que ele procura está em `SENTINEL_SELECTOR`, no topo do script) + `scripts/conferir-rotas-estaticas.mjs`, que falha se uma rota de `ROTAS` sumir do `prerender-manifest.json` ou ganhar `revalidate`. Rota nova entra em `ROTAS`.
- `@source not '../*.md'`: a documentação do app não muda o CSS. O `storybook-static/` está no `.gitignore` da raiz pelo mesmo motivo (sem ele, o Tailwind varreria CSS já compilado e o gate aprovaria `@source` quebrado).

## Testes

| Camada                                  | Ferramenta                                   | Onde                                          |
| --------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| Lógica (CMS, modelo, visitante, SEO…)   | Jest + ts-jest (jsdom)                       | `*.test.ts` ao lado; `make test-botai-site`   |
| Componentes                             | Jest + Testing Library + user-event          | `*.test.tsx` ao lado                          |
| Estados visuais                         | Storybook `@storybook/nextjs`, porta 6019    | `*.stories.tsx` ao lado (tema na barra)       |
| Script do build                         | `node --test`                                | `scripts/*.test.mjs`                          |
| Rotas, SEO, teclado, tema, rede, 320 px | Playwright no build de produção (porta 3020) | `app/**/*.e2e.ts`; `make test-e2e-botai-site` |

- O E2E builda e sobe `next start`; rode com `CI=1` e a 3020 livre. Ele não roda no CI (como o do `apps/web`).
- **Duas passadas no `test:e2e`:** primeiro o `playwright.lojas.config.ts`, que builda com `BOTAI_CMS_ITEM=app/lojas-publicadas.yaml` (Firefox publicado, Chrome com link de outra loja, Edge em `http:`) e roda `app/lojas-publicadas.e2e.ts`; depois o `playwright.config.ts`, que builda com o CMS real e roda o resto. O CMS real tem hoje as 4 lojas vazias, e só a primeira passada exercita o caminho "loja com URL" no build de produção. A ordem deixa o `.next` com o CMS real; um `distDir` à parte faria o `next build` mexer no `include` do `tsconfig.json`.
- O axe roda a 1280 e a 320 px, nos dois temas, nas duas rotas: a meta da spec é o Lighthouse mobile.
- ⚠️ O `next dev` (e o servidor do E2E, que roda `next build`/`next start`) pode anexar a este arquivo um bloco de regras para agentes ou criar um `AGENTS.md`: confira `git status` antes de commitar.

## Deploy (Vercel, projeto próprio)

1. Projeto `botai-site` ligado ao repo, **Root Directory `apps/botai-site`**, framework Next.js, install e build padrão (`pnpm install` na raiz, `pnpm build`), Node 22.x. "Include files outside the root directory in the Build Step" ligado (o build lê `packages/*` e o YAML do `apps/web`).
2. ⚠️ **"Skip deployments" (Root Directory) desligado:** a Vercel pula projeto de monorepo cujo código e dependências não mudaram, e o YAML do CMS mora no `apps/web`, que não é dependência deste pacote: publicar uma loja pelo `/admin/pilulabs` não rebuildaria a landing. Quem filtra é o `ignoreCommand` do `vercel.json` (roda na Root Directory; `exit 0` cancela), que vigia o app, `packages/ui`, `packages/tools`, a entrada do Botaí no CMS e os arquivos de install e build.
3. Domínio `botai.pilutech.com.br`: um domínio só fica num projeto, então, se ele estiver no projeto do `apps/web` (o README antigo do Botaí mandava pôr lá), tire-o de lá primeiro (`vercel domains inspect botai.pilutech.com.br` diz onde está). Depois, adicione-o ao `botai-site`; na Cloudflare, o `CNAME botai` com o valor que a Vercel mostrar, em **DNS only** (passo do dono).
4. Env: nenhuma obrigatória. `GOOGLE_SITE_VERIFICATION` em Production quando o dono cadastrar o domínio no Search Console. Não ponha `SITE_URL` nem `BOTAI_CMS_ITEM` em ambiente nenhum.
5. **Primeira produção, antes do merge:** a produção do projeto sai da `main`, e a `main` só tem o `apps/botai-site` depois do merge; sem isto, o domínio fica sem deploy de produção para servir. Depois do push do branch, ache o preview dele (`vercel ls botai-site`). Se ele saiu `CANCELED` (o `ignoreCommand` compara `HEAD^` com `HEAD`, e o último commit do branch pode não tocar nada vigiado) ou não existe, gere um com `vercel deploy` na raiz do checkout do branch. Promova: `vercel promote <url-do-preview> --yes` (a Vercel rebuilda o preview com o ambiente de produção; ver "Promote a deployment from preview to production" na doc dela).
6. Confira: `curl -sI https://<preview>.vercel.app | grep -i x-robots-tag` mostra `noindex`; `curl -sI https://botai.pilutech.com.br` e `curl -sI https://botai.pilutech.com.br/privacidade` respondem 200, sem `x-robots-tag: noindex`; o `<link rel="canonical">` de `https://botai.pilutech.com.br` aponta para ele mesmo; `https://botai.pilutech.com.br/sitemap.xml` lista as duas rotas.
7. **Merge, só com os dois hosts no ar:** `botai.pilutech.com.br` (passo 6), porque os 308 do `apps/web` apontam para ele, e `https://pilutech.com.br` respondendo 200 (domínio no projeto do `apps/web`, "Passos do dono" na seção PiluLabs do `apps/web/CLAUDE.md`), porque o "← PiluLabs" do topo, o "Powered by PiluTech" do rodapé e a `Organization` do JSON-LD apontam para ele (`URL_DA_PILUTECH`, em `lib/conteudo.ts`). Em 2026-10-02 o `pilutech.com.br` não tinha registro A, e o `CNAME botai` era provisório.

## Comandos

| Comando                                        | O quê                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `make dev-botai-site`                          | `next dev` em http://localhost:3020                                                                      |
| `make build-botai-site`                        | `next build` + gate do `@source` + conferência das rotas estáticas                                       |
| `make test-botai-site`                         | Jest + `node --test`                                                                                     |
| `make test-e2e-botai-site`                     | 2 builds de produção (YAML de teste, depois o CMS real) + `next start` na 3020 + Playwright (com `CI=1`) |
| `make storybook-botai-site`                    | Storybook em http://localhost:6019                                                                       |
| `pnpm --filter @pilutech/botai-site typecheck` | `tsc --noEmit`                                                                                           |
| `pnpm --filter @pilutech/botai-site lint`      | ESLint                                                                                                   |
````

- [ ] **Step 2: `CLAUDE.md` da raiz e do `packages/ui`**

`CLAUDE.md` (raiz):

1. Tabela de workspaces: acrescente, depois da linha do `apps/botai`:
   `| \`apps/botai-site\` | \`apps/botai-site/CLAUDE.md\` | Landing do Botaí em \`botai.pilutech.com.br\` (Next 16 + Tailwind 4 + \`@piluvitu/ui\`): \`/\` e \`/privacidade\`, lojas e fase lidas do CMS do \`apps/web\` no build, tema do sistema com alternância, SEO (metadata, OG, JSON-LD, sitemap, robots, manifest), Jest + Storybook (6019) + Playwright (3020), projeto Vercel próprio |`
2. "Tech Stack (visão geral)": "com oito frentes" vira "com nove frentes", e acrescente depois do bullet do `apps/botai`:
   "- **`apps/botai-site`** — **Next.js 16** (App Router), **React 19**, **Tailwind CSS 4** e `@piluvitu/ui`: a landing do Botaí em `botai.pilutech.com.br`, todas as rotas estáticas, lojas e fase lidas do YAML do CMS do `apps/web` no build, regras de `@piluvitu/tools/pilulabs`. Projeto Vercel próprio (Root Directory `apps/botai-site`). → detalhes em `apps/botai-site/CLAUDE.md`."
   e, no bullet do `packages/tools`, "consumida pelo web e pela extensão" vira "consumida pelo web, pela extensão e pela landing do Botaí".
3. Tabela "Commands": acrescente as linhas dos 5 alvos `make *-botai-site` (os textos da tabela do `apps/botai-site/CLAUDE.md`) e troque a linha do `make stop` por "Libera as portas 8081/8082/3333/6017/3018/6018/3020/6019 se travarem".
4. "Gate do design system" › "Amarrado em": acrescente "E em `apps/botai-site/package.json` → `build` (`next build && node ../../scripts/check-tailwind-source.mjs .next && node scripts/conferir-rotas-estaticas.mjs`)."
5. "Pre-commit hook": "Configs em quatro níveis" vira "Configs em cinco níveis", e acrescente o bullet "- **`apps/botai-site/package.json`** → a mesma config do `apps/web` (`*.{ts,tsx}: [eslint --fix, prettier --write]`), pelo mesmo motivo: o ESLint flat do app só resolve com cwd nele."
6. "CI / CD" › `ci.yml`: "Em paralelo, **cinco** jobs" vira "Em paralelo, **seis** jobs" e acrescente, antes de "O E2E da extensão…": "botai-site (`eslint` + `tsc --noEmit` + Jest + `node --test` + `next build` com o gate do `@source` e a conferência das rotas estáticas; o E2E roda local)".
7. "Vercel": acrescente, no fim da seção, "- **Landing do Botaí:** projeto à parte, Root Directory `apps/botai-site`, com o "Skip deployments" desligado e o `ignoreCommand` do `apps/botai-site/vercel.json` (ver "Deploy" em `apps/botai-site/CLAUDE.md`)."

`packages/ui/CLAUDE.md`, "Consumo pelos apps": acrescente o bullet "- **`apps/botai-site`** (landing do Botaí, 2026-10-02) — quarto consumidor, Next 16 como o `apps/web`: `app/globals.css` importa `@piluvitu/ui/styles.css` + `@source '../../../packages/ui/src'` (3 `../`) e `@source not '../*.md'`; usa `Button` e `cn`. Gate amarrado no `build` contra `.next`."

- [ ] **Step 3: Verificação final do monorepo**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev
pnpm install --frozen-lockfile; echo "install exit=$?"
pnpm dedupe --check; echo "dedupe exit=$?"
(cd apps/web && ./node_modules/.bin/jest components/admin/posts/mdx-editor.codemirror.test.ts); echo "codemirror exit=$?"
pnpm --filter @piluvitu/tools lint; echo "tools lint exit=$?"
(cd packages/tools && ./node_modules/.bin/jest); echo "tools jest exit=$?"
(cd apps/web && ./node_modules/.bin/eslint . && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/jest); echo "web exit=$?"
(cd apps/botai-site && ./node_modules/.bin/eslint . && ./node_modules/.bin/tsc --noEmit && pnpm run test && pnpm run build && ./node_modules/.bin/storybook build --quiet); echo "botai-site exit=$?"
(cd apps/botai && pnpm run lint && pnpm run test); echo "botai exit=$?"
(cd apps/botai-site && lsof -nP -iTCP:3020 -sTCP:LISTEN; CI=1 pnpm run test:e2e); echo "botai-site e2e exit=$?"
./node_modules/.bin/prettier --check "apps/botai-site" "packages/tools/src/pilulabs.ts" "packages/tools/src/pilulabs.test.ts" "docs/superpowers/plans/2026-10-02-botai-landing.md"; echo "prettier exit=$?"
/usr/bin/git status --short
```

Expected: todos `exit=0` (o `prettier --check` da raiz usa o `.prettierrc` da raiz; se reclamar, rode o mesmo comando com `--write` e confira o diff); `git status` mostra só os `CLAUDE.md` desta tarefa (nada de `.next/`, `storybook-static/`, `test-results/`, `AGENTS.md` novo ou bloco gerado pelo Next). Em seguida, confira a cobertura da spec abrindo-a ao lado: cada item de §2 a §8 tem uma tarefa e um teste (o §9 é pós-código e está no "Deploy" do `apps/botai-site/CLAUDE.md`).

- [ ] **Step 4: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add CLAUDE.md packages/ui/CLAUDE.md apps/botai-site/CLAUDE.md && /usr/bin/git commit -m "docs(botai-site): CLAUDE.md da landing, deploy na Vercel e o app novo na raiz"; echo "exit=$?"
```

---

## Passos depois do código (fora deste plano, spec §9)

- **Do agente, pela CLI da Vercel, depois do push** (passos 1 a 6 de "Deploy" em `apps/botai-site/CLAUDE.md`), nesta ordem:
  1. criar o projeto `botai-site` com Root Directory `apps/botai-site` e desligar o "Skip deployments";
  2. se `botai.pilutech.com.br` estiver no projeto do `apps/web`, tirá-lo de lá; depois, adicioná-lo ao `botai-site`;
  3. promover a produção o preview do `feat/botai-landing` (`vercel promote <url-do-preview> --yes`; sem preview pronto, `vercel deploy` na raiz do checkout do branch antes), porque a produção só sairia da `main`, que ainda não tem o app;
  4. conferir `https://botai.pilutech.com.br` e `/privacidade` (200, sem `noindex`), o canonical e o sitemap.
- **Do dono:** trocar, na Cloudflare, o `CNAME` provisório do `botai` pelo valor que a Vercel mostrar, em DNS only; pôr `pilutech.com.br` e `www` no projeto do `apps/web`, com os registros na Cloudflare ("Passos do dono" em `apps/web/CLAUDE.md`); cadastrar o domínio no Search Console e pôr `GOOGLE_SITE_VERIFICATION`.
- **Merge:** só com `https://botai.pilutech.com.br` respondendo pelo projeto novo **e** `https://pilutech.com.br` respondendo 200: o topo, o rodapé e o JSON-LD da landing apontam para lá. Se o dono quiser publicar antes de `pilutech.com.br` existir, o destino é uma constante só (`URL_DA_PILUTECH`, em `apps/botai-site/lib/conteudo.ts`), mas a troca é decisão dele: muda também a `Organization` do JSON-LD.
