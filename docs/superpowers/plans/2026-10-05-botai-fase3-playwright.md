# Botaí fase 3: motor DOM no core e plugin do Playwright: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** tirar o motor de preenchimento da extensão para `@pilutech/botai-core/navegador` (com bundle IIFE), fazer a extensão usá-lo sem mudar comportamento nem testes, e publicar o fixture `botai` em `@pilutech/botai-playwright` 0.1.0.

**Architecture:** o motor DOM vai para `packages/core/src/navegador/`, sem API de extensão: a raiz do preenchimento é recebida (`Document`, `ShadowRoot` ou `Element`), o acesso a shadow root fechada é um adaptador injetado (`RaizSombra`) e a 2ª passada devolve `Promise`. O build do core gera, além do ESM do subpath, `dist/navegador.iife.js`, que cria um único global (`__botaiNavegador`). A extensão vira casca: o `dom.ts` dela liga o adaptador de `browser.dom` e reexporta o resto. O pacote novo `packages/playwright` injeta o IIFE em cada frame por `frame.evaluate(código)` (passa pela CSP), chama `__botaiNavegador.preencher` e junta os frames; o fixture deriva a semente do projeto e do título do teste, anota e anexa a pessoa em falha.

**Tech Stack:** TypeScript 5.9, Jest 30 + ts-jest (core e lógica pura do plugin), Vitest 4 + WXT 0.21.4 (extensão, sem mudança), `@playwright/test` 1.59.1 (Chromium, Firefox e WebKit no plugin; Chromium com a extensão), esbuild 0.28.1 (IIFE e página React de teste), pnpm 11, GitHub Actions com trusted publishing do npm.

**Spec:** `/Users/piluvitu/WWW/PiluVitu-Dev/docs/superpowers/specs/2026-10-05-botai-repo-proprio-design.md` (§7, §8 e a linha "3" da §9; depois da fase 0 há cópia em `/Users/piluvitu/PILUTECH/Botai/docs/superpowers/specs/`). Contrato entre os planos: `/Users/piluvitu/WWW/PiluVitu-Dev/docs/superpowers/plans/2026-10-05-botai-repo-proprio-contrato.md` (seção "Playwright (fase 3)", já com os nomes fixados por este plano).

## Global Constraints

