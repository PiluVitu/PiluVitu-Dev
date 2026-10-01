# Botaí, fase 3: release e lojas — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tag `botai-v<versão>` na `main` gera o GitHub Release com os 4 zips e publica na Chrome Web Store, na AMO e no Edge depois da aprovação do dono, com o material de listagem das 4 lojas (textos, ícone 128 e capturas) versionado em `apps/botai/loja/` e copiado para o site, e o Botaí na versão 1.0.0.

**Architecture:** O `botai-release.yml` da fase 1 ganha o gatilho de tag, os inputs do `workflow_dispatch`, a conferência da tag no job `pacotes`, o job `release` (único com `contents: write`) e o job `lojas`. Toda decisão do release mora em scripts bash testados no Vitest com processos reais (repositório git com origem bare, `pnpm` e `gh` falsos): `submeter-lojas.sh` (modo pelo evento, lojas pelos secrets), `conferir-tag.sh`, `versao.sh` e `release.sh`, chamados pelo workflow e pelo `Makefile`. As imagens saem de um único Playwright (`playwright.capturas.config.ts`): o popup vem das stories do Storybook (a 2×, atalho `Ctrl+Shift+Y` e tema pelo global) e a página preenchida vem da extensão real com a nova opção `aparencia` do fixture.

**Tech Stack:** GitHub Actions (environment `lojas-botai`, `actionlint` 1.7.12 em Docker) · `wxt submit` (publish-browser-extension 6.1.1, CWS API v2) · bash (shellcheck) · Vitest 4 · Playwright 1.59.1 (`channel: 'chromium'`) · Storybook 10.3.1 estático · WXT 0.21.4 · pnpm 11.1.1.

**Spec:** `docs/superpowers/specs/2026-10-01-botai-multinavegador-design.md` (esta fase é a §9.3; as regras vêm das §5 e §7). Contrato de nomes entre as fases (OBRIGATÓRIO, nada aqui o renomeia): `docs/superpowers/plans/2026-10-01-botai-multinavegador-interfaces.md`. Plano da fase 1, que este continua na mesma branch: `docs/superpowers/plans/2026-10-01-botai-fase1-multinavegador.md`. Pesquisa: `docs/superpowers/research/2026-10-01-botai-multinavegador/` (`publicacao.md` §5–§6 e `site-pilulabs.md` §4 trazem os rascunhos portados aqui; `critica.md` as correções). Regras do app: `apps/botai/CLAUDE.md`.

**Protótipo:** todo o código deste plano foi rodado num clone da branch em `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/fase3-proto/` (sem a fase 1): Vitest 389/389, Playwright 23/23, capturas geradas 3 vezes com os mesmos bytes, `actionlint` local e em Docker sem achados, `tsc`, `eslint` e `prettier --check` limpos. Os blocos abaixo são a versão final de lá; se a pasta ainda existir, dá para comparar com `/usr/bin/diff`.

---

## Pré-requisitos e convenções de execução

- **Branch e worktree:** `feat/botai-multinavegador` em `/Users/piluvitu/WWW/PiluVitu-Dev`, **com a fase 1 inteira commitada**. Confira antes da Task 1 (Pré-voo, abaixo); se faltar algo da fase 1, pare.
- **Diretório:** todo comando começa com um `cd` **absoluto** na mesma linha (`cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && …` para os do app, `cd /Users/piluvitu/WWW/PiluVitu-Dev && …` para os da raiz).
- **O shell tem um wrapper (`rtk`) que falsifica a saída de `git`, `grep`, `diff`, `find`, `ls`, `pnpm`, `prettier`, `vitest` e `jest`.** Por isso:
  - git é `/usr/bin/git`; grep é `/usr/bin/grep`; ls é `/bin/ls`; find é `/usr/bin/find`; diff é `/usr/bin/diff`; make é `/usr/bin/make`; shellcheck é `/opt/homebrew/bin/shellcheck`; actionlint é `/opt/homebrew/bin/actionlint`; docker é `/usr/local/bin/docker`;
  - pnpm é o binário real `/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm`, abreviado como `P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P …` na mesma linha;
  - vitest, tsc, eslint, prettier, wxt e playwright rodam por `apps/botai/node_modules/.bin/<binário>` (`./node_modules/.bin/…` com o `cd` no app);
  - **todo** comando de verificação termina com `; echo "exit=$?"`, e o que vale é o `exit=`, nunca o texto.
- **Antes de cada commit** (regra do dono): `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"` dá `exit=0` (`wxt prepare && tsc --noEmit && eslint .`; o `tsconfig` inclui `../**/*`, então `scripts/` e `loja/` são checados).
- **Commits:** convencionais em português, com `/usr/bin/git`, na branch atual. **Nunca `git push`, nunca tag, nunca `make versao-botai` nem `make release-botai` de verdade** (os dois dão push; os testes os exercitam em repositórios temporários). O pre-commit (`lint-staged`) pode reformatar arquivos; é esperado.
- **Nada que exija credencial de loja.** Contas, taxa, 2FA, environment, secrets, primeiro envio e lançamento são do dono e viram a seção "Publicação" (Task 9) e a lista final (Task 10).
- **Sem devcontainer:** o repo não tem um; os testes rodam no host (ver `apps/botai/CLAUDE.md`, "Testes").
- **Imagens e o `apps/web`:** neste worktree o `apps/web` é o da branch atual. As imagens que a Task 8 grava em `apps/web/public/pilulabs/botai/` entram **nesta** branch e chegam ao site quando ela for para a `main`.

### Pré-voo (a base da fase 1)

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git branch --show-current && /usr/bin/git status --short -- . ':(exclude)docs/superpowers/plans' | /usr/bin/wc -l && /usr/bin/git merge-base --is-ancestor 4caeca8 HEAD && /bin/ls apps/botai/src/lib/navegador.ts apps/botai/scripts/reproduzir-fontes.sh apps/botai/SOURCE-CODE-REVIEW.md apps/botai/LICENSE .github/workflows/botai-release.yml; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && node -e "const s=require('./apps/botai/package.json').scripts; for (const k of ['zip','zip:firefox','zip:opera','lint:firefox','build:firefox','build:opera']) if (!s[k]) { console.log('FALTA', k); process.exitCode = 1 }"; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git check-ignore -q .env.submit && /usr/bin/grep -c -e '^  pacotes:' -e 'reproduzir-fontes.sh' -e 'name: botai-zips' .github/workflows/botai-release.yml; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint && $P run test; echo "exit=$?"
```

Esperado: `feat/botai-multinavegador`, `0` arquivos pendentes fora de `docs/superpowers/plans/` (os planos das fases podem estar sem commit: não bloqueiam, e nenhuma task os inclui no `git add`), o squash do #45 (`4caeca8`, já na `main`) como ancestral do `HEAD`, os 5 caminhos e `exit=0`; nenhum `FALTA` e `exit=0`; `3` e `exit=0` (o `.env.submit` já está no `.gitignore` desde a fase 1, e o workflow tem o job `pacotes`); lint e Vitest verdes. O Docker precisa estar no ar para as Tasks 3 e 10 (`/usr/local/bin/docker info >/dev/null 2>&1; echo "exit=$?"`; se der `exit≠0`, abra o OrbStack).

---

## Global Constraints

- **Nomes do contrato, sem renomear:** Makefile `versao-botai`, `release-botai` e `capturas-botai`; workflow `.github/workflows/botai-release.yml` com os jobs `pacotes` (fase 1, com o artifact `botai-zips`), `release` e `lojas` (esta fase); `apps/botai/scripts/reproduzir-fontes.sh` (fase 1); zips `.output/botai-<versão>-chrome.zip`, `-firefox.zip`, `-opera.zip` e `-sources.zip`; imagens do site em `apps/web/public/pilulabs/botai/icone-128.png` e `apps/web/public/pilulabs/botai/capturas/<NN>-<nome>.png` (1280×800, temas claro e escuro, `NN` dá a ordem).
- **Release:** GitHub Release só no push de tag `botai-v<versão>`, com a tag igual a `botai-v` + a versão do `apps/botai/package.json` e o commit na `main`; `permissions: contents: write` só no job do Release; `--latest=false`; os zips saem do artifact `botai-zips` (pasta `botai-zips/`, porque o `upload-artifact` ignora `.output`).
- **Gatilhos:** tag `botai-v*`; `workflow_dispatch` com `lojas: nenhuma | dry-run | submeter` e `adiar_chrome` (padrão `false`); `pull_request` que toca `apps/botai/**`, `packages/ui/**`, `packages/tools/**` ou o próprio workflow (a fase 1 soma os arquivos da raiz do zip de fontes; mantenha).
- **Job `lojas`:** `environment: lojas-botai` com aprovação manual; `pnpm exec wxt submit --chrome-zip … --edge-zip <o zip do Chrome> --firefox-zip … --firefox-sources-zip botai-X-sources.zip`; env `CHROME_API_VERSION: v2`, `CHROME_EXTENSION_ID` ← `vars.BOTAI_CHROME_EXTENSION_ID`, `EDGE_PRODUCT_ID` ← `vars.BOTAI_EDGE_PRODUCT_ID`, `FIREFOX_EXTENSION_ID: botai@pilutech.com.br`, `FIREFOX_CHANNEL: listed`, `FIREFOX_COMPATIBILITY: firefox`; cada loja só entra se os secrets dela existirem; sem nenhum, `::notice::`; `CHROME_PUBLISH_TYPE: STAGED_PUBLISH` só com `adiar_chrome: true`; no PR roda sem environment, no modo `nenhuma`, e só monta e imprime em `::notice::` o `wxt submit` de cada loja, mais o `actionlint` do workflow.
- **Secrets do environment `lojas-botai`:** `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`. **Variables:** `BOTAI_CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `BOTAI_EDGE_PRODUCT_ID`.
- **Opera:** fora da automação; o zip sem minificar fica no Release para envio manual.
- **Versão:** primeira pública **1.0.0**. `make versao-botai V=x.y.z`: branch, `pnpm version --no-git-tag-version`, commit e `gh pr create`. `make release-botai`: só com `HEAD` igual a `origin/main`; lê a versão, aborta se a tag existe, cria a tag anotada `botai-v<versão>` e dá push. Nenhuma tag `botai-v*` antes de as fases 1 e 3 estarem na `main` (o #45 já está lá, squash `4caeca8`).
- **`apps/botai/loja/`:** textos em pt-BR (resumo de até 250 caracteres, limite da AMO; descrição com 250 ou mais, mínimo do Edge; single purpose; "remote code: não"; a categoria de dados "Website content" da CWS; a justificativa de cada permissão, inclusive `menus`, só no Firefox); CWS em Developer Tools; AMO em `web-development`, licença MIT, só desktop; `icone-128.png` com arte de 96 px e margem de 16 px, do mesmo desenho 1i (o ícone do manifesto não muda).
- **Capturas:** um script Playwright único (`playwright.capturas.config.ts`); o popup sai das stories, a 2×, com atalho `Ctrl+Shift+Y` e tema por prop/global, independentemente do sistema; a extensão real dá só a página preenchida, com o fixture de opção `aparencia` repassado ao `launchPersistentContext`; tamanhos 1280×800, 640×400, tile de 440×280, ao menos 2 de 612×408 com fundo branco para o Opera e logo de 300×300 para o Edge, nos temas claro e escuro; grava também em `apps/web/public/pilulabs/botai/`.
- **URLs e contato fixos:** `homepage_url` `https://piluvitu.com.br/pilulabs/botai`; política `https://piluvitu.com.br/pilulabs/botai/privacidade`; suporte `pilutechinformatica@gmail.com`; publicador PiluTech.
- **Marca:** em texto visível, sempre "Botaí" (nunca "BotAi", "Bota Aí", "BOTAI" ou "Botai"; nada de `text-transform: uppercase` sobre o nome); a grafia técnica é `botai`.
- **Idioma:** listagem e documentação em pt-BR; em inglês só o `SOURCE-CODE-REVIEW.md` (fase 1) e as notas para os revisores da AMO e do Opera (`loja/notas-revisores.md`), que apontam para ele.
- **Testes (regra do dono, com a exceção documentada do app):** Vitest no `apps/botai` (não Jest); Playwright para o fixture e as capturas; nenhum componente React novo (os quadros das capturas são HTML de gerador, não UI do app), então nenhuma story nova; nada de lógica nova no `apps/web` (só PNG), então nenhum Jest novo.
- **Lei de comentários do `CLAUDE.md` raiz:** em produção, comentário só para um porquê que o código não mostra, de 1 a 3 linhas; testes podem explicar. Colocation: teste ao lado do fonte. Identificadores em português.
- **CLAUDE.md:** `apps/botai/CLAUDE.md` e o `CLAUDE.md` raiz atualizados na Task 9. O `apps/web/CLAUDE.md` não muda nesta branch: a seção PiluLabs é da fase 2, que já descreve a descoberta das capturas.

## Review Focus

1. **`workflow_dispatch` disparado a partir de uma tag com `lojas: dry-run`:** quem só quer validar as credenciais espera um dry-run, nunca uma submissão de verdade (uma regra ingênua por `github.ref_type == 'tag'` submeteria). Teste: `submeter-lojas.test.ts` "dry-run disparado a partir de uma tag continua dry-run (não vira submeter)" (Task 1).
2. **Credencial cadastrada pela metade** (só o `FIREFOX_JWT_ISSUER`, ou só a `EDGE_API_KEY`): o dono espera um erro dizendo o que falta, e não uma loja pulada em silêncio com o job verde. Teste: "secret pela metade é erro de cadastro, não loja pulada" (Task 1).
3. **`make release-botai` numa `main` local atrasada, com a árvore suja ou numa versão já publicada:** o dono espera o comando parar antes de criar ou enviar qualquer tag. Testes: `release.test.ts` "recusa quando o HEAD não é a origin/main", "recusa quando a tag já existe na origem" e "recusa árvore suja" (Task 2).
4. **Um texto da loja (sobretudo as notas em inglês) com uma palavra que é utility do Tailwind** (`static`, `table`, `contents`…): a pessoa espera que editar a listagem não mude o CSS da extensão nem o zip enviado. Teste: o canário do Step 5 da Task 1 (`skew-x-12` num `.md` de `loja/` e num `scripts/*.sh` some do CSS com o `@source not`, e o hash volta ao de antes).
5. **Rebase sobre uma `main` que já tem a fase 2:** as duas branches criam `apps/web/public/pilulabs/botai/icone-128.png` (a fase 2 com a cópia do ícone do manifesto); quem resolver o conflito add/add espera ficar com o da loja, com a margem. Teste: `loja/imagens.test.ts` "apps/web/public/pilulabs/botai/icone-128.png é idêntica à da loja" (Task 8), mais a instrução de resolução no `apps/botai/CLAUDE.md` (Task 9).

---

## Estrutura de arquivos

```
apps/botai/
  scripts/submeter-lojas.sh (+ .test.ts)        NOVO   modo pelo evento, lojas pelos secrets, wxt submit (1)
  scripts/repo-de-teste.ts                      NOVO   repositório git temporário com origem bare e gh falso, para os testes (2)
  scripts/conferir-tag.sh (+ .test.ts)          NOVO   tag = botai-v<versão> e commit na main (2)
  scripts/versao.sh (+ .test.ts)                NOVO   make versao-botai (2)
  scripts/release.sh (+ .test.ts)               NOVO   make release-botai (2)
  vitest.config.ts                              EDITA  include de scripts/ (1) e loja/ (6)
  src/styles.css                                EDITA  @source not '../loja' e '../scripts' (1)
  package.json                                  EDITA  prettier:fix (1), version 1.0.0 (4), script capturas (8)
  src/test/extensao.fixture.ts                  EDITA  opção aparencia (5)
  src/test/aparencia.e2e.ts                     NOVO   prova da opção aparencia (5)
  manifesto.e2e.ts                              EDITA  toda permissão tem justificativa em loja/textos.md (6)
  loja/textos.md, notas-revisores.md, README.md NOVO   material das lojas (6)
  loja/textos.ts (+ .test.ts)                   NOVO   leitor das seções e limites por loja (6)
  loja/icone-1i.svg                             NOVO   o 1i em vetor (cópia do research) (7)
  loja/pecas.ts (+ .test.ts)                    NOVO   nomes e tamanhos de todas as imagens (7)
  loja/quadros.ts (+ .test.ts)                  NOVO   HTML de cada quadro (7)
  loja/vitrine.pagina.html                      NOVO   formulário estilizado que a extensão preenche (8)
  loja/capturas.captura.ts                      NOVO   o gerador Playwright (8)
  loja/imagens.test.ts                          NOVO   tamanhos e cópias do site (8)
  loja/imagens/**                               GERADO ícone 128, logo do Edge, tile, capturas, Opera (8)
  playwright.capturas.config.ts                 NOVO   (8)
  CLAUDE.md, README.md                          EDITA  "Publicação" (9)
apps/web/public/pilulabs/botai/icone-128.png    GERADO (8)
apps/web/public/pilulabs/botai/capturas/*.png   GERADO (8)
.github/workflows/botai-release.yml             EDITA  tag, dispatch, conferência, jobs release e lojas (3)
Makefile                                        EDITA  versao-botai, release-botai (2), capturas-botai (8)
CLAUDE.md                                       EDITA  (9)
```

---

### Task 1: Script do job `lojas` (`apps/botai/scripts/submeter-lojas.sh`)

**Files:**

- Create: `apps/botai/scripts/submeter-lojas.sh`
- Test: `apps/botai/scripts/submeter-lojas.test.ts`
- Modify: `apps/botai/vitest.config.ts` (`include`)
- Modify: `apps/botai/src/styles.css` (duas linhas `@source not`)
- Modify: `apps/botai/package.json` (script `prettier:fix`)

**Interfaces:**

- Consumes: os zips da fase 1 (`botai-<versão>-{chrome,firefox,sources,opera}.zip`) numa pasta.
- Produces: `bash apps/botai/scripts/submeter-lojas.sh`, lendo do ambiente:
  - `EVENTO` (obrigatório: `pull_request` → modo `nenhuma`; `push` → `submeter`; `workflow_dispatch` → o valor de `ENTRADA_LOJAS`, padrão `nenhuma`), `VERSAO` e `PASTA_ZIPS` (obrigatórios), `ORIGEM_REF` (`submeter` exige `refs/heads/main` ou `refs/tags/botai-v*`), `ADIAR_CHROME` (`true` liga o `STAGED_PUBLISH`);
  - os secrets e variables das lojas com os nomes do `publish-browser-extension` (`CHROME_*`, `FIREFOX_*`, `EDGE_*`).
  - Saída: `::notice::`/`::error::` e, se houver loja, `exec pnpm exec wxt submit <args>`; `exit 1` para zip faltando, evento ou modo desconhecido, `submeter` fora da `main`/tag e secret pela metade.
- Produces: o `include` do Vitest com `scripts/**/*.test.ts` (as Tasks 2 e 6 dependem dele).

- [ ] **Step 1: O teste que falha**

`apps/botai/vitest.config.ts`, troque o `include` por:

```ts
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
```

`apps/botai/scripts/submeter-lojas.test.ts`:

```ts
// @vitest-environment node
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = path.resolve(import.meta.dirname, 'submeter-lojas.sh')
const VERSAO = '1.2.3'
const TIPOS = ['chrome', 'firefox', 'sources', 'opera'] as const

let pasta: string
let zips: string
const zip = (tipo: (typeof TIPOS)[number]) =>
  path.join(zips, `botai-${VERSAO}-${tipo}.zip`)

