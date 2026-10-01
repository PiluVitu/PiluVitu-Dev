# Extensão de dados de teste, fase 2: extensão preenchendo — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o workspace `apps/extensao` (WXT 0.21.4, MV3) que gera a pessoa de teste e preenche formulários pelo popup, pelo atalho `Alt+Shift+P` e pelo menu de contexto (com `Inserir ›`), com aviso na página, popup 1a/1b, Storybook próprio, Vitest e E2E Playwright verdes.

**Architecture:** O background orquestra tudo (atalho, menu, mensagens do popup): injeta `/content-scripts/preencher.js` (registro `runtime`), cujo `main()` só instala a API `globalThis.__pv` no mundo ISOLATED; as ações são chamadas por `executeScript({func, args})` em todos os frames, somadas por `somarFrames` e anunciadas no frame 0 por um aviso em shadow root (DOM puro, CSS próprio em px). Geração, classificação e formatação vêm prontas de `@piluvitu/tools` (fase 1); a extensão é só a casca: varre o DOM, escreve, lê de volta, contorna e mostra o popup React + `@piluvitu/ui`.

**Tech Stack:** WXT 0.21.4 · Vite 7 + `@vitejs/plugin-react` 5 · React 19 · Tailwind 4 + `@piluvitu/ui` · Font Awesome 7 · fontsource · Vitest 4 (`WxtVitest` + `fakeBrowser`) + Testing Library + jsdom · Storybook 10.3.1 (react-vite, porta 6018) · Playwright 1.59.1 (`channel: 'chromium'`).

**Spec:** `docs/superpowers/specs/2026-10-01-extensao-dados-teste-design.md` (esta fase é a §14.2). Contrato de nomes e tipos entre as fases: `docs/superpowers/plans/2026-10-01-extensao-interfaces.md`. Pesquisa e protótipos ("portar, não reescrever"): `docs/superpowers/research/2026-10-01-extensao-dados-teste/`, abreviado **`R/`** neste plano.

---

## Pré-requisitos e convenções de execução

- **A fase 1 precisa estar concluída nesta branch** (`feat/extensao-dados-teste`). Confira antes da Task 1:

  ```bash
  /bin/ls packages/tools/src/pessoa.ts packages/tools/src/campos.ts packages/tools/src/campos-formatar.ts packages/tools/src/nascimento.ts packages/tools/src/uf.ts \
    && /usr/bin/grep -q '"./pessoa"' packages/tools/package.json && /usr/bin/grep -q '"./campos-formatar"' packages/tools/package.json \
    && /usr/bin/grep -q '"lint"' packages/tools/package.json && echo "fase 1 ok"
  ```

  Esperado: `fase 1 ok`. Se faltar algo, pare: este plano consome `gerarPessoa`, `classificarFormulario`, `valorPara`, `calcularIdade`/`lerDataISO`, `FieldKind`/`FieldDescriptor` e `Pessoa` exatamente como o contrato descreve.

- **Diretório:** todo comando parte da raiz do repo (`/Users/piluvitu/WWW/PiluVitu-Dev`). Comandos do app começam com `cd apps/extensao && …` na mesma linha.
- **O shell tem um wrapper (rtk) que falsifica a saída de git, prettier e vitest, e também de `grep`, `diff`, `find` e `ls`** (são funções do shell). Medido: `grep -v padrão arquivo > saida` grava o resumo do rtk (`1 matches in 1 files: …`) no lugar das linhas, e `diff` sai com 0 entre arquivos diferentes. Por isso: git é sempre `/usr/bin/git`, grep é sempre `/usr/bin/grep`, ls é `/bin/ls`, e para comparar arquivos use `cmp` (que é `/usr/bin/cmp`, sem wrapper); vitest, tsc, eslint, wxt e playwright rodam pelo binário direto em `apps/extensao/node_modules/.bin/` (ou por `pnpm --filter @piluvitu/extensao <script>`); **todo** comando de verificação termina com `; echo "exit=$?"` e o que vale é o `exit=`.
- **Commits:** mensagem convencional em português, no estilo do repo, com `/usr/bin/git`, na branch atual. **Nunca `git push`.** O pre-commit (`lint-staged`: `eslint --fix` + `prettier --write` nos arquivos do app) roda sozinho; se ele reformatar um arquivo, isso é esperado.
- **Antes de cada commit** (regra do dono): `pnpm --filter @piluvitu/extensao lint; echo "exit=$?"` precisa dar `exit=0` (é `wxt prepare && tsc --noEmit && eslint .`).

## Global Constraints

- Nomes e tipos do contrato `2026-10-01-extensao-interfaces.md` são obrigatórios e não podem ser renomeados. Funções novas que não estão no contrato são acréscimos e aparecem marcadas como tal nos blocos **Interfaces**.
- `wxt` `0.21.4`, MV3, `srcDir: 'src'`, `imports: false`, `webExt.disabled`, `dev.reloadCommand: false`, `dev.server.port: 3018`; **entrypoints sempre em pasta** (`background/index.ts`, `popup/index.html`, `preencher.content/index.ts`).
- Dependências de runtime: `@piluvitu/tools` e `@piluvitu/ui` (`workspace:*`), `react`/`react-dom` `^19.2.0`, `@fortawesome/fontawesome-svg-core` e `@fortawesome/free-solid-svg-icons` `^7.2.0`, `@fortawesome/react-fontawesome` `^3.3.0`, `@fontsource-variable/plus-jakarta-sans` e `@fontsource-variable/jetbrains-mono` `^5.3.0`.
- Dependências de desenvolvimento: `wxt` `0.21.4`; `vite` `^7.2.0`; `@vitejs/plugin-react` `^5.1.0` (**sem `@wxt-dev/module-react`**); `tailwindcss`/`@tailwindcss/vite` `^4.2.2`; `vitest` `^4.1.10`; `jsdom` `^27.0.0`; `@testing-library/react` `^16.3.0`, `@testing-library/jest-dom` `^6.9.1`, `@testing-library/user-event` `^14.6.1`; `@types/react`/`@types/react-dom` `^19.2.0`; `typescript` `^5.9.3`; `prettier` `^3.8.1`; ESLint do `packages/ui` (`eslint` `^9.39.4`, `eslint-config-prettier` `^10.1.8`, `eslint-plugin-jsx-a11y` `^6.10.2`, `eslint-plugin-react` `^7.37.5`, `eslint-plugin-react-hooks` `^7.0.1`, `globals` `^16.4.0`, `typescript-eslint` `^8.57.1`); `@playwright/test` **`1.59.1`**; `storybook` e `@storybook/react-vite` **`10.3.1`**. Nenhum pacote novo em `allowBuilds`. **Sem `postinstall`.**
- Manifesto: `name` exatamente `piluvitu · dados de teste`; `version` do `package.json`; `minimum_chrome_version: "121"`; `permissions`: `activeTab`, `scripting`, `contextMenus`, `storage`; **nenhum** `host_permissions` e nenhum `content_scripts` em produção; `commands.preencher-pagina` com `suggested_key` `Alt+Shift+P` e `description` "Preencher esta página"; só com `--mode e2e`: `...(mode === 'e2e' && { host_permissions: ['http://teste.local/*'] })`.
- `tsconfig.json` estende `.wxt/tsconfig.json` com `"jsx": "react-jsx"` e `"noUncheckedIndexedAccess": false`.
- Scripts: `wxt prepare &&` na frente de `lint`, `test` e `storybook`; `build` = `wxt build && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3`; `build:e2e` = `wxt build --mode e2e`; `test:e2e` = `build && build:e2e && playwright test`.
- `.gitignore` da raiz, uma linha por caminho: `apps/extensao/.output/`, `apps/extensao/.wxt/`, `apps/extensao/storybook-static/`, `apps/extensao/playwright-report/`, `apps/extensao/web-ext.config.ts`.
- CSS de entrada `src/styles.css`: `@import` de `tailwindcss`, das fontes, de `@fortawesome/fontawesome-svg-core/styles.css` e de `@piluvitu/ui/styles.css`; `@source '../../../packages/ui/src'` e `@source not '../.output'`; em `@layer base`: `border-color: hsl(var(--border))` em `*, ::after, ::before, ::backdrop, ::file-selector-button`, `:root { color-scheme: light } .dark { color-scheme: dark }`, `body { @apply bg-background text-foreground antialiased }`; fora de `@layer`: `body { font-family: var(--font-sans); font-size: 1rem; line-height: normal }`; `html, body { width: 380px }`; `--font-plus-jakarta`/`--font-jetbrains` apontando para as famílias "Variable".
- Content script `/content-scripts/preencher.js`: `registration: 'runtime'`, `cssInjectionMode: 'manual'`, `noScriptStartedPostMessage: true`; o `main()` sempre (re)atribui `globalThis.__pv` ligado ao `ctx` atual. Toda ação injeta o arquivo antes de chamar a API (modo A em `allFrames: true`, Inserir só no `frameId`); "Mostrar" não reinjeta.
- Escrita no DOM, mundo ISOLATED: `FocusEvent('focus')` e `FocusEvent('focusin', {bubbles: true, composed: true})`, **sem `el.focus()`**; setter nativo do protótipo; `input` e `change` com `{bubbles: true, composed: true}`; `blur` e `focusout` do mesmo jeito, **sem `el.blur()`**. Nunca caractere a caractere. Valor igual não é escrito de novo. Depois de escrever, lê de volta (valor ou dígitos).
- Visibilidade: `checkVisibility({opacityProperty, visibilityProperty, contentVisibilityAuto})`, ancestral `aria-hidden`, menos de 2 px, fora do documento; `<select>` escondido conta.
- Contagem: `Y = preenchidos + naoReconhecidos + recusados`, `X = preenchidos`, `k = naoReconhecidos + recusados`; fora: `hidden`, checkbox, radio, file, botões, `select[multiple]`, disabled, readonly, invisíveis e `ignorar`.
- Valor que não cabe em `maxLength` não é escrito nem truncado: vai para `recusados`.
- **Nenhum `data-*` é gravado no DOM do site.** O registro do "Mostrar" é `Map<idx, WeakRef>` no mundo isolado.
- Contornos com `!important`: preenchido `2px solid #38bdf8`; não reconhecido ou recusado `2px dashed #f5b82e`; o `outline` original é salvo uma única vez num `WeakMap`. Saem com o aviso, ou no primeiro `pointerdown`/`focusin` do usuário (`event.isTrusted`) num campo; frames filhos limpam sozinhos depois de 4 s.
- "Mostrar na página" (`__pv.mostrar(idx)`, spec §7) nasce aqui, já no comportamento final, porque o texto âmbar do aviso 1f o usa: `scrollIntoView({block: 'center'})` **sem** `behavior: 'smooth'` e o contorno âmbar **piscando** (âmbar/transparente a cada 200 ms, 1 s no total), terminando no contorno que o campo deve ter naquele momento. A fase 3 só liga a mira do 1c a ele e não reescreve `contornos.ts`.
- `runtime.onMessage` responde com `sendResponse` + `return true` literal, **nunca Promise**.
- Armazenamento: `storage.defineItem('local:pessoa', {fallback: null, version: 1})`, guarda a pessoa inteira, nada em `sync:`; `hojeISO` em `America/Sao_Paulo`; a idade exibida é recalculada a partir de `nascimento.iso`. Sem pessoa, atalho, menu, Inserir e "Abrir caixa de entrada" geram e guardam uma antes de agir.
- Menus em `runtime.onInstalled` e `runtime.onStartup` (`removeAll()` + recria); `Preencher esta página`, separadores, `Nova pessoa` e `Abrir caixa de entrada` em `['page', 'editable']`; `Inserir ›` e seus 23 itens + 4 separadores em `['editable']`; títulos `CPF · {cpf}` e `CEP · {cep}` atualizados por `pessoaItem.watch` (sem pessoa: `CPF`, `CEP`).
- Aviso 1f: `createShadowRootUi(ctx, { name: 'piluvitu-aviso', position: 'inline', anchor: 'html', css })` com `import css from './aviso.css?inline'`, só no frame 0, DOM puro, sem `@piluvitu/ui` nem Tailwind; 4 s, pausa no hover, ×; texto âmbar rola até o 1º não reconhecido do frame 0; com k = 0 a 2ª linha some.
- Popup: `html, body { width: 380px }`, shell `max-h-[600px]`, cabeçalho e rodapé fixos, meio rolando, chips `sticky`; `tema.ts` é o **primeiro import** de `main.tsx`; `Button` sempre com `gap-2`, no `sm` com `rounded-[14px] text-[13px]`; `Card` com `rounded-[14px] shadow-none`. Atalho vem de `commands.getAll()`; vazio ⇒ rodapé vira só "definir atalho" e o chip do botão some. "alterar"/"definir atalho" abrem `chrome://extensions/shortcuts`.
- Textos exatos: 1a cartão "número de teste documentado, Luhn válido"; 1b nota do cartão "Número de teste documentado da Stripe. Passa no Luhn; só aprova em sandbox."; rodapé 1a "preenche sem abrir o popup"; rodapé 1b "preenche sem abrir" + "alterar"; "definir atalho"; título "{X} de {Y} campos preenchidos" / "1 de 1 campo preenchido"; 2ª linha "{k} não reconhecidos" / "1 não reconhecido"; recusado "{rótulo} (recusou o valor)"; botão de fechar `aria-label="Fechar"`.
- Nesta fase, o "Preencher" do 1b manda a mensagem e o popup **continua no 1b** (o aviso na página dá o retorno). 1c (com a mira que manda a mensagem `mostrar`), 1d, 1e, a 2ª passada do CEP, os avisos de falha e o `mostrarCampo` que não lança com documento morto são da fase 3.
- Lei de comentários do `CLAUDE.md` raiz: em produção, comentário só para um porquê não óbvio, de 1 a 3 linhas; ao portar protótipos, remova os comentários narrativos. Testes podem explicar.
- Colocation: teste, story e E2E (`*.e2e.ts`) ao lado do fonte; nunca pastas `tests/`, `stories/` ou `e2e/`. Identificadores em português.
- **Nunca escreva o nome da classe sentinela do gate em nenhum arquivo de `apps/extensao`** (nem em doc ou comentário): referencie `SENTINEL_SELECTOR`.

## Review Focus

1. **Dois `Alt+Shift+P` seguidos:** o usuário espera um aviso só (nunca dois empilhados) e, quando os contornos saem, o `outline` que o site já tinha no campo volta igual. Teste: `api.test.ts` (Task 13, reinjeção invalida a instância antiga e restaura o outline) e E2E "dois preenchimentos seguidos" (Task 16).
2. **Site com CSP estrita (`default-src 'none'; style-src 'self'`), comum em staging com helmet:** o aviso continua com o próprio estilo (300 px de largura, raio 14 px) e os contornos aparecem. Teste: E2E "CSP estrita" (Task 16).
3. **Formulário com iframe da mesma origem:** os campos do iframe são preenchidos e somados no X de Y, e o aviso aparece uma vez só, no topo. Teste: E2E "iframe da mesma origem" (Task 16).
4. **Campo que já tem o valor certo:** não recebe `input`/`change` de novo (para não disparar outra vez a busca de CEP do site) e conta como preenchido. Teste: `preencher.test.ts` (Task 11).
5. **Campo com `maxlength` menor que o valor formatado:** CPF com `maxlength=11` recebe só os dígitos (e uma máscara do site que reformata é aceita na leitura de volta); senha de 12 num `maxlength=6` vai para recusados sem ser truncada nem escrita. Teste: `preencher.test.ts` (Task 11) e E2E React com CPF `maxLength={11}` + máscara (Task 16).
6. **"Mostrar" clicado no fim do aviso** (o aviso de 4 s some no meio do pisca, o caso comum de quem clica no texto âmbar logo depois de preencher): o campo não pode ficar com um contorno âmbar velho para sempre, nem quando um `Alt+Shift+P` reinjeta no meio do pisco. Testes: `contornos.test.ts` "aviso que some no meio do pisca não deixa contorno velho para trás" e "reinjetar no meio do pisca (timers cancelados) devolve o outline do site" (Task 11).

---

## Estrutura de arquivos

```
apps/extensao/
  package.json  wxt.config.ts  tsconfig.json  vitest.config.ts  playwright.config.ts  eslint.config.mjs
  manifesto.e2e.ts                       manifesto de produção sem host_permissions/content_scripts
  CLAUDE.md
  .storybook/main.ts  .storybook/preview.tsx
  public/icon/16.png 32.png 48.png 128.png
  src/styles.css                          CSS de entrada do popup (gate do @source)
  src/test/setup.ts                       Vitest: jest-dom, fakeBrowser.reset, cleanup, CSS.escape
  src/test/pessoa-dourada.ts              gerarPessoa(sfc32(1,2,3,4), '2026-10-01') para testes e stories
  src/test/layout.ts                      simula checkVisibility/getBoundingClientRect no jsdom
  src/test/extensao.fixture.ts            fixture Playwright (channel chromium, build e2e, rotas teste.local)
  src/lib/hoje.ts                         hojeISO, idadeEm
  src/lib/armazenamento.ts                pessoaItem, gerarPessoaNova, obterOuGerarPessoa
  src/lib/paginas.ts                      situacaoDaUrl, erroEhPaginaProibida, rotuloDoHost
  src/lib/resultado.ts                    LinhaCampo, ResultadoFrame, ResumoPreenchimento, somarFrames, primeiroNaoReconhecido
  src/lib/textos.ts                       tituloPreenchimento, linhaNaoReconhecidos
  src/lib/menus.ts                        ITENS_INSERIR, MENU, PREFIXO_INSERIR, criarMenus, atualizarTitulosMenu
  src/lib/mensagens.ts                    Mensagem, RespostaPreencher, enviar
  src/lib/grupos.ts                       gruposDaPessoa, CHIPS (linhas do 1b)
  src/components/marca.tsx tipografia.ts pilula-host.tsx popup-shell.tsx rodape.tsx
  src/components/linha-copiavel.tsx use-copiado.ts filtro-chips.tsx primeiro-uso.tsx pessoa-pronta.tsx
  src/entrypoints/popup/index.html main.tsx tema.ts App.tsx use-aba-alvo.ts popup.e2e.ts
  src/entrypoints/background/index.ts acoes.ts ouvintes.ts menus.e2e.ts
  src/entrypoints/preencher.content/index.ts api.ts dom.ts registro.ts contornos.ts preencher.ts inserir.ts
  src/entrypoints/preencher.content/aviso.ts aviso-dom.ts aviso.css aviso.stories.tsx
  src/entrypoints/preencher.content/preencher.e2e.ts cadastro.pagina.html react.pagina.html react.pagina.tsx
```

(cada `.ts`/`.tsx` de lógica tem o seu `*.test.ts(x)` ao lado; cada componente visual tem `*.stories.tsx` ao lado.)

Também mudam: `pnpm-workspace.yaml`, `.gitignore`, `Makefile`, `.github/workflows/ci.yml`, `CLAUDE.md` (raiz), `packages/ui/CLAUDE.md`, `pnpm-lock.yaml`.

---

### Task 1: Workspace WXT com popup mínimo, gate do `@source` e data de hoje

**Files:**

- Modify: `pnpm-workspace.yaml`, `.gitignore`, `pnpm-lock.yaml` (gerado)
- Create: `apps/extensao/package.json`, `apps/extensao/wxt.config.ts`, `apps/extensao/tsconfig.json`, `apps/extensao/vitest.config.ts`, `apps/extensao/eslint.config.mjs`
- Create: `apps/extensao/src/test/setup.ts`, `apps/extensao/src/test/pessoa-dourada.ts`, `apps/extensao/src/styles.css`
- Create: `apps/extensao/src/entrypoints/popup/index.html`, `main.tsx`, `App.tsx`, `tema.ts`, `tema.test.ts`
- Create: `apps/extensao/src/lib/hoje.ts`, `apps/extensao/src/lib/hoje.test.ts`
- Create (cópia): `apps/extensao/public/icon/{16,32,48,128}.png`

**Interfaces:**

- Consumes: `calcularIdade(nasc: DataCivil, hoje: DataCivil): number`, `lerDataISO(iso: string): DataCivil` de `@piluvitu/tools/nascimento`; `gerarPessoa(rng: Rng, hojeISO: string): Pessoa` de `@piluvitu/tools/pessoa`; `sfc32` de `@piluvitu/tools/prng`.
- Produces: `hojeISO(agora?: Date): string` (contrato); **acréscimo** `idadeEm(nascimentoISO: string, hoje: string): number` (o 2º parâmetro é `hoje`, e não `hojeISO`, para não sombrear a função do mesmo módulo); `PESSOA_DOURADA: Pessoa` em `src/test/pessoa-dourada.ts`; o workspace `@piluvitu/extensao` com scripts `dev`, `build`, `build:e2e`, `lint`, `test`, `test:watch`, `test:e2e`, `storybook`, `build-storybook`, `prettier:fix`.

- [ ] **Step 1: Registrar o workspace e ignorar os artefatos**

Em `pnpm-workspace.yaml`, acrescente a linha `- 'apps/extensao'` logo depois de `- 'apps/ramielle'`:

```yaml
packages:
  - 'apps/web'
  - 'apps/financas'
  - 'apps/financas/web'
  - 'apps/ramielle'
  - 'apps/extensao'
  - 'packages/tools'
  - 'packages/ui'
```

No fim do `.gitignore` da raiz, acrescente:

```gitignore

# extensão (WXT): sem isto o Tailwind varre builds antigos e o gate do @source passa sem medir nada
apps/extensao/.output/
apps/extensao/.wxt/
apps/extensao/storybook-static/
apps/extensao/playwright-report/
apps/extensao/web-ext.config.ts
```

- [ ] **Step 2: Criar `apps/extensao/package.json`**

```json
{
  "name": "@piluvitu/extensao",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "build": "wxt build && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3",
    "build:e2e": "wxt build --mode e2e",
    "lint": "wxt prepare && tsc --noEmit && eslint .",
    "test": "wxt prepare && vitest run",
    "test:watch": "wxt prepare && vitest",
    "test:e2e": "pnpm run build && pnpm run build:e2e && playwright test",
    "storybook": "wxt prepare && storybook dev -p 6018",
    "build-storybook": "wxt prepare && storybook build",
    "prettier:fix": "prettier --write \"{src,.storybook}/**/*.{ts,tsx,css,html}\" \"*.{ts,mjs,json,md}\""
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{js,mjs,json,md,css,html}": "prettier --write"
  },
  "dependencies": {
    "@fontsource-variable/jetbrains-mono": "^5.3.0",
    "@fontsource-variable/plus-jakarta-sans": "^5.3.0",
    "@fortawesome/fontawesome-svg-core": "^7.2.0",
    "@fortawesome/free-solid-svg-icons": "^7.2.0",
    "@fortawesome/react-fontawesome": "^3.3.0",
    "@piluvitu/tools": "workspace:*",
    "@piluvitu/ui": "workspace:*",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@playwright/test": "1.59.1",
    "@storybook/react-vite": "10.3.1",
    "@tailwindcss/vite": "^4.2.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.1.0",
    "eslint": "^9.39.4",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-jsx-a11y": "^6.10.2",
    "eslint-plugin-react": "^7.37.5",
    "eslint-plugin-react-hooks": "^7.0.1",
    "globals": "^16.4.0",
    "jsdom": "^27.0.0",
    "prettier": "^3.8.1",
    "storybook": "10.3.1",
    "tailwindcss": "^4.2.2",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.57.1",
    "vite": "^7.2.0",
    "vitest": "^4.1.10",
    "wxt": "0.21.4"
  }
}
```

O `prettier:fix` lista pastas em vez de `**/*` porque o Prettier só lê o `.gitignore` do diretório atual, e o `.output/` é ignorado no `.gitignore` da raiz.

- [ ] **Step 3: Criar a configuração do WXT, do TypeScript, do Vitest e do ESLint**

`apps/extensao/wxt.config.ts`:

```ts
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'wxt'

export default defineConfig({
  srcDir: 'src',
  imports: false,
  webExt: { disabled: true },
  dev: { server: { port: 3018 }, reloadCommand: false },
  manifest: ({ mode }) => ({
    name: 'piluvitu · dados de teste',
    minimum_chrome_version: '121',
    permissions: ['activeTab', 'scripting', 'contextMenus', 'storage'],
    commands: {
      'preencher-pagina': {
        suggested_key: { default: 'Alt+Shift+P' },
        description: 'Preencher esta página',
      },
    },
    ...(mode === 'e2e' && { host_permissions: ['http://teste.local/*'] }),
  }),
  vite: () => ({ plugins: [react(), tailwindcss()] }),
})
```

`apps/extensao/tsconfig.json`:

```json
{
  "extends": "./.wxt/tsconfig.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "noUncheckedIndexedAccess": false
  }
}
```

`apps/extensao/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { WxtVitest } from 'wxt/testing/vitest-plugin'

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

`apps/extensao/src/test/setup.ts` (o jsdom não tem `CSS.escape`, usado pelo seletor do content script):

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'

if (!('CSS' in globalThis)) {
  Object.defineProperty(globalThis, 'CSS', {
    value: { escape: (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`) },
    configurable: true,
  })
}

beforeEach(() => fakeBrowser.reset())
afterEach(() => cleanup())
```

`apps/extensao/src/test/pessoa-dourada.ts`:

```ts
import { gerarPessoa } from '@piluvitu/tools/pessoa'
import { sfc32 } from '@piluvitu/tools/prng'

export const PESSOA_DOURADA = gerarPessoa(sfc32(1, 2, 3, 4), '2026-10-01')
```

`apps/extensao/eslint.config.mjs` (mesma pilha e mesmas regras do `packages/ui/eslint.config.mjs`, mais o override das fixtures do Playwright, cujo `use(...)` a regra de hooks confunde com um hook, e os ignores dos artefatos):

```js
import { defineConfig, globalIgnores } from 'eslint/config'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'
import globals from 'globals'