- **Onde:** repo `/Users/piluvitu/PILUTECH/Botai`, branch `feat/playwright`, criada da `main` local **depois** das fases 1 e 2 (core em 0.3.0). No fim, `/usr/bin/git merge --ff-only feat/playwright` na `main` local. Abreviação usada nos comandos: `R=/Users/piluvitu/PILUTECH/Botai` (os comandos abaixo trazem o caminho inteiro; o cwd não persiste entre comandos).
- **Nunca** `git push`, `npm publish`/`pnpm publish`, criar repo no GitHub, mexer em environment/secrets do GitHub ou na Vercel. Isso fica em "Passos do dono", no fim.
- **Versões:** `@pilutech/botai-core` 0.3.0 → **0.4.0**; `@pilutech/botai-playwright` **0.1.0**; a extensão não muda de versão.
- **Nomes:** os do contrato, sem renomear: subpath `/navegador`, arquivo `dist/navegador.iife.js`, global `__botaiNavegador`, `test`/`expect`/`fixturesBotai()`, fixture `botai` (`pessoa`, `semente`, `hoje`, `preencher`), opções `botaiSemente`/`botaiHoje`/`botaiUf`/`botaiDominioEmail`, anotações `botai-semente` e `botai-hoje`, anexo `botai-pessoa.json`, `ResultadoDoPreenchimento`/`LinhaDoPreenchimento`, tag `playwright-v<versão>`, workflow `publicar-playwright.yml`.
- **Idioma e comentários:** identificadores, mensagens, commits e docs em pt-BR. Comentário em código de produção só quando registra um porquê que o código não mostra e cuja ausência levaria alguém a "consertar" e quebrar (1 a 3 linhas). Teste comenta à vontade.
- **Colocation:** teste, story e e2e ao lado do fonte (`x.ts` → `x.test.ts` / `x.e2e.ts`). Ajudantes de teste ficam ao lado com sufixo `-teste.ts` (padrão do `rng-teste.ts`) ou em `src/teste/` no plugin, sempre fora do build publicado.
- **Ferramentas de teste:** Jest para lógica (core e funções puras do plugin); a extensão segue no Vitest (exceção já documentada); Playwright para fluxo (plugin nos 3 navegadores; extensão no Chromium com a extensão desempacotada). Sem componente visual novo, então sem story nova.
- **Depois de cada task:** `lint` (tsc) e testes do workspace tocado com EXIT=0; `CLAUDE.md` do workspace atualizado na task que muda tecnologia ou fluxo.
- **Saída do rtk é falsa** para `git`, `grep`, `diff`, `ls`, `find`, `vitest`, `prettier` (medido; ver a memória `reference-rtk-saida-falsa`). Use `/usr/bin/git`, `/usr/bin/grep`, `/usr/bin/diff`, `/bin/ls`, `node_modules/.bin/<ferramenta>` e termine todo comando de verificação com `; echo "EXIT=$?"`. Passou/falhou se decide pelo EXIT, nunca pelo texto. Sem pipe em comando cujo exit code importa (o zsh não tem `PIPESTATUS`).
- **Host:** os testes rodam no host; o repo não tem devcontainer.
- **Commits:** convencionais em pt-BR, com `/usr/bin/git add <arquivos exatos>` e `/usr/bin/git commit -m`. Sem linha de atribuição.
- **Credenciais:** nada privado no repo. O token do npm só existe no env local do dono, na primeira publicação; depois, trusted publishing.
- **Dependências (spec §5.3), conferidas na documentação oficial em 2026-10-05:**
  - pnpm ≥ 11 (`packageManager` da raiz). `minimumReleaseAge: 1440` sem `minimumReleaseAgeExclude` para `@pilutech/*` ou `@piluvitu/*` ([pnpm, dependency resolution](https://pnpm.io/settings/dependency-resolution): `minimumReleaseAge` "Added in: v10.16.0", padrão 1440 a partir da v11).
  - `trustPolicy: no-downgrade` ("Added in: v10.21.0", valores `no-downgrade` | `off`) e `blockExoticSubdeps: true` ("Added in: v10.26.0", padrão `true`), na mesma página. A fase 0 os põe no `pnpm-workspace.yaml`; esta fase só confere que continuam lá (Task 1).
  - `allowBuilds` explícito. Nenhuma dependência nova desta fase tem script de instalação além do `esbuild`, que já está `allowBuilds: { esbuild: true }`.
  - CI com `pnpm install --frozen-lockfile`; ao fim, `pnpm dedupe --check` e `pnpm audit --audit-level high` com EXIT=0.
  - Dependabot `cooldown` (chaves `default-days`, `semver-major-days`, `semver-minor-days`, `semver-patch-days`, `include`, `exclude`; [opções do Dependabot](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)). A fase 0 configura; esta fase só confere que `packages/playwright` está coberto (Task 9).
  - Actions fixadas por SHA, com os SHAs da fase 0 (tabela "SHAs das actions" do plano da fase 0; a fase 2 usa os mesmos): `actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0`, `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0`, `pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0`, `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2`, `actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0`. Uma versão por action no repo inteiro (contrato, "Fixado pelo plano da fase 2"): se o `ci.yml` já estiver noutro SHA para uma delas (o Dependabot pode ter subido), use o do `ci.yml`. `permissions` mínimas por job.
- **Publicação (spec §5.4):** trusted publishing do npm exige "npm CLI version 11.5.1 or later and Node version 22.14.0 or higher", permissão `id-token: write`, gera proveniência sozinho e não aceita runner self-hosted ([npm, trusted publishers](https://docs.npmjs.com/trusted-publishers)). Node 24.14.0 traz o npm 11.9.0 ([nodejs.org/dist/index.json](https://nodejs.org/dist/index.json)). O `repository` do `package.json` tem de bater, com maiúsculas, com o repo que publica ([npm, provenance](https://docs.npmjs.com/generating-provenance-statements)). `pnpm pack` troca `workspace:*` pela versão exata do pacote do workspace ([pnpm, workspaces](https://pnpm.io/workspaces)). **Não confirmado, e por isso fora do plano:** `pnpm publish` com OIDC (a [doc do `pnpm publish`](https://pnpm.io/cli/publish) não fala de trusted publishing) e `npm publish <arquivo>.tgz` com proveniência; o workflow publica a **pasta** extraída do tarball do `pnpm pack`.
- **Playwright:** `mergeTests` existe desde a 1.39 ([notas da 1.39.0](https://newreleases.io/project/npm/playwright/release/1.39.0)); a peer dependency fica `^1.59.1`, a única versão testada. Pacote só ESM: projeto CommonJS precisa de `require(esm)` sem flag, que existe a partir do Node 20.19.0 e 22.12.0 ([Node, modules](https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require)), daí `engines.node: "^20.19.0 || >=22.12.0"`.
- **Firefox e WebKit no plugin:** se um teste falhar só num deles por limite do navegador (não do nosso código), confirme com um caso mínimo, marque `test.skip(browserName === '<navegador>', '<motivo>')` naquele teste e registre em "Limites" do `packages/playwright/CLAUDE.md` e do README. Nunca afrouxe a asserção para todos.

## Review Focus

1. **`Locator` que aponta direto para um campo** (`page.getByLabel('CPF')`) ou para o host de uma shadow root aberta → preenche esse campo, e só ele. Testes: Task 1 (`campos` com raiz que é campo, host e `ShadowRoot`) e Task 7 ("locator de um campo só").
2. **`Locator` dentro de iframe** (`page.frameLocator('iframe').locator('#contato')`) → o motor é instalado naquele frame, não no de cima. Teste: Task 7 ("locator dentro de um iframe").
3. **Vários `preencher` no mesmo teste, com navegação no meio** → reinstala o motor em cada documento novo, não duplica global e o campo já certo conta como preenchido. Teste: Task 7 ("reinstala o motor a cada documento").
4. **Página com CSP estrita** (`default-src 'none'; script-src 'self'`) → preenche igual. Teste: Task 7 ("passa pela CSP estrita").
5. **`botaiHoje` fora de `AAAA-MM-DD`** (ex.: `'05/10/2026'`) → o teste falha no setup do fixture com mensagem que nomeia a opção, em vez de gerar pessoa errada. Testes: Task 6 (`conferirHoje`) e Task 8 (projeto filho).

## Mapa de arquivos (repo novo)

| Arquivo                                                                                            | Responsabilidade                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/navegador/dom.ts`                                                               | campos, visibilidade, descrição, seletor, escrita, leitura de volta, foco; `RaizSombra` e `raizSombraAberta` |
| `packages/core/src/navegador/layout-teste.ts`                                                      | ajudante de teste: layout falso do jsdom e `CSS.escape`                                                      |
| `packages/core/src/navegador/registro.ts`                                                          | `Map<idx, WeakRef>` dos campos (vem da extensão)                                                             |
| `packages/core/src/navegador/contornos.ts`                                                         | contornos ciano/âmbar (vem da extensão) + `SEM_CONTORNOS`                                                    |
| `packages/core/src/navegador/segunda-passada.ts`                                                   | regravação 1 s depois, agora com `Promise`                                                                   |
| `packages/core/src/navegador/preencher.ts`                                                         | `preencherDocumento({ raiz, … })`, `ResultadoFrame`, `contarIframesDeFora`                                   |
| `packages/core/src/navegador/pagina.ts`                                                            | `preencherNaPagina`, `instalarNoGlobal`, `NOME_DO_GLOBAL`                                                    |
| `packages/core/src/navegador/iife.ts`                                                              | entrada do IIFE (só chama `instalarNoGlobal()`)                                                              |
| `packages/core/src/navegador/index.ts`                                                             | barrel do subpath `/navegador`                                                                               |
| `packages/core/scripts/construir-iife.mjs`                                                         | esbuild → `dist/navegador.iife.js`                                                                           |
| `packages/core/tsconfig.sem-dom.json`                                                              | prova de que o resto do core compila sem DOM                                                                 |
| `extensao/src/entrypoints/preencher.content/{dom,preencher,contornos,registro,segunda-passada}.ts` | adaptador + reexportações do core                                                                            |
| `extensao/src/lib/resultado.ts`                                                                    | `ResultadoFrame` passa a vir do core                                                                         |
| `packages/playwright/src/semente.ts`                                                               | `sementeDoTeste`, `conferirHoje`                                                                             |
| `packages/playwright/src/resultado.ts`                                                             | `ResultadoDoPreenchimento`, `juntarFrames`                                                                   |
| `packages/playwright/src/preencher.ts`                                                             | instala o IIFE por frame e preenche `Page`/`Locator`                                                         |
| `packages/playwright/src/fixture.ts`                                                               | `fixturesBotai()`, `test`, `expect`                                                                          |
| `packages/playwright/src/index.ts`                                                                 | API pública do pacote                                                                                        |
| `packages/playwright/src/teste/`                                                                   | páginas e ajudantes dos E2E, projeto filho do teste de relatório                                             |
| `packages/playwright/scripts/conferir-pacote.mjs`                                                  | `pnpm pack` + lista fechada + dependência do core                                                            |
| `.github/workflows/publicar-playwright.yml`                                                        | tag `playwright-v*` → testes → pacote → publicação com aprovação                                             |

---

### Task 1: Ponto de partida e `dom.ts` do motor no core

**Files:**

- Create: `packages/core/src/navegador/dom.ts`
- Create: `packages/core/src/navegador/layout-teste.ts`
- Create: `packages/core/src/navegador/dom.test.ts`
- Create: `packages/core/tsconfig.sem-dom.json`
- Modify: `packages/core/src/portabilidade.test.ts` (a trava da fase 1 passa a aceitar `document.`/`window.` só em `src/navegador/`)
- Modify: `packages/core/package.json` (script `lint`; `jest-environment-jsdom` se faltar)
- Modify (só se preciso, ver Step 1): o tsconfig de build do core, para excluir `src/**/*-teste.ts`

**Interfaces:**

- Consumes (fases 0–2): `type FieldDescriptor` de `packages/core/src/campos.ts`.
- Produces:
  - `type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement`
  - `type RaizSombra = (el: Element) => ShadowRoot | null`; `const raizSombraAberta: RaizSombra`
  - `ehCampo(n: Element): n is Campo`, `tipoNaoPreenchivel(el: Campo): boolean`, `preenchivel(el: Campo): boolean`, `visivel(el: Campo): boolean`
  - `campos(raiz: Document | ShadowRoot | Element, raizSombra?: RaizSombra): Generator<Campo>`
  - `descrever(el: Campo): FieldDescriptor`, `seletor(el: Campo): string`, `escrever(el: Campo, valor: string): void`, `leuDeVolta(el: Campo, valor: string): boolean`, `cabe(valor: string, d: Pick<FieldDescriptor, 'maxLength'>): boolean`
  - `elementoEmFoco(doc: Document, raizSombra?: RaizSombra): Element | null`
  - `layout-teste.ts`: `retangulo(x, y, largura, altura): DOMRect`, `simularLayout(): () => void`, `garantirCssEscape(): void`

- [ ] **Step 1: Conferir as pré-condições das fases 0–2 (pare e reporte se alguma falhar; não adapte o plano em silêncio)**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git status --short && /usr/bin/git branch --show-current; echo "EXIT=$?"
```

Esperado: nada pendente, branch `main`.

```bash
cd /Users/piluvitu/PILUTECH/Botai && node -p "require('./packages/core/package.json').version"; echo "EXIT=$?"
```

Esperado: `0.3.0`.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git tag -l 'core-v*'; echo "EXIT=$?"
```

Esperado: `core-v0.1.0` e `core-v0.2.0` (criadas no fim da fase 0, parte B, e da fase 1; contrato, "Branches e tags"); sem uma delas, pare e reporte. Se `core-v0.3.0` faltar, crie-a aqui, no `HEAD` de partida (o merge da fase 2, versão 0.3.0 conferida acima): `cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git tag -a core-v0.3.0 -m "@pilutech/botai-core 0.3.0"; echo "EXIT=$?"`. Nenhuma delas é recriada noutro commit.

```bash
cd /Users/piluvitu/PILUTECH/Botai && node --test scripts/*.test.mjs; echo "EXIT=$?"
```

Esperado: EXIT=0 (salvaguardas da raiz: actions por SHA em todo workflow, `cooldown` em todo ecossistema do Dependabot, `npm publish` só no environment `npm` com `--provenance`). Vermelho aqui é pendência da fase 2: pare e reporte.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/grep -rnE "export (async )?(function|const|interface|type) (gerarPessoa|rngDeSemente|hojeEmSaoPaulo|MOTOR|FORMATO|EnvelopeDaPessoa|Semente|montarPessoa)\b" packages/core/src --include=*.ts; echo "EXIT=$?"
```

Esperado: os 8 nomes aparecem (`montarPessoa` em `src/pessoa.ts`, os outros na API da raiz); EXIT=0.

```bash
/bin/ls /Users/piluvitu/PILUTECH/Botai/packages/core/dourado/v1/; cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -p "require('./dourado/v1/indice.json').filter((i) => i.n === undefined).map((i) => i.arquivo + ' ' + JSON.stringify(i.opcoes)).join('\n')"; echo "EXIT=$?"
```

Esperado: `indice.json` e os `.json` da fase 1; a segunda parte lista as entradas de pessoa única (sem `n`) com as `opcoes` de cada uma, entre elas `pessoa-uf.json` (com `uf`) e `pessoa-dominio-email.json` (com `dominioEmail`). A Task 8 confere o fixture contra essas entradas com **todas** as opções: o envelope não registra `uf` nem `dominioEmail`, então ler só o `.json` geraria a pessoa errada nesses dois.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && /bin/ls src/portabilidade.test.ts && /usr/bin/grep -n "PROIBIDOS\|document\|window\|'bin'" src/portabilidade.test.ts; echo "EXIT=$?"
```

Esperado: a trava da fase 1 existe e proíbe `document.` e `window.` fora de `src/bin` e de `src/servidor/index.ts` (que a fase 2 tirou da varredura com a constante `SO_NO_NODE`). O `dom.ts` desta fase usa `window.scrollX`; a Task 1 (Step 7) abre a exceção só para o DOM em `src/navegador/`, mantendo a proibição de API de Node lá dentro.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /bin/ls node_modules/.bin/prettier node_modules/.bin/actionlint 2>&1; command -v actionlint; /usr/bin/grep -n "dedupe --check\|audit --audit-level" .github/workflows/ci.yml; echo "EXIT=$?"
```

Esperado: `node_modules/.bin/prettier` existe (é o que as Tasks 5, 9 e 10 usam; se faltar, use `pnpm exec prettier` nos mesmos comandos); `actionlint` no PATH (Homebrew); o `ci.yml` da fase 0 já roda `pnpm dedupe --check` e `pnpm audit --audit-level high` (spec §5.3). Se o `ci.yml` não tiver os dois, pare e reporte: é pendência da fase 0.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/grep -rn "@pilutech/botai-core/" extensao/src/entrypoints/preencher.content/dom.ts extensao/src/entrypoints/preencher.content/preencher.ts extensao/src/lib/hoje.ts extensao/src/test/pessoa-dourada.ts; echo "EXIT=$?"
/usr/bin/grep -rn "@piluvitu/tools" /Users/piluvitu/PILUTECH/Botai/extensao/src; echo "EXIT=$?"
```

Esperado: a extensão importa `@pilutech/botai-core/campos`, `/campos-formatar`, `/pessoa` (EXIT=0) e não importa mais `@piluvitu/tools` (o segundo comando sai com EXIT=1).

```bash
/usr/bin/grep -n "^import" /Users/piluvitu/PILUTECH/Botai/packages/core/src/pessoa.ts; echo "EXIT=$?"
```

Anote o estilo dos imports relativos. O código deste plano usa `.js` (`from './dom.js'`). Se o core usa imports sem extensão, tire o `.js` de **todo** import relativo dos arquivos novos do core logo depois de criá-los: `sed -i '' -E "s#(from '\.{1,2}/[^']+)\.js'#\1'#" <arquivo>`. Nunca misture os dois estilos.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && /bin/ls jest.config.* tsconfig*.json && cat jest.config.* tsconfig*.json && node -p "JSON.stringify({scripts: require('./package.json').scripts, dev: require('./package.json').devDependencies, pessoa: require('./package.json').exports['./pessoa']}, null, 2)"; echo "EXIT=$?"
```

Anote e confira:

- o Jest cobre `src/**/*.test.ts` e roda em CommonJS (sem `useESM` nem `extensionsToTreatAsEsm`), então `__dirname` existe nos testes. Se for ESM, troque `__dirname` por `fileURLToPath(new URL('.', import.meta.url))` nos testes deste plano;
- `devDependencies` têm `jest`, `ts-jest`, `@types/jest`, `typescript`, `@types/node`. Se `jest-environment-jsdom` faltar: `cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core add -D jest-environment-jsdom@^30.0.0; echo "EXIT=$?"` (mesma major do Jest 30);
- o `tsconfig.json` base não tem `dom` no `lib` (a garantia da fase 0), e o `lib` (ou o `target`, se não houver `lib`) é ES2021 ou mais novo: o `registro.ts` usa `WeakRef`. Se for menor, acrescente `"es2021.weakref"` ao `lib` do `tsconfig.json` base nesta task;
- como o build exclui testes e o `src/rng-teste.ts`. O `src/navegador/layout-teste.ts` precisa sair do build do mesmo jeito: se a exclusão é pelo nome `rng-teste.ts`, acrescente `"src/**/*-teste.ts"` ao `exclude` do tsconfig de build;
- os dois manifestos de `./pessoa` (contrato, "Publicação no npm e environments"): `exports['./pessoa']` = `"./src/pessoa.ts"` (workspace) e `publishConfig.exports['./pessoa']` = `{"types":"./dist/pessoa.d.ts","default":"./dist/pessoa.js"}` (tarball), que a Task 4 repete para `./navegador`;
- o script `build` e o `lint` atuais (a Task 4 e esta task acrescentam passos no fim deles).

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/grep -rln "pack --dry-run" packages/core .github scripts; echo "EXIT=$?"
```

Esperado: `packages/core/scripts/pacote.test.mjs` (fase 0), que monta a lista do `pnpm pack --dry-run` a partir dos valores do `publishConfig.exports` mais a constante `EXTRAS`; a Task 4 acrescenta as entradas do navegador a `EXTRAS`.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/grep -hn "uses:" .github/workflows/*.yml; /usr/bin/grep -n "environment:" .github/workflows/*.yml; /usr/bin/grep -n "node-version" .github/workflows/ci.yml; echo "EXIT=$?"
```

Anote: os SHAs das actions (se diferirem dos das Global Constraints, valem os do repo), o nome do environment do `publicar-core.yml` (as Tasks 10 e os Passos do dono usam o mesmo; o plano escreve `npm`) e a versão do Node do job do core no `ci.yml`.

```bash
cd /Users/piluvitu/PILUTECH/Botai && cat pnpm-workspace.yaml && /usr/bin/grep -n "directory\|cooldown" .github/dependabot.yml && /usr/bin/git check-ignore -v packages/x/dist packages/x/test-results packages/x/playwright-report; echo "EXIT=$?"
```

Esperado: `minimumReleaseAge: 1440`, `trustPolicy: no-downgrade`, `blockExoticSubdeps: true`, `allowBuilds` com `esbuild: true`; anote se `packages:` usa `packages/*` ou lista cada pasta (Task 6) e se o ecossistema `npm` do Dependabot usa `directory: '/'` (Task 9; o `docker` da fase 2 aponta `/packages/core` e não conta); os três caminhos aparecem como ignorados (se não, a Task 6 acrescenta ao `.gitignore` da raiz).

Linha de base verde:

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm install --frozen-lockfile && pnpm --filter @pilutech/botai-core run build && pnpm --filter @pilutech/botai-core run lint && pnpm --filter @pilutech/botai-core run test; echo "EXIT=$?"
```

Esperado: EXIT=0.

```bash
cd /Users/piluvitu/PILUTECH/Botai/extensao && node_modules/.bin/wxt prepare && node_modules/.bin/vitest run; echo "EXIT=$?"
```

Esperado: EXIT=0. **Anote o total da linha `Tests  N passed`**: a Task 5 tem de terminar com o mesmo N.

- [ ] **Step 2: Criar a branch**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git switch -c feat/playwright main; echo "EXIT=$?"
```

- [ ] **Step 3: Escrever o teste que falha**

Crie `packages/core/src/navegador/dom.test.ts`. Ele é o `extensao/src/entrypoints/preencher.content/dom.test.ts` portado para o Jest (`vi.` → `jest.`), com o adaptador passado por parâmetro no lugar do stub do `fakeBrowser`, sem o bloco do Firefox (que testa o adaptador da extensão e fica lá) e com os casos novos de raiz.

```ts
/** @jest-environment jsdom */
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
} from './dom.js'
import { garantirCssEscape, retangulo, simularLayout } from './layout-teste.js'

garantirCssEscape()

// Faz o papel do adaptador que a extensão injeta (browser.dom): devolve as raízes fechadas registradas aqui.
const fechadas = new Map<Element, ShadowRoot>()
const raizDeTeste = (el: Element) => el.shadowRoot ?? fechadas.get(el) ?? null
let desfazerLayout: () => void

beforeEach(() => {
  fechadas.clear()
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

const nomes = (lista: Iterable<Campo>) =>
  Array.from(lista, (el) => el.getAttribute('name'))

describe('campos', () => {
  function montarComSombras() {
    montar(
      '<input name="a"><div id="aberta"></div><select name="b"></select><div id="fechada"></div><textarea name="c"></textarea>',
    )
    q<HTMLElement>('#aberta').attachShadow({ mode: 'open' }).innerHTML =
      '<input name="dentro-aberta">'
    sombraFechada(q<HTMLElement>('#fechada'), '<input name="dentro-fechada">')
  }

  it('acha input, select e textarea na ordem do DOM, entrando na shadow root aberta e na fechada que o adaptador entrega', () => {
    montarComSombras()
    expect(nomes(campos(document, raizDeTeste))).toEqual([
      'a',
      'dentro-aberta',
      'b',
      'dentro-fechada',
      'c',
    ])
  })

  it('sem adaptador, entra só na shadow root aberta', () => {
    montarComSombras()
    expect(nomes(campos(document))).toEqual(['a', 'dentro-aberta', 'b', 'c'])
  })

  it('raiz Element percorre só o que está dentro dela', () => {
    montar(
      '<form id="f"><input name="dentro"><select name="dentro-2"></select></form><input name="fora">',
    )
    expect(nomes(campos(q<HTMLFormElement>('#f')))).toEqual([
      'dentro',
      'dentro-2',
    ])
  })

  it('raiz que é o próprio campo devolve o campo', () => {
    montar('<input name="so"><input name="outro">')
    expect(nomes(campos(q('[name="so"]')))).toEqual(['so'])
  })

  it('raiz que é host de shadow root entra na sombra dela', () => {
    montar('<x-campo></x-campo><input name="fora">')
    q<HTMLElement>('x-campo').attachShadow({ mode: 'open' }).innerHTML =
      '<input name="cpf">'
    expect(nomes(campos(q<HTMLElement>('x-campo')))).toEqual(['cpf'])
  })

  it('raiz ShadowRoot percorre só a sombra', () => {
    montar('<x-campo></x-campo><input name="fora">')
    const sombra = q<HTMLElement>('x-campo').attachShadow({ mode: 'open' })
    sombra.innerHTML = '<input name="cpf">'
    expect(nomes(campos(sombra))).toEqual(['cpf'])
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

  it('campo dentro de fieldset disabled fica de fora, mesmo sem o atributo próprio', () => {
    // el.disabled só reflete o atributo do próprio campo; o fieldset desabilita sem tocá-lo.
    montar(
      '<fieldset disabled><input id="i"><select id="s"></select><textarea id="t"></textarea></fieldset>',
    )
    expect(
      ['i', 's', 't'].map((id) => preenchivel(q<Campo>(`#${id}`))),
    ).toEqual([false, false, false])
  })

  it('campo na legend do fieldset disabled continua habilitado', () => {
    // Regra do HTML: o primeiro <legend> do fieldset não herda o disabled.
    montar(
      '<fieldset disabled><legend><input id="na-legenda"></legend><input id="fora"></fieldset>',
    )
    expect(preenchivel(q('#na-legenda'))).toBe(true)
    expect(preenchivel(q('#fora'))).toBe(false)
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

  it('aria-hidden acima do host esconde o campo de dentro da shadow root', () => {
    // closest() para na fronteira da shadow root: a isca embrulhada num web component passaria.
    montar(
      '<div aria-hidden="true"><x-isca id="a"></x-isca><x-isca id="f"></x-isca></div>',
    )
    const aberta = q<HTMLElement>('#a').attachShadow({ mode: 'open' })
    aberta.innerHTML = '<input name="aberta">'
    const fechada = sombraFechada(
      q<HTMLElement>('#f'),
      '<input name="fechada">',
    )
    expect(visivel(q('input', aberta))).toBe(false)
    expect(visivel(q('input', fechada))).toBe(false)
  })

  it('shadow root aninhada sem aria-hidden acima segue visível', () => {
    montar('<x-fora></x-fora>')
    const fora = q<HTMLElement>('x-fora').attachShadow({ mode: 'open' })
    fora.innerHTML = '<div aria-hidden="false"><x-dentro></x-dentro></div>'
    const dentro = q<HTMLElement>('x-dentro', fora).attachShadow({
      mode: 'open',
    })
    dentro.innerHTML = '<input>'
    expect(visivel(q('input', dentro))).toBe(true)
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

  it('nth-of-type conta só os irmãos do mesmo pai, não a raiz inteira', () => {
    // :nth-of-type é relativo ao pai; contar na raiz daria input:nth-of-type(3), que não casa com nada.
    montar('<form><input name="d"><input name="d"><div><input></div></form>')
    const aninhado = q('div > input')
    expect(seletor(aninhado)).toBe('input:nth-of-type(1)')
    expect(aninhado.matches('input:nth-of-type(1)')).toBe(true)
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
    const focar = jest.spyOn(el, 'focus')
    const desfocar = jest.spyOn(el, 'blur')
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
    const setterDaPagina = jest.fn()
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

  it('atravessa shadow root aberta e a fechada que o adaptador entrega', () => {
    montar('<div id="a"></div><div id="f"></div>')
    const aberta = q<HTMLElement>('#a').attachShadow({ mode: 'open' })
    aberta.innerHTML = '<input name="aberta">'
    q('input', aberta).focus()
    expect(elementoEmFoco(document, raizDeTeste)).toBe(q('input', aberta))
    const fechada = sombraFechada(
      q<HTMLElement>('#f'),
      '<input name="fechada">',
    )
    q('input', fechada).focus()
    expect(elementoEmFoco(document, raizDeTeste)).toBe(q('input', fechada))
  })

  it('sem adaptador, para no host da shadow root fechada', () => {
    montar('<div id="f"></div>')
    const host = q<HTMLElement>('#f')
    const fechada = sombraFechada(host, '<input name="fechada">')
    q('input', fechada).focus()
    expect(elementoEmFoco(document)).toBe(host)
  })
})
```

- [ ] **Step 4: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node_modules/.bin/jest src/navegador/dom.test.ts; echo "EXIT=$?"
```

Esperado: FAIL, `Cannot find module './dom.js'` (ou `./layout-teste.js`); EXIT=1.

- [ ] **Step 5: Escrever o ajudante e o `dom.ts`**

`packages/core/src/navegador/layout-teste.ts`:

```ts
/// <reference lib="dom" />

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

// O jsdom não tem CSS.escape, e o seletor() depende dele.
export function garantirCssEscape(): void {
  if ('CSS' in globalThis) return
  Object.defineProperty(globalThis, 'CSS', {
    value: { escape: (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`) },
    configurable: true,
  })
}
```

`packages/core/src/navegador/dom.ts` (o `dom.ts` da extensão com três mudanças: `RaizSombra` injetado no lugar de `browser.dom`/`import.meta.env`, raiz `Element` em `campos`, e o `createTreeWalker` do documento da raiz em vez do `document` global):

```ts
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type { FieldDescriptor } from '../campos.js'

export type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement

export type RaizSombra = (el: Element) => ShadowRoot | null

export const raizSombraAberta: RaizSombra = (el) => el.shadowRoot

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
  if (tipoNaoPreenchivel(el) || el.matches(':disabled')) return false
  if (el instanceof HTMLSelectElement) return !el.multiple
  return !el.readOnly
}

function sobAriaHidden(el: Element): boolean {
  for (let atual: Element | null = el; atual; ) {
    if (atual.closest('[aria-hidden="true"]')) return true
    const raiz = atual.getRootNode()
    atual = raiz instanceof ShadowRoot ? raiz.host : null
  }
  return false
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
  if (sobAriaHidden(el)) return false
  // select2 e afins escondem o <select> nativo, mas continuam escutando o change dele.
  if (el instanceof HTMLSelectElement) return true
  const r = el.getBoundingClientRect()
  if (r.width < 2 || r.height < 2) return false
  return r.right + window.scrollX > 0 && r.bottom + window.scrollY > 0
}

function* campoESombra(el: Element, raizSombra: RaizSombra): Generator<Campo> {
  if (ehCampo(el)) yield el
  const sombra = raizSombra(el)
  if (sombra) yield* campos(sombra, raizSombra)
}

export function* campos(
  raiz: Document | ShadowRoot | Element,
  raizSombra: RaizSombra = raizSombraAberta,
): Generator<Campo> {
  if (raiz.nodeType === Node.ELEMENT_NODE)
    yield* campoESombra(raiz as Element, raizSombra)
  const documento = (raiz.ownerDocument ?? raiz) as Document
  const caminhante = documento.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT)
  for (let n = caminhante.nextNode(); n; n = caminhante.nextNode()) {
    if (n instanceof Element) yield* campoESombra(n, raizSombra)
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
  // Foco sintético, nunca el.focus(): quem preenche (popup, atalho, teste) não pode roubar o foco da página.
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

export function elementoEmFoco(
  doc: Document,
  raizSombra: RaizSombra = raizSombraAberta,
): Element | null {
  let atual = doc.activeElement
  while (atual) {
    const dentro = raizSombra(atual)?.activeElement
    if (!dentro) break
    atual = dentro
  }
  return atual === doc.body ? null : atual
}
```

- [ ] **Step 6: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node_modules/.bin/jest src/navegador/dom.test.ts; echo "EXIT=$?"
```

Esperado: PASS em todos; EXIT=0.

- [ ] **Step 7: A trava de portabilidade da fase 1 aceita o DOM só em `src/navegador/`**

Vermelho primeiro: com o `dom.ts` no lugar, a trava tem de morder.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node_modules/.bin/jest src/portabilidade.test.ts; echo "EXIT=$?"
```

Esperado: FAIL listando `navegador/dom.ts: /\bwindow\./`; EXIT=1.

Em `packages/core/src/portabilidade.test.ts`, acrescente `sep` ao import de `node:path` (`import { join, relative, sep } from 'node:path'`), ponha logo abaixo da constante `PROIBIDOS`:

```ts
// src/navegador é o motor DOM (fase 3): document e window podem; API de Node continua proibida.
const SO_DO_NAVEGADOR = [/\bdocument\./, /\bwindow\./].map(String)
const proibidosPara = (arquivo: string) =>
  relative(SRC, arquivo).split(sep)[0] === 'navegador'
    ? PROIBIDOS.filter(
        (proibido) => !SO_DO_NAVEGADOR.includes(String(proibido)),
      )
    : PROIBIDOS
```

e, dentro do teste, troque `PROIBIDOS.filter((proibido) => proibido.test(texto))` por `proibidosPara(arquivo).filter((proibido) => proibido.test(texto))`. Nada mais muda (a `SO_NO_NODE` da fase 2, que tira `src/servidor/index.ts` da varredura em `modulosDeProducao`, fica como está).

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node_modules/.bin/jest src/portabilidade.test.ts; echo "EXIT=$?"
```

Esperado: PASS; EXIT=0.

Prove que a trava continua mordendo nos dois sentidos (as sondas são apagadas no mesmo comando):

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && printf "export const ambiente = () => process.env\n" > src/navegador/zz-sonda-node.ts && printf "export const titulo = () => document.title\n" > src/zz-sonda-dom.ts && node_modules/.bin/jest src/portabilidade.test.ts; echo "EXIT=$?"; /bin/rm src/navegador/zz-sonda-node.ts src/zz-sonda-dom.ts
```

Esperado: FAIL listando `navegador/zz-sonda-node.ts: /\bprocess\./` e `zz-sonda-dom.ts: /\bdocument\./`; EXIT=1.

- [ ] **Step 8: Guarda do "sem DOM" nos tipos e lint**

As referências `/// <reference lib="dom" />` põem o DOM no programa inteiro do `tsconfig.json`. A prova de que o resto do core não usa DOM passa para um tsconfig que exclui `src/navegador`. Crie `packages/core/tsconfig.sem-dom.json` (copie para `exclude` as entradas que o `exclude` do `tsconfig.json` já tem, se tiver, e mantenha estas três):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true },
  "exclude": ["node_modules", "dist", "src/navegador"]
}
```

No `packages/core/package.json`, acrescente ao **fim** do valor atual do script `lint`: ` && tsc --noEmit -p tsconfig.sem-dom.json`.

Prove que a guarda pega DOM fora do navegador:

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && printf "export const titulo = () => document.title\n" > src/zz-sonda-dom.ts && node_modules/.bin/tsc --noEmit -p tsconfig.sem-dom.json; echo "EXIT=$?"; rm src/zz-sonda-dom.ts
```

Esperado: erro `Cannot find name 'document'`; EXIT diferente de 0. Depois:

```bash
cd /Users/piluvitu/PILUTECH/Botai && /bin/ls packages/core/src/zz-sonda-dom.ts; pnpm --filter @pilutech/botai-core run lint; echo "EXIT=$?"
```

Esperado: o `ls` diz que o arquivo não existe; o lint sai com EXIT=0.

- [ ] **Step 9: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git status --short && /usr/bin/git add packages/core/src/navegador/dom.ts packages/core/src/navegador/dom.test.ts packages/core/src/navegador/layout-teste.ts packages/core/src/portabilidade.test.ts packages/core/tsconfig.sem-dom.json packages/core/package.json pnpm-lock.yaml && /usr/bin/git add -u packages/core && /usr/bin/git commit -m "feat(core): campos, escrita e foco do motor DOM com adaptador de shadow root e raiz Element"; echo "EXIT=$?"
```

---

### Task 2: Registro, contornos e 2ª passada com `Promise`

**Files:**

- Create: `packages/core/src/navegador/registro.ts`, `registro.test.ts`
- Create: `packages/core/src/navegador/contornos.ts`, `contornos.test.ts`
- Create: `packages/core/src/navegador/segunda-passada.ts`, `segunda-passada.test.ts`

**Interfaces:**

- Consumes: `Campo`, `ehCampo`, `escrever`, `preenchivel` (Task 1).
- Produces:
  - `interface Registro { guardar(el: Campo): number; buscar(idx: number): Campo | undefined }`, `criarRegistro(): Registro`
  - `type TipoContorno = 'preenchido' | 'nao-reconhecido'`, `interface Contornos { marcar(el: HTMLElement, tipo: TipoContorno): void; destacar(el: HTMLElement): void; limpar(): void }`, `criarContornos(agendar: (acao: () => void, ms: number) => void): Contornos`, `SEM_CONTORNOS: Contornos`, `cliqueDoUsuarioEmCampo(evento: Pick<Event, 'isTrusted' | 'composedPath'>): boolean`
  - `interface Escrito { el: Campo; valor: string; lido: string }`, `SEGUNDA_PASSADA_MS = 1000`, `regravarAlterados(escritos: readonly Escrito[]): void`, `agendarSegundaPassada(escritos: readonly Escrito[], agendar: (acao: () => void, ms: number) => void): Promise<void>`

- [ ] **Step 1: Escrever os testes que falham**

`packages/core/src/navegador/registro.test.ts`:

```ts
/** @jest-environment jsdom */
import { criarRegistro } from './registro.js'

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

`packages/core/src/navegador/contornos.test.ts` (o da extensão com `vi.` → `jest.` e o bloco novo do `SEM_CONTORNOS`):

```ts
/** @jest-environment jsdom */
import {
  cliqueDoUsuarioEmCampo,
  criarContornos,
  SEM_CONTORNOS,
} from './contornos.js'

beforeEach(() => {
  jest.useFakeTimers()
  document.body.innerHTML =
    '<input id="a" style="outline: 1px dotted red"><input id="b">'
})

afterEach(() => {
  jest.useRealTimers()
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

  it('outline do site só em longhands, com prioridades mistas, volta igual', () => {
    // O jsdom não expande o shorthand `outline`, então aqui o defeito não aparece; no Chrome,
    // ler `outline` com só longhands dá '' e restaurar pelo shorthand apagava o outline do site.
    const b = el('b')
    b.style.setProperty('outline-color', 'red', 'important')
    b.style.setProperty('outline-width', '3px')
    const contornos = novos()
    contornos.marcar(b, 'preenchido')
    contornos.limpar()
    expect(b.style.getPropertyValue('outline-color')).toBe('red')
    expect(b.style.getPropertyPriority('outline-color')).toBe('important')
    expect(b.style.getPropertyValue('outline-width')).toBe('3px')
    expect(b.style.getPropertyPriority('outline-width')).toBe('')
    expect(b.style.getPropertyValue('outline-offset')).toBe('')
  })

  it('destacar pisca (âmbar, apagado, âmbar, apagado, âmbar) e termina no contorno do campo', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'preenchido')
    contornos.destacar(el('a'))
    const visto = [outline('a')]
    for (let passo = 0; passo < 5; passo++) {
      jest.advanceTimersByTime(200)
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
    jest.advanceTimersByTime(1600)
    expect(outline('a')).toBe('1px dotted red')
  })

  it('aviso que some no meio do pisca não deixa contorno velho para trás', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'nao-reconhecido')
    contornos.destacar(el('a'))
    jest.advanceTimersByTime(300)
    contornos.limpar()
    jest.advanceTimersByTime(1000)
    expect(outline('a')).toBe('1px dotted red')
  })

  it('reinjetar no meio do pisca (timers cancelados) devolve o outline do site, mesmo com o aviso já fechado', () => {
    // Como o ctx.onInvalidated da extensão: os timers da instância antiga somem e só o limpar() roda.
    const timers: ReturnType<typeof setTimeout>[] = []
    const contornos = criarContornos((acao, ms) => {
      timers.push(setTimeout(acao, ms))
    })
    contornos.marcar(el('a'), 'preenchido')
    contornos.limpar()
    contornos.destacar(el('a'))
    jest.advanceTimersByTime(300)
    timers.forEach(clearTimeout)
    contornos.limpar()
    expect(outline('a')).toBe('1px dotted red')
  })

  it('Mostrar clicado duas vezes seguidas e reinjeção no meio do 2º pisca ainda devolve o outline do site', () => {
    // O fim do 1º pisca (aos 1000 ms) não pode tirar o campo do conjunto enquanto o 2º
    // (que começou aos 500 ms) ainda está agendado: senão o limpar() da reinjeção o esquece.
    const timers: ReturnType<typeof setTimeout>[] = []
    const contornos = criarContornos((acao, ms) => {
      timers.push(setTimeout(acao, ms))
    })
    contornos.marcar(el('a'), 'preenchido')
    contornos.limpar()
    contornos.destacar(el('a'))
    jest.advanceTimersByTime(500)
    contornos.destacar(el('a'))
    jest.advanceTimersByTime(700)
    timers.forEach(clearTimeout)
    contornos.limpar()
    expect(outline('a')).toBe('1px dotted red')
  })

  it('Mostrar clicado duas vezes seguidas termina no contorno do campo, sem passo velho do 1º pisca por cima', () => {
    const contornos = novos()
    contornos.marcar(el('a'), 'preenchido')
    contornos.destacar(el('a'))
    jest.advanceTimersByTime(500)
    contornos.destacar(el('a'))
    jest.advanceTimersByTime(500)
    expect(outline('a')).toBe('2px dashed #f5b82e')
    jest.advanceTimersByTime(500)
    expect(outline('a')).toBe('2px solid #38bdf8')
  })
})

describe('SEM_CONTORNOS', () => {
  it('não mexe no estilo de nada nem agenda timer', () => {
    SEM_CONTORNOS.marcar(el('a'), 'preenchido')
    SEM_CONTORNOS.marcar(el('b'), 'nao-reconhecido')
    SEM_CONTORNOS.destacar(el('b'))
    SEM_CONTORNOS.limpar()
    expect(outline('a')).toBe('1px dotted red')
    expect(outline('b')).toBe('')
    expect(jest.getTimerCount()).toBe(0)
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

`packages/core/src/navegador/segunda-passada.test.ts` (o da extensão com `vi.` → `jest.` e três casos novos da `Promise`):

```ts
/** @jest-environment jsdom */
import type { Campo } from './dom.js'
import {
  agendarSegundaPassada,
  regravarAlterados,
  SEGUNDA_PASSADA_MS,
  type Escrito,
} from './segunda-passada.js'

beforeEach(() => {
  document.body.innerHTML =
    '<input name="complemento"><input name="rua"><input name="cep">'
})

afterEach(() => {
  jest.useRealTimers()
  document.body.innerHTML = ''
})

const campo = (nome: string) =>
  document.querySelector(`[name="${nome}"]`) as HTMLInputElement

// Simula o que preencherDocumento entrega: o campo já escrito, com o valor lido logo depois.
function escrito(nome: string, valor: string): Escrito {
  campo(nome).value = valor
  return { el: campo(nome), valor, lido: campo(nome).value }
}

describe('regravarAlterados', () => {
  it('regrava o campo que o site mudou depois da nossa escrita, com os eventos de input', () => {
    const complemento = escrito('complemento', 'Apto 81')
    const ouvinte = jest.fn()
    campo('complemento').addEventListener('input', ouvinte)
    campo('complemento').value = 'de 612 a 1510 - lado par'
    regravarAlterados([complemento])
    expect(campo('complemento').value).toBe('Apto 81')
    expect(ouvinte).toHaveBeenCalledTimes(1)
  })

  it('não toca no campo que ficou como estava, nem dispara de novo a busca de CEP', () => {
    const cep = escrito('cep', '01310-100')
    const busca = jest.fn()
    campo('cep').addEventListener('input', busca)
    regravarAlterados([cep])
    expect(busca).not.toHaveBeenCalled()
  })

  it('compara com o valor lido, não com o escrito: máscara que reformatou na hora não conta como mudança', () => {
    campo('cep').value = '01310-100'
    const cep: Escrito = {
      el: campo('cep'),
      valor: '01310100',
      lido: '01310-100',
    }
    const busca = jest.fn()
    campo('cep').addEventListener('input', busca)
    regravarAlterados([cep])
    expect(busca).not.toHaveBeenCalled()
    expect(campo('cep').value).toBe('01310-100')
  })

  it('ignora campo que saiu da página ou ficou desabilitado', () => {
    const rua = escrito('rua', 'Avenida Paulista')
    const complemento = escrito('complemento', 'Apto 81')
    const ruaSolta = campo('rua')
    ruaSolta.value = 'outra'
    ruaSolta.remove()
    campo('complemento').value = 'outro'
    campo('complemento').disabled = true
    expect(() => regravarAlterados([rua, complemento])).not.toThrow()
    expect(ruaSolta.value).toBe('outra')
    expect(campo('complemento').value).toBe('outro')
  })

  it('ignora campo que o site travou depois da busca: fieldset desabilitado ou readonly', () => {
    // el.disabled só reflete o atributo do próprio campo; o <fieldset disabled> desabilita sem tocá-lo.
    const complemento = escrito('complemento', 'Apto 81')
    const rua = escrito('rua', 'Avenida Paulista')
    const fieldset = document.createElement('fieldset')
    document.body.append(fieldset)
    fieldset.append(campo('complemento'))
    campo('complemento').value = 'de 612 a 1510 - lado par'
    fieldset.disabled = true
    campo('rua').value = 'Av. Paulista'
    campo('rua').readOnly = true
    const ouvinte = jest.fn()
    document.body.addEventListener('input', ouvinte)
    regravarAlterados([complemento, rua])
    expect(campo('complemento').value).toBe('de 612 a 1510 - lado par')
    expect(campo('rua').value).toBe('Av. Paulista')
    expect(ouvinte).not.toHaveBeenCalled()
  })
})

describe('agendarSegundaPassada', () => {
  it('agenda uma passada só, ~1 s depois', () => {
    jest.useFakeTimers()
    const complemento = escrito('complemento', 'Apto 81')
    void agendarSegundaPassada([complemento], (acao, ms) => {
      setTimeout(acao, ms)
    })
    campo('complemento').value = 'de 612 a 1510 - lado par'
    jest.advanceTimersByTime(SEGUNDA_PASSADA_MS - 1)
    expect(campo('complemento').value).toBe('de 612 a 1510 - lado par')
    jest.advanceTimersByTime(1)
    expect(campo('complemento').value).toBe('Apto 81')
  })

  it('a Promise só resolve depois da regravação', async () => {
    jest.useFakeTimers()
    const complemento = escrito('complemento', 'Apto 81')
    let resolveu = false
    const promessa = agendarSegundaPassada([complemento], (acao, ms) => {
      setTimeout(acao, ms)
    }).then(() => {
      resolveu = true
    })
    campo('complemento').value = 'de 612 a 1510 - lado par'
    await Promise.resolve()
    expect(resolveu).toBe(false)
    jest.advanceTimersByTime(SEGUNDA_PASSADA_MS)
    await promessa
    expect(resolveu).toBe(true)
    expect(campo('complemento').value).toBe('Apto 81')
  })

  it('sem nada escrito não agenda nada e resolve na hora', async () => {
    const agendar = jest.fn()
    await expect(agendarSegundaPassada([], agendar)).resolves.toBeUndefined()
    expect(agendar).not.toHaveBeenCalled()
  })

  it('se a regravação lança, a Promise rejeita em vez de ficar pendurada', async () => {
    jest.useFakeTimers()
    const quebrado = {
      get isConnected(): boolean {
        throw new Error('campo quebrado')
      },
    } as unknown as Campo
    const promessa = agendarSegundaPassada(
      [{ el: quebrado, valor: 'x', lido: 'y' }],
      (acao, ms) => {
        setTimeout(acao, ms)
      },
    )
    jest.advanceTimersByTime(SEGUNDA_PASSADA_MS)
    await expect(promessa).rejects.toThrow('campo quebrado')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node_modules/.bin/jest src/navegador/registro.test.ts src/navegador/contornos.test.ts src/navegador/segunda-passada.test.ts; echo "EXIT=$?"
```

Esperado: FAIL nos três (`Cannot find module`); EXIT=1.

- [ ] **Step 3: Implementar**

`packages/core/src/navegador/registro.ts`:

```ts
/// <reference lib="dom" />
import type { Campo } from './dom.js'

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

`packages/core/src/navegador/contornos.ts`:

```ts
/// <reference lib="dom" />
import { ehCampo } from './dom.js'

export type TipoContorno = 'preenchido' | 'nao-reconhecido'

export interface Contornos {
  marcar(el: HTMLElement, tipo: TipoContorno): void
  destacar(el: HTMLElement): void
  limpar(): void
}

export const SEM_CONTORNOS: Contornos = {
  marcar() {},
  destacar() {},
  limpar() {},
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

// Longhands também: com só `outline-color` inline o shorthand lê '' e removê-lo apaga os longhands.
const PROPRIEDADES = [
  'outline',
  'outline-color',
  'outline-style',
  'outline-width',
  'outline-offset',
] as const

type Original = [propriedade: string, valor: string, prioridade: string][]

export function criarContornos(
  agendar: (acao: () => void, ms: number) => void,
): Contornos {
  const originais = new WeakMap<HTMLElement, Original>()
  const marcados = new Map<HTMLElement, TipoContorno>()
  const piscando = new Map<HTMLElement, number>()
  let geracao = 0

  function guardarOriginal(el: HTMLElement) {
    if (originais.has(el)) return
    originais.set(
      el,
      PROPRIEDADES.map((propriedade) => [
        propriedade,
        el.style.getPropertyValue(propriedade),
        el.style.getPropertyPriority(propriedade),
      ]),
    )
  }

  function pintar(el: HTMLElement, outline: string) {
    el.style.setProperty('outline', outline, 'important')
    el.style.setProperty('outline-offset', '1px', 'important')
  }

  function restaurar(el: HTMLElement) {
    const original = originais.get(el)
    if (!original) return
    el.style.removeProperty('outline')
    el.style.removeProperty('outline-offset')
    for (const [propriedade, valor, prioridade] of original)
      if (valor) el.style.setProperty(propriedade, valor, prioridade)
  }

  return {
    marcar(el, tipo) {
      guardarOriginal(el)
      marcados.set(el, tipo)
      pintar(el, OUTLINE[tipo])
    },
    destacar(el) {
      guardarOriginal(el)
      const minha = ++geracao
      piscando.set(el, minha)
      const atual = () => piscando.get(el) === minha
      PISCA.forEach((outline, passo) => {
        if (passo === 0) pintar(el, outline)
        else
          agendar(() => {
            if (atual()) pintar(el, outline)
          }, passo * PISCA_MS)
      })
      agendar(() => {
        if (!atual()) return
        piscando.delete(el)
        const tipo = marcados.get(el)
        if (tipo) pintar(el, OUTLINE[tipo])
        else restaurar(el)
      }, PISCA.length * PISCA_MS)
    },
    limpar() {
      for (const el of new Set([...marcados.keys(), ...piscando.keys()]))
        restaurar(el)
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

`packages/core/src/navegador/segunda-passada.ts`:

```ts
/// <reference lib="dom" />
import { escrever, preenchivel, type Campo } from './dom.js'

export interface Escrito {
  el: Campo
  valor: string
  lido: string
}

export const SEGUNDA_PASSADA_MS = 1000

export function regravarAlterados(escritos: readonly Escrito[]): void {
  for (const { el, valor, lido } of escritos) {
    if (el.isConnected && preenchivel(el) && el.value !== lido)
      escrever(el, valor)
  }
}

export function agendarSegundaPassada(
  escritos: readonly Escrito[],
  agendar: (acao: () => void, ms: number) => void,
): Promise<void> {
  if (escritos.length === 0) return Promise.resolve()
  return new Promise((resolver, rejeitar) => {
    agendar(() => {
      try {
        regravarAlterados(escritos)
        resolver()
      } catch (erro) {
        rejeitar(erro)
      }
    }, SEGUNDA_PASSADA_MS)
  })
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node_modules/.bin/jest src/navegador; echo "EXIT=$?"
```

Esperado: PASS; EXIT=0.

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core run lint; echo "EXIT=$?"
```

Esperado: EXIT=0.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/navegador/registro.ts packages/core/src/navegador/registro.test.ts packages/core/src/navegador/contornos.ts packages/core/src/navegador/contornos.test.ts packages/core/src/navegador/segunda-passada.ts packages/core/src/navegador/segunda-passada.test.ts && /usr/bin/git commit -m "feat(core): registro, contornos e 2ª passada com Promise no motor DOM"; echo "EXIT=$?"
```

---

### Task 3: `preencherDocumento` com raiz recebida, API da página e barrel

**Files:**

- Create: `packages/core/src/navegador/preencher.ts`, `preencher.test.ts`
- Create: `packages/core/src/navegador/pagina.ts`, `pagina.test.ts`
- Create: `packages/core/src/navegador/iife.ts`
- Create: `packages/core/src/navegador/index.ts`

**Interfaces:**

- Consumes: Tasks 1 e 2; `classificarFormulario(ds: FieldDescriptor[], hojeISO: string)` de `../campos.js`; `valorPara(kind, pessoa, d, dicas?)` de `../campos-formatar.js`; `type Pessoa` de `../pessoa.js`; `montarPessoa(rng, hojeISO)` de `../pessoa.js` e `sfc32` de `../prng.js` (só nos testes).
- Produces:
  - `interface LinhaDoFrame { idx: number; rotulo: string; seletor: string }`
  - `interface ResultadoFrame { preenchidos: LinhaDoFrame[]; naoReconhecidos: LinhaDoFrame[]; recusados: LinhaDoFrame[]; contentType: string; iframesDeFora: number }`
  - `interface OpcoesDePreencher { raiz: Document | ShadowRoot | Element; pessoa: Pessoa; hojeISO: string; registro: Registro; contornos: Contornos; raizSombra?: RaizSombra; aoEscrever?: (escrito: Escrito) => void }`
  - `preencherDocumento(opcoes: OpcoesDePreencher): ResultadoFrame`, `contarIframesDeFora(raiz: ParentNode): number`
  - `NOME_DO_GLOBAL = '__botaiNavegador'`, `interface OpcoesNaPagina { segundaPassada: boolean }`, `interface ApiDoNavegador { preencher(alvo: Document | Element, pessoa: Pessoa, hojeISO: string, opcoes: OpcoesNaPagina): Promise<ResultadoFrame> }`, `preencherNaPagina(...)` com a mesma assinatura, `instalarNoGlobal(alvo?: object): void`
  - `index.ts` reexporta tudo isso e o que as Tasks 1 e 2 produziram.

- [ ] **Step 1: Escrever os testes que falham**

`packages/core/src/navegador/preencher.test.ts` (o da extensão portado: o stub do `fakeBrowser` sai, porque o adaptador padrão faz o mesmo `el.shadowRoot`; mais os casos de raiz `Element` e de adaptador):

```ts
/** @jest-environment jsdom */
import { montarPessoa } from '../pessoa.js'
import { sfc32 } from '../prng.js'
import { criarContornos } from './contornos.js'
import type { RaizSombra } from './dom.js'
import { garantirCssEscape, simularLayout } from './layout-teste.js'
import { contarIframesDeFora, preencherDocumento } from './preencher.js'
import { criarRegistro } from './registro.js'

garantirCssEscape()

const HOJE = '2026-10-01'
const P = montarPessoa(sfc32(1, 2, 3, 4), HOJE)
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

function preencher(
  raiz: Document | Element = document,
  raizSombra?: RaizSombra,
) {
  const registro = criarRegistro()
  const contornos = criarContornos((acao, ms) => setTimeout(acao, ms))
  return {
    resultado: preencherDocumento({
      raiz,
      pessoa: P,
      hojeISO: HOJE,
      registro,
      contornos,
      raizSombra,
    }),
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
    const ouvinte = jest.fn()
    campo('nome').addEventListener('input', ouvinte)
    const { resultado } = preencher()
    expect(ouvinte).not.toHaveBeenCalled()
    expect(resultado.preenchidos.map((l) => l.rotulo)).toContain(
      'Nome completo',
    )
  })

  it('select reconhecido sem a opção da pessoa vai para recusados, sem escolher outra nem disparar change', () => {
    document.body.innerHTML = `
      <label>Estado <select name="uf">
        <option value="">Selecione</option>
        <option value="ZZ">Zzzlândia</option>
      </select></label>`
    const uf = document.querySelector('select') as HTMLSelectElement
    const ouvinte = jest.fn()
    uf.addEventListener('change', ouvinte)
    const { resultado } = preencher()
    expect(semIdx(resultado.recusados)).toEqual([
      { rotulo: 'Estado', seletor: 'select[name="uf"]' },
    ])
    expect(resultado.naoReconhecidos).toEqual([])
    expect(resultado.preenchidos).toEqual([])
    expect(uf.value).toBe('')
    expect(ouvinte).not.toHaveBeenCalled()
    expect(uf.style.getPropertyValue('outline')).toBe('2px dashed #f5b82e')
  })

  it('campo sem label usa o aria-label como rótulo, e o label visível vence o aria-label', () => {
    document.body.innerHTML = `
      <input aria-label="Cupom de desconto" name="c1" placeholder="ABC123">
      <label>Apelido <input aria-label="ap-x" name="ap"></label>`
    const { resultado } = preencher()
    const rotulos = [
      ...resultado.preenchidos,
      ...resultado.naoReconhecidos,
      ...resultado.recusados,
    ]
      .sort((a, b) => a.idx - b.idx)
      .map((l) => l.rotulo)
    expect(rotulos).toEqual(['Cupom de desconto', 'Apelido'])
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

  it('avisa cada campo que escreveu, com o valor lido logo depois; não avisa o que já estava certo nem o recusado', () => {
    campo('nome').value = P.nome.completo
    const escritos: { nome: string; valor: string; lido: string }[] = []
    preencherDocumento({
      raiz: document,
      pessoa: P,
      hojeISO: HOJE,
      registro: criarRegistro(),
      contornos: criarContornos((acao, ms) => setTimeout(acao, ms)),
      aoEscrever: (e) =>
        escritos.push({ nome: e.el.name, valor: e.valor, lido: e.lido }),
    })
    const cpfSoDigitos = P.cpf.replace(/\D/g, '')
    expect(escritos).toEqual([
      { nome: 'email', valor: P.email.endereco, lido: P.email.endereco },
      { nome: 'cpf', valor: cpfSoDigitos, lido: cpfSoDigitos },
    ])
  })

  it('raiz Element preenche só os campos dentro dela', () => {
    document.body.innerHTML =
      '<form id="a"><label>Nome completo <input name="nome"></label></form><form id="b"><label>E-mail <input type="email" name="email"></label></form>'
    const { resultado } = preencher(document.getElementById('a') as HTMLElement)
    expect(semIdx(resultado.preenchidos)).toEqual([
      { rotulo: 'Nome completo', seletor: 'input[name="nome"]' },
    ])
    expect(campo('nome').value).toBe(P.nome.completo)
    expect(campo('email').value).toBe('')
  })

  it('raiz que é o próprio campo preenche só ele', () => {
    const { resultado } = preencher(campo('email'))
    expect(semIdx(resultado.preenchidos)).toEqual([
      { rotulo: 'E-mail', seletor: 'input[name="email"]' },
    ])
    expect(campo('nome').value).toBe('')
  })

  it('o adaptador recebido abre a shadow root fechada; sem ele, ela fica de fora', () => {
    document.body.innerHTML = '<x-campo></x-campo>'
    const host = document.querySelector('x-campo') as HTMLElement
    const fechada = host.attachShadow({ mode: 'closed' })
    fechada.innerHTML = '<label>CPF <input name="cpf"></label>'
    expect(preencher().resultado.preenchidos).toEqual([])
    const { resultado } = preencher(document, (el) =>
      el === host ? fechada : el.shadowRoot,
    )
    expect(semIdx(resultado.preenchidos)).toEqual([
      { rotulo: 'CPF', seletor: 'x-campo › input[name="cpf"]' },
    ])
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

  it('com raiz Element, conta só os de dentro dela', () => {
    document.body.innerHTML =
      '<form id="f"><iframe id="dentro"></iframe></form><iframe id="fora"></iframe>'
    for (const id of ['dentro', 'fora'])
      Object.defineProperty(document.getElementById(id), 'contentDocument', {
        value: null,
      })
    expect(
      contarIframesDeFora(document.getElementById('f') as HTMLElement),
    ).toBe(1)
  })
})
```

`packages/core/src/navegador/pagina.test.ts`:

```ts
/** @jest-environment jsdom */
import { montarPessoa } from '../pessoa.js'
import { sfc32 } from '../prng.js'
import { garantirCssEscape, simularLayout } from './layout-teste.js'
import {
  instalarNoGlobal,
  NOME_DO_GLOBAL,
  preencherNaPagina,
  type ApiDoNavegador,
} from './pagina.js'
import { SEGUNDA_PASSADA_MS } from './segunda-passada.js'

garantirCssEscape()

const HOJE = '2026-10-01'
const P = montarPessoa(sfc32(1, 2, 3, 4), HOJE)
let desfazerLayout: () => void

beforeEach(() => {
  desfazerLayout = simularLayout()
  document.body.innerHTML =
    '<form id="endereco"><label>Complemento <input name="complemento"></label></form><label>Nome completo <input name="nome"></label>'
})

afterEach(() => {
  jest.useRealTimers()
  desfazerLayout()
  document.body.innerHTML = ''
})

const campo = (nome: string) =>
  document.querySelector(`[name="${nome}"]`) as HTMLInputElement

describe('preencherNaPagina', () => {
  it('só resolve depois da 2ª passada, que desfaz o que o site sobrescreveu', async () => {
    jest.useFakeTimers()
    let resolveu = false
    const promessa = preencherNaPagina(document, P, HOJE, {
      segundaPassada: true,
    }).then((resultado) => {
      resolveu = true
      return resultado
    })
    campo('complemento').value = 'de 612 a 1510 - lado par'
    await Promise.resolve()
    expect(resolveu).toBe(false)
    jest.advanceTimersByTime(SEGUNDA_PASSADA_MS)
    const resultado = await promessa
    expect(campo('complemento').value).toBe(P.endereco.complemento)
    expect(resultado.preenchidos.map((l) => l.rotulo)).toEqual([
      'Complemento',
      'Nome completo',
    ])
  })

  it('com segundaPassada false resolve sem agendar nada', async () => {
    jest.useFakeTimers()
    const resultado = await preencherNaPagina(document, P, HOJE, {
      segundaPassada: false,
    })
    expect(jest.getTimerCount()).toBe(0)
    expect(resultado.preenchidos).toHaveLength(2)
  })

  it('não pinta contorno nenhum', async () => {
    await preencherNaPagina(document, P, HOJE, { segundaPassada: false })
    expect(campo('nome').style.getPropertyValue('outline')).toBe('')
    expect(campo('complemento').style.getPropertyValue('outline')).toBe('')
  })

  it('com um Element, preenche só dentro dele', async () => {
    const resultado = await preencherNaPagina(
      document.getElementById('endereco') as HTMLElement,
      P,
      HOJE,
      { segundaPassada: false },
    )
    expect(resultado.preenchidos.map((l) => l.rotulo)).toEqual(['Complemento'])
    expect(campo('nome').value).toBe('')
  })
})

describe('instalarNoGlobal', () => {
  it('pendura a API num nome só, __botaiNavegador', () => {
    const alvo: Record<string, unknown> = {}
    instalarNoGlobal(alvo)
    expect(NOME_DO_GLOBAL).toBe('__botaiNavegador')
    expect(Object.keys(alvo)).toEqual([NOME_DO_GLOBAL])
    expect((alvo[NOME_DO_GLOBAL] as ApiDoNavegador).preencher).toBe(
      preencherNaPagina,
    )
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node_modules/.bin/jest src/navegador/preencher.test.ts src/navegador/pagina.test.ts; echo "EXIT=$?"
```

Esperado: FAIL (`Cannot find module './preencher.js'` / `'./pagina.js'`); EXIT=1.

- [ ] **Step 3: Implementar**

`packages/core/src/navegador/preencher.ts`:

```ts
/// <reference lib="dom" />
import { classificarFormulario } from '../campos.js'
import { valorPara } from '../campos-formatar.js'
import type { Pessoa } from '../pessoa.js'
import type { Contornos } from './contornos.js'
import {
  cabe,
  campos,
  descrever,
  escrever,
  leuDeVolta,
  preenchivel,
  raizSombraAberta,
  seletor,
  visivel,
  type RaizSombra,
} from './dom.js'
import type { Registro } from './registro.js'
import type { Escrito } from './segunda-passada.js'

export interface LinhaDoFrame {
  idx: number
  rotulo: string
  seletor: string
}

export interface ResultadoFrame {
  preenchidos: LinhaDoFrame[]
  naoReconhecidos: LinhaDoFrame[]
  recusados: LinhaDoFrame[]
  contentType: string
  iframesDeFora: number
}

export interface OpcoesDePreencher {
  raiz: Document | ShadowRoot | Element
  pessoa: Pessoa
  hojeISO: string
  registro: Registro
  contornos: Contornos
  raizSombra?: RaizSombra
  aoEscrever?: (escrito: Escrito) => void
}

export function contarIframesDeFora(raiz: ParentNode): number {
  return Array.from(
    raiz.querySelectorAll<HTMLIFrameElement>('iframe, frame'),
  ).filter((quadro) => quadro.contentDocument === null).length
}

export function preencherDocumento({
  raiz,
  pessoa,
  hojeISO,
  registro,
  contornos,
  raizSombra = raizSombraAberta,
  aoEscrever,
}: OpcoesDePreencher): ResultadoFrame {
  const elementos = Array.from(campos(raiz, raizSombra)).filter(
    (el) => preenchivel(el) && visivel(el),
  )
  const descritores = elementos.map((el) => descrever(el))
  const classes = classificarFormulario(descritores, hojeISO)
  const resultado: ResultadoFrame = {
    preenchidos: [],
    naoReconhecidos: [],
    recusados: [],
    contentType: ((raiz.ownerDocument ?? raiz) as Document).contentType,
    iframesDeFora: contarIframesDeFora(raiz),
  }

  elementos.forEach((el, i) => {
    const classe = classes[i]
    const kind = classe?.kind
    if (kind === 'ignorar') return
    const d = descritores[i]
    const linha = {
      idx: registro.guardar(el),
      rotulo: d.label || d.ariaLabel || d.placeholder || d.name,
      seletor: seletor(el),
    }
    if (kind === undefined) {
      resultado.naoReconhecidos.push(linha)
      contornos.marcar(el, 'nao-reconhecido')
      return
    }
    const valor = valorPara(kind, pessoa, d, classe?.dicas)
    if (valor !== null && cabe(valor, d)) {
      const escreveu = el.value !== valor
      if (escreveu) escrever(el, valor)
      if (leuDeVolta(el, valor)) {
        if (escreveu) aoEscrever?.({ el, valor, lido: el.value })
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

`packages/core/src/navegador/pagina.ts`:

```ts
/// <reference lib="dom" />
import type { Pessoa } from '../pessoa.js'
import { SEM_CONTORNOS } from './contornos.js'
import { preencherDocumento, type ResultadoFrame } from './preencher.js'
import { criarRegistro } from './registro.js'
import { agendarSegundaPassada, type Escrito } from './segunda-passada.js'

export const NOME_DO_GLOBAL = '__botaiNavegador'

export interface OpcoesNaPagina {
  segundaPassada: boolean
}

export interface ApiDoNavegador {
  preencher(
    alvo: Document | Element,
    pessoa: Pessoa,
    hojeISO: string,
    opcoes: OpcoesNaPagina,
  ): Promise<ResultadoFrame>
}

export async function preencherNaPagina(
  alvo: Document | Element,
  pessoa: Pessoa,
  hojeISO: string,
  opcoes: OpcoesNaPagina,
): Promise<ResultadoFrame> {
  const escritos: Escrito[] = []
  const resultado = preencherDocumento({
    raiz: alvo,
    pessoa,
    hojeISO,
    registro: criarRegistro(),
    contornos: SEM_CONTORNOS,
    aoEscrever: (escrito) => escritos.push(escrito),
  })
  if (opcoes.segundaPassada)
    await agendarSegundaPassada(escritos, (acao, ms) => {
      setTimeout(acao, ms)
    })
  return resultado
}

export function instalarNoGlobal(alvo: object = globalThis): void {
  const api: ApiDoNavegador = { preencher: preencherNaPagina }
  Object.assign(alvo, { [NOME_DO_GLOBAL]: api })
}
```

`packages/core/src/navegador/iife.ts`:

```ts
/// <reference lib="dom" />
import { instalarNoGlobal } from './pagina.js'

instalarNoGlobal()
```

`packages/core/src/navegador/index.ts`:

```ts
/// <reference lib="dom" />
export {
  cabe,
  campos,
  descrever,
  ehCampo,
  elementoEmFoco,
  escrever,
  leuDeVolta,
  preenchivel,
  raizSombraAberta,
  seletor,
  tipoNaoPreenchivel,
  visivel,
  type Campo,
  type RaizSombra,
} from './dom.js'
export { criarRegistro, type Registro } from './registro.js'
export {
  cliqueDoUsuarioEmCampo,
  criarContornos,
  SEM_CONTORNOS,
  type Contornos,
  type TipoContorno,
} from './contornos.js'
export {
  agendarSegundaPassada,
  regravarAlterados,
  SEGUNDA_PASSADA_MS,
  type Escrito,
} from './segunda-passada.js'
export {
  contarIframesDeFora,
  preencherDocumento,
  type LinhaDoFrame,
  type OpcoesDePreencher,
  type ResultadoFrame,
} from './preencher.js'
export {
  instalarNoGlobal,
  NOME_DO_GLOBAL,
  preencherNaPagina,
  type ApiDoNavegador,
  type OpcoesNaPagina,
} from './pagina.js'
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node_modules/.bin/jest src/navegador; echo "EXIT=$?"
```

Esperado: PASS; EXIT=0.

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core run lint && pnpm --filter @pilutech/botai-core run test; echo "EXIT=$?"
```

Esperado: EXIT=0 (o core inteiro, dourados inclusos, segue verde).

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/navegador/preencher.ts packages/core/src/navegador/preencher.test.ts packages/core/src/navegador/pagina.ts packages/core/src/navegador/pagina.test.ts packages/core/src/navegador/iife.ts packages/core/src/navegador/index.ts && /usr/bin/git commit -m "feat(core): preencherDocumento com raiz recebida e API da página para o IIFE"; echo "EXIT=$?"
```

---

### Task 4: Build do subpath `/navegador` e do IIFE, core 0.4.0

**Files:**

- Create: `packages/core/scripts/construir-iife.mjs`
- Create: `packages/core/src/navegador/iife.test.ts`
- Modify: `packages/core/package.json` (versão, `exports`, `build`, `devDependencies.esbuild`)
- Modify: `packages/core/scripts/pacote.test.mjs` (constante `EXTRAS`, achada na Task 1)
- Modify: `packages/core/src/versao.ts` (regravado pelo `gerar-versao.mjs` da fase 1)
- Modify: `packages/core/CLAUDE.md`, `packages/core/README.md` (e exemplos com a versão em `README.md`/`CLAUDE.md` da raiz, se houver)

**Interfaces:**

- Consumes: `src/navegador/iife.ts` e `src/navegador/index.ts` (Task 3).
- Produces: `@pilutech/botai-core/navegador` (ESM + tipos) e `@pilutech/botai-core/navegador.iife.js` (arquivo que, executado, cria só `globalThis.__botaiNavegador`). `node scripts/construir-iife.mjs [saída]` (padrão `dist/navegador.iife.js`).

- [ ] **Step 1: Escrever o teste que falha**

`packages/core/src/navegador/iife.test.ts`:

```ts
/** @jest-environment node */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createContext, runInContext } from 'node:vm'

const SCRIPT = resolve(__dirname, '../../scripts/construir-iife.mjs')

describe('navegador.iife.js', () => {
  it('executado numa página vazia, cria só o global __botaiNavegador, com preencher', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'botai-iife-'))
    try {
      const saida = join(pasta, 'navegador.iife.js')
      execFileSync(process.execPath, [SCRIPT, saida])
      const pagina = createContext({})
      runInContext(readFileSync(saida, 'utf8'), pagina)
      expect(Object.keys(pagina)).toEqual(['__botaiNavegador'])
      expect(typeof pagina.__botaiNavegador.preencher).toBe('function')
    } finally {
      rmSync(pasta, { recursive: true, force: true })
    }
  }, 30_000)
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node_modules/.bin/jest src/navegador/iife.test.ts; echo "EXIT=$?"
```

Esperado: FAIL com `Cannot find module '.../scripts/construir-iife.mjs'` vindo do `execFileSync`; EXIT=1.

- [ ] **Step 3: esbuild e o script**

A versão do esbuild é a que o Vite já traz no lockfile (dedupe). Confira e instale:

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/grep -nE "^  esbuild@" pnpm-lock.yaml; echo "EXIT=$?"
```

Esperado: `esbuild@0.28.1` na lista (é a do `vite@7.3.6`). Se o lockfile tiver outra versão usada pelo Vite, use essa no comando abaixo.

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core add -D -E esbuild@0.28.1; echo "EXIT=$?"
```

`packages/core/scripts/construir-iife.mjs`:

```js
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const saida = process.argv[2] ?? `${raiz}dist/navegador.iife.js`

await build({
  entryPoints: [`${raiz}src/navegador/iife.ts`],
  outfile: saida,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  legalComments: 'none',
  logLevel: 'warning',
})
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node_modules/.bin/jest src/navegador/iife.test.ts; echo "EXIT=$?"
```

Esperado: PASS; EXIT=0.

- [ ] **Step 5: `package.json` do core**

1. Versão `0.4.0` e o `src/versao.ts` regravado (o `MOTOR` sai dele, gerado pela fase 1; o `lint` barra o arquivo fora de dia), pelo mesmo caminho da fase 2:

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && pnpm version 0.4.0 --no-git-tag-version && node scripts/gerar-versao.mjs && /bin/cat src/versao.ts; echo "EXIT=$?"
```

Esperado: `export const MOTOR: string = '0.4.0'`; EXIT=0.

2. `exports`, `publishConfig.exports` e `build`. Subpath novo entra **nos dois manifestos** (contrato, "Publicação no npm e environments"): a entrada `./navegador` copia a de `./pessoa` em cada um, trocando `pessoa` por `navegador/index`, como a fase 1 fez para a raiz; o IIFE é um arquivo só, sem tipos, e aponta para o `dist` nos dois (o workspace também o lê de lá: o plugin builda o core antes):

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -e '
const fs = require("fs")
const p = JSON.parse(fs.readFileSync("package.json", "utf8"))
for (const m of [p.exports, p.publishConfig.exports]) {
  m["./navegador"] = JSON.parse(JSON.stringify(m["./pessoa"]).replaceAll("pessoa", "navegador/index"))
  m["./navegador.iife.js"] = "./dist/navegador.iife.js"
}
p.scripts.build = p.scripts.build + " && node scripts/construir-iife.mjs"
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n")
'; node -p 'const p = require("./package.json"); JSON.stringify([p.exports["./navegador"], p.publishConfig.exports["./navegador"], p.exports["./navegador.iife.js"], p.publishConfig.exports["./navegador.iife.js"], p.scripts.build])'; echo "EXIT=$?"
```

Esperado: `"./src/navegador/index.ts"` (workspace), `{"types":"./dist/navegador/index.d.ts","default":"./dist/navegador/index.js"}` (tarball), `"./dist/navegador.iife.js"` duas vezes e o `build` terminando em `node scripts/construir-iife.mjs`; EXIT=0. Se o `build` for um bundler com lista de entradas (regra R2 da fase 1) em vez de `tsc`, acrescente também `src/navegador/index.ts` a essa lista.

3. Versões antigas escritas à mão:

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/grep -rn "0\.3\.0" packages/core README.md CLAUDE.md --include=*.ts --include=*.json --include=*.mjs --include=*.md --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dourado; echo "EXIT=$?"
```

Classifique cada linha: (a) exemplo de uso que mostra a versão atual (ex.: `ghcr.io/piluvitu/botai:0.3.0`, `BOTAI_VERSAO=0.3.0` e o `@pilutech/botai-core@0.3.0` dos exemplos de Python e Go no README e nos `CLAUDE.md`) → troque para `0.4.0`; (b) valor fixo de teste que não é a versão do pacote (ex.: o `BOTAI_VERSAO: '0.3.0'` e o `/download/core-v0.3.0/…` do `scripts/install.test.ts`) ou histórico (ex.: o título "Servidor, imagem e binários (fase 2, 0.3.0)" do `packages/core/CLAUDE.md`) → deixe; (c) teste que fixa o `MOTOR` em texto → troque para ler do `package.json`, como a fase 2 mandou. Rode o comando de novo e confira que só sobraram linhas do tipo (b).

- [ ] **Step 6: Build e o subpath de verdade**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core run build && /bin/ls packages/core/dist/navegador.iife.js packages/core/dist/navegador/index.js packages/core/dist/navegador/index.d.ts; echo "EXIT=$?"
```

Esperado: os três arquivos existem; EXIT=0.

O workspace aponta `./navegador` para o `.ts` de `src/` (o Node não o carrega: import sem extensão), então a lista sai do `dist`, que é o que o tarball publica; o IIFE resolve pelo nome do pacote, como o plugin o lê:

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node --input-type=module -e "const m = await import('./dist/navegador/index.js'); console.log(Object.keys(m).sort().join(','))" && cd /Users/piluvitu/PILUTECH/Botai/extensao && node -e "console.log(require.resolve('@pilutech/botai-core/navegador.iife.js'))"; echo "EXIT=$?"
```

Esperado: a primeira linha é exatamente
`NOME_DO_GLOBAL,SEGUNDA_PASSADA_MS,SEM_CONTORNOS,agendarSegundaPassada,cabe,campos,cliqueDoUsuarioEmCampo,contarIframesDeFora,criarContornos,criarRegistro,descrever,ehCampo,elementoEmFoco,escrever,instalarNoGlobal,leuDeVolta,preencherDocumento,preencherNaPagina,preenchivel,raizSombraAberta,regravarAlterados,seletor,tipoNaoPreenchivel,visivel`
e a segunda termina em `packages/core/dist/navegador.iife.js`; EXIT=0.

- [ ] **Step 7: Lista fechada do pacote**

Na constante `EXTRAS` de `packages/core/scripts/pacote.test.mjs` (Task 1), acrescente, no padrão das entradas que já estão lá (se a fase 0 emite `.map` para os outros módulos, inclua os `.map` correspondentes; `dist/navegador.iife.js` e `dist/navegador/index.*` o `publishConfig.exports` já deriva, e a lista não repete):

```
dist/navegador.iife.js
dist/navegador/contornos.d.ts
dist/navegador/contornos.js
dist/navegador/dom.d.ts
dist/navegador/dom.js
dist/navegador/iife.d.ts
dist/navegador/iife.js
dist/navegador/index.d.ts
dist/navegador/index.js
dist/navegador/pagina.d.ts
dist/navegador/pagina.js
dist/navegador/preencher.d.ts
dist/navegador/preencher.js
dist/navegador/registro.d.ts
dist/navegador/registro.js
dist/navegador/segunda-passada.d.ts
dist/navegador/segunda-passada.js
```

Nada de `*.test.*` nem `layout-teste.*`. Rode a conferência da fase 0 do jeito que o `ci.yml` a roda (o comando está no job do core) e espere EXIT=0. Ela também exige `./navegador` e `./navegador.iife.js` nos dois manifestos e carrega o `dist/navegador/index.js` no Node: se esse import falhar por DOM no topo de um módulo, é bug do motor (DOM só dentro das funções), não da conferência.

- [ ] **Step 8: `packages/core/CLAUDE.md` e `packages/core/README.md`**

Acrescente a seção:

```markdown
## Motor DOM (`/navegador`, desde a 0.4.0)

- **O que é:** o motor de preenchimento que morava em `extensao/src/entrypoints/preencher.content/`: `campos`, `preenchivel`, `visivel`, `descrever`, `seletor`, `escrever`, `leuDeVolta`, `cabe`, `elementoEmFoco`, registro, contornos, 2ª passada e `preencherDocumento`. Sem API de extensão: quem chama injeta o que é do ambiente.
- **Raiz recebida:** `Document`, `ShadowRoot` ou `Element` (um `<form>`, uma seção ou o próprio campo). O documento é o `ownerDocument` da raiz, nunca o `document` global.
- **Shadow root fechada:** adaptador `RaizSombra` injetado; o padrão `raizSombraAberta` só enxerga `el.shadowRoot`. A extensão passa o dela (`browser.dom.openOrClosedShadowRoot` no Chromium, o atributo `openOrClosedShadowRoot` no Firefox). O Playwright não alcança raiz fechada.
- **2ª passada:** `agendarSegundaPassada` devolve `Promise<void>`, que resolve depois da regravação (ou rejeita se ela lançar). A extensão a descarta com `void`; o Playwright espera.
- **API da página:** `preencherNaPagina(alvo, pessoa, hojeISO, { segundaPassada })` usa `SEM_CONTORNOS` (não pinta nada) e um registro novo por chamada; `instalarNoGlobal()` a pendura em `globalThis.__botaiNavegador` (`NOME_DO_GLOBAL`).
- **IIFE:** `scripts/construir-iife.mjs` (esbuild na versão exata do Vite do lockfile) gera `dist/navegador.iife.js` no fim do `build`; o subpath `@pilutech/botai-core/navegador.iife.js` aponta para ele. Executado, cria só `globalThis.__botaiNavegador` (provado em `src/navegador/iife.test.ts`, num `vm` vazio). É o arquivo que o `@pilutech/botai-playwright` injeta por `frame.evaluate`.
- **Tipos de DOM:** todo arquivo de `src/navegador/` que não é teste começa com `/// <reference lib="dom" />`. Isso põe o DOM no programa inteiro do `tsconfig.json`; a prova de que o resto do core não usa DOM é o `tsconfig.sem-dom.json` (exclui `src/navegador`), rodado no `lint`.
- **Testes:** Jest com `/** @jest-environment jsdom */` por arquivo; `layout-teste.ts` simula layout e `CSS.escape`, que o jsdom não tem. São os testes Vitest da extensão portados (`vi.` → `jest.`) com o adaptador por parâmetro, mais raiz `Element`/campo/host e a `Promise` da 2ª passada. A extensão manteve os dela, intocados.
- **Portabilidade:** a trava `src/portabilidade.test.ts` aceita `document.` e `window.` só em `src/navegador/`; API de Node continua proibida lá dentro (o mesmo código roda na página).
- **Mudou o motor?** Rode também o Vitest e o E2E da extensão e o E2E do `packages/playwright`: os três preenchem com este código.
```

No `packages/core/README.md` (o que aparece no npm), acrescente a seção:

````markdown
## Motor de preenchimento no navegador (`/navegador`, desde a 0.4.0)

O mesmo motor da extensão Botaí, para rodar dentro de uma página: acha os campos (inclusive em shadow root aberta), reconhece cada um, escreve pelo setter nativo com `focus`/`input`/`change`/`blur` sintéticos (React controlado e máscaras enxergam o valor) e confere o que ficou.

```ts
import { gerarPessoa, hojeEmSaoPaulo } from '@pilutech/botai-core'
import { preencherNaPagina } from '@pilutech/botai-core/navegador'

const hoje = hojeEmSaoPaulo()
const pessoa = gerarPessoa({ semente: 'cadastro', hoje })
const resultado = await preencherNaPagina(document, pessoa, hoje, {
  segundaPassada: true,
})
// resultado.preenchidos, resultado.naoReconhecidos, resultado.recusados
```

- O alvo pode ser o `document` ou um `Element` (um `<form>`, uma seção, um campo só).
- `segundaPassada: true` espera 1 s e regrava o que o site sobrescreveu (busca de CEP); a Promise só resolve depois.
- Sem bundler, `@pilutech/botai-core/navegador.iife.js` é um script que cria só `globalThis.__botaiNavegador` (`{ preencher }`, a mesma `preencherNaPagina`). Serve para `page.addInitScript({ path })` ou `page.evaluate(<texto do arquivo>)`. No Playwright, use direto o [`@pilutech/botai-playwright`](https://www.npmjs.com/package/@pilutech/botai-playwright).
- Shadow root fechada só entra com um adaptador (`raizSombra`) que o ambiente forneça, como a extensão faz.
````

- [ ] **Step 9: Lint, testes e commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core run lint && pnpm --filter @pilutech/botai-core run test && pnpm dedupe --check; echo "EXIT=$?"
```

Esperado: EXIT=0.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/scripts/construir-iife.mjs packages/core/src/navegador/iife.test.ts packages/core/src/versao.ts packages/core/package.json packages/core/CLAUDE.md packages/core/README.md pnpm-lock.yaml && /usr/bin/git add -u packages/core .github scripts README.md CLAUDE.md && /usr/bin/git commit -m "build(core): subpath /navegador e IIFE do motor DOM na 0.4.0"; echo "EXIT=$?"
```

---

### Task 5: A extensão passa a usar o motor do core

**Files:**

- Modify: `extensao/src/entrypoints/preencher.content/dom.ts` (vira adaptador + reexportação)
- Modify: `extensao/src/entrypoints/preencher.content/preencher.ts` (vira casca do `preencherDocumento` do core)
- Modify: `extensao/src/entrypoints/preencher.content/contornos.ts`, `registro.ts`, `segunda-passada.ts` (reexportam o core)
- Modify: `extensao/src/entrypoints/preencher.content/api.ts` (`void` na 2ª passada)
- Modify: `extensao/src/lib/resultado.ts` (`ResultadoFrame` vem do core)
- Modify: `extensao/CLAUDE.md`
- Modify (se preciso): `.github/workflows/botai-e2e.yml` e `.github/workflows/botai-release.yml` (paths); `extensao/wxt.config.ts` (`includeSources`), `extensao/SOURCE-CODE-REVIEW.md` e `extensao/scripts/reproduzir-fontes.sh` (só se a reprodução da AMO do Step 5b exigir)
- **Não muda:** nenhum `*.test.ts`, `*.test.tsx` ou `*.e2e.ts` da extensão.

**Interfaces:**

- Consumes: `@pilutech/botai-core/navegador` (Task 4).
- Produces: `raizSombraDaExtensao(el: Element): ShadowRoot | null` em `preencher.content/dom.ts`; as demais exportações dos cinco arquivos ficam com os mesmos nomes e assinaturas de antes (`campos(raiz: Document | ShadowRoot)`, `elementoEmFoco(doc: Document)`, `preencherDocumento(pessoa, hojeISO, registro, contornos, aoEscrever?)`, `contarIframesDeFora`, `criarContornos`, `cliqueDoUsuarioEmCampo`, `criarRegistro`, `agendarSegundaPassada`, `regravarAlterados`, `SEGUNDA_PASSADA_MS` e os tipos).

Refatoração com rede pronta: o "vermelho" deste ciclo é qualquer teste atual que quebrar; a linha de base (N testes) foi anotada na Task 1.

- [ ] **Step 1: Trocar os cinco arquivos do content script**

`extensao/src/entrypoints/preencher.content/dom.ts`:

```ts
import {
  campos as camposDoMotor,
  elementoEmFoco as elementoEmFocoDoMotor,
  type Campo,
} from '@pilutech/botai-core/navegador'
import { browser } from 'wxt/browser'

export {
  cabe,
  descrever,
  ehCampo,
  escrever,
  leuDeVolta,
  preenchivel,
  seletor,
  tipoNaoPreenchivel,
  visivel,
  type Campo,
} from '@pilutech/botai-core/navegador'

type ComRaizFechada = Element & {
  readonly openOrClosedShadowRoot?: ShadowRoot | null
}

export function raizSombraDaExtensao(el: Element): ShadowRoot | null {
  if (el.shadowRoot) return el.shadowRoot
  if (!(el instanceof HTMLElement)) return null
  // O Firefox não tem browser.dom: o equivalente é um atributo do elemento (não método), só em content scripts.
  return import.meta.env.FIREFOX
    ? ((el as ComRaizFechada).openOrClosedShadowRoot ?? null)
    : (browser.dom.openOrClosedShadowRoot(el) ?? null)
}

export function campos(raiz: Document | ShadowRoot): Generator<Campo> {
  return camposDoMotor(raiz, raizSombraDaExtensao)
}

export function elementoEmFoco(doc: Document): Element | null {
  return elementoEmFocoDoMotor(doc, raizSombraDaExtensao)
}
```

`extensao/src/entrypoints/preencher.content/preencher.ts`:

```ts
import { preencherDocumento as preencherNoMotor } from '@pilutech/botai-core/navegador'
import type { Pessoa } from '@pilutech/botai-core/pessoa'
import type { ResultadoFrame } from '../../lib/resultado'
import type { Contornos } from './contornos'
import { raizSombraDaExtensao } from './dom'
import type { Registro } from './registro'
import type { Escrito } from './segunda-passada'

export { contarIframesDeFora } from '@pilutech/botai-core/navegador'

export function preencherDocumento(
  pessoa: Pessoa,
  hojeISO: string,
  registro: Registro,
  contornos: Contornos,
  aoEscrever?: (escrito: Escrito) => void,
): ResultadoFrame {
  return preencherNoMotor({
    raiz: document,
    pessoa,
    hojeISO,
    registro,
    contornos,
    raizSombra: raizSombraDaExtensao,
    aoEscrever,
  })
}
```

`extensao/src/entrypoints/preencher.content/contornos.ts`:

```ts
export {
  cliqueDoUsuarioEmCampo,
  criarContornos,
  type Contornos,
  type TipoContorno,
} from '@pilutech/botai-core/navegador'
```

`extensao/src/entrypoints/preencher.content/registro.ts`:

```ts
export { criarRegistro, type Registro } from '@pilutech/botai-core/navegador'
```

`extensao/src/entrypoints/preencher.content/segunda-passada.ts`:

```ts
export {
  agendarSegundaPassada,
  regravarAlterados,
  SEGUNDA_PASSADA_MS,
  type Escrito,
} from '@pilutech/botai-core/navegador'
```

- [ ] **Step 2: `api.ts` e `lib/resultado.ts`**

Em `extensao/src/entrypoints/preencher.content/api.ts`, dentro de `preencher(pessoa, hojeISO)`, troque a linha

```ts
agendarSegundaPassada(escritos, (acao, ms) => ctx.setTimeout(acao, ms))
```

por

```ts
void agendarSegundaPassada(escritos, (acao, ms) => ctx.setTimeout(acao, ms))
```

Em `extensao/src/lib/resultado.ts`, apague o bloco `export interface ResultadoFrame { … }` (as 7 linhas) e ponha no topo do arquivo:

```ts
import type { ResultadoFrame } from '@pilutech/botai-core/navegador'

export type { ResultadoFrame }
```

O resto do arquivo (`LinhaCampo`, `ResumoPreenchimento`, `somarFrames`, `primeiroNaoReconhecido`, `contarRecusados`, `SUFIXO_RECUSADO`) fica igual.

- [ ] **Step 3: Vitest com o mesmo N e nenhum teste mexido**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core run build && cd extensao && node_modules/.bin/wxt prepare && node_modules/.bin/vitest run; echo "EXIT=$?"
```

Esperado: EXIT=0 e `Tests  N passed` com o **mesmo N** anotado na Task 1.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git diff --stat main -- ':(glob)extensao/**/*.test.ts' ':(glob)extensao/**/*.test.tsx' ':(glob)extensao/**/*.e2e.ts'; echo "EXIT=$?"
```

Esperado: saída vazia; EXIT=0. (O `:(glob)` faz o `**/` casar também zero pastas, então o `extensao/manifesto.e2e.ts` da raiz da extensão entra na conferência.)

- [ ] **Step 4: Lint e os três builds**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai run lint && pnpm --filter @pilutech/botai run build && pnpm --filter @pilutech/botai run build:firefox && pnpm --filter @pilutech/botai run build:opera && pnpm --filter @pilutech/botai run lint:firefox; echo "EXIT=$?"
```

Esperado: EXIT=0 (os gates do `@source` inclusos; `web-ext lint` com 0 erros).

- [ ] **Step 5: E2E da extensão**

```bash
cd /Users/piluvitu/PILUTECH/Botai/extensao && node_modules/.bin/playwright install --no-shell chromium && cd .. && pnpm --filter @pilutech/botai run test:e2e; echo "EXIT=$?"
```

Esperado: todos os `*.e2e.ts` passam (cadastro 21 de 23, React, iframes, CSP, 2ª passada, Inserir, menus, avisos, aparência, manifestos); EXIT=0.

- [ ] **Step 5b: Reprodução das fontes da AMO (obrigatória)**

O pacote do Firefox agora embute código de `packages/core/src/navegador/`, e o build do core passou a rodar `scripts/construir-iife.mjs` (esbuild). A reprodução byte a byte tem de continuar valendo, e esta fase termina com push direto na `main` (sem PR), então o `botai-release.yml` não roda sozinho antes da próxima tag. Prove aqui, com o Docker do Mac (OrbStack):

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai run zip && V=$(node -p "require('./extensao/package.json').version") && /usr/bin/unzip -l "extensao/.output/botai-$V-sources.zip" > "${TMPDIR:-/tmp}/botai-fontes.txt" && /usr/bin/grep -c "packages/core/scripts/construir-iife.mjs\|packages/core/src/navegador/dom.ts" "${TMPDIR:-/tmp}/botai-fontes.txt"; echo "EXIT=$?"
```

Esperado: `2` (os dois arquivos estão no zip de fontes); EXIT=0. Se for `0` ou `1`, o `includeSources` do `extensao/wxt.config.ts` não cobre `packages/core/**`: acrescente-o, rode de novo e inclua o `wxt.config.ts` no commit desta task.

```bash
cd /Users/piluvitu/PILUTECH/Botai && V=$(node -p "require('./extensao/package.json').version") && docker run --rm -v "$PWD:/repo:ro" node:24.14.0 bash /repo/extensao/scripts/reproduzir-fontes.sh "/repo/extensao/.output/botai-$V-sources.zip" "/repo/extensao/.output/botai-$V-firefox.zip"; echo "EXIT=$?"
```

Esperado: a reprodução termina sem diferença (`diff -r` e `cmp` limpos); EXIT=0. Se a seção "Pacotes, fontes da AMO e CI" do `extensao/CLAUDE.md` (fase 0) trouxer outro caminho de script, use o de lá. Se a reprodução falhar porque o revisor não builda o core antes, ou não tem o esbuild, o passo a passo do `extensao/SOURCE-CODE-REVIEW.md` e o `reproduzir-fontes.sh` mudam juntos (regra do `extensao/CLAUDE.md`) e entram no commit desta task.

- [ ] **Step 6: Workflows da extensão cobrem o core**

```bash
/usr/bin/grep -n "packages/core" /Users/piluvitu/PILUTECH/Botai/.github/workflows/botai-e2e.yml /Users/piluvitu/PILUTECH/Botai/.github/workflows/botai-release.yml; echo "EXIT=$?"
```

Esperado: `packages/core/**` nos `paths` de `push` e `pull_request` do `botai-e2e.yml` e nos `paths` de `pull_request` do `botai-release.yml` (EXIT=0). Se faltar em algum, acrescente `- 'packages/core/**'` na lista que falta, logo abaixo da linha da extensão, e rode `actionlint .github/workflows/botai-e2e.yml .github/workflows/botai-release.yml; echo "EXIT=$?"` (EXIT=0).

- [ ] **Step 7: `extensao/CLAUDE.md`**

1. Substitua o parágrafo inteiro da seção `## Fronteira` por:

```markdown
Geração, classificação de campo e formatação de valor são lógica pura em `@pilutech/botai-core` (`pessoa`, `campos`, `campos-formatar` e os geradores). O motor de preenchimento (varrer o DOM, descrever, escrever, ler de volta, contornos, registro, 2ª passada e `preencherDocumento`) mora em `@pilutech/botai-core/navegador` desde a 0.4.0, e é o mesmo que o `@pilutech/botai-playwright` injeta nas páginas. A extensão é a casca: injeta o script, liga o adaptador de shadow root fechada (`raizSombraDaExtensao`, em `preencher.content/dom.ts`), desenha o aviso e mostra o popup. `contornos.ts`, `registro.ts` e `segunda-passada.ts` da pasta do content script só reexportam o core: são o ponto de import do content script e mantêm os testes Vitest de lá valendo sem mudança.
```

2. Na seção `## Fluxos`, no fim do item **2ª passada do CEP**, acrescente: `` `agendarSegundaPassada` devolve uma Promise (o Playwright espera por ela); a extensão a descarta com `void`. ``

3. Na seção `## Escrita no DOM (o porquê de cada regra)`, no fim do primeiro item, acrescente: `No Playwright o mesmo código roda no mundo MAIN: o setter do protótipo é o que mantém o React funcionando lá (coberto pelo \`preencher.e2e.ts\` do \`packages/playwright\`).`

4. Na seção `## Testes`, acrescente o item:

```markdown
- **O motor DOM tem dois conjuntos de testes:** os Vitest de `preencher.content/` (inalterados desde a fase 3; passam pelo adaptador e pelo `document` da extensão) e os Jest de `packages/core/src/navegador/` (o mesmo comportamento com o adaptador injetado, mais raiz `Element`). Mudou o motor? Rode os dois e os E2E da extensão e do `packages/playwright`.
```

- [ ] **Step 8: Formatação e commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && node_modules/.bin/prettier --check extensao/src/entrypoints/preencher.content extensao/src/lib/resultado.ts extensao/CLAUDE.md packages/core/src/navegador packages/core/src/portabilidade.test.ts packages/core/scripts packages/core/CLAUDE.md packages/core/README.md; echo "EXIT=$?"
```

Esperado: EXIT=0 (se não, `node_modules/.bin/prettier --write` nos mesmos caminhos e confira de novo).

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add extensao/src/entrypoints/preencher.content/dom.ts extensao/src/entrypoints/preencher.content/preencher.ts extensao/src/entrypoints/preencher.content/contornos.ts extensao/src/entrypoints/preencher.content/registro.ts extensao/src/entrypoints/preencher.content/segunda-passada.ts extensao/src/entrypoints/preencher.content/api.ts extensao/src/lib/resultado.ts extensao/CLAUDE.md && /usr/bin/git add -u .github packages/core extensao/wxt.config.ts extensao/SOURCE-CODE-REVIEW.md extensao/scripts && /usr/bin/git commit -m "refactor(extensao): motor DOM vem do @pilutech/botai-core/navegador"; echo "EXIT=$?"
```

---

### Task 6: Pacote `@pilutech/botai-playwright`: esqueleto, semente e resultado

**Files:**

- Create: `packages/playwright/package.json`, `tsconfig.json`, `tsconfig.build.json`, `jest.config.ts`
- Create: `packages/playwright/src/semente.ts`, `semente.test.ts`
- Create: `packages/playwright/src/resultado.ts`, `resultado.test.ts`
- Modify (só se preciso, Task 1): `pnpm-workspace.yaml`, `.gitignore` da raiz

**Interfaces:**

- Consumes: nada de código (os dois módulos não importam pacote nenhum, de propósito: o Jest/ts-jest em CommonJS não resolve `exports` de pacote).
- Produces:
  - `interface IdentidadeDoTeste { projeto: string; titulos: readonly string[] }`, `sementeDoTeste(identidade: IdentidadeDoTeste): string`, `conferirHoje(hoje: string): string`
  - `interface LinhaDoPreenchimento { frame: string; rotulo: string; seletor: string }`, `interface ResultadoDoPreenchimento { preenchidos: LinhaDoPreenchimento[]; naoReconhecidos: LinhaDoPreenchimento[]; recusados: LinhaDoPreenchimento[] }`, `interface ResultadoDeUmFrame { preenchidos: readonly LinhaRecebida[]; naoReconhecidos: readonly LinhaRecebida[]; recusados: readonly LinhaRecebida[] }` (com `LinhaRecebida = { rotulo: string; seletor: string }`), `interface FrameComResultado { frame: string; resultado: ResultadoDeUmFrame }`, `juntarFrames(frames: readonly FrameComResultado[]): ResultadoDoPreenchimento`

- [ ] **Step 1: Esqueleto do pacote**

`packages/playwright/package.json`:

```json
{
  "name": "@pilutech/botai-playwright",
  "version": "0.1.0",
  "description": "Fixture do Playwright que gera uma pessoa brasileira de teste reproduzível e preenche formulários com o motor do Botaí",
  "license": "MIT",
  "author": "PiluTech",
  "type": "module",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/PiluVitu/Botai.git",
    "directory": "packages/playwright"
  },
  "homepage": "https://botai.pilutech.com.br",
  "bugs": "https://github.com/PiluVitu/Botai/issues",
  "keywords": [
    "playwright",
    "fixture",
    "dados de teste",
    "cpf",
    "formulario",
    "botai"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md", "LICENSE"],
  "engines": {
    "node": "^20.19.0 || >=22.12.0"
  },
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "core": "pnpm --filter @pilutech/botai-core run build",
    "lint": "pnpm run core && tsc --noEmit",
    "test": "pnpm run core && jest",
    "test:e2e": "pnpm run core && playwright test",
    "build": "pnpm run core && tsc -p tsconfig.build.json"
  },
  "dependencies": {
    "@pilutech/botai-core": "workspace:*"
  },
  "peerDependencies": {
    "@playwright/test": "^1.59.1"
  }
}
```

`packages/playwright/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["es2022", "dom"],
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node", "jest"]
  },
  "include": ["src", "playwright.config.ts"]
}
```

`packages/playwright/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts", "src/**/*.e2e.ts", "src/teste"]
}
```

`packages/playwright/jest.config.ts` (mesmo formato de arquivo que o `jest.config.*` do core; se o do core for `.mjs`/`.js`, use a mesma extensão com o mesmo conteúdo):

```ts
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          target: 'es2022',
          strict: true,
          esModuleInterop: true,
        },
      },
    ],
  },
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
}

export default config
```

Se a Task 1 mostrou que `pnpm-workspace.yaml` lista as pastas uma a uma, acrescente `- 'packages/playwright'`. Se `dist`, `test-results` ou `playwright-report` não estavam ignorados, acrescente ao `.gitignore` da raiz: `dist/`, `test-results/`, `playwright-report/`.

Dependências (as versões vêm do core e da extensão, para o dedupe):

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm install && pnpm --filter @pilutech/botai-playwright add -D -E "@playwright/test@$(node -p "require('./extensao/package.json').devDependencies['@playwright/test']")" "esbuild@$(node -p "require('./packages/core/package.json').devDependencies.esbuild")" && pnpm --filter @pilutech/botai-playwright add -D "jest@$(node -p "require('./packages/core/package.json').devDependencies.jest")" "ts-jest@$(node -p "require('./packages/core/package.json').devDependencies['ts-jest']")" "@types/jest@$(node -p "require('./packages/core/package.json').devDependencies['@types/jest']")" "@types/node@$(node -p "require('./packages/core/package.json').devDependencies['@types/node']")" "typescript@$(node -p "require('./packages/core/package.json').devDependencies.typescript")"; echo "EXIT=$?"
```

Esperado: EXIT=0; `@playwright/test` fica `1.59.1` (exato).

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm dedupe --check; echo "EXIT=$?"
```

Esperado: EXIT=0 (uma cópia só de `@playwright/test`, `esbuild`, `jest`, `typescript`).

- [ ] **Step 2: Escrever os testes que falham**

`packages/playwright/src/semente.test.ts`:

```ts
import { conferirHoje, sementeDoTeste } from './semente.js'

describe('sementeDoTeste', () => {
  it('junta projeto, arquivo e títulos com ›', () => {
    expect(
      sementeDoTeste({
        projeto: 'chromium',
        titulos: ['cadastro.e2e.ts', 'Cadastro', 'cria a conta'],
      }),
    ).toBe('chromium › cadastro.e2e.ts › Cadastro › cria a conta')
  })

  it('sem projeto (config sem projects), começa pelo arquivo', () => {
    expect(
      sementeDoTeste({
        projeto: '',
        titulos: ['cadastro.e2e.ts', 'cria a conta'],
      }),
    ).toBe('cadastro.e2e.ts › cria a conta')
  })

  it('caminho do Windows dá a mesma semente que no macOS e no Linux', () => {
    expect(
      sementeDoTeste({
        projeto: 'chromium',
        titulos: ['e2e\\cadastro.e2e.ts', 'cria a conta'],
      }),
    ).toBe('chromium › e2e/cadastro.e2e.ts › cria a conta')
  })

  it('só o arquivo é caminho: barra invertida num título fica como está', () => {
    expect(
      sementeDoTeste({ projeto: 'x', titulos: ['a.e2e.ts', 'C:\\pasta'] }),
    ).toBe('x › a.e2e.ts › C:\\pasta')
  })

  it('mesmo título em arquivos diferentes dá sementes diferentes', () => {
    const titulo = 'preenche o formulário'
    expect(
      sementeDoTeste({ projeto: 'chromium', titulos: ['a.e2e.ts', titulo] }),
    ).not.toBe(
      sementeDoTeste({ projeto: 'chromium', titulos: ['b.e2e.ts', titulo] }),
    )
  })
})

describe('conferirHoje', () => {
  it('aceita AAAA-MM-DD e devolve a mesma data', () => {
    expect(conferirHoje('2026-10-05')).toBe('2026-10-05')
  })

  it.each(['05/10/2026', '2026-1-5', '20261005', ''])(
    'recusa "%s" com mensagem que nomeia a opção',
    (hoje) => {
      expect(() => conferirHoje(hoje)).toThrow(
        `botaiHoje: esperado AAAA-MM-DD, recebido "${hoje}"`,
      )
    },
  )
})
```

`packages/playwright/src/resultado.test.ts`:

```ts
import { juntarFrames } from './resultado.js'

const linha = (idx: number, rotulo: string, seletor: string) => ({
  idx,
  rotulo,
  seletor,
})

describe('juntarFrames', () => {
  it('junta os frames na ordem recebida, põe o frame em cada linha e tira o idx', () => {
    const resultado = juntarFrames([
      {
        frame: 'http://teste.local/cadastro',
        resultado: {
          preenchidos: [linha(1, 'Nome completo', 'input[name="nome"]')],
          naoReconhecidos: [
            linha(2, 'Código de indicação', 'input[name="ref_code"]'),
          ],
          recusados: [linha(3, 'Senha', 'input[name="senha"]')],
        },
      },
      {
        frame: 'http://outro.local/quadro',
        resultado: {
          preenchidos: [linha(1, 'CPF', 'input[name="cpf"]')],
          naoReconhecidos: [],
          recusados: [],
        },
      },
    ])
    expect(resultado).toEqual({
      preenchidos: [
        {
          frame: 'http://teste.local/cadastro',
          rotulo: 'Nome completo',
          seletor: 'input[name="nome"]',
        },
        {
          frame: 'http://outro.local/quadro',
          rotulo: 'CPF',
          seletor: 'input[name="cpf"]',
        },
      ],
      naoReconhecidos: [
        {
          frame: 'http://teste.local/cadastro',
          rotulo: 'Código de indicação',
          seletor: 'input[name="ref_code"]',
        },
      ],
      recusados: [
        {
          frame: 'http://teste.local/cadastro',
          rotulo: 'Senha',
          seletor: 'input[name="senha"]',
        },
      ],
    })
  })

  it('sem frames, tudo vazio', () => {
    expect(juntarFrames([])).toEqual({
      preenchidos: [],
      naoReconhecidos: [],
      recusados: [],
    })
  })

  it('ignora os campos extras do ResultadoFrame (contentType, iframesDeFora)', () => {
    const resultado = juntarFrames([
      {
        frame: 'about:blank',
        resultado: {
          preenchidos: [],
          naoReconhecidos: [],
          recusados: [],
          contentType: 'text/html',
          iframesDeFora: 2,
        } as Parameters<typeof juntarFrames>[0][number]['resultado'],
      },
    ])
    expect(Object.keys(resultado)).toEqual([
      'preenchidos',
      'naoReconhecidos',
      'recusados',
    ])
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/playwright && node_modules/.bin/jest; echo "EXIT=$?"
```

Esperado: FAIL (`Cannot find module './semente.js'` / `'./resultado.js'`); EXIT=1.

- [ ] **Step 4: Implementar**

`packages/playwright/src/semente.ts`:

```ts
export interface IdentidadeDoTeste {
  projeto: string
  titulos: readonly string[]
}

export function sementeDoTeste({
  projeto,
  titulos,
}: IdentidadeDoTeste): string {
  const [arquivo, ...resto] = titulos
  const partes =
    arquivo === undefined ? [] : [arquivo.replaceAll('\\', '/'), ...resto]
  return (projeto ? [projeto, ...partes] : partes).join(' › ')
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

export function conferirHoje(hoje: string): string {
  if (!DATA_ISO.test(hoje))
    throw new Error(`botaiHoje: esperado AAAA-MM-DD, recebido "${hoje}"`)
  return hoje
}
```

`packages/playwright/src/resultado.ts`:

```ts
export interface LinhaDoPreenchimento {
  frame: string
  rotulo: string
  seletor: string
}

export interface ResultadoDoPreenchimento {
  preenchidos: LinhaDoPreenchimento[]
  naoReconhecidos: LinhaDoPreenchimento[]
  recusados: LinhaDoPreenchimento[]
}

interface LinhaRecebida {
  rotulo: string
  seletor: string
}

export interface ResultadoDeUmFrame {
  preenchidos: readonly LinhaRecebida[]
  naoReconhecidos: readonly LinhaRecebida[]
  recusados: readonly LinhaRecebida[]
}

export interface FrameComResultado {
  frame: string
  resultado: ResultadoDeUmFrame
}

export function juntarFrames(
  frames: readonly FrameComResultado[],
): ResultadoDoPreenchimento {
  const linhas = (lista: keyof ResultadoDeUmFrame) =>
    frames.flatMap(({ frame, resultado }) =>
      resultado[lista].map(({ rotulo, seletor }) => ({
        frame,
        rotulo,
        seletor,
      })),
    )
  return {
    preenchidos: linhas('preenchidos'),
    naoReconhecidos: linhas('naoReconhecidos'),
    recusados: linhas('recusados'),
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/playwright && node_modules/.bin/jest; echo "EXIT=$?"
```

Esperado: PASS; EXIT=0.

- [ ] **Step 6: Lint e commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-playwright run lint; echo "EXIT=$?"
```

Esperado: EXIT=0.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/playwright/package.json packages/playwright/tsconfig.json packages/playwright/tsconfig.build.json packages/playwright/jest.config.* packages/playwright/src/semente.ts packages/playwright/src/semente.test.ts packages/playwright/src/resultado.ts packages/playwright/src/resultado.test.ts pnpm-lock.yaml && /usr/bin/git add -u pnpm-workspace.yaml .gitignore && /usr/bin/git commit -m "feat(playwright): pacote @pilutech/botai-playwright com semente do teste e resultado por frame"; echo "EXIT=$?"
```

---

### Task 7: Preencher pela página: IIFE por frame, `Page` e `Locator`

**Files:**

- Create: `packages/playwright/src/preencher.ts`
- Create: `packages/playwright/src/preencher.e2e.ts`
- Create: `packages/playwright/src/teste/paginas.ts`
- Create: `packages/playwright/src/teste/endereco.pagina.html`
- Create: `packages/playwright/playwright.config.ts`

**Interfaces:**

- Consumes: `juntarFrames`, `ResultadoDoPreenchimento` (Task 6); `type ApiDoNavegador` de `@pilutech/botai-core/navegador` e o arquivo `@pilutech/botai-core/navegador.iife.js` (Task 4); `type Pessoa` de `@pilutech/botai-core/pessoa`; `gerarPessoa`, `hojeEmSaoPaulo` da raiz do core (fase 1, só no teste).
- Produces: `interface OpcoesDoPreenchimento { segundaPassada?: boolean }`, `preencherAlvo(alvo: Page | Locator, pessoa: Pessoa, hoje: string, opcoes?: OpcoesDoPreenchimento): Promise<ResultadoDoPreenchimento>`. Ajudantes de teste: `ORIGEM = 'http://teste.local'`, `ORIGEM_DE_FORA = 'http://outro.local'`, `CADASTRO`, `REACT`, `ENDERECO` (HTML), `scriptDaPaginaReact(): Promise<string>`, `interface Rota { corpo: string; tipo?: string; cabecalhos?: Record<string, string> }`, `servir(context: BrowserContext, origem: string, rotas: Record<string, Rota>): Promise<void>`.

- [ ] **Step 1: Config, páginas e o E2E que falha**

`packages/playwright/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'src',
  testMatch: '**/*.e2e.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: { trace: 'on-first-retry' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
```

`packages/playwright/src/teste/endereco.pagina.html` (a página do `segunda-passada.e2e.ts` da extensão):

```html
<!doctype html>
<html lang="pt-BR">
  <meta charset="utf-8" />
  <title>Endereço</title>
  <form>
    <label>CEP <input name="cep" id="cep" /></label>
    <label>Rua <input name="logradouro" /></label>
    <label>Número <input name="numero" /></label>
    <label>Complemento <input name="complemento" /></label>
    <label>Bairro <input name="bairro" /></label>
    <label>Cidade <input name="cidade" /></label>
  </form>
  <script>
    window.buscas = 0
    window.siteSobrescreveu = false
    document.getElementById('cep').addEventListener('input', (evento) => {
      if (evento.target.value.replace(/[^0-9]/g, '').length !== 8) return
      window.buscas += 1
      setTimeout(() => {
        document.querySelector('[name="complemento"]').value =
          'de 612 a 1510 - lado par'
        window.siteSobrescreveu = true
      }, 200)
    })
  </script>
</html>
```

`packages/playwright/src/teste/paginas.ts` (as páginas de formulário são lidas de onde a extensão as mantém, para os dois E2E testarem a mesma página):

```ts
import type { BrowserContext } from '@playwright/test'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const ORIGEM = 'http://teste.local'
export const ORIGEM_DE_FORA = 'http://outro.local'

const PAGINAS_DA_EXTENSAO = new URL(
  '../../../../extensao/src/entrypoints/preencher.content/',
  import.meta.url,
)
const daExtensao = (arquivo: string) =>
  readFileSync(new URL(arquivo, PAGINAS_DA_EXTENSAO), 'utf8')

export const CADASTRO = daExtensao('cadastro.pagina.html')
export const REACT = daExtensao('react.pagina.html')
export const ENDERECO = readFileSync(
  new URL('./endereco.pagina.html', import.meta.url),
  'utf8',
)

let scriptReact: Promise<string> | undefined

// O React 19 não publica UMD: a página é empacotada aqui, com o react da extensão.
export function scriptDaPaginaReact(): Promise<string> {
  scriptReact ??= build({
    entryPoints: [
      fileURLToPath(new URL('react.pagina.tsx', PAGINAS_DA_EXTENSAO)),
    ],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    // Sem isso o esbuild lê o tsconfig da extensão, que estende o .wxt/ gerado pelo `wxt prepare` (ausente no job do CI).
    tsconfigRaw: {},
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  }).then((saida) => saida.outputFiles[0].text)
  return scriptReact
}

export interface Rota {
  corpo: string
  tipo?: string
  cabecalhos?: Record<string, string>
}

export async function servir(
  context: BrowserContext,
  origem: string,
  rotas: Record<string, Rota>,
): Promise<void> {
  await context.route(`${origem}/**`, (rota) => {
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
```

`packages/playwright/src/preencher.e2e.ts`:

```ts
import { gerarPessoa, hojeEmSaoPaulo } from '@pilutech/botai-core'
import { expect, test } from '@playwright/test'
import { preencherAlvo } from './preencher.js'
import {
  CADASTRO,
  ENDERECO,
  ORIGEM,
  ORIGEM_DE_FORA,
  REACT,
  scriptDaPaginaReact,
  servir,
} from './teste/paginas.js'

const HOJE = hojeEmSaoPaulo()
const P = gerarPessoa({ semente: 'preencher.e2e', hoje: HOJE })

const SO_CPF =
  '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf"></label>'
const SO_EMAIL =
  '<!doctype html><meta charset="utf-8"><label>E-mail <input type="email" name="email"></label>'
const SECOES =
  '<!doctype html><meta charset="utf-8"><form id="entrega"><label>CEP <input name="cep"></label><label>Cidade <input name="cidade"></label></form><form id="contato"><label>E-mail <input type="email" name="email"></label><label>CPF <input name="cpf"></label></form>'

interface JanelaComBusca {
  buscas: number
  siteSobrescreveu: boolean
}

test('cadastro realista: 21 preenchidos, 2 não reconhecidos, valores da pessoa e nada pintado', async ({
  context,
  page,
}) => {
  await servir(context, ORIGEM, { '/cadastro': { corpo: CADASTRO } })
  await page.goto(`${ORIGEM}/cadastro`)

  const resultado = await preencherAlvo(page, P, HOJE)

  expect(resultado.preenchidos).toHaveLength(21)
  expect(resultado.recusados).toEqual([])
  expect(resultado.naoReconhecidos).toEqual([
    {
      frame: `${ORIGEM}/cadastro`,
      rotulo: 'Código de indicação',
      seletor: 'input[name="ref_code"]',
    },
    {
      frame: `${ORIGEM}/cadastro`,
      rotulo: 'Como nos conheceu?',
      seletor: 'select#origem',
    },
  ])
  const esperado: Record<string, string> = {
    nome: P.nome.completo,
    nascimento: P.nascimento.br,
    email: P.email.endereco,
    email2: P.email.endereco,
    cpf: P.cpf,
    cel: P.celular.formatado,
    senha: P.senha,
    senha2: P.senha,
    sexo: P.nome.sexo,
    cep: P.endereco.cep,
    logradouro: P.endereco.logradouro,
    numero: P.endereco.numero,
    complemento: P.endereco.complemento,
    bairro: P.endereco.bairro,
    cidade: P.endereco.cidade,
    cc: P.cartao.numeroFormatado,
    ccname: P.cartao.titular,
    mes: P.cartao.mes,
    ano: `20${P.cartao.ano}`,
    cvv: P.cartao.cvv,
    ref_code: '',
    b_7f3e_honeypot: '',
    csrf: 'x',
    q: '',
  }
  for (const [nome, valor] of Object.entries(esperado)) {
    await expect(page.locator(`[name="${nome}"]`)).toHaveValue(valor)
  }
  await expect(
    page.locator('select[name="estado"] option:checked'),
  ).toHaveAttribute('data-uf', P.endereco.uf)
  await expect(page.locator('#origem')).toHaveValue('')
  await expect(page.locator('input[name="termos"]')).not.toBeChecked()
  await expect(page.locator('input[name="nome"]')).toHaveCSS(
    'outline-style',
    'none',
  )
})

test('React controlado, máscara e validação no blur enxergam o valor, sem roubar o foco', async ({
  context,
  page,
}) => {
  await servir(context, ORIGEM, {
    '/react': { corpo: REACT },
    '/react.pagina.js': {
      corpo: await scriptDaPaginaReact(),
      tipo: 'text/javascript',
    },
  })
  await page.goto(`${ORIGEM}/react`)
  await expect(page.locator('input[name="nome"]')).toBeVisible()

  const resultado = await preencherAlvo(page, P, HOJE)

  expect(resultado.preenchidos.map((l) => l.rotulo)).toEqual([
    'Nome completo',
    'E-mail',
    'CPF',
    'CEP',
  ])
  expect(resultado.recusados).toEqual([
    {
      frame: `${ORIGEM}/react`,
      rotulo: 'Celular',
      seletor: 'input[name="celular"]',
    },
  ])
  expect(resultado.naoReconhecidos).toEqual([])
  await expect(page.locator('#estado')).toHaveText(
    JSON.stringify({
      nome: P.nome.completo,
      email: P.email.endereco,
      emailTocado: true,
      cpf: P.cpf,
    }),
  )
  await expect(page.locator('input[name="cpf"]')).toHaveValue(P.cpf)
  await expect(page.locator('input[name="celular"]')).toHaveValue('')
  await expect(page.locator('#cep-validado')).toHaveText('validado')
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(
    'BODY',
  )
})

test('percorre os frames: iframe da mesma origem e de outra origem', async ({
  context,
  page,
}) => {
  await servir(context, ORIGEM, {
    '/com-quadros': {
      corpo: `<!doctype html><meta charset="utf-8"><label>Nome completo <input name="nome"></label><iframe id="mesma" src="/quadro" style="width:400px;height:120px"></iframe><iframe id="de-fora" src="${ORIGEM_DE_FORA}/quadro" style="width:400px;height:120px"></iframe>`,
    },
    '/quadro': { corpo: SO_CPF },
  })
  await servir(context, ORIGEM_DE_FORA, { '/quadro': { corpo: SO_EMAIL } })
  await page.goto(`${ORIGEM}/com-quadros`)
  await expect(
    page.frameLocator('#mesma').locator('input[name="cpf"]'),
  ).toBeVisible()
  await expect(
    page.frameLocator('#de-fora').locator('input[name="email"]'),
  ).toBeVisible()

  const resultado = await preencherAlvo(page, P, HOJE)

  expect(resultado.preenchidos).toHaveLength(3)
  expect(resultado.preenchidos).toEqual(
    expect.arrayContaining([
      {
        frame: `${ORIGEM}/com-quadros`,
        rotulo: 'Nome completo',
        seletor: 'input[name="nome"]',
      },
      {
        frame: `${ORIGEM}/quadro`,
        rotulo: 'CPF',
        seletor: 'input[name="cpf"]',
      },
      {
        frame: `${ORIGEM_DE_FORA}/quadro`,
        rotulo: 'E-mail',
        seletor: 'input[name="email"]',
      },
    ]),
  )
  await expect(page.locator('input[name="nome"]')).toHaveValue(P.nome.completo)
  await expect(
    page.frameLocator('#mesma').locator('input[name="cpf"]'),
  ).toHaveValue(P.cpf)
  await expect(
    page.frameLocator('#de-fora').locator('input[name="email"]'),
  ).toHaveValue(P.email.endereco)
})

test.describe('alvo Locator', () => {
  test('preenche só dentro do elemento', async ({ context, page }) => {
    await servir(context, ORIGEM, { '/secoes': { corpo: SECOES } })
    await page.goto(`${ORIGEM}/secoes`)

    const resultado = await preencherAlvo(page.locator('#entrega'), P, HOJE)

    expect(resultado.preenchidos.map((l) => l.rotulo)).toEqual([
      'CEP',
      'Cidade',
    ])
    await expect(page.locator('[name="cidade"]')).toHaveValue(P.endereco.cidade)
    await expect(page.locator('[name="email"]')).toHaveValue('')
    await expect(page.locator('[name="cpf"]')).toHaveValue('')
  })

  test('locator de um campo só preenche esse campo', async ({
    context,
    page,
  }) => {
    await servir(context, ORIGEM, { '/secoes': { corpo: SECOES } })
    await page.goto(`${ORIGEM}/secoes`)

    const resultado = await preencherAlvo(page.getByLabel('CPF'), P, HOJE)

    expect(resultado.preenchidos).toEqual([
      {
        frame: `${ORIGEM}/secoes`,
        rotulo: 'CPF',
        seletor: 'input[name="cpf"]',
      },
    ])
    await expect(page.locator('[name="cpf"]')).toHaveValue(P.cpf)
    await expect(page.locator('[name="email"]')).toHaveValue('')
  })

  test('locator dentro de um iframe instala o motor naquele frame', async ({
    context,
    page,
  }) => {
    await servir(context, ORIGEM, {
      '/com-form-no-quadro': {
        corpo:
          '<!doctype html><meta charset="utf-8"><iframe src="/secoes" style="width:600px;height:300px"></iframe>',
      },
      '/secoes': { corpo: SECOES },
    })
    await page.goto(`${ORIGEM}/com-form-no-quadro`)
    const quadro = page.frameLocator('iframe')
    await expect(quadro.locator('#contato')).toBeVisible()

    const resultado = await preencherAlvo(quadro.locator('#contato'), P, HOJE)

    expect(resultado.preenchidos.map((l) => [l.frame, l.rotulo])).toEqual([
      [`${ORIGEM}/secoes`, 'E-mail'],
      [`${ORIGEM}/secoes`, 'CPF'],
    ])
    await expect(quadro.locator('[name="email"]')).toHaveValue(P.email.endereco)
    await expect(quadro.locator('[name="cep"]')).toHaveValue('')
  })
})

test('entra em shadow root aberta; a fechada fica de fora (limite do Playwright)', async ({
  context,
  page,
}) => {
  await servir(context, ORIGEM, {
    '/sombras': {
      corpo: `<!doctype html><meta charset="utf-8"><x-aberto></x-aberto><x-fechado></x-fechado>
<script>
customElements.define('x-aberto', class extends HTMLElement { constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = '<label>CPF <input name="cpf"></label>' } })
customElements.define('x-fechado', class extends HTMLElement { constructor() { super(); this.attachShadow({ mode: 'closed' }).innerHTML = '<label>E-mail <input type="email" name="email"></label>' } })
</script>`,
    },
  })
  await page.goto(`${ORIGEM}/sombras`)

  const resultado = await preencherAlvo(page, P, HOJE)

  expect(resultado).toEqual({
    preenchidos: [
      {
        frame: `${ORIGEM}/sombras`,
        rotulo: 'CPF',
        seletor: 'x-aberto › input[name="cpf"]',
      },
    ],
    naoReconhecidos: [],
    recusados: [],
  })
  await expect(page.locator('x-aberto input[name="cpf"]')).toHaveValue(P.cpf)
})

test.describe('segunda passada', () => {
  test('a Promise só resolve depois de desfazer a sobrescrita do site', async ({
    context,
    page,
  }) => {
    await servir(context, ORIGEM, { '/endereco': { corpo: ENDERECO } })
    await page.goto(`${ORIGEM}/endereco`)

    await preencherAlvo(page, P, HOJE)

    expect(
      await page.evaluate(
        () => (window as unknown as JanelaComBusca).siteSobrescreveu,
      ),
    ).toBe(true)
    expect(await page.locator('[name="complemento"]').inputValue()).toBe(
      P.endereco.complemento,
    )
    expect(
      await page.evaluate(() => (window as unknown as JanelaComBusca).buscas),
    ).toBe(1)
  })

  test('segundaPassada: false devolve logo e deixa o valor do site', async ({
    context,
    page,
  }) => {
    await servir(context, ORIGEM, { '/endereco': { corpo: ENDERECO } })
    await page.goto(`${ORIGEM}/endereco`)

    await preencherAlvo(page, P, HOJE, { segundaPassada: false })

    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as JanelaComBusca).siteSobrescreveu,
        ),
      )
      .toBe(true)
    expect(await page.locator('[name="complemento"]').inputValue()).toBe(
      'de 612 a 1510 - lado par',
    )
  })
})

test('passa pela CSP estrita da página', async ({ context, page }) => {
  await servir(context, ORIGEM, {
    '/csp': {
      corpo: SO_CPF,
      cabecalhos: {
        'Content-Security-Policy': "default-src 'none'; script-src 'self'",
      },
    },
  })
  await page.goto(`${ORIGEM}/csp`)

  const resultado = await preencherAlvo(page, P, HOJE)

  expect(resultado.preenchidos).toHaveLength(1)
  await expect(page.locator('[name="cpf"]')).toHaveValue(P.cpf)
})

test('reinstala o motor a cada documento e reaproveita no mesmo documento', async ({
  context,
  page,
}) => {
  await servir(context, ORIGEM, {
    '/a': { corpo: SO_CPF },
    '/b': { corpo: SO_EMAIL },
  })
  await page.goto(`${ORIGEM}/a`)
  expect((await preencherAlvo(page, P, HOJE)).preenchidos).toHaveLength(1)
  const deNovo = await preencherAlvo(page, P, HOJE)
  expect(deNovo.preenchidos.map((l) => l.rotulo)).toEqual(['CPF'])
  expect(
    await page.evaluate(() =>
      Object.keys(window).filter((nome) => nome.startsWith('__botai')),
    ),
  ).toEqual(['__botaiNavegador'])

  await page.goto(`${ORIGEM}/b`)
  const outro = await preencherAlvo(page, P, HOJE)
  expect(outro.preenchidos.map((l) => l.rotulo)).toEqual(['E-mail'])
  await expect(page.locator('[name="email"]')).toHaveValue(P.email.endereco)
})
```

- [ ] **Step 2: Navegadores e rodar para ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/playwright && node_modules/.bin/playwright install chromium firefox webkit; echo "EXIT=$?"
```

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core run build && cd packages/playwright && node_modules/.bin/playwright test src/preencher.e2e.ts --project=chromium; echo "EXIT=$?"
```

Esperado: falha ao carregar o arquivo (`Cannot find module` de `./preencher.js`); EXIT=1.

- [ ] **Step 3: Implementar `preencher.ts`**

`packages/playwright/src/preencher.ts`:

```ts
import type { ApiDoNavegador } from '@pilutech/botai-core/navegador'
import type { Pessoa } from '@pilutech/botai-core/pessoa'
import type { Frame, Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { juntarFrames, type ResultadoDoPreenchimento } from './resultado.js'

export interface OpcoesDoPreenchimento {
  segundaPassada?: boolean
}

type ComNavegador = typeof globalThis & { __botaiNavegador?: ApiDoNavegador }

let codigoDoNavegador: string | undefined

function codigo(): string {
  codigoDoNavegador ??= readFileSync(
    createRequire(import.meta.url).resolve(
      '@pilutech/botai-core/navegador.iife.js',
    ),
    'utf8',
  )
  return codigoDoNavegador
}

// O código vai como texto pelo evaluate, e não por addScriptTag: o evaluate passa pela CSP da página.
async function instalar(frame: Frame): Promise<void> {
  const instalado = await frame.evaluate(
    () =>
      typeof (globalThis as ComNavegador).__botaiNavegador?.preencher ===
      'function',
  )
  if (!instalado) await frame.evaluate(codigo())
}

function ehPagina(alvo: Page | Locator): alvo is Page {
  return typeof (alvo as Page).frames === 'function'
}

export async function preencherAlvo(
  alvo: Page | Locator,
  pessoa: Pessoa,
  hoje: string,
  opcoes: OpcoesDoPreenchimento = {},
): Promise<ResultadoDoPreenchimento> {
  const argumentos = {
    pessoa,
    hoje,
    segundaPassada: opcoes.segundaPassada ?? true,
  }
  if (ehPagina(alvo)) {
    const frames = alvo.frames().filter((frame) => !frame.isDetached())
    const resultados = await Promise.all(
      frames.map(async (frame) => {
        await instalar(frame)
        const resultado = await frame.evaluate(
          ({ pessoa, hoje, segundaPassada }) => {
            const api = (globalThis as ComNavegador).__botaiNavegador
            if (!api) throw new Error('o motor do Botaí não está na página')
            return api.preencher(document, pessoa, hoje, { segundaPassada })
          },
          argumentos,
        )
        return { frame: frame.url(), resultado }
      }),
    )
    return juntarFrames(resultados)
  }
  const elemento = await alvo.elementHandle()
  try {
    const frame = await elemento.ownerFrame()
    if (!frame) throw new Error('o Botaí não achou o frame do locator')
    await instalar(frame)
    const resultado = await elemento.evaluate(
      (el, { pessoa, hoje, segundaPassada }) => {
        const api = (globalThis as ComNavegador).__botaiNavegador
        if (!api) throw new Error('o motor do Botaí não está na página')
        return api.preencher(el, pessoa, hoje, { segundaPassada })
      },
      argumentos,
    )
    return juntarFrames([{ frame: frame.url(), resultado }])
  } finally {
    await elemento.dispose()
  }
}
```

- [ ] **Step 4: Rodar e ver passar (Chromium, depois os três)**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/playwright && node_modules/.bin/playwright test src/preencher.e2e.ts --project=chromium; echo "EXIT=$?"
```

Esperado: 11 passed; EXIT=0.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/playwright && node_modules/.bin/playwright test src/preencher.e2e.ts; echo "EXIT=$?"
```

Esperado: 33 passed (11 × 3 navegadores); EXIT=0. Falha só no Firefox ou só no WebKit: siga a regra das Global Constraints (caso mínimo, `test.skip` só naquele navegador com o motivo, registro em "Limites"), sem mexer na asserção.

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-playwright run lint; echo "EXIT=$?"
```

Esperado: EXIT=0.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/playwright/playwright.config.ts packages/playwright/src/preencher.ts packages/playwright/src/preencher.e2e.ts packages/playwright/src/teste/paginas.ts packages/playwright/src/teste/endereco.pagina.html && /usr/bin/git commit -m "feat(playwright): preenchimento por page.evaluate em todos os frames, com Locator e 2ª passada"; echo "EXIT=$?"
```

---

### Task 8: Fixture `botai`, opções, anotações, anexo em falha e dourados

**Files:**

- Create: `packages/playwright/src/fixture.ts`
- Create: `packages/playwright/src/index.ts`
- Create: `packages/playwright/src/fixture.e2e.ts`
- Create: `packages/playwright/src/fixture.test.ts`
- Create: `packages/playwright/src/teste/filho/playwright.config.ts`
- Create: `packages/playwright/src/teste/filho/filho.teste.ts`

**Interfaces:**

- Consumes: `preencherAlvo`, `OpcoesDoPreenchimento` (Task 7); `sementeDoTeste`, `conferirHoje` (Task 6); `ResultadoDoPreenchimento`, `LinhaDoPreenchimento` (Task 6); da raiz do core (fase 1): `gerarPessoa(opcoes?: OpcoesDaPessoa): Pessoa`, `hojeEmSaoPaulo(agora?: Date): string`, `FORMATO`, `MOTOR`, `type Semente`, `type EnvelopeDaPessoa`, `type UF` (só no teste); `type Pessoa` de `/pessoa`; `type UF` de `/uf`; `packages/core/dourado/v1/indice.json` (`{ arquivo, n?, compacto?, opcoes: OpcoesDaPessoa, derivados? }[]`, fase 1).
- Produces (API pública do pacote, `src/index.ts`): `test`, `expect`, `fixturesBotai(): Fixtures<FixturesBotai>`, `sementeDoTeste`, e os tipos `Botai = { pessoa: Pessoa; semente: string; hoje: string; preencher(alvo: Page | Locator, opcoes?: OpcoesDoPreenchimento): Promise<ResultadoDoPreenchimento> }`, `OpcoesBotai = { botaiSemente: Semente | undefined; botaiHoje: string | undefined; botaiUf: UF | undefined; botaiDominioEmail: string | undefined }`, `FixturesBotai = OpcoesBotai & { botai: Botai }`, `OpcoesDoPreenchimento`, `ResultadoDoPreenchimento`, `LinhaDoPreenchimento`.

- [ ] **Step 1: Escrever os testes que falham**

`packages/playwright/src/fixture.e2e.ts`:

```ts
import {
  gerarPessoa,
  type EnvelopeDaPessoa,
  type Semente,
  type UF,
} from '@pilutech/botai-core'
import { test as base, mergeTests } from '@playwright/test'
import { readFileSync } from 'node:fs'
import {
  expect,
  fixturesBotai,
  sementeDoTeste,
  test,
  type FixturesBotai,
} from './index.js'
import { ORIGEM, servir } from './teste/paginas.js'

test('a semente padrão vem do projeto e do título do teste, e fica nas anotações', ({
  botai,
}, testInfo) => {
  expect(botai.semente).toBe(
    sementeDoTeste({
      projeto: testInfo.project.name,
      titulos: testInfo.titlePath,
    }),
  )
  expect(botai.semente).toBe(
    `${testInfo.project.name} › fixture.e2e.ts › a semente padrão vem do projeto e do título do teste, e fica nas anotações`,
  )
  expect(testInfo.annotations).toContainEqual({
    type: 'botai-semente',
    description: botai.semente,
  })
  expect(testInfo.annotations).toContainEqual({
    type: 'botai-hoje',
    description: botai.hoje,
  })
  expect(botai.pessoa).toEqual(
    gerarPessoa({ semente: botai.semente, hoje: botai.hoje }),
  )
})

test.describe('opções', () => {
  test.use({
    botaiSemente: 42,
    botaiHoje: '2026-10-05',
    botaiUf: 'PI',
    botaiDominioEmail: 'exemplo.com.br',
  })

  test('semente, hoje, UF e domínio fixam a pessoa', ({ botai }) => {
    expect(botai.semente).toBe('42')
    expect(botai.hoje).toBe('2026-10-05')
    expect(botai.pessoa).toEqual(
      gerarPessoa({
        semente: 42,
        hoje: '2026-10-05',
        uf: 'PI',
        dominioEmail: 'exemplo.com.br',
      }),
    )
    expect(botai.pessoa.endereco.uf).toBe('PI')
    expect(botai.pessoa.email.endereco.endsWith('@exemplo.com.br')).toBe(true)
  })
})

test('botai.preencher usa a pessoa do fixture', async ({
  context,
  page,
  botai,
}) => {
  await servir(context, ORIGEM, {
    '/cpf': {
      corpo:
        '<!doctype html><meta charset="utf-8"><label>CPF <input name="cpf"></label>',
    },
  })
  await page.goto(`${ORIGEM}/cpf`)

  const resultado = await botai.preencher(page)

  expect(resultado.naoReconhecidos).toEqual([])
  await expect(page.getByLabel('CPF')).toHaveValue(botai.pessoa.cpf)
})

const outro = base.extend<{ saudacao: string }>({ saudacao: 'olá' })
const juntos = mergeTests(test, outro)

juntos(
  'mergeTests junta o botai com fixtures de outro módulo',
  ({ botai, saudacao }) => {
    expect(saudacao).toBe('olá')
    expect(botai.pessoa.cpf).toMatch(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/)
  },
)

const estendido = base.extend<FixturesBotai>(fixturesBotai())

estendido('fixturesBotai() estende um test próprio', ({ botai }, testInfo) => {
  expect(botai.semente).toBe(
    sementeDoTeste({
      projeto: testInfo.project.name,
      titulos: testInfo.titlePath,
    }),
  )
})

// O envelope não guarda uf nem dominioEmail: as opções de cada dourado vêm do indice.json da fase 1.
interface ItemDoIndice {
  arquivo: string
  n?: number
  opcoes: { semente: Semente; hoje: string; uf?: UF; dominioEmail?: string }
}

const PASTA_DOURADA = new URL('../../core/dourado/v1/', import.meta.url)
const lerDourado = (arquivo: string): unknown =>
  JSON.parse(readFileSync(new URL(arquivo, PASTA_DOURADA), 'utf8'))
const dourados = (lerDourado('indice.json') as ItemDoIndice[]).filter(
  (item) => item.n === undefined,
)

test('há dourados de pessoa única, inclusive com UF e com domínio de e-mail', () => {
  expect(dourados.length).toBeGreaterThan(0)
  expect(dourados.some((item) => item.opcoes.uf !== undefined)).toBe(true)
  expect(dourados.some((item) => item.opcoes.dominioEmail !== undefined)).toBe(
    true,
  )
})

for (const { arquivo, opcoes } of dourados) {
  const envelope = lerDourado(arquivo) as EnvelopeDaPessoa
  test.describe(`dourado ${arquivo}`, () => {
    test.use({
      botaiSemente: opcoes.semente,
      botaiHoje: opcoes.hoje,
      botaiUf: opcoes.uf,
      botaiDominioEmail: opcoes.dominioEmail,
    })

    test('o fixture gera a pessoa do arquivo', ({ botai }) => {
      expect(botai.semente).toBe(envelope.semente)
      expect(botai.hoje).toBe(envelope.hoje)
      expect(botai.pessoa).toEqual(envelope.pessoa)
    })
  })
}
```

`packages/playwright/src/teste/filho/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: 'filho.teste.ts',
  retries: 1,
  workers: 1,
  outputDir: '../../../test-results/filho',
  projects: [{ name: 'filho' }],
})
```

`packages/playwright/src/teste/filho/filho.teste.ts` (projeto que falha de propósito; só roda pelo `fixture.test.ts`):

```ts
import { expect, test } from '../../index.js'

test('falha na primeira tentativa e passa na segunda', ({
  botai,
}, testInfo) => {
  testInfo.annotations.push({
    type: 'pessoa-da-tentativa',
    description: JSON.stringify(botai.pessoa),
  })
  expect(testInfo.retry).toBeGreaterThan(0)
})

test.describe(() => {
  test.use({ botaiHoje: '05/10/2026' })

  test('botaiHoje fora do formato falha com mensagem clara', ({ botai }) => {
    expect(botai.pessoa).toBeDefined()
  })
})
```

`packages/playwright/src/fixture.test.ts` (Jest: roda o projeto filho com o reporter JSON e lê o relatório):

```ts
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const PACOTE = resolve(__dirname, '..')
const PLAYWRIGHT = join(PACOTE, 'node_modules/.bin/playwright')
const VERSAO_DO_CORE: string = JSON.parse(
  readFileSync(join(PACOTE, '../core/package.json'), 'utf8'),
).version
const TITULO_RETRY = 'falha na primeira tentativa e passa na segunda'
const TITULO_HOJE = 'botaiHoje fora do formato falha com mensagem clara'

interface Anexo {
  name: string
  contentType: string
  body?: string
}
interface Tentativa {
  retry: number
  status: string
  attachments: Anexo[]
  annotations: { type: string; description?: string }[]
  errors: { message: string }[]
}
interface Especificacao {
  title: string
  tests: { results: Tentativa[] }[]
}
interface Suite {
  specs: Especificacao[]
  suites?: Suite[]
}

const especificacoes = (suites: Suite[]): Especificacao[] =>
  suites.flatMap((suite) => [
    ...suite.specs,
    ...especificacoes(suite.suites ?? []),
  ])

let status: number | null
let relatorio: { suites: Suite[] }

beforeAll(() => {
  const pasta = mkdtempSync(join(tmpdir(), 'botai-filho-'))
  try {
    const arquivo = join(pasta, 'relatorio.json')
    const execucao = spawnSync(
      PLAYWRIGHT,
      ['test', '-c', 'src/teste/filho/playwright.config.ts', '--reporter=json'],
      {
        cwd: PACOTE,
        encoding: 'utf8',
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: arquivo },
      },
    )
    status = execucao.status
    relatorio = JSON.parse(readFileSync(arquivo, 'utf8'))
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
}, 120_000)

function tentativas(titulo: string): Tentativa[] {
  const especificacao = especificacoes(relatorio.suites).find(
    (s) => s.title === titulo,
  )
  if (!especificacao) throw new Error(`o relatório não tem "${titulo}"`)
  return especificacao.tests[0].results
}

const anexoDaPessoa = (tentativa: Tentativa) =>
  tentativa.attachments.find((a) => a.name === 'botai-pessoa.json')
const decodificar = (anexo: Anexo) =>
  JSON.parse(Buffer.from(anexo.body ?? '', 'base64').toString('utf8'))
const anotacao = (tentativa: Tentativa, tipo: string) =>
  tentativa.annotations.find((a) => a.type === tipo)?.description

describe('fixture botai num projeto de verdade (relatório JSON)', () => {
  it('o projeto filho termina com falha, porque o teste de botaiHoje ruim falha de propósito', () => {
    expect(status).toBe(1)
  })

  it('em falha anexa botai-pessoa.json com o envelope; na tentativa que passa, não anexa', () => {
    const [primeira, segunda] = tentativas(TITULO_RETRY)
    expect(primeira.status).toBe('failed')
    expect(segunda.status).toBe('passed')
    const anexo = anexoDaPessoa(primeira)
    expect(anexo?.contentType).toBe('application/json')
    const envelope = decodificar(anexo as Anexo)
    expect(envelope).toMatchObject({
      formato: 1,
      motor: VERSAO_DO_CORE,
      semente: `filho › filho.teste.ts › ${TITULO_RETRY}`,
    })
    expect(envelope.hoje).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(anexoDaPessoa(segunda)).toBeUndefined()
  })

  it('o retry gera a mesma pessoa, e as anotações registram semente e hoje', () => {
    const [primeira, segunda] = tentativas(TITULO_RETRY)
    const envelope = decodificar(anexoDaPessoa(primeira) as Anexo)
    expect(
      JSON.parse(anotacao(primeira, 'pessoa-da-tentativa') ?? 'null'),
    ).toEqual(envelope.pessoa)
    expect(
      JSON.parse(anotacao(segunda, 'pessoa-da-tentativa') ?? 'null'),
    ).toEqual(envelope.pessoa)
    expect(anotacao(segunda, 'botai-semente')).toBe(envelope.semente)
    expect(anotacao(segunda, 'botai-hoje')).toBe(envelope.hoje)
  })

  it('botaiHoje fora do formato falha no setup com mensagem que nomeia a opção', () => {
    const [primeira] = tentativas(TITULO_HOJE)
    expect(primeira.status).toBe('failed')
    expect(primeira.errors.map((e) => e.message).join('\n')).toContain(
      'botaiHoje: esperado AAAA-MM-DD, recebido "05/10/2026"',
    )
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/playwright && node_modules/.bin/playwright test src/fixture.e2e.ts --project=chromium; echo "EXIT=$?"
```

Esperado: falha ao carregar (`Cannot find module` de `./index.js`); EXIT=1.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/playwright && node_modules/.bin/jest src/fixture.test.ts; echo "EXIT=$?"
```

Esperado: FAIL (o projeto filho não carrega `../../index.js`, então o relatório não tem os testes); EXIT=1.

- [ ] **Step 3: Implementar**

`packages/playwright/src/fixture.ts`:

```ts
import {
  FORMATO,
  gerarPessoa,
  hojeEmSaoPaulo,
  MOTOR,
  type EnvelopeDaPessoa,
  type Semente,
} from '@pilutech/botai-core'
import type { Pessoa } from '@pilutech/botai-core/pessoa'
import type { UF } from '@pilutech/botai-core/uf'
import {
  test as base,
  expect,
  type Fixtures,
  type Locator,
  type Page,
} from '@playwright/test'
import { preencherAlvo, type OpcoesDoPreenchimento } from './preencher.js'
import type { ResultadoDoPreenchimento } from './resultado.js'
import { conferirHoje, sementeDoTeste } from './semente.js'

export interface OpcoesBotai {
  botaiSemente: Semente | undefined
  botaiHoje: string | undefined
  botaiUf: UF | undefined
  botaiDominioEmail: string | undefined
}

export interface Botai {
  pessoa: Pessoa
  semente: string
  hoje: string
  preencher(
    alvo: Page | Locator,
    opcoes?: OpcoesDoPreenchimento,
  ): Promise<ResultadoDoPreenchimento>
}

export interface FixturesBotai extends OpcoesBotai {
  botai: Botai
}

export function fixturesBotai(): Fixtures<FixturesBotai> {
  return {
    botaiSemente: [undefined, { option: true }],
    botaiHoje: [undefined, { option: true }],
    botaiUf: [undefined, { option: true }],
    botaiDominioEmail: [undefined, { option: true }],
    botai: async (
      { botaiSemente, botaiHoje, botaiUf, botaiDominioEmail },
      use,
      testInfo,
    ) => {
      const semente =
        botaiSemente === undefined
          ? sementeDoTeste({
              projeto: testInfo.project.name,
              titulos: testInfo.titlePath,
            })
          : String(botaiSemente)
      const hoje =
        botaiHoje === undefined ? hojeEmSaoPaulo() : conferirHoje(botaiHoje)
      const pessoa = gerarPessoa({
        semente,
        hoje,
        ...(botaiUf !== undefined && { uf: botaiUf }),
        ...(botaiDominioEmail !== undefined && {
          dominioEmail: botaiDominioEmail,
        }),
      })
      testInfo.annotations.push(
        { type: 'botai-semente', description: semente },
        { type: 'botai-hoje', description: hoje },
      )
      await use({
        pessoa,
        semente,
        hoje,
        preencher: (alvo, opcoes) => preencherAlvo(alvo, pessoa, hoje, opcoes),
      })
      if (testInfo.status !== testInfo.expectedStatus) {
        const envelope: EnvelopeDaPessoa = {
          formato: FORMATO,
          motor: MOTOR,
          semente,
          hoje,
          pessoa,
        }
        await testInfo.attach('botai-pessoa.json', {
          body: JSON.stringify(envelope, null, 2),
          contentType: 'application/json',
        })
      }
    },
  }
}

export const test = base.extend<FixturesBotai>(fixturesBotai())

export { expect }
```

`packages/playwright/src/index.ts`:

```ts
export {
  expect,
  fixturesBotai,
  test,
  type Botai,
  type FixturesBotai,
  type OpcoesBotai,
} from './fixture.js'
export type { OpcoesDoPreenchimento } from './preencher.js'
export type {
  LinhaDoPreenchimento,
  ResultadoDoPreenchimento,
} from './resultado.js'
export { sementeDoTeste } from './semente.js'
```

- [ ] **Step 4: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/playwright && node_modules/.bin/jest; echo "EXIT=$?"
```

Esperado: PASS em `semente`, `resultado` e `fixture`; EXIT=0.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/playwright && node_modules/.bin/playwright test; echo "EXIT=$?"
```

Esperado: todos os `*.e2e.ts` nos três navegadores passam (os dourados entram um `describe` por arquivo); EXIT=0.

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-playwright run lint; echo "EXIT=$?"
```

Esperado: EXIT=0 (inclui o `base.extend<FixturesBotai>(fixturesBotai())` e o `mergeTests` tipando).

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/playwright/src/fixture.ts packages/playwright/src/index.ts packages/playwright/src/fixture.e2e.ts packages/playwright/src/fixture.test.ts packages/playwright/src/teste/filho/playwright.config.ts packages/playwright/src/teste/filho/filho.teste.ts && /usr/bin/git commit -m "feat(playwright): fixture botai com opções, anotações, anexo em falha e dourados"; echo "EXIT=$?"
```

---

### Task 9: Pacote publicável, documentação e CI

**Files:**

- Create: `packages/playwright/scripts/conferir-pacote.mjs`
- Create: `packages/playwright/README.md`, `packages/playwright/LICENSE`, `packages/playwright/CLAUDE.md`
- Modify: `.github/workflows/ci.yml` (job `playwright`)
- Modify: `Makefile`, `CLAUDE.md` e `README.md` da raiz
- Modify (só se preciso): `.github/dependabot.yml`

**Interfaces:**

- Consumes: o pacote das Tasks 6–8.
- Produces: `node packages/playwright/scripts/conferir-pacote.mjs [--destino <pasta>]` (sem `--destino`, empacota numa pasta temporária e apaga; com `--destino`, deixa o `.tgz` lá). Sai com 1 se a lista de arquivos ou a dependência do core não bater.

- [ ] **Step 1: Script de conferência**

`packages/playwright/scripts/conferir-pacote.mjs`:

```js
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACOTE = fileURLToPath(new URL('..', import.meta.url))
const ESPERADOS = [
  'LICENSE',
  'README.md',
  'dist/fixture.d.ts',
  'dist/fixture.js',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/preencher.d.ts',
  'dist/preencher.js',
  'dist/resultado.d.ts',
  'dist/resultado.js',
  'dist/semente.d.ts',
  'dist/semente.js',
  'package.json',
]

const indice = process.argv.indexOf('--destino')
const manter = indice !== -1
const destino = manter
  ? path.resolve(process.argv[indice + 1])
  : mkdtempSync(path.join(tmpdir(), 'botai-playwright-'))
mkdirSync(destino, { recursive: true })

try {
  execFileSync('pnpm', ['pack', '--pack-destination', destino], {
    cwd: PACOTE,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  const tarballs = readdirSync(destino).filter((nome) => nome.endsWith('.tgz'))
  if (tarballs.length !== 1)
    throw new Error(`esperado 1 .tgz em ${destino}, achei ${tarballs.length}`)
  const tarball = path.join(destino, tarballs[0])
  const arquivos = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .map((linha) => linha.replace(/^package\//, ''))
    .sort()
  const faltando = ESPERADOS.filter((arquivo) => !arquivos.includes(arquivo))
  const sobrando = arquivos.filter((arquivo) => !ESPERADOS.includes(arquivo))
  if (faltando.length > 0 || sobrando.length > 0) {
    console.error(`faltando: ${faltando.join(', ') || '-'}`)
    console.error(`sobrando: ${sobrando.join(', ') || '-'}`)
    process.exitCode = 1
  }
  const manifesto = JSON.parse(
    execFileSync('tar', ['-xzOf', tarball, 'package/package.json'], {
      encoding: 'utf8',
    }),
  )
  const versaoDoCore = JSON.parse(
    readFileSync(path.join(PACOTE, '../core/package.json'), 'utf8'),
  ).version
  const dependencia = manifesto.dependencies?.['@pilutech/botai-core']
  if (dependencia !== versaoDoCore) {
    console.error(
      `@pilutech/botai-core saiu como "${dependencia}" no pacote; esperado "${versaoDoCore}"`,
    )
    process.exitCode = 1
  }
  if (process.exitCode !== 1)
    console.log(
      `pacote confere: ${tarballs[0]}, ${arquivos.length} arquivos, core ${versaoDoCore}`,
    )
} finally {
  if (!manter) rmSync(destino, { recursive: true, force: true })
}
```

- [ ] **Step 2: Ver falhar (sem README e LICENSE)**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-playwright run build && node packages/playwright/scripts/conferir-pacote.mjs; echo "EXIT=$?"
```

Esperado: `faltando: LICENSE, README.md` (o npm pode pôr o README do pacote só se existir); EXIT=1.

- [ ] **Step 3: LICENSE e README**

```bash
cd /Users/piluvitu/PILUTECH/Botai && cp LICENSE packages/playwright/LICENSE && /usr/bin/grep -n "PiluTech" packages/playwright/LICENSE; echo "EXIT=$?"
```

Esperado: a linha `Copyright (c) … PiluTech` (MIT); EXIT=0.

`packages/playwright/README.md`:

````markdown
# @pilutech/botai-playwright

Fixture do [Playwright](https://playwright.dev) que gera uma pessoa brasileira de teste (nome, CPF, RG, CNPJ, celular, CEP real com rua e cidade certas, cartão de teste) **reproduzível**, e preenche formulários com o mesmo motor da extensão [Botaí](https://botai.pilutech.com.br).

## Instalação

```bash
npm install -D @pilutech/botai-playwright
# ou
pnpm add -D @pilutech/botai-playwright
```

`@playwright/test` (1.59.1 ou mais novo na linha 1.x) é peer dependency: o seu projeto já o tem. O pacote é só ESM; num projeto CommonJS, use o Node 20.19+ ou 22.12+.

## Uso

```ts
import { test, expect } from '@pilutech/botai-playwright'

test('cadastro', async ({ page, botai }) => {
  await page.goto('/cadastro')
  const resultado = await botai.preencher(page) // percorre todos os frames
  expect(resultado.naoReconhecidos).toEqual([])
  await expect(page.getByLabel('E-mail')).toHaveValue(
    botai.pessoa.email.endereco,
  )
})
```

`botai.preencher` aceita:

- uma `Page`: todos os frames, inclusive iframes de outro domínio;
- um `Locator`: só aquele elemento (um `<form>`, uma seção ou um campo só), inclusive dentro de iframe (`page.frameLocator('iframe').locator('form')`).

## A pessoa é a mesma a cada execução

Sem opção nenhuma, a semente é o nome do projeto, o arquivo e os títulos do teste: `chromium › cadastro.e2e.ts › cadastro`. Retry e worker não entram, então a nova tentativa preenche com a mesma pessoa. O fixture registra no relatório:

- a anotação `botai-semente` (a semente) e a `botai-hoje` (a data usada);
- quando o teste falha, o anexo `botai-pessoa.json`, com `{ formato, motor, semente, hoje, pessoa }`.

Para gerar a mesma pessoa fora do teste (Python, Go, banco de dados…):

```bash
npx @pilutech/botai-core pessoa --semente "chromium › cadastro.e2e.ts › cadastro" --hoje 2026-10-05
```

A pessoa de uma semente só muda em versão major do `@pilutech/botai-core`. Para reproduzir, fixe a versão.

## Opções

| Opção               | Padrão                 | O quê                                                                     |
| ------------------- | ---------------------- | ------------------------------------------------------------------------- |
| `botaiSemente`      | projeto + título       | número ou texto; `42` e `'42'` dão a mesma pessoa                         |
| `botaiHoje`         | hoje em São Paulo      | `AAAA-MM-DD`; idade, nascimento e validade do cartão contam a partir dela |
| `botaiUf`           | sorteada               | UF do endereço (e do DDD, do CPF e do título)                             |
| `botaiDominioEmail` | `tuamaeaquelaursa.com` | domínio do e-mail                                                         |

```ts
test.use({ botaiHoje: '2026-10-05', botaiUf: 'PI' })
```

Ou para o projeto inteiro, no `playwright.config.ts`: `use: { botaiHoje: '2026-10-05' }`.

## Resultado

```ts
interface ResultadoDoPreenchimento {
  preenchidos: { frame: string; rotulo: string; seletor: string }[]
  naoReconhecidos: { frame: string; rotulo: string; seletor: string }[]
  recusados: { frame: string; rotulo: string; seletor: string }[]
}
```

`frame` é a URL do frame. `recusados` são campos reconhecidos que não aceitaram o valor (não cabe no `maxlength`, a página o desfez, o `<select>` não tem a opção).

## Segunda passada

Sites que buscam o CEP sobrescrevem rua, bairro e complemento logo depois. `botai.preencher` só termina depois de regravar o que mudou (uma passada, 1 s depois de escrever). Para pular: `botai.preencher(page, { segundaPassada: false })`.

## Junto com outros fixtures

```ts
import { mergeTests } from '@playwright/test'
import { test as testBotai } from '@pilutech/botai-playwright'
import { test as testDoProjeto } from './fixtures'

export const test = mergeTests(testDoProjeto, testBotai)
```

Ou estenda um `test` que você já tem (playwright-bdd, por exemplo):

```ts
import { fixturesBotai, type FixturesBotai } from '@pilutech/botai-playwright'

export const test = base.extend<FixturesBotai>(fixturesBotai())
```

## Como funciona

O motor (`@pilutech/botai-core/navegador`) é injetado em cada frame por `frame.evaluate`, que passa pela CSP da página, e cria um único global, `__botaiNavegador`. Ele escreve pelo setter nativo e dispara `focus`, `input`, `change` e `blur` sintéticos, sem roubar o foco: React controlado, máscaras e validação no blur enxergam o valor. Não pinta contorno nenhum na página.

## Limites

- Shadow root **fechada** fica de fora (o Playwright não a alcança). A aberta é preenchida.
- Checkbox, radio, contenteditable e combobox sem `<select>` nativo não são preenchidos.
- O código roda no mundo da página: um site que troca protótipos nativos pode interferir.
- Com `page.clock.install()`, o relógio falso segura a segunda passada: use `{ segundaPassada: false }` ou avance o relógio.
- CPF, CNPJ e celular gerados podem pertencer a gente real; use só em ambiente de teste. A caixa `tuamaeaquelaursa.com` é pública: para dado sensível, use `botaiDominioEmail` com um domínio seu.

## Licença

MIT © PiluTech
````

- [ ] **Step 4: Ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai && node packages/playwright/scripts/conferir-pacote.mjs; echo "EXIT=$?"
```

Esperado: `pacote confere: pilutech-botai-playwright-0.1.0.tgz, 13 arquivos, core 0.4.0`; EXIT=0.

- [ ] **Step 5: `packages/playwright/CLAUDE.md`**

```markdown
# CLAUDE.md — `packages/playwright` (`@pilutech/botai-playwright`)

Fixture do Playwright publicado no npm (MIT). Gera a pessoa com `@pilutech/botai-core` e preenche com o motor de `@pilutech/botai-core/navegador`, o mesmo da extensão.

## Estrutura

- `src/semente.ts`: `sementeDoTeste` (projeto + arquivo com `/` + títulos, `' › '`) e `conferirHoje`.
- `src/resultado.ts`: `ResultadoDoPreenchimento` e `juntarFrames` (tira `idx`, `contentType` e `iframesDeFora` do `ResultadoFrame`, põe o `frame`).
- `src/preencher.ts`: lê `@pilutech/botai-core/navegador.iife.js`, instala em cada frame por `frame.evaluate(<texto>)` só se `__botaiNavegador` ainda não existe naquele documento, e chama `__botaiNavegador.preencher`. `Page` → todos os frames não destacados, em paralelo; `Locator` → `elementHandle()` + `ownerFrame()`.
- `src/fixture.ts`: opções (`botaiSemente`, `botaiHoje`, `botaiUf`, `botaiDominioEmail`, todas `undefined` por padrão), fixture `botai`, anotações `botai-semente`/`botai-hoje`, anexo `botai-pessoa.json` quando `testInfo.status !== testInfo.expectedStatus`.
- `src/index.ts`: a API pública (`test`, `expect`, `fixturesBotai`, `sementeDoTeste` e os tipos).
- `src/teste/`: páginas e ajudantes dos E2E e o projeto filho. Fora do build.

## Decisões (o porquê)

- **IIFE por `frame.evaluate(texto)`, nunca `addScriptTag`:** o evaluate passa pela CSP (o Playwright roda o texto com `globalThis.eval` no script utilitário), o `addScriptTag` não. Coberto por "passa pela CSP estrita".
- **Instalação preguiçosa, por documento,** em vez de `addInitScript`: funciona em qualquer `Page`/`Locator` que o teste passar, inclusive páginas abertas depois do fixture.
- **Mundo MAIN:** o motor escreve pelo setter do protótipo, o que mantém o React funcionando; o site enxerga `__botaiNavegador`.
- **Sem contornos:** `SEM_CONTORNOS`, para não sujar screenshot nem `toHaveScreenshot`.
- **Semente legível** (o texto da semente é o próprio identificador do teste): a anotação já serve de argumento para `botai pessoa --semente`.
- **Peer `@playwright/test` `^1.59.1`:** a única versão testada; uma cópia só do `@playwright/test` no projeto do usuário (o `mergeTests` existe desde a 1.39).
- **Módulos testados no Jest sem import de pacote:** o ts-jest em CommonJS não resolve `exports`; por isso `semente.ts` e `resultado.ts` só dependem de tipos locais (o `ResultadoFrame` do core é compatível por estrutura).

## Testes

| Camada                                                        | Ferramenta                                                   | Onde                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------- |
| Lógica pura                                                   | Jest                                                         | `src/semente.test.ts`, `src/resultado.test.ts` |
| Relatório (anotação, anexo em falha, retry, `botaiHoje` ruim) | Jest rodando um projeto Playwright filho com o reporter JSON | `src/fixture.test.ts` + `src/teste/filho/`     |
| Fluxos                                                        | Playwright, Chromium + Firefox + WebKit                      | `src/preencher.e2e.ts`, `src/fixture.e2e.ts`   |

- As páginas `cadastro.pagina.html` e `react.pagina.(html|tsx)` são lidas de `extensao/src/entrypoints/preencher.content/`: a extensão e o plugin testam a mesma página. A React é empacotada pelo esbuild com o `react` da extensão.
- O E2E lê `packages/core/dourado/v1/indice.json` e confere cada dourado de pessoa única (entrada sem `n`) pelo fixture, com **todas** as `opcoes` da entrada (`botaiSemente`, `botaiHoje`, `botaiUf`, `botaiDominioEmail`): o envelope não guarda `uf` nem `dominioEmail`.
- Todo script (`lint`, `test`, `test:e2e`, `build`) builda o core antes: o plugin lê os tipos e o IIFE do `dist/` dele.

## Comandos

| Comando                                                | O quê                                                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `make test-playwright`                                 | Jest (builda o core antes)                                                                                 |
| `make test-e2e-playwright`                             | Playwright nos 3 navegadores (rode `node_modules/.bin/playwright install chromium firefox webkit` uma vez) |
| `pnpm --filter @pilutech/botai-playwright run build`   | `dist/` com `.js` e `.d.ts`                                                                                |
| `node packages/playwright/scripts/conferir-pacote.mjs` | `pnpm pack` + lista fechada + dependência do core na versão exata                                          |

## Publicação

Tag `playwright-v<versão>` (igual ao `package.json`, commit na `main`) → `.github/workflows/publicar-playwright.yml`: testes, `conferir-pacote.mjs --destino`, artifact, e o job `publicar` (environment com aprovação do dono, `id-token: write`) extrai o `.tgz` e roda `npm publish <pasta> --access public --provenance --ignore-scripts` com trusted publishing. Antes, o workflow confere que o `@pilutech/botai-core` da versão de que o plugin depende já está no npm. A primeira publicação (0.1.0) é do dono, com token local; o workflow pula versão que já está no npm.

## Limites

- Shadow root fechada não é suportada pelo Playwright.
- `page.clock.install()` segura a 2ª passada (use `segundaPassada: false`).
- Checkbox, radio, contenteditable e combobox sem `<select>` ficam de fora, como na extensão.
```

(Se a Task 7 precisou de `test.skip` em Firefox ou WebKit, acrescente o caso e o motivo em "Limites" daqui e do README.)

- [ ] **Step 6: Job no `ci.yml`**

Acrescente ao `.github/workflows/ci.yml`, no mesmo nível dos outros jobs, usando as linhas `uses:` (com SHA) que o próprio `ci.yml` já usa e a mesma `node-version` do job do core:

```yaml
playwright:
  name: Plugin do Playwright (lint + Jest + E2E nos 3 navegadores + pacote)
  runs-on: ubuntu-latest
  timeout-minutes: 25
  permissions:
    contents: read
  steps:
    - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
      with:
        persist-credentials: false

    - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

    - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
      with:
        node-version: '24.14.0'
        cache: pnpm

    - name: Instalar dependências
      run: pnpm install --frozen-lockfile

    - name: Lint (tsc)
      run: pnpm --filter @pilutech/botai-playwright run lint

    - name: Jest (lógica + relatório do projeto filho)
      run: pnpm --filter @pilutech/botai-playwright run test

    - name: Navegadores do Playwright
      run: pnpm --filter @pilutech/botai-playwright exec playwright install --with-deps chromium firefox webkit

    - name: E2E (Chromium, Firefox e WebKit)
      run: pnpm --filter @pilutech/botai-playwright run test:e2e

    - name: Build e conferência do pacote
      run: |
        pnpm --filter @pilutech/botai-playwright run build
        node packages/playwright/scripts/conferir-pacote.mjs

    - name: Rastros do Playwright
      if: failure()
      uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
      with:
        name: playwright-plugin
        path: packages/playwright/test-results/
        if-no-files-found: ignore
        retention-days: 7
```

```bash
cd /Users/piluvitu/PILUTECH/Botai && actionlint .github/workflows/ci.yml; echo "EXIT=$?"
```

Esperado: EXIT=0.

- [ ] **Step 7: Dependabot, Makefile, `CLAUDE.md` e `README.md` da raiz**

Dependabot: se a Task 1 mostrou `directory: "/"` no ecossistema npm, nada a fazer (o workspace inteiro está coberto). Se a lista é por pasta, acrescente `/packages/playwright` à lista do npm, com o mesmo `cooldown`, `groups` e `schedule` das outras entradas.

No `Makefile` da raiz, acrescente os dois alvos ao `.PHONY` e as receitas (linhas de receita começam com TAB):

```make
test-playwright:
	pnpm --filter @pilutech/botai-playwright run test

test-e2e-playwright:
	pnpm --filter @pilutech/botai-playwright run test:e2e
```

```bash
cd /Users/piluvitu/PILUTECH/Botai && make -n test-playwright test-e2e-playwright; echo "EXIT=$?"
```

Esperado: as duas linhas `pnpm --filter …`; EXIT=0.

No `CLAUDE.md` da raiz:

- na tabela (ou lista) de workspaces, a linha: ``| `packages/playwright` | `@pilutech/botai-playwright` | npm, público | fixture `botai` do Playwright: pessoa reproduzível pela semente do teste e preenchimento com o motor de `@pilutech/botai-core/navegador` (ver `packages/playwright/CLAUDE.md`) |``;
- na linha do `packages/core`, acrescente ``e o motor DOM em `/navegador` (com o IIFE `navegador.iife.js`)``;
- nos comandos, `make test-playwright` (Jest do plugin) e `make test-e2e-playwright` (Playwright do plugin nos 3 navegadores);
- no CI, o job `playwright` do `ci.yml` e o workflow `publicar-playwright.yml` (tag `playwright-v*`, trusted publishing, environment com aprovação).

No `README.md` da raiz, na lista do que o repo publica, acrescente: ``- `@pilutech/botai-playwright`: fixture do Playwright ([README](packages/playwright/README.md)).``

- [ ] **Step 8: Formatação, lint e commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && node_modules/.bin/prettier --check packages/playwright CLAUDE.md README.md .github/workflows/ci.yml; echo "EXIT=$?"
```

Esperado: EXIT=0 (se não, `--write` e confira de novo).

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-playwright run lint; echo "EXIT=$?"
```

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/playwright/scripts/conferir-pacote.mjs packages/playwright/README.md packages/playwright/LICENSE packages/playwright/CLAUDE.md .github/workflows/ci.yml Makefile CLAUDE.md README.md && /usr/bin/git add -u .github/dependabot.yml && /usr/bin/git commit -m "build(playwright): pacote conferido, README, CLAUDE.md e job no CI"; echo "EXIT=$?"
```

---

### Task 10: Workflow de publicação e verificação final

**Files:**

- Create: `.github/workflows/publicar-playwright.yml`

**Interfaces:**

- Consumes: `conferir-pacote.mjs --destino` (Task 9); environment de aprovação do `publicar-core.yml` (nome anotado na Task 1; abaixo, `npm`).
- Produces: publicação por tag `playwright-v<versão>`.

- [ ] **Step 1: Escrever o workflow**

`.github/workflows/publicar-playwright.yml` (troque `environment: npm` pelo nome usado no `publicar-core.yml`, se for outro, e as linhas `uses:` pelas do repo, se diferirem):

```yaml
name: Publicar @pilutech/botai-playwright

on:
  push:
    tags: ['playwright-v*']
  pull_request:
    branches: [main]
    paths:
      - '.github/workflows/publicar-playwright.yml'

permissions:
  contents: read

concurrency:
  group: publicar-playwright-${{ github.ref }}
  cancel-in-progress: false

jobs:
  actionlint:
    name: actionlint deste workflow
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - name: actionlint
        run: >-
          docker run --rm -v "$GITHUB_WORKSPACE:/repo" --workdir /repo
          rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667
          -color .github/workflows/publicar-playwright.yml

  pacote:
    name: Testar e empacotar
    if: startsWith(github.ref, 'refs/tags/playwright-v')
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          fetch-depth: 0
          persist-credentials: false

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '24.14.0'
          cache: pnpm

      - name: Instalar dependências
        run: pnpm install --frozen-lockfile

      - name: Tag igual à versão e commit na main
        env:
          TAG: ${{ github.ref_name }}
        run: |
          versao=$(node -p "require('./packages/playwright/package.json').version")
          if [ "$TAG" != "playwright-v$versao" ]; then
            echo "::error::A tag $TAG não bate com packages/playwright/package.json (esperado playwright-v$versao)."
            exit 1
          fi
          if ! git merge-base --is-ancestor "${GITHUB_SHA}^{commit}" origin/main; then
            echo "::error::O commit da tag $TAG não está na main."
            exit 1
          fi

      - name: Lint
        run: pnpm --filter @pilutech/botai-playwright run lint

      - name: Jest
        run: pnpm --filter @pilutech/botai-playwright run test

      - name: Navegadores do Playwright
        run: pnpm --filter @pilutech/botai-playwright exec playwright install --with-deps chromium firefox webkit

      - name: E2E
        run: pnpm --filter @pilutech/botai-playwright run test:e2e

      - name: Build
        run: pnpm --filter @pilutech/botai-playwright run build

      - name: O core da dependência já está no npm
        run: |
          versao_core=$(node -p "require('./packages/core/package.json').version")
          npm view "@pilutech/botai-core@$versao_core" version

      - name: Empacotar e conferir
        run: node packages/playwright/scripts/conferir-pacote.mjs --destino "$RUNNER_TEMP/pacote"

      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: pacote-playwright
          path: ${{ runner.temp }}/pacote/*.tgz
          if-no-files-found: error
          retention-days: 7

  publicar:
    name: Publicar no npm (trusted publishing)
    needs: pacote
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: npm
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '24.14.0'
          registry-url: 'https://registry.npmjs.org'

      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: pacote-playwright
          path: ${{ runner.temp }}/pacote

      - name: Publicar (pula a versão que já está no npm)
        working-directory: ${{ runner.temp }}/pacote
        run: |
          versao=$(node -p "require('$GITHUB_WORKSPACE/packages/playwright/package.json').version")
          if npm view "@pilutech/botai-playwright@$versao" version >/dev/null 2>&1; then
            echo "::notice::@pilutech/botai-playwright@$versao já está no npm: nada a publicar."
            exit 0
          fi
          tar -xzf ./*.tgz
          npm publish ./package --access public --provenance --ignore-scripts
```

O `--provenance` é o mesmo do `publicar-core.yml` (spec §5.4); o `scripts/salvaguardas.test.mjs` da raiz reprova workflow que roda `npm publish` sem ele, fora do environment `npm` ou com mais de um `id-token: write`.

- [ ] **Step 2: actionlint**

```bash
cd /Users/piluvitu/PILUTECH/Botai && actionlint .github/workflows/publicar-playwright.yml .github/workflows/ci.yml && node --test scripts/*.test.mjs; echo "EXIT=$?"
```

Esperado: EXIT=0 (o `node --test` da raiz confere as actions por SHA e o `npm publish` deste workflow no environment `npm`, com `--provenance`; ele não roda no `pnpm -r`, que não inclui a raiz).

- [ ] **Step 3: Verificação final do repo inteiro**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm install --frozen-lockfile && pnpm dedupe --check && pnpm audit --audit-level high; echo "EXIT=$?"
```

Esperado: EXIT=0.

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm -r run lint && pnpm -r run test; echo "EXIT=$?"
```

Esperado: EXIT=0, com `Scope:` contando todos os workspaces (core, extensão, site, playwright). Workspace que não aparece no output não rodou: confira que declara `lint` e `test`.

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai run test:e2e && pnpm --filter @pilutech/botai-playwright run test:e2e && pnpm --filter @pilutech/botai-playwright run build && node packages/playwright/scripts/conferir-pacote.mjs; echo "EXIT=$?"
```

Esperado: EXIT=0 (o critério de pronto da fase: E2E da extensão verdes, o fixture preenche o `cadastro.pagina.html`, os dourados passam pelo fixture).

Conferência do pacote do core do jeito que o `ci.yml` a roda (comando do job do core) e o build do site (`pnpm --filter @pilutech/botai-site run build`), ambos com EXIT=0.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git diff --name-only --diff-filter=d main -- '*.ts' '*.tsx' '*.mjs' '*.json' '*.md' '*.yml' '*.html' > "${TMPDIR:-/tmp}/botai-f3-arquivos.txt" && node_modules/.bin/prettier --check --ignore-unknown $(/bin/cat "${TMPDIR:-/tmp}/botai-f3-arquivos.txt"); echo "EXIT=$?"
```

Esperado: EXIT=0. Só os arquivos que esta fase tocou: o `--check .` do repo inteiro mandaria reformatar arquivo de fase anterior, fora do escopo (o `.prettierignore` da fase 1 tira os dourados).

- [ ] **Step 4: Commit e merge local**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add .github/workflows/publicar-playwright.yml && /usr/bin/git commit -m "ci(playwright): publicação por tag com trusted publishing e aprovação"; echo "EXIT=$?"
```

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git status --short && /usr/bin/git switch main && /usr/bin/git merge --ff-only feat/playwright && /usr/bin/git log --oneline -12; echo "EXIT=$?"
```

Esperado: nada pendente; merge fast-forward; os 10 commits desta fase no topo da `main` local. **Sem push.**

- [ ] **Step 5: Tags locais `core-v0.4.0` e `playwright-v0.1.0` (sem push)**

Como nas fases anteriores (contrato, "Branches e tags"): a tag nasce no merge, o dono só faz o push.

```bash
cd /Users/piluvitu/PILUTECH/Botai && test "$(node -p "require('./packages/core/package.json').version")" = 0.4.0 && test "$(node -p "require('./packages/playwright/package.json').version")" = 0.1.0 && /usr/bin/git tag -a core-v0.4.0 -m "@pilutech/botai-core 0.4.0" && /usr/bin/git tag -a playwright-v0.1.0 -m "@pilutech/botai-playwright 0.1.0" && /usr/bin/git tag -l 'core-v*' 'playwright-v*'; echo "EXIT=$?"
```

Esperado: `core-v0.1.0` a `core-v0.4.0` e `playwright-v0.1.0`; EXIT=0.

---

## Passos do dono (fora das tasks; nada disso roda no workflow do plano)

Ordem com as outras fases: contrato, "Ordem de execução (fases 0 a 3)" (este é o ponto 8, depois do C8 da fase 0 e dos pontos 9 e 10). As tags `core-v0.4.0` e `playwright-v0.1.0` já existem (Task 10, Step 5): aqui só sobem. Nunca as recrie no `HEAD`.

1. **A `main` sobe no C5 da fase 0** (criar o repo e o primeiro push), que já leva esta fase. Se a fase 3 rodou depois do C5: `/usr/bin/git -C /Users/piluvitu/PILUTECH/Botai push origin main`.
   Esperar o `ci.yml` (com o job `playwright`) e o `botai-e2e.yml` verdes no GitHub. O push direto na `main` não dispara o `botai-release.yml` (só PR e tag); rode a reprodução da AMO lá também, sem tocar nas lojas:
   `gh workflow run botai-release.yml --repo PiluVitu/Botai --ref main -f lojas=nenhuma` e esperar o job `pacotes` verde.
2. **Publicar o core 0.4.0**, pelo fluxo da fase 0 (tag + aprovação do environment do `publicar-core.yml`; a mesma tag dispara o `core-distribuicao.yml` da fase 2: imagem `ghcr.io/piluvitu/botai:0.4.0`, binários e GitHub Release), depois da `core-v0.3.0`:
   `/usr/bin/git -C /Users/piluvitu/PILUTECH/Botai push origin core-v0.4.0`
   Conferir: `npm view @pilutech/botai-core@0.4.0 version` devolve `0.4.0`.
3. **Primeira publicação do `@pilutech/botai-playwright` 0.1.0**, com o token só no env local (spec §5.1 e §10.2), depois do passo 2, empacotada da tag num worktree (a `main` pode ter andado). Antes, no mesmo terminal e fora de qualquer arquivo: `read -rs NPM_TOKEN && export NPM_TOKEN` (cola o token, sem eco). Depois:
   ```bash
   cd /Users/piluvitu/PILUTECH/Botai && F=$(mktemp -d) && /usr/bin/git worktree add --detach "$F/fonte" playwright-v0.1.0 && cd "$F/fonte" && pnpm install --frozen-lockfile && pnpm --filter @pilutech/botai-playwright run build && node packages/playwright/scripts/conferir-pacote.mjs --destino "$F/pacote" && tar -xzf "$F"/pacote/*.tgz -C "$F/pacote" && export NPM_CONFIG_USERCONFIG=$(mktemp) && echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > "$NPM_CONFIG_USERCONFIG" && npm publish "$F/pacote/package" --access public --ignore-scripts; rm -f "$NPM_CONFIG_USERCONFIG"; unset NPM_CONFIG_USERCONFIG NPM_TOKEN; cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git worktree remove --force "$F/fonte"; rm -rf "$F"
   ```
   (2FA ligado na conta: o npm pede o código.) Depois, revogar o token no npmjs.com.
4. **Trusted publisher** em npmjs.com → `@pilutech/botai-playwright` → Settings → Trusted publishing → GitHub Actions: organização/usuário `PiluVitu`, repositório `Botai`, workflow `publicar-playwright.yml`, environment o mesmo do `publicar-core.yml`.
5. **Push da tag da 0.1.0** (o workflow vê que a versão já está no npm e só registra; a partir da 0.1.1 ele publica):
   `/usr/bin/git -C /Users/piluvitu/PILUTECH/Botai push origin playwright-v0.1.0`