beforeEach(() => {
  pasta = mkdtempSync(path.join(tmpdir(), 'botai-lojas-'))
  zips = path.join(pasta, 'botai-zips')
  mkdirSync(zips)
  for (const tipo of TIPOS) writeFileSync(zip(tipo), '')
  // pnpm falso: mostra o que chegaria ao `wxt submit`, sem rede nem credencial.
  const bin = path.join(pasta, 'bin')
  mkdirSync(bin)
  writeFileSync(
    path.join(bin, 'pnpm'),
    [
      '#!/usr/bin/env bash',
      'echo "PNPM $*"',
      'echo "CHROME_PUBLISH_TYPE=${CHROME_PUBLISH_TYPE-<unset>}"',
      'echo "CHROME_EXTENSION_ID=${CHROME_EXTENSION_ID-<unset>}"',
      'echo "EDGE_PRODUCT_ID=${EDGE_PRODUCT_ID-<unset>}"',
      '',
    ].join('\n'),
  )
  chmodSync(path.join(bin, 'pnpm'), 0o755)
})

afterEach(() => rmSync(pasta, { recursive: true, force: true }))

const CHROME = { CHROME_SERVICE_ACCOUNT_PRIVATE_KEY: 'chave' }
const FIREFOX = { FIREFOX_JWT_ISSUER: 'emissor', FIREFOX_JWT_SECRET: 'segredo' }
const EDGE = { EDGE_CLIENT_ID: 'cliente', EDGE_API_KEY: 'api' }

// Sem herdar process.env: um secret exportado na máquina de quem roda não pode vazar para o teste.
function rodar(env: Record<string, string>) {
  const r = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: `${path.join(pasta, 'bin')}:${process.env.PATH}`,
      EVENTO: 'push',
      VERSAO,
      PASTA_ZIPS: zips,
      ORIGEM_REF: `refs/tags/botai-v${VERSAO}`,
      ...env,
    },
  })
  return { status: r.status, saida: `${r.stdout}${r.stderr}` }
}

describe('pull_request: só imprime, mesmo com secrets', () => {
  it('imprime o comando de cada loja em ::notice:: e não chama o wxt submit', () => {
    const { status, saida } = rodar({
      EVENTO: 'pull_request',
      ORIGEM_REF: 'refs/pull/7/merge',
      ...CHROME,
      ...FIREFOX,
      ...EDGE,
    })
    expect(status).toBe(0)
    expect(saida).toContain(
      `::notice::Chrome: wxt submit --chrome-zip ${zip('chrome')}`,
    )
    expect(saida).toContain(
      `::notice::Firefox: wxt submit --firefox-zip ${zip('firefox')} --firefox-sources-zip ${zip('sources')}`,
    )
    expect(saida).toContain(
      `::notice::Edge: wxt submit --edge-zip ${zip('chrome')}`,
    )
    expect(saida).toContain(`::notice::Opera: envio manual de ${zip('opera')}`)
    expect(saida).not.toContain('PNPM')
  })

  it('falha quando falta um zip no artifact, mesmo sem enviar', () => {
    rmSync(zip('sources'))
    const { status, saida } = rodar({ EVENTO: 'pull_request' })
    expect(status).toBe(1)
    expect(saida).toContain(`::error::Falta ${zip('sources')}`)
  })
})

describe('push de tag: submeter', () => {
  it('sem nenhum secret sai com ::notice:: e exit 0', () => {
    const { status, saida } = rodar({})
    expect(status).toBe(0)
    expect(saida).toContain('::notice::Nenhuma loja com secrets')
    expect(saida).not.toContain('PNPM')
  })

  it('só a Chrome: --chrome-zip, publicando direto (sem STAGED_PUBLISH)', () => {
    const { status, saida } = rodar({ ...CHROME, CHROME_EXTENSION_ID: 'abc' })
    expect(status).toBe(0)
    expect(saida).toContain(
      `PNPM exec wxt submit --chrome-zip ${zip('chrome')}\n`,
    )
    expect(saida).toContain('CHROME_PUBLISH_TYPE=<unset>')
    expect(saida).toContain('CHROME_EXTENSION_ID=abc')
  })

  it('ADIAR_CHROME=true liga o STAGED_PUBLISH', () => {
    const { saida } = rodar({ ...CHROME, ADIAR_CHROME: 'true' })
    expect(saida).toContain('CHROME_PUBLISH_TYPE=STAGED_PUBLISH')
  })

  it('ADIAR_CHROME vazio (push de tag) e CHROME_PUBLISH_TYPE vazio herdado não chegam ao publicador', () => {
    const { saida } = rodar({
      ...CHROME,
      ADIAR_CHROME: '',
      CHROME_PUBLISH_TYPE: '',
    })
    expect(saida).toContain('CHROME_PUBLISH_TYPE=<unset>')
  })

  it('Firefox manda o zip de fontes junto', () => {
    const { saida } = rodar(FIREFOX)
    expect(saida).toContain(
      `PNPM exec wxt submit --firefox-zip ${zip('firefox')} --firefox-sources-zip ${zip('sources')}\n`,
    )
  })

  it('Edge usa o zip do Chrome', () => {
    const { saida } = rodar(EDGE)
    expect(saida).toContain(
      `PNPM exec wxt submit --edge-zip ${zip('chrome')}\n`,
    )
  })

  it('as três lojas num só wxt submit', () => {
    const { status, saida } = rodar({ ...CHROME, ...FIREFOX, ...EDGE })
    expect(status).toBe(0)
    expect(saida).toContain('::notice::submeter: Chrome Firefox Edge')
    expect(saida).toContain(
      `PNPM exec wxt submit --chrome-zip ${zip('chrome')} --firefox-zip ${zip('firefox')} --firefox-sources-zip ${zip('sources')} --edge-zip ${zip('chrome')}\n`,
    )
  })

  it('loja sem secret não recebe as variables dela (o publicador validaria valor vazio)', () => {
    const { saida } = rodar({
      ...FIREFOX,
      CHROME_EXTENSION_ID: '',
      EDGE_PRODUCT_ID: 'produto',
    })
    expect(saida).toContain('CHROME_EXTENSION_ID=<unset>')
    expect(saida).toContain('EDGE_PRODUCT_ID=<unset>')
  })

  it('secret pela metade é erro de cadastro, não loja pulada', () => {
    const { status, saida } = rodar({ FIREFOX_JWT_ISSUER: 'emissor' })
    expect(status).toBe(1)
    expect(saida).toContain('::error::Firefox: só parte dos secrets')
    expect(saida).not.toContain('PNPM')
  })
})

describe('workflow_dispatch: o input lojas decide', () => {
  const dispatch = (entrada: string, extra: Record<string, string> = {}) =>
    rodar({ EVENTO: 'workflow_dispatch', ENTRADA_LOJAS: entrada, ...extra })

  it('nenhuma só imprime', () => {
    const { status, saida } = dispatch('nenhuma', CHROME)
    expect(status).toBe(0)
    expect(saida).toContain('::notice::Chrome: wxt submit')
    expect(saida).not.toContain('PNPM')
  })

  it('dry-run disparado a partir de uma tag continua dry-run (não vira submeter)', () => {
    const { status, saida } = dispatch('dry-run', {
      ...EDGE,
      ORIGEM_REF: `refs/tags/botai-v${VERSAO}`,
    })
    expect(status).toBe(0)
    expect(saida).toContain('::notice::dry-run: Edge')
    expect(saida).toContain(
      `PNPM exec wxt submit --edge-zip ${zip('chrome')} --dry-run\n`,
    )
  })

  it('dry-run aceita qualquer branch', () => {
    const { status } = dispatch('dry-run', {
      ...EDGE,
      ORIGEM_REF: 'refs/heads/feat/qualquer',
    })
    expect(status).toBe(0)
  })

  it('submeter a partir da main é aceito', () => {
    const { status, saida } = dispatch('submeter', {
      ...CHROME,
      ORIGEM_REF: 'refs/heads/main',
    })
    expect(status).toBe(0)
    expect(saida).toContain(
      `PNPM exec wxt submit --chrome-zip ${zip('chrome')}\n`,
    )
  })

  it('submeter a partir de outra branch é recusado', () => {
    const { status, saida } = dispatch('submeter', {
      ...CHROME,
      ORIGEM_REF: 'refs/heads/feat/qualquer',
    })
    expect(status).toBe(1)
    expect(saida).toContain('::error::submeter só roda a partir da main')
    expect(saida).not.toContain('PNPM')
  })

  it('valor desconhecido é erro', () => {
    const { status, saida } = dispatch('publicar')
    expect(status).toBe(1)
    expect(saida).toContain('::error::Modo desconhecido: publicar')
  })
})

it('evento sem modo definido é erro', () => {
  const { status, saida } = rodar({ EVENTO: 'schedule' })
  expect(status).toBe(1)
  expect(saida).toContain('::error::Evento sem modo definido: schedule')
})
```

- [ ] **Step 2: Ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/wxt prepare && ./node_modules/.bin/vitest run scripts/submeter-lojas.test.ts; echo "exit=$?"`
Expected: os 18 testes falhando (o bash não acha o script; nenhum `::notice::` na saída) e `exit=1`.

- [ ] **Step 3: O script**

`apps/botai/scripts/submeter-lojas.sh` (portado do job `lojas` do rascunho do `botai-release.yml`, `publicacao.md` §5.3, com o modo pelo evento e as travas acima):

```bash
#!/usr/bin/env bash
# Chamado pelo job `lojas` do botai-release.yml; ver "Publicação" no apps/botai/CLAUDE.md.
set -euo pipefail

: "${EVENTO:?EVENTO: o github.event_name}"
: "${VERSAO:?VERSAO: a versão do apps/botai/package.json}"
: "${PASTA_ZIPS:?PASTA_ZIPS: a pasta do artifact botai-zips}"

chrome="$PASTA_ZIPS/botai-$VERSAO-chrome.zip"
firefox="$PASTA_ZIPS/botai-$VERSAO-firefox.zip"
fontes="$PASTA_ZIPS/botai-$VERSAO-sources.zip"
opera="$PASTA_ZIPS/botai-$VERSAO-opera.zip"

for zip in "$chrome" "$firefox" "$fontes" "$opera"; do
  if [ ! -f "$zip" ]; then
    echo "::error::Falta $zip no artifact botai-zips."
    exit 1
  fi
done

case "$EVENTO" in
  pull_request) modo=nenhuma ;;
  push) modo=submeter ;;
  workflow_dispatch) modo=${ENTRADA_LOJAS:-nenhuma} ;;
  *)
    echo "::error::Evento sem modo definido: $EVENTO."
    exit 1
    ;;
esac

case "$modo" in
  nenhuma)
    echo "::notice::Chrome: wxt submit --chrome-zip $chrome"
    echo "::notice::Firefox: wxt submit --firefox-zip $firefox --firefox-sources-zip $fontes"
    echo "::notice::Edge: wxt submit --edge-zip $chrome"
    echo "::notice::Opera: envio manual de $opera (a loja não tem API oficial)"
    exit 0
    ;;
  dry-run | submeter) ;;
  *)
    echo "::error::Modo desconhecido: $modo (use nenhuma, dry-run ou submeter)."
    exit 1
    ;;
esac

if [ "$modo" = submeter ]; then
  case "${ORIGEM_REF:-}" in
    refs/heads/main | refs/tags/botai-v*) ;;
    *)
      echo "::error::submeter só roda a partir da main ou de uma tag botai-v* (veio de ${ORIGEM_REF:-ref vazia})."
      exit 1
      ;;
  esac
fi

# 0 = todos os secrets da loja existem; 1 = nenhum; parcial é erro de cadastro.
secrets_da_loja() {
  local loja=$1 presentes=0 total=0 nome
  shift
  for nome in "$@"; do
    total=$((total + 1))
    if [ -n "${!nome:-}" ]; then presentes=$((presentes + 1)); fi
  done
  if [ "$presentes" -eq 0 ]; then return 1; fi
  if [ "$presentes" -lt "$total" ]; then
    echo "::error::$loja: só parte dos secrets ($*) está cadastrada no environment lojas-botai."
    exit 1
  fi
  return 0
}

args=()
lojas=""

if secrets_da_loja Chrome CHROME_SERVICE_ACCOUNT_PRIVATE_KEY; then
  args+=(--chrome-zip "$chrome")
  lojas="$lojas Chrome"
  if [ "${ADIAR_CHROME:-}" = true ]; then
    export CHROME_PUBLISH_TYPE=STAGED_PUBLISH
  else
    unset CHROME_PUBLISH_TYPE
  fi
else
  unset CHROME_API_VERSION CHROME_EXTENSION_ID CHROME_PUBLISHER_ID \
    CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL CHROME_SERVICE_ACCOUNT_PRIVATE_KEY CHROME_PUBLISH_TYPE
fi

if secrets_da_loja Firefox FIREFOX_JWT_ISSUER FIREFOX_JWT_SECRET; then
  args+=(--firefox-zip "$firefox" --firefox-sources-zip "$fontes")
  lojas="$lojas Firefox"
else
  unset FIREFOX_EXTENSION_ID FIREFOX_CHANNEL FIREFOX_COMPATIBILITY FIREFOX_JWT_ISSUER FIREFOX_JWT_SECRET
fi

if secrets_da_loja Edge EDGE_CLIENT_ID EDGE_API_KEY; then
  args+=(--edge-zip "$chrome")
  lojas="$lojas Edge"
else
  unset EDGE_PRODUCT_ID EDGE_CLIENT_ID EDGE_API_KEY
fi

if [ -z "$lojas" ]; then
  echo "::notice::Nenhuma loja com secrets no environment lojas-botai: nada a submeter."
  exit 0
fi

if [ "$modo" = dry-run ]; then args+=(--dry-run); fi
echo "::notice::$modo:$lojas"
exec pnpm exec wxt submit "${args[@]}"
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && chmod +x apps/botai/scripts/submeter-lojas.sh && /opt/homebrew/bin/shellcheck apps/botai/scripts/submeter-lojas.sh; echo "exit=$?"
```

Expected: `exit=0`, sem achados. O script roda no `/bin/bash` 3.2 do Mac e no bash 5 do Ubuntu (nada de `${arr[@]}` vazio sob `set -u`: as lojas são contadas numa string).

- [ ] **Step 4: Ver passar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run scripts/submeter-lojas.test.ts; echo "exit=$?"`
Expected: `18 passed` e `exit=0`.

- [ ] **Step 5: O canário do Tailwind (Review Focus 4) e o `@source not`**

O Tailwind varre os arquivos de texto da pasta do app, e não só o `src/` (medido no protótipo: uma utility escrita num `.md` de `apps/botai/loja/` entrou no CSS do popup). `scripts/` já existe desde a fase 1 e `loja/` chega na Task 6. Primeiro o hash de referência e o canário vermelho:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/wxt build >/dev/null && /usr/bin/find .output/chrome-mv3 -name '*.css' -exec /usr/bin/shasum {} \; | /usr/bin/awk '{print $1}' | /usr/bin/sort > /private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/css-antes.txt && /bin/cp .output/chrome-mv3/assets/popup-*.css /private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/css-antes.css; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && mkdir -p loja && printf 'canario skew-x-12 hue-rotate-60\n' > loja/canario.md && printf '# canario skew-x-12\n' > scripts/canario.sh && ./node_modules/.bin/wxt build >/dev/null && /usr/bin/grep -c -e 'skew-x-12' -e 'hue-rotate-60' .output/chrome-mv3/assets/*.css; echo "exit=$?"
```

Expected: `exit=0` no primeiro; no segundo, uma contagem **≥ 1** e `exit=0` (o canário entrou no CSS da extensão: vermelho).

`apps/botai/src/styles.css`: depois das linhas `@source not` da fase 1 (as dos `*.test.*`), acrescente:

```css
/* O material das lojas e os scripts do app não podem mudar o CSS da extensão. */
@source not '../loja';
@source not '../scripts';
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/wxt build >/dev/null && /usr/bin/grep -c -e 'skew-x-12' -e 'hue-rotate-60' .output/chrome-mv3/assets/*.css; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && rm loja/canario.md scripts/canario.sh && rmdir loja && ./node_modules/.bin/wxt build >/dev/null && /usr/bin/find .output/chrome-mv3 -name '*.css' -exec /usr/bin/shasum {} \; | /usr/bin/awk '{print $1}' | /usr/bin/sort | /usr/bin/diff - /private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/css-antes.txt && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3; echo "exit=$?"
```

Expected: `0` e `exit=1` no primeiro (o canário sumiu, mesmo com os arquivos lá); `exit=0` no segundo (sem canário, o CSS é byte a byte o de antes, e o gate do design system passa). O protótipo não tinha o `scripts/reproduzir-fontes.sh` da fase 1; se o segundo comando der diferença, algum arquivo de `scripts/` já punha uma utility no CSS. Veja qual regra saiu com `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && /usr/bin/diff <(/usr/bin/tr '}' '\n' < /private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/css-antes.css) <(/usr/bin/tr '}' '\n' < .output/chrome-mv3/assets/popup-*.css)`: se só saíram regras cuja classe aparece em `scripts/` e em nenhum `.tsx` de `src/` ou de `packages/ui/src/` (`/usr/bin/grep -rn` pela classe), siga, porque é o efeito pedido do `@source not`; se saiu algo que o popup usa, pare.

- [ ] **Step 6: `prettier:fix` cobre as pastas novas**

`apps/botai/package.json`, troque o script `prettier:fix` por:

```json
    "prettier:fix": "prettier --write \"{src,.storybook,loja,scripts}/**/*.{ts,tsx,css,html,md}\" \"*.{ts,mjs,json,md}\""
```

- [ ] **Step 7: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/prettier --check scripts vitest.config.ts src/styles.css package.json && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint && $P run test; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/scripts/submeter-lojas.sh apps/botai/scripts/submeter-lojas.test.ts apps/botai/vitest.config.ts apps/botai/src/styles.css apps/botai/package.json && /usr/bin/git commit -m "feat(botai): script do job lojas monta o wxt submit só das lojas com secrets"; echo "exit=$?"
```

Expected: `exit=0` nos dois (se o prettier reclamar, rode o `--write` nos mesmos caminhos e repita).

---

### Task 2: Versão e tag (`versao-botai`, `release-botai` e a conferência da tag)

**Files:**

- Create: `apps/botai/scripts/repo-de-teste.ts`
- Create: `apps/botai/scripts/conferir-tag.sh`, `apps/botai/scripts/versao.sh`, `apps/botai/scripts/release.sh`
- Test: `apps/botai/scripts/conferir-tag.test.ts`, `apps/botai/scripts/versao.test.ts`, `apps/botai/scripts/release.test.ts`
- Modify: `Makefile` (`.PHONY`, alvos `versao-botai` e `release-botai`)

**Interfaces:**

- Consumes: o `include` de `scripts/**/*.test.ts` (Task 1).
- Produces:
  - `criarRepoDeTeste(versao: string): RepoDeTeste`, com `trabalho: string`, `git(...args): string`, `gitDaOrigem(...args): string`, `escreverVersao(versao): void`, `argsDoGh(): string[] | null`, `rodar(script, args?, extra?): { status: number | null; saida: string }` e `fechar(): void` (repositório com `apps/botai/package.json`, origem bare e um `gh` falso que grava os argumentos);
  - `bash apps/botai/scripts/conferir-tag.sh <tag> <commit ou objeto da tag>` → `exit 0` ou `::error::` + `exit 1` (a Task 3 chama no job `pacotes`);
  - `make versao-botai V=x.y.z` → `bash apps/botai/scripts/versao.sh x.y.z`;
  - `make release-botai` → `bash apps/botai/scripts/release.sh`.

- [ ] **Step 1: O repositório de teste e os testes que falham**

`apps/botai/scripts/repo-de-teste.ts`:

```ts
import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export interface RepoDeTeste {
  trabalho: string
  git: (...args: string[]) => string
  gitDaOrigem: (...args: string[]) => string
  escreverVersao: (versao: string) => void
  argsDoGh: () => string[] | null
  rodar: (
    script: string,
    args?: string[],
    extra?: Record<string, string>,
  ) => { status: number | null; saida: string }
  fechar: () => void
}

