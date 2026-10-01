# Botaí fase 2: página PiluLabs no site (`apps/web`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar em `piluvitu.com.br` a vitrine `/pilulabs`, a página `/pilulabs/botai` e a política `/pilulabs/botai/privacidade`. As três leem uma collection Keystatic `produtos`, em que o Botaí nasce `listado: false`: acessível por link, com `noindex`.

**Architecture:** É o modelo híbrido da spec (§6). O YAML (`content/produtos/<slug>/index.yaml`) guarda catálogo, visibilidade e URLs de loja, e cada produto tem uma rota TSX própria com o texto rico e a política. Tudo o que deriva dos dados é lógica pura em `lib/pilulabs.ts` e `lib/pilulabs-json-ld.ts`, testada no Jest: lojas publicadas, fase, `robots`, JSON-LD, card na home e link no rodapé. Os componentes de `components/pilulabs/` só recebem props. As três rotas são estáticas: as capturas são descobertas no build, em `public/pilulabs/<slug>/capturas/`.

**Tech Stack:** Next.js 16.3.8 (App Router, metadata API, `next/og`), React 19, TypeScript strict, Tailwind 4 + `@piluvitu/ui`, Keystatic 0.5 (só o reader), Font Awesome 7, `yaml` 2, Jest 30 (ts-jest, jsdom), Storybook 10 (`@storybook/nextjs`) e Playwright 1.59.

**Spec:** `docs/superpowers/specs/2026-10-01-botai-multinavegador-design.md` (§6 e §9.2) e o contrato `docs/superpowers/plans/2026-10-01-botai-multinavegador-interfaces.md`, cujos nomes são obrigatórios. Os fatos da política e a armadilha do OG estão em `/Users/piluvitu/WWW/PiluVitu-Dev/docs/superpowers/research/2026-10-01-botai-multinavegador/site-pilulabs.md`, §3.4 e §5. A pesquisa só existe no worktree principal.

## Global Constraints

- **Worktree e branch:** `/Users/piluvitu/WWW/PiluVitu-Dev-site`, branch `feat/pilulabs-site` (base `origin/main`, que já tem o #45: `apps/botai` existe aqui, na versão da `main`, sem as mudanças da fase 1). O `apps/web` não importa nada de `apps/botai`. Nunca `git push`.
- **O que muda:** só `apps/web/**`, uma linha da tabela do `CLAUDE.md` da raiz, este plano e o contrato (`docs/superpowers/plans/2026-10-01-botai-multinavegador-interfaces.md`, atualizado na revisão de consistência entre as fases e mantido byte a byte igual ao da worktree principal), que entram no commit da Task 9.
- **URLs fixas**, porque a extensão e as lojas apontam para elas: `https://piluvitu.com.br/pilulabs/botai` e `https://piluvitu.com.br/pilulabs/botai/privacidade`.
- **Nomes do contrato, sem renomear:**
  - em `apps/web/lib/pilulabs.ts`: `type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'`, `lojasPublicadas(produto)`, `fase(produto)` → `'em-breve' | 'disponivel'`, `listarCapturas(slug)` e `ATALHOS`;
  - rotas `/pilulabs`, `/pilulabs/botai` e `/pilulabs/botai/privacidade`;
  - ícone `/pilulabs/botai/icone-128.png`;
  - capturas `public/pilulabs/<slug>/capturas/<NN>-<nome>.png`.
- **Campos da collection `produtos`, exatos:** `produtoSlug`, `order`, `nome`, `tipo`, `listado`, `resumo`, `icone`, `tags`, `chromeUrl`, `firefoxUrl`, `edgeUrl`, `operaUrl`, `repoLink`. Sem `versao`.
- **Loja publicada:** só conta a URL `https:` no host exato da loja: `chromewebstore.google.com`, `addons.mozilla.org`, `microsoftedge.microsoft.com` ou `addons.opera.com`.
- **Atalhos:**
  - Chromium (Chrome, Edge e Opera): `Ctrl+Shift+Y` no Windows e no Linux, `⌥⇧P` no Mac;
  - Firefox: igual, mas `Alt+Shift+P` no Linux.
- **Estado inicial do Botaí:** entra com `listado: false` e sem capturas. Com `listado: false`, a página e a política levam `robots: { index: false }`.
- **Política:**
  - pt-BR;
  - responsável: PiluTech, com contato `pilutechinformatica@gmail.com`;
  - última atualização em `2026-10-01`;
  - sem razão social nem CNPJ, que o dono decide com o contador.
- **JSON-LD:**
  - `SoftwareApplication`, com `applicationCategory: 'BrowserApplication'` e `offers.price: 0`;
  - sem `aggregateRating` e sem `softwareVersion`;
  - mais um `BreadcrumbList`.
- **Botões de loja:** são do design system (`Button` do `@piluvitu/ui` com ícone Font Awesome) e aparecem só para lojas publicadas. Nunca os badges oficiais.
- **Grafia:**
  - "Botaí", com acento, em todo texto visível;
  - `botai` em slug, pasta e caminho;
  - o crédito é "Powered by PiluTech".
- **Comentários (lei do `CLAUDE.md` raiz):** em produção são raros, de 1 a 3 linhas, e só dizem o porquê que o código não mostra. Nos testes, comente à vontade.
- **Colocation:** teste e story ficam ao lado do fonte. O E2E (`.e2e.ts`) fica ao lado da rota.
- **Imports em `components/pilulabs/`:** componentes e stories só fazem `import type` de `@/lib/pilulabs`, porque o módulo importa `node:fs`. Dado de runtime, como `ATALHOS`, chega por prop.
- **Texto JSX:** sem `"` nem `'` crus, por causa da regra `react/no-unescaped-entities`. Use “ ” e ’.
- **Dependências e testes de componente:** nenhuma dependência nova. O Jest de componente usa `renderToStaticMarkup` (`react-dom/server`), e não a Testing Library.
- **Ambiente:** o repo não tem devcontainer, então os testes rodam no host.
- **Comandos:** o wrapper `rtk` falsifica a saída de `git`, `grep`, `diff`, `ls`, `pnpm`, `vitest` e `jest`.
  - Use sempre o binário direto: `/usr/bin/git`, `/usr/bin/grep`, `/bin/ls` e `node_modules/.bin/*`. Nunca `pnpm …`.
  - Confira o exit code com `; echo "exit=$?"`.
- **Ao fim de cada tarefa:**
  - `eslint` e `tsc --noEmit` limpos;
  - commit convencional em pt-BR, com `/usr/bin/git`.

## Review Focus

1. **URL de loja quase certa no YAML.** Exemplos: `http://`, `chromewebstore.google.com.evil.io`, `www.chromewebstore.google.com`, o host de outra loja, a URL sem esquema e `javascript:`.
   - **Esperado:** nenhum botão, nada no `installUrl` e a fase continua "em-breve".
   - **Testes:** Task 1 (`it.each` de `lojasPublicadas`) e Task 2 (`installUrl`).
2. **YAML com campo omitido.** O Keystatic apaga o campo opcional vazio. Casos: sem `listado`, `tags:` nulo, `order` nulo, `tipo` desconhecido e `listado: "true"` como string.
   - **Esperado:** produto não listado, com `noindex`, campos vazios e nenhuma exceção.
   - **Teste:** Task 1 (`normalizarProduto`).
3. **Pasta de capturas com lixo.** Casos: `.DS_Store`, `notas.txt`, `.PNG` maiúsculo, uma subpasta com nome terminado em `.png`, prefixos `2-` e `10-` misturados e a palavra `constructor` no nome.
   - **Esperado:** só arquivos PNG, em ordem natural, com `alt` legível e acentuado.
   - **Teste:** Task 2 (`listarCapturas` e `altDaCaptura`).
4. **Rota filha que declara `openGraph` sem arquivo de imagem próprio.** É o caso da política, filha da página do produto: ela perde a imagem, ou a página herda o `og:title` da home.
   - **Esperado:** cada rota tem `og:title` próprio, e o `og:image` e o `twitter:image` do próprio segmento respondem PNG.
   - **Testes:** E2E nas Tasks 5, 6 e 7.
5. **Rota PiluLabs que vira ISR ou dinâmica.** Alguém põe um `revalidate`, um `fetch` com cache de tempo ou um `cookies()`. Na Vercel, `public/` não vai para o lambda: as capturas somem da página, e o ícone some da imagem OG (que também o lê de `public/` com `readFile`), sem erro nenhum.
   - **Esperado:** as rotas e as suas `opengraph-image`/`twitter-image` continuam estáticas, sem `revalidate`.
   - **Teste:** gate depois do `next build`, lendo `.next/prerender-manifest.json`. Roda na Task 6 (duas rotas e as quatro imagens delas) e, com as três rotas e as seis imagens, na Task 9.

---

## Como rodar (vale para todas as tarefas)

- **Diretório:** todo comando começa com `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web &&`, porque o shell do agente não guarda o `cd`. Caminho com parênteses vai entre aspas, como em `"app/(site)/pilulabs/page.tsx"`.
- **Git:** sempre com `-C` e caminhos a partir da raiz do repo, como em `/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site add "apps/web/…"`.
- **Pre-commit:** o `lint-staged` roda `eslint --fix` e `prettier --write` nos arquivos staged. Se ele reformatar, o commit já sai com a versão formatada.

| O quê              | Comando (a partir de `apps/web`)                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jest de um arquivo | `node_modules/.bin/jest lib/pilulabs.test.ts; echo "exit=$?"`                                                                                                 |
| Jest inteiro       | `node_modules/.bin/jest; echo "exit=$?"`                                                                                                                      |
| ESLint             | `node_modules/.bin/eslint .; echo "exit=$?"`                                                                                                                  |
| Tipos              | `node_modules/.bin/tsc --noEmit; echo "exit=$?"`                                                                                                              |
| Build + gate       | `node_modules/.bin/next build; echo "exit=$?"`, depois `node ../../scripts/check-tailwind-source.mjs .next; echo "exit=$?"` (é o `build:ci`)                  |
| E2E                | `/usr/sbin/lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 node_modules/.bin/playwright test --retries=0 pilulabs/pilulabs.e2e.ts; echo "exit=$?"` |

⚠️ **O filtro do Playwright é uma regex, não um caminho.** Com `"app/(site)/…"`, os parênteses viram um grupo que casa `site` sem parênteses, e o Playwright sai com `No tests found` e `exit=1`. Isso parece o vermelho esperado e não é. Use sempre o filtro sem parênteses: `pilulabs/pilulabs.e2e.ts` ou `home.e2e.ts`. Pelo mesmo motivo, o `prettier --check` recebe a pasta `"app/(site)/pilulabs"`, e nunca um glob com `(site)`.

⚠️ **O Jest não checa tipos aqui.** O `ts-jest` só transpila: um export que falta vira `TypeError: … is not a function` em runtime, e não um erro do TypeScript. Quem checa tipos é o `tsc --noEmit` de cada tarefa.

⚠️ **Porta 3333 no E2E.** Fora do CI, o `playwright.config.ts` reaproveita o servidor que já estiver na 3333. O worktree principal usa a mesma porta: um `next dev` dele responderia no lugar, e o teste rodaria contra o código errado.

- O `lsof` tem de sair vazio. Se não sair, rode `make stop` na raiz deste worktree ou feche o servidor.
- O `CI=1` obriga o Playwright a subir o próprio `next dev` e a falhar se a porta estiver ocupada.
- Se faltar o Chromium do Playwright: `node_modules/.bin/playwright install chromium`.

⚠️ **Build e E2E não rodam juntos.** O `next build` e o `next dev` não podem rodar ao mesmo tempo no mesmo `apps/web`. O Playwright derruba o servidor dele ao terminar.

## Mapa de arquivos (todos em `apps/web/`)

| Arquivo                                                                     | Responsabilidade                                                                                                                                                                         | Task    |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `keystatic.config.ts`                                                       | Collection `produtos`                                                                                                                                                                    | 1       |
| `content/produtos/botai/index.yaml`                                         | O Botaí, `listado: false`                                                                                                                                                                | 1       |
| `public/pilulabs/botai/icone-128.png`                                       | Cópia do `apps/botai/public/icon/128.png`. A fase 3 troca pela versão com margem                                                                                                         | 1       |
| `lib/pilulabs.ts` (+ `.test.ts`)                                            | Tipos, `normalizarProduto`, `lojasPublicadas`, `fase`, `produtosListados`, `listarCapturas`, `altDaCaptura`, `ATALHOS`, `metadataDaPagina`/`metadataDoProduto` e `produtoParaProject` | 1, 2, 8 |
| `lib/pilulabs-conteudo.ts` (+ `.test.ts`)                                   | Lê o YAML direto, sem Keystatic, para o Jest e o Playwright. Trava do modelo híbrido                                                                                                    | 1       |
| `lib/site-content.ts`                                                       | `getProdutos()`                                                                                                                                                                          | 1       |
| `lib/render-estatico.ts`                                                    | Helper de teste: `renderToStaticMarkup` num `div`                                                                                                                                        | 2       |
| `lib/json-ld.ts` (+ `.test.ts`), `components/json-ld.tsx` (+ `.test.tsx`)   | Serializa e renderiza o `<script type="application/ld+json">`                                                                                                                            | 2       |
| `lib/pilulabs-json-ld.ts` (+ `.test.ts`)                                    | `SoftwareApplication`, `BreadcrumbList` e `CollectionPage`                                                                                                                               | 2       |
| `components/pilulabs/lojas-ui.ts`                                           | Rótulo e ícone Font Awesome de cada loja                                                                                                                                                 | 3       |
| `components/pilulabs/{status-produto,botoes-loja,produto-card,vitrine}.tsx` | Pílula de fase, botões de loja, card e vitrine, cada um com `.test.tsx` e `.stories.tsx`                                                                                                 | 3       |
| `components/pilulabs/{capturas-galeria,atalhos-tabela}.tsx`                 | Galeria de capturas e tabela de atalhos, cada uma com `.test.tsx` e `.stories.tsx`                                                                                                       | 4       |
| `lib/og-pilulabs-image.tsx`                                                 | `ImageResponse` 1200×630 compartilhado pelas 3 rotas                                                                                                                                     | 5       |
| `app/(site)/pilulabs/{layout,page,opengraph-image,twitter-image}.tsx`       | Vitrine                                                                                                                                                                                  | 5       |
| `app/(site)/pilulabs/pilulabs.e2e.ts`                                       | E2E das 3 rotas                                                                                                                                                                          | 5, 6, 7 |
| `app/(site)/pilulabs/botai/{page,opengraph-image,twitter-image}.tsx`        | Página do Botaí                                                                                                                                                                          | 6       |
| `app/(site)/pilulabs/botai/privacidade/{page,opengraph-image,twitter-image}.tsx` | Política de privacidade                                                                                                                                                             | 7       |
| `mocks/projects.ts`, `components/project-card.tsx` (+ test, story)          | `deployLabel` opcional e link interno na mesma aba                                                                                                                                       | 8       |
| `components/home-footer.tsx` (+ test, story)                                | Prop `mostrarPiluLabs`                                                                                                                                                                   | 8       |
| `app/(site)/page.tsx`, `app/(site)/home.e2e.ts`                             | Card em Projetos e link no rodapé, vindos de `produtos`                                                                                                                                  | 8       |
| `CLAUDE.md` (do `apps/web` e da raiz)                                       | Seção PiluLabs                                                                                                                                                                           | 9       |

---

### Task 1: Catálogo `produtos` (Keystatic, YAML, ícone, núcleo de `lib/pilulabs.ts`, `getProdutos` e trava)

**Files:**

- Modify: `apps/web/keystatic.config.ts` (nova collection entre `projects` e `feeds`)
- Create: `apps/web/content/produtos/botai/index.yaml`
- Create: `apps/web/public/pilulabs/botai/icone-128.png`
- Create: `apps/web/lib/pilulabs.ts`
- Create: `apps/web/lib/pilulabs.test.ts`
- Create: `apps/web/lib/pilulabs-conteudo.ts`
- Create: `apps/web/lib/pilulabs-conteudo.test.ts`
- Modify: `apps/web/lib/site-content.ts` (import e `getProdutos` no fim)

**Interfaces:**

- Consumes: nada de tarefas anteriores.
- Produces (`lib/pilulabs.ts`):
  - `type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'`
  - `type Fase = 'em-breve' | 'disponivel'`
  - `type TipoProduto = 'extensao' | 'web' | 'cli'`
  - `type Produto = { slug: string; order: number; nome: string; tipo: TipoProduto; listado: boolean; resumo: string; icone: string; tags: string[]; chromeUrl: string; firefoxUrl: string; edgeUrl: string; operaUrl: string; repoLink: string }`
  - `type EntradaProduto`: todos os campos do YAML, opcionais e anuláveis.
  - `type LojaPublicada = { loja: Loja; url: string }`
  - `const LOJAS: readonly Loja[]`, nesta ordem: chrome, firefox, edge, opera.
  - `normalizarProduto(slug: string, entrada: EntradaProduto): Produto`
  - `lojasPublicadas(produto: Pick<Produto, 'chromeUrl' | 'firefoxUrl' | 'edgeUrl' | 'operaUrl'>): LojaPublicada[]`
  - `fase(produto: Pick<Produto, 'chromeUrl' | 'firefoxUrl' | 'edgeUrl' | 'operaUrl'>): Fase`
  - `produtosListados(produtos: Produto[]): Produto[]`
- Produces (`lib/pilulabs-conteudo.ts`):
  - `lerProdutosDoConteudo(raizWeb: string): Produto[]`, ordenado por `order`;
  - `rotasObrigatorias(slug: string): string[]`;
  - `rotasFaltando(produtos: Pick<Produto, 'slug' | 'listado'>[], existe: (caminhoNaRaizWeb: string) => boolean): string[]`.
- Produces (`lib/site-content.ts`): `getProdutos(): Promise<Produto[]>`, ordenado por `order`.

- [ ] **Step 1: Copiar o ícone de 128 px do Botaí**

O PNG está neste mesmo worktree, porque o #45 já está na `main`:

```bash
/bin/mkdir -p /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web/public/pilulabs/botai && /bin/cp /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/botai/public/icon/128.png /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web/public/pilulabs/botai/icone-128.png; echo "exit=$?"
```

Se o `cp` falhar porque o arquivo não está no disco, tire-o do git:

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site show origin/main:apps/botai/public/icon/128.png > /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web/public/pilulabs/botai/icone-128.png; echo "exit=$?"
```

Conferir:

```bash
/usr/bin/file /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web/public/pilulabs/botai/icone-128.png; /usr/bin/shasum /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web/public/pilulabs/botai/icone-128.png
```

Esperado: `PNG image data, 128 x 128` e o sha1 `85144acbed07a55292526ba0bad0aa2c65495af7`.

- [ ] **Step 2: Escrever o teste da lógica pura do catálogo (falha)**

Crie `apps/web/lib/pilulabs.test.ts`:

```ts
import {
  fase,
  LOJAS,
  lojasPublicadas,
  normalizarProduto,
  produtosListados,
  type Produto,
} from './pilulabs'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }

const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'
const URL_FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'
const URL_EDGE = 'https://microsoftedge.microsoft.com/addons/detail/botai/xyz'
const URL_OPERA = 'https://addons.opera.com/pt-br/extensions/details/botai/'

function produto(parcial: Partial<Produto> = {}): Produto {
  return {
    slug: 'botai',
    order: 0,
    nome: 'Botaí',
    tipo: 'extensao',
    listado: false,
    resumo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    icone: '/pilulabs/botai/icone-128.png',
    tags: ['QA'],
    ...SEM_LOJA,
    repoLink: '',
    ...parcial,
  }
}