export default defineConfig([
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat.recommended,
  prettier,
  {
    plugins: {
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'react/prop-types': 'off',
      'react/no-unknown-property': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/aria-props': 'warn',
      'jsx-a11y/aria-proptypes': 'warn',
      'jsx-a11y/aria-unsupported-elements': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',
    },
  },
  {
    files: ['**/*.e2e.ts', '**/*.fixture.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
  globalIgnores([
    'node_modules/**',
    '.output/**',
    '.wxt/**',
    'storybook-static/**',
    'test-results/**',
    'playwright-report/**',
  ]),
])
```

- [ ] **Step 4: Criar o CSS de entrada, o popup mínimo e copiar os ícones**

`apps/extensao/src/styles.css`:

```css
@import 'tailwindcss';
@import '@fontsource-variable/plus-jakarta-sans/wght.css';
@import '@fontsource-variable/jetbrains-mono/wght.css';
@import '@fortawesome/fontawesome-svg-core/styles.css';
@import '@piluvitu/ui/styles.css';
@source '../../../packages/ui/src';
@source not '../.output';

@layer base {
  :root {
    --font-plus-jakarta: 'Plus Jakarta Sans Variable';
    --font-jetbrains: 'JetBrains Mono Variable';
    color-scheme: light;
  }

  .dark {
    color-scheme: dark;
  }

  *,
  ::after,
  ::before,
  ::backdrop,
  ::file-selector-button {
    border-color: hsl(var(--border));
  }

  html,
  body {
    width: 380px;
  }

  body {
    margin: 0;
    @apply bg-background text-foreground antialiased;
  }
}

/* O Chrome injeta body { font: 12px system-ui } nas páginas de extensão, fora de @layer: só outra regra fora de @layer vence. */
body {
  font-family: var(--font-sans);
  font-size: 1rem;
  line-height: normal;
}
```

`apps/extensao/src/entrypoints/popup/index.html` (o `content` do ícone precisa ser JSON estrito: com aspas simples nas chaves o WXT grava uma string e o manifesto quebra):

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <title>piluvitu · dados de teste</title>
    <meta
      name="manifest.default_icon"
      content='{ "16": "/icon/16.png", "32": "/icon/32.png", "48": "/icon/48.png", "128": "/icon/128.png" }'
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`apps/extensao/src/entrypoints/popup/main.tsx` (versão final; o `./tema` tem de ser o primeiro import porque o CSP do MV3 não aceita script inline no `<head>`):

```tsx
import './tema'
import { config } from '@fortawesome/fontawesome-svg-core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles.css'
import { App } from './App'

config.autoAddCss = false

const raiz = document.getElementById('root')
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
```

`apps/extensao/src/entrypoints/popup/App.tsx` (provisório; a Task 15 substitui o arquivo inteiro):

```tsx
export function App() {
  return null
}
```

Ícones (PNGs já renderizados na pesquisa; 32 e 48 são as versões redesenhadas em pixel inteiro):

```bash
mkdir -p apps/extensao/public/icon \
  && cp docs/superpowers/research/2026-10-01-extensao-dados-teste/icones/1i-16.png apps/extensao/public/icon/16.png \
  && cp docs/superpowers/research/2026-10-01-extensao-dados-teste/icones/1i-32-snap.png apps/extensao/public/icon/32.png \
  && cp docs/superpowers/research/2026-10-01-extensao-dados-teste/icones/1i-48-snap.png apps/extensao/public/icon/48.png \
  && cp docs/superpowers/research/2026-10-01-extensao-dados-teste/icones/1i-128.png apps/extensao/public/icon/128.png \
  && file apps/extensao/public/icon/*.png; echo "exit=$?"
```

Esperado: `16 x 16`, `32 x 32`, `48 x 48`, `128 x 128` e `exit=0`.

- [ ] **Step 5: Instalar**

```bash
pnpm install; echo "exit=$?"
/bin/ls apps/extensao/node_modules/.bin/wxt apps/extensao/node_modules/.bin/vitest apps/extensao/node_modules/.bin/playwright apps/extensao/node_modules/.bin/storybook; echo "exit=$?"
cd apps/extensao && ./node_modules/.bin/wxt prepare; echo "exit=$?"
```

Esperado: os três `exit=0`; `pnpm install` não pede `allowBuilds` novo (se pedir, pare e confira: a pesquisa mediu que nenhum pacote desta lista precisa; o único `ERR_PNPM_IGNORED_BUILDS` visto lá foi o `@parcel/watcher`, que só entra se o jest for re-resolvido para 30.5, ver `R/relatorios/repo.md`; nesse caso a correção é `'@parcel/watcher': false` no `allowBuilds`, nunca liberar o script). O `wxt prepare` gera `apps/extensao/.wxt/tsconfig.json`.

- [ ] **Step 6: Escrever os testes que falham (`hoje` e `tema`)**

`apps/extensao/src/lib/hoje.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hojeISO, idadeEm } from './hoje'

describe('hojeISO', () => {
  it('usa o dia civil de São Paulo, não o de UTC', () => {
    expect(hojeISO(new Date('2026-10-02T02:30:00Z'))).toBe('2026-10-01')
    expect(hojeISO(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10-01')
    expect(hojeISO(new Date('2026-10-01T02:59:59Z'))).toBe('2026-09-30')
  })

  it('vira o ano à meia-noite de Brasília', () => {
    expect(hojeISO(new Date('2027-01-01T02:59:59Z'))).toBe('2026-12-31')
    expect(hojeISO(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01')
  })

  it('sem argumento devolve a data de agora no formato aaaa-mm-dd', () => {
    expect(hojeISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('idadeEm', () => {
  it('só completa o ano no dia do aniversário', () => {
    expect(idadeEm('1993-05-29', '2026-05-28')).toBe(32)
    expect(idadeEm('1993-05-29', '2026-05-29')).toBe(33)
  })
})
```

`apps/extensao/src/entrypoints/popup/tema.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

// tema.ts roda no import (é o primeiro import do popup); cada teste reimporta o módulo.
function simularPreferencia(escuro: boolean) {
  const ouvintes: (() => void)[] = []
  const media = {
    matches: escuro,
    addEventListener: (_tipo: string, ouvinte: () => void) =>
      ouvintes.push(ouvinte),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  )
  return {
    trocar(novo: boolean) {
      media.matches = novo
      ouvintes.forEach((ouvinte) => ouvinte())
    },
  }
}

describe('tema', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
    document.documentElement.classList.remove('dark')
  })

  it('aplica .dark no <html> quando o sistema está no escuro', async () => {
    simularPreferencia(true)
    await import('./tema')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('fica claro no tema claro e acompanha a troca do sistema', async () => {
    const preferencia = simularPreferencia(false)
    await import('./tema')
    expect(document.documentElement).not.toHaveClass('dark')
    preferencia.trocar(true)
    expect(document.documentElement).toHaveClass('dark')
  })
})
```

- [ ] **Step 7: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/lib/hoje.test.ts src/entrypoints/popup/tema.test.ts; echo "exit=$?"
```

Esperado: FAIL nos dois arquivos com `Failed to resolve import "./hoje"` e `"./tema"`; `exit=1`.

- [ ] **Step 8: Implementar `hoje.ts` e `tema.ts`**

`apps/extensao/src/lib/hoje.ts`:

```ts
import { calcularIdade, lerDataISO } from '@piluvitu/tools/nascimento'

const DIA_EM_SAO_PAULO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function hojeISO(agora: Date = new Date()): string {
  const partes = Object.fromEntries(
    DIA_EM_SAO_PAULO.formatToParts(agora).map((parte) => [
      parte.type,
      parte.value,
    ]),
  )
  return `${partes.year}-${partes.month}-${partes.day}`
}

export function idadeEm(nascimentoISO: string, hoje: string): number {
  return calcularIdade(lerDataISO(nascimentoISO), lerDataISO(hoje))
}
```

`apps/extensao/src/entrypoints/popup/tema.ts`:

```ts
const escuro = window.matchMedia('(prefers-color-scheme: dark)')
const aplicar = () =>
  document.documentElement.classList.toggle('dark', escuro.matches)
aplicar()
escuro.addEventListener('change', aplicar)
```

- [ ] **Step 9: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/lib/hoje.test.ts src/entrypoints/popup/tema.test.ts; echo "exit=$?"
```

Esperado: `Test Files  2 passed`, `Tests  6 passed`, `exit=0`.

- [ ] **Step 10: Lint e tipos**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
```

Esperado: `exit=0`. Se o `tsc` acusar erro dentro de `packages/tools/src`, confira primeiro se o `noUncheckedIndexedAccess: false` está no `tsconfig.json` do app (o tsconfig gerado pelo WXT liga essa flag, e o código cru do pacote não passa com ela).

- [ ] **Step 11: Build com o gate, e provar que o gate mede de verdade**

```bash
cd apps/extensao && pnpm run build; echo "exit=$?"
```

Esperado: `exit=0` (o build escreve `.output/chrome-mv3` e o `check-tailwind-source.mjs` sai em silêncio).

Agora o par negativo, medido e desfeito (sem `@source` o gate tem de falhar):

```bash
cd apps/extensao && cp src/styles.css "$TMPDIR/styles.css.bak" \
  && /usr/bin/grep -v "@source '../../../packages/ui/src'" "$TMPDIR/styles.css.bak" > src/styles.css \
  && /usr/bin/wc -l "$TMPDIR/styles.css.bak" src/styles.css \
  && pnpm run build; echo "exit=$?"
cd apps/extensao && cp "$TMPDIR/styles.css.bak" src/styles.css && pnpm run build; echo "exit=$?"
cd apps/extensao && cmp src/styles.css "$TMPDIR/styles.css.bak"; echo "exit=$?"
```

Esperado: o `wc -l` mostra o `styles.css` com exatamente uma linha a menos que o backup (prova de que o `grep -v` tirou só o `@source`, e não gravou lixo); primeiro `exit=1` com o diagnóstico do gate (CSS sem a classe do `SENTINEL_SELECTOR`); depois `exit=0`; o `cmp` dá `exit=0` (o arquivo voltou idêntico).

- [ ] **Step 12: Conferir os manifestos de produção e de e2e**

```bash
cd apps/extensao && node -e "
const assert = require('node:assert')
const m = require('./.output/chrome-mv3/manifest.json')
assert.equal(m.name, 'piluvitu · dados de teste')
assert.equal(m.version, '0.1.0')
assert.equal(m.minimum_chrome_version, '121')
assert.deepEqual([...m.permissions].sort(), ['activeTab', 'contextMenus', 'scripting', 'storage'])
assert.ok(!('host_permissions' in m), 'host_permissions vazou para produção')
assert.ok(!('content_scripts' in m), 'content_scripts no manifesto')
assert.deepEqual(m.commands['preencher-pagina'], { suggested_key: { default: 'Alt+Shift+P' }, description: 'Preencher esta página' })
assert.deepEqual(Object.keys(m.icons).sort(), ['128', '16', '32', '48'])
assert.deepEqual(Object.keys(m.action.default_icon).sort(), ['128', '16', '32', '48'])
assert.equal(m.action.default_title, 'piluvitu · dados de teste')
console.log('manifesto de produção ok')
"; echo "exit=$?"
cd apps/extensao && pnpm run build:e2e && node -e "
const m = require('./.output/chrome-mv3-e2e/manifest.json')
require('node:assert').deepEqual(m.host_permissions, ['http://teste.local/*'])
console.log('manifesto e2e ok')
"; echo "exit=$?"
```

Esperado: `manifesto de produção ok`, `manifesto e2e ok` e dois `exit=0`.

- [ ] **Step 13: Commit**

```bash
/usr/bin/git add pnpm-workspace.yaml pnpm-lock.yaml .gitignore apps/extensao \
  && /usr/bin/git status --short apps/extensao | /usr/bin/grep -E '\.output|\.wxt' ; echo "artefatos-no-index=$?"
/usr/bin/git commit -m "feat(extensao): workspace WXT com popup mínimo, gate do @source e data de hoje em São Paulo"; echo "exit=$?"
```

Esperado: `artefatos-no-index=1` (nada de `.output`/`.wxt` no índice) e o commit com `exit=0`.

---

### Task 2: Makefile, job `extensao` no CI e CLAUDE.md da raiz e do `packages/ui`

**Files:**

- Modify: `Makefile` (`.PHONY`, alvos novos, `stop`, `lint`)
- Modify: `.github/workflows/ci.yml` (job `extensao`; o passo `Lint (tools package)` do job `web` já veio da fase 1 e **não** é tocado)
- Modify: `CLAUDE.md` (raiz), `packages/ui/CLAUDE.md`

**Interfaces:**

- Consumes: os scripts do `apps/extensao/package.json` (Task 1) e o script `lint` do `packages/tools` (fase 1).
- Produces: `make dev-extensao`, `make build-extensao`, `make test-extensao`, `make test-e2e-extensao`, `make storybook-extensao`; job de CI `extensao`.

- [ ] **Step 1: Makefile**

No `.PHONY` (primeira instrução do arquivo), troque a última linha `        dev-ramielle test-ramielle` por:

```make
        dev-ramielle test-ramielle \
        dev-extensao build-extensao test-extensao test-e2e-extensao storybook-extensao
```

No alvo `stop`, troque `@for p in 8081 8082 3333 6017; do \` por:

```make
	@for p in 8081 8082 3333 6017 3018 6018; do \
```

No alvo `lint`, troque a receita (o `cd ../promeia` saía da raiz do repo para uma pasta que não existe) por:

```make
lint:
	pnpm -r lint && cd apps/promeia && uv run ruff check . && uv run ruff format --check .
```

Logo depois do bloco do ramielle (depois da receita `test-ramielle:`), acrescente:

```make

# --- extensao (Chrome MV3, WXT) ---
# Dev em 3018 (o padrão do WXT, 3000, colide com app em teste) e Storybook em
# 6018. Carregar .output/chrome-mv3-dev sem empacotar; o dev acrescenta `tabs` e
# host de localhost ao manifesto, então bug de activeTab só aparece no build.
dev-extensao:
	pnpm --filter @piluvitu/extensao dev

build-extensao:
	pnpm --filter @piluvitu/extensao build

test-extensao:
	pnpm --filter @piluvitu/extensao test

test-e2e-extensao:
	pnpm --filter @piluvitu/extensao test:e2e

storybook-extensao:
	pnpm --filter @piluvitu/extensao storybook
```

Confira:

```bash
make -n lint stop dev-extensao build-extensao test-extensao test-e2e-extensao storybook-extensao; echo "exit=$?"
make test-extensao; echo "exit=$?"
```

Esperado: o `make -n` mostra `cd apps/promeia`, o laço com `3018 6018` e os cinco `pnpm --filter @piluvitu/extensao …`; `make test-extensao` roda o Vitest (6 testes) com `exit=0`.

- [ ] **Step 2: CI**

O passo `Lint (tools package)` do job `web` **já existe** (a fase 1 o acrescentou, ver o contrato `2026-10-01-extensao-interfaces.md`): não o acrescente de novo, porque o YAML aceita um passo duplicado em silêncio.

No fim de `.github/workflows/ci.yml` (depois do job `promeia`), acrescente o job:

```yaml
extensao:
  name: Extensão (lint + test + build)
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v4

    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: pnpm

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    # `wxt prepare` vem dentro dos scripts (nunca como postinstall: um
    # postinstall quebrado derrubaria o `pnpm install` de todos os jobs).
    - name: Lint (wxt prepare + tsc + eslint)
      run: pnpm --filter @piluvitu/extensao run lint

    - name: Test (vitest)
      run: pnpm --filter @piluvitu/extensao run test

    - name: Build (+ gate do @source em .output/chrome-mv3)
      run: pnpm --filter @piluvitu/extensao run build
```

O E2E da extensão **não** entra no workflow `CI` (o deploy do finanças espera o `CI` passar); ele ganha workflow próprio na fase 3.

```bash
actionlint .github/workflows/ci.yml; echo "exit=$?"
python3 -c "import yaml; d = yaml.safe_load(open('.github/workflows/ci.yml')); print(sorted(d['jobs']))"; echo "exit=$?"
/usr/bin/grep -c 'pnpm --filter @piluvitu/tools lint' .github/workflows/ci.yml; echo "exit=$?"
```

Esperado: `actionlint` sem saída e `exit=0`; `['extensao', 'financas', 'promeia', 'ramielle', 'web']`; o `grep -c` imprime `1` (o lint do tools aparece uma vez só, o da fase 1).

- [ ] **Step 3: `CLAUDE.md` da raiz**

Na tabela de workspaces do topo, insira depois da linha do `apps/promeia`:

```markdown
> | `apps/extensao` | `apps/extensao/CLAUDE.md` | Extensão Chrome MV3 (WXT + React 19 + `@piluvitu/ui`): gera a pessoa de teste e preenche formulários (atalho `Alt+Shift+P`, popup, menu `Inserir`), content script sob demanda, aviso na página, Vitest + Storybook próprio (6018) + Playwright |
```

Na mesma tabela, na linha do `packages/ui`, troque o trecho

```markdown
consumidos por `apps/web` **e** `apps/financas/web`
```

por

```markdown
consumidos por `apps/web`, `apps/financas/web` e `apps/extensao`
```

Em "Tech Stack (visão geral)", troque `com sete frentes:` por `com oito frentes:` e acrescente este item logo depois do item do `apps/promeia`:

```markdown
- **`apps/extensao`** — **Extensão Chrome MV3** com **WXT 0.21.4** (Vite 7 + `@vitejs/plugin-react` 5, sem `@wxt-dev/module-react`), **React 19** e o design system **`@piluvitu/ui`** no popup. Gera uma pessoa brasileira de teste coerente (geradores e classificador de campo em `@piluvitu/tools`) e preenche o formulário da aba por `activeTab` + `scripting`, sem `host_permissions` em produção. Testes: **Vitest** (`WxtVitest` + `fakeBrowser`), **Storybook react-vite** próprio (porta 6018) e **Playwright** com a extensão desempacotada (`channel: 'chromium'`, build `--mode e2e`). Por enquanto só o dono, carregada sem empacotar. → detalhes em `apps/extensao/CLAUDE.md`.
```

Na tabela "Commands": troque `Libera as portas 8081/8082/3333/6017 se travarem` por `Libera as portas 8081/8082/3333/6017/3018/6018 se travarem`, e insira depois da linha do `make insight`:

```markdown
| `make dev-extensao` | `wxt dev` (servidor 3018); carregue `apps/extensao/.output/chrome-mv3-dev` sem empacotar. O dev esconde bug de `activeTab` |
| `make build-extensao` | `wxt build` + gate do `@source` em `.output/chrome-mv3` |
| `make test-extensao` | Vitest da extensão |
| `make test-e2e-extensao` | build + build `--mode e2e` + Playwright com a extensão desempacotada |
| `make storybook-extensao` | Storybook da extensão em http://localhost:6018 |
```

Em "Dependency security policy", no primeiro parágrafo, troque ``(`apps/web`, `apps/financas`, `packages/*`)`` por ``(`apps/web`, `apps/financas`, `apps/extensao`, `packages/*`)``.

Em "Pre-commit hook (lint-staged)", troque `Configs em três níveis` por `Configs em quatro níveis` e acrescente este item logo depois do item do `apps/web/package.json`:

```markdown
- **`apps/extensao/package.json`** → mesma config do `apps/web` (`*.{ts,tsx}: [eslint --fix, prettier --write]`, demais assets só prettier), e pelo mesmo motivo: o `eslint.config.mjs` flat da extensão só resolve com cwd em `apps/extensao`.
```

Em "Gate do design system", no fim do item **Amarrado em:**, acrescente a frase:

```markdown
E em `apps/extensao/package.json` → `build` (`wxt build && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3`): a pasta exata, nunca `.output` inteira, porque um `chrome-mv3-e2e` antigo carrega o CSS de outro build e dá falso positivo.
```

Na tabela "Workflows GitHub Actions", troque a célula "Faz o quê" da linha `ci.yml` por:

```markdown
Em paralelo, **cinco** jobs: web (`lint` + `lint`/`test` de `packages/ui` + `lint` (`tsc --noEmit`)/`jest` de `packages/tools` + `tsc --noEmit` + `jest` + `next build:ci`, gate do `@source` incluso), financas (`tsc --noEmit` do Worker e do SPA + build do SPA — os dois gates, `@source` e lazy-chart, inclusos — + `vitest` dos dois), ramielle (`tsc --noEmit` + `vitest` — Worker sem SPA, sem gate de build), promeia (`uv sync --locked` + `ruff check` + `ruff format --check` + `pytest`) e extensao (`wxt prepare` + `tsc --noEmit` + `eslint` + `vitest` + `wxt build`, gate do `@source` em `.output/chrome-mv3` incluso). O E2E da extensão roda fora do `CI` (`make test-e2e-extensao`). O job `api` (Go) saiu em 2026-08-14.
```

- [ ] **Step 4: `packages/ui/CLAUDE.md`**

Na 3ª linha do arquivo, troque o trecho

```markdown
`) e, desde a Task 4, por `apps/financas/web` (SPA Vite)
```

por

```markdown
`), desde a Task 4, por `apps/financas/web`(SPA Vite) e, desde 2026-10-01, pelo popup de`apps/extensao` (WXT/Vite)
```

(O trecho começa no `` `) `` que fecha o caminho do plano da Task 3, para a vírgula não ficar solta depois de um espaço.)

Em "Consumo pelos apps", acrescente um item depois do item do `apps/financas/web`:

```markdown
- **`apps/extensao`** (popup da extensão, 2026-10-01) — terceiro consumidor, via WXT (Vite 7 + `@tailwindcss/vite`). `src/styles.css` importa `@piluvitu/ui/styles.css` + `@source '../../../packages/ui/src'` (**3** `../`, a mesma profundidade do `apps/web`) e `@source not '../.output'` (sem isso o scanner lê builds antigos da extensão e o gate aprova `@source` quebrado). Gate amarrado no `build` contra a pasta exata `.output/chrome-mv3`. Usa `Button`, `Avatar`/`AvatarFallback`, `Card` e `cn`; o `Button` real não tem `gap`, então toda chamada com ícone leva `gap-2`. Fontes empacotadas por fontsource (famílias "Variable" em `--font-plus-jakarta`/`--font-jetbrains`). O aviso que a extensão desenha **dentro da página** do site **não** usa este pacote nem Tailwind: em shadow root o `--primary` do site vaza para os tokens declarados em `:root`, o `rem` segue o `font-size` do site e `@property` não funciona (detalhes em `apps/extensao/CLAUDE.md`).
```

- [ ] **Step 5: Commit**

```bash
/usr/bin/git add Makefile .github/workflows/ci.yml CLAUDE.md packages/ui/CLAUDE.md \
  && /usr/bin/git commit -m "chore(extensao): alvos do Makefile, job no CI e a extensão nos CLAUDE.md"; echo "exit=$?"
```

---

### Task 3: Pessoa guardada em `local:pessoa`

**Files:**

- Create: `apps/extensao/src/lib/armazenamento.ts`, `apps/extensao/src/lib/armazenamento.test.ts`

**Interfaces:**

- Consumes: `hojeISO()` (Task 1); `gerarPessoa`, `Pessoa` de `@piluvitu/tools/pessoa`; `seedFromBytes` de `@piluvitu/tools/prng`; `cryptoRandomBytes` de `@piluvitu/tools/entropy`.
- Produces (contrato): `pessoaItem` (`storage.defineItem<Pessoa | null>('local:pessoa', { fallback: null, version: 1 })`, tipo inferido `WxtStorageItem<Pessoa | null, {}>`), `gerarPessoaNova(): Promise<Pessoa>`, `obterOuGerarPessoa(): Promise<Pessoa>`.

- [ ] **Step 1: Escrever o teste que falha**

`apps/extensao/src/lib/armazenamento.test.ts`:

```ts
import { validarCPF } from '@piluvitu/tools/cpf'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import {
  gerarPessoaNova,
  obterOuGerarPessoa,
  pessoaItem,
} from './armazenamento'
import { idadeEm } from './hoje'

describe('armazenamento da pessoa', () => {
  // Só o Date é falso: o fakeBrowser.storage trabalha com promises, não com timers.
  beforeEach(() =>
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-10-01T15:00:00Z'),
    }),
  )
  afterEach(() => vi.useRealTimers())

  it('começa vazio', async () => {
    expect(await pessoaItem.getValue()).toBeNull()
  })

  it('guarda a pessoa inteira em local:pessoa, não a semente', async () => {
    await pessoaItem.setValue(PESSOA_DOURADA)
    expect(await fakeBrowser.storage.local.get('pessoa')).toEqual({
      pessoa: PESSOA_DOURADA,
    })
  })

  it('obterOuGerarPessoa gera uma pessoa válida, guarda e devolve', async () => {
    const pessoa = await obterOuGerarPessoa()
    expect(validarCPF(pessoa.cpf)).toBe(true)
    expect(await pessoaItem.getValue()).toEqual(pessoa)
  })

  it('obterOuGerarPessoa devolve a guardada sem gerar outra', async () => {
    await pessoaItem.setValue(PESSOA_DOURADA)
    expect(await obterOuGerarPessoa()).toEqual(PESSOA_DOURADA)
  })

  it('gerarPessoaNova troca a pessoa guardada', async () => {
    await pessoaItem.setValue(PESSOA_DOURADA)
    const nova = await gerarPessoaNova()
    expect(nova).not.toEqual(PESSOA_DOURADA)
    expect(await pessoaItem.getValue()).toEqual(nova)
  })

  it('gera com a data de hoje em São Paulo', async () => {
    const pessoa = await gerarPessoaNova()
    expect(pessoa.nascimento.idade).toBe(
      idadeEm(pessoa.nascimento.iso, '2026-10-01'),
    )
    expect(pessoa.nascimento.idade).toBeGreaterThanOrEqual(18)
    expect(pessoa.nascimento.idade).toBeLessThanOrEqual(65)
  })

  it('watch avisa quem escuta quando outra parte da extensão grava', async () => {
    const ouvinte = vi.fn()
    const pararDeOuvir = pessoaItem.watch(ouvinte)
    await pessoaItem.setValue(PESSOA_DOURADA)
    expect(ouvinte).toHaveBeenCalledWith(PESSOA_DOURADA, null)
    pararDeOuvir()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/lib/armazenamento.test.ts; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import "./armazenamento"`; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/lib/armazenamento.ts`:

```ts
import { cryptoRandomBytes } from '@piluvitu/tools/entropy'
import { gerarPessoa, type Pessoa } from '@piluvitu/tools/pessoa'
import { seedFromBytes } from '@piluvitu/tools/prng'
import { storage } from 'wxt/utils/storage'
import { hojeISO } from './hoje'

export const pessoaItem = storage.defineItem<Pessoa | null>('local:pessoa', {
  fallback: null,
  version: 1,
})

export async function gerarPessoaNova(): Promise<Pessoa> {
  const pessoa = gerarPessoa(seedFromBytes(cryptoRandomBytes(16)), hojeISO())
  await pessoaItem.setValue(pessoa)
  return pessoa
}

export async function obterOuGerarPessoa(): Promise<Pessoa> {
  return (await pessoaItem.getValue()) ?? gerarPessoaNova()
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/lib/armazenamento.test.ts; echo "exit=$?"
```

Esperado: `Tests  7 passed`, `exit=0`.

- [ ] **Step 5: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/src/lib/armazenamento.ts apps/extensao/src/lib/armazenamento.test.ts \
  && /usr/bin/git commit -m "feat(extensao): pessoa inteira guardada em local:pessoa"; echo "exit=$?"
```

---

### Task 4: Páginas proibidas e rótulo do host

**Files:**

- Create: `apps/extensao/src/lib/paginas.ts`, `apps/extensao/src/lib/paginas.test.ts`

**Interfaces:**

- Produces (contrato): `type SituacaoPagina = 'ok' | 'proibida' | 'arquivo-sem-acesso'`, `situacaoDaUrl(url: string | undefined, acessoArquivo: boolean): SituacaoPagina`, `erroEhPaginaProibida(mensagem: string): boolean`. **Acréscimo:** `rotuloDoHost(url: string | undefined): string` (texto da pílula do host).

- [ ] **Step 1: Escrever o teste que falha**

`apps/extensao/src/lib/paginas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { erroEhPaginaProibida, rotuloDoHost, situacaoDaUrl } from './paginas'

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
  ])('%s é proibida pela própria URL, sem injetar nada', (url) => {
    expect(situacaoDaUrl(url, true)).toBe('proibida')
  })

  it.each([
    'http://localhost:3000/cadastro',
    'https://staging.app.dev/conta',
    'https://chrome.google.com/search',
  ])('%s é uma página comum', (url) => {
    expect(situacaoDaUrl(url, false)).toBe('ok')
  })

  it('file: depende do "Permitir acesso a URLs de arquivo"', () => {
    expect(situacaoDaUrl('file:///Users/eu/form.html', false)).toBe(
      'arquivo-sem-acesso',
    )
    expect(situacaoDaUrl('file:///Users/eu/form.html', true)).toBe('ok')
  })

  it('sem URL (aba sem permissão concedida) deixa tentar', () => {
    expect(situacaoDaUrl(undefined, false)).toBe('ok')
  })
})

describe('erroEhPaginaProibida', () => {
  it.each([
    'Cannot access a chrome:// URL',
    'The extensions gallery cannot be scripted.',
    'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
    'Cannot access contents of url "file:///tmp/a.html". Extension manifest must request permission to access this host.',
    'Cannot access a chrome-extension:// URL of different extension',
  ])('reconhece a recusa do Chrome: %s', (mensagem) => {
    expect(erroEhPaginaProibida(mensagem)).toBe(true)
  })

  it.each([
    'No tab with id: 7.',
    'Frame with ID 0 was removed.',
    'Could not establish connection.',
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
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/lib/paginas.test.ts; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import "./paginas"`; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/lib/paginas.ts`:

```ts
export type SituacaoPagina = 'ok' | 'proibida' | 'arquivo-sem-acesso'

const ESQUEMAS_PROIBIDOS = [
  'chrome:',
  'chrome-extension:',
  'edge:',
  'about:',
  'view-source:',
  'devtools:',
  'data:',
]
const RECUSAS_DO_CHROME = [/^Cannot access /, /cannot be scripted/]

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

export function situacaoDaUrl(
  url: string | undefined,
  acessoArquivo: boolean,
): SituacaoPagina {
  if (!url) return 'ok'
  if (ESQUEMAS_PROIBIDOS.some((esquema) => url.startsWith(esquema)))
    return 'proibida'
  if (url.startsWith('file:'))
    return acessoArquivo ? 'ok' : 'arquivo-sem-acesso'
  const lida = lerUrl(url)
  return lida && lojaDoChrome(lida) ? 'proibida' : 'ok'
}

export function erroEhPaginaProibida(mensagem: string): boolean {
  return RECUSAS_DO_CHROME.some((padrao) => padrao.test(mensagem))
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
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/lib/paginas.test.ts; echo "exit=$?"
```

Esperado: `Tests  29 passed`, `exit=0`.

- [ ] **Step 5: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/src/lib/paginas.ts apps/extensao/src/lib/paginas.test.ts \
  && /usr/bin/git commit -m "feat(extensao): páginas proibidas pela URL e pelo erro do executeScript"; echo "exit=$?"
```

---

### Task 5: Soma dos frames e textos do preenchimento

**Files:**

- Create: `apps/extensao/src/lib/resultado.ts`, `apps/extensao/src/lib/resultado.test.ts`
- Create: `apps/extensao/src/lib/textos.ts`, `apps/extensao/src/lib/textos.test.ts`

**Interfaces:**

- Produces (contrato): `LinhaCampo`, `ResultadoFrame`, `ResumoPreenchimento`, `somarFrames(resultados: { documentId: string; frameId: number; result: ResultadoFrame | null | undefined }[]): ResumoPreenchimento`, `tituloPreenchimento(x: number, y: number): string`, `linhaNaoReconhecidos(k: number): string`. **Acréscimo:** `primeiroNaoReconhecido(r: ResultadoFrame): number | undefined` (menor `idx` entre não reconhecidos e recusados, usado pelo aviso).

- [ ] **Step 1: Escrever os testes que falham**

`apps/extensao/src/lib/resultado.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  primeiroNaoReconhecido,
  somarFrames,
  type ResultadoFrame,
} from './resultado'

const linha = (idx: number, rotulo: string, seletor = `input#c${idx}`) => ({
  idx,
  rotulo,
  seletor,
})

const TOPO: ResultadoFrame = {
  preenchidos: [linha(1, 'Nome'), linha(2, 'E-mail'), linha(5, 'CEP')],
  naoReconhecidos: [linha(4, 'Código de indicação', 'input[name="ref_code"]')],
  recusados: [linha(3, 'Senha', 'input[name="senha"]')],
  contentType: 'text/html',
  iframesDeFora: 1,
}
const QUADRO: ResultadoFrame = {
  preenchidos: [linha(1, 'Número do cartão')],
  naoReconhecidos: [linha(2, 'Como nos conheceu?', 'select#origem')],
  recusados: [],
  contentType: 'text/html',
  iframesDeFora: 0,
}

describe('somarFrames', () => {
  it('soma X, Y e k de todos os frames e ignora frame sem resultado', () => {
    const resumo = somarFrames([
      { documentId: 'quadro', frameId: 7, result: QUADRO },
      { documentId: 'morto', frameId: 9, result: null },
      { documentId: 'sem-script', frameId: 11, result: undefined },
      { documentId: 'topo', frameId: 0, result: TOPO },
    ])
    expect(resumo).toMatchObject({ x: 4, y: 7, k: 3 })
  })

  it('lista o frame 0 primeiro, na ordem do DOM, e marca o recusado', () => {
    const resumo = somarFrames([
      { documentId: 'quadro', frameId: 7, result: QUADRO },
      { documentId: 'topo', frameId: 0, result: TOPO },
    ])
    expect(resumo.naoReconhecidos).toEqual([
      {
        documentId: 'topo',
        idx: 3,
        rotulo: 'Senha (recusou o valor)',
        seletor: 'input[name="senha"]',
      },
      {
        documentId: 'topo',
        idx: 4,
        rotulo: 'Código de indicação',
        seletor: 'input[name="ref_code"]',
      },
      {
        documentId: 'quadro',
        idx: 2,
        rotulo: 'Como nos conheceu?',
        seletor: 'select#origem',
      },
    ])
  })

  it('contentType e iframes de fora vêm só do frame 0', () => {
    const resumo = somarFrames([
      {
        documentId: 'quadro',
        frameId: 7,
        result: { ...QUADRO, contentType: 'application/xml', iframesDeFora: 5 },
      },
      { documentId: 'topo', frameId: 0, result: TOPO },
    ])
    expect(resumo).toMatchObject({ contentType: 'text/html', iframesDeFora: 1 })
  })

  it('sem nenhum resultado tudo é zero', () => {
    expect(somarFrames([])).toEqual({
      x: 0,
      y: 0,
      k: 0,
      naoReconhecidos: [],
      contentType: '',
      iframesDeFora: 0,
    })
  })
})

describe('primeiroNaoReconhecido', () => {
  it('é o menor idx entre não reconhecidos e recusados', () => {
    expect(primeiroNaoReconhecido(TOPO)).toBe(3)
  })

  it('é undefined quando tudo foi preenchido', () => {
    expect(
      primeiroNaoReconhecido({ ...TOPO, naoReconhecidos: [], recusados: [] }),
    ).toBeUndefined()
  })
})
```

`apps/extensao/src/lib/textos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { linhaNaoReconhecidos, tituloPreenchimento } from './textos'

describe('tituloPreenchimento', () => {
  it('concorda com Y', () => {
    expect(tituloPreenchimento(12, 14)).toBe('12 de 14 campos preenchidos')
    expect(tituloPreenchimento(1, 1)).toBe('1 de 1 campo preenchido')
    expect(tituloPreenchimento(0, 1)).toBe('0 de 1 campo preenchido')
    expect(tituloPreenchimento(0, 2)).toBe('0 de 2 campos preenchidos')
  })
})

describe('linhaNaoReconhecidos', () => {
  it('concorda com k', () => {
    expect(linhaNaoReconhecidos(2)).toBe('2 não reconhecidos')
    expect(linhaNaoReconhecidos(1)).toBe('1 não reconhecido')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/lib/resultado.test.ts src/lib/textos.test.ts; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import "./resultado"` e `"./textos"`; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/lib/resultado.ts`:

```ts
export interface LinhaCampo {
  documentId: string
  idx: number
  rotulo: string
  seletor: string
}

export interface ResultadoFrame {
  preenchidos: Omit<LinhaCampo, 'documentId'>[]
  naoReconhecidos: Omit<LinhaCampo, 'documentId'>[]
  recusados: Omit<LinhaCampo, 'documentId'>[]
  contentType: string
  iframesDeFora: number
}

export interface ResumoPreenchimento {
  x: number
  y: number
  k: number
  naoReconhecidos: LinhaCampo[]
  contentType: string
  iframesDeFora: number
}

interface ResultadoDoFrame {
  documentId: string
  frameId: number
  result: ResultadoFrame | null | undefined
}

const SUFIXO_RECUSADO = ' (recusou o valor)'

export function somarFrames(
  resultados: ResultadoDoFrame[],
): ResumoPreenchimento {
  const validos = resultados.filter(
    (r): r is ResultadoDoFrame & { result: ResultadoFrame } => r.result != null,
  )
  const topoPrimeiro = [...validos].sort(
    (a, b) => Number(a.frameId !== 0) - Number(b.frameId !== 0),
  )
  let x = 0
  const naoReconhecidos: LinhaCampo[] = []
  for (const { documentId, result } of topoPrimeiro) {
    x += result.preenchidos.length
    const doFrame = [
      ...result.naoReconhecidos.map((l) => ({ ...l, documentId })),
      ...result.recusados.map((l) => ({
        ...l,
        documentId,
        rotulo: `${l.rotulo}${SUFIXO_RECUSADO}`,
      })),
    ].sort((a, b) => a.idx - b.idx)
    naoReconhecidos.push(...doFrame)
  }
  const topo = validos.find((r) => r.frameId === 0)?.result
  const k = naoReconhecidos.length
  return {
    x,
    y: x + k,
    k,
    naoReconhecidos,
    contentType: topo?.contentType ?? '',
    iframesDeFora: topo?.iframesDeFora ?? 0,
  }
}

export function primeiroNaoReconhecido(r: ResultadoFrame): number | undefined {
  const idxs = [...r.naoReconhecidos, ...r.recusados].map((l) => l.idx)
  return idxs.length > 0 ? Math.min(...idxs) : undefined
}
```

`apps/extensao/src/lib/textos.ts`:

```ts
export function tituloPreenchimento(x: number, y: number): string {
  return y === 1
    ? `${x} de 1 campo preenchido`
    : `${x} de ${y} campos preenchidos`
}

export function linhaNaoReconhecidos(k: number): string {
  return k === 1 ? '1 não reconhecido' : `${k} não reconhecidos`
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/lib/resultado.test.ts src/lib/textos.test.ts; echo "exit=$?"
```

Esperado: `Tests  8 passed`, `exit=0`.

- [ ] **Step 5: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/src/lib/resultado.ts apps/extensao/src/lib/resultado.test.ts apps/extensao/src/lib/textos.ts apps/extensao/src/lib/textos.test.ts \
  && /usr/bin/git commit -m "feat(extensao): soma dos frames e textos do preenchimento com plural"; echo "exit=$?"
```

---

### Task 6: Mensagens e menu de contexto com `Inserir ›`

**Files:**

- Create: `apps/extensao/src/lib/mensagens.ts`, `apps/extensao/src/lib/mensagens.test.ts`
- Create: `apps/extensao/src/lib/menus.ts`, `apps/extensao/src/lib/menus.test.ts`

**Interfaces:**

- Consumes: `ResumoPreenchimento` (Task 5); `FieldKind` de `@piluvitu/tools/campos`; `Pessoa` de `@piluvitu/tools/pessoa`.
- Produces (contrato): `type Mensagem`, `type RespostaPreencher`, `enviar(m: Mensagem): Promise<unknown>`; `ITENS_INSERIR: readonly { kind: FieldKind; rotulo: string; grupo: 1|2|3|4|5 }[]` (os 23 do 1g, na ordem), `criarMenus(pessoa: Pessoa | null): Promise<void>`, `atualizarTitulosMenu(pessoa: Pessoa | null): Promise<void>`. **Acréscimos:** `MENU = { preencher: 'preencher', inserir: 'inserir', novaPessoa: 'nova-pessoa', abrirCaixa: 'abrir-caixa' }`, `PREFIXO_INSERIR = 'inserir:'` (o id de cada item é `inserir:<kind>`).

- [ ] **Step 1: Escrever os testes que falham**

`apps/extensao/src/lib/mensagens.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { enviar, type Mensagem } from './mensagens'

describe('enviar', () => {
  it('manda a mensagem pelo runtime e devolve a resposta do background', async () => {
    const recebidas: unknown[] = []
    fakeBrowser.runtime.onMessage.addListener(
      (mensagem, _remetente, responder) => {
        recebidas.push(mensagem)
        responder({ ok: false, motivo: 'proibida' })
        return true
      },
    )
    const mensagem: Mensagem = { tipo: 'preencher', tabId: 7 }
    await expect(enviar(mensagem)).resolves.toEqual({
      ok: false,
      motivo: 'proibida',
    })
    expect(recebidas).toEqual([mensagem])
  })
})
```

`apps/extensao/src/lib/menus.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import { atualizarTitulosMenu, criarMenus, ITENS_INSERIR, MENU } from './menus'

// O fakeBrowser não implementa contextMenus: create/removeAll/update viram stubs.
const criar = vi.fn()
const removerTudo = vi.fn(async () => undefined)
const atualizar = vi.fn(async () => undefined)

interface Criado {
  id: string
  title?: string
  type?: string
  parentId?: string
  contexts: string[]
}
const criados = () =>
  criar.mock.calls.map(([propriedades]) => propriedades as Criado)

beforeEach(() => {
  criar.mockReset()
  removerTudo.mockClear()
  atualizar.mockReset()
  atualizar.mockResolvedValue(undefined)
  Object.assign(fakeBrowser.contextMenus, {
    create: criar,
    removeAll: removerTudo,
    update: atualizar,
  })
})

describe('ITENS_INSERIR', () => {
  it('são os 23 itens do 1g, na ordem, em 5 grupos de 7, 7, 3, 4 e 2', () => {
    expect(ITENS_INSERIR.map((i) => i.rotulo)).toEqual([
      'Nome completo',
      'Data de nascimento',
      'CPF',
      'RG',
      'Celular',
      'E-mail',
      'Senha',
      'CEP',
      'Rua',
      'Número',
      'Complemento',
      'Bairro',
      'Cidade',
      'UF',
      'Razão social',
      'Nome fantasia',
      'CNPJ',
      'Cartão: número',
      'Cartão: nome impresso',
      'Cartão: validade',
      'Cartão: CVV',
      'PIS/NIS',
      'Título de eleitor',
    ])
    expect(
      [1, 2, 3, 4, 5].map(
        (g) => ITENS_INSERIR.filter((i) => i.grupo === g).length,
      ),
    ).toEqual([7, 7, 3, 4, 2])
    expect(ITENS_INSERIR.map((i) => i.kind)).toEqual([
      'nomeCompleto',
      'nascimento',
      'cpf',
      'rg',
      'celular',
      'email',
      'senha',
      'cep',
      'logradouro',
      'numeroEndereco',
      'complemento',
      'bairro',
      'cidade',
      'uf',
      'razaoSocial',
      'nomeFantasia',
      'cnpj',
      'cartaoNumero',
      'cartaoNome',
      'cartaoValidade',
      'cartaoCvv',
      'pis',
      'tituloEleitor',
    ])
  })
})

describe('criarMenus', () => {
  it('apaga os menus antigos antes de criar', async () => {
    await criarMenus(null)
    expect(removerTudo).toHaveBeenCalledTimes(1)
    expect(removerTudo.mock.invocationCallOrder[0]).toBeLessThan(
      criar.mock.invocationCallOrder[0],
    )
  })

  it('monta o nível de cima do 1g com os contextos certos', async () => {
    await criarMenus(null)
    const topo = criados().filter((c) => c.parentId === undefined)
    expect(topo).toEqual([
      {
        id: MENU.preencher,
        title: 'Preencher esta página',
        contexts: ['page', 'editable'],
      },
      { id: 'separador-1', type: 'separator', contexts: ['page', 'editable'] },
      { id: MENU.inserir, title: 'Inserir', contexts: ['editable'] },
      { id: 'separador-2', type: 'separator', contexts: ['page', 'editable'] },
      {
        id: MENU.novaPessoa,
        title: 'Nova pessoa',
        contexts: ['page', 'editable'],
      },
      {
        id: MENU.abrirCaixa,
        title: 'Abrir caixa de entrada',
        contexts: ['page', 'editable'],
      },
    ])
  })

  it('põe os 23 itens e 4 separadores dentro de Inserir, só em campos editáveis', async () => {
    await criarMenus(null)
    const filhos = criados().filter((c) => c.parentId === MENU.inserir)
    expect(filhos).toHaveLength(27)
    expect(
      filhos.every(
        (c) => c.contexts.length === 1 && c.contexts[0] === 'editable',
      ),
    ).toBe(true)
    expect(
      filhos
        .map((c) =>
          c.type === 'separator' ? '|' : c.id.replace('inserir:', ''),
        )
        .join(' '),
    ).toBe(
      'nomeCompleto nascimento cpf rg celular email senha | cep logradouro numeroEndereco complemento bairro cidade uf | razaoSocial nomeFantasia cnpj | cartaoNumero cartaoNome cartaoValidade cartaoCvv | pis tituloEleitor',
    )
  })

  it('mostra o CPF e o CEP da pessoa no título; sem pessoa, só o rótulo', async () => {
    await criarMenus(PESSOA_DOURADA)
    const titulo = (id: string) => criados().find((c) => c.id === id)?.title
    expect(titulo('inserir:cpf')).toBe(`CPF · ${PESSOA_DOURADA.cpf}`)
    expect(titulo('inserir:cep')).toBe(`CEP · ${PESSOA_DOURADA.endereco.cep}`)
    expect(titulo('inserir:email')).toBe('E-mail')

    criar.mockReset()
    await criarMenus(null)
    expect(titulo('inserir:cpf')).toBe('CPF')
    expect(titulo('inserir:cep')).toBe('CEP')
  })
})

describe('atualizarTitulosMenu', () => {
  it('atualiza só os títulos de CPF e CEP', async () => {
    await atualizarTitulosMenu(PESSOA_DOURADA)
    expect(atualizar.mock.calls).toEqual([
      ['inserir:cpf', { title: `CPF · ${PESSOA_DOURADA.cpf}` }],
      ['inserir:cep', { title: `CEP · ${PESSOA_DOURADA.endereco.cep}` }],
    ])
  })

  it('não quebra quando o menu ainda não existe', async () => {
    atualizar.mockRejectedValue(
      new Error('Cannot find menu item with id inserir:cpf'),
    )
    await expect(atualizarTitulosMenu(null)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/lib/mensagens.test.ts src/lib/menus.test.ts; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import "./mensagens"` e `"./menus"`; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/lib/mensagens.ts`:

```ts
import type { FieldKind } from '@piluvitu/tools/campos'
import { browser } from 'wxt/browser'
import type { ResumoPreenchimento } from './resultado'

export type Mensagem =
  | { tipo: 'preencher'; tabId: number }
  | { tipo: 'mostrar'; tabId: number; documentId: string; idx: number }
  | { tipo: 'inserir'; tabId: number; frameId: number; kind: FieldKind }

export type RespostaPreencher =
  | { ok: true; resumo: ResumoPreenchimento }
  | { ok: false; motivo: 'proibida' | 'arquivo-sem-acesso' }

export function enviar(m: Mensagem): Promise<unknown> {
  return browser.runtime.sendMessage(m)
}
```

`apps/extensao/src/lib/menus.ts`:

```ts
import type { FieldKind } from '@piluvitu/tools/campos'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import { browser, type Browser } from 'wxt/browser'

export const MENU = {
  preencher: 'preencher',
  inserir: 'inserir',
  novaPessoa: 'nova-pessoa',
  abrirCaixa: 'abrir-caixa',
} as const

export const PREFIXO_INSERIR = 'inserir:'

export const ITENS_INSERIR: readonly {
  kind: FieldKind
  rotulo: string
  grupo: 1 | 2 | 3 | 4 | 5
}[] = [
  { kind: 'nomeCompleto', rotulo: 'Nome completo', grupo: 1 },
  { kind: 'nascimento', rotulo: 'Data de nascimento', grupo: 1 },
  { kind: 'cpf', rotulo: 'CPF', grupo: 1 },
  { kind: 'rg', rotulo: 'RG', grupo: 1 },
  { kind: 'celular', rotulo: 'Celular', grupo: 1 },
  { kind: 'email', rotulo: 'E-mail', grupo: 1 },
  { kind: 'senha', rotulo: 'Senha', grupo: 1 },
  { kind: 'cep', rotulo: 'CEP', grupo: 2 },
  { kind: 'logradouro', rotulo: 'Rua', grupo: 2 },
  { kind: 'numeroEndereco', rotulo: 'Número', grupo: 2 },
  { kind: 'complemento', rotulo: 'Complemento', grupo: 2 },
  { kind: 'bairro', rotulo: 'Bairro', grupo: 2 },
  { kind: 'cidade', rotulo: 'Cidade', grupo: 2 },
  { kind: 'uf', rotulo: 'UF', grupo: 2 },
  { kind: 'razaoSocial', rotulo: 'Razão social', grupo: 3 },
  { kind: 'nomeFantasia', rotulo: 'Nome fantasia', grupo: 3 },
  { kind: 'cnpj', rotulo: 'CNPJ', grupo: 3 },
  { kind: 'cartaoNumero', rotulo: 'Cartão: número', grupo: 4 },
  { kind: 'cartaoNome', rotulo: 'Cartão: nome impresso', grupo: 4 },
  { kind: 'cartaoValidade', rotulo: 'Cartão: validade', grupo: 4 },
  { kind: 'cartaoCvv', rotulo: 'Cartão: CVV', grupo: 4 },
  { kind: 'pis', rotulo: 'PIS/NIS', grupo: 5 },
  { kind: 'tituloEleitor', rotulo: 'Título de eleitor', grupo: 5 },
]

type Propriedades = Browser.contextMenus.CreateProperties
type ItemInserir = (typeof ITENS_INSERIR)[number]

const PAGINA_E_CAMPO: Propriedades['contexts'] = ['page', 'editable']
const CAMPO: Propriedades['contexts'] = ['editable']

function tituloDoItem(item: ItemInserir, pessoa: Pessoa | null): string {
  if (pessoa && item.kind === 'cpf') return `CPF · ${pessoa.cpf}`
  if (pessoa && item.kind === 'cep') return `CEP · ${pessoa.endereco.cep}`
  return item.rotulo
}

export async function criarMenus(pessoa: Pessoa | null): Promise<void> {
  await browser.contextMenus.removeAll()
  const criar = (propriedades: Propriedades) =>
    browser.contextMenus.create(propriedades)
  criar({
    id: MENU.preencher,
    title: 'Preencher esta página',
    contexts: PAGINA_E_CAMPO,
  })
  criar({ id: 'separador-1', type: 'separator', contexts: PAGINA_E_CAMPO })
  criar({ id: MENU.inserir, title: 'Inserir', contexts: CAMPO })
  ITENS_INSERIR.forEach((item, i) => {
    if (i > 0 && ITENS_INSERIR[i - 1].grupo !== item.grupo) {
      criar({
        id: `inserir-separador-${item.grupo}`,
        parentId: MENU.inserir,
        type: 'separator',
        contexts: CAMPO,
      })
    }
    criar({
      id: `${PREFIXO_INSERIR}${item.kind}`,
      parentId: MENU.inserir,
      title: tituloDoItem(item, pessoa),
      contexts: CAMPO,
    })
  })
  criar({ id: 'separador-2', type: 'separator', contexts: PAGINA_E_CAMPO })
  criar({ id: MENU.novaPessoa, title: 'Nova pessoa', contexts: PAGINA_E_CAMPO })
  criar({
    id: MENU.abrirCaixa,
    title: 'Abrir caixa de entrada',
    contexts: PAGINA_E_CAMPO,
  })
}

export async function atualizarTitulosMenu(
  pessoa: Pessoa | null,
): Promise<void> {
  const comValor = ITENS_INSERIR.filter(
    (item) => item.kind === 'cpf' || item.kind === 'cep',
  )
  await Promise.all(
    comValor.map((item) =>
      browser.contextMenus
        .update(`${PREFIXO_INSERIR}${item.kind}`, {
          title: tituloDoItem(item, pessoa),
        })
        // Menu ainda não criado: criarMenus o cria já com o título certo.
        .catch(() => undefined),
    ),
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/lib/mensagens.test.ts src/lib/menus.test.ts; echo "exit=$?"
```

Esperado: `Tests  8 passed`, `exit=0`.

- [ ] **Step 5: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/src/lib/mensagens.ts apps/extensao/src/lib/mensagens.test.ts apps/extensao/src/lib/menus.ts apps/extensao/src/lib/menus.test.ts \
  && /usr/bin/git commit -m "feat(extensao): mensagens do popup e menu de contexto com Inserir"; echo "exit=$?"
```

---

### Task 7: Storybook próprio e casca do popup (marca, pílula do host, rodapé)

**Files:**

- Create: `apps/extensao/.storybook/main.ts`, `apps/extensao/.storybook/preview.tsx`
- Create: `apps/extensao/src/components/marca.tsx`, `marca.stories.tsx`, `apps/extensao/src/components/tipografia.ts`
- Create: `apps/extensao/src/components/pilula-host.tsx`, `pilula-host.test.tsx`, `pilula-host.stories.tsx`
- Create: `apps/extensao/src/components/popup-shell.tsx`, `popup-shell.test.tsx`, `popup-shell.stories.tsx`
- Create: `apps/extensao/src/components/rodape.tsx`, `rodape.test.tsx`, `rodape.stories.tsx`

Porte de `R/popup/PopupShell.tsx`, `R/popup/Marca.tsx` e `R/popup/tipografia.ts`, com três mudanças: a pílula do host vira o componente `PilulaHost`; o `Rodape` ganha o estado "sem atalho" (só o link "definir atalho") e o "alterar" passa a ser opcional por `comAlterar`; botões locais ganham `focus-visible`.

**Interfaces:**

- Produces: `Marca({ className? })`; constantes `OVERLINE`, `META_MONO`, `BOTAO_SM`, `PAINEL`, `CORPO` (strings de classe); `type StatusHost = 'ok' | 'warn' | 'lock'`; `PilulaHost({ host: string; status: StatusHost })`; `PopupShell({ host: string; status: StatusHost; rodape?: ReactNode; children: ReactNode })`; `Rodape({ atalho: string; texto: string; comAlterar?: boolean; onAlterarAtalho: () => void })`. Todos de apresentação (props in, sem `browser.*`).

- [ ] **Step 1: Configurar o Storybook (react-vite 10.3.1, porta 6018)**

`apps/extensao/.storybook/main.ts` (o Storybook não lê o `wxt.config.ts`, então o Tailwind entra de novo aqui):

```ts
import type { StorybookConfig } from '@storybook/react-vite'
import tailwindcss from '@tailwindcss/vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: [],
  framework: { name: '@storybook/react-vite', options: {} },
  async viteFinal(configuracao) {
    configuracao.plugins = [...(configuracao.plugins ?? []), tailwindcss()]
    return configuracao
  },
}

export default config
```

`apps/extensao/.storybook/preview.tsx` (o tema escolhido na barra, ou por `globals` da story, liga a classe `.dark` no `<html>`, como o `tema.ts` faz no popup):

```tsx
import { config } from '@fortawesome/fontawesome-svg-core'
import type { Preview } from '@storybook/react-vite'
import '../src/styles.css'

config.autoAddCss = false

const preview: Preview = {
  initialGlobals: { tema: 'escuro' },
  globalTypes: {
    tema: {
      description: 'Tema do popup',
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
        <div className="bg-background text-foreground">
          <Story />
        </div>
      )
    },
  ],
}

export default preview
```

- [ ] **Step 2: Escrever os testes que falham**

`apps/extensao/src/components/pilula-host.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PilulaHost } from './pilula-host'

describe('PilulaHost', () => {
  it('mostra o host com o ponto ok', () => {
    const { container } = render(
      <PilulaHost host="localhost:3000" status="ok" />,
    )
    expect(screen.getByText('localhost:3000')).toBeInTheDocument()
    expect(container.querySelector('.bg-ok')).not.toBeNull()
  })

  it('usa o ponto warn', () => {
    const { container } = render(
      <PilulaHost host="staging.app.dev" status="warn" />,
    )
    expect(container.querySelector('.bg-warn')).not.toBeNull()
  })

  it('troca o ponto pelo cadeado na página proibida', () => {
    const { container } = render(
      <PilulaHost host="chrome://settings" status="lock" />,
    )
    expect(container.querySelector('svg[data-icon="lock"]')).not.toBeNull()
    expect(container.querySelector('.bg-ok, .bg-warn')).toBeNull()
  })

  it('guarda o host inteiro no title, porque o texto trunca', () => {
    const host = 'homologacao-do-cliente-com-nome-comprido.empresa.com.br:8443'
    render(<PilulaHost host={host} status="ok" />)
    expect(screen.getByTitle(host)).toBeInTheDocument()
  })
})
```

`apps/extensao/src/components/popup-shell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PopupShell } from './popup-shell'

describe('PopupShell', () => {
  it('desenha marca, nome e pílula do host em volta do conteúdo', () => {
    render(
      <PopupShell host="localhost:3000" status="ok">
        <p>conteúdo do estado</p>
      </PopupShell>,
    )
    expect(screen.getByText('piluvitu')).toBeInTheDocument()
    expect(screen.getByText('dados de teste')).toBeInTheDocument()
    expect(screen.getByText('localhost:3000')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('conteúdo do estado')
  })

  it('mostra o rodapé quando recebe um, e nenhum quando não recebe', () => {
    const { rerender } = render(
      <PopupShell
        host="localhost:3000"
        status="ok"
        rodape={<footer>rodapé</footer>}
      >
        <p />
      </PopupShell>,
    )
    expect(screen.getByRole('contentinfo')).toHaveTextContent('rodapé')
    rerender(
      <PopupShell host="chrome://settings" status="lock">
        <p />
      </PopupShell>,
    )
    expect(screen.queryByRole('contentinfo')).toBeNull()
  })
})
```

`apps/extensao/src/components/rodape.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Rodape } from './rodape'

describe('Rodape', () => {
  it('mostra o atalho num kbd e o texto do estado, sem "alterar" por padrão', () => {
    render(
      <Rodape
        atalho="⌥⇧P"
        texto="preenche sem abrir o popup"
        onAlterarAtalho={vi.fn()}
      />,
    )
    expect(screen.getByText('⌥⇧P').tagName).toBe('KBD')
    expect(screen.getByText('preenche sem abrir o popup')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'alterar' })).toBeNull()
  })

  it('"alterar" abre a troca de atalho', async () => {
    const abrir = vi.fn()
    render(
      <Rodape
        atalho="Alt+Shift+P"
        texto="preenche sem abrir"
        comAlterar
        onAlterarAtalho={abrir}
      />,
    )
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'alterar' }))
    expect(abrir).toHaveBeenCalledTimes(1)
  })

  it('sem atalho o rodapé inteiro vira o link "definir atalho"', async () => {
    const abrir = vi.fn()
    render(
      <Rodape
        atalho=""
        texto="preenche sem abrir"
        comAlterar
        onAlterarAtalho={abrir}
      />,
    )
    expect(screen.queryByText('preenche sem abrir')).toBeNull()
    expect(screen.queryByRole('button', { name: 'alterar' })).toBeNull()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'definir atalho' }))
    expect(abrir).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/components; echo "exit=$?"
```

Esperado: FAIL nos três arquivos com `Failed to resolve import`; `exit=1`.

- [ ] **Step 4: Implementar os componentes**

`apps/extensao/src/components/marca.tsx`:

```tsx
export function Marca({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 22 22" className={className} aria-hidden="true">
      <rect x="1" y="9" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="9" y="9" width="7" height="7" rx="1" fill="currentColor" />
      <rect x="9" y="1" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  )
}
```

`apps/extensao/src/components/tipografia.ts`:

```ts
export const OVERLINE =
  'font-mono text-[10.5px] font-medium uppercase tracking-[0.2em]'
export const META_MONO =
  'font-mono text-[11px] font-medium text-muted-foreground'
export const BOTAO_SM = 'w-full gap-2 rounded-[14px] text-[13px]'
export const PAINEL = 'rounded-[14px] px-3.5 py-3 shadow-none'
export const CORPO =
  'm-0 text-[13px] leading-[1.55] text-muted-foreground text-pretty'
```

`apps/extensao/src/components/pilula-host.tsx`:

```tsx
import { faLock } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { cn } from '@piluvitu/ui/cn'

export type StatusHost = 'ok' | 'warn' | 'lock'

export function PilulaHost({
  host,
  status,
}: {
  host: string
  status: StatusHost
}) {
  return (
    <div
      title={host}
      className="text-muted-foreground ml-auto flex min-w-0 items-center gap-[5px] rounded-full border px-2 py-[3px] font-mono text-[10.5px] font-medium whitespace-nowrap"
    >
      {status === 'lock' ? (
        <FontAwesomeIcon icon={faLock} className="text-[9px]" />
      ) : (
        <span
          className={cn(
            'size-1.5 flex-none rounded-full',
            status === 'ok' ? 'bg-ok' : 'bg-warn',
          )}
        />
      )}
      <span className="truncate">{host}</span>
    </div>
  )
}
```

`apps/extensao/src/components/popup-shell.tsx`:

```tsx
import type { ReactNode } from 'react'
import { Marca } from './marca'
import { PilulaHost, type StatusHost } from './pilula-host'

export function PopupShell({
  host,
  status,
  rodape,
  children,
}: {
  host: string
  status: StatusHost
  rodape?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex max-h-[600px] flex-col">
      <header className="flex flex-none items-center gap-2 border-b py-3 pr-3 pl-3.5 leading-[normal]">
        <Marca className="text-primary size-[18px] flex-none" />
        <div className="flex flex-none items-baseline gap-2 whitespace-nowrap">
          <span className="text-sm font-bold tracking-[-0.01em]">piluvitu</span>
          <span className="text-muted-foreground font-mono text-[9.5px] font-medium tracking-[0.12em] uppercase">
            dados de teste
          </span>
        </div>
        <PilulaHost host={host} status={status} />
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>
      {rodape}
    </div>
  )
}
```

`apps/extensao/src/components/rodape.tsx`:

```tsx
import { cn } from '@piluvitu/ui/cn'

const LINK =
  'text-primary cursor-pointer underline-offset-[3px] hover:underline focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-1'

export function Rodape({
  atalho,
  texto,
  comAlterar = false,
  onAlterarAtalho,
}: {
  atalho: string
  texto: string
  comAlterar?: boolean
  onAlterarAtalho: () => void
}) {
  return (
    <footer className="text-muted-foreground flex flex-none items-center gap-2 border-t px-4 py-2.5 font-mono text-[11px] leading-[normal] font-medium">
      {atalho === '' ? (
        <button type="button" onClick={onAlterarAtalho} className={LINK}>
          definir atalho
        </button>
      ) : (
        <>
          <kbd className="text-foreground rounded-[6px] border px-1.5 py-0.5 font-mono">
            {atalho}
          </kbd>
          <span>{texto}</span>
          {comAlterar && (
            <button
              type="button"
              onClick={onAlterarAtalho}
              className={cn(LINK, 'ml-auto')}
            >
              alterar
            </button>
          )}
        </>
      )}
    </footer>
  )
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/components; echo "exit=$?"
```

Esperado: `Test Files  3 passed`, `Tests  9 passed`, `exit=0`.

- [ ] **Step 6: Stories (claro e escuro, com e sem atalho)**

`apps/extensao/src/components/marca.stories.tsx` (a marca é componente visual próprio, então ganha story própria além de aparecer na casca):

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Marca } from './marca'

const meta = {
  title: 'Popup/Marca',
  component: Marca,
  args: { className: 'text-primary size-12' },
  decorators: [
    (Story) => (
      <div className="p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Marca>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
```

`apps/extensao/src/components/pilula-host.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { PilulaHost } from './pilula-host'

const meta = {
  title: 'Popup/Pílula do host',
  component: PilulaHost,
  args: { host: 'localhost:3000', status: 'ok' },
  decorators: [
    (Story) => (
      <div className="flex p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PilulaHost>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const Atencao: Story = {
  args: { host: 'staging.app.dev', status: 'warn' },
}
export const Cadeado: Story = {
  args: { host: 'chrome://settings', status: 'lock' },
}
export const HostLongo: Story = {
  args: {
    host: 'homologacao-do-cliente-com-nome-comprido.empresa.com.br:8443',
  },
}
```

`apps/extensao/src/components/popup-shell.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PopupShell } from './popup-shell'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/Casca',
  component: PopupShell,
  args: {
    host: 'localhost:3000',
    status: 'ok',
    children: (
      <p className="text-muted-foreground m-0 p-4 text-sm">
        conteúdo do estado
      </p>
    ),
    rodape: (
      <Rodape
        atalho="Alt+Shift+P"
        texto="preenche sem abrir"
        comAlterar
        onAlterarAtalho={fn()}
      />
    ),
  },
} satisfies Meta<typeof PopupShell>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const SemAtalho: Story = {
  args: {
    rodape: (
      <Rodape
        atalho=""
        texto="preenche sem abrir"
        comAlterar
        onAlterarAtalho={fn()}
      />
    ),
  },
}
export const PaginaProibida: Story = {
  args: { host: 'chrome://settings', status: 'lock', rodape: undefined },
}
```

`apps/extensao/src/components/rodape.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/Rodapé',
  component: Rodape,
  args: {
    atalho: 'Alt+Shift+P',
    texto: 'preenche sem abrir',
    comAlterar: true,
    onAlterarAtalho: fn(),
  },
} satisfies Meta<typeof Rodape>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const AtalhoDoMac: Story = { args: { atalho: '⌥⇧P' } }
export const PrimeiroUso: Story = {
  args: { texto: 'preenche sem abrir o popup', comAlterar: false },
}
export const SemAtalho: Story = { args: { atalho: '' } }
```

- [ ] **Step 7: Build do Storybook e conferência das stories**

```bash
pnpm --filter @piluvitu/extensao build-storybook; echo "exit=$?"
cd apps/extensao && node -e "
const assert = require('node:assert')
const indice = require('./storybook-static/index.json')
const nomes = new Set(Object.values(indice.entries).filter((e) => e.type === 'story').map((e) => e.title + ' / ' + e.name))
for (const n of ['Popup/Casca / Escuro', 'Popup/Casca / Claro', 'Popup/Casca / Sem Atalho', 'Popup/Pílula do host / Cadeado', 'Popup/Rodapé / Sem Atalho', 'Popup/Marca / Claro']) assert.ok(nomes.has(n), 'falta a story ' + n)
console.log(nomes.size + ' stories ok')
"; echo "exit=$?"
```

Esperado: os dois `exit=0` e `16 stories ok`.

- [ ] **Step 8: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/.storybook apps/extensao/src/components \
  && /usr/bin/git commit -m "feat(extensao): Storybook próprio e casca do popup"; echo "exit=$?"
```

---

### Task 8: Linha copiável, chips de filtro e grupos do 1b

**Files:**

- Create: `apps/extensao/src/components/linha-copiavel.tsx`, `linha-copiavel.test.tsx`, `linha-copiavel.stories.tsx`
- Create: `apps/extensao/src/components/use-copiado.ts`, `use-copiado.test.ts`
- Create: `apps/extensao/src/components/filtro-chips.tsx`, `filtro-chips.test.tsx`, `filtro-chips.stories.tsx`
- Create: `apps/extensao/src/lib/grupos.ts`, `apps/extensao/src/lib/grupos.test.ts`

Porte de `CopyRow`, `FilterChips` e `useCopiado` de `R/popup/Dados.tsx`, e das linhas `G` de `R/popup/main.tsx` (agora tiradas da `Pessoa` aninhada da fase 1, e não de uma pessoa plana de exemplo). O `useCopiado` deixa de usar `ref` + `setTimeout` solto: o tempo vira um efeito que depende da marca (assim o ESLint de hooks não reclama de `ref.current` na limpeza), e copiar de novo reinicia a contagem.

**Interfaces:**

- Consumes: `Pessoa` de `@piluvitu/tools/pessoa`; `PESSOA_DOURADA` (Task 1).
- Produces: `LinhaCopiavel({ rotulo: string; valor: string; copiado: boolean; onCopiar: () => void })`; `useCopiado(ms = 1400): { chave: string | null; marcar(chave: string): void; limpar(): void }`; `FiltroChips<T extends string>({ opcoes: readonly { id: T; rotulo: string }[]; ativo: T; onChange: (id: T) => void })`; em `src/lib/grupos.ts`: `type IdGrupo = 'pessoais' | 'email' | 'endereco' | 'empresa' | 'cartao' | 'docs'`, `interface LinhaDado { rotulo: string; valor: string }`, `interface GrupoDados { id: IdGrupo; rotulo: string; linhas: LinhaDado[] }`, `gruposDaPessoa(p: Pessoa): GrupoDados[]`, `CHIPS: readonly { id: 'tudo' | IdGrupo; rotulo: string }[]`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/extensao/src/components/linha-copiavel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LinhaCopiavel } from './linha-copiavel'

describe('LinhaCopiavel', () => {
  it('mostra rótulo e valor e copia pelo botão', async () => {
    const copiar = vi.fn()
    render(
      <LinhaCopiavel
        rotulo="CPF"
        valor="529.982.247-25"
        copiado={false}
        onCopiar={copiar}
      />,
    )
    expect(screen.getByText('CPF')).toBeInTheDocument()
    expect(screen.getByText('529.982.247-25')).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Copiar CPF' }))
    expect(copiar).toHaveBeenCalledTimes(1)
  })

  it('copiado troca o rótulo por "copiado" e o ícone por um check, sem tirar o valor do lugar', () => {
    render(
      <LinhaCopiavel
        rotulo="CPF"
        valor="529.982.247-25"
        copiado
        onCopiar={vi.fn()}
      />,
    )
    expect(screen.getByText('copiado')).toBeInTheDocument()
    expect(screen.queryByText('CPF')).toBeNull()
    expect(screen.getByText('529.982.247-25')).toBeInTheDocument()
    expect(
      screen
        .getByRole('button', { name: 'Copiar CPF' })
        .querySelector('svg[data-icon="check"]'),
    ).not.toBeNull()
  })
})
```

`apps/extensao/src/components/use-copiado.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCopiado } from './use-copiado'

describe('useCopiado', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('marca uma chave por 1,4 s', () => {
    const { result } = renderHook(() => useCopiado())
    act(() => result.current.marcar('pessoais:CPF'))
    expect(result.current.chave).toBe('pessoais:CPF')
    act(() => vi.advanceTimersByTime(1399))
    expect(result.current.chave).toBe('pessoais:CPF')
    act(() => vi.advanceTimersByTime(1))
    expect(result.current.chave).toBeNull()
  })

  it('copiar de novo reinicia a contagem', () => {
    const { result } = renderHook(() => useCopiado())
    act(() => result.current.marcar('pessoais:CPF'))
    act(() => vi.advanceTimersByTime(1000))
    act(() => result.current.marcar('pessoais:CPF'))
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.chave).toBe('pessoais:CPF')
    act(() => vi.advanceTimersByTime(400))
    expect(result.current.chave).toBeNull()
  })

  it('só uma chave por vez, e limpar apaga na hora', () => {
    const { result } = renderHook(() => useCopiado())
    act(() => result.current.marcar('pessoais:CPF'))
    act(() => result.current.marcar('email:E-mail'))
    expect(result.current.chave).toBe('email:E-mail')
    act(() => result.current.limpar())
    expect(result.current.chave).toBeNull()
  })
})
```

`apps/extensao/src/lib/grupos.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PESSOA_DOURADA as P } from '../test/pessoa-dourada'
import { CHIPS, gruposDaPessoa } from './grupos'

describe('gruposDaPessoa', () => {
  it('monta os 6 grupos do 1b, na ordem e com as contagens do design', () => {
    expect(
      gruposDaPessoa(P).map((g) => [g.id, g.rotulo, g.linhas.length]),
    ).toEqual([
      ['pessoais', 'Pessoais', 6],
      ['email', 'E-mail', 1],
      ['endereco', 'Endereço', 7],
      ['empresa', 'Empresa', 3],
      ['cartao', 'Cartão', 5],
      ['docs', 'Documentos', 2],
    ])
  })

  it('tira cada valor da pessoa aninhada', () => {
    expect(gruposDaPessoa(P).flatMap((g) => g.linhas)).toEqual([
      { rotulo: 'Nome', valor: P.nome.completo },
      { rotulo: 'Nascimento', valor: P.nascimento.br },
      { rotulo: 'CPF', valor: P.cpf },
      { rotulo: 'RG', valor: P.rg.numero },
      { rotulo: 'Celular', valor: P.celular.formatado },
      { rotulo: 'Senha', valor: P.senha },
      { rotulo: 'E-mail', valor: P.email.endereco },
      { rotulo: 'CEP', valor: P.endereco.cep },
      { rotulo: 'Rua', valor: P.endereco.logradouro },
      { rotulo: 'Número', valor: P.endereco.numero },
      { rotulo: 'Complemento', valor: P.endereco.complemento },
      { rotulo: 'Bairro', valor: P.endereco.bairro },
      { rotulo: 'Cidade', valor: P.endereco.cidade },
      { rotulo: 'UF', valor: P.endereco.uf },
      { rotulo: 'Razão social', valor: P.empresa.razaoSocial },
      { rotulo: 'Fantasia', valor: P.empresa.nomeFantasia },
      { rotulo: 'CNPJ', valor: P.empresa.cnpj },
      {
        rotulo: 'Bandeira',
        valor: P.cartao.bandeira === 'visa' ? 'Visa' : 'Mastercard',
      },
      { rotulo: 'Número', valor: P.cartao.numeroFormatado },
      { rotulo: 'Nome impresso', valor: P.cartao.titular },
      { rotulo: 'Validade', valor: P.cartao.validade },
      { rotulo: 'CVV', valor: P.cartao.cvv },
      { rotulo: 'PIS/NIS', valor: P.pis },
      { rotulo: 'Título', valor: P.tituloEleitor },
    ])
  })

  it('escreve a bandeira com nome próprio', () => {
    const comMaster = {
      ...P,
      cartao: { ...P.cartao, bandeira: 'mastercard' as const },
    }
    expect(gruposDaPessoa(comMaster)[4].linhas[0]).toEqual({
      rotulo: 'Bandeira',
      valor: 'Mastercard',
    })
  })
})

describe('CHIPS', () => {
  it('é "Tudo" e um chip por grupo, na ordem do design', () => {
    expect(CHIPS.map((c) => c.rotulo)).toEqual([
      'Tudo',
      'Pessoais',
      'E-mail',
      'Endereço',
      'Empresa',
      'Cartão',
      'Documentos',
    ])
  })
})
```

`apps/extensao/src/components/filtro-chips.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FiltroChips } from './filtro-chips'

const OPCOES = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'cartao', rotulo: 'Cartão' },
] as const

describe('FiltroChips', () => {
  it('marca o chip ativo com aria-pressed', () => {
    render(<FiltroChips opcoes={OPCOES} ativo="cartao" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cartão' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Tudo' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('clicar troca o filtro', async () => {
    const trocar = vi.fn()
    render(<FiltroChips opcoes={OPCOES} ativo="tudo" onChange={trocar} />)
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Cartão' }))
    expect(trocar).toHaveBeenCalledWith('cartao')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/components/linha-copiavel.test.tsx src/components/use-copiado.test.ts src/components/filtro-chips.test.tsx src/lib/grupos.test.ts; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import`; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/components/linha-copiavel.tsx`:

```tsx
import { faCheck, faCopy } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { cn } from '@piluvitu/ui/cn'

export function LinhaCopiavel({
  rotulo,
  valor,
  copiado,
  onCopiar,
}: {
  rotulo: string
  valor: string
  copiado: boolean
  onCopiar: () => void
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[92px_minmax(0,1fr)_28px] items-center gap-2.5 rounded-[10px] py-[5px] pr-1 pl-2 transition-colors duration-200',
        copiado && 'bg-ok/10',
      )}
    >
      <span className="text-muted-foreground text-xs" aria-live="polite">
        {copiado ? (
          <span className="text-ok font-mono text-[11px] font-semibold">
            copiado
          </span>
        ) : (
          rotulo
        )}
      </span>
      <span className="font-mono text-[12.5px] leading-[1.4] font-medium [overflow-wrap:anywhere]">
        {valor}
      </span>
      <button
        type="button"
        aria-label={`Copiar ${rotulo}`}
        title="Copiar"
        onClick={onCopiar}
        className={cn(
          'hover:bg-accent focus-visible:ring-ring flex size-7 cursor-pointer items-center justify-center rounded-[8px] transition-colors duration-200 focus-visible:ring-1 focus-visible:outline-none',
          copiado ? 'text-ok' : 'text-muted-foreground',
        )}
      >
        <FontAwesomeIcon
          icon={copiado ? faCheck : faCopy}
          className="text-xs"
        />
      </button>
    </div>
  )
}
```

`apps/extensao/src/components/use-copiado.ts`:

```ts
import { useEffect, useState } from 'react'

interface Marca {
  chave: string | null
  vez: number
}

export function useCopiado(ms = 1400) {
  const [marca, setMarca] = useState<Marca>({ chave: null, vez: 0 })

  useEffect(() => {
    if (marca.chave === null) return
    const temporizador = setTimeout(
      () => setMarca((m) => ({ chave: null, vez: m.vez })),
      ms,
    )
    return () => clearTimeout(temporizador)
  }, [marca, ms])

  return {
    chave: marca.chave,
    marcar: (chave: string) => setMarca((m) => ({ chave, vez: m.vez + 1 })),
    limpar: () => setMarca((m) => ({ chave: null, vez: m.vez })),
  }
}
```

`apps/extensao/src/components/filtro-chips.tsx`:

```tsx
import { cn } from '@piluvitu/ui/cn'

export function FiltroChips<T extends string>({
  opcoes,
  ativo,
  onChange,
}: {
  opcoes: readonly { id: T; rotulo: string }[]
  ativo: T
  onChange: (id: T) => void
}) {
  return (
    <div className="bg-background sticky top-0 z-10 flex flex-wrap gap-1.5 border-t px-4 pt-3 pb-2.5">
      {opcoes.map(({ id, rotulo }) => (
        <button
          key={id}
          type="button"
          aria-pressed={ativo === id}
          onClick={() => onChange(id)}
          className={cn(
            'focus-visible:ring-ring cursor-pointer rounded-full border px-2.5 py-1.5 font-mono text-[11px] leading-none font-medium transition-colors duration-200 focus-visible:ring-1 focus-visible:outline-none',
            ativo === id
              ? 'bg-accent-soft text-primary border-accent-line'
              : 'text-muted-foreground border-border bg-transparent',
          )}
        >
          {rotulo}
        </button>
      ))}
    </div>
  )
}
```

`apps/extensao/src/lib/grupos.ts`:

```ts
import type { Pessoa } from '@piluvitu/tools/pessoa'

export type IdGrupo =
  | 'pessoais'
  | 'email'
  | 'endereco'
  | 'empresa'
  | 'cartao'
  | 'docs'

export interface LinhaDado {
  rotulo: string
  valor: string
}

export interface GrupoDados {
  id: IdGrupo
  rotulo: string
  linhas: LinhaDado[]
}

const BANDEIRA = { visa: 'Visa', mastercard: 'Mastercard' } as const

export const CHIPS: readonly { id: 'tudo' | IdGrupo; rotulo: string }[] = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'pessoais', rotulo: 'Pessoais' },
  { id: 'email', rotulo: 'E-mail' },
  { id: 'endereco', rotulo: 'Endereço' },
  { id: 'empresa', rotulo: 'Empresa' },
  { id: 'cartao', rotulo: 'Cartão' },
  { id: 'docs', rotulo: 'Documentos' },
]

export function gruposDaPessoa(p: Pessoa): GrupoDados[] {
  return [
    {
      id: 'pessoais',
      rotulo: 'Pessoais',
      linhas: [
        { rotulo: 'Nome', valor: p.nome.completo },
        { rotulo: 'Nascimento', valor: p.nascimento.br },
        { rotulo: 'CPF', valor: p.cpf },
        { rotulo: 'RG', valor: p.rg.numero },
        { rotulo: 'Celular', valor: p.celular.formatado },
        { rotulo: 'Senha', valor: p.senha },
      ],
    },
    {
      id: 'email',
      rotulo: 'E-mail',
      linhas: [{ rotulo: 'E-mail', valor: p.email.endereco }],
    },
    {
      id: 'endereco',
      rotulo: 'Endereço',
      linhas: [
        { rotulo: 'CEP', valor: p.endereco.cep },
        { rotulo: 'Rua', valor: p.endereco.logradouro },
        { rotulo: 'Número', valor: p.endereco.numero },
        { rotulo: 'Complemento', valor: p.endereco.complemento },
        { rotulo: 'Bairro', valor: p.endereco.bairro },
        { rotulo: 'Cidade', valor: p.endereco.cidade },
        { rotulo: 'UF', valor: p.endereco.uf },
      ],
    },
    {
      id: 'empresa',
      rotulo: 'Empresa',
      linhas: [
        { rotulo: 'Razão social', valor: p.empresa.razaoSocial },
        { rotulo: 'Fantasia', valor: p.empresa.nomeFantasia },
        { rotulo: 'CNPJ', valor: p.empresa.cnpj },
      ],
    },
    {
      id: 'cartao',
      rotulo: 'Cartão',
      linhas: [
        { rotulo: 'Bandeira', valor: BANDEIRA[p.cartao.bandeira] },
        { rotulo: 'Número', valor: p.cartao.numeroFormatado },
        { rotulo: 'Nome impresso', valor: p.cartao.titular },
        { rotulo: 'Validade', valor: p.cartao.validade },
        { rotulo: 'CVV', valor: p.cartao.cvv },
      ],
    },
    {
      id: 'docs',
      rotulo: 'Documentos',
      linhas: [
        { rotulo: 'PIS/NIS', valor: p.pis },
        { rotulo: 'Título', valor: p.tituloEleitor },
      ],
    },
  ]
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/components/linha-copiavel.test.tsx src/components/use-copiado.test.ts src/components/filtro-chips.test.tsx src/lib/grupos.test.ts; echo "exit=$?"
```

Esperado: `Tests  11 passed`, `exit=0`.

- [ ] **Step 5: Stories**

`apps/extensao/src/components/linha-copiavel.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { LinhaCopiavel } from './linha-copiavel'

const meta = {
  title: 'Popup/Linha copiável',
  component: LinhaCopiavel,
  args: {
    rotulo: 'CPF',
    valor: '529.982.247-25',
    copiado: false,
    onCopiar: fn(),
  },
  decorators: [
    (Story) => (
      <div className="p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LinhaCopiavel>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const Copiado: Story = { args: { copiado: true } }
export const ValorLongo: Story = {
  args: {
    rotulo: 'E-mail',
    valor: 'maria.eduarda.ribeiro.4821@tuamaeaquelaursa.com',
  },
}
```

`apps/extensao/src/components/filtro-chips.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { CHIPS } from '../lib/grupos'
import { FiltroChips } from './filtro-chips'

const meta = {
  title: 'Popup/Filtro de grupos',
  component: FiltroChips,
  args: { opcoes: CHIPS, ativo: 'tudo', onChange: fn() },
} satisfies Meta<typeof FiltroChips>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const Cartao: Story = { args: { ativo: 'cartao' } }
```

- [ ] **Step 6: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/src/components/linha-copiavel.tsx apps/extensao/src/components/linha-copiavel.test.tsx apps/extensao/src/components/linha-copiavel.stories.tsx \
  apps/extensao/src/components/use-copiado.ts apps/extensao/src/components/use-copiado.test.ts \
  apps/extensao/src/components/filtro-chips.tsx apps/extensao/src/components/filtro-chips.test.tsx apps/extensao/src/components/filtro-chips.stories.tsx \
  apps/extensao/src/lib/grupos.ts apps/extensao/src/lib/grupos.test.ts \
  && /usr/bin/git commit -m "feat(extensao): linha copiável, chips de filtro e grupos do 1b"; echo "exit=$?"
```

---

### Task 9: Popup 1a (`PrimeiroUso`) e 1b (`PessoaPronta`)

**Files:**

- Create: `apps/extensao/src/components/primeiro-uso.tsx`, `primeiro-uso.test.tsx`, `primeiro-uso.stories.tsx`
- Create: `apps/extensao/src/components/pessoa-pronta.tsx`, `pessoa-pronta.test.tsx`, `pessoa-pronta.stories.tsx`

Porte de `PrimeiroUso` (`R/popup/Estados.tsx`) e de `PersonHeader`, `ActionBar`, `GroupHeader`, `PublicInboxNotice` e `CardSandboxNote` (`R/popup/Dados.tsx`), reunidos em `PessoaPronta`. Mudanças: os textos novos da spec §8 (cartão no 1a e nota do cartão no 1b); o chip do atalho some do botão quando não há atalho; "Preencher" pode vir desabilitado (página proibida); o título da pessoa e do 1a viram `h1` e os cabeçalhos de grupo, `h2` (cada grupo é uma `section` com `aria-label`).

**Interfaces:**

- Consumes: `LinhaCopiavel`, `useCopiado`, `FiltroChips` (Task 8); `gruposDaPessoa`, `CHIPS`, `IdGrupo` (Task 8); `OVERLINE`, `META_MONO`, `BOTAO_SM`, `PAINEL`, `CORPO` (Task 7); `PopupShell`, `Rodape` (Task 7, nas stories).
- Produces: `PrimeiroUso({ onGerar: () => void })`; `interface PessoaProntaProps { pessoa: Pessoa; idade: number; atalho: string; preencherDesabilitado: boolean; onPreencher: () => void; onNovaPessoa: () => void; onAbrirCaixa: () => void; onCopiar: (valor: string) => Promise<void> }`; `PessoaPronta(props: PessoaProntaProps)`; `iniciais(nome: string): string`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/extensao/src/components/primeiro-uso.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PrimeiroUso } from './primeiro-uso'

describe('PrimeiroUso (1a)', () => {
  it('explica o primeiro uso com os textos do design e o texto novo do cartão', () => {
    render(<PrimeiroUso onGerar={vi.fn()} />)
    expect(screen.getByText('Primeiro uso')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Ainda não há pessoa de teste',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Gere uma pessoa brasileira falsa e coerente. CPF, CNPJ, CEP e cartão passam na validação. Ela fica guardada até você pedir outra.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('dígito verificador correto')).toBeInTheDocument()
    expect(
      screen.getByText('existe, e rua, bairro e cidade batem'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('número de teste documentado, Luhn válido'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/faixa de sandbox/)).toBeNull()
  })

  it('"Gerar pessoa" chama onGerar', async () => {
    const gerar = vi.fn()
    render(<PrimeiroUso onGerar={gerar} />)
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Gerar pessoa' }))
    expect(gerar).toHaveBeenCalledTimes(1)
  })
})
```

`apps/extensao/src/components/pessoa-pronta.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PESSOA_DOURADA as P } from '../test/pessoa-dourada'
import { iniciais, PessoaPronta, type PessoaProntaProps } from './pessoa-pronta'

function props(extra: Partial<PessoaProntaProps> = {}): PessoaProntaProps {
  return {
    pessoa: P,
    idade: 33,
    atalho: '⌥⇧P',
    preencherDesabilitado: false,
    onPreencher: vi.fn(),
    onNovaPessoa: vi.fn(),
    onAbrirCaixa: vi.fn(),
    onCopiar: vi
      .fn<(valor: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    ...extra,
  }
}

const botaoPreencher = () =>
  screen.getByRole('button', { name: /Preencher esta página/ })

describe('iniciais', () => {
  it('pega a primeira letra do primeiro e do último nome', () => {
    expect(iniciais('Maria Eduarda Souza')).toBe('MS')
    expect(iniciais('  vinícius oliveira costa ')).toBe('VC')
  })
})

describe('PessoaPronta (1b)', () => {
  it('mostra iniciais, nome, idade e cidade da pessoa', () => {
    render(<PessoaPronta {...props()} />)
    expect(
      screen.getByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`33 anos · ${P.endereco.cidade}, ${P.endereco.uf}`),
    ).toBeInTheDocument()
    expect(screen.getByText(iniciais(P.nome.completo))).toBeInTheDocument()
  })

  it('"Preencher esta página" mostra o atalho num kbd e chama onPreencher', async () => {
    const preencher = vi.fn()
    render(<PessoaPronta {...props({ onPreencher: preencher })} />)
    expect(within(botaoPreencher()).getByText('⌥⇧P').tagName).toBe('KBD')
    await userEvent.setup().click(botaoPreencher())
    expect(preencher).toHaveBeenCalledTimes(1)
  })

  it('sem atalho o chip some do botão', () => {
    render(<PessoaPronta {...props({ atalho: '' })} />)
    expect(botaoPreencher().querySelector('kbd')).toBeNull()
  })

  it('"Preencher" fica desabilitado quando a página é proibida', () => {
    render(<PessoaPronta {...props({ preencherDesabilitado: true })} />)
    expect(botaoPreencher()).toBeDisabled()
  })

  it('"Nova pessoa", "Caixa de entrada" e "abrir caixa →" chamam os callbacks', async () => {
    const nova = vi.fn()
    const caixa = vi.fn()
    const user = userEvent.setup()
    render(
      <PessoaPronta {...props({ onNovaPessoa: nova, onAbrirCaixa: caixa })} />,
    )
    await user.click(screen.getByRole('button', { name: 'Nova pessoa' }))
    await user.click(screen.getByRole('button', { name: 'Caixa de entrada' }))
    await user.click(screen.getByRole('button', { name: 'abrir caixa →' }))
    expect(nova).toHaveBeenCalledTimes(1)
    expect(caixa).toHaveBeenCalledTimes(2)
  })

  it('lista os 6 grupos e o filtro mostra só o escolhido, com a nota nova do cartão', async () => {
    render(<PessoaPronta {...props()} />)
    const rotulosDosGrupos = () =>
      screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(rotulosDosGrupos()).toEqual([
      'Pessoais',
      'E-mail',
      'Endereço',
      'Empresa',
      'Cartão',
      'Documentos',
    ])
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Cartão' }))
    expect(screen.getByRole('button', { name: 'Cartão' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(rotulosDosGrupos()).toEqual(['Cartão'])
    expect(
      screen.getByText(
        'Número de teste documentado da Stripe. Passa no Luhn; só aprova em sandbox.',
      ),
    ).toBeInTheDocument()
  })

  it('o grupo do e-mail avisa que a caixa é pública', () => {
    render(<PessoaPronta {...props()} />)
    const email = within(screen.getByRole('region', { name: 'E-mail' }))
    expect(email.getByText('Caixa pública.')).toBeInTheDocument()
    expect(email.getByText(P.email.endereco)).toBeInTheDocument()
  })

  it('copiar manda o valor para onCopiar e marca "copiado" naquela linha', async () => {
    const copiar = vi
      .fn<(valor: string) => Promise<void>>()
      .mockResolvedValue(undefined)
    render(<PessoaPronta {...props({ onCopiar: copiar })} />)
    const pessoais = within(screen.getByRole('region', { name: 'Pessoais' }))
    await userEvent
      .setup()
      .click(pessoais.getByRole('button', { name: 'Copiar CPF' }))
    expect(copiar).toHaveBeenCalledWith(P.cpf)
    expect(await pessoais.findByText('copiado')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/components/primeiro-uso.test.tsx src/components/pessoa-pronta.test.tsx; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import`; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/components/primeiro-uso.tsx`:

```tsx
import { faUserPlus } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { Card } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { CORPO, OVERLINE, PAINEL } from './tipografia'

const GARANTIAS: readonly [string, string][] = [
  ['CPF/CNPJ', 'dígito verificador correto'],
  ['CEP', 'existe, e rua, bairro e cidade batem'],
  ['cartão', 'número de teste documentado, Luhn válido'],
]

export function PrimeiroUso({ onGerar }: { onGerar: () => void }) {
  return (
    <div className="flex flex-col gap-3.5 px-5 pt-7 pb-5">
      <span className={cn(OVERLINE, 'text-primary')}>Primeiro uso</span>
      <h1 className="m-0 text-[20px] leading-[1.2] font-bold tracking-[-0.02em]">
        Ainda não há pessoa de teste
      </h1>
      <p className={CORPO}>
        Gere uma pessoa brasileira falsa e coerente. CPF, CNPJ, CEP e cartão
        passam na validação. Ela fica guardada até você pedir outra.
      </p>
      <Card className={cn(PAINEL, 'flex flex-col gap-2')}>
        {GARANTIAS.map(([chave, texto]) => (
          <div
            key={chave}
            className="grid grid-cols-[72px_1fr] gap-2.5 text-[12px] leading-[1.4]"
          >
            <span className="text-primary font-mono">{chave}</span>
            <span className="text-muted-foreground">{texto}</span>
          </div>
        ))}
      </Card>
      <Button size="lg" className="w-full gap-2" onClick={onGerar}>
        <FontAwesomeIcon icon={faUserPlus} className="text-[13px]" />
        Gerar pessoa
      </Button>
    </div>
  )
}
```

`apps/extensao/src/components/pessoa-pronta.tsx`:

```tsx
import {
  faArrowUpRightFromSquare,
  faBolt,
  faEye,
  faInbox,
  faShuffle,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import { Avatar, AvatarFallback } from '@piluvitu/ui/avatar'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { useState } from 'react'
import { CHIPS, gruposDaPessoa, type IdGrupo } from '../lib/grupos'
import { FiltroChips } from './filtro-chips'
import { LinhaCopiavel } from './linha-copiavel'
import { BOTAO_SM, META_MONO, OVERLINE } from './tipografia'
import { useCopiado } from './use-copiado'

export interface PessoaProntaProps {
  pessoa: Pessoa
  idade: number
  atalho: string
  preencherDesabilitado: boolean
  onPreencher: () => void
  onNovaPessoa: () => void
  onAbrirCaixa: () => void
  onCopiar: (valor: string) => Promise<void>
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/)
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

function CabecalhoGrupo({ rotulo, total }: { rotulo: string; total: number }) {
  return (
    <div className="flex items-center gap-2.5 px-2 pt-3.5 pb-1.5">
      <h2 className={cn(OVERLINE, 'text-muted-foreground m-0')}>{rotulo}</h2>
      <span className="text-primary font-mono text-[10.5px] font-medium">
        {String(total).padStart(2, '0')}
      </span>
      <span className="bg-border h-px flex-1" />
    </div>
  )
}

function AvisoCaixaPublica({ onAbrir }: { onAbrir: () => void }) {
  return (
    <div className="border-warn/35 bg-warn/[0.08] mx-2 mt-1.5 mb-0.5 flex gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-normal">
      <FontAwesomeIcon icon={faEye} className="text-warn mt-1 text-[11px]" />
      <span className="text-pretty">
        <strong className="text-warn font-semibold">Caixa pública.</strong> Quem
        souber o endereço lê os e-mails. Só para teste, nunca para conta real.{' '}
        <button
          type="button"
          onClick={onAbrir}
          className="text-primary focus-visible:ring-ring cursor-pointer underline-offset-[3px] hover:underline focus-visible:ring-1 focus-visible:outline-none"
        >
          abrir caixa →
        </button>
      </span>
    </div>
  )
}

export function PessoaPronta({
  pessoa,
  idade,
  atalho,
  preencherDesabilitado,
  onPreencher,
  onNovaPessoa,
  onAbrirCaixa,
  onCopiar,
}: PessoaProntaProps) {
  const [filtro, setFiltro] = useState<'tudo' | IdGrupo>('tudo')
  const copiado = useCopiado()
  const grupos = gruposDaPessoa(pessoa).filter(
    (g) => filtro === 'tudo' || g.id === filtro,
  )

  async function copiar(chave: string, valor: string) {
    await onCopiar(valor)
    copiado.marcar(chave)
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 pt-4 pb-3.5">
        <Avatar>
          <AvatarFallback className="bg-accent-soft text-primary font-sans text-[13px] font-bold">
            {iniciais(pessoa.nome.completo)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h1 className="m-0 text-base font-bold tracking-[-0.01em]">
            {pessoa.nome.completo}
          </h1>
          <div className={META_MONO}>
            {idade} anos · {pessoa.endereco.cidade}, {pessoa.endereco.uf}
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <Button
          size="lg"
          className="w-full gap-2"
          disabled={preencherDesabilitado}
          onClick={onPreencher}
        >
          <FontAwesomeIcon icon={faBolt} className="text-[13px]" />
          Preencher esta página
          {atalho !== '' && (
            <kbd className="bg-primary-foreground/[0.14] ml-1 rounded-[6px] px-1.5 py-0.5 font-mono text-[10.5px] font-medium">
              {atalho}
            </kbd>
          )}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className={BOTAO_SM}
            onClick={() => {
              copiado.limpar()
              onNovaPessoa()
            }}
          >
            <FontAwesomeIcon icon={faShuffle} className="text-xs" />
            Nova pessoa
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={BOTAO_SM}
            onClick={onAbrirCaixa}
          >
            <FontAwesomeIcon icon={faInbox} className="text-xs" />
            Caixa de entrada
            <FontAwesomeIcon
              icon={faArrowUpRightFromSquare}
              className="text-muted-foreground text-[10px]"
            />
          </Button>
        </div>
      </div>
      <FiltroChips opcoes={CHIPS} ativo={filtro} onChange={setFiltro} />
      <div className="px-2 pb-3">
        {grupos.map((grupo) => (
          <section key={grupo.id} aria-label={grupo.rotulo}>
            <CabecalhoGrupo rotulo={grupo.rotulo} total={grupo.linhas.length} />
            {grupo.linhas.map((linha) => {
              const chave = `${grupo.id}:${linha.rotulo}`
              return (
                <LinhaCopiavel
                  key={chave}
                  rotulo={linha.rotulo}
                  valor={linha.valor}
                  copiado={copiado.chave === chave}
                  onCopiar={() => void copiar(chave, linha.valor)}
                />
              )
            })}
            {grupo.id === 'email' && (
              <AvisoCaixaPublica onAbrir={onAbrirCaixa} />
            )}
            {grupo.id === 'cartao' && (
              <p className="text-muted-foreground mx-2 mt-1.5 mb-0.5 text-xs leading-normal text-pretty">
                Número de teste documentado da Stripe. Passa no Luhn; só aprova
                em sandbox.
              </p>
            )}
          </section>
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/components/primeiro-uso.test.tsx src/components/pessoa-pronta.test.tsx; echo "exit=$?"
```

Esperado: `Tests  11 passed`, `exit=0`.

- [ ] **Step 5: Stories dos estados 1a e 1b (claro/escuro, com/sem atalho, Preencher desabilitado)**

`apps/extensao/src/components/primeiro-uso.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PopupShell } from './popup-shell'
import { PrimeiroUso } from './primeiro-uso'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/1a · Primeiro uso',
  component: PrimeiroUso,
  args: { onGerar: fn() },
  parameters: { atalho: 'Alt+Shift+P' },
  render: (args, { parameters }) => (
    <PopupShell
      host="localhost:3000"
      status="ok"
      rodape={
        <Rodape
          atalho={parameters.atalho as string}
          texto="preenche sem abrir o popup"
          onAlterarAtalho={fn()}
        />
      }
    >
      <PrimeiroUso {...args} />
    </PopupShell>
  ),
} satisfies Meta<typeof PrimeiroUso>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const SemAtalho: Story = { parameters: { atalho: '' } }
```

`apps/extensao/src/components/pessoa-pronta.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { PESSOA_DOURADA } from '../test/pessoa-dourada'
import { PessoaPronta } from './pessoa-pronta'
import { PopupShell } from './popup-shell'
import { Rodape } from './rodape'

const meta = {
  title: 'Popup/1b · Pessoa pronta',
  component: PessoaPronta,
  args: {
    pessoa: PESSOA_DOURADA,
    idade: PESSOA_DOURADA.nascimento.idade,
    atalho: 'Alt+Shift+P',
    preencherDesabilitado: false,
    onPreencher: fn(),
    onNovaPessoa: fn(),
    onAbrirCaixa: fn(),
    onCopiar: fn(async () => undefined),
  },
  render: (args) => (
    <PopupShell
      host={args.preencherDesabilitado ? 'chrome://settings' : 'localhost:3000'}
      status={args.preencherDesabilitado ? 'lock' : 'ok'}
      rodape={
        <Rodape
          atalho={args.atalho}
          texto="preenche sem abrir"
          comAlterar
          onAlterarAtalho={fn()}
        />
      }
    >
      <PessoaPronta {...args} />
    </PopupShell>
  ),
} satisfies Meta<typeof PessoaPronta>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
export const Claro: Story = { globals: { tema: 'claro' } }
export const SemAtalho: Story = { args: { atalho: '' } }
export const AtalhoDoMac: Story = { args: { atalho: '⌥⇧P' } }
export const VindoDaPaginaProibida: Story = {
  args: { preencherDesabilitado: true },
}
```

Build do Storybook e conferência:

```bash
pnpm --filter @piluvitu/extensao build-storybook; echo "exit=$?"
cd apps/extensao && node -e "
const assert = require('node:assert')
const indice = require('./storybook-static/index.json')
const nomes = new Set(Object.values(indice.entries).filter((e) => e.type === 'story').map((e) => e.title + ' / ' + e.name))
for (const n of ['Popup/1a · Primeiro uso / Escuro', 'Popup/1a · Primeiro uso / Claro', 'Popup/1a · Primeiro uso / Sem Atalho', 'Popup/1b · Pessoa pronta / Escuro', 'Popup/1b · Pessoa pronta / Claro', 'Popup/1b · Pessoa pronta / Sem Atalho', 'Popup/1b · Pessoa pronta / Vindo Da Pagina Proibida', 'Popup/Linha copiável / Copiado', 'Popup/Filtro de grupos / Cartao']) assert.ok(nomes.has(n), 'falta a story ' + n)
console.log(nomes.size + ' stories ok')
"; echo "exit=$?"
```

Esperado: os dois `exit=0` e `31 stories ok`.

- [ ] **Step 6: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/src/components/primeiro-uso.tsx apps/extensao/src/components/primeiro-uso.test.tsx apps/extensao/src/components/primeiro-uso.stories.tsx \
  apps/extensao/src/components/pessoa-pronta.tsx apps/extensao/src/components/pessoa-pronta.test.tsx apps/extensao/src/components/pessoa-pronta.stories.tsx \
  && /usr/bin/git commit -m "feat(extensao): popup 1a e 1b sobre o design system"; echo "exit=$?"
```

---

### Task 10: Camada DOM do content script

**Files:**

- Create: `apps/extensao/src/test/layout.ts`
- Create: `apps/extensao/src/entrypoints/preencher.content/dom.ts`, `apps/extensao/src/entrypoints/preencher.content/dom.test.ts`

Porte de `R/deteccao/content.ts` (funções `textoSemControles`, `rotulo`, `secao`, `visivel`, `campos`, `descrever`, `seletor`, `escrever`). Mudanças em relação ao protótipo:

- `escrever` troca `el.focus()`/`el.blur()` por `FocusEvent` sintéticos (spec §6.3) e lança erro claro se o setter nativo faltar, em vez de `!`;
- `chrome.dom` vira `browser.dom` de `wxt/browser`;
- `seletor` calcula o `:nth-of-type` entre os **irmãos** (o protótipo contava todas as tags da raiz, o que não é o que o seletor CSS significa);
- saem os comentários narrativos; ficam 3 de uma linha (o porquê da exceção do `<select>`, do setter nativo e do foco sintético);
- entram `ehCampo`, `tipoNaoPreenchivel`, `preenchivel`, `leuDeVolta`, `cabe` e `elementoEmFoco` (extraídos de `preencher` do protótipo e do Inserir da `R/mecanica-wxt`).

O jsdom não tem layout, `checkVisibility` nem `chrome.dom`: `src/test/layout.ts` simula um campo de 200×24 px visível, e cada teste pode trocar a medida de um elemento.

**Interfaces:**

- Consumes: `FieldDescriptor` de `@piluvitu/tools/campos`; `browser.dom.openOrClosedShadowRoot` de `wxt/browser`.
- Produces: `type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement`; `ehCampo(n: Element): n is Campo`; `tipoNaoPreenchivel(el: Campo): boolean`; `preenchivel(el: Campo): boolean`; `visivel(el: Campo): boolean`; `campos(raiz: Document | ShadowRoot): Generator<Campo>`; `descrever(el: Campo): FieldDescriptor`; `seletor(el: Campo): string`; `escrever(el: Campo, valor: string): void`; `leuDeVolta(el: Campo, valor: string): boolean`; `cabe(valor: string, d: Pick<FieldDescriptor, 'maxLength'>): boolean`; `elementoEmFoco(doc: Document): Element | null`. Em `src/test/layout.ts`: `retangulo(x, y, largura, altura): DOMRect`, `simularLayout(): () => void`.

- [ ] **Step 1: Criar o simulador de layout para o jsdom**

`apps/extensao/src/test/layout.ts`:

```ts
export function retangulo(
  x: number,
  y: number,
  largura: number,
  altura: number,
): DOMRect {
  return {
    x,
    y,
    width: largura,
    height: altura,
    top: y,
    left: x,
    right: x + largura,
    bottom: y + altura,
    toJSON: () => ({}),
  }
}

// Todo elemento passa a medir 200×24 px e a estar visível; devolve a função que desfaz.
export function simularLayout(): () => void {
  const visibilidade = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'checkVisibility',
  )
  const medida = Object.getOwnPropertyDescriptor(
    Element.prototype,
    'getBoundingClientRect',
  )
  Object.defineProperty(Element.prototype, 'checkVisibility', {
    value: () => true,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    value: () => retangulo(0, 0, 200, 24),
    configurable: true,
    writable: true,
  })
  return () => {
    if (visibilidade)
      Object.defineProperty(Element.prototype, 'checkVisibility', visibilidade)
    else Reflect.deleteProperty(Element.prototype, 'checkVisibility')
    if (medida)
      Object.defineProperty(Element.prototype, 'getBoundingClientRect', medida)
  }
}
```

- [ ] **Step 2: Escrever o teste que falha**

`apps/extensao/src/entrypoints/preencher.content/dom.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { retangulo, simularLayout } from '../../test/layout'
import {
  cabe,
  campos,
  descrever,
  elementoEmFoco,
  escrever,
  leuDeVolta,
  preenchivel,
  seletor,
  visivel,
  type Campo,
} from './dom'

// chrome.dom.openOrClosedShadowRoot não existe no fakeBrowser; o stub devolve as raízes fechadas registradas aqui.
const fechadas = new Map<Element, ShadowRoot>()
let desfazerLayout: () => void

beforeEach(() => {
  fechadas.clear()
  Object.assign(fakeBrowser.dom, {
    openOrClosedShadowRoot: (el: HTMLElement) =>
      el.shadowRoot ?? fechadas.get(el) ?? null,
  })
  desfazerLayout = simularLayout()
})

afterEach(() => {
  desfazerLayout()
  document.body.innerHTML = ''
})

function montar(html: string) {
  document.body.innerHTML = html
}

function q<T extends Element = HTMLInputElement>(
  css: string,
  raiz: ParentNode = document,
): T {
  const el = raiz.querySelector<T>(css)
  if (!el) throw new Error(`nada em ${css}`)
  return el
}

function sombraFechada(host: Element, html: string): ShadowRoot {
  const raiz = host.attachShadow({ mode: 'closed' })
  raiz.innerHTML = html
  fechadas.set(host, raiz)
  return raiz
}

describe('campos', () => {
  it('acha input, select e textarea na ordem do DOM, entrando em shadow root aberta e fechada', () => {
    montar(
      '<input name="a"><div id="aberta"></div><select name="b"></select><div id="fechada"></div><textarea name="c"></textarea>',
    )
    q<HTMLElement>('#aberta').attachShadow({ mode: 'open' }).innerHTML =
      '<input name="dentro-aberta">'
    sombraFechada(q<HTMLElement>('#fechada'), '<input name="dentro-fechada">')
    expect(
      Array.from(campos(document), (el) => el.getAttribute('name')),
    ).toEqual(['a', 'dentro-aberta', 'b', 'dentro-fechada', 'c'])
  })
})

describe('preenchivel', () => {
  it.each([
    'hidden',
    'checkbox',
    'radio',
    'file',
    'submit',
    'button',
    'reset',
    'image',
    'range',
    'color',
  ])('input type=%s não carrega dado da pessoa', (tipo) => {
    montar(`<input type="${tipo}">`)
    expect(preenchivel(q('input'))).toBe(false)
  })

  it.each([
    'text',
    'email',
    'tel',
    'password',
    'number',
    'date',
    'month',
    'search',
  ])('input type=%s pode receber valor', (tipo) => {
    montar(`<input type="${tipo}">`)
    expect(preenchivel(q('input'))).toBe(true)
  })

  it('disabled, readonly e select múltiplo ficam de fora; select comum e textarea entram', () => {
    montar(
      '<input id="d" disabled><input id="r" readonly><select id="m" multiple></select><select id="s"></select><textarea id="t"></textarea><textarea id="tr" readonly></textarea>',
    )
    expect(
      ['d', 'r', 'm', 's', 't', 'tr'].map((id) =>
        preenchivel(q<Campo>(`#${id}`)),
      ),
    ).toEqual([false, false, false, true, true, false])
  })
})

describe('visivel', () => {
  it('campo comum é visível', () => {
    montar('<input>')
    expect(visivel(q('input'))).toBe(true)
  })

  it('checkVisibility falso (display, opacity, visibility) esconde', () => {
    montar('<input>')
    const el = q('input')
    Object.defineProperty(el, 'checkVisibility', { value: () => false })
    expect(visivel(el)).toBe(false)
  })

  it('ancestral aria-hidden esconde (honeypot do Mailchimp)', () => {
    montar(
      '<div aria-hidden="true" style="position:absolute;left:-5000px"><input name="b_isca" tabindex="-1"></div>',
    )
    expect(visivel(q('input'))).toBe(false)
  })

  it('menos de 2 px esconde', () => {
    montar('<input>')
    const el = q('input')
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => retangulo(0, 0, 1, 1),
    })
    expect(visivel(el)).toBe(false)
  })

  it('fora do documento, à esquerda ou acima, esconde', () => {
    montar('<input id="e"><input id="c">')
    Object.defineProperty(q('#e'), 'getBoundingClientRect', {
      value: () => retangulo(-5000, 10, 150, 20),
    })
    Object.defineProperty(q('#c'), 'getBoundingClientRect', {
      value: () => retangulo(10, -900, 150, 20),
    })
    expect(visivel(q('#e'))).toBe(false)
    expect(visivel(q('#c'))).toBe(false)
  })

  it('select escondido de 1 px conta, porque o select2 escuta o change dele', () => {
    montar('<select></select>')
    const el = q<HTMLSelectElement>('select')
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => retangulo(0, 0, 1, 1),
    })
    expect(visivel(el)).toBe(true)
  })

  it('elemento fora da árvore não é visível', () => {
    expect(visivel(document.createElement('input'))).toBe(false)
  })
})

describe('descrever', () => {
  it('lê label for, name, id, autocomplete, placeholder, maxlength, inputmode e pattern', () => {
    montar(
      '<label for="cpf">CPF</label><input id="cpf" name="doc" autocomplete="off" placeholder="000.000.000-00" maxlength="14" inputmode="numeric" pattern="[0-9.-]*">',
    )
    expect(descrever(q('#cpf'))).toEqual({
      tag: 'input',
      type: 'text',
      name: 'doc',
      id: 'cpf',
      autocomplete: 'off',
      placeholder: '000.000.000-00',
      label: 'CPF',
      ariaLabel: '',
      maxLength: 14,
      inputMode: 'numeric',
      pattern: '[0-9.-]*',
      options: undefined,
      section: '',
    })
  })

  it('label que envolve o select não carrega o texto das opções; opções e seção vêm junto', () => {
    montar(
      '<fieldset><legend>Endereço</legend><label>Estado <select name="uf"><option value="">--</option><option value="SP">São Paulo</option></select></label></fieldset>',
    )
    expect(descrever(q<HTMLSelectElement>('select'))).toMatchObject({
      tag: 'select',
      type: 'select-one',
      label: 'Estado',
      maxLength: null,
      section: 'Endereço',
      options: [
        { value: '', text: '--' },
        { value: 'SP', text: 'São Paulo' },
      ],
    })
  })

  it('aria-labelledby é resolvido dentro da shadow root do campo', () => {
    montar('<div id="host"></div>')
    const raiz = q<HTMLElement>('#host').attachShadow({ mode: 'open' })
    raiz.innerHTML =
      '<span id="r">Número do cartão</span><input aria-labelledby="r" aria-label="cc">'
    expect(descrever(q('input', raiz))).toMatchObject({
      label: 'Número do cartão',
      ariaLabel: 'cc',
    })
  })

  it('textarea sem maxlength vira maxLength null', () => {
    montar('<label>Observações <textarea name="obs"></textarea></label>')
    expect(descrever(q<HTMLTextAreaElement>('textarea'))).toMatchObject({
      tag: 'textarea',
      type: 'textarea',
      maxLength: null,
      label: 'Observações',
    })
  })
})

describe('seletor', () => {
  it('usa tag#id quando o id é único', () => {
    montar('<select id="origem"></select>')
    expect(seletor(q<HTMLSelectElement>('select'))).toBe('select#origem')
  })

  it('senão tag[name] quando o name é único', () => {
    montar('<input name="ref_code" placeholder="opcional">')
    expect(seletor(q('input'))).toBe('input[name="ref_code"]')
  })

  it('id repetido cai para o name', () => {
    montar('<input id="x" name="a"><input id="x" name="b">')
    expect(seletor(document.querySelectorAll('input')[1])).toBe(
      'input[name="b"]',
    )
  })

  it('senão tag:nth-of-type entre os irmãos', () => {
    montar(
      '<form><input name="dup"><input name="dup"><span></span><input></form>',
    )
    expect(
      Array.from(document.querySelectorAll('input'), (el) => seletor(el)),
    ).toEqual([
      'input:nth-of-type(1)',
      'input:nth-of-type(2)',
      'input:nth-of-type(3)',
    ])
  })

  it('dentro de shadow root ganha o prefixo do host', () => {
    montar('<x-campo></x-campo>')
    const raiz = q<HTMLElement>('x-campo').attachShadow({ mode: 'open' })
    raiz.innerHTML = '<input name="cpf">'
    expect(seletor(q('input', raiz))).toBe('x-campo › input[name="cpf"]')
  })
})

describe('escrever', () => {
  it('dispara foco sintético, input, change e blur nessa ordem, sem mexer no foco real', () => {
    montar('<input name="nome">')
    const el = q('input')
    const eventos: string[] = []
    for (const tipo of [
      'focus',
      'focusin',
      'input',
      'change',
      'blur',
      'focusout',
    ]) {
      el.addEventListener(tipo, (e) =>
        eventos.push(`${tipo}:${e.bubbles}:${e.composed}`),
      )
    }
    const focar = vi.spyOn(el, 'focus')
    const desfocar = vi.spyOn(el, 'blur')
    escrever(el, 'Maria')
    expect(eventos).toEqual([
      'focus:false:false',
      'focusin:true:true',
      'input:true:true',
      'change:true:true',
      'blur:false:false',
      'focusout:true:true',
    ])
    expect(el.value).toBe('Maria')
    expect(focar).not.toHaveBeenCalled()
    expect(desfocar).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })

  it('grava pelo setter do protótipo, por cima do setter que a página pôs na instância', () => {
    // É o que o React faz no mundo MAIN para rastrear o valor: o setter da instância não pode ser o caminho.
    montar('<input name="nome">')
    const el = q('input')
    const setterDaPagina = vi.fn()
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: () => 'antigo',
      set: setterDaPagina,
    })
    escrever(el, 'novo')
    expect(setterDaPagina).not.toHaveBeenCalled()
    expect(
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.get?.call(el),
    ).toBe('novo')
  })

  it('funciona em select e textarea', () => {
    montar(
      '<select><option value="">-</option><option value="F">Feminino</option></select><textarea></textarea>',
    )
    escrever(q<HTMLSelectElement>('select'), 'F')
    escrever(q<HTMLTextAreaElement>('textarea'), 'linha')
    expect(q<HTMLSelectElement>('select').value).toBe('F')
    expect(q<HTMLTextAreaElement>('textarea').value).toBe('linha')
  })
})

describe('leuDeVolta e cabe', () => {
  it('aceita o mesmo valor ou os mesmos dígitos que uma máscara reformatou', () => {
    montar('<input>')
    const el = q('input')
    el.value = '529.982.247-25'
    expect(leuDeVolta(el, '529.982.247-25')).toBe(true)
    expect(leuDeVolta(el, '52998224725')).toBe(true)
    expect(leuDeVolta(el, '111.444.777-35')).toBe(false)
    el.value = ''
    expect(leuDeVolta(el, 'Maria')).toBe(false)
  })

  it('cabe respeita o maxLength', () => {
    expect(cabe('123456789012', { maxLength: 6 })).toBe(false)
    expect(cabe('123456', { maxLength: 6 })).toBe(true)
    expect(cabe('qualquer coisa', { maxLength: null })).toBe(true)
  })
})

describe('elementoEmFoco', () => {
  it('sem foco em campo devolve null', () => {
    montar('<input>')
    expect(elementoEmFoco(document)).toBeNull()
  })

  it('devolve o campo focado', () => {
    montar('<input name="cep">')
    q('input').focus()
    expect(elementoEmFoco(document)).toBe(q('input'))
  })

  it('atravessa shadow root aberta e fechada', () => {
    montar('<div id="a"></div><div id="f"></div>')
    const aberta = q<HTMLElement>('#a').attachShadow({ mode: 'open' })
    aberta.innerHTML = '<input name="aberta">'
    q('input', aberta).focus()
    expect(elementoEmFoco(document)).toBe(q('input', aberta))
    const fechada = sombraFechada(
      q<HTMLElement>('#f'),
      '<input name="fechada">',
    )
    q('input', fechada).focus()
    expect(elementoEmFoco(document)).toBe(q('input', fechada))
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/dom.test.ts; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import "./dom"`; `exit=1`.

- [ ] **Step 4: Implementar**

`apps/extensao/src/entrypoints/preencher.content/dom.ts`:

```ts
import type { FieldDescriptor } from '@piluvitu/tools/campos'
import { browser } from 'wxt/browser'

export type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

const TIPOS_SEM_DADO = new Set([
  'hidden',
  'checkbox',
  'radio',
  'file',
  'submit',
  'button',
  'reset',
  'image',
  'range',
  'color',
])

export function ehCampo(n: Element): n is Campo {
  return (
    n instanceof HTMLInputElement ||
    n instanceof HTMLSelectElement ||
    n instanceof HTMLTextAreaElement
  )
}

export function tipoNaoPreenchivel(el: Campo): boolean {
  return el instanceof HTMLInputElement && TIPOS_SEM_DADO.has(el.type)
}

export function preenchivel(el: Campo): boolean {
  if (tipoNaoPreenchivel(el) || el.disabled) return false
  if (el instanceof HTMLSelectElement) return !el.multiple
  return !el.readOnly
}

export function visivel(el: Campo): boolean {
  if (!el.isConnected) return false
  if (
    !el.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true,
      contentVisibilityAuto: true,
    })
  )
    return false
  if (el.closest('[aria-hidden="true"]')) return false
  // select2 e afins escondem o <select> nativo, mas continuam escutando o change dele.
  if (el instanceof HTMLSelectElement) return true
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  return r.right + window.scrollX > 0 && r.bottom + window.scrollY > 0
}

function raizSombra(el: Element): ShadowRoot | null {
  if (el.shadowRoot) return el.shadowRoot
  return el instanceof HTMLElement
    ? (browser.dom.openOrClosedShadowRoot(el) ?? null)
    : null
}

export function* campos(raiz: Document | ShadowRoot): Generator<Campo> {
  const caminhante = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT)
  for (let n = caminhante.nextNode(); n; n = caminhante.nextNode()) {
    if (!(n instanceof Element)) continue
    if (ehCampo(n)) yield n
    const sombra = raizSombra(n)
    if (sombra) yield* campos(sombra)
  }
}

function textoSemControles(n: Element): string {
  const copia = n.cloneNode(true) as Element
  copia
    .querySelectorAll('input,select,textarea,button,option,script,style')
    .forEach((x) => x.remove())
  return (copia.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function rotulo(el: Campo): string {
  const partes = Array.from(el.labels ?? [], (label) =>
    textoSemControles(label),
  )
  const raiz = el.getRootNode() as Document | ShadowRoot
  for (const id of (el.getAttribute('aria-labelledby') ?? '')
    .split(/\s+/)
    .filter(Boolean)) {
    const referido = raiz.getElementById(id)
    if (referido) partes.push(textoSemControles(referido))
  }
  return partes.join(' ').slice(0, 160)
}

function secao(el: Campo): string {
  const legenda = el.closest('fieldset')?.querySelector(':scope > legend')
  return legenda ? textoSemControles(legenda) : ''
}

export function descrever(el: Campo): FieldDescriptor {
  return {
    tag: el.tagName.toLowerCase() as FieldDescriptor['tag'],
    type: el.type,
    name: el.getAttribute('name') ?? '',
    id: el.id,
    autocomplete: el.getAttribute('autocomplete') ?? '',
    placeholder: el.getAttribute('placeholder') ?? '',
    label: rotulo(el),
    ariaLabel: el.getAttribute('aria-label') ?? '',
    maxLength:
      el instanceof HTMLSelectElement || el.maxLength < 0 ? null : el.maxLength,
    inputMode: el.getAttribute('inputmode') ?? undefined,
    pattern: el.getAttribute('pattern') ?? undefined,
    options:
      el instanceof HTMLSelectElement
        ? Array.from(el.options, (opcao) => ({
            value: opcao.value,
            text: opcao.text,
          }))
        : undefined,
    section: secao(el),
  }
}

function posicaoEntreIrmaos(el: Element): number {
  const irmaos = Array.from(
    (el.parentNode as ParentNode | null)?.children ?? [],
  )
  return irmaos.filter((irmao) => irmao.tagName === el.tagName).indexOf(el) + 1
}

export function seletor(el: Campo): string {
  const tag = el.tagName.toLowerCase()
  const raiz = el.getRootNode() as Document | ShadowRoot
  const unico = (css: string) => raiz.querySelectorAll(css).length === 1
  const nome = el.getAttribute('name')
  let proprio: string
  if (el.id && unico(`#${CSS.escape(el.id)}`))
    proprio = `${tag}#${CSS.escape(el.id)}`
  else if (nome && unico(`${tag}[name="${CSS.escape(nome)}"]`))
    proprio = `${tag}[name="${nome}"]`
  else proprio = `${tag}:nth-of-type(${posicaoEntreIrmaos(el)})`
  return raiz instanceof ShadowRoot
    ? `${raiz.host.tagName.toLowerCase()} › ${proprio}`
    : proprio
}

function setterNativo(el: Campo): (valor: string) => void {
  const prototipo =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototipo, 'value')?.set
  if (!setter) throw new Error('setter nativo de value ausente')
  return (valor) => setter.call(el, valor)
}

export function escrever(el: Campo, valor: string): void {
  const bolha = { bubbles: true, composed: true }
  // Foco sintético, nunca el.focus(): com o popup aberto a página não tem foco, e popup, atalho e menu seguem o mesmo caminho.
  el.dispatchEvent(new FocusEvent('focus'))
  el.dispatchEvent(new FocusEvent('focusin', bolha))
  // Setter do protótipo: no mundo MAIN o React intercepta o setter da instância e engoliria o onChange.
  setterNativo(el)(valor)
  el.dispatchEvent(new Event('input', bolha))
  el.dispatchEvent(new Event('change', bolha))
  el.dispatchEvent(new FocusEvent('blur'))
  el.dispatchEvent(new FocusEvent('focusout', bolha))
}

const digitos = (s: string) => s.replace(/\D/g, '')

export function leuDeVolta(el: Campo, valor: string): boolean {
  if (el.value === valor) return true
  const esperado = digitos(valor)
  return esperado.length > 0 && digitos(el.value) === esperado
}

export function cabe(
  valor: string,
  d: Pick<FieldDescriptor, 'maxLength'>,
): boolean {
  return d.maxLength === null || valor.length <= d.maxLength
}

export function elementoEmFoco(doc: Document): Element | null {
  let atual = doc.activeElement
  while (atual) {
    const dentro = raizSombra(atual)?.activeElement
    if (!dentro) break
    atual = dentro
  }
  return atual === doc.body ? null : atual
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/dom.test.ts; echo "exit=$?"
```

Esperado: `Tests  44 passed`, `exit=0`.

- [ ] **Step 6: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/src/test/layout.ts apps/extensao/src/entrypoints/preencher.content/dom.ts apps/extensao/src/entrypoints/preencher.content/dom.test.ts \
  && /usr/bin/git commit -m "feat(extensao): camada DOM do content script (varredura, visibilidade, escrita e leitura de volta)"; echo "exit=$?"
```

---

### Task 11: Preenchimento do frame, registro do "Mostrar" e contornos

**Files:**

- Create: `apps/extensao/src/entrypoints/preencher.content/registro.ts`, `registro.test.ts`
- Create: `apps/extensao/src/entrypoints/preencher.content/contornos.ts`, `contornos.test.ts`
- Create: `apps/extensao/src/entrypoints/preencher.content/preencher.ts`, `preencher.test.ts`

Porte de `preencher` e do registro de `R/deteccao/content.ts`. Mudanças: devolve o `ResultadoFrame` do contrato (sem `kind`/`via`/`conf`/`escrito`/`lido`, que eram diagnóstico do laboratório); `valorPara` nulo **ou** valor maior que `maxLength` vai para `recusados` sem escrever (o protótipo mandava o nulo para "não reconhecido" com `motivo`); recebe `hojeISO` e repassa a `classificarFormulario`; marca os contornos (ciano/âmbar) com o `outline` original salvo uma vez; o `destacar` do "Mostrar" pisca o contorno âmbar (âmbar, apagado, âmbar, apagado, âmbar, 200 ms cada) e termina, em 1 s, no contorno que o campo deve ter naquele momento: o do preenchimento se o aviso ainda está na tela, o original do site se ele já saiu. O campo que está piscando entra num conjunto `piscando`, e o `limpar` também o restaura: reinjetar (`Alt+Shift+P`) no meio do pisco cancela os timers da instância antiga, e sem isso o campo ficaria com o âmbar/transparente do pisco para sempre e a instância nova o salvaria como "outline original" do site; conta os iframes de fora; o registro sai do `globalThis.__pvReg` e vira um objeto por instância do content script (cada ação reinjeta, então o registro morre junto com a instância antiga).

**Interfaces:**

- Consumes: `campos`, `preenchivel`, `visivel`, `descrever`, `seletor`, `escrever`, `leuDeVolta`, `cabe`, `ehCampo`, `type Campo` (Task 10); `ResultadoFrame` (Task 5); `classificarFormulario(ds: FieldDescriptor[], hojeISO: string): (Classificacao | null)[]` de `@piluvitu/tools/campos`; `valorPara(kind: FieldKind, pessoa: Pessoa, d: FieldDescriptor, dicas?: Dicas): string | null` de `@piluvitu/tools/campos-formatar`.
- Produces: `interface Registro { guardar(el: Campo): number; buscar(idx: number): Campo | undefined }`, `criarRegistro(): Registro`; `type TipoContorno = 'preenchido' | 'nao-reconhecido'`, `interface Contornos { marcar(el: HTMLElement, tipo: TipoContorno): void; destacar(el: HTMLElement): void; limpar(): void }`, `criarContornos(agendar: (acao: () => void, ms: number) => void): Contornos` (`destacar(el)` pisca e termina em `PISCA_MS * 5` = 1000 ms), `cliqueDoUsuarioEmCampo(evento: Pick<Event, 'isTrusted' | 'composedPath'>): boolean`; `preencherDocumento(pessoa: Pessoa, hojeISO: string, registro: Registro, contornos: Contornos): ResultadoFrame`, `contarIframesDeFora(doc: Document): number`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/extensao/src/entrypoints/preencher.content/registro.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { criarRegistro } from './registro'

describe('criarRegistro', () => {
  it('guarda em sequência e devolve o elemento pelo idx', () => {
    document.body.innerHTML = '<input id="a"><input id="b">'
    const registro = criarRegistro()
    const a = document.getElementById('a') as HTMLInputElement
    const b = document.getElementById('b') as HTMLInputElement
    expect([registro.guardar(a), registro.guardar(b)]).toEqual([1, 2])
    expect(registro.buscar(2)).toBe(b)
    expect(registro.buscar(3)).toBeUndefined()
  })

  it('campo que saiu da página não é devolvido', () => {
    document.body.innerHTML = '<input id="a">'
    const registro = criarRegistro()
    const a = document.getElementById('a') as HTMLInputElement
    const idx = registro.guardar(a)
    a.remove()
    expect(registro.buscar(idx)).toBeUndefined()
  })
})
```

`apps/extensao/src/entrypoints/preencher.content/contornos.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cliqueDoUsuarioEmCampo, criarContornos } from './contornos'

beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML =
    '<input id="a" style="outline: 1px dotted red"><input id="b">'
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const el = (id: string) => document.getElementById(id) as HTMLInputElement
const outline = (id: string) => el(id).style.getPropertyValue('outline')
const novos = () => criarContornos((acao, ms) => setTimeout(acao, ms))

describe('criarContornos', () => {
  it('marca ciano sólido ou âmbar tracejado, com deslocamento de 1 px', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'preenchido')
    contornos.marcar(el('b'), 'nao-reconhecido')
    expect(outline('a')).toBe('2px solid #38bdf8')
    expect(outline('b')).toBe('2px dashed #f5b82e')
    expect(el('a').style.getPropertyValue('outline-offset')).toBe('1px')
  })

  it('limpar devolve o outline original do site, salvo uma vez só', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'nao-reconhecido')
    contornos.marcar(el('a'), 'preenchido')
    contornos.limpar()
    expect(outline('a')).toBe('1px dotted red')
    expect(el('a').style.getPropertyValue('outline-offset')).toBe('')
    expect(outline('b')).toBe('')
  })

  it('destacar pisca (âmbar, apagado, âmbar, apagado, âmbar) e termina no contorno do campo', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'preenchido')
    contornos.destacar(el('a'))
    const visto = [outline('a')]
    for (let passo = 0; passo < 5; passo++) {
      vi.advanceTimersByTime(200)
      visto.push(outline('a'))
    }
    expect(visto).toEqual([
      '2px dashed #f5b82e',
      '2px dashed transparent',
      '2px dashed #f5b82e',
      '2px dashed transparent',
      '2px dashed #f5b82e',
      '2px solid #38bdf8',
    ])
  })

  it('destacar depois de limpar volta ao original do site', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'preenchido')
    contornos.limpar()
    contornos.destacar(el('a'))
    vi.advanceTimersByTime(1600)
    expect(outline('a')).toBe('1px dotted red')
  })

  it('aviso que some no meio do pisca não deixa contorno velho para trás', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'nao-reconhecido')
    contornos.destacar(el('a'))
    vi.advanceTimersByTime(300)
    contornos.limpar()
    vi.advanceTimersByTime(1000)
    expect(outline('a')).toBe('1px dotted red')
  })

  it('reinjetar no meio do pisca (timers cancelados) devolve o outline do site, mesmo com o aviso já fechado', () => {
    // Como o ctx.onInvalidated: os timers da instância antiga somem e só o limpar() roda.
    const timers: ReturnType<typeof setTimeout>[] = []
    const contornos = criarContornos((acao, ms) => {
      timers.push(setTimeout(acao, ms))
    })
    contornos.marcar(el('a'), 'preenchido')
    contornos.limpar()
    contornos.destacar(el('a'))
    vi.advanceTimersByTime(300)
    timers.forEach(clearTimeout)
    contornos.limpar()
    expect(outline('a')).toBe('1px dotted red')
  })
})

describe('cliqueDoUsuarioEmCampo', () => {
  it('só vale para evento confiável do usuário dentro de um campo', () => {
    const campo = el('b')
    const div = document.createElement('div')
    expect(
      cliqueDoUsuarioEmCampo({ isTrusted: false, composedPath: () => [campo] }),
    ).toBe(false)
    expect(
      cliqueDoUsuarioEmCampo({ isTrusted: true, composedPath: () => [div] }),
    ).toBe(false)
    expect(
      cliqueDoUsuarioEmCampo({
        isTrusted: true,
        composedPath: () => [campo, document.body],
      }),
    ).toBe(true)
  })
})
```

`apps/extensao/src/entrypoints/preencher.content/preencher.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { simularLayout } from '../../test/layout'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import { criarContornos } from './contornos'
import { contarIframesDeFora, preencherDocumento } from './preencher'
import { criarRegistro } from './registro'

const HOJE = '2026-10-01'
const FORMULARIO = `
<form>
  <fieldset><legend>Seus dados</legend>
    <label>Nome completo <input name="nome"></label>
    <label>E-mail <input type="email" name="email"></label>
    <label for="cpf">CPF</label><input id="cpf" name="cpf" maxlength="11">
    <label>Senha <input type="password" name="senha" maxlength="6"></label>
  </fieldset>
  <label>Código de indicação <input name="ref_code" placeholder="opcional"></label>
  <div aria-hidden="true" style="position:absolute;left:-5000px"><input name="b_isca" tabindex="-1"></div>
  <input type="hidden" name="csrf" value="x">
  <input type="search" name="q" placeholder="Buscar">
  <label>Cidade <input name="cidade" disabled></label>
  <label><input type="checkbox" name="termos"> Aceito os termos</label>
</form>`

let desfazerLayout: () => void

beforeEach(() => {
  Object.assign(fakeBrowser.dom, {
    openOrClosedShadowRoot: (el: HTMLElement) => el.shadowRoot,
  })
  desfazerLayout = simularLayout()
  document.body.innerHTML = FORMULARIO
})

afterEach(() => {
  desfazerLayout()
  document.body.innerHTML = ''
})

const campo = (nome: string) =>
  document.querySelector(`[name="${nome}"]`) as HTMLInputElement
const semIdx = (linhas: { rotulo: string; seletor: string }[]) =>
  linhas.map(({ rotulo, seletor }) => ({ rotulo, seletor }))

function preencher() {
  const registro = criarRegistro()
  const contornos = criarContornos((acao, ms) => setTimeout(acao, ms))
  return {
    resultado: preencherDocumento(P, HOJE, registro, contornos),
    registro,
  }
}

describe('preencherDocumento', () => {
  it('conta X de Y: preenche os reconhecidos, recusa a senha que não cabe e lista o não reconhecido', () => {
    const { resultado } = preencher()
    expect(semIdx(resultado.preenchidos)).toEqual([
      { rotulo: 'Nome completo', seletor: 'input[name="nome"]' },
      { rotulo: 'E-mail', seletor: 'input[name="email"]' },
      { rotulo: 'CPF', seletor: 'input#cpf' },
    ])
    expect(semIdx(resultado.recusados)).toEqual([
      { rotulo: 'Senha', seletor: 'input[name="senha"]' },
    ])
    expect(semIdx(resultado.naoReconhecidos)).toEqual([
      { rotulo: 'Código de indicação', seletor: 'input[name="ref_code"]' },
    ])
    expect(resultado).toMatchObject({
      contentType: 'text/html',
      iframesDeFora: 0,
    })
    expect(campo('nome').value).toBe(P.nome.completo)
    expect(campo('email').value).toBe(P.email.endereco)
  })

  it('CPF com maxlength 11 recebe só os dígitos', () => {
    preencher()
    expect(campo('cpf').value).toBe(P.cpf.replace(/\D/g, ''))
  })

  it('senha maior que o maxlength não é truncada nem escrita', () => {
    preencher()
    expect(campo('senha').value).toBe('')
  })

  it('honeypot, hidden, busca, desabilitado e checkbox ficam fora da conta e intocados', () => {
    const { resultado } = preencher()
    expect([
      ...resultado.preenchidos,
      ...resultado.naoReconhecidos,
      ...resultado.recusados,
    ]).toHaveLength(5)
    expect(campo('b_isca').value).toBe('')
    expect(campo('csrf').value).toBe('x')
    expect(campo('q').value).toBe('')
    expect(campo('cidade').value).toBe('')
    expect(campo('termos').checked).toBe(false)
  })

  it('campo que já tem o valor certo não recebe input de novo e conta como preenchido', () => {
    campo('nome').value = P.nome.completo
    const ouvinte = vi.fn()
    campo('nome').addEventListener('input', ouvinte)
    const { resultado } = preencher()
    expect(ouvinte).not.toHaveBeenCalled()
    expect(resultado.preenchidos.map((l) => l.rotulo)).toContain(
      'Nome completo',
    )
  })

  it('campo cuja página desfaz o valor vai para recusados', () => {
    campo('email').addEventListener('input', () => {
      campo('email').value = ''
    })
    const { resultado } = preencher()
    expect(semIdx(resultado.recusados)).toContainEqual({
      rotulo: 'E-mail',
      seletor: 'input[name="email"]',
    })
  })

  it('idx segue a ordem do DOM e o registro devolve o elemento', () => {
    const { resultado, registro } = preencher()
    const linhas = [
      ...resultado.preenchidos,
      ...resultado.recusados,
      ...resultado.naoReconhecidos,
    ].sort((a, b) => a.idx - b.idx)
    expect(linhas.map((l) => l.seletor)).toEqual([
      'input[name="nome"]',
      'input[name="email"]',
      'input#cpf',
      'input[name="senha"]',
      'input[name="ref_code"]',
    ])
    expect(registro.buscar(linhas[0].idx)).toBe(campo('nome'))
  })

  it('contorna em ciano os preenchidos e em âmbar os demais, sem tirar o foco de onde está', () => {
    preencher()
    expect(campo('nome').style.getPropertyValue('outline')).toBe(
      '2px solid #38bdf8',
    )
    expect(campo('senha').style.getPropertyValue('outline')).toBe(
      '2px dashed #f5b82e',
    )
    expect(campo('ref_code').style.getPropertyValue('outline')).toBe(
      '2px dashed #f5b82e',
    )
    expect(campo('csrf').style.getPropertyValue('outline')).toBe('')
    expect(document.activeElement).toBe(document.body)
  })

  it('entra em shadow root e prefixa o seletor com o host', () => {
    document.body.innerHTML = '<x-campo></x-campo>'
    const raiz = (
      document.querySelector('x-campo') as HTMLElement
    ).attachShadow({ mode: 'open' })
    raiz.innerHTML = '<label>CPF <input name="cpf"></label>'
    const { resultado } = preencher()
    expect(semIdx(resultado.preenchidos)).toEqual([
      { rotulo: 'CPF', seletor: 'x-campo › input[name="cpf"]' },
    ])
    expect((raiz.querySelector('input') as HTMLInputElement).value).toBe(P.cpf)
  })
})

describe('contarIframesDeFora', () => {
  it('conta os iframes cujo documento o script não alcança', () => {
    document.body.innerHTML =
      '<iframe id="mesma"></iframe><iframe id="outra"></iframe>'
    Object.defineProperty(document.getElementById('outra'), 'contentDocument', {
      value: null,
    })
    expect(contarIframesDeFora(document)).toBe(1)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/registro.test.ts src/entrypoints/preencher.content/contornos.test.ts src/entrypoints/preencher.content/preencher.test.ts; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import`; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/entrypoints/preencher.content/registro.ts`:

```ts
import type { Campo } from './dom'

export interface Registro {
  guardar(el: Campo): number
  buscar(idx: number): Campo | undefined
}

export function criarRegistro(): Registro {
  const referencias = new Map<number, WeakRef<Campo>>()
  let sequencia = 0
  return {
    guardar(el) {
      sequencia += 1
      referencias.set(sequencia, new WeakRef(el))
      return sequencia
    },
    buscar(idx) {
      const el = referencias.get(idx)?.deref()
      return el?.isConnected ? el : undefined
    },
  }
}
```

`apps/extensao/src/entrypoints/preencher.content/contornos.ts`:

```ts
import { ehCampo } from './dom'

export type TipoContorno = 'preenchido' | 'nao-reconhecido'

export interface Contornos {
  marcar(el: HTMLElement, tipo: TipoContorno): void
  destacar(el: HTMLElement): void
  limpar(): void
}

const OUTLINE: Record<TipoContorno, string> = {
  preenchido: '2px solid #38bdf8',
  'nao-reconhecido': '2px dashed #f5b82e',
}
const APAGADO = '2px dashed transparent'
const PISCA = [
  OUTLINE['nao-reconhecido'],
  APAGADO,
  OUTLINE['nao-reconhecido'],
  APAGADO,
  OUTLINE['nao-reconhecido'],
]
const PISCA_MS = 200

interface Original {
  outline: [string, string]
  deslocamento: [string, string]
}

export function criarContornos(
  agendar: (acao: () => void, ms: number) => void,
): Contornos {
  const originais = new WeakMap<HTMLElement, Original>()
  const marcados = new Map<HTMLElement, TipoContorno>()
  const piscando = new Set<HTMLElement>()

  function guardarOriginal(el: HTMLElement) {
    if (originais.has(el)) return
    originais.set(el, {
      outline: [
        el.style.getPropertyValue('outline'),
        el.style.getPropertyPriority('outline'),
      ],
      deslocamento: [
        el.style.getPropertyValue('outline-offset'),
        el.style.getPropertyPriority('outline-offset'),
      ],
    })
  }

  function pintar(el: HTMLElement, outline: string) {
    el.style.setProperty('outline', outline, 'important')
    el.style.setProperty('outline-offset', '1px', 'important')
  }

  function restaurar(el: HTMLElement) {
    const original = originais.get(el)
    if (!original) return
    el.style.setProperty('outline', ...original.outline)
    el.style.setProperty('outline-offset', ...original.deslocamento)
  }

  return {
    marcar(el, tipo) {
      guardarOriginal(el)
      marcados.set(el, tipo)
      pintar(el, OUTLINE[tipo])
    },
    destacar(el) {
      guardarOriginal(el)
      piscando.add(el)
      PISCA.forEach((outline, passo) => {
        if (passo === 0) pintar(el, outline)
        else agendar(() => pintar(el, outline), passo * PISCA_MS)
      })
      agendar(() => {
        piscando.delete(el)
        const tipo = marcados.get(el)
        if (tipo) pintar(el, OUTLINE[tipo])
        else restaurar(el)
      }, PISCA.length * PISCA_MS)
    },
    limpar() {
      for (const el of new Set([...marcados.keys(), ...piscando])) restaurar(el)
      marcados.clear()
    },
  }
}

export function cliqueDoUsuarioEmCampo(
  evento: Pick<Event, 'isTrusted' | 'composedPath'>,
): boolean {
  if (!evento.isTrusted) return false
  const alvo = evento.composedPath()[0]
  return alvo instanceof Element && ehCampo(alvo)
}
```

`apps/extensao/src/entrypoints/preencher.content/preencher.ts`:

```ts
import { classificarFormulario } from '@piluvitu/tools/campos'
import { valorPara } from '@piluvitu/tools/campos-formatar'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import type { ResultadoFrame } from '../../lib/resultado'
import type { Contornos } from './contornos'
import {
  cabe,
  campos,
  descrever,
  escrever,
  leuDeVolta,
  preenchivel,
  seletor,
  visivel,
} from './dom'
import type { Registro } from './registro'

export function contarIframesDeFora(doc: Document): number {
  return Array.from(
    doc.querySelectorAll<HTMLIFrameElement>('iframe, frame'),
  ).filter((quadro) => quadro.contentDocument === null).length
}

export function preencherDocumento(
  pessoa: Pessoa,
  hojeISO: string,
  registro: Registro,
  contornos: Contornos,
): ResultadoFrame {
  const elementos = Array.from(campos(document)).filter(
    (el) => preenchivel(el) && visivel(el),
  )
  const descritores = elementos.map(descrever)
  const classes = classificarFormulario(descritores, hojeISO)
  const resultado: ResultadoFrame = {
    preenchidos: [],
    naoReconhecidos: [],
    recusados: [],
    contentType: document.contentType,
    iframesDeFora: contarIframesDeFora(document),
  }

  elementos.forEach((el, i) => {
    const classe = classes[i]
    const kind = classe?.kind
    if (kind === 'ignorar') return
    const d = descritores[i]
    const linha = {
      idx: registro.guardar(el),
      rotulo: d.label || d.placeholder || d.name,
      seletor: seletor(el),
    }
    if (kind === undefined) {
      resultado.naoReconhecidos.push(linha)
      contornos.marcar(el, 'nao-reconhecido')
      return
    }
    const valor = valorPara(kind, pessoa, d, classe?.dicas)
    if (valor !== null && cabe(valor, d)) {
      if (el.value !== valor) escrever(el, valor)
      if (leuDeVolta(el, valor)) {
        resultado.preenchidos.push(linha)
        contornos.marcar(el, 'preenchido')
        return
      }
    }
    resultado.recusados.push(linha)
    contornos.marcar(el, 'nao-reconhecido')
  })
  return resultado
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/registro.test.ts src/entrypoints/preencher.content/contornos.test.ts src/entrypoints/preencher.content/preencher.test.ts; echo "exit=$?"
```

Esperado: `Tests  19 passed` (registro 2, contornos 7, preencher 10), `exit=0`. Se o caso do CPF ou da senha falhar por causa do valor escolhido, confira em `packages/tools/src/campos-formatar.ts` o `caber` da fase 1 antes de mexer aqui: a regra "valor que não cabe não é escrito" é desta camada, a escolha do formato que cabe é da fase 1.

- [ ] **Step 5: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/src/entrypoints/preencher.content/registro.ts apps/extensao/src/entrypoints/preencher.content/registro.test.ts \
  apps/extensao/src/entrypoints/preencher.content/contornos.ts apps/extensao/src/entrypoints/preencher.content/contornos.test.ts \
  apps/extensao/src/entrypoints/preencher.content/preencher.ts apps/extensao/src/entrypoints/preencher.content/preencher.test.ts \
  && /usr/bin/git commit -m "feat(extensao): preenchimento do frame com contornos e registro do Mostrar"; echo "exit=$?"
```

---

### Task 12: Aviso na página (1f) em shadow root

**Files:**

- Create (cópia + acréscimo): `apps/extensao/src/entrypoints/preencher.content/aviso.css`
- Create: `apps/extensao/src/entrypoints/preencher.content/aviso-dom.ts`, `aviso-dom.test.ts`
- Create: `apps/extensao/src/entrypoints/preencher.content/aviso.ts`
- Create: `apps/extensao/src/entrypoints/preencher.content/aviso.stories.tsx`

O CSS é o de `R/aviso/toast.css` (testado numa página hostil). A marcação segue o design report (`.toast > .linha1 (marca, .titulo, button.fechar) > .linha2 (.warn + " · contorno tracejado") > .trilho > .barra`), construída com `createElement`/`textContent` (DOM puro, sem React e sem `innerHTML`). O DOM fica separado da montagem: `aviso-dom.ts` é puro e testável no jsdom e na story; `aviso.ts` só monta com `createShadowRootUi`.

**Interfaces:**

- Consumes: `ContentScriptContext` de `wxt/utils/content-script-context`; `createShadowRootUi` de `wxt/utils/content-script-ui/shadow-root`.
- Produces: `interface OpcoesAviso { titulo: string; linha2?: string; erro?: boolean; onIrParaNaoReconhecido?: () => void; onFechar: () => void }`; `construirAviso(doc: Document, o: OpcoesAviso): HTMLDivElement`; `montarAviso(ctx: ContentScriptContext, opcoes: Omit<OpcoesAviso, 'onFechar'> & { aoSair: () => void }): Promise<void>`.

- [ ] **Step 1: Copiar o CSS e acrescentar os três estados que a pesquisa não cobriu**

```bash
cp docs/superpowers/research/2026-10-01-extensao-dados-teste/aviso/toast.css apps/extensao/src/entrypoints/preencher.content/aviso.css; echo "exit=$?"
```

No fim de `aviso.css`, acrescente (texto âmbar sem destino no frame 0 não é clicável; aviso de falha da fase 3 usa a marca em âmbar):

```css
span.warn {
  cursor: default;
}
span.warn:hover {
  text-decoration: none;
}
.toast.erro .marca {
  color: var(--pv-warn);
}
```

- [ ] **Step 2: Escrever o teste que falha**

`apps/extensao/src/entrypoints/preencher.content/aviso-dom.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { construirAviso, type OpcoesAviso } from './aviso-dom'

function montar(extra: Partial<OpcoesAviso> = {}) {
  const onFechar = vi.fn()
  const aviso = construirAviso(document, {
    titulo: '21 de 23 campos preenchidos',
    onFechar,
    ...extra,
  })
  document.body.replaceChildren(aviso)
  return { aviso, onFechar }
}

describe('construirAviso', () => {
  it('mostra o título num status, com a marca e o botão Fechar', () => {
    const { aviso } = montar()
    expect(aviso).toHaveAttribute('role', 'status')
    expect(aviso).toHaveClass('toast')
    expect(aviso.querySelector('.titulo')).toHaveTextContent(
      '21 de 23 campos preenchidos',
    )
    expect(aviso.querySelector('svg.marca')).not.toBeNull()
    expect(aviso.querySelector('button.fechar')).toHaveAttribute(
      'aria-label',
      'Fechar',
    )
  })

  it('sem não reconhecidos não há 2ª linha', () => {
    expect(montar().aviso.querySelector('.linha2')).toBeNull()
  })

  it('o texto âmbar é um botão que leva ao primeiro não reconhecido', () => {
    const ir = vi.fn()
    const { aviso } = montar({
      linha2: '2 não reconhecidos',
      onIrParaNaoReconhecido: ir,
    })
    const botao = aviso.querySelector(
      '.linha2 button.warn',
    ) as HTMLButtonElement
    expect(botao).toHaveTextContent('2 não reconhecidos')
    expect(aviso.querySelector('.linha2')).toHaveTextContent(
      '2 não reconhecidos · contorno tracejado',
    )
    botao.click()
    expect(ir).toHaveBeenCalledTimes(1)
  })

  it('sem campo não reconhecido no frame do topo, o texto âmbar não é clicável', () => {
    const { aviso } = montar({ linha2: '1 não reconhecido' })
    expect(aviso.querySelector('.linha2 button')).toBeNull()
    expect(aviso.querySelector('.linha2 span.warn')).toHaveTextContent(
      '1 não reconhecido',
    )
  })

  it('o × e o fim da barra de tempo fecham', () => {
    const { aviso, onFechar } = montar()
    ;(aviso.querySelector('button.fechar') as HTMLButtonElement).click()
    aviso.querySelector('.barra')?.dispatchEvent(new Event('animationend'))
    expect(onFechar).toHaveBeenCalledTimes(2)
  })

  it('aviso de erro é um alert de uma linha só', () => {
    const { aviso } = montar({
      titulo: 'Nenhum campo nesta página',
      erro: true,
      linha2: 'ignorada',
    })
    expect(aviso).toHaveAttribute('role', 'alert')
    expect(aviso).toHaveClass('erro')
    expect(aviso.querySelector('.linha2')).toBeNull()
  })

  it('texto com marcação aparece literal (nada de innerHTML)', () => {
    const { aviso } = montar({ titulo: '<img src=x onerror=alert(1)>' })
    expect(aviso.querySelector('img')).toBeNull()
    expect(aviso.querySelector('.titulo')).toHaveTextContent(
      '<img src=x onerror=alert(1)>',
    )
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/aviso-dom.test.ts; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import "./aviso-dom"`; `exit=1`.

- [ ] **Step 4: Implementar o DOM e a montagem**

`apps/extensao/src/entrypoints/preencher.content/aviso-dom.ts`:

```ts
export interface OpcoesAviso {
  titulo: string
  linha2?: string
  erro?: boolean
  onIrParaNaoReconhecido?: () => void
  onFechar: () => void
}

const SVG = 'http://www.w3.org/2000/svg'
const CAMINHO_DO_X =
  'M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z'
const QUADRADOS_DA_MARCA = [
  [1, 9],
  [9, 9],
  [9, 1],
] as const

function elemento<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  classe: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag)
  el.className = classe
  if (texto !== undefined) el.textContent = texto
  return el
}

function svg(doc: Document, viewBox: string, classe?: string): SVGSVGElement {
  const el = doc.createElementNS(SVG, 'svg')
  el.setAttribute('viewBox', viewBox)
  el.setAttribute('aria-hidden', 'true')
  if (classe) el.setAttribute('class', classe)
  return el
}

function marca(doc: Document): SVGSVGElement {
  const el = svg(doc, '0 0 22 22', 'marca')
  for (const [x, y] of QUADRADOS_DA_MARCA) {
    const quadrado = doc.createElementNS(SVG, 'rect')
    for (const [nome, valor] of Object.entries({
      x,
      y,
      width: 7,
      height: 7,
      rx: 1,
      fill: 'currentColor',
    })) {
      quadrado.setAttribute(nome, String(valor))
    }
    el.append(quadrado)
  }
  return el
}

function iconeFechar(doc: Document): SVGSVGElement {
  const el = svg(doc, '0 0 384 512')
  const caminho = doc.createElementNS(SVG, 'path')
  caminho.setAttribute('d', CAMINHO_DO_X)
  caminho.setAttribute('fill', 'currentColor')
  el.append(caminho)
  return el
}

function linhaDois(
  doc: Document,
  texto: string,
  ir?: () => void,
): HTMLDivElement {
  const linha = elemento(doc, 'div', 'linha2')
  if (ir) {
    const botao = elemento(doc, 'button', 'warn', texto)
    botao.type = 'button'
    botao.addEventListener('click', ir)
    linha.append(botao)
  } else {
    linha.append(elemento(doc, 'span', 'warn', texto))
  }
  linha.append(doc.createTextNode(' · contorno tracejado'))
  return linha
}

export function construirAviso(doc: Document, o: OpcoesAviso): HTMLDivElement {
  const aviso = elemento(doc, 'div', o.erro ? 'toast erro' : 'toast')
  aviso.setAttribute('role', o.erro ? 'alert' : 'status')

  const fechar = elemento(doc, 'button', 'fechar')
  fechar.type = 'button'
  fechar.setAttribute('aria-label', 'Fechar')
  fechar.append(iconeFechar(doc))
  fechar.addEventListener('click', o.onFechar)

  const linha1 = elemento(doc, 'div', 'linha1')
  linha1.append(marca(doc), elemento(doc, 'span', 'titulo', o.titulo), fechar)
  aviso.append(linha1)

  if (o.linha2 && !o.erro)
    aviso.append(linhaDois(doc, o.linha2, o.onIrParaNaoReconhecido))

  const barra = elemento(doc, 'div', 'barra')
  barra.addEventListener('animationend', o.onFechar)
  const trilho = elemento(doc, 'div', 'trilho')
  trilho.append(barra)
  aviso.append(trilho)
  return aviso
}
```

`apps/extensao/src/entrypoints/preencher.content/aviso.ts`:

```ts
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import { createShadowRootUi } from 'wxt/utils/content-script-ui/shadow-root'
import css from './aviso.css?inline'
import { construirAviso, type OpcoesAviso } from './aviso-dom'

export async function montarAviso(
  ctx: ContentScriptContext,
  opcoes: Omit<OpcoesAviso, 'onFechar'> & { aoSair: () => void },
): Promise<void> {
  const { aoSair, ...aviso } = opcoes
  const ui = await createShadowRootUi(ctx, {
    name: 'piluvitu-aviso',
    position: 'inline',
    anchor: 'html',
    css,
    onMount(recipiente) {
      recipiente.append(
        construirAviso(document, { ...aviso, onFechar: () => ui.remove() }),
      )
    },
    onRemove: aoSair,
  })
  ui.mount()
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/aviso-dom.test.ts; echo "exit=$?"
```

Esperado: `Tests  7 passed`, `exit=0`.

- [ ] **Step 6: Story numa página hostil**

`apps/extensao/src/entrypoints/preencher.content/aviso.stories.tsx` (a página hostil é a da medição da pesquisa: `html` a 10 px, `--primary` vermelho, `--radius` zerado e Comic Sans com `!important`; o aviso não pode herdar nada disso):

```tsx
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useRef } from 'react'
import { fn } from 'storybook/test'
import css from './aviso.css?inline'
import { construirAviso, type OpcoesAviso } from './aviso-dom'

const PAGINA_HOSTIL =
  "html { font-size: 10px } :root { --primary: 0 100% 50%; --radius: 0 } * { font-family: 'Comic Sans MS', cursive !important }"

function AvisoEmPaginaHostil(props: OpcoesAviso) {
  const pagina = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hostil = document.createElement('style')
    hostil.textContent = PAGINA_HOSTIL
    document.head.append(hostil)
    const host = document.createElement('piluvitu-aviso')
    const sombra = host.attachShadow({ mode: 'open' })
    const estilo = document.createElement('style')
    estilo.textContent = css
    sombra.append(estilo, construirAviso(document, props))
    pagina.current?.append(host)
    return () => {
      host.remove()
      hostil.remove()
    }
  }, [props])

  return (
    <div ref={pagina} className="min-h-[220px] p-4">
      <h1>Site sendo testado</h1>
      <p>O CSS desta página tenta vazar para o aviso.</p>
    </div>
  )
}

const meta = {
  title: 'Página/1f · Aviso',
  component: AvisoEmPaginaHostil,
  args: { titulo: '21 de 23 campos preenchidos', onFechar: fn() },
} satisfies Meta<typeof AvisoEmPaginaHostil>

export default meta
type Story = StoryObj<typeof meta>

export const ComNaoReconhecidos: Story = {
  args: { linha2: '2 não reconhecidos', onIrParaNaoReconhecido: fn() },
}
export const TudoReconhecido: Story = {
  args: { titulo: '5 de 5 campos preenchidos' },
}
export const Singular: Story = { args: { titulo: '1 de 1 campo preenchido' } }
export const NaoReconhecidoEmIframe: Story = {
  args: { linha2: '1 não reconhecido' },
}
export const Erro: Story = {
  args: { titulo: 'Nenhum campo nesta página', erro: true },
}
```

(O aviso segue o `prefers-color-scheme` do sistema, não a classe `.dark`, igual na página real.)

```bash
pnpm --filter @piluvitu/extensao build-storybook; echo "exit=$?"
cd apps/extensao && node -e "
const indice = require('./storybook-static/index.json')
const avisos = Object.values(indice.entries).filter((e) => e.type === 'story' && e.title === 'Página/1f · Aviso')
require('node:assert').equal(avisos.length, 5)
console.log('stories do aviso ok')
"; echo "exit=$?"
```

Esperado: os dois `exit=0`.

- [ ] **Step 7: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/src/entrypoints/preencher.content/aviso.css apps/extensao/src/entrypoints/preencher.content/aviso-dom.ts \
  apps/extensao/src/entrypoints/preencher.content/aviso-dom.test.ts apps/extensao/src/entrypoints/preencher.content/aviso.ts \
  apps/extensao/src/entrypoints/preencher.content/aviso.stories.tsx \
  && /usr/bin/git commit -m "feat(extensao): aviso na página em shadow root, com CSS próprio em px"; echo "exit=$?"
```

---

### Task 13: Content script: API `__pv` e Inserir no campo em foco

**Files:**

- Create: `apps/extensao/src/entrypoints/preencher.content/inserir.ts`, `inserir.test.ts`
- Create: `apps/extensao/src/entrypoints/preencher.content/api.ts`, `api.test.ts`
- Create: `apps/extensao/src/entrypoints/preencher.content/index.ts`

`inserir.ts` porta o `func` de `inserir` de `R/mecanica-wxt/entrypoints/background/index.ts`, trocando o valor cru pelo `valorPara(kind, …)` do campo focado (decisão C12 do `critic`: "Data de nascimento" num `type=date` vira `aaaa-mm-dd`). `index.ts` segue `R/mecanica-wxt/entrypoints/preencher.content/index.tsx` (registro `runtime`, `cssInjectionMode: 'manual'`, `noScriptStartedPostMessage: true`), mas o `main()` só instala a API (decisão C1): quem preenche é a chamada `func` + `args` do background.

**Interfaces:**

- Consumes: `elementoEmFoco`, `ehCampo`, `tipoNaoPreenchivel`, `preenchivel`, `descrever`, `cabe`, `escrever`, `leuDeVolta` (Task 10); `criarRegistro`, `criarContornos`, `cliqueDoUsuarioEmCampo`, `preencherDocumento` (Task 11); `montarAviso` (Task 12); `primeiroNaoReconhecido`, `ResultadoFrame` (Task 5); `valorPara` de `@piluvitu/tools/campos-formatar`, `FieldKind` e `FieldDescriptor` de `@piluvitu/tools/campos`, `Pessoa` de `@piluvitu/tools/pessoa` (subpaths da fase 1; o barrel `@piluvitu/tools` não os exporta).
- Produces (contrato): `interface ApiPv { preencher(pessoa: Pessoa, hojeISO: string): ResultadoFrame; inserir(pessoa: Pessoa, kind: FieldKind): { ok: true } | { ok: false; motivo: 'sem-foco' | 'recusado' }; mostrar(idx: number): boolean; aviso(a: { titulo: string; linha2?: string; erro?: boolean }): void }`; o arquivo injetado `/content-scripts/preencher.js`. **Acréscimos:** `type ComPv = typeof globalThis & { __pv?: ApiPv }` (como o background e o próprio script enxergam o global), `type ResultadoInsercao = { ok: true } | { ok: false; motivo: 'sem-foco' | 'recusado' }`, `inserirNoFoco(pessoa: Pessoa, kind: FieldKind): ResultadoInsercao`, `criarApi(ctx: ContentScriptContext): ApiPv`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/extensao/src/entrypoints/preencher.content/inserir.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import { inserirNoFoco } from './inserir'

const fechadas = new Map<Element, ShadowRoot>()

beforeEach(() => {
  fechadas.clear()
  Object.assign(fakeBrowser.dom, {
    openOrClosedShadowRoot: (el: HTMLElement) =>
      el.shadowRoot ?? fechadas.get(el) ?? null,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

function focar(html: string): HTMLInputElement {
  document.body.innerHTML = html
  const el = document.querySelector('input') as HTMLInputElement
  el.focus()
  return el
}

describe('inserirNoFoco', () => {
  it('escreve no campo focado o valor do kind pedido', () => {
    const el = focar(
      '<label>Código de indicação <input name="ref_code"></label>',
    )
    expect(inserirNoFoco(P, 'cpf')).toEqual({ ok: true })
    expect(el.value).toBe(P.cpf)
  })

  it('formata para o campo: data de nascimento num type=date vai em aaaa-mm-dd', () => {
    const el = focar('<input type="date" name="d">')
    expect(inserirNoFoco(P, 'nascimento')).toEqual({ ok: true })
    expect(el.value).toBe(P.nascimento.iso)
  })

  it('sem campo em foco não faz nada', () => {
    document.body.innerHTML = '<input name="cep">'
    expect(inserirNoFoco(P, 'cep')).toEqual({ ok: false, motivo: 'sem-foco' })
  })

  it('checkbox em foco não conta como campo', () => {
    focar('<input type="checkbox" name="termos">')
    expect(inserirNoFoco(P, 'cpf')).toEqual({ ok: false, motivo: 'sem-foco' })
  })

  it('campo somente leitura recusa', () => {
    focar('<input name="cep" readonly>')
    expect(inserirNoFoco(P, 'cep')).toEqual({ ok: false, motivo: 'recusado' })
  })

  it('valor que não cabe no maxlength é recusado sem truncar', () => {
    const el = focar('<input type="password" name="s" maxlength="6">')
    expect(inserirNoFoco(P, 'senha')).toEqual({ ok: false, motivo: 'recusado' })
    expect(el.value).toBe('')
  })

  it('atravessa shadow root aberta e fechada até o campo focado', () => {
    document.body.innerHTML = '<div id="a"></div><div id="f"></div>'
    const aberta = (document.getElementById('a') as HTMLElement).attachShadow({
      mode: 'open',
    })
    aberta.innerHTML = '<input name="x">'
    const dentroDaAberta = aberta.querySelector('input') as HTMLInputElement
    dentroDaAberta.focus()
    expect(inserirNoFoco(P, 'email')).toEqual({ ok: true })
    expect(dentroDaAberta.value).toBe(P.email.endereco)

    const host = document.getElementById('f') as HTMLElement
    const fechada = host.attachShadow({ mode: 'closed' })
    fechada.innerHTML = '<input name="y">'
    fechadas.set(host, fechada)
    const dentroDaFechada = fechada.querySelector('input') as HTMLInputElement
    dentroDaFechada.focus()
    expect(inserirNoFoco(P, 'cep')).toEqual({ ok: true })
    expect(dentroDaFechada.value).toBe(P.endereco.cep)
  })
})
```

(contenteditable não roda no jsdom, que não tem `isContentEditable` nem `execCommand`; ele é coberto no E2E da Task 16.)

`apps/extensao/src/entrypoints/preencher.content/api.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { ContentScriptContext } from 'wxt/utils/content-script-context'
import { simularLayout } from '../../test/layout'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import { criarApi, type ComPv } from './api'
import conteudo from './index'

const HOJE = '2026-10-01'
const rolar = vi.fn()
let desfazerLayout: () => void

beforeEach(() => {
  rolar.mockReset()
  Object.assign(fakeBrowser.dom, {
    openOrClosedShadowRoot: (el: HTMLElement) => el.shadowRoot,
  })
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: rolar,
    configurable: true,
    writable: true,
  })
  desfazerLayout = simularLayout()
  document.body.innerHTML =
    '<label>Nome completo <input name="nome" style="outline: 1px dotted red"></label><label>Código de indicação <input name="ref_code"></label>'
})

afterEach(() => {
  desfazerLayout()
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  Reflect.deleteProperty(globalThis, '__pv')
  document.body.innerHTML = ''
})

const nome = () => document.querySelector('[name="nome"]') as HTMLInputElement
const outlineDoNome = () => nome().style.getPropertyValue('outline')

describe('criarApi', () => {
  it('preencher devolve o resultado do frame e contorna os campos', () => {
    const resultado = criarApi(new ContentScriptContext('preencher')).preencher(
      P,
      HOJE,
    )
    expect(resultado.preenchidos.map((l) => l.rotulo)).toEqual([
      'Nome completo',
    ])
    expect(resultado.naoReconhecidos.map((l) => l.rotulo)).toEqual([
      'Código de indicação',
    ])
    expect(outlineDoNome()).toBe('2px solid #38bdf8')
  })

  it('reinjetar (Alt+Shift+P de novo) invalida a instância antiga e devolve o outline do site', () => {
    criarApi(new ContentScriptContext('preencher')).preencher(P, HOJE)
    expect(outlineDoNome()).toBe('2px solid #38bdf8')
    const nova = new ContentScriptContext('preencher')
    expect(outlineDoNome()).toBe('1px dotted red')
    criarApi(nova).preencher(P, HOJE)
    expect(outlineDoNome()).toBe('2px solid #38bdf8')
    nova.abort()
    expect(outlineDoNome()).toBe('1px dotted red')
  })

  it('evento de foco disparado por script não tira os contornos', () => {
    criarApi(new ContentScriptContext('preencher')).preencher(P, HOJE)
    nome().dispatchEvent(
      new FocusEvent('focusin', { bubbles: true, composed: true }),
    )
    nome().dispatchEvent(
      new Event('pointerdown', { bubbles: true, composed: true }),
    )
    expect(outlineDoNome()).toBe('2px solid #38bdf8')
  })

  it('mostrar rola até o campo do idx; idx desconhecido devolve false', () => {
    const api = criarApi(new ContentScriptContext('preencher'))
    const { naoReconhecidos } = api.preencher(P, HOJE)
    expect(api.mostrar(naoReconhecidos[0].idx)).toBe(true)
    expect(rolar).toHaveBeenCalledWith({ block: 'center' })
    expect(api.mostrar(9999)).toBe(false)
  })

  it('inserir escreve no campo em foco', () => {
    const api = criarApi(new ContentScriptContext('preencher'))
    const refCode = document.querySelector(
      '[name="ref_code"]',
    ) as HTMLInputElement
    refCode.focus()
    expect(api.inserir(P, 'cpf')).toEqual({ ok: true })
    expect(refCode.value).toBe(P.cpf)
  })
})

describe('content script preencher', () => {
  it('é registrado em runtime, sem CSS automático nem postMessage, e o main instala __pv', () => {
    expect(conteudo).toMatchObject({
      registration: 'runtime',
      cssInjectionMode: 'manual',
      noScriptStartedPostMessage: true,
    })
    void conteudo.main(new ContentScriptContext('preencher'))
    const pv = (globalThis as ComPv).__pv
    expect(pv && Object.keys(pv).sort()).toEqual([
      'aviso',
      'inserir',
      'mostrar',
      'preencher',
    ])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/inserir.test.ts src/entrypoints/preencher.content/api.test.ts; echo "exit=$?"
```

Esperado: FAIL com `Failed to resolve import`; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/entrypoints/preencher.content/inserir.ts`:

```ts
import type { FieldDescriptor, FieldKind } from '@piluvitu/tools/campos'
import { valorPara } from '@piluvitu/tools/campos-formatar'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import {
  cabe,
  descrever,
  ehCampo,
  elementoEmFoco,
  escrever,
  leuDeVolta,
  preenchivel,
  tipoNaoPreenchivel,
} from './dom'

export type ResultadoInsercao =
  | { ok: true }
  | { ok: false; motivo: 'sem-foco' | 'recusado' }

const TEXTO_LIVRE: FieldDescriptor = {
  tag: 'textarea',
  type: 'textarea',
  name: '',
  id: '',
  autocomplete: '',
  placeholder: '',
  label: '',
  ariaLabel: '',
  maxLength: null,
  section: '',
}

export function inserirNoFoco(
  pessoa: Pessoa,
  kind: FieldKind,
): ResultadoInsercao {
  const alvo = elementoEmFoco(document)
  if (alvo && ehCampo(alvo) && !tipoNaoPreenchivel(alvo)) {
    if (!preenchivel(alvo)) return { ok: false, motivo: 'recusado' }
    const descritor = descrever(alvo)
    const valor = valorPara(kind, pessoa, descritor)
    if (valor === null || !cabe(valor, descritor))
      return { ok: false, motivo: 'recusado' }
    if (alvo.value !== valor) escrever(alvo, valor)
    return leuDeVolta(alvo, valor)
      ? { ok: true }
      : { ok: false, motivo: 'recusado' }
  }
  if (alvo instanceof HTMLElement && alvo.isContentEditable) {
    const valor = valorPara(kind, pessoa, TEXTO_LIVRE)
    if (valor !== null && document.execCommand('insertText', false, valor))
      return { ok: true }
    return { ok: false, motivo: 'recusado' }
  }
  return { ok: false, motivo: 'sem-foco' }
}
```

`apps/extensao/src/entrypoints/preencher.content/api.ts`:

```ts
import type { FieldKind } from '@piluvitu/tools/campos'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import type { ContentScriptContext } from 'wxt/utils/content-script-context'
import {
  primeiroNaoReconhecido,
  type ResultadoFrame,
} from '../../lib/resultado'
import { montarAviso } from './aviso'
import { cliqueDoUsuarioEmCampo, criarContornos } from './contornos'
import { inserirNoFoco, type ResultadoInsercao } from './inserir'
import { preencherDocumento } from './preencher'
import { criarRegistro } from './registro'

export interface ApiPv {
  preencher(pessoa: Pessoa, hojeISO: string): ResultadoFrame
  inserir(pessoa: Pessoa, kind: FieldKind): ResultadoInsercao
  mostrar(idx: number): boolean
  aviso(a: { titulo: string; linha2?: string; erro?: boolean }): void
}

export type ComPv = typeof globalThis & { __pv?: ApiPv }

const LIMPEZA_NOS_FRAMES_FILHOS_MS = 4000

export function criarApi(ctx: ContentScriptContext): ApiPv {
  const registro = criarRegistro()
  const contornos = criarContornos((acao, ms) => ctx.setTimeout(acao, ms))
  let ultimo: ResultadoFrame | null = null

  ctx.onInvalidated(() => contornos.limpar())
  for (const tipo of ['pointerdown', 'focusin'] as const) {
    ctx.addEventListener(
      document,
      tipo,
      (evento: Event) => {
        if (cliqueDoUsuarioEmCampo(evento)) contornos.limpar()
      },
      { capture: true },
    )
  }

  function mostrar(idx: number): boolean {
    const el = registro.buscar(idx)
    if (!el) return false
    el.scrollIntoView({ block: 'center' })
    contornos.destacar(el)
    return true
  }

  return {
    preencher(pessoa, hojeISO) {
      contornos.limpar()
      ultimo = preencherDocumento(pessoa, hojeISO, registro, contornos)
      if (window !== window.top)
        ctx.setTimeout(() => contornos.limpar(), LIMPEZA_NOS_FRAMES_FILHOS_MS)
      return ultimo
    },
    inserir: inserirNoFoco,
    mostrar,
    aviso(a) {
      const alvo =
        !a.erro && ultimo ? primeiroNaoReconhecido(ultimo) : undefined
      void montarAviso(ctx, {
        ...a,
        onIrParaNaoReconhecido:
          alvo === undefined ? undefined : () => void mostrar(alvo),
        aoSair: () => contornos.limpar(),
      })
    },
  }
}
```

`apps/extensao/src/entrypoints/preencher.content/index.ts`:

```ts
import { defineContentScript } from 'wxt/utils/define-content-script'
import { criarApi, type ComPv } from './api'

export default defineContentScript({
  registration: 'runtime',
  cssInjectionMode: 'manual',
  noScriptStartedPostMessage: true,
  main(ctx) {
    ;(globalThis as ComPv).__pv = criarApi(ctx)
  },
})
```

O `cssInjectionMode: 'manual'` não é preferência: com `'ui'` e registro em runtime sem `matches`, o WXT declara o CSS em `web_accessible_resources` com `matches: []` e o Chrome recusa carregá-lo (medido na pesquisa, `R/relatorios/wxt.md` §0.2). Esse porquê vai para o `apps/extensao/CLAUDE.md` na Task 17, não para o código.

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/preencher.content/inserir.test.ts src/entrypoints/preencher.content/api.test.ts; echo "exit=$?"
```

Esperado: `Tests  13 passed`, `exit=0`.

- [ ] **Step 5: Build com o content script e conferência do manifesto**

```bash
cd apps/extensao && pnpm run build; echo "exit=$?"
cd apps/extensao && /bin/ls .output/chrome-mv3/content-scripts/preencher.js && node -e "
const m = require('./.output/chrome-mv3/manifest.json')
const assert = require('node:assert')
assert.ok(!('content_scripts' in m), 'registro runtime não pode virar content_scripts')
assert.ok(!('host_permissions' in m), 'registro runtime sem matches não pode virar host_permissions')
assert.ok(!('web_accessible_resources' in m), 'cssInjectionMode manual não expõe CSS ao site')
console.log('content script fora do manifesto ok')
"; echo "exit=$?"
```

Esperado: os dois `exit=0`.

- [ ] **Step 6: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/src/entrypoints/preencher.content/inserir.ts apps/extensao/src/entrypoints/preencher.content/inserir.test.ts \
  apps/extensao/src/entrypoints/preencher.content/api.ts apps/extensao/src/entrypoints/preencher.content/api.test.ts \
  apps/extensao/src/entrypoints/preencher.content/index.ts \
  && /usr/bin/git commit -m "feat(extensao): content script sob demanda com a API __pv e o Inserir"; echo "exit=$?"
```

---

### Task 14: Background: preencher, inserir, mostrar, atalho, menu e mensagens

**Files:**

- Create: `apps/extensao/src/entrypoints/background/acoes.ts`, `acoes.test.ts`
- Create: `apps/extensao/src/entrypoints/background/ouvintes.ts`, `ouvintes.test.ts`
- Create: `apps/extensao/src/entrypoints/background/index.ts`, `background.test.ts`

Porte de `R/mecanica-wxt/entrypoints/background/index.ts`, com as decisões do `critic` e da spec: o background é o único orquestrador (G1); toda ação reinjeta `/content-scripts/preencher.js` e chama a API por `func` + `args` (C1); o aviso só no frame 0 (G2); sem pessoa, gera uma antes (G5); menus em `onInstalled` **e** `onStartup` (G10); `onMessage` com `sendResponse` + `return true` literal; a mensagem `inserir` só no modo e2e. Os handlers ficam em `ouvintes.ts` para os testes chamarem direto (atalho e menu nativo não dá para acionar pelo Playwright).

**Interfaces:**

- Consumes: `obterOuGerarPessoa`, `gerarPessoaNova`, `pessoaItem` (Task 3); `hojeISO` (Task 1); `erroEhPaginaProibida` (Task 4); `somarFrames`, `ResultadoFrame` (Task 5); `tituloPreenchimento`, `linhaNaoReconhecidos` (Task 5); `Mensagem`, `RespostaPreencher` (Task 6); `criarMenus`, `atualizarTitulosMenu`, `MENU`, `PREFIXO_INSERIR` (Task 6); `ComPv` (Task 13).
- Produces (contrato): `preencherPagina(tabId: number): Promise<RespostaPreencher>`, `inserirNoCampo(tabId: number, frameId: number, kind: FieldKind): Promise<void>`, `mostrarCampo(tabId: number, documentId: string, idx: number): Promise<boolean>`. **Acréscimos:** `ARQUIVO_CONTENT = '/content-scripts/preencher.js'`; `avisar(tabId: number, aviso: { titulo: string; linha2?: string; erro?: boolean }): Promise<void>` (a fase 3 usa para os avisos de falha); `COMANDO_PREENCHER = 'preencher-pagina'`; `recriarMenus(): Promise<void>`; `aoComando(comando: string, aba?: Browser.tabs.Tab): Promise<void>`; `aoClicarMenu(info: Browser.contextMenus.OnClickData, aba?: Browser.tabs.Tab): Promise<void>`; `aoReceberMensagem(mensagem: Mensagem, remetente: Browser.runtime.MessageSender, responder: (resposta?: unknown) => void): true | undefined`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/extensao/src/entrypoints/background/acoes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { pessoaItem } from '../../lib/armazenamento'
import type { ResultadoFrame } from '../../lib/resultado'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import {
  ARQUIVO_CONTENT,
  inserirNoCampo,
  mostrarCampo,
  preencherPagina,
} from './acoes'

// O fakeBrowser não implementa scripting: o stub responde como a página responderia.
interface Injecao {
  target: Record<string, unknown>
  files?: string[]
  func?: (...args: unknown[]) => unknown
  args?: unknown[]
}
const executar = vi.fn<(injecao: Injecao) => Promise<unknown>>()

const RESULTADO: ResultadoFrame = {
  preenchidos: [
    { idx: 1, rotulo: 'Nome completo', seletor: 'input[name="nome"]' },
  ],
  naoReconhecidos: [
    {
      idx: 2,
      rotulo: 'Código de indicação',
      seletor: 'input[name="ref_code"]',
    },
  ],
  recusados: [],
  contentType: 'text/html',
  iframesDeFora: 0,
}

function simularPagina(resultado: ResultadoFrame | null) {
  executar.mockImplementation(async (injecao) =>
    injecao.files
      ? [{ documentId: 'doc-0', frameId: 0 }]
      : [{ documentId: 'doc-0', frameId: 0, result: resultado }],
  )
}

const chamada = (n: number) => executar.mock.calls[n][0]

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01T15:00:00Z') })
  executar.mockReset()
  Object.assign(fakeBrowser.scripting, { executeScript: executar })
  await pessoaItem.setValue(P)
})

afterEach(() => vi.useRealTimers())

describe('preencherPagina', () => {
  it('injeta em todos os frames, chama __pv.preencher com a pessoa e hoje, avisa no frame 0 e devolve a soma', async () => {
    simularPagina(RESULTADO)
    const resposta = await preencherPagina(7)
    expect(executar).toHaveBeenCalledTimes(3)
    expect(chamada(0)).toEqual({
      target: { tabId: 7, allFrames: true },
      files: [ARQUIVO_CONTENT],
    })
    expect(chamada(1)).toMatchObject({
      target: { tabId: 7, allFrames: true },
      args: [P, '2026-10-01'],
    })
    expect(chamada(2)).toMatchObject({
      target: { tabId: 7, frameIds: [0] },
      args: [
        { titulo: '1 de 2 campos preenchidos', linha2: '1 não reconhecido' },
      ],
    })
    expect(resposta).toEqual({
      ok: true,
      resumo: {
        x: 1,
        y: 2,
        k: 1,
        contentType: 'text/html',
        iframesDeFora: 0,
        naoReconhecidos: [
          {
            documentId: 'doc-0',
            idx: 2,
            rotulo: 'Código de indicação',
            seletor: 'input[name="ref_code"]',
          },
        ],
      },
    })
  })

  it('a função injetada só chama a API do content script, e devolve null se ela não existir', async () => {
    simularPagina(RESULTADO)
    await preencherPagina(7)
    const { func, args = [] } = chamada(1)
    const preencher = vi.fn(() => RESULTADO)
    Object.assign(globalThis, { __pv: { preencher } })
    expect(func?.(...args)).toBe(RESULTADO)
    expect(preencher).toHaveBeenCalledWith(P, '2026-10-01')
    Reflect.deleteProperty(globalThis, '__pv')
    expect(func?.(...args)).toBeNull()
  })

  it('tudo reconhecido: o aviso vai sem a 2ª linha', async () => {
    simularPagina({ ...RESULTADO, naoReconhecidos: [] })
    await preencherPagina(7)
    expect(chamada(2).args).toEqual([{ titulo: '1 de 1 campo preenchido' }])
  })

  it('com Y = 0 não mostra aviso nesta fase', async () => {
    simularPagina({ ...RESULTADO, preenchidos: [], naoReconhecidos: [] })
    const resposta = await preencherPagina(7)
    expect(executar).toHaveBeenCalledTimes(2)
    expect(resposta).toMatchObject({ ok: true, resumo: { x: 0, y: 0, k: 0 } })
  })

  it('PDF aberto no leitor do Chrome vira página proibida', async () => {
    simularPagina({
      ...RESULTADO,
      preenchidos: [],
      naoReconhecidos: [],
      contentType: 'application/pdf',
    })
    await expect(preencherPagina(7)).resolves.toEqual({
      ok: false,
      motivo: 'proibida',
    })
  })

  it('recusa do Chrome vira página proibida', async () => {
    const aba = await fakeBrowser.tabs.create({
      url: 'https://chromewebstore.google.com/',
    })
    executar.mockRejectedValue(
      new Error('The extensions gallery cannot be scripted.'),
    )
    await expect(preencherPagina(aba.id as number)).resolves.toEqual({
      ok: false,
      motivo: 'proibida',
    })
  })

  it('file: sem acesso liberado vira arquivo-sem-acesso', async () => {
    const aba = await fakeBrowser.tabs.create({ url: 'file:///tmp/form.html' })
    executar.mockRejectedValue(
      new Error(
        'Cannot access contents of url "file:///tmp/form.html". Extension manifest must request permission to access this host.',
      ),
    )
    await expect(preencherPagina(aba.id as number)).resolves.toEqual({
      ok: false,
      motivo: 'arquivo-sem-acesso',
    })
  })

  it('outros erros sobem', async () => {
    executar.mockRejectedValue(new Error('No tab with id: 7.'))
    await expect(preencherPagina(7)).rejects.toThrow('No tab with id: 7.')
  })

  it('sem pessoa guardada, gera e guarda uma antes de preencher', async () => {
    await pessoaItem.setValue(null)
    simularPagina(RESULTADO)
    await preencherPagina(7)
    const guardada = await pessoaItem.getValue()
    expect(guardada).not.toBeNull()
    expect(chamada(1).args?.[0]).toEqual(guardada)
  })
})

describe('inserirNoCampo', () => {
  it('injeta só no frame do clique e chama __pv.inserir com a pessoa e o kind', async () => {
    simularPagina(null)
    await inserirNoCampo(7, 3, 'cpf')
    expect(chamada(0)).toEqual({
      target: { tabId: 7, frameIds: [3] },
      files: [ARQUIVO_CONTENT],
    })
    expect(chamada(1)).toMatchObject({
      target: { tabId: 7, frameIds: [3] },
      args: [P, 'cpf'],
    })
  })
})

describe('mostrarCampo', () => {
  it('chama __pv.mostrar no documento da linha, sem reinjetar', async () => {
    executar.mockResolvedValue([
      { documentId: 'doc-9', frameId: 4, result: true },
    ])
    await expect(mostrarCampo(7, 'doc-9', 12)).resolves.toBe(true)
    expect(executar).toHaveBeenCalledTimes(1)
    expect(chamada(0)).toMatchObject({
      target: { tabId: 7, documentIds: ['doc-9'] },
      args: [12],
    })
  })

  it('devolve false quando o campo sumiu', async () => {
    executar.mockResolvedValue([
      { documentId: 'doc-9', frameId: 4, result: false },
    ])
    await expect(mostrarCampo(7, 'doc-9', 12)).resolves.toBe(false)
  })
})
```

`apps/extensao/src/entrypoints/background/ouvintes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Browser } from 'wxt/browser'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { pessoaItem } from '../../lib/armazenamento'
import type { Mensagem } from '../../lib/mensagens'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import {
  aoClicarMenu,
  aoComando,
  aoReceberMensagem,
  recriarMenus,
} from './ouvintes'

interface Injecao {
  target: Record<string, unknown>
  files?: string[]
  args?: unknown[]
}
const executar = vi.fn<(injecao: Injecao) => Promise<unknown>>()
const criar = vi.fn()

beforeEach(async () => {
  executar.mockReset()
  executar.mockImplementation(async (injecao) =>
    injecao.files
      ? [{ documentId: 'doc-0', frameId: 0 }]
      : [{ documentId: 'doc-0', frameId: 0, result: null }],
  )
  criar.mockReset()
  Object.assign(fakeBrowser.scripting, { executeScript: executar })
  Object.assign(fakeBrowser.contextMenus, {
    create: criar,
    removeAll: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
  })
  await pessoaItem.setValue(P)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const ABA = { id: 7 } as Browser.tabs.Tab
const clique = (menuItemId: string, frameId = 0) =>
  ({
    menuItemId,
    frameId,
    editable: true,
    pageUrl: 'http://localhost:3000/',
  }) as Browser.contextMenus.OnClickData
const chamada = (n: number) => executar.mock.calls[n][0]

describe('aoComando', () => {
  it('Alt+Shift+P (preencher-pagina) preenche a aba do comando', async () => {
    await aoComando('preencher-pagina', ABA)
    expect(chamada(0).target).toEqual({ tabId: 7, allFrames: true })
  })

  it('ignora outro comando e comando sem aba', async () => {
    await aoComando('outro', ABA)
    await aoComando('preencher-pagina', undefined)
    expect(executar).not.toHaveBeenCalled()
  })

  it('sem pessoa guardada, o atalho gera uma antes de preencher', async () => {
    await pessoaItem.setValue(null)
    await aoComando('preencher-pagina', ABA)
    expect(await pessoaItem.getValue()).not.toBeNull()
  })
})

describe('aoClicarMenu', () => {
  it('"Preencher esta página" preenche a aba do clique', async () => {
    await aoClicarMenu(clique('preencher'), ABA)
    expect(chamada(0).target).toEqual({ tabId: 7, allFrames: true })
  })

  it('Inserir › CPF injeta no frame do clique com o kind', async () => {
    await aoClicarMenu(clique('inserir:cpf', 3), ABA)
    expect(chamada(0).target).toEqual({ tabId: 7, frameIds: [3] })
    expect(chamada(1).args).toEqual([P, 'cpf'])
  })

  it('"Nova pessoa" troca a pessoa guardada', async () => {
    await aoClicarMenu(clique('nova-pessoa'), ABA)
    expect(await pessoaItem.getValue()).not.toEqual(P)
  })

  it('"Abrir caixa de entrada" abre a caixa pública da pessoa numa aba nova', async () => {
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await aoClicarMenu(clique('abrir-caixa'), ABA)
    expect(abrir).toHaveBeenCalledWith({ url: P.email.caixaUrl })
  })

  it('"Abrir caixa de entrada" sem pessoa gera uma antes', async () => {
    await pessoaItem.setValue(null)
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await aoClicarMenu(clique('abrir-caixa'), undefined)
    const gerada = await pessoaItem.getValue()
    expect(abrir).toHaveBeenCalledWith({ url: gerada?.email.caixaUrl })
  })
})

describe('aoReceberMensagem', () => {
  it('preencher responde por sendResponse e devolve true literal', async () => {
    const responder = vi.fn()
    expect(
      aoReceberMensagem({ tipo: 'preencher', tabId: 7 }, {}, responder),
    ).toBe(true)
    await vi.waitFor(() =>
      expect(responder).toHaveBeenCalledWith({
        ok: true,
        resumo: expect.objectContaining({ x: 0, y: 0, k: 0 }),
      }),
    )
  })

  it('mostrar responde com o que __pv.mostrar devolveu', async () => {
    executar.mockResolvedValue([
      { documentId: 'doc-1', frameId: 2, result: true },
    ])
    const responder = vi.fn()
    expect(
      aoReceberMensagem(
        { tipo: 'mostrar', tabId: 7, documentId: 'doc-1', idx: 4 },
        {},
        responder,
      ),
    ).toBe(true)
    await vi.waitFor(() => expect(responder).toHaveBeenCalledWith(true))
  })

  it('inserir só é aceito no build e2e', async () => {
    const responder = vi.fn()
    const inserir: Mensagem = {
      tipo: 'inserir',
      tabId: 7,
      frameId: 0,
      kind: 'cpf',
    }
    expect(aoReceberMensagem(inserir, {}, responder)).toBeUndefined()
    expect(executar).not.toHaveBeenCalled()
    vi.stubEnv('MODE', 'e2e')
    expect(aoReceberMensagem(inserir, {}, responder)).toBe(true)
    await vi.waitFor(() => expect(responder).toHaveBeenCalledTimes(1))
    expect(chamada(1).args).toEqual([P, 'cpf'])
  })

  it('mensagem desconhecida não segura o canal', () => {
    expect(
      aoReceberMensagem({ tipo: 'outra' } as unknown as Mensagem, {}, vi.fn()),
    ).toBeUndefined()
  })

  it('erro inesperado é registrado e ainda responde, para o popup não ficar esperando', async () => {
    executar.mockRejectedValue(new Error('No tab with id: 7.'))
    const registrar = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    const responder = vi.fn()
    aoReceberMensagem({ tipo: 'preencher', tabId: 7 }, {}, responder)
    await vi.waitFor(() => expect(responder).toHaveBeenCalledWith(undefined))
    expect(registrar).toHaveBeenCalled()
  })
})

describe('recriarMenus', () => {
  it('recria os menus com o CPF da pessoa guardada no título', async () => {
    await recriarMenus()
    expect(criar).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inserir:cpf', title: `CPF · ${P.cpf}` }),
    )
  })
})
```

`apps/extensao/src/entrypoints/background/background.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { pessoaItem } from '../../lib/armazenamento'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import background from './index'

// commands e contextMenus.onClicked não existem no fakeBrowser: eventos falsos que o teste dispara.
function eventoFalso<A extends unknown[]>() {
  const ouvintes: ((...a: A) => unknown)[] = []
  return {
    addListener(ouvinte: (...a: A) => unknown) {
      ouvintes.push(ouvinte)
    },
    async disparar(...a: A) {
      await Promise.all(ouvintes.map((ouvinte) => ouvinte(...a)))
    },
  }
}

const executar =
  vi.fn<
    (injecao: {
      target: Record<string, unknown>
      files?: string[]
    }) => Promise<unknown>
  >()
const criar = vi.fn()
const atualizar = vi.fn(async () => undefined)
let onCommand = eventoFalso<[string, { id: number }?]>()
let onClicked =
  eventoFalso<[{ menuItemId: string; frameId?: number }, { id: number }?]>()

beforeEach(() => {
  executar.mockReset()
  executar.mockImplementation(async (injecao) =>
    injecao.files
      ? [{ documentId: 'd', frameId: 0 }]
      : [{ documentId: 'd', frameId: 0, result: null }],
  )
  criar.mockReset()
  atualizar.mockClear()
  onCommand = eventoFalso<[string, { id: number }?]>()
  onClicked =
    eventoFalso<[{ menuItemId: string; frameId?: number }, { id: number }?]>()
  Object.assign(fakeBrowser.scripting, { executeScript: executar })
  Object.assign(fakeBrowser.contextMenus, {
    create: criar,
    removeAll: vi.fn(async () => undefined),
    update: atualizar,
    onClicked,
  })
  Object.assign(fakeBrowser.commands, { onCommand })
  background.main()
})

describe('background', () => {
  it('cria os menus na instalação e na abertura do navegador', async () => {
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' })
    await vi.waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'preencher' }),
      ),
    )
    criar.mockClear()
    await fakeBrowser.runtime.onStartup.trigger()
    await vi.waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'abrir-caixa' }),
      ),
    )
  })

  it('pessoa nova atualiza os títulos de CPF e CEP do menu', async () => {
    await pessoaItem.setValue(P)
    await vi.waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith('inserir:cpf', {
        title: `CPF · ${P.cpf}`,
      }),
    )
    expect(atualizar).toHaveBeenCalledWith('inserir:cep', {
      title: `CEP · ${P.endereco.cep}`,
    })
  })

  it('o atalho preencher-pagina injeta o content script na aba do comando', async () => {
    await onCommand.disparar('preencher-pagina', { id: 7 })
    await vi.waitFor(() =>
      expect(executar).toHaveBeenCalledWith({
        target: { tabId: 7, allFrames: true },
        files: ['/content-scripts/preencher.js'],
      }),
    )
  })

  it('o clique no menu chega ao handler', async () => {
    await onClicked.disparar({ menuItemId: 'preencher' }, { id: 9 })
    await vi.waitFor(() =>
      expect(executar).toHaveBeenCalledWith(
        expect.objectContaining({ target: { tabId: 9, allFrames: true } }),
      ),
    )
  })

  it('a mensagem do popup volta com a resposta do background', async () => {
    await expect(
      fakeBrowser.runtime.sendMessage({ tipo: 'preencher', tabId: 7 }),
    ).resolves.toMatchObject({ ok: true })
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/background; echo "exit=$?"
```

Esperado: FAIL nos três arquivos com `Failed to resolve import`; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/entrypoints/background/acoes.ts`:

```ts
import type { FieldKind } from '@piluvitu/tools/campos'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import { browser } from 'wxt/browser'
import { obterOuGerarPessoa } from '../../lib/armazenamento'
import { hojeISO } from '../../lib/hoje'
import type { RespostaPreencher } from '../../lib/mensagens'
import { erroEhPaginaProibida } from '../../lib/paginas'
import { somarFrames } from '../../lib/resultado'
import { linhaNaoReconhecidos, tituloPreenchimento } from '../../lib/textos'
import type { ComPv } from '../preencher.content/api'

export const ARQUIVO_CONTENT = '/content-scripts/preencher.js'

interface Aviso {
  titulo: string
  linha2?: string
  erro?: boolean
}

export async function avisar(tabId: number, aviso: Aviso): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: (a: Aviso) => {
      ;(globalThis as ComPv).__pv?.aviso(a)
    },
    args: [aviso],
  })
}

async function motivoDaRecusa(
  tabId: number,
): Promise<'proibida' | 'arquivo-sem-acesso'> {
  const aba = await browser.tabs.get(tabId)
  return aba.url?.startsWith('file:') ? 'arquivo-sem-acesso' : 'proibida'
}

export async function preencherPagina(
  tabId: number,
): Promise<RespostaPreencher> {
  const pessoa = await obterOuGerarPessoa()
  try {
    await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [ARQUIVO_CONTENT],
    })
    const resultados = await browser.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (p: Pessoa, hoje: string) =>
        (globalThis as ComPv).__pv?.preencher(p, hoje) ?? null,
      args: [pessoa, hojeISO()],
    })
    const resumo = somarFrames(
      resultados.map(({ documentId, frameId, result }) => ({
        documentId,
        frameId,
        result,
      })),
    )
    if (resumo.contentType === 'application/pdf')
      return { ok: false, motivo: 'proibida' }
    if (resumo.y > 0) {
      await avisar(tabId, {
        titulo: tituloPreenchimento(resumo.x, resumo.y),
        linha2: resumo.k > 0 ? linhaNaoReconhecidos(resumo.k) : undefined,
      })
    }
    return { ok: true, resumo }
  } catch (erro) {
    if (
      !erroEhPaginaProibida(erro instanceof Error ? erro.message : String(erro))
    )
      throw erro
    return { ok: false, motivo: await motivoDaRecusa(tabId) }
  }
}

export async function inserirNoCampo(
  tabId: number,
  frameId: number,
  kind: FieldKind,
): Promise<void> {
  const pessoa = await obterOuGerarPessoa()
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    files: [ARQUIVO_CONTENT],
  })
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [frameId] },
    func: (p: Pessoa, k: FieldKind) =>
      (globalThis as ComPv).__pv?.inserir(p, k) ?? null,
    args: [pessoa, kind],
  })
}

export async function mostrarCampo(
  tabId: number,
  documentId: string,
  idx: number,
): Promise<boolean> {
  const [resultado] = await browser.scripting.executeScript({
    target: { tabId, documentIds: [documentId] },
    func: (i: number) => (globalThis as ComPv).__pv?.mostrar(i) ?? false,
    args: [idx],
  })
  return resultado?.result === true
}
```

No teste "tudo reconhecido", o `args` esperado é `[{ titulo: '1 de 1 campo preenchido' }]`: o `linha2: undefined` some na serialização dos `args` do `executeScript`, e o `toEqual` do Vitest também trata propriedade `undefined` como ausente.

`apps/extensao/src/entrypoints/background/ouvintes.ts`:

```ts
import type { FieldKind } from '@piluvitu/tools/campos'
import { browser, type Browser } from 'wxt/browser'
import {
  gerarPessoaNova,
  obterOuGerarPessoa,
  pessoaItem,
} from '../../lib/armazenamento'
import type { Mensagem } from '../../lib/mensagens'
import { criarMenus, MENU, PREFIXO_INSERIR } from '../../lib/menus'
import { inserirNoCampo, mostrarCampo, preencherPagina } from './acoes'

export const COMANDO_PREENCHER = 'preencher-pagina'

export async function recriarMenus(): Promise<void> {
  await criarMenus(await pessoaItem.getValue())
}

export async function aoComando(
  comando: string,
  aba?: Browser.tabs.Tab,
): Promise<void> {
  if (comando === COMANDO_PREENCHER && aba?.id !== undefined)
    await preencherPagina(aba.id)
}

export async function aoClicarMenu(
  info: Browser.contextMenus.OnClickData,
  aba?: Browser.tabs.Tab,
): Promise<void> {
  const id = String(info.menuItemId)
  if (id === MENU.novaPessoa) {
    await gerarPessoaNova()
    return
  }
  if (id === MENU.abrirCaixa) {
    const pessoa = await obterOuGerarPessoa()
    await browser.tabs.create({ url: pessoa.email.caixaUrl })
    return
  }
  if (aba?.id === undefined) return
  if (id === MENU.preencher) await preencherPagina(aba.id)
  else if (id.startsWith(PREFIXO_INSERIR)) {
    await inserirNoCampo(
      aba.id,
      info.frameId ?? 0,
      id.slice(PREFIXO_INSERIR.length) as FieldKind,
    )
  }
}

function executar(mensagem: Mensagem): Promise<unknown> | undefined {
  switch (mensagem?.tipo) {
    case 'preencher':
      return preencherPagina(mensagem.tabId)
    case 'mostrar':
      return mostrarCampo(mensagem.tabId, mensagem.documentId, mensagem.idx)
    case 'inserir':
      return import.meta.env.MODE === 'e2e'
        ? inserirNoCampo(mensagem.tabId, mensagem.frameId, mensagem.kind)
        : undefined
    default:
      return undefined
  }
}

// `return true` literal + sendResponse, nunca Promise: o Chrome só aceita Promise no onMessage a partir do 148.
export function aoReceberMensagem(
  mensagem: Mensagem,
  _remetente: Browser.runtime.MessageSender,
  responder: (resposta?: unknown) => void,
): true | undefined {
  const tarefa = executar(mensagem)
  if (!tarefa) return undefined
  tarefa.then(responder, (erro: unknown) => {
    console.error(erro)
    responder(undefined)
  })
  return true
}
```

`apps/extensao/src/entrypoints/background/index.ts`:

```ts
import { browser } from 'wxt/browser'
import { defineBackground } from 'wxt/utils/define-background'
import { pessoaItem } from '../../lib/armazenamento'
import { atualizarTitulosMenu } from '../../lib/menus'
import {
  aoClicarMenu,
  aoComando,
  aoReceberMensagem,
  recriarMenus,
} from './ouvintes'

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => void recriarMenus())
  browser.runtime.onStartup.addListener(() => void recriarMenus())
  pessoaItem.watch((pessoa) => void atualizarTitulosMenu(pessoa))
  browser.commands.onCommand.addListener(
    (comando, aba) => void aoComando(comando, aba),
  )
  browser.contextMenus.onClicked.addListener(
    (info, aba) => void aoClicarMenu(info, aba),
  )
  browser.runtime.onMessage.addListener(aoReceberMensagem)
})
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/background; echo "exit=$?"
```

Esperado: `Test Files  3 passed`, `Tests  31 passed`, `exit=0`.

- [ ] **Step 5: Build e conferência do background no manifesto**

```bash
cd apps/extensao && pnpm run build; echo "exit=$?"
cd apps/extensao && node -e "
const m = require('./.output/chrome-mv3/manifest.json')
require('node:assert').equal(m.background.service_worker, 'background.js')
console.log('service worker ok')
"; echo "exit=$?"
```

Esperado: os dois `exit=0`.

- [ ] **Step 6: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/src/entrypoints/background \
  && /usr/bin/git commit -m "feat(extensao): background com atalho, menu de contexto e mensagens do popup"; echo "exit=$?"
```

---

### Task 15: Popup ligado ao armazenamento, ao atalho e à aba-alvo

**Files:**

- Create: `apps/extensao/src/entrypoints/popup/use-aba-alvo.ts`, `use-aba-alvo.test.ts`
- Modify (substitui o arquivo inteiro): `apps/extensao/src/entrypoints/popup/App.tsx`
- Create: `apps/extensao/src/entrypoints/popup/App.test.tsx`

Porte de `R/mecanica-wxt/entrypoints/popup/App.tsx` (pessoa por `getValue` + `watch`, "alterar" por `tabs.create`), agora com os componentes das Tasks 7–9, a aba-alvo explícita (com a costura `?aba=` só no modo e2e), o atalho de `commands.getAll()` e o "Preencher" mandando a mensagem para o background. Nesta fase o popup continua no 1b depois do "Preencher".

**Interfaces:**

- Consumes: `PopupShell`, `Rodape`, `StatusHost`, `PrimeiroUso`, `PessoaPronta` (Tasks 7–9); `pessoaItem`, `gerarPessoaNova` (Task 3); `hojeISO`, `idadeEm` (Task 1); `enviar` (Task 6); `situacaoDaUrl`, `SituacaoPagina`, `rotuloDoHost` (Task 4).
- Produces: `interface AbaAlvo { id: number; url: string | undefined; situacao: SituacaoPagina }`; `buscarAbaAlvo(busca: string): Promise<AbaAlvo | null>`; `useAbaAlvo(): AbaAlvo | null | undefined` (`undefined` enquanto carrega); `App()`.

- [ ] **Step 1: Escrever os testes que falham**

`apps/extensao/src/entrypoints/popup/use-aba-alvo.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Browser } from 'wxt/browser'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { buscarAbaAlvo } from './use-aba-alvo'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

// mockImplementation, não mockResolvedValue: o spyOn pega a última sobrecarga de tabs.query (a de callback,
// que devolve void), e o mockResolvedValue([...]) não passa no tsc.
const abaAtiva = (url: string | undefined) =>
  vi
    .spyOn(fakeBrowser.tabs, 'query')
    .mockImplementation(async () => [{ id: 7, url } as Browser.tabs.Tab])

describe('buscarAbaAlvo', () => {
  it('usa a aba ativa da janela atual', async () => {
    const consulta = abaAtiva('http://localhost:3000/cadastro')
    await expect(buscarAbaAlvo('')).resolves.toEqual({
      id: 7,
      url: 'http://localhost:3000/cadastro',
      situacao: 'ok',
    })
    expect(consulta).toHaveBeenCalledWith({ active: true, currentWindow: true })
  })

  it('marca a página proibida pela URL', async () => {
    abaAtiva('chrome://settings')
    await expect(buscarAbaAlvo('')).resolves.toMatchObject({
      situacao: 'proibida',
    })
  })

  it('file: pergunta ao Chrome se o acesso a arquivos está liberado', async () => {
    abaAtiva('file:///Users/eu/form.html')
    Object.assign(fakeBrowser.extension, {
      isAllowedFileSchemeAccess: vi.fn(async () => false),
    })
    await expect(buscarAbaAlvo('')).resolves.toMatchObject({
      situacao: 'arquivo-sem-acesso',
    })
  })

  it('?aba= só vale no build e2e', async () => {
    const outra = await fakeBrowser.tabs.create({
      url: 'http://teste.local/form',
    })
    abaAtiva('http://localhost:3000/')
    await expect(buscarAbaAlvo(`?aba=${outra.id}`)).resolves.toMatchObject({
      id: 7,
    })
    vi.stubEnv('MODE', 'e2e')
    await expect(buscarAbaAlvo(`?aba=${outra.id}`)).resolves.toEqual({
      id: outra.id,
      url: 'http://teste.local/form',
      situacao: 'ok',
    })
  })

  it('sem aba devolve null', async () => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockImplementation(async () => [])
    await expect(buscarAbaAlvo('')).resolves.toBeNull()
  })
})
```

`apps/extensao/src/entrypoints/popup/App.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Browser } from 'wxt/browser'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { pessoaItem } from '../../lib/armazenamento'
import { hojeISO, idadeEm } from '../../lib/hoje'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import { App } from './App'

let atalho = 'Alt+Shift+P'
let urlDaAba = 'http://localhost:3000/cadastro'

beforeEach(() => {
  atalho = 'Alt+Shift+P'
  urlDaAba = 'http://localhost:3000/cadastro'
  Object.assign(fakeBrowser.commands, {
    getAll: vi.fn(async () => [
      {
        name: 'preencher-pagina',
        shortcut: atalho,
        description: 'Preencher esta página',
      },
    ]),
  })
  vi.spyOn(fakeBrowser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: urlDaAba } as Browser.tabs.Tab,
  ])
})

afterEach(() => vi.restoreAllMocks())

const botaoPreencher = () =>
  screen.findByRole('button', { name: /Preencher esta página/ })

describe('App do popup', () => {
  it('sem pessoa mostra o 1a, e "Gerar pessoa" leva ao 1b', async () => {
    render(<App />)
    expect(
      await screen.findByRole('heading', {
        name: 'Ainda não há pessoa de teste',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('localhost:3000')).toBeInTheDocument()
    expect(screen.getByText('preenche sem abrir o popup')).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Gerar pessoa' }))
    const gerada = await vi.waitFor(async () => {
      const pessoa = await pessoaItem.getValue()
      if (!pessoa) throw new Error('ainda sem pessoa')
      return pessoa
    })
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: gerada.nome.completo,
      }),
    ).toBeInTheDocument()
  })

  it('com pessoa mostra o 1b com a idade de hoje e o rodapé com "alterar"', async () => {
    await pessoaItem.setValue(P)
    render(<App />)
    expect(
      await screen.findByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
    const idade = idadeEm(P.nascimento.iso, hojeISO())
    expect(
      screen.getByText(
        `${idade} anos · ${P.endereco.cidade}, ${P.endereco.uf}`,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('preenche sem abrir')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'alterar' })).toBeInTheDocument()
  })

  it('"Preencher esta página" manda a mensagem para a aba-alvo e o popup continua no 1b', async () => {
    const recebidas: unknown[] = []
    fakeBrowser.runtime.onMessage.addListener(
      (mensagem, _remetente, responder) => {
        recebidas.push(mensagem)
        responder(undefined)
        return true
      },
    )
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent.setup().click(await botaoPreencher())
    await vi.waitFor(() =>
      expect(recebidas).toEqual([{ tipo: 'preencher', tabId: 7 }]),
    )
    expect(
      screen.getByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
  })

  it('página proibida: pílula com o host e Preencher desabilitado', async () => {
    urlDaAba = 'chrome://settings'
    await pessoaItem.setValue(P)
    render(<App />)
    expect(await botaoPreencher()).toBeDisabled()
    expect(screen.getByText('chrome://settings')).toBeInTheDocument()
  })

  it('sem atalho, o rodapé vira "definir atalho", que abre a página de atalhos', async () => {
    atalho = ''
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    expect((await botaoPreencher()).querySelector('kbd')).toBeNull()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'definir atalho' }))
    expect(abrir).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' })
  })

  it('"alterar" abre a página de atalhos', async () => {
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'alterar' }))
    expect(abrir).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' })
  })

  it('"Caixa de entrada" abre a caixa pública da pessoa', async () => {
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Caixa de entrada' }))
    expect(abrir).toHaveBeenCalledWith({ url: P.email.caixaUrl })
  })

  it('"Nova pessoa" troca a pessoa guardada', async () => {
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Nova pessoa' }))
    await vi.waitFor(async () =>
      expect(await pessoaItem.getValue()).not.toEqual(P),
    )
  })

  it('copiar usa a área de transferência', async () => {
    const user = userEvent.setup()
    const escrever = vi.spyOn(navigator.clipboard, 'writeText')
    await pessoaItem.setValue(P)
    render(<App />)
    const pessoais = within(
      await screen.findByRole('region', { name: 'Pessoais' }),
    )
    await user.click(pessoais.getByRole('button', { name: 'Copiar CPF' }))
    expect(escrever).toHaveBeenCalledWith(P.cpf)
  })
})
```

(O `userEvent.setup()` troca o `navigator.clipboard` por um stub próprio; por isso o espião é criado **depois** do `setup()`.)

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/popup/use-aba-alvo.test.ts src/entrypoints/popup/App.test.tsx; echo "exit=$?"
```

Esperado: FAIL: `use-aba-alvo` não resolve e o `App` provisório não renderiza nada; `exit=1`.

- [ ] **Step 3: Implementar**

`apps/extensao/src/entrypoints/popup/use-aba-alvo.ts`:

```ts
import { useEffect, useState } from 'react'
import { browser } from 'wxt/browser'
import { situacaoDaUrl, type SituacaoPagina } from '../../lib/paginas'

export interface AbaAlvo {
  id: number
  url: string | undefined
  situacao: SituacaoPagina
}

export async function buscarAbaAlvo(busca: string): Promise<AbaAlvo | null> {
  // Costura de teste: aberto como aba pelo Playwright, o popup se enxergaria como a aba ativa.
  const forcada =
    import.meta.env.MODE === 'e2e'
      ? new URLSearchParams(busca).get('aba')
      : null
  const aba = forcada
    ? await browser.tabs.get(Number(forcada))
    : (await browser.tabs.query({ active: true, currentWindow: true }))[0]
  if (aba?.id === undefined) return null
  const acessoArquivo = aba.url?.startsWith('file:')
    ? await browser.extension.isAllowedFileSchemeAccess()
    : false
  return {
    id: aba.id,
    url: aba.url,
    situacao: situacaoDaUrl(aba.url, acessoArquivo),
  }
}

export function useAbaAlvo(): AbaAlvo | null | undefined {
  const [aba, setAba] = useState<AbaAlvo | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    void buscarAbaAlvo(location.search).then((encontrada) => {
      if (vivo) setAba(encontrada)
    })
    return () => {
      vivo = false
    }
  }, [])
  return aba
}
```

`apps/extensao/src/entrypoints/popup/App.tsx` (substitui o provisório da Task 1):

```tsx
import type { Pessoa } from '@piluvitu/tools/pessoa'
import { useEffect, useState } from 'react'
import { browser } from 'wxt/browser'
import { PessoaPronta } from '../../components/pessoa-pronta'
import type { StatusHost } from '../../components/pilula-host'
import { PopupShell } from '../../components/popup-shell'
import { PrimeiroUso } from '../../components/primeiro-uso'
import { Rodape } from '../../components/rodape'
import { gerarPessoaNova, pessoaItem } from '../../lib/armazenamento'
import { hojeISO, idadeEm } from '../../lib/hoje'
import { enviar } from '../../lib/mensagens'
import { rotuloDoHost } from '../../lib/paginas'
import { useAbaAlvo } from './use-aba-alvo'

const PAGINA_DE_ATALHOS = 'chrome://extensions/shortcuts'
const COMANDO_PREENCHER = 'preencher-pagina'

function usePessoa(): Pessoa | null | undefined {
  const [pessoa, setPessoa] = useState<Pessoa | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    void pessoaItem.getValue().then((guardada) => {
      if (vivo) setPessoa(guardada)
    })
    const pararDeOuvir = pessoaItem.watch((nova) => setPessoa(nova))
    return () => {
      vivo = false
      pararDeOuvir()
    }
  }, [])
  return pessoa
}

function useAtalho(): string | undefined {
  const [atalho, setAtalho] = useState<string | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    void browser.commands.getAll().then((comandos) => {
      if (vivo)
        setAtalho(
          comandos.find((c) => c.name === COMANDO_PREENCHER)?.shortcut ?? '',
        )
    })
    return () => {
      vivo = false
    }
  }, [])
  return atalho
}

export function App() {
  const pessoa = usePessoa()
  const aba = useAbaAlvo()
  const atalho = useAtalho()
  if (pessoa === undefined || aba === undefined || atalho === undefined)
    return null

  const podePreencher = aba !== null && aba.situacao === 'ok'
  const status: StatusHost =
    aba === null || aba.situacao === 'ok' ? 'ok' : 'lock'
  const host = rotuloDoHost(aba?.url)
  const abrirAtalhos = () =>
    void browser.tabs.create({ url: PAGINA_DE_ATALHOS })

  if (pessoa === null) {
    return (
      <PopupShell
        host={host}
        status={status}
        rodape={
          <Rodape
            atalho={atalho}
            texto="preenche sem abrir o popup"
            onAlterarAtalho={abrirAtalhos}
          />
        }
      >
        <PrimeiroUso onGerar={() => void gerarPessoaNova()} />
      </PopupShell>
    )
  }

  return (
    <PopupShell
      host={host}
      status={status}
      rodape={
        <Rodape
          atalho={atalho}
          texto="preenche sem abrir"
          comAlterar
          onAlterarAtalho={abrirAtalhos}
        />
      }
    >
      <PessoaPronta
        pessoa={pessoa}
        idade={idadeEm(pessoa.nascimento.iso, hojeISO())}
        atalho={atalho}
        preencherDesabilitado={!podePreencher}
        onPreencher={() => {
          if (aba) void enviar({ tipo: 'preencher', tabId: aba.id })
        }}
        onNovaPessoa={() => void gerarPessoaNova()}
        onAbrirCaixa={() =>
          void browser.tabs.create({ url: pessoa.email.caixaUrl })
        }
        onCopiar={(valor) => navigator.clipboard.writeText(valor)}
      />
    </PopupShell>
  )
}
```

- [ ] **Step 4: Rodar e ver passar (e a suíte inteira)**

```bash
cd apps/extensao && ./node_modules/.bin/vitest run src/entrypoints/popup/use-aba-alvo.test.ts src/entrypoints/popup/App.test.tsx; echo "exit=$?"
pnpm --filter @piluvitu/extensao test; echo "exit=$?"
```

Esperado: `Tests  14 passed` no primeiro; a suíte inteira verde no segundo; os dois `exit=0`.

- [ ] **Step 5: Lint, build e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
pnpm --filter @piluvitu/extensao build; echo "exit=$?"
/usr/bin/git add apps/extensao/src/entrypoints/popup \
  && /usr/bin/git commit -m "feat(extensao): popup 1a/1b ligado à pessoa guardada, ao atalho e à aba-alvo"; echo "exit=$?"
```

---

### Task 16: E2E com a extensão desempacotada (Playwright)

**Files:**

- Create: `apps/extensao/playwright.config.ts`, `apps/extensao/src/test/extensao.fixture.ts`
- Create: `apps/extensao/manifesto.e2e.ts`
- Create: `apps/extensao/src/entrypoints/background/menus.e2e.ts`
- Create: `apps/extensao/src/entrypoints/popup/popup.e2e.ts`
- Create (cópia + edições): `apps/extensao/src/entrypoints/preencher.content/cadastro.pagina.html`
- Create: `apps/extensao/src/entrypoints/preencher.content/react.pagina.html`, `react.pagina.tsx`
- Create: `apps/extensao/src/entrypoints/preencher.content/preencher.e2e.ts`

Harness da pesquisa (`R/integracao/src/test/extensao.fixture.ts` e `R/integracao/playwright.config.ts`, decisão C6 do `critic`): `channel: 'chromium'` (sem ele o headless não carrega extensão), build `--mode e2e` com `host_permissions` para `http://teste.local/*` (o Playwright não produz o gesto que concede o activeTab), páginas servidas por `context.route` (sem servidor), E2E colocados ao lado do código. A página de cadastro é a do laboratório (`R/deteccao/paginas/cadastro.html`, 21 de 23 no lab) com três edições: o IMask, que vinha de um caminho do laboratório, vira uma máscara própria em JS puro; o select de Estado ganha as 27 UFs (a pessoa é sorteada, a UF também); o select de ano passa a ser gerado a partir do ano atual (a validade do cartão anda com a data real). React e validação no blur ficam numa página própria, `react.pagina.html`, empacotada com o Vite em memória dentro do teste. As costuras de teste são as do contrato: `?aba=` no popup e a mensagem `inserir`.

**Interfaces:**

- Consumes: tudo das Tasks 1–15; `Mensagem`, `RespostaPreencher` (Task 6); `Pessoa` (fase 1).
- Produces: `test`, `expect` (fixture com `context`, `sw`, `extensionId`), `ORIGEM = 'http://teste.local'`, `interface Rota { corpo: string; tipo?: string; cabecalhos?: Record<string, string> }`, `servir(context, rotas: Record<string, Rota>): Promise<void>`, `idDaAba(sw, url): Promise<number>`, `abrirPopup(context, extensionId, busca?): Promise<Page>`, `enviarMensagem(popup, m: Mensagem): Promise<unknown>`, `pessoaGuardada(sw): Promise<Pessoa | undefined>` em `src/test/extensao.fixture.ts` (a fase 3 reaproveita).

- [ ] **Step 1: Configuração e fixture do Playwright**

`apps/extensao/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testMatch: ['**/*.e2e.ts'],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
})
```

`apps/extensao/src/test/extensao.fixture.ts`:

```ts
import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test'
import type { Pessoa } from '@piluvitu/tools/pessoa'
import path from 'node:path'
import type { browser } from 'wxt/browser'
import type { Mensagem } from '../lib/mensagens'