// Git isolado da configuração de quem roda (assinatura de commit, hooks, aliases).
const ENV_GIT = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Teste',
  GIT_AUTHOR_EMAIL: 'teste@exemplo.com',
  GIT_COMMITTER_NAME: 'Teste',
  GIT_COMMITTER_EMAIL: 'teste@exemplo.com',
}

export function criarRepoDeTeste(versao: string): RepoDeTeste {
  const pasta = mkdtempSync(path.join(tmpdir(), 'botai-repo-'))
  const origem = path.join(pasta, 'origem.git')
  const trabalho = path.join(pasta, 'trabalho')
  const bin = path.join(pasta, 'bin')
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: pasta, ...ENV_GIT }
  const executar = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim()

  mkdirSync(bin)
  writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${path.join(pasta, 'gh.args')}"\n`,
    { mode: 0o755 },
  )
  execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', origem], {
    env,
  })
  execFileSync('git', ['clone', '--quiet', origem, trabalho], { env })
  const escreverVersao = (v: string) => {
    mkdirSync(path.join(trabalho, 'apps/botai'), { recursive: true })
    writeFileSync(
      path.join(trabalho, 'apps/botai/package.json'),
      `${JSON.stringify({ name: '@pilutech/botai', version: v, private: true }, null, 2)}\n`,
    )
  }
  escreverVersao(versao)
  executar(trabalho, ['switch', '--quiet', '-c', 'main'])
  executar(trabalho, ['add', '.'])
  executar(trabalho, ['commit', '--quiet', '-m', 'inicial'])
  executar(trabalho, ['push', '--quiet', '-u', 'origin', 'main'])

  return {
    trabalho,
    git: (...args) => executar(trabalho, args),
    gitDaOrigem: (...args) => executar(origem, args),
    escreverVersao,
    argsDoGh: () => {
      const arquivo = path.join(pasta, 'gh.args')
      return existsSync(arquivo)
        ? readFileSync(arquivo, 'utf8').trimEnd().split('\n')
        : null
    },
    rodar: (script, args = [], extra = {}) => {
      const r = spawnSync('bash', [script, ...args], {
        cwd: trabalho,
        env: { ...env, ...extra },
        encoding: 'utf8',
      })
      return { status: r.status, saida: `${r.stdout}${r.stderr}` }
    },
    fechar: () => rmSync(pasta, { recursive: true, force: true }),
  }
}
```

O `env` dos scripts tem só `PATH`, `HOME` e as variáveis do git: o `pnpm` real (que o `versao.sh` chama) não herda as `npm_config_*` de quem roda o Vitest por dentro de um `pnpm`.

`apps/botai/scripts/conferir-tag.test.ts`:

```ts
// @vitest-environment node
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { criarRepoDeTeste, type RepoDeTeste } from './repo-de-teste'

const SCRIPT = path.resolve(import.meta.dirname, 'conferir-tag.sh')
let repo: RepoDeTeste

beforeEach(() => {
  repo = criarRepoDeTeste('1.0.0')
})
afterEach(() => repo.fechar())

it('aceita botai-v<versão do package.json> num commit da main', () => {
  const { status, saida } = repo.rodar(SCRIPT, [
    'botai-v1.0.0',
    repo.git('rev-parse', 'HEAD'),
  ])
  expect(saida).toContain('Tag botai-v1.0.0 confere')
  expect(status).toBe(0)
})

it('recusa a tag que não bate com a versão do package.json', () => {
  const { status, saida } = repo.rodar(SCRIPT, [
    'botai-v1.0.1',
    repo.git('rev-parse', 'HEAD'),
  ])
  expect(status).toBe(1)
  expect(saida).toContain(
    '::error::A tag botai-v1.0.1 não bate com a versão de apps/botai/package.json (esperado botai-v1.0.0)',
  )
})

it('recusa a tag num commit que não está na main', () => {
  repo.git('switch', '--quiet', '-c', 'feat/x')
  repo.git('commit', '--quiet', '--allow-empty', '-m', 'fora da main')
  const { status, saida } = repo.rodar(SCRIPT, [
    'botai-v1.0.0',
    repo.git('rev-parse', 'HEAD'),
  ])
  expect(status).toBe(1)
  expect(saida).toContain('não está na main')
})

it('aceita o objeto de uma tag anotada no lugar do commit', () => {
  repo.git('tag', '-a', 'botai-v1.0.0', '-m', 'Botaí 1.0.0')
  const { status } = repo.rodar(SCRIPT, [
    'botai-v1.0.0',
    repo.git('rev-parse', 'botai-v1.0.0'),
  ])
  expect(status).toBe(0)
})
```

`apps/botai/scripts/versao.test.ts`:

```ts
// @vitest-environment node
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { criarRepoDeTeste, type RepoDeTeste } from './repo-de-teste'

const SCRIPT = path.resolve(import.meta.dirname, 'versao.sh')
let repo: RepoDeTeste

beforeEach(() => {
  repo = criarRepoDeTeste('1.0.0')
})
afterEach(() => repo.fechar())

it('abre o PR de versão: branch da origin/main, só o package.json, sem tag', () => {
  const { status, saida } = repo.rodar(SCRIPT, ['1.1.0'])
  expect(saida).not.toContain('::error')
  expect(status).toBe(0)
  const ramo = 'chore/botai-v1.1.0'
  expect(repo.gitDaOrigem('log', '-1', '--format=%s', ramo)).toBe(
    'chore(botai): versão 1.1.0',
  )
  expect(
    repo.gitDaOrigem('diff', '--name-only', 'main', ramo).split('\n'),
  ).toEqual(['apps/botai/package.json'])
  expect(
    JSON.parse(repo.gitDaOrigem('show', `${ramo}:apps/botai/package.json`))
      .version,
  ).toBe('1.1.0')
  expect(repo.gitDaOrigem('tag', '--list')).toBe('')
  expect(repo.argsDoGh()).toEqual([
    'pr',
    'create',
    '--base',
    'main',
    '--head',
    ramo,
    '--title',
    'chore(botai): versão 1.1.0',
    '--body',
    'Sobe o Botaí para 1.1.0. Depois do merge, na main: make release-botai.',
  ])
})

it.each([['1.1'], ['v1.1.0'], ['1.1.0-beta.1']])(
  'recusa V=%s, que não é x.y.z',
  (v) => {
    const { status, saida } = repo.rodar(SCRIPT, [v])
    expect(status).toBe(1)
    expect(saida).toContain('não é x.y.z')
    expect(repo.argsDoGh()).toBeNull()
  },
)

it.each([['1.0.0'], ['0.9.9']])(
  'recusa V=%s, que não sobe a versão da main',
  (v) => {
    const { status, saida } = repo.rodar(SCRIPT, [v])
    expect(status).toBe(1)
    expect(saida).toContain('precisa ser maior que a versão da main (1.0.0)')
  },
)

it('compara pela origin/main, não pela branch local', () => {
  repo.git('switch', '--quiet', '-c', 'feat/x')
  repo.escreverVersao('3.0.0')
  repo.git('commit', '--quiet', '-am', 'versão local')
  expect(repo.rodar(SCRIPT, ['1.0.1']).status).toBe(0)
})

it('recusa árvore suja', () => {
  writeFileSync(path.join(repo.trabalho, 'rascunho.txt'), 'x')
  const { status, saida } = repo.rodar(SCRIPT, ['1.1.0'])
  expect(status).toBe(1)
  expect(saida).toContain('mudanças não commitadas')
})
```

`apps/botai/scripts/release.test.ts`:

```ts
// @vitest-environment node
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { criarRepoDeTeste, type RepoDeTeste } from './repo-de-teste'

const SCRIPT = path.resolve(import.meta.dirname, 'release.sh')
let repo: RepoDeTeste

beforeEach(() => {
  repo = criarRepoDeTeste('1.0.0')
})
afterEach(() => repo.fechar())

it('cria a tag anotada botai-v<versão> no HEAD da main e a envia à origem', () => {
  const { status, saida } = repo.rodar(SCRIPT)
  expect(saida).toContain('Tag botai-v1.0.0 enviada')
  expect(status).toBe(0)
  expect(repo.gitDaOrigem('cat-file', '-t', 'botai-v1.0.0')).toBe('tag')
  expect(repo.gitDaOrigem('rev-parse', 'botai-v1.0.0^{commit}')).toBe(
    repo.git('rev-parse', 'origin/main'),
  )
  expect(
    repo.gitDaOrigem(
      'for-each-ref',
      '--format=%(contents:subject)',
      'refs/tags/botai-v1.0.0',
    ),
  ).toBe('Botaí 1.0.0')
})

it('recusa quando o HEAD não é a origin/main', () => {
  repo.git('commit', '--quiet', '--allow-empty', '-m', 'só local')
  const { status, saida } = repo.rodar(SCRIPT)
  expect(status).toBe(1)
  expect(saida).toContain('HEAD não é a origin/main')
  expect(repo.gitDaOrigem('tag', '--list')).toBe('')
})

it('recusa quando a tag já existe na origem', () => {
  expect(repo.rodar(SCRIPT).status).toBe(0)
  repo.git('tag', '-d', 'botai-v1.0.0')
  const { status, saida } = repo.rodar(SCRIPT)
  expect(status).toBe(1)
  expect(saida).toContain('A tag botai-v1.0.0 já existe')
})

it('recusa árvore suja', () => {
  writeFileSync(path.join(repo.trabalho, 'rascunho.txt'), 'x')
  const { status, saida } = repo.rodar(SCRIPT)
  expect(status).toBe(1)
  expect(saida).toContain('mudanças não commitadas')
})
```

- [ ] **Step 2: Ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run scripts/conferir-tag.test.ts scripts/versao.test.ts scripts/release.test.ts; echo "exit=$?"`
Expected: os 16 testes falhando (`bash: …/conferir-tag.sh: No such file or directory` e afins) e `exit=1`.

- [ ] **Step 3: `conferir-tag.sh`**

`apps/botai/scripts/conferir-tag.sh`:

```bash
#!/usr/bin/env bash
# Uso: conferir-tag.sh <tag> <commit ou objeto da tag>, na raiz do repo, com origin/main buscado.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

tag=${1:?uso: conferir-tag.sh <tag> <commit>}
sha=${2:?uso: conferir-tag.sh <tag> <commit>}
versao=$(node -p "require('./apps/botai/package.json').version")

if [ "$tag" != "botai-v$versao" ]; then
  echo "::error::A tag $tag não bate com a versão de apps/botai/package.json (esperado botai-v$versao)."
  exit 1
fi
if ! git merge-base --is-ancestor "$sha^{commit}" origin/main; then
  echo "::error::O commit $sha da tag $tag não está na main."
  exit 1
fi
echo "Tag $tag confere com apps/botai/package.json e está na main."
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run scripts/conferir-tag.test.ts; echo "exit=$?"`
Expected: `4 passed`, `exit=0`.

- [ ] **Step 4: `versao.sh`**

`apps/botai/scripts/versao.sh`:

```bash
#!/usr/bin/env bash
# Chamado por `make versao-botai V=x.y.z`; ver "Publicação" no apps/botai/CLAUDE.md.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

nova=${1:?uso: make versao-botai V=x.y.z}
if ! [[ "$nova" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "V=$nova não é x.y.z: as lojas só aceitam versão numérica." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Há mudanças não commitadas: o PR de versão sai de uma árvore limpa." >&2
  exit 1
fi

git fetch --quiet origin main
atual=$(git show origin/main:apps/botai/package.json | node -p "JSON.parse(require('fs').readFileSync(0, 'utf8')).version")
if ! node -e '
  const [a, b] = process.argv.slice(1).map((v) => v.split(".").map(Number))
  process.exit((a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) > 0 ? 0 : 1)
' "$nova" "$atual"; then
  echo "V=$nova precisa ser maior que a versão da main ($atual): as lojas recusam versão repetida ou menor." >&2
  exit 1
fi

branch="chore/botai-v$nova"
git switch --quiet -c "$branch" origin/main
(cd apps/botai && pnpm version "$nova" --no-git-tag-version)
git add apps/botai/package.json
git commit --quiet -m "chore(botai): versão $nova"
git push --quiet -u origin "$branch"
gh pr create --base main --head "$branch" \
  --title "chore(botai): versão $nova" \
  --body "Sobe o Botaí para $nova. Depois do merge, na main: make release-botai."
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run scripts/versao.test.ts; echo "exit=$?"`
Expected: `8 passed`, `exit=0` (o teste usa o `pnpm` real do `PATH`; o `pnpm version 1.0.0 --no-git-tag-version` foi medido no pnpm 11.1.1: só reescreve o `package.json`).

- [ ] **Step 5: `release.sh`**

`apps/botai/scripts/release.sh`:

```bash
#!/usr/bin/env bash
# Chamado por `make release-botai`, na main, depois do merge do PR de versão; ver "Publicação" no apps/botai/CLAUDE.md.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

git fetch --quiet --tags origin main
if [ -n "$(git status --porcelain)" ]; then
  echo "Há mudanças não commitadas: o release sai de uma árvore limpa." >&2
  exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "HEAD não é a origin/main: rode git switch main && git pull antes do release." >&2
  exit 1
fi

versao=$(node -p "require('./apps/botai/package.json').version")
tag="botai-v$versao"
if git rev-parse --quiet --verify "refs/tags/$tag" >/dev/null; then
  echo "A tag $tag já existe: suba a versão com make versao-botai V=x.y.z." >&2
  exit 1
fi

git tag -a "$tag" -m "Botaí $versao"
git push --quiet origin "$tag"
echo "Tag $tag enviada: o botai-release.yml gera o GitHub Release e espera a aprovação do job lojas."
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run scripts/; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && chmod +x apps/botai/scripts/conferir-tag.sh apps/botai/scripts/versao.sh apps/botai/scripts/release.sh && /opt/homebrew/bin/shellcheck apps/botai/scripts/*.sh; echo "exit=$?"
```

Expected: `4 passed` arquivos de teste, `34 passed` testes, `exit=0`; shellcheck sem achados, `exit=0`.

- [ ] **Step 6: Alvos do Makefile**

`Makefile`: acrescente `versao-botai release-botai` ao fim da última linha do `.PHONY` (que termina em `zip-botai` desde a fase 1) e, depois do alvo `zip-botai`:

```make
# Versão e release do Botaí (ver "Publicação" em apps/botai/CLAUDE.md). O repo só
# aceita squash: o bump vai num PR e a tag sai na main depois do merge.
versao-botai:
	@test -n "$(V)" || { echo "uso: make versao-botai V=x.y.z" >&2; exit 1; }
	bash apps/botai/scripts/versao.sh $(V)

release-botai:
	bash apps/botai/scripts/release.sh
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/make versao-botai; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/make -n versao-botai V=1.0.1 && /usr/bin/make -n release-botai; echo "exit=$?"
```

Expected: `uso: make versao-botai V=x.y.z` e `exit=2` no primeiro; no segundo, as linhas `bash apps/botai/scripts/versao.sh 1.0.1` e `bash apps/botai/scripts/release.sh` impressas **sem rodar** (`-n`) e `exit=0`. Não rode os dois alvos sem `-n`: eles dão push.

- [ ] **Step 7: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/prettier --check scripts && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/scripts/repo-de-teste.ts apps/botai/scripts/conferir-tag.sh apps/botai/scripts/conferir-tag.test.ts apps/botai/scripts/versao.sh apps/botai/scripts/versao.test.ts apps/botai/scripts/release.sh apps/botai/scripts/release.test.ts Makefile && /usr/bin/git commit -m "feat(botai): make versao-botai e make release-botai, com a tag conferida contra o package.json e a main"; echo "exit=$?"
```

Expected: `exit=0` nos dois.

---

### Task 3: `botai-release.yml` — tag, Release e o job `lojas`

**Files:**

- Modify: `.github/workflows/botai-release.yml` (arquivo inteiro, a partir do da fase 1)
- Test: `actionlint` local e em Docker, e a simulação local do job `lojas` no modo de PR

**Interfaces:**

- Consumes: o job `pacotes` e o artifact `botai-zips` da fase 1 (Task 12 do plano da fase 1); `apps/botai/scripts/conferir-tag.sh` (Task 2); `apps/botai/scripts/submeter-lojas.sh` (Task 1).
- Produces: `pacotes.outputs.versao`; o job `release` (só no push de tag); o job `lojas`.

- [ ] **Step 1: Ver o que falta**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/grep -n -e "tags: \['botai-v\*'\]" -e '^  release:' -e '^  lojas:' -e 'outputs:' -e 'fetch-depth: 0' .github/workflows/botai-release.yml; echo "exit=$?"
```

Expected: nenhuma linha e `exit=1` (a fase 1 deixou só o `pacotes`, em PR e dispatch).

Compare o arquivo atual com o bloco do Step 3 da Task 12 do plano da fase 1: se a fase 1 mudou alguma coisa no job `pacotes` (um passo a mais, outro Node, outro nome), leve essa diferença para o arquivo do Step 2 no mesmo lugar. O que este passo muda no `pacotes` é só: `outputs`, o `fetch-depth: 0` e o passo "Tag = botai-v…"; o comentário do topo, o gatilho de PR, o `concurrency` e o `permissions` da fase 1 ficam como estão. Fora do `pacotes`, entram o gatilho de tag, os inputs do dispatch e os jobs `release` e `lojas`.

- [ ] **Step 2: O workflow inteiro**

`.github/workflows/botai-release.yml`:

