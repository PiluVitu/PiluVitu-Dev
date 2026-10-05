# Botaí, fase 0 (separação): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar o `@piluvitu/ui` pelo monorepo, montar localmente o repo `PiluVitu/Botai` com o histórico do Botaí (extensão, landing, `@pilutech/botai-core` 0.1.0, CI, E2E, release das lojas e publicação no npm), deixar os passos do dono prontos com o comando exato e, depois do core no npm há 24 h, tirar o Botaí do monorepo.

**Architecture:** Os dois pacotes publicáveis (`@piluvitu/ui` no monorepo, `@pilutech/botai-core` no repo novo) têm dois manifestos: no workspace, `exports` aponta para o código-fonte e os apps continuam transpilando como hoje; o `publishConfig.exports` do pnpm troca para `dist/*.js` + `.d.ts` só no tarball do `pnpm pack`, que o `npm publish` sobe com trusted publishing. O repo novo nasce de um clone do monorepo passado pelo `git filter-repo` (caminhos renomeados para `extensao/`, `site/` e `packages/core/src/`), varrido pelo gitleaks e montado com as salvaguardas de dependência da spec; enquanto o `@piluvitu/ui` não está no npm há 24 h, o repo novo o instala de um tarball local por `overrides`.

**Tech Stack:** pnpm 11.1.1 · TypeScript 5.9 (`tsc` emitindo ESM + `.d.ts`) · Jest 30 + ts-jest · `node:test` · Vitest 4 (WXT 0.21.4) · Next 16 · Tailwind CSS 4 · git-filter-repo · gitleaks · GitHub Actions · npm trusted publishing · Vercel CLI 56.5.

**Spec:** `docs/superpowers/specs/2026-10-05-botai-repo-proprio-design.md` (§4, §5 e §9). **Contrato:** `docs/superpowers/plans/2026-10-05-botai-repo-proprio-contrato.md` (nomes, caminhos, branches, tags, versões e, desde este plano, a seção "Publicação no npm e environments"). Os dois viajam com este plano; quem executa lê os três.

## Global Constraints

- Monorepo `/Users/piluvitu/WWW/PiluVitu-Dev`; repo novo `/Users/piluvitu/PILUTECH/Botai` (`github.com/PiluVitu/Botai`, público, MIT); área temporária `/Users/piluvitu/PILUTECH/.botai-extracao` (apagada no fim da fase 0, passo C11).
- Branches: `feat/ui-npm` (Parte A) e `chore/botai-sai-do-monorepo` (Parte D) no monorepo, cada uma num worktree em `/Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/`; `main` no repo novo. Tags: `ui-v<versão>` (monorepo), `core-v<versão>` e `botai-v<versão>` (repo novo); a `core-v0.1.0` nasce local na B11, sem push (contrato, "Branches e tags").
- Versões: `@piluvitu/ui` 0.1.0; `@pilutech/botai-core` 0.1.0, com a API de hoje e os subpaths do contrato, sem barrel na raiz; extensão 1.0.0.
- Workspaces do repo novo: `extensao/` = `@pilutech/botai` (`private`), `site/` = `@pilutech/botai-site` (`private`), `packages/core/` = `@pilutech/botai-core` (npm). `packages/playwright/` só na fase 3.
- Pacote publicado: `"publishConfig": { "access": "public" }`, `"license": "MIT"`, `"repository"` com a URL exata do repo que publica (o npm confere na proveniência), `files` em lista fechada conferida pelo `scripts/pacote.test.mjs`; build ESM `.js` + `.d.ts` por subpath; o core sem dependência de runtime e compilado sem `lib: dom`.
- pnpm: `packageManager: pnpm@11.1.1`; `minimumReleaseAge: 1440` sem `minimumReleaseAgeExclude` (nenhuma exceção para `@pilutech/*` e `@piluvitu/*`); `trustPolicy: no-downgrade`; `blockExoticSubdeps: true`; `allowBuilds` explícito; nunca `dangerouslyAllowAllBuilds`.
- CI do repo novo: `pnpm install --frozen-lockfile`, `pnpm dedupe --check` e `pnpm audit --audit-level high`. Em todo workflow (dos dois repos), actions fixadas por SHA com a versão em comentário, `permissions` mínimas por job e `persist-credentials: false` no checkout.
- Publicação no npm: tag → job atrás do environment `npm` (aprovação do dono) → `npm publish <pasta extraída do tarball do pnpm pack> --access public --provenance` no Node 24.14.0, com trusted publishing. A primeira publicação de cada pacote sai por token do dono no env local (passos C3 e C8), apagado depois.
- Credenciais nunca no repo: env local, secrets e variables do GitHub, painel da Vercel. `.env.example` só com nomes; `.env*` no `.gitignore`, menos o `.env.example`.
- Código com identificadores em português, no estilo dos repos (aspas simples, sem ponto e vírgula, Prettier com `prettier-plugin-tailwindcss`). Lei de comentários do `CLAUDE.md` raiz: em produção, comentário raro, de 1 a 3 linhas, só com o porquê que o código não mostra; em teste, livre.
- Teste ao lado do fonte (`x.ts` → `x.test.ts`; script `x.mjs` → `x.test.mjs`, rodado por `node --test`). Jest para lógica; a extensão segue no Vitest (exceção já documentada); Storybook para componente visual; Playwright para fluxo crítico.
- Depois de cada tarefa: lint e `tsc` com EXIT=0 no que ela tocou; o `CLAUDE.md` do workspace atualizado na tarefa que traz tecnologia ou fluxo novo.
- Comando com binário direto e exit code conferido (`; echo EXIT=$?`): `/usr/bin/git`, `/usr/bin/grep`, `/bin/ls`, `/usr/bin/diff`, `/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm` e `./node_modules/.bin/<ferramenta>`. O hook do rtk reescreve `git`, `grep`, `ls`, `diff`, `pnpm`, `vitest` e `jest` chamados pelo nome e falsifica a saída; passou ou falhou se decide pelo EXIT, nunca pelo texto. Cada chamada do shell começa do zero: nenhum comando depende de variável de um passo anterior.
- Commits convencionais em pt-BR, com `/usr/bin/git add <arquivos>` e `/usr/bin/git commit -m`, sem linha de atribuição. As tarefas nunca fazem push, nunca publicam no npm, nunca criam repo no GitHub e nunca mexem na Vercel: tudo isso está na Parte C, com o comando exato.
- Grafia: "Botaí" em todo texto visível; `botai` no técnico. O nome do repo, `PiluVitu/Botai`, é técnico (decisão do dono, como o `PiluVitu/Sombrai`).

## Fontes conferidas (2026-10-05)

| O quê                                        | Valor usado                                                                                                                                                                                                                                                                                                                                                                             | Fonte                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `trustPolicy`                                | `no-downgrade`; existe desde o pnpm 10.21.0; padrão `off`                                                                                                                                                                                                                                                                                                                               | https://pnpm.io/settings/dependency-resolution                                                                                   |
| `blockExoticSubdeps`                         | `true`; desde o 10.26.0; padrão `true` (aqui explícito)                                                                                                                                                                                                                                                                                                                                 | idem                                                                                                                             |
| `minimumReleaseAge`                          | `1440`; desde o 10.16.0; padrão 1440 a partir do 11. Com valor explícito, `minimumReleaseAgeStrict` (11.0.0) fica `true`: versão exata nova demais falha o install                                                                                                                                                                                                                      | idem                                                                                                                             |
| ignorar advisory no `pnpm audit`             | no pnpm 11.1.1, `auditConfig.ignoreGhsas` (gravado por `pnpm audit --ignore <GHSA>`, desde o 10.11.0); a seção `audit.ignore` só existe a partir do 11.16.0                                                                                                                                                                                                                             | https://pnpm.io/cli/audit                                                                                                        |
| `publishConfig`                              | o pnpm troca `exports`, `main`, `types`, `bin`… antes de empacotar                                                                                                                                                                                                                                                                                                                      | https://pnpm.io/package_json                                                                                                     |
| `pnpm pack`                                  | `--json`, `--pack-destination`, `--dry-run` (10.26.0). Medido no 11.1.1: JSON limpo no stdout (o `prepack` escreve no stderr), `filename` absoluto com `--pack-destination`, `publishConfig.exports` aplicado, `publishConfig` publicado vira `{ access: 'public' }`, `scripts` saem do manifesto, `LICENSE` e `README.md` entram mesmo fora de `files`; o `--dry-run` roda o `prepack` | https://pnpm.io/cli/pack + medição local (pnpm 11.1.1, 2026-10-05)                                                               |
| `overrides` com `file:` relativo             | relativo à raiz do workspace; o lockfile grava `file:vendor/…` e o `--frozen-lockfile` passa. Acrescentar `overrides` ou trocar o nome de um importador não re-resolve o resto do lockfile (um `ms@2.0.0` com `^2.0.0` ficou na 2.0.0). Medido no 11.1.1; a doc não fala de caminho relativo                                                                                            | https://pnpm.io/settings/dependency-resolution + medição local                                                                   |
| npm trusted publishing                       | npm ≥ 11.5.1, Node ≥ 22.14.0, `id-token: write`, só runner hospedado pelo GitHub, proveniência gerada sozinha; recomenda "Require two-factor authentication and disallow tokens". Se o pacote precisa existir antes de configurar: **não confirmado** (por isso a 1ª publicação é por token, como manda a spec)                                                                         | https://docs.npmjs.com/trusted-publishers                                                                                        |
| `npm publish <arquivo>.tgz` com proveniência | **não confirmado**: o workflow publica a pasta extraída do tarball (mesmo caminho do plano da fase 3)                                                                                                                                                                                                                                                                                   | —                                                                                                                                |
| npm do Node 24.14.0                          | 11.9.0                                                                                                                                                                                                                                                                                                                                                                                  | https://nodejs.org/dist/index.json                                                                                               |
| Dependabot `cooldown`                        | `default-days` (padrão 3), `semver-major-days`, `semver-minor-days`, `semver-patch-days`, `include`, `exclude`; só version updates; `semver-*` vale para npm, não para github-actions                                                                                                                                                                                                   | https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference#cooldown-               |
| Dependabot e pnpm 11                         | a tabela lista pnpm v7 a v10 (`package-ecosystem: npm`); v11: **não confirmado**                                                                                                                                                                                                                                                                                                        | https://docs.github.com/en/code-security/dependabot/ecosystems-supported-by-dependabot/supported-ecosystems-and-repositories     |
| Tailwind e `node_modules`                    | `@source "../node_modules/<pacote>"` registra pasta ignorada por padrão; desde a 4.1.0 o `@source` segue symlink (o caso do pnpm)                                                                                                                                                                                                                                                       | https://tailwindcss.com/docs/detecting-classes-in-source-files e https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.1.0 |
| Node e TypeScript em `node_modules`          | o Node recusa TS dentro de `node_modules`; ESM exige extensão no import relativo                                                                                                                                                                                                                                                                                                        | https://nodejs.org/api/typescript.html                                                                                           |
| gitleaks                                     | `gitleaks git [repo] --log-opts=… --redact --report-path`; sai com 1 quando acha segredo; `detect` está depreciado desde a 8.19.0                                                                                                                                                                                                                                                       | https://github.com/gitleaks/gitleaks                                                                                             |
| Vercel                                       | `PATCH /v9/projects/{idOrName}` com `rootDirectory` e `sourceFilesOutsideRootDirectory` (spec OpenAPI que o CLI 56.5.0 guarda em `~/Library/Application Support/com.vercel.cli/openapi-spec.json`); `vercel git connect <url>` e `vercel git disconnect` (`vercel git --help`)                                                                                                          | CLI local                                                                                                                        |
| Jest e ESM do npm                            | sem `transformIgnorePatterns`, o Jest do site quebra com `SyntaxError: Cannot use import statement outside a module` ao carregar o `dist` do `@piluvitu/ui`; com `/node_modules/(?!\.pnpm/\|@piluvitu/ui/)` e o ts-jest transformando `.js`, passa                                                                                                                                      | medição local (layout do pnpm simulado, Jest 30 do `apps/botai-site`)                                                            |
| Build do ui e do core                        | `tsc` mantém o comentário com a sentinela no `dist/cn.js`; com `.js` acrescentado aos imports relativos, os 18 subpaths do ui carregam no Node como ESM; os 17 módulos do core compilam com `lib: ["es2022"]`, sem DOM, e os 395 testes deles (com o `prng`) passam com `testEnvironment: 'node'`                                                                                       | medição local, 2026-10-05                                                                                                        |

SHAs das actions (resolvidos com `git ls-remote` em 2026-10-05; são os mesmos commits que o CI do monorepo roda hoje pelas tags móveis, então nada muda de comportamento):

| Action                              | SHA                                        | Versão  |
| ----------------------------------- | ------------------------------------------ | ------- |
| `actions/checkout`                  | `11d5960a326750d5838078e36cf38b85af677262` | v4.4.0  |
| `actions/setup-node`                | `49933ea5288caeca8642d1e84afbd3f7d6820020` | v4.4.0  |
| `pnpm/action-setup`                 | `b906affcce14559ad1aafd4ab0e942779e9f58b1` | v4.3.0  |
| `actions/upload-artifact`           | `ea165f8d65b6e75b540449e92b4886f43607fa02` | v4.6.2  |
| `actions/download-artifact`         | `d3f86a106a0bac45b974a628896c90dbdf5c8093` | v4.3.0  |
| `aquasecurity/trivy-action`         | `57a97c7e7821a5776cebc9bb87c984fa69cba8f1` | 0.35.0  |
| `github/codeql-action/upload-sarif` | `1190a975f95ce23525efb6a3fc21ea29567c1b52` | v3.38.2 |
| `astral-sh/setup-uv` (só monorepo)  | `c771a70e6277c0a99b617c7a806ffedaca235ff9` | v9.0.0  |

## Review Focus

1. **Pacote publicado com export para arquivo que não está no tarball, ou com import relativo sem `.js`** → o consumidor quebra com `ERR_MODULE_NOT_FOUND` (Node) ou "fully specified" (webpack). Teste: `scripts/pacote.test.mjs` do ui (A2) e do core (B5): lista de arquivos, manifesto, imports que resolvem e import ESM de cada subpath no Node.
2. **Sentinela do gate fora do `dist` do `@piluvitu/ui`** (alguém liga `removeComments`) → todo consumidor do npm reprova no gate, ou alguém "conserta" o gate e ele para de medir. Teste: `scripts/pacote.test.mjs` do ui (A2) lê o nome da `@utility` do `styles.css` e exige o literal no `dist/cn.js` do tarball.
3. **`site/lojas.json` com JSON inválido ou ausente** → o build tem de quebrar, nunca sair "Em breve" com a loja publicada. Teste: `site/lib/lojas.test.ts` (B7).
4. **URL `github.com/PiluVitu/Botai` nos textos das lojas × teste de grafia** → o teste precisa aceitar a URL e seguir reprovando "Botai" em prosa. Teste: `extensao/loja/textos.test.ts` (B6).
5. **Salvaguarda de dependência afrouxada** (`minimumReleaseAgeExclude` para os nossos escopos, `trustPolicy` desligada, action por tag móvel) ou **core com `^` no `apps/web`** → uma versão nova suspeita entra sem PR. Testes: `scripts/salvaguardas.test.mjs` (B3 e B9) e `apps/web/package-json.test.ts` (D1).

## Ordem de execução (o que roda de uma vez)

A ordem que vale para as quatro fases está no contrato, "Ordem de execução (fases 0 a 3)". Para esta fase:

1. **Pré-requisito do dono:** ponto C1 (merge do PR `docs/botai-repo-proprio`, que leva a spec, o contrato e os quatro planos). Só a B1 depende dele; a Parte A não. O Claude pode fazê-lo antes do workflow (regra do dono: CI verde basta).
2. **De uma vez, sem push:** A1 → A5 (monorepo, worktree `feat/ui-npm`) e B1 → B11 (repo novo, local). A B4 e a B5 leem o que a A1 e a A2 deixaram no worktree e na branch `feat/ui-npm` (o tarball sai do `pnpm pack` local, nada vem do npm). A B1 para sozinha se o C1 não aconteceu; a B2 para se o gitleaks achar segredo. A B11 termina com a tag local `core-v0.1.0`.
3. **Ainda de uma vez, sem push:** as fases 1, 2 e 3 (planos `2026-10-05-botai-fase1-core-cli.md`, `-fase2-servidor.md` e `-fase3-playwright.md`) no mesmo repo local. O `vendor/` versionado faz todo commit até o C4 instalar sem o npm.
4. **Parte C:** passos do dono, na ordem C2 → C12, com as esperas de 24 h marcadas; depois do C8, os passos do dono das fases 1, 2 e 3 (contrato, pontos 9, 10 e 8).
5. **Parte D:** de uma vez, sem push, só depois do C8 + 24 h (a D1 confere). O merge é o C12.

## Mapa de arquivos

**Monorepo (Parte A):** `packages/ui/{package.json, tsconfig.build.json, README.md, eslint.config.mjs, CLAUDE.md}`, `packages/ui/scripts/{extensoes.mjs, extensoes.test.mjs, pacote.test.mjs}`, `.gitignore`, `pnpm-workspace.yaml`, `.github/dependabot.yml`, `.github/workflows/{publicar-ui.yml, ci.yml, trivy.yml, deploy-financas.yml, botai-e2e.yml, botai-release.yml}`, `CLAUDE.md`.

**Repo novo (Parte B):**

| Caminho                                                                                                                                  | Papel                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.gitignore`, `.env.example`, `LICENSE`, `.prettierrc`, `.husky/pre-commit`, `Makefile` | raiz do workspace e salvaguardas                                                                                                                                             |
| `scripts/check-tailwind-source.mjs` (+ `.test.mjs`)                                                                                      | gate do design system, agora contra o `@piluvitu/ui` em `node_modules`                                                                                                       |
| `scripts/salvaguardas.test.mjs`                                                                                                          | reprova o repo se uma salvaguarda de dependência sumir ou uma action perder o SHA                                                                                            |
| `vendor/piluvitu-ui-0.1.0.tgz` (versionado até o C4)                                                                                     | tarball do `@piluvitu/ui` até ele estar no npm há 24 h; versionado para os commits das tags `core-v0.1.0` a `core-v0.4.0` instalarem no CI                                   |
| `packages/core/{package.json, tsconfig.json, tsconfig.build.json, jest.config.ts, LICENSE, README.md, CLAUDE.md}`                        | o pacote `@pilutech/botai-core`                                                                                                                                              |
| `packages/core/src/*.ts`                                                                                                                 | os 17 módulos e testes (pelo filter-repo), `prng` (cópia), `atalhos` (novo)                                                                                                  |
| `packages/core/scripts/{extensoes.mjs, extensoes.test.mjs, pacote.test.mjs}`                                                             | build publicável e conferência do pacote                                                                                                                                     |
| `extensao/**`                                                                                                                            | a extensão (pelo filter-repo), com os imports, o `@source`, o zip de fontes e os scripts de release nos caminhos novos; `src/lib/entropia.ts` (cópia do `cryptoRandomBytes`) |
| `site/**`                                                                                                                                | a landing (pelo filter-repo), com `lojas.json`, `lib/lojas.ts` (antes `lib/cms.ts`) e as cópias `lib/pilulabs.ts`, `lib/contato.ts`, `lib/ico.ts`                            |
| `.github/workflows/{ci.yml, botai-e2e.yml, botai-release.yml, publicar-core.yml, trivy.yml}`, `.github/dependabot.yml`                   | CI/CD                                                                                                                                                                        |
| `CLAUDE.md`, `README.md` (raiz)                                                                                                          | guia do repo e cara pública                                                                                                                                                  |
| `docs/superpowers/**`                                                                                                                    | specs, planos, design e pesquisa do Botaí (pelo filter-repo)                                                                                                                 |

**Monorepo (Parte D):** sai `apps/botai/`, `apps/botai-site/`, 35 arquivos de `packages/tools/src/`, `.github/workflows/botai-*.yml` e os docs do Botaí; mudam `apps/web/{package.json, package-json.test.ts, components/tools/cpf-tool.tsx, components/tools/cnpj-tool.tsx, content/pilulabs/botai/index.yaml, lib/pilulabs-conteudo.test.ts, lib/pilulabs.test.ts, lib/pilulabs-json-ld.test.ts, lib/admin/content-schemas.test.ts, components/admin/content/pilulabs-form.stories.tsx, app/(site)/pilulabs/pilulabs.e2e.ts, CLAUDE.md}`, `apps/pilutech-site/lib/json-ld.test.ts`, `packages/tools/{package.json, src/index.ts, src/pilulabs.ts, src/pilulabs.test.ts, CLAUDE.md}`, `packages/ui/CLAUDE.md`, `apps/pilutech-site/CLAUDE.md`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `Makefile`, `.gitignore`, `CLAUDE.md`.

---

## Parte A — `@piluvitu/ui` publicável (monorepo, branch `feat/ui-npm`)

Tudo nesta parte roda no worktree `/Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm` (o checkout principal fica na branch de docs, intocado). O worktree não tem os hooks do husky (`.husky/_` é gerado e ignorado): o Prettier roda à mão na A5.

### Tarefa A1: script que fecha a extensão dos imports do build

**Files:**

- Create: `packages/ui/scripts/extensoes.mjs`
- Test: `packages/ui/scripts/extensoes.test.mjs`

**Interfaces:**

- Consumes: nada.
- Produces (usado na A2 e copiado para o core na B5):
  - `comExtensao(codigo: string): string` — acrescenta `.js` a todo especificador relativo (`from`, `import '…'`, `import('…')`) sem extensão; não mexe em pacote nem em `.js`/`.mjs`/`.cjs`/`.json`/`.css`.
  - `especificadoresRelativos(codigo: string): string[]`
  - `reescreverPasta(pasta: string): void` — aplica `comExtensao` a todo `.js` e `.d.ts` da pasta (recursivo).
  - `importsQueNaoResolvem(pasta: string): string[]` — `"<arquivo>: <especificador>"` de cada import relativo sem arquivo.
  - CLI: `node scripts/extensoes.mjs <pasta>` reescreve e sai com 1 se sobrar import sem arquivo.

- [ ] **Step 1: criar o worktree e instalar**

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev fetch origin main && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev worktree add /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm -b feat/ui-npm origin/main && cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm install --frozen-lockfile; echo EXIT=$?
```

Expected: `EXIT=0`.

- [ ] **Step 2: escrever o teste que falha**

`packages/ui/scripts/extensoes.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  comExtensao,
  importsQueNaoResolvem,
  reescreverPasta,
} from './extensoes.mjs'

// O Node recusa import relativo sem extensão em ESM, e o webpack trata .js de
// pacote "type": "module" como fully specified: o dist publicado precisa do .js.
test('acrescenta .js aos imports relativos sem extensão', () => {
  assert.equal(
    comExtensao("import { cn } from './cn'"),
    "import { cn } from './cn.js'",
  )
  assert.equal(
    comExtensao('export * from "../base/tipos"'),
    'export * from "../base/tipos.js"',
  )
  assert.equal(comExtensao("import './efeito'"), "import './efeito.js'")
  assert.equal(
    comExtensao("const m = import('./tardio')"),
    "const m = import('./tardio.js')",
  )
  // O tsc escreve import("./x") nas posições de tipo dos .d.ts.
  assert.equal(
    comExtensao('type T = import("./cn").Tipo'),
    'type T = import("./cn.js").Tipo',
  )
})

test('não mexe em pacote nem em import que já tem extensão', () => {
  for (const codigo of [
    "import { clsx } from 'clsx'",
    "import { jsx } from 'react/jsx-runtime'",
    "import { cn } from './cn.js'",
    "import dados from './dados.json'",
    "import './estilo.css'",
  ])
    assert.equal(comExtensao(codigo), codigo)
})

test('reescreve .js e .d.ts da pasta e acusa o import que não tem arquivo', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'extensoes-'))
  try {
    writeFileSync(join(pasta, 'cn.js'), 'export const cn = 1\n')
    writeFileSync(
      join(pasta, 'botao.js'),
      "import { cn } from './cn'\nimport { x } from './sumiu'\n",
    )
    writeFileSync(join(pasta, 'botao.d.ts'), "export { cn } from './cn'\n")
    reescreverPasta(pasta)
    assert.equal(
      readFileSync(join(pasta, 'botao.d.ts'), 'utf8'),
      "export { cn } from './cn.js'\n",
    )
    assert.deepEqual(importsQueNaoResolvem(pasta), [
      `${join(pasta, 'botao.js')}: ./sumiu.js`,
    ])
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})
```

- [ ] **Step 3: rodar e ver falhar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm/packages/ui && node --test scripts/extensoes.test.mjs; echo EXIT=$?
```

Expected: `ERR_MODULE_NOT_FOUND` para `./extensoes.mjs` e `EXIT=1`.

- [ ] **Step 4: implementar**

`packages/ui/scripts/extensoes.mjs`:

```js
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ESPECIFICADOR_RELATIVO =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g
const JA_TEM_EXTENSAO = /\.(m?js|cjs|json|css)$/

export function comExtensao(codigo) {
  return codigo.replace(
    ESPECIFICADOR_RELATIVO,
    (trecho, antes, aspas, caminho) =>
      JA_TEM_EXTENSAO.test(caminho)
        ? trecho
        : `${antes}${aspas}${caminho}.js${aspas}`,
  )
}

export function especificadoresRelativos(codigo) {
  return [...codigo.matchAll(ESPECIFICADOR_RELATIVO)].map((m) => m[3])
}

function arquivosDoBuild(pasta) {
  return readdirSync(pasta, { recursive: true, encoding: 'utf8' })
    .filter((arquivo) => arquivo.endsWith('.js') || arquivo.endsWith('.d.ts'))
    .map((arquivo) => join(pasta, arquivo))
}

export function reescreverPasta(pasta) {
  for (const arquivo of arquivosDoBuild(pasta))
    writeFileSync(arquivo, comExtensao(readFileSync(arquivo, 'utf8')))
}

export function importsQueNaoResolvem(pasta) {
  return arquivosDoBuild(pasta).flatMap((arquivo) =>
    especificadoresRelativos(readFileSync(arquivo, 'utf8'))
      .filter((caminho) => !existsSync(resolve(dirname(arquivo), caminho)))
      .map((caminho) => `${arquivo}: ${caminho}`),
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pasta = resolve(process.argv[2] ?? 'dist')
  reescreverPasta(pasta)
  const quebrados = importsQueNaoResolvem(pasta)
  if (quebrados.length > 0) {
    console.error(
      `[extensoes] import relativo sem arquivo no build:\n${quebrados.join('\n')}`,
    )
    process.exit(1)
  }
}
```

- [ ] **Step 5: rodar e ver passar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm/packages/ui && node --test scripts/extensoes.test.mjs; echo EXIT=$?
```

Expected: `# pass 3`, `# fail 0`, `EXIT=0`.

- [ ] **Step 6: commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && /usr/bin/git add packages/ui/scripts/extensoes.mjs packages/ui/scripts/extensoes.test.mjs && /usr/bin/git commit -m "feat(ui): script que fecha a extensão dos imports do build"; echo EXIT=$?
```

### Tarefa A2: build e pacote publicável do `@piluvitu/ui`

**Files:**

- Create: `packages/ui/tsconfig.build.json`, `packages/ui/README.md`
- Modify: `packages/ui/package.json`, `packages/ui/eslint.config.mjs`, `packages/ui/CLAUDE.md`, `.gitignore`, `CLAUDE.md`
- Test: `packages/ui/scripts/pacote.test.mjs`

**Interfaces:**

- Consumes: `importsQueNaoResolvem` (A1); CLI `node scripts/extensoes.mjs dist` (A1).
- Produces:
  - `packages/ui/package.json` sem `private`, com `files: ["dist", "LICENSE", "README.md"]`, `publishConfig.access: "public"` e `publishConfig.exports` (`"./styles.css": "./dist/styles.css"` e, para cada um dos 18 módulos, `{ "types": "./dist/<m>.d.ts", "default": "./dist/<m>.js" }`); o `exports` do workspace não muda.
  - scripts `build` (`dist/` com `.js`, `.d.ts` e `styles.css`), `prepack` (= `build`) e `test` (`jest && node --test scripts/*.test.mjs`).
  - Tarball `piluvitu-ui-0.1.0.tgz` do `pnpm pack`, que a B4 copia para o repo novo.

- [ ] **Step 1: escrever o teste que falha**

`packages/ui/scripts/pacote.test.mjs`:

```js
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importsQueNaoResolvem } from './extensoes.mjs'

const PACOTE = join(dirname(fileURLToPath(import.meta.url)), '..')
const FONTE = JSON.parse(readFileSync(join(PACOTE, 'package.json'), 'utf8'))
const MODULOS = Object.keys(FONTE.exports)
  .filter((subpath) => subpath !== './styles.css')
  .map((subpath) => subpath.slice(2))
const ESPERADOS = [
  'LICENSE',
  'README.md',
  'package.json',
  'dist/styles.css',
  ...MODULOS.flatMap((m) => [`dist/${m}.d.ts`, `dist/${m}.js`]),
].sort()

// O pnpm pack aplica o publishConfig.exports (o npm pack não aplicaria) e roda o prepack (o build).
const pnpm = (...args) =>
  JSON.parse(execFileSync('pnpm', args, { cwd: PACOTE, encoding: 'utf8' }))

let pasta
let publicado

before(() => {
  pasta = mkdtempSync(join(tmpdir(), 'ui-pacote-'))
  const { filename } = pnpm('pack', '--json', '--pack-destination', pasta)
  execFileSync('tar', ['-xzf', filename, '-C', pasta])
  publicado = JSON.parse(
    readFileSync(join(pasta, 'package', 'package.json'), 'utf8'),
  )
})

after(() => rmSync(pasta, { recursive: true, force: true }))

test('o pnpm pack --dry-run leva só o build, a licença e o README', () => {
  const { files } = pnpm('pack', '--dry-run', '--json')
  assert.deepEqual(files.map((arquivo) => arquivo.path).sort(), ESPERADOS)
})

test('o manifesto publicado aponta cada subpath para o build', () => {
  assert.equal(publicado.private, undefined)
  assert.equal(publicado.license, 'MIT')
  assert.deepEqual(publicado.publishConfig, { access: 'public' })
  assert.equal(
    publicado.repository.url,
    'git+https://github.com/PiluVitu/PiluVitu-Dev.git',
  )
  assert.equal(publicado.exports['./styles.css'], './dist/styles.css')
  for (const m of MODULOS)
    assert.deepEqual(publicado.exports[`./${m}`], {
      types: `./dist/${m}.d.ts`,
      default: `./dist/${m}.js`,
    })
})

// Sem o literal no dist, um app que consome o pacote do npm reprova no gate do @source.
test('o build publicado carrega a sentinela do gate', () => {
  const [, nome] = /@utility\s+([\w-]*sentinela[\w-]*)/.exec(
    readFileSync(join(PACOTE, 'src', 'styles.css'), 'utf8'),
  )
  const dist = join(pasta, 'package', 'dist')
  assert.ok(readFileSync(join(dist, 'cn.js'), 'utf8').includes(nome))
  assert.ok(
    readFileSync(join(dist, 'styles.css'), 'utf8').includes(`@utility ${nome}`),
  )
})

test('todo import relativo do build aponta para um arquivo do pacote', () => {
  assert.deepEqual(importsQueNaoResolvem(join(pasta, 'package', 'dist')), [])
})

test('cada subpath carrega no Node como ESM', async () => {
  for (const m of MODULOS)
    await import(pathToFileURL(join(PACOTE, 'dist', `${m}.js`)).href)
})
```

- [ ] **Step 2: rodar e ver falhar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm/packages/ui && node --test scripts/pacote.test.mjs; echo EXIT=$?
```

Expected: `EXIT=1`; a lista do `--dry-run` traz `CLAUDE.md`, `src/…` e `jest.config.ts`, e o manifesto aponta para `./src/…`.

- [ ] **Step 3: `tsconfig.build.json`**

`packages/ui/tsconfig.build.json` (ES2020 para não emitir o helper `__rest`; `contraste.ts` é ferramenta de teste e fica fora):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "allowJs": false,
    "target": "ES2020",
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/**/*.test.ts", "src/**/*.test.tsx", "src/contraste.ts"]
}
```

- [ ] **Step 4: `package.json` publicável**

Substitua `packages/ui/package.json` inteiro por (dependências e devDependencies iguais às de hoje):

```json
{
  "name": "@piluvitu/ui",
  "version": "0.1.0",
  "description": "Design system da PiluTech: tokens do Tailwind CSS 4, cn() e componentes shadcn/ui (Radix) para React 19.",
  "license": "MIT",
  "type": "module",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/PiluVitu/PiluVitu-Dev.git",
    "directory": "packages/ui"
  },
  "homepage": "https://github.com/PiluVitu/PiluVitu-Dev/tree/main/packages/ui#readme",
  "keywords": ["design-system", "tailwindcss", "shadcn", "radix", "react"],
  "files": ["dist", "LICENSE", "README.md"],
  "exports": {
    "./styles.css": "./src/styles.css",
    "./cn": "./src/cn.ts",
    "./ajuda": "./src/ajuda.tsx",
    "./aspect-ratio": "./src/aspect-ratio.tsx",
    "./avatar": "./src/avatar.tsx",
    "./badge": "./src/badge.tsx",
    "./button": "./src/button.tsx",
    "./card": "./src/card.tsx",
    "./chart": "./src/chart.tsx",
    "./command": "./src/command.tsx",
    "./dialog": "./src/dialog.tsx",
    "./dropdown-menu": "./src/dropdown-menu.tsx",
    "./form": "./src/form.tsx",
    "./input": "./src/input.tsx",
    "./label": "./src/label.tsx",
    "./separator": "./src/separator.tsx",
    "./sheet": "./src/sheet.tsx",
    "./skeleton": "./src/skeleton.tsx",
    "./textarea": "./src/textarea.tsx"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      "./styles.css": "./dist/styles.css",
      "./cn": { "types": "./dist/cn.d.ts", "default": "./dist/cn.js" },
      "./ajuda": { "types": "./dist/ajuda.d.ts", "default": "./dist/ajuda.js" },
      "./aspect-ratio": {
        "types": "./dist/aspect-ratio.d.ts",
        "default": "./dist/aspect-ratio.js"
      },
      "./avatar": {
        "types": "./dist/avatar.d.ts",
        "default": "./dist/avatar.js"
      },
      "./badge": { "types": "./dist/badge.d.ts", "default": "./dist/badge.js" },
      "./button": {
        "types": "./dist/button.d.ts",
        "default": "./dist/button.js"
      },
      "./card": { "types": "./dist/card.d.ts", "default": "./dist/card.js" },
      "./chart": { "types": "./dist/chart.d.ts", "default": "./dist/chart.js" },
      "./command": {
        "types": "./dist/command.d.ts",
        "default": "./dist/command.js"
      },
      "./dialog": {
        "types": "./dist/dialog.d.ts",
        "default": "./dist/dialog.js"
      },
      "./dropdown-menu": {
        "types": "./dist/dropdown-menu.d.ts",
        "default": "./dist/dropdown-menu.js"
      },
      "./form": { "types": "./dist/form.d.ts", "default": "./dist/form.js" },
      "./input": { "types": "./dist/input.d.ts", "default": "./dist/input.js" },
      "./label": { "types": "./dist/label.d.ts", "default": "./dist/label.js" },
      "./separator": {
        "types": "./dist/separator.d.ts",
        "default": "./dist/separator.js"
      },
      "./sheet": { "types": "./dist/sheet.d.ts", "default": "./dist/sheet.js" },
      "./skeleton": {
        "types": "./dist/skeleton.d.ts",
        "default": "./dist/skeleton.js"
      },
      "./textarea": {
        "types": "./dist/textarea.d.ts",
        "default": "./dist/textarea.js"
      }
    }
  },
  "peerDependencies": {
    "react": "^19.2.4"
  },
  "dependencies": {
    "@radix-ui/react-aspect-ratio": "^1.1.8",
    "@radix-ui/react-avatar": "^1.1.11",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-icons": "^1.3.2",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-popover": "^1.1.15",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slot": "^1.2.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "react-hook-form": "^7.71.2",
    "recharts": "^3.10.1",
    "tailwind-merge": "^3.5.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/jest": "^30.0.0",
    "@types/node": "^25.5.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "eslint": "^9.39.4",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-jsx-a11y": "^6.10.2",
    "eslint-plugin-react": "^7.37.5",
    "eslint-plugin-react-hooks": "^7.0.1",
    "globals": "^16.4.0",
    "jest": "^30.4.2",
    "jest-environment-jsdom": "^30.4.1",
    "react-dom": "^19.2.4",
    "ts-jest": "^29.4.9",
    "typescript": "^5.9.3",
    "typescript-eslint": "^8.57.1"
  },
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json && node scripts/extensoes.mjs dist && cp src/styles.css dist/styles.css",
    "prepack": "pnpm run build",
    "lint": "eslint .",
    "test": "jest && node --test scripts/*.test.mjs",
    "test:watch": "jest --watch"
  }
}
```

- [ ] **Step 5: ESLint e `.gitignore` sem o build**

Em `packages/ui/eslint.config.mjs`, troque `globalIgnores(['node_modules/**']),` por:

```js
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  globalIgnores(['node_modules/**', 'dist/**']),
```

No `.gitignore` da raiz, logo depois do bloco `# production`:

