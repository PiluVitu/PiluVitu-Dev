# Botaí, fase 1: multinavegador (Chrome, Edge, Opera, Firefox) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O mesmo código do Botaí gera três builds verificados (Chrome e Edge, Firefox MV3, Opera sem minificar) e um zip de fontes que o revisor da AMO reconstrói byte a byte, com o Firefox preenchendo a página de teste igual ao Chrome ("21 de 23").

**Architecture:** O `wxt.config.ts` ramifica o manifesto e o Vite por `browser`. O código de produção escolhe o ramo do Firefox e do Opera pelas constantes de compilação `import.meta.env.FIREFOX`/`OPERA`, e separa Edge e Opera instalado pela Chrome Web Store do Chrome em tempo de execução, por `navigator.userAgentData.brands` (`src/lib/navegador.ts`). Os adaptadores ficam onde a API diverge: raiz sombra fechada (`dom.ts`), `InjectionResult.error` (`acoes.ts`), páginas proibidas (`paginas.ts`), contexto `password` (`menus.ts`), alvo do Inserir (`inserir.ts`) e página de atalhos e textos do 1e (`App.tsx`, `pagina-proibida.tsx`). O empacotamento é `wxt zip` dos três navegadores com `sourcesRoot` na raiz do monorepo; um script único (`apps/botai/scripts/reproduzir-fontes.sh`) reproduz o pacote do Firefox a partir das fontes, localmente no Docker `node:24.14.0` e no CI (job `pacotes` do `botai-release.yml`).

**Tech Stack:** WXT 0.21.4 (Vite 7) · React 19 + `@piluvitu/ui` · Vitest 4 (`WxtVitest` + `fakeBrowser`) + Testing Library + jsdom · Storybook 10.3.1 (react-vite, porta 6018) · Playwright 1.59.1 (`channel: 'chromium'`) · web-ext 10.7.0 (addons-linter da AMO) · GitHub Actions · Docker `node:24.14.0` · pnpm 11.1.1.

**Spec:** `docs/superpowers/specs/2026-10-01-botai-multinavegador-design.md` (esta fase é a §9.1; as regras vêm das §2, §4 e §5). Contrato de nomes entre as fases (OBRIGATÓRIO, nada aqui o renomeia): `docs/superpowers/plans/2026-10-01-botai-multinavegador-interfaces.md`. Pesquisa com os rascunhos testados: `docs/superpowers/research/2026-10-01-botai-multinavegador/` (`firefox-opera.md`, `publicacao.md`, `critica.md`; `site-pilulabs.md` é da fase 2). Regras do app: `apps/botai/CLAUDE.md`. Quando um passo diz "portado do rascunho", o trecho veio do `proposta.diff`, do `rascunhos/mudancas-botai.diff` ou do rascunho do `botai-release.yml` citados nos relatórios, já com as correções da crítica (§2 e §4 do `critica.md`).

---

## Pré-requisitos e convenções de execução