```yaml
name: Botaí Release

# Fora do `CI` de propósito: o deploy do finanças espera o `CI` inteiro passar,
# e a reprodução das fontes não pode segurá-lo.
on:
  push:
    tags: ['botai-v*']
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
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

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

      - name: Tag = botai-v<versão do package.json>, num commit da main
        if: github.event_name == 'push'
        run: bash apps/botai/scripts/conferir-tag.sh "$GITHUB_REF_NAME" "$GITHUB_SHA"

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

  release:
    name: GitHub Release
    needs: pacotes
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/download-artifact@v4
        with:
          name: botai-zips
          path: botai-zips

      - name: Notas (commits do Botaí desde a tag anterior)
        env:
          VERSAO: ${{ needs.pacotes.outputs.versao }}
        run: |
          set -euo pipefail
          anterior=$(git describe --tags --abbrev=0 --match 'botai-v*' "$GITHUB_REF_NAME^" 2>/dev/null || true)
          {
            echo "## Botaí $VERSAO"
            echo
            git log --no-merges --format='- %s (%h)' "${anterior:+$anterior..}$GITHUB_REF_NAME" -- apps/botai packages/tools packages/ui
          } > notas.md
          cat notas.md

      # --latest=false: num monorepo, o release do Botaí não pode virar o "Latest" do repositório.
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
    runs-on: ubuntu-latest
    timeout-minutes: 30
    # Vazio no PR e no dispatch "nenhuma": sem environment não há secrets, e nada é enviado.
    environment: ${{ (github.event_name != 'pull_request' && inputs.lojas != 'nenhuma') && 'lojas-botai' || '' }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/download-artifact@v4
        with:
          name: botai-zips
          path: botai-zips

      - name: actionlint deste workflow
        if: github.event_name == 'pull_request'
        run: >-
          docker run --rm -v "$GITHUB_WORKSPACE:/repo" --workdir /repo
          rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667
          -color .github/workflows/botai-release.yml

      - uses: pnpm/action-setup@v4
        if: github.event_name != 'pull_request'

      - uses: actions/setup-node@v4
        if: github.event_name != 'pull_request'
        with:
          node-version: '22'
          cache: pnpm

      - name: Install dependencies
        if: github.event_name != 'pull_request'
        run: pnpm install --frozen-lockfile

      - name: wxt submit (só as lojas com secrets)
        working-directory: apps/botai
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

Pontos que o revisor deve conferir no arquivo, porque nenhum teste local os pega:

- a expressão do `environment` tem o nome **depois** do `&&`: `cond && 'lojas-botai' || ''`. A forma invertida (`cond && '' || 'lojas-botai'`) daria sempre `lojas-botai`, porque `''` é falso nas expressões do Actions;
- no push de tag, `inputs.lojas` é nulo, e `null != 'nenhuma'` é verdadeiro: a tag pede aprovação;
- o modo do job sai do `github.event_name` (no script), e não do `github.ref_type`: um dispatch rodado numa tag com `dry-run` continua dry-run (Review Focus 1);
- `conferir-tag.sh` recebe o `GITHUB_SHA` e descasca `^{commit}`, então tanto faz o Actions entregar o commit ou o objeto da tag anotada.

- [ ] **Step 3: actionlint**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /opt/homebrew/bin/actionlint -color .github/workflows/botai-release.yml .github/workflows/ci.yml .github/workflows/botai-e2e.yml; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/local/bin/docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color .github/workflows/botai-release.yml; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && apps/botai/node_modules/.bin/prettier --check .github/workflows/botai-release.yml; echo "exit=$?"
```

Expected: `exit=0` nos três (o `shellcheck` de `/opt/homebrew/bin` roda junto com o `actionlint` local; o segundo é exatamente o que o job `lojas` roda no PR).

- [ ] **Step 4: Simular localmente o job `lojas`**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/make zip-botai >/dev/null; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && env -i PATH="$PATH" HOME="$HOME" EVENTO=pull_request ORIGEM_REF=refs/pull/1/merge VERSAO="$(node -p "require('./package.json').version")" PASTA_ZIPS="$PWD/.output" bash scripts/submeter-lojas.sh; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && env -i PATH="$PATH" HOME="$HOME" EVENTO=push ORIGEM_REF="refs/tags/botai-v$(node -p "require('./package.json').version")" VERSAO="$(node -p "require('./package.json').version")" PASTA_ZIPS="$PWD/.output" CHROME_API_VERSION=v2 FIREFOX_EXTENSION_ID=botai@pilutech.com.br FIREFOX_CHANNEL=listed FIREFOX_COMPATIBILITY=firefox bash scripts/submeter-lojas.sh; echo "exit=$?"
```

Expected: `exit=0` no `make`; no PR, as 4 linhas `::notice::Chrome: wxt submit --chrome-zip …/botai-<versão>-chrome.zip`, `::notice::Firefox: … --firefox-sources-zip …-sources.zip`, `::notice::Edge: wxt submit --edge-zip …-chrome.zip` e `::notice::Opera: envio manual de …-opera.zip`, com `exit=0`; no push sem secrets (a 1.0.0 do §7 da spec), `::notice::Nenhuma loja com secrets no environment lojas-botai: nada a submeter.` e `exit=0`. É o "job lojas em PR imprime o comando sem secrets" da fase; a prova no GitHub vem no primeiro PR (Task 10, lista do dono).

- [ ] **Step 5: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add .github/workflows/botai-release.yml && /usr/bin/git commit -m "ci(botai): tag gera o GitHub Release e o job lojas publica nas lojas com aprovação"; echo "exit=$?"
```

---

### Task 4: Versão 1.0.0

**Files:**

- Modify: `apps/botai/package.json` (`"version"`)
- Test: o `manifesto.e2e.ts` da fase 1 (lê a versão do `package.json`) e os nomes dos zips

**Interfaces:**

- Consumes: os builds e o `manifesto.e2e.ts` da fase 1.
- Produces: `version: "1.0.0"` nos 3 manifestos e os zips `botai-1.0.0-*.zip`.

- [ ] **Step 1: Ver o estado de hoje**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && node -p "require('./apps/botai/package.json').version" && /usr/bin/grep -rn "0\.1\.0" apps/botai --exclude-dir=node_modules --exclude-dir=.output --exclude-dir=.wxt --exclude-dir=storybook-static --exclude-dir=test-results --exclude-dir=playwright-report; echo "exit=$?"
```

Expected: `0.1.0` e uma única linha, a do `apps/botai/package.json` (o `manifesto.e2e.ts` lê a versão do `package.json` desde a fase 1). Se aparecer outro arquivo, troque a versão fixa por uma leitura do `package.json` ou por `<versão>` no texto, antes de seguir.

- [ ] **Step 2: Subir a versão**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P version 1.0.0 --no-git-tag-version; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git diff --stat && /usr/bin/git tag --list 'botai-v*'; echo "exit=$?"
```

Expected: `@pilutech/botai: 0.1.0 → 1.0.0` e `exit=0`; o diff só no `apps/botai/package.json` e nenhuma tag.

- [ ] **Step 3: Ver passar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run build && $P run build:firefox && $P run build:opera && $P run build:e2e && ./node_modules/.bin/playwright test manifesto.e2e.ts; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && rm -f apps/botai/.output/*.zip && /usr/bin/make zip-botai >/dev/null && /bin/ls apps/botai/.output/*.zip; echo "exit=$?"
```

Expected: os testes do `manifesto.e2e.ts` passando (`version: '1.0.0'` nos três manifestos) e `exit=0`; exatamente `botai-1.0.0-chrome.zip`, `botai-1.0.0-firefox.zip`, `botai-1.0.0-opera.zip` e `botai-1.0.0-sources.zip`, `exit=0`.

- [ ] **Step 4: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/package.json && /usr/bin/git commit -m "chore(botai): versão 1.0.0, a primeira pública"; echo "exit=$?"
```

---

### Task 5: Opção `aparencia` no fixture da extensão

**Files:**

- Modify: `apps/botai/src/test/extensao.fixture.ts`
- Test: `apps/botai/src/test/aparencia.e2e.ts`

**Interfaces:**

- Consumes: o fixture atual (`context`, `sw`, `extensionId`).
- Produces: `export interface Aparencia { tema: 'claro' | 'escuro'; escala: number }` e a opção `aparencia` (padrão `{ tema: 'claro', escala: 1 }`, que é o padrão do Playwright: os E2E atuais não mudam), usada com `test.use({ aparencia: { tema, escala } })` pelas capturas (Task 8).

- [ ] **Step 1: O teste que falha**

`apps/botai/src/test/aparencia.e2e.ts`:

```ts
import { expect, test } from './extensao.fixture'

const lerAparencia = () => ({
  escuro: matchMedia('(prefers-color-scheme: dark)').matches,
  escala: devicePixelRatio,
})

test('sem test.use, o contexto da extensão abre claro e a 1x', async ({
  context,
}) => {
  const pagina = await context.newPage()
  expect(await pagina.evaluate(lerAparencia)).toEqual({
    escuro: false,
    escala: 1,
  })
})

test.describe('com aparencia escura a 2x', () => {
  test.use({ aparencia: { tema: 'escuro', escala: 2 } })

  test('o contexto persistente recebe o tema e a escala', async ({
    context,
  }) => {
    const pagina = await context.newPage()
    expect(await pagina.evaluate(lerAparencia)).toEqual({
      escuro: true,
      escala: 2,
    })
  })
})
```

- [ ] **Step 2: Ver falhar**

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run build:e2e >/dev/null && ./node_modules/.bin/playwright test src/test/aparencia.e2e.ts; echo "exit=$?"`
Expected: o 1º passa e o 2º falha com `escuro: false` / `escala: 1` recebidos (o fixture monta o próprio `launchPersistentContext` e ignora o `test.use`), `exit=1`. Um erro de tipo/opção desconhecida no `test.use` também conta como vermelho.

- [ ] **Step 3: A opção no fixture**

`apps/botai/src/test/extensao.fixture.ts`, troque o trecho que vai da linha `export const test = base.extend<{` até a linha `      args: [` (inclusive; hoje são as 9 linhas com `context: async ({}, use) => {`, o `launchPersistentContext('', {` e o `channel: 'chromium',`) pelo bloco abaixo, que termina na mesma linha `      args: [`:

```ts
export interface Aparencia {
  tema: 'claro' | 'escuro'
  escala: number
}

export const test = base.extend<{
  aparencia: Aparencia
  context: BrowserContext
  sw: Worker
  extensionId: string
}>({
  // O contexto é persistente (montado aqui), então o test.use({ colorScheme }) do Playwright não chega a ele.
  aparencia: [{ tema: 'claro', escala: 1 }, { option: true }],
  context: async ({ aparencia }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      colorScheme: aparencia.tema === 'escuro' ? 'dark' : 'light',
      deviceScaleFactor: aparencia.escala,
      args: [
```

O resto do fixture (os `args` com a extensão, o `use(context)`, `sw`, `extensionId` e as funções exportadas) fica como está.

- [ ] **Step 4: Ver passar, sem regressão**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/playwright test src/test/aparencia.e2e.ts src/entrypoints/popup/; echo "exit=$?"
```

Expected: os 2 do `aparencia.e2e.ts` e todos os do popup passando, `exit=0`.

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/prettier --check src/test && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/src/test/extensao.fixture.ts apps/botai/src/test/aparencia.e2e.ts && /usr/bin/git commit -m "test(botai): opção aparencia (tema e escala) no fixture da extensão"; echo "exit=$?"
```

---

### Task 6: Textos das lojas (`apps/botai/loja/`)

**Files:**

- Create: `apps/botai/loja/textos.ts`
- Create: `apps/botai/loja/textos.md`, `apps/botai/loja/notas-revisores.md`, `apps/botai/loja/README.md`
- Test: `apps/botai/loja/textos.test.ts`
- Modify: `apps/botai/vitest.config.ts` (`include`)
- Modify: `apps/botai/manifesto.e2e.ts` (um teste novo)

**Interfaces:**

- Consumes: os manifestos `.output/chrome-mv3` e `.output/firefox-mv3` (fase 1) no E2E.
- Produces:
  - `lerSecoes(markdown: string): Map<string, string>` (título de cada `## ` → texto da seção, sem o título) e `permissoesJustificadas(secoes: Map<string, string>): string[]` (os nomes depois de `Justificativa: `);
  - `loja/textos.md` com as seções `Nome`, `Resumo`, `Descrição`, `Propósito único`, `Justificativa: activeTab`, `Justificativa: scripting`, `Justificativa: contextMenus`, `Justificativa: storage`, `Justificativa: menus`, `Código remoto`, `Dados`, `Categoria`, `Licença`, `Endereços` e `Política de privacidade (texto para a AMO)`;
  - `loja/notas-revisores.md` com as seções `AMO` e `Opera`;
  - o `include` do Vitest com `loja/**/*.test.ts` (Tasks 7 e 8).

- [ ] **Step 1: O teste que falha**

`apps/botai/vitest.config.ts`, troque o `include` por:

```ts
    include: [
      'src/**/*.test.{ts,tsx}',
      'scripts/**/*.test.ts',
      'loja/**/*.test.ts',
    ],
```

`apps/botai/loja/textos.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { lerSecoes, permissoesJustificadas } from './textos'

const ler = (arquivo: string) =>
  readFileSync(path.join(import.meta.dirname, arquivo), 'utf8')
const textos = lerSecoes(ler('textos.md'))
const notas = lerSecoes(ler('notas-revisores.md'))
const caracteres = (texto = '') => [...texto].length

describe('textos da listagem', () => {
  it('nome com acento', () => {
    expect(textos.get('Nome')).toBe('Botaí')
  })

  it('resumo cabe nos 250 caracteres da AMO', () => {
    expect(caracteres(textos.get('Resumo'))).toBeGreaterThan(0)
    expect(caracteres(textos.get('Resumo'))).toBeLessThanOrEqual(250)
  })

  it('descrição tem ao menos os 250 caracteres que o Edge exige', () => {
    expect(caracteres(textos.get('Descrição'))).toBeGreaterThanOrEqual(250)
  })

  it('propósito único, categoria e dados preenchidos', () => {
    for (const secao of ['Propósito único', 'Categoria', 'Dados'])
      expect(caracteres(textos.get(secao))).toBeGreaterThan(0)
  })

  it('código remoto: não', () => {
    expect(textos.get('Código remoto')).toMatch(/^Não\./)
  })

  it('licença MIT', () => {
    expect(textos.get('Licença')).toMatch(/^MIT\./)
  })

  it('endereços batem com o homepage_url, a política e o contato de suporte', () => {
    const enderecos = textos.get('Endereços')
    expect(enderecos).toContain('https://piluvitu.com.br/pilulabs/botai\n')
    expect(enderecos).toContain(
      'https://piluvitu.com.br/pilulabs/botai/privacidade',
    )
    expect(enderecos).toContain('pilutechinformatica@gmail.com')
    expect(enderecos).toContain('Publicador: PiluTech')
  })

  it('uma justificativa por permissão, menus inclusive', () => {
    expect(permissoesJustificadas(textos).sort()).toEqual([
      'activeTab',
      'contextMenus',
      'menus',
      'scripting',
      'storage',
    ])
    for (const permissao of permissoesJustificadas(textos))
      expect(
        caracteres(textos.get(`Justificativa: ${permissao}`)),
      ).toBeGreaterThan(0)
  })

  it.each(['textos.md', 'notas-revisores.md', 'README.md'])(
    '%s nunca escreve a marca com a grafia errada',
    (arquivo) => {
      expect(ler(arquivo)).not.toMatch(/BotAi|Bota Aí|BOTAI|Botai/)
    },
  )
})

describe('notas para os revisores', () => {
  it.each(['AMO', 'Opera'])(
    '%s aponta para o SOURCE-CODE-REVIEW.md',
    (loja) => {
      expect(notas.get(loja)).toContain('apps/botai/SOURCE-CODE-REVIEW.md')
    },
  )
})
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run loja/textos.test.ts; echo "exit=$?"`
Expected: o arquivo falha ao importar (`Cannot find module './textos'`), `exit=1`.

- [ ] **Step 2: O leitor de seções**

`apps/botai/loja/textos.ts`:

```ts
const PREFIXO_DA_JUSTIFICATIVA = 'Justificativa: '