```
# @piluvitu/ui: o build só existe para o npm (pnpm pack)
packages/ui/dist/
```

- [ ] **Step 6: `README.md` do pacote (a página do npm)**

`packages/ui/README.md` (não escreva o nome da sentinela; o teste o lê do `styles.css`):

````markdown
# @piluvitu/ui

Design system da PiluTech: tokens do Tailwind CSS 4 (cores, raio, fontes, temas claro e escuro), o helper `cn()` e componentes [shadcn/ui](https://ui.shadcn.com) sobre Radix, para React 19.

## Instalar

```sh
pnpm add @piluvitu/ui
```

`react` 19 é peer dependency. O pacote é só ESM, com um import por componente (não há import da raiz).

## CSS

O CSS de entrada do app importa o Tailwind e os tokens, e manda o Tailwind ler as classes do pacote:

```css
@import 'tailwindcss';
@import '@piluvitu/ui/styles.css';
@source '../node_modules/@piluvitu/ui/dist';
```

O caminho do `@source` é relativo ao arquivo CSS. Sem ele o Tailwind não varre o `node_modules` e descarta, sem erro nenhum, toda classe que só existe nos componentes. Para provar isso no build, o `styles.css` define (no fim, por `@utility`) uma classe sentinela que só é gerada quando o `@source` alcança o `dist/`: procure-a no CSS emitido.

## Componentes

```tsx
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
```

Subpaths: `cn`, `ajuda`, `aspect-ratio`, `avatar`, `badge`, `button`, `card`, `chart`, `command`, `dialog`, `dropdown-menu`, `form`, `input`, `label`, `separator`, `sheet`, `skeleton`, `textarea` e `styles.css`.

## Licença

MIT, © PiluTech, com o aviso do shadcn ([`LICENSE`](./LICENSE)). Código: https://github.com/PiluVitu/PiluVitu-Dev/tree/main/packages/ui
````

- [ ] **Step 7: rodar e ver passar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm/packages/ui && node --test scripts/*.test.mjs; echo EXIT=$?
```

Expected: `# pass 8`, `# fail 0`, `EXIT=0` (3 da A1 + 5 deste arquivo).

- [ ] **Step 8: Jest, ESLint e tsc do pacote**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm/packages/ui && ./node_modules/.bin/jest && ./node_modules/.bin/eslint . && ./node_modules/.bin/tsc --noEmit -p tsconfig.json; echo EXIT=$?
```

Expected: `EXIT=0`. O Jest não acha nada em `dist/` (o `testMatch` é `*.test.ts(x)`, e o build exclui os testes).

- [ ] **Step 9: documentar no `packages/ui/CLAUDE.md`**

1. Troque o título `## Por que não tem build` e os **dois** parágrafos que vêm logo depois dele (o que começa com "Não existe `dist/`" e o que começa com "Isso não é só") por:

```markdown
## Build só para o npm

No monorepo nada muda: o `exports` aponta cada subpath para o `.tsx`/`.ts` cru de `src/`, e os bundlers de `apps/web` (webpack/Turbopack), `apps/financas/web` (Vite) e das landings (Next) transpilam o código-fonte, sem `transpilePackages` (medido nas Tasks 2/3/4). Isso continua necessário para o `@source` desses apps, que aponta para `packages/ui/src` (ver _Gate do design system_).

O pacote publicado tem outro manifesto: o `publishConfig.exports` (campo do pnpm, aplicado pelo `pnpm pack`; https://pnpm.io/package_json) troca cada subpath por `dist/<nome>.js` + `dist/<nome>.d.ts`, e `./styles.css` por `dist/styles.css`. O `build` roda sozinho no `prepack`: `tsc -p tsconfig.build.json` (ES2020, com `.d.ts`, sem testes e sem `contraste.ts`), depois `scripts/extensoes.mjs dist`, que acrescenta `.js` aos imports relativos e falha se algum ficar sem arquivo, e por fim a cópia do `styles.css`.

- **Por que o `.js` nos imports:** o Node recusa import relativo sem extensão em ESM, e o webpack trata o `.js` de pacote `"type": "module"` como "fully specified". O código-fonte segue sem extensão (é o que os apps do monorepo resolvem); só o `dist` é reescrito.
- **A sentinela no npm:** o `tsc` mantém os comentários, então o literal do comentário de `cn.ts` chega ao `dist/cn.js`, e o consumidor do npm com `@source '…/node_modules/@piluvitu/ui/dist'` passa no gate. `scripts/pacote.test.mjs` reprova o pacote se ela sumir (por exemplo, com `removeComments`).
```

2. No primeiro bullet de `## Estrutura` ("**Sem barrel `index.ts` — um export por arquivo.**"), troque o trecho `— nada é pré-compilado/emitido (\`"noEmit": true\` no \`tsconfig.json\`; o bundler de cada app consumidor faz a transpilação).`por`— no monorepo nada é pré-compilado (\`"noEmit": true\` no \`tsconfig.json\`; o bundler de cada app consumidor faz a transpilação); no pacote do npm, o \`publishConfig.exports\` aponta o mesmo mapa para \`dist/\` (ver _Build só para o npm_).`

3. Em `## Testes`, logo antes do bullet `- **Rodar:**`, acrescente:

```markdown
`scripts/extensoes.test.mjs` e `scripts/pacote.test.mjs` rodam com `node --test` no fim do `test` (depois do Jest). O segundo faz o `pnpm pack` de verdade (o `prepack` builda) e reprova se a lista do `pnpm pack --dry-run --json` mudar (ela sai das chaves do `exports`, mais `LICENSE`, `README.md` e `package.json`), se o manifesto publicado não apontar cada subpath para o `dist`, se a sentinela sumir do `dist/cn.js`, se um import relativo do `dist` ficar sem arquivo ou se um subpath não carregar no Node como ESM.
```

4. Antes de `## Dependency policy`, acrescente:

```markdown
## Publicação no npm

- `@piluvitu/ui` fica no escopo do usuário `piluvitu` no npm. `publishConfig.access: public` (pacote com escopo nasce privado, e privado é pago), MIT com o aviso do shadcn, `files: ["dist", "LICENSE", "README.md"]`, `repository` com a URL exata do monorepo (o npm confere na proveniência).
- Fluxo: subir a `version` por PR; depois do merge, tag anotada `ui-v<versão>` na `main` e push. O `.github/workflows/publicar-ui.yml` confere tag × versão e o commit na `main`, roda `lint` e `test`, empacota com `pnpm pack` e, no job `publicar` (environment `npm`, aprovação do dono, `id-token: write`, Node 24.14.0 com npm 11.9.0), extrai o tarball e roda `npm publish <pasta> --access public --provenance` com trusted publishing (npm ≥ 11.5.1 e Node ≥ 22.14.0; https://docs.npmjs.com/trusted-publishers). Sem token.
- O `npm publish` publica a pasta extraída do tarball do `pnpm pack`: só o `pnpm pack` aplica o `publishConfig.exports`, e o `npm publish` de um `.tgz` com proveniência não foi confirmado na documentação.
- A 0.1.0 saiu por token do dono no env local; o trusted publisher se configura no npmjs.com depois (Parte C do plano `docs/superpowers/plans/2026-10-05-botai-fase0-separacao.md`).
- Consumidor do npm: `@import '@piluvitu/ui/styles.css'` + `@source '<relativo>/node_modules/@piluvitu/ui/dist'` (o Tailwind segue o symlink do pnpm em `@source` desde a 4.1.0) e o gate `check-tailwind-source.mjs` no build. Jest de consumidor precisa transformar o ESM do pacote: `transformIgnorePatterns: ['/node_modules/(?!\\.pnpm/|@piluvitu/ui/)']` e o ts-jest pegando `.js` (medido no `site/` do repo do Botaí).
```

- [ ] **Step 10: documentar no `CLAUDE.md` da raiz**

1. Na tabela de workspaces, na linha de `packages/ui`, troque `consumidos por \`apps/web\`, \`apps/financas/web\`, \`apps/botai\`, \`apps/botai-site\` e \`apps/pilutech-site\``por`consumidos por \`apps/web\`, \`apps/financas/web\`, \`apps/botai\`, \`apps/botai-site\` e \`apps/pilutech-site\`; publicado no npm (\`publicar-ui.yml\`)`.
2. No bullet `- **\`packages/ui\`** — **\`@piluvitu/ui\`\*\*`, troque `um export por subpath, sem barrel, sem build próprio)`por`um export por subpath, sem barrel; no monorepo os apps leem o código-fonte, e o npm recebe o build do \`dist\` pelo \`publishConfig\`)`.

- [ ] **Step 11: commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && /usr/bin/git add packages/ui/package.json packages/ui/tsconfig.build.json packages/ui/README.md packages/ui/eslint.config.mjs packages/ui/CLAUDE.md packages/ui/scripts/pacote.test.mjs .gitignore CLAUDE.md && /usr/bin/git commit -m "feat(ui): pacote publicável no npm (build ESM + .d.ts por subpath)"; echo EXIT=$?
```

### Tarefa A3: workflow de publicação por tag `ui-v*`

**Files:**

- Create: `.github/workflows/publicar-ui.yml`
- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: scripts `lint` e `test` do `@piluvitu/ui` (A2); o tarball `piluvitu-ui-<versão>.tgz` do `pnpm pack`.
- Produces: workflow `Publicar @piluvitu/ui` (tag `ui-v*`, jobs `pacote` e `publicar`, environment `npm`), que o dono usa a partir da 0.1.1 (passo C3 configura o trusted publisher).

- [ ] **Step 1: o workflow**

`.github/workflows/publicar-ui.yml`:

```yaml
name: Publicar @piluvitu/ui

# A tag ui-v<versão> sai na main, depois do merge do PR que sobe a versão em packages/ui/package.json.
on:
  push:
    tags: ['ui-v*']

concurrency:
  group: publicar-ui-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  pacote:
    name: Verificação + pacote
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    outputs:
      versao: ${{ steps.versao.outputs.versao }}
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          fetch-depth: 0
          persist-credentials: false

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Versão (packages/ui/package.json)
        id: versao
        run: echo "versao=$(node -p "require('./packages/ui/package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Tag = ui-v<versão>, num commit da main
        env:
          VERSAO: ${{ steps.versao.outputs.versao }}
        run: |
          if [ "$GITHUB_REF_NAME" != "ui-v$VERSAO" ]; then
            echo "::error::A tag $GITHUB_REF_NAME não bate com a versão de packages/ui/package.json (esperado ui-v$VERSAO)."
            exit 1
          fi
          if ! git merge-base --is-ancestor "$GITHUB_SHA^{commit}" origin/main; then
            echo "::error::O commit da tag $GITHUB_REF_NAME não está na main."
            exit 1
          fi

      - name: Lint
        run: pnpm --filter @piluvitu/ui run lint

      - name: Test (jest + build + conferência do pacote)
        run: pnpm --filter @piluvitu/ui run test

      - name: Pacote (o pnpm pack aplica o publishConfig)
        run: pnpm --filter @piluvitu/ui pack --pack-destination "$RUNNER_TEMP/pacote"

      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: pacote-ui
          path: ${{ runner.temp }}/pacote/
          if-no-files-found: error
          retention-days: 30

  publicar:
    name: npm (trusted publishing, com proveniência)
    needs: pacote
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    environment: npm
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: pacote-ui
          path: pacote

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '24.14.0'
          registry-url: 'https://registry.npmjs.org'

      - name: npm ≥ 11.5.1 (antes disso não há trusted publishing)
        run: |
          versao=$(npm --version)
          if ! node -e 'const [a, b, c] = process.argv[1].split(".").map(Number); process.exit(a > 11 || (a === 11 && (b > 5 || (b === 5 && c >= 1))) ? 0 : 1)' "$versao"; then
            echo "::error::npm $versao: o trusted publishing pede 11.5.1 ou mais novo."
            exit 1
          fi

      - name: Extrair o tarball
        env:
          VERSAO: ${{ needs.pacote.outputs.versao }}
        run: tar -xzf "pacote/piluvitu-ui-$VERSAO.tgz" -C pacote

      - name: Publicar
        run: npm publish pacote/package --access public --provenance
```

- [ ] **Step 2: actionlint**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && /opt/homebrew/bin/actionlint .github/workflows/publicar-ui.yml; echo EXIT=$?
```

Expected: nenhuma linha de erro e `EXIT=0`.

- [ ] **Step 3: documentar no `CLAUDE.md` da raiz**

1. Na tabela "Workflows GitHub Actions", acrescente esta linha depois da de `botai-release.yml`:

```markdown
| `publicar-ui.yml` | push de tag `ui-v*` | `pacote`: confere tag = `ui-v<versão de packages/ui/package.json>` e commit na `main`, `lint` + `test` do `@piluvitu/ui` (build e conferência do pacote inclusos), `pnpm pack`, artifact `pacote-ui`. `publicar` (environment `npm`, aprovação do dono, único com `id-token: write`): extrai o tarball e roda `npm publish <pasta> --access public --provenance` no Node 24.14.0 (trusted publishing, sem token). |
```

2. Depois do bloco "**Environment `lojas-botai`**" (e das duas linhas de Secrets e Variables dele), acrescente:

```markdown
**Environment `npm`** (revisor obrigatório = o dono, sem "Prevent self-review"; branches e tags: só a regra de tag `ui-v*`), usado só pelo job `publicar` do `publicar-ui.yml`. Sem secrets: no npmjs.com, pacote `@piluvitu/ui` → Settings → Trusted publisher → GitHub Actions com `PiluVitu` / `PiluVitu-Dev` / `publicar-ui.yml` / environment `npm`; depois, "Require two-factor authentication and disallow tokens".
```

- [ ] **Step 4: commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && /usr/bin/git add .github/workflows/publicar-ui.yml CLAUDE.md && /usr/bin/git commit -m "ci(ui): publicação do @piluvitu/ui por tag, com trusted publishing"; echo EXIT=$?
```

### Tarefa A4: salvaguardas de dependência no monorepo (spec §5.3)

**Files:**

- Modify: `pnpm-workspace.yaml`, `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.github/workflows/trivy.yml`, `.github/workflows/deploy-financas.yml`, `.github/workflows/botai-e2e.yml`, `.github/workflows/botai-release.yml`, `CLAUDE.md`

**Interfaces:**

- Consumes: nada.
- Produces: `trustPolicy: no-downgrade` e `blockExoticSubdeps: true` no `pnpm-workspace.yaml`; `cooldown` nos dois ecossistemas do Dependabot; toda action dos workflows fixada pelo SHA da tabela de "Fontes conferidas"; passo `pnpm dedupe --check` no job `web` do CI.

- [ ] **Step 1: o que o monorepo tem hoje (linha de base)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && /usr/bin/grep -nE "^\s*-?\s*uses:" .github/workflows/*.yml | /usr/bin/grep -cvE "@[0-9a-f]{40} # "; echo EXIT=$?
```

Expected: um número maior que 0 (actions por tag móvel) e `EXIT=0`.

- [ ] **Step 2: `pnpm-workspace.yaml`**

Logo depois da linha `minimumReleaseAge: 1440`, acrescente:

```yaml
# Falha se um pacote perder a proveniência que tinha (pnpm ≥ 10.21.0).
trustPolicy: no-downgrade
# Só dependência direta pode vir de git ou de tarball (pnpm ≥ 10.26.0).
blockExoticSubdeps: true
```

- [ ] **Step 3: Dependabot com `cooldown`**

Em `.github/dependabot.yml`, no bloco `package-ecosystem: "npm"`, logo antes de `    # Aglomera minor e patch em uma única PR por grupo`, acrescente:

```yaml
# Dias de espera antes de propor uma versão nova (só version updates).
cooldown:
  default-days: 7
  semver-major-days: 30
  semver-minor-days: 7
  semver-patch-days: 3
```

No bloco `package-ecosystem: "github-actions"`, logo antes de `    groups:`, acrescente (`semver-*` não vale para actions):

```yaml
cooldown:
  default-days: 7
```

- [ ] **Step 4: actions por SHA em todos os workflows**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && perl -pi -e '
s{uses: actions/checkout\@v4\s*$}{uses: actions/checkout\@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0\n};
s{uses: actions/setup-node\@v4\s*$}{uses: actions/setup-node\@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0\n};
s{uses: pnpm/action-setup\@v4\s*$}{uses: pnpm/action-setup\@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0\n};
s{uses: actions/upload-artifact\@v4\s*$}{uses: actions/upload-artifact\@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2\n};
s{uses: actions/download-artifact\@v4\s*$}{uses: actions/download-artifact\@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0\n};
s{uses: aquasecurity/trivy-action\@0\.35\.0\s*$}{uses: aquasecurity/trivy-action\@57a97c7e7821a5776cebc9bb87c984fa69cba8f1 # 0.35.0\n};
s{uses: github/codeql-action/upload-sarif\@v3\s*$}{uses: github/codeql-action/upload-sarif\@1190a975f95ce23525efb6a3fc21ea29567c1b52 # v3.38.2\n};
s{uses: astral-sh/setup-uv\@v9\.0\.0\s*$}{uses: astral-sh/setup-uv\@c771a70e6277c0a99b617c7a806ffedaca235ff9 # v9.0.0\n};
' .github/workflows/*.yml && /usr/bin/grep -nE "^\s*-?\s*uses:" .github/workflows/*.yml | /usr/bin/grep -vE "@[0-9a-f]{40} # "; echo EXIT=$?
```

Expected: nenhuma linha listada e `EXIT=1` (o `grep -v` não achou nada fora do padrão).

- [ ] **Step 5: `pnpm dedupe --check` no CI**

Em `.github/workflows/ci.yml`, no job `web`, logo depois do passo `- name: Install dependencies` / `run: pnpm install --frozen-lockfile`, acrescente:

```yaml
# Duas cópias de um pacote que precisa ser único passam com tudo verde (ver "Dependency security policy" no CLAUDE.md).
- name: Dedupe check
  run: pnpm dedupe --check
```

- [ ] **Step 6: conferir install, dedupe e workflows**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm install --frozen-lockfile && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm dedupe --check && /opt/homebrew/bin/actionlint; echo EXIT=$?
```

Expected: `EXIT=0`. Se o install falhar com erro de `trustPolicy` citando um pacote, acrescente ao `pnpm-workspace.yaml` uma entrada `trustPolicyExclude:` com o nome dele e uma linha de comentário com o motivo (o pacote e a versão que perderam a proveniência), rode de novo e registre no `CLAUDE.md` (Step 7).

- [ ] **Step 7: documentar no `CLAUDE.md` da raiz**

Na seção "Dependency security policy", logo depois do bullet de `minimumReleaseAge: 1440`, acrescente:

```markdown
- **`trustPolicy: no-downgrade`** (pnpm ≥ 10.21.0): o install falha se uma versão nova de um pacote perder a proveniência ou a assinatura que as anteriores tinham. Exceção só em `trustPolicyExclude`, com o motivo comentado ao lado.
- **`blockExoticSubdeps: true`** (pnpm ≥ 10.26.0; já é o padrão no 11, aqui explícito): só dependência direta pode vir de git ou de tarball.
- **Dependabot com `cooldown`** (`.github/dependabot.yml`): npm espera 7 dias (major 30, minor 7, patch 3) antes de propor versão nova; actions, 7. Vale só para version updates (os de segurança não esperam). A tabela de ecossistemas do GitHub lista o pnpm até a v10; com o pnpm 11 não está confirmado que ele atualiza o lockfile.
- **Actions fixadas por SHA**, com a versão em comentário (`uses: actions/checkout@<sha> # v4.4.0`). Uma action nova entra já fixada (`git ls-remote --tags https://github.com/<dono>/<action> '<tag>^{}'`).
- **`pnpm dedupe --check`** roda no job `web` do CI.
- **`pnpm audit --audit-level high` ainda não está no CI daqui:** em 2026-10-05 ele achava 17 advisories high (picomatch, fast-uri, undici, node-forge, braces, webpack-dev-middleware, @babel/plugin-transform-modules-systemjs e sharp), quase todos em ferramenta de build e de Storybook. Entra num PR de remediação que zere a lista. No repo do Botaí ele já é gate.
```

- [ ] **Step 8: commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && /usr/bin/git add pnpm-workspace.yaml .github/dependabot.yml .github/workflows CLAUDE.md && /usr/bin/git commit -m "chore(deps): trustPolicy, cooldown do Dependabot e actions fixadas por SHA"; echo EXIT=$?
```

### Tarefa A5: verificação do branch `feat/ui-npm`

**Files:**

- Modify: só o que o Prettier reformatar.

**Interfaces:**

- Consumes: A1 a A4.
- Produces: branch `feat/ui-npm` pronta para o PR (passo C2) e o build do `@piluvitu/ui` que a B4 empacota.

- [ ] **Step 1: Prettier nos arquivos do branch**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && ./node_modules/.bin/prettier --write packages/ui/package.json packages/ui/tsconfig.build.json packages/ui/README.md packages/ui/CLAUDE.md packages/ui/eslint.config.mjs packages/ui/scripts CLAUDE.md pnpm-workspace.yaml .github/dependabot.yml .github/workflows && /usr/bin/git status --short; echo EXIT=$?
```

Expected: `EXIT=0`. Se o `git status` listar arquivos, revise o diff (`/usr/bin/git diff`), rode a Step 2 e commite com `style: prettier nos arquivos do @piluvitu/ui publicável`.

- [ ] **Step 2: os consumidores do monorepo seguem no código-fonte**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @piluvitu/ui run lint && $P --filter @piluvitu/ui run test && $P --filter @piluvitu/tools run lint && $P --filter @piluvitu/tools run test && $P --filter @piluvitu/web run lint && $P --filter @piluvitu/web exec tsc --noEmit && $P --filter @piluvitu/web run test && $P --filter @piluvitu/financas-web run build && $P --filter @pilutech/botai run lint && $P --filter @pilutech/botai run build && $P --filter @pilutech/botai-site run build; echo EXIT=$?
```

Expected: `EXIT=0`, com o gate do `@source` passando no `financas-web`, no `botai` e no `botai-site` (eles seguem lendo `packages/ui/src`).

- [ ] **Step 3: build do Next do `apps/web`, como no CI**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && NEXT_TELEMETRY_DISABLED=1 KEYSTATIC_GITHUB_CLIENT_ID=ci-dummy KEYSTATIC_GITHUB_CLIENT_SECRET=ci-dummy KEYSTATIC_SECRET=ci-dummy-secret-32-chars-padding-x NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG=ci-dummy /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm --filter @piluvitu/web run build:ci; echo EXIT=$?
```

Expected: `EXIT=0`.

- [ ] **Step 4: árvore limpa e log do branch**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && /usr/bin/git status --short && /usr/bin/git log --oneline origin/main..HEAD; echo EXIT=$?
```

Expected: `git status` vazio; 4 commits (ou 5, com o do Prettier); `EXIT=0`. O PR é o passo C2.

---

## Parte B — o repo novo `/Users/piluvitu/PILUTECH/Botai` (local, sem push)

### Tarefa B1: extração com histórico (`git filter-repo`)

**Files:**

- Create: `/Users/piluvitu/PILUTECH/.botai-extracao/{caminhos.txt, mensagens.txt, origem.txt, filtrado.bundle}`
- Create: `/Users/piluvitu/PILUTECH/Botai` (o repo, com o histórico reescrito)

**Interfaces:**

- Consumes: a `main` do monorepo no GitHub com o PR `docs/botai-repo-proprio` mergeado (passo C1).
- Produces: repo git em `/Users/piluvitu/PILUTECH/Botai`, branch `main`, tag anotada `botai-v1.0.0`, sem remote; árvore só com `.github/workflows/botai-{e2e,release}.yml`, `docs/superpowers/` (docs do Botaí), `extensao/`, `site/` e `packages/core/src/` (17 módulos, os testes deles e `rng-teste.ts`: 35 arquivos); `/Users/piluvitu/PILUTECH/.botai-extracao/origem.txt` com o SHA do monorepo que foi extraído.

- [ ] **Step 1: pré-condição — os docs estão na `main`**

```bash
falta=0; /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev fetch origin main --tags || falta=1; for f in specs/2026-10-05-botai-repo-proprio-design.md plans/2026-10-05-botai-repo-proprio-contrato.md plans/2026-10-05-botai-fase0-separacao.md plans/2026-10-05-botai-fase1-core-cli.md plans/2026-10-05-botai-fase2-servidor.md plans/2026-10-05-botai-fase3-playwright.md; do /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev cat-file -e "origin/main:docs/superpowers/$f" 2>/dev/null || { echo "FALTA $f"; falta=1; }; done; echo EXIT=$falta
```

Expected: nenhuma linha `FALTA` e `EXIT=0`. Com qualquer outro valor, **PARE**: o passo C1 (merge do PR de docs) ainda não aconteceu, e extrair agora deixaria a spec, o contrato e os planos (as fases 1 a 3 rodam no repo novo, lendo os planos de lá) fora do repo novo.

- [ ] **Step 2: destino livre e área vazia**

```bash
test ! -e /Users/piluvitu/PILUTECH/Botai && mkdir -p /Users/piluvitu/PILUTECH/.botai-extracao && test -z "$(/bin/ls -A /Users/piluvitu/PILUTECH/.botai-extracao)"; echo EXIT=$?
```

Expected: `EXIT=0`. Diferente disso, **PARE** e avise: uma execução anterior deixou restos (não apague sem o dono olhar).

- [ ] **Step 3: clone de uma branch só**

Um clone espelho do GitHub traria os `refs/pull/*` de todo PR; o clone da `main` (com as tags que apontam para ela) é o "fresh clone" que o filter-repo exige.

```bash
/usr/bin/git clone --single-branch --branch main https://github.com/PiluVitu/PiluVitu-Dev.git /Users/piluvitu/PILUTECH/.botai-extracao/botai && /usr/bin/git -C /Users/piluvitu/PILUTECH/.botai-extracao/botai rev-parse HEAD > /Users/piluvitu/PILUTECH/.botai-extracao/origem.txt && /usr/bin/git -C /Users/piluvitu/PILUTECH/.botai-extracao/botai tag -l; echo EXIT=$?
```

Expected: a única tag listada é `botai-v1.0.0`; `EXIT=0`.

- [ ] **Step 4: lista de caminhos**

`/Users/piluvitu/PILUTECH/.botai-extracao/caminhos.txt` (linha sem `==>` filtra pelo caminho original; linha com `==>` renomeia; `glob:` pega os planos de 2026-10-05, inclusive este, o contrato e os das fases 1 a 3):

```
apps/botai/
apps/botai/==>extensao/
apps/botai-site/
apps/botai-site/==>site/
packages/tools/src/aleatorio.ts
packages/tools/src/aleatorio.test.ts
packages/tools/src/uf.ts
packages/tools/src/uf.test.ts
packages/tools/src/cpf.ts
packages/tools/src/cpf.test.ts
packages/tools/src/cnpj.ts
packages/tools/src/cnpj.test.ts
packages/tools/src/rg.ts
packages/tools/src/rg.test.ts
packages/tools/src/pis.ts
packages/tools/src/pis.test.ts
packages/tools/src/titulo-eleitor.ts
packages/tools/src/titulo-eleitor.test.ts
packages/tools/src/celular.ts
packages/tools/src/celular.test.ts
packages/tools/src/nascimento.ts
packages/tools/src/nascimento.test.ts
packages/tools/src/senha.ts
packages/tools/src/senha.test.ts
packages/tools/src/nome.ts
packages/tools/src/nome.test.ts
packages/tools/src/endereco.ts
packages/tools/src/endereco.test.ts
packages/tools/src/empresa.ts
packages/tools/src/empresa.test.ts
packages/tools/src/cartao.ts
packages/tools/src/cartao.test.ts
packages/tools/src/pessoa.ts
packages/tools/src/pessoa.test.ts
packages/tools/src/campos.ts
packages/tools/src/campos.test.ts
packages/tools/src/campos-formatar.ts
packages/tools/src/campos-formatar.test.ts
packages/tools/src/rng-teste.ts
packages/tools/src/==>packages/core/src/
docs/superpowers/specs/2026-10-01-extensao-dados-teste-design.md
docs/superpowers/specs/2026-10-01-botai-multinavegador-design.md
docs/superpowers/specs/2026-10-02-botai-landing-design.md
docs/superpowers/specs/2026-10-05-botai-repo-proprio-design.md
docs/superpowers/plans/2026-10-01-extensao-interfaces.md
docs/superpowers/plans/2026-10-01-extensao-fase1-tools.md
docs/superpowers/plans/2026-10-01-extensao-fase2-extensao.md
docs/superpowers/plans/2026-10-01-extensao-fase3-retorno.md
docs/superpowers/plans/2026-10-01-botai-multinavegador-interfaces.md
docs/superpowers/plans/2026-10-01-botai-fase1-multinavegador.md
docs/superpowers/plans/2026-10-01-botai-fase2-pilulabs-site.md
docs/superpowers/plans/2026-10-01-botai-fase3-release-lojas.md
docs/superpowers/plans/2026-10-02-botai-landing.md
docs/superpowers/plans/2026-10-02-botai-termos.md
glob:docs/superpowers/plans/2026-10-05-botai-*.md
docs/superpowers/design/2026-10-01-extensao-dados-teste/
docs/superpowers/design/2026-10-02-botai-landing/
docs/superpowers/research/2026-10-01-extensao-dados-teste/
docs/superpowers/research/2026-10-01-botai-multinavegador/
.github/workflows/botai-e2e.yml
.github/workflows/botai-release.yml
```

Ficam no monorepo, de propósito: `specs/2026-10-01-pilulabs-v2-subdominios-design.md`, `plans/2026-10-01-pilulabs-v2.md`, `specs/2026-10-02-pilutech-site-design.md`, `plans/2026-10-02-pilutech-site.md` e `design/2026-10-02-pilutech-landing/` (são da vitrine do `apps/web` e da landing da PiluTech, que só citam o Botaí).

- [ ] **Step 5: mensagens com PR do monorepo**

`/Users/piluvitu/PILUTECH/.botai-extracao/mensagens.txt` (os squash merges terminam em `(#53)`; no repo novo, `#53` apontaria para um PR que não existe):

```
regex:\(#([0-9]+)\)==>(PiluVitu/PiluVitu-Dev#\1)
```

- [ ] **Step 6: todo caminho da lista existe no clone**

```bash
cd /Users/piluvitu/PILUTECH/.botai-extracao/botai && falta=0; for f in $(/usr/bin/grep -vE '==>|^glob:' ../caminhos.txt); do /usr/bin/git cat-file -e "HEAD:${f%/}" 2>/dev/null || { echo "FALTA $f"; falta=1; }; done; /usr/bin/git ls-tree --name-only HEAD docs/superpowers/plans/ | /usr/bin/grep -c '2026-10-05-botai-'; echo EXIT=$falta
```

Expected: nenhuma linha `FALTA`, a contagem dos planos de 2026-10-05 (pelo menos 5: o contrato e os planos das fases 0 a 3) e `EXIT=0`.

- [ ] **Step 7: reescrever o histórico**

```bash
cd /Users/piluvitu/PILUTECH/.botai-extracao/botai && /opt/homebrew/bin/git-filter-repo --paths-from-file ../caminhos.txt --replace-message ../mensagens.txt; echo EXIT=$?
```

Expected: `EXIT=0` e, no fim da saída, "Completely finished after …".

- [ ] **Step 8: a árvore tem só o que devia**

```bash
cd /Users/piluvitu/PILUTECH/.botai-extracao/botai && /usr/bin/git ls-tree --name-only HEAD && /usr/bin/git ls-tree --name-only HEAD packages/ packages/core/ && /usr/bin/git ls-tree -r --name-only HEAD packages/core/src | wc -l && /usr/bin/git ls-tree --name-only HEAD .github/workflows/ && /usr/bin/git tag -l && /usr/bin/git cat-file -t botai-v1.0.0 && /usr/bin/git remote -v; echo EXIT=$?
```

Expected: raiz = `.github`, `docs`, `extensao`, `packages`, `site`; `packages/core`, e dentro dele só `src`; `35`; `botai-e2e.yml` e `botai-release.yml`; tag `botai-v1.0.0`, do tipo `tag`; nenhum remote; `EXIT=0`.

- [ ] **Step 9: os arquivos são os mesmos do monorepo, na `main` e na tag**

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev fetch origin main --tags && M=/Users/piluvitu/WWW/PiluVitu-Dev && N=/Users/piluvitu/PILUTECH/.botai-extracao/botai && O=$(cat /Users/piluvitu/PILUTECH/.botai-extracao/origem.txt) && ok=0 && par() { a=$(/usr/bin/git -C "$M" rev-parse "$1") && b=$(/usr/bin/git -C "$N" rev-parse "$2") && [ "$a" = "$b" ] || { echo "DIFERE $1 x $2"; ok=1; }; } && par "$O:apps/botai" HEAD:extensao && par "$O:apps/botai-site" HEAD:site && par "$O:.github/workflows/botai-e2e.yml" HEAD:.github/workflows/botai-e2e.yml && par "$O:.github/workflows/botai-release.yml" HEAD:.github/workflows/botai-release.yml && par botai-v1.0.0:apps/botai botai-v1.0.0:extensao && par botai-v1.0.0:apps/botai-site botai-v1.0.0:site && for f in $(/usr/bin/git -C "$N" ls-tree --name-only HEAD packages/core/src/); do par "$O:packages/tools/src/${f#packages/core/src/}" "HEAD:$f"; done; echo EXIT=$ok
```

Expected: nenhuma linha `DIFERE` e `EXIT=0` (hash de árvore igual = conteúdo byte a byte igual; na tag, a 1.0.0 que está nas lojas).

- [ ] **Step 10: mensagens reescritas**

```bash
cd /Users/piluvitu/PILUTECH/.botai-extracao/botai && /usr/bin/git log --format=%s | /usr/bin/grep -cE '\(#[0-9]+\)'; /usr/bin/git log --format=%s | /usr/bin/grep -c 'PiluVitu/PiluVitu-Dev#'; /usr/bin/git log --oneline | wc -l; /usr/bin/git log --reverse --format='%h %ad %s' --date=short | head -1
```

Expected: `0`, depois um número maior que 0, o total de commits e o primeiro commit (o primeiro que tocou o Botaí).

- [ ] **Step 11: cópia de segurança e mudança para o destino**

```bash
cd /Users/piluvitu/PILUTECH/.botai-extracao/botai && /usr/bin/git bundle create ../filtrado.bundle --all && /usr/bin/git bundle verify ../filtrado.bundle && mv /Users/piluvitu/PILUTECH/.botai-extracao/botai /Users/piluvitu/PILUTECH/Botai && /usr/bin/git -C /Users/piluvitu/PILUTECH/Botai status --short && /usr/bin/git -C /Users/piluvitu/PILUTECH/Botai branch --show-current; echo EXIT=$?
```

Expected: "The bundle records a complete history" (ou "is okay"), `status` vazio, `main`, `EXIT=0`. O `filtrado.bundle` restaura o ponto de partida se uma tarefa seguinte estragar o repo (`git clone filtrado.bundle`).

### Tarefa B2: varredura de segredos no histórico inteiro (spec §5.2)

**Files:**

- Create: `/Users/piluvitu/PILUTECH/.botai-extracao/gitleaks-historico.json` (fora do repo)

**Interfaces:**

- Consumes: o repo da B1.
- Produces: relatório vazio do gitleaks, condição para seguir na B3.

- [ ] **Step 1: instalar o gitleaks (fora do repo)**

```bash
command -v gitleaks >/dev/null || brew install gitleaks; gitleaks version; echo EXIT=$?
```

Expected: uma versão 8.19 ou mais nova e `EXIT=0`.

- [ ] **Step 2: varrer todo commit de toda ref**

```bash
gitleaks git --log-opts="--all" --redact --verbose --report-format json --report-path /Users/piluvitu/PILUTECH/.botai-extracao/gitleaks-historico.json /Users/piluvitu/PILUTECH/Botai; echo EXIT=$?
```

Expected: "no leaks found" e `EXIT=0`.

Se `EXIT=1`: **PARE a Parte B aqui** e reporte ao dono o caminho do relatório (o segredo vem mascarado por `--redact`), o arquivo e o commit de cada achado. Pela spec §5.2, o segredo é revogado primeiro e o commit reescrito antes de qualquer push; nada disso é feito sem o dono. Não crie allowlist para o achado passar.

### Tarefa B3: raiz do repo (workspace, salvaguardas, gate e Makefile)

**Files:**

- Create: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.gitignore`, `.env.example`, `LICENSE`, `.prettierrc`, `.husky/pre-commit`, `Makefile`, `scripts/check-tailwind-source.mjs`
- Test: `scripts/salvaguardas.test.mjs`, `scripts/check-tailwind-source.test.mjs`

**Interfaces:**

- Consumes: a árvore da B1.
- Produces:
  - workspace pnpm com `extensao`, `site` e `packages/*`; `overrides` do `@piluvitu/ui` para `file:vendor/piluvitu-ui-0.1.0.tgz` (o tarball chega na B4);
  - `scripts/check-tailwind-source.mjs <pasta-ou-glob>`: exit 0 com a sentinela no CSS emitido; exit 1 sem ela, sem CSS ou com pasta ausente (mensagem cita `node_modules/@piluvitu/ui/dist`); ignora `dev/`, `cache/` e `node_modules/` abaixo da pasta pedida;
  - alvos do Makefile: `test`, `lint`, `stop`, `test-core`, `build-core` e os mesmos `*-botai` e `*-botai-site` do monorepo.

- [ ] **Step 1: escrever os testes que falham**

`scripts/salvaguardas.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ler = (arquivo) => readFileSync(join(RAIZ, arquivo), 'utf8')
const workspace = ler('pnpm-workspace.yaml')
const valor = (chave) =>
  new RegExp(`^${chave}:[ \\t]*(\\S+)`, 'm').exec(workspace)?.[1]

// Spec §5.3: uma conta do npm invadida não empurra versão nova para cá no mesmo dia.
test('versão publicada há menos de 24 h não instala, inclusive @pilutech/* e @piluvitu/*', () => {
  assert.equal(valor('minimumReleaseAge'), '1440')
  assert.doesNotMatch(workspace, /^minimumReleaseAgeExclude:/m)
})

test('pacote que perde a proveniência, ou dependência transitiva de git/tarball, falha o install', () => {
  assert.equal(valor('trustPolicy'), 'no-downgrade')
  assert.equal(valor('blockExoticSubdeps'), 'true')
})

test('script de instalação só roda para quem está no allowBuilds', () => {
  assert.match(workspace, /^allowBuilds:$/m)
  assert.doesNotMatch(workspace, /dangerouslyAllowAllBuilds/)
})

// O pnpm do repo é o mesmo que o revisor da AMO instala pelo corepack.
test('o pnpm é o 11.1.1 fixado no packageManager', () => {
  assert.equal(JSON.parse(ler('package.json')).packageManager, 'pnpm@11.1.1')
})

test('credencial não entra no repo: .env* ignorado, só o .env.example passa', () => {
  const linhas = ler('.gitignore').split('\n')
  assert.ok(linhas.includes('.env*'))
  assert.ok(linhas.includes('!.env.example'))
})
```

`scripts/check-tailwind-source.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  'check-tailwind-source.mjs',
)
// Montado em pedaços: o literal inteiro num arquivo varrido pelo Tailwind geraria a classe sozinho.
const SENTINELA = ['.ui', 'sentinela', 'nao', 'remover'].join('-')

function gate(arquivos) {
  const pasta = mkdtempSync(join(tmpdir(), 'gate-'))
  try {
    for (const [caminho, css] of Object.entries(arquivos)) {
      mkdirSync(dirname(join(pasta, caminho)), { recursive: true })
      writeFileSync(join(pasta, caminho), css)
    }
    return spawnSync(process.execPath, [SCRIPT, pasta], { encoding: 'utf8' })
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
}

test('passa quando o CSS emitido tem a sentinela', () => {
  assert.equal(gate({ 'static/a.css': `${SENTINELA}{content:'x'}` }).status, 0)
})

test('reprova sem a sentinela e aponta o @piluvitu/ui do node_modules', () => {
  const { status, stderr } = gate({ 'static/a.css': '.outra{}' })
  assert.equal(status, 1)
  assert.match(stderr, /node_modules\/@piluvitu\/ui\/dist/)
})

// O `next dev` deixa CSS de uma sessão antiga em .next/dev: contá-lo aprovaria @source quebrado.
test('ignora o CSS de dev/, cache/ e node_modules/ abaixo da pasta pedida', () => {
  const { status } = gate({
    'dev/a.css': `${SENTINELA}{}`,
    'cache/b.css': `${SENTINELA}{}`,
    'node_modules/c.css': `${SENTINELA}{}`,
    'static/d.css': '.outra{}',
  })
  assert.equal(status, 1)
})

test('pasta que não existe reprova', () => {
  const { status, stderr } = spawnSync(
    process.execPath,
    [SCRIPT, join(tmpdir(), 'gate-que-nao-existe')],
    { encoding: 'utf8' },
  )
  assert.equal(status, 1)
  assert.match(stderr, /Diretório não existe/)
})
```

- [ ] **Step 2: rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai && node --test scripts/*.test.mjs; echo EXIT=$?
```

Expected: `EXIT=1` (`ENOENT` no `pnpm-workspace.yaml` e o script do gate ausente).

- [ ] **Step 3: o gate, com os caminhos do repo novo**

O mesmo algoritmo do `scripts/check-tailwind-source.mjs` do monorepo, com as mensagens apontando para o pacote do npm e com o filtro de `dev`/`cache`/`node_modules` valendo só abaixo da pasta pedida (no monorepo ele olhava o caminho absoluto inteiro, e um repo clonado em `~/dev/…` sairia sem nenhum CSS). `scripts/check-tailwind-source.mjs`:

```js
#!/usr/bin/env node
// Sem a sentinela no CSS emitido, o `@source` do app não alcança o `@piluvitu/ui` em `node_modules`
// e o Tailwind descartou as classes dele sem erro (ver "Gate do design system" no CLAUDE.md da raiz).

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const SENTINEL_SELECTOR = '.ui-sentinela-nao-remover'
const SENTINEL_SOURCE = 'node_modules/@piluvitu/ui/dist'
const SEGMENTOS_IGNORADOS = ['node_modules', 'cache', 'dev']

function falhar(mensagem) {
  console.error(mensagem)
  process.exit(1)
}

function usoErrado() {
  falhar(
    [
      'Uso: node scripts/check-tailwind-source.mjs <diretório-ou-glob-de-css>',
      '',
      'Exemplos (de dentro do workspace):',
      '  node ../scripts/check-tailwind-source.mjs .next',
      '  node ../scripts/check-tailwind-source.mjs .output/chrome-mv3',
    ].join('\n'),
  )
}

function ehGlob(caminho) {
  return /[*?[\]]/.test(caminho)
}

function globParaRegExp(segmento) {
  const escapado = segmento
    .replace(/[.+^${}()|\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escapado}$`)
}

function pastaAusente(pasta) {
  return [
    `[check-tailwind-source] Diretório não existe: ${pasta}`,
    '',
    'O build rodou antes deste gate? Ele lê o output já gerado',
    '(`next build`, `wxt build`): rode o build primeiro.',
  ].join('\n')
}

function listar(pasta, opcoes) {
  try {
    return readdirSync(pasta, opcoes)
  } catch (erro) {
    if (erro.code === 'ENOENT') falhar(pastaAusente(pasta))
    throw erro
  }
}

function arquivosCss(argumento) {
  const absoluto = resolve(process.cwd(), argumento)

  if (ehGlob(argumento)) {
    const pasta = dirname(absoluto)
    const padrao = globParaRegExp(absoluto.slice(pasta.length + 1))
    return listar(pasta, { withFileTypes: true })
      .filter(
        (e) => e.isFile() && e.name.endsWith('.css') && padrao.test(e.name),
      )
      .map((e) => join(pasta, e.name))
  }

  let info
  try {
    info = statSync(absoluto)
  } catch (erro) {
    if (erro.code === 'ENOENT') falhar(pastaAusente(absoluto))
    throw erro
  }
  if (info.isFile()) return absoluto.endsWith('.css') ? [absoluto] : []

  // `dev/` guarda o CSS de um `next dev` antigo: contá-lo aprovava `@source` quebrado (medido no monorepo).
  return listar(absoluto, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith('.css'))
    .map((e) => join(e.parentPath ?? e.path ?? absoluto, e.name))
    .filter(
      (arquivo) =>
        !relative(absoluto, arquivo)
          .split(sep)
          .some((segmento) => SEGMENTOS_IGNORADOS.includes(segmento)),
    )
}

function sentinelaAusente(argumento, arquivos) {
  const verificados =
    arquivos.length > 0
      ? arquivos.map((arquivo) => `    - ${arquivo}`).join('\n')
      : '    (nenhum arquivo .css encontrado)'
  return [
    `[check-tailwind-source] Classe sentinela ausente no CSS emitido de "${argumento}".`,
    '',
    `O que está errado: o \`@source\` do app não está alcançando \`${SENTINEL_SOURCE}\`.`,
    'O Tailwind v4 não varreu essa pasta, então TODA classe que só existe no',
    '@piluvitu/ui (não só a sentinela) saiu do CSS final, e os componentes do',
    'design system vão renderizar sem estilo.',
    '',
    'Como conferir:',
    '  1. No CSS de entrada do app, confirme as linhas (nesta ordem):',
    "       @import 'tailwindcss';",
    "       @import '@piluvitu/ui/styles.css';",
    `       @source '<caminho relativo para>/${SENTINEL_SOURCE}';`,
    '  2. O caminho do @source é relativo ao arquivo CSS e tem de chegar ao',
    '     node_modules do workspace (extensao/ ou site/), não ao da raiz.',
    '  3. Rode o build de novo e depois este gate:',
    `       node ../scripts/check-tailwind-source.mjs ${argumento}`,
    '',
    `Classe procurada: ${SENTINEL_SELECTOR} (definida no styles.css do @piluvitu/ui)`,
    'Arquivos .css verificados:',
    verificados,
  ].join('\n')
}

const argumento = process.argv[2]
if (!argumento) usoErrado()
const arquivos = arquivosCss(argumento)
if (
  !arquivos.some((arquivo) =>
    readFileSync(arquivo, 'utf8').includes(SENTINEL_SELECTOR),
  )
)
  falhar(sentinelaAusente(argumento, arquivos))
```

- [ ] **Step 4: `package.json` da raiz**

```json
{
  "name": "botai",
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "packageManager": "pnpm@11.1.1",
  "scripts": {
    "prepare": "husky",
    "test": "pnpm -r test && node --test scripts/*.test.mjs",
    "lint": "pnpm -r lint",
    "prettier:fix": "pnpm -r prettier:fix"
  },
  "lint-staged": {
    "*.{js,mjs,ts,tsx,json,md,css}": "prettier --write"
  },
  "devDependencies": {
    "husky": "^9.1.7",
    "lint-staged": "^17.0.5",
    "prettier": "^3.8.1",
    "prettier-plugin-tailwindcss": "^0.7.2"
  }
}
```

O `prepare` do husky também roda no `pnpm install` do revisor da AMO (o `package.json` da raiz vai no zip de fontes): sem `.git`, o husky 9.1.7 só imprime ".git can't be found" e sai com 0 (conferido no código dele, `node_modules/husky/index.js`). O `lint-staged` da raiz não pega `.yml`/`.yaml`, como no monorepo: o Prettier reformataria o `pnpm-lock.yaml`.

- [ ] **Step 5: `pnpm-workspace.yaml`**

```yaml
packages:
  - 'extensao'
  - 'site'
  - 'packages/*'

# Só estes pacotes rodam script de instalação (o pnpm 11 bloqueia o resto).
allowBuilds:
  core-js-pure: true
  esbuild: true
  sharp: true
  unrs-resolver: true

# Versão publicada há menos de 24 h não instala, inclusive @pilutech/* e @piluvitu/* (spec §5.3).
minimumReleaseAge: 1440
# Falha se um pacote perder a proveniência que tinha (pnpm ≥ 10.21.0).
trustPolicy: no-downgrade
# Só dependência direta pode vir de git ou de tarball (pnpm ≥ 10.26.0).
blockExoticSubdeps: true

# Até o @piluvitu/ui 0.1.0 estar no npm há 24 h (passo C4 do plano da fase 0).
overrides:
  '@piluvitu/ui': 'file:vendor/piluvitu-ui-0.1.0.tgz'
```

- [ ] **Step 6: `.npmrc`, `.gitignore`, `.env.example`, `.prettierrc`, `.husky/pre-commit`, `LICENSE`**

`.npmrc`:

```
# O eslint-config-next (site/) resolve o next por require: ele precisa estar na raiz do node_modules.
hoist-pattern[]=next
public-hoist-pattern[]=next
```

`.gitignore`:

```
# dependências e builds
node_modules/
.next/
dist/
coverage/
*.tsbuildinfo
next-env.d.ts
.vercel
.DS_Store
.pnpm-store/

# testes e Storybook (o Tailwind varreria CSS já compilado, e o gate passaria sem medir nada)
test-results/
playwright-report/
storybook-static/
*storybook.log

# extensão (WXT): sem isto o Tailwind varre builds antigos e o gate do @source passa sem medir nada
extensao/.output/
extensao/.wxt/
extensao/web-ext.config.ts

# credenciais: só o .env.example entra (o .env.submit do `wxt submit` também cai aqui)
.env*
!.env.example
```

O `vendor/` **não** entra aqui: o tarball do `@piluvitu/ui` é versionado até o passo C4, para que os commits das tags `core-v0.1.0` a `core-v0.4.0` (criados antes do C4) instalem no CI do GitHub e num worktree limpo.

`.env.example`:

```
# Nomes das credenciais do Botaí. Os valores nunca entram no repo.

# npm: só na primeira publicação de cada pacote, no shell local, e apagado depois
# (as seguintes saem do GitHub Actions por trusted publishing, sem token).
NPM_TOKEN=

# Lojas: secrets e variables do environment lojas-botai no GitHub. Para rodar o
# `wxt submit` local, eles vão em extensao/.env.submit (ignorado pelo git).
CHROME_EXTENSION_ID=
CHROME_PUBLISHER_ID=
CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL=
CHROME_SERVICE_ACCOUNT_PRIVATE_KEY=
FIREFOX_JWT_ISSUER=
FIREFOX_JWT_SECRET=
EDGE_PRODUCT_ID=
EDGE_CLIENT_ID=
EDGE_API_KEY=

# Site: painel da Vercel, projeto botai-site (ver site/.env.example).
GOOGLE_SITE_VERIFICATION=
```

`.husky/pre-commit`:

```
pnpm exec lint-staged
```

`.prettierrc` e `LICENSE` (MIT © PiluTech, o mesmo texto da extensão):

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev show "$(cat /Users/piluvitu/PILUTECH/.botai-extracao/origem.txt):.prettierrc" > .prettierrc && cp extensao/LICENSE LICENSE && head -3 LICENSE; echo EXIT=$?
```

Expected: `MIT License`, linha vazia, `Copyright (c) 2026 PiluTech`; `EXIT=0`.

- [ ] **Step 7: `Makefile`**

Receitas com TAB (não espaços):

```make
.PHONY: test lint stop \
        test-core build-core \
        dev-botai build-botai test-botai test-e2e-botai storybook-botai zip-botai versao-botai release-botai capturas-botai \
        dev-botai-site build-botai-site test-botai-site test-e2e-botai-site storybook-botai-site

test:
	pnpm -r test && node --test scripts/*.test.mjs

lint:
	pnpm -r lint

stop:
	@for p in 3018 6018 3020 6019; do \
		pids=$$(lsof -ti tcp:$$p -sTCP:LISTEN 2>/dev/null); \
		if [ -n "$$pids" ]; then kill $$pids 2>/dev/null && echo "killed :$$p ($$pids)"; else echo ":$$p free"; fi; \
	done

# --- core (@pilutech/botai-core, publicado no npm) ---
test-core:
	pnpm --filter @pilutech/botai-core test

build-core:
	pnpm --filter @pilutech/botai-core build

# --- extensão (MV3 para Chrome, Edge, Opera e Firefox, WXT) ---
# Dev em 3018 e Storybook em 6018. Carregar .output/chrome-mv3-dev sem empacotar; o dev acrescenta `tabs` e
# host de localhost ao manifesto, então bug de activeTab só aparece no build.
dev-botai:
	pnpm --filter @pilutech/botai dev

build-botai:
	pnpm --filter @pilutech/botai build

test-botai:
	pnpm --filter @pilutech/botai test

test-e2e-botai:
	pnpm --filter @pilutech/botai test:e2e

storybook-botai:
	pnpm --filter @pilutech/botai storybook

# Os 3 pacotes (Chrome e Edge, Firefox, Opera sem minificar) + o zip de fontes da AMO em extensao/.output/.
zip-botai:
	pnpm --filter @pilutech/botai zip

# Versão e release (ver "Publicação" em extensao/CLAUDE.md). O repo só aceita squash:
# o bump vai num PR e a tag sai na main depois do merge.
versao-botai:
	@test -n "$(V)" || { echo "uso: make versao-botai V=x.y.z" >&2; exit 1; }
	bash extensao/scripts/versao.sh $(V)

release-botai:
	bash extensao/scripts/release.sh

# Imagens das lojas em extensao/loja/imagens/ e cópias para o site/. Rode no Mac: a vitrine usa as fontes do sistema.
capturas-botai:
	pnpm --filter @pilutech/botai capturas

# --- site (landing do Botaí, Next 16) ---
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

- [ ] **Step 8: rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai && node --test scripts/*.test.mjs && /usr/bin/grep -c "$(printf '^\t')" Makefile; echo EXIT=$?
```

Expected: `# pass 9`, `# fail 0`, um número maior que 0 de linhas com TAB e `EXIT=0`.

- [ ] **Step 9: commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add package.json pnpm-workspace.yaml .npmrc .gitignore .env.example LICENSE .prettierrc .husky/pre-commit Makefile scripts && /usr/bin/git commit -m "chore: raiz do repo do Botaí (workspace, salvaguardas, gate e Makefile)"; echo EXIT=$?
```

### Tarefa B4: o grafo de dependências (core no workspace, `@piluvitu/ui` do tarball, primeiro install)

**Files:**

- Create: `vendor/piluvitu-ui-0.1.0.tgz` (versionado até o C4), `packages/core/{package.json, tsconfig.json, tsconfig.build.json, jest.config.ts, LICENSE}`, `packages/core/src/prng.ts`, `packages/core/src/prng.test.ts`, `pnpm-lock.yaml`, `/Users/piluvitu/PILUTECH/.botai-extracao/comparar-lockfiles.cjs`
- Modify: `extensao/package.json`, `site/package.json`

**Interfaces:**

- Consumes: o build do `@piluvitu/ui` da A2 (branch `feat/ui-npm`, no worktree); a raiz da B3.
- Produces:
  - `@pilutech/botai-core` no workspace, com `exports` → `./src/<m>.ts` e `publishConfig.exports` → `dist/`, subpaths do contrato (`aleatorio`, `prng`, `uf`, `cpf`, `cnpj`, `rg`, `pis`, `titulo-eleitor`, `celular`, `nascimento`, `senha`, `nome`, `endereco`, `empresa`, `cartao`, `pessoa`, `campos`, `campos-formatar`, `atalhos`);
  - `extensao` e `site` dependendo de `"@pilutech/botai-core": "workspace:*"` e `"@piluvitu/ui": "0.1.0"` (o código deles passa a usar o core na B6 e na B7; até lá, os testes deles quebram, e só os do core contam nesta tarefa);
  - `pnpm-lock.yaml` com as mesmas versões que o monorepo resolvia para a extensão e o site.

- [ ] **Step 1: o tarball do `@piluvitu/ui` (build da A2)**

```bash
mkdir -p /Users/piluvitu/PILUTECH/Botai/vendor && cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm --filter @piluvitu/ui pack --pack-destination /Users/piluvitu/PILUTECH/Botai/vendor && tar -tzf /Users/piluvitu/PILUTECH/Botai/vendor/piluvitu-ui-0.1.0.tgz | sort | head -5; echo EXIT=$?
```

Expected: `package/LICENSE`, `package/README.md`, `package/dist/ajuda.d.ts`… e `EXIT=0`. Se o worktree já foi removido: `/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev worktree add /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm feat/ui-npm`, `pnpm install --frozen-lockfile` nele e repita.

- [ ] **Step 2: o pacote `@pilutech/botai-core`**

`packages/core/package.json` (o `@types/node` fica para os testes de script das fases 1 a 3; o `tsconfig.json` só carrega os tipos do Jest, então o código do core continua sem tipos do Node):

```json
{
  "name": "@pilutech/botai-core",
  "version": "0.1.0",
  "description": "Motor do Botaí: pessoa brasileira de teste coerente (CPF, CNPJ, RG, PIS, título de eleitor, celular, CEP real, cartão de teste) e classificador de campos de formulário. TypeScript puro, sem dependências.",
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "repository": {
    "type": "git",
    "url": "git+https://github.com/PiluVitu/Botai.git",
    "directory": "packages/core"
  },
  "homepage": "https://github.com/PiluVitu/Botai/tree/main/packages/core#readme",
  "keywords": [
    "cpf",
    "cnpj",
    "dados-de-teste",
    "fake-data",
    "brasil",
    "formulario",
    "botai"
  ],
  "files": ["dist", "LICENSE", "README.md"],
  "exports": {
    "./aleatorio": "./src/aleatorio.ts",
    "./prng": "./src/prng.ts",
    "./uf": "./src/uf.ts",
    "./cpf": "./src/cpf.ts",
    "./cnpj": "./src/cnpj.ts",
    "./rg": "./src/rg.ts",
    "./pis": "./src/pis.ts",
    "./titulo-eleitor": "./src/titulo-eleitor.ts",
    "./celular": "./src/celular.ts",
    "./nascimento": "./src/nascimento.ts",
    "./senha": "./src/senha.ts",
    "./nome": "./src/nome.ts",
    "./endereco": "./src/endereco.ts",
    "./empresa": "./src/empresa.ts",
    "./cartao": "./src/cartao.ts",
    "./pessoa": "./src/pessoa.ts",
    "./campos": "./src/campos.ts",
    "./campos-formatar": "./src/campos-formatar.ts",
    "./atalhos": "./src/atalhos.ts"
  },
  "publishConfig": {
    "access": "public",
    "exports": {
      "./aleatorio": {
        "types": "./dist/aleatorio.d.ts",
        "default": "./dist/aleatorio.js"
      },
      "./prng": { "types": "./dist/prng.d.ts", "default": "./dist/prng.js" },
      "./uf": { "types": "./dist/uf.d.ts", "default": "./dist/uf.js" },
      "./cpf": { "types": "./dist/cpf.d.ts", "default": "./dist/cpf.js" },
      "./cnpj": { "types": "./dist/cnpj.d.ts", "default": "./dist/cnpj.js" },
      "./rg": { "types": "./dist/rg.d.ts", "default": "./dist/rg.js" },
      "./pis": { "types": "./dist/pis.d.ts", "default": "./dist/pis.js" },
      "./titulo-eleitor": {
        "types": "./dist/titulo-eleitor.d.ts",
        "default": "./dist/titulo-eleitor.js"
      },
      "./celular": {
        "types": "./dist/celular.d.ts",
        "default": "./dist/celular.js"
      },
      "./nascimento": {
        "types": "./dist/nascimento.d.ts",
        "default": "./dist/nascimento.js"
      },
      "./senha": { "types": "./dist/senha.d.ts", "default": "./dist/senha.js" },
      "./nome": { "types": "./dist/nome.d.ts", "default": "./dist/nome.js" },
      "./endereco": {
        "types": "./dist/endereco.d.ts",
        "default": "./dist/endereco.js"
      },
      "./empresa": {
        "types": "./dist/empresa.d.ts",
        "default": "./dist/empresa.js"
      },
      "./cartao": {
        "types": "./dist/cartao.d.ts",
        "default": "./dist/cartao.js"
      },
      "./pessoa": {
        "types": "./dist/pessoa.d.ts",
        "default": "./dist/pessoa.js"
      },
      "./campos": {
        "types": "./dist/campos.d.ts",
        "default": "./dist/campos.js"
      },
      "./campos-formatar": {
        "types": "./dist/campos-formatar.d.ts",
        "default": "./dist/campos-formatar.js"
      },
      "./atalhos": {
        "types": "./dist/atalhos.d.ts",
        "default": "./dist/atalhos.js"
      }
    }
  },
  "scripts": {
    "build": "rm -rf dist && tsc -p tsconfig.build.json && node scripts/extensoes.mjs dist",
    "prepack": "pnpm run build",
    "lint": "tsc --noEmit",
    "test": "jest && node --test scripts/*.test.mjs",
    "test:watch": "jest --watch"
  },
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "@types/node": "^25.5.0",
    "jest": "^30.4.2",
    "ts-jest": "^29.4.9",
    "typescript": "^5.9.3"
  }
}
```

`packages/core/tsconfig.json` (sem `dom`: um uso acidental de DOM quebra o `lint`):

```json
{
  "compilerOptions": {
    "lib": ["es2022"],
    "types": ["jest"],
    "target": "ES2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

`packages/core/tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "types": [],
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts", "src/rng-teste.ts"]
}
```

`packages/core/jest.config.ts` (ambiente `node`: o motor não depende de DOM, e o teste prova isso):

```ts
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { moduleResolution: 'node' } }],
  },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
}

export default config
```

`prng` (cópia; a roleta do monorepo segue com o original) e `LICENSE`:

```bash
cd /Users/piluvitu/PILUTECH/Botai && O=$(cat /Users/piluvitu/PILUTECH/.botai-extracao/origem.txt) && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev show "$O:packages/tools/src/prng.ts" > packages/core/src/prng.ts && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev show "$O:packages/tools/src/prng.test.ts" > packages/core/src/prng.test.ts && cp LICENSE packages/core/LICENSE; echo EXIT=$?
```

- [ ] **Step 3: a extensão e o site apontam para o core e para o `@piluvitu/ui` 0.1.0**

```bash
cd /Users/piluvitu/PILUTECH/Botai && perl -pi -e 's{"\@piluvitu/tools": "workspace:\*"}{"\@pilutech/botai-core": "workspace:*"}; s{"\@piluvitu/ui": "workspace:\*"}{"\@piluvitu/ui": "0.1.0"}; s{\.\./\.\./scripts/check-tailwind-source\.mjs}{../scripts/check-tailwind-source.mjs}g' extensao/package.json site/package.json && /usr/bin/grep -nE '@piluvitu|@pilutech/botai-core|check-tailwind' extensao/package.json site/package.json; echo EXIT=$?
```

Expected: nos dois arquivos, `"@pilutech/botai-core": "workspace:*"`, `"@piluvitu/ui": "0.1.0"` e todo `check-tailwind-source.mjs` com `../scripts/`; nenhum `@piluvitu/tools`; `EXIT=0`.

- [ ] **Step 4: lockfile semeado com o do monorepo**

Renomear os importadores mantém, para cada dependência com o mesmo especificador, a versão que o monorepo já usava (o pnpm só resolve o que mudou), em vez de resolver tudo do zero.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev show "$(cat /Users/piluvitu/PILUTECH/.botai-extracao/origem.txt):pnpm-lock.yaml" > pnpm-lock.yaml && perl -0pi -e 's/^  apps\/botai:\n/  extensao:\n/m; s/^  apps\/botai-site:\n/  site:\n/m; s/^  packages\/tools:\n/  packages\/core:\n/m' pnpm-lock.yaml && /usr/bin/grep -cE '^  (extensao|site|packages/core):$' pnpm-lock.yaml; echo EXIT=$?
```

Expected: `3` e `EXIT=0`.

- [ ] **Step 5: primeiro install**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm install; echo EXIT=$?
```

Expected: `EXIT=0`. Se sair com `ERR_PNPM_IGNORED_BUILDS` citando um pacote: se ele está no `allowBuilds` do monorepo, copie o valor de lá; senão acrescente `<pacote>: false` com uma linha de comentário dizendo por que o script não faz falta, rode de novo e confira que a B5 a B7 passam com ele bloqueado. Se sair com erro de `trustPolicy` citando um pacote, acrescente `trustPolicyExclude:` com ele e o motivo comentado (versão e o que ela perdeu) e registre no `CLAUDE.md` da raiz na B10.

- [ ] **Step 6: lockfile fechado, sem duplicata e com o tarball**

```bash
cd /Users/piluvitu/PILUTECH/Botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P install --frozen-lockfile && $P dedupe --check; echo EXIT=$?
```

Expected: `EXIT=0`.

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/grep -c "file:vendor/piluvitu-ui-0.1.0.tgz" pnpm-lock.yaml; /usr/bin/grep -cE '^  (apps/|packages/ui:|packages/tools:)' pnpm-lock.yaml
```

Expected: um número maior que 0 (o `@piluvitu/ui` vem do tarball) e depois `0` (nenhum importador do monorepo sobrou).

- [ ] **Step 7: as versões são as do monorepo**

`/Users/piluvitu/PILUTECH/.botai-extracao/comparar-lockfiles.cjs`:

```js
const { readFileSync } = require('node:fs')

const [, , monorepo, novo] = process.argv

function importador(texto, nome) {
  const linhas = texto.split('\n')
  const inicio = linhas.indexOf(`  ${nome}:`)
  if (inicio < 0) throw new Error(`importador ${nome} não encontrado`)
  const deps = {}
  let atual
  for (let i = inicio + 1; i < linhas.length; i++) {
    const linha = linhas[i]
    if (linha !== '' && !linha.startsWith('    ')) break
    const dep = /^      '?([^':]+)'?:$/.exec(linha)
    if (dep) atual = dep[1]
    const versao = /^        version: ([^(\s]+)/.exec(linha)
    if (versao && atual) deps[atual] = versao[1]
  }
  return deps
}

const a = readFileSync(monorepo, 'utf8')
const b = readFileSync(novo, 'utf8')
const diferencas = []
for (const [velho, atual] of [
  ['apps/botai', 'extensao'],
  ['apps/botai-site', 'site'],
]) {
  const antes = importador(a, velho)
  const depois = importador(b, atual)
  for (const [dep, versao] of Object.entries(antes)) {
    if (dep.startsWith('@piluvitu/') || dep.startsWith('@pilutech/')) continue
    if (depois[dep] !== versao)
      diferencas.push(`${atual} ${dep}: ${versao} -> ${depois[dep]}`)
  }
}
console.log(diferencas.join('\n') || 'iguais')
process.exit(diferencas.length > 0 ? 1 : 0)
```

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev show "$(cat /Users/piluvitu/PILUTECH/.botai-extracao/origem.txt):pnpm-lock.yaml" > /Users/piluvitu/PILUTECH/.botai-extracao/pnpm-lock.monorepo.yaml && node /Users/piluvitu/PILUTECH/.botai-extracao/comparar-lockfiles.cjs /Users/piluvitu/PILUTECH/.botai-extracao/pnpm-lock.monorepo.yaml pnpm-lock.yaml; echo EXIT=$?
```

Expected: `iguais` e `EXIT=0`. Com diferença, **PARE** e reporte a lista: o install resolveu versão nova onde não devia (o semear do Step 4 não pegou), e seguir mudaria o build da extensão em relação à 1.0.0.

- [ ] **Step 8: os testes que vieram do `packages/tools` passam no core (ambiente `node`, sem DOM)**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest && ./node_modules/.bin/tsc --noEmit; echo EXIT=$?
```

Expected: `Test Suites: 18 passed`, `Tests: 395 passed` e `EXIT=0`.

- [ ] **Step 9: commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add vendor/piluvitu-ui-0.1.0.tgz packages/core/package.json packages/core/tsconfig.json packages/core/tsconfig.build.json packages/core/jest.config.ts packages/core/LICENSE packages/core/src/prng.ts packages/core/src/prng.test.ts extensao/package.json site/package.json pnpm-lock.yaml && /usr/bin/git commit -m "build: workspace com o @pilutech/botai-core e o @piluvitu/ui 0.1.0 (tarball versionado até o npm)"; echo EXIT=$?
```

Este é o primeiro commit com o husky instalado (o `prepare` rodou no Step 5): o `lint-staged` formata os arquivos staged com o Prettier. Se ele mudar algo, o commit já sai com a versão formatada.

### Tarefa B5: `@pilutech/botai-core` 0.1.0 (atalhos, build publicável e documentação)

**Files:**

- Create: `packages/core/src/atalhos.ts`, `packages/core/scripts/extensoes.mjs`, `packages/core/README.md`, `packages/core/CLAUDE.md`
- Test: `packages/core/src/atalhos.test.ts`, `packages/core/scripts/extensoes.test.mjs`, `packages/core/scripts/pacote.test.mjs`

**Interfaces:**

- Consumes: o pacote da B4; `scripts/extensoes.mjs` e o teste dele da branch `feat/ui-npm` (A1).
- Produces:
  - `@pilutech/botai-core/atalhos`: `type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'`, `type Sistema = 'windows' | 'mac' | 'linux'`, `type TeclasSugeridas = { default: string; mac: string; linux?: string }`, `TECLAS_DO_MANIFESTO: { chromium: TeclasSugeridas; firefox: TeclasSugeridas }`, `teclaNoMac(tecla: string): string`, `ATALHOS: Record<Loja, Record<Sistema, string>>` (os mesmos valores do `pilulabs.ts` do monorepo);
  - `pnpm pack` do core com só `dist/<19 módulos>.{js,d.ts}`, `LICENSE`, `README.md` e `package.json`.

- [ ] **Step 1: teste do atalho (falha)**

`packages/core/src/atalhos.test.ts`:

```ts
import { ATALHOS, TECLAS_DO_MANIFESTO, teclaNoMac } from './atalhos'

// É o suggested_key do manifesto da extensão (extensao/wxt.config.ts) e a tabela de atalhos da landing.
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
    expect(Object.keys(ATALHOS).sort()).toEqual([
      'chrome',
      'edge',
      'firefox',
      'opera',
    ])
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/atalhos.test.ts; echo EXIT=$?
```

Expected: `Cannot find module './atalhos'` e `EXIT=1`.

- [ ] **Step 2: o atalho**

`packages/core/src/atalhos.ts` (os valores e comentários saem do `pilulabs.ts` do monorepo, sem mudança):

```ts
export type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'
export type Sistema = 'windows' | 'mac' | 'linux'
export type TeclasSugeridas = { default: string; mac: string; linux?: string }

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

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest && ./node_modules/.bin/tsc --noEmit; echo EXIT=$?
```

Expected: `Test Suites: 19 passed`, `Tests: 402 passed`, `EXIT=0`.

- [ ] **Step 3: testes do build publicável (falham)**

O teste do script vem da A1, igual:

```bash
cd /Users/piluvitu/PILUTECH/Botai && mkdir -p packages/core/scripts && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev show feat/ui-npm:packages/ui/scripts/extensoes.test.mjs > packages/core/scripts/extensoes.test.mjs; echo EXIT=$?
```

`packages/core/scripts/pacote.test.mjs`:

```js
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importsQueNaoResolvem } from './extensoes.mjs'

const PACOTE = join(dirname(fileURLToPath(import.meta.url)), '..')
const FONTE = JSON.parse(readFileSync(join(PACOTE, 'package.json'), 'utf8'))
const PUBLICADOS = FONTE.publishConfig.exports
// Arquivo do tarball que nenhum subpath aponta (módulo interno, bin): as fases 1 a 3 acrescentam aqui.
const EXTRAS = []
const alvos = (destino) =>
  typeof destino === 'string' ? [destino] : Object.values(destino)
const ESPERADOS = [
  ...new Set([
    'LICENSE',
    'README.md',
    'package.json',
    ...EXTRAS,
    ...Object.values(PUBLICADOS)
      .flatMap(alvos)
      .map((caminho) => caminho.replace(/^\.\//, '')),
  ]),
].sort()

// O pnpm pack aplica o publishConfig.exports (o npm pack não aplicaria) e roda o prepack (o build).
const pnpm = (...args) =>
  JSON.parse(execFileSync('pnpm', args, { cwd: PACOTE, encoding: 'utf8' }))

let pasta
let publicado

before(() => {
  pasta = mkdtempSync(join(tmpdir(), 'botai-core-pacote-'))
  const { filename } = pnpm('pack', '--json', '--pack-destination', pasta)
  execFileSync('tar', ['-xzf', filename, '-C', pasta])
  publicado = JSON.parse(
    readFileSync(join(pasta, 'package', 'package.json'), 'utf8'),
  )
})

after(() => rmSync(pasta, { recursive: true, force: true }))

test('o pnpm pack --dry-run leva só o build, a licença e o README', () => {
  const { files } = pnpm('pack', '--dry-run', '--json')
  assert.deepEqual(files.map((arquivo) => arquivo.path).sort(), ESPERADOS)
})

// Subpath só num dos manifestos: o workspace e o npm enxergariam pacotes diferentes.
test('o manifesto publicado aponta cada subpath para o build e não tem dependência de runtime', () => {
  assert.equal(publicado.license, 'MIT')
  assert.deepEqual(publicado.publishConfig, { access: 'public' })
  assert.equal(
    publicado.repository.url,
    'git+https://github.com/PiluVitu/Botai.git',
  )
  assert.equal(publicado.dependencies, undefined)
  assert.deepEqual(
    Object.keys(FONTE.exports).sort(),
    Object.keys(PUBLICADOS).sort(),
  )
  assert.deepEqual(publicado.exports, PUBLICADOS)
  for (const [subpath, fonte] of Object.entries(FONTE.exports))
    assert.deepEqual(
      PUBLICADOS[subpath],
      /^\.\/src\/.+\.ts$/.test(fonte)
        ? {
            types: fonte.replace('./src/', './dist/').replace(/\.ts$/, '.d.ts'),
            default: fonte.replace('./src/', './dist/').replace(/\.ts$/, '.js'),
          }
        : fonte,
      subpath,
    )
})

test('todo import relativo do build aponta para um arquivo do pacote', () => {
  assert.deepEqual(importsQueNaoResolvem(join(pasta, 'package', 'dist')), [])
})

test('cada subpath carrega no Node como ESM', async () => {
  for (const destino of Object.values(publicado.exports))
    if (typeof destino !== 'string')
      await import(pathToFileURL(join(pasta, 'package', destino.default)).href)
})

// A pessoa dourada de src/pessoa.test.ts: o build não pode mudar a pessoa de uma semente.
test('o build gera a mesma pessoa dourada que o código-fonte', async () => {
  const { sfc32 } = await import(
    pathToFileURL(join(PACOTE, 'dist', 'prng.js')).href
  )
  const { gerarPessoa } = await import(
    pathToFileURL(join(PACOTE, 'dist', 'pessoa.js')).href
  )
  const pessoa = gerarPessoa(sfc32(1, 2, 3, 4), '2026-10-01')
  assert.equal(pessoa.cpf, '647.692.234-39')
  assert.equal(
    pessoa.email.endereco,
    'vinicius-costa-6607@tuamaeaquelaursa.com',
  )
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node --test scripts/*.test.mjs; echo EXIT=$?
```

Expected: `ERR_MODULE_NOT_FOUND` para `./extensoes.mjs` e `EXIT=1`.

- [ ] **Step 4: o script de build (cópia da A1)**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev show feat/ui-npm:packages/ui/scripts/extensoes.mjs > packages/core/scripts/extensoes.mjs; echo EXIT=$?
```

- [ ] **Step 5: README do pacote (a página do npm)**

`packages/core/README.md`:

````markdown
# @pilutech/botai-core

O motor do [Botaí](https://botai.pilutech.com.br): gera uma pessoa brasileira de teste coerente (nome, CPF, RG, PIS, título de eleitor, celular com o DDD do CEP, endereço com CEP real, e-mail, empresa com CNPJ, cartão de teste da Stripe) e classifica campos de formulário. TypeScript puro, sem dependência de runtime e sem DOM: roda no Node, no navegador e em extensão.

## Instalar

```sh
npm install @pilutech/botai-core
```

Só ESM. Um import por módulo (não há import da raiz nesta versão).

## Usar

```ts
import { sfc32 } from '@pilutech/botai-core/prng'
import { gerarPessoa } from '@pilutech/botai-core/pessoa'
import { gerarCPF, validarCPF } from '@pilutech/botai-core/cpf'

const pessoa = gerarPessoa(sfc32(1, 2, 3, 4), '2026-10-01')
pessoa.cpf // '647.692.234-39'
pessoa.email.endereco // 'vinicius-costa-6607@tuamaeaquelaursa.com'

gerarCPF() // um CPF válido qualquer
validarCPF('647.692.234-39') // true
```

Nesta versão, a mesma semente e a mesma data geram sempre a mesma pessoa. Sem semente, os geradores usam `Math.random`.

## Módulos

| Módulo                                                                    | O que tem                                                                                                                                    |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pessoa`                                                                  | `gerarPessoa(rng, hojeISO)`: a pessoa inteira, coerente (CPF e título da UF do endereço, DDD do CEP, e-mail do nome, empresa dos sobrenomes) |
| `cpf`, `cnpj`, `rg`, `pis`, `titulo-eleitor`                              | `gerarX(rng?)` e `validarX(valor)`                                                                                                           |
| `celular`, `nascimento`, `senha`, `nome`, `endereco`, `empresa`, `cartao` | os geradores que a pessoa usa                                                                                                                |
| `campos`                                                                  | `classificarFormulario(descritores, hojeISO)` e `classificarCampo(descritor)`: o tipo de cada campo de um formulário                         |
| `campos-formatar`                                                         | `valorPara(tipo, pessoa, descritor)`: o valor que cabe no campo (máscara, `maxlength`, `pattern`, `<select>`)                                |
| `prng`, `aleatorio`, `uf`                                                 | o gerador determinístico (`sfc32`, `seedFromBytes`), os sorteios e as tabelas de UF                                                          |
| `atalhos`                                                                 | o atalho de teclado da extensão por navegador e sistema                                                                                      |

## Cuidados

- Os dados são fictícios, mas um CPF, um CNPJ ou um celular gerado pode pertencer a alguém de verdade. Use só em teste.
- O e-mail é de uma caixa pública (`tuamaeaquelaursa.com`): nunca para conta real.
- Versão 0.x: a API e a pessoa que uma semente gera podem mudar entre versões. Para reproduzir, fixe a versão.

## Licença

MIT, © PiluTech ([`LICENSE`](./LICENSE)). Código: https://github.com/PiluVitu/Botai/tree/main/packages/core
````

- [ ] **Step 6: rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm run test && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm run lint; echo EXIT=$?
```

Expected: Jest com `402 passed`; `node --test` com `# pass 8` (3 + 5); `EXIT=0`.

- [ ] **Step 7: `packages/core/CLAUDE.md`**

```bash
cd /Users/piluvitu/PILUTECH/Botai && cat > packages/core/CLAUDE.md <<'EOF'
# CLAUDE.md — `packages/core` (`@pilutech/botai-core`)

O motor do Botaí, publicado no npm. O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz.

## Propósito

TypeScript puro, sem dependência de runtime e sem DOM: a pessoa de teste, os geradores de documento, o classificador de campos, o valor de cada campo e o atalho da extensão. A `extensao/` e o `site/` o consomem como código-fonte (workspace); o `/tools` do PiluVitu (monorepo `PiluVitu/PiluVitu-Dev`) usa CPF e CNPJ pelo npm, com versão exata.

- **Origem:** os módulos do Botaí do `@piluvitu/tools` do monorepo, com o histórico (`git filter-repo`, 2026-10). `prng` é cópia (a roleta do monorepo usa o original). `atalhos` saiu do `pilulabs.ts` de lá.
- **0.1.0 = a API de hoje:** os mesmos nomes de módulo e de função do `@piluvitu/tools`, um subpath por módulo, sem barrel na raiz. A API amigável (semente, lote, envelope, CLI) é a 0.2.0 (fase 1; ver o contrato `docs/superpowers/plans/2026-10-05-botai-repo-proprio-contrato.md`).
- **Sem `lib: dom`:** o `tsconfig.json` tem só `es2022` e os tipos do Jest, e o Jest roda com `testEnvironment: 'node'`. Um uso acidental de DOM quebra o `lint` e os testes. O `@types/node` está nas devDependencies para os testes de script das fases seguintes, mas não entra no `types`.

## Atalho da extensão (`atalhos`)

`TECLAS_DO_MANIFESTO` é o `suggested_key` do comando `botai-preencher` (Chromium e Firefox), e `ATALHOS` sai dele (`teclaNoMac` troca `Alt`/`Shift`/`Ctrl` por `⌥`/`⇧`/`⌘`, como o Chrome mostra no Mac). Lido pelo `extensao/wxt.config.ts` e, no `site/`, pela tabela de atalhos e pelo atalho de quem visita. Mudou a tecla da extensão? Mude aqui: os testes fixam os dois formatos.

## Módulos (vindos do `@piluvitu/tools`)

Cada módulo é exportado só por subpath, com o nome do arquivo (`@pilutech/botai-core/rg` → `src/rg.ts`).

EOF
O=$(cat /Users/piluvitu/PILUTECH/.botai-extracao/origem.txt) && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev show "$O:packages/tools/CLAUDE.md" | sed -n '/^### Aleatoriedade injetável/,/^\*\*`packages\/tools`: 158 → 531 testes\*\*/p' | sed '$d' | perl -pe 's{\@piluvitu/tools/}{\@pilutech/botai-core/}g; s{para o `apps/web` \(`cpf-tool\.tsx`, `cnpj-tool\.tsx`, `tools\.e2e\.ts`\)}{para o `/tools` do PiluVitu (`apps/web` do monorepo, pelo npm)}g' >> packages/core/CLAUDE.md && cat >> packages/core/CLAUDE.md <<'EOF'
## Build e publicação

- **Dois manifestos.** No repo, o `exports` aponta cada subpath para `./src/<módulo>.ts`: a `extensao/` e o `site/` transpilam o código-fonte, e o zip de fontes da AMO não precisa de build do core. No pacote publicado, o `publishConfig.exports` do pnpm (aplicado pelo `pnpm pack`) troca para `{ "types": "./dist/<módulo>.d.ts", "default": "./dist/<módulo>.js" }`. Subpath novo entra nos dois.
- **`build`** (roda sozinho no `prepack`): `tsc -p tsconfig.build.json` (ES2022, com `.d.ts`, sem testes e sem `rng-teste.ts`) e `scripts/extensoes.mjs dist`, que acrescenta `.js` aos imports relativos (o Node recusa import relativo sem extensão em ESM, e TypeScript dentro de `node_modules`: https://nodejs.org/api/typescript.html) e falha se algum ficar sem arquivo. É cópia do script do `@piluvitu/ui`.
- **`scripts/pacote.test.mjs`** (`node --test`, no fim do `test`): roda o `pnpm pack` de verdade e reprova se a lista do `pnpm pack --dry-run --json` mudar (ela sai dos valores do `publishConfig.exports`, mais `LICENSE`, `README.md`, `package.json` e a constante `EXTRAS`, onde entra todo arquivo do tarball que nenhum subpath aponta), se um subpath existir só num dos manifestos, se um `./src/<x>.ts` do workspace não virar `./dist/<x>.{js,d.ts}` no tarball, se aparecer dependência de runtime, se um import relativo do `dist` ficar sem arquivo, se um subpath não carregar no Node ou se o `dist` gerar uma pessoa dourada diferente da do código-fonte.
- **Publicação:** `version` no `package.json` por PR; depois do merge, tag anotada `core-v<versão>` na `main` e push. O `.github/workflows/publicar-core.yml` confere tag × versão e o commit na `main`, roda `lint` e `test`, empacota com `pnpm pack` e, no job `publicar` (environment `npm`, aprovação do dono, `id-token: write`, Node 24.14.0), extrai o tarball e roda `npm publish <pasta> --access public --provenance` (trusted publishing, sem token). A 0.1.0 saiu por token do dono no env local (passo C8 do plano da fase 0).
- **Versões:** 0.1.0 (fase 0), 0.2.0 (fase 1), 0.3.0 (fase 2), 0.4.0 (fase 3), pelo contrato. Mudar a pessoa que uma semente gera é versão major a partir da fase 1.

## Testes

Jest + ts-jest (`testEnvironment: 'node'`), `*.test.ts` ao lado do fonte; `node --test` para `scripts/*.test.mjs`. `make test-core` ou `pnpm --filter @pilutech/botai-core test`; tipos com `pnpm --filter @pilutech/botai-core lint`. Os testes sorteiam com `src/rng-teste.ts`, que não é exportado nem vai para o `dist`.

## Dependências

Nenhuma de runtime, e assim fica (spec §5.4). As devDependencies seguem a política da raiz.
EOF
/usr/bin/grep -c "piluvitu/tools/" packages/core/CLAUDE.md; /usr/bin/grep -n "^## \|^### " packages/core/CLAUDE.md; echo EXIT=$?
```

Expected: `0` ocorrências de `piluvitu/tools/`; os títulos `Propósito`, `Atalho da extensão`, `Módulos (vindos do @piluvitu/tools)`, `### Aleatoriedade injetável`, `### gerarPessoa…`, `### Classificador`, `### Valor de cada campo`, `Build e publicação`, `Testes`, `Dependências`.

- [ ] **Step 8: commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/atalhos.ts packages/core/src/atalhos.test.ts packages/core/scripts packages/core/README.md packages/core/CLAUDE.md && /usr/bin/git commit -m "feat(core): @pilutech/botai-core 0.1.0 com a API de hoje e o atalho da extensão"; echo EXIT=$?
```

### Tarefa B6: a extensão no repo próprio (core do workspace, `@piluvitu/ui` do npm, caminhos novos)

**Files:**

- Create: `extensao/src/lib/entropia.ts`
- Modify: `extensao/wxt.config.ts`, `extensao/src/styles.css`, `extensao/src/**/*.ts(x)` (imports), `extensao/scripts/{versao,release,conferir-tag,reproduzir-fontes,submeter-lojas}.sh`, `extensao/loja/{pecas.ts, capturas.captura.ts, textos.md, notas-revisores.md, README.md}`, `extensao/{README.md, SOURCE-CODE-REVIEW.md, CLAUDE.md}`
- Test: `extensao/src/lib/entropia.test.ts`, `extensao/scripts/{repo-de-teste.ts, versao.test.ts, release.test.ts, conferir-tag.test.ts}`, `extensao/loja/{pecas.test.ts, imagens.test.ts, textos.test.ts}`

**Interfaces:**

- Consumes: `@pilutech/botai-core/{pessoa, prng, campos, campos-formatar, nascimento, cpf, atalhos}` (B4/B5); `@piluvitu/ui` 0.1.0 do tarball (B4).
- Produces:
  - `cryptoRandomBytes(n: number): Uint8Array` em `extensao/src/lib/entropia.ts`;
  - zip de fontes da AMO com `sourcesRoot` na raiz do repo e `includeSources` = `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, `scripts/check-tailwind-source.mjs`, `extensao/**`, `packages/core/**` e (até o C4) `vendor/piluvitu-ui-0.1.0.tgz`;
  - scripts de release lendo `extensao/package.json`; `COPIAS` só com destinos em `site/`.

- [ ] **Step 1: linha de base do Vitest (no monorepo)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/wxt prepare > /dev/null && ./node_modules/.bin/vitest run > /Users/piluvitu/PILUTECH/.botai-extracao/vitest-monorepo.txt 2>&1; echo EXIT=$?; tail -6 /Users/piluvitu/PILUTECH/.botai-extracao/vitest-monorepo.txt
```

Expected: `EXIT=0`. Anote o total de `Tests  N passed` (a linha de base).

- [ ] **Step 2: `wxt.config.ts` com o atalho do core e o zip de fontes do repo novo**

Substitua `extensao/wxt.config.ts` inteiro por (o `manifest` e o `vite` não mudam):

```ts
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'wxt'
import { TECLAS_DO_MANIFESTO } from '@pilutech/botai-core/atalhos'

const raizDoRepo = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  srcDir: 'src',
  imports: false,
  // Sem isto, o -b firefox gera MV2.
  manifestVersion: 3,
  targetBrowsers: ['chrome', 'firefox', 'opera'],
  webExt: { disabled: true },
  dev: { server: { port: 3018 }, reloadCommand: false },
  zip: {
    name: 'botai',
    sourcesRoot: raizDoRepo,
    // Arquivo oculto só entra citado pelo nome (.npmrc).
    includeSources: [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.npmrc',
      'scripts/check-tailwind-source.mjs',
      'extensao/**',
      'packages/core/**',
      // Sai junto com o overrides do pnpm-workspace.yaml (passo C4 do plano da fase 0).
      'vendor/piluvitu-ui-0.1.0.tgz',
    ],
    // Com sourcesRoot na raiz, a exclusão automática do outDir do WXT não pega estas pastas.
    excludeSources: [
      'extensao/.output/**',
      'extensao/.wxt/**',
      'packages/core/dist/**',
      '**/storybook-static/**',
      '**/test-results/**',
      '**/playwright-report/**',
    ],
  },
  manifest: ({ browser, mode }) => {
    const firefox = browser === 'firefox'
    return {
      name: 'Botaí',
      short_name: 'Botaí',
      description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      homepage_url: 'https://botai.pilutech.com.br',
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
          suggested_key: firefox
            ? TECLAS_DO_MANIFESTO.firefox
            : TECLAS_DO_MANIFESTO.chromium,
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

```bash
cd /Users/piluvitu/PILUTECH/Botai/extensao && /usr/bin/git diff --stat -- wxt.config.ts && ./node_modules/.bin/wxt prepare; echo EXIT=$?
```

Expected: só as linhas do import, da raiz e do `zip` mudaram; `wxt prepare` com `EXIT=0`.

- [ ] **Step 3: teste da entropia (falha)**

`extensao/src/lib/entropia.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cryptoRandomBytes } from './entropia'

describe('cryptoRandomBytes', () => {
  it('devolve o número de bytes pedido', () => {
    expect(cryptoRandomBytes(16)).toHaveLength(16)
  })

  // A semente de cada pessoa nova sai daqui (armazenamento.ts): dois sorteios iguais dariam a mesma pessoa.
  it('dois sorteios seguidos não se repetem', () => {
    expect(cryptoRandomBytes(16)).not.toEqual(cryptoRandomBytes(16))
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/extensao && ./node_modules/.bin/vitest run src/lib/entropia.test.ts; echo EXIT=$?
```

Expected: falha ao resolver `./entropia`; `EXIT=1`.

- [ ] **Step 4: a entropia**

`extensao/src/lib/entropia.ts`:

```ts
// Cópia do cryptoRandomBytes de @piluvitu/tools/entropy (monorepo): o resto daquele módulo é da roleta do PiluVitu.
export function cryptoRandomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/extensao && ./node_modules/.bin/vitest run src/lib/entropia.test.ts; echo EXIT=$?
```

Expected: `2 passed`, `EXIT=0`.

- [ ] **Step 5: imports do `@piluvitu/tools` → core e entropia local**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git ls-files -z 'extensao/src/*.ts' 'extensao/src/*.tsx' | xargs -0 perl -pi -e "s{'\@piluvitu/tools/entropy'}{'./entropia'}g; s{'\@piluvitu/tools/}{'\@pilutech/botai-core/}g" && /usr/bin/git grep -n "@piluvitu/tools" -- extensao ':!extensao/CLAUDE.md'; echo EXIT=$?
```

Expected: nenhuma linha e `EXIT=1` (o `git grep` não achou nada). O único `entropy` era o de `src/lib/armazenamento.ts`, que passa a importar de `./entropia`.

- [ ] **Step 6: `@source` para o pacote do npm**

Em `extensao/src/styles.css`, troque estas 5 linhas:

```css
@source '../../../packages/ui/src';
@source not '../.output';
/* O zip de fontes do WXT sempre exclui *.test.*: sem estas linhas, o CSS que o revisor da AMO reconstrói sai diferente. */
@source not './**/*.test.*';
@source not '../../../packages/ui/src/**/*.test.*';
```

por:

```css
@source '../node_modules/@piluvitu/ui/dist';
@source not '../.output';
/* O zip de fontes do WXT sempre exclui *.test.*: sem esta linha, o CSS que o revisor da AMO reconstrói sai diferente. */
@source not './**/*.test.*';
```

- [ ] **Step 7: a suíte inteira, antes dos caminhos**

```bash
cd /Users/piluvitu/PILUTECH/Botai/extensao && ./node_modules/.bin/vitest run > /Users/piluvitu/PILUTECH/.botai-extracao/vitest-b6-meio.txt 2>&1; echo EXIT=$?; /usr/bin/grep -E "FAIL|Test Files|Tests " /Users/piluvitu/PILUTECH/.botai-extracao/vitest-b6-meio.txt | head -20
```

Expected: `EXIT=1`, e o único arquivo em `FAIL` é `loja/imagens.test.ts` (as cópias ainda apontam para `web/…` e `botai-site/…`, que não existem aqui). Qualquer outro `FAIL` é regressão da troca de imports: pare e corrija antes de seguir.

- [ ] **Step 8: testes dos scripts de release com os caminhos novos (falham)**

```bash
cd /Users/piluvitu/PILUTECH/Botai && perl -pi -e 's{apps/botai}{extensao}g' extensao/scripts/repo-de-teste.ts extensao/scripts/versao.test.ts extensao/scripts/release.test.ts extensao/scripts/conferir-tag.test.ts && cd extensao && ./node_modules/.bin/vitest run scripts; echo EXIT=$?
```

Expected: `versao.test.ts`, `release.test.ts` e `conferir-tag.test.ts` falham (o repo de teste agora tem `extensao/package.json`, e os scripts ainda leem `apps/botai/package.json`); `EXIT=1`.

- [ ] **Step 9: os scripts de release**

```bash
cd /Users/piluvitu/PILUTECH/Botai && perl -pi -e 's{apps/botai}{extensao}g' extensao/scripts/versao.sh extensao/scripts/release.sh extensao/scripts/conferir-tag.sh extensao/scripts/reproduzir-fontes.sh extensao/scripts/submeter-lojas.sh && /usr/bin/git grep -n "apps/" -- extensao/scripts; cd extensao && ./node_modules/.bin/vitest run scripts; echo EXIT=$?
```

Expected: o `git grep` não lista nada; todos os testes de `scripts/` passam; `EXIT=0`.

- [ ] **Step 10: testes da loja com o repo novo (falham)**

1. Em `extensao/loja/pecas.test.ts`, troque o último `it` (o que começa com `// O apps/web só usa o ícone`) inteiro por:

```ts
// A landing (site/) usa o ícone, os ícones do app e as capturas de 1280×800. O logo do card
// da PiluLabs, no monorepo, é uma cópia fixa do ícone, fora deste gerador.
it('as cópias para a landing', () => {
  expect(COPIAS.slice(0, 3)).toEqual([
    { origem: 'icone-128.png', destino: 'site/public/icone-128.png' },
    { origem: 'edge-logo-300.png', destino: 'site/app/icon.png' },
    { origem: 'edge-logo-300.png', destino: 'site/app/apple-icon.png' },
  ])
  expect(COPIAS.slice(3)).toEqual(
    CAPTURAS.map((captura) => ({
      origem: `capturas/1280x800/${captura.nome}.png`,
      destino: `site/public/capturas/${captura.nome}.png`,
    })),
  )
})
```

2. Em `extensao/loja/imagens.test.ts`:

```bash
cd /Users/piluvitu/PILUTECH/Botai && perl -pi -e 's{^const APPS = }{const RAIZ = }; s{path\.join\(APPS, }{path.join(RAIZ, }g; s{cópias para os sites \(apps/web e apps/botai-site\)}{cópias para a landing (site/)}; s{apps/%s é idêntica à da loja}{%s é idêntica à da loja}' extensao/loja/imagens.test.ts && /usr/bin/grep -n "RAIZ\|APPS\|landing\|idêntica" extensao/loja/imagens.test.ts; echo EXIT=$?
```

Expected: `const RAIZ = path.resolve(import.meta.dirname, '../..')`, `path.join(RAIZ, destino)`, os dois títulos novos; nenhum `APPS`.

3. Em `extensao/loja/textos.test.ts`:
   - logo depois da linha `const caracteres = (texto = '') => [...texto].length`, acrescente:

```ts
// O repo no GitHub é PiluVitu/Botai (nome técnico, sem acento): a URL dele passa, a grafia errada em prosa, não.
const REPOSITORIO = 'https://github.com/PiluVitu/Botai'
const GRAFIA_ERRADA = /BotAi|Bota Aí|BOTAI|Botai/
const semRepo = (texto: string) => texto.replaceAll(REPOSITORIO, '')
```

- troque o bloco `it.each(['textos.md', 'notas-revisores.md', 'README.md'])(` … `)` (o de "nunca escreve a marca com a grafia errada") inteiro por:

```ts
it.each(['textos.md', 'notas-revisores.md', 'README.md'])(
  '%s nunca escreve a marca com a grafia errada',
  (arquivo) => {
    expect(semRepo(ler(arquivo))).not.toMatch(GRAFIA_ERRADA)
  },
)

it('aceita a URL do repo, mas não a grafia errada no texto em volta', () => {
  expect(semRepo(`Código aberto: ${REPOSITORIO}/releases`)).not.toMatch(
    GRAFIA_ERRADA,
  )
  expect(semRepo(`Instale o Botai: ${REPOSITORIO}`)).toMatch(GRAFIA_ERRADA)
})
```

- no `describe('notas para os revisores')`, troque `'apps/botai/SOURCE-CODE-REVIEW.md'` por `'extensao/SOURCE-CODE-REVIEW.md'`.

```bash
cd /Users/piluvitu/PILUTECH/Botai/extensao && ./node_modules/.bin/vitest run loja; echo EXIT=$?
```

Expected: falham `pecas.test.ts` (as cópias), `imagens.test.ts` (as cópias) e o teste das notas em `textos.test.ts`; `EXIT=1`.

- [ ] **Step 11: o gerador de imagens e os textos das lojas**

1. Em `extensao/loja/pecas.ts`, troque o comentário e a constante `COPIAS` (do `// destino relativo a apps/` até o `]` final) por:

```ts
// destino relativo à raiz do repo: a landing (site/).
export const COPIAS: Copia[] = [
  { origem: ICONE.arquivo, destino: 'site/public/icone-128.png' },
  { origem: LOGO_DO_EDGE.arquivo, destino: 'site/app/icon.png' },
  { origem: LOGO_DO_EDGE.arquivo, destino: 'site/app/apple-icon.png' },
  ...CAPTURAS.map((captura) => ({
    origem: arquivoDaCaptura(captura, TAMANHOS_DAS_CAPTURAS[0]),
    destino: `site/public/capturas/${captura.nome}.png`,
  })),
]
```

2. O gerador das capturas e os textos:

```bash
cd /Users/piluvitu/PILUTECH/Botai && perl -pi -e 's{^const APPS = }{const RAIZ = }; s{path\.join\(APPS, }{path.join(RAIZ, }g; s{cópias para os sites \(apps/web e apps/botai-site\)}{cópias para a landing (site/)}' extensao/loja/capturas.captura.ts && perl -pi -e 's{O ícone vai também para `apps/web/public/pilulabs/botai/` \(o card\) e, com o ícone de 300 px e as capturas de 1280×800, para `apps/botai-site/` \(a landing\)\.}{O ícone, o de 300 px e as capturas de 1280×800 vão também para `site/` (a landing). O logo do card da PiluLabs, no monorepo, é uma cópia fixa do ícone.}; s{https://github\.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai}{https://github.com/PiluVitu/Botai}g; s{https://github\.com/PiluVitu/PiluVitu-Dev/releases}{https://github.com/PiluVitu/Botai/releases}g; s{a subset of our public monorepo \(https://github\.com/PiluVitu/PiluVitu-Dev\)}{a subset of our public repository (https://github.com/PiluVitu/Botai)}g; s{apps/botai-site}{site}g; s{apps/botai}{extensao}g' extensao/loja/textos.md extensao/loja/notas-revisores.md extensao/loja/README.md && /usr/bin/git grep -n "PiluVitu-Dev\|apps/\|APPS" -- extensao/loja; echo EXIT=$?
```

Expected: o `git grep` não lista nada (`EXIT=1`).

```bash
cd /Users/piluvitu/PILUTECH/Botai/extensao && ./node_modules/.bin/vitest run loja; echo EXIT=$?
```

Expected: tudo passa (as cópias em `site/public/…` e `site/app/…` vieram idênticas do monorepo); `EXIT=0`.

- [ ] **Step 12: instruções do revisor da AMO**

Substitua `extensao/SOURCE-CODE-REVIEW.md` inteiro por (inglês, exceção à regra pt-BR; o bullet do `vendor/` sai no passo C4):

````markdown
# Botaí: build instructions for add-on reviewers

Botaí is a browser extension built with WXT 0.21.4 and Vite 7 from TypeScript sources in a pnpm workspace (https://github.com/PiluVitu/Botai). This archive contains only the parts of the repository that the extension needs:

- `extensao`: the extension itself;
- `packages/core`: the workspace package with the test data generators and the form field classifier, which the extension imports as TypeScript source (it has no prebuilt output here);
- at the root, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` and `scripts/check-tailwind-source.mjs`. They are here only to reproduce the build: the workspace layout, the lockfile, the install settings and a CSS check that the build scripts run;
- `vendor/piluvitu-ui-0.1.0.tgz`: the npm package of `@piluvitu/ui`, which `pnpm-workspace.yaml` > `overrides` installs from this file until it is fetched from the npm registry.

The popup's UI components come from `@piluvitu/ui`, our design system, installed at the version locked in `pnpm-lock.yaml` (MIT; source at https://github.com/PiluVitu/PiluVitu-Dev/tree/main/packages/ui).

## Environment

- Ubuntu 24.04
- Node.js 24.14.0
- pnpm 11.1.1, pinned in `package.json` > `packageManager`. `corepack enable` installs it.

Every pull request that touches the extension rebuilds the Firefox package from this archive on Ubuntu 24.04 with Node.js 24.14.0 and compares it byte by byte with the package built from the repository (`extensao/scripts/reproduzir-fontes.sh`).

## Build

From the root of this archive:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @pilutech/botai exec wxt zip -b firefox
```

Output:

- unpacked: `extensao/.output/firefox-mv3/`
- package: `extensao/.output/botai-<version>-firefox.zip`

Both are identical to the submitted package.

While installing, the root `prepare` script (husky, the Git hooks of the repository) prints `.git can't be found` and exits successfully. While zipping, WXT 0.21.4 prints `WARN Could not get stats of '<file>'` once for each file of the sources archive. It resolves those paths against `extensao` instead of the archive root only to print their sizes; the archives are not affected.

The Opera package is built the same way with `-b opera` instead of `-b firefox` (`extensao/.output/opera-mv3/`). Its own code is not minified.

## Third-party code

The bundles include, from npm and at the versions locked in `pnpm-lock.yaml`: React and React DOM; Font Awesome; the WXT runtime helpers (`@wxt-dev/browser`, `@wxt-dev/storage`, `@webext-core/isolated-element`); `@piluvitu/ui` and, through it, `@radix-ui/react-avatar`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx` and `tailwind-merge`; and the Plus Jakarta Sans and JetBrains Mono fonts from Fontsource. The `web-ext lint` warnings (`UNSAFE_VAR_ASSIGNMENT`) all come from `react-dom` and `@fortawesome/fontawesome-svg-core` in the popup chunk.

## What the extension does

Botaí generates a fake Brazilian test identity (CPF, CNPJ, CEP, name, e-mail) and fills the form in the active tab when the user clicks the fill button in the toolbar popup, presses the keyboard shortcut or picks an item in the context menu (`activeTab` + `scripting`). The generated identity is stored only in `storage.local`. The extension makes no network requests and loads no remote code. The only way the generated data leaves the browser is "Abrir caixa de entrada" (Open inbox), which the user picks to open, in a new tab, the public disposable mailbox of the generated e-mail address (`https://tuamaeaquelaursa.com/<user>`).

The `menus` permission (Firefox only) is used for `menus.getTargetElement`, so that "Inserir" (Insert) writes into the field that was right-clicked.
````

- [ ] **Step 13: `README.md` da extensão**

```bash
cd /Users/piluvitu/PILUTECH/Botai && perl -pi -e 's{na raiz do monorepo}{na raiz do repositório}g; s{apps/botai-site}{site}g; s{apps/botai}{extensao}g' extensao/README.md; echo EXIT=$?
```

Depois, no `extensao/README.md`:

1. Troque a linha inteira que começa com `1. **Domínios na Vercel:**` por:

```markdown
1. **Domínios na Vercel:** `botai.pilutech.com.br` no projeto `botai-site` (Root Directory `site`; ver "Deploy" em `site/CLAUDE.md`); `pilutech.com.br` e `www.pilutech.com.br` (redirecionando para o apex) no projeto `pilutech-site`, que mora no monorepo `PiluVitu/PiluVitu-Dev` (Root Directory `apps/pilutech-site`).
```

2. Troque a linha inteira que começa com `   - no \`/admin/pilulabs\`` por:

```markdown
- em `site/lojas.json` (PR neste repo), as URLs das lojas aprovadas: a landing troca o "Em breve" pelos botões no build seguinte (o Edge não tem "Em breve": o botão dele só aparece com o link); e no `/admin/pilulabs` do PiluVitu (item `botai` do CMS do `apps/web`), as mesmas URLs, para o card da PiluLabs e o selo da landing da PiluTech;
```

3. Troque a linha inteira que começa com `MIT, © PiluTech (veja o` por:

```markdown
MIT, © PiluTech (veja o [`LICENSE`](./LICENSE)). Vale para o repositório inteiro, inclusive o `@pilutech/botai-core`.
```

- [ ] **Step 14: `extensao/CLAUDE.md`**

```bash
cd /Users/piluvitu/PILUTECH/Botai && perl -pi -e 's{\@piluvitu/tools/pilulabs}{\@pilutech/botai-core/atalhos}g; s{\@piluvitu/tools}{\@pilutech/botai-core}g; s{packages/tools/CLAUDE\.md}{packages/core/CLAUDE.md}g; s{https://github\.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai}{https://github.com/PiluVitu/Botai}g; s{apps/botai-site}{site}g; s{apps/botai}{extensao}g' extensao/CLAUDE.md; echo EXIT=$?
```

Depois, no `extensao/CLAUDE.md`, troque cada linha inteira que começa com o trecho indicado:

1. `  - \`@pilutech/botai-core\` e \`@piluvitu/ui\` são pacotes do monorepo` →

```markdown
- `@pilutech/botai-core` (workspace deste repo) e `@piluvitu/ui` (npm, publicado pelo monorepo `PiluVitu/PiluVitu-Dev`) não mudam de nome. O repo no GitHub é `PiluVitu/Botai`: nome técnico dado pelo dono, como `PiluVitu/Sombrai`; o teste de grafia de `loja/textos.test.ts` aceita a URL dele e mais nada com essa grafia.
```

2. `- **Gate do design system**:` →

```markdown
- **Gate do design system**: o `@piluvitu/ui` vem do npm, e o `styles.css` declara `@source '../node_modules/@piluvitu/ui/dist'` (desde a 4.1.0 o Tailwind segue o symlink do pnpm num `@source`). O `build` roda `check-tailwind-source.mjs` contra a pasta exata `.output/chrome-mv3`, nunca `.output` inteira (um `chrome-mv3-e2e` antigo tem o CSS de outro build e dá falso positivo). `@source not '../.output'` no `styles.css` **e** as linhas do `.gitignore` da raiz: sem elas o Tailwind colhe classes de builds antigos e o gate aprova `@source` quebrado. Não escreva o nome da classe sentinela em nenhum arquivo deste app; referencie `SENTINEL_SELECTOR` do script. Os scripts `build:firefox`, `build:opera`, `zip`, `zip:firefox` e `zip:opera` rodam o mesmo gate contra `.output/firefox-mv3` e `.output/opera-mv3`.
```

3. Na linha que começa com `- **\`@source not\` dos testes (armadilha do zip de fontes):**`, troque o trecho `As duas linhas \`@source not\` do \`styles.css\` (testes do app e do \`packages/ui\`) deixam o CSS igual dos dois lados.`por`A linha \`@source not './**/_.test._'\` do \`styles.css\` deixa o CSS igual dos dois lados (o \`@piluvitu/ui\` vem do npm, sem teste).`

4. `- **Zip de fontes:**` →

```markdown
- **Zip de fontes:** `sourcesRoot` na raiz do repo, com `includeSources` (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` — arquivo oculto só entra citado pelo nome —, `scripts/check-tailwind-source.mjs`, `extensao/**` e `packages/core/**`; até o passo C4 do plano da fase 0, também `vendor/piluvitu-ui-0.1.0.tgz`) e `excludeSources` (`extensao/.output/**`, `extensao/.wxt/**` e `packages/core/dist/**`, que a exclusão automática do outDir não pega com `sourcesRoot` na raiz, mais `storybook-static`, `test-results` e `playwright-report`). O `@piluvitu/ui` entra pelo lockfile, do npm (público, MIT): a AMO aceita biblioteca pública declarada no `package.json` sem o `node_modules` (https://extensionworkshop.com/documentation/publish/third-party-library-usage/). O zip padrão (só `extensao/`) não reconstruiria nada: falta o lockfile, o `packageManager` e o `packages/core`.
```

5. `- **CI:** o job \`botai\` do \`ci.yml\`` →

```markdown
- **CI:** o job `extensao` do `ci.yml` builda Chrome, Firefox e Opera (com os gates) e roda o `lint:firefox`; o `botai-e2e.yml` roda o `test:e2e`, que builda os três antes do Playwright. O job `pacotes` do `botai-release.yml` (em PR que toca `extensao/**`, `packages/core/**`, os arquivos da raiz que entram no zip de fontes ou o próprio workflow, na tag e à mão): lint, Vitest, `zip`, `lint:firefox`, troca para o Node 24.14.0, reprodução das fontes e o artifact `botai-zips` (copiado para fora de `.output`, que o `upload-artifact` ignora por ser pasta oculta). Na tag `botai-v*`, o mesmo workflow cria o GitHub Release e roda o job `lojas` (ver "Publicação").
```

6. `- **Licença:**` →

```markdown
- **Licença:** MIT (© PiluTech) no repo inteiro: `LICENSE` na raiz, em `extensao/` e em `packages/core/`, e `"license": "MIT"` nos `package.json`. O `@piluvitu/ui` do npm também é MIT (com o aviso do shadcn).
```

7. `- **\`release\`:\*\*` →

```markdown
- **`release`:** só no push de tag, e é o único com `contents: write`. `gh release create --verify-tag --latest=false` com os 4 zips do artifact `botai-zips` e as notas dos commits que tocam `extensao` e `packages/core` desde a tag anterior. O `--latest=false` fica: o "Latest" do repo é o release do core (fase 2), de onde o `install.sh` dos binários baixa.
```

8. `- Grava em \`loja/imagens/\` e copia` →

```markdown
- Grava em `loja/imagens/` e copia, pela lista `COPIAS` de `loja/pecas.ts` (destino relativo à raiz do repo), para a landing: o ícone 128 para `site/public/`, o `edge-logo-300.png` para `site/app/icon.png` e `apple-icon.png`, e as 6 capturas de 1280×800 para `site/public/capturas/<NN>-<cena>-<tema>.png`. `loja/imagens.test.ts` confere os tamanhos e que toda cópia é idêntica à da loja. O logo do card da PiluLabs (`apps/web/public/pilulabs/botai/icone-128.png`, no monorepo) é uma cópia fixa do ícone: se o ícone mudar, refaça a cópia lá.
```

9. Apague a linha inteira que começa com `- **Conflito esperado com a fase 2 do site:**`.

10. Na linha que começa com `- **No GitHub**, o E2E roda`, troque `(paths \`extensao/**\`, \`packages/tools/**\` e o próprio workflow)`por`(paths \`extensao/**\`, \`packages/core/**\`, \`pnpm-lock.yaml\` e o próprio workflow)`.

11. Na linha da tabela de comandos que começa com `| \`make capturas-botai\``, troque `cópias para o \`apps/web\` e o \`site\``por`cópias para o \`site/\``.

12. Na linha que começa com `- **Créditos: "Powered by PiluTech"**`, troque `no \`apps/pilutech-site\`;`por`no \`apps/pilutech-site\` do monorepo \`PiluVitu/PiluVitu-Dev\`;`.

13. Na linha que começa com `- **Um segundo Storybook**:`, troque `- **Um segundo Storybook**: o do \`apps/web\` é webpack/Next e não enxerga o Tailwind deste app.`por`- **Storybook próprio** (Vite, porta 6018): o do \`site/\` é webpack/Next e não enxerga o Tailwind deste app.`

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git grep -n "packages/tools\|packages/ui/src\|PiluVitu-Dev/tree\|monorepo e não mudam\|latest=false (num monorepo\|segundo Storybook\|no \`apps/pilutech-site\`;" -- extensao/CLAUDE.md extensao/README.md; echo EXIT=$?
```

Expected: nenhuma linha (`EXIT=1`).

- [ ] **Step 15: verificação da extensão**

```bash
cd /Users/piluvitu/PILUTECH/Botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @pilutech/botai run lint && $P --filter @pilutech/botai run test > /Users/piluvitu/PILUTECH/.botai-extracao/vitest-novo.txt 2>&1; echo EXIT=$?; tail -6 /Users/piluvitu/PILUTECH/.botai-extracao/vitest-novo.txt
```

Expected: `EXIT=0`; `Tests` = linha de base + 2 (entram os 2 de `entropia.test.ts` e o novo de grafia; sai uma das cópias do `imagens.test.ts`, a do `apps/web`).

```bash
cd /Users/piluvitu/PILUTECH/Botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @pilutech/botai run build && $P --filter @pilutech/botai run build:firefox && $P --filter @pilutech/botai run build:opera && $P --filter @pilutech/botai run lint:firefox; echo EXIT=$?
```

Expected: `EXIT=0`, com os três gates do `@source` em silêncio (sentinela achada no CSS do popup, vinda de `node_modules/@piluvitu/ui/dist`) e o `web-ext lint` com 0 erros.

- [ ] **Step 16: commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add extensao && /usr/bin/git status --short && /usr/bin/git commit -m "refactor(extensao): core do workspace, @piluvitu/ui do npm e caminhos do repo próprio"; echo EXIT=$?
```

### Tarefa B7: a landing no repo próprio (lojas no repo, regras copiadas, `@piluvitu/ui` do npm)

**Files:**

- Create: `site/lojas.json`, `site/lib/pilulabs.ts`, `site/lib/contato.ts`, `site/lib/ico.ts`
- Rename: `site/lib/cms.ts` → `site/lib/lojas.ts`, `site/lib/cms.test.ts` → `site/lib/lojas.test.ts`, `site/app/lojas-publicadas.yaml` → `site/app/lojas-publicadas.json`
- Modify: `site/jest.config.ts`, `site/app/globals.css`, `site/vercel.json`, `site/package.json`, `site/playwright.lojas.config.ts`, `site/app/{page.tsx, seo.e2e.ts, pagina.e2e.ts, lojas-publicadas.e2e.ts}`, `site/components/{lojas-ui.ts, selo-fase.tsx, tabela-atalhos.tsx}`, `site/lib/{conteudo.ts, favicon.ts, json-ld.ts, modelo.ts, visitante.ts}`, `site/CLAUDE.md`, `pnpm-lock.yaml`
- Test: `site/lib/{pilulabs.test.ts, contato.test.ts, ico.test.ts, lojas.test.ts, conteudo.test.ts, favicon.test.ts, seo.test.ts, visitante.test.ts}`, `site/vercel.test.ts`, `site/app/{privacidade,termos}/page.test.tsx`

**Interfaces:**

- Consumes: `@pilutech/botai-core/atalhos` (`ATALHOS`, `Loja`, `Sistema`; B5); `@piluvitu/ui` 0.1.0 (B4).
- Produces:
  - `site/lib/pilulabs.ts`: `Loja`, `Fase`, `UrlsDasLojas`, `LojaPublicada`, `LOJAS`, `ehHttps`, `ehUrlDaLoja`, `lojasPublicadas`, `fase`, `urlsDasLojas` (cópia das regras de loja do monorepo);
  - `site/lib/lojas.ts`: `ARQUIVO_DAS_LOJAS` (`<cwd>/lojas.json`) e `lerUrlsDasLojas(caminho = process.env.BOTAI_LOJAS || ARQUIVO_DAS_LOJAS): UrlsDasLojas`, que lança em arquivo ausente ou JSON inválido;
  - `site/lojas.json` com as URLs que o CMS do `apps/web` tinha na extração;
  - `REPOSITORIO = 'https://github.com/PiluVitu/Botai'` em `site/lib/conteudo.ts`.

- [ ] **Step 1: linha de base do Jest (no monorepo)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest > /Users/piluvitu/PILUTECH/.botai-extracao/jest-site-monorepo.txt 2>&1; echo EXIT=$?; tail -5 /Users/piluvitu/PILUTECH/.botai-extracao/jest-site-monorepo.txt
```

Expected: `EXIT=0`. Anote `Tests: N passed`.

- [ ] **Step 2: hoje o Jest do site quebra com o `@piluvitu/ui` do npm (vermelho)**

```bash
cd /Users/piluvitu/PILUTECH/Botai/site && ./node_modules/.bin/jest > /Users/piluvitu/PILUTECH/.botai-extracao/jest-site-antes.txt 2>&1; echo EXIT=$?; /usr/bin/grep -c "Cannot use import statement outside a module" /Users/piluvitu/PILUTECH/.botai-extracao/jest-site-antes.txt
```

Expected: `EXIT=1` e uma contagem maior que 0 (o `dist` ESM do `@piluvitu/ui` em `node_modules` não é transformado; também falham os imports de `@piluvitu/tools`).

- [ ] **Step 3: `jest.config.ts`**

Substitua `site/jest.config.ts` inteiro por:

```ts
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    '^.+\\.(t|j)sx?$': [
      'ts-jest',
      { tsconfig: { moduleResolution: 'node', allowJs: true } },
    ],
  },
  // O @piluvitu/ui vem do npm só como ESM: sem transformá-lo, todo teste que renderiza um componente dele quebra.
  transformIgnorePatterns: ['/node_modules/(?!\\.pnpm/|@piluvitu/ui/)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@pilutech/botai-core/(.*)$': '<rootDir>/../packages/core/src/$1',
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

- [ ] **Step 4: as regras de loja (cópia, com teste)**

`site/lib/pilulabs.test.ts`:

```ts
import {
  ehHttps,
  ehUrlDaLoja,
  fase,
  LOJAS,
  lojasPublicadas,
  urlsDasLojas,
} from './pilulabs'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }

const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'
const URL_FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'
const URL_EDGE = 'https://microsoftedge.microsoft.com/addons/detail/botai/xyz'
const URL_OPERA = 'https://addons.opera.com/pt-br/extensions/details/botai/'

describe('LOJAS', () => {
  it('as lojas em ordem fixa: chrome, firefox, edge, opera', () => {
    expect(LOJAS).toEqual(['chrome', 'firefox', 'edge', 'opera'])
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
    expect(ehHttps('https://botai.pilutech.com.br')).toBe(true)
    expect(ehHttps(' https://botai.pilutech.com.br ')).toBe(true)
    expect(ehHttps('http://botai.pilutech.com.br')).toBe(false)
    expect(ehHttps('javascript:alert(1)')).toBe(false)
    expect(ehHttps('botai.pilutech.com.br')).toBe(false)
    expect(ehHttps('')).toBe(false)
  })
})

describe('lojasPublicadas', () => {
  it('sem URL nenhuma, nenhuma loja', () => {
    expect(lojasPublicadas(SEM_LOJA)).toEqual([])
  })

  it('aceita cada loja no host dela, na ordem fixa, seja qual for a ordem do arquivo', () => {
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

describe('urlsDasLojas', () => {
  it('as 4 URLs, aparadas, sem o resto do objeto', () => {
    expect(
      urlsDasLojas({
        slug: 'botai',
        nome: 'Botaí',
        chromeUrl: ` ${URL_CHROME} `,
        firefoxUrl: '',
        edgeUrl: URL_EDGE,
        operaUrl: '',
      }),
    ).toEqual({ ...SEM_LOJA, chromeUrl: URL_CHROME, edgeUrl: URL_EDGE })
  })

  it('campo ausente, nulo ou que não é texto vira vazio', () => {
    expect(
      urlsDasLojas({ chromeUrl: 12, firefoxUrl: null, edgeUrl: ['a'] }),
    ).toEqual(SEM_LOJA)
  })

  it.each([[null], [undefined], [''], ['texto'], [42], [[]]])(
    'conteúdo que não é um objeto (%p): nenhuma loja',
    (bruto) => {
      expect(urlsDasLojas(bruto)).toEqual(SEM_LOJA)
    },
  )
})
```

Os testes de `contato` e `ico` vêm iguais aos do `packages/tools`. Rode os três antes das fontes (vermelho):

```bash
cd /Users/piluvitu/PILUTECH/Botai && O=$(cat /Users/piluvitu/PILUTECH/.botai-extracao/origem.txt) && M=/Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git -C "$M" show "$O:packages/tools/src/contato.test.ts" > site/lib/contato.test.ts && /usr/bin/git -C "$M" show "$O:packages/tools/src/ico.test.ts" > site/lib/ico.test.ts && cd site && ./node_modules/.bin/jest lib/pilulabs.test.ts lib/contato.test.ts lib/ico.test.ts; echo EXIT=$?
```

Expected: os três arquivos falham com `Cannot find module './pilulabs'`, `'./contato'` e `'./ico'`; `EXIT=1`.

`site/lib/pilulabs.ts`:

```ts
// Cópia das regras de loja de @piluvitu/tools/pilulabs (monorepo PiluVitu-Dev), que o card da PiluLabs usa: mude os dois.
export type Loja = 'chrome' | 'firefox' | 'edge' | 'opera'
export type Fase = 'em-breve' | 'disponivel'
export type UrlsDasLojas = {
  chromeUrl: string
  firefoxUrl: string
  edgeUrl: string
  operaUrl: string
}
export type LojaPublicada = { loja: Loja; url: string }

export const LOJAS: readonly Loja[] = ['chrome', 'firefox', 'edge', 'opera']

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

export function lojasPublicadas(urls: UrlsDasLojas): LojaPublicada[] {
  return LOJAS.flatMap((loja) => {
    const url = urls[CAMPO_DA_LOJA[loja]].trim()
    return ehUrlDaLoja(loja, url) ? [{ loja, url }] : []
  })
}

export function fase(urls: UrlsDasLojas): Fase {
  return lojasPublicadas(urls).length > 0 ? 'disponivel' : 'em-breve'
}

function textoOuVazio(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

export function urlsDasLojas(item: unknown): UrlsDasLojas {
  const campos =
    typeof item === 'object' && item !== null
      ? (item as Record<string, unknown>)
      : {}
  return {
    chromeUrl: textoOuVazio(campos.chromeUrl),
    firefoxUrl: textoOuVazio(campos.firefoxUrl),
    edgeUrl: textoOuVazio(campos.edgeUrl),
    operaUrl: textoOuVazio(campos.operaUrl),
  }
}
```

`contato` e `ico` (cópias das fontes de lá) e os três de novo (verde):

```bash
cd /Users/piluvitu/PILUTECH/Botai && O=$(cat /Users/piluvitu/PILUTECH/.botai-extracao/origem.txt) && M=/Users/piluvitu/WWW/PiluVitu-Dev && { echo '// Cópia de @piluvitu/tools/contato (monorepo PiluVitu-Dev), que a landing da PiluTech usa: mude os dois.'; /usr/bin/git -C "$M" show "$O:packages/tools/src/contato.ts"; } > site/lib/contato.ts && { echo '// Cópia de @piluvitu/tools/ico (monorepo PiluVitu-Dev), que a landing da PiluTech usa: mude os dois.'; /usr/bin/git -C "$M" show "$O:packages/tools/src/ico.ts"; } > site/lib/ico.ts && cd site && ./node_modules/.bin/jest lib/pilulabs.test.ts lib/contato.test.ts lib/ico.test.ts; echo EXIT=$?
```

Expected: os três passam (`lib/pilulabs.test.ts` com 31 testes); `EXIT=0`.

- [ ] **Step 5: imports do `@piluvitu/tools` → cópias locais e core**

```bash
cd /Users/piluvitu/PILUTECH/Botai/site && perl -pi -e "s{'\@piluvitu/tools/pilulabs'}{'\@/lib/pilulabs'}" components/lojas-ui.ts components/selo-fase.tsx && perl -pi -e "s{'\@piluvitu/tools/pilulabs'}{'\@pilutech/botai-core/atalhos'}" components/tabela-atalhos.tsx lib/visitante.ts lib/visitante.test.ts && perl -pi -e "s{'\@piluvitu/tools/pilulabs'}{'./pilulabs'}" lib/json-ld.ts lib/modelo.ts lib/cms.ts lib/cms.test.ts && perl -pi -e "s{'\@piluvitu/tools/pilulabs'}{'../lib/pilulabs'}" app/seo.e2e.ts && perl -pi -e "s{'\@piluvitu/tools/contato'}{'./contato'}" lib/conteudo.ts && perl -pi -e "s{'\@piluvitu/tools/ico'}{'./ico'}" lib/favicon.ts lib/favicon.test.ts && /usr/bin/git grep -n "@piluvitu/tools" -- . ':!CLAUDE.md'; echo EXIT=$?
```

Expected: nenhuma linha (`EXIT=1`).

- [ ] **Step 6: as lojas saem de `lojas.json` — teste (falha)**

```bash
cd /Users/piluvitu/PILUTECH/Botai/site && /usr/bin/git mv lib/cms.ts lib/lojas.ts && /usr/bin/git mv lib/cms.test.ts lib/lojas.test.ts; echo EXIT=$?
```

Substitua `site/lib/lojas.test.ts` inteiro por:

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ehHttps } from './pilulabs'
import { ARQUIVO_DAS_LOJAS, lerUrlsDasLojas } from './lojas'

const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'
const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }

describe('lerUrlsDasLojas', () => {
  let pasta: string

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'botai-lojas-'))
  })
  afterEach(() => {
    rmSync(pasta, { recursive: true, force: true })
  })

  function arquivo(conteudo: string): string {
    const caminho = join(pasta, 'lojas.json')
    writeFileSync(caminho, conteudo)
    return caminho
  }

  // O dono publica uma loja por PR neste arquivo; o card da PiluLabs lê o CMS do monorepo.
  it('lê o lojas.json da raiz do site', () => {
    expect(ARQUIVO_DAS_LOJAS).toMatch(/site\/lojas\.json$/)
  })

  it('lê o arquivo real: as 4 URLs, vazias ou https', () => {
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

  it('apara espaços e ignora o resto do objeto', () => {
    expect(
      lerUrlsDasLojas(
        arquivo(
          JSON.stringify({
            chromeUrl: `  ${URL_CHROME} `,
            firefoxUrl: '',
            edgeUrl: '',
            operaUrl: '',
            nota: 'qualquer coisa',
          }),
        ),
      ),
    ).toEqual({ ...SEM_LOJA, chromeUrl: URL_CHROME })
  })

  it('campo ausente, nulo ou que não é texto vira vazio', () => {
    expect(
      lerUrlsDasLojas(
        arquivo('{"chromeUrl": 12, "firefoxUrl": null, "edgeUrl": ["a"]}'),
      ),
    ).toEqual(SEM_LOJA)
  })

  // Sem o arquivo, ou com ele quebrado, o build tem de quebrar: em silêncio, a landing sairia "Em breve" com a loja publicada.
  it('arquivo que não existe lança', () => {
    expect(() => lerUrlsDasLojas(join(pasta, 'nao-existe.json'))).toThrow(
      /ENOENT/,
    )
  })

  it('JSON inválido lança, inclusive o arquivo vazio', () => {
    expect(() => lerUrlsDasLojas(arquivo(''))).toThrow(SyntaxError)
    expect(() => lerUrlsDasLojas(arquivo("chromeUrl: 'x'"))).toThrow(
      SyntaxError,
    )
  })

  // Só o playwright.lojas.config.ts define a variável: builda a landing com um arquivo de teste.
  it('BOTAI_LOJAS troca o arquivo lido por padrão', () => {
    process.env.BOTAI_LOJAS = arquivo(JSON.stringify({ chromeUrl: URL_CHROME }))
    try {
      expect(lerUrlsDasLojas().chromeUrl).toBe(URL_CHROME)
    } finally {
      delete process.env.BOTAI_LOJAS
    }
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/site && ./node_modules/.bin/jest lib/lojas.test.ts; echo EXIT=$?
```

Expected: `ARQUIVO_DAS_LOJAS` indefinido e falhas; `EXIT=1`.

- [ ] **Step 7: `lojas.json`, o leitor e quem usa**

`site/lib/lojas.ts` (inteiro):

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { urlsDasLojas, type UrlsDasLojas } from './pilulabs'

export const ARQUIVO_DAS_LOJAS = join(process.cwd(), 'lojas.json')

export function lerUrlsDasLojas(
  caminho: string = process.env.BOTAI_LOJAS || ARQUIVO_DAS_LOJAS,
): UrlsDasLojas {
  return urlsDasLojas(JSON.parse(readFileSync(caminho, 'utf8')))
}
```

`site/lojas.json` (as URLs que o item `botai` do CMS tinha na extração):

```json
{
  "chromeUrl": "https://chromewebstore.google.com/detail/bota%C3%AD/mblmjomopainbcdjipkdmioglamdinnc",
  "firefoxUrl": "",
  "edgeUrl": "",
  "operaUrl": ""
}
```

Confira contra o CMS do monorepo (antes de tirar o `yaml` do site, que é quem lê):

```bash
cd /Users/piluvitu/PILUTECH/Botai/site && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev show "$(cat /Users/piluvitu/PILUTECH/.botai-extracao/origem.txt):apps/web/content/pilulabs/botai/index.yaml" > /Users/piluvitu/PILUTECH/.botai-extracao/botai-cms.yaml && node --input-type=module -e "
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
const cms = parse(readFileSync('/Users/piluvitu/PILUTECH/.botai-extracao/botai-cms.yaml', 'utf8'))
const json = JSON.parse(readFileSync('lojas.json', 'utf8'))
const dif = ['chromeUrl', 'firefoxUrl', 'edgeUrl', 'operaUrl'].filter((k) => (cms[k] ?? '') !== json[k])
console.log(dif.length ? 'DIFERE ' + dif.join(' ') : 'iguais')
process.exit(dif.length ? 1 : 0)
"; echo EXIT=$?
```

Expected: `iguais` e `EXIT=0`. Com `DIFERE`, copie para o `lojas.json` os valores do `botai-cms.yaml` e rode de novo.

O arquivo de teste do E2E da "loja publicada" passa a ser JSON:

```bash
cd /Users/piluvitu/PILUTECH/Botai/site && /usr/bin/git mv app/lojas-publicadas.yaml app/lojas-publicadas.json; echo EXIT=$?
```

`site/app/lojas-publicadas.json` (inteiro; Firefox publicado, Chrome com link de outra loja, Edge em `http:`):

```json
{
  "chromeUrl": "https://microsoftedge.microsoft.com/addons/detail/botai/xyz",
  "firefoxUrl": "https://addons.mozilla.org/pt-BR/firefox/addon/botai/",
  "edgeUrl": "http://microsoftedge.microsoft.com/addons/detail/botai/xyz",
  "operaUrl": ""
}
```

Quem lia o CMS:

```bash
cd /Users/piluvitu/PILUTECH/Botai/site && perl -pi -e "s{'\@/lib/cms'}{'\@/lib/lojas'}" app/page.tsx && perl -pi -e "s{'\.\./lib/cms'}{'../lib/lojas'}; s{lojas-publicadas\.yaml}{lojas-publicadas.json}g" app/seo.e2e.ts app/pagina.e2e.ts app/lojas-publicadas.e2e.ts && perl -pi -e "s{BOTAI_CMS_ITEM: join\(__dirname, 'app', 'lojas-publicadas\.yaml'\)}{BOTAI_LOJAS: join(__dirname, 'app', 'lojas-publicadas.json')}" playwright.lojas.config.ts && /usr/bin/git grep -n "lib/cms\|BOTAI_CMS_ITEM\|lojas-publicadas.yaml\|from 'yaml'" -- . ':!CLAUDE.md'; echo EXIT=$?
```

Expected: nenhuma linha (`EXIT=1`).

O `yaml` sai do site (ninguém mais o importa):

```bash
cd /Users/piluvitu/PILUTECH/Botai && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm --filter @pilutech/botai-site remove yaml && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm install --frozen-lockfile && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm dedupe --check; echo EXIT=$?
```

Expected: `EXIT=0`.

```bash
cd /Users/piluvitu/PILUTECH/Botai/site && ./node_modules/.bin/jest lib/lojas.test.ts lib/pilulabs.test.ts lib/contato.test.ts lib/ico.test.ts; echo EXIT=$?
```

Expected: tudo passa; `EXIT=0`.

- [ ] **Step 8: testes com o repo novo (falham)**

```bash
cd /Users/piluvitu/PILUTECH/Botai/site && /usr/bin/git ls-files -z '*.test.ts' '*.test.tsx' | xargs -0 perl -pi -e 's{github\.com/PiluVitu/PiluVitu-Dev}{github.com/PiluVitu/Botai}g; s{apps/botai-site}{site}g; s{apps/botai}{extensao}g' && perl -pi -e "s{'\.\.', '\.\.', 'botai', }{'..', '..', 'extensao', }g" lib/conteudo.test.ts && perl -pi -e "s{join\(__dirname, '\.\.', '\.\.', '\.\.', 'botai'\)}{join(__dirname, '..', '..', '..', 'extensao')}" app/privacidade/page.test.tsx && perl -pi -e 's{\.\./\.\./\.\./\.\./packages/tools/src/pessoa\.ts}{../../../packages/core/src/pessoa.ts}g; s{packages/tools/src/pessoa\.ts}{packages/core/src/pessoa.ts}g' app/termos/page.test.tsx && perl -pi -e "s{join\(__dirname, '\.\.', '\.\.', '\.\.', 'packages', 'ui', 'src', 'styles\.css'\)}{join(__dirname, '..', 'node_modules', '\@piluvitu', 'ui', 'dist', 'styles.css')}" lib/seo.test.ts && perl -pi -e 's{apps\\/botai\\/public\\/icon}{extensao\\/public\\/icon}' lib/favicon.test.ts && /usr/bin/git grep -n "PiluVitu-Dev\|'\.\.', 'botai'\|packages/tools\|packages', 'ui'" -- '*.test.ts' '*.test.tsx'; echo EXIT=$?
```

Expected: nenhuma linha (`EXIT=1`).

Substitua `site/vercel.test.ts` inteiro por:

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

  // As lojas moram no lojas.json (dentro do site); o favicon.ico sai dos ícones da extensão;
  // o @piluvitu/ui muda pelo lockfile.
  it('vigia o site, o core, os ícones da extensão e os arquivos de install e build', () => {
    expect(caminhos.split(' ')).toEqual([
      '.',
      '../packages/core',
      '../extensao/public/icon',
      '../pnpm-lock.yaml',
      '../pnpm-workspace.yaml',
      '../package.json',
      '../.npmrc',
      '../scripts/check-tailwind-source.mjs',
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

```bash
cd /Users/piluvitu/PILUTECH/Botai/site && ./node_modules/.bin/jest vercel.test.ts lib/conteudo.test.ts lib/favicon.test.ts app/privacidade app/termos; echo EXIT=$?
```

Expected: falham o `vercel.test.ts` (lista), o `conteudo.test.ts` (`REPOSITORIO` e licença), o `favicon.test.ts` (pasta dos ícones) e os links de histórico e de licença das páginas; `EXIT=1`.

- [ ] **Step 9: o site com os caminhos do repo novo**

```bash
cd /Users/piluvitu/PILUTECH/Botai/site && perl -pi -e 's{github\.com/PiluVitu/PiluVitu-Dev}{github.com/PiluVitu/Botai}g; s{apps/botai-site}{site}g; s{apps/botai}{extensao}g' lib/conteudo.ts && perl -pi -e "s{^  'botai',\$}{  'extensao',}" lib/favicon.ts && perl -pi -e "s{\@source '\.\./\.\./\.\./packages/ui/src';}{\@source '../node_modules/\@piluvitu/ui/dist';}" app/globals.css && /usr/bin/grep -n "REPOSITORIO =\|URL_DA_LICENCA =\|commits/main" lib/conteudo.ts && /usr/bin/grep -n "'extensao'" lib/favicon.ts && /usr/bin/grep -n "@source" app/globals.css; echo EXIT=$?
```

Expected: `REPOSITORIO = 'https://github.com/PiluVitu/Botai'`, `` URL_DA_LICENCA = `${REPOSITORIO}/blob/main/extensao/LICENSE` ``, `` `${REPOSITORIO}/commits/main/site/${arquivo}` ``; `'extensao',` no `favicon.ts`; `@source '../node_modules/@piluvitu/ui/dist';` e `@source not '../*.md';`; `EXIT=0`.

`site/vercel.json` (inteiro):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- . ../packages/core ../extensao/public/icon ../pnpm-lock.yaml ../pnpm-workspace.yaml ../package.json ../.npmrc ../scripts/check-tailwind-source.mjs"
}
```

- [ ] **Step 10: verificação do site**

```bash
cd /Users/piluvitu/PILUTECH/Botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @pilutech/botai-site run lint && $P --filter @pilutech/botai-site run typecheck && $P --filter @pilutech/botai-site run test > /Users/piluvitu/PILUTECH/.botai-extracao/jest-site-novo.txt 2>&1; echo EXIT=$?; /usr/bin/grep -E "^Tests:|^# (pass|fail)" /Users/piluvitu/PILUTECH/.botai-extracao/jest-site-novo.txt
```

Expected: `EXIT=0`; `Tests:` = linha de base do Step 1 + os de `lib/pilulabs.test.ts` (31) + os de `lib/contato.test.ts` e `lib/ico.test.ts` (os mesmos números que eles têm no `packages/tools`), com o `lojas.test.ts` (7) no lugar do `cms.test.ts` (7); `# fail 0` no `node --test`.

```bash
cd /Users/piluvitu/PILUTECH/Botai && NEXT_TELEMETRY_DISABLED=1 /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm --filter @pilutech/botai-site run build; echo EXIT=$?
```

Expected: `EXIT=0`, com o gate do `@source` em silêncio e a conferência das rotas estáticas passando.

- [ ] **Step 11: `site/CLAUDE.md`**

```bash
cd /Users/piluvitu/PILUTECH/Botai && perl -pi -e 's{apps/botai-site}{site}g; s{apps/botai/}{extensao/}g; s{apps/botai}{extensao}g; s{packages/tools/src/pessoa\.ts}{packages/core/src/pessoa.ts}g' site/CLAUDE.md; echo EXIT=$?
```

Depois, no `site/CLAUDE.md`, troque cada linha inteira que começa com o trecho indicado:

1. `- **Lojas e fase saem do CMS do \`apps/web\`:\*\*` →

```markdown
- **Lojas e fase saem de `lojas.json`** (na raiz do `site/`, editado por PR): `lib/lojas.ts` lê o arquivo no build (as 4 URLs, por `urlsDasLojas` de `lib/pilulabs.ts`). Arquivo ausente ou JSON inválido quebra o build de propósito: em silêncio, a landing sairia "Em breve" com a loja já publicada. `BOTAI_LOJAS` troca o arquivo (só o `playwright.lojas.config.ts` a define). O card da PiluLabs e o selo da landing da PiluTech leem o item `botai` do CMS do `apps/web`, no monorepo `PiluVitu/PiluVitu-Dev`: publicar uma loja é mudar os dois.
```

2. `- **Regras compartilhadas:**` →

```markdown
- **Regras:** `lib/pilulabs.ts` é cópia das regras de loja do `@piluvitu/tools/pilulabs` do monorepo (`LOJAS`, `ehHttps`, `ehUrlDaLoja`, `lojasPublicadas`, `fase`, `urlsDasLojas`), e o card da PiluLabs decide com o original: regra nova vale nos dois. `ATALHOS` vem de `@pilutech/botai-core/atalhos`, a mesma fonte do manifesto da extensão. `lib/contato.ts` e `lib/ico.ts` são cópias do `@piluvitu/tools` pelo mesmo motivo (a landing da PiluTech usa os originais).
```

3. Na linha que começa com `- **E-mail e links da PiluTech:**`, troque `por \`mailtoDaPilutech\` de \`@piluvitu/tools/contato\``por`por \`mailtoDaPilutech\` de \`lib/contato.ts\``, e `a landing da empresa no \`apps/pilutech-site\``por`a landing da empresa, no \`apps/pilutech-site\` do monorepo`.

4. `- O link de histórico aponta para o \`page.tsx\` de cada rota;` →

```markdown
- O link de histórico aponta para o `page.tsx` de cada rota neste repo (o histórico veio do monorepo pelo `git filter-repo`). As versões da política de antes de 2026-10-02 estão no monorepo `PiluVitu/PiluVitu-Dev`, no histórico de `apps/web/app/(site)/pilulabs/botai/privacidade/page.tsx`.
```

5. Na linha que começa com `  - A \`Organization\` leva o \`logo\``, troque `gerado pelo \`apps/pilutech-site\``por`gerado pelo \`apps/pilutech-site\` do monorepo`.

6. `- **Duas passadas no \`test:e2e\`:\*\*` →

```markdown
- **Duas passadas no `test:e2e`:** primeiro o `playwright.lojas.config.ts`, que builda com `BOTAI_LOJAS=app/lojas-publicadas.json` (Firefox publicado, Chrome com link de outra loja, Edge em `http:`) e roda `app/lojas-publicadas.e2e.ts`; depois o `playwright.config.ts`, que builda com o `lojas.json` real e roda o resto. O `lojas.json` tem só a Chrome Web Store publicada (desde 2026-10-05); a primeira passada é a que exercita link de outra loja e Edge em `http:` (que some, sem "Em breve"). A ordem deixa o `.next` com o arquivo real; um `distDir` à parte faria o `next build` mexer no `include` do `tsconfig.json`.
```

7. Na linha que começa com `- \`pnpm build\` = \`next build\` + o gate do \`@source\``, troque `(\`scripts/check-tailwind-source.mjs .next\`;`por`(\`../scripts/check-tailwind-source.mjs .next\`;`. Logo depois dessa linha, acrescente:

```markdown
- **`@piluvitu/ui` do npm (ESM):** o `globals.css` declara `@source '../node_modules/@piluvitu/ui/dist'`, e o `jest.config.ts` transforma o pacote (`transformIgnorePatterns: ['/node_modules/(?!\\.pnpm/|@piluvitu/ui/)']` e o ts-jest pegando `.js`); sem isso, todo teste que renderiza um componente dele quebra com `SyntaxError: Cannot use import statement outside a module` (medido). O `@pilutech/botai-core` vem do workspace como código-fonte (`moduleNameMapper` para `../packages/core/src`).
```

8. Troque a seção `## Deploy (Vercel, projeto próprio)` inteira (do título até antes de `## Comandos`) por:

```markdown
## Deploy (Vercel, projeto próprio)

1. Projeto `botai-site` ligado a `PiluVitu/Botai`, **Root Directory `site`**, framework Next.js, install e build padrão (`pnpm install` na raiz do repo, `pnpm build`), Node 22.x e "Include files outside the root directory in the Build Step" ligado (`sourceFilesOutsideRootDirectory`; o build lê `packages/core` e os ícones de `extensao/public/icon`). A troca do monorepo para este repo é o passo C9 do plano `docs/superpowers/plans/2026-10-05-botai-fase0-separacao.md`.
2. **"Skip deployments" desligado**; quem filtra é o `ignoreCommand` do `vercel.json` (roda na Root Directory; `exit 0` cancela): o site (inclusive o `lojas.json`), `packages/core`, os ícones da extensão (de onde sai o `/favicon.ico`) e os arquivos de install e build da raiz (`pnpm-lock.yaml`, `pnpm-workspace.yaml`, `package.json`, `.npmrc`, `scripts/check-tailwind-source.mjs`). O `@piluvitu/ui` muda pelo lockfile. O `vercel.test.ts` confere a lista e que todo caminho existe.
3. Domínio `botai.pilutech.com.br` no projeto, com o `CNAME botai` da Cloudflare em **DNS only** (a troca de repo não mexe nele).
4. Env: nenhuma obrigatória. `GOOGLE_SITE_VERIFICATION` em Production quando o dono cadastrar o domínio no Search Console. Não ponha `SITE_URL` nem `BOTAI_LOJAS` em ambiente nenhum.
5. Produção sai da `main`. Para promover um build à mão: `vercel deploy` num clone limpo (preview) e `vercel promote <url-do-preview> --yes`.
6. Confira: o preview responde `x-robots-tag: noindex` (`curl -sI https://<preview>.vercel.app | grep -i x-robots-tag`); `https://botai.pilutech.com.br`, `/privacidade` e `/termos` respondem 200 sem `noindex`; o canonical da home aponta para ela mesma; `/sitemap.xml` lista as três rotas.
```

9. No bloco de `## Estrutura`, troque `lib/                  conteúdo, leitura do CMS, modelo da página, visitante, capturas, site, seo, json-ld, imagem OG` por `lib/                  conteúdo, leitura do lojas.json, cópias do monorepo (pilulabs, contato, ico), modelo da página, visitante, capturas, site, seo, json-ld, imagem OG`.

10. Na tabela de `## Testes`, na linha que começa com `| Lógica (CMS, modelo, visitante, SEO…)`, troque `CMS` por `lojas`.

11. Na tabela de `## Comandos`, na linha que começa com `| \`make test-e2e-botai-site\``, troque `(YAML de teste, depois o CMS real)`por`(lojas de teste, depois o \`lojas.json\` real)`.

12. Na linha que começa com `- O E2E builda e sobe \`next start\``, troque `Ele não roda no CI (como o do \`apps/web\`).`por`Ele não roda no CI deste repo (só local).`

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git grep -n "@piluvitu/tools/\|BOTAI_CMS_ITEM\|CMS real\|leitura do CMS\|Lógica (CMS\|\.\./\.\./packages\|como o do \`apps/web\`" -- site/CLAUDE.md; echo EXIT=$?
```

Expected: só a menção de origem que o item 2 escreveu (`do \`@piluvitu/tools/pilulabs\` do monorepo`); nenhuma linha com `BOTAI_CMS_ITEM`, `CMS real`, `leitura do CMS`, `Lógica (CMS`ou`../../packages`.

- [ ] **Step 12: commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add site pnpm-lock.yaml && /usr/bin/git status --short && /usr/bin/git commit -m "refactor(site): lojas no próprio repo, regras copiadas do monorepo e @piluvitu/ui do npm"; echo EXIT=$?
```

### Tarefa B8: `pnpm audit --audit-level high` limpo (gate do CI do repo novo)

**Files:**

- Modify: `pnpm-lock.yaml`, `pnpm-workspace.yaml` (só se sobrar advisory sem correção na faixa)

**Interfaces:**

- Consumes: o lockfile da B4/B7.
- Produces: `pnpm audit --audit-level high` com `EXIT=0`; todo GHSA ignorado listado em `auditConfig.ignoreGhsas`, com o motivo comentado ao lado (a B10 copia a lista para o `CLAUDE.md` da raiz).

Em 2026-10-05, os advisories high que alcançam a extensão e o site eram todos de ferramenta de build, teste ou Storybook: `picomatch` < 2.3.2, `fast-uri` < 3.1.7, `undici` < 7.29.1 e `node-forge` ≤ 1.4.0 (pelo `web-ext`), `braces` ≤ 3.0.3, `@babel/plugin-transform-modules-systemjs` ≤ 7.29.3 e `webpack-dev-middleware` < 7.4.5 (pelo `@storybook/nextjs`). Só o último não tem correção dentro da faixa que o pai pede: o `@storybook/builder-webpack5` (inclusive o 10.6.1, o mais novo) exige `^6.1.2`, e a correção saiu na 7.4.5.

- [ ] **Step 1: o que o audit acha hoje**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm audit --audit-level high > /Users/piluvitu/PILUTECH/.botai-extracao/audit-antes.txt 2>&1; echo EXIT=$?; tail -3 /Users/piluvitu/PILUTECH/.botai-extracao/audit-antes.txt
```

Expected: `EXIT=1` e a contagem por severidade. Se `EXIT=0`, pule para o Step 5.

- [ ] **Step 2: atualizar as cópias transitivas dentro da faixa**

Nenhum desses é dependência direta de workspace daqui, então o `pnpm update -r` alcança as cópias transitivas (a armadilha do monorepo é quando o nome também é direto). As versões novas passam pelo `minimumReleaseAge`.

```bash
cd /Users/piluvitu/PILUTECH/Botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P update -r picomatch fast-uri undici node-forge braces @babel/plugin-transform-modules-systemjs && $P dedupe && $P install --frozen-lockfile && $P dedupe --check; echo EXIT=$?
```

Expected: `EXIT=0`. Confira o resultado no lockfile, não na saída do pnpm:

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/grep -nE "^  (picomatch|fast-uri|undici|node-forge|braces|'@babel/plugin-transform-modules-systemjs')@" pnpm-lock.yaml
```

Expected: só versões iguais ou acima das corrigidas (`picomatch@2.3.2`+ na linha 2.x, `fast-uri@3.1.7`+, `undici@7.29.1`+, `node-forge@1.4.1`+, `braces@3.0.4`+, `@babel/plugin-transform-modules-systemjs@7.29.4`+).

- [ ] **Step 3: o que sobrou**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm audit --audit-level high --json > /Users/piluvitu/PILUTECH/.botai-extracao/audit-depois.json 2>/dev/null; echo EXIT=$?; node -e '
const a = require("/Users/piluvitu/PILUTECH/.botai-extracao/audit-depois.json")
for (const v of Object.values(a.advisories ?? {}))
  if (["high", "critical"].includes(v.severity))
    console.log(v.github_advisory_id, v.module_name, v.vulnerable_versions, "->", v.patched_versions, "|", (v.findings ?? []).flatMap((f) => f.paths).slice(0, 2).join(" ; "))
'
```

Para cada linha listada, decida nesta ordem:

1. A versão corrigida cabe na faixa que o pai pede → `pnpm update -r <pacote>` (como no Step 2) e volte ao Step 3.
2. Não cabe, e o caminho passa só por ferramenta de build, teste ou Storybook (nada que vá no pacote da extensão nem no runtime do site; o `pnpm why <pacote>` mostra a cadeia) → ignore o GHSA:

```bash
cd /Users/piluvitu/PILUTECH/Botai && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm audit --ignore <GHSA>; echo EXIT=$?
```

e, no `pnpm-workspace.yaml`, logo acima do GHSA que o comando gravou em `auditConfig.ignoreGhsas`, escreva duas linhas de comentário com o pacote, a versão, a severidade, a cadeia e por que não alcança o usuário. Para o esperado hoje:

```yaml
auditConfig:
  ignoreGhsas:
    # webpack-dev-middleware 6.1.3 (path traversal, high): só no `storybook dev` do site, pelo @storybook/nextjs >
    # @storybook/builder-webpack5, que exige ^6.1.2 (a correção é da 7.4.5). Não vai no build da landing nem da extensão.
    - GHSA-g84c-rxfj-3j2c
```

3. O caminho chega ao pacote da extensão ou ao runtime do site → **PARE** e reporte ao dono (pacote, GHSA, cadeia): é decisão dele.

- [ ] **Step 4: audit limpo**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm audit --audit-level high; echo EXIT=$?
```

Expected: nenhum advisory high ou critical e `EXIT=0`.

- [ ] **Step 5: o que as atualizações tocaram ainda passa**

```bash
cd /Users/piluvitu/PILUTECH/Botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @pilutech/botai run test && $P --filter @pilutech/botai run build && $P --filter @pilutech/botai run lint:firefox && $P --filter @pilutech/botai-site run test && NEXT_TELEMETRY_DISABLED=1 $P --filter @pilutech/botai-site run build && $P --filter @pilutech/botai-site run build-storybook > /dev/null; echo EXIT=$?
```

Expected: `EXIT=0` (o `web-ext lint` usa o `undici` e o `node-forge` atualizados; o Storybook do site, o `webpack-dev-middleware` e o `braces`).

- [ ] **Step 6: commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add pnpm-lock.yaml pnpm-workspace.yaml && /usr/bin/git commit -m "fix(deps): advisories high do audit corrigidos dentro da faixa (o resto, ignorado com motivo)"; echo EXIT=$?
```

### Tarefa B9: CI/CD do repo próprio

**Files:**

- Create: `.github/workflows/ci.yml`, `.github/workflows/publicar-core.yml`, `.github/workflows/trivy.yml`, `.github/dependabot.yml`
- Modify: `.github/workflows/botai-e2e.yml`, `.github/workflows/botai-release.yml`
- Test: `scripts/salvaguardas.test.mjs` (4 testes novos)

**Interfaces:**

- Consumes: scripts `lint`, `test`, `build*`, `lint:firefox`, `typecheck`, `zip` e `test:e2e` dos três workspaces; `extensao/scripts/{conferir-tag,reproduzir-fontes,submeter-lojas}.sh` (B6).
- Produces: workflows `CI` (jobs `dependencias`, `core`, `extensao`, `site`), `Botaí E2E`, `Botaí Release` (tag `botai-v*`, environment `lojas-botai`), `Publicar @pilutech/botai-core` (tag `core-v*`, environment `npm`) e `Trivy`; Dependabot com `cooldown`.

- [ ] **Step 1: testes dos workflows (falham)**

Em `scripts/salvaguardas.test.mjs`, troque a linha `import { readFileSync } from 'node:fs'` por `import { readdirSync, readFileSync } from 'node:fs'` e acrescente no fim:

As fases 2 e 3 acrescentam workflows (`core-distribuicao.yml`, `publicar-playwright.yml`) e um ecossistema do Dependabot (`docker`): os testes valem para todo arquivo, sem lista fechada, para elas entrarem sem mexer aqui (contrato, "Publicação no npm e environments").

```js
const WORKFLOWS = join(RAIZ, '.github', 'workflows')
const workflows = () =>
  readdirSync(WORKFLOWS).filter((arquivo) => arquivo.endsWith('.yml'))
const workflow = (arquivo) => ler(join('.github', 'workflows', arquivo))

test('os workflows da fase 0 existem, e toda action de todo workflow está fixada por SHA', () => {
  for (const base of [
    'botai-e2e.yml',
    'botai-release.yml',
    'ci.yml',
    'publicar-core.yml',
    'trivy.yml',
  ])
    assert.ok(workflows().includes(base), base)
  for (const arquivo of workflows())
    for (const linha of workflow(arquivo)
      .split('\n')
      .filter((l) => /^\s*(-\s*)?uses:/.test(l)))
      assert.match(
        linha,
        /uses: \S+@[0-9a-f]{40} # \S+$/,
        `${arquivo}: ${linha.trim()}`,
      )
})

test('o CI barra lockfile solto, cópia duplicada e advisory high', () => {
  const ci = workflow('ci.yml')
  for (const comando of [
    'pnpm install --frozen-lockfile',
    'pnpm dedupe --check',
    'pnpm audit --audit-level high',
  ])
    assert.ok(ci.includes(comando), comando)
})

test('Dependabot com cooldown em todo ecossistema e sem merge automático', () => {
  const dependabot = ler('.github/dependabot.yml')
  const ecossistemas =
    dependabot.match(/^  - package-ecosystem:/gm)?.length ?? 0
  assert.ok(ecossistemas >= 2, 'npm e github-actions')
  assert.equal(dependabot.match(/^    cooldown:$/gm)?.length, ecossistemas)
  assert.doesNotMatch(dependabot, /auto-?merge/i)
})

// Spec §5.4: publicação só por tag, atrás de aprovação, com proveniência; id-token só onde publica.
test('todo workflow que publica no npm usa o environment npm, com proveniência', () => {
  const publicam = workflows().filter((arquivo) =>
    /npm publish/.test(workflow(arquivo)),
  )
  assert.ok(publicam.includes('publicar-core.yml'))
  for (const arquivo of publicam) {
    const texto = workflow(arquivo)
    assert.match(texto, /^    environment: npm$/m, arquivo)
    assert.equal(texto.match(/id-token: write/g)?.length, 1, arquivo)
    assert.match(texto, /npm publish \S+ --access public --provenance/, arquivo)
  }
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai && node --test scripts/salvaguardas.test.mjs; echo EXIT=$?
```

Expected: os 4 novos falham (faltam `ci.yml`, `publicar-core.yml`, `trivy.yml` e o `dependabot.yml`, e os `uses:` vindos do monorepo podem estar sem SHA); `EXIT=1`.

- [ ] **Step 2: `ci.yml`**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  dependencias:
    name: Dependências e salvaguardas (lockfile, dedupe, audit, node --test, actionlint)
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      # Versão lida de package.json > packageManager (pnpm@11.1.1).
      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Dedupe check
        run: pnpm dedupe --check

      - name: Audit (high ou pior)
        run: pnpm audit --audit-level high

      - name: Salvaguardas e gate (node --test)
        run: node --test scripts/*.test.mjs

      - name: actionlint
        run: >-
          docker run --rm -v "$GITHUB_WORKSPACE:/repo" --workdir /repo
          rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667
          -color

  core:
    name: Core (tsc sem DOM + Jest + build + pacote)
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint (tsc sem lib dom)
        run: pnpm --filter @pilutech/botai-core run lint

      - name: Test (jest + build + conferência do pacote)
        run: pnpm --filter @pilutech/botai-core run test

  extensao:
    name: Extensão (lint + test + builds de Chrome, Firefox e Opera + web-ext lint)
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # `wxt prepare` vem dentro dos scripts, nunca como postinstall: um postinstall quebrado derrubaria o install de todos os jobs.
      - name: Lint (wxt prepare + tsc + eslint)
        run: pnpm --filter @pilutech/botai run lint

      - name: Test (vitest)
        run: pnpm --filter @pilutech/botai run test

      - name: Build (+ gate do @source em .output/chrome-mv3)
        run: pnpm --filter @pilutech/botai run build

      - name: Build do Firefox (+ gate do @source em .output/firefox-mv3)
        run: pnpm --filter @pilutech/botai run build:firefox

      - name: Build do Opera, sem minificar (+ gate do @source em .output/opera-mv3)
        run: pnpm --filter @pilutech/botai run build:opera

      # O addons-linter é o validador da AMO; falha só em erro (os avisos vêm do react-dom e do Font Awesome).
      - name: web-ext lint no build do Firefox
        run: pnpm --filter @pilutech/botai run lint:firefox

  site:
    name: Site (lint + tsc + test + build)
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    env:
      NEXT_TELEMETRY_DISABLED: '1'
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
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

      - name: Build (+ gate do @source + rotas estáticas)
        run: pnpm --filter @pilutech/botai-site run build
```

- [ ] **Step 3: `botai-e2e.yml`**

Substitua `.github/workflows/botai-e2e.yml` inteiro por:

```yaml
name: Botaí E2E

on:
  push:
    branches: [main]
    paths:
      - 'extensao/**'
      - 'packages/core/**'
      - 'pnpm-lock.yaml'
      - '.github/workflows/botai-e2e.yml'
  pull_request:
    branches: [main]
    paths:
      - 'extensao/**'
      - 'packages/core/**'
      - 'pnpm-lock.yaml'
      - '.github/workflows/botai-e2e.yml'
  workflow_dispatch:

concurrency:
  group: botai-e2e-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

# Fora do `CI`: leva minutos (3 builds de produção + o build e2e + Playwright) e só importa quando a extensão, o core ou o lockfile mudam.
jobs:
  e2e:
    name: Botaí (Playwright, extensão desempacotada)
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # Sem o headless shell: ele não carrega extensão (o teste usa channel: 'chromium').
      - name: Chromium do Playwright
        run: pnpm --filter @pilutech/botai exec playwright install --with-deps --no-shell chromium

      - name: E2E (builds de produção + build e2e + Playwright)
        run: pnpm --filter @pilutech/botai run test:e2e

      - name: Rastros do Playwright
        if: failure()
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: playwright-botai
          path: extensao/test-results/
          if-no-files-found: ignore
          retention-days: 7
```

- [ ] **Step 4: `botai-release.yml`**

Substitua `.github/workflows/botai-release.yml` inteiro por (mesmos jobs do monorepo; mudam os caminhos e os pins, e o `--latest=false` fica, porque o "Latest" do repo é do core a partir da fase 2):

```yaml
name: Botaí Release

# Fora do `CI`: só roda quando a extensão, o core ou um arquivo do zip de fontes mudam, e na tag.
on:
  push:
    tags: ['botai-v*']
  pull_request:
    branches: [main]
    paths:
      - 'extensao/**'
      - 'packages/core/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - '.npmrc'
      - 'scripts/check-tailwind-source.mjs'
      - '.github/workflows/botai-release.yml'
  workflow_dispatch:
    inputs:
      lojas:
        description: 'Job lojas: só imprimir (nenhuma), validar as credenciais (dry-run) ou submeter'
        type: choice
        options: [nenhuma, dry-run, submeter]
        default: nenhuma
      adiar_chrome:
        description: 'Chrome Web Store: publicação adiada (STAGED_PUBLISH), liberada depois no painel'
        type: boolean
        default: false

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
    outputs:
      versao: ${{ steps.versao.outputs.versao }}
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          fetch-depth: 0
          persist-credentials: false

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Versão (extensao/package.json)
        id: versao
        run: echo "versao=$(node -p "require('./extensao/package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Tag = botai-v<versão do package.json>, num commit da main
        if: github.event_name == 'push'
        run: bash extensao/scripts/conferir-tag.sh "$GITHUB_REF_NAME" "$GITHUB_SHA"

      - name: Lint (wxt prepare + tsc + eslint)
        run: pnpm --filter @pilutech/botai run lint

      - name: Test (vitest)
        run: pnpm --filter @pilutech/botai run test

      - name: Pacotes de Chrome e Edge, Firefox e Opera + zip de fontes (gates do @source inclusos)
        run: pnpm --filter @pilutech/botai run zip

      - name: web-ext lint no build do Firefox
        run: pnpm --filter @pilutech/botai run lint:firefox

      # O ambiente do revisor da AMO: o pacote acima sai do Node 22; a reprodução roda no 24.14.0.
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '24.14.0'

      - name: Reprodução das fontes (pasta limpa, cmp byte a byte)
        env:
          VERSAO: ${{ steps.versao.outputs.versao }}
        run: >-
          bash extensao/scripts/reproduzir-fontes.sh
          "extensao/.output/botai-$VERSAO-sources.zip"
          "extensao/.output/botai-$VERSAO-firefox.zip"

      # `.output` começa com ponto, e o upload-artifact ignora pasta oculta.
      - name: Separar os pacotes
        run: |
          mkdir -p botai-zips
          cp extensao/.output/*.zip botai-zips/

      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: botai-zips
          path: botai-zips/
          if-no-files-found: error
          retention-days: 30

  release:
    name: GitHub Release
    needs: pacotes
    if: github.event_name == 'push'
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          fetch-depth: 0
          persist-credentials: false

      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: botai-zips
          path: botai-zips

      - name: Notas (commits da extensão e do core desde a tag anterior)
        env:
          VERSAO: ${{ needs.pacotes.outputs.versao }}
        run: |
          set -euo pipefail
          anterior=$(git describe --tags --abbrev=0 --match 'botai-v*' "$GITHUB_REF_NAME^" 2>/dev/null || true)
          {
            echo "## Botaí $VERSAO"
            echo
            git log --no-merges --format='- %s (%h)' "${anterior:+$anterior..}$GITHUB_REF_NAME" -- extensao packages/core
          } > notas.md
          cat notas.md

      # --latest=false: o "Latest" do repo é o release do core (fase 2), de onde o install.sh dos binários baixa.
      - name: Criar o release com os zips
        env:
          GH_TOKEN: ${{ github.token }}
          VERSAO: ${{ needs.pacotes.outputs.versao }}
        run: >-
          gh release create "$GITHUB_REF_NAME" botai-zips/*.zip
          --verify-tag
          --title "Botaí $VERSAO"
          --notes-file notas.md
          --latest=false

  lojas:
    name: Lojas (wxt submit)
    needs: pacotes
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    # Vazio no PR e no dispatch "nenhuma": sem environment não há secrets, e nada é enviado.
    environment: ${{ (github.event_name != 'pull_request' && inputs.lojas != 'nenhuma') && 'lojas-botai' || '' }}
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: botai-zips
          path: botai-zips

      - name: actionlint deste workflow
        if: github.event_name == 'pull_request'
        run: >-
          docker run --rm -v "$GITHUB_WORKSPACE:/repo" --workdir /repo
          rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667
          -color .github/workflows/botai-release.yml

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0
        if: github.event_name != 'pull_request'

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        if: github.event_name != 'pull_request'
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        if: github.event_name != 'pull_request'
        run: pnpm install --frozen-lockfile

      - name: wxt submit (só as lojas com secrets)
        working-directory: extensao
        env:
          EVENTO: ${{ github.event_name }}
          ENTRADA_LOJAS: ${{ inputs.lojas }}
          ADIAR_CHROME: ${{ inputs.adiar_chrome }}
          ORIGEM_REF: ${{ github.ref }}
          VERSAO: ${{ needs.pacotes.outputs.versao }}
          PASTA_ZIPS: ${{ github.workspace }}/botai-zips
          CHROME_API_VERSION: v2
          CHROME_EXTENSION_ID: ${{ vars.BOTAI_CHROME_EXTENSION_ID }}
          CHROME_PUBLISHER_ID: ${{ vars.CHROME_PUBLISHER_ID }}
          CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL: ${{ vars.CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL }}
          CHROME_SERVICE_ACCOUNT_PRIVATE_KEY: ${{ secrets.CHROME_SERVICE_ACCOUNT_PRIVATE_KEY }}
          FIREFOX_EXTENSION_ID: botai@pilutech.com.br
          FIREFOX_CHANNEL: listed
          FIREFOX_COMPATIBILITY: firefox
          FIREFOX_JWT_ISSUER: ${{ secrets.FIREFOX_JWT_ISSUER }}
          FIREFOX_JWT_SECRET: ${{ secrets.FIREFOX_JWT_SECRET }}
          EDGE_PRODUCT_ID: ${{ vars.BOTAI_EDGE_PRODUCT_ID }}
          EDGE_CLIENT_ID: ${{ secrets.EDGE_CLIENT_ID }}
          EDGE_API_KEY: ${{ secrets.EDGE_API_KEY }}
        run: bash scripts/submeter-lojas.sh
```

- [ ] **Step 5: `publicar-core.yml`**

`.github/workflows/publicar-core.yml`:

```yaml
name: Publicar @pilutech/botai-core

# A tag core-v<versão> sai na main, depois do merge do PR que sobe a versão em packages/core/package.json.
on:
  push:
    tags: ['core-v*']

concurrency:
  group: publicar-core-${{ github.ref }}
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  pacote:
    name: Verificação + pacote
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    outputs:
      versao: ${{ steps.versao.outputs.versao }}
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          fetch-depth: 0
          persist-credentials: false

      - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Versão (packages/core/package.json)
        id: versao
        run: echo "versao=$(node -p "require('./packages/core/package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Tag = core-v<versão>, num commit da main
        env:
          VERSAO: ${{ steps.versao.outputs.versao }}
        run: |
          if [ "$GITHUB_REF_NAME" != "core-v$VERSAO" ]; then
            echo "::error::A tag $GITHUB_REF_NAME não bate com a versão de packages/core/package.json (esperado core-v$VERSAO)."
            exit 1
          fi
          if ! git merge-base --is-ancestor "$GITHUB_SHA^{commit}" origin/main; then
            echo "::error::O commit da tag $GITHUB_REF_NAME não está na main."
            exit 1
          fi

      - name: Lint (tsc sem lib dom)
        run: pnpm --filter @pilutech/botai-core run lint

      - name: Test (jest + build + conferência do pacote)
        run: pnpm --filter @pilutech/botai-core run test

      - name: Pacote (o pnpm pack aplica o publishConfig)
        run: pnpm --filter @pilutech/botai-core pack --pack-destination "$RUNNER_TEMP/pacote"

      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: pacote-core
          path: ${{ runner.temp }}/pacote/
          if-no-files-found: error
          retention-days: 30

  publicar:
    name: npm (trusted publishing, com proveniência)
    needs: pacote
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    environment: npm
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: pacote-core
          path: pacote

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '24.14.0'
          registry-url: 'https://registry.npmjs.org'

      - name: npm ≥ 11.5.1 (antes disso não há trusted publishing)
        run: |
          versao=$(npm --version)
          if ! node -e 'const [a, b, c] = process.argv[1].split(".").map(Number); process.exit(a > 11 || (a === 11 && (b > 5 || (b === 5 && c >= 1))) ? 0 : 1)' "$versao"; then
            echo "::error::npm $versao: o trusted publishing pede 11.5.1 ou mais novo."
            exit 1
          fi

      - name: Extrair o tarball
        env:
          VERSAO: ${{ needs.pacote.outputs.versao }}
        run: tar -xzf "pacote/pilutech-botai-core-$VERSAO.tgz" -C pacote

      - name: Publicar
        run: npm publish pacote/package --access public --provenance
```

- [ ] **Step 6: `trivy.yml` e `dependabot.yml`**

`.github/workflows/trivy.yml`:

```yaml
name: Trivy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    # Toda segunda-feira às 08:00 UTC (05:00 BRT)
    - cron: '0 8 * * 1'

permissions:
  contents: read

jobs:
  trivy-fs:
    name: Dependências e segredos (SARIF)
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - name: Trivy — filesystem (vulnerabilidades + segredos)
        uses: aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1 # 0.35.0
        with:
          scan-type: fs
          scan-ref: .
          scanners: vuln,secret
          severity: CRITICAL,HIGH,MEDIUM
          format: sarif
          output: trivy-fs-results.sarif
          exit-code: '0'

      - name: SARIF na aba Security
        uses: github/codeql-action/upload-sarif@1190a975f95ce23525efb6a3fc21ea29567c1b52 # v3.38.2
        if: always()
        with:
          sarif_file: trivy-fs-results.sarif
          category: trivy-fs

  trivy-segredos:
    name: Segredos (falha o PR)
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - name: Trivy — só segredos, estrito
        uses: aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1 # 0.35.0
        with:
          scan-type: fs
          scan-ref: .
          scanners: secret
          severity: CRITICAL,HIGH,MEDIUM,LOW
          format: table
          exit-code: '1'

  trivy-config:
    name: Configuração (SARIF)
    runs-on: ubuntu-24.04
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - name: Trivy — configuração
        uses: aquasecurity/trivy-action@57a97c7e7821a5776cebc9bb87c984fa69cba8f1 # 0.35.0
        with:
          scan-type: config
          scan-ref: .
          severity: CRITICAL,HIGH
          format: sarif
          output: trivy-config-results.sarif
          exit-code: '0'

      - name: SARIF na aba Security
        uses: github/codeql-action/upload-sarif@1190a975f95ce23525efb6a3fc21ea29567c1b52 # v3.38.2
        if: always()
        with:
          sarif_file: trivy-config-results.sarif
          category: trivy-config
```

`.github/dependabot.yml`:

```yaml
version: 2

updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
      day: 'monday'
      time: '09:00'
      timezone: 'America/Sao_Paulo'
    open-pull-requests-limit: 10
    labels:
      - 'dependencies'
    commit-message:
      prefix: 'chore'
      prefix-development: 'chore'
      include: 'scope'
    # Dias de espera antes de propor uma versão nova (só version updates; os de segurança não esperam).
    cooldown:
      default-days: 7
      semver-major-days: 30
      semver-minor-days: 7
      semver-patch-days: 3
    # Minor e patch num PR por grupo; major isolado (fora dos grupos).
    groups:
      minor-e-patch:
        applies-to: version-updates
        update-types:
          - 'minor'
          - 'patch'

  - package-ecosystem: 'github-actions'
    directory: '/'
    schedule:
      interval: 'weekly'
      day: 'monday'
      time: '09:00'
      timezone: 'America/Sao_Paulo'
    open-pull-requests-limit: 10
    labels:
      - 'dependencies'
      - 'github-actions'
    commit-message:
      prefix: 'ci'
      include: 'scope'
    cooldown:
      default-days: 7
    groups:
      actions-minor-e-patch:
        applies-to: version-updates
        update-types:
          - 'minor'
          - 'patch'
```

- [ ] **Step 7: rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai && node --test scripts/*.test.mjs && /opt/homebrew/bin/actionlint; echo EXIT=$?
```

Expected: `# pass 13`, `# fail 0`, nenhuma linha do actionlint e `EXIT=0`.

- [ ] **Step 8: commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add .github scripts/salvaguardas.test.mjs && /usr/bin/git commit -m "ci: CI, E2E, release das lojas, publicação do core, Trivy e Dependabot do repo próprio"; echo EXIT=$?
```

### Tarefa B10: `CLAUDE.md` e `README.md` da raiz

**Files:**

- Create: `CLAUDE.md`, `README.md`

**Interfaces:**

- Consumes: tudo da B3 à B9 (nomes de scripts, workflows, environments, GHSA ignorados na B8).
- Produces: o guia transversal do repo (que o Claude Code carrega junto com o de cada workspace) e a página do repo no GitHub.

- [ ] **Step 1: `CLAUDE.md`**

Escreva `CLAUDE.md` com este conteúdo; na seção "Segurança de dependências", o bullet do `auditConfig.ignoreGhsas` lista os GHSA que a B8 ignorou, um por linha, com o motivo que está no `pnpm-workspace.yaml` (se a B8 não ignorou nenhum, escreva "nenhum hoje"); e, se a B4 precisou de `trustPolicyExclude`, acrescente o pacote e o motivo no bullet da `trustPolicy`.

```markdown
# CLAUDE.md

Guia do Claude Code para o repositório do **Botaí** (`github.com/PiluVitu/Botai`). Este arquivo cobre o que é transversal; cada workspace tem o seu `CLAUDE.md`, e o Claude Code carrega este junto com o do workspace em que você mexe. Cada fato mora num arquivo só.

| Workspace        | Pacote                                     | `CLAUDE.md`               | Cobre                                                                                                                                                                                       |
| ---------------- | ------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extensao/`      | `@pilutech/botai` (privado; vai às lojas)  | `extensao/CLAUDE.md`      | a extensão MV3 para Chrome, Edge, Opera e Firefox (WXT 0.21.4 + React 19 + `@piluvitu/ui`): atalho, popup, menu `Inserir`, aviso na página, 3 builds, zip de fontes da AMO, release e lojas |
| `site/`          | `@pilutech/botai-site` (privado; Vercel)   | `site/CLAUDE.md`          | a landing em `botai.pilutech.com.br` (Next 16): `/`, `/privacidade`, `/termos`, lojas de `lojas.json`, SEO, deploy                                                                          |
| `packages/core/` | `@pilutech/botai-core` (npm, público, MIT) | `packages/core/CLAUDE.md` | o motor: pessoa de teste, geradores de documento, classificador de campos, valor de cada campo, atalho; build e publicação no npm                                                           |

> **Regra de manutenção:** tecnologia nova ou fluxo mudado → atualize o `CLAUDE.md` do workspace onde mexeu (ou este, se for transversal).

## Origem e fronteira com o monorepo

- O repo saiu do monorepo `PiluVitu/PiluVitu-Dev` em 2026-10, pelo `git filter-repo`, com o histórico: spec `docs/superpowers/specs/2026-10-05-botai-repo-proprio-design.md`, contrato `docs/superpowers/plans/2026-10-05-botai-repo-proprio-contrato.md` (nomes, caminhos, versões e environments que cruzam as fases) e plano `docs/superpowers/plans/2026-10-05-botai-fase0-separacao.md`. O log começa no primeiro commit que tocou o Botaí; os PRs antigos aparecem como `PiluVitu/PiluVitu-Dev#NN`.
- Ficou no monorepo: o `@piluvitu/ui` (design system, publicado no npm; este repo o consome de lá), o card da PiluLabs e o selo da landing da PiluTech (o item `botai` do CMS do `apps/web`, com as URLs das lojas, que se atualiza junto com o `site/lojas.json` daqui) e o `/tools` do PiluVitu, que usa `@pilutech/botai-core` do npm com versão exata. Nenhum repo lê arquivo do outro.
- Cópias aceitas (código pequeno, dono do conceito no monorepo): `site/lib/{pilulabs,contato,ico}.ts`, `extensao/src/lib/entropia.ts`, `packages/core/src/prng.ts` e `scripts/check-tailwind-source.mjs`. Mudou lá, mude aqui.

## Stack

pnpm 11.1.1 (workspaces `extensao`, `site`, `packages/*`), Node 22 no CI (24.14.0 na reprodução da AMO e na publicação no npm), TypeScript strict, Tailwind CSS 4 + `@piluvitu/ui`, WXT 0.21.4 (Vite 7), Next 16, Jest 30 (core e site), Vitest 4 (extensão), Storybook 10 (extensão 6018, site 6019), Playwright 1.59.1.

## Segurança de dependências (spec §5.3)

- **pnpm ≥ 11** (`packageManager: pnpm@11.1.1`): script de instalação de dependência fica bloqueado; só os de `allowBuilds` rodam. Nunca `dangerouslyAllowAllBuilds`.
- **`minimumReleaseAge: 1440` sem `minimumReleaseAgeExclude`:** vale também para `@pilutech/*` e `@piluvitu/*` (uma conta do npm invadida não empurra versão nova para cá no mesmo dia). Com o valor explícito, o `minimumReleaseAgeStrict` liga: versão exata publicada há menos de 24 h faz o install falhar, em vez de cair para outra.
- **`trustPolicy: no-downgrade`** (pnpm ≥ 10.21.0): o install falha se uma versão nova perder a proveniência que as anteriores tinham. Exceção só em `trustPolicyExclude`, com o motivo comentado.
- **`blockExoticSubdeps: true`** (pnpm ≥ 10.26.0): só dependência direta vem de git ou tarball.
- **`scripts/salvaguardas.test.mjs`** (`node --test`, no `make test` e no job `dependencias` do CI) reprova o repo se uma dessas linhas sumir, se uma action de qualquer workflow perder o SHA, se o CI deixar de rodar `--frozen-lockfile`/`dedupe --check`/`audit`, se um ecossistema do Dependabot ficar sem `cooldown` ou se um workflow que roda `npm publish` sair do environment `npm`, tiver mais de um `id-token: write` ou publicar sem `--provenance`. Workflow e ecossistema novos entram sem mexer no teste, desde que cumpram isso.
- **CI:** `pnpm install --frozen-lockfile`, `pnpm dedupe --check` e `pnpm audit --audit-level high`. Advisory ignorado só em `auditConfig.ignoreGhsas` do `pnpm-workspace.yaml` (no pnpm 11.1.1; `pnpm audit --ignore <GHSA>` grava), com o motivo comentado ao lado. Hoje: `GHSA-g84c-rxfj-3j2c` (`webpack-dev-middleware` 6.x só no `storybook dev` do site; o `@storybook/builder-webpack5` exige `^6.1.2` e a correção é da 7.4.5).
- **Dependabot** (`.github/dependabot.yml`): npm e github-actions, semanal, `cooldown` (npm: 7 dias, major 30, minor 7, patch 3; actions: 7), minor e patch agrupados, major isolado. Nenhum merge automático. A doc do GitHub lista o pnpm até a v10: com o 11, não está confirmado que ele atualiza o lockfile.
- **Actions** fixadas por SHA com a versão em comentário (`uses: actions/checkout@<sha> # v4.4.0`), `permissions` mínimas por job, `persist-credentials: false`. Action nova entra fixada: `git ls-remote --tags https://github.com/<dono>/<action> '<tag>^{}'`.
- ⚠️ `pnpm update -r <pkg>` não mexe nas cópias transitivas quando `<pkg>` também é dependência direta de algum workspace (medido no monorepo): confira o resultado no `pnpm-lock.yaml`, não na saída do pnpm. E rode `pnpm dedupe --check` depois de qualquer bump.

## Fase 0: o `@piluvitu/ui` vem de um tarball local (temporário)

Até o `@piluvitu/ui` 0.1.0 estar no npm há 24 h, o `pnpm-workspace.yaml` tem `overrides: { '@piluvitu/ui': 'file:vendor/piluvitu-ui-0.1.0.tgz' }`, o tarball é versionado em `vendor/` e o zip de fontes da AMO o leva. Versionado de propósito: as tags `core-v0.1.0` a `core-v0.4.0` nascem em commits de antes do C4, e o `publicar-core.yml` instala no commit da tag. O passo C4 do plano da fase 0 tira o override, o `vendor/` e esta seção num commit só.

## Comandos

| Comando                     | O quê                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `make test`                 | todos os testes (`pnpm -r test` + `node --test scripts/*.test.mjs`)                     |
| `make lint`                 | `pnpm -r lint`                                                                          |
| `make stop`                 | libera as portas 3018, 6018, 3020 e 6019                                                |
| `make test-core`            | Jest + `node --test` do core (o pacote de verdade é montado e conferido)                |
| `make build-core`           | `dist/` do core (`.js` + `.d.ts`)                                                       |
| `make dev-botai`            | `wxt dev` na 3018 (carregar `extensao/.output/chrome-mv3-dev`)                          |
| `make build-botai`          | `wxt build` + gate do `@source` em `.output/chrome-mv3`                                 |
| `make test-botai`           | Vitest da extensão                                                                      |
| `make test-e2e-botai`       | builds de Chrome, Firefox e Opera + build e2e + Playwright com a extensão desempacotada |
| `make storybook-botai`      | Storybook da extensão na 6018                                                           |
| `make zip-botai`            | os 3 pacotes e o zip de fontes da AMO em `extensao/.output/`                            |
| `make versao-botai V=x.y.z` | PR de versão da extensão (branch da `origin/main`, bump sem tag, `gh pr create`)        |
| `make release-botai`        | na `main`, depois do merge: tag anotada `botai-v<versão>` + push                        |
| `make capturas-botai`       | imagens das lojas e cópias para o `site/` (rode no Mac)                                 |
| `make dev-botai-site`       | `next dev` na 3020                                                                      |
| `make build-botai-site`     | `next build` + gate do `@source` + conferência das rotas estáticas                      |
| `make test-botai-site`      | Jest + `node --test` do site                                                            |
| `make test-e2e-botai-site`  | 2 builds de produção (lojas de teste, depois o `lojas.json` real) + Playwright (`CI=1`) |
| `make storybook-botai-site` | Storybook do site na 6019                                                               |

Ordem antes de commit/PR: `make lint` → `make test` → `make build-botai` e `make build-botai-site`. O pre-commit (`.husky/pre-commit` → `pnpm exec lint-staged`) formata só o que está staged: Prettier na raiz e no core; ESLint + Prettier na `extensao/` e no `site/` (a config fica no `package.json` de cada um, porque o ESLint flat só resolve com o cwd do workspace). O `prepare` do husky também roda no install do revisor da AMO e, sem `.git`, só avisa e sai com 0.

## Gate do design system

O `@piluvitu/ui` vem do npm como `dist/` (ESM + `.d.ts`). O CSS de entrada de cada app faz `@import 'tailwindcss'`, `@import '@piluvitu/ui/styles.css'` e `@source '../node_modules/@piluvitu/ui/dist'` (relativo ao CSS; desde a 4.1.0 o Tailwind segue o symlink do pnpm num `@source`). Sem o `@source`, o Tailwind descarta em silêncio toda classe que só existe no pacote. `scripts/check-tailwind-source.mjs <pasta-ou-glob>` procura no CSS emitido a classe sentinela (`SENTINEL_SELECTOR` no script; o literal chega pelo comentário do `dist/cn.js`) e ignora `dev/`, `cache/` e `node_modules/` abaixo da pasta pedida. Amarrado no `build`, nunca no `dev`: extensão (`.output/<navegador>-mv3`, a pasta exata) e site (`.next`). Não escreva o nome da sentinela em `extensao/` nem em `site/`: o Tailwind geraria a classe sozinho e o gate deixaria de medir.

## Comentários: raros, e só onde o código não alcança (lei do projeto)

Comentário em código de **produção** é exceção. O teste é o lugar de explicar intenção e travar comportamento; produção é o lugar de o código falar por si. Escreva um comentário só quando as **três** forem verdadeiras: registra um **porquê** que o código não mostra (armadilha medida, divergência deliberada, limite de terceiro); sua ausência levaria alguém a "consertar" o código e quebrá-lo; e não cabe melhor num nome, num teste, num `CLAUDE.md` ou no commit. Tamanho: uma a três linhas; virou parágrafo, o fato vai para o `CLAUDE.md` do workspace. ⚠️ fica reservado para a armadilha que corrompe dado sem dar erro. Em teste, o comentário é livre.

## Colocation (lei do projeto)

Todo teste, story e E2E mora no mesmo diretório do fonte: `x.ts` → `x.test.ts`; `x.tsx` → `x.test.tsx` e `x.stories.tsx`; script `x.mjs` → `x.test.mjs` (`node --test`); E2E com `.e2e.ts` ao lado da rota ou do entrypoint. Ferramentas: Jest para lógica (core e site), Vitest na extensão (o WXT é Vite e traz o `fakeBrowser`), Storybook para componente visual, Playwright para fluxo crítico.

## Credenciais

| Credencial                | Onde fica                                                                                                                                | Nunca                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| npm                       | trusted publishing (OIDC) do `publicar-core.yml`; a 1ª publicação de cada pacote usou um token do dono só no shell local, apagado depois | no repo, em `.npmrc` versionado ou em log |
| Lojas (Chrome, AMO, Edge) | environment `lojas-botai` (secrets e variables); local, `extensao/.env.submit` (ignorado)                                                | no repo                                   |
| Vercel                    | integração Git da Vercel; variáveis no painel do projeto `botai-site`                                                                    | no repo                                   |

O `.env.example` da raiz lista os nomes; o `.gitignore` ignora `.env*` menos ele. O Trivy de segredos roda estrito no CI e falha o PR.

## CI/CD

| Workflow            | Gatilho                                                                                                           | Faz o quê                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`            | PR e push na `main`                                                                                               | `dependencias` (frozen lockfile, `dedupe --check`, `audit --audit-level high`, `node --test scripts/*.test.mjs`, actionlint), `core` (tsc sem DOM, Jest, build e conferência do pacote), `extensao` (lint, Vitest, builds de Chrome, Firefox e Opera com os gates, `web-ext lint`) e `site` (lint, tsc, Jest, `node --test`, build com o gate e as rotas estáticas) |
| `botai-e2e.yml`     | PR/push que toca `extensao/**`, `packages/core/**`, `pnpm-lock.yaml` ou o workflow; dispatch                      | Chromium do Playwright e o `test:e2e` da extensão                                                                                                                                                                                                                                                                                                                   |
| `botai-release.yml` | PR que toca a extensão, o core ou um arquivo do zip de fontes; tag `botai-v*`; dispatch (`lojas`, `adiar_chrome`) | `pacotes` (lint, Vitest, zips, `web-ext lint`, reprodução byte a byte do pacote do Firefox no Node 24.14.0), `release` (GitHub Release com `--latest=false`) e `lojas` (`wxt submit` atrás do environment `lojas-botai`); detalhes em `extensao/CLAUDE.md`, "Publicação"                                                                                            |
| `publicar-core.yml` | tag `core-v*`                                                                                                     | `pacote` (tag × versão e commit na `main`, lint, test, `pnpm pack`) e `publicar` (environment `npm`, `id-token: write`, Node 24.14.0: `npm publish <pasta extraída> --access public --provenance`); detalhes em `packages/core/CLAUDE.md`                                                                                                                           |
| `trivy.yml`         | PR, push na `main` e toda segunda                                                                                 | dependências e segredos (SARIF), segredos estrito (falha o PR) e configuração (SARIF)                                                                                                                                                                                                                                                                               |

**Environments** (Settings → Environments; revisor obrigatório = o dono, sem "Prevent self-review"):

- `lojas-botai` (branch `main` e tags `botai-v*`): secrets `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`; variables `BOTAI_CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `BOTAI_EDGE_PRODUCT_ID`.
- `npm` (tags `core-v*` e `playwright-v*`): sem secrets. No npmjs.com, o pacote tem o trusted publisher `PiluVitu` / `Botai` / `publicar-core.yml` / environment `npm`, e "Require two-factor authentication and disallow tokens".

O repo só aceita squash merge (por isso a versão e a tag da extensão são dois passos: `make versao-botai` e, depois do merge, `make release-botai`).

## Vercel

Projeto `botai-site`, Root Directory `site`, "Include files outside the root directory" ligado, domínio `botai.pilutech.com.br`. Detalhes e conferência em `site/CLAUDE.md`, "Deploy".
```

- [ ] **Step 2: `README.md`**

````markdown
# Botaí

Gerador de dados fake para formulários (CPF, CNPJ, CEP), da [PiluTech](https://pilutech.com.br). Gera uma pessoa brasileira de teste coerente (documentos com dígito verificador certo, CEP real com rua e cidade, celular com o DDD do CEP, cartão de teste da Stripe) e preenche o formulário da página.

- **Site:** https://botai.pilutech.com.br
- **Chrome e Edge:** [Chrome Web Store](https://chromewebstore.google.com/detail/bota%C3%AD/mblmjomopainbcdjipkdmioglamdinnc). Firefox e Opera: em revisão nas lojas.
- **Biblioteca:** [`@pilutech/botai-core`](https://www.npmjs.com/package/@pilutech/botai-core), o mesmo motor da extensão, para Node e navegador.

## O que tem aqui

| Pasta               | O quê                                                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `extensao/`         | a extensão para Chrome, Edge, Opera e Firefox (WXT + React 19); instalar e usar: [`extensao/README.md`](./extensao/README.md) |
| `site/`             | a landing em botai.pilutech.com.br (Next 16), com a política de privacidade e os termos de uso                                |
| `packages/core/`    | `@pilutech/botai-core`, publicado no npm: [`packages/core/README.md`](./packages/core/README.md)                              |
| `docs/superpowers/` | specs, planos, design e pesquisa                                                                                              |

## Desenvolvimento

Node 22 e pnpm 11 (`corepack enable` instala a versão de `package.json` > `packageManager`).

```sh
pnpm install
make test           # todos os testes
make build-botai    # extensão para Chrome em extensao/.output/chrome-mv3
make dev-botai-site # landing em http://localhost:3020
```

As regras e os comandos estão no [`CLAUDE.md`](./CLAUDE.md) e no de cada pasta.

## Cuidados

Os dados são fictícios, mas um CPF, um CNPJ ou um celular gerado pode pertencer a alguém de verdade, e a caixa de e-mail gerada é pública. Use só em localhost e em ambientes de teste ([termos de uso](https://botai.pilutech.com.br/termos)).

## Licença

MIT, © PiluTech ([`LICENSE`](./LICENSE)). Powered by [PiluTech](https://pilutech.com.br).
````

- [ ] **Step 3: Prettier no que o lint-staged não pegou**

A B3 commitou antes do husky existir, e o `lint-staged` da raiz não pega `.yml`. Formate a raiz, os workflows e o core de uma vez:

```bash
cd /Users/piluvitu/PILUTECH/Botai && ./node_modules/.bin/prettier --write package.json .prettierrc scripts packages/core/package.json packages/core/tsconfig.json packages/core/tsconfig.build.json packages/core/jest.config.ts packages/core/scripts packages/core/src/atalhos.ts packages/core/src/atalhos.test.ts packages/core/README.md packages/core/CLAUDE.md .github CLAUDE.md README.md && node --test scripts/*.test.mjs && /opt/homebrew/bin/actionlint && /usr/bin/git status --short; echo EXIT=$?
```

Expected: `# fail 0`, actionlint sem linha e `EXIT=0`; o `git status` lista o `CLAUDE.md`, o `README.md` e o que o Prettier reformatou.

- [ ] **Step 4: commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add -A CLAUDE.md README.md package.json .prettierrc scripts packages/core .github && /usr/bin/git status --short && /usr/bin/git commit -m "docs: CLAUDE.md e README da raiz do repo do Botaí"; echo EXIT=$?
```

### Tarefa B11: verificação local completa (num clone limpo, como o CI)

**Files:**

- Create: `/Users/piluvitu/PILUTECH/.botai-extracao/verificacao/` (clone descartável, apagado no fim)

**Interfaces:**

- Consumes: tudo da Parte B.
- Produces: prova local de install travado, lint, testes, builds com gates, Storybooks, E2E da extensão e do site, reprodução byte a byte do pacote do Firefox, actionlint e histórico sem segredo; a tag local `core-v0.1.0`. Depois desta tarefa, o workflow segue nas fases 1 a 3 (locais, sem push); a Parte C é do dono.

- [ ] **Step 1: clone limpo (o tarball vem versionado)**

```bash
rm -rf /Users/piluvitu/PILUTECH/.botai-extracao/verificacao && /usr/bin/git clone /Users/piluvitu/PILUTECH/Botai /Users/piluvitu/PILUTECH/.botai-extracao/verificacao && /bin/ls /Users/piluvitu/PILUTECH/.botai-extracao/verificacao/vendor/piluvitu-ui-0.1.0.tgz && cd /Users/piluvitu/PILUTECH/.botai-extracao/verificacao && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P install --frozen-lockfile && $P dedupe --check && $P audit --audit-level high; echo EXIT=$?
```

Expected: `EXIT=0` (o `ls` acha o tarball no clone: sem ele, o CI e o worktree da tag `core-v0.1.0` no C8 não instalariam).

- [ ] **Step 2: salvaguardas, lint e testes**

```bash
cd /Users/piluvitu/PILUTECH/.botai-extracao/verificacao && node --test scripts/*.test.mjs && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm -r lint && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm -r test; echo EXIT=$?
```

Expected: `EXIT=0`; core com 402 testes Jest e 8 `node --test`; extensão e site com os totais da B6 e da B7. Confira na saída do `pnpm -r` que os três workspaces (`@pilutech/botai-core`, `@pilutech/botai`, `@pilutech/botai-site`) aparecem no `lint` e no `test`: workspace sem o script some do recursivo em silêncio.

- [ ] **Step 3: builds com os gates e os Storybooks**

```bash
cd /Users/piluvitu/PILUTECH/.botai-extracao/verificacao && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @pilutech/botai-core run build && $P --filter @pilutech/botai run build && $P --filter @pilutech/botai run build:firefox && $P --filter @pilutech/botai run build:opera && $P --filter @pilutech/botai run lint:firefox && $P --filter @pilutech/botai run build-storybook > /dev/null && NEXT_TELEMETRY_DISABLED=1 $P --filter @pilutech/botai-site run build && $P --filter @pilutech/botai-site run build-storybook > /dev/null; echo EXIT=$?
```

Expected: `EXIT=0`, com os gates do `@source` em silêncio.

- [ ] **Step 4: E2E da extensão**

```bash
cd /Users/piluvitu/PILUTECH/.botai-extracao/verificacao/extensao && ./node_modules/.bin/playwright install chromium > /dev/null && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm run test:e2e > /Users/piluvitu/PILUTECH/.botai-extracao/e2e-extensao.txt 2>&1; echo EXIT=$?; tail -5 /Users/piluvitu/PILUTECH/.botai-extracao/e2e-extensao.txt
```

Expected: `EXIT=0` e todos os testes `passed`.

- [ ] **Step 5: E2E do site (porta 3020 livre)**

```bash
lsof -ti tcp:3020 -sTCP:LISTEN; cd /Users/piluvitu/PILUTECH/.botai-extracao/verificacao/site && ./node_modules/.bin/playwright install chromium > /dev/null && CI=1 /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm run test:e2e > /Users/piluvitu/PILUTECH/.botai-extracao/e2e-site.txt 2>&1; echo EXIT=$?; tail -5 /Users/piluvitu/PILUTECH/.botai-extracao/e2e-site.txt
```

Expected: o `lsof` não lista PID (se listar, rode `make stop` no monorepo e no repo novo antes); `EXIT=0`; as duas passadas (`lojas-publicadas.e2e.ts` com o arquivo de teste e o resto com o `lojas.json` real) verdes.

- [ ] **Step 6: zips e reprodução byte a byte do pacote do Firefox, no ambiente do revisor**

```bash
cd /Users/piluvitu/PILUTECH/.botai-extracao/verificacao && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm --filter @pilutech/botai run zip && unzip -l extensao/.output/botai-1.0.0-sources.zip > /Users/piluvitu/PILUTECH/.botai-extracao/fontes.txt && /usr/bin/grep -cE " (package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|scripts/check-tailwind-source\.mjs|vendor/piluvitu-ui-0\.1\.0\.tgz|extensao/SOURCE-CODE-REVIEW\.md|packages/core/src/pessoa\.ts)$" /Users/piluvitu/PILUTECH/.botai-extracao/fontes.txt; /usr/bin/grep -cE " (extensao/\.output|extensao/\.wxt|packages/core/dist|site/)|node_modules/" /Users/piluvitu/PILUTECH/.botai-extracao/fontes.txt
```

Expected: `8` (os oito arquivos obrigatórios estão no zip de fontes) e `0` (nada de build, de `node_modules` nem do site).

```bash
cd /Users/piluvitu/PILUTECH/.botai-extracao/verificacao && V=$(node -p "require('./extensao/package.json').version") && docker run --rm -v "$PWD:/repo:ro" node:24.14.0 bash /repo/extensao/scripts/reproduzir-fontes.sh "/repo/extensao/.output/botai-$V-sources.zip" "/repo/extensao/.output/botai-$V-firefox.zip"; echo EXIT=$?
```

Expected: `IDENTICO: botai-1.0.0-firefox.zip` e `EXIT=0`.

- [ ] **Step 7: actionlint, tag e histórico sem segredo**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /opt/homebrew/bin/actionlint && /usr/bin/git merge-base --is-ancestor botai-v1.0.0 main && /usr/bin/git cat-file -t botai-v1.0.0 && gitleaks git --log-opts="--all" --redact --report-format json --report-path /Users/piluvitu/PILUTECH/.botai-extracao/gitleaks-final.json /Users/piluvitu/PILUTECH/Botai; echo EXIT=$?
```

Expected: `tag`, "no leaks found" e `EXIT=0`. Com achado do gitleaks: **PARE** e reporte ao dono, como na B2.

- [ ] **Step 8: estado final e limpeza do clone**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git status --short && /usr/bin/git log --oneline -12 && /usr/bin/git remote -v && rm -rf /Users/piluvitu/PILUTECH/.botai-extracao/verificacao; echo EXIT=$?
```

Expected: `status` vazio, os commits da B3 à B10 no topo, nenhum remote e `EXIT=0`.

- [ ] **Step 9: tag local `core-v0.1.0` (sem push)**

O C8 empacota a 0.1.0 desta tag, e o dono só faz o push dela (contrato, "Branches e tags"): as fases 1 a 3 rodam em seguida e a `main` sai da 0.1.0.

```bash
cd /Users/piluvitu/PILUTECH/Botai && test "$(node -p "require('./packages/core/package.json').version")" = 0.1.0 && /usr/bin/git tag -a core-v0.1.0 -m "@pilutech/botai-core 0.1.0" && /usr/bin/git cat-file -t core-v0.1.0 && /usr/bin/git tag -l; echo EXIT=$?
```

Expected: `tag`, as tags `botai-v1.0.0` e `core-v0.1.0`, `EXIT=0`. A Parte B termina aqui. Segue a fase 1 (`docs/superpowers/plans/2026-10-05-botai-fase1-core-cli.md`), no mesmo repo local e sem push. Avise o dono: os passos C2 em diante são dele (o C4 só 24 h depois do C3).

---

## Parte C — pontos de confirmação do dono (fora do workflow)

Nada daqui roda sem o dono, na hora. Os comandos são para ele (ou para o Claude, a pedido dele na conversa). A ordem importa: C1 vem antes da B1; C2 e C3 depois da Parte A; C4 só 24 h depois do C3; C5 em diante depois do C4. Quando a Parte C começa, a `main` local do repo novo já pode ter as fases 1 a 3 (o workflow as roda logo depois da B11): por isso o C8 empacota a 0.1.0 da tag `core-v0.1.0`, nunca da `main`, e as tags das fases (`core-v0.2.0` a `core-v0.4.0`, `playwright-v0.1.0`) só sobem depois do C8, na ordem do contrato ("Ordem de execução").

### C0. Antes de tudo (uma vez)

- 2FA na conta do npm: `npm profile get` mostra `two-factor auth: auth-and-writes`; senão, `npm profile enable-2fa auth-and-writes`.
- A organização `pilutech` existe no npm (spec §10.1) e o escopo `@piluvitu` é o do usuário `piluvitu`.
- No GitHub, o app da Vercel precisa enxergar o repo novo quando ele existir (Settings → Applications → Vercel → Repository access): é pré-requisito do C9.

### C1. Merge do PR de docs (contrato, ponto 1) — antes da B1

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && git switch docs/botai-repo-proprio
git add docs/superpowers/specs/2026-10-05-botai-repo-proprio-design.md docs/superpowers/plans/2026-10-05-botai-repo-proprio-contrato.md docs/superpowers/plans/2026-10-05-botai-fase0-separacao.md docs/superpowers/plans/2026-10-05-botai-fase1-core-cli.md docs/superpowers/plans/2026-10-05-botai-fase2-servidor.md docs/superpowers/plans/2026-10-05-botai-fase3-playwright.md
git commit -m "docs(botai): contrato e planos das fases 0 a 3 do repo próprio"
git status --short
git push -u origin docs/botai-repo-proprio
gh pr create --base main --head docs/botai-repo-proprio --title "docs(botai): repo próprio — spec, contrato e planos das fases 0 a 3" --body "Spec, contrato e planos das fases 0 a 3 do Botaí em repo próprio (PiluVitu/Botai). Só documentação; a extração (fase 0, Parte B) leva estes arquivos junto."
gh pr checks docs/botai-repo-proprio --watch
gh pr merge docs/botai-repo-proprio --squash --delete-branch
```

O `git status` tem de sair vazio antes do push (spec, contrato e os quatro planos commitados). CI verde basta (regra do dono).

### C2. PR `feat/ui-npm` e o environment `npm` do monorepo

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/ui-npm && git push -u origin feat/ui-npm
gh pr create --base main --head feat/ui-npm --title "feat(ui): @piluvitu/ui publicável no npm, publicação por tag e salvaguardas de dependência" --body "Build ESM + .d.ts por subpath só para o npm (publishConfig do pnpm; os apps seguem no código-fonte), conferência do pacote em teste, publicar-ui.yml (tag ui-v*, environment npm, trusted publishing com proveniência), trustPolicy, blockExoticSubdeps, cooldown do Dependabot, dedupe --check no CI e actions fixadas por SHA. Plano: docs/superpowers/plans/2026-10-05-botai-fase0-separacao.md, Parte A."
gh pr checks feat/ui-npm --watch
gh pr merge feat/ui-npm --squash --delete-branch
```

**Desvio da spec a confirmar no PR:** a spec §5.3 pede `pnpm audit --audit-level high` no CI dos dois repos. No monorepo ele fica fora deste PR, porque em 2026-10-05 achava 17 advisories high (o `sharp` entre eles, que o Next usa em runtime, então ignorar não é decisão do workflow). O dono escolhe: aceitar o desvio até um PR de remediação (registrado no `CLAUDE.md` da raiz pela A4), ou pedir a remediação antes do merge.

O environment, antes de qualquer tag `ui-v*` (um workflow que cita um environment inexistente o cria sem proteção):

```bash
DONO=$(gh api users/PiluVitu --jq .id)
gh api -X PUT repos/PiluVitu/PiluVitu-Dev/environments/npm --input - <<EOF
{"prevent_self_review": false, "reviewers": [{"type": "User", "id": $DONO}], "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
EOF
gh api -X POST repos/PiluVitu/PiluVitu-Dev/environments/npm/deployment-branch-policies -f name='ui-v*' -f type=tag
```

### C3. Primeira publicação do `@piluvitu/ui` 0.1.0 (contrato, ponto 2)

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && git switch main && git pull --ff-only && pnpm install --frozen-lockfile
PUB=$(mktemp -d)
pnpm --filter @piluvitu/ui pack --pack-destination "$PUB"
tar -tzf "$PUB/piluvitu-ui-0.1.0.tgz" | sort
```

Confira a lista: `package/LICENSE`, `package/README.md`, `package/package.json` e `package/dist/…` (18 `.js`, 18 `.d.ts` e o `styles.css`), nada além.

Token: npmjs.com → Access Tokens → Generate New Token → Granular, expiração de 1 dia, "Read and write" só no escopo `@piluvitu`. Ele fica só nesta sessão do shell (o `.npmrc` temporário guarda `${NPM_TOKEN}`, não o valor):

```bash
read -rs NPM_TOKEN && export NPM_TOKEN
printf '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n' > "$PUB/.npmrc"
npm publish "$PUB/piluvitu-ui-0.1.0.tgz" --access public --userconfig "$PUB/.npmrc"
rm -rf "$PUB"; unset NPM_TOKEN
npm view @piluvitu/ui@0.1.0 version
```

Se o npm pedir o código do 2FA, repita o `npm publish` com `--otp <código>`. Depois:

1. npmjs.com → `@piluvitu/ui` → Settings → Trusted publisher → GitHub Actions: `PiluVitu` / `PiluVitu-Dev` / `publicar-ui.yml` / environment `npm`.
2. Na mesma página: "Require two-factor authentication and disallow tokens".
3. Access Tokens: revogue o token.
4. Tag de registro: `git tag -a ui-v0.1.0 -m "@piluvitu/ui 0.1.0" && git push origin ui-v0.1.0`. O job `pacote` roda (prova o workflow); quando o `publicar` pedir aprovação, **rejeite** (a 0.1.0 já está no npm).

Anote a hora da publicação: o C4 espera 24 h a partir dela.

### C4. (24 h depois do C3) O repo do Botaí passa a usar o `@piluvitu/ui` do npm

Local, sem push; o Claude pode rodar a pedido do dono.

```bash
npm view @piluvitu/ui time --json | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const t=JSON.parse(s)["0.1.0"];const h=(Date.now()-Date.parse(t))/36e5;console.log(t,h.toFixed(1)+" h");process.exit(h>=24?0:1)})'; echo EXIT=$?
```

Com `EXIT=1`, espere. Com `EXIT=0`:

```bash
cd /Users/piluvitu/PILUTECH/Botai && perl -0pi -e 's/\n# Até o \@piluvitu\/ui 0\.1\.0 estar no npm há 24 h[^\n]*\noverrides:\n  .\@piluvitu\/ui.: .file:vendor\/piluvitu-ui-0\.1\.0\.tgz.\n//' pnpm-workspace.yaml && perl -0pi -e "s/\n      \/\/ Sai junto com o overrides[^\n]*\n      'vendor\/piluvitu-ui-0\.1\.0\.tgz',//" extensao/wxt.config.ts && perl -0pi -e 's/;\n- `vendor\/piluvitu-ui-0\.1\.0\.tgz`:[^\n]*\n/.\n/' extensao/SOURCE-CODE-REVIEW.md && perl -pi -e 's/; até o passo C4 do plano da fase 0, também `vendor\/piluvitu-ui-0\.1\.0\.tgz`//' extensao/CLAUDE.md && perl -0pi -e 's/## Fase 0: o `\@piluvitu\/ui` vem de um tarball local \(temporário\)\n\n[^\n]*\n\n//' CLAUDE.md && /usr/bin/git rm -r -q vendor && /usr/bin/git grep -n "vendor/piluvitu\|overrides:" -- . ':!docs' ':!pnpm-lock.yaml'; echo EXIT=$?
```

Expected: o `git grep` não acha nada (`EXIT=1`).

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm install && pnpm install --frozen-lockfile && pnpm dedupe --check && pnpm audit --audit-level high && /usr/bin/grep -c "vendor" pnpm-lock.yaml; /usr/bin/grep -n "'@piluvitu/ui@0.1.0'" pnpm-lock.yaml | head -2
```

Expected: `0` ocorrências de `vendor` e a entrada `'@piluvitu/ui@0.1.0'` vinda do registry (com `integrity`). Depois, repita a B11 do Step 1 ao Step 7 (no Step 1, sem o `ls` do tarball, que saiu; no Step 6, a contagem de arquivos obrigatórios do zip de fontes cai para `7`, sem o `vendor/`); a reprodução do pacote do Firefox agora baixa o `@piluvitu/ui` do npm, como o revisor da AMO. Com as fases 1 a 3 já na `main`, rode também o `make test` da raiz. Verde:

```bash
cd /Users/piluvitu/PILUTECH/Botai && git add pnpm-workspace.yaml pnpm-lock.yaml extensao/wxt.config.ts extensao/SOURCE-CODE-REVIEW.md extensao/CLAUDE.md CLAUDE.md && git status --short && git commit -m "build: @piluvitu/ui 0.1.0 do npm no lugar do tarball versionado"
```

O `git status` mostra o `vendor/piluvitu-ui-0.1.0.tgz` como apagado (o `git rm` já o pôs no índice). O tarball segue no histórico, nos commits das tags `core-v0.1.0` a `core-v0.4.0`, que é o que o `publicar-core.yml` instala.

### C5. Criar `PiluVitu/Botai` e o primeiro push (contrato, ponto 3)

```bash
cd /Users/piluvitu/PILUTECH/Botai
gh repo create PiluVitu/Botai --public --description "Botaí: gerador de dados fake para formulários (CPF, CNPJ, CEP). Extensão, landing e @pilutech/botai-core." --homepage https://botai.pilutech.com.br --disable-wiki
gh api -X PATCH repos/PiluVitu/Botai -F allow_merge_commit=false -F allow_rebase_merge=false -F allow_squash_merge=true -F delete_branch_on_merge=true
gh api -X PATCH repos/PiluVitu/Botai -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
gh api -X PUT repos/PiluVitu/Botai/vulnerability-alerts
DONO=$(gh api users/PiluVitu --jq .id)
for amb in lojas-botai npm; do
gh api -X PUT "repos/PiluVitu/Botai/environments/$amb" --input - <<EOF
{"prevent_self_review": false, "reviewers": [{"type": "User", "id": $DONO}], "deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
EOF
done
gh api -X POST repos/PiluVitu/Botai/environments/lojas-botai/deployment-branch-policies -f name=main -f type=branch
gh api -X POST repos/PiluVitu/Botai/environments/lojas-botai/deployment-branch-policies -f name='botai-v*' -f type=tag
gh api -X POST repos/PiluVitu/Botai/environments/npm/deployment-branch-policies -f name='core-v*' -f type=tag
gh api -X POST repos/PiluVitu/Botai/environments/npm/deployment-branch-policies -f name='playwright-v*' -f type=tag
git remote add origin git@github.com:PiluVitu/Botai.git
git push -u origin main
gh run list --repo PiluVitu/Botai --branch main --limit 5
```

Espere o `CI`, o `Trivy` e o `Botaí E2E` verdes (`gh run watch <id> --repo PiluVitu/Botai`). A tag da 1.0.0 sobe com o Actions desligado: na tag, o `botai-release.yml` é o da época (caminhos do monorepo) e só falharia:

```bash
gh api -X PUT repos/PiluVitu/Botai/actions/permissions -F enabled=false
git push origin botai-v1.0.0
gh api -X PUT repos/PiluVitu/Botai/actions/permissions -F enabled=true -f allowed_actions=all
```

Rollback deste passo: `gh repo delete PiluVitu/Botai --yes` (nada mais depende dele até o C8).

### C6. Environment `lojas-botai`: secrets e variables (contrato, ponto 6)

No monorepo o environment não tinha nenhum (a 1.0.0 foi enviada à mão). Cadastre quando for usar o `wxt submit` (o `--dry-run` autentica de verdade):

```bash
jq -r .private_key chave.json | gh secret set CHROME_SERVICE_ACCOUNT_PRIVATE_KEY --env lojas-botai --repo PiluVitu/Botai
gh secret set FIREFOX_JWT_ISSUER --env lojas-botai --repo PiluVitu/Botai
gh secret set FIREFOX_JWT_SECRET --env lojas-botai --repo PiluVitu/Botai
gh secret set EDGE_CLIENT_ID --env lojas-botai --repo PiluVitu/Botai
gh secret set EDGE_API_KEY --env lojas-botai --repo PiluVitu/Botai
gh variable set BOTAI_CHROME_EXTENSION_ID --env lojas-botai --repo PiluVitu/Botai --body "mblmjomopainbcdjipkdmioglamdinnc"
gh variable set CHROME_PUBLISHER_ID --env lojas-botai --repo PiluVitu/Botai
gh variable set CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL --env lojas-botai --repo PiluVitu/Botai
gh variable set BOTAI_EDGE_PRODUCT_ID --env lojas-botai --repo PiluVitu/Botai
gh workflow run botai-release.yml --repo PiluVitu/Botai --ref main -f lojas=dry-run
```

`gh secret set` e `gh variable set` sem `--body` pedem o valor no terminal (nada fica no histórico do shell). O passo a passo de onde tirar cada valor está em `extensao/README.md`, "Publicação". Aprove o job `lojas` do dry-run e confira `::notice::dry-run: …` com as lojas cadastradas. Apague a `chave.json` local depois.

### C7. Release 1.0.0 no repo novo

```bash
D=$(mktemp -d)
gh release download botai-v1.0.0 --repo PiluVitu/PiluVitu-Dev --dir "$D"
{ echo "Os mesmos 4 zips do release original, no monorepo: https://github.com/PiluVitu/PiluVitu-Dev/releases/tag/botai-v1.0.0 (os commits e PRs citados abaixo são de lá)."; echo; gh release view botai-v1.0.0 --repo PiluVitu/PiluVitu-Dev --json body --jq .body; } > "$D/notas.md"
ls "$D"
gh release create botai-v1.0.0 --repo PiluVitu/Botai --verify-tag --latest=false --title "Botaí 1.0.0" --notes-file "$D/notas.md" "$D/botai-1.0.0-chrome.zip" "$D/botai-1.0.0-firefox.zip" "$D/botai-1.0.0-opera.zip" "$D/botai-1.0.0-sources.zip"
rm -rf "$D"
```

O release antigo fica no monorepo (spec §4.2). `--latest=false`, como todo release da extensão daqui.

### C8. Primeira publicação do `@pilutech/botai-core` 0.1.0 (contrato, ponto 4)

A 0.1.0 sai da tag local `core-v0.1.0` (B11), num worktree: a `main` pode já estar na 0.4.0 com as fases 1 a 3.

```bash
cd /Users/piluvitu/PILUTECH/Botai && git cat-file -t core-v0.1.0
PUB=$(mktemp -d)
git worktree add --detach "$PUB/fonte" core-v0.1.0
cd "$PUB/fonte" && pnpm install --frozen-lockfile && node -p "require('./packages/core/package.json').version"
pnpm --filter @pilutech/botai-core pack --pack-destination "$PUB"
tar -tzf "$PUB/pilutech-botai-core-0.1.0.tgz" | sort
```

Confira: `tag`, a versão `0.1.0`, e no tarball `package/LICENSE`, `package/README.md`, `package/package.json` e `package/dist/…` (19 `.js` e 19 `.d.ts`). Token granular de 1 dia, "Read and write" só na organização `pilutech`:

```bash
read -rs NPM_TOKEN && export NPM_TOKEN
printf '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n' > "$PUB/.npmrc"
npm publish "$PUB/pilutech-botai-core-0.1.0.tgz" --access public --userconfig "$PUB/.npmrc"
unset NPM_TOKEN; cd /Users/piluvitu/PILUTECH/Botai && git worktree remove --force "$PUB/fonte" && rm -rf "$PUB"
npm view @pilutech/botai-core@0.1.0 version
```

Depois: trusted publisher no npmjs.com (`PiluVitu` / `Botai` / `publicar-core.yml` / environment `npm`), "Require two-factor authentication and disallow tokens", token revogado, e o push da tag de registro, que já existe: `git push origin core-v0.1.0` (o job `pacote` roda no commit da tag, com o `vendor/` versionado; rejeite a aprovação do `publicar`). Anote a hora: a Parte D espera 24 h a partir dela. Com o trusted publisher configurado, seguem os passos do dono das fases 1, 2 e 3 (contrato, pontos 9, 10 e 8).

### C9. Religar o projeto `botai-site` da Vercel (contrato, ponto 5)

Guardar o estado de hoje (para o rollback) e trocar o repo e a Root Directory:

```bash
cd /Users/piluvitu/PILUTECH/Botai
vercel link --yes --project botai-site
vercel api /v9/projects/botai-site --raw > /Users/piluvitu/PILUTECH/.botai-extracao/vercel-botai-site-antes.json
vercel ls botai-site --prod
vercel git disconnect
vercel git connect https://github.com/PiluVitu/Botai.git
vercel api /v9/projects/botai-site -X PATCH -f rootDirectory=site -F sourceFilesOutsideRootDirectory=true --raw > /dev/null
vercel api /v9/projects/botai-site --raw | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const p=JSON.parse(s);console.log(p.rootDirectory,p.sourceFilesOutsideRootDirectory,p.link&&p.link.repo,p.nodeVersion)})'
```

Anote a URL da produção atual (linha do `vercel ls --prod`). Expected da última linha: `site true Botai 22.x`.

Primeira produção pelo repo novo, de um clone limpo (o `vercel deploy` sobe a pasta local; um clone limpo não leva `node_modules` nem builds):

```bash
D=$(mktemp -d) && git clone --depth 1 https://github.com/PiluVitu/Botai.git "$D/botai" && cd "$D/botai" && vercel link --yes --project botai-site && vercel deploy
curl -sI https://<url-do-preview> | grep -i x-robots-tag
vercel promote <url-do-preview> --yes
curl -sI https://botai.pilutech.com.br | head -1
curl -sI https://botai.pilutech.com.br/privacidade | head -1
curl -sI https://botai.pilutech.com.br/termos | head -1
curl -s https://botai.pilutech.com.br | grep -o '<link rel="canonical"[^>]*>'
curl -s https://botai.pilutech.com.br/sitemap.xml | grep -c '<loc>'
```

Expected: `x-robots-tag: noindex` no preview; `HTTP/2 200` nas três rotas, sem `noindex`; canonical `https://botai.pilutech.com.br`; `3` no sitemap. Confira no navegador que os botões das lojas são os de antes (só a Chrome Web Store) e que o favicon aparece.

Rollback: `vercel rollback <url-da-produção-anterior> --yes`, `vercel git disconnect`, `vercel git connect https://github.com/PiluVitu/PiluVitu-Dev.git` e `vercel api /v9/projects/botai-site -X PATCH -f rootDirectory=apps/botai-site --raw`.

### C10. Lojas: o link do código-fonte

Nos painéis da Chrome Web Store, da AMO, do Edge e do Opera, troque o "Código aberto (licença MIT)" da descrição pelo texto atual de `extensao/loja/textos.md` (`https://github.com/PiluVitu/Botai`), na próxima edição da listagem. Na AMO, a próxima versão sobe o `botai-<versão>-sources.zip` novo (com `extensao/SOURCE-CODE-REVIEW.md`) e a nota AMO de `extensao/loja/notas-revisores.md`.

### C11. Limpeza (depois do C5 com CI verde e do C9 conferido)

```bash
rm -rf /Users/piluvitu/PILUTECH/.botai-extracao
cd /Users/piluvitu/WWW/PiluVitu-Dev && git worktree remove .worktrees/ui-npm && git branch -D feat/ui-npm
```

### C12. (24 h depois do C8) Parte D e o merge dela (contrato, ponto 7)

Rode a Parte D (ela confere as 24 h). Depois:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && git push -u origin chore/botai-sai-do-monorepo
gh pr create --base main --head chore/botai-sai-do-monorepo --title "chore: o Botaí sai do monorepo (agora mora em PiluVitu/Botai)" --body "Saem apps/botai, apps/botai-site, os módulos do Botaí do packages/tools, os workflows botai-*, os jobs do CI, os alvos do Makefile e os docs do Botaí. O /tools passa a usar @pilutech/botai-core 0.1.0 do npm (versão exata). Plano: PiluVitu/Botai, docs/superpowers/plans/2026-10-05-botai-fase0-separacao.md, Parte D."
gh pr checks chore/botai-sai-do-monorepo --watch
gh pr merge chore/botai-sai-do-monorepo --squash --delete-branch
cd /Users/piluvitu/WWW/PiluVitu-Dev && git worktree remove .worktrees/botai-sai && git branch -D chore/botai-sai-do-monorepo
```

Confira depois do merge: `https://piluvitu.com.br/tools/cpf` gera e valida CPF; o card do Botaí em `https://piluvitu.com.br/pilulabs` aponta o repo novo.

---

## Parte D — o Botaí sai do monorepo (branch `chore/botai-sai-do-monorepo`; só 24 h depois do C8)

Tudo no worktree `/Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai`. Sem push: o PR é o C12. Pronto quando: nenhum arquivo do Botaí no monorepo (fora o item do CMS e o ícone fixo do card) e lint, testes e builds verdes.

### Tarefa D1: o `/tools` usa o `@pilutech/botai-core` do npm

**Files:**

- Create: `apps/web/package-json.test.ts`
- Modify: `apps/web/package.json`, `apps/web/components/tools/cpf-tool.tsx`, `apps/web/components/tools/cnpj-tool.tsx`, `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `@pilutech/botai-core@0.1.0` no npm (`/cpf`: `gerarCPF(rng?, uf?)`, `validarCPF(valor)`; `/cnpj`: `gerarCNPJ(rng?)`, `validarCNPJ(valor)`).
- Produces: `apps/web` com `"@pilutech/botai-core": "0.1.0"` (versão exata) e sem import de `@piluvitu/tools/cpf` e `/cnpj`.

- [ ] **Step 1: pré-condição — o core está no npm há 24 h**

```bash
npm view @pilutech/botai-core time --json | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const t=JSON.parse(s)["0.1.0"];const h=(Date.now()-Date.parse(t))/36e5;console.log(t,h.toFixed(1)+" h");process.exit(h>=24?0:1)})'; echo EXIT=$?
```

Expected: `EXIT=0`. Com `EXIT=1`, **PARE**: o `minimumReleaseAge` recusaria o install (de propósito).

- [ ] **Step 2: worktree e install**

```bash
/usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev fetch origin main && /usr/bin/git -C /Users/piluvitu/WWW/PiluVitu-Dev worktree add /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai -b chore/botai-sai-do-monorepo origin/main && cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm install --frozen-lockfile; echo EXIT=$?
```

Expected: `EXIT=0`.

- [ ] **Step 3: teste que falha**

`apps/web/package-json.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PACOTE = JSON.parse(
  readFileSync(join(__dirname, 'package.json'), 'utf8'),
) as { dependencies: Record<string, string> }

describe('package.json do web', () => {
  // Versão exata: uma 0.1.x nova (de uma conta do npm invadida, por exemplo) não entra sem PR.
  it('usa o @pilutech/botai-core do npm com versão exata', () => {
    expect(PACOTE.dependencies['@pilutech/botai-core']).toMatch(
      /^\d+\.\d+\.\d+$/,
    )
  })

  // CPF e CNPJ do /tools vêm do motor do Botaí; o @piluvitu/tools não tem mais esses módulos.
  it.each([
    ['cpf-tool.tsx', 'cpf'],
    ['cnpj-tool.tsx', 'cnpj'],
  ])('%s importa do @pilutech/botai-core', (arquivo, modulo) => {
    const fonte = readFileSync(
      join(__dirname, 'components', 'tools', arquivo),
      'utf8',
    )
    expect(fonte).toContain(`from '@pilutech/botai-core/${modulo}'`)
    expect(fonte).not.toContain('@piluvitu/tools')
  })
})
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai/apps/web && ./node_modules/.bin/jest package-json.test.ts; echo EXIT=$?
```

Expected: os 3 testes falham; `EXIT=1`.

- [ ] **Step 4: dependência exata e imports**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm --filter @piluvitu/web add -E @pilutech/botai-core@0.1.0 && perl -pi -e "s{'\@piluvitu/tools/cpf'}{'\@pilutech/botai-core/cpf'}" apps/web/components/tools/cpf-tool.tsx && perl -pi -e "s{'\@piluvitu/tools/cnpj'}{'\@pilutech/botai-core/cnpj'}" apps/web/components/tools/cnpj-tool.tsx && /usr/bin/grep -n "botai-core" apps/web/package.json apps/web/components/tools/cpf-tool.tsx apps/web/components/tools/cnpj-tool.tsx; echo EXIT=$?
```

Expected: `"@pilutech/botai-core": "0.1.0"` e os dois imports; `EXIT=0`.

- [ ] **Step 5: passa, e o resto do web também**

Nenhum teste Jest do web importa os componentes do `/tools` (o ESM do pacote só chega ao webpack/Turbopack, que o resolvem):

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git grep -ln "cpf-tool\|cnpj-tool" -- 'apps/web/**/*.test.ts' 'apps/web/**/*.test.tsx'; cd apps/web && ./node_modules/.bin/jest package-json.test.ts && ./node_modules/.bin/jest && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint .; echo EXIT=$?
```

Expected: o `git grep` não lista arquivo; `EXIT=0`.

- [ ] **Step 6: E2E do `/tools` (porta 3333 livre)**

```bash
lsof -ti tcp:3333 -sTCP:LISTEN; cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai/apps/web && CI=1 ./node_modules/.bin/playwright test '\(site\)/tools/tools' --retries=0; echo EXIT=$?
```

Expected: o `lsof` não lista PID; os testes de CPF e CNPJ passam; `EXIT=0`.

- [ ] **Step 7: commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git add apps/web/package.json apps/web/package-json.test.ts apps/web/components/tools/cpf-tool.tsx apps/web/components/tools/cnpj-tool.tsx pnpm-lock.yaml && /usr/bin/git commit -m "feat(web): CPF e CNPJ do /tools pelo @pilutech/botai-core do npm (versão exata)"; echo EXIT=$?
```

### Tarefa D2: saem os apps, os workflows, os jobs e os alvos do Botaí

**Files:**

- Delete: `apps/botai/`, `apps/botai-site/`, `.github/workflows/botai-e2e.yml`, `.github/workflows/botai-release.yml`
- Modify: `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.github/workflows/ci.yml`, `Makefile`, `.gitignore`

**Interfaces:**

- Consumes: D1.
- Produces: workspace sem `apps/botai` e `apps/botai-site`; CI com os jobs `web`, `financas`, `ramielle`, `promeia` e `pilutech-site`; Makefile sem `*-botai` e `*-botai-site`.

- [ ] **Step 1: apagar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git rm -r -q apps/botai apps/botai-site .github/workflows/botai-e2e.yml .github/workflows/botai-release.yml && perl -ni -e "print unless m{^  - 'apps/botai(-site)?'\$}" pnpm-workspace.yaml && perl -0pi -e 's/\n  botai:\n.*?(?=\n  pilutech-site:\n)//s' .github/workflows/ci.yml && perl -0pi -e 's/^        dev-botai build-botai[^\n]*\n//m; s/^        dev-botai-site [^\n]*\n//m; s/# --- botai \(extensão.*?(?=# --- pilutech-site)//s; s/3333 6017 3018 6018 3020 6019 3021 6020/3333 6017 3021 6020/' Makefile && perl -0pi -e 's/# Botaí \(extensão WXT\).*?# Landing da PiluTech: mesmo motivo/# Landing da PiluTech: o storybook-static traz CSS compilado, e o Tailwind o varreria (o gate passaria sem medir nada)/s' .gitignore && /usr/bin/git grep -n "botai" -- pnpm-workspace.yaml Makefile .gitignore .github; echo EXIT=$?
```

Expected: o `git grep` só lista as linhas do job `pilutech-site` do `ci.yml` que falam do YAML do Botaí no CMS (`apps/web/content/pilulabs/botai/index.yaml`), que ficam; `EXIT=0`.

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/grep -nE "^  [a-z-]+:$" .github/workflows/ci.yml && /usr/bin/grep -n "^\.PHONY" -A10 Makefile | head -12 && /opt/homebrew/bin/actionlint; echo EXIT=$?
```

Expected: além do `push:` do bloco `on:`, os jobs `web`, `financas`, `ramielle`, `promeia` e `pilutech-site`; o `.PHONY` sem nenhum `*-botai`; actionlint sem erro; `EXIT=0`.

- [ ] **Step 2: lockfile sem os importadores do Botaí**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P install && $P install --frozen-lockfile && $P dedupe --check && /usr/bin/grep -cE "^  apps/botai" pnpm-lock.yaml; echo EXIT=$?
```

Expected: `0` importadores `apps/botai*` (o `EXIT=1` final é do `grep -c` com zero; o resto passou antes dele).

- [ ] **Step 3: o monorepo sem o Botaí segue verde**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P -r lint && $P -r test && $P --filter @pilutech/site run build && $P --filter @piluvitu/financas-web run build; echo EXIT=$?
```

Expected: `EXIT=0` (o `packages/tools` ainda tem os módulos do Botaí aqui; eles saem na D3).

- [ ] **Step 4: commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git add -A apps .github pnpm-workspace.yaml pnpm-lock.yaml Makefile .gitignore && /usr/bin/git commit -m "chore: o Botaí sai do monorepo (apps, workflows, jobs do CI, Makefile e workspace)"; echo EXIT=$?
```

### Tarefa D3: `packages/tools` sem os módulos do Botaí

**Files:**

- Delete: `packages/tools/src/{aleatorio,uf,cpf,cnpj,rg,pis,titulo-eleitor,celular,nascimento,senha,nome,endereco,empresa,cartao,pessoa,campos,campos-formatar}.ts` e os `.test.ts` deles, `packages/tools/src/rng-teste.ts`
- Modify: `packages/tools/package.json`, `packages/tools/src/index.ts`, `packages/tools/src/pilulabs.ts`, `packages/tools/CLAUDE.md`
- Test: `packages/tools/src/pilulabs.test.ts`

**Interfaces:**

- Consumes: D2 (nenhum app do monorepo importa mais esses módulos).
- Produces: `@piluvitu/tools/pilulabs` exportando só `LOJAS`, `TIPOS`, `TIPO_PADRAO`, `ehHttps`, `ehUrlDaLoja`, `ehDataValida`, `lojasPublicadas`, `fase`, `urlsDasLojas` (e os tipos `Loja`, `TipoItem`, `Fase`, `UrlsDasLojas`, `LojaPublicada`); `prng`, `entropy`, `contato` e `ico` ficam.

- [ ] **Step 1: teste que falha (o atalho saiu daqui)**

Em `packages/tools/src/pilulabs.test.ts`:

1. No import do topo, tire `ATALHOS,`, `TECLAS_DO_MANIFESTO,` e `teclaNoMac,`.
2. Apague os blocos inteiros `// É o suggested_key do manifesto do Botaí (apps/botai/wxt.config.ts).` + `describe('TECLAS_DO_MANIFESTO', …)`, `describe('teclaNoMac', …)` e `describe('ATALHOS', …)` (vão até o `describe('urlsDasLojas'`, que fica).

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai/packages/tools && perl -0pi -e "s/^  (ATALHOS|TECLAS_DO_MANIFESTO|teclaNoMac),\n//mg; s{// É o suggested_key do manifesto do Botaí \(apps/botai/wxt\.config\.ts\)\.\n.*?(?=describe\('urlsDasLojas')}{}s" src/pilulabs.test.ts && /usr/bin/grep -cE "ATALHOS|TECLAS_DO_MANIFESTO|teclaNoMac" src/pilulabs.test.ts; echo EXIT=$?
```

Expected: `0` e `EXIT=1` (o `grep -c` sem achado).

3. No fim do arquivo, acrescente:

```ts
// O atalho da extensão mora no @pilutech/botai-core/atalhos, no repo do Botaí.
describe('o que o módulo exporta', () => {
  it('só as regras do catálogo e das lojas', async () => {
    expect(Object.keys(await import('./pilulabs')).sort()).toEqual([
      'LOJAS',
      'TIPOS',
      'TIPO_PADRAO',
      'ehDataValida',
      'ehHttps',
      'ehUrlDaLoja',
      'fase',
      'lojasPublicadas',
      'urlsDasLojas',
    ])
  })
})
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai/packages/tools && ./node_modules/.bin/jest src/pilulabs.test.ts; echo EXIT=$?
```

Expected: o teste novo falha (sobram `ATALHOS`, `TECLAS_DO_MANIFESTO` e `teclaNoMac`); `EXIT=1`.

- [ ] **Step 2: o atalho sai do `pilulabs.ts`**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai/packages/tools && perl -0pi -e 's/\nexport type Sistema = [^\n]*//; s/\nexport type TeclasSugeridas = [^\n]*//; s/\n+\/\/ No Windows e no Linux o Chrome reserva.*\z/\n/s' src/pilulabs.ts && tail -5 src/pilulabs.ts && ./node_modules/.bin/jest src/pilulabs.test.ts; echo EXIT=$?
```

Expected: o arquivo termina em `urlsDasLojas`; os testes passam; `EXIT=0`.

- [ ] **Step 3: os módulos do Botaí saem**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai/packages/tools && for m in aleatorio uf cpf cnpj rg pis titulo-eleitor celular nascimento senha nome endereco empresa cartao pessoa campos campos-formatar; do /usr/bin/git rm -q "src/$m.ts" "src/$m.test.ts"; done && /usr/bin/git rm -q src/rng-teste.ts && perl -ni -e 'print unless m{^    "\./(aleatorio|uf|cpf|cnpj|rg|pis|titulo-eleitor|celular|nascimento|senha|nome|endereco|empresa|cartao|pessoa|campos|campos-formatar)": }' package.json && perl -ni -e "print unless m{^export \* from '\./(cpf|cnpj)'\$}" src/index.ts && node -e 'JSON.parse(require("fs").readFileSync("package.json","utf8"))' && /usr/bin/git grep -nE "from '\./(aleatorio|uf|cpf|cnpj|rg|pis|titulo-eleitor|celular|nascimento|senha|nome|endereco|empresa|cartao|pessoa|campos|campos-formatar|rng-teste)'" -- src; echo EXIT=$?
```

Expected: o `package.json` continua JSON válido; o `git grep` não acha nenhum import dos módulos que saíram (`EXIT=1`).

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @piluvitu/tools run lint && $P --filter @piluvitu/tools run test && $P --filter @piluvitu/web exec tsc --noEmit && $P --filter @piluvitu/web run test && $P --filter @pilutech/site run test && $P --filter @piluvitu/financas run lint && $P --filter @piluvitu/financas-web run lint; echo EXIT=$?
```

Expected: `EXIT=0`.

- [ ] **Step 4: `packages/tools/CLAUDE.md`**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && perl -0pi -e 's/## Pessoa de teste e classificador de campos.*?(?=## Módulo `pilulabs`)//s' packages/tools/CLAUDE.md && perl -ni -e 'print unless /^- `TECLAS_DO_MANIFESTO` é o `suggested_key`/' packages/tools/CLAUDE.md; echo EXIT=$?
```

Depois, no `packages/tools/CLAUDE.md`:

1. Na linha `- **Fonte:** \`packages/tools/src/\*\` — …`, troque `\`cpf\`, \`cnpj\`, \`base64\``por`\`base64\``e acrescente no fim da linha:` CPF e CNPJ saíram para o \`@pilutech/botai-core\` (npm, repo \`PiluVitu/Botai\`), que o \`/tools\` usa com versão exata.`
2. Na linha que começa com `` `pilulabs.ts`, exposto só por ``, troque `mais \`lojasPublicadas\`, \`fase\` e \`ATALHOS\`)`por`mais \`lojasPublicadas\` e \`fase\`)`e`o \`apps/botai-site\` (botões de loja, selo de fase, atalho de quem visita) e o \`apps/pilutech-site\``por`e o \`apps/pilutech-site\``; no fim da linha, acrescente: ` A landing do Botaí (repo \`PiluVitu/Botai\`) tem uma cópia das regras de loja (\`site/lib/pilulabs.ts\`): mudou aqui, mude lá. O atalho da extensão (\`TECLAS_DO_MANIFESTO\`, \`ATALHOS\`) saiu para o \`@pilutech/botai-core/atalhos\`.`
3. Na linha que começa com `` - `urlsDasLojas(item)` ``, troque `Os dois sites leem o` por `O \`apps/pilutech-site\` lê o`.
4. Na linha que começa com `- Usado pelo \`apps/pilutech-site\` (\`[PiluTech] Contato pelo site\`)`, troque `e pelo \`apps/botai-site\` (\`[Botaí] Suporte\`, \`[Botaí] Privacidade\`, \`[Botaí] Termos de uso\`)`por`e, numa cópia, pela landing do Botaí (repo \`PiluVitu/Botai\`)`, e `(política, termos, \`apps/botai/loja/textos.md\`)`por`(a política, os termos e os textos das lojas, no repo do Botaí)`.
5. Na linha que começa com `` `ico.ts`, exposto só por ``, troque ` e do \`apps/botai-site\` (os ícones da extensão).`(com o espaço antes do`e`) por `; a landing do Botaí (repo \`PiluVitu/Botai\`) tem uma cópia.`

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git grep -n "apps/botai\|gerarPessoa\|classificarFormulario\|Pessoa de teste" -- packages/tools/CLAUDE.md; echo EXIT=$?
```

Expected: nenhuma linha (`EXIT=1`).

- [ ] **Step 5: commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git add -A packages/tools && /usr/bin/git commit -m "refactor(tools): os módulos do Botaí saem do @piluvitu/tools (moram no @pilutech/botai-core)"; echo EXIT=$?
```

### Tarefa D4: o card aponta o repo novo, os docs do Botaí saem e os `CLAUDE.md` contam a nova fronteira

**Files:**

- Delete: os docs do Botaí em `docs/superpowers/` (a mesma lista da B1)
- Modify: `apps/web/content/pilulabs/botai/index.yaml`, `apps/web/lib/pilulabs-conteudo.test.ts`, `apps/web/lib/pilulabs.test.ts`, `apps/web/lib/pilulabs-json-ld.test.ts`, `apps/web/lib/admin/content-schemas.test.ts`, `apps/web/components/admin/content/pilulabs-form.stories.tsx`, `apps/web/app/(site)/pilulabs/pilulabs.e2e.ts`, `apps/pilutech-site/lib/json-ld.test.ts`, `CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/pilutech-site/CLAUDE.md`, `packages/ui/CLAUDE.md`

**Interfaces:**

- Consumes: D1 a D3.
- Produces: item `botai` do CMS com `repo: https://github.com/PiluVitu/Botai`; docs do monorepo apontando para o repo novo.

- [ ] **Step 1: o teste do catálogo pede o repo novo (falha)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai/apps/web && perl -pi -e 's{https://github\.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai}{https://github.com/PiluVitu/Botai}g' lib/pilulabs-conteudo.test.ts lib/pilulabs.test.ts lib/admin/content-schemas.test.ts components/admin/content/pilulabs-form.stories.tsx && perl -pi -e 's{sem página aqui: o site é a landing do apps/botai-site}{sem página aqui: o site é a landing do repo PiluVitu/Botai}' lib/pilulabs-conteudo.test.ts && ./node_modules/.bin/jest lib/pilulabs-conteudo.test.ts; echo EXIT=$?
```

Expected: o teste do Botaí falha no `repo`; `EXIT=1`.

- [ ] **Step 2: o item do CMS**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai/apps/web && perl -pi -e 's{^repo: https://github\.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai$}{repo: https://github.com/PiluVitu/Botai}' content/pilulabs/botai/index.yaml && /usr/bin/grep -n "^repo:" content/pilulabs/botai/index.yaml && ./node_modules/.bin/jest lib/pilulabs-conteudo.test.ts lib/pilulabs.test.ts lib/admin/content-schemas.test.ts; echo EXIT=$?
```

Expected: `repo: https://github.com/PiluVitu/Botai`; os testes passam; `EXIT=0`.

Os comentários que citavam o app que saiu:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && perl -pi -e 's{O Botaí tem landing própria \(apps/botai-site\)}{O Botaí tem landing própria (repo PiluVitu/Botai)}' "apps/web/app/(site)/pilulabs/pilulabs.e2e.ts" && perl -pi -e 's{O mesmo \@id que o apps/botai-site usa}{O mesmo \@id que a landing do Botaí usa}' apps/pilutech-site/lib/json-ld.test.ts && perl -pi -e 's{do apps/pilutech-site e do apps/botai-site\.}{do apps/pilutech-site e da landing do Botaí.}' apps/web/lib/pilulabs-json-ld.test.ts && /usr/bin/git grep -n "apps/botai" -- apps/web apps/pilutech-site ':!*.md'; echo EXIT=$?
```

Expected: nenhuma linha (`EXIT=1`).

- [ ] **Step 3: os docs do Botaí saem (estão no repo novo, com o histórico)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git rm -r -q docs/superpowers/specs/2026-10-01-extensao-dados-teste-design.md docs/superpowers/specs/2026-10-01-botai-multinavegador-design.md docs/superpowers/specs/2026-10-02-botai-landing-design.md docs/superpowers/specs/2026-10-05-botai-repo-proprio-design.md docs/superpowers/plans/2026-10-01-extensao-interfaces.md docs/superpowers/plans/2026-10-01-extensao-fase1-tools.md docs/superpowers/plans/2026-10-01-extensao-fase2-extensao.md docs/superpowers/plans/2026-10-01-extensao-fase3-retorno.md docs/superpowers/plans/2026-10-01-botai-multinavegador-interfaces.md docs/superpowers/plans/2026-10-01-botai-fase1-multinavegador.md docs/superpowers/plans/2026-10-01-botai-fase2-pilulabs-site.md docs/superpowers/plans/2026-10-01-botai-fase3-release-lojas.md docs/superpowers/plans/2026-10-02-botai-landing.md docs/superpowers/plans/2026-10-02-botai-termos.md docs/superpowers/design/2026-10-01-extensao-dados-teste docs/superpowers/design/2026-10-02-botai-landing docs/superpowers/research/2026-10-01-extensao-dados-teste docs/superpowers/research/2026-10-01-botai-multinavegador && /usr/bin/git rm -q docs/superpowers/plans/2026-10-05-botai-*.md && /usr/bin/git ls-files docs/superpowers | /usr/bin/grep -iE "botai|extensao-dados"; echo EXIT=$?
```

Expected: nenhuma linha (`EXIT=1`).

- [ ] **Step 4: `apps/web/CLAUDE.md`**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && perl -pi -e 's{é a landing do `apps/botai-site`}{é a landing do repo `PiluVitu/Botai` (pasta `site/`)}g; s{o `botai\.` do `apps/botai-site`}{o `botai.` da landing do repo `PiluVitu/Botai`}g; s{\(o Botaí, no `apps/botai-site`; o Sombraí\)}{(o Botaí, no repo `PiluVitu/Botai`; o Sombraí)}g; s{o mesmo do `apps/pilutech-site` e do `apps/botai-site`}{o mesmo do `apps/pilutech-site` e da landing do Botaí}g; s{e compartilhado com o `apps/botai-site`:}{e compartilhado com o `apps/pilutech-site` (a landing do Botaí, no repo `PiluVitu/Botai`, tem uma cópia das regras de loja):}g; s{O `apps/botai-site` lê o mesmo `content/pilulabs/botai/index\.yaml`}{O `apps/pilutech-site` lê o mesmo `content/pilulabs/botai/index.yaml`}g; s{`docs/superpowers/specs/2026-10-01-botai-multinavegador-design\.md` §6:}{`docs/superpowers/specs/2026-10-01-botai-multinavegador-design.md` §6 (no repo `PiluVitu/Botai`):}g; s{`docs/superpowers/plans/2026-10-01-botai-fase2-pilulabs-site\.md`}{`docs/superpowers/plans/2026-10-01-botai-fase2-pilulabs-site.md` (no repo `PiluVitu/Botai`)}g' apps/web/CLAUDE.md; echo EXIT=$?
```

Depois, no `apps/web/CLAUDE.md`, troque cada linha inteira que começa com o trecho indicado:

1. `> A **lógica pura** (algoritmos CPF/CNPJ/Base64/JWT/JSON/UUID` →

```markdown
> A **lógica pura** mora em `packages/tools` (`@piluvitu/tools`: Base64, JWT, JSON, UUID, QR e PRNG/entropia/roleta; ver `packages/tools/CLAUDE.md`), menos CPF e CNPJ, que vêm do `@pilutech/botai-core` (npm, o motor do Botaí, repo `PiluVitu/Botai`) com versão exata: o `package-json.test.ts` reprova `^` e `~`. Aqui é só a UI React e o registro.
```

2. A linha que começa com `    - \`lojasPublicadas\`, \`fase\` e \`ATALHOS\`` vira:

```markdown
    - `lojasPublicadas` e `fase` (o atalho do Botaí, `ATALHOS`, saiu para o `@pilutech/botai-core/atalhos`, no repo do Botaí);
```

3. `- **Lançar o Botaí:**` →

```markdown
- **Lançar o Botaí:** as URLs das lojas aprovadas entram pelo `/admin/pilulabs` (o card daqui e o selo do Botaí na landing da PiluTech, que relê o YAML no build; ver o `ignoreCommand` do `vercel.json` dela) **e** por PR no `site/lojas.json` do repo `PiluVitu/Botai` (a landing do Botaí). Edge e Opera entram quando aprovarem.
```

4. `  - \`public/pilulabs/botai/icone-128.png\` (o logo do card)` →

```markdown
- `public/pilulabs/botai/icone-128.png` (o logo do card) é uma cópia fixa do ícone 128 do Botaí (repo `PiluVitu/Botai`, `extensao/loja/imagens/icone-128.png`). Se o ícone mudar lá, refaça a cópia aqui.
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git grep -n "apps/botai\|capturas-botai" -- apps/web/CLAUDE.md; echo EXIT=$?
```

Expected: nenhuma linha (`EXIT=1`).

- [ ] **Step 5: `apps/pilutech-site/CLAUDE.md` e `packages/ui/CLAUDE.md`**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && perl -pi -e 's{\*\*Molde:\*\* o `apps/botai-site`}{**Molde:** a landing do Botaí (hoje a pasta `site/` do repo `PiluVitu/Botai`)}g; s{como no `apps/botai-site`}{como na landing do Botaí}g; s{como o do `apps/botai-site`}{como o da landing do Botaí}g; s{pelo mesmo motivo do `apps/botai-site`}{pelo mesmo motivo da landing do Botaí}g; s{o mesmo do `apps/botai-site` e}{o mesmo da landing do Botaí e}g' apps/pilutech-site/CLAUDE.md && perl -pi -e 's{e, desde 2026-10-01, pelo popup de `apps/botai` \(WXT/Vite\)}{e por `apps/pilutech-site` (Next); o Botaí (repo `PiluVitu/Botai`) o consome do npm}g; s{— quinto consumidor, Next 16 como o `apps/botai-site`:}{— consumidor Next 16, como o `apps/web`:}g; s{\(Parte C do plano `docs/superpowers/plans/2026-10-05-botai-fase0-separacao\.md`\)}{(Parte C do plano da fase 0, no repo `PiluVitu/Botai`: `docs/superpowers/plans/2026-10-05-botai-fase0-separacao.md`)}g' packages/ui/CLAUDE.md && perl -ni -e 'print unless /^- \*\*`apps\/botai(-site)?`\*\* \(/' packages/ui/CLAUDE.md; echo EXIT=$?
```

No `packages/ui/CLAUDE.md`, em `## Consumo pelos apps`, logo antes da linha que começa com `- **\`apps/pilutech-site\`\*\*`, acrescente:

```markdown
- **Botaí** (repo `PiluVitu/Botai`, desde 2026-10) — a extensão (WXT/Vite) e a landing (Next) consomem o `@piluvitu/ui` **publicado no npm**, com `@source '../node_modules/@piluvitu/ui/dist'` e o gate no build; ver o `CLAUDE.md` de lá. É por ele que o pacote é MIT (com o aviso do shadcn) e tem build para o npm (ver _Publicação no npm_).
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git grep -n "apps/botai\|botai-release" -- apps/pilutech-site/CLAUDE.md packages/ui/CLAUDE.md; echo EXIT=$?
```

Expected: nenhuma linha (`EXIT=1`).

- [ ] **Step 6: `CLAUDE.md` da raiz**

Linhas que saem (tabela de workspaces, stack, comandos, lint-staged, workflows e o environment das lojas):

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && perl -ni -e 'next if /^> \| `apps\/botai(-site)?` /; next if /^- \*\*`apps\/botai(-site)?`\*\* /; next if /^\| `make [a-z0-9-]*-botai(-site)?( V=x\.y\.z)?` /; next if /^- \*\*`apps\/botai(-site)?\/package\.json`\*\* /; next if /^\| `botai-(e2e|release)\.yml` /; next if /^\*\*Environment `lojas-botai`\*\*/; next if /^- Secrets: `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`/; next if /^- Variables: `BOTAI_CHROME_EXTENSION_ID`/; print' CLAUDE.md && perl -0pi -e 's/ E em `apps\/botai\/package\.json`.*?E em `apps\/pilutech-site\/package\.json` → `build`, igual ao do `apps\/botai-site`\./ E em `apps\/pilutech-site\/package.json` → `build` (`next build && node ..\/..\/scripts\/check-tailwind-source.mjs .next && node scripts\/conferir-rotas-estaticas.mjs`)./s; s/### Imagens do Botaí nos sites\n\n[^\n]*\n/### Ícone do Botaí no card da PiluLabs\n\n`apps\/web\/public\/pilulabs\/botai\/icone-128.png` é uma cópia fixa do ícone 128 do Botaí (repo `PiluVitu\/Botai`, `extensao\/loja\/imagens\/icone-128.png`, gerado pelo mesmo gerador das imagens das lojas). Se o ícone mudar lá, refaça a cópia aqui.\n/' CLAUDE.md; echo EXIT=$?
```

Depois, no `CLAUDE.md` da raiz, troque os trechos:

1. `com dez frentes:` → `com oito frentes:`
2. Na linha da tabela de `packages/ui`: `consumidos por \`apps/web\`, \`apps/financas/web\`, \`apps/botai\`, \`apps/botai-site\` e \`apps/pilutech-site\`; publicado no npm (\`publicar-ui.yml\`)`→`consumidos por \`apps/web\`, \`apps/financas/web\` e \`apps/pilutech-site\`; publicado no npm (\`publicar-ui.yml\`), de onde o Botaí o consome`.
3. No bullet de `packages/tools`: `consumida pelo web, pela extensão e pelas landings do Botaí e da PiluTech (geradores, classificador de campos, \`valorPara\`)`→`consumida pelo web, pelo finanças e pela landing da PiluTech`.
4. No bullet de `packages/ui`: `o popup de \`apps/botai\` (WXT/Vite), \`apps/botai-site\` e \`apps/pilutech-site\` (Next)`→`e \`apps/pilutech-site\` (Next); o Botaí o consome do npm`.
5. No bullet de GitHub Actions: `\`botai-e2e.yml\` e \`botai-release.yml\` para a extensão.`→`\`publicar-ui.yml\` publica o \`@piluvitu/ui\` no npm.`
6. Logo depois do bullet de `packages/ui` da Tech Stack, acrescente:

```markdown
- **Botaí** — mora em `github.com/PiluVitu/Botai` desde 2026-10 (extensão, landing e `@pilutech/botai-core`). Aqui ficam: o item `botai` do CMS do `apps/web` (card da PiluLabs e selo da landing da PiluTech; as URLs das lojas mudam junto com o `site/lojas.json` de lá), o ícone fixo `apps/web/public/pilulabs/botai/icone-128.png` e o `/tools`, que usa `@pilutech/botai-core` do npm com versão exata (`apps/web/package-json.test.ts`).
```

7. No primeiro parágrafo de "Dependency security policy": `(\`apps/web\`, \`apps/financas\`, \`apps/botai\`, \`apps/botai-site\`, \`apps/pilutech-site\`, \`packages/_\`)`→`(\`apps/web\`, \`apps/financas\`, \`apps/pilutech-site\`, \`packages/_\`)`.
8. Na linha do `make stop`: `8081/8082/3333/6017/3018/6018/3020/6019/3021/6020` → `8081/8082/3333/6017/3021/6020`.
9. No pre-commit: `Configs em seis níveis` → `Configs em quatro níveis`, e `a mesma config do \`apps/botai-site\`, pelo mesmo motivo.`→`a mesma config do \`apps/web\`, pelo mesmo motivo.`
10. Troque a linha inteira que começa com `| \`ci.yml\`` por:

```markdown
| `ci.yml` | PR + push em `main` | Em paralelo, **cinco** jobs: web (`dedupe --check` + `lint` + `lint`/`test` de `packages/ui` (o `test` builda e confere o pacote do npm) + `lint` (`tsc --noEmit`)/`jest` de `packages/tools` + `tsc --noEmit` + `jest` + `next build:ci`, gate do `@source` incluso), financas (`tsc --noEmit` do Worker e do SPA + build do SPA — os dois gates, `@source` e lazy-chart, inclusos — + `vitest` dos dois), ramielle (`tsc --noEmit` + `vitest` — Worker sem SPA, sem gate de build), promeia (`uv sync --locked` + `ruff check` + `ruff format --check` + `pytest`) e pilutech-site (`eslint` + `tsc --noEmit` + Jest + `node --test` + `next build` com o gate do `@source` e a conferência das rotas estáticas; o E2E roda local). O job `api` (Go) saiu em 2026-08-14. |
```

11. Troque a linha inteira que começa com `- **Landing do Botaí:**` por:

```markdown
- **Landing do Botaí:** projeto `botai-site`, ligado ao repo `PiluVitu/Botai` (Root Directory `site`) desde 2026-10; ver o `site/CLAUDE.md` de lá.
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git grep -n "apps/botai\|botai-e2e\|botai-release\|lojas-botai\|capturas-botai" -- CLAUDE.md; echo EXIT=$?
```

Expected: nenhuma linha (`EXIT=1`).

- [ ] **Step 7: Prettier e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && ./node_modules/.bin/prettier --write CLAUDE.md apps/web/CLAUDE.md apps/pilutech-site/CLAUDE.md packages/ui/CLAUDE.md packages/tools/CLAUDE.md "apps/web/app/(site)/pilulabs/pilulabs.e2e.ts" apps/web/lib apps/web/components/admin/content apps/web/content/pilulabs/botai apps/pilutech-site/lib/json-ld.test.ts && /usr/bin/git add -A CLAUDE.md apps docs packages && /usr/bin/git commit -m "docs: o Botaí mora em PiluVitu/Botai (card, docs e CLAUDE.md apontam o repo novo)"; echo EXIT=$?
```

### Tarefa D5: verificação final — nenhum arquivo do Botaí, tudo verde

**Files:** nenhum.

**Interfaces:**

- Consumes: D1 a D4.
- Produces: branch `chore/botai-sai-do-monorepo` pronta para o C12.

- [ ] **Step 1: nenhum arquivo do Botaí**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git ls-files | /usr/bin/grep -iE "(^|/)botai|extensao-dados-teste"; /usr/bin/git ls-files packages/tools/src | wc -l; /usr/bin/git grep -nE "apps/botai|@piluvitu/tools/(cpf|cnpj|pessoa|campos|nome|endereco)|botai-(e2e|release)\.yml|TECLAS_DO_MANIFESTO" -- . ':!pnpm-lock.yaml' ':!docs'; echo EXIT=$?
```

Expected: o primeiro `grep` lista só `apps/web/content/pilulabs/botai/index.yaml` e `apps/web/public/pilulabs/botai/icone-128.png` (o card da PiluLabs, que a spec mantém aqui); o `git grep` final não acha nada (`EXIT=1`).

- [ ] **Step 2: install, lint, testes e builds**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P install --frozen-lockfile && $P dedupe --check && $P -r lint && $P -r test && $P --filter @pilutech/site run build && $P --filter @piluvitu/financas-web run build && NEXT_TELEMETRY_DISABLED=1 KEYSTATIC_GITHUB_CLIENT_ID=ci-dummy KEYSTATIC_GITHUB_CLIENT_SECRET=ci-dummy KEYSTATIC_SECRET=ci-dummy-secret-32-chars-padding-x NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG=ci-dummy $P --filter @piluvitu/web run build:ci && /opt/homebrew/bin/actionlint; echo EXIT=$?
```

Expected: `EXIT=0`.

- [ ] **Step 3: E2E do catálogo e do `/tools` (porta 3333 livre)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai/apps/web && CI=1 ./node_modules/.bin/playwright test '\(site\)/pilulabs/pilulabs' '\(site\)/tools/tools' --retries=0; echo EXIT=$?
```

Expected: `EXIT=0` (o card do Botaí segue na vitrine, com o repo novo; os 308 dos caminhos antigos para a landing seguem).

- [ ] **Step 4: árvore limpa**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/.worktrees/botai-sai && /usr/bin/git status --short && /usr/bin/git log --oneline origin/main..HEAD; echo EXIT=$?
```

Expected: `status` vazio, 4 commits (D1 a D4), `EXIT=0`. O push, o PR e o merge são o C12.