describe('normalizarProduto', () => {
  it('lê a entrada completa do YAML, aparando espaços', () => {
    expect(
      normalizarProduto('botai', {
        order: 2,
        nome: ' Botaí ',
        tipo: 'extensao',
        listado: true,
        resumo: 'r',
        icone: '/i.png',
        tags: ['A', ' B '],
        chromeUrl: ` ${URL_CHROME} `,
        firefoxUrl: '',
        edgeUrl: '',
        operaUrl: '',
        repoLink: 'https://github.com/x',
      }),
    ).toEqual({
      slug: 'botai',
      order: 2,
      nome: 'Botaí',
      tipo: 'extensao',
      listado: true,
      resumo: 'r',
      icone: '/i.png',
      tags: ['A', 'B'],
      chromeUrl: URL_CHROME,
      firefoxUrl: '',
      edgeUrl: '',
      operaUrl: '',
      repoLink: 'https://github.com/x',
    })
  })

  // O Keystatic apaga do YAML o campo opcional vazio. Um produto sem `listado`
  // tem de cair em "não listado" (noindex), nunca em listado nem em exceção.
  it('campo omitido vira o vazio do tipo, e sem listado o produto não é listado', () => {
    expect(normalizarProduto('novo', {})).toEqual({
      slug: 'novo',
      order: 0,
      nome: 'novo',
      tipo: 'extensao',
      listado: false,
      resumo: '',
      icone: '',
      tags: [],
      ...SEM_LOJA,
      repoLink: '',
    })
  })

  it('order nulo vira 0, e tipo desconhecido vira extensao', () => {
    const p = normalizarProduto('x', { order: null, tipo: 'desktop' })
    expect(p.order).toBe(0)
    expect(p.tipo).toBe('extensao')
  })

  it('tags nulas (YAML com "tags:" vazio) viram lista vazia', () => {
    expect(normalizarProduto('x', { tags: null }).tags).toEqual([])
  })

  it('só o booleano true lista; a string "true" não', () => {
    expect(
      normalizarProduto('x', { listado: 'true' as unknown as boolean }).listado,
    ).toBe(false)
  })
})

describe('lojasPublicadas', () => {
  it('a ordem fixa das lojas é chrome, firefox, edge, opera', () => {
    expect(LOJAS).toEqual(['chrome', 'firefox', 'edge', 'opera'])
  })

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
    ['http em vez de https', 'http://chromewebstore.google.com/detail/botai/abc'],
    ['host com sufixo', 'https://chromewebstore.google.com.evil.io/detail/botai/abc'],
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
    expect(fase(produto())).toBe('em-breve')
  })

  it('disponivel com uma loja publicada', () => {
    expect(fase(produto({ edgeUrl: URL_EDGE }))).toBe('disponivel')
  })

  it('URL de host errado não conta como publicada', () => {
    expect(fase(produto({ chromeUrl: 'https://example.com/botai' }))).toBe(
      'em-breve',
    )
  })
})