export function lerSecoes(markdown: string): Map<string, string> {
  const partes = markdown.split(/^## (.+)$/m)
  const secoes = new Map<string, string>()
  for (let i = 1; i < partes.length; i += 2)
    secoes.set(partes[i].trim(), partes[i + 1].trim())
  return secoes
}

export function permissoesJustificadas(secoes: Map<string, string>): string[] {
  return [...secoes.keys()]
    .filter((titulo) => titulo.startsWith(PREFIXO_DA_JUSTIFICATIVA))
    .map((titulo) => titulo.slice(PREFIXO_DA_JUSTIFICATIVA.length))
}
```

- [ ] **Step 3: Os textos da listagem**

`apps/botai/loja/textos.md` (portado do rascunho `scratchpad/multinav/rascunhos/listagem.md` citado na `publicacao.md` §6, com o atalho do Firefox para Linux, os endereços do site e o publicador; o bloco abaixo é a versão final, e o rascunho não precisa existir):

```markdown
# Botaí nas lojas: textos da listagem (pt-BR)

Cada seção `##` é um campo dos formulários das lojas e vai colada como está, sem o título. O `textos.test.ts` confere os limites, e o `manifesto.e2e.ts` confere que toda permissão do manifesto tem justificativa aqui. O que vai em qual loja está no `README.md` desta pasta.

## Nome

Botaí

## Resumo

Gerador de dados fake para formulários (CPF, CNPJ, CEP): bota uma pessoa de teste coerente nos campos da página, num clique ou num atalho.

## Descrição

Botaí, de "bota aí": preenche formulários com uma pessoa brasileira de teste, num clique ou num atalho.

Feito para quem desenvolve e testa formulários brasileiros. O Botaí gera uma pessoa falsa e coerente e escreve os dados nos campos certos da página:

• CPF e CNPJ com dígitos verificadores corretos, além de RG, PIS/NIS e título de eleitor
• CEP real, com rua, bairro, cidade e UF que batem com ele
• nome, data de nascimento, celular, e-mail e senha
• empresa (razão social, nome fantasia e CNPJ)
• cartão de teste documentado da Stripe (número, nome, validade e CVV)

Como usar
• A página inteira: Ctrl+Shift+Y no Windows e no Linux, Alt+Shift+P (⌥⇧P) no Mac, ou o botão "Preencher esta página" do popup. No Firefox para Linux, o atalho é Alt+Shift+P.
• Um campo só: botão direito no campo › Botaí › Inserir › CPF (ou E-mail, CEP…).
• Depois de preencher, o popup mostra quantos campos entraram e leva até os que ficaram de fora.
• A pessoa fica guardada até você pedir outra, para repetir o mesmo cadastro.

Funciona com React, Vue, máscaras (imask, jQuery Mask, react-number-format e outras) e sites que buscam o endereço pelo CEP.

Privacidade: o Botaí só age na aba em que você o aciona, guarda a pessoa de teste no próprio navegador e não envia nada a ninguém.

Cuidados: os dados são fictícios, mas um CPF ou um celular gerado pode pertencer a alguém de verdade. Use só em localhost e em ambientes de teste. A caixa de e-mail gerada é pública.

Código aberto (licença MIT): https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai

Powered by PiluTech: https://pilutech.com.br

## Propósito único

Preencher formulários web com os dados fictícios de uma pessoa brasileira de teste (CPF, CNPJ, CEP, nome, e-mail e cartão de teste), para quem desenvolve e testa formulários.

## Justificativa: activeTab

Acesso temporário só à aba em que a pessoa aciona o Botaí (ícone, atalho ou menu de contexto), para ler os campos do formulário e escrever os dados de teste. Sem acesso a outras abas nem em segundo plano.

## Justificativa: scripting

Injetar, sob demanda e só na aba liberada pelo activeTab, o script que identifica os campos do formulário e os preenche. Todo o código injetado está no pacote.

## Justificativa: contextMenus

Itens "Preencher esta página" e "Inserir › CPF / E-mail / CEP…" no menu do botão direito, para preencher a página inteira ou um campo específico.

## Justificativa: storage

Guardar no próprio navegador (storage.local) a pessoa de teste gerada, para reutilizá-la até a pessoa pedir outra. Nada é sincronizado nem enviado.

## Justificativa: menus

Só no Firefox: saber em qual campo a pessoa clicou com o botão direito (menus.getTargetElement), para o "Inserir" escrever no campo certo. Não acrescenta aviso na instalação.

## Código remoto

Não. Todo o código está no pacote; nada é baixado nem avaliado em tempo de execução.

## Dados

Chrome e Edge, aba de privacidade: marcar só "Website content" (conteúdo do site). O Botaí lê os campos do formulário da aba (rótulos, atributos e valor atual) depois de um gesto da pessoa e escreve neles, tudo dentro do navegador. Nada é transmitido, vendido nem usado fora do propósito único. Marcar as três certificações.

Firefox: o manifesto declara data_collection_permissions com required: none; no formulário da AMO, nenhuma categoria de coleta.

## Categoria

Chrome Web Store: Ferramentas para desenvolvedores (Developer Tools). Firefox Add-ons: Web Development, só Firefox para desktop. Edge Add-ons: Developer tools. Opera Add-ons: Developer tools.

## Licença

MIT. A AMO pede na primeira versão listed; as seguintes herdam.

## Endereços

Site do produto e página de suporte: https://piluvitu.com.br/pilulabs/botai
Política de privacidade: https://piluvitu.com.br/pilulabs/botai/privacidade
E-mail de suporte: pilutechinformatica@gmail.com
Publicador: PiluTech

## Política de privacidade (texto para a AMO)

A AMO pede o texto da política mesmo com a versão hospedada. Copie o texto renderizado de https://piluvitu.com.br/pilulabs/botai/privacidade: a página é a única fonte, para as duas não divergirem.
```

`apps/botai/loja/notas-revisores.md` (sem versão no texto: vale para todo envio):

```markdown
# Notas para os revisores (AMO e Opera)

Em inglês, como o `SOURCE-CODE-REVIEW.md`: é o idioma que os revisores leem. Cada seção vai no campo de notas para o revisor da loja.

## AMO

Botaí fills web forms with fake Brazilian test data (CPF, CNPJ, CEP). It makes no network requests, collects no data (data_collection_permissions: none) and acts only after a user gesture (toolbar button, keyboard shortcut or context menu) on that tab.

Source code: the attached sources zip is a subset of our public monorepo (https://github.com/PiluVitu/PiluVitu-Dev). The build instructions are in apps/botai/SOURCE-CODE-REVIEW.md inside the zip (Ubuntu 24.04, Node 24.14.0, corepack enable, pnpm install --frozen-lockfile, then wxt zip -b firefox). The rebuilt firefox zip is byte-identical to the uploaded package; our CI checks this on every change.

How to test: open any page with a sign-up form, click the Botaí toolbar button, then "Gerar pessoa" and "Preencher esta página". A notice in the corner shows how many fields were filled. Right-click a text field › Botaí › Inserir › CPF fills a single field.

Permissions: activeTab and scripting inject the filler only into the tab the user acted on; contextMenus and menus add the right-click items (menus.getTargetElement finds the clicked field); storage keeps the generated fake person in storage.local.

## Opera

Botaí fills web forms with fake Brazilian test data (CPF, CNPJ, CEP). It makes no network requests, collects no data and acts only after a user gesture on that tab.

Nothing in this package is minified by our build (minification is disabled for the Opera package); third-party libraries are bundled from their published npm builds. Source code and build instructions: the asset botai-<version>-sources.zip of the GitHub Release whose tag matches this package version (https://github.com/PiluVitu/PiluVitu-Dev/releases), described in apps/botai/SOURCE-CODE-REVIEW.md, and the public repository https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai.

How to test: open any page with a sign-up form, click the Botaí toolbar button, then "Gerar pessoa" and "Preencher esta página".
```

`apps/botai/loja/README.md`:

```markdown
# Material das lojas do Botaí

O que vai em cada campo das quatro lojas. O passo a passo da publicação (contas, credenciais, primeiro envio e lançamento) está na seção "Publicação" do `apps/botai/README.md`; como o release funciona, na do `apps/botai/CLAUDE.md`.

- `textos.md`: os textos da listagem, em pt-BR, uma seção por campo.
- `notas-revisores.md`: as notas para os revisores da AMO e do Opera, em inglês.
- `imagens/`: gerado por `make capturas-botai`; não edite à mão. As capturas de 1280×800 e o ícone vão também para `apps/web/public/pilulabs/botai/`.
- `icone-1i.svg`: o desenho 1i em vetor, de onde saem o ícone 128 da loja e o logo do Edge. O ícone do manifesto (`public/icon/`) não muda.
- `vitrine.pagina.html`, `quadros.ts`, `pecas.ts` e `capturas.captura.ts`: o gerador das imagens.

Os pacotes vêm do GitHub Release da tag `botai-v<versão>`.

## Chrome Web Store

- Pacote: `botai-<versão>-chrome.zip`, com a publicação adiada no primeiro envio.
- Ícone: `imagens/icone-128.png` (arte de 96 px com margem transparente de 16 px).
- Capturas (até 5): `imagens/capturas/1280x800/` 01, 03 e 05 (escuro) e 02 e 04 (claro).
- Bloco promocional pequeno: `imagens/chrome-tile-440x280.png`.
- Textos: Descrição, Categoria, Propósito único, as quatro Justificativas (activeTab, scripting, contextMenus, storage), Código remoto, Dados e Endereços. O resumo da Chrome é o `description` do manifesto.

## Firefox Add-ons (AMO)

- Pacotes: `botai-<versão>-firefox.zip` e, no campo de código-fonte, `botai-<versão>-sources.zip`. Canal listed.
- Capturas: as 6 de `imagens/capturas/1280x800/`.
- Textos: Resumo, Descrição, Categoria, Licença, Endereços e o texto da política (seção "Política de privacidade" de `textos.md`).
- Notas para o revisor: a seção AMO de `notas-revisores.md`.

## Edge Add-ons

- Pacote: `botai-<versão>-chrome.zip`, o mesmo da Chrome.
- Logo: `imagens/edge-logo-300.png`.
- Capturas (até 6): as 6 de `imagens/capturas/1280x800/`.
- Textos: Descrição (no mínimo 250 caracteres), Categoria, Propósito único, as quatro Justificativas, Código remoto, Dados e Endereços.

## Opera Add-ons

- Pacote: `botai-<versão>-opera.zip`, o build sem minificar. O envio é sempre manual.
- Capturas (ao menos 2, fundo branco): as de `imagens/opera/612x408/`.
- Textos: Resumo, Descrição, Categoria e Endereços.
- Notas para o revisor: a seção Opera de `notas-revisores.md`.
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/prettier --write loja && ./node_modules/.bin/vitest run loja/textos.test.ts; echo "exit=$?"`
Expected: `13 passed`, `exit=0` (o resumo tem 138 caracteres e a descrição 1593, medidos no protótipo).

- [ ] **Step 4: Toda permissão do manifesto tem justificativa (E2E)**

`apps/botai/manifesto.e2e.ts`: acrescente o import

```ts
import { lerSecoes, permissoesJustificadas } from './loja/textos'
```

e, no fim do arquivo:

```ts
test('toda permissão dos manifestos de Chrome e Firefox tem justificativa em loja/textos.md', () => {
  const permissoes = new Set<string>([
    ...manifesto('chrome-mv3').permissions,
    ...manifesto('firefox-mv3').permissions,
  ])
  const textos = lerSecoes(
    readFileSync(path.resolve(import.meta.dirname, 'loja/textos.md'), 'utf8'),
  )
  expect(permissoesJustificadas(textos).sort()).toEqual([...permissoes].sort())
})
```

(`manifesto(pasta)`, `readFileSync` e `path` já existem no arquivo desde a Task 2 da fase 1, que o reescreveu inteiro com `ler`, `manifesto` e `background`.)

Primeiro o vermelho, com a justificativa do `menus` trocada de propósito, e depois o verde, com ela de volta:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run build && $P run build:firefox && $P run build:opera && $P run build:e2e && /usr/bin/sed -i '' 's/^## Justificativa: menus$/## Justificativa: menu/' loja/textos.md && ./node_modules/.bin/playwright test manifesto.e2e.ts; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && /usr/bin/sed -i '' 's/^## Justificativa: menu$/## Justificativa: menus/' loja/textos.md && /usr/bin/grep -c '^## Justificativa: menus$' loja/textos.md && ./node_modules/.bin/playwright test manifesto.e2e.ts; echo "exit=$?"
```

Expected: no primeiro, só o teste novo falhando (`menu` sobrando e `menus` faltando no diff do `toEqual`) e `exit=1`; no segundo, `1` (a linha voltou) e todos os testes do `manifesto.e2e.ts` passando, o novo inclusive (as permissões são `activeTab`, `contextMenus`, `scripting`, `storage` e `menus`), `exit=0`.

- [ ] **Step 5: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/prettier --check loja manifesto.e2e.ts vitest.config.ts && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint && $P run test; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/loja apps/botai/manifesto.e2e.ts apps/botai/vitest.config.ts && /usr/bin/git commit -m "docs(botai): textos das lojas, notas para os revisores e uma justificativa por permissão"; echo "exit=$?"
```

---

### Task 7: Peças e quadros das imagens (`loja/pecas.ts`, `loja/quadros.ts`)

**Files:**

- Create: `apps/botai/loja/icone-1i.svg` (cópia de `docs/superpowers/research/2026-10-01-extensao-dados-teste/icones/1i-smooth.svg`)
- Create: `apps/botai/loja/pecas.ts`, `apps/botai/loja/quadros.ts`
- Test: `apps/botai/loja/pecas.test.ts`, `apps/botai/loja/quadros.test.ts`

**Interfaces:**

- Consumes: o `include` de `loja/**/*.test.ts` (Task 6).
- Produces (`pecas.ts`):
  - tipos `Tema = 'escuro' | 'claro'`, `Cena = 'pagina-preenchida' | 'pessoa-de-teste' | 'resultado'`, `CenaDeDestaque = Exclude<Cena, 'pagina-preenchida'>`, `Tamanho { largura; altura }`, `Peca extends Tamanho { arquivo }`, `Captura { nome; cena; tema }`;
  - `CENAS`, `TEMAS`, `CAPTURAS` (6, nomes `01-pagina-preenchida-escuro` … `06-resultado-claro`), `TAMANHOS_DAS_CAPTURAS` (1280×800 e 640×400), `TAMANHO_DA_OPERA` (612×408), `CENAS_DA_OPERA` (`pessoa-de-teste`, `resultado`), `ICONE` (`icone-128.png`), `LOGO_DO_EDGE` (`edge-logo-300.png`), `TILE_DA_CHROME` (`chrome-tile-440x280.png`);
  - `arquivoDaCaptura(captura, tamanho)` → `capturas/<L>x<A>/<nome>.png`; `arquivoDaOpera(cena)` → `opera/612x408/<NN>-<cena>.png`;
  - `PECAS_DA_LOJA: Peca[]` (17 arquivos, relativos a `loja/imagens/`) e `COPIAS_PARA_O_SITE: { origem; destino }[]` (o ícone e as 6 de 1280×800 → `icone-128.png` e `capturas/<nome>.png`, relativos a `apps/web/public/pilulabs/botai/`).
- Produces (`quadros.ts`): `CORES: Record<Tema, Cores>`, `BRANCO_DA_OPERA`, `escaparHtml(texto)`, `dataUrl(tipo, conteudo)`, `htmlIcone({ svg, arte })`, `htmlTile({ svg, fonte })`, `htmlPagina({ fundo, popup })`, `htmlDestaque({ svg, popup, titulo, subtitulo, tema, fonte, fundoBranco? })` → documento HTML completo (string).

- [ ] **Step 1: Os testes que falham**

`apps/botai/loja/pecas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  CAPTURAS,
  CENAS_DA_OPERA,
  COPIAS_PARA_O_SITE,
  PECAS_DA_LOJA,
} from './pecas'

describe('peças da loja', () => {
  it('seis capturas, cada cena nos dois temas, na ordem que o site mostra', () => {
    expect(CAPTURAS.map((c) => c.nome)).toEqual([
      '01-pagina-preenchida-escuro',
      '02-pagina-preenchida-claro',
      '03-pessoa-de-teste-escuro',
      '04-pessoa-de-teste-claro',
      '05-resultado-escuro',
      '06-resultado-claro',
    ])
  })

  it('o Opera recebe ao menos duas capturas', () => {
    expect(CENAS_DA_OPERA.length).toBeGreaterThanOrEqual(2)
  })

  it('nenhum arquivo repetido', () => {
    const arquivos = PECAS_DA_LOJA.map((p) => p.arquivo)
    expect(new Set(arquivos).size).toBe(arquivos.length)
  })

  it('o site recebe o ícone e as capturas de 1280×800 em capturas/<NN>-<nome>.png', () => {
    expect(COPIAS_PARA_O_SITE[0]).toEqual({
      origem: 'icone-128.png',
      destino: 'icone-128.png',
    })
    for (const { origem, destino } of COPIAS_PARA_O_SITE.slice(1)) {
      expect(origem).toMatch(/^capturas\/1280x800\/\d{2}-[a-z-]+\.png$/)
      expect(destino).toMatch(/^capturas\/\d{2}-[a-z-]+\.png$/)
    }
    expect(COPIAS_PARA_O_SITE).toHaveLength(1 + CAPTURAS.length)
  })
})
```

`apps/botai/loja/quadros.test.ts` (jsdom, o ambiente padrão do Vitest do app, por causa do `DOMParser`):

```ts
import { describe, expect, it } from 'vitest'
import {
  BRANCO_DA_OPERA,
  CORES,
  escaparHtml,
  htmlDestaque,
  htmlIcone,
  htmlPagina,
  htmlTile,
} from './quadros'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"></svg>'
const PNG = 'data:image/png;base64,AAAA'
const FONTE = 'data:font/woff2;base64,AAAA'

const ler = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const estilo = (html: string) => ler(html).querySelector('style')!.textContent!

const destaque = (extra: Partial<Parameters<typeof htmlDestaque>[0]> = {}) =>
  htmlDestaque({
    svg: SVG,
    popup: PNG,
    titulo: 'Título',
    subtitulo: 'Subtítulo',
    tema: 'escuro',
    fonte: FONTE,
    ...extra,
  })

describe('quadros das capturas', () => {
  it('ícone: a arte no tamanho pedido, centrada num fundo transparente', () => {
    const html = htmlIcone({ svg: SVG, arte: 96 })
    const img = ler(html).querySelector('img')!
    expect(img.getAttribute('width')).toBe('96')
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(estilo(html)).toContain('background: transparent')
  })

  it('destaque: fundo do tema, ou branco para o Opera', () => {
    expect(estilo(destaque())).toContain(`background: ${CORES.escuro.fundo}`)
    expect(estilo(destaque({ tema: 'claro', fundoBranco: true }))).toContain(
      `background: ${BRANCO_DA_OPERA}`,
    )
  })

  it('destaque: título e subtítulo entram como texto, nunca como HTML', () => {
    const doc = ler(destaque({ titulo: '<b>CPF</b> & CEP' }))
    expect(doc.querySelector('h1')!.textContent).toBe('<b>CPF</b> & CEP')
    expect(doc.querySelector('h1 b')).toBeNull()
    expect(escaparHtml('"<&>"')).toBe('&quot;&lt;&amp;&gt;&quot;')
  })

  it('página preenchida: o fundo da extensão real e o popup por cima', () => {
    const imgs = ler(
      htmlPagina({ fundo: PNG, popup: `${PNG}B` }),
    ).querySelectorAll('img')
    expect([...imgs].map((i) => i.className)).toEqual(['fundo', 'popup'])
    expect(imgs[1].getAttribute('src')).toBe(`${PNG}B`)
  })

  it('o nome aparece como Botaí, com acento, e nada vira caixa alta', () => {
    for (const html of [destaque(), htmlTile({ svg: SVG, fonte: FONTE })]) {
      expect(ler(html).body.textContent).toContain('Botaí')
      expect(estilo(html)).not.toContain('uppercase')
    }
  })
})
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run loja/pecas.test.ts loja/quadros.test.ts; echo "exit=$?"`
Expected: os dois arquivos falham ao importar (`./pecas`, `./quadros`), `exit=1`.

- [ ] **Step 2: O desenho 1i e as peças**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /bin/cp docs/superpowers/research/2026-10-01-extensao-dados-teste/icones/1i-smooth.svg apps/botai/loja/icone-1i.svg && /bin/cat apps/botai/loja/icone-1i.svg; echo "exit=$?"
```

Expected: o SVG `viewBox="0 0 16 16"` com o fundo `#38bdf8` arredondado, a barra e os três quadrados `#0a0f1a`, e `exit=0`.

`apps/botai/loja/pecas.ts`:

```ts
export type Tema = 'escuro' | 'claro'
export type Cena = 'pagina-preenchida' | 'pessoa-de-teste' | 'resultado'
export type CenaDeDestaque = Exclude<Cena, 'pagina-preenchida'>

export interface Tamanho {
  largura: number
  altura: number
}
export interface Peca extends Tamanho {
  arquivo: string
}
export interface Captura {
  nome: string
  cena: Cena
  tema: Tema
}

export const CENAS: Cena[] = [
  'pagina-preenchida',
  'pessoa-de-teste',
  'resultado',
]
export const TEMAS: Tema[] = ['escuro', 'claro']

const doisDigitos = (n: number) => String(n).padStart(2, '0')

export const CAPTURAS: Captura[] = CENAS.flatMap((cena, i) =>
  TEMAS.map((tema, j) => ({
    cena,
    tema,
    nome: `${doisDigitos(i * TEMAS.length + j + 1)}-${cena}-${tema}`,
  })),
)

export const TAMANHOS_DAS_CAPTURAS: Tamanho[] = [
  { largura: 1280, altura: 800 },
  { largura: 640, altura: 400 },
]
export const TAMANHO_DA_OPERA: Tamanho = { largura: 612, altura: 408 }
export const CENAS_DA_OPERA: CenaDeDestaque[] = ['pessoa-de-teste', 'resultado']

export const ICONE: Peca = {
  arquivo: 'icone-128.png',
  largura: 128,
  altura: 128,
}
export const LOGO_DO_EDGE: Peca = {
  arquivo: 'edge-logo-300.png',
  largura: 300,
  altura: 300,
}
export const TILE_DA_CHROME: Peca = {
  arquivo: 'chrome-tile-440x280.png',
  largura: 440,
  altura: 280,
}

export const arquivoDaCaptura = (captura: Captura, t: Tamanho) =>
  `capturas/${t.largura}x${t.altura}/${captura.nome}.png`

export const arquivoDaOpera = (cena: CenaDeDestaque) =>
  `opera/${TAMANHO_DA_OPERA.largura}x${TAMANHO_DA_OPERA.altura}/${doisDigitos(CENAS_DA_OPERA.indexOf(cena) + 1)}-${cena}.png`

export const PECAS_DA_LOJA: Peca[] = [
  ICONE,
  LOGO_DO_EDGE,
  TILE_DA_CHROME,
  ...CAPTURAS.flatMap((captura) =>
    TAMANHOS_DAS_CAPTURAS.map((t) => ({
      arquivo: arquivoDaCaptura(captura, t),
      ...t,
    })),
  ),
  ...CENAS_DA_OPERA.map((cena) => ({
    arquivo: arquivoDaOpera(cena),
    ...TAMANHO_DA_OPERA,
  })),
]

export const COPIAS_PARA_O_SITE: { origem: string; destino: string }[] = [
  { origem: ICONE.arquivo, destino: 'icone-128.png' },
  ...CAPTURAS.map((captura) => ({
    origem: arquivoDaCaptura(captura, TAMANHOS_DAS_CAPTURAS[0]),
    destino: `capturas/${captura.nome}.png`,
  })),
]
```

Os nomes `<NN>-<cena>-<tema>` batem com o `altDaCaptura` da fase 2 (`01-pagina-preenchida-escuro.png` → "Captura de tela: página preenchida (tema escuro)"); nada a mudar no site.

- [ ] **Step 3: Os quadros**

`apps/botai/loja/quadros.ts` (portado do quadro do `capturas.loja.ts` da pesquisa, com unidades `vw`/`vh` para o mesmo HTML servir a 1280×800, 640×400 e 612×408):

```ts
import type { Tema } from './pecas'

interface Cores {
  fundo: string
  texto: string
  suave: string
  destaque: string
}

// Os tokens --background, --foreground, --muted-foreground e --primary do @piluvitu/ui.
export const CORES: Record<Tema, Cores> = {
  escuro: {
    fundo: 'hsl(220 33% 5%)',
    texto: 'hsl(215 33% 93%)',
    suave: 'hsl(216 17% 64%)',
    destaque: 'hsl(198 93% 60%)',
  },
  claro: {
    fundo: 'hsl(220 50% 98%)',
    texto: 'hsl(222 36% 9%)',
    suave: 'hsl(215 18% 35%)',
    destaque: 'hsl(198 93% 26%)',
  },
}
export const BRANCO_DA_OPERA = '#ffffff'

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const dataUrl = (tipo: string, conteudo: Uint8Array | string) =>
  `data:${tipo};base64,${Buffer.from(conteudo).toString('base64')}`

function documento(corpo: string, estilo: string, fonte?: string): string {
  const faceDaFonte = fonte
    ? `@font-face { font-family: Jakarta; src: url(${fonte}) format('woff2'); font-weight: 200 800; }`
    : ''
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<style>
${faceDaFonte}
* { box-sizing: border-box; margin: 0; }
html, body { width: 100vw; height: 100vh; overflow: hidden; }
body { font-family: Jakarta, system-ui, sans-serif; }
${estilo}
</style>
</head>
<body>${corpo}</body>
</html>`
}

function imagemDoSvg(svg: string, lado: number): string {
  return `<img src="${dataUrl('image/svg+xml', svg)}" alt="" width="${lado}" height="${lado}">`
}

export function htmlIcone(o: { svg: string; arte: number }): string {
  return documento(
    imagemDoSvg(o.svg, o.arte),
    'body { display: grid; place-items: center; background: transparent; }',
  )
}

export function htmlTile(o: { svg: string; fonte: string }): string {
  const c = CORES.escuro
  return documento(
    `<main>${imagemDoSvg(o.svg, 96)}<div><h1>Botaí</h1><p>Bota dados de teste no formulário</p></div></main>`,
    `body { display: grid; place-items: center; background: ${c.fundo}; color: ${c.texto}; }
main { display: flex; align-items: center; gap: 24px; }
h1 { font-size: 44px; font-weight: 800; letter-spacing: -0.02em; }
p { margin-top: 6px; max-width: 220px; font-size: 17px; line-height: 1.35; color: ${c.suave}; }`,
    o.fonte,
  )
}

export function htmlPagina(o: { fundo: string; popup: string }): string {
  return documento(
    `<img class="fundo" src="${o.fundo}" alt=""><img class="popup" src="${o.popup}" alt="">`,
    `.fundo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.popup { position: absolute; top: 1.5vh; right: 1.25vw; width: 29.6875vw; border-radius: 0.94vw; outline: 1px solid rgb(128 128 128 / 0.25); box-shadow: 0 1.25vw 3.75vw rgb(0 0 0 / 0.35); }`,
  )
}

export function htmlDestaque(o: {
  svg: string
  popup: string
  titulo: string
  subtitulo: string
  tema: Tema
  fonte: string
  fundoBranco?: boolean
}): string {
  const c = CORES[o.tema]
  const fundo = o.fundoBranco ? BRANCO_DA_OPERA : c.fundo
  return documento(
    `<main><section><p class="marca">${imagemDoSvg(o.svg, 32)}Botaí</p><h1>${escaparHtml(o.titulo)}</h1><p class="sub">${escaparHtml(o.subtitulo)}</p></section><img class="popup" src="${o.popup}" alt=""></main>`,
    `body { background: ${fundo}; color: ${c.texto}; }
main { height: 100vh; display: flex; align-items: center; justify-content: center; gap: 5vw; padding: 0 6vw; }
section { flex: 1; max-width: 44vw; }
.marca { display: flex; align-items: center; gap: 0.8vw; font-size: 1.9vw; font-weight: 700; color: ${c.destaque}; }
.marca img { width: 2.5vw; height: 2.5vw; }
h1 { margin-top: 1.4vw; font-size: 3.9vw; line-height: 1.1; font-weight: 800; letter-spacing: -0.02em; }
.sub { margin-top: 1.6vw; font-size: 1.75vw; line-height: 1.45; color: ${c.suave}; }
.popup { flex: none; max-width: 40vw; max-height: 86vh; border-radius: 1vw; outline: 1px solid rgb(128 128 128 / 0.25); box-shadow: 0 1.5vw 4vw rgb(0 0 0 / 0.3); }`,
    o.fonte,
  )
}
```

- [ ] **Step 4: Ver passar, lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/prettier --write loja && ./node_modules/.bin/vitest run loja/pecas.test.ts loja/quadros.test.ts; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/loja/icone-1i.svg apps/botai/loja/pecas.ts apps/botai/loja/pecas.test.ts apps/botai/loja/quadros.ts apps/botai/loja/quadros.test.ts && /usr/bin/git commit -m "feat(botai): peças e quadros das imagens das lojas, com o 1i em vetor"; echo "exit=$?"
```

Expected: `9 passed` e `exit=0`; lint `exit=0`; commit `exit=0`.

---

### Task 8: Capturas (`playwright.capturas.config.ts`) e as imagens no site

**Files:**

- Create: `apps/botai/loja/vitrine.pagina.html`
- Create: `apps/botai/loja/capturas.captura.ts`
- Create: `apps/botai/playwright.capturas.config.ts`
- Test: `apps/botai/loja/imagens.test.ts`
- Modify: `apps/botai/package.json` (script `capturas`)
- Modify: `Makefile` (`.PHONY` e alvo `capturas-botai`)
- Create (gerados e versionados): `apps/botai/loja/imagens/**` (17 PNG), `apps/web/public/pilulabs/botai/icone-128.png`, `apps/web/public/pilulabs/botai/capturas/0{1..6}-*.png`

**Interfaces:**

- Consumes: `aparencia` (Task 5); `pecas.ts` e `quadros.ts` (Task 7); do fixture, `abrirPopup`, `enviarMensagem`, `expect`, `idDaAba`, `ORIGEM`, `servir` e `test`; `PESSOA_DOURADA` de `src/test/pessoa-dourada.ts`; as stories `popup-1b-·-pessoa-pronta--{escuro,claro}` e `popup-1c-·-resultado--{escuro,claro}` (atalho `Ctrl+Shift+Y` nas stories; o 1c com o `RESUMO_DO_DESIGN`, 12 de 14).
- Produces: `make capturas-botai` (`pnpm --filter @pilutech/botai capturas`), que grava `PECAS_DA_LOJA` em `apps/botai/loja/imagens/` e `COPIAS_PARA_O_SITE` em `apps/web/public/pilulabs/botai/` (o que o `listarCapturas('botai')` da fase 2 descobre no build).

- [ ] **Step 1: O teste das imagens, que falha**

`apps/botai/loja/imagens.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { COPIAS_PARA_O_SITE, ICONE, PECAS_DA_LOJA } from './pecas'

const LOJA = path.resolve(import.meta.dirname, 'imagens')
const SITE = path.resolve(
  import.meta.dirname,
  '../../web/public/pilulabs/botai',
)

// Largura, altura e tipo de cor vêm do cabeçalho IHDR, logo depois da assinatura de 8 bytes.
function cabecalhoPng(arquivo: string) {
  const png = readFileSync(arquivo)
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
  return {
    largura: png.readUInt32BE(16),
    altura: png.readUInt32BE(20),
    tipoDeCor: png[25],
  }
}

describe('imagens da loja (geradas por make capturas-botai)', () => {
  it.each(PECAS_DA_LOJA.map((p) => [p.arquivo, p] as const))(
    '%s tem o tamanho que a loja pede',
    (_, peca) => {
      const { largura, altura } = cabecalhoPng(path.join(LOJA, peca.arquivo))
      expect({ largura, altura }).toEqual({
        largura: peca.largura,
        altura: peca.altura,
      })
    },
  )

  it('o ícone 128 tem canal alfa (a margem de 16 px é transparente)', () => {
    expect(cabecalhoPng(path.join(LOJA, ICONE.arquivo)).tipoDeCor).toBe(6)
  })
})

describe('cópias para o site', () => {
  it.each(COPIAS_PARA_O_SITE.map((c) => [c.destino, c] as const))(
    'apps/web/public/pilulabs/botai/%s é idêntica à da loja',
    (_, { origem, destino }) => {
      expect(
        readFileSync(path.join(SITE, destino)).equals(
          readFileSync(path.join(LOJA, origem)),
        ),
      ).toBe(true)
    },
  )
})
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run loja/imagens.test.ts; echo "exit=$?"`
Expected: os 25 testes falhando com `ENOENT` (nenhuma imagem ainda), `exit=1`.

- [ ] **Step 2: As stories que as capturas usam existem**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run build-storybook >/dev/null && node -e "const e=require('./storybook-static/index.json').entries; for (const id of ['popup-1b-·-pessoa-pronta--escuro','popup-1b-·-pessoa-pronta--claro','popup-1c-·-resultado--escuro','popup-1c-·-resultado--claro']) if (!e[id]) { console.log('FALTA', id); process.exitCode = 1 }"; echo "exit=$?"
```

Expected: nenhum `FALTA` e `exit=0`. Se a fase 1 tiver renomeado uma story do 1b ou do 1c, use o id novo em `STORY_DO_POPUP` (Step 4).

- [ ] **Step 3: A página-vitrine**

`apps/botai/loja/vitrine.pagina.html`: um cadastro estilizado, claro e escuro pelo `prefers-color-scheme`, com os 12 campos que o Botaí reconhece (os mesmos `name` do `cadastro.pagina.html`) e os 2 que ele não reconhece, que o 1c do design lista (`input[name="ref_code"]` e `select#origem`): a extensão real escreve "12 de 14", o mesmo número da story do 1c que vai por cima.

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Criar conta · Loja Exemplo</title>
    <style>
      :root {
        color-scheme: light dark;
        --fundo: #f4f6fb;
        --cartao: #ffffff;
        --texto: #172033;
        --suave: #5b6478;
        --linha: #d9dee8;
        --acento: #4f46e5;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --fundo: #0e1117;
          --cartao: #161b26;
          --texto: #e8ebf2;
          --suave: #9aa3b5;
          --linha: #2a3242;
          --acento: #818cf8;
        }
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: var(--fundo);
        color: var(--texto);
        font:
          15px/1.4 system-ui,
          sans-serif;
      }
      header {
        padding: 18px 64px;
        border-bottom: 1px solid var(--linha);
        font-weight: 700;
        font-size: 17px;
      }
      header span {
        color: var(--acento);
      }
      form {
        width: 720px;
        margin: 28px 0 0 64px;
        padding: 24px 28px 28px;
        background: var(--cartao);
        border: 1px solid var(--linha);
        border-radius: 14px;
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 14px 16px;
      }
      h1 {
        grid-column: span 6;
        margin: 0 0 4px;
        font-size: 22px;
      }
      label {
        grid-column: span 3;
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 13px;
        color: var(--suave);
      }
      label.l2 {
        grid-column: span 2;
      }
      label.l4 {
        grid-column: span 4;
      }
      label.l6 {
        grid-column: span 6;
      }
      input,
      select {
        height: 36px;
        padding: 0 10px;
        border: 1px solid var(--linha);
        border-radius: 8px;
        background: var(--fundo);
        color: var(--texto);
        font: inherit;
        font-size: 14px;
      }
      button {
        grid-column: span 6;
        height: 40px;
        border: 0;
        border-radius: 8px;
        background: var(--acento);
        color: #fff;
        font: inherit;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <header>Loja <span>Exemplo</span></header>
    <form id="cad">
      <h1>Criar conta</h1>
      <label class="l6">Nome completo <input name="nome" /></label>
      <label class="l4">E-mail <input type="email" name="email" /></label>
      <label class="l2"
        >Nascimento
        <input name="nascimento" placeholder="dd/mm/aaaa" maxlength="10"
      /></label>
      <label>CPF <input name="cpf" inputmode="numeric" /></label>
      <label
        >Celular <input type="tel" name="cel" placeholder="(00) 00000-0000"
      /></label>
      <label class="l2">CEP <input name="cep" maxlength="9" /></label>
      <label class="l4">Rua <input name="logradouro" /></label>
      <label class="l2">Número <input name="numero" maxlength="6" /></label>
      <label class="l2">Bairro <input name="bairro" /></label>
      <label class="l2">Cidade <input name="cidade" /></label>
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
      <label
        >Senha <input type="password" name="senha" autocomplete="new-password"
      /></label>
      <label
        >Código de indicação <input name="ref_code" placeholder="opcional"
      /></label>
      <label
        >Como nos conheceu?
        <select id="origem">
          <option value="">Selecione</option>
          <option>Google</option>
          <option>Amigo</option>
        </select></label
      >
      <button type="button">Criar conta</button>
    </form>
  </body>
</html>
```

- [ ] **Step 4: O gerador**

`apps/botai/loja/capturas.captura.ts` (portado de `capturas.loja.ts` da `publicacao.md` §5.4 e do esboço `loja.captura.ts` da `site-pilulabs.md` §4, que a crítica mandou unificar):

```ts
import type { BrowserContext, Worker } from '@playwright/test'
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { browser } from 'wxt/browser'
import {
  abrirPopup,
  enviarMensagem,
  expect,
  idDaAba,
  ORIGEM,
  servir,
  test,
} from '../src/test/extensao.fixture'
import { PESSOA_DOURADA } from '../src/test/pessoa-dourada'
import {
  arquivoDaCaptura,
  arquivoDaOpera,
  CAPTURAS,
  CENAS_DA_OPERA,
  COPIAS_PARA_O_SITE,
  ICONE,
  LOGO_DO_EDGE,
  TAMANHO_DA_OPERA,
  TAMANHOS_DAS_CAPTURAS,
  TEMAS,
  TILE_DA_CHROME,
  type Cena,
  type CenaDeDestaque,
  type Tema,
} from './pecas'
import {
  dataUrl,
  htmlDestaque,
  htmlIcone,
  htmlPagina,
  htmlTile,
} from './quadros'

declare const chrome: typeof browser

const LOJA = path.resolve(import.meta.dirname, 'imagens')
const SITE = path.resolve(
  import.meta.dirname,
  '../../web/public/pilulabs/botai',
)
const STORYBOOK = path.resolve(import.meta.dirname, '../storybook-static')
const STORYBOOK_URL = 'http://storybook.local'
const SVG = readFileSync(path.join(import.meta.dirname, 'icone-1i.svg'), 'utf8')
const FONTE = dataUrl(
  'font/woff2',
  readFileSync(
    path.resolve(
      import.meta.dirname,
      '../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2',
    ),
  ),
)
const VITRINE = readFileSync(
  path.join(import.meta.dirname, 'vitrine.pagina.html'),
  'utf8',
)

const STORY_DO_POPUP: Record<Cena, string> = {
  'pagina-preenchida': 'popup-1c-·-resultado',
  'pessoa-de-teste': 'popup-1b-·-pessoa-pronta',
  resultado: 'popup-1c-·-resultado',
}
const TEXTOS: Record<CenaDeDestaque, { titulo: string; subtitulo: string }> = {
  'pessoa-de-teste': {
    titulo: 'Uma pessoa de teste coerente e pronta para copiar',
    subtitulo:
      'CPF, CNPJ, RG, PIS e título com dígito verificador certo, CEP real com rua e cidade e o cartão de teste da Stripe.',
  },
  resultado: {
    titulo: 'Mostra o que preencheu e o que ficou de fora',
    subtitulo:
      'A mira leva até cada campo que o Botaí não reconheceu. Tudo roda no seu navegador: nada é enviado.',
  },
}

function gravar(arquivo: string, png: Buffer): void {
  const destino = path.join(LOJA, arquivo)
  mkdirSync(path.dirname(destino), { recursive: true })
  writeFileSync(destino, png)
}

async function servirStorybook(context: BrowserContext): Promise<void> {
  await context.route(`${STORYBOOK_URL}/**`, (rota) => {
    const arquivo = path.join(
      STORYBOOK,
      decodeURIComponent(new URL(rota.request().url()).pathname),
    )
    const existe = statSync(arquivo, { throwIfNoEntry: false })?.isFile()
    return existe
      ? rota.fulfill({ path: arquivo })
      : rota.fulfill({ status: 404, body: 'não encontrado' })
  })
}

async function fotografarStory(
  context: BrowserContext,
  id: string,
): Promise<Buffer> {
  const pagina = await context.newPage()
  await pagina.goto(
    `${STORYBOOK_URL}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`,
  )
  // O layout "padded" do Storybook põe 1rem no body e encolheria o popup para 348 px.
  await pagina.addStyleTag({ content: 'body { padding: 0 !important; }' })
  const popup = pagina.locator('#storybook-root > div')
  await expect(popup).toHaveCSS('width', '380px')
  await pagina.evaluate(() => document.fonts.ready)
  const png = await popup.screenshot({ scale: 'device' })
  await pagina.close()
  return png
}

async function fotografarHtml(
  context: BrowserContext,
  html: string,
  tamanho: { largura: number; altura: number },
  transparente = false,
): Promise<Buffer> {
  const pagina = await context.newPage()
  await pagina.setViewportSize({
    width: tamanho.largura,
    height: tamanho.altura,
  })
  await pagina.setContent(html)
  await pagina.evaluate(() => document.fonts.ready)
  const png = await pagina.screenshot({
    scale: 'css',
    omitBackground: transparente,
  })
  await pagina.close()
  return png
}

async function fotografarPaginaPreenchida(
  context: BrowserContext,
  sw: Worker,
  extensionId: string,
): Promise<Buffer> {
  await sw.evaluate(
    (pessoa) => chrome.storage.local.set({ botai_pessoa: pessoa }),
    PESSOA_DOURADA,
  )
  await servir(context, { '/cadastro': { corpo: VITRINE } })
  const aba = await context.newPage()
  await aba.setViewportSize({ width: 1280, height: 800 })
  await aba.goto(`${ORIGEM}/cadastro`)
  const tabId = await idDaAba(sw, `${ORIGEM}/cadastro`)
  const popup = await abrirPopup(context, extensionId, `?aba=${tabId}`)
  await enviarMensagem(popup, { tipo: 'preencher', tabId })
  await popup.close()
  // 12 de 14 é o mesmo resumo da story do 1c que vai por cima da página.
  await expect(aba.locator('botai-aviso .botai-titulo')).toHaveText(
    '12 de 14 campos preenchidos',
  )
  await expect(aba.locator('input[name="cpf"]')).toHaveValue(PESSOA_DOURADA.cpf)
  // O aviso fecha no fim da barra de tempo: parada no início, a foto não depende de quanto o teste demorou.
  await aba.locator('botai-aviso .botai-barra').evaluate((barra) => {
    for (const animacao of barra.getAnimations()) {
      animacao.pause()
      animacao.currentTime = 0
    }
  })
  return aba.screenshot({ scale: 'device' })
}

async function verificarMargemDoIcone(
  context: BrowserContext,
  png: Buffer,
): Promise<void> {
  const pagina = await context.newPage()
  const caixa = await pagina.evaluate(
    async (src) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const tela = document.createElement('canvas')
      tela.width = img.width
      tela.height = img.height
      const ctx = tela.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const { data, width, height } = ctx.getImageData(
        0,
        0,
        img.width,
        img.height,
      )
      let x0 = width
      let y0 = height
      let x1 = -1
      let y1 = -1
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (data[(y * width + x) * 4 + 3] > 0) {
            x0 = Math.min(x0, x)
            y0 = Math.min(y0, y)
            x1 = Math.max(x1, x)
            y1 = Math.max(y1, y)
          }
      return { largura: width, altura: height, x0, y0, x1, y1 }
    },
    dataUrl('image/png', png),
  )
  await pagina.close()
  expect(caixa).toEqual({
    largura: 128,
    altura: 128,
    x0: 16,
    y0: 16,
    x1: 111,
    y1: 111,
  })
}