- **Branch e worktree:** `feat/botai-multinavegador` em `/Users/piluvitu/WWW/PiluVitu-Dev`, empilhada sobre a `feat/extensao-dados-teste` (PR #45). Confira antes da Task 1:

  ```bash
  cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git branch --show-current && /usr/bin/git status --short -- . ':(exclude)docs/superpowers/plans' | /usr/bin/wc -l && /bin/ls apps/botai/wxt.config.ts apps/botai/src/lib/paginas.ts apps/botai/src/components/pagina-proibida.tsx; echo "exit=$?"
  cd /Users/piluvitu/WWW/PiluVitu-Dev && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm --filter @pilutech/botai test; echo "exit=$?"
  ```

  Esperado: `feat/botai-multinavegador`, `0` arquivos modificados fora de `docs/superpowers/plans/`, os três caminhos listados e `exit=0` nos dois comandos (Vitest verde antes de começar). Se a branch for outra ou houver mudança pendente fora dos planos, pare. Os planos (este e o da fase 3) podem estar sem commit em `docs/superpowers/plans/`: não bloqueiam, e nenhuma task os inclui no `git add` (todo `git add` deste plano cita os caminhos um por um).

- **Diretório:** todo comando começa com um `cd` **absoluto** na mesma linha (`cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && …` para os do app, `cd /Users/piluvitu/WWW/PiluVitu-Dev && …` para os da raiz). O cwd do agente volta ao padrão entre chamadas.
- **O shell tem um wrapper (`rtk`) que falsifica a saída de `git`, `grep`, `diff`, `find`, `ls`, `pnpm`, `prettier`, `vitest` e `jest`** (medido no repo: `diff` saindo 0 entre arquivos diferentes, `prettier` dizendo "formatted" com exit 1). Por isso:
  - git é sempre `/usr/bin/git`; grep é `/usr/bin/grep`; ls é `/bin/ls`; para comparar use `/usr/bin/cmp` ou `/usr/bin/diff`; zip é `/usr/bin/unzip`; docker é `/usr/local/bin/docker`;
  - pnpm é sempre o binário real **`/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm`** (abreviado nos blocos como `P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P …`, na mesma linha);
  - vitest, tsc, eslint, prettier, wxt, playwright e web-ext rodam por `apps/botai/node_modules/.bin/<binário>`;
  - **todo** comando de verificação termina com `; echo "exit=$?"`, e o que vale é o `exit=`, nunca o texto.
- **Vitest depois de mudar o `wxt.config.ts`:** rode `./node_modules/.bin/wxt prepare` antes do `vitest` direto (os scripts `lint`/`test` já fazem isso).
- **Antes de cada commit** (regra do dono, lint e tipos limpos): `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"` precisa dar `exit=0` (é `wxt prepare && tsc --noEmit && eslint .`).
- **Commits:** convencionais em português, no estilo do repo, com `/usr/bin/git`, na branch atual. **Nunca `git push`, nunca tag.** O pre-commit (`lint-staged`: `eslint --fix` + `prettier --write`) roda sozinho e pode reformatar arquivos; é esperado.
- **Sem devcontainer:** o repo não tem um (ver `apps/botai/CLAUDE.md`, "Testes"); os testes rodam no host, como nos outros workspaces.
- **Nada que exija credencial de loja.** Contas, taxas, secrets e envio são da fase 3 ou do dono (checklist na Task 14).

## Global Constraints

- **Nomes do contrato, sem renomear:** `src/lib/navegador.ts` com `export type Navegador = 'chrome' | 'edge' | 'firefox' | 'opera'` e `export function detectarNavegador(): Navegador` (o Firefox e o Opera por `import.meta.env.FIREFOX`/`OPERA` no build; Edge e Opera da CWS por `navigator.userAgentData.brands` em runtime). Scripts do `apps/botai/package.json`: `zip`, `zip:firefox`, `zip:opera`, `lint:firefox`, `build:firefox`, `build:opera`. Makefile: `zip-botai`. Workflow `.github/workflows/botai-release.yml` com o job `pacotes`. Documentos `apps/botai/SOURCE-CODE-REVIEW.md` (inglês) e `apps/botai/LICENSE` (MIT, © PiluTech).
- **Saídas do WXT:** pastas `.output/chrome-mv3`, `.output/firefox-mv3`, `.output/opera-mv3`; zips `.output/botai-<versão>-chrome.zip`, `-firefox.zip`, `-opera.zip` e `-sources.zip` (`zip.name: 'botai'`).
- **Manifesto:** `manifestVersion: 3` ("sem isso o `-b firefox` gera MV2"); `targetBrowsers: ['chrome', 'firefox', 'opera']` (o Edge usa o build do Chrome); `homepage_url: 'https://piluvitu.com.br/pilulabs/botai'`; no Firefox, `browser_specific_settings.gecko` com `id: 'botai@pilutech.com.br'`, `strict_min_version: '153.0'`, `data_collection_permissions: { required: ['none'] }`, sem `gecko_android`, e a permissão extra `menus`; nos demais, `minimum_chrome_version: '123'`.
- **Atalho:** Chromium `{ default: 'Ctrl+Shift+Y', mac: 'Alt+Shift+P' }`; Firefox o mesmo mais `linux: 'Alt+Shift+P'`.
- **Opera:** `vite.build.minify: false` só no `-b opera` (a loja do Opera recusa código próprio minificado).
- **Zip de fontes:** `sourcesRoot` na raiz do monorepo; `includeSources`: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `scripts/check-tailwind-source.mjs`, `apps/botai/**`, `packages/tools/**`, `packages/ui/**`; `excludeSources`: `apps/botai/.output/**`, `apps/botai/.wxt/**`, `**/storybook-static/**`, `**/test-results/**` (este plano soma `**/playwright-report/**`, pasta local ignorada pelo git que entraria no zip feito na máquina do dono). No `styles.css`, `@source not` para `*.test.*` do app e do `packages/ui`.
- **Gate do design system** (`scripts/check-tailwind-source.mjs`) contra a pasta exata de cada build: `.output/chrome-mv3`, `.output/firefox-mv3`, `.output/opera-mv3`. **Nunca escreva o nome da classe sentinela em nenhum arquivo de `apps/botai`**: referencie `SENTINEL_SELECTOR`.
- **Firefox, comportamentos exigidos:** raiz sombra fechada pelo **atributo** `el.openOrClosedShadowRoot` (não método); `InjectionResult.error` no frame 0 vira `throw` dentro do `try` (vai ao 1e só se casar `erroEhPaginaProibida`, senão sobe), nos demais frames conta como `result: null`, e no `inserirNoCampo` o frame do clique segue a regra do frame 0; recusa `/^Missing host permission for the tab/`; esquemas `moz-extension:`, `resource:`, `opera:`; domínios restritos do Firefox só no Firefox; contexto `'password'` só no Firefox; Inserir por `menus.getTargetElement(info.targetElementId)` com o foco como reserva; "alterar"/"definir atalho" por `commands.openShortcutSettings()` no Firefox e `chrome://extensions/shortcuts` nos Chromium.
- **Textos do 1e e do `file:`:** um por navegador, via prop `navegador` vinda do `detectarNavegador()`. O texto do Chrome não muda.
- **`web-ext`:** devDependency **fixada** em `10.7.0`; `lint:firefox` falha só em erro (os 6 avisos `UNSAFE_VAR_ASSIGNMENT` vêm do react-dom e do Font Awesome).
- **Reprodução das fontes:** pasta limpa, `corepack enable` (pnpm 11.1.1), `pnpm install --frozen-lockfile`, `wxt zip -b firefox`, `cmp` byte a byte; no CI em `ubuntu-24.04` com Node 24.14.0, no job `pacotes`, também em PR que toca `apps/botai/**`, `packages/ui/**`, `packages/tools/**` ou o próprio workflow. O artifact sai de `botai-zips/` (o `upload-artifact` ignora `.output`, pasta oculta).
- **Licença:** MIT (© PiluTech) em `apps/botai`, `packages/tools` e `packages/ui` (este mantém também o "Copyright (c) 2023 shadcn"); `"license": "MIT"` nos três `package.json`; menção no README. Não vale para o resto do repo.
- **`.env.submit`** no `.gitignore`.
- **Fora desta fase:** tag `botai-v*`, GitHub Release, job `lojas`, `versao-botai`/`release-botai`, `apps/botai/loja/`, capturas e a seção "Publicação" (fase 3); Safari, Firefox para Android e `_locales` (fora do escopo); o teste de fumaça com `puppeteer-core` (spec §4: "fica fora das fases, sem dependência nova").
- **Testes (regra do dono, com a exceção documentada do app):** Vitest no `apps/botai` (não Jest); stories para todo componente visual alterado, nos temas claro e escuro; Playwright para os manifestos e o fluxo crítico (só Chromium; Firefox, Edge e Opera ficam no checklist manual). Ramos do Firefox no Vitest com `vi.stubEnv('FIREFOX', 'true')`; o detector com `vi.stubGlobal('navigator', …)`.
- **Lei de comentários do `CLAUDE.md` raiz:** em produção, comentário só para um porquê que o código não mostra, de 1 a 3 linhas; testes podem explicar. Colocation: teste, story e E2E ao lado do fonte. Identificadores em português.

## Review Focus

1. **Chromium de marca desconhecida (Brave, Vivaldi, Arc) ou sem `userAgentData`:** quem instala o zip do Chrome num desses espera o popup funcionando, com os textos do Chrome, e nunca um erro. Teste: `navegador.test.ts` "Chromium de marca desconhecida (Brave) ou sem userAgentData cai no Chrome" (Task 1).
2. **`InjectionResult.error` que não é `Error`** (o Firefox entrega o valor clonado: pode chegar string ou objeto com `message`): a pessoa espera o 1e quando a página recusa e o erro real quando o Botaí quebra, nunca "[object Object]" nem "Nenhum campo". Testes: `acoes.test.ts` "recusa entregue como objeto com message vira 1e" e "erro como string vira Error com a mesma mensagem" (Task 6).
3. **Site cujo host só parece um domínio restrito do Firefox** (subdomínio fora da lista, maiúsculas, porta): a pessoa espera preencher `blog.addons.mozilla.org`, e o 1e em `ADDONS.mozilla.org:8443`. Teste: `paginas.test.ts` "no Firefox, a lista é de hosts exatos" (Task 5).
4. **Campo de senha no Firefox** (`editable` não inclui senha): botão direito numa senha → `Inserir › Senha` escreve no campo clicado. Testes: `menus.test.ts` "no Firefox, todo item soma 'password', porque lá 'editable' não inclui senha" (Task 7) e `inserir.test.ts` "no Firefox, o campo de senha clicado recebe a senha" (Task 8).
5. **Alvo do menu que expirou ou saiu da página** (SPA que re-renderiza o campo entre o clique e a injeção): a pessoa espera o valor no campo em foco, e não um `ok: true` num nó solto. Teste: `inserir.test.ts` "no Firefox, id expirado (null) ou elemento que saiu da página caem no campo em foco" (Task 8).

---

## Estrutura de arquivos

```
apps/botai/
  wxt.config.ts                                   EDITA  manifesto e Vite por navegador (Task 2), bloco zip (Task 10)
  package.json                                    EDITA  scripts build:firefox/build:opera/test:e2e (2), web-ext + lint:firefox (3),
                                                         zip/zip:firefox/zip:opera (10), "license" (11)
  manifesto.e2e.ts                                EDITA  versão do package.json, Firefox, Opera legível (2)
  scripts/reproduzir-fontes.sh                    NOVO   reprodução do pacote do Firefox a partir do zip de fontes (10)
  LICENSE                                         NOVO   MIT © PiluTech (11)
  SOURCE-CODE-REVIEW.md                           NOVO   instruções em inglês para o revisor da AMO e do Opera (11)
  CLAUDE.md, README.md                            EDITA  (13)
  src/styles.css                                  EDITA  @source not dos *.test.* (10)
  src/lib/navegador.ts (+ .test.ts)               NOVO   Navegador, detectarNavegador, PAGINA_DE_ATALHOS (1)
  src/lib/paginas.ts (+ .test.ts)                 EDITA  páginas proibidas e recusas por navegador (5)
  src/lib/menus.ts (+ .test.ts)                   EDITA  contexto 'password' no Firefox (7)
  src/lib/mensagens.ts                            EDITA  alvoId opcional na mensagem inserir (8)
  src/entrypoints/background/acoes.ts (+ .test.ts)    EDITA  exigirSemErro (6), alvoId no Inserir (8)
  src/entrypoints/background/ouvintes.ts (+ .test.ts) EDITA  repassa info.targetElementId (8)
  src/entrypoints/preencher.content/dom.ts (+ dom.test.ts)       EDITA  raiz sombra fechada no Firefox (4)
  src/entrypoints/preencher.content/inserir.ts (+ .test.ts)      EDITA  menus.getTargetElement (8)
  src/entrypoints/preencher.content/api.ts                       EDITA  inserir(pessoa, kind, alvoId?) (8)
  src/entrypoints/popup/use-aba-alvo.ts (+ .test.ts)             EDITA  situacaoDaUrl com o navegador (5)
  src/entrypoints/popup/App.tsx (+ App.test.tsx)                 EDITA  atalhos e 1e por navegador (9)
  src/components/pagina-proibida.tsx (+ .test.tsx, .stories.tsx) EDITA  prop navegador (9)
packages/tools/LICENSE, packages/ui/LICENSE       NOVO   (11)
packages/tools/package.json, packages/ui/package.json  EDITA "license" (11)
packages/tools/CLAUDE.md, packages/ui/CLAUDE.md    EDITA  licença e zip de fontes da AMO (13)
Makefile                                          EDITA  zip-botai e cabeçalho da seção do botai (10)
.gitignore                                        EDITA  .env.submit (10)
pnpm-lock.yaml                                    EDITA  web-ext (3)
.github/workflows/ci.yml                          EDITA  job botai: builds de Firefox e Opera + lint:firefox (12)
.github/workflows/botai-release.yml               NOVO   job pacotes (12)
CLAUDE.md                                         EDITA  (13)
```

`.github/workflows/botai-e2e.yml` **não muda**: ele só chama o `test:e2e`, que a Task 2 faz buildar também o Firefox e o Opera (spec §4).

---

### Task 1: Detector do navegador (`src/lib/navegador.ts`)

**Files:**

- Create: `apps/botai/src/lib/navegador.ts`
- Test: `apps/botai/src/lib/navegador.test.ts`

**Interfaces:**

- Consumes: as constantes de build `import.meta.env.FIREFOX` e `import.meta.env.OPERA` (declaradas como `boolean` em `.wxt/types/globals.d.ts`).
- Produces:
  - `export type Navegador = 'chrome' | 'edge' | 'firefox' | 'opera'` (contrato);
  - `export function detectarNavegador(): Navegador` (contrato);
  - `export const PAGINA_DE_ATALHOS: Record<Exclude<Navegador, 'firefox'>, string>` (usado pelo `App.tsx` na Task 9).

- [ ] **Step 1: Escrever o teste que falha**

`apps/botai/src/lib/navegador.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectarNavegador, PAGINA_DE_ATALHOS } from './navegador'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// No Vitest, import.meta.env.FIREFOX/OPERA ficam undefined e o jsdom não tem userAgentData:
// o padrão é o ramo do zip do Chrome. Cada teste liga só o que precisa.
const comMarcas = (...marcas: string[]) =>
  vi.stubGlobal('navigator', {
    userAgentData: {
      brands: marcas.map((brand) => ({ brand, version: '141' })),
    },
  })

describe('detectarNavegador', () => {
  it('sem constante de build nem userAgentData, é o Chrome', () => {
    expect(detectarNavegador()).toBe('chrome')
  })

  it('o build do Firefox se identifica pela constante, sem olhar o agente', () => {
    vi.stubEnv('FIREFOX', 'true')
    comMarcas('Microsoft Edge', 'Chromium')
    expect(detectarNavegador()).toBe('firefox')
  })

  it('o build do Opera se identifica pela constante', () => {
    vi.stubEnv('OPERA', 'true')
    expect(detectarNavegador()).toBe('opera')
  })

  it.each([
    [['Chromium', 'Microsoft Edge', 'Not.A/Brand'], 'edge'],
    [['Opera', 'Chromium', 'Not=A?Brand'], 'opera'],
    [['Opera GX', 'Chromium'], 'opera'],
    [['Google Chrome', 'Chromium', 'Not;A=Brand'], 'chrome'],
  ] as const)('no zip do Chrome, as marcas %j viram %s', (marcas, esperado) => {
    comMarcas(...marcas)
    expect(detectarNavegador()).toBe(esperado)
  })

  it('Chromium de marca desconhecida (Brave) ou sem userAgentData cai no Chrome', () => {
    comMarcas('Brave', 'Chromium')
    expect(detectarNavegador()).toBe('chrome')
    vi.stubGlobal('navigator', {})
    expect(detectarNavegador()).toBe('chrome')
  })
})

describe('PAGINA_DE_ATALHOS', () => {
  it('os três Chromium abrem a página de atalhos do Chromium', () => {
    expect(PAGINA_DE_ATALHOS).toEqual({
      chrome: 'chrome://extensions/shortcuts',
      edge: 'chrome://extensions/shortcuts',
      opera: 'chrome://extensions/shortcuts',
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run src/lib/navegador.test.ts; echo "exit=$?"`
Expected: FAIL com "Failed to resolve import "./navegador"" e `exit=1`.

- [ ] **Step 3: Implementar**

`apps/botai/src/lib/navegador.ts`:

```ts
export type Navegador = 'chrome' | 'edge' | 'firefox' | 'opera'

interface ComMarcas {
  userAgentData?: { brands: readonly { brand: string }[] }
}

export function detectarNavegador(): Navegador {
  if (import.meta.env.FIREFOX) return 'firefox'
  if (import.meta.env.OPERA) return 'opera'
  // O Edge usa o zip do Chrome, e o Opera também instala pela Chrome Web Store: só o agente sabe quem é.
  const marcas =
    (navigator as Navigator & ComMarcas).userAgentData?.brands ?? []
  if (marcas.some(({ brand }) => brand === 'Microsoft Edge')) return 'edge'
  if (marcas.some(({ brand }) => brand.startsWith('Opera'))) return 'opera'
  return 'chrome'
}

// Edge e Opera: a confirmar no checklist manual do CLAUDE.md (plano B: edge:// e opera://extensions/shortcuts).
export const PAGINA_DE_ATALHOS: Record<
  Exclude<Navegador, 'firefox'>,
  string
> = {
  chrome: 'chrome://extensions/shortcuts',
  edge: 'chrome://extensions/shortcuts',
  opera: 'chrome://extensions/shortcuts',
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run src/lib/navegador.test.ts; echo "exit=$?"`
Expected: PASS, 9 testes, `exit=0`.

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/src/lib/navegador.ts apps/botai/src/lib/navegador.test.ts && /usr/bin/git commit -m "feat(botai): detector do navegador (Chrome, Edge, Opera, Firefox)"; echo "exit=$?"
```

Expected: `exit=0` nos dois.

---

### Task 2: Manifesto e builds por navegador (Firefox MV3, Opera sem minificar)

**Files:**

- Modify: `apps/botai/wxt.config.ts` (arquivo inteiro)
- Modify: `apps/botai/package.json` (bloco `scripts`)
- Test: `apps/botai/manifesto.e2e.ts` (arquivo inteiro)

**Interfaces:**

- Consumes: nada das tasks anteriores.
- Produces:
  - scripts `build:firefox` → `.output/firefox-mv3` e `build:opera` → `.output/opera-mv3`, cada um com o gate do `@source`;
  - `test:e2e` buildando Chrome, Firefox, Opera e o e2e antes do Playwright;
  - manifesto do Firefox com a permissão `menus` (o Inserir da Task 8 depende dela).

- [ ] **Step 1: Escrever o teste que falha**

Substitua `apps/botai/manifesto.e2e.ts` inteiro por:

```ts
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ler = (...partes: string[]) =>
  readFileSync(path.resolve(import.meta.dirname, ...partes), 'utf8')
const manifesto = (pasta: string) =>
  JSON.parse(ler('.output', pasta, 'manifest.json'))
const background = (pasta: string) => ler('.output', pasta, 'background.js')

// Lida do package.json: com a versão fixa aqui, todo PR que só sobe a versão ficaria vermelho.
const VERSAO: string = JSON.parse(ler('package.json')).version
const PAGINA_DO_BOTAI = 'https://piluvitu.com.br/pilulabs/botai'
// Alt+Shift+P é atalho do próprio Chrome no Windows e no Linux ("criar novo grupo
// de abas", kTabGroupAcceleratorMap) e o Chrome não o cede à extensão: lá o padrão
// é Ctrl+Shift+Y.
const ATALHO_CHROMIUM = { default: 'Ctrl+Shift+Y', mac: 'Alt+Shift+P' }

test('manifesto de produção: só activeTab, sem host_permissions nem content_scripts', () => {
  const m = manifesto('chrome-mv3')
  expect('host_permissions' in m).toBe(false)
  expect('content_scripts' in m).toBe(false)
  expect('web_accessible_resources' in m).toBe(false)
  expect('browser_specific_settings' in m).toBe(false)
  expect([...m.permissions].sort()).toEqual([
    'activeTab',
    'contextMenus',
    'scripting',
    'storage',
  ])
  expect(m).toMatchObject({
    manifest_version: 3,
    name: 'Botaí',
    short_name: 'Botaí',
    description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    version: VERSAO,
    homepage_url: PAGINA_DO_BOTAI,
    minimum_chrome_version: '123',
    action: {
      default_title: 'Botaí',
      default_popup: 'popup.html',
    },
    background: { service_worker: 'background.js' },
  })
  expect(m.commands).toEqual({
    'botai-preencher': {
      suggested_key: ATALHO_CHROMIUM,
      description: 'Preencher esta página',
    },
  })
  expect(Object.keys(m.icons).sort()).toEqual(['128', '16', '32', '48'])
})

test('manifesto do Firefox: MV3 com gecko, a permissão menus e Alt+Shift+P no Linux', () => {
  const m = manifesto('firefox-mv3')
  expect('host_permissions' in m).toBe(false)
  expect('content_scripts' in m).toBe(false)
  expect('minimum_chrome_version' in m).toBe(false)
  expect([...m.permissions].sort()).toEqual([
    'activeTab',
    'contextMenus',
    'menus',
    'scripting',
    'storage',
  ])
  // Sem gecko_android: o Botaí é só para o Firefox de desktop.
  expect(m.browser_specific_settings).toEqual({
    gecko: {
      id: 'botai@pilutech.com.br',
      strict_min_version: '153.0',
      data_collection_permissions: { required: ['none'] },
    },
  })
  // No Firefox para Linux, Ctrl+Shift+Y abre os Downloads e o Firefox não cede a tecla.
  expect(m.commands).toEqual({
    'botai-preencher': {
      suggested_key: { ...ATALHO_CHROMIUM, linux: 'Alt+Shift+P' },
      description: 'Preencher esta página',
    },
  })
  expect(m).toMatchObject({
    manifest_version: 3,
    name: 'Botaí',
    version: VERSAO,
    homepage_url: PAGINA_DO_BOTAI,
    action: { default_title: 'Botaí', default_popup: 'popup.html' },
    background: { scripts: ['background.js'] },
  })
  expect('service_worker' in m.background).toBe(false)
})

test('Opera: o manifesto do Chrome, com o código próprio sem minificar (regra da loja do Opera)', () => {
  expect(manifesto('opera-mv3')).toEqual(manifesto('chrome-mv3'))
  const opera = background('opera-mv3')
  expect(opera).toMatch(/\bpreencherPagina\b/)
  expect(opera.split('\n').length).toBeGreaterThan(200)
  // O mesmo nome some no Chrome minificado: é isso que faz as asserções acima medirem a minificação.
  expect(background('chrome-mv3')).not.toMatch(/\bpreencherPagina\b/)
})

test('o build e2e é o único com host_permissions, e só para teste.local', () => {
  expect(manifesto('chrome-mv3-e2e').host_permissions).toEqual([
    'http://teste.local/*',
  ])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run (o build atual do Chrome e o e2e existem; os do Firefox e do Opera não):

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && rm -rf .output/firefox-mv3 .output/opera-mv3 && ./node_modules/.bin/wxt build && ./node_modules/.bin/wxt build --mode e2e && ./node_modules/.bin/playwright test manifesto.e2e.ts; echo "exit=$?"
```

Expected: `exit=1`, com 3 falhas: o Chrome sem `homepage_url`, e `ENOENT` em `.output/firefox-mv3/manifest.json` e em `.output/opera-mv3/manifest.json`. O teste do e2e passa.

- [ ] **Step 3: Implementar o `wxt.config.ts`**

Substitua `apps/botai/wxt.config.ts` inteiro por (portado do rascunho do `firefox-opera.md` §1, com o `homepage_url` e o `minify` condicional da crítica §4; o bloco `zip` entra na Task 10):

```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'wxt'

// No Windows e no Linux o Chrome reserva Alt+Shift+P ("criar novo grupo de abas") e não o cede à extensão.
const ATALHO_CHROMIUM = { default: 'Ctrl+Shift+Y', mac: 'Alt+Shift+P' }
// No Linux o Firefox usa Ctrl+Shift+Y para os Downloads e também não cede a tecla.
const ATALHO_FIREFOX = { ...ATALHO_CHROMIUM, linux: 'Alt+Shift+P' }

export default defineConfig({
  srcDir: 'src',
  imports: false,
  // Sem isto, o -b firefox gera MV2.
  manifestVersion: 3,
  targetBrowsers: ['chrome', 'firefox', 'opera'],
  webExt: { disabled: true },
  dev: { server: { port: 3018 }, reloadCommand: false },
  manifest: ({ browser, mode }) => {
    const firefox = browser === 'firefox'
    return {
      name: 'Botaí',
      short_name: 'Botaí',
      description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      homepage_url: 'https://piluvitu.com.br/pilulabs/botai',
      ...(firefox
        ? {
            browser_specific_settings: {
              gecko: {
                id: 'botai@pilutech.com.br',
                strict_min_version: '153.0',
                data_collection_permissions: { required: ['none'] },
              },
            },
          }
        : { minimum_chrome_version: '123' }),
      permissions: [
        'activeTab',
        'scripting',
        'contextMenus',
        'storage',
        // Libera o menus.getTargetElement no content script do Firefox (o Inserir no campo clicado).
        ...(firefox ? ['menus'] : []),
      ],
      commands: {
        'botai-preencher': {
          suggested_key: firefox ? ATALHO_FIREFOX : ATALHO_CHROMIUM,
          description: 'Preencher esta página',
        },
      },
      ...(mode === 'e2e' && { host_permissions: ['http://teste.local/*'] }),
    }
  },
  vite: ({ browser }) => ({
    plugins: [react(), tailwindcss()],
    // A loja do Opera recusa código próprio minificado.
    ...(browser === 'opera' && { build: { minify: false } }),
  }),
})
```

- [ ] **Step 4: Scripts de build**

No `apps/botai/package.json`, no bloco `scripts`, deixe estas linhas assim (as outras não mudam):

```json
    "build": "wxt build && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3",
    "build:firefox": "wxt build -b firefox && node ../../scripts/check-tailwind-source.mjs .output/firefox-mv3",
    "build:opera": "wxt build -b opera && node ../../scripts/check-tailwind-source.mjs .output/opera-mv3",
    "build:e2e": "wxt build --mode e2e",
```

e

```json
    "test:e2e": "pnpm run build && pnpm run build:firefox && pnpm run build:opera && pnpm run build:e2e && playwright test",
```

- [ ] **Step 5: Rodar e ver passar (os 3 builds com o gate e o manifesto)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run build && $P run build:firefox && $P run build:opera && $P run build:e2e && ./node_modules/.bin/playwright test manifesto.e2e.ts; echo "exit=$?"
```

Expected: os três gates em silêncio (o script só fala quando falha), 4 testes do Playwright passando, `exit=0`. Se o WXT avisar de `data_collection_permissions` ou `gecko.id`, o manifesto do Firefox está errado: confira o Step 3.

- [ ] **Step 6: Sem regressão no Vitest e lint limpo**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run test; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
```

Expected: `exit=0` nos dois.

- [ ] **Step 7: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/wxt.config.ts apps/botai/package.json apps/botai/manifesto.e2e.ts && /usr/bin/git commit -m "feat(botai): builds de Firefox (MV3) e Opera (sem minificar) com manifesto por navegador"; echo "exit=$?"
```

---

### Task 3: `web-ext` fixado e `lint:firefox`

**Files:**

- Modify: `apps/botai/package.json` (devDependency `web-ext` e script `lint:firefox`)
- Modify: `pnpm-lock.yaml` (gerado pelo pnpm)
- Test: o próprio `lint:firefox` sobre `.output/firefox-mv3`

**Interfaces:**

- Consumes: `.output/firefox-mv3` do `build:firefox` (Task 2).
- Produces: script `lint:firefox` = `web-ext lint --source-dir .output/firefox-mv3 --no-config-discovery` (sai 1 só com erro).

- [ ] **Step 1: Ver o script faltar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint:firefox; echo "exit=$?"`
Expected: `ERR_PNPM_NO_SCRIPT  Missing script: lint:firefox` e `exit=1`.

- [ ] **Step 2: Instalar o `web-ext` fixado e conferir a política de dependências**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @pilutech/botai add -D --save-exact web-ext@10.7.0; echo "exit=$?"
```

Expected: `exit=0`. O que já se sabe (medido na pesquisa e no preparo deste plano): a árvore do `web-ext@10.7.0` tem 328 pacotes e **nenhum** com script de instalação (`hasInstallScript` vazio no lock do npm), e a 10.7.0 saiu em 2026-09-21, fora da janela de 24 h do `minimumReleaseAge`. Então:

- se a saída do pnpm trouxer `Ignored build scripts` ou `ERR_PNPM_IGNORED_BUILDS`, **pare**: declare o pacote citado em `allowBuilds` do `pnpm-workspace.yaml` com `false`, prove que `web-ext lint` funciona sem o script (Step 4) e documente a medição num comentário de uma linha, como o do `workerd`;
- se o pnpm recusar a versão por idade, pare e reporte (não deveria acontecer).

Confira:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/grep -n '"web-ext": "10.7.0"' apps/botai/package.json && /usr/bin/git diff --stat -- pnpm-workspace.yaml && apps/botai/node_modules/.bin/web-ext --version; echo "exit=$?"
```

Expected: a linha `"web-ext": "10.7.0",` (sem `^`), nenhum diff no `pnpm-workspace.yaml`, `10.7.0` e `exit=0`.

- [ ] **Step 3: Script `lint:firefox`**

No `apps/botai/package.json`, logo depois de `"lint"`:

```json
    "lint:firefox": "web-ext lint --source-dir .output/firefox-mv3 --no-config-discovery",
```

- [ ] **Step 4: O gate reprova um manifesto ruim e aprova o do Firefox**

Primeiro, a prova de que o validador falha quando deve (o build do Chrome não tem `gecko.id`):

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/web-ext lint --source-dir .output/chrome-mv3 --no-config-discovery; echo "exit=$?"`
Expected: `exit=1`, com `ADDON_ID_REQUIRED` entre os erros.

Depois, o build do Firefox:

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run build:firefox && $P run lint:firefox; echo "exit=$?"`
Expected: `errors 0`, 6 avisos `UNSAFE_VAR_ASSIGNMENT` (todos em `chunks/popup-*.js`) e `exit=0`. Um aviso em `background.js` ou em `content-scripts/preencher.js` é código nosso: pare e investigue.

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/package.json pnpm-lock.yaml && /usr/bin/git commit -m "build(botai): web-ext 10.7.0 fixado e lint:firefox, o validador da AMO"; echo "exit=$?"
```

---

### Task 4: Raiz sombra fechada no Firefox (`dom.ts`)

**Files:**

- Modify: `apps/botai/src/entrypoints/preencher.content/dom.ts:64-69` (`raizSombra`)
- Test: `apps/botai/src/entrypoints/preencher.content/dom.test.ts` (novo `describe` no fim)

**Interfaces:**

- Consumes: nada novo.
- Produces: `campos()` e `elementoEmFoco()` (assinaturas iguais) atravessam a raiz fechada também no Firefox. O Inserir da Task 8 usa o `elementoEmFoco` como reserva.

- [ ] **Step 1: Escrever o teste que falha**

No fim de `apps/botai/src/entrypoints/preencher.content/dom.test.ts` (os imports de `vi`, `beforeEach`, `afterEach`, `fakeBrowser`, `campos` e `elementoEmFoco` já existem):

```ts
describe('campos e elementoEmFoco no Firefox (sem browser.dom)', () => {
  function raizFechadaPeloAtributo(
    host: HTMLElement,
    html: string,
  ): ShadowRoot {
    const raiz = host.attachShadow({ mode: 'closed' })
    raiz.innerHTML = html
    // No Firefox, o content script enxerga a raiz fechada por este atributo do elemento (não é método).
    Object.defineProperty(host, 'openOrClosedShadowRoot', { get: () => raiz })
    return raiz
  }

  beforeEach(() => {
    vi.stubEnv('FIREFOX', 'true')
    Object.assign(fakeBrowser.dom, {
      openOrClosedShadowRoot: () => {
        throw new Error('browser.dom não existe no Firefox')
      },
    })
  })

  afterEach(() => vi.unstubAllEnvs())

  it('campos entra na raiz fechada pelo atributo, sem chamar browser.dom', () => {
    montar('<input name="a"><div id="h"></div><input name="c">')
    raizFechadaPeloAtributo(
      q<HTMLElement>('#h'),
      '<input name="dentro-fechada">',
    )
    expect(
      Array.from(campos(document), (el) => el.getAttribute('name')),
    ).toEqual(['a', 'dentro-fechada', 'c'])
  })

  it('elemento sem o atributo (a página comum) segue sem raiz', () => {
    montar('<input name="a"><div><input name="b"></div>')
    expect(
      Array.from(campos(document), (el) => el.getAttribute('name')),
    ).toEqual(['a', 'b'])
  })

  it('elementoEmFoco atravessa a raiz fechada pelo atributo', () => {
    montar('<div id="h"></div>')
    const raiz = raizFechadaPeloAtributo(
      q<HTMLElement>('#h'),
      '<input name="dentro">',
    )
    const dentro = q('input', raiz)
    dentro.focus()
    expect(elementoEmFoco(document)).toBe(dentro)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/dom.test.ts; echo "exit=$?"`
Expected: os 3 testes novos falham com "browser.dom não existe no Firefox" (é o defeito real: no Firefox 157, `T.dom is undefined` e 0 campos preenchidos); `exit=1`.

- [ ] **Step 3: Implementar (portado do `proposta.diff`, testado no Firefox 157)**

Em `apps/botai/src/entrypoints/preencher.content/dom.ts`, troque a função `raizSombra` por:

```ts
type ComRaizFechada = Element & {
  readonly openOrClosedShadowRoot?: ShadowRoot | null
}

function raizSombra(el: Element): ShadowRoot | null {
  if (el.shadowRoot) return el.shadowRoot
  if (!(el instanceof HTMLElement)) return null
  // O Firefox não tem browser.dom: o equivalente é um atributo do elemento (não método), só em content scripts.
  return import.meta.env.FIREFOX
    ? ((el as ComRaizFechada).openOrClosedShadowRoot ?? null)
    : (browser.dom.openOrClosedShadowRoot(el) ?? null)
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/; echo "exit=$?"`
Expected: PASS em todos os arquivos da pasta (os testes antigos de `dom`, `inserir`, `api`, `preencher` seguem no ramo Chromium), `exit=0`.

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/src/entrypoints/preencher.content/dom.ts apps/botai/src/entrypoints/preencher.content/dom.test.ts && /usr/bin/git commit -m "fix(botai): raiz sombra fechada no Firefox pelo atributo openOrClosedShadowRoot"; echo "exit=$?"
```

---

### Task 5: Páginas proibidas e recusas por navegador (`paginas.ts`)

**Files:**

- Modify: `apps/botai/src/lib/paginas.ts` (arquivo inteiro abaixo)
- Modify: `apps/botai/src/entrypoints/popup/use-aba-alvo.ts:1-3,27`
- Test: `apps/botai/src/lib/paginas.test.ts` (arquivo inteiro abaixo), `apps/botai/src/entrypoints/popup/use-aba-alvo.test.ts` (1 teste novo)

**Interfaces:**

- Consumes: `Navegador` e `detectarNavegador()` (Task 1).
- Produces:
  - `situacaoDaUrl(url: string | undefined, acessoArquivo: boolean, navegador: Navegador): SituacaoPagina` (**3º parâmetro novo, obrigatório**);
  - `erroEhPaginaProibida(mensagem: string): boolean` (assinatura igual; reconhece também `Missing host permission for the tab`, usado pela Task 6).

- [ ] **Step 1: Escrever os testes que falham**

Substitua `apps/botai/src/lib/paginas.test.ts` inteiro por:

```ts
import { describe, expect, it } from 'vitest'
import type { Navegador } from './navegador'
import {
  caminhoDaUrl,
  erroEhPaginaProibida,
  rotuloDoHost,
  situacaoDaUrl,
} from './paginas'

const TODOS: readonly Navegador[] = ['chrome', 'edge', 'opera', 'firefox']

describe('situacaoDaUrl', () => {
  it.each([
    'chrome://settings',
    'chrome-extension://abcdefgh/popup.html',
    'edge://settings',
    'about:blank',
    'view-source:https://exemplo.com.br/',
    'devtools://devtools/bundled/inspector.html',
    'data:text/html,<input>',
    'https://chromewebstore.google.com/detail/xyz',
    'https://chrome.google.com/webstore/detail/xyz',
  ])('%s é proibida no Chrome pela própria URL, sem injetar nada', (url) => {
    expect(situacaoDaUrl(url, true, 'chrome')).toBe('proibida')
  })

  it.each([
    'http://localhost:3000/cadastro',
    'https://staging.app.dev/conta',
    'https://chrome.google.com/search',
  ])('%s é uma página comum', (url) => {
    expect(situacaoDaUrl(url, false, 'chrome')).toBe('ok')
  })

  it('file: depende do acesso a arquivos liberado', () => {
    expect(situacaoDaUrl('file:///Users/eu/form.html', false, 'chrome')).toBe(
      'arquivo-sem-acesso',
    )
    expect(situacaoDaUrl('file:///Users/eu/form.html', true, 'chrome')).toBe(
      'ok',
    )
    expect(situacaoDaUrl('file:///Users/eu/form.html', false, 'firefox')).toBe(
      'arquivo-sem-acesso',
    )
  })

  it('sem URL (aba sem permissão concedida) deixa tentar', () => {
    expect(situacaoDaUrl(undefined, false, 'chrome')).toBe('ok')
  })
})

describe('situacaoDaUrl por navegador', () => {
  it.each([
    'about:addons',
    'moz-extension://0d1e2f3a/popup.html',
    'resource://pdf.js/web/viewer.html',
    'opera://settings',
  ])(
    '%s é proibida em todo navegador (o esquema só existe no próprio)',
    (url) => {
      for (const navegador of TODOS)
        expect(situacaoDaUrl(url, true, navegador)).toBe('proibida')
    },
  )

  it.each([
    ['https://addons.mozilla.org/pt-BR/firefox/addon/x/', 'firefox'],
    ['https://support.mozilla.org/pt-BR/', 'firefox'],
    ['https://accounts.firefox.com/', 'firefox'],
    ['https://microsoftedge.microsoft.com/addons/detail/x', 'edge'],
    ['https://addons.opera.com/pt-br/extensions/', 'opera'],
    ['https://chromewebstore.google.com/detail/xyz', 'chrome'],
    ['https://chromewebstore.google.com/detail/xyz', 'edge'],
    ['https://chromewebstore.google.com/detail/xyz', 'opera'],
  ] as const)('%s é proibida no %s', (url, navegador) => {
    expect(situacaoDaUrl(url, true, navegador)).toBe('proibida')
  })

  it.each([
    ['https://addons.mozilla.org/pt-BR/firefox/', 'chrome'],
    ['https://addons.mozilla.org/pt-BR/firefox/', 'edge'],
    ['https://microsoftedge.microsoft.com/addons/', 'chrome'],
    ['https://addons.opera.com/', 'firefox'],
    ['https://chromewebstore.google.com/detail/xyz', 'firefox'],
  ] as const)(
    '%s é página comum no %s: um site só é protegido pelo próprio navegador',
    (url, navegador) => {
      expect(situacaoDaUrl(url, true, navegador)).toBe('ok')
    },
  )

  it('no Firefox, a lista é de hosts exatos: subdomínio fora dela é página comum; maiúsculas e porta não escapam', () => {
    expect(
      situacaoDaUrl('https://blog.addons.mozilla.org/', true, 'firefox'),
    ).toBe('ok')
    expect(situacaoDaUrl('https://ADDONS.mozilla.org/', true, 'firefox')).toBe(
      'proibida',
    )
    expect(
      situacaoDaUrl('https://addons.mozilla.org:8443/pt-BR/', true, 'firefox'),
    ).toBe('proibida')
  })
})

describe('erroEhPaginaProibida', () => {
  it.each([
    'Cannot access a chrome:// URL',
    'The extensions gallery cannot be scripted.',
    'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
    'Cannot access contents of url "file:///tmp/a.html". Extension manifest must request permission to access this host.',
    'Cannot access a chrome-extension:// URL of different extension',
    'Missing host permission for the tab',
    'Missing host permission for the tab or frames',
  ])('reconhece a recusa do navegador: %s', (mensagem) => {
    expect(erroEhPaginaProibida(mensagem)).toBe(true)
  })

  it.each([
    'No tab with id: 7.',
    'Frame with ID 0 was removed.',
    'Could not establish connection.',
    'TypeError: can\'t access property "openOrClosedShadowRoot", T.dom is undefined',
  ])('não confunde outros erros com página proibida: %s', (mensagem) => {
    expect(erroEhPaginaProibida(mensagem)).toBe(false)
  })
})

describe('rotuloDoHost', () => {
  it.each([
    ['http://localhost:3000/cadastro?x=1', 'localhost:3000'],
    ['https://staging.app.dev/conta', 'staging.app.dev'],
    ['chrome://settings/passwords', 'chrome://settings'],
    ['about:blank', 'about:blank'],
    ['file:///Users/eu/form.html', 'arquivo local'],
    ['data:text/html,<input>', 'data:'],
    [undefined, 'página atual'],
  ])('%s vira %s', (url, rotulo) => {
    expect(rotuloDoHost(url)).toBe(rotulo)
  })
})

describe('caminhoDaUrl', () => {
  it.each([
    ['http://localhost:3000/cadastro?x=1#topo', '/cadastro'],
    ['https://staging.app.dev/', '/'],
    [undefined, '/'],
    ['não é url', '/'],
  ])('%s vira %s', (url, caminho) => {
    expect(caminhoDaUrl(url)).toBe(caminho)
  })
})
```

Em `apps/botai/src/entrypoints/popup/use-aba-alvo.test.ts`, dentro do `describe('buscarAbaAlvo', …)` (o `afterEach` do arquivo já chama `vi.unstubAllEnvs()`):

```ts
it('a URL é julgada pelo navegador atual: addons.mozilla.org só é proibida no Firefox', async () => {
  abaAtiva('https://addons.mozilla.org/pt-BR/firefox/')
  await expect(buscarAbaAlvo('')).resolves.toMatchObject({ situacao: 'ok' })
  vi.stubEnv('FIREFOX', 'true')
  await expect(buscarAbaAlvo('')).resolves.toMatchObject({
    situacao: 'proibida',
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run src/lib/paginas.test.ts src/entrypoints/popup/use-aba-alvo.test.ts; echo "exit=$?"`
Expected: `exit=1`; falham os esquemas novos (`moz-extension:`, `resource:`, `opera:`), os domínios do Firefox, das lojas do Edge e do Opera, "Missing host permission…", e o teste novo do `use-aba-alvo`.

- [ ] **Step 3: Implementar**

Substitua `apps/botai/src/lib/paginas.ts` inteiro por:

```ts
import type { Navegador } from './navegador'

export type SituacaoPagina = 'ok' | 'proibida' | 'arquivo-sem-acesso'

const ESQUEMAS_PROIBIDOS = [
  'chrome:',
  'chrome-extension:',
  'edge:',
  'opera:',
  'about:',
  'view-source:',
  'devtools:',
  'data:',
  'moz-extension:',
  'resource:',
]
const RECUSAS_DO_NAVEGADOR = [
  /^Cannot access /,
  /cannot be scripted/,
  /^Missing host permission for the tab/,
]
// A pref extensions.webextensions.restrictedDomains do Firefox (modules/libpref/init/all.js); ele compara o host exato.
const DOMINIOS_RESTRITOS_DO_FIREFOX = new Set([
  'accounts-static.cdn.mozilla.net',
  'accounts.firefox.com',
  'addons.cdn.mozilla.net',
  'addons.mozilla.org',
  'api.accounts.firefox.com',
  'content.cdn.mozilla.net',
  'discovery.addons.mozilla.org',
  'oauth.accounts.firefox.com',
  'profile.accounts.firefox.com',
  'support.mozilla.org',
  'sync.services.mozilla.com',
])

function lerUrl(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

function lojaDoChrome(url: URL): boolean {
  return (
    url.host === 'chromewebstore.google.com' ||
    (url.host === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
  )
}

const SITE_PROIBIDO: Record<Navegador, (url: URL) => boolean> = {
  chrome: lojaDoChrome,
  edge: (url) =>
    lojaDoChrome(url) || url.hostname === 'microsoftedge.microsoft.com',
  opera: (url) => lojaDoChrome(url) || url.hostname === 'addons.opera.com',
  firefox: (url) => DOMINIOS_RESTRITOS_DO_FIREFOX.has(url.hostname),
}

export function situacaoDaUrl(
  url: string | undefined,
  acessoArquivo: boolean,
  navegador: Navegador,
): SituacaoPagina {
  if (!url) return 'ok'
  if (ESQUEMAS_PROIBIDOS.some((esquema) => url.startsWith(esquema)))
    return 'proibida'
  if (url.startsWith('file:'))
    return acessoArquivo ? 'ok' : 'arquivo-sem-acesso'
  const lida = lerUrl(url)
  return lida && SITE_PROIBIDO[navegador](lida) ? 'proibida' : 'ok'
}

export function erroEhPaginaProibida(mensagem: string): boolean {
  return RECUSAS_DO_NAVEGADOR.some((padrao) => padrao.test(mensagem))
}

export function rotuloDoHost(url: string | undefined): string {
  if (!url) return 'página atual'
  const lida = lerUrl(url)
  if (!lida) return url
  if (lida.protocol === 'http:' || lida.protocol === 'https:') return lida.host
  if (lida.protocol === 'file:') return 'arquivo local'
  if (lida.protocol === 'data:') return 'data:'
  return lida.host
    ? `${lida.protocol}//${lida.host}`
    : `${lida.protocol}${lida.pathname}`
}

export function caminhoDaUrl(url: string | undefined): string {
  return (url && lerUrl(url)?.pathname) || '/'
}
```

Os esquemas ficam numa lista única porque um esquema de um navegador não aparece em outro; os sites ficam por navegador porque a mesma URL abre em todos (spec §4: "o Chrome não pode dar 1e em addons.mozilla.org"). As recusas também ficam numa lista única: uma mensagem de um navegador nunca vem de outro.

Em `apps/botai/src/entrypoints/popup/use-aba-alvo.ts`, acrescente o import e passe o navegador:

```ts
import { detectarNavegador } from '../../lib/navegador'
```

```ts
    situacao: situacaoDaUrl(aba.url, acessoArquivo, detectarNavegador()),
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run test; echo "exit=$?"`
Expected: Vitest inteiro verde, `exit=0` (o `App.test.tsx` segue no Chrome e não muda).

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/src/lib/paginas.ts apps/botai/src/lib/paginas.test.ts apps/botai/src/entrypoints/popup/use-aba-alvo.ts apps/botai/src/entrypoints/popup/use-aba-alvo.test.ts && /usr/bin/git commit -m "feat(botai): páginas proibidas e recusas por navegador"; echo "exit=$?"
```

---

### Task 6: `InjectionResult.error` do Firefox (`acoes.ts`)

**Files:**

- Modify: `apps/botai/src/entrypoints/background/acoes.ts:27-28` (`mensagemDo`), `:47-85` (`preencherPagina`), `:105-131` (`inserirNoCampo`)
- Test: `apps/botai/src/entrypoints/background/acoes.test.ts` (testes novos)

**Interfaces:**

- Consumes: `erroEhPaginaProibida` reconhecendo `Missing host permission for the tab` (Task 5).
- Produces (internos ao `acoes.ts`, a Task 8 usa):
  - `function comoErro(valor: unknown): Error`;
  - `function exigirSemErro<T>(injetados: Injetado<T>[], frameQueLanca: number): Injetado<T | null>[]`, com `interface Injetado<T> { documentId: string; frameId: number; result?: T }`.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/botai/src/entrypoints/background/acoes.test.ts`, um `describe` novo depois do `describe('preencherPagina', …)`:

```ts
describe('preencherPagina: InjectionResult.error (o Firefox resolve com o erro em vez de rejeitar)', () => {
  // No Chrome, uma exceção dentro da func rejeita o executeScript; no Firefox ela volta no resultado.
  const comResultadoDaFunc = (injetados: unknown[]) =>
    executar.mockImplementation(async (injecao) =>
      injecao.files ? [{ documentId: 'doc-0', frameId: 0 }] : injetados,
    )

  it('erro no frame 0 que não é recusa sobe, em vez de virar "Nenhum campo"', async () => {
    comResultadoDaFunc([
      {
        documentId: 'doc-0',
        frameId: 0,
        error: new TypeError(
          'can\'t access property "openOrClosedShadowRoot", T.dom is undefined',
        ),
      },
    ])
    await expect(preencherPagina(7)).rejects.toThrow('T.dom is undefined')
    expect(executar).toHaveBeenCalledTimes(2)
  })

  it('recusa entregue como objeto com message vira 1e', async () => {
    const aba = await fakeBrowser.tabs.create({
      url: 'https://addons.mozilla.org/pt-BR/firefox/',
    })
    comResultadoDaFunc([
      {
        documentId: 'doc-0',
        frameId: 0,
        error: { message: 'Missing host permission for the tab' },
      },
    ])
    await expect(preencherPagina(aba.id as number)).resolves.toEqual({
      ok: false,
      motivo: 'proibida',
    })
  })

  it('erro como string vira Error com a mesma mensagem', async () => {
    comResultadoDaFunc([
      { documentId: 'doc-0', frameId: 0, error: 'TypeError: boom' },
    ])
    await expect(preencherPagina(7)).rejects.toThrow('TypeError: boom')
  })

  it('erro num frame filho conta como frame sem resultado, e o topo é somado', async () => {
    comResultadoDaFunc([
      { documentId: 'doc-0', frameId: 0, result: RESULTADO },
      {
        documentId: 'doc-5',
        frameId: 5,
        error: 'TypeError: quebrou no iframe',
      },
    ])
    await expect(preencherPagina(7)).resolves.toMatchObject({
      ok: true,
      resumo: { x: 1, y: 2, k: 1 },
    })
  })

  it('erro na injeção do arquivo no frame 0 também sobe', async () => {
    executar.mockImplementation(async () => [
      {
        documentId: 'doc-0',
        frameId: 0,
        error: new Error('SyntaxError: Unexpected token'),
      },
    ])
    await expect(preencherPagina(7)).rejects.toThrow('SyntaxError')
    expect(executar).toHaveBeenCalledTimes(1)
  })
})
```

E dentro do `describe('inserirNoCampo: avisos de falha', …)` (usa os `avisos()` de lá):

```ts
it('Firefox: erro que não é recusa, entregue no resultado do frame do clique, sobe', async () => {
  executar.mockImplementation(async (injecao) =>
    injecao.files
      ? [{ documentId: 'doc-3', frameId: 3 }]
      : [
          {
            documentId: 'doc-3',
            frameId: 3,
            error: 'TypeError: x is undefined',
          },
        ],
  )
  await expect(inserirNoCampo(7, 3, 'cpf')).rejects.toThrow(
    'TypeError: x is undefined',
  )
  expect(avisos()).toEqual([])
})

it('Firefox: recusa entregue no resultado do frame do clique vira o aviso de iframe no topo', async () => {
  executar.mockImplementation(async (injecao) => {
    const frames = (injecao.target.frameIds as number[] | undefined) ?? []
    if (frames[0] === 3 && !injecao.files)
      return [
        {
          documentId: 'doc-3',
          frameId: 3,
          error: { message: 'Missing host permission for the tab or frames' },
        },
      ]
    return [{ documentId: 'doc', frameId: frames[0] }]
  })
  await inserirNoCampo(7, 3, 'cpf')
  expect(avisos()[0]).toMatchObject({
    target: { tabId: 7, frameIds: [0] },
    args: [
      {
        titulo: 'Não deu para inserir aqui: iframe de outro domínio',
        erro: true,
      },
    ],
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run src/entrypoints/background/acoes.test.ts; echo "exit=$?"`
Expected: `exit=1`, 6 falhas: os 4 de erro no frame 0 (inclusive o do arquivo) resolvem com `ok: true` (o "Nenhum campo" silencioso do Firefox 157) em vez de rejeitar, e os 2 do Inserir não lançam nem avisam. O "erro num frame filho" já passa antes da mudança (o `somarFrames` ignora `result` ausente); ele fica para travar que o `exigirSemErro` não derrube o frame 0 por causa de um filho.

- [ ] **Step 3: Implementar**

Em `apps/botai/src/entrypoints/background/acoes.ts`, troque a constante `mensagemDo` por este bloco:

```ts
interface Injetado<T> {
  documentId: string
  frameId: number
  result?: T
}

function comoErro(valor: unknown): Error {
  if (valor instanceof Error) return valor
  if (typeof valor === 'object' && valor !== null && 'message' in valor)
    return new Error(String(valor.message))
  return new Error(String(valor))
}

const mensagemDo = (erro: unknown) => comoErro(erro).message

// Só o Firefox entrega a exceção da func em InjectionResult.error, e resolve em vez de rejeitar.
function exigirSemErro<T>(
  injetados: Injetado<T>[],
  frameQueLanca: number,
): Injetado<T | null>[] {
  return injetados.map((injetado) => {
    const { error } = injetado as Injetado<T> & { error?: unknown }
    if (error === undefined) return injetado
    if (injetado.frameId === frameQueLanca) throw comoErro(error)
    return { ...injetado, result: null }
  })
}
```

O `try` do `preencherPagina` fica assim (o resto da função não muda):

```ts
  try {
    exigirSemErro(
      await browser.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: [ARQUIVO_CONTENT],
      }),
      0,
    )
    const resultados = exigirSemErro(
      await browser.scripting.executeScript({
        target: { tabId, allFrames: true },
        func: (p: Pessoa, hoje: string) =>
          (globalThis as ComBotai).__botai?.preencher(p, hoje) ?? null,
        args: [pessoa, hojeISO()],
      }),
      0,
    )
    const resumo = somarFrames(
      resultados.map(({ documentId, frameId, result }) => ({
        documentId,
        frameId,
        result,
      })),
    )
```

O `try` do `inserirNoCampo` fica assim (o frame do clique segue a regra do frame 0):

```ts
  try {
    exigirSemErro(
      await browser.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: [ARQUIVO_CONTENT],
      }),
      frameId,
    )
    const [injecao] = exigirSemErro(
      await browser.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        func: (p: Pessoa, k: FieldKind) =>
          (globalThis as ComBotai).__botai?.inserir(p, k) ?? null,
        args: [pessoa, kind],
      }),
      frameId,
    )
    resultado = injecao?.result
  } catch (erro) {
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run src/entrypoints/background/; echo "exit=$?"`
Expected: PASS em `acoes`, `ouvintes` e `background`, `exit=0`.

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/src/entrypoints/background/acoes.ts apps/botai/src/entrypoints/background/acoes.test.ts && /usr/bin/git commit -m "fix(botai): InjectionResult.error do Firefox vira exceção no frame 0 e null nos frames filhos"; echo "exit=$?"
```

---

### Task 7: Menu no campo de senha do Firefox (`menus.ts`)

**Files:**

- Modify: `apps/botai/src/lib/menus.ts:44-90` (tipos, `PAGINA_E_CAMPO`/`CAMPO` e `criarMenus`)
- Test: `apps/botai/src/lib/menus.test.ts`

**Interfaces:**

- Consumes: nada novo.
- Produces: `criarMenus(pessoa: Pessoa | null): Promise<void>` (igual); no Firefox, todo item leva também o contexto `'password'`.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/botai/src/lib/menus.test.ts`, acrescente `afterEach` ao import do `vitest` e, no fim do arquivo:

```ts
describe('criarMenus por navegador', () => {
  afterEach(() => vi.unstubAllEnvs())

  it("no Chrome, nenhum item leva 'password' (o Chrome recusaria o contexto)", async () => {
    await criarMenus(null)
    expect(criados().some((c) => c.contexts.includes('password'))).toBe(false)
  })

  it("no Firefox, todo item soma 'password', porque lá 'editable' não inclui senha", async () => {
    vi.stubEnv('FIREFOX', 'true')
    await criarMenus(null)
    const contextosDe = (id: string) =>
      criados().find((c) => c.id === id)?.contexts
    expect(contextosDe('botai-preencher')).toEqual([
      'page',
      'editable',
      'password',
    ])
    expect(contextosDe('botai-inserir')).toEqual(['editable', 'password'])
    expect(contextosDe('botai-inserir:senha')).toEqual(['editable', 'password'])
    expect(criados().every((c) => c.contexts.includes('password'))).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run src/lib/menus.test.ts; echo "exit=$?"`
Expected: o teste do Firefox falha (`['page', 'editable']` sem `'password'`), `exit=1`.

- [ ] **Step 3: Implementar**

Em `apps/botai/src/lib/menus.ts`, troque as linhas de `type Propriedades` até `const CAMPO` por:

```ts
type Propriedades = Browser.contextMenus.CreateProperties
type Contextos = NonNullable<Propriedades['contexts']>
type ItemInserir = (typeof ITENS_INSERIR)[number]

function contextos(...base: Contextos): Contextos {
  // No Firefox 'editable' não inclui campo de senha; o Chrome recusaria o contexto 'password'.
  return import.meta.env.FIREFOX
    ? ([...base, 'password'] as unknown as Contextos)
    : base
}
```

e, no `criarMenus`, calcule os contextos dentro da função (uma constante de módulo seria avaliada no import, antes de qualquer `vi.stubEnv`), trocando cada `PAGINA_E_CAMPO` por `paginaECampo` e cada `CAMPO` por `campo`:

```ts
export async function criarMenus(pessoa: Pessoa | null): Promise<void> {
  await browser.contextMenus.removeAll()
  const paginaECampo = contextos('page', 'editable')
  const campo = contextos('editable')
  const criar = (propriedades: Propriedades) =>
    browser.contextMenus.create(propriedades)
  criar({
    id: MENU.preencher,
    title: 'Preencher esta página',
    contexts: paginaECampo,
  })
  criar({ id: 'botai-sep-1', type: 'separator', contexts: paginaECampo })
  criar({ id: MENU.inserir, title: 'Inserir', contexts: campo })
  ITENS_INSERIR.forEach((item, i) => {
    if (i > 0 && ITENS_INSERIR[i - 1].grupo !== item.grupo) {
      criar({
        id: `botai-sep-inserir-${item.grupo}`,
        parentId: MENU.inserir,
        type: 'separator',
        contexts: campo,
      })
    }
    criar({
      id: `${PREFIXO_INSERIR}${item.kind}`,
      parentId: MENU.inserir,
      title: tituloDoItem(item, pessoa),
      contexts: campo,
    })
  })
  criar({ id: 'botai-sep-2', type: 'separator', contexts: paginaECampo })
  criar({ id: MENU.novaPessoa, title: 'Nova pessoa', contexts: paginaECampo })
  criar({
    id: MENU.abrirCaixa,
    title: 'Abrir caixa de entrada',
    contexts: paginaECampo,
  })
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run src/lib/menus.test.ts src/entrypoints/background/ouvintes.test.ts; echo "exit=$?"`
Expected: PASS (os testes antigos do Chrome, com contextos exatos, seguem verdes), `exit=0`.

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/src/lib/menus.ts apps/botai/src/lib/menus.test.ts && /usr/bin/git commit -m "feat(botai): menu do Botaí também em campo de senha no Firefox (contexto password)"; echo "exit=$?"
```

---

### Task 8: Inserir no campo clicado no Firefox (`menus.getTargetElement`)

**Files:**

- Modify: `apps/botai/src/entrypoints/preencher.content/inserir.ts` (função `inserirNoFoco` e import)
- Modify: `apps/botai/src/entrypoints/preencher.content/api.ts:15-20` (`ApiBotai.inserir`)
- Modify: `apps/botai/src/entrypoints/background/acoes.ts` (`inserirNoCampo`)
- Modify: `apps/botai/src/entrypoints/background/ouvintes.ts:26-64` (`aoClicarMenu` e `executar`)
- Modify: `apps/botai/src/lib/mensagens.ts:8` (mensagem `inserir`)
- Test: `inserir.test.ts`, `acoes.test.ts`, `ouvintes.test.ts`

**Interfaces:**

- Consumes: `exigirSemErro` (Task 6); a permissão `menus` no manifesto do Firefox (Task 2); `elementoEmFoco` atravessando a raiz fechada no Firefox (Task 4).
- Produces:
  - `inserirNoFoco(pessoa: Pessoa, kind: FieldKind, alvoId: number | null = null): ResultadoInsercao`;
  - `ApiBotai.inserir(pessoa: Pessoa, kind: FieldKind, alvoId?: number | null): ResultadoInsercao`;
  - `inserirNoCampo(tabId: number, frameId: number, kind: FieldKind, alvoId: number | null = null): Promise<void>`; a `func` injetada recebe `args: [pessoa, kind, alvoId]` (sempre 3; `null` no Chrome);
  - `Mensagem` `{ tipo: 'inserir'; tabId: number; frameId: number; kind: FieldKind; alvoId?: number }`.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/botai/src/entrypoints/preencher.content/inserir.test.ts`, acrescente `vi` ao import do `vitest` e, no fim:

```ts
describe('inserirNoFoco com o alvo do menu (Firefox)', () => {
  const getTargetElement = vi.fn<(alvoId: number) => Element | null>()

  beforeEach(() => {
    getTargetElement.mockReset()
    Object.assign(fakeBrowser, { menus: { getTargetElement } })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    Reflect.deleteProperty(fakeBrowser, 'menus')
  })

  function doisCampos(htmlDoClicado = '<input name="clicado">') {
    document.body.innerHTML = `<input name="focado">${htmlDoClicado}`
    const focado = document.querySelector('[name="focado"]') as HTMLInputElement
    const clicado = document.querySelector(
      '[name="clicado"]',
    ) as HTMLInputElement
    focado.focus()
    return { focado, clicado }
  }

  it('no Firefox, escreve no campo do clique, mesmo com outro campo em foco', () => {
    vi.stubEnv('FIREFOX', 'true')
    const { focado, clicado } = doisCampos()
    getTargetElement.mockImplementation((id) => (id === 42 ? clicado : null))
    expect(inserirNoFoco(P, 'cpf', 42)).toEqual({ ok: true })
    expect(clicado.value).toBe(P.cpf)
    expect(focado.value).toBe('')
  })

  it('no Firefox, o campo de senha clicado recebe a senha', () => {
    vi.stubEnv('FIREFOX', 'true')
    const { clicado } = doisCampos('<input type="password" name="clicado">')
    getTargetElement.mockReturnValue(clicado)
    expect(inserirNoFoco(P, 'senha', 7)).toEqual({ ok: true })
    expect(clicado.value).toBe(P.senha)
  })

  it('no Firefox, id expirado (null) ou elemento que saiu da página caem no campo em foco', () => {
    vi.stubEnv('FIREFOX', 'true')
    const { focado } = doisCampos()
    getTargetElement.mockReturnValue(null)
    expect(inserirNoFoco(P, 'cpf', 42)).toEqual({ ok: true })
    expect(focado.value).toBe(P.cpf)

    focado.value = ''
    getTargetElement.mockReturnValue(document.createElement('input'))
    expect(inserirNoFoco(P, 'cep', 42)).toEqual({ ok: true })
    expect(focado.value).toBe(P.endereco.cep)
  })

  it('no Chrome, um alvoId que chegue é ignorado: vale o foco', () => {
    const { focado, clicado } = doisCampos()
    expect(inserirNoFoco(P, 'cpf', 42)).toEqual({ ok: true })
    expect(focado.value).toBe(P.cpf)
    expect(clicado.value).toBe('')
    expect(getTargetElement).not.toHaveBeenCalled()
  })
})
```

Em `apps/botai/src/entrypoints/background/acoes.test.ts`:

- no teste "injeta só no frame do clique e chama \_\_botai.inserir com a pessoa e o kind", troque `args: [P, 'cpf'],` por `args: [P, 'cpf', null],`;
- no `simularInsercao`, troque `injecao.args?.length === 2` por `injecao.args?.length === 3` (a chamada do Inserir passa a ter 3 argumentos);
- acrescente ao `describe('inserirNoCampo', …)`:

```ts
it('repassa o alvo do clique à função injetada, que o entrega ao __botai.inserir', async () => {
  simularPagina(null)
  await inserirNoCampo(7, 3, 'cpf', 42)
  const { func, args = [] } = chamada(1)
  expect(args).toEqual([P, 'cpf', 42])
  const inserir = vi.fn(() => ({ ok: true }))
  Object.assign(globalThis, { __botai: { inserir } })
  expect(func?.(...args)).toEqual({ ok: true })
  expect(inserir).toHaveBeenCalledWith(P, 'cpf', 42)
  Reflect.deleteProperty(globalThis, '__botai')
})
```

Em `apps/botai/src/entrypoints/background/ouvintes.test.ts`:

- no teste "Inserir › CPF injeta no frame do clique com o kind", troque `expect(chamada(1).args).toEqual([P, 'cpf'])` por `expect(chamada(1).args).toEqual([P, 'cpf', null])`;
- no teste "inserir só é aceito no build e2e", a mesma troca na última linha;
- acrescente ao `describe('aoClicarMenu', …)`:

```ts
it('no Firefox, o Inserir leva o targetElementId do clique até o content script', async () => {
  await aoClicarMenu(
    {
      ...clique('botai-inserir:cpf', 3),
      targetElementId: 42,
    } as Browser.contextMenus.OnClickData,
    ABA,
  )
  expect(chamada(1).args).toEqual([P, 'cpf', 42])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/inserir.test.ts src/entrypoints/background/; echo "exit=$?"`
Expected: `exit=1`, 9 falhas: no `inserir.test.ts`, o do campo clicado (escreve no focado) e o de senha (não escreve); no `acoes.test.ts`, os 2 que comparam `args` (sem o 3º elemento) e 2 de "avisos de falha" ("sem campo em foco no topo" e "campo de um iframe da mesma origem"), porque o `simularInsercao` agora só responde à chamada de 3 argumentos; no `ouvintes.test.ts`, os 3 que comparam `args`. Os testes de id expirado e do Chrome já passam (o foco é o comportamento de hoje).

- [ ] **Step 3: Implementar o content script**

`apps/botai/src/entrypoints/preencher.content/inserir.ts`: acrescente o import e troque o começo do `inserirNoFoco`:

```ts
import { browser } from 'wxt/browser'
```

```ts
interface MenusDoFirefox {
  getTargetElement(alvoId: number): Element | null
}

// O Chrome não diz qual elemento recebeu o clique do menu (o foco resolve); o Firefox diz.
function alvoDoClique(alvoId: number | null): Element | null {
  if (!import.meta.env.FIREFOX || alvoId === null) return null
  const alvo = (
    browser as unknown as { menus: MenusDoFirefox }
  ).menus.getTargetElement(alvoId)
  return alvo?.isConnected ? alvo : null
}

export function inserirNoFoco(
  pessoa: Pessoa,
  kind: FieldKind,
  alvoId: number | null = null,
): ResultadoInsercao {
  const alvo = alvoDoClique(alvoId) ?? elementoEmFoco(document)
```

(o resto da função não muda).

`apps/botai/src/entrypoints/preencher.content/api.ts`, na interface:

```ts
  inserir(
    pessoa: Pessoa,
    kind: FieldKind,
    alvoId?: number | null,
  ): ResultadoInsercao
```

(o objeto devolvido continua com `inserir: inserirNoFoco`).

- [ ] **Step 4: Implementar o background e a mensagem**

`apps/botai/src/lib/mensagens.ts`:

```ts
  | {
      tipo: 'inserir'
      tabId: number
      frameId: number
      kind: FieldKind
      alvoId?: number
    }
```

`apps/botai/src/entrypoints/background/acoes.ts`, o `inserirNoCampo` inteiro:

```ts
export async function inserirNoCampo(
  tabId: number,
  frameId: number,
  kind: FieldKind,
  alvoId: number | null = null,
): Promise<void> {
  const pessoa = await obterOuGerarPessoa()
  let resultado: ResultadoInsercao | null | undefined
  try {
    exigirSemErro(
      await browser.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        files: [ARQUIVO_CONTENT],
      }),
      frameId,
    )
    const [injecao] = exigirSemErro(
      await browser.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        func: (p: Pessoa, k: FieldKind, alvo: number | null) =>
          (globalThis as ComBotai).__botai?.inserir(p, k, alvo) ?? null,
        args: [pessoa, kind, alvoId],
      }),
      frameId,
    )
    resultado = injecao?.result
  } catch (erro) {
    if (!erroEhPaginaProibida(mensagemDo(erro))) throw erro
    if (frameId !== 0) await avisarFalhaAoInserir(tabId, frameId, 'iframe')
    return
  }
  if (resultado && !resultado.ok)
    await avisarFalhaAoInserir(tabId, frameId, resultado.motivo)
}
```

`apps/botai/src/entrypoints/background/ouvintes.ts`: depois de `export const COMANDO_PREENCHER = 'botai-preencher'`:

```ts
// Os tipos do @wxt-dev/browser não têm o targetElementId, que só o Firefox manda.
type CliqueNoMenu = Browser.contextMenus.OnClickData & {
  targetElementId?: number
}
```

o ramo do Inserir do `aoClicarMenu`:

```ts
  else if (id.startsWith(PREFIXO_INSERIR)) {
    await inserirNoCampo(
      aba.id,
      info.frameId ?? 0,
      id.slice(PREFIXO_INSERIR.length) as FieldKind,
      (info as CliqueNoMenu).targetElementId ?? null,
    )
  }
```

e o `case 'inserir'` do `executar`:

```ts
    case 'inserir':
      return import.meta.env.MODE === 'e2e'
        ? inserirNoCampo(
            mensagem.tabId,
            mensagem.frameId,
            mensagem.kind,
            mensagem.alvoId ?? null,
          )
        : undefined
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run test; echo "exit=$?"`
Expected: Vitest inteiro verde (inclui `api.test.ts`, cujo `api.inserir(P, 'cpf')` segue valendo), `exit=0`.

- [ ] **Step 6: O E2E do Inserir no Chromium segue verde**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run build:e2e && ./node_modules/.bin/playwright test src/entrypoints/background/avisos.e2e.ts src/entrypoints/preencher.content/preencher.e2e.ts; echo "exit=$?"`
Expected: PASS (a mensagem `inserir` sem `alvoId` chega como `null`), `exit=0`. Se o Chromium do Playwright faltar: `./node_modules/.bin/playwright install chromium`.

- [ ] **Step 7: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/src/entrypoints/preencher.content/inserir.ts apps/botai/src/entrypoints/preencher.content/inserir.test.ts apps/botai/src/entrypoints/preencher.content/api.ts apps/botai/src/entrypoints/background/acoes.ts apps/botai/src/entrypoints/background/acoes.test.ts apps/botai/src/entrypoints/background/ouvintes.ts apps/botai/src/entrypoints/background/ouvintes.test.ts apps/botai/src/lib/mensagens.ts && /usr/bin/git commit -m "feat(botai): Inserir no campo clicado no Firefox (menus.getTargetElement), com o foco como reserva"; echo "exit=$?"
```

---

### Task 9: Popup por navegador (textos do 1e e página de atalhos)

**Files:**

- Modify: `apps/botai/src/components/pagina-proibida.tsx` (arquivo inteiro abaixo)
- Modify: `apps/botai/src/components/pagina-proibida.stories.tsx` (arquivo inteiro abaixo)
- Modify: `apps/botai/src/entrypoints/popup/App.tsx:1-29,84-122`
- Test: `apps/botai/src/components/pagina-proibida.test.tsx`, `apps/botai/src/entrypoints/popup/App.test.tsx`

**Interfaces:**

- Consumes: `Navegador`, `detectarNavegador()`, `PAGINA_DE_ATALHOS` (Task 1); `situacaoDaUrl` por navegador (Task 5, pelo `useAbaAlvo`).
- Produces: `PaginaProibidaProps` com `navegador: Navegador` (obrigatória); `App` passando o navegador ao 1e e abrindo os atalhos pelo navegador.

- [ ] **Step 1: Escrever os testes que falham**

Em `apps/botai/src/components/pagina-proibida.test.tsx`, o helper passa a ter o navegador:

```ts
function props(extra: Partial<PaginaProibidaProps> = {}): PaginaProibidaProps {
  return {
    motivo: 'proibida',
    navegador: 'chrome',
    nome: 'Maria Eduarda Souza',
    onVerDados: vi.fn(),
    onGerarPessoa: vi.fn(),
    ...extra,
  }
}
```

e, dentro do `describe('PaginaProibida (1e)', …)`:

```tsx
it.each([
  [
    'edge',
    'O Edge não deixa extensões mexerem nesta página',
    'Vale para páginas edge://, a loja de complementos do Edge e o leitor de PDF, e para qualquer extensão. Abra o formulário numa aba comum e tente de novo.',
  ],
  [
    'opera',
    'O Opera não deixa extensões mexerem nesta página',
    'Vale para páginas opera://, a loja de extensões do Opera e o leitor de PDF, e para qualquer extensão. Abra o formulário numa aba comum e tente de novo.',
  ],
  [
    'firefox',
    'O Firefox não deixa extensões mexerem nesta página',
    'Vale para páginas about:, os sites da Mozilla (como addons.mozilla.org) e o leitor de PDF, e para qualquer extensão. Abra o formulário numa aba comum e tente de novo.',
  ],
] as const)(
  'no %s, o 1e fala do próprio navegador',
  (navegador, titulo, corpo) => {
    render(<PaginaProibida {...props({ navegador })} />)
    expect(
      screen.getByRole('heading', { level: 1, name: titulo }),
    ).toBeInTheDocument()
    expect(screen.getByText(/e o leitor de PDF/)).toHaveTextContent(corpo)
  },
)

it.each([
  [
    'edge',
    "Em edge://extensions, nos detalhes da extensão, ative 'Permitir acesso a URLs de arquivo' e tente de novo.",
  ],
  [
    'opera',
    "Em opera://extensions, nos detalhes da extensão, ative 'Permitir acesso a URLs de arquivo' e tente de novo.",
  ],
  [
    'firefox',
    "Em about:addons, nos detalhes da extensão, ative 'Acessar arquivos locais no seu computador' e tente de novo.",
  ],
] as const)(
  'no %s, o file: sem acesso ensina o caminho do próprio navegador',
  (navegador, corpo) => {
    render(
      <PaginaProibida
        {...props({ navegador, motivo: 'arquivo-sem-acesso' })}
      />,
    )
    expect(screen.getByText(/nos detalhes da extensão/)).toHaveTextContent(
      corpo,
    )
  },
)
```

Em `apps/botai/src/entrypoints/popup/App.test.tsx`, um `describe` novo no fim:

```tsx
describe('App do popup: por navegador', () => {
  // O App.test precisa do navigator real (o user-event pendura nele o clipboard):
  // o Edge entra só pela propriedade que o detector lê.
  const comMarcasDoEdge = () =>
    Object.defineProperty(navigator, 'userAgentData', {
      value: { brands: [{ brand: 'Microsoft Edge', version: '141' }] },
      configurable: true,
    })

  afterEach(() => {
    vi.unstubAllEnvs()
    Reflect.deleteProperty(navigator, 'userAgentData')
  })

  it('no Firefox, "alterar" abre a tela de atalhos do próprio Firefox, sem criar aba', async () => {
    vi.stubEnv('FIREFOX', 'true')
    const abrirAtalhos = vi.fn(async () => undefined)
    Object.assign(fakeBrowser.commands, { openShortcutSettings: abrirAtalhos })
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'alterar' }))
    expect(abrirAtalhos).toHaveBeenCalledTimes(1)
    expect(abrir).not.toHaveBeenCalled()
  })

  it('no Firefox, o 1e fala do Firefox', async () => {
    vi.stubEnv('FIREFOX', 'true')
    urlDaAba = 'about:addons'
    await pessoaItem.setValue(P)
    render(<App />)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'O Firefox não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
  })

  it('no Edge (o zip do Chrome), o 1e fala do Edge', async () => {
    comMarcasDoEdge()
    urlDaAba = 'edge://settings'
    await pessoaItem.setValue(P)
    render(<App />)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'O Edge não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
  })

  it('no Edge, "alterar" abre a página de atalhos do Chromium', async () => {
    comMarcasDoEdge()
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'alterar' }))
    expect(abrir).toHaveBeenCalledWith({
      url: 'chrome://extensions/shortcuts',
    })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run src/components/pagina-proibida.test.tsx src/entrypoints/popup/App.test.tsx; echo "exit=$?"`
Expected: `exit=1`, 9 falhas: os 6 do componente (os textos de Edge, Opera e Firefox saem com "O Chrome…" e `chrome://extensions`) e 3 do `App.test.tsx` (o "alterar" no Firefox chama `tabs.create`, e o 1e do Firefox e o do Edge falam do Chrome). O "alterar" no Edge já passa: é o comportamento de hoje, e fica para travar que o Edge não caia no ramo do Firefox.

- [ ] **Step 3: Implementar o componente**

Substitua `apps/botai/src/components/pagina-proibida.tsx` inteiro por:

```tsx
import { faBolt, faLock } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { Card } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import type { Navegador } from '../lib/navegador'
import type { SituacaoPagina } from '../lib/paginas'
import { IconeTile } from './icone-tile'
import { CODIGO, CORPO, H1_ESTADO, PAINEL } from './tipografia'

const BOTAO_DO_CARTAO = 'ml-auto flex-none gap-2 rounded-[14px] text-[13px]'

interface TextosDoNavegador {
  nome: string
  esquema: string
  loja: string
  paginaDeExtensoes: string
  opcaoDeArquivos: string
}

const TEXTOS: Record<Navegador, TextosDoNavegador> = {
  chrome: {
    nome: 'Chrome',
    esquema: 'chrome://',
    loja: 'a Chrome Web Store',
    paginaDeExtensoes: 'chrome://extensions',
    opcaoDeArquivos: 'Permitir acesso a URLs de arquivo',
  },
  edge: {
    nome: 'Edge',
    esquema: 'edge://',
    loja: 'a loja de complementos do Edge',
    paginaDeExtensoes: 'edge://extensions',
    opcaoDeArquivos: 'Permitir acesso a URLs de arquivo',
  },
  opera: {
    nome: 'Opera',
    esquema: 'opera://',
    loja: 'a loja de extensões do Opera',
    paginaDeExtensoes: 'opera://extensions',
    opcaoDeArquivos: 'Permitir acesso a URLs de arquivo',
  },
  firefox: {
    nome: 'Firefox',
    esquema: 'about:',
    loja: 'os sites da Mozilla (como addons.mozilla.org)',
    paginaDeExtensoes: 'about:addons',
    opcaoDeArquivos: 'Acessar arquivos locais no seu computador',
  },
}

export interface PaginaProibidaProps {
  motivo: Exclude<SituacaoPagina, 'ok'>
  navegador: Navegador
  nome: string | null
  onVerDados: () => void
  onGerarPessoa: () => void
}

export function PaginaProibida({
  motivo,
  navegador,
  nome,
  onVerDados,
  onGerarPessoa,
}: PaginaProibidaProps) {
  const textos = TEXTOS[navegador]
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-5 pb-4">
      <IconeTile>
        <FontAwesomeIcon icon={faLock} />
      </IconeTile>
      {motivo === 'arquivo-sem-acesso' ? (
        <>
          <h1 className={H1_ESTADO}>Falta liberar o acesso a arquivos</h1>
          <p className={CORPO}>
            Em <span className={CODIGO}>{textos.paginaDeExtensoes}</span>, nos
            detalhes da extensão, ative {`'${textos.opcaoDeArquivos}'`} e tente
            de novo.
          </p>
        </>
      ) : (
        <>
          <h1 className={H1_ESTADO}>
            O {textos.nome} não deixa extensões mexerem nesta página
          </h1>
          <p className={CORPO}>
            Vale para páginas <span className={CODIGO}>{textos.esquema}</span>,{' '}
            {textos.loja} e o leitor de PDF, e para qualquer extensão. Abra o
            formulário numa aba comum e tente de novo.
          </p>
        </>
      )}
      <Button size="lg" disabled className="w-full gap-2">
        <FontAwesomeIcon icon={faBolt} className="text-[13px]" />
        Preencher esta página
      </Button>
      <Card className={cn(PAINEL, 'flex items-center gap-3')}>
        {nome ? (
          <>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-semibold">{nome}</span>
              <span className="text-muted-foreground text-[12px]">
                Os dados continuam aqui para copiar.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className={BOTAO_DO_CARTAO}
              onClick={onVerDados}
            >
              Ver os dados
            </Button>
          </>
        ) : (
          <>
            <span className="text-muted-foreground min-w-0 text-[12px]">
              Gere uma pessoa para copiar os dados à mão.
            </span>
            <Button
              variant="outline"
              size="sm"
              className={BOTAO_DO_CARTAO}
              onClick={onGerarPessoa}
            >
              Gerar pessoa
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
```

O texto do Chrome sai idêntico ao de hoje (os testes antigos do componente e o `retorno.e2e.ts` provam). Os rótulos da opção de arquivos do Edge, do Opera e do Firefox em pt-BR são SUPOSTOS: o checklist manual (Task 13) manda conferir e corrigir só a entrada do `TEXTOS`.

- [ ] **Step 4: Stories por navegador**

Substitua `apps/botai/src/components/pagina-proibida.stories.tsx` inteiro por:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { Navegador } from '../lib/navegador'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import { PaginaProibida } from './pagina-proibida'
import { PopupShell } from './popup-shell'

const PAGINA_PROIBIDA_DE_EXEMPLO: Record<Navegador, string> = {
  chrome: 'chrome://settings',
  edge: 'edge://settings',
  opera: 'opera://settings',
  firefox: 'about:addons',
}

const meta = {
  title: 'Popup/1e · Página proibida',
  component: PaginaProibida,
  args: {
    motivo: 'proibida',
    navegador: 'chrome',
    nome: PESSOA_DOURADA.nome.completo,
    onVerDados: fn(),
    onGerarPessoa: fn(),
  },
  render: (args) => (
    <PopupShell
      host={
        args.motivo === 'arquivo-sem-acesso'
          ? 'arquivo local'
          : PAGINA_PROIBIDA_DE_EXEMPLO[args.navegador]
      }
      status="lock"
      onAbrirPiluTech={fn()}
    >
      <PaginaProibida {...args} />
    </PopupShell>
  ),
} satisfies Meta<typeof PaginaProibida>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const SemPessoa: Story = { args: { nome: null } }
export const ArquivoSemAcesso: Story = {
  args: { motivo: 'arquivo-sem-acesso' },
}
export const Firefox: Story = { args: { navegador: 'firefox' } }
export const FirefoxClaro: Story = {
  args: { navegador: 'firefox' },
  globals: { tema: 'claro' },
}
export const FirefoxArquivoSemAcesso: Story = {
  args: { navegador: 'firefox', motivo: 'arquivo-sem-acesso' },
}
export const Edge: Story = { args: { navegador: 'edge' } }
export const EdgeArquivoSemAcesso: Story = {
  args: { navegador: 'edge', motivo: 'arquivo-sem-acesso' },
}
export const Opera: Story = { args: { navegador: 'opera' } }
export const OperaArquivoSemAcesso: Story = {
  args: { navegador: 'opera', motivo: 'arquivo-sem-acesso' },
}
```

- [ ] **Step 5: Implementar o `App.tsx`**

Em `apps/botai/src/entrypoints/popup/App.tsx`:

1. acrescente o import:

```ts
import {
  detectarNavegador,
  PAGINA_DE_ATALHOS,
  type Navegador,
} from '../../lib/navegador'
```

2. apague a linha `const PAGINA_DE_ATALHOS = 'chrome://extensions/shortcuts'` e, logo depois de `const COMANDO_PREENCHER = 'botai-preencher'`, acrescente:

```ts
interface ComandosDoFirefox {
  openShortcutSettings(): Promise<void>
}

function abrirPaginaDeAtalhos(navegador: Navegador): void {
  if (navegador === 'firefox') {
    // No Firefox, tabs.create com chrome:// ou about:addons dá "Illegal URL".
    void (
      browser.commands as unknown as ComandosDoFirefox
    ).openShortcutSettings()
    return
  }
  void browser.tabs.create({ url: PAGINA_DE_ATALHOS[navegador] })
}
```

3. no `TelaDoPopup`, logo depois do `useState` do `estado`, e trocando o `abrirAtalhos`:

```ts
const [navegador] = useState(detectarNavegador)
const abrirAtalhos = () => abrirPaginaDeAtalhos(navegador)
```

4. no `<PaginaProibida …>`, acrescente `navegador={navegador}` depois do `motivo={…}`.

- [ ] **Step 6: Rodar e ver passar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run test; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run build-storybook; echo "exit=$?"
```

Expected: Vitest inteiro verde (os testes antigos do Chrome, inclusive os que esperam `chrome://extensions/shortcuts`, não mudam) e o Storybook compila com as 11 stories do 1e; `exit=0` nos dois. Para olhar: `make storybook-botai` e "Popup/1e · Página proibida" (Firefox, Edge, Opera, nos temas claro e escuro).

- [ ] **Step 7: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/src/components/pagina-proibida.tsx apps/botai/src/components/pagina-proibida.test.tsx apps/botai/src/components/pagina-proibida.stories.tsx apps/botai/src/entrypoints/popup/App.tsx apps/botai/src/entrypoints/popup/App.test.tsx && /usr/bin/git commit -m "feat(botai): popup por navegador (textos do 1e e do file:, página de atalhos)"; echo "exit=$?"
```

---

### Task 10: Pacotes e zip de fontes reproduzível da AMO

**Files:**

- Create: `apps/botai/scripts/reproduzir-fontes.sh`
- Modify: `apps/botai/wxt.config.ts` (import e bloco `zip`)
- Modify: `apps/botai/src/styles.css:7` (duas linhas `@source not`)
- Modify: `apps/botai/package.json` (scripts `zip`, `zip:firefox`, `zip:opera`)
- Modify: `Makefile` (`.PHONY` e alvo `zip-botai`)
- Modify: `.gitignore` (`.env.submit`)
- Test: a reprodução em Docker `node:24.14.0` (`cmp` byte a byte) e a listagem do zip de fontes

**Interfaces:**

- Consumes: os builds da Task 2; o `@source '../../../packages/ui/src'` do `styles.css`.
- Produces:
  - `make zip-botai` → `apps/botai/.output/botai-<versão>-chrome.zip`, `-firefox.zip`, `-opera.zip`, `-sources.zip`;
  - `bash apps/botai/scripts/reproduzir-fontes.sh <botai-X-sources.zip> <botai-X-firefox.zip>` → `exit 0` e `IDENTICO: botai-X-firefox.zip`, ou `exit ≠ 0` com o `diff -r`/`cmp` que falhou (a Task 12 chama o mesmo script no CI).

- [ ] **Step 1: O script de reprodução**

`apps/botai/scripts/reproduzir-fontes.sh`:

```bash
#!/usr/bin/env bash
# Faz o que o revisor da AMO faz: reconstrói o pacote do Firefox a partir do zip de fontes, numa pasta
# limpa, e compara byte a byte. Roda no job pacotes do botai-release.yml e no Docker node:24.14.0.
# Uso: reproduzir-fontes.sh <botai-X-sources.zip> <botai-X-firefox.zip>
set -euo pipefail

fontes=$(realpath "$1")
esperado=$(realpath "$2")
pasta_esperada=$(dirname "$esperado")/firefox-mv3
revisor=$(mktemp -d)
trap 'rm -rf "$revisor"' EXIT

cd "$revisor"
unzip -q "$fontes"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
corepack enable
pnpm_fixado=$(node -p "require('./package.json').packageManager.split('@')[1]")
test "$(pnpm --version)" = "$pnpm_fixado"
CI=1 pnpm install --frozen-lockfile
pnpm --filter @pilutech/botai exec wxt zip -b firefox

versao=$(node -p "require('./apps/botai/package.json').version")
diff -r "$pasta_esperada" apps/botai/.output/firefox-mv3
cmp "$esperado" "apps/botai/.output/botai-$versao-firefox.zip"
echo "IDENTICO: botai-$versao-firefox.zip"
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && chmod +x apps/botai/scripts/reproduzir-fontes.sh && /opt/homebrew/bin/shellcheck apps/botai/scripts/reproduzir-fontes.sh; echo "exit=$?"
```

Expected: `exit=0` (sem achados).

- [ ] **Step 2: Ver o zip de fontes padrão do WXT falhar na reprodução**

O Docker precisa estar no ar: `/usr/local/bin/docker info >/dev/null 2>&1; echo "exit=$?"`; se der `exit≠0`, abra o OrbStack (ou o Docker Desktop) e repita. A imagem `node:24.14.0` já está na máquina (Debian, Node 24.14.0, corepack 0.34.6, `unzip`); no Mac com Apple Silicon ela roda em Linux arm64, a arquitetura do revisor da AMO.

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/wxt zip -b firefox; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && V=$(node -p "require('./apps/botai/package.json').version") && /usr/local/bin/docker run --rm -v "$PWD:/repo:ro" node:24.14.0 bash /repo/apps/botai/scripts/reproduzir-fontes.sh "/repo/apps/botai/.output/pilutechbotai-$V-sources.zip" "/repo/apps/botai/.output/pilutechbotai-$V-firefox.zip"; echo "exit=$?"
```

Expected: o `wxt zip` sai 0 e gera `pilutechbotai-<versão>-*.zip` (nome e `sourcesRoot` padrão); a reprodução sai com `exit≠0` antes do `cmp`, porque o zip padrão tem só `apps/botai` (sem o `package.json` da raiz com o `packageManager`, sem `pnpm-lock.yaml` e sem `packages/*`). É o defeito que a spec §2 ("Fontes para a AMO") resolve.

Limpe os zips de nome antigo: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && rm -f .output/pilutechbotai-*.zip; echo "exit=$?"`.

- [ ] **Step 3: Bloco `zip` e `@source not`**

`apps/botai/wxt.config.ts`: acrescente no topo

```ts
import { fileURLToPath } from 'node:url'
```

depois do `ATALHO_FIREFOX`

```ts
const raizDoMonorepo = fileURLToPath(new URL('../..', import.meta.url))
```

e, entre `dev: …` e `manifest: …` (portado do `rascunhos/mudancas-botai.diff`, validado byte a byte pela pesquisa):

```ts
  zip: {
    name: 'botai',
    sourcesRoot: raizDoMonorepo,
    // Arquivo oculto só entra citado pelo nome (.npmrc).
    includeSources: [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.npmrc',
      'scripts/check-tailwind-source.mjs',
      'apps/botai/**',
      'packages/tools/**',
      'packages/ui/**',
    ],
    // Com sourcesRoot na raiz, a exclusão automática do outDir do WXT não pega estas pastas.
    excludeSources: [
      'apps/botai/.output/**',
      'apps/botai/.wxt/**',
      '**/storybook-static/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
```

`apps/botai/src/styles.css`, logo depois de `@source not '../.output';`:

```css
/* O zip de fontes do WXT sempre exclui *.test.*: sem estas linhas, o CSS que o revisor da AMO reconstrói sai diferente. */
@source not './**/*.test.*';
@source not '../../../packages/ui/src/**/*.test.*';
```

- [ ] **Step 4: Scripts, Makefile e `.gitignore`**

`apps/botai/package.json`, depois de `"build:e2e"`:

```json
    "zip": "wxt zip && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3 && pnpm run zip:firefox && pnpm run zip:opera",
    "zip:firefox": "wxt zip -b firefox && node ../../scripts/check-tailwind-source.mjs .output/firefox-mv3",
    "zip:opera": "wxt zip -b opera && node ../../scripts/check-tailwind-source.mjs .output/opera-mv3",
```

`Makefile`: acrescente `zip-botai` ao fim da última linha do `.PHONY` (`dev-botai build-botai test-botai test-e2e-botai storybook-botai zip-botai`), troque o cabeçalho da seção `# --- botai (extensão Chrome MV3, WXT) ---` por `# --- botai (extensão MV3 para Chrome, Edge, Opera e Firefox, WXT) ---` e, depois do alvo `storybook-botai`:

```make
# Os 3 pacotes (Chrome e Edge, Firefox, Opera sem minificar) + o zip de fontes da AMO em apps/botai/.output/.
zip-botai:
	pnpm --filter @pilutech/botai zip
```

`.gitignore`, no fim do bloco do Botaí:

```gitignore
# Credenciais locais do `wxt submit`, que o CLI lê sozinho: nunca versionar
.env.submit
```

- [ ] **Step 5: Gerar os pacotes e conferir o zip de fontes**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && make zip-botai; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && /bin/ls .output/*.zip; echo "exit=$?"
```

Expected: `exit=0` (os três gates calados) e exatamente `botai-<versão>-chrome.zip`, `botai-<versão>-firefox.zip`, `botai-<versão>-opera.zip`, `botai-<versão>-sources.zip`.

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && V=$(node -p "require('./package.json').version") && for f in package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc scripts/check-tailwind-source.mjs apps/botai/package.json apps/botai/wxt.config.ts apps/botai/src/styles.css packages/ui/src/styles.css packages/tools/package.json; do /usr/bin/unzip -Z1 .output/botai-$V-sources.zip | /usr/bin/grep -qxF "$f" || echo "FALTA $f"; done; echo "fim"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && V=$(node -p "require('./package.json').version") && /usr/bin/unzip -Z1 .output/botai-$V-sources.zip | /usr/bin/grep -c -E '(^|/)node_modules/|^apps/botai/\.(output|wxt)/|\.test\.|storybook-static/|test-results/|playwright-report/'; echo "exit=$?"
```

Expected: só `fim` no primeiro (nada falta); `0` e `exit=1` no segundo (nenhum `node_modules`, `.output`, `.wxt`, teste nem lixo local no zip).

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git check-ignore .env.submit apps/botai/.env.submit; echo "exit=$?"
```

Expected: os dois caminhos listados e `exit=0`.

- [ ] **Step 6: A reprodução fica verde**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && V=$(node -p "require('./apps/botai/package.json').version") && /usr/local/bin/docker run --rm -v "$PWD:/repo:ro" node:24.14.0 bash /repo/apps/botai/scripts/reproduzir-fontes.sh "/repo/apps/botai/.output/botai-$V-sources.zip" "/repo/apps/botai/.output/botai-$V-firefox.zip"; echo "exit=$?"
```

Expected: `IDENTICO: botai-<versão>-firefox.zip` e `exit=0` (o build do Mac com Node 22 e o do Linux arm64 com Node 24.14.0 batem byte a byte). Se o `diff -r` acusar diferença só em `assets/*.css`, o `@source not` do Step 3 não pegou (confira os caminhos relativos a `src/styles.css`); se acusar outro arquivo, pare e investigue antes de seguir: é exatamente o que a AMO rejeitaria.

- [ ] **Step 7: Sem regressão**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint && $P run test && $P run lint:firefox; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run build:e2e && ./node_modules/.bin/playwright test manifesto.e2e.ts src/entrypoints/popup/; echo "exit=$?"
```

Expected: `exit=0` nos dois (o CSS do popup perde só `.container`, `.ring` e `.invisible`, que nenhum código de produção usa).

- [ ] **Step 8: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/scripts/reproduzir-fontes.sh apps/botai/wxt.config.ts apps/botai/src/styles.css apps/botai/package.json Makefile .gitignore && /usr/bin/git commit -m "build(botai): zip dos 3 pacotes e zip de fontes que a AMO reconstrói byte a byte"; echo "exit=$?"
```

---

### Task 11: Licença MIT e instruções para os revisores das lojas

**Files:**

- Create: `apps/botai/LICENSE`, `packages/tools/LICENSE`, `packages/ui/LICENSE`
- Create: `apps/botai/SOURCE-CODE-REVIEW.md`
- Modify: `apps/botai/package.json`, `packages/tools/package.json`, `packages/ui/package.json` (campo `"license"`)
- Test: os arquivos dentro do zip de fontes e o campo `license` lido pelo Node

**Interfaces:**

- Consumes: o zip de fontes (Task 10), que inclui `apps/botai/**`, `packages/tools/**` e `packages/ui/**`.
- Produces: `apps/botai/SOURCE-CODE-REVIEW.md` e as três `LICENSE` dentro de `botai-<versão>-sources.zip` (a fase 3 aponta o revisor da AMO e do Opera para o `SOURCE-CODE-REVIEW.md`).

- [ ] **Step 1: Ver faltar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && V=$(node -p "require('./package.json').version") && /usr/bin/unzip -Z1 .output/botai-$V-sources.zip | /usr/bin/grep -E '^(apps/botai|packages/tools|packages/ui)/LICENSE$|^apps/botai/SOURCE-CODE-REVIEW\.md$'; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && node -p "[require('./apps/botai/package.json').license, require('./packages/tools/package.json').license, require('./packages/ui/package.json').license].join(' ')"; echo "exit=$?"
```

Expected: nenhuma linha e `exit=1` no primeiro; `undefined undefined undefined` no segundo.

- [ ] **Step 2: As licenças**

`apps/botai/LICENSE` e `packages/tools/LICENSE` (o mesmo texto):

```text
MIT License

Copyright (c) 2026 PiluTech

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`packages/ui/LICENSE`: o mesmo texto, com as duas linhas de copyright (os componentes vêm do shadcn/ui, também MIT):

```text
MIT License

Copyright (c) 2026 PiluTech
Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Nos três `package.json`, logo depois de `"private": true,`:

```json
  "license": "MIT",
```

- [ ] **Step 3: `SOURCE-CODE-REVIEW.md` (inglês, para o revisor)**

`apps/botai/SOURCE-CODE-REVIEW.md` (portado do rascunho da `publicacao.md`, com o ambiente do revisor e os arquivos da raiz explicados):

````markdown
# Botaí: build instructions for add-on reviewers

Botaí is a browser extension built with WXT 0.21.4 and Vite 7 from TypeScript sources in a pnpm monorepo. This archive contains only the parts of the monorepo that the extension needs:

- `apps/botai`: the extension itself;
- `packages/tools` and `packages/ui`: workspace packages that the extension imports as TypeScript source (they have no prebuilt output);
- at the root, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` and `scripts/check-tailwind-source.mjs`. They are here only to reproduce the build: the workspace layout, the lockfile, the install settings and a CSS check that the build scripts run.

## Environment

- Ubuntu 24.04
- Node.js 24.14.0
- pnpm 11.1.1, pinned in `package.json` > `packageManager`. `corepack enable` installs it.

Every pull request that touches the extension rebuilds the Firefox package from this archive on Ubuntu 24.04 with Node.js 24.14.0 and compares it byte by byte with the package built from the repository (`apps/botai/scripts/reproduzir-fontes.sh`).

## Build

From the root of this archive:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @pilutech/botai exec wxt zip -b firefox
```

Output:

- unpacked: `apps/botai/.output/firefox-mv3/`
- package: `apps/botai/.output/botai-<version>-firefox.zip`

Both are identical to the submitted package.

The Opera package is built the same way with `-b opera` instead of `-b firefox` (`apps/botai/.output/opera-mv3/`). Its own code is not minified.

## Third-party code

The bundles include React, React DOM and Font Awesome from npm, at the versions locked in `pnpm-lock.yaml`. The `web-ext lint` warnings (`UNSAFE_VAR_ASSIGNMENT`) all come from `react-dom` and `@fortawesome/fontawesome-svg-core` in the popup chunk.

## What the extension does

Botaí generates a fake Brazilian test identity (CPF, CNPJ, CEP, name, e-mail) and fills the form in the active tab when the user clicks the toolbar button, presses the keyboard shortcut or picks an item in the context menu (`activeTab` + `scripting`). The generated identity is stored only in `storage.local`. No data is sent anywhere, and the extension loads no remote code.

The `menus` permission (Firefox only) is used for `menus.getTargetElement`, so that "Inserir" (Insert) writes into the field that was right-clicked.
````

- [ ] **Step 4: Ver passar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && make zip-botai; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && V=$(node -p "require('./package.json').version") && /usr/bin/unzip -Z1 .output/botai-$V-sources.zip | /usr/bin/grep -E '^(apps/botai|packages/tools|packages/ui)/LICENSE$|^apps/botai/SOURCE-CODE-REVIEW\.md$'; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && node -p "[require('./apps/botai/package.json').license, require('./packages/tools/package.json').license, require('./packages/ui/package.json').license].join(' ')"; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && V=$(node -p "require('./apps/botai/package.json').version") && /usr/local/bin/docker run --rm -v "$PWD:/repo:ro" node:24.14.0 bash /repo/apps/botai/scripts/reproduzir-fontes.sh "/repo/apps/botai/.output/botai-$V-sources.zip" "/repo/apps/botai/.output/botai-$V-firefox.zip"; echo "exit=$?"
```

Expected: `exit=0`; as 4 linhas (`apps/botai/LICENSE`, `apps/botai/SOURCE-CODE-REVIEW.md`, `packages/tools/LICENSE`, `packages/ui/LICENSE`); `MIT MIT MIT`; e `IDENTICO` de novo (o Tailwind varre os arquivos novos dos dois lados igual).

- [ ] **Step 5: Prettier, lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/prettier --check SOURCE-CODE-REVIEW.md package.json ../../packages/tools/package.json ../../packages/ui/package.json; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @pilutech/botai lint && $P --filter @piluvitu/ui lint && $P --filter @piluvitu/tools lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/LICENSE apps/botai/SOURCE-CODE-REVIEW.md apps/botai/package.json packages/tools/LICENSE packages/tools/package.json packages/ui/LICENSE packages/ui/package.json && /usr/bin/git commit -m "docs(botai): licença MIT do Botaí e dos pacotes que ele empacota, e instruções de build para os revisores"; echo "exit=$?"
```

Expected: `exit=0` nos três (se o prettier reclamar, rode `./node_modules/.bin/prettier --write` nos mesmos arquivos e confira de novo).

---

### Task 12: CI — builds de Firefox e Opera no `ci.yml` e o job `pacotes`

**Files:**

- Modify: `.github/workflows/ci.yml:197-223` (job `botai`)
- Create: `.github/workflows/botai-release.yml`
- Test: `actionlint` (com `shellcheck`) nos dois workflows; o `botai-e2e.yml` conferido sem mudança

**Interfaces:**

- Consumes: scripts `build:firefox`, `build:opera`, `lint:firefox`, `zip` (Tasks 2, 3, 10) e `apps/botai/scripts/reproduzir-fontes.sh` (Task 10).
- Produces: workflow `botai-release.yml` com o job `pacotes` e o artifact `botai-zips` (a fase 3 acrescenta a tag, o Release e o job `lojas`, que baixa esse artifact).

- [ ] **Step 1: Ver o workflow faltar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev && /opt/homebrew/bin/actionlint .github/workflows/botai-release.yml; echo "exit=$?"`
Expected: erro de arquivo inexistente e `exit≠0`.

- [ ] **Step 2: Job `botai` do `ci.yml`**

Troque o nome e o `timeout-minutes` do job e acrescente três passos depois do `Build (+ gate do @source em .output/chrome-mv3)`:

```yaml
botai:
  name: Botaí (lint + test + builds de Chrome, Firefox e Opera + web-ext lint)
  runs-on: ubuntu-latest
  timeout-minutes: 20
```

```yaml
- name: Build do Firefox (+ gate do @source em .output/firefox-mv3)
  run: pnpm --filter @pilutech/botai run build:firefox

- name: Build do Opera, sem minificar (+ gate do @source em .output/opera-mv3)
  run: pnpm --filter @pilutech/botai run build:opera

# O addons-linter é o validador da AMO; falha só em erro (os avisos vêm do react-dom e do Font Awesome).
- name: web-ext lint no build do Firefox
  run: pnpm --filter @pilutech/botai run lint:firefox
```

- [ ] **Step 3: `botai-release.yml` (só o job `pacotes` nesta fase)**

`.github/workflows/botai-release.yml` (portado do rascunho validado pelo actionlint na `publicacao.md` §5.3, sem o que é da fase 3):

```yaml
name: Botaí Release

# Fora do `CI` de propósito: o deploy do finanças espera o `CI` inteiro passar,
# e a reprodução das fontes não pode segurá-lo.
on:
  pull_request:
    branches: [main]
    paths:
      - 'apps/botai/**'
      - 'packages/tools/**'
      - 'packages/ui/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - '.npmrc'
      - 'scripts/check-tailwind-source.mjs'
      - '.github/workflows/botai-release.yml'
  workflow_dispatch:

concurrency:
  group: botai-release-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

jobs:
  pacotes:
    name: Botaí (verificação + 3 pacotes + reprodução das fontes)
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Versão (apps/botai/package.json)
        id: versao
        run: echo "versao=$(node -p "require('./apps/botai/package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Lint (wxt prepare + tsc + eslint)
        run: pnpm --filter @pilutech/botai run lint

      - name: Test (vitest)
        run: pnpm --filter @pilutech/botai run test

      - name: Pacotes de Chrome e Edge, Firefox e Opera + zip de fontes (gates do @source inclusos)
        run: pnpm --filter @pilutech/botai run zip

      - name: web-ext lint no build do Firefox
        run: pnpm --filter @pilutech/botai run lint:firefox

      # O ambiente do revisor da AMO: o pacote acima sai do Node 22; a reprodução roda no 24.14.0.
      - uses: actions/setup-node@v4
        with:
          node-version: '24.14.0'

      - name: Reprodução das fontes (pasta limpa, cmp byte a byte)
        env:
          VERSAO: ${{ steps.versao.outputs.versao }}
        run: >-
          bash apps/botai/scripts/reproduzir-fontes.sh
          "apps/botai/.output/botai-$VERSAO-sources.zip"
          "apps/botai/.output/botai-$VERSAO-firefox.zip"

      # `.output` começa com ponto, e o upload-artifact ignora pasta oculta.
      - name: Separar os pacotes
        run: |
          mkdir -p botai-zips
          cp apps/botai/.output/*.zip botai-zips/

      - uses: actions/upload-artifact@v4
        with:
          name: botai-zips
          path: botai-zips/
          if-no-files-found: error
          retention-days: 30
```

Os caminhos `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` e `scripts/check-tailwind-source.mjs` estão no gatilho porque entram no zip de fontes: mudá-los pode quebrar a reprodução.

- [ ] **Step 4: Validar os workflows**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /opt/homebrew/bin/actionlint .github/workflows/ci.yml .github/workflows/botai-release.yml .github/workflows/botai-e2e.yml; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git diff --quiet -- .github/workflows/botai-e2e.yml && /usr/bin/grep -n 'run: pnpm --filter @pilutech/botai run test:e2e' .github/workflows/botai-e2e.yml; echo "exit=$?"
```

Expected: `exit=0` no `actionlint` (o `shellcheck` em `/opt/homebrew/bin` roda junto); o `botai-e2e.yml` sem diff e ainda chamando só o `test:e2e` (que já builda Firefox e Opera desde a Task 2), `exit=0`.

- [ ] **Step 5: Simular localmente o que o job `pacotes` roda**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @pilutech/botai run lint && $P --filter @pilutech/botai run test && $P --filter @pilutech/botai run zip && $P --filter @pilutech/botai run lint:firefox; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && V=$(node -p "require('./apps/botai/package.json').version") && /usr/local/bin/docker run --rm -v "$PWD:/repo:ro" node:24.14.0 bash /repo/apps/botai/scripts/reproduzir-fontes.sh "/repo/apps/botai/.output/botai-$V-sources.zip" "/repo/apps/botai/.output/botai-$V-firefox.zip"; echo "exit=$?"
```

Expected: `exit=0` nos dois, com `IDENTICO`. O job no GitHub só roda quando o dono der push e abrir o PR (este plano não faz push).

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add .github/workflows/ci.yml .github/workflows/botai-release.yml && /usr/bin/git commit -m "ci(botai): builds de Firefox e Opera com web-ext lint no CI, e o job pacotes com a reprodução das fontes"; echo "exit=$?"
```

---

### Task 13: Documentação (`apps/botai/CLAUDE.md`, README, `CLAUDE.md` raiz e dos pacotes)

**Files:**

- Modify: `apps/botai/CLAUDE.md`
- Modify: `apps/botai/README.md`
- Modify: `CLAUDE.md` (raiz)
- Modify: `packages/ui/CLAUDE.md`, `packages/tools/CLAUDE.md` (a licença e o zip de fontes, que agora os incluem)
- Test: prettier sem diferença e os fatos conferidos contra o código (Step 5)

**Interfaces:**

- Consumes: tudo das Tasks 1–12.
- Produces: o checklist manual de Firefox, Edge e Opera que o dono roda (Task 14).

- [ ] **Step 1: `apps/botai/CLAUDE.md`, cabeçalho, "O que faz", "Estrutura" e "Fluxos"**

0. No bloco de "Estrutura", troque a linha `src/lib/ …` por `src/lib/                          armazenamento, menus, mensagens, navegador (detector e página de atalhos), páginas proibidas, soma dos frames, textos, data de hoje` e acrescente, no fim do bloco, a linha `scripts/reproduzir-fontes.sh      reconstrói o pacote do Firefox a partir do zip de fontes e compara byte a byte (CI e Docker)`.

1. Troque o parágrafo que começa com "Extensão Chrome MV3 **Botaí**" por:

```markdown
Extensão MV3 **Botaí** para Chrome, Edge, Opera e Firefox, com o mesmo código: "Gerador de dados fake para formulários (CPF, CNPJ, CEP)". O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz. Specs: `docs/superpowers/specs/2026-10-01-extensao-dados-teste-design.md` (a extensão) e `docs/superpowers/specs/2026-10-01-botai-multinavegador-design.md` (navegadores, lojas e release). Contratos de nomes entre as fases: `docs/superpowers/plans/2026-10-01-extensao-interfaces.md` e `docs/superpowers/plans/2026-10-01-botai-multinavegador-interfaces.md`. Pesquisa (protótipos, medições e relatórios): `docs/superpowers/research/2026-10-01-extensao-dados-teste/` e `docs/superpowers/research/2026-10-01-botai-multinavegador/`. Para quem usa (o que é, instalar, usar): `README.md`; o detalhe técnico mora aqui.
```

2. No item "Modo A", troque "(comando `botai-preencher`: `⌥⇧P` no Mac, `Ctrl+Shift+Y` no Windows e no Linux)" por "(comando `botai-preencher`: `⌥⇧P` no Mac, `Ctrl+Shift+Y` no Windows e no Linux, `Alt+Shift+P` no Firefox para Linux)".

3. Troque a linha "Distribuição: só o dono, carregada sem empacotar a partir de `.output/chrome-mv3`. Fora: Firefox, `wxt zip`, Chrome Web Store." por:

```markdown
Distribuição: as 4 lojas (Chrome Web Store, Firefox Add-ons em canal listed, Microsoft Edge Add-ons e Opera Add-ons) a partir da versão 1.0.0, com a publicação da fase 3 da spec multinavegador; até lá, carregada sem empacotar (ver "Navegadores"). Fora: Safari, Firefox para Android e listagem em inglês (`_locales`).
```

4. No item "**Inserir (modo B):**" de "Fluxos", acrescente ao fim:

```markdown
No Firefox, o clique do menu traz `info.targetElementId`: o background o repassa como 3º argumento (`__botai.inserir(pessoa, kind, alvoId)`, `null` nos Chromium) e o content script pega o campo por `browser.menus.getTargetElement(alvoId)` (permissão `menus`, só no manifesto do Firefox, sem aviso na instalação). O foco fica como reserva: id expirado, elemento que saiu da página ou Chromium, que não manda o id.
```

5. Troque o item "**Página proibida:**" de "Fluxos" por:

```markdown
- **Página proibida:** o popup decide só pela URL, pelo navegador atual (`situacaoDaUrl(url, acessoArquivo, detectarNavegador())`). Os esquemas `chrome:`, `chrome-extension:`, `edge:`, `opera:`, `about:`, `view-source:`, `devtools:`, `data:`, `moz-extension:` e `resource:` valem em todos (um esquema de um navegador não aparece em outro). Os sites valem só no próprio navegador: a Chrome Web Store no Chrome, no Edge e no Opera; `microsoftedge.microsoft.com` só no Edge; `addons.opera.com` só no Opera; e os 11 hosts da pref `extensions.webextensions.restrictedDomains` do Firefox (addons.mozilla.org, accounts.firefox.com, support.mozilla.org…), por host exato, só no Firefox. `file:` sem a opção de acesso a arquivos vira `arquivo-sem-acesso` (no Firefox a opção existe a partir do 153, e só então o `isAllowedFileSchemeAccess()` a reflete). O activeTab sempre libera a URL da aba, sem a permissão `tabs`. O leitor de PDF só é detectado quando um "Preencher" falha (`contentType === 'application/pdf'` no frame 0 ou uma recusa do navegador). As recusas são uma lista única (`Cannot access …` e `… cannot be scripted` dos Chromium, `Missing host permission for the tab` do Firefox): uma mensagem de um navegador nunca vem de outro.
- **`InjectionResult.error` (só o Firefox):** no Firefox, uma exceção dentro da `func` do `executeScript` volta no resultado e a Promise resolve; no Chrome ela rejeita. O `exigirSemErro` de `acoes.ts` iguala os dois: no frame 0 (e, no Inserir, no frame do clique) o erro vira `throw` dentro do `try` e vai ao 1e só se casar `erroEhPaginaProibida`, senão sobe como no Chrome; nos outros frames conta como `result: null`. O erro chega como `Error`, string ou objeto com `message` (`comoErro`). Sem isso, um defeito do Botaí no Firefox aparecia como "Nenhum campo nesta página", em silêncio.
```

6. No item "**Menus:**" de "Fluxos", acrescente: "No Firefox todo item soma o contexto `'password'`, porque lá `editable` não inclui campo de senha (o Chrome recusaria esse contexto); os contextos são calculados dentro do `criarMenus` (`contextos()`), e não em constante de módulo, para o `vi.stubEnv` alcançá-los."

- [ ] **Step 2: `apps/botai/CLAUDE.md`, "Popup", "Stack" e seções novas**

1. Em "Popup", troque o item "O atalho exibido vem de `commands.getAll()`…" por:

```markdown
- O atalho exibido vem de `commands.getAll()`; vazio (tecla tomada por outro app) ⇒ o rodapé vira "definir atalho" e o chip do botão some. "alterar"/"definir atalho": no Firefox, `browser.commands.openShortcutSettings()` (Firefox 137+; ali o `tabs.create` com `chrome://` ou `about:addons` dá "Illegal URL"); nos Chromium, `PAGINA_DE_ATALHOS[navegador]` de `src/lib/navegador.ts`, hoje `chrome://extensions/shortcuts` nos três (o checklist do Edge e do Opera confirma; o plano B é `edge://`/`opera://extensions/shortcuts`). No Mac, o Firefox devolve o atalho como texto (`Alt+Shift+P`), e o Chrome como `⌥⇧P`.
- **Textos do 1e e do `file:` por navegador:** o mapa `TEXTOS` de `src/components/pagina-proibida.tsx`, escolhido pela prop `navegador` que o `App` tira do `detectarNavegador()`. O do Chrome é o de sempre; os rótulos pt-BR da opção de arquivos do Edge, do Opera e do Firefox estão no checklist manual para conferir.
```

2. Em "Stack e configuração", troque o começo do item "**`minimum_chrome_version: '123'`**" por "**`minimum_chrome_version: '123'`** (só nos Chromium; o manifesto do Firefox leva `browser_specific_settings.gecko` no lugar)" e, no item "**Atalho por sistema…**", acrescente ao fim: "No Firefox para Linux, `Ctrl+Shift+Y` abre os Downloads (`key_openDownloads` com `accel,shift` só no GNOME) e o Firefox também não cede a tecla: lá o manifesto soma `linux: 'Alt+Shift+P'`." Acrescente estes itens à mesma seção:

```markdown
- **Multinavegador no `wxt.config.ts`:** `manifestVersion: 3` (sem ele o `-b firefox` gera MV2, com `background.scripts` + `browser_action`); `targetBrowsers: ['chrome', 'firefox', 'opera']` (o `-b edge` sairia idêntico byte a byte ao Chrome, por isso o Edge usa o build do Chrome); `homepage_url: 'https://piluvitu.com.br/pilulabs/botai'` em todos; no Firefox, `gecko.id: 'botai@pilutech.com.br'` (permanente depois da 1ª assinatura), `strict_min_version: '153.0'` (o `documentIds` do "Mostrar na página" e o `isAllowedFileSchemeAccess` real só existem a partir do 153; o ESR 140 acaba em 13/10/2026), `data_collection_permissions: { required: ['none'] }` (obrigatório na AMO para extensão nova) e a permissão `menus`; sem `gecko_android` (só desktop). No Firefox MV3 o WXT gera `background.scripts` (event page), não `service_worker`.
- **Opera sem minificar** (`vite.build.minify: false` só no `-b opera`): a loja do Opera recusa código próprio minificado ("this rule doesn't apply to third-party libraries"). O build sai com ~1,2 MB contra ~660 KB do Chrome; o `manifesto.e2e.ts` exige o nome `preencherPagina` legível no `opera-mv3/background.js` e o mesmo manifesto do Chrome.
- **Ramos por navegador:** `import.meta.env.FIREFOX`/`OPERA` são `define` do Vite (constantes de compilação): o bundle do Chrome não carrega o código do Firefox e vice-versa. O Edge e o Opera que instala pela Chrome Web Store rodam o zip do Chrome, por isso o `detectarNavegador()` olha `navigator.userAgentData.brands` ("Microsoft Edge", "Opera…") em tempo de execução; marca desconhecida (Brave, Vivaldi) cai no Chrome. Os tipos do `@wxt-dev/browser` 0.3.4 não têm `menus`, `targetElementId`, `openShortcutSettings` nem `InjectionResult.error`: cada uso tem um cast local.
- **`browser.dom` não existe no Firefox:** a raiz sombra fechada vem do **atributo** `el.openOrClosedShadowRoot` (não é método: com `()` dá "is not a function"), só em content scripts. Sem o adaptador de `dom.ts`, o Firefox 157 preenchia 0 campos em silêncio (`T.dom is undefined` no `InjectionResult.error`).
- **`@source not` dos testes (armadilha do zip de fontes):** o WXT sempre exclui `**/*.test.*` do zip de fontes, sem opção de desligar; como os testes têm classes Tailwind (`.container`, `.ring`, `.invisible`), o CSS reconstruído pelo revisor da AMO saía com 14 regras a menos e o `cmp` falhava. As duas linhas `@source not` do `styles.css` (testes do app e do `packages/ui`) deixam o CSS igual dos dois lados. Stories e E2E entram no zip e continuam varridos (o Storybook não perde classe).
```

3. No item "**Gate do design system**", acrescente: "Os scripts `build:firefox`, `build:opera`, `zip`, `zip:firefox` e `zip:opera` rodam o mesmo gate contra `.output/firefox-mv3` e `.output/opera-mv3`."

4. Depois de "Stack e configuração", acrescente as duas seções:

```markdown
## Navegadores

|                     | Chrome                                   | Edge                   | Opera                                              | Firefox                                     |
| ------------------- | ---------------------------------------- | ---------------------- | -------------------------------------------------- | ------------------------------------------- |
| Build               | `.output/chrome-mv3` (`build`)           | o do Chrome            | `.output/opera-mv3` (`build:opera`), sem minificar | `.output/firefox-mv3` (`build:firefox`)     |
| Versão mínima       | 123                                      | Chromium 123           | Opera 109 (Chromium 123)                           | 153.0                                       |
| Atalho              | `Ctrl+Shift+Y` / `⌥⇧P` no Mac            | igual                  | igual                                              | igual, mais `Alt+Shift+P` no Linux          |
| Detecção            | `userAgentData.brands` (o resto)         | marca "Microsoft Edge" | `OPERA` no build; marca "Opera…" pela CWS          | `FIREFOX` no build                          |
| Raiz sombra fechada | `browser.dom.openOrClosedShadowRoot(el)` | igual                  | igual                                              | atributo `el.openOrClosedShadowRoot`        |
| Exceção na `func`   | rejeita                                  | rejeita                | rejeita                                            | `InjectionResult.error` (`exigirSemErro`)   |
| Recusa da página    | `Cannot access …` / `cannot be scripted` | igual                  | igual                                              | `Missing host permission for the tab`       |
| Inserir             | foco                                     | foco                   | foco                                               | `menus.getTargetElement`, foco como reserva |
| Menu em senha       | `editable` inclui                        | igual                  | igual                                              | contexto `'password'`                       |
| "alterar" atalho    | `chrome://extensions/shortcuts`          | idem (conferir)        | idem (conferir)                                    | `commands.openShortcutSettings()`           |

O E2E funcional roda só no Chromium do Playwright (que cobre o código de Chrome, Edge e Opera, idêntico salvo a minificação); Firefox, Edge e Opera reais ficam nos checklists manuais abaixo. Um teste de fumaça no Firefox com Puppeteer + WebDriver BiDi foi provado na pesquisa (`firefox-opera.md` §5), mas fica fora, sem dependência nova, até provar que roda em Linux.

## Pacotes, fontes da AMO e CI

- **`make zip-botai`** (`pnpm --filter @pilutech/botai zip`): `wxt zip` dos 3 navegadores, cada um com o gate, em `.output/`: `botai-<versão>-chrome.zip` (Chrome **e** Edge), `-firefox.zip`, `-opera.zip` e `-sources.zip` (o WXT o gera no zip do Firefox e de novo no do Opera, com o mesmo conteúdo). `zip.name: 'botai'` porque o padrão vira `pilutechbotai-…`.
- **Zip de fontes:** `sourcesRoot` na raiz do monorepo, com `includeSources` (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` — arquivo oculto só entra citado pelo nome —, `scripts/check-tailwind-source.mjs`, `apps/botai/**`, `packages/tools/**`, `packages/ui/**`) e `excludeSources` (`apps/botai/.output/**` e `apps/botai/.wxt/**`, que a exclusão automática do outDir não pega com `sourcesRoot` na raiz, mais `storybook-static`, `test-results` e `playwright-report`). O zip padrão (só `apps/botai`) não reconstrói nada: falta o lockfile, o `packageManager` e os `packages/*`.
- **Reprodução:** `apps/botai/scripts/reproduzir-fontes.sh <sources.zip> <firefox.zip>` faz o que o revisor faz (pasta limpa, `corepack enable`, `pnpm install --frozen-lockfile`, `wxt zip -b firefox`, `diff -r` + `cmp`). Local, no ambiente do revisor (Linux arm64, Node 24.14.0), depois do `make zip-botai`:
  `V=$(node -p "require('./apps/botai/package.json').version") && docker run --rm -v "$PWD:/repo:ro" node:24.14.0 bash /repo/apps/botai/scripts/reproduzir-fontes.sh "/repo/apps/botai/.output/botai-$V-sources.zip" "/repo/apps/botai/.output/botai-$V-firefox.zip"` (da raiz). Mudou um comando do build? Mude no script **e** no `SOURCE-CODE-REVIEW.md`, que o revisor segue.
- **`SOURCE-CODE-REVIEW.md`** (em inglês, exceção à regra pt-BR): as instruções para o revisor da AMO e do Opera; entra no zip de fontes por `apps/botai/**`.
- **`lint:firefox`** (`web-ext lint`, web-ext **10.7.0 fixado**, o mesmo addons-linter da AMO; rode o `build:firefox` antes): falha só em erro. Hoje dá 0 erros e 6 avisos `UNSAFE_VAR_ASSIGNMENT`, todos do react-dom e do Font Awesome no chunk do popup; por eles, `--warnings-as-errors` não dá. A árvore do web-ext (328 pacotes) não tem script de instalação: nada no `allowBuilds`.
- **CI:** o job `botai` do `ci.yml` builda Chrome, Firefox e Opera (com os gates) e roda o `lint:firefox`; o `botai-e2e.yml` roda o `test:e2e`, que builda os três antes do Playwright. O `botai-release.yml` tem, nesta fase, só o job `pacotes` (em PR que toca `apps/botai/**`, `packages/tools/**`, `packages/ui/**`, os arquivos da raiz que entram no zip de fontes ou o próprio workflow, e à mão): lint, Vitest, `zip`, `lint:firefox`, troca para o Node 24.14.0, reprodução das fontes e o artifact `botai-zips` (copiado para fora de `.output`, que o `upload-artifact` ignora por ser pasta oculta). A tag `botai-v*`, o GitHub Release e o job `lojas` entram na fase 3.
- **`.env.submit`** está no `.gitignore` da raiz: o `wxt submit` lê esse arquivo sozinho.
- **Licença:** MIT (© PiluTech) em `apps/botai`, `packages/tools` e `packages/ui` (este com o aviso do shadcn), e `"license": "MIT"` nos três `package.json`. Não vale para o resto do monorepo.
```

- [ ] **Step 3: `apps/botai/CLAUDE.md`, "Testes", "Comandos", checklists e riscos**

1. Em "Testes", acrescente:

```markdown
- **Ramos do Firefox e do Opera no Vitest:** `import.meta.env.FIREFOX`/`OPERA` ficam `undefined` no Vitest (inclusive com `WxtVitest({ browser: 'firefox' })`), então o padrão é o ramo Chromium. Para o Firefox: `vi.stubEnv('FIREFOX', 'true')` e `vi.unstubAllEnvs()` no `afterEach`; o código precisa ler a constante **dentro** da função (uma constante de módulo é avaliada no import, antes do stub). O detector usa `vi.stubGlobal('navigator', …)`; o `App.test.tsx`, que precisa do `navigator` real (o user-event pendura o clipboard nele), simula o Edge com `Object.defineProperty(navigator, 'userAgentData', …)`. O `fakeBrowser` não tem `menus`: os testes do Inserir o penduram com `Object.assign(fakeBrowser, { menus: … })` e o tiram no `afterEach`.
- **Manifestos no Playwright:** o `manifesto.e2e.ts` cobre os três builds (Chrome, Firefox com `gecko`/`menus`/atalho do Linux, Opera com o manifesto do Chrome e o código legível) e lê a versão do `package.json`.
```

e troque "fora do `CI`, que só tem lint + Vitest + build da extensão" por "fora do `CI`, que tem lint + Vitest + os builds de Chrome, Firefox e Opera + `web-ext lint`".

2. Na tabela de "Comandos", troque a linha do `make test-e2e-botai` por `| make test-e2e-botai | builds de Chrome, Firefox e Opera + build e2e + Playwright |` e acrescente:

```markdown
| `make zip-botai` | os 3 pacotes + o zip de fontes em `.output/` (gates inclusos) |
| `pnpm --filter @pilutech/botai build:firefox` | build do Firefox + gate em `.output/firefox-mv3` |
| `pnpm --filter @pilutech/botai build:opera` | build do Opera sem minificar + gate em `.output/opera-mv3` |
| `pnpm --filter @pilutech/botai lint:firefox` | `web-ext lint` em `.output/firefox-mv3` (rode o `build:firefox` antes) |
```

3. Renomeie a seção "## Checklist manual (primeira carga sem empacotar, e a cada mudança em injeção, menu ou atalho)" para "## Checklist manual: Chrome (primeira carga sem empacotar, e a cada mudança em injeção, menu ou atalho)" e, depois dela, acrescente:

```markdown
## Checklist manual: Firefox (153 ou mais novo)

O Playwright não carrega extensão no Firefox: tudo aqui é à mão. Precisa de um Firefox 153+ instalado (por exemplo `brew install --cask firefox`).

1. `pnpm --filter @pilutech/botai build:firefox` e, em `about:debugging#/runtime/this-firefox`, "Carregar extensão temporária…" apontando para `apps/botai/.output/firefox-mv3/manifest.json` (a carga temporária some quando o Firefox fecha).
2. A página de teste do item 2 do checklist do Chrome (`http://localhost:8019/cadastro.pagina.html`).
3. O gesto real, um de cada vez, recarregando a página entre eles:
   - ícone → "Gerar pessoa" (se for a primeira vez) → "Preencher esta página": o aviso mostra **"21 de 23 campos preenchidos"** (`ref_code` e `select#origem` não reconhecidos), igual ao Chrome;
   - o atalho sem abrir o popup: `⌥⇧P` no Mac, `Ctrl+Shift+Y` no Windows e **`Alt+Shift+P` no Linux** (lá o `Ctrl+Shift+Y` abre os Downloads);
   - **sem clicar antes no campo**, botão direito em "Código de indicação" → `Botaí › Inserir › CPF`: o CPF entra naquele campo (prova o `menus.getTargetElement`).
4. Botão direito num campo de **senha**: o menu `Botaí ›` aparece e `Inserir › Senha` escreve a senha.
5. 1c: preencher pelo popup; a mira de "Código de indicação" rola a página e o contorno âmbar pisca.
6. Popup no painel real: cantos arredondados, as fontes Plus Jakarta e JetBrains, e o crédito "Powered by PiluTech" visível no fim.
7. "alterar" no rodapé do 1b abre a tela de atalhos de extensões do Firefox, com "Preencher esta página" e o atalho do sistema.
8. 1e: popup em `about:addons` e em `https://addons.mozilla.org/` → "O Firefox não deixa extensões mexerem nesta página", com cadeado; o atalho nessas páginas não faz nada.
9. `file:`: abrir `apps/botai/src/entrypoints/preencher.content/cadastro.pagina.html` direto do disco → 1e "Falta liberar o acesso a arquivos", com `about:addons`. Ligar o acesso a arquivos locais nos detalhes do Botaí em `about:addons`, reabrir o popup → 1b, e o "Preencher" funciona. **Confira o rótulo e o lugar reais da opção em pt-BR**: se diferirem de "Acessar arquivos locais no seu computador" e "nos detalhes da extensão", corrija `TEXTOS.firefox` em `src/components/pagina-proibida.tsx` (e o teste e a story).
10. PDF aberto no leitor do Firefox: o "Preencher" leva ao 1e.
11. Inserir num iframe de outro domínio (o item 11 do checklist do Chrome): aviso "Não deu para inserir aqui: iframe de outro domínio".
12. Janela privada: sem a permissão "Executar em janelas privativas" (em `about:addons`) a extensão não aparece lá; com ela, o "Preencher" funciona.
13. CSP de estilo estrita: `mkdir -p /tmp/botai-csp && printf '%s' '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="style-src '"'"'self'"'"'"><label>CPF <input name="cpf"></label>' > /tmp/botai-csp/index.html && cd /tmp/botai-csp && python3 -m http.server 8020`, abrir `http://localhost:8020/` e preencher: o aviso aparece estilizado. Se aparecer sem estilo, registre em "Riscos e limites conhecidos".

## Checklist manual: Edge (o zip do Chrome)

1. `make build-botai` e, em `edge://extensions`, ligar o "Modo de desenvolvedor" e "Carregar sem pacote" apontando para `apps/botai/.output/chrome-mv3` (o conteúdo do zip do Chrome, que é o que vai à loja do Edge).
2. A página de teste e os três gestos do checklist do Chrome: "21 de 23 campos preenchidos", o atalho (`Ctrl+Shift+Y` no Windows, `⌥⇧P` no Mac) e o Inserir pelo menu.
3. `edge://extensions/shortcuts` mostra "Preencher esta página" com o atalho; se o Edge tomou a tecla, o rodapé do popup mostra "definir atalho".
4. "alterar" no rodapé abre a página de atalhos. **Se não abrir**, troque `PAGINA_DE_ATALHOS.edge` em `src/lib/navegador.ts` para `'edge://extensions/shortcuts'`, ajuste o teste do `navegador.test.ts` e o do Edge no `App.test.tsx`, rode `make build-botai`, recarregue e confira de novo.
5. 1e em `edge://settings`: "O Edge não deixa extensões mexerem nesta página" (prova a detecção por `userAgentData.brands`), sem rodapé e com cadeado.
6. Loja do Edge (`https://microsoftedge.microsoft.com/addons/`): o popup abre no 1e. Depois tente o atalho lá: se o Edge **deixar** preencher a própria loja, tire a loja do Edge do `SITE_PROIBIDO.edge` em `src/lib/paginas.ts` (e o teste).
7. Chrome Web Store dentro do Edge (`https://chromewebstore.google.com/`): a mesma prova do item 6, para a entrada `lojaDoChrome` do `SITE_PROIBIDO.edge`.
8. `file:`: 1e "Falta liberar o acesso a arquivos" com `edge://extensions`; ligar a opção nos detalhes da extensão → 1b, e o "Preencher" funciona. Se o rótulo pt-BR do Edge diferir de "Permitir acesso a URLs de arquivo", corrija `TEXTOS.edge` em `pagina-proibida.tsx` (e o teste e a story).
9. PDF no leitor do Edge: o "Preencher" leva ao 1e.

## Checklist manual: Opera (quando houver um Opera na máquina)

1. `pnpm --filter @pilutech/botai build:opera` e, em `opera://extensions`, "Modo de desenvolvedor" → "Carregar sem compactação" apontando para `apps/botai/.output/opera-mv3` (o build sem minificar que vai à loja do Opera).
2. A página de teste, os três gestos e "21 de 23"; confira que o Opera não tomou o atalho.
3. "alterar" abre a página de atalhos (`PAGINA_DE_ATALHOS.opera`; se não abrir, `'opera://extensions/shortcuts'`, como no item 4 do Edge).
4. 1e em `opera://settings` → "O Opera não deixa extensões mexerem nesta página"; em `https://addons.opera.com/` também. Se o Opera deixar preencher a própria loja, tire a entrada de `SITE_PROIBIDO.opera`.
5. `file:` e o rótulo pt-BR da opção, como no item 8 do Edge (`TEXTOS.opera`).
```

4. Em "Riscos e limites conhecidos", acrescente:

```markdown
- **Firefox, Edge e Opera sem E2E funcional:** o Playwright só carrega a extensão no Chromium; o comportamento real nos outros fica nos checklists manuais. A página de atalhos e a detecção no Edge e no Opera, e as lojas do Edge e do Opera como páginas proibidas, são SUPOSTAS até o checklist passar.
- **Opera pela Chrome Web Store:** quem instala o zip do Chrome no Opera roda o código minificado e se identifica pela marca "Opera" do `userAgentData`; só a loja do Opera exige o build sem minificar.
```

- [ ] **Step 4: `apps/botai/README.md`, `CLAUDE.md` raiz e os dos pacotes**

`apps/botai/README.md`:

1. Troque "É uma extensão do Google Chrome (Manifest V3) para quem desenvolve e testa formulários brasileiros." por "É uma extensão de navegador (Manifest V3) para Chrome, Edge, Opera e Firefox, para quem desenvolve e testa formulários brasileiros."
2. Troque a seção "## Como instalar (sem empacotar)" inteira por:

```markdown
## Como instalar

As versões das lojas (Chrome Web Store, Firefox Add-ons, Microsoft Edge Add-ons e Opera Add-ons) chegam com a 1.0.0. Até lá, a partir do código, na raiz do monorepo:

**Chrome e Edge**

1. Rode `make build-botai`.
2. Em `chrome://extensions` (no Edge, `edge://extensions`), ligue o "Modo do desenvolvedor" e clique em "Carregar sem compactação".
3. Escolha a pasta `apps/botai/.output/chrome-mv3`.

**Opera**

1. Rode `pnpm --filter @pilutech/botai build:opera`.
2. Em `opera://extensions`, ligue o "Modo de desenvolvedor" e carregue a pasta `apps/botai/.output/opera-mv3`.

**Firefox (153 ou mais novo)**

1. Rode `pnpm --filter @pilutech/botai build:firefox`.
2. Em `about:debugging#/runtime/this-firefox`, clique em "Carregar extensão temporária…" e escolha `apps/botai/.output/firefox-mv3/manifest.json`. A extensão some quando o Firefox fecha.
```

3. Em "## Como usar", troque "`⌥⇧P` no Mac ou `Ctrl+Shift+Y` no Windows e no Linux" por "`⌥⇧P` no Mac ou `Ctrl+Shift+Y` no Windows e no Linux (no Firefox para Linux, `Alt+Shift+P`)".
4. Antes da linha "Detalhes técnicos…", acrescente:

```markdown
## Licença

MIT, © PiluTech (veja o [`LICENSE`](./LICENSE)). Vale para o Botaí e para os pacotes que ele empacota (`packages/tools` e `packages/ui`), não para o resto deste repositório.
```

`CLAUDE.md` (raiz):

1. Na tabela de workspaces, troque a célula "Cobre" do `apps/botai` por: "**Botaí** (`@pilutech/botai`), extensão MV3 para Chrome, Edge, Opera e Firefox (WXT + React 19 + `@piluvitu/ui`): gera a pessoa de teste e preenche formulários (atalho `Ctrl+Shift+Y`/`⌥⇧P`, popup, menu `Inserir`), content script sob demanda, aviso na página, 3 builds e o zip de fontes reproduzível da AMO, Vitest + Storybook próprio (6018) + Playwright". (Corrige também o `Alt+Shift+P` antigo.)
2. No item `apps/botai` de "Tech Stack", troque "**extensão Chrome MV3**" por "**extensão MV3 para Chrome, Edge, Opera e Firefox**, com o mesmo código (o Edge usa o build do Chrome; o Opera sai sem minificar)" e troque "Por enquanto só o dono, carregada sem empacotar." por "Licença MIT, só nela e nos pacotes que ela empacota. Publicação nas 4 lojas a partir da 1.0.0 (fase 3 da spec multinavegador)."
3. No item "**GitHub Actions**" de "Tech Stack", acrescente "; `botai-e2e.yml` e `botai-release.yml` para a extensão".
4. Na tabela de "Commands", troque a linha do `make test-e2e-botai` por "builds de Chrome, Firefox e Opera + build `--mode e2e` + Playwright com a extensão desempacotada" e acrescente `| make zip-botai | Os 3 pacotes do Botaí (Chrome e Edge, Firefox, Opera) + o zip de fontes da AMO em apps/botai/.output/ |`.
5. No item "**Amarrado em:**" do "Gate do design system", acrescente ao fim: "Os scripts `build:firefox`, `build:opera` e `zip`/`zip:*` do Botaí rodam o mesmo gate em `.output/firefox-mv3` e `.output/opera-mv3`."
6. Na tabela "Workflows GitHub Actions": no `ci.yml`, troque o trecho do botai por "botai (`wxt prepare` + `tsc --noEmit` + `eslint` + `vitest` + `wxt build` de Chrome, Firefox e Opera, cada um com o gate do `@source`, + `web-ext lint` no Firefox)"; no `botai-e2e.yml`, troque "build de produção, build `--mode e2e`" por "builds de produção de Chrome, Firefox e Opera, build `--mode e2e`"; e acrescente a linha:

```markdown
| `botai-release.yml` | PR em `main` que toca `apps/botai/**`, `packages/tools/**`, `packages/ui/**`, os arquivos da raiz do zip de fontes ou o próprio workflow + dispatch | Job `pacotes` (`ubuntu-24.04`): lint + Vitest + `zip` dos 3 navegadores com os gates + `web-ext lint`, e a reprodução do pacote do Firefox a partir do zip de fontes no Node 24.14.0, com `cmp` byte a byte (o que o revisor da AMO faz). Sobe os zips como artifact `botai-zips`. A tag `botai-v*`, o GitHub Release e o job `lojas` entram na fase 3. Fica fora do `CI` para não segurar o deploy do finanças. |
```

`packages/ui/CLAUDE.md`: no fim do item "**`apps/botai`**" de "Consumo pelos apps", acrescente:

```markdown
Licença MIT (`LICENSE`, © PiluTech, mantido o aviso do shadcn) porque o Botaí empacota este pacote: ele entra inteiro no zip de fontes que vai à AMO, e o job `pacotes` do `botai-release.yml` roda em todo PR que toca `packages/ui/**`, reconstruindo o pacote do Firefox a partir das fontes com `cmp` byte a byte. Os `*.test.*` daqui ficam fora do Tailwind do Botaí (`@source not` no `styles.css` da extensão), porque o WXT os tira do zip de fontes.
```

`packages/tools/CLAUDE.md`: no fim do parágrafo de abertura de "Pessoa de teste e classificador de campos (extensão de dados de teste)", acrescente:

```markdown
O pacote inteiro tem licença MIT (`LICENSE`, © PiluTech) porque o Botaí o empacota: ele entra no zip de fontes que vai à AMO, e o job `pacotes` do `botai-release.yml` roda em todo PR que toca `packages/tools/**`, reconstruindo o pacote do Firefox a partir das fontes com `cmp` byte a byte.
```

- [ ] **Step 5: Prettier e conferência dos fatos**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && apps/botai/node_modules/.bin/prettier --write apps/botai/CLAUDE.md apps/botai/README.md CLAUDE.md packages/ui/CLAUDE.md packages/tools/CLAUDE.md && apps/botai/node_modules/.bin/prettier --check apps/botai/CLAUDE.md apps/botai/README.md CLAUDE.md packages/ui/CLAUDE.md packages/tools/CLAUDE.md; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/grep -c -e 'Fora: Firefox' -e 'atalho `Alt+Shift+P`, popup' -e 'Por enquanto só o dono' apps/botai/CLAUDE.md CLAUDE.md; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git grep -l 'ui-sentinela' -- apps/botai; echo "exit=$?"
```

Expected: `exit=0` no prettier; `0` em cada arquivo no segundo (as frases antigas sumiram; `exit=1` é o esperado do `grep -c` sem achado); nenhum arquivo no terceiro (`exit=1`): o nome da classe sentinela não foi escrito em nenhum arquivo versionado de `apps/botai`. É `git grep` de propósito: um `grep -r` acharia a classe no CSS emitido em `.output/` e em `storybook-static/`, onde o gate **exige** que ela esteja.

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/CLAUDE.md apps/botai/README.md CLAUDE.md packages/ui/CLAUDE.md packages/tools/CLAUDE.md && /usr/bin/git commit -m "docs(botai): Firefox, Opera e Edge, pacotes e fontes da AMO, CI e os checklists manuais"; echo "exit=$?"
```

---

### Task 14: Verificação final e entrega do checklist ao dono

**Files:** nenhum novo (só verificação; se algo falhar, corrija na task de origem e repita).

**Interfaces:**

- Consumes: tudo.
- Produces: a saída do terminal provando os critérios de "Pronto quando" da spec §9.1, e a lista do que só o dono faz.

- [ ] **Step 1: Lint, tipos e Vitest de tudo que foi tocado**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @pilutech/botai lint && $P --filter @pilutech/botai test && $P --filter @piluvitu/ui lint && $P --filter @piluvitu/ui test && $P --filter @piluvitu/tools lint && $P --filter @piluvitu/tools test; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 2: Os 3 builds nos gates, o `web-ext lint` e a reprodução das fontes**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && rm -rf apps/botai/.output && make zip-botai && /bin/ls apps/botai/.output/*.zip && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm --filter @pilutech/botai lint:firefox; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && V=$(node -p "require('./apps/botai/package.json').version") && /usr/local/bin/docker run --rm -v "$PWD:/repo:ro" node:24.14.0 bash /repo/apps/botai/scripts/reproduzir-fontes.sh "/repo/apps/botai/.output/botai-$V-sources.zip" "/repo/apps/botai/.output/botai-$V-firefox.zip"; echo "exit=$?"
```

Expected: os 4 zips listados, `errors 0` no `web-ext lint` e `exit=0`; `IDENTICO: botai-<versão>-firefox.zip` e `exit=0`.

- [ ] **Step 3: Playwright inteiro (build dos 3 + e2e)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm --filter @pilutech/botai test:e2e; echo "exit=$?"
```

Expected: todos os testes passando (inclui os 4 do `manifesto.e2e.ts` e o `retorno.e2e.ts` com o texto do Chrome), `exit=0`.

- [ ] **Step 4: Workflows e árvore limpa**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /opt/homebrew/bin/actionlint .github/workflows/ci.yml .github/workflows/botai-release.yml .github/workflows/botai-e2e.yml && /usr/bin/git status --short -- . ':(exclude)docs/superpowers/plans'; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git log --oneline -14; echo "exit=$?"
```

Expected: `exit=0`, nenhum arquivo pendente no `git status` fora de `docs/superpowers/plans/` (os `.output`, o `storybook-static` e o `test-results` são ignorados) e os 13 commits das Tasks 1–13 no topo da branch. **Nenhum push, nenhuma tag.**

- [ ] **Step 5: Entregar ao dono**

Na resposta final, cole a saída real (com os `exit=`) dos Steps 1–4 e liste o que só o dono faz, porque o agente não alcança:

1. **Checklist manual do Firefox** (`apps/botai/CLAUDE.md`, "Checklist manual: Firefox"): instalar um Firefox 153+ e confirmar ao menos o "21 de 23" pelo popup e pelo atalho, o Inserir sem clicar antes no campo, o menu na senha, o 1e em `about:addons`, o `file:` com o rótulo real da opção e o "alterar" atalho.
2. **Checklist manual do Edge** (instalado na máquina): "21 de 23", o "alterar" atalho (`chrome://extensions/shortcuts` abre ou não), o 1e com "O Edge…", as lojas do Edge e do Chrome como proibidas e o rótulo do `file:`. Cada item que falhar tem a correção de uma linha descrita no próprio checklist.
3. **Opera** (opcional, sem Opera na máquina): o checklist do Opera, quando houver um.
4. **Push e PR** da `feat/botai-multinavegador` quando quiser: no PR, o job `pacotes` do `botai-release.yml` faz a reprodução no `ubuntu-24.04` e o `botai` do `ci.yml` faz os 3 builds e o `web-ext lint`. Depois do squash do #45: `git rebase --onto origin/main feat/extensao-dados-teste feat/botai-multinavegador` (contrato).

---

## Self-review (feito ao escrever o plano)

- **Cobertura da spec §9.1 e do §4/§5 que cabe à fase 1:** config com `zip` (Tasks 2 e 10); adaptadores `dom.ts` (4), `InjectionResult.error` (6), `paginas.ts` (5), `menus.ts` (7), Inserir com `getTargetElement` (8), `App.tsx` e textos do 1e (9); detector (1); testes Vitest com `stubEnv`, detector com `stubGlobal`, um teste por caso do `InjectionResult.error` (6), stories do 1e por navegador (9), `manifesto.e2e.ts` com a versão do `package.json`, Firefox e Opera legível (2); `test:e2e` buildando os três (2); `web-ext` fixado e `lint:firefox` (3); gates nas 3 saídas (2, 10); `ci.yml` (12); `make zip-botai` (10); job `pacotes` com reprodução no `ubuntu-24.04`/Node 24.14.0 e artifact (12); `LICENSE` ×3 e `"license"` (11); `SOURCE-CODE-REVIEW.md` (11); `.env.submit` (10); docs (13); checklist de Firefox e Edge (13, 14). O que a spec põe na fase 3 (tag, Release, `lojas`, `versao-botai`/`release-botai`, `loja/`, capturas, "Publicação") ficou fora de propósito.
- **Placeholders:** nenhum "TBD"/"TODO"; todo passo de código traz o código; os textos SUPOSTOS (rótulos pt-BR da opção de arquivos, página de atalhos no Edge e no Opera, lojas proibidas) estão escritos por inteiro e amarrados a um item do checklist com a correção exata.
- **Tipos e nomes:** `Navegador`, `detectarNavegador`, `PAGINA_DE_ATALHOS` (Task 1) usados iguais nas Tasks 5 e 9; `situacaoDaUrl(url, acessoArquivo, navegador)` (5) usado no `use-aba-alvo`; `exigirSemErro`/`comoErro`/`Injetado<T>` (6) usados no `inserirNoCampo` da Task 8; `inserirNoFoco(pessoa, kind, alvoId = null)`, `ApiBotai.inserir(pessoa, kind, alvoId?)`, `inserirNoCampo(tabId, frameId, kind, alvoId = null)` e `Mensagem.inserir.alvoId?` consistentes; os helpers de teste que contam argumentos (`simularInsercao` com `=== 3`, `avisos()` com `=== 1`) conferidos contra as chamadas.
- **Review Focus:** os 5 itens têm teste na task dona (1, 5, 6, 7, 8).