describe('produtosListados', () => {
  it('fica só com os listados, na ordem recebida', () => {
    const a = produto({ slug: 'a', listado: true })
    const b = produto({ slug: 'b', listado: false })
    const c = produto({ slug: 'c', listado: true })
    expect(produtosListados([a, b, c]).map((p) => p.slug)).toEqual(['a', 'c'])
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/pilulabs.test.ts; echo "exit=$?"`
Expected: FAIL com `Cannot find module './pilulabs'`, `exit=1`.

- [ ] **Step 4: Implementar o núcleo de `lib/pilulabs.ts`**

Crie `apps/web/lib/pilulabs.ts`:

```ts
export type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'
export type Fase = 'em-breve' | 'disponivel'
export type TipoProduto = 'extensao' | 'web' | 'cli'

export type Produto = {
  slug: string
  order: number
  nome: string
  tipo: TipoProduto
  listado: boolean
  resumo: string
  icone: string
  tags: string[]
  chromeUrl: string
  firefoxUrl: string
  edgeUrl: string
  operaUrl: string
  repoLink: string
}

export type EntradaProduto = {
  order?: number | null
  nome?: string | null
  tipo?: string | null
  listado?: boolean | null
  resumo?: string | null
  icone?: string | null
  tags?: readonly string[] | null
  chromeUrl?: string | null
  firefoxUrl?: string | null
  edgeUrl?: string | null
  operaUrl?: string | null
  repoLink?: string | null
}

export type LojaPublicada = { loja: Loja; url: string }

export const LOJAS: readonly Loja[] = ['chrome', 'firefox', 'edge', 'opera']

const TIPOS: readonly TipoProduto[] = ['extensao', 'web', 'cli']

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
} as const satisfies Record<Loja, keyof Produto>

type UrlsDasLojas = Pick<Produto, (typeof CAMPO_DA_LOJA)[Loja]>

function texto(valor: string | null | undefined): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

export function normalizarProduto(
  slug: string,
  entrada: EntradaProduto,
): Produto {
  return {
    slug,
    order: typeof entrada.order === 'number' ? entrada.order : 0,
    nome: texto(entrada.nome) || slug,
    tipo: TIPOS.find((t) => t === entrada.tipo) ?? 'extensao',
    listado: entrada.listado === true,
    resumo: texto(entrada.resumo),
    icone: texto(entrada.icone),
    tags: (entrada.tags ?? []).map((tag) => texto(tag)).filter(Boolean),
    chromeUrl: texto(entrada.chromeUrl),
    firefoxUrl: texto(entrada.firefoxUrl),
    edgeUrl: texto(entrada.edgeUrl),
    operaUrl: texto(entrada.operaUrl),
    repoLink: texto(entrada.repoLink),
  }
}

function ehUrlDaLoja(loja: Loja, url: string): boolean {
  if (!url) return false
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === 'https:' && hostname === HOST_DA_LOJA[loja]
  } catch {
    return false
  }
}

export function lojasPublicadas(produto: UrlsDasLojas): LojaPublicada[] {
  return LOJAS.flatMap((loja) => {
    const url = produto[CAMPO_DA_LOJA[loja]].trim()
    return ehUrlDaLoja(loja, url) ? [{ loja, url }] : []
  })
}

export function fase(produto: UrlsDasLojas): Fase {
  return lojasPublicadas(produto).length > 0 ? 'disponivel' : 'em-breve'
}

export function produtosListados(produtos: Produto[]): Produto[] {
  return produtos.filter((p) => p.listado)
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/pilulabs.test.ts; echo "exit=$?"`
Expected: PASS, `exit=0`.

- [ ] **Step 6: Escrever o teste do catálogo em disco e da trava (falha)**

Crie `apps/web/lib/pilulabs-conteudo.test.ts`:

```ts
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  lerProdutosDoConteudo,
  rotasFaltando,
  rotasObrigatorias,
} from './pilulabs-conteudo'

const RAIZ_WEB = join(__dirname, '..')

describe('catálogo em content/produtos', () => {
  const produtos = lerProdutosDoConteudo(RAIZ_WEB)

  it('tem o Botaí, com o ícone de 128 px', () => {
    expect(produtos.find((p) => p.slug === 'botai')).toMatchObject({
      nome: 'Botaí',
      tipo: 'extensao',
      icone: '/pilulabs/botai/icone-128.png',
    })
  })

  it('todo produto tem ícone, e o ícone existe em public/', () => {
    for (const p of produtos) {
      expect(p.icone).not.toBe('')
      expect(existsSync(join(RAIZ_WEB, 'public', p.icone))).toBe(true)
    }
  })

  // Trava do modelo híbrido: o catálogo mora no YAML e a página em TSX.
  // Um produto listado sem rota viraria um card apontando para 404.
  it('todo produto listado tem página e política de privacidade', () => {
    expect(
      rotasFaltando(produtos, (caminho) => existsSync(join(RAIZ_WEB, caminho))),
    ).toEqual([])
  })
})

describe('rotasFaltando', () => {
  it('as rotas obrigatórias são a página do produto e a política', () => {
    expect(rotasObrigatorias('botai')).toEqual([
      'app/(site)/pilulabs/botai/page.tsx',
      'app/(site)/pilulabs/botai/privacidade/page.tsx',
    ])
  })

  it('acusa as duas rotas que faltam a um produto listado', () => {
    expect(rotasFaltando([{ slug: 'novo', listado: true }], () => false)).toEqual(
      rotasObrigatorias('novo'),
    )
  })

  it('ignora o produto não listado, que pode existir antes da página', () => {
    expect(
      rotasFaltando([{ slug: 'novo', listado: false }], () => false),
    ).toEqual([])
  })
})
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/pilulabs-conteudo.test.ts; echo "exit=$?"`
Expected: FAIL com `Cannot find module './pilulabs-conteudo'`, `exit=1`.

- [ ] **Step 8: Criar o leitor do YAML em disco**

Crie `apps/web/lib/pilulabs-conteudo.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { normalizarProduto, type EntradaProduto, type Produto } from './pilulabs'

// Lê o YAML sem o Keystatic, cujo reader exige `server-only` e `draftMode`.
// É assim que o Jest e o Playwright derivam o esperado do mesmo catálogo.
export function lerProdutosDoConteudo(raizWeb: string): Produto[] {
  const pasta = join(raizWeb, 'content', 'produtos')
  if (!existsSync(pasta)) return []
  return readdirSync(pasta, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => {
      const bruto = readFileSync(join(pasta, entrada.name, 'index.yaml'), 'utf8')
      return normalizarProduto(
        entrada.name,
        (parse(bruto) ?? {}) as EntradaProduto,
      )
    })
    .sort((a, b) => a.order - b.order)
}

export function rotasObrigatorias(slug: string): string[] {
  return [
    `app/(site)/pilulabs/${slug}/page.tsx`,
    `app/(site)/pilulabs/${slug}/privacidade/page.tsx`,
  ]
}

export function rotasFaltando(
  produtos: Pick<Produto, 'slug' | 'listado'>[],
  existe: (caminhoNaRaizWeb: string) => boolean,
): string[] {
  return produtos
    .filter((p) => p.listado)
    .flatMap((p) => rotasObrigatorias(p.slug))
    .filter((caminho) => !existe(caminho))
}
```

- [ ] **Step 9: Criar a collection `produtos` e o YAML do Botaí**

Em `apps/web/keystatic.config.ts`, insira o bloco abaixo **antes** da linha `    feeds: collection({` (ou seja, logo depois do fim da collection `projects`):

```ts
    produtos: collection({
      label: 'Produtos (PiluLabs)',
      slugField: 'produtoSlug',
      path: 'content/produtos/*/',
      schema: {
        produtoSlug: fields.slug({
          name: { label: 'Slug técnico (sem acento, igual à pasta da rota)' },
        }),
        order: fields.integer({ label: 'Ordem (menor primeiro)' }),
        nome: fields.text({ label: 'Nome de exibição (com acento)' }),
        tipo: fields.select({
          label: 'Tipo',
          defaultValue: 'extensao',
          options: [
            { label: 'Extensão de navegador', value: 'extensao' },
            { label: 'App web', value: 'web' },
            { label: 'CLI', value: 'cli' },
          ],
        }),
        listado: fields.checkbox({
          label: 'Listado',
          description:
            'Aparece em /pilulabs e na home e pode ser indexado. Desmarcado: só por link, com noindex.',
          defaultValue: false,
        }),
        resumo: fields.text({ label: 'Descrição curta oficial' }),
        icone: fields.text({
          label: 'Ícone (path em public/)',
          description: 'Ex.: /pilulabs/botai/icone-128.png',
        }),
        tags: fields.array(fields.text({ label: 'Tag' }), { label: 'Tags' }),
        chromeUrl: fields.text({
          label: 'Chrome Web Store',
          description:
            'Vazio = não publicado. Só vale https://chromewebstore.google.com/…',
        }),
        firefoxUrl: fields.text({
          label: 'Firefox Add-ons',
          description:
            'Vazio = não publicado. Só vale https://addons.mozilla.org/…',
        }),
        edgeUrl: fields.text({
          label: 'Microsoft Edge Add-ons',
          description:
            'Vazio = não publicado. Só vale https://microsoftedge.microsoft.com/…',
        }),
        operaUrl: fields.text({
          label: 'Opera add-ons',
          description: 'Vazio = não publicado. Só vale https://addons.opera.com/…',
        }),
        repoLink: fields.text({ label: 'Código-fonte (URL)' }),
      },
    }),
```

Crie `apps/web/content/produtos/botai/index.yaml`:

```yaml
produtoSlug: botai
order: 0
nome: Botaí
tipo: extensao
listado: false
resumo: Gerador de dados fake para formulários (CPF, CNPJ, CEP)
icone: /pilulabs/botai/icone-128.png
tags:
  - Extensão
  - Formulários
  - QA
  - CPF
  - CEP
chromeUrl: ''
firefoxUrl: ''
edgeUrl: ''
operaUrl: ''
repoLink: https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai
```

- [ ] **Step 10: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/pilulabs.test.ts lib/pilulabs-conteudo.test.ts; echo "exit=$?"`
Expected: PASS nos dois arquivos, `exit=0`.

- [ ] **Step 11: `getProdutos()` no leitor de conteúdo**

Em `apps/web/lib/site-content.ts`, logo abaixo de `import type { Project } from '@/mocks/projects'`, acrescente:

```ts
import { normalizarProduto, type Produto } from '@/lib/pilulabs'
```

E no fim do arquivo:

```ts
export async function getProdutos(): Promise<Produto[]> {
  await skipCacheWhenDraft()
  const reader = await getKeystaticReader()
  const items = await reader.collections.produtos.all()
  return sortByOrder(
    items.map(({ slug, entry }) => normalizarProduto(slug, entry)),
  )
}
```

O `site-content.ts` importa `server-only` e não entra no Jest. Quem prova o encaixe do `entry` do Keystatic em `EntradaProduto` é o `tsc`. O build e o E2E das tarefas seguintes provam a leitura.

- [ ] **Step 12: Lint e tipos**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/eslint keystatic.config.ts lib/pilulabs.ts lib/pilulabs.test.ts lib/pilulabs-conteudo.ts lib/pilulabs-conteudo.test.ts lib/site-content.ts; echo "exit=$?"; node_modules/.bin/tsc --noEmit; echo "exit=$?"`
Expected: os dois `exit=0`, sem saída do ESLint.

- [ ] **Step 13: Commit**

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site add apps/web/keystatic.config.ts apps/web/content/produtos/botai/index.yaml apps/web/public/pilulabs/botai/icone-128.png apps/web/lib/pilulabs.ts apps/web/lib/pilulabs.test.ts apps/web/lib/pilulabs-conteudo.ts apps/web/lib/pilulabs-conteudo.test.ts apps/web/lib/site-content.ts && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site commit -m "feat(pilulabs): catálogo de produtos no Keystatic, com o Botaí não listado"; echo "exit=$?"
```

---

### Task 2: Capturas, atalhos, metadata e JSON-LD

**Files:**

- Modify: `apps/web/lib/pilulabs.ts` (imports no topo e blocos novos no fim)
- Modify: `apps/web/lib/pilulabs.test.ts` (import do topo e blocos novos no fim)
- Create: `apps/web/lib/render-estatico.ts`
- Create: `apps/web/lib/json-ld.ts`
- Create: `apps/web/lib/json-ld.test.ts`
- Create: `apps/web/components/json-ld.tsx`
- Create: `apps/web/components/json-ld.test.tsx`
- Create: `apps/web/lib/pilulabs-json-ld.ts`
- Create: `apps/web/lib/pilulabs-json-ld.test.ts`

**Interfaces:**

- Consumes: `Loja`, `Produto`, `LOJAS` e `lojasPublicadas`, da Task 1.
- Produces (`lib/pilulabs.ts`):
  - `type Sistema = 'windows' | 'mac' | 'linux'`
  - `type Captura = { arquivo: string; src: string; alt: string }`
  - `type PaginaPiluLabs = { caminho: string; titulo: string; descricao: string }`
  - `const ATALHOS: Record<Loja, Record<Sistema, string>>`
  - `const ROTULOS_CAPTURA: ReadonlyMap<string, string>`
  - `altDaCaptura(arquivo: string): string`
  - `listarCapturas(slug: string, raizPublica?: string): Captura[]`. O padrão de `raizPublica` é `join(process.cwd(), 'public')`.
  - `metadataDaPagina(pagina: PaginaPiluLabs): Metadata`
  - `metadataDoProduto(produto: Pick<Produto, 'listado'>, pagina: PaginaPiluLabs): Metadata`
- Produces (`lib/render-estatico.ts`): `renderEstatico(elemento: ReactElement): HTMLDivElement`, só para teste.
- Produces (`lib/json-ld.ts`): `serializarJsonLd(dados: unknown): string`.
- Produces (`components/json-ld.tsx`): `JsonLd({ dados }: { dados: unknown })`.
- Produces (`lib/pilulabs-json-ld.ts`):
  - `CONTEXTO_SCHEMA`
  - `type ItemTrilha = { nome: string; caminho: string }`
  - `type DetalhesSoftware = { applicationSubCategory: string; operatingSystem: string; softwareRequirements: string; featureList: string[] }`
  - `jsonLdBreadcrumb(siteUrl: string, itens: ItemTrilha[])`
  - `jsonLdDoProduto(entrada: { produto: Produto; siteUrl: string; caminho: string; capturas: Captura[]; detalhes: DetalhesSoftware })`, que devolve `{ '@context', '@graph': [SoftwareApplication, BreadcrumbList] }`
  - `jsonLdVitrine(siteUrl: string, produtos: Pick<Produto, 'slug' | 'nome'>[])`

- [ ] **Step 1: Escrever os testes de capturas, atalhos e metadata (falha)**

Em `apps/web/lib/pilulabs.test.ts`, troque o bloco de import do topo por:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  altDaCaptura,
  ATALHOS,
  fase,
  listarCapturas,
  LOJAS,
  lojasPublicadas,
  metadataDaPagina,
  metadataDoProduto,
  normalizarProduto,
  produtosListados,
  ROTULOS_CAPTURA,
  type Produto,
} from './pilulabs'
```

E acrescente ao fim do arquivo:

```ts
describe('listarCapturas', () => {
  let raiz: string

  beforeEach(() => {
    raiz = mkdtempSync(join(tmpdir(), 'pilulabs-'))
  })
  afterEach(() => {
    rmSync(raiz, { recursive: true, force: true })
  })

  function criarCapturas(...arquivos: string[]): string {
    const pasta = join(raiz, 'pilulabs', 'botai', 'capturas')
    mkdirSync(pasta, { recursive: true })
    for (const arquivo of arquivos) writeFileSync(join(pasta, arquivo), '')
    return pasta
  }

  // Na fase 2 as capturas ainda não existem: a página tem de nascer sem elas.
  it('devolve [] quando a pasta não existe', () => {
    expect(listarCapturas('botai', raiz)).toEqual([])
  })

  it('lista só arquivos PNG, em ordem natural do prefixo NN', () => {
    const pasta = criarCapturas(
      '10-c.png',
      '2-b.png',
      '01-a.png',
      '03-d.PNG',
      '.DS_Store',
      'notas.txt',
    )
    mkdirSync(join(pasta, '04-pasta.png'))
    expect(listarCapturas('botai', raiz).map((c) => c.arquivo)).toEqual([
      '01-a.png',
      '2-b.png',
      '03-d.PNG',
      '10-c.png',
    ])
  })

  it('monta o src público a partir do slug', () => {
    criarCapturas('01-popup-escuro.png')
    expect(listarCapturas('botai', raiz)).toEqual([
      {
        arquivo: '01-popup-escuro.png',
        src: '/pilulabs/botai/capturas/01-popup-escuro.png',
        alt: 'Captura de tela: popup (tema escuro)',
      },
    ])
  })
})

describe('altDaCaptura', () => {
  it('tira o NN e a extensão, devolve o acento e o tema pelo mapa de rótulos', () => {
    expect(altDaCaptura('01-pagina-preenchida-escuro.png')).toBe(
      'Captura de tela: página preenchida (tema escuro)',
    )
  })

  it('palavra fora do mapa entra como está, em minúscula', () => {
    expect(altDaCaptura('02-Popup-pessoa-pronta-claro.png')).toBe(
      'Captura de tela: popup pessoa pronta (tema claro)',
    )
  })

  // Com um objeto comum, "constructor" acharia Object.prototype.constructor.
  it('palavra com nome de propriedade de Object não vira lixo', () => {
    expect(altDaCaptura('03-constructor.png')).toBe(
      'Captura de tela: constructor',
    )
  })

  it('o mapa cobre os temas claro e escuro', () => {
    expect(ROTULOS_CAPTURA.get('claro')).toBe('(tema claro)')
    expect(ROTULOS_CAPTURA.get('escuro')).toBe('(tema escuro)')
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

  // No Firefox para Linux, Ctrl+Shift+Y abre os Downloads e não é cedido.
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

const PAGINA = {
  caminho: '/pilulabs/botai',
  titulo: 'Botaí | PiluLabs',
  descricao: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
}

describe('metadataDaPagina', () => {
  // O Next substitui o openGraph do layout inteiro: locale e siteName têm de
  // vir de novo, senão a página perde os dois.
  it('declara título absoluto, canonical, openGraph e twitter completos', () => {
    expect(metadataDaPagina(PAGINA)).toEqual({
      title: { absolute: 'Botaí | PiluLabs' },
      description: PAGINA.descricao,
      alternates: { canonical: '/pilulabs/botai' },
      openGraph: {
        type: 'website',
        locale: 'pt_BR',
        siteName: 'piluvitu.com.br',
        url: '/pilulabs/botai',
        title: 'Botaí | PiluLabs',
        description: PAGINA.descricao,
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Botaí | PiluLabs',
        description: PAGINA.descricao,
      },
    })
  })

  // Declarar images aqui desligaria o opengraph-image.tsx do segmento.
  it('não declara imagens', () => {
    const metadata = metadataDaPagina(PAGINA)
    expect(metadata.openGraph).not.toHaveProperty('images')
    expect(metadata.twitter).not.toHaveProperty('images')
  })
})

describe('metadataDoProduto', () => {
  it('produto não listado: noindex', () => {
    expect(metadataDoProduto({ listado: false }, PAGINA).robots).toEqual({
      index: false,
    })
  })

  it('produto listado: sem robots, igual à metadata da página', () => {
    expect(metadataDoProduto({ listado: true }, PAGINA)).toEqual(
      metadataDaPagina(PAGINA),
    )
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/pilulabs.test.ts; echo "exit=$?"`
Expected: FAIL nos blocos novos, com `TypeError: (0 , _pilulabs.altDaCaptura) is not a function`, `… listarCapturas is not a function`, `Cannot convert undefined or null to object` (de `ATALHOS`) e afins, `exit=1`. Os blocos da Task 1 continuam passando. O `ts-jest` só transpila, então o erro é de runtime, e não do TypeScript.

- [ ] **Step 3: Implementar capturas, atalhos e metadata em `lib/pilulabs.ts`**

No topo de `apps/web/lib/pilulabs.ts`, antes de `export type Loja`, acrescente:

```ts
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Metadata } from 'next'
```

E no fim do arquivo:

```ts
export type Sistema = 'windows' | 'mac' | 'linux'
export type Captura = { arquivo: string; src: string; alt: string }
export type PaginaPiluLabs = {
  caminho: string
  titulo: string
  descricao: string
}

const ATALHO_CHROMIUM: Record<Sistema, string> = {
  windows: 'Ctrl+Shift+Y',
  mac: '⌥⇧P',
  linux: 'Ctrl+Shift+Y',
}

export const ATALHOS: Record<Loja, Record<Sistema, string>> = {
  chrome: { ...ATALHO_CHROMIUM },
  edge: { ...ATALHO_CHROMIUM },
  opera: { ...ATALHO_CHROMIUM },
  // Espelha o wxt.config.ts do Botaí: no Firefox para Linux, Ctrl+Shift+Y é dos Downloads.
  firefox: { ...ATALHO_CHROMIUM, linux: 'Alt+Shift+P' },
}

export const ROTULOS_CAPTURA: ReadonlyMap<string, string> = new Map([
  ['pagina', 'página'],
  ['formulario', 'formulário'],
  ['cartao', 'cartão'],
  ['endereco', 'endereço'],
  ['opcoes', 'opções'],
  ['claro', '(tema claro)'],
  ['escuro', '(tema escuro)'],
])

const PREFIXO_DE_ORDEM = /^\d+-/
const EXTENSAO_PNG = /\.png$/i

export function altDaCaptura(arquivo: string): string {
  const palavras = arquivo
    .replace(EXTENSAO_PNG, '')
    .replace(PREFIXO_DE_ORDEM, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((palavra) => palavra.toLowerCase())
    .map((palavra) => ROTULOS_CAPTURA.get(palavra) ?? palavra)
  return `Captura de tela: ${palavras.join(' ')}`
}

// Roda no build: na Vercel, public/ não vai para o lambda, e a rota tem de ficar
// estática (ver "PiluLabs" no CLAUDE.md do apps/web).
export function listarCapturas(
  slug: string,
  raizPublica: string = join(process.cwd(), 'public'),
): Captura[] {
  const pasta = join(raizPublica, 'pilulabs', slug, 'capturas')
  let arquivos: string[]
  try {
    arquivos = readdirSync(pasta, { withFileTypes: true })
      .filter((entrada) => entrada.isFile() && EXTENSAO_PNG.test(entrada.name))
      .map((entrada) => entrada.name)
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw erro
  }
  return arquivos
    .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))
    .map((arquivo) => ({
      arquivo,
      src: `/pilulabs/${slug}/capturas/${encodeURIComponent(arquivo)}`,
      alt: altDaCaptura(arquivo),
    }))
}

// O Next substitui o openGraph do layout inteiro, e a imagem só vem do
// opengraph-image.tsx do próprio segmento: por isso tudo de novo e sem images.
export function metadataDaPagina({
  caminho,
  titulo,
  descricao,
}: PaginaPiluLabs): Metadata {
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: 'piluvitu.com.br',
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

export function metadataDoProduto(
  produto: Pick<Produto, 'listado'>,
  pagina: PaginaPiluLabs,
): Metadata {
  const metadata = metadataDaPagina(pagina)
  return produto.listado ? metadata : { ...metadata, robots: { index: false } }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/pilulabs.test.ts; echo "exit=$?"`
Expected: PASS, `exit=0`.

- [ ] **Step 5: Escrever os testes de serialização e do `<JsonLd>` (falha)**

Crie `apps/web/lib/json-ld.test.ts`:

```ts
import { serializarJsonLd } from './json-ld'

describe('serializarJsonLd', () => {
  // Um texto do YAML com "</script>" fecharia a tag e viraria HTML.
  it('troca < por \\u003c e continua sendo JSON válido', () => {
    const dados = { name: '</script><script>alert(1)</script>' }
    const serializado = serializarJsonLd(dados)
    expect(serializado).not.toContain('<')
    expect(JSON.parse(serializado)).toEqual(dados)
  })
})
```

Crie `apps/web/components/json-ld.test.tsx`:

```tsx
import { renderEstatico } from '@/lib/render-estatico'
import { JsonLd } from './json-ld'

describe('JsonLd', () => {
  it('renderiza um script application/ld+json com o JSON escapado', () => {
    const raiz = renderEstatico(<JsonLd dados={{ name: 'a<b' }} />)
    const script = raiz.querySelector('script[type="application/ld+json"]')
    expect(script?.textContent).toBe('{"name":"a\\u003cb"}')
  })
})
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/json-ld.test.ts components/json-ld.test.tsx; echo "exit=$?"`
Expected: FAIL com `Cannot find module './json-ld'` e `Cannot find module '@/lib/render-estatico'`, `exit=1`.

- [ ] **Step 7: Criar o serializador, o componente e o helper de render**

Crie `apps/web/lib/json-ld.ts`:

```ts
export function serializarJsonLd(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, '\\u003c')
}
```

Crie `apps/web/components/json-ld.tsx`:

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

Crie `apps/web/lib/render-estatico.ts`:

```ts
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

export function renderEstatico(elemento: ReactElement): HTMLDivElement {
  const raiz = document.createElement('div')
  raiz.innerHTML = renderToStaticMarkup(elemento)
  return raiz
}
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/json-ld.test.ts components/json-ld.test.tsx; echo "exit=$?"`
Expected: PASS, `exit=0`.

- [ ] **Step 9: Escrever o teste dos montadores de JSON-LD (falha)**

Crie `apps/web/lib/pilulabs-json-ld.test.ts`:

```ts
import type { Captura, Produto } from './pilulabs'
import {
  CONTEXTO_SCHEMA,
  jsonLdBreadcrumb,
  jsonLdDoProduto,
  jsonLdVitrine,
} from './pilulabs-json-ld'

const SITE = 'https://piluvitu.com.br'

const DETALHES = {
  applicationSubCategory: 'Extensão de navegador',
  operatingSystem: 'Windows, macOS, Linux, ChromeOS',
  softwareRequirements:
    'Chrome, Edge ou Opera com Chromium 123 ou superior, ou Firefox 153 ou superior',
  featureList: ['Documentos: CPF e CNPJ com dígito verificador'],
}

const BOTAI: Produto = {
  slug: 'botai',
  order: 0,
  nome: 'Botaí',
  tipo: 'extensao',
  listado: false,
  resumo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  icone: '/pilulabs/botai/icone-128.png',
  tags: [],
  chromeUrl: '',
  firefoxUrl: '',
  edgeUrl: '',
  operaUrl: '',
  repoLink: '',
}

const CAPTURAS: Captura[] = [
  {
    arquivo: '01-a.png',
    src: '/pilulabs/botai/capturas/01-a.png',
    alt: 'Captura de tela: a',
  },
]

function montar(produto: Produto, capturas: Captura[] = []) {
  return jsonLdDoProduto({
    produto,
    siteUrl: SITE,
    caminho: '/pilulabs/botai',
    capturas,
    detalhes: DETALHES,
  })
}

function aplicacao(produto: Produto, capturas: Captura[] = []) {
  return montar(produto, capturas)['@graph'][0]
}

describe('jsonLdDoProduto', () => {
  it('descreve um SoftwareApplication gratuito, com URLs absolutas', () => {
    expect(aplicacao(BOTAI)).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Botaí',
      description: BOTAI.resumo,
      applicationCategory: 'BrowserApplication',
      ...DETALHES,
      inLanguage: 'pt-BR',
      url: 'https://piluvitu.com.br/pilulabs/botai',
      image: 'https://piluvitu.com.br/pilulabs/botai/icone-128.png',
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
      publisher: {
        '@type': 'Organization',
        name: 'PiluTech',
        url: 'https://piluvitu.com.br/pilulabs',
      },
      author: {
        '@type': 'Person',
        name: 'Paulo Victor Torres Silva',
        url: 'https://piluvitu.com.br/',
      },
    })
  })

  // O Google proíbe agregar nota de outro site (as lojas), e ninguém
  // atualizaria a versão a cada release.
  it('não tem nota nem versão', () => {
    expect(aplicacao(BOTAI)).not.toHaveProperty('aggregateRating')
    expect(aplicacao(BOTAI)).not.toHaveProperty('softwareVersion')
  })

  it('sem loja publicada, sem installUrl', () => {
    expect(aplicacao(BOTAI)).not.toHaveProperty('installUrl')
  })

  it('installUrl só com as lojas publicadas de verdade', () => {
    expect(
      aplicacao({
        ...BOTAI,
        chromeUrl: 'https://chromewebstore.google.com/detail/botai/abc',
        operaUrl: 'https://example.com/botai',
      }),
    ).toMatchObject({
      installUrl: ['https://chromewebstore.google.com/detail/botai/abc'],
    })
  })

  it('screenshot com as capturas em URL absoluta', () => {
    expect(aplicacao(BOTAI, CAPTURAS)).toMatchObject({
      screenshot: ['https://piluvitu.com.br/pilulabs/botai/capturas/01-a.png'],
    })
  })

  it('sem capturas, sem screenshot', () => {
    expect(aplicacao(BOTAI)).not.toHaveProperty('screenshot')
  })

  it('sem ícone, sem image', () => {
    expect(aplicacao({ ...BOTAI, icone: '' })).not.toHaveProperty('image')
  })

  it('traz o contexto e a trilha PiluLabs › Botaí', () => {
    const dados = montar(BOTAI)
    expect(dados['@context']).toBe(CONTEXTO_SCHEMA)
    expect(dados['@graph'][1]).toEqual(
      jsonLdBreadcrumb(SITE, [
        { nome: 'PiluLabs', caminho: '/pilulabs' },
        { nome: 'Botaí', caminho: '/pilulabs/botai' },
      ]),
    )
  })
})

describe('jsonLdBreadcrumb', () => {
  it('numera a partir de 1, com URL absoluta', () => {
    expect(
      jsonLdBreadcrumb(SITE, [
        { nome: 'PiluLabs', caminho: '/pilulabs' },
        { nome: 'Botaí', caminho: '/pilulabs/botai' },
      ]),
    ).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'PiluLabs',
          item: 'https://piluvitu.com.br/pilulabs',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Botaí',
          item: 'https://piluvitu.com.br/pilulabs/botai',
        },
      ],
    })
  })
})

describe('jsonLdVitrine', () => {
  it('é uma CollectionPage da PiluTech', () => {
    expect(jsonLdVitrine(SITE, [])).toEqual({
      '@context': CONTEXTO_SCHEMA,
      '@type': 'CollectionPage',
      name: 'PiluLabs',
      description: 'Produtos e apps da PiluTech',
      url: 'https://piluvitu.com.br/pilulabs',
      inLanguage: 'pt-BR',
      publisher: {
        '@type': 'Organization',
        name: 'PiluTech',
        url: 'https://piluvitu.com.br/pilulabs',
      },
    })
  })

  it('lista os produtos em hasPart', () => {
    expect(jsonLdVitrine(SITE, [BOTAI])).toMatchObject({
      hasPart: [
        {
          '@type': 'SoftwareApplication',
          name: 'Botaí',
          url: 'https://piluvitu.com.br/pilulabs/botai',
        },
      ],
    })
  })
})
```

- [ ] **Step 10: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/pilulabs-json-ld.test.ts; echo "exit=$?"`
Expected: FAIL com `Cannot find module './pilulabs-json-ld'`, `exit=1`.

- [ ] **Step 11: Implementar `lib/pilulabs-json-ld.ts`**

```ts
import { lojasPublicadas, type Captura, type Produto } from './pilulabs'

export const CONTEXTO_SCHEMA = 'https://schema.org'

export type ItemTrilha = { nome: string; caminho: string }

export type DetalhesSoftware = {
  applicationSubCategory: string
  operatingSystem: string
  softwareRequirements: string
  featureList: string[]
}

type EntradaJsonLdProduto = {
  produto: Produto
  siteUrl: string
  caminho: string
  capturas: Captura[]
  detalhes: DetalhesSoftware
}

function absoluto(siteUrl: string, caminho: string): string {
  return new URL(caminho, `${siteUrl}/`).href
}

function publicador(siteUrl: string) {
  return {
    '@type': 'Organization',
    name: 'PiluTech',
    url: absoluto(siteUrl, '/pilulabs'),
  }
}

export function jsonLdBreadcrumb(siteUrl: string, itens: ItemTrilha[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: itens.map((item, indice) => ({
      '@type': 'ListItem',
      position: indice + 1,
      name: item.nome,
      item: absoluto(siteUrl, item.caminho),
    })),
  }
}

export function jsonLdDoProduto({
  produto,
  siteUrl,
  caminho,
  capturas,
  detalhes,
}: EntradaJsonLdProduto) {
  const lojas = lojasPublicadas(produto)
  return {
    '@context': CONTEXTO_SCHEMA,
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: produto.nome,
        description: produto.resumo,
        applicationCategory: 'BrowserApplication',
        ...detalhes,
        inLanguage: 'pt-BR',
        url: absoluto(siteUrl, caminho),
        ...(produto.icone ? { image: absoluto(siteUrl, produto.icone) } : {}),
        ...(capturas.length > 0
          ? { screenshot: capturas.map((c) => absoluto(siteUrl, c.src)) }
          : {}),
        ...(lojas.length > 0 ? { installUrl: lojas.map((l) => l.url) } : {}),
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
        publisher: publicador(siteUrl),
        author: {
          '@type': 'Person',
          name: 'Paulo Victor Torres Silva',
          url: absoluto(siteUrl, '/'),
        },
      },
      jsonLdBreadcrumb(siteUrl, [
        { nome: 'PiluLabs', caminho: '/pilulabs' },
        { nome: produto.nome, caminho },
      ]),
    ],
  }
}

export function jsonLdVitrine(
  siteUrl: string,
  produtos: Pick<Produto, 'slug' | 'nome'>[],
) {
  return {
    '@context': CONTEXTO_SCHEMA,
    '@type': 'CollectionPage',
    name: 'PiluLabs',
    description: 'Produtos e apps da PiluTech',
    url: absoluto(siteUrl, '/pilulabs'),
    inLanguage: 'pt-BR',
    publisher: publicador(siteUrl),
    ...(produtos.length > 0
      ? {
          hasPart: produtos.map((p) => ({
            '@type': 'SoftwareApplication',
            name: p.nome,
            url: absoluto(siteUrl, `/pilulabs/${p.slug}`),
          })),
        }
      : {}),
  }
}
```

- [ ] **Step 12: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/pilulabs.test.ts lib/pilulabs-json-ld.test.ts lib/json-ld.test.ts components/json-ld.test.tsx; echo "exit=$?"`
Expected: PASS nos 4, `exit=0`.

- [ ] **Step 13: Lint e tipos**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/eslint lib/pilulabs.ts lib/pilulabs.test.ts lib/render-estatico.ts lib/json-ld.ts lib/json-ld.test.ts components/json-ld.tsx components/json-ld.test.tsx lib/pilulabs-json-ld.ts lib/pilulabs-json-ld.test.ts; echo "exit=$?"; node_modules/.bin/tsc --noEmit; echo "exit=$?"`
Expected: os dois `exit=0`.

- [ ] **Step 14: Commit**

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site add apps/web/lib/pilulabs.ts apps/web/lib/pilulabs.test.ts apps/web/lib/render-estatico.ts apps/web/lib/json-ld.ts apps/web/lib/json-ld.test.ts apps/web/components/json-ld.tsx apps/web/components/json-ld.test.tsx apps/web/lib/pilulabs-json-ld.ts apps/web/lib/pilulabs-json-ld.test.ts && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site commit -m "feat(pilulabs): capturas descobertas no build, atalhos, metadata e JSON-LD"; echo "exit=$?"
```

---

### Task 3: Status, botões de loja, card e vitrine

**Files:**

- Create: `apps/web/components/pilulabs/lojas-ui.ts`
- Create: `apps/web/components/pilulabs/status-produto.tsx`, `status-produto.test.tsx`, `status-produto.stories.tsx`
- Create: `apps/web/components/pilulabs/botoes-loja.tsx`, `botoes-loja.test.tsx`, `botoes-loja.stories.tsx`
- Create: `apps/web/components/pilulabs/produto-card.tsx`, `produto-card.test.tsx`, `produto-card.stories.tsx`
- Create: `apps/web/components/pilulabs/vitrine.tsx`, `vitrine.test.tsx`, `vitrine.stories.tsx`

**Interfaces:**

- Consumes:
  - tipos `Loja`, `Fase`, `Produto`, `TipoProduto` e `LojaPublicada`, da Task 1, **só com `import type`**;
  - `renderEstatico`, da Task 2.
- Produces:
  - `LOJA_UI: Record<Loja, { rotulo: string; icone: IconDefinition }>`, com os rótulos `'Chrome Web Store'`, `'Firefox Add-ons'`, `'Microsoft Edge Add-ons'` e `'Opera add-ons'`;
  - `StatusProduto({ fase }: { fase: Fase })`;
  - `BotoesLoja({ lojas }: { lojas: LojaPublicada[] })`, que devolve `null` com `[]`;
  - `ProdutoCard({ produto, fase, lojas }: { produto: Pick<Produto, 'slug' | 'nome' | 'resumo' | 'icone' | 'tags'>; fase: Fase; lojas: Loja[] })`;
  - `type ItemVitrine = { produto: Pick<Produto, 'slug' | 'nome' | 'resumo' | 'icone' | 'tags' | 'tipo'>; fase: Fase; lojas: Loja[] }`;
  - `Vitrine({ itens }: { itens: ItemVitrine[] })`, com `data-testid="pilulabs-vazio"` no estado vazio.

- [ ] **Step 1: Escrever os testes dos 4 componentes (falha)**

Crie `apps/web/components/pilulabs/status-produto.test.tsx`:

```tsx
import { renderEstatico } from '@/lib/render-estatico'
import { StatusProduto } from './status-produto'

describe('StatusProduto', () => {
  it('em-breve mostra "Em breve"', () => {
    expect(renderEstatico(<StatusProduto fase="em-breve" />).textContent).toBe(
      'Em breve',
    )
  })

  it('disponivel mostra "Disponível"', () => {
    expect(
      renderEstatico(<StatusProduto fase="disponivel" />).textContent,
    ).toBe('Disponível')
  })
})
```

Crie `apps/web/components/pilulabs/botoes-loja.test.tsx`:

```tsx
import { renderEstatico } from '@/lib/render-estatico'
import { BotoesLoja } from './botoes-loja'

const FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'

describe('BotoesLoja', () => {
  it('sem loja publicada não renderiza nada', () => {
    expect(renderEstatico(<BotoesLoja lojas={[]} />).innerHTML).toBe('')
  })

  it('um link por loja publicada, com o nome da loja, em aba nova', () => {
    const raiz = renderEstatico(
      <BotoesLoja lojas={[{ loja: 'firefox', url: FIREFOX }]} />,
    )
    const links = [...raiz.querySelectorAll('a')]
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Firefox Add-ons', FIREFOX],
    ])
    expect(links[0].getAttribute('target')).toBe('_blank')
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('usa o nome de cada uma das 4 lojas, na ordem recebida', () => {
    const raiz = renderEstatico(
      <BotoesLoja
        lojas={[
          { loja: 'chrome', url: 'https://chromewebstore.google.com/detail/b/a' },
          { loja: 'firefox', url: FIREFOX },
          {
            loja: 'edge',
            url: 'https://microsoftedge.microsoft.com/addons/detail/b/a',
          },
          {
            loja: 'opera',
            url: 'https://addons.opera.com/pt-br/extensions/details/b/',
          },
        ]}
      />,
    )
    expect([...raiz.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      'Chrome Web Store',
      'Firefox Add-ons',
      'Microsoft Edge Add-ons',
      'Opera add-ons',
    ])
  })
})
```

Crie `apps/web/components/pilulabs/produto-card.test.tsx`:

```tsx
import { renderEstatico } from '@/lib/render-estatico'
import { ProdutoCard } from './produto-card'

const BOTAI = {
  slug: 'botai',
  nome: 'Botaí',
  resumo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  icone: '/pilulabs/botai/icone-128.png',
  tags: ['Extensão', 'QA'],
}

describe('ProdutoCard', () => {
  it('é um link para a página do produto, com nome, resumo, tags e fase', () => {
    const raiz = renderEstatico(
      <ProdutoCard produto={BOTAI} fase="em-breve" lojas={[]} />,
    )
    expect(raiz.querySelector('a')?.getAttribute('href')).toBe('/pilulabs/botai')
    expect(raiz.querySelector('h3')?.textContent).toBe('Botaí')
    expect(raiz.textContent).toContain(BOTAI.resumo)
    expect(
      [...raiz.querySelectorAll('ul:not([aria-label]) li')].map(
        (li) => li.textContent,
      ),
    ).toEqual(['Extensão', 'QA'])
    expect(raiz.textContent).toContain('Em breve')
  })

  it('sem loja publicada, sem a lista de lojas', () => {
    const raiz = renderEstatico(
      <ProdutoCard produto={BOTAI} fase="em-breve" lojas={[]} />,
    )
    expect(raiz.querySelector('[aria-label="Lojas"]')).toBeNull()
  })

  it('lista só as lojas recebidas, pelo nome', () => {
    const raiz = renderEstatico(
      <ProdutoCard produto={BOTAI} fase="disponivel" lojas={['chrome', 'opera']} />,
    )
    expect(
      [...raiz.querySelectorAll('[aria-label="Lojas"] li')].map(
        (li) => li.textContent,
      ),
    ).toEqual(['Chrome Web Store', 'Opera add-ons'])
  })

  it('sem ícone, sem img', () => {
    const raiz = renderEstatico(
      <ProdutoCard produto={{ ...BOTAI, icone: '' }} fase="em-breve" lojas={[]} />,
    )
    expect(raiz.querySelector('img')).toBeNull()
  })
})
```

Crie `apps/web/components/pilulabs/vitrine.test.tsx`:

```tsx
import { renderEstatico } from '@/lib/render-estatico'
import { Vitrine, type ItemVitrine } from './vitrine'

function item(
  slug: string,
  tipo: ItemVitrine['produto']['tipo'],
  nome: string,
): ItemVitrine {
  return {
    produto: { slug, tipo, nome, resumo: `Resumo de ${nome}`, icone: '', tags: [] },
    fase: 'em-breve',
    lojas: [],
  }
}

describe('Vitrine', () => {
  it('sem produto listado, mostra o estado vazio com link para o autor', () => {
    const raiz = renderEstatico(<Vitrine itens={[]} />)
    const vazio = raiz.querySelector('[data-testid="pilulabs-vazio"]')
    expect(vazio?.textContent).toContain('PiluLabs: produtos da PiluTech. Em breve.')
    expect(vazio?.querySelector('a')?.getAttribute('href')).toBe('/')
    expect(raiz.querySelector('h2')).toBeNull()
  })

  it('agrupa por tipo, na ordem extensões, apps web e CLIs, e pula grupo vazio', () => {
    const raiz = renderEstatico(
      <Vitrine itens={[item('zap', 'cli', 'Zap'), item('botai', 'extensao', 'Botaí')]} />,
    )
    expect([...raiz.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Extensões',
      'CLIs',
    ])
  })

  it('um card por produto, levando à página dele, sem o estado vazio', () => {
    const raiz = renderEstatico(
      <Vitrine
        itens={[item('botai', 'extensao', 'Botaí'), item('outro', 'extensao', 'Outro')]}
      />,
    )
    expect([...raiz.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/pilulabs/botai',
      '/pilulabs/outro',
    ])
    expect(raiz.querySelector('[data-testid="pilulabs-vazio"]')).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest components/pilulabs; echo "exit=$?"`
Expected: FAIL nos 4 arquivos com `Cannot find module './status-produto'` (e os demais), `exit=1`.

- [ ] **Step 3: Implementar os 4 componentes**

Crie `apps/web/components/pilulabs/lojas-ui.ts`:

```ts
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faChrome,
  faEdge,
  faFirefoxBrowser,
  faOpera,
} from '@fortawesome/free-brands-svg-icons'
import type { Loja } from '@/lib/pilulabs'

export const LOJA_UI: Record<Loja, { rotulo: string; icone: IconDefinition }> = {
  chrome: { rotulo: 'Chrome Web Store', icone: faChrome },
  firefox: { rotulo: 'Firefox Add-ons', icone: faFirefoxBrowser },
  edge: { rotulo: 'Microsoft Edge Add-ons', icone: faEdge },
  opera: { rotulo: 'Opera add-ons', icone: faOpera },
}
```

Crie `apps/web/components/pilulabs/status-produto.tsx`:

```tsx
import type { Fase } from '@/lib/pilulabs'
import { cn } from '@/lib/utils'

const ROTULO: Record<Fase, string> = {
  'em-breve': 'Em breve',
  disponivel: 'Disponível',
}

export function StatusProduto({ fase }: { fase: Fase }) {
  const disponivel = fase === 'disponivel'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm',
        disponivel
          ? 'bg-primary text-primary-foreground font-medium'
          : 'border-border text-muted-foreground border',
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          disponivel ? 'bg-primary-foreground' : 'bg-warn',
        )}
        aria-hidden
      />
      {ROTULO[fase]}
    </span>
  )
}
```

Crie `apps/web/components/pilulabs/botoes-loja.tsx`:

```tsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import type { LojaPublicada } from '@/lib/pilulabs'
import { LOJA_UI } from './lojas-ui'

export function BotoesLoja({ lojas }: { lojas: LojaPublicada[] }) {
  if (lojas.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-3" aria-label="Instalar pela loja">
      {lojas.map(({ loja, url }) => (
        <li key={loja}>
          <Button asChild className="gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <FontAwesomeIcon icon={LOJA_UI[loja].icone} className="size-4" />
              {LOJA_UI[loja].rotulo}
            </a>
          </Button>
        </li>
      ))}
    </ul>
  )
}
```

Crie `apps/web/components/pilulabs/produto-card.tsx`:

```tsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Image from 'next/image'
import Link from 'next/link'
import type { Fase, Loja, Produto } from '@/lib/pilulabs'
import { LOJA_UI } from './lojas-ui'
import { StatusProduto } from './status-produto'

type ProdutoCardProps = {
  produto: Pick<Produto, 'slug' | 'nome' | 'resumo' | 'icone' | 'tags'>
  fase: Fase
  lojas: Loja[]
}

export function ProdutoCard({ produto, fase, lojas }: ProdutoCardProps) {
  return (
    <Link
      href={`/pilulabs/${produto.slug}`}
      className="group bg-card border-border hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background flex h-full flex-col gap-4 rounded-lg border p-6 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {produto.icone ? (
            <Image
              src={produto.icone}
              alt=""
              width={44}
              height={44}
              className="rounded-xl"
            />
          ) : null}
          <h3 className="text-lg font-semibold">{produto.nome}</h3>
        </div>
        <StatusProduto fase={fase} />
      </div>
      <p className="text-muted-foreground text-sm">{produto.resumo}</p>
      {produto.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {produto.tags.map((tag) => (
            <li
              key={tag}
              className="border-border rounded-full border px-2.5 py-0.5 font-mono text-xs"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      {lojas.length > 0 ? (
        <ul
          className="text-muted-foreground mt-auto flex gap-3"
          aria-label="Lojas"
        >
          {lojas.map((loja) => (
            <li key={loja}>
              <FontAwesomeIcon icon={LOJA_UI[loja].icone} className="size-4" />
              <span className="sr-only">{LOJA_UI[loja].rotulo}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Link>
  )
}
```

Crie `apps/web/components/pilulabs/vitrine.tsx`:

```tsx
import Link from 'next/link'
import { SectionHeader } from '@/components/section-header'
import type { Fase, Loja, Produto, TipoProduto } from '@/lib/pilulabs'
import { ProdutoCard } from './produto-card'

export type ItemVitrine = {
  produto: Pick<Produto, 'slug' | 'nome' | 'resumo' | 'icone' | 'tags' | 'tipo'>
  fase: Fase
  lojas: Loja[]
}

const GRUPOS: { tipo: TipoProduto; rotulo: string }[] = [
  { tipo: 'extensao', rotulo: 'Extensões' },
  { tipo: 'web', rotulo: 'Apps web' },
  { tipo: 'cli', rotulo: 'CLIs' },
]

export function Vitrine({ itens }: { itens: ItemVitrine[] }) {
  if (itens.length === 0) {
    return (
      <div
        data-testid="pilulabs-vazio"
        className="border-border flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center"
      >
        <p className="font-semibold">PiluLabs: produtos da PiluTech. Em breve.</p>
        <p className="text-muted-foreground text-sm">
          Enquanto isso, conheça{' '}
          <Link href="/" className="text-primary hover:underline">
            o autor
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-12">
      {GRUPOS.map(({ tipo, rotulo }) => {
        const doGrupo = itens.filter((item) => item.produto.tipo === tipo)
        if (doGrupo.length === 0) return null
        return (
          <section key={tipo} className="flex flex-col gap-5">
            <SectionHeader label={rotulo} count={doGrupo.length} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {doGrupo.map((item) => (
                <ProdutoCard
                  key={item.produto.slug}
                  produto={item.produto}
                  fase={item.fase}
                  lojas={item.lojas}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest components/pilulabs; echo "exit=$?"`
Expected: PASS nos 4 arquivos, `exit=0`.

- [ ] **Step 5: Stories (os dados ficam no próprio arquivo, sem importar `@/lib/pilulabs`)**

Crie `apps/web/components/pilulabs/status-produto.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { StatusProduto } from './status-produto'

const meta = {
  title: 'PiluLabs/StatusProduto',
  component: StatusProduto,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof StatusProduto>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: { fase: 'em-breve' } }
export const Disponivel: Story = { args: { fase: 'disponivel' } }
```

Crie `apps/web/components/pilulabs/botoes-loja.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { BotoesLoja } from './botoes-loja'

const meta = {
  title: 'PiluLabs/BotoesLoja',
  component: BotoesLoja,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof BotoesLoja>

export default meta
type Story = StoryObj<typeof meta>

export const Nenhuma: Story = { args: { lojas: [] } }

export const UmaLoja: Story = {
  args: {
    lojas: [
      {
        loja: 'firefox',
        url: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/',
      },
    ],
  },
}

export const AsQuatro: Story = {
  args: {
    lojas: [
      { loja: 'chrome', url: 'https://chromewebstore.google.com/detail/botai/abc' },
      { loja: 'firefox', url: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/' },
      { loja: 'edge', url: 'https://microsoftedge.microsoft.com/addons/detail/botai/xyz' },
      { loja: 'opera', url: 'https://addons.opera.com/pt-br/extensions/details/botai/' },
    ],
  },
}
```

Crie `apps/web/components/pilulabs/produto-card.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { ProdutoCard } from './produto-card'

const BOTAI = {
  slug: 'botai',
  nome: 'Botaí',
  resumo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  icone: '/pilulabs/botai/icone-128.png',
  tags: ['Extensão', 'Formulários', 'QA', 'CPF', 'CEP'],
}

const meta = {
  title: 'PiluLabs/ProdutoCard',
  component: ProdutoCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProdutoCard>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = {
  args: { produto: BOTAI, fase: 'em-breve', lojas: [] },
}

export const Disponivel: Story = {
  args: { produto: BOTAI, fase: 'disponivel', lojas: ['chrome', 'firefox'] },
}

export const SemIcone: Story = {
  args: { produto: { ...BOTAI, icone: '' }, fase: 'em-breve', lojas: [] },
}
```

Crie `apps/web/components/pilulabs/vitrine.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Vitrine, type ItemVitrine } from './vitrine'

const BOTAI: ItemVitrine = {
  produto: {
    slug: 'botai',
    tipo: 'extensao',
    nome: 'Botaí',
    resumo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    icone: '/pilulabs/botai/icone-128.png',
    tags: ['Extensão', 'QA'],
  },
  fase: 'em-breve',
  lojas: [],
}

const meta = {
  title: 'PiluLabs/Vitrine',
  component: Vitrine,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Vitrine>

export default meta
type Story = StoryObj<typeof meta>

export const Vazia: Story = { args: { itens: [] } }

export const ComBotai: Story = { args: { itens: [BOTAI] } }

export const DoisTipos: Story = {
  args: {
    itens: [
      { ...BOTAI, fase: 'disponivel', lojas: ['chrome', 'firefox', 'edge'] },
      {
        produto: {
          slug: 'exemplo-web',
          tipo: 'web',
          nome: 'Exemplo web',
          resumo: 'Um app web de exemplo, só para a story.',
          icone: '',
          tags: ['Web'],
        },
        fase: 'em-breve',
        lojas: [],
      },
    ],
  },
}
```

- [ ] **Step 6: Lint e tipos**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/eslint components/pilulabs; echo "exit=$?"; node_modules/.bin/tsc --noEmit; echo "exit=$?"`
Expected: os dois `exit=0`.

- [ ] **Step 7: Conferir que nenhum componente ou story importa valor de `@/lib/pilulabs`**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && /usr/bin/grep -rn "@/lib/pilulabs" components/pilulabs | /usr/bin/grep -v "\.test\.tsx:"; echo "exit=$?"`
Expected: toda linha listada começa com `import type`. O teste pode importar valor, porque roda no Node. O gate definitivo é o `storybook build` da Task 9.

- [ ] **Step 8: Commit**

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site add apps/web/components/pilulabs && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site commit -m "feat(pilulabs): status do produto, botões de loja, card e vitrine"; echo "exit=$?"
```

---

### Task 4: Galeria de capturas e tabela de atalhos

**Files:**

- Create: `apps/web/components/pilulabs/capturas-galeria.tsx`, `capturas-galeria.test.tsx`, `capturas-galeria.stories.tsx`
- Create: `apps/web/components/pilulabs/atalhos-tabela.tsx`, `atalhos-tabela.test.tsx`, `atalhos-tabela.stories.tsx`

**Interfaces:**

- Consumes:
  - tipos `Captura`, `Loja` e `Sistema` (só `import type`);
  - `ATALHOS`, que só o teste usa;
  - `renderEstatico`.
- Produces:
  - `CapturasGaleria({ capturas }: { capturas: Captura[] })`, que devolve `null` com `[]`;
  - `AtalhosTabela({ atalhos }: { atalhos: Record<Loja, Record<Sistema, string>> })`, com as linhas na ordem Chrome, Edge, Opera, Firefox e as colunas Windows, macOS, Linux.

- [ ] **Step 1: Escrever os testes (falha)**

Crie `apps/web/components/pilulabs/capturas-galeria.test.tsx`:

```tsx
import { renderEstatico } from '@/lib/render-estatico'
import { CapturasGaleria } from './capturas-galeria'

const CAPTURAS = [
  {
    arquivo: '01-pagina-preenchida-escuro.png',
    src: '/pilulabs/botai/capturas/01-pagina-preenchida-escuro.png',
    alt: 'Captura de tela: página preenchida (tema escuro)',
  },
  {
    arquivo: '02-popup-claro.png',
    src: '/pilulabs/botai/capturas/02-popup-claro.png',
    alt: 'Captura de tela: popup (tema claro)',
  },
]

describe('CapturasGaleria', () => {
  it('sem captura não renderiza nada', () => {
    expect(renderEstatico(<CapturasGaleria capturas={[]} />).innerHTML).toBe('')
  })

  it('uma imagem por captura, com o alt, e o link para o PNG inteiro', () => {
    const raiz = renderEstatico(<CapturasGaleria capturas={CAPTURAS} />)
    expect([...raiz.querySelectorAll('img')].map((i) => i.getAttribute('alt'))).toEqual(
      CAPTURAS.map((c) => c.alt),
    )
    expect([...raiz.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(
      CAPTURAS.map((c) => c.src),
    )
  })
})
```

Crie `apps/web/components/pilulabs/atalhos-tabela.test.tsx`:

```tsx
import { ATALHOS } from '@/lib/pilulabs'
import { renderEstatico } from '@/lib/render-estatico'
import { AtalhosTabela } from './atalhos-tabela'

function tabela() {
  return renderEstatico(<AtalhosTabela atalhos={ATALHOS} />)
}

describe('AtalhosTabela', () => {
  it('colunas de navegador, Windows, macOS e Linux', () => {
    expect(
      [...tabela().querySelectorAll('thead th')].map((th) => th.textContent),
    ).toEqual(['Navegador', 'Windows', 'macOS', 'Linux'])
  })

  // É o que a página publica: o Firefox no Linux é a exceção do wxt.config.ts.
  it('uma linha por navegador, com o atalho de cada sistema', () => {
    const linhas = [...tabela().querySelectorAll('tbody tr')].map((tr) => [
      tr.querySelector('th')?.textContent,
      ...[...tr.querySelectorAll('td')].map((td) => td.textContent),
    ])
    expect(linhas).toEqual([
      ['Chrome', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Edge', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Opera', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Firefox', 'Ctrl+Shift+Y', '⌥⇧P', 'Alt+Shift+P'],
    ])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest components/pilulabs/capturas-galeria.test.tsx components/pilulabs/atalhos-tabela.test.tsx; echo "exit=$?"`
Expected: FAIL com `Cannot find module './capturas-galeria'` e `'./atalhos-tabela'`, `exit=1`.

- [ ] **Step 3: Implementar**

Crie `apps/web/components/pilulabs/capturas-galeria.tsx`:

```tsx
import { AspectRatio } from '@piluvitu/ui/aspect-ratio'
import Image from 'next/image'
import type { Captura } from '@/lib/pilulabs'

export function CapturasGaleria({ capturas }: { capturas: Captura[] }) {
  if (capturas.length === 0) return null
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {capturas.map((captura) => (
        <li key={captura.arquivo}>
          <a
            href={captura.src}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border focus-visible:ring-ring block overflow-hidden rounded-lg border outline-none focus-visible:ring-2"
          >
            <AspectRatio ratio={16 / 10}>
              <Image
                src={captura.src}
                alt={captura.alt}
                fill
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-cover"
              />
            </AspectRatio>
          </a>
        </li>
      ))}
    </ul>
  )
}
```

Crie `apps/web/components/pilulabs/atalhos-tabela.tsx`:

```tsx
import type { Loja, Sistema } from '@/lib/pilulabs'

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

type AtalhosTabelaProps = {
  atalhos: Record<Loja, Record<Sistema, string>>
}

export function AtalhosTabela({ atalhos }: AtalhosTabelaProps) {
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Atalho para preencher a página, por navegador e sistema
        </caption>
        <thead className="text-muted-foreground font-mono text-xs uppercase">
          <tr>
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
                  <kbd className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                    {atalhos[loja][sistema]}
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

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest components/pilulabs; echo "exit=$?"`
Expected: PASS nos 6 arquivos de teste de `components/pilulabs`, `exit=0`.

- [ ] **Step 5: Stories**

Crie `apps/web/components/pilulabs/capturas-galeria.stories.tsx`. O ícone faz o papel das capturas, que só chegam na fase 3:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { CapturasGaleria } from './capturas-galeria'

function captura(n: number, tema: 'claro' | 'escuro') {
  return {
    arquivo: `0${n}-popup-${tema}.png`,
    src: '/pilulabs/botai/icone-128.png',
    alt: `Captura de tela: popup (tema ${tema})`,
  }
}

const meta = {
  title: 'PiluLabs/CapturasGaleria',
  component: CapturasGaleria,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CapturasGaleria>

export default meta
type Story = StoryObj<typeof meta>

export const Nenhuma: Story = { args: { capturas: [] } }
export const Uma: Story = { args: { capturas: [captura(1, 'escuro')] } }
export const Tres: Story = {
  args: {
    capturas: [captura(1, 'escuro'), captura(2, 'claro'), captura(3, 'escuro')],
  },
}
```

Crie `apps/web/components/pilulabs/atalhos-tabela.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { AtalhosTabela } from './atalhos-tabela'

const CHROMIUM = { windows: 'Ctrl+Shift+Y', mac: '⌥⇧P', linux: 'Ctrl+Shift+Y' }

const meta = {
  title: 'PiluLabs/AtalhosTabela',
  component: AtalhosTabela,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
} satisfies Meta<typeof AtalhosTabela>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {
  args: {
    atalhos: {
      chrome: CHROMIUM,
      edge: CHROMIUM,
      opera: CHROMIUM,
      firefox: { ...CHROMIUM, linux: 'Alt+Shift+P' },
    },
  },
}
```

- [ ] **Step 6: Lint, tipos e só `import type` nos componentes**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/eslint components/pilulabs; echo "exit=$?"; node_modules/.bin/tsc --noEmit; echo "exit=$?"; /usr/bin/grep -rn "@/lib/pilulabs" components/pilulabs | /usr/bin/grep -v "\.test\.tsx:"`
Expected: os dois `exit=0`, e toda linha do `grep` começa com `import type`.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site add apps/web/components/pilulabs && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site commit -m "feat(pilulabs): galeria de capturas e tabela de atalhos por navegador"; echo "exit=$?"
```

---

### Task 5: Vitrine `/pilulabs` com imagem OG própria

**Files:**

- Create: `apps/web/app/(site)/pilulabs/pilulabs.e2e.ts`
- Create: `apps/web/lib/og-pilulabs-image.tsx`
- Create: `apps/web/app/(site)/pilulabs/layout.tsx`
- Create: `apps/web/app/(site)/pilulabs/page.tsx`
- Create: `apps/web/app/(site)/pilulabs/opengraph-image.tsx`
- Create: `apps/web/app/(site)/pilulabs/twitter-image.tsx`

**Interfaces:**

- Consumes:
  - `getProdutos` (Task 1);
  - `produtosListados`, `fase` e `lojasPublicadas` (Task 1);
  - `metadataDaPagina`, `JsonLd` e `jsonLdVitrine` (Task 2);
  - `Vitrine` e `ItemVitrine` (Task 3);
  - `lerProdutosDoConteudo` (Task 1, no E2E).
- Produces:
  - `lib/og-pilulabs-image.tsx`: `size`, `contentType`, `type DadosOgPiluLabs = { rotulo: string; titulo: string; subtitulo: string; icone?: string }` e `imagemOgPiluLabs(dados: DadosOgPiluLabs): Promise<ImageResponse>`;
  - os helpers do E2E `lerJsonLd(page)`, `caminhoDaMeta(page, seletor)` e `esperarPng(page, caminho)`, que as Tasks 6 e 7 reaproveitam no mesmo arquivo.

- [ ] **Step 1: Escrever o E2E da vitrine (falha)**

Crie `apps/web/app/(site)/pilulabs/pilulabs.e2e.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { lerProdutosDoConteudo } from '../../../lib/pilulabs-conteudo'

// O esperado sai do mesmo YAML que as páginas leem: o teste continua valendo
// quando o dono marcar `listado: true` ou preencher a URL de uma loja.
const produtos = lerProdutosDoConteudo(join(__dirname, '..', '..', '..'))
const listados = produtos.filter((p) => p.listado)

async function lerJsonLd(page: Page): Promise<Record<string, unknown>[]> {
  const textos = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents()
  expect(textos.length).toBeGreaterThan(0)
  return textos.map((texto) => JSON.parse(texto) as Record<string, unknown>)
}

// Em dev o metadataBase é http://localhost:3000, e o servidor do teste é a
// 3333: só o caminho da URL serve para pedir a imagem.
async function caminhoDaMeta(page: Page, seletor: string): Promise<string> {
  const conteudo = await page.locator(seletor).first().getAttribute('content')
  expect(conteudo).toBeTruthy()
  const url = new URL(conteudo as string)
  return url.pathname + url.search
}

async function esperarPng(page: Page, caminho: string): Promise<void> {
  const resposta = await page.request.get(caminho)
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toContain('image/png')
}

test.describe('/pilulabs', () => {
  test('responde com h1, a linha de terminal e JSON-LD de CollectionPage', async ({
    page,
  }) => {
    const resposta = await page.goto('/pilulabs')
    expect(resposta?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { level: 1, name: 'PiluLabs' }),
    ).toBeVisible()
    await expect(page.locator('main')).toContainText('$ ~/pilulabs')
    const [dados] = await lerJsonLd(page)
    expect(dados['@type']).toBe('CollectionPage')
  })

  test('mostra só os produtos listados no YAML, ou o estado vazio', async ({
    page,
  }) => {
    await page.goto('/pilulabs')
    await expect(
      page.getByRole('heading', { level: 1, name: 'PiluLabs' }),
    ).toBeVisible()
    await expect(page.getByTestId('pilulabs-vazio')).toHaveCount(
      listados.length === 0 ? 1 : 0,
    )
    for (const p of produtos) {
      await expect(page.locator(`a[href="/pilulabs/${p.slug}"]`)).toHaveCount(
        p.listado ? 1 : 0,
      )
    }
  })

  test('é indexável e tem og:title e imagens OG próprios', async ({ page }) => {
    await page.goto('/pilulabs')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      'PiluLabs | produtos da PiluTech',
    )
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]'),
    ).toHaveCount(0)
    const og = await caminhoDaMeta(page, 'meta[property="og:image"]')
    expect(og).toContain('/pilulabs/opengraph-image')
    await esperarPng(page, og)
    const twitter = await caminhoDaMeta(page, 'meta[name="twitter:image"]')
    expect(twitter).toContain('/pilulabs/twitter-image')
    await esperarPng(page, twitter)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && /usr/sbin/lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 node_modules/.bin/playwright test --retries=0 pilulabs/pilulabs.e2e.ts; echo "exit=$?"`
Expected: o `lsof` não imprime nada, e os 3 testes falham (`/pilulabs` responde 404). `exit=1`.

- [ ] **Step 3: Módulo da imagem OG compartilhada**

Crie `apps/web/lib/og-pilulabs-image.tsx`:

```tsx
/* eslint-disable @next/next/no-img-element -- ImageResponse (Satori) só suporta <img> */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export type DadosOgPiluLabs = {
  rotulo: string
  titulo: string
  subtitulo: string
  icone?: string
}

async function pngComoDataUrl(caminhoPublico: string): Promise<string | null> {
  try {
    const arquivo = await readFile(join(process.cwd(), 'public', caminhoPublico))
    return `data:image/png;base64,${arquivo.toString('base64')}`
  } catch {
    return null
  }
}

export async function imagemOgPiluLabs({
  rotulo,
  titulo,
  subtitulo,
  icone,
}: DadosOgPiluLabs): Promise<ImageResponse> {
  const iconeSrc = icone ? await pngComoDataUrl(icone) : null
  return new ImageResponse(
    (
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
          {iconeSrc ? (
            <img
              src={iconeSrc}
              width={168}
              height={168}
              alt=""
              style={{ borderRadius: 36 }}
            />
          ) : null}
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
      </div>
    ),
    { ...size },
  )
}
```

- [ ] **Step 4: Layout, página e imagens da vitrine**

Crie `apps/web/app/(site)/pilulabs/layout.tsx`:

```tsx
export default function PiluLabsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <main className="min-h-screen">{children}</main>
}
```

Crie `apps/web/app/(site)/pilulabs/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { PageTopBar } from '@/components/page-top-bar'
import { Vitrine, type ItemVitrine } from '@/components/pilulabs/vitrine'
import {
  fase,
  lojasPublicadas,
  metadataDaPagina,
  produtosListados,
} from '@/lib/pilulabs'
import { jsonLdVitrine } from '@/lib/pilulabs-json-ld'
import { getProdutos } from '@/lib/site-content'
import { getCanonicalSiteUrl } from '@/lib/site-url'

export const metadata: Metadata = metadataDaPagina({
  caminho: '/pilulabs',
  titulo: 'PiluLabs | produtos da PiluTech',
  descricao:
    'Produtos e apps que o Paulo Victor faz e mantém. Powered by PiluTech.',
})

export default async function PiluLabsPage() {
  const listados = produtosListados(await getProdutos())
  const itens: ItemVitrine[] = listados.map((produto) => ({
    produto,
    fase: fase(produto),
    lojas: lojasPublicadas(produto).map(({ loja }) => loja),
  }))

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-8 sm:px-8 xl:py-10">
      <JsonLd dados={jsonLdVitrine(getCanonicalSiteUrl(), listados)} />
      <PageTopBar backHref="/" backLabel="Paulo Victor" />

      <header className="mt-10 mb-12">
        <h1 className="text-4xl font-bold tracking-tight">PiluLabs</h1>
        <p className="text-muted-foreground mt-2">
          Produtos e apps que eu faço e mantenho. Powered by PiluTech.
        </p>
        <p className="mt-4 font-mono text-sm">
          <span className="text-primary">$ ~/pilulabs</span>{' '}
          <span
            className="bg-primary ml-0.5 inline-block h-4 w-2 animate-pulse align-text-bottom"
            aria-hidden
          />
        </p>
      </header>

      <Vitrine itens={itens} />
    </div>
  )
}
```

Crie `apps/web/app/(site)/pilulabs/opengraph-image.tsx`:

```tsx
import { imagemOgPiluLabs } from '@/lib/og-pilulabs-image'

export { size, contentType } from '@/lib/og-pilulabs-image'
export const alt = 'PiluLabs: produtos e apps da PiluTech'
export const runtime = 'nodejs'

export default function Image() {
  return imagemOgPiluLabs({
    rotulo: '$ ~/pilulabs',
    titulo: 'PiluLabs',
    subtitulo: 'Produtos e apps da PiluTech',
  })
}
```

Crie `apps/web/app/(site)/pilulabs/twitter-image.tsx`:

```tsx
export { default, alt, size, contentType } from './opengraph-image'
export const runtime = 'nodejs'
```

- [ ] **Step 5: Rodar o E2E e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && /usr/sbin/lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 node_modules/.bin/playwright test --retries=0 pilulabs/pilulabs.e2e.ts; echo "exit=$?"`
Expected: `3 passed`, `exit=0`. Com o Botaí em `listado: false`, o estado vazio aparece e não há `a[href="/pilulabs/botai"]`.

- [ ] **Step 6: Lint e tipos**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/eslint "app/(site)/pilulabs" lib/og-pilulabs-image.tsx; echo "exit=$?"; node_modules/.bin/tsc --noEmit; echo "exit=$?"`
Expected: os dois `exit=0`.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site add apps/web/lib/og-pilulabs-image.tsx "apps/web/app/(site)/pilulabs" && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site commit -m "feat(pilulabs): vitrine em /pilulabs, com estado vazio, JSON-LD e imagem OG"; echo "exit=$?"
```

---

### Task 6: Página do Botaí (`/pilulabs/botai`)

**Files:**

- Modify: `apps/web/app/(site)/pilulabs/pilulabs.e2e.ts` (imports no topo e bloco novo no fim)
- Create: `apps/web/app/(site)/pilulabs/botai/page.tsx`
- Create: `apps/web/app/(site)/pilulabs/botai/opengraph-image.tsx`
- Create: `apps/web/app/(site)/pilulabs/botai/twitter-image.tsx`

**Interfaces:**

- Consumes:
  - `getProdutos`, `lojasPublicadas`, `fase` e `LOJAS` (Task 1);
  - `listarCapturas`, `ATALHOS`, `metadataDoProduto`, `jsonLdDoProduto` e `JsonLd` (Task 2);
  - `StatusProduto`, `BotoesLoja` e `LOJA_UI` (Task 3);
  - `CapturasGaleria` e `AtalhosTabela` (Task 4);
  - `imagemOgPiluLabs` e os helpers do E2E (Task 5).
- Produces:
  - a rota `/pilulabs/botai`, com o link "Política de privacidade" para `/pilulabs/botai/privacidade`, que nasce na Task 7;
  - o helper `produtoBotai()` no E2E.

- [ ] **Step 1: Escrever o E2E da página do produto (falha)**

No topo de `apps/web/app/(site)/pilulabs/pilulabs.e2e.ts`, troque os imports por:

```ts
import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { LOJA_UI } from '../../../components/pilulabs/lojas-ui'
import { LOJAS, lojasPublicadas } from '../../../lib/pilulabs'
import { lerProdutosDoConteudo } from '../../../lib/pilulabs-conteudo'
```

E acrescente ao fim do arquivo:

```ts
function produtoBotai() {
  const botai = produtos.find((p) => p.slug === 'botai')
  if (!botai) throw new Error('content/produtos/botai/index.yaml sumiu')
  return botai
}

test.describe('/pilulabs/botai', () => {
  const botai = produtoBotai()

  test('responde com h1, o resumo e a tabela de atalhos', async ({ page }) => {
    const resposta = await page.goto('/pilulabs/botai')
    expect(resposta?.status()).toBe(200)
    await expect(
      page.getByRole('heading', { level: 1, name: botai.nome }),
    ).toBeVisible()
    await expect(page.locator('header').first()).toContainText(botai.resumo)
    const firefox = page.getByRole('row', { name: /Firefox/ })
    await expect(firefox.getByRole('cell').nth(2)).toHaveText('Alt+Shift+P')
  })

  test('noindex segue o listado do YAML', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      `${botai.nome} | PiluLabs`,
    )
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]'),
    ).toHaveCount(botai.listado ? 0 : 1)
  })

  test('botões só das lojas publicadas no YAML', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    await expect(
      page.getByRole('heading', { level: 1, name: botai.nome }),
    ).toBeVisible()
    const publicadas = lojasPublicadas(botai)
    for (const loja of LOJAS) {
      const publicada = publicadas.find((l) => l.loja === loja)
      const link = page.getByRole('link', {
        name: LOJA_UI[loja].rotulo,
        exact: true,
      })
      if (publicada) await expect(link).toHaveAttribute('href', publicada.url)
      else await expect(link).toHaveCount(0)
    }
  })

  test('JSON-LD com SoftwareApplication gratuito e a trilha PiluLabs › produto', async ({
    page,
  }) => {
    await page.goto('/pilulabs/botai')
    const [dados] = await lerJsonLd(page)
    const grafo = dados['@graph'] as Record<string, unknown>[]
    const aplicacao = grafo.find((n) => n['@type'] === 'SoftwareApplication')
    expect(aplicacao).toMatchObject({
      name: botai.nome,
      applicationCategory: 'BrowserApplication',
      offers: { price: 0 },
    })
    const urls = lojasPublicadas(botai).map((l) => l.url)
    if (urls.length > 0) expect(aplicacao).toMatchObject({ installUrl: urls })
    else expect(aplicacao).not.toHaveProperty('installUrl')
    expect(grafo.find((n) => n['@type'] === 'BreadcrumbList')).toBeTruthy()
  })

  test('liga para a política de privacidade', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    await expect(
      page.getByRole('link', { name: 'Política de privacidade' }),
    ).toHaveAttribute('href', '/pilulabs/botai/privacidade')
  })

  test('imagens OG do próprio segmento', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    const og = await caminhoDaMeta(page, 'meta[property="og:image"]')
    expect(og).toContain('/pilulabs/botai/opengraph-image')
    await esperarPng(page, og)
    const twitter = await caminhoDaMeta(page, 'meta[name="twitter:image"]')
    expect(twitter).toContain('/pilulabs/botai/twitter-image')
    await esperarPng(page, twitter)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && /usr/sbin/lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 node_modules/.bin/playwright test --retries=0 pilulabs/pilulabs.e2e.ts; echo "exit=$?"`
Expected: os 3 de `/pilulabs` passam e os 6 de `/pilulabs/botai` falham (404). `exit=1`.

- [ ] **Step 3: Implementar a página do Botaí**

Crie `apps/web/app/(site)/pilulabs/botai/page.tsx`:

```tsx
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faAddressBook,
  faArrowRight,
  faBuilding,
  faCode,
  faCreditCard,
  faEnvelope,
  faIdCard,
  faLocationDot,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { PageTopBar } from '@/components/page-top-bar'
import { AtalhosTabela } from '@/components/pilulabs/atalhos-tabela'
import { BotoesLoja } from '@/components/pilulabs/botoes-loja'
import { CapturasGaleria } from '@/components/pilulabs/capturas-galeria'
import { StatusProduto } from '@/components/pilulabs/status-produto'
import { SectionHeader } from '@/components/section-header'
import {
  ATALHOS,
  fase,
  listarCapturas,
  lojasPublicadas,
  metadataDoProduto,
} from '@/lib/pilulabs'
import { jsonLdDoProduto } from '@/lib/pilulabs-json-ld'
import { getProdutos } from '@/lib/site-content'
import { getCanonicalSiteUrl } from '@/lib/site-url'

const SLUG = 'botai'
const CAMINHO = '/pilulabs/botai'
const EMAIL_SUPORTE = 'pilutechinformatica@gmail.com'

const RECURSOS: { titulo: string; texto: string; icone: IconDefinition }[] = [
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

const CUIDADOS = [
  'A caixa de e-mail é pública. O e-mail gerado é do tuamaeaquelaursa.com, e qualquer um que souber o endereço lê as mensagens. Nunca use para conta real.',
  'CPF, CNPJ e celular gerados podem pertencer a alguém de verdade. Use só em localhost e em ambientes de teste.',
  'Iframe de outro domínio (Stripe Elements, Pagar.me) fica de fora: o navegador só libera a página de cima.',
  'Quando a aba navega, o navegador retira o acesso. A página seguinte precisa de um novo gesto, e o atalho resolve.',
]

async function lerProduto() {
  const produtos = await getProdutos()
  return produtos.find((p) => p.slug === SLUG)
}

export async function generateMetadata(): Promise<Metadata> {
  const produto = await lerProduto()
  if (!produto) return {}
  return metadataDoProduto(produto, {
    caminho: CAMINHO,
    titulo: `${produto.nome} | PiluLabs`,
    descricao: produto.resumo,
  })
}

export default async function BotaiPage() {
  const produto = await lerProduto()
  if (!produto) notFound()

  const lojas = lojasPublicadas(produto)
  const capturas = listarCapturas(SLUG)
  const jsonLd = jsonLdDoProduto({
    produto,
    siteUrl: getCanonicalSiteUrl(),
    caminho: CAMINHO,
    capturas,
    detalhes: {
      applicationSubCategory: 'Extensão de navegador',
      operatingSystem: 'Windows, macOS, Linux, ChromeOS',
      softwareRequirements:
        'Chrome, Edge ou Opera com Chromium 123 ou superior, ou Firefox 153 ou superior',
      featureList: RECURSOS.map((r) => `${r.titulo}: ${r.texto}`),
    },
  })

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8 sm:px-8 xl:py-10">
      <JsonLd dados={jsonLd} />
      <PageTopBar backHref="/pilulabs" backLabel="PiluLabs" />

      <header className="border-border mt-10 flex flex-col gap-5 border-b pb-10">
        <p className="text-primary font-mono text-sm">~/pilulabs/{SLUG}</p>
        <div className="flex flex-wrap items-center gap-5">
          {produto.icone ? (
            <Image
              src={produto.icone}
              alt={`Ícone do ${produto.nome}`}
              width={64}
              height={64}
              loading="eager"
              className="rounded-2xl"
            />
          ) : null}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-bold tracking-tight">
                {produto.nome}
              </h1>
              <StatusProduto fase={fase(produto)} />
            </div>
            <p className="text-muted-foreground text-lg text-pretty">
              {produto.resumo}
            </p>
          </div>
        </div>
        <p className="text-muted-foreground font-mono text-xs">
          Extensão para Chrome, Firefox, Edge e Opera · Powered by PiluTech
        </p>
        {lojas.length > 0 ? (
          <BotoesLoja lojas={lojas} />
        ) : (
          <p className="text-muted-foreground">
            Chegando às lojas do Chrome, do Firefox, do Edge e do Opera.
          </p>
        )}
      </header>

      <div className="mt-12 flex flex-col gap-14">
        <section aria-labelledby="nome-heading" className="flex flex-col gap-4">
          <SectionHeader id="nome-heading" label="De onde vem o nome" />
          <p className="text-pretty">
            {produto.nome} vem de “bota aí”, expressão piauiense, e é o que ele
            faz: bota os dados nos campos do formulário. É uma extensão para
            quem desenvolve e testa formulários brasileiros. Ela gera uma pessoa
            de teste falsa e coerente e preenche a página num clique ou num
            atalho.
          </p>
        </section>

        <section
          aria-labelledby="recursos-heading"
          className="flex flex-col gap-5"
        >
          <SectionHeader
            id="recursos-heading"
            label="O que ele bota"
            count={RECURSOS.length}
          />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map((recurso) => (
              <li
                key={recurso.titulo}
                className="bg-card border-border flex flex-col gap-3 rounded-lg border p-5"
              >
                <div className="bg-accent-soft text-primary flex size-10 items-center justify-center rounded-xl">
                  <FontAwesomeIcon icon={recurso.icone} className="size-4" />
                </div>
                <h3 className="font-semibold">{recurso.titulo}</h3>
                <p className="text-muted-foreground text-sm">{recurso.texto}</p>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-sm">
            Funciona com React, Vue, máscaras de campo e sites que buscam o
            endereço pelo CEP.
          </p>
        </section>

        {capturas.length > 0 ? (
          <section
            aria-labelledby="capturas-heading"
            className="flex flex-col gap-5"
          >
            <SectionHeader
              id="capturas-heading"
              label="Capturas"
              count={capturas.length}
            />
            <CapturasGaleria capturas={capturas} />
          </section>
        ) : null}

        <section aria-labelledby="uso-heading" className="flex flex-col gap-5">
          <SectionHeader id="uso-heading" label="Como usar" />
          <ol className="flex list-decimal flex-col gap-2 pl-5">
            <li>
              <strong>A página inteira:</strong> o atalho da tabela abaixo, ou
              clique no ícone do {produto.nome} e em “Preencher esta página”.
            </li>
            <li>
              <strong>Um campo só:</strong> botão direito no campo ›{' '}
              {produto.nome} › Inserir › CPF (ou E-mail, CEP…).
            </li>
            <li>
              <strong>Ver e copiar os dados:</strong> o popup mostra a pessoa
              inteira, e “Nova pessoa” gera outra.
            </li>
          </ol>
          <AtalhosTabela atalhos={ATALHOS} />
          <p className="text-muted-foreground text-sm">
            Se outro programa já usa a tecla, o popup mostra “definir atalho” e
            abre a página de atalhos do navegador.
          </p>
        </section>

        <section
          aria-labelledby="privacidade-heading"
          className="flex flex-col gap-4"
        >
          <SectionHeader id="privacidade-heading" label="Privacidade" />
          <p>
            Nada sai do seu navegador: o {produto.nome} não tem servidor, não
            usa analytics e só guarda a pessoa fictícia que gerou.
          </p>
          <p>
            <Link
              href={`${CAMINHO}/privacidade`}
              className="text-primary inline-flex items-center gap-2 hover:underline"
            >
              Política de privacidade
              <FontAwesomeIcon icon={faArrowRight} className="size-3" />
            </Link>
          </p>
        </section>

        <section
          aria-labelledby="cuidados-heading"
          className="flex flex-col gap-4"
        >
          <SectionHeader id="cuidados-heading" label="Cuidados" />
          <ul className="flex list-disc flex-col gap-2 pl-5">
            {CUIDADOS.map((cuidado) => (
              <li key={cuidado}>{cuidado}</li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="border-border mt-14 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
        <div className="flex flex-col">
          <span className="font-semibold">
            Feito por Paulo Victor Torres Silva
          </span>
          <Link
            href="/pilulabs"
            className="text-muted-foreground hover:text-foreground font-mono text-xs"
          >
            Powered by PiluTech
          </Link>
        </div>
        <div className="flex flex-wrap gap-3">
          {produto.repoLink ? (
            <Button asChild variant="outline" className="gap-2">
              <a href={produto.repoLink} target="_blank" rel="noopener noreferrer">
                <FontAwesomeIcon icon={faCode} className="size-3.5" />
                Código-fonte
              </a>
            </Button>
          ) : null}
          <Button asChild variant="outline" className="gap-2">
            <a href={`mailto:${EMAIL_SUPORTE}`}>
              <FontAwesomeIcon icon={faEnvelope} className="size-3.5" />
              Suporte
            </a>
          </Button>
        </div>
      </footer>
    </div>
  )
}
```

Crie `apps/web/app/(site)/pilulabs/botai/opengraph-image.tsx`:

```tsx
import { imagemOgPiluLabs } from '@/lib/og-pilulabs-image'
import { getProdutos } from '@/lib/site-content'

export { size, contentType } from '@/lib/og-pilulabs-image'
export const alt = 'Botaí, gerador de dados fake para formulários, no PiluLabs'
export const runtime = 'nodejs'

export default async function Image() {
  const produto = (await getProdutos()).find((p) => p.slug === 'botai')
  return imagemOgPiluLabs({
    rotulo: '~/pilulabs/botai',
    titulo: produto?.nome ?? 'Botaí',
    subtitulo: produto?.resumo ?? '',
    icone: produto?.icone || undefined,
  })
}
```

Crie `apps/web/app/(site)/pilulabs/botai/twitter-image.tsx`:

```tsx
export { default, alt, size, contentType } from './opengraph-image'
export const runtime = 'nodejs'
```

- [ ] **Step 4: Rodar o E2E e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && /usr/sbin/lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 node_modules/.bin/playwright test --retries=0 pilulabs/pilulabs.e2e.ts; echo "exit=$?"`
Expected: `9 passed`, `exit=0`. Com o YAML de hoje: há `noindex`, nenhum dos 4 botões de loja aparece, não há `installUrl` e aparece "Chegando às lojas…".

- [ ] **Step 5: Build com gate e conferir que as rotas são estáticas (Review Focus 5)**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/next build; echo "exit=$?"`
Expected: `exit=0`. Na tabela de rotas, `/pilulabs`, `/pilulabs/botai` e as imagens dos dois segmentos aparecem como `○` (Static). As imagens têm um sufixo de hash, porque o segmento está dentro do grupo `(site)`: `/pilulabs/opengraph-image-<hash>`, `/pilulabs/twitter-image-<hash>`, e o mesmo em `/pilulabs/botai/`.

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node ../../scripts/check-tailwind-source.mjs .next; echo "exit=$?"`
Expected: `exit=0`.

Run. As imagens entram porque também leem o ícone de `public/` com `readFile`, e a chave delas no manifesto leva o sufixo `-<hash>`:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node -e '
const { routes } = require("./.next/prerender-manifest.json")
const segmentos = ["/pilulabs", "/pilulabs/botai"]
const chaves = Object.keys(routes)
const imagem = (s, tipo) =>
  chaves.find((k) => new RegExp(`^${s}/${tipo}(-[a-z0-9]+)?$`).test(k)) ?? `${s}/${tipo} (ausente)`
const rotas = segmentos.flatMap((s) => [s, imagem(s, "opengraph-image"), imagem(s, "twitter-image")])
const ruins = rotas.filter((r) => !routes[r] || routes[r].initialRevalidateSeconds !== false)
if (ruins.length) {
  console.error("Rotas PiluLabs que não são estáticas sem revalidate:", ruins.map((r) => [r, routes[r] && routes[r].initialRevalidateSeconds]))
  console.error("Chaves /pilulabs* no manifesto:", chaves.filter((k) => k.startsWith("/pilulabs")).map((k) => [k, routes[k].initialRevalidateSeconds]))
  process.exit(1)
}
console.log("ok:", rotas.length, "rotas estáticas, sem revalidate:", rotas.join(", "))
'; echo "exit=$?"
```

Expected: `ok: 6 rotas estáticas, sem revalidate: /pilulabs, /pilulabs/opengraph-image-<hash>, …` e `exit=0`.

Se falhar, procure na árvore da rota um `revalidate`, um `fetch`, `cookies()` ou `headers()` novos e tire-os. Não afrouxe a checagem: em produção, a rota dinâmica perde as capturas, e a imagem OG perde o ícone, sem erro. A segunda linha do erro lista as chaves `/pilulabs*` do manifesto, para ver qual saiu do estático.

- [ ] **Step 6: Lint e tipos**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/eslint "app/(site)/pilulabs"; echo "exit=$?"; node_modules/.bin/tsc --noEmit; echo "exit=$?"`
Expected: os dois `exit=0`.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site add "apps/web/app/(site)/pilulabs" && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site commit -m "feat(pilulabs): página do Botaí, com noindex enquanto não for listado"; echo "exit=$?"
```

---

### Task 7: Política de privacidade (`/pilulabs/botai/privacidade`)

**Files:**

- Modify: `apps/web/app/(site)/pilulabs/pilulabs.e2e.ts` (bloco novo no fim)
- Create: `apps/web/app/(site)/pilulabs/botai/privacidade/page.tsx`
- Create: `apps/web/app/(site)/pilulabs/botai/privacidade/opengraph-image.tsx`
- Create: `apps/web/app/(site)/pilulabs/botai/privacidade/twitter-image.tsx`

**Interfaces:**

- Consumes:
  - `getProdutos` (Task 1);
  - `metadataDoProduto`, `CONTEXTO_SCHEMA`, `jsonLdBreadcrumb` e `JsonLd` (Task 2);
  - `imagemOgPiluLabs` (Task 5);
  - `produtoBotai()` e os helpers do E2E (Tasks 5 e 6).
- Produces: a rota `/pilulabs/botai/privacidade`, que é a URL de política das 4 lojas.

- [ ] **Step 1: Escrever o E2E da política (falha)**

Acrescente ao fim de `apps/web/app/(site)/pilulabs/pilulabs.e2e.ts`:

```ts
test.describe('/pilulabs/botai/privacidade', () => {
  const botai = produtoBotai()

  test('responde com h1, data, contato e a tabela de permissões', async ({
    page,
  }) => {
    const resposta = await page.goto('/pilulabs/botai/privacidade')
    expect(resposta?.status()).toBe(200)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: `Política de privacidade do ${botai.nome}`,
      }),
    ).toBeVisible()
    await expect(page.locator('time[datetime="2026-10-01"]')).toBeVisible()
    await expect(
      page.locator('a[href="mailto:pilutechinformatica@gmail.com"]').first(),
    ).toBeVisible()
    await expect(page.getByRole('row', { name: /^menus\b/ })).toContainText(
      'Só no Firefox',
    )
  })

  test('noindex igual ao da página do produto', async ({ page }) => {
    await page.goto('/pilulabs/botai/privacidade')
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      `Política de privacidade do ${botai.nome} | PiluLabs`,
    )
    await expect(
      page.locator('meta[name="robots"][content*="noindex"]'),
    ).toHaveCount(botai.listado ? 0 : 1)
  })

  test('a página do produto leva até aqui', async ({ page }) => {
    await page.goto('/pilulabs/botai')
    await page.getByRole('link', { name: 'Política de privacidade' }).click()
    await expect(page).toHaveURL('/pilulabs/botai/privacidade')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Política de privacidade',
    )
  })

  test('JSON-LD com a trilha PiluLabs › produto › política', async ({
    page,
  }) => {
    await page.goto('/pilulabs/botai/privacidade')
    const [dados] = await lerJsonLd(page)
    expect(dados['@type']).toBe('BreadcrumbList')
    const itens = dados.itemListElement as { name: string }[]
    expect(itens.map((i) => i.name)).toEqual([
      'PiluLabs',
      botai.nome,
      'Política de privacidade',
    ])
  })

  // A política é filha da página do produto e declara openGraph: sem arquivo
  // próprio, ela perderia a imagem (mesclagem do Next 16).
  test('imagens OG do próprio segmento', async ({ page }) => {
    await page.goto('/pilulabs/botai/privacidade')
    const og = await caminhoDaMeta(page, 'meta[property="og:image"]')
    expect(og).toContain('/pilulabs/botai/privacidade/opengraph-image')
    await esperarPng(page, og)
    const twitter = await caminhoDaMeta(page, 'meta[name="twitter:image"]')
    expect(twitter).toContain('/pilulabs/botai/privacidade/twitter-image')
    await esperarPng(page, twitter)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && /usr/sbin/lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 node_modules/.bin/playwright test --retries=0 pilulabs/pilulabs.e2e.ts; echo "exit=$?"`
Expected: os 9 anteriores passam e os 5 novos falham (404). `exit=1`.

- [ ] **Step 3: Implementar a política**

Crie `apps/web/app/(site)/pilulabs/botai/privacidade/page.tsx`. Os fatos vêm do código do Botaí (relatório `site-pilulabs` §3.4) e da spec §4 (permissão `menus` e `data_collection_permissions: none` no Firefox):

```tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { PageTopBar } from '@/components/page-top-bar'
import { metadataDoProduto } from '@/lib/pilulabs'
import { CONTEXTO_SCHEMA, jsonLdBreadcrumb } from '@/lib/pilulabs-json-ld'
import { getProdutos } from '@/lib/site-content'
import { getCanonicalSiteUrl } from '@/lib/site-url'

const SLUG = 'botai'
const CAMINHO_PRODUTO = '/pilulabs/botai'
const CAMINHO = '/pilulabs/botai/privacidade'
const EMAIL = 'pilutechinformatica@gmail.com'
// Data em texto pronto: formatar "2026-10-01" em BRT mostraria 30 de setembro.
const ATUALIZADA_EM = { iso: '2026-10-01', texto: '1 de outubro de 2026' }
const HISTORICO =
  'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/web/app/(site)/pilulabs/botai/privacidade/page.tsx'

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

async function lerProduto() {
  const produtos = await getProdutos()
  return produtos.find((p) => p.slug === SLUG)
}

export async function generateMetadata(): Promise<Metadata> {
  const produto = await lerProduto()
  if (!produto) return {}
  return metadataDoProduto(produto, {
    caminho: CAMINHO,
    titulo: `Política de privacidade do ${produto.nome} | PiluLabs`,
    descricao: `Como o ${produto.nome} trata os dados: nada sai do seu navegador.`,
  })
}

export default async function PrivacidadeBotaiPage() {
  const produto = await lerProduto()
  if (!produto) notFound()

  const jsonLd = {
    '@context': CONTEXTO_SCHEMA,
    ...jsonLdBreadcrumb(getCanonicalSiteUrl(), [
      { nome: 'PiluLabs', caminho: '/pilulabs' },
      { nome: produto.nome, caminho: CAMINHO_PRODUTO },
      { nome: 'Política de privacidade', caminho: CAMINHO },
    ]),
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8 sm:px-8 xl:py-10">
      <JsonLd dados={jsonLd} />
      <PageTopBar backHref={CAMINHO_PRODUTO} backLabel={produto.nome} />

      <article className="mt-10">
        <header className="border-border flex flex-col gap-4 border-b pb-8">
          <p className="text-primary font-mono text-sm break-all">
            ~/pilulabs/{SLUG}/privacidade
          </p>
          <h1 className="text-4xl leading-tight font-bold tracking-tight">
            Política de privacidade do {produto.nome}
          </h1>
          <p className="text-muted-foreground font-mono text-xs">
            Última atualização:{' '}
            <time dateTime={ATUALIZADA_EM.iso}>{ATUALIZADA_EM.texto}</time>
          </p>
          <p className="bg-accent-soft border-accent-line rounded-lg border p-4 text-pretty">
            <strong>Em resumo:</strong> o {produto.nome} não coleta nem envia
            dados. Ele só lê os formulários da aba em que você o aciona, no seu
            navegador, e guarda nele a pessoa fictícia que gerou.
          </p>
        </header>

        <div className="prose dark:prose-invert post-prose mt-10 max-w-none">
          <h2>Quem é o responsável</h2>
          <p>
            O {produto.nome} é um produto da PiluTech. Dúvidas, pedidos sobre
            esta política e suporte: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
          </p>

          <h2>O que o {produto.nome} acessa, e quando</h2>
          <ul>
            <li>
              Os campos de formulário da aba em que você aciona a extensão, pelo
              ícone, pelo atalho ou pelo menu do botão direito: o tipo, o nome,
              o rótulo, os atributos e o valor atual de cada campo. É para
              decidir o que escrever em cada um e conferir o que ficou escrito.
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
            Quem libera o acesso é o próprio navegador, só no momento do gesto e
            só para aquela aba. Tudo acontece no seu computador: nada da página
            é guardado nem enviado.
          </p>

          <h2>O que fica guardado</h2>
          <p>
            Só a pessoa fictícia gerada (nome, documentos, endereço, contato,
            empresa e cartão de teste), no armazenamento local da extensão no
            seu navegador (<code>storage.local</code>). Assim você repete o
            mesmo cadastro até pedir outra pessoa. Ela não é sincronizada entre
            dispositivos.
          </p>

          <h2>O que é enviado</h2>
          <p>
            Nada. O {produto.nome} não tem servidor e não faz requisições de
            rede. Também não usa analytics, cookies nem anúncios, e não carrega
            código remoto: todo o código está no pacote publicado nas lojas. Na
            Firefox Add-ons, ele declara que não coleta dados.
          </p>

          <h2>Sites que ele abre, só quando você clica</h2>
          <ul>
            <li>
              <strong>Abrir caixa de entrada</strong> abre{' '}
              <code>{'https://tuamaeaquelaursa.com/<usuário>'}</code>, a caixa
              pública do e-mail fictício gerado. É um serviço de terceiro, e
              qualquer pessoa que souber o endereço lê as mensagens. O{' '}
              {produto.nome} só abre a página e não chama a API do serviço.
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
            alguém de verdade: use o {produto.nome} só em localhost e em
            ambientes de teste.
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
            “Nova pessoa”, no popup, troca a pessoa guardada por outra. Remover
            a extensão apaga o armazenamento local dela.
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
    </div>
  )
}
```

Crie `apps/web/app/(site)/pilulabs/botai/privacidade/opengraph-image.tsx`:

```tsx
import { imagemOgPiluLabs } from '@/lib/og-pilulabs-image'
import { getProdutos } from '@/lib/site-content'

export { size, contentType } from '@/lib/og-pilulabs-image'
export const alt = 'Política de privacidade do Botaí: nada sai do seu navegador'
export const runtime = 'nodejs'

export default async function Image() {
  const produto = (await getProdutos()).find((p) => p.slug === 'botai')
  return imagemOgPiluLabs({
    rotulo: '~/pilulabs/botai/privacidade',
    titulo: 'Política de privacidade',
    subtitulo: `${produto?.nome ?? 'Botaí'}: nada sai do seu navegador`,
    icone: produto?.icone || undefined,
  })
}
```

Crie `apps/web/app/(site)/pilulabs/botai/privacidade/twitter-image.tsx`:

```tsx
export { default, alt, size, contentType } from './opengraph-image'
export const runtime = 'nodejs'
```

- [ ] **Step 4: Rodar o E2E e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && /usr/sbin/lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 node_modules/.bin/playwright test --retries=0 pilulabs/pilulabs.e2e.ts; echo "exit=$?"`
Expected: `14 passed`, `exit=0`.

- [ ] **Step 5: A trava agora tem as duas rotas do Botaí**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/pilulabs-conteudo.test.ts; echo "exit=$?"; /bin/ls "app/(site)/pilulabs/botai/page.tsx" "app/(site)/pilulabs/botai/privacidade/page.tsx"; echo "exit=$?"`
Expected: PASS e `exit=0`, depois os dois caminhos listados e `exit=0`. É o que vai valer quando o dono marcar `listado: true`.

- [ ] **Step 6: Lint e tipos**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/eslint "app/(site)/pilulabs"; echo "exit=$?"; node_modules/.bin/tsc --noEmit; echo "exit=$?"`
Expected: os dois `exit=0`.

- [ ] **Step 7: Commit**

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site add "apps/web/app/(site)/pilulabs" && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site commit -m "feat(pilulabs): política de privacidade do Botaí, com a tabela de permissões"; echo "exit=$?"
```

---

### Task 8: Home: card em Projetos e link `/pilulabs` no rodapé, vindos de `produtos`

**Files:**

- Modify: `apps/web/mocks/projects.ts` (campo `deployLabel?`)
- Modify: `apps/web/components/project-card.tsx` (rótulo e link interno)
- Create: `apps/web/components/project-card.test.tsx`
- Modify: `apps/web/components/project-card.stories.tsx` (story `ProdutoPiluLabs`)
- Modify: `apps/web/components/home-footer.tsx` (prop `mostrarPiluLabs`)
- Create: `apps/web/components/home-footer.test.tsx`
- Modify: `apps/web/components/home-footer.stories.tsx` (story `ComPiluLabs`)
- Modify: `apps/web/lib/pilulabs.ts` (`produtoParaProject`)
- Modify: `apps/web/lib/pilulabs.test.ts`
- Modify: `apps/web/app/(site)/page.tsx`
- Modify: `apps/web/app/(site)/home.e2e.ts`

**Interfaces:**

- Consumes:
  - `getProdutos`, `produtosListados` e `Produto` (Task 1);
  - `renderEstatico` (Task 2);
  - `lerProdutosDoConteudo` (Task 1, no E2E).
- Produces:
  - `Project.deployLabel?: string`;
  - `produtoParaProject(produto: Produto): Project`;
  - `HomeFooter({ name, year?, mostrarPiluLabs? }: { name: string; year?: number; mostrarPiluLabs?: boolean })`.

- [ ] **Step 1: Escrever os testes (falha)**

Acrescente ao fim de `apps/web/lib/pilulabs.test.ts`, e `produtoParaProject` ao import de `./pilulabs` no topo:

```ts
describe('produtoParaProject', () => {
  it('vira um card de Projetos que leva à página do produto', () => {
    expect(
      produtoParaProject(
        produto({
          repoLink:
            'https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai',
        }),
      ),
    ).toEqual({
      id: 'pilulabs-botai',
      projectName: 'Botaí',
      subtitle: 'PiluLabs · Powered by PiluTech',
      projectLogo: '/pilulabs/botai/icone-128.png',
      description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      tags: ['QA'],
      deployLink: '/pilulabs/botai',
      deployLabel: 'Ver no PiluLabs',
      repoLink: 'https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai',
      image: '/pilulabs/botai/icone-128.png',
      altImage: 'BO',
    })
  })

  it('sem ícone, sem imagem', () => {
    expect(produtoParaProject(produto({ icone: '' })).image).toBeUndefined()
  })
})
```

Crie `apps/web/components/project-card.test.tsx`:

```tsx
import { renderEstatico } from '@/lib/render-estatico'
import { ProjectCard } from './project-card'

const BASE = {
  id: 'live-prs',
  projectName: 'Live PRs',
  subtitle: '',
  projectLogo: '/pr-live-dark.svg',
  description: 'Agregador de pull requests.',
  tags: [],
  deployLink: 'https://pr-live.example.com',
  repoLink: '',
  altImage: 'LPR',
}

describe('ProjectCard', () => {
  it('link externo abre em aba nova, com o rótulo Demo', () => {
    const link = renderEstatico(<ProjectCard {...BASE} />).querySelector(
      'a[href="https://pr-live.example.com"]',
    )
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.textContent).toBe('Demo')
  })

  // O card de um produto PiluLabs leva a uma página do próprio site.
  it('link interno fica na mesma aba e usa o deployLabel', () => {
    const link = renderEstatico(
      <ProjectCard
        {...BASE}
        deployLink="/pilulabs/botai"
        deployLabel="Ver no PiluLabs"
      />,
    ).querySelector('a[href="/pilulabs/botai"]')
    expect(link?.hasAttribute('target')).toBe(false)
    expect(link?.textContent).toBe('Ver no PiluLabs')
  })
})
```

Crie `apps/web/components/home-footer.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderEstatico } from '@/lib/render-estatico'
import { HomeFooter } from './home-footer'

function rodape(mostrarPiluLabs?: boolean) {
  return renderEstatico(
    <QueryClientProvider client={new QueryClient()}>
      <HomeFooter
        name="Paulo Victor Torres Silva"
        year={2026}
        mostrarPiluLabs={mostrarPiluLabs}
      />
    </QueryClientProvider>,
  )
}

describe('HomeFooter', () => {
  it('por padrão não mostra /pilulabs', () => {
    expect(rodape().querySelector('a[href="/pilulabs"]')).toBeNull()
  })

  it('sem produto listado, sem /pilulabs', () => {
    expect(rodape(false).querySelector('a[href="/pilulabs"]')).toBeNull()
  })

  it('com produto listado, mostra /pilulabs depois de /tools e /tasks', () => {
    const hrefs = [...rodape(true).querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    )
    expect(hrefs.slice(0, 3)).toEqual(['/tools', '/tasks', '/pilulabs'])
  })
})
```

Em `apps/web/app/(site)/home.e2e.ts`, troque a primeira linha (`import { test, expect } from '@playwright/test'`) por:

```ts
import { test, expect } from '@playwright/test'
import { join } from 'node:path'
import { lerProdutosDoConteudo } from '../../lib/pilulabs-conteudo'

const produtos = lerProdutosDoConteudo(join(__dirname, '..', '..'))
const listados = produtos.filter((p) => p.listado)
```

E acrescente ao fim do arquivo:

```ts
test.describe('PiluLabs na home (segue content/produtos)', () => {
  test('o rodapé só mostra /pilulabs com produto listado', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: '/tools' })).toBeVisible()
    await expect(
      page.getByRole('link', { name: '/pilulabs', exact: true }),
    ).toHaveCount(listados.length > 0 ? 1 : 0)
  })

  test('Projetos só tem card de produto listado', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Projetos' })).toBeVisible()
    for (const p of produtos) {
      await expect(
        page.getByRole('heading', { level: 3, name: p.nome, exact: true }),
      ).toHaveCount(p.listado ? 1 : 0)
    }
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/pilulabs.test.ts components/project-card.test.tsx components/home-footer.test.tsx; echo "exit=$?"`
Expected: FAIL, `exit=1`.

O `ts-jest` só transpila, então as falhas são de runtime:

- `pilulabs.test.ts`: os 2 testes de `produtoParaProject` falham com `TypeError: (0 , _pilulabs.produtoParaProject) is not a function`;
- `project-card.test.tsx`: o teste do link interno falha, porque há `target="_blank"` e o texto é `Demo`. O do link externo já passa, e fica como guarda;
- `home-footer.test.tsx`: o terceiro teste falha, porque os `href` são só `['/tools', '/tasks']`. Os dois primeiros já passam.

E o E2E da home no estado listado. É o vermelho de verdade, porque com `listado: false` os testes novos passariam sem código nenhum:

1. Troque `listado: false` por `listado: true` em `apps/web/content/produtos/botai/index.yaml`.
2. Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && /usr/sbin/lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 node_modules/.bin/playwright test --retries=0 home.e2e.ts; echo "exit=$?"`
   Expected: os 4 testes antigos passam e os 2 de "PiluLabs na home" falham (nenhum link `/pilulabs` no rodapé e nenhum card "Botaí"), `exit=1`.
3. Volte para `listado: false` e confira que não sobrou diff:

   ```bash
   /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site diff --exit-code apps/web/content/produtos/botai/index.yaml; echo "exit=$?"
   ```

   Esperado: `exit=0`.

- [ ] **Step 3: Implementar**

Em `apps/web/mocks/projects.ts`, logo abaixo de `  deployLink: string`, acrescente:

```ts
  deployLabel?: string
```

Em `apps/web/components/project-card.tsx`:

1. Troque o import dos ícones sólidos por:

   ```tsx
   import {
     faArrowRight,
     faArrowUpRightFromSquare,
     faCode,
   } from '@fortawesome/free-solid-svg-icons'
   ```

2. Logo abaixo de `const { className, ...project } = props`, acrescente:

   ```tsx
   const linkInterno = project.deployLink.startsWith('/')
   ```

3. Troque o bloco `{project.deployLink ? ( … ) : null}`, o do botão "Demo", por:

```tsx
        {project.deployLink ? (
          <Button asChild>
            <Link
              href={project.deployLink}
              {...(linkInterno
                ? {}
                : { rel: 'noopener noreferrer', target: '_blank' })}
            >
              <FontAwesomeIcon
                icon={linkInterno ? faArrowRight : faArrowUpRightFromSquare}
                className="size-3.5"
              />
              {project.deployLabel ?? 'Demo'}
            </Link>
          </Button>
        ) : null}
```

Em `apps/web/components/home-footer.tsx`:

1. No tipo `HomeFooterProps`, acrescente `  mostrarPiluLabs?: boolean`.
2. Na assinatura, troque `  year = new Date().getFullYear(),` por:

   ```tsx
     year = new Date().getFullYear(),
     mostrarPiluLabs = false,
   ```

3. Logo depois do `<Link href="/tasks" …>/tasks</Link>`, e antes do comentário `{/* /votação precisa do back …`, acrescente:

```tsx
        {mostrarPiluLabs ? (
          <>
            <span aria-hidden>·</span>
            <Link href="/pilulabs" className={linkCls}>
              /pilulabs
            </Link>
          </>
        ) : null}
```

Em `apps/web/lib/pilulabs.ts`:

1. Acrescente aos imports do topo:

   ```ts
   import type { Project } from '@/mocks/projects'
   ```

2. No fim do arquivo:

   ```ts
   export function produtoParaProject(produto: Produto): Project {
     return {
       id: `pilulabs-${produto.slug}`,
       projectName: produto.nome,
       subtitle: 'PiluLabs · Powered by PiluTech',
       projectLogo: produto.icone,
       description: produto.resumo,
       tags: produto.tags,
       deployLink: `/pilulabs/${produto.slug}`,
       deployLabel: 'Ver no PiluLabs',
       repoLink: produto.repoLink,
       image: produto.icone || undefined,
       altImage: produto.nome.slice(0, 2).toUpperCase(),
     }
   }
   ```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/jest lib/pilulabs.test.ts components/project-card.test.tsx components/home-footer.test.tsx; echo "exit=$?"`
Expected: PASS nos 3, `exit=0`.

- [ ] **Step 5: Ligar a home aos produtos**

Em `apps/web/app/(site)/page.tsx`:

1. No import de `@/lib/site-content`, acrescente `getProdutos,` (em ordem alfabética, depois de `getCarreiras,`). Logo abaixo desse import, acrescente:

   ```tsx
   import { produtoParaProject, produtosListados } from '@/lib/pilulabs'
   ```

2. No `Promise.all`, acrescente `produtos` ao fim da desestruturação (depois de `blogPosts,`) e `getProdutos()` ao fim do array (depois de `getBlogPosts(),`).
3. Troque `  const projectList: Project[] = projects` por:

   ```tsx
     const listados = produtosListados(produtos)
     const projectList: Project[] = [
       ...projects,
       ...listados.map(produtoParaProject),
     ]
   ```

4. Troque `<HomeFooter name={siteProfile.displayName} />` por:

   ```tsx
           <HomeFooter
             name={siteProfile.displayName}
             mostrarPiluLabs={listados.length > 0}
           />
   ```

- [ ] **Step 6: Stories**

Em `apps/web/components/project-card.stories.tsx`, acrescente ao fim:

```tsx
export const ProdutoPiluLabs: Story = {
  args: {
    id: 'pilulabs-botai',
    projectName: 'Botaí',
    subtitle: 'PiluLabs · Powered by PiluTech',
    projectLogo: '/pilulabs/botai/icone-128.png',
    image: '/pilulabs/botai/icone-128.png',
    description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    tags: ['Extensão', 'Formulários', 'QA', 'CPF', 'CEP'],
    deployLink: '/pilulabs/botai',
    deployLabel: 'Ver no PiluLabs',
    repoLink: 'https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai',
    altImage: 'BO',
  },
}
```

Em `apps/web/components/home-footer.stories.tsx`, acrescente ao fim:

```tsx
export const ComPiluLabs: Story = {
  args: { name: 'Paulo Victor Torres Silva', year: 2026, mostrarPiluLabs: true },
}
```

- [ ] **Step 7: E2E da home nos dois estados do YAML**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && /usr/sbin/lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 node_modules/.bin/playwright test --retries=0 home.e2e.ts; echo "exit=$?"`
Expected: os 6 testes de `home.e2e.ts` passam, inclusive os 4 antigos, com `exit=0`. Com `listado: false`: nenhum `/pilulabs` no rodapé e nenhum card "Botaí".

O caminho listado, que no Step 2 ficou vermelho: troque `listado: false` por `listado: true` em `apps/web/content/produtos/botai/index.yaml` e rode o mesmo comando. Esperado: `exit=0`, agora com 1 link e 1 card. Depois **volte para `listado: false`** e confira:

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site diff --exit-code apps/web/content/produtos/botai/index.yaml; echo "exit=$?"
```

Esperado: `exit=0`, sem diff.

- [ ] **Step 8: Lint e tipos**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/eslint mocks/projects.ts components/project-card.tsx components/project-card.test.tsx components/project-card.stories.tsx components/home-footer.tsx components/home-footer.test.tsx components/home-footer.stories.tsx lib/pilulabs.ts lib/pilulabs.test.ts "app/(site)/page.tsx" "app/(site)/home.e2e.ts"; echo "exit=$?"; node_modules/.bin/tsc --noEmit; echo "exit=$?"`
Expected: os dois `exit=0`.

- [ ] **Step 9: Commit**

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site add apps/web/mocks/projects.ts apps/web/components/project-card.tsx apps/web/components/project-card.test.tsx apps/web/components/project-card.stories.tsx apps/web/components/home-footer.tsx apps/web/components/home-footer.test.tsx apps/web/components/home-footer.stories.tsx apps/web/lib/pilulabs.ts apps/web/lib/pilulabs.test.ts "apps/web/app/(site)/page.tsx" "apps/web/app/(site)/home.e2e.ts" && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site commit -m "feat(home): link /pilulabs no rodapé e card em Projetos só para produto listado"; echo "exit=$?"
```

---

### Task 9: Documentação e verificação final

**Files:**

- Modify: `apps/web/CLAUDE.md` (Content structure, Data flow e a seção nova "PiluLabs")
- Modify: `CLAUDE.md` da raiz (a linha `apps/web` da tabela de workspaces)

**Interfaces:**

- Consumes: tudo das Tasks 1 a 8.
- Produces: a documentação do fluxo, que fica sendo a fonte única de como adicionar e lançar um produto PiluLabs.

- [ ] **Step 1: `apps/web/CLAUDE.md`, a estrutura de conteúdo e o fluxo de dados**

Em `apps/web/CLAUDE.md`, troque a linha:

```markdown
- `content/projects/*/` — project showcase entries
```

por:

```markdown
- `content/projects/*/` — project showcase entries
- `content/produtos/*/` — catálogo PiluLabs (`produtos`): visibilidade e lojas de cada produto PiluTech. A página do produto é TSX (ver _PiluLabs_)
```

E troque `` `getProjects()`, `getVisitCard()`) `` por `` `getProjects()`, `getVisitCard()`, `getProdutos()`) `` na linha 1 de "Data flow".

- [ ] **Step 2: `apps/web/CLAUDE.md`, a seção PiluLabs**

Insira o bloco abaixo **antes** da linha `### Admin unificado (`/admin`)`:

````markdown
### PiluLabs (`/pilulabs`): vitrine dos produtos PiluTech

Vitrine dos produtos que o autor publica pela PiluTech. O primeiro é o Botaí, a extensão de `apps/botai`.

- **Spec:** `docs/superpowers/specs/2026-10-01-botai-multinavegador-design.md` §6.
- **Contrato entre as fases:** `docs/superpowers/plans/2026-10-01-botai-multinavegador-interfaces.md`.
- **Plano:** `docs/superpowers/plans/2026-10-01-botai-fase2-pilulabs-site.md`.

**Rotas:**

| Rota                          | O que é                                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `/pilulabs`                   | Vitrine. Sem produto listado, mostra "PiluLabs: produtos da PiluTech. Em breve."                                                             |
| `/pilulabs/botai`             | Página do produto. É também a `homepage_url` da extensão e a página de suporte nas lojas                                                     |
| `/pilulabs/botai/privacidade` | A URL de política que vai para as 4 lojas. O mesmo texto é colado na AMO                                                                     |

As duas URLs do Botaí são fixas, porque a extensão e as lojas apontam para elas.

- **Modelo híbrido:**
  - A collection Keystatic `produtos` (`content/produtos/<slug>/index.yaml`) guarda só catálogo, visibilidade e lojas: `produtoSlug`, `order`, `nome`, `tipo`, `listado`, `resumo`, `icone`, `tags`, `chromeUrl`, `firefoxUrl`, `edgeUrl`, `operaUrl` e `repoLink`.
  - Não tem `versao`, porque ninguém a atualizaria a cada release.
  - O texto da página e o da política são TSX versionado, uma rota por produto.
  - A leitura é `getProdutos()` em `lib/site-content.ts`.
  - Ainda não há CRUD no `/admin`: URLs de loja e `listado` mudam por PR, no YAML.
- **Trava do modelo híbrido (`lib/pilulabs-conteudo.test.ts`):**
  - lê o YAML direto, pelo `lib/pilulabs-conteudo.ts` e sem o Keystatic, cujo reader exige `server-only` e `draftMode`;
  - exige `app/(site)/pilulabs/<slug>/page.tsx` e `privacidade/page.tsx` para todo produto com `listado: true`;
  - exige também o ícone em `public/`.
- **Visibilidade, que sai dos dados (sem flag manual):**
  - `listado: false`: a página e a política respondem por link, com `robots: { index: false }`. O produto fica fora de `/pilulabs`, do card em Projetos e do link `/pilulabs` no rodapé da home. Campo omitido no YAML conta como `false`.
  - `listado: true` sem loja: "● Em breve".
  - Ao menos uma loja publicada: "● Disponível" e o botão de cada loja publicada.
- **`lib/pilulabs.ts` (lógica pura, testada no Jest):**
  - `Loja` e `lojasPublicadas`: só aceita URL `https:` com o host exato da loja (`chromewebstore.google.com`, `addons.mozilla.org`, `microsoftedge.microsoft.com`, `addons.opera.com`), sempre na ordem chrome, firefox, edge, opera;
  - `fase` e `listarCapturas`;
  - `ATALHOS`, que espelha o `wxt.config.ts` do Botaí. O `apps/web` não importa nada de `apps/botai`: se o atalho mudar lá, muda aqui no mesmo PR;
  - `metadataDaPagina`/`metadataDoProduto` e `produtoParaProject`.

  O JSON-LD fica em `lib/pilulabs-json-ld.ts`, com o componente `<JsonLd>`.

- ⚠️ **As rotas PiluLabs, e as imagens OG delas, têm de continuar estáticas, sem `revalidate`.**
  - **Por quê:** `listarCapturas` lê `public/pilulabs/<slug>/capturas/*.png` com `fs`, no build, e `lib/og-pilulabs-image.tsx` lê o ícone de `public/` com `readFile`. Na Vercel, `public/` vai para a CDN e não para o lambda. Se a rota virar ISR ou dinâmica (um `revalidate`, um `fetch` com cache de tempo, `cookies()`), a revalidação roda sem a pasta: as capturas somem da página, e o ícone some da imagem OG, sem erro nenhum.
  - **Como conferir, depois do `next build`, em `apps/web`:**

    ```bash
    node -e 'const { routes } = require("./.next/prerender-manifest.json"); const ks = Object.keys(routes); for (const s of ["/pilulabs", "/pilulabs/botai", "/pilulabs/botai/privacidade"]) for (const r of [s, ...["opengraph-image", "twitter-image"].map((t) => ks.find((k) => new RegExp(`^${s}/${t}(-[a-z0-9]+)?$`).test(k)) || `${s}/${t}`)]) console.log(r, routes[r] ? routes[r].initialRevalidateSeconds : "NÃO ESTÁTICA")'
    ```

    As nove linhas têm de terminar em `false`. A chave das imagens tem sufixo de hash (`/pilulabs/opengraph-image-<hash>`), porque o segmento está dentro do grupo `(site)`.

- **Ícone e capturas, que vêm do `apps/botai` (fase 3 da spec):**
  - `public/pilulabs/botai/icone-128.png` e `public/pilulabs/botai/capturas/<NN>-<nome>.png` são gerados por `make capturas-botai`, no `apps/botai`, e versionados. Não edite esses PNG à mão;
  - enquanto a fase 3 não chega à `main`, o ícone é uma cópia do `apps/botai/public/icon/128.png` e não há capturas. No conflito add/add do ícone, fica o da fase 3 (contrato, "Integração na `main`");
  - a página as descobre no build, em ordem natural do `NN`, e só PNG;
  - o `alt` sai do nome do arquivo: o mapa `ROTULOS_CAPTURA` devolve o acento (`pagina` → `página`) e o tema (`-claro`/`-escuro`).

  PNG novo na `main` aparece na página sem mudar código. Nome com palavra acentuada nova pede uma entrada no mapa.

- ⚠️ **SEO: `openGraph` é substituído inteiro, e a imagem é por segmento.**
  - **A armadilha:** no Next 16 a mesclagem é rasa. A página que declara `openGraph` perde `locale` e `siteName` do layout, por isso `metadataDaPagina` repete tudo. Ela também só ganha a imagem do `opengraph-image.tsx` do próprio segmento.
  - **Por isso:** cada uma das 3 rotas tem `opengraph-image.tsx` e `twitter-image.tsx` (o módulo é `lib/og-pilulabs-image.tsx`). Isso vale inclusive para a política, que é filha da página do produto.
  - **O que o E2E confere:** o `og:title` e que cada `og:image`/`twitter:image` responde PNG.
- **JSON-LD:**
  - `SoftwareApplication`, com `BrowserApplication`, `price: 0` e `installUrl` só das lojas publicadas;
  - sem `aggregateRating`, porque o Google proíbe copiar nota das lojas, e sem `softwareVersion`;
  - `BreadcrumbList`;
  - `CollectionPage` em `/pilulabs`;
  - `serializarJsonLd` troca `<` por `<`, para um texto do YAML com `</script>` não fechar a tag.
- **Componentes (`components/pilulabs/`, todos com story e teste):**
  - `StatusProduto`;
  - `BotoesLoja`: botões do DS com ícone Font Awesome, nunca os badges oficiais;
  - `ProdutoCard`;
  - `Vitrine`, que agrupa por `tipo`;
  - `CapturasGaleria`;
  - `AtalhosTabela`.

  ⚠️ Componentes e stories só fazem `import type` de `@/lib/pilulabs`: o módulo importa `node:fs`, que quebra o bundle do Storybook e o do cliente. Dado de runtime, como `ATALHOS`, chega por prop, vindo da página.

- **Home:**
  - os produtos listados viram cards em Projetos, via `produtoParaProject`;
  - o botão é "Ver no PiluLabs", na mesma aba: o `ProjectCard` trata um `deployLink` que começa com `/` como link interno, e `deployLabel` troca o "Demo";
  - o `HomeFooter` recebe `mostrarPiluLabs`.
- **Testes:**
  - **Jest de componente:** usa `renderToStaticMarkup`, via `lib/render-estatico.ts`, sem Testing Library e sem dependência nova. Componente com TanStack Query vai embrulhado num `QueryClientProvider` (ver `home-footer.test.tsx`).
  - ⚠️ **O `ts-jest` daqui só transpila:** um teste com tipo errado ou com export inexistente roda e falha em runtime (`… is not a function`), sem erro de TypeScript. O tipo só é checado pelo `tsc --noEmit`.
  - ⚠️ **O filtro do Playwright é uma regex:** `playwright test "app/(site)/pilulabs/pilulabs.e2e.ts"` não casa nada (os parênteses viram grupo) e sai com `No tests found` e `exit=1`, o que parece um vermelho de TDD. Use `playwright test pilulabs/pilulabs.e2e.ts`. O `prettier --check` tem a mesma armadilha com glob: passe a pasta `"app/(site)/pilulabs"`.
  - **E2E (`app/(site)/pilulabs/pilulabs.e2e.ts` e `home.e2e.ts`):** deriva o esperado do YAML com `lerProdutosDoConteudo`, e por isso continua valendo quando o dono muda `listado` ou uma URL de loja.
  - ⚠️ **Porta 3333:** antes do Playwright, ela tem de estar livre (`make stop`). Com `reuseExistingServer`, um `next dev` de outro worktree responderia no lugar, e o teste rodaria contra o código errado. Rode com `CI=1`, que faz o Playwright subir o próprio servidor e falhar se a porta estiver ocupada.
- **Novo produto:**
  1. `content/produtos/<slug>/index.yaml` com `listado: false`;
  2. o ícone em `public/pilulabs/<slug>/`;
  3. `app/(site)/pilulabs/<slug>/{page,opengraph-image,twitter-image}.tsx`, e o mesmo em `privacidade/`;
  4. `listado: true` só depois de a página estar pronta.
- **Lançar:**
  - preencher as URLs das lojas aprovadas e `listado: true` no YAML, por PR;
  - Edge e Opera entram quando aprovarem.
- **Fora desta fatia:**
  - `sitemap.ts`/`robots.ts` do site inteiro, que vão para a fatia de SEO global;
  - o CRUD de `produtos` no `/admin`.
````

- [ ] **Step 3: `CLAUDE.md` da raiz**

Na tabela de workspaces de `/Users/piluvitu/WWW/PiluVitu-Dev-site/CLAUDE.md`, na linha do `apps/web`, troque `` `/tasks`, `/tools`, `/admin`, `` por `` `/tasks`, `/tools`, `/pilulabs`, `/admin`, ``. O `prettier` do pre-commit realinha a tabela.

- [ ] **Step 4: Lint, tipos e Jest completos**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/eslint .; echo "exit=$?"; node_modules/.bin/tsc --noEmit; echo "exit=$?"; node_modules/.bin/jest; echo "exit=$?"`
Expected: os três `exit=0`. No Jest, nenhum arquivo falha, e os testes novos aparecem na lista: `lib/pilulabs*`, `lib/json-ld`, `components/json-ld`, `components/pilulabs/*`, `project-card` e `home-footer`.

Falha conhecida de fora desta fatia: `lib/admin/token-cookie.test.ts › returns null for a tampered cookie` cai em cerca de 1 rodada a cada 64, porque o teste troca o penúltimo caractere por `A`/`B` e às vezes ele já é esse. Se só ela falhar, rode `node_modules/.bin/jest lib/admin/token-cookie.test.ts; echo "exit=$?"` de novo e registre no resumo final. Não mexa nesse teste aqui.

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/prettier --check "app/(site)/pilulabs" components/pilulabs "lib/pilulabs*.ts" lib/json-ld.ts lib/json-ld.test.ts lib/render-estatico.ts lib/og-pilulabs-image.tsx "components/json-ld*.tsx" "components/project-card*.tsx" "components/home-footer*.tsx" "app/(site)/page.tsx" "app/(site)/home.e2e.ts" keystatic.config.ts lib/site-content.ts mocks/projects.ts CLAUDE.md ../../CLAUDE.md; echo "exit=$?"`
Expected: `All matched files use Prettier code style!` e `exit=0`. Se não, rode o mesmo comando com `--write` e inclua os arquivos no commit do Step 9.

- [ ] **Step 5: Build com gate e as três rotas estáticas**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/next build; echo "exit=$?"; node ../../scripts/check-tailwind-source.mjs .next; echo "exit=$?"`
Expected: os dois `exit=0`. As rotas `/pilulabs`, `/pilulabs/botai` e `/pilulabs/botai/privacidade`, e as `opengraph-image-<hash>`/`twitter-image-<hash>` de cada uma, aparecem como `○` (Static).

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node -e '
const { routes } = require("./.next/prerender-manifest.json")
const segmentos = ["/pilulabs", "/pilulabs/botai", "/pilulabs/botai/privacidade"]
const chaves = Object.keys(routes)
const imagem = (s, tipo) =>
  chaves.find((k) => new RegExp(`^${s}/${tipo}(-[a-z0-9]+)?$`).test(k)) ?? `${s}/${tipo} (ausente)`
const rotas = segmentos.flatMap((s) => [s, imagem(s, "opengraph-image"), imagem(s, "twitter-image")])
const ruins = rotas.filter((r) => !routes[r] || routes[r].initialRevalidateSeconds !== false)
if (ruins.length) {
  console.error("Rotas PiluLabs que não são estáticas sem revalidate:", ruins.map((r) => [r, routes[r] && routes[r].initialRevalidateSeconds]))
  console.error("Chaves /pilulabs* no manifesto:", chaves.filter((k) => k.startsWith("/pilulabs")).map((k) => [k, routes[k].initialRevalidateSeconds]))
  process.exit(1)
}
console.log("ok:", rotas.length, "rotas estáticas, sem revalidate:", rotas.join(", "))
'; echo "exit=$?"
```

Expected: `ok: 9 rotas estáticas, sem revalidate: …` e `exit=0`.

Se falhar, procure na árvore da rota um `revalidate`, um `fetch`, `cookies()` ou `headers()` novos e tire-os. Não afrouxe a checagem: em produção, a rota dinâmica perde as capturas, e a imagem OG perde o ícone, sem erro. A segunda linha do erro lista as chaves `/pilulabs*` do manifesto, para ver qual saiu do estático.

- [ ] **Step 6: As stories compilam**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && node_modules/.bin/storybook build --quiet -o "$(/usr/bin/mktemp -d)"; echo "exit=$?"`
Expected: `exit=0`. A saída vai para uma pasta temporária, porque `apps/web/storybook-static` não está no `.gitignore`. Um `UnhandledSchemeError` com `node:fs` quer dizer que um componente ou uma story importou valor de `@/lib/pilulabs`: troque por `import type` e passe o dado por prop.

- [ ] **Step 7: E2E completo do web**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && /usr/sbin/lsof -nP -iTCP:3333 -sTCP:LISTEN; CI=1 node_modules/.bin/playwright test --retries=0; echo "exit=$?"`
Expected: `exit=0`, inclusive os 14 testes de `pilulabs.e2e.ts` e os de `home.e2e.ts`.

Se algum teste de fora de PiluLabs e da home falhar, rode-o sozinho mais uma vez. Se continuar falhando:

- confira que nada que ele usa mudou, com `/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site diff --stat origin/main...HEAD`;
- registre no resumo final que a falha já existia.

Falha em `pilulabs.e2e.ts` ou em `home.e2e.ts` nunca fecha esta tarefa.

- [ ] **Step 8: Olhar as três imagens OG**

As imagens já saíram prontas do build do Step 5, em `.next/server/app/pilulabs/**/opengraph-image-<hash>.body`, e não há servidor a subir. A rota é `/pilulabs/opengraph-image-<hash>`, e não `/pilulabs/opengraph-image`, porque o hash vem do grupo `(site)`. Por isso o E2E tira o caminho da `<meta property="og:image">` em vez de montá-lo.

1. Copie as três para uma pasta temporária, como PNG:

   ```bash
   cd /Users/piluvitu/WWW/PiluVitu-Dev-site/apps/web && D=$(/usr/bin/mktemp -d) && for f in $(/usr/bin/find .next/server/app/pilulabs -name 'opengraph-image-*.body'); do /bin/cp "$f" "$D/$(echo "$f" | /usr/bin/sed 's#^.next/server/app/##; s#/#-#g; s#\.body$#.png#')"; done; /usr/bin/file "$D"/*.png; echo "$D"
   ```

   Expected: 3 linhas `PNG image data, 1200 x 630`. Se a pasta `.next/server/app/pilulabs` não existir, rode de novo o build do Step 5.

2. Abra os 3 PNGs com a ferramenta Read e confira:
   - texto legível, sem estourar a margem;
   - o "í" de "Botaí" e o "ç" de "Política";
   - o ícone presente nas duas do Botaí.

Se o layout quebrar, ajuste `lib/og-pilulabs-image.tsx` (`fontSize` e `gap`) e repita os Steps 5 a 8.

- [ ] **Step 9: Commit**

```bash
/usr/bin/cmp /Users/piluvitu/WWW/PiluVitu-Dev-site/docs/superpowers/plans/2026-10-01-botai-multinavegador-interfaces.md /Users/piluvitu/WWW/PiluVitu-Dev/docs/superpowers/plans/2026-10-01-botai-multinavegador-interfaces.md; echo "exit=$?"; /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site add apps/web/CLAUDE.md CLAUDE.md docs/superpowers/plans/2026-10-01-botai-fase2-pilulabs-site.md docs/superpowers/plans/2026-10-01-botai-multinavegador-interfaces.md && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site commit -m "docs(web): seção PiluLabs no CLAUDE.md, com rotas, visibilidade e armadilhas, o plano da fase 2 e o contrato revisado"; echo "exit=$?"; /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site status --porcelain; echo "exit=$?"; /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site log --oneline origin/main..HEAD
```

O plano entra neste commit porque o `apps/web/CLAUDE.md` aponta para ele. Se ele já tiver sido commitado antes da execução, o `git add` só leva as caixas marcadas. O contrato entra junto e tem de ser byte a byte o da worktree principal (o `cmp` dá `exit=0`; senão, pare e pergunte qual vale): as duas branches o commitam, e só iguais elas se integram sem conflito.

Expected:

- `status` vazio;
- o `log` com o commit de docs da spec e os 9 commits deste plano, mais um se o plano tiver sido commitado à parte antes da Task 1.

Não faça push.

---

## Checklist do dono (fora do código; nenhum passo exige credencial de loja)

1. **PR:** abrir o PR de `feat/pilulabs-site` para a `main`. É ele que dispara o deploy na Vercel depois do merge.
   - Se a `feat/botai-multinavegador` (fases 1 e 3) chegar à `main` antes, rebase (`/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site fetch origin && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev-site rebase origin/main`) com os conflitos do contrato, "Integração na `main`": no `apps/web/public/pilulabs/botai/icone-128.png` (add/add), fica o da `main`, com a margem da fase 3 (`git checkout --ours` durante o rebase); na tabela de workspaces do `CLAUDE.md` da raiz, refaça o `/pilulabs` na linha do `apps/web` sobre a tabela realinhada da `main` e rode o prettier no arquivo. As capturas da fase 3 já estarão em `public/pilulabs/botai/capturas/` e aparecem na página sem mudar código. O job `botai` do `ci.yml` (`loja/imagens.test.ts`) reprova o PR se o ícone da fase 2 sobrescrever o da fase 3.
2. **Depois do deploy:**
   - `/usr/bin/curl -sI https://piluvitu.com.br/pilulabs/botai` e o mesmo para `/privacidade`: os dois respondem `200`;
   - `/usr/bin/curl -s https://piluvitu.com.br/pilulabs/botai | /usr/bin/grep -o '<meta name="robots"[^>]*>'` mostra `noindex`.
3. **`pilutech.com.br` (spec §7.1), para o "Powered by PiluTech" do popup não cair num domínio morto:**
   1. registro `A @ 192.0.2.1` proxiado (nuvem laranja), e o mesmo para `www`;
   2. Single Redirect 308 para `https://piluvitu.com.br/pilulabs`;
   3. conferir com `curl -I https://pilutech.com.br`.
4. **Razão social e CNPJ na política:** decidir com o contador, junto com o cadastro de Trader da Chrome Web Store. Se entrarem, é um PR que muda `privacidade/page.tsx` e o `ATUALIZADA_EM`.
5. **Link "Código-fonte":** o `repoLink` (`…/tree/main/apps/botai`) já resolve, porque o #45 está na `main` (`4caeca8`). Ele mostra o código da `main`, que só ganha o Firefox e o Opera quando a fase 1 entrar.
6. **Lançamento (spec §7.5):** quando as lojas aprovarem, preencher as URLs e `listado: true` no YAML, por PR. A home, o rodapé e `/pilulabs` passam a mostrar o Botaí sem mudar código.