test('ícone 128 da loja, logo do Edge e tile da Chrome', async ({
  context,
}) => {
  const icone = await fotografarHtml(
    context,
    htmlIcone({ svg: SVG, arte: 96 }),
    ICONE,
    true,
  )
  await verificarMargemDoIcone(context, icone)
  gravar(ICONE.arquivo, icone)
  gravar(
    LOGO_DO_EDGE.arquivo,
    await fotografarHtml(
      context,
      htmlIcone({ svg: SVG, arte: LOGO_DO_EDGE.largura }),
      LOGO_DO_EDGE,
      true,
    ),
  )
  gravar(
    TILE_DA_CHROME.arquivo,
    await fotografarHtml(
      context,
      htmlTile({ svg: SVG, fonte: FONTE }),
      TILE_DA_CHROME,
    ),
  )
})

for (const tema of TEMAS) {
  test.describe(`capturas no tema ${tema}`, () => {
    test.use({ aparencia: { tema, escala: 2 } })

    test(`página preenchida e popups (${tema})`, async ({
      context,
      sw,
      extensionId,
    }) => {
      await servirStorybook(context)
      const fundo = dataUrl(
        'image/png',
        await fotografarPaginaPreenchida(context, sw, extensionId),
      )
      const popup = async (cena: Cena, t: Tema) =>
        dataUrl(
          'image/png',
          await fotografarStory(context, `${STORY_DO_POPUP[cena]}--${t}`),
        )

      for (const captura of CAPTURAS.filter((c) => c.tema === tema)) {
        const imagemDoPopup = await popup(captura.cena, tema)
        const html =
          captura.cena === 'pagina-preenchida'
            ? htmlPagina({ fundo, popup: imagemDoPopup })
            : htmlDestaque({
                svg: SVG,
                popup: imagemDoPopup,
                tema,
                fonte: FONTE,
                ...TEXTOS[captura.cena],
              })
        for (const tamanho of TAMANHOS_DAS_CAPTURAS)
          gravar(
            arquivoDaCaptura(captura, tamanho),
            await fotografarHtml(context, html, tamanho),
          )
      }

      if (tema !== 'claro') return
      for (const cena of CENAS_DA_OPERA) {
        const html = htmlDestaque({
          svg: SVG,
          popup: await popup(cena, 'claro'),
          tema: 'claro',
          fonte: FONTE,
          fundoBranco: true,
          ...TEXTOS[cena],
        })
        gravar(
          arquivoDaOpera(cena),
          await fotografarHtml(context, html, TAMANHO_DA_OPERA),
        )
      }
    })
  })
}