declare const chrome: typeof browser

const EXTENSAO = path.resolve(
  import.meta.dirname,
  '../../.output/chrome-mv3-e2e',
)
export const ORIGEM = 'http://teste.local'

export interface Rota {
  corpo: string
  tipo?: string
  cabecalhos?: Record<string, string>
}

export const test = base.extend<{
  context: BrowserContext
  sw: Worker
  extensionId: string
}>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSAO}`,
        `--load-extension=${EXTENSAO}`,
      ],
    })
    await use(context)
    await context.close()
  },
  sw: async ({ context }, use) => {
    let [sw] = context.serviceWorkers()
    if (!sw) sw = await context.waitForEvent('serviceworker')
    await use(sw)
  },
  extensionId: async ({ sw }, use) => {
    await use(sw.url().split('/')[2])
  },
})

export const expect = test.expect

export async function servir(
  context: BrowserContext,
  rotas: Record<string, Rota>,
): Promise<void> {
  await context.route(`${ORIGEM}/**`, (rota) => {
    const pagina = rotas[new URL(rota.request().url()).pathname]
    if (!pagina) return rota.fulfill({ status: 404, body: 'não encontrado' })
    return rota.fulfill({
      status: 200,
      contentType: pagina.tipo ?? 'text/html; charset=utf-8',
      headers: pagina.cabecalhos,
      body: pagina.corpo,
    })
  })
}

export async function idDaAba(sw: Worker, url: string): Promise<number> {
  const id = await sw.evaluate(
    async (u) => (await chrome.tabs.query({ url: u }))[0]?.id,
    url,
  )
  if (id === undefined) throw new Error(`nenhuma aba em ${url}`)
  return id
}

export async function abrirPopup(
  context: BrowserContext,
  extensionId: string,
  busca = '',
): Promise<Page> {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/popup.html${busca}`)
  return popup
}

export function enviarMensagem(
  popup: Page,
  mensagem: Mensagem,
): Promise<unknown> {
  return popup.evaluate((m) => chrome.runtime.sendMessage(m), mensagem)
}

export async function pessoaGuardada(sw: Worker): Promise<Pessoa | undefined> {
  const { pessoa } = await sw.evaluate(() => chrome.storage.local.get('pessoa'))
  return pessoa as Pessoa | undefined
}
```

Chromium do Playwright 1.59.1 (a pesquisa já tinha o `chromium-1217` em cache; o comando não baixa de novo se já estiver lá):

```bash
cd apps/extensao && ./node_modules/.bin/playwright install chromium; echo "exit=$?"
```

- [ ] **Step 2: Manifesto de produção e menus (com a instalação real)**

`apps/extensao/manifesto.e2e.ts`:

```ts
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const manifesto = (pasta: string) =>
  JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, '.output', pasta, 'manifest.json'),
      'utf8',
    ),
  )

test('manifesto de produção: só activeTab, sem host_permissions nem content_scripts', () => {
  const m = manifesto('chrome-mv3')
  expect('host_permissions' in m).toBe(false)
  expect('content_scripts' in m).toBe(false)
  expect('web_accessible_resources' in m).toBe(false)
  expect([...m.permissions].sort()).toEqual([
    'activeTab',
    'contextMenus',
    'scripting',
    'storage',
  ])
  expect(m).toMatchObject({
    manifest_version: 3,
    name: 'piluvitu · dados de teste',
    version: '0.1.0',
    minimum_chrome_version: '121',
    commands: {
      'preencher-pagina': {
        suggested_key: { default: 'Alt+Shift+P' },
        description: 'Preencher esta página',
      },
    },
    action: {
      default_title: 'piluvitu · dados de teste',
      default_popup: 'popup.html',
    },
    background: { service_worker: 'background.js' },
  })
  expect(Object.keys(m.icons).sort()).toEqual(['128', '16', '32', '48'])
})

test('o build e2e é o único com host_permissions, e só para teste.local', () => {
  expect(manifesto('chrome-mv3-e2e').host_permissions).toEqual([
    'http://teste.local/*',
  ])
})
```

`apps/extensao/src/entrypoints/background/menus.e2e.ts`:

```ts
import type { browser } from 'wxt/browser'
import { expect, test } from '../../test/extensao.fixture'

declare const chrome: typeof browser

test('a instalação cria o menu completo e registra o atalho', async ({
  sw,
}) => {
  const existe = (id: string) =>
    sw.evaluate(async (i) => {
      try {
        await chrome.contextMenus.update(i, {})
        return true
      } catch {
        return false
      }
    }, id)
  // Os menus nascem de forma assíncrona depois da instalação: espera o primeiro aparecer.
  await expect.poll(() => existe('inserir:cpf')).toBe(true)
  for (const id of [
    'preencher',
    'inserir',
    'inserir:tituloEleitor',
    'nova-pessoa',
    'abrir-caixa',
  ]) {
    expect(await existe(id)).toBe(true)
  }
  expect(await existe('nao-existe')).toBe(false)
  const comandos = await sw.evaluate(() => chrome.commands.getAll())
  expect(comandos.find((c) => c.name === 'preencher-pagina')).toMatchObject({
    description: 'Preencher esta página',
    shortcut: expect.stringMatching(/⌥⇧P|Alt\+Shift\+P/),
  })
})
```

```bash
cd apps/extensao && pnpm run build && pnpm run build:e2e && ./node_modules/.bin/playwright test manifesto.e2e.ts src/entrypoints/background/menus.e2e.ts; echo "exit=$?"
```

Esperado: `3 passed`, `exit=0`.

- [ ] **Step 3: Popup → Preencher na aba-alvo**

`apps/extensao/src/entrypoints/popup/popup.e2e.ts`:

```ts
import {
  abrirPopup,
  expect,
  idDaAba,
  ORIGEM,
  pessoaGuardada,
  servir,
  test,
} from '../../test/extensao.fixture'

test('popup: gera a pessoa no 1a e o Preencher do 1b preenche a aba-alvo', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, {
    '/form': {
      corpo:
        '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf"></label>',
    },
  })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/form`)
  const tabId = await idDaAba(sw, `${ORIGEM}/form`)

  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)
  await expect(
    popup.getByRole('heading', { name: 'Ainda não há pessoa de teste' }),
  ).toBeVisible()
  await expect(popup.getByText('teste.local', { exact: true })).toBeVisible()
  await popup.getByRole('button', { name: 'Gerar pessoa' }).click()
  await expect(
    popup.getByRole('heading', { name: 'Ainda não há pessoa de teste' }),
  ).toBeHidden()

  const pessoa = await pessoaGuardada(sw)
  if (!pessoa) throw new Error('o "Gerar pessoa" não guardou ninguém')
  await expect(
    popup.getByRole('heading', { level: 1, name: pessoa.nome.completo }),
  ).toBeVisible()
  await expect(popup.locator('kbd').first()).toHaveText(/⌥⇧P|Alt\+Shift\+P/)

  await popup.getByRole('button', { name: /Preencher esta página/ }).click()
  await expect(aba.locator('input[name="cpf"]')).toHaveValue(pessoa.cpf)
  await expect(aba.locator('piluvitu-aviso .titulo')).toHaveText(
    '1 de 1 campo preenchido',
  )
  await expect(
    popup.getByRole('heading', { level: 1, name: pessoa.nome.completo }),
  ).toBeVisible()
})
```

```bash
cd apps/extensao && ./node_modules/.bin/playwright test src/entrypoints/popup/popup.e2e.ts; echo "exit=$?"
```

Esperado: `1 passed`, `exit=0`.

- [ ] **Step 4: Páginas de teste**

Copie a página do laboratório:

```bash
cp docs/superpowers/research/2026-10-01-extensao-dados-teste/deteccao/paginas/cadastro.html apps/extensao/src/entrypoints/preencher.content/cadastro.pagina.html; echo "exit=$?"
```

Em `cadastro.pagina.html`, faça exatamente estas três trocas:

1. A linha do Estado (`<label>Estado <select name="estado">…São Paulo…Rio de Janeiro…</select></label>`) vira:

```html
<label
  >Estado
  <select name="estado">
    <option value="">--</option>
    <option value="12" data-uf="AC">Acre</option>
    <option value="27" data-uf="AL">Alagoas</option>
    <option value="16" data-uf="AP">Amapá</option>
    <option value="13" data-uf="AM">Amazonas</option>
    <option value="29" data-uf="BA">Bahia</option>
    <option value="23" data-uf="CE">Ceará</option>
    <option value="53" data-uf="DF">Distrito Federal</option>
    <option value="32" data-uf="ES">Espírito Santo</option>
    <option value="52" data-uf="GO">Goiás</option>
    <option value="21" data-uf="MA">Maranhão</option>
    <option value="51" data-uf="MT">Mato Grosso</option>
    <option value="50" data-uf="MS">Mato Grosso do Sul</option>
    <option value="31" data-uf="MG">Minas Gerais</option>
    <option value="15" data-uf="PA">Pará</option>
    <option value="25" data-uf="PB">Paraíba</option>
    <option value="41" data-uf="PR">Paraná</option>
    <option value="26" data-uf="PE">Pernambuco</option>
    <option value="22" data-uf="PI">Piauí</option>
    <option value="33" data-uf="RJ">Rio de Janeiro</option>
    <option value="24" data-uf="RN">Rio Grande do Norte</option>
    <option value="43" data-uf="RS">Rio Grande do Sul</option>
    <option value="11" data-uf="RO">Rondônia</option>
    <option value="14" data-uf="RR">Roraima</option>
    <option value="42" data-uf="SC">Santa Catarina</option>
    <option value="35" data-uf="SP">São Paulo</option>
    <option value="28" data-uf="SE">Sergipe</option>
    <option value="17" data-uf="TO">Tocantins</option>
  </select></label
>
```

(Valores numéricos do IBGE e texto por extenso, como o lab: o `escolherOpcao` precisa achar a UF pelo nome. O `data-uf` é da página de teste, não da extensão.)

2. O select do ano (`<select name="ano"><option value="">Ano</option><option>2026</option>…<option>2030</option></select></label>`) vira:

```html
<select name="ano"><option value="">Ano</option></select></label>
```

3. O bloco `<script type="module">…IMask…</script>` vira:

```html
<script>
  function mascarar(campo, formato) {
    campo.addEventListener('input', () => {
      const digitos = campo.value.replace(/\D/g, '')
      let i = 0
      campo.value = formato
        .replace(/0/g, () => digitos[i++] ?? '')
        .replace(/\D+$/, '')
    })
  }
  mascarar(document.getElementById('cpf'), '000.000.000-00')
  mascarar(document.getElementById('cep'), '00000-000')
  const ano = document.querySelector('select[name="ano"]')
  const atual = new Date().getFullYear()
  for (let a = atual; a <= atual + 10; a++) ano.add(new Option(String(a)))
</script>
```

Confira as trocas:

```bash
cd apps/extensao/src/entrypoints/preencher.content && /usr/bin/grep -c 'data-uf=' cadastro.pagina.html && ! /usr/bin/grep -qE 'IMask|/vue/' cadastro.pagina.html && /usr/bin/grep -q 'mascarar(document.getElementById' cadastro.pagina.html; echo "exit=$?"
```

Esperado: `1` (as 27 opções estão numa linha) e `exit=0`.

`apps/extensao/src/entrypoints/preencher.content/react.pagina.html`:

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Cadastro em React</title>
  </head>
  <body>
    <div id="raiz"></div>
    <label>CEP <input name="cep" id="cep" /></label>
    <output id="cep-validado"></output>
    <div
      id="nota"
      contenteditable="true"
      aria-label="Observações"
      style="min-height: 24px; border: 1px solid #999"
    ></div>
    <script>
      document.getElementById('cep').addEventListener('blur', () => {
        document.getElementById('cep-validado').textContent = 'validado'
      })
    </script>
    <script type="module" src="/react.pagina.js"></script>
  </body>
</html>
```

`apps/extensao/src/entrypoints/preencher.content/react.pagina.tsx` (CPF controlado com `maxLength={11}` e máscara que reformata; e-mail com `onBlur`, o mesmo mecanismo do `register` do react-hook-form em `mode: 'onBlur'`; celular controlado que recusa qualquer valor):

```tsx
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

const mascararCpf = (valor: string) =>
  valor
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')

function Formulario() {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [emailTocado, setEmailTocado] = useState(false)
  const [cpf, setCpf] = useState('')
  return (
    <form>
      <label>
        Nome completo{' '}
        <input
          name="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </label>
      <label>
        E-mail{' '}
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTocado(true)}
        />
      </label>
      <label>
        CPF{' '}
        <input
          name="cpf"
          maxLength={11}
          value={cpf}
          onChange={(e) => setCpf(mascararCpf(e.target.value))}
        />
      </label>
      <label>
        Celular <input name="celular" value="" onChange={() => undefined} />
      </label>
      <output id="estado">
        {JSON.stringify({ nome, email, emailTocado, cpf })}
      </output>
    </form>
  )
}

const raiz = document.getElementById('raiz')
if (raiz) createRoot(raiz).render(<Formulario />)
```

- [ ] **Step 5: E2E do preenchimento e do Inserir**

`apps/extensao/src/entrypoints/preencher.content/preencher.e2e.ts`:

```ts
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'
import type { RespostaPreencher } from '../../lib/mensagens'
import {
  abrirPopup,
  enviarMensagem,
  expect,
  idDaAba,
  ORIGEM,
  pessoaGuardada,
  servir,
  test,
  type Rota,
} from '../../test/extensao.fixture'

const lerPagina = (arquivo: string) =>
  readFileSync(new URL(arquivo, import.meta.url), 'utf8')
const CADASTRO = lerPagina('./cadastro.pagina.html')
const REACT = lerPagina('./react.pagina.html')
const SIMPLES =
  '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf" style="outline: 3px dotted rgb(255, 0, 0)"></label><label>Código de indicação <input name="ref_code"></label>'
const CIANO = 'rgb(56, 189, 248)'
const AMBAR = 'rgb(245, 184, 46)'

// O React 19 não publica build UMD: a página React é empacotada aqui, em memória, com o Vite do próprio app.
let scriptReact: Promise<string> | undefined
async function empacotarReact(): Promise<string> {
  const saida = await build({
    configFile: false,
    logLevel: 'silent',
    root: import.meta.dirname,
    plugins: [react()],
    define: { 'process.env.NODE_ENV': '"production"' },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(new URL('./react.pagina.tsx', import.meta.url)),
        formats: ['es'],
        fileName: 'react.pagina',
      },
    },
  })
  const resultado = Array.isArray(saida) ? saida[0] : saida
  if (!('output' in resultado))
    throw new Error('o build da página React não devolveu código')
  return resultado.output[0].code
}

async function paginaReact(): Promise<Record<string, Rota>> {
  scriptReact ??= empacotarReact()
  return {
    '/react': { corpo: REACT },
    '/react.pagina.js': { corpo: await scriptReact, tipo: 'text/javascript' },
  }
}

async function pessoaDaExtensao(sw: Parameters<typeof pessoaGuardada>[0]) {
  const pessoa = await pessoaGuardada(sw)
  if (!pessoa) throw new Error('a extensão não guardou a pessoa')
  return pessoa
}

test('cadastro realista: 21 de 23, aviso, contornos, valores da pessoa e honeypot intocado', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/cadastro': { corpo: CADASTRO } })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/cadastro`)
  const tabId = await idDaAba(sw, `${ORIGEM}/cadastro`)
  const popup = await abrirPopup(context, extensionId)

  const resposta = (await enviarMensagem(popup, {
    tipo: 'preencher',
    tabId,
  })) as RespostaPreencher

  // Aviso e contornos primeiro: os dois somem sozinhos depois de 4 s.
  await expect(aba.locator('piluvitu-aviso .titulo')).toHaveText(
    '21 de 23 campos preenchidos',
  )
  await expect(aba.locator('piluvitu-aviso .linha2 .warn')).toHaveText(
    '2 não reconhecidos',
  )
  await expect(aba.locator('input[name="nome"]')).toHaveCSS(
    'outline-color',
    CIANO,
  )
  await expect(aba.locator('input[name="ref_code"]')).toHaveCSS(
    'outline-style',
    'dashed',
  )
  await expect(aba.locator('input[name="ref_code"]')).toHaveCSS(
    'outline-color',
    AMBAR,
  )
  await expect(aba.locator('input[name="b_7f3e_honeypot"]')).toHaveCSS(
    'outline-style',
    'none',
  )

  expect(resposta).toMatchObject({
    ok: true,
    resumo: {
      x: 21,
      y: 23,
      k: 2,
      contentType: 'text/html',
      iframesDeFora: 0,
      naoReconhecidos: [
        { rotulo: 'Código de indicação', seletor: 'input[name="ref_code"]' },
        { rotulo: 'Como nos conheceu?', seletor: 'select#origem' },
      ],
    },
  })

  const p = await pessoaDaExtensao(sw)
  const esperado: Record<string, string> = {
    nome: p.nome.completo,
    nascimento: p.nascimento.br,
    email: p.email.endereco,
    email2: p.email.endereco,
    cpf: p.cpf,
    cel: p.celular.formatado,
    senha: p.senha,
    senha2: p.senha,
    sexo: p.nome.sexo,
    cep: p.endereco.cep,
    logradouro: p.endereco.logradouro,
    numero: p.endereco.numero,
    complemento: p.endereco.complemento,
    bairro: p.endereco.bairro,
    cidade: p.endereco.cidade,
    cc: p.cartao.numeroFormatado,
    ccname: p.cartao.titular,
    mes: p.cartao.mes,
    ano: `20${p.cartao.ano}`,
    cvv: p.cartao.cvv,
    ref_code: '',
    b_7f3e_honeypot: '',
    csrf: 'x',
    q: '',
  }
  for (const [nome, valor] of Object.entries(esperado)) {
    await expect(aba.locator(`[name="${nome}"]`)).toHaveValue(valor)
  }
  await expect(
    aba.locator('select[name="estado"] option:checked'),
  ).toHaveAttribute('data-uf', p.endereco.uf)
  await expect(aba.locator('#origem')).toHaveValue('')
  await expect(aba.locator('input[name="termos"]')).not.toBeChecked()
})

test('React controlado, máscara e validação no blur enxergam o valor, sem roubar o foco', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, await paginaReact())
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/react`)
  await expect(aba.locator('input[name="nome"]')).toBeVisible()
  const tabId = await idDaAba(sw, `${ORIGEM}/react`)
  const popup = await abrirPopup(context, extensionId)

  const resposta = (await enviarMensagem(popup, {
    tipo: 'preencher',
    tabId,
  })) as RespostaPreencher
  const p = await pessoaDaExtensao(sw)

  expect(resposta).toMatchObject({
    ok: true,
    resumo: {
      x: 4,
      y: 5,
      k: 1,
      naoReconhecidos: [
        {
          rotulo: 'Celular (recusou o valor)',
          seletor: 'input[name="celular"]',
        },
      ],
    },
  })
  await expect(aba.locator('#estado')).toHaveText(
    JSON.stringify({
      nome: p.nome.completo,
      email: p.email.endereco,
      emailTocado: true,
      cpf: p.cpf,
    }),
  )
  await expect(aba.locator('input[name="cpf"]')).toHaveValue(p.cpf)
  await expect(aba.locator('input[name="celular"]')).toHaveValue('')
  await expect(aba.locator('#cep-validado')).toHaveText('validado')
  expect(await aba.evaluate(() => document.activeElement?.tagName)).toBe('BODY')
})

test('dois preenchimentos seguidos deixam um aviso só e devolvem o outline original do site', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, { '/simples': { corpo: SIMPLES } })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/simples`)
  const tabId = await idDaAba(sw, `${ORIGEM}/simples`)
  const popup = await abrirPopup(context, extensionId)

  await enviarMensagem(popup, { tipo: 'preencher', tabId })
  await enviarMensagem(popup, { tipo: 'preencher', tabId })
  await expect(aba.locator('piluvitu-aviso')).toHaveCount(1)
  await expect(aba.locator('input[name="cpf"]')).toHaveCSS(
    'outline-style',
    'solid',
  )

  await aba.bringToFront()
  await aba.locator('input[name="ref_code"]').click()
  await expect(aba.locator('input[name="cpf"]')).toHaveCSS(
    'outline-style',
    'dotted',
  )
  await expect(aba.locator('input[name="cpf"]')).toHaveCSS(
    'outline-color',
    'rgb(255, 0, 0)',
  )
})

test('em site com CSP estrita o aviso continua com o próprio estilo', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, {
    '/csp': {
      corpo:
        '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf"></label>',
      cabecalhos: {
        'Content-Security-Policy': "default-src 'none'; style-src 'self'",
      },
    },
  })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/csp`)
  const tabId = await idDaAba(sw, `${ORIGEM}/csp`)
  const popup = await abrirPopup(context, extensionId)

  await enviarMensagem(popup, { tipo: 'preencher', tabId })
  const aviso = aba.locator('piluvitu-aviso .toast')
  await expect(aviso).toHaveCSS('width', '300px')
  await expect(aviso).toHaveCSS('border-top-left-radius', '14px')
  await expect(aba.locator('input[name="cpf"]')).toHaveCSS(
    'outline-style',
    'solid',
  )
})

test('iframe da mesma origem: campos somados e aviso só no topo', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, {
    '/com-quadro': {
      corpo:
        '<!doctype html><meta charset="utf-8"><label>Nome completo <input name="nome"></label><iframe src="/quadro" style="width: 400px; height: 120px"></iframe>',
    },
    '/quadro': {
      corpo:
        '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf"></label>',
    },
  })
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/com-quadro`)
  await expect(
    aba.frameLocator('iframe').locator('input[name="cpf"]'),
  ).toBeVisible()
  const tabId = await idDaAba(sw, `${ORIGEM}/com-quadro`)
  const popup = await abrirPopup(context, extensionId)

  const resposta = (await enviarMensagem(popup, {
    tipo: 'preencher',
    tabId,
  })) as RespostaPreencher
  const p = await pessoaDaExtensao(sw)

  expect(resposta).toMatchObject({
    ok: true,
    resumo: { x: 2, y: 2, k: 0, iframesDeFora: 0 },
  })
  await expect(aba.locator('input[name="nome"]')).toHaveValue(p.nome.completo)
  await expect(
    aba.frameLocator('iframe').locator('input[name="cpf"]'),
  ).toHaveValue(p.cpf)
  await expect(aba.locator('piluvitu-aviso .titulo')).toHaveText(
    '2 de 2 campos preenchidos',
  )
  await expect(aba.locator('piluvitu-aviso .linha2')).toHaveCount(0)
  await expect(
    aba.frameLocator('iframe').locator('piluvitu-aviso'),
  ).toHaveCount(0)
})

// spec §6.3: o executeScript com allFrames pula em silêncio o frame sem permissão, e o topo conta quantos ficaram.
test('iframe de outro domínio fica de fora sem erro e é contado no topo', async ({
  context,
  sw,
  extensionId,
}) => {
  await servir(context, {
    '/com-quadro-de-fora': {
      corpo:
        '<!doctype html><meta charset="utf-8"><label>Nome completo <input name="nome"></label><iframe src="http://outro.local/quadro" style="width: 400px; height: 120px"></iframe>',
    },
  })
  await context.route('http://outro.local/**', (rota) =>
    rota.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf"></label>',
    }),
  )
  const aba = await context.newPage()
  await aba.goto(`${ORIGEM}/com-quadro-de-fora`)
  await expect(
    aba.frameLocator('iframe').locator('input[name="cpf"]'),
  ).toBeVisible()
  const tabId = await idDaAba(sw, `${ORIGEM}/com-quadro-de-fora`)
  const popup = await abrirPopup(context, extensionId)

  const resposta = (await enviarMensagem(popup, {
    tipo: 'preencher',
    tabId,
  })) as RespostaPreencher

  expect(resposta).toMatchObject({
    ok: true,
    resumo: { x: 1, y: 1, k: 0, iframesDeFora: 1 },
  })
  await expect(aba.locator('input[name="nome"]')).not.toHaveValue('')
  await expect(
    aba.frameLocator('iframe').locator('input[name="cpf"]'),
  ).toHaveValue('')
})

test.describe('Inserir (costura e2e da mensagem)', () => {
  test('escreve no campo focado o valor formatado para ele', async ({
    context,
    sw,
    extensionId,
  }) => {
    await servir(context, { '/cadastro': { corpo: CADASTRO } })
    const aba = await context.newPage()
    await aba.goto(`${ORIGEM}/cadastro`)
    const tabId = await idDaAba(sw, `${ORIGEM}/cadastro`)
    const popup = await abrirPopup(context, extensionId)
    await aba.bringToFront()
    await aba.locator('input[name="ref_code"]').focus()

    await enviarMensagem(popup, {
      tipo: 'inserir',
      tabId,
      frameId: 0,
      kind: 'cpf',
    })

    const p = await pessoaDaExtensao(sw)
    await expect(aba.locator('input[name="ref_code"]')).toHaveValue(p.cpf)
    await expect(aba.locator('input[name="cpf"]')).toHaveValue('')
  })

  test('em contenteditable insere o texto no cursor', async ({
    context,
    sw,
    extensionId,
  }) => {
    await servir(context, await paginaReact())
    const aba = await context.newPage()
    await aba.goto(`${ORIGEM}/react`)
    const tabId = await idDaAba(sw, `${ORIGEM}/react`)
    const popup = await abrirPopup(context, extensionId)
    await aba.bringToFront()
    await aba.locator('#nota').focus()

    await enviarMensagem(popup, {
      tipo: 'inserir',
      tabId,
      frameId: 0,
      kind: 'email',
    })

    const p = await pessoaDaExtensao(sw)
    await expect(aba.locator('#nota')).toHaveText(p.email.endereco)
  })
})
```

- [ ] **Step 6: Rodar o E2E inteiro**

```bash
pnpm --filter @piluvitu/extensao test:e2e; echo "exit=$?"
```

Esperado: `12 passed`, `exit=0` (o script refaz o build de produção, o build e2e e roda tudo). Se o caso do contenteditable falhar, é falha real do produto (a pesquisa só verificou o foco do botão direito em contenteditable, não o `execCommand`): depure com `superpowers:systematic-debugging`, não apague o teste.

- [ ] **Step 7: Provar que o E2E mede de verdade (mutação desfeita)**

Sem os eventos `input` **e** `change`, o React não pode enxergar o valor. Tirar só o `input` não serve de mutação: o `ChangeEventPlugin` do React trata o `change` de um input de texto do mesmo jeito (medido: com só o `input` removido o teste "React controlado" continua passando).

```bash
cd apps/extensao && cp src/entrypoints/preencher.content/dom.ts "$TMPDIR/dom.ts.bak" \
  && /usr/bin/grep -v -e "new Event('input', bolha)" -e "new Event('change', bolha)" "$TMPDIR/dom.ts.bak" > src/entrypoints/preencher.content/dom.ts \
  && /usr/bin/wc -l "$TMPDIR/dom.ts.bak" src/entrypoints/preencher.content/dom.ts \
  && pnpm run build:e2e && ./node_modules/.bin/playwright test src/entrypoints/preencher.content/preencher.e2e.ts -g "React controlado"; echo "exit=$?"
cd apps/extensao && cp "$TMPDIR/dom.ts.bak" src/entrypoints/preencher.content/dom.ts && cmp src/entrypoints/preencher.content/dom.ts "$TMPDIR/dom.ts.bak" \
  && pnpm run build:e2e && ./node_modules/.bin/playwright test src/entrypoints/preencher.content/preencher.e2e.ts -g "React controlado"; echo "exit=$?"
```

Esperado: o `wc -l` mostra o `dom.ts` mutado com exatamente 2 linhas a menos; primeiro `exit=1` (sem os eventos o React não vê nada: o celular controlado não é desfeito, então o resumo sai `x: 5, k: 0`, e o `#estado` fica vazio); depois `exit=0`, com o `dom.ts` idêntico ao original.

- [ ] **Step 8: Lint e commit**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
/usr/bin/git add apps/extensao/playwright.config.ts apps/extensao/manifesto.e2e.ts apps/extensao/src/test/extensao.fixture.ts \
  apps/extensao/src/entrypoints/background/menus.e2e.ts apps/extensao/src/entrypoints/popup/popup.e2e.ts \
  apps/extensao/src/entrypoints/preencher.content/preencher.e2e.ts apps/extensao/src/entrypoints/preencher.content/cadastro.pagina.html \
  apps/extensao/src/entrypoints/preencher.content/react.pagina.html apps/extensao/src/entrypoints/preencher.content/react.pagina.tsx \
  && /usr/bin/git commit -m "test(extensao): E2E com a extensão desempacotada (cadastro, React, CSP, iframe, Inserir, popup e manifesto)"; echo "exit=$?"
```

---

### Task 17: `apps/extensao/CLAUDE.md`, verificação final e checklist manual

**Files:**

- Create: `apps/extensao/CLAUDE.md`

O `CLAUDE.md` do app guarda os porquês medidos que saíram do código (lei de comentários da raiz), o checklist manual da spec §12 e os riscos da §13. **Não escreva nele o nome da classe sentinela do gate**: o Tailwind deste app varre os `.md` também, e o literal escrito aqui faria o gate aprovar `@source` quebrado.

**Interfaces:**

- Consumes: tudo das Tasks 1–16.
- Produces: documentação; nenhum código.

- [ ] **Step 1: Escrever `apps/extensao/CLAUDE.md`**

````markdown
# CLAUDE.md — `apps/extensao` (`@piluvitu/extensao`)

Extensão Chrome MV3 **"piluvitu · dados de teste"**. O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz. Spec: `docs/superpowers/specs/2026-10-01-extensao-dados-teste-design.md`. Contrato de nomes entre as fases: `docs/superpowers/plans/2026-10-01-extensao-interfaces.md`. Pesquisa (protótipos, medições e relatórios): `docs/superpowers/research/2026-10-01-extensao-dados-teste/`.

## O que faz

Gera uma pessoa brasileira de teste (falsa, coerente, documentos com dígito verificador certo, CEP real com rua e cidade certas, cartão de teste documentado da Stripe) e preenche o formulário da aba atual:

- **Modo A, a página inteira:** `Alt+Shift+P` (comando `preencher-pagina`, `⌥⇧P` no Mac), o botão "Preencher esta página" do popup ou o item "Preencher esta página" do menu de contexto.
- **Modo B, um campo:** botão direito no campo → `piluvitu · dados de teste › Inserir › CPF / E-mail / CEP…`, para o que a detecção errar.

Distribuição: só o dono, carregada sem empacotar a partir de `.output/chrome-mv3`. Fora: Firefox, `wxt zip`, Chrome Web Store.

## Fronteira

Geração, classificação de campo e formatação de valor são lógica pura em `@piluvitu/tools` (`pessoa`, `campos`, `campos-formatar` e os geradores; ver `packages/tools/CLAUDE.md`). A extensão é a casca: injeta o script, varre o DOM, escreve, lê de volta, contorna, desenha o aviso e mostra o popup.

## Estrutura

```
src/entrypoints/background/       orquestra: atalho, menu, mensagens do popup, injeção, soma dos frames
src/entrypoints/popup/            React + @piluvitu/ui (1a e 1b nesta fase)
src/entrypoints/preencher.content/ registration 'runtime': instala a API __pv (camada DOM + aviso 1f)
src/components/                   componentes de apresentação do popup (+ .stories.tsx + .test.tsx)
src/lib/                          armazenamento, menus, mensagens, páginas proibidas, soma dos frames, textos, data de hoje
src/test/                         setup do Vitest, pessoa dourada, layout falso do jsdom, fixture do Playwright
```

**Todo entrypoint é pasta** (`background/index.ts`, `popup/index.html`, `preencher.content/index.ts`). O WXT trata qualquer arquivo solto em `src/entrypoints/` como entrypoint: um `background.test.ts` ali quebra o build ("Multiple entrypoints with the same name"). Dentro da pasta, só `index.*` é entrypoint; testes, stories, E2E e as páginas de teste (`*.pagina.html`) moram ao lado.

## Fluxos

- **Preencher (modo A), sempre no background** (se o popup fechasse no meio, perderia a resposta): `obterOuGerarPessoa()` → injeta `/content-scripts/preencher.js` em `allFrames` → `executeScript({func, args})` chama `__pv.preencher(pessoa, hojeISO)` em cada frame → `somarFrames` (ignora frame que devolveu `null`) → `__pv.aviso(...)` só no frame 0 → devolve `RespostaPreencher` ao popup. Com Y = 0 não há aviso nesta fase (a fase 3 acrescenta "Nenhum campo nesta página").
- **Por que injetar e depois chamar `func`:** a injeção por arquivo não aceita argumentos. O `main()` do content script só (re)instala `globalThis.__pv` ligado ao `ctx` atual; as ações vêm por `func` + `args`.
- **Reinjeção é o mecanismo, não um efeito colateral:** toda ação injeta de novo; o WXT invalida a instância anterior (o aviso, os timers e os contornos saem por `ctx.onInvalidated`). Por isso dois `Alt+Shift+P` seguidos nunca empilham avisos, e o `outline` original do site volta antes de a nova instância salvar o "original" dela. "Mostrar na página" **não** reinjeta, para não perder o registro de campos (`Map<idx, WeakRef>` no mundo isolado; nenhum `data-*` vai para o DOM do site).
- **Mostrar na página (`__pv.mostrar(idx)`):** usado pelo texto âmbar do aviso (e, a partir da fase 3, pela mira do 1c). Rola com `scrollIntoView({block: 'center'})`, **sem** `smooth` (a rolagem animada não anda com a aba em segundo plano), e o contorno pisca âmbar/transparente por 1 s e volta ao contorno que o campo deve ter naquele momento (o do preenchimento se o aviso ainda está na tela, o original do site se ele já saiu). O `limpar` restaura também o campo que está piscando: uma reinjeção no meio do pisco cancela os timers, e sem isso o campo ficaria com a cor do pisco e a instância nova a salvaria como "outline original".
- **Inserir (modo B):** o Chrome não diz qual elemento recebeu o clique, mas o botão direito foca o campo. O background injeta só no `info.frameId` e chama `__pv.inserir(pessoa, kind)`, que acha o `activeElement` mais fundo (atravessando shadow roots abertas e fechadas) e escreve o `valorPara(kind, …)` daquele campo (um `type=date` recebe `aaaa-mm-dd`). Em contenteditable usa `execCommand('insertText')`.
- **Mensagens:** `runtime.onMessage` responde com `sendResponse` + `return true` literal, **nunca Promise**: o Chrome só aceita Promise ali a partir do 148, e o Chromium do Playwright 1.59.1 é o 147. A mensagem `inserir` só é aceita no build `--mode e2e`.
- **Sem pessoa:** atalho, menu, Inserir e "Abrir caixa de entrada" geram e guardam uma antes de agir (o rodapé do 1a promete isso).
- **Menus:** `removeAll()` + recria em `runtime.onInstalled` e em `runtime.onStartup`. "Preencher", separadores, "Nova pessoa" e "Abrir caixa" em `['page', 'editable']` (o padrão `['page']` não aparece quando se clica num campo editável); `Inserir ›` e os 23 itens em `['editable']`. Com mais de um item visível o Chrome agrupa tudo sob o `name` do manifesto, por isso o nome é exatamente `piluvitu · dados de teste`. Os títulos `CPF · …` e `CEP · …` acompanham `pessoaItem.watch`.
- **Armazenamento:** `local:pessoa` guarda a pessoa inteira (não a semente: trocar uma lista de nomes não muda a pessoa já gerada), `version: 1`. Política: qualquer bump futuro migra para `null` e o usuário gera outra (é dado falso, não há nada a preservar). Nada em `sync:`. `hojeISO` é o dia civil de `America/Sao_Paulo`; a idade do popup é recalculada a partir de `nascimento.iso`.
- **Página proibida:** o popup decide só pela URL (`chrome:`, `chrome-extension:`, `edge:`, `about:`, `view-source:`, `devtools:`, `data:`, Chrome Web Store; `file:` sem "Permitir acesso a URLs de arquivo"). O activeTab sempre libera a URL da aba, sem a permissão `tabs`. O leitor de PDF só é detectado quando um "Preencher" falha (`contentType === 'application/pdf'` no frame 0 ou erro `Cannot access …` do `executeScript`).

## Escrita no DOM (o porquê de cada regra)

- **Mundo ISOLATED + setter nativo do protótipo + `input`/`change` com `{bubbles: true, composed: true}`**: medido no laboratório em React 19/18, react-hook-form, Vue 3, imask, react-imask, maska, @react-input/mask, react-number-format e jQuery Mask. No mundo MAIN uma atribuição simples quebra o React (o rastreador de valor engole o `onChange`).
- **Foco sintético, nunca `el.focus()`/`el.blur()`**: com o popup aberto a página não tem foco, e assim popup, atalho e menu seguem o mesmo caminho. Validadores de `blur` e o `onBlur` do React (que escuta `focusout`) recebem os eventos sintéticos: coberto no E2E de `react.pagina.tsx`.
- **Nunca caractere a caractere**: quebra o @react-input/mask e embaralha o jQuery Mask.
- **`maxlength` decide antes de escrever**: escrita por script não respeita `maxlength`. O `valorPara` escolhe o formato que cabe; se nada cabe (senha de 12 num `maxlength=6`), o campo vai para "recusados" sem ser escrito nem truncado.
- **Valor igual não é escrito de novo**: evita disparar outra vez a busca de CEP do site.
- **Lê de volta**: se nem o valor nem os dígitos batem, o campo vai para "recusados" (o rótulo ganha " (recusou o valor)").
- **Visibilidade**: `checkVisibility({opacityProperty, visibilityProperty, contentVisibilityAuto})`, ancestral `aria-hidden` (o honeypot do Mailchimp), menos de 2 px, fora do documento. `<select>` escondido conta: o select2 escuta o `change` dele.

## Aviso na página (1f)

CSS próprio em px (`preencher.content/aviso.css`, variáveis `--pv-*` com os valores dos tokens copiados), DOM puro (`aviso-dom.ts`, sem React e sem `innerHTML`), montado por `createShadowRootUi(ctx, { name: 'piluvitu-aviso', position: 'inline', anchor: 'html', css })` só no frame 0. **Não usa `@piluvitu/ui` nem Tailwind** porque, medido numa página hostil: o `--primary` do site vazou para dentro do aviso (os tokens do pacote estão em `:root`/`.dark`, nunca em `:host`); o `rem` seguiu o `font-size` do site; `@property` não funciona em shadow root; e o WXT move `@property`/`@font-face` para o `<head>` do site (wxt#1955). `anchor: 'html'` para um `transform` no `body` do site não capturar o `position: fixed`. Contornos: ciano sólido `#38bdf8` e âmbar tracejado `#f5b82e` com `!important`; o contraste sobre branco é baixo (2,1:1 e 1,8:1) e fica assim (ferramenta de dev, quem carrega a informação é o aviso). Saem com o aviso ou no primeiro `pointerdown`/`focusin` **do usuário** (`isTrusted`) num campo; frames filhos limpam sozinhos em 4 s.

## Popup

- `html, body { width: 380px }`, shell com `max-h-[600px]`, meio rolando e chips `sticky`.
- O Chrome injeta `body { font: 12px system-ui }` nas páginas de extensão **fora de `@layer`**, o que vence o `@layer base` do Tailwind: por isso a regra do `body` em `src/styles.css` fica fora de `@layer`, com `line-height: normal` (é o que faz a altura bater com o design).
- `tema.ts` é o primeiro import de `main.tsx` (o CSP do MV3 não aceita script inline no `<head>`); o tema segue o `prefers-color-scheme`, sem botão.
- O `Button` do `@piluvitu/ui` não tem `gap`: toda chamada com ícone leva `gap-2`; no `sm`, `rounded-[14px] text-[13px]`.
- Fontes empacotadas por fontsource (`--font-plus-jakarta`/`--font-jetbrains` apontando para as famílias "Variable"); Font Awesome com `config.autoAddCss = false` e o CSS importado no `styles.css`.
- O atalho exibido vem de `commands.getAll()`; vazio (tecla tomada por outro app) ⇒ o rodapé vira "definir atalho" e o chip do botão some.

## Stack e configuração (armadilhas medidas)

- **`@vitejs/plugin-react` 5 direto, sem `@wxt-dev/module-react`**: o módulo puxa o plugin 6, que exige Vite 8, e o build quebra com `ERR_PACKAGE_PATH_NOT_EXPORTED './internal'` no Vite 7 do repo.
- **`imports: false`**: tudo é importado explicitamente (`wxt/browser`, `wxt/utils/storage`, `wxt/utils/define-*`).
- **`wxt prepare &&` na frente de `lint`, `test` e `storybook`, nunca `postinstall`**: um `postinstall` que falhe derruba o `pnpm install` de **todos** os jobs do CI (e o deploy do finanças espera o CI).
- **`tsconfig.json`**: `jsx: react-jsx` (o gerado não traz) e `noUncheckedIndexedAccess: false` (o código cru de `@piluvitu/tools` não passa com essa flag, que o tsconfig gerado liga).
- **Content script**: `registration: 'runtime'` (nunca vai para `content_scripts`; sem `matches`, porque em runtime o WXT copiaria os `matches` para `host_permissions`); `cssInjectionMode: 'manual'` (com `'ui'` e sem `matches` o WXT declara o CSS em `web_accessible_resources` com `matches: []` e o Chrome recusa carregá-lo); `noScriptStartedPostMessage: true` (nenhum `postMessage` chega ao site em teste).
- **Gate do design system**: o `build` roda `check-tailwind-source.mjs` contra a pasta exata `.output/chrome-mv3`, nunca `.output` inteira (um `chrome-mv3-e2e` antigo tem o CSS de outro build e dá falso positivo). `@source not '../.output'` no `styles.css` **e** as linhas do `.gitignore` da raiz: sem elas o Tailwind colhe classes de builds antigos e o gate aprova `@source` quebrado. Não escreva o nome da classe sentinela em nenhum arquivo deste app; referencie `SENTINEL_SELECTOR` do script.
- **Modo e2e**: `wxt build --mode e2e` gera `.output/chrome-mv3-e2e` com `host_permissions: ['http://teste.local/*']`; o manifesto de produção nem tem a chave (o E2E `manifesto.e2e.ts` garante).
- **Dev**: `make dev-extensao` (porta 3018; `dev.reloadCommand: false` libera um dos 4 atalhos). O `wxt dev` acrescenta a permissão `tabs` e `host_permissions` de localhost: injeção funciona sem gesto em dev e esconde bug de activeTab. Comportamento real só com `make build-extensao` + carregar sem empacotar.

## Testes

| Camada                                                             | Ferramenta                                       | Onde                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------- |
| Lógica da extensão, background, componentes, DOM do content script | **Vitest** + `WxtVitest` + `fakeBrowser` + jsdom | `*.test.ts(x)` ao lado do fonte; `make test-extensao` |
| Estados visuais                                                    | **Storybook react-vite** próprio, porta 6018     | `*.stories.tsx` ao lado; `make storybook-extensao`    |
| Fluxos críticos                                                    | **Playwright** com a extensão desempacotada      | `*.e2e.ts` ao lado; `make test-e2e-extensao`          |

- **Vitest, e não Jest**, como no finanças: o WXT é Vite e o `fakeBrowser` vem pronto. Ele não implementa `contextMenus`, `commands`, `scripting`, `dom` nem `extension.isAllowedFileSchemeAccess`: os testes trocam essas funções por stubs com `Object.assign(fakeBrowser.<api>, …)`. O jsdom não tem layout, `checkVisibility`, `CSS.escape`, `isContentEditable` nem `execCommand`: `src/test/layout.ts` simula o layout, `src/test/setup.ts` dá o `CSS.escape`, e contenteditable fica no E2E.
- **Um segundo Storybook**: o do `apps/web` é webpack/Next e não enxerga o Tailwind deste app. As stories são só de props (sem `browser.*`), nos temas claro e escuro (barra "Tema" ou `globals: { tema: 'claro' }`). A story do aviso o monta numa página hostil.
- **Playwright**: `channel: 'chromium'` (sem ele o headless não carrega extensão; Chrome e Edge de marca removeram o `--load-extension`); páginas servidas por `context.route` em `http://teste.local`; a página React é empacotada pelo Vite em memória dentro do teste (o React 19 não publica UMD). Costuras só do build e2e: o popup aceita `?aba=<tabId>` (aberto como aba ele se enxerga como a aba ativa) e o background aceita a mensagem `{tipo: 'inserir'}`. Atalho e menu nativo não dá para acionar pelo Playwright: ficam nos testes Vitest dos handlers (`ouvintes.test.ts`).
- Os testes rodam no host, como nos outros workspaces: o repo não tem devcontainer.

## Comandos

| Comando                                 | O quê                                                 |
| --------------------------------------- | ----------------------------------------------------- |
| `make dev-extensao`                     | `wxt dev` na 3018 (carregar `.output/chrome-mv3-dev`) |
| `make build-extensao`                   | `wxt build` + gate em `.output/chrome-mv3`            |
| `make test-extensao`                    | Vitest                                                |
| `make test-e2e-extensao`                | build + build e2e + Playwright                        |
| `make storybook-extensao`               | Storybook na 6018                                     |
| `pnpm --filter @piluvitu/extensao lint` | `wxt prepare` + `tsc --noEmit` + `eslint .`           |

## Checklist manual (primeira carga sem empacotar, e a cada mudança em injeção, menu ou atalho)

1. `make build-extensao` e, em `chrome://extensions` (modo do desenvolvedor), "Carregar sem compactação" apontando para `apps/extensao/.output/chrome-mv3`.
2. Página de teste: `cd apps/extensao/src/entrypoints/preencher.content && python3 -m http.server 8019` e abrir `http://localhost:8019/cadastro.pagina.html`.
3. O gesto real que concede o activeTab, um de cada vez, recarregando a página entre eles:
   - clique no ícone → "Gerar pessoa" (se for a primeira vez) → "Preencher esta página": o aviso mostra "21 de 23 campos preenchidos";
   - `Alt+Shift+P` (`⌥⇧P` no Mac) **sem** abrir o popup: mesmo resultado;
   - botão direito em "Código de indicação" → `piluvitu · dados de teste › Inserir › CPF`: o CPF entra no campo.
4. Eventos de foco com o popup aberto: numa página com validação no `blur` (por exemplo um formulário com react-hook-form em `mode: 'onBlur'`), preencher pelo popup dispara a validação.
5. Ícone nítido na barra em tela Retina (usa o PNG de 32 px) e em tela 1× (16 px).
6. `chrome://extensions/shortcuts` mostra "Preencher esta página" com `Alt+Shift+P`; se outro app já usa a tecla, o rodapé do popup mostra "definir atalho".

## Riscos e limites conhecidos

- **CPF, CNPJ e celular gerados podem pertencer a gente real**: não existe faixa reservada. Fluxos que mandam SMS ou consultam bureau vão bater num desconhecido. Use só em localhost e staging.
- **A caixa de e-mail é pública** (`tuamaeaquelaursa.com`): quem souber o endereço lê. A extensão só abre `https://tuamaeaquelaursa.com/<usuario>` numa aba; a API do serviço nunca é chamada. Nunca para conta real.
- **O activeTab cai quando a aba navega**: a página seguinte de um fluxo precisa de um novo gesto (o atalho resolve).
- **iframe de outro domínio** (Stripe Elements, Pagar.me) fica de fora: o activeTab só concede a origem do frame de cima.
- **O `suggested_key` só vale na primeira instalação**: mudar o padrão depois não chega a quem já instalou.
- **Fora da v1**: checkbox e radio (inclusive "aceito os termos"), combobox sem `<select>` nativo, telefone fixo, nome da mãe, nome social, órgão emissor e UF do RG, CNPJ alfanumérico, campos que só habilitam depois da busca de CEP do site.
````

- [ ] **Step 2: Conferir que o CLAUDE.md não neutraliza o gate**

```bash
cd apps/extensao && pnpm run build; echo "exit=$?"
cd apps/extensao && cp src/styles.css "$TMPDIR/styles.css.bak" && /usr/bin/grep -v "@source '../../../packages/ui/src'" "$TMPDIR/styles.css.bak" > src/styles.css && /usr/bin/wc -l "$TMPDIR/styles.css.bak" src/styles.css && pnpm run build; echo "exit=$?"
cd apps/extensao && cp "$TMPDIR/styles.css.bak" src/styles.css && cmp src/styles.css "$TMPDIR/styles.css.bak"; echo "exit=$?"
```

Esperado: `exit=0`; depois o `wc -l` com uma linha a menos no `styles.css` e `exit=1` (o gate ainda acusa `@source` quebrado com o `CLAUDE.md` novo na árvore); depois `exit=0`.

- [ ] **Step 3: Verificação final da fase**

```bash
pnpm --filter @piluvitu/extensao lint; echo "exit=$?"
pnpm --filter @piluvitu/extensao test; echo "exit=$?"
pnpm --filter @piluvitu/extensao build; echo "exit=$?"
pnpm --filter @piluvitu/extensao build-storybook; echo "exit=$?"
pnpm --filter @piluvitu/extensao test:e2e; echo "exit=$?"
pnpm --filter @piluvitu/tools lint; echo "exit=$?"
pnpm --filter @piluvitu/tools test; echo "exit=$?"
make -n lint; echo "exit=$?"
/usr/bin/git status --short; echo "exit=$?"
```

Esperado: todos `exit=0`; Vitest com todas as suítes verdes (`Test Files  29 passed`, `Tests  217 passed`); E2E `12 passed`; `make -n lint` mostrando `cd apps/promeia`; `git status` sem nada de `apps/extensao/.output`, `.wxt` ou `storybook-static`. Guarde a saída real desses comandos para o resumo ao dono (regra global: apresentar o output dos testes).

- [ ] **Step 4: Commit**

```bash
/usr/bin/git add apps/extensao/CLAUDE.md \
  && /usr/bin/git commit -m "docs(extensao): CLAUDE.md da extensão com fluxos, armadilhas e checklist manual"; echo "exit=$?"
```

- [ ] **Step 5: Critério de pronto da fase (manual, do dono)**

A fase está pronta quando, além do Step 3 verde, o **`Alt+Shift+P` preenche a página de teste com a extensão carregada sem empacotar** (itens 1 a 3 do checklist do `apps/extensao/CLAUDE.md`). Esse passo exige o gesto real no Chrome do dono (o Playwright não produz o gesto que concede o activeTab); quem executa o plano por agente registra o item como pendente de verificação manual no resumo, com os comandos exatos do checklist.