test('cópias para o site (apps/web/public/pilulabs/botai)', () => {
  for (const { origem, destino } of COPIAS_PARA_O_SITE) {
    mkdirSync(path.dirname(path.join(SITE, destino)), { recursive: true })
    copyFileSync(path.join(LOJA, origem), path.join(SITE, destino))
  }
})
```

`apps/botai/playwright.capturas.config.ts` (fora do `testMatch: ['**/*.e2e.ts']` do `playwright.config.ts` e do `include` do Vitest: não roda no `test:e2e` nem no CI):

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'loja',
  testMatch: ['**/*.captura.ts'],
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
})
```

`apps/botai/package.json`, depois do script `build-storybook`:

```json
    "capturas": "pnpm run build-storybook && pnpm run build:e2e && playwright test -c playwright.capturas.config.ts",
```

`Makefile`: acrescente `capturas-botai` ao fim da última linha do `.PHONY` e, depois do alvo `release-botai`:

```make
# Imagens das lojas em apps/botai/loja/imagens/ e cópias em apps/web/public/pilulabs/botai/.
# Rode no Mac: a vitrine usa as fontes do sistema.
capturas-botai:
	pnpm --filter @pilutech/botai capturas
```

- [ ] **Step 5: Gerar e ver passar**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/make capturas-botai; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run loja/imagens.test.ts; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/find apps/botai/loja/imagens apps/web/public/pilulabs/botai -name '*.png' | /usr/bin/sort; echo "exit=$?"
```

Expected: `4 passed` no Playwright (ícone/logo/tile, tema escuro, tema claro, cópias) e `exit=0`; `25 passed` e `exit=0` no Vitest; 17 PNG em `apps/botai/loja/imagens/` (`icone-128.png`, `edge-logo-300.png`, `chrome-tile-440x280.png`, `capturas/1280x800/01…06`, `capturas/640x400/01…06`, `opera/612x408/01-pessoa-de-teste.png` e `02-resultado.png`) e 7 em `apps/web/public/pilulabs/botai/` (`icone-128.png` e `capturas/01…06`).

Se o `toHaveText('12 de 14 campos preenchidos')` falhar, o classificador mudou na fase 1: confira os `name`/rótulos da vitrine contra o `cadastro.pagina.html` (onde os mesmos campos dão "21 de 23") antes de mexer em outra coisa.

- [ ] **Step 6: Olhar as imagens**

Abra com a ferramenta de leitura de imagem: `apps/botai/loja/imagens/capturas/1280x800/01-pagina-preenchida-escuro.png`, `04-pessoa-de-teste-claro.png`, `06-resultado-claro.png`, `apps/botai/loja/imagens/opera/612x408/02-resultado.png`, `chrome-tile-440x280.png` e `icone-128.png`. Confira:

- 01: o formulário da vitrine preenchido com contornos ciano, "Código de indicação" e "Como nos conheceu?" com o âmbar tracejado, o aviso "12 de 14 campos preenchidos" no canto de baixo com a barra cheia, e o popup 1c no canto de cima, sem cobrir o aviso;
- 04 e 06: título e subtítulo à esquerda, o popup inteiro à direita (380 px de largura nativa, com `Ctrl+Shift+Y` no rodapé e "Powered by PiluTech" no fim), o nome escrito "Botaí";
- Opera: fundo branco;
- tile: o ícone, "Botaí" e "Bota dados de teste no formulário" legíveis;
- ícone 128: o 1i menor que o quadro, com a borda transparente (o `verificarMargemDoIcone` já mediu a caixa 16–111).

- [ ] **Step 7: As capturas são estáveis**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/find apps/botai/loja/imagens apps/web/public/pilulabs/botai -name '*.png' -exec /usr/bin/shasum {} \; | /usr/bin/sort > /private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/capturas-1.txt && /usr/bin/make capturas-botai >/dev/null && /usr/bin/find apps/botai/loja/imagens apps/web/public/pilulabs/botai -name '*.png' -exec /usr/bin/shasum {} \; | /usr/bin/sort | /usr/bin/diff /private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/capturas-1.txt -; echo "exit=$?"
```

Expected: nenhuma diferença e `exit=0` (a barra do aviso parada no início deixa a página preenchida igual a cada execução; medido 3 vezes no protótipo). Uma diferença aqui é instabilidade de verdade: não versione até entender.

- [ ] **Step 8: Lint e commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/prettier --check loja playwright.capturas.config.ts package.json && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P run lint && $P run test; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/loja apps/botai/playwright.capturas.config.ts apps/botai/package.json Makefile apps/web/public/pilulabs/botai && /usr/bin/git status --short -- . ':(exclude)docs/superpowers/plans' && /usr/bin/git commit -m "feat(botai): capturas das lojas e do site geradas pelo Playwright, com o ícone 128 de margem"; echo "exit=$?"
```

Expected: `exit=0`; o `git status` antes do commit lista os 17 + 7 PNG, o gerador, a vitrine, o teste, a config, o `package.json` e o `Makefile`.

---

### Task 9: Documentação ("Publicação" no `apps/botai/CLAUDE.md` e no README, e o `CLAUDE.md` raiz)

**Files:**

- Modify: `apps/botai/CLAUDE.md`
- Modify: `apps/botai/README.md`
- Modify: `CLAUDE.md` (raiz)
- Test: prettier e as frases antigas sumidas (Step 5)

**Interfaces:**

- Consumes: tudo das Tasks 1–8 e as seções que a fase 1 escreveu ("Pacotes, fontes da AMO e CI", "Comandos", "Testes", a linha "Distribuição:").
- Produces: o passo a passo do dono (README, "Publicação (para quem mantém)") e o funcionamento do release (CLAUDE.md, "Publicação"), sem repetir um no outro.

- [ ] **Step 1: `apps/botai/CLAUDE.md`, ajustes no que a fase 1 escreveu**

0. No bloco de "Estrutura", troque a linha `scripts/reproduzir-fontes.sh …` (da fase 1) por estas, mantendo o alinhamento do bloco:

```
scripts/                          release: reproduzir-fontes.sh (fase 1), submeter-lojas.sh (job lojas), conferir-tag.sh, versao.sh e release.sh (make versao-botai/release-botai); testes Vitest ao lado
loja/                             material das lojas: textos.md, notas-revisores.md, o gerador das imagens (pecas.ts, quadros.ts, capturas.captura.ts) e imagens/ (gerado)
playwright.capturas.config.ts     Playwright só das capturas (make capturas-botai), fora do test:e2e e do CI
```

1. Em "Identidade", no item "**Créditos:**", troque "(o site ainda não está no ar; o link é esse mesmo)" por "(o domínio redireciona com 308 para `https://piluvitu.com.br/pilulabs` a partir do passo 2 da "Publicação" do `README.md`)".
2. Troque a linha que começa com "Distribuição:" (a da fase 1) por:

```markdown
Distribuição: Chrome Web Store, Firefox Add-ons (canal listed), Microsoft Edge Add-ons e Opera Add-ons, publicadas pela PiluTech a partir da 1.0.0 (ver "Publicação"); em desenvolvimento, carregada sem empacotar (ver "Navegadores"). Fora: Safari, Firefox para Android e listagem em inglês (`_locales`).
```

3. Em "Pacotes, fontes da AMO e CI", no item "**CI:**", troque a frase "A tag `botai-v*`, o GitHub Release e o job `lojas` entram na fase 3." por "Na tag `botai-v*`, o mesmo workflow cria o GitHub Release e roda o job `lojas` (ver "Publicação")."
4. Em "Testes", acrescente:

```markdown
- **Vitest fora do `src/`:** o `include` cobre também `scripts/**/*.test.ts` (os scripts do release, rodados de verdade num repositório git temporário com origem bare e `pnpm`/`gh` falsos; `scripts/repo-de-teste.ts`) e `loja/**/*.test.ts` (limites dos textos das lojas, peças, quadros e o tamanho das imagens geradas).
- **Capturas** não são teste: `playwright.capturas.config.ts` só roda `loja/*.captura.ts`, pelo `make capturas-botai`, fora do `test:e2e` e do CI. O fixture da extensão tem a opção `aparencia` (`{ tema: 'claro' | 'escuro', escala }`, padrão claro a 1×), porque o contexto persistente ignora o `test.use({ colorScheme })` do Playwright (`src/test/aparencia.e2e.ts`).
```

5. Na tabela de "Comandos", acrescente:

```markdown
| `make versao-botai V=x.y.z` | PR de versão: branch da `origin/main`, `pnpm version --no-git-tag-version`, commit, push e `gh pr create` |
| `make release-botai` | na `main` depois do merge: tag anotada `botai-v<versão>` e push (dispara o `botai-release.yml`) |
| `make capturas-botai` | imagens das lojas em `loja/imagens/` e cópias em `apps/web/public/pilulabs/botai/` (rode no Mac) |
```

- [ ] **Step 2: `apps/botai/CLAUDE.md`, a seção "Publicação"**

Depois da seção "Pacotes, fontes da AMO e CI" (que a fase 1 pôs logo depois de "Navegadores"; a seção nova fica antes de "Testes"), acrescente:

```markdown
## Publicação

Quatro lojas, o mesmo código: Chrome Web Store e Edge Add-ons com `botai-<versão>-chrome.zip`, Firefox Add-ons (AMO, canal listed) com `-firefox.zip` + `-sources.zip`, Opera Add-ons com `-opera.zip` (sem minificar, envio sempre manual). Publicador: PiluTech. O passo a passo do dono (contas, credenciais, primeiro envio e lançamento) está no `README.md`, seção "Publicação (para quem mantém)"; o que vai em cada campo das lojas, em `loja/README.md`.

### Versão

- A `version` do `package.json` vale para as quatro lojas, é sempre `x.y.z` e sempre sobe: as lojas recusam versão repetida ou menor, e o WXT tira o sufixo no Firefox. A primeira pública é a 1.0.0.
- O repo só aceita squash, então o bump e a tag são dois passos:
  - `make versao-botai V=x.y.z` (`scripts/versao.sh`): a partir da `origin/main`, cria `chore/botai-v<x.y.z>`, roda `pnpm version --no-git-tag-version`, commita `chore(botai): versão x.y.z`, dá push e abre o PR. Recusa árvore suja, versão fora de `x.y.z` e versão que não sobe em relação à `origin/main`.
  - Depois do merge, na `main` atualizada: `make release-botai` (`scripts/release.sh`). Exige árvore limpa e `HEAD` igual à `origin/main`, aborta se a tag existe, cria a tag anotada `botai-v<versão>` e dá push.

### `botai-release.yml`

- **Gatilhos:** PR que toca o Botaí, os pacotes que ele empacota, os arquivos da raiz do zip de fontes ou o workflow; push de tag `botai-v*`; `workflow_dispatch` com `lojas` (`nenhuma` | `dry-run` | `submeter`, padrão `nenhuma`) e `adiar_chrome` (padrão `false`).
- **`pacotes`:** o da fase 1 (ver "Pacotes, fontes da AMO e CI"), com o checkout completo (`fetch-depth: 0`) e, só no push de tag, o `scripts/conferir-tag.sh` antes do build: a tag tem de ser `botai-v` + a versão do `package.json` e o commit tem de estar na `origin/main` (o script descasca `^{commit}`, então aceita o commit ou o objeto da tag anotada). Expõe `outputs.versao`.
- **`release`:** só no push de tag, e é o único job com `contents: write`. `gh release create --verify-tag --latest=false` (num monorepo, o Botaí não pode virar o "Latest" do repositório) com os 4 zips do artifact `botai-zips` e as notas dos commits que tocam `apps/botai`, `packages/tools` e `packages/ui` desde a tag anterior.
- **`lojas`:** roda `scripts/submeter-lojas.sh`, que decide o modo pelo `github.event_name`: PR → `nenhuma`; push de tag → `submeter`; dispatch → o input `lojas` (um dispatch disparado de uma tag com `dry-run` continua dry-run). Em `nenhuma`, confere que os 4 zips estão no artifact e imprime em `::notice::` o `wxt submit` de cada loja; no PR também roda o actionlint deste workflow (imagem `rhysd/actionlint:1.7.12` fixada por digest).
  - O `environment` vem de uma expressão: `lojas-botai` (aprovação manual do dono) fora do PR e do dispatch `nenhuma`, vazio no resto. Os secrets só existem no environment: um caminho sem aprovação não tem como publicar. Atenção à ordem na expressão: `cond && 'lojas-botai' || ''`; invertida, daria sempre `lojas-botai`, porque `''` é falso no Actions.
  - Cada loja só entra com **todos** os seus secrets (Chrome: `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`; Firefox: `FIREFOX_JWT_ISSUER` + `FIREFOX_JWT_SECRET`; Edge: `EDGE_CLIENT_ID` + `EDGE_API_KEY`). Nenhum → `::notice::` e exit 0 (a 1.0.0 sai assim); metade → `::error::`, porque cadastro errado não pode virar loja pulada em silêncio. As variables de uma loja sem secret saem do ambiente antes do `wxt submit`: o publicador valida valor vazio.
  - O script só aceita `submeter` a partir da `main` ou de uma tag `botai-v*`, e o `dry-run` de qualquer ref; na prática, a regra "Deployment branches and tags" do environment (`main` e `botai-v*`) barra os dois em outra branch antes do script. O `--dry-run` do publicador autentica de verdade: só serve depois das credenciais.
  - Chrome: `CHROME_API_VERSION=v2` sempre (sem ela o `publish-browser-extension` 6.1.1 usa a v1.1, desligada em 15/10/2026); `CHROME_EXTENSION_ID` ← `vars.BOTAI_CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID` e `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` ← as variables de mesmo nome. `CHROME_PUBLISH_TYPE=STAGED_PUBLISH` só com `adiar_chrome: true`, e só exportado nesse caso (vazio, o publicador recusa); o padrão publica, senão toda atualização fica esperando um clique no painel.
  - Firefox: `FIREFOX_EXTENSION_ID=botai@pilutech.com.br`, `FIREFOX_CHANNEL=listed`, `FIREFOX_COMPATIBILITY=firefox` e `--firefox-sources-zip`. Edge: `--edge-zip` com o zip da Chrome, `EDGE_PRODUCT_ID` ← `vars.BOTAI_EDGE_PRODUCT_ID`. Opera: fora (o publicador usaria o cookie de sessão do painel, que expira).
- O `wxt submit` lê sozinho o `.env.submit` do diretório atual (ignorado pelo git): nunca versione credencial.

### Imagens das lojas (`make capturas-botai`)

- `pnpm --filter @pilutech/botai capturas`: `build-storybook` + `build:e2e` + `playwright test -c playwright.capturas.config.ts`.
- O popup sai das stories (o `storybook-static` servido por `context.route` em `http://storybook.local`), com o atalho `Ctrl+Shift+Y` das stories e o tema pelo global, a 2×: não depende do sistema (a extensão real mostraria `⌥⇧P` num Mac). O `body { padding: 0 }` desfaz o layout "padded" do Storybook, que encolheria o popup para 348 px (o gerador exige 380).
- A página preenchida sai da extensão real (build e2e, `aparencia` escuro/claro a 2×) sobre `loja/vitrine.pagina.html`: 12 campos reconhecidos + "Código de indicação" e "Como nos conheceu?", o mesmo "12 de 14" da story do 1c que vai por cima (o gerador exige). A barra de tempo do aviso fica parada no início, e duas execuções seguidas geram os mesmos bytes.
- `loja/pecas.ts` é a lista de peças (nomes e tamanhos), `loja/quadros.ts` monta o HTML de cada quadro, e o ícone 128 sai de `loja/icone-1i.svg` com arte de 96 px e margem transparente de 16 px (o gerador mede a caixa da arte).
- Grava em `loja/imagens/` e copia o ícone e as 6 capturas de 1280×800 para `apps/web/public/pilulabs/botai/` (`icone-128.png` e `capturas/<NN>-<cena>-<tema>.png`), que o site descobre no build. `loja/imagens.test.ts` confere os tamanhos e que as cópias do site são idênticas às da loja.
- Rode no Mac (a vitrine usa `system-ui`) e regere quando o popup, o aviso ou os textos das cenas mudarem: as capturas das lojas mostram a UI atual.
- **Conflito esperado com a fase 2 do site:** ela versiona `apps/web/public/pilulabs/botai/icone-128.png` como cópia do ícone do manifesto. Se ela chegar à `main` antes, o rebase desta branch para em add/add nesse arquivo: fique com o desta branch (durante o rebase, o "theirs" é o commit desta branch sendo reaplicado: `git checkout --theirs apps/web/public/pilulabs/botai/icone-128.png`, `git add` e `git rebase --continue`) e confirme com `cd apps/botai && ./node_modules/.bin/vitest run loja/imagens.test.ts`.
- `@source not '../loja'` e `@source not '../scripts'` no `styles.css`: o Tailwind varre os `.md`, `.html` e scripts da pasta do app (medido com `skew-x-12` num `.md` de `loja/`), e um texto das lojas não pode mudar o CSS da extensão.
```

- [ ] **Step 3: `apps/botai/README.md`, "Publicação (para quem mantém)"**

Antes da seção "## Licença" (da fase 1), acrescente:

```markdown
## Publicação (para quem mantém)

O Botaí sai em quatro lojas pela PiluTech. Como o release funciona está no [`CLAUDE.md`](./CLAUDE.md), seção "Publicação"; o que vai em cada campo das lojas, em [`loja/README.md`](./loja/README.md).

**Uma vez, antes do primeiro envio:**

1. **Site no ar:** `https://piluvitu.com.br/pilulabs/botai` (com `listado: false`) e `https://piluvitu.com.br/pilulabs/botai/privacidade` respondem 200.
2. **`pilutech.com.br` redireciona** (o "Powered by PiluTech" do popup aponta para lá). Na Cloudflare:
   1. um registro `A @ 192.0.2.1` **proxiado** (nuvem laranja) e o mesmo para `www`: o Single Redirect só age sobre tráfego proxiado;
   2. em Rules, um Single Redirect 308 de `pilutech.com.br` e `www.pilutech.com.br` para `https://piluvitu.com.br/pilulabs`;
   3. `curl -I https://pilutech.com.br` responde `308` com `location: https://piluvitu.com.br/pilulabs`.
3. **Contas:**
   - Chrome Web Store: taxa única de US$ 5, verificação em duas etapas obrigatória e e-mail de login **imutável** (use um dedicado da PiluTech). Declare-se Trader com os dados da PiluTech, depois de confirmar com o contador.
   - Firefox Add-ons: conta Mozilla com 2FA.
   - Edge: conta no Partner Center (grátis).
   - Opera: conta de desenvolvedor em addons.opera.com.
   - Confira se o nome colide na Chrome Web Store e no INPI ("GetBotAI" já existe na AMO).
4. **Environment no GitHub:** Settings → Environments → New environment `lojas-botai`. Em "Required reviewers", só você, **sem** "Prevent self-review"; em "Deployment branches and tags", a `main` e a regra de tag `botai-v*`. Crie antes da primeira tag: um workflow que cita um environment inexistente o cria sem proteção.

**Primeira versão (1.0.0):**

5. Com as fases 1 e 3 na `main`: `git switch main && git pull` e `make release-botai`. A tag `botai-v1.0.0` gera o GitHub Release com os 4 zips; o job `lojas` pede a sua aprovação e, aprovado, sai com `::notice::` (ainda não há secrets).
6. **Primeiro envio à mão** em cada loja, com os zips do Release e o material de `loja/`:
   - Chrome Web Store: `botai-1.0.0-chrome.zip`, com a publicação **adiada** (desmarque a publicação automática);
   - Firefox Add-ons: canal listed, `botai-1.0.0-firefox.zip` + `botai-1.0.0-sources.zip`, licença MIT e a nota AMO de `loja/notas-revisores.md`;
   - Edge: `botai-1.0.0-chrome.zip`;
   - Opera: `botai-1.0.0-opera.zip` e a nota Opera.
7. **Credenciais**, todas no environment `lojas-botai` (secret: `gh secret set NOME --env lojas-botai`; variable: `gh variable set NOME --env lojas-botai --body "valor"`):
   - Chrome: num projeto do Google Cloud, habilite a "Chrome Web Store API", crie uma service account **sem nenhuma role** e uma chave JSON; no painel da Chrome Web Store, em Account, adicione o e-mail da service account. Cadastre `jq -r .private_key chave.json | gh secret set CHROME_SERVICE_ACCOUNT_PRIVATE_KEY --env lojas-botai` e as variables `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_PUBLISHER_ID` (Publisher → Settings) e `BOTAI_CHROME_EXTENSION_ID` (o ID do item). Apague a chave JSON local depois.
   - Firefox: gere as chaves em https://addons.mozilla.org/developers/addon/api/key/ e cadastre `FIREFOX_JWT_ISSUER` e `FIREFOX_JWT_SECRET`.
   - Edge: no Partner Center, Publish API → Create API credentials; cadastre `EDGE_CLIENT_ID`, `EDGE_API_KEY` (anote a data de expiração da chave) e a variable `BOTAI_EDGE_PRODUCT_ID`.
8. **Dry-run:** `gh workflow run botai-release.yml --ref main -f lojas=dry-run`, aprove o job `lojas` e confira no log `::notice::dry-run: Chrome Firefox Edge` e o job verde.
9. **Lançamento**, com a Chrome e a AMO aprovadas:
   - publique o item adiado no painel da Chrome Web Store (há 30 dias a partir da aprovação);
   - AMO e Edge ficam públicos assim que aprovam;
   - por PR no site, as URLs das lojas aprovadas em `apps/web/content/produtos/botai/index.yaml` e `listado: true` (Edge e Opera entram quando aprovarem);
   - neste README, "Como instalar" ganha os links das lojas.

**Versões seguintes:** `make versao-botai V=x.y.z` (abre o PR), merge, `git switch main && git pull`, `make release-botai` e aprove o job `lojas`. Para publicar adiado na Chrome, rejeite a aprovação da tag e rode `gh workflow run botai-release.yml --ref botai-v<versão> -f lojas=submeter -f adiar_chrome=true`. O Opera é sempre à mão, com o `botai-<versão>-opera.zip` do Release e a nota Opera.
```

- [ ] **Step 4: `CLAUDE.md` raiz**

1. No item `apps/botai` de "Tech Stack", troque "Publicação nas 4 lojas a partir da 1.0.0 (fase 3 da spec multinavegador)." por "Publicada nas 4 lojas pela PiluTech a partir da 1.0.0: tag `botai-v*` → GitHub Release + `wxt submit` com aprovação (ver "Publicação" em `apps/botai/CLAUDE.md`)."
2. Na tabela de "Commands", depois da linha do `make zip-botai`, acrescente:

```markdown
| `make versao-botai V=x.y.z` | PR de versão do Botaí (branch da `origin/main`, bump sem tag, `gh pr create`) |
| `make release-botai` | Na `main`, depois do merge: tag anotada `botai-v<versão>` + push (dispara o `botai-release.yml`) |
| `make capturas-botai` | Imagens das lojas do Botaí + cópias em `apps/web/public/pilulabs/botai/` (rode no Mac) |
```

3. Depois da seção "### Gate do design system: `scripts/check-tailwind-source.mjs`" (antes de "### Pre-commit hook"), acrescente:

```markdown
### Imagens do Botaí no `apps/web`

`apps/web/public/pilulabs/botai/icone-128.png` e `capturas/<NN>-<cena>-<tema>.png` são gerados por `make capturas-botai`, no `apps/botai` (o mesmo gerador das imagens das lojas, `apps/botai/loja/`), e versionados. O site só os lê: o `listarCapturas('botai')` descobre as capturas no build. Não edite esses PNG à mão; o `apps/botai/loja/imagens.test.ts` falha se a cópia do site divergir da da loja.
```

4. Na tabela "Workflows GitHub Actions", troque a linha inteira do `botai-release.yml` (da fase 1) por:

```markdown
| `botai-release.yml` | PR em `main` que toca `apps/botai/**`, `packages/tools/**`, `packages/ui/**`, os arquivos da raiz do zip de fontes ou o próprio workflow; tag `botai-v*`; dispatch (`lojas`: `nenhuma`/`dry-run`/`submeter`, `adiar_chrome`) | `pacotes` (`ubuntu-24.04`): lint + Vitest + `zip` dos 3 navegadores com os gates + `web-ext lint` + reprodução do pacote do Firefox a partir do zip de fontes no Node 24.14.0 (`cmp` byte a byte), artifact `botai-zips`; na tag, confere tag = `botai-v<versão>` e commit na `main`. `release` (só na tag, único com `contents: write`): GitHub Release com os 4 zips, `--latest=false`. `lojas`: `wxt submit` para Chrome (API v2), AMO e Edge atrás do environment `lojas-botai` (aprovação manual), só as lojas com secrets; no PR roda sem environment, só imprime os comandos e roda o `actionlint`. Fora do `CI` para não segurar o deploy do finanças. |
```

5. Em "Secrets/Vars necessários no GitHub", depois da lista de **Secrets**, acrescente:

```markdown
**Environment `lojas-botai`** (Settings → Environments; revisor obrigatório = o dono; branches e tags: `main` e `botai-v*`), usado só pelo job `lojas` do `botai-release.yml`:

- Secrets: `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` (PEM da chave JSON da service account), `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`, `EDGE_CLIENT_ID`, `EDGE_API_KEY` (expira; a data aparece no Partner Center)
- Variables: `BOTAI_CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `BOTAI_EDGE_PRODUCT_ID`
```

- [ ] **Step 5: Prettier e conferência**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && apps/botai/node_modules/.bin/prettier --write apps/botai/CLAUDE.md apps/botai/README.md CLAUDE.md && apps/botai/node_modules/.bin/prettier --check apps/botai/CLAUDE.md apps/botai/README.md CLAUDE.md; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/grep -c -e 'entram na fase 3' -e 'o site ainda não está no ar' -e 'Publicação nas 4 lojas a partir da 1.0.0 (fase 3' apps/botai/CLAUDE.md CLAUDE.md; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/grep -c -e '^## Publicação$' -e 'make capturas-botai' apps/botai/CLAUDE.md && /usr/bin/grep -c '^## Publicação (para quem mantém)$' apps/botai/README.md; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/vitest run loja/textos.test.ts; echo "exit=$?"
```

Expected: `exit=0` no prettier; `0` nos dois arquivos no segundo (as frases antigas sumiram; `exit=1` é o esperado do `grep -c` sem achado); contagens ≥ 1 e `exit=0` no terceiro; `exit=0` no quarto (o `loja/README.md` continua sem a grafia errada da marca).

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai/CLAUDE.md apps/botai/README.md CLAUDE.md && /usr/bin/git commit -m "docs(botai): seção Publicação, o passo a passo do dono e o release no CLAUDE.md raiz"; echo "exit=$?"
```

---

### Task 10: Verificação final e entrega ao dono

**Files:** nenhum novo (só verificação; se algo falhar, corrija na task de origem e repita).

**Interfaces:**

- Consumes: tudo.
- Produces: a saída do terminal que prova o "Pronto quando" da fase (actionlint ok no workflow, o job `lojas` em PR imprime o comando sem secrets, capturas geradas, testes, lint e build verdes) e a lista do que só o dono faz.

- [ ] **Step 1: Lint, tipos, Vitest e prettier**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && P=/Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm && $P --filter @pilutech/botai lint && $P --filter @pilutech/botai test; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && ./node_modules/.bin/prettier --check "{src,.storybook,loja,scripts}/**/*.{ts,tsx,css,html,md}" "*.{ts,mjs,json,md}" && /opt/homebrew/bin/shellcheck scripts/*.sh; echo "exit=$?"
```

Expected: `exit=0` nos dois (o Vitest inclui `scripts/` e `loja/`).

- [ ] **Step 2: Builds, zips 1.0.0, `web-ext lint`, reprodução das fontes e o job `lojas` no modo de PR**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && rm -rf apps/botai/.output && /usr/bin/make zip-botai && /bin/ls apps/botai/.output/*.zip && /Users/piluvitu/.nvm/versions/node/v22.22.3/bin/pnpm --filter @pilutech/botai lint:firefox; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && V=$(node -p "require('./apps/botai/package.json').version") && /usr/local/bin/docker run --rm -v "$PWD:/repo:ro" node:24.14.0 bash /repo/apps/botai/scripts/reproduzir-fontes.sh "/repo/apps/botai/.output/botai-$V-sources.zip" "/repo/apps/botai/.output/botai-$V-firefox.zip"; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai && env -i PATH="$PATH" HOME="$HOME" EVENTO=pull_request ORIGEM_REF=refs/pull/1/merge VERSAO=1.0.0 PASTA_ZIPS="$PWD/.output" bash scripts/submeter-lojas.sh; echo "exit=$?"
```

Expected: os 4 zips `botai-1.0.0-*`, `errors 0` no `web-ext lint` e `exit=0`; `IDENTICO: botai-1.0.0-firefox.zip` e `exit=0` (os scripts, o material das lojas e as imagens entram no zip de fontes por `apps/botai/**`, e o `@source not` deixa o CSS igual dos dois lados); as 4 linhas `::notice::` do job `lojas` (Chrome, Firefox com o zip de fontes, Edge com o zip do Chrome, Opera manual) e `exit=0`.

- [ ] **Step 3: Playwright inteiro**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/make test-e2e-botai; echo "exit=$?"
```

Expected: todos passando, com os 2 do `aparencia.e2e.ts` e o teste de justificativas do `manifesto.e2e.ts`, `exit=0`.

- [ ] **Step 4: Workflow**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /opt/homebrew/bin/actionlint .github/workflows/botai-release.yml .github/workflows/ci.yml .github/workflows/botai-e2e.yml && /usr/local/bin/docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color .github/workflows/botai-release.yml; echo "exit=$?"
```

Expected: `exit=0`.

- [ ] **Step 5: Capturas estáveis e árvore limpa**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/make capturas-botai >/dev/null && /usr/bin/git status --short -- . ':(exclude)docs/superpowers/plans'; echo "exit=$?"
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git log --oneline -9 && /usr/bin/git tag --list 'botai-v*'; echo "exit=$?"
```

Expected: nenhum arquivo pendente fora de `docs/superpowers/plans/` depois de regerar as capturas (os PNG versionados batem com os gerados) e `exit=0`; os 9 commits desta fase no topo da branch, **nenhuma tag** e nenhum push.

- [ ] **Step 6: Entregar ao dono**

Na resposta final, cole a saída real (com os `exit=`) dos Steps 1–5 e liste o que só o dono faz, porque o agente não alcança:

1. **O primeiro PR no GitHub:** depois do push da `feat/botai-multinavegador`, conferir no run do `botai-release.yml` que o job `lojas` **não** pede aprovação (o `environment` vazio da expressão vale como "sem environment"), roda o actionlint e mostra os 4 `::notice::`. Se o GitHub recusar o `environment` vazio, o run aparece como inválido já no PR (nada é enviado, porque sem environment não há secret): a correção é tirar o PR para um job próprio, sem `environment`, com os mesmos passos e o `if: github.event_name == 'pull_request'`, e o `lojas` com `if: github.event_name != 'pull_request'`.
2. **Atualizar sobre a `main` antes do PR:** o #45 já está na `main` (squash `4caeca8`) e a branch já nasce em cima dele (contrato, "Branches e worktrees"): nunca o `git rebase --onto origin/main feat/extensao-dados-teste …`, que reaplicaria o #45. Se a `main` andou, `/usr/bin/git fetch origin && /usr/bin/git rebase origin/main`. Se a fase 2 já estiver na `main`, há dois conflitos esperados (contrato, "Integração na `main`"): o `icone-128.png` do site (add/add), em que fica o desta branch (ver "Imagens das lojas" no `apps/botai/CLAUDE.md`), conferido com `cd apps/botai && ./node_modules/.bin/vitest run loja/imagens.test.ts`; e a tabela de workspaces do `CLAUDE.md` da raiz, no commit de docs da fase 1, em que ficam as duas mudanças (a linha do `apps/web` com `/pilulabs` e a do `apps/botai`), seguidas de `apps/botai/node_modules/.bin/prettier --write CLAUDE.md`.
3. **Tudo da seção "Publicação (para quem mantém)" do `apps/botai/README.md`**, na ordem: site no ar, `pilutech.com.br` com o Single Redirect e o `curl -I` (os dois estão no checklist do dono da fase 2: se já feitos, só confira), contas (CWS com 2SV, e-mail imutável e Trader confirmado com o contador; AMO com 2FA; Edge; Opera), o environment `lojas-botai` **antes** da tag, `make release-botai` na 1.0.0 com o merge feito, o primeiro envio manual nas 4 lojas, as credenciais, o dry-run e o lançamento.
4. **Os checklists manuais da fase 1** (Firefox, Edge e Opera), se ainda não rodados: a 1.0.0 vai às lojas com o comportamento que eles confirmam.

---

## Self-review (feito ao escrever o plano)

- **Cobertura da spec §5 (o que cabe à fase 3), §7 e §9.3:** gatilho de tag, `workflow_dispatch` com `lojas` e `adiar_chrome`, PR (Task 3); conferência de tag = versão e commit na `main` (Tasks 2 e 3); `wxt submit` com `CHROME_API_VERSION: v2`, o mapa das variables `BOTAI_*`, `FIREFOX_EXTENSION_ID`/`CHANNEL listed`/`COMPATIBILITY`, `--firefox-sources-zip`, Edge com o zip do Chrome, cada loja só com secrets e `::notice::` sem nenhum, `STAGED_PUBLISH` só com `adiar_chrome` (Tasks 1 e 3); no PR, sem environment, só imprimindo, com actionlint (Tasks 1 e 3); dry-run por dispatch (Tasks 1 e 3); GitHub Release só na tag, `contents: write`, `--latest=false`, zips de `botai-zips/` (Task 3); Opera manual com o zip no Release (Tasks 1 e 3); `make versao-botai`/`release-botai` (Task 2); versão 1.0.0 (Task 4); `apps/botai/loja/` com textos e limites por loja, single purpose, justificativa por permissão com `menus`, remote code não, dados, categorias, licença MIT, notas para revisores da AMO e do Opera (Task 6); ícone 128 com arte 96 + margem 16 do 1i, tile, logo do Edge, capturas 1280×800, 640×400, Opera 612×408 com fundo branco (Tasks 7 e 8); script Playwright único com stories (atalho e tema por prop/global) e a extensão real pela opção `aparencia` (Tasks 5 e 8); cópias em `apps/web/public/pilulabs/botai/` (Task 8); "Publicação" no `apps/botai/CLAUDE.md` e no README com o passo a passo do §7 (Task 9). O `.env.submit` no `.gitignore` já veio da fase 1 (conferido no pré-voo).
- **Placeholders:** nenhum "TBD"/"TODO"; todo passo de código traz o código (todos rodados no protótipo); os únicos pontos condicionais (story renomeada, diferença no `pacotes` da fase 1, classe que saia do CSS no canário da Task 1) dizem exatamente o que conferir e o que trocar.
- **Tipos e nomes:** `Aparencia`/`aparencia` (Task 5) usado igual na Task 8; `lerSecoes`/`permissoesJustificadas` (Task 6) usados no `manifesto.e2e.ts`; `Tema`, `Cena`, `CenaDeDestaque`, `CAPTURAS`, `PECAS_DA_LOJA`, `COPIAS_PARA_O_SITE`, `arquivoDaCaptura`, `arquivoDaOpera`, `TAMANHO_DA_OPERA` (Task 7) usados iguais nas Tasks 8 e no `imagens.test.ts`; `htmlIcone`/`htmlTile`/`htmlPagina`/`htmlDestaque`/`dataUrl` com as mesmas assinaturas; as variáveis do `submeter-lojas.sh` (`EVENTO`, `ENTRADA_LOJAS`, `ADIAR_CHROME`, `ORIGEM_REF`, `VERSAO`, `PASTA_ZIPS`) são as mesmas no teste, no workflow e na simulação local; `criarRepoDeTeste` com `argsDoGh`/`escreverVersao`/`gitDaOrigem` usados nos três testes da Task 2.
- **Review Focus:** os 5 itens têm teste ou medição na task dona (1, 1, 2, 1, 8).
