# Botaí em repo próprio: contrato entre os planos

Nomes, caminhos e assinaturas que mais de um plano usa. Um plano não renomeia nada daqui; se precisar de nome novo que cruza fases, acrescenta aqui. Spec: `docs/superpowers/specs/2026-10-05-botai-repo-proprio-design.md`.

## Caminhos e repositórios

| Nome                        | Valor                                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo                    | `/Users/piluvitu/WWW/PiluVitu-Dev` (`github.com/PiluVitu/PiluVitu-Dev`, público)                                                                                                              |
| Repo novo                   | `/Users/piluvitu/PILUTECH/Botai` (`github.com/PiluVitu/Botai`, público, criado só com OK do dono)                                                                                             |
| Área temporária da extração | `/Users/piluvitu/PILUTECH/.botai-extracao` (clone da `main` do GitHub, só essa branch e as tags dela, para o `git filter-repo`: um espelho traria os `refs/pull/*`; apagada no fim da fase 0) |

## Workspaces do repo novo

| Pasta                  | Pacote                       | Publicado                                | Origem                                    |
| ---------------------- | ---------------------------- | ---------------------------------------- | ----------------------------------------- |
| `extensao/`            | `@pilutech/botai`            | não (`private: true`; vai para as lojas) | `apps/botai/`                             |
| `site/`                | `@pilutech/botai-site`       | não (`private: true`; Vercel)            | `apps/botai-site/`                        |
| `packages/core/`       | `@pilutech/botai-core`       | npm, público                             | módulos do Botaí em `packages/tools/src/` |
| `packages/playwright/` | `@pilutech/botai-playwright` | npm, público (fase 3)                    | novo                                      |

No monorepo: `packages/ui/` = `@piluvitu/ui`, publicado no npm a partir da fase 0 (escopo do usuário `piluvitu`). `@pilutech` é a organização `pilutech` do npm.

Todo pacote publicado leva `"publishConfig": { "access": "public" }`, `"license": "MIT"` e `files` em lista fechada.

## Branches e tags

| Onde      | Branch                                              | Para quê                                                                                                       |
| --------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| monorepo  | `docs/botai-repo-proprio`                           | spec, contrato e planos (PR antes da extração, para a extração levar os docs)                                  |
| monorepo  | `feat/ui-npm`                                       | fase 0, parte A: `@piluvitu/ui` publicável e workflow de publicação                                            |
| monorepo  | `chore/botai-sai-do-monorepo`                       | fase 0, parte D: remover o Botaí e consumir `@pilutech/botai-core` do npm (só depois do core publicado + 24 h) |
| repo novo | `main`                                              | resultado da extração + montagem (fase 0, parte B)                                                             |
| repo novo | `feat/core-cli`, `feat/servidor`, `feat/playwright` | fases 1, 2 e 3; ao fim de cada fase, `git merge --ff-only` na `main` local                                     |

Tags: `ui-v<versão>` (monorepo), `core-v<versão>`, `playwright-v<versão>` e `botai-v<versão>` (extensão, como hoje) no repo novo.

**Tags do core e do plugin nascem locais, no fim de cada fase** (tag anotada, sem push): `core-v0.1.0` no último commit da fase 0, parte B (tarefa B11); `core-v0.2.0` no merge da fase 1; `core-v0.3.0` no merge da fase 2; `core-v0.4.0` e `playwright-v0.1.0` no merge da fase 3. Antes de criar, o plano confere que a `version` do `package.json` é a da tag. O dono só faz `git push origin <tag>`. Nunca crie a tag de uma fase anterior no `HEAD`: as fases 1 a 3 rodam antes de qualquer push, e a `main` local já está numa versão mais nova (o `publicar-core.yml` reprova tag × versão). Se a tag de uma fase anterior faltar, a fase seguinte para e reporta; a única exceção é a fase 3, que cria a `core-v0.3.0` no `HEAD` de partida quando ela falta (é o merge da fase 2, versão 0.3.0 conferida).

## Versões iniciais

- `@piluvitu/ui` 0.1.0 (fase 0).
- `@pilutech/botai-core` 0.1.0 (fase 0, API de hoje), 0.2.0 (fase 1), 0.3.0 (fase 2), 0.4.0 (fase 3).
- `@pilutech/botai-playwright` 0.1.0 (fase 3).
- A extensão segue a própria versão (`extensao/package.json`, hoje 1.0.0).

## `@pilutech/botai-core`: subpaths

- Fase 0 (0.1.0): os mesmos nomes de módulo do `@piluvitu/tools` de hoje: `/aleatorio`, `/prng`, `/uf`, `/cpf`, `/cnpj`, `/rg`, `/pis`, `/titulo-eleitor`, `/celular`, `/nascimento`, `/senha`, `/nome`, `/endereco`, `/empresa`, `/cartao`, `/pessoa`, `/campos`, `/campos-formatar`, `/atalhos` (o `TECLAS_DO_MANIFESTO`, `ATALHOS` e `teclaNoMac` que hoje moram em `pilulabs.ts`). Sem barrel na raiz na 0.1.0.
- Fase 1 (0.2.0): raiz `.` com a API amigável (abaixo), `/plano` (visão plana, CSV, SQL), CLI.
- Fase 2 (0.3.0): `/servidor`.
- Fase 3 (0.4.0): `/navegador` e o arquivo `dist/navegador.iife.js`.
- Imports relativos do `packages/core/src` ficam **sem extensão** e nunca apontam para pasta (`'./servidor/index'`, não `'./servidor'`): o build (`scripts/extensoes.mjs`, fase 0) acrescenta o `.js` no `dist` e falha se o arquivo não existir, e o Jest do core não tem `moduleNameMapper` para `.js`. Plano com trecho em `.js` tira o sufixo dos imports para `src/` (os que apontam para `dist/` ficam).

## API da fase 1 (raiz `@pilutech/botai-core`)

```ts
export type Semente = number | string
export interface OpcoesDaPessoa {
  semente?: Semente // ausente = sementeAleatoria()
  hoje?: string // 'AAAA-MM-DD'; ausente = hojeEmSaoPaulo()
  uf?: UF
  dominioEmail?: string // padrão DOMINIO_EMAIL_PADRAO
}
export const DOMINIO_EMAIL_PADRAO = 'tuamaeaquelaursa.com'
export const FORMATO = 1
export const MOTOR: string // a versão do pacote
export function rngDeSemente(semente: Semente): Prng // TS puro; rngDeSemente(42) ≡ rngDeSemente('42')
export function sementeAleatoria(): string
export function hojeEmSaoPaulo(agora?: Date): string
export function gerarPessoa(opcoes?: OpcoesDaPessoa): Pessoa
export function gerarPessoas(n: number, opcoes?: OpcoesDaPessoa): Pessoa[]
export interface EnvelopeDaPessoa {
  formato: 1
  motor: string
  semente: string
  hoje: string
  pessoa: Pessoa
}
export interface EnvelopeDasPessoas {
  formato: 1
  motor: string
  semente: string
  hoje: string
  pessoas: Pessoa[]
}
```

- A função de baixo nível de hoje, `gerarPessoa(rng, hojeISO)` em `/pessoa`, passa a se chamar `montarPessoa(rng, hojeISO, opcoes?)` (mesmo subpath) na fase 1; a extensão é ajustada no mesmo plano. Para o mesmo `rng`, a pessoa não muda (a pessoa dourada de `pessoa.test.ts` continua igual).
- Lote: a pessoa `i` (base 0) usa a semente `` `${S}/${i}` ``. Se `email.endereco`, `cpf` ou `empresa.cnpj` repetir um anterior do lote, ela é sorteada de novo com `` `${S}/${i}/${k}` ``, k = 2, 3…
- Semente sempre registrada como texto no envelope (`String(semente)`).
- Arquivos dourados: `packages/core/dourado/v1/*.json`, cada um um `EnvelopeDaPessoa` ou `EnvelopeDasPessoas`, conferidos pela biblioteca (fase 1), pela CLI (fase 1), pelo servidor (fase 2) e pelo Playwright (fase 3).

## CLI e servidor

- Binário `botai` (campo `bin` do `@pilutech/botai-core`).
- Comandos: `botai pessoa`, `botai pessoas -n N`, `botai cpf|cnpj|rg|pis|titulo|celular|cep`, `botai validar <tipo> <valor>`, `botai serve` (fase 2).
- Flags comuns: `--semente`, `--hoje`, `--uf`, `--dominio-email`; lote: `--formato json|ndjson|csv|sql`, `--dialeto postgres|mysql|sqlite`, `--tabela` (padrão `pessoas`), `--campos a,b,c`.
- Servidor: `GET /pessoa`, `GET /pessoas`, `GET /saude`; query com os mesmos nomes das flags em camelCase (`semente`, `hoje`, `uf`, `dominioEmail`, `n`, `formato`, `dialeto`, `tabela`, `campos`); porta padrão 8790; host padrão `127.0.0.1` (`0.0.0.0` na imagem).
- Imagem: `ghcr.io/piluvitu/botai:<versão>` e `:latest`.
- Binários: `botai-darwin-arm64`, `botai-darwin-x64`, `botai-linux-x64`, `botai-linux-arm64`, `botai-windows-x64.exe`, `botai-windows-arm64.exe` (acrescentado pelo plano da fase 2: a spec §6.4 pede x64 e arm64 nos três sistemas), nos GitHub Releases da tag `core-v*`.

Fixado pelo plano da fase 2 (`2026-10-05-botai-fase2-servidor.md`):

```ts
// @pilutech/botai-core/servidor (src/servidor/index.ts)
export const PORTA_PADRAO = 8790
export const HOST_PADRAO = '127.0.0.1'
export const LIMITE_DE_PESSOAS = 10_000 // n do servidor: de 1 a 10 000 (a CLI vai de 0 a 100 000)
export interface OpcoesDoServidor {
  porta?: number
  host?: string
}
export interface ServidorNoAr {
  servidor: Server
  url: string
  encerrar(): Promise<void>
} // encerrar: ociosas na hora, as outras em 2 s
export interface Resposta {
  status: number
  cabecalhos: Record<string, string>
  corpo: string
}
export const ROTAS: readonly ['/pessoa', '/pessoas', '/saude']
export const TIPO_POR_FORMATO: Record<Formato, string>
export function criarServidor(): Server
export function iniciarServidor(
  opcoes?: OpcoesDoServidor,
): Promise<ServidorNoAr>
export function responder(metodo: string, alvo: string): Resposta // puro
// internos (fora de subpath): src/lote.ts, src/servidor/consulta.ts, src/bin/serve.ts
export interface FormaDoLote {
  formato: Formato
  dialeto?: Dialeto
  tabela?: string
  colunas?: readonly Coluna[]
}
export function textoDoLote(
  n: number,
  opcoes: OpcoesResolvidas,
  forma: FormaDoLote,
): Generator<string> // valida n na chamada
export class ErroDeConsulta extends Error {}
export interface PedidoDePessoas {
  n: number
  opcoes: OpcoesResolvidas
  formato: Formato
  dialeto?: Dialeto
  tabela?: string
  colunas?: Coluna[]
}
export function mensagemDeUso(erro: unknown): string | undefined // ErroDeConsulta, ErroDoPlano, ErroDeOpcao (`${opcao}: …`) → texto do 400
export function lerConsultaDaPessoa(params: URLSearchParams): OpcoesResolvidas
export function lerConsultaDasPessoas(params: URLSearchParams): PedidoDePessoas
export const USO_DO_SERVE = 'botai serve [--porta 8790] [--host 127.0.0.1]'
export const AJUDA_SERVE: string
export class ErroDoServe extends Error {
  readonly codigo: 1 | 2
}
export function lerOpcoesDoServe(
  args: readonly string[],
): Required<OpcoesDoServidor> // pelo lerArgumentos da fase 1; ErroDeUso → ErroDoServe(2)
export function subirServe(
  args: readonly string[],
  escrever?: (linha: string) => void,
): Promise<ServidorNoAr>
export function executarServe(args: readonly string[]): Promise<void>
```

- Arquivos: `packages/core/src/servidor/{consulta,rotas,index}.ts`, `packages/core/src/lote.ts`, `packages/core/src/bin/serve.ts`; `packages/core/{Dockerfile,.dockerignore}`; `packages/core/scripts/{install.sh,install.test.ts,fumaca.mjs,fumaca-imagem.sh,bun-fixo.sh,binarios.sh}`; `.bun-version` na raiz (Bun 1.4.2). O comando `pessoas` da CLI e a rota `/pessoas` escrevem pelo mesmo `textoDoLote`. O servidor lê os valores com os leitores da fase 1 (aceita e recusa o mesmo que a CLI); o 400 é `{ erro: mensagemDeUso(...) }`.
- `src/servidor/index.ts` é o único arquivo fora de `src/bin` que a trava `src/portabilidade.test.ts` deixa usar API de Node; o `tsconfig.build.json` do core compila com `"types": ["node"]`.
- O bin (`src/bin/botai.ts`) despacha `serve` antes do `executar`. Linha do stderr, contrato entre o `serve`, os testes e a fumaça: `botai serve: ouvindo em <url> (Ctrl+C encerra)`. SIGINT e SIGTERM saem com 0; porta ocupada sai com 1; uso inválido, com 2; `botai serve --help` mostra `AJUDA_SERVE` com 0.
- Respostas: JSON com `JSON.stringify(x, null, 2) + '\n'` (como a CLI); `Content-Type` por formato: `application/json`, `application/x-ndjson`, `text/csv; header=present`, `application/sql`, todos com `charset=utf-8`; toda resposta com `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`; 404 lista as rotas; 405 com `Allow: GET`; 500 com `{ erro }` e o erro no log.
- `EXTRAS` do `packages/core/scripts/pacote.test.mjs` ganha `dist/servidor/consulta.*`, `dist/servidor/rotas.*`, `dist/lote.*` e `dist/bin/serve.*` (`.js` e `.d.ts`); `dist/servidor/index.*` vem do `publishConfig.exports["./servidor"]`.
- Script `tarball` do core → `packages/core/pacote/botai-core.tgz` (o `pnpm pack`, mesmo arquivo do npm); binários em `packages/core/dist-bin/`; os dois no `.gitignore`. Alvos do `Makefile`: `imagem` (`botai:local`), `fumaca-imagem` e `binario-local`. Script `lint:sh` (ShellCheck) encadeado no `lint` do core.
- `install.sh`: `BOTAI_VERSAO` (ausente = `releases/latest`), `BOTAI_DESTINO` (padrão `~/.local/bin`), `BOTAI_RELEASES` (padrão `https://github.com/PiluVitu/Botai/releases`); baixa `SHA256SUMS` e `botai-<so>-<arq>` de `<releases>/latest/download` ou `<releases>/download/core-v<versão>`. O release do core é o "Latest" do repo: todo outro workflow que cria GitHub Release usa `--latest=false` (hoje, o `botai-release.yml`; o `publicar-playwright.yml` da fase 3 não cria release, e se passar a criar, entra com `--latest=false`).
- Workflow `.github/workflows/core-distribuicao.yml` (nome `Core Distribuição`; tag `core-v*`, PR na `main` que toca `packages/core/**`, `.bun-version`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` ou o próprio workflow, e `workflow_dispatch`): jobs `pacote` → `binarios` (macos-15) → `fumaca-binarios` (ubuntu-24.04, ubuntu-24.04-arm, macos-15, macos-15-intel, windows-2025, windows-11-arm) → `imagem` (só na tag; o único com `packages: write`) → `imagem-publicada` (a imagem do GHCR como `services:`) → `release` (só na tag; `contents: write`), mais `actionlint` (só no PR). Artifacts `core-pacote` e `core-binarios`. Sem `npm publish` e sem `id-token: write`. Imagem local do CI: `botai:fumaca`.
- `ci.yml` ganha os jobs `imagem` e `binario`; `.github/dependabot.yml` ganha o ecossistema `docker` (`/packages/core`, `cooldown.default-days: 7`).
- Actions só desta fase, fixadas por SHA: `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0`, `docker/setup-qemu-action@99012661954931238ded8c8b007157a8430204e1 # v4.4.0`, `docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1`, `docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0`, `docker/login-action@dbcb813823bdd20940b903addbd779551569679f # v4.6.0`. As que a fase 0 já usa (`checkout`, `setup-node`, `pnpm/action-setup`, `upload-artifact`, `download-artifact`) saem com o SHA da fase 0: uma versão por action no repo.
- Tag: a fase 2 cria a `core-v0.3.0` local, anotada, no `HEAD` da `main` depois do merge, conferindo a versão 0.3.0 e a `core-v0.2.0`.

## Playwright (fase 3)

- `@pilutech/botai-playwright` exporta `test`, `expect` e `fixturesBotai()`.
- Fixture `botai`: `{ pessoa: Pessoa; semente: string; preencher(alvo: Page | Locator, opcoes?): Promise<ResultadoDoPreenchimento> }`. O formato de `ResultadoDoPreenchimento` sai do `ResultadoFrame` que a extensão já usa; o plano da fase 3 fixa o nome dos campos e acrescenta aqui.
- Opções: `botaiSemente`, `botaiHoje`, `botaiUf`, `botaiDominioEmail`.
- Anotação `botai-semente`; anexo `botai-pessoa.json` em falha.

Fixado pelo plano da fase 3 (`2026-10-05-botai-fase3-playwright.md`):

```ts
// @pilutech/botai-playwright
export interface LinhaDoPreenchimento {
  frame: string
  rotulo: string
  seletor: string
} // frame = frame.url()
export interface ResultadoDoPreenchimento {
  preenchidos: LinhaDoPreenchimento[]
  naoReconhecidos: LinhaDoPreenchimento[]
  recusados: LinhaDoPreenchimento[]
}
export interface OpcoesDoPreenchimento {
  segundaPassada?: boolean
} // padrão true
export interface Botai {
  pessoa: Pessoa
  semente: string
  hoje: string
  preencher(
    alvo: Page | Locator,
    opcoes?: OpcoesDoPreenchimento,
  ): Promise<ResultadoDoPreenchimento>
}
export function sementeDoTeste(identidade: {
  projeto: string
  titulos: readonly string[]
}): string
```

- `ResultadoDoPreenchimento` é o `ResultadoFrame` sem `idx`, `contentType` e `iframesDeFora`, com o `frame` em cada linha; frames na ordem de `page.frames()`, linhas na ordem do DOM. `recusados` fica separado (sem o sufixo " (recusou o valor)" da extensão).
- O fixture expõe também `hoje` (a data com que a pessoa foi gerada). Segunda anotação: `botai-hoje` (descrição `AAAA-MM-DD`). O anexo `botai-pessoa.json` é um `EnvelopeDaPessoa`.
- Semente padrão: `sementeDoTeste({ projeto: testInfo.project.name, titulos: testInfo.titlePath })` = `[projeto (se houver), arquivo com "/", ...títulos].join(' › ')`. Retry, worker e repetição não entram.
- `@playwright/test` é peer `^1.59.1` (a versão testada).
- `@pilutech/botai-core/navegador` (0.4.0) exporta, além das funções puras de DOM de hoje: `type RaizSombra = (el: Element) => ShadowRoot | null`, `raizSombraAberta`, `campos(raiz: Document | ShadowRoot | Element, raizSombra?)`, `elementoEmFoco(doc, raizSombra?)`, `preencherDocumento({ raiz, pessoa, hojeISO, registro, contornos, raizSombra?, aoEscrever? }): ResultadoFrame`, `type LinhaDoFrame = { idx; rotulo; seletor }`, `type ResultadoFrame`, `agendarSegundaPassada(escritos, agendar): Promise<void>`, `SEM_CONTORNOS`, `preencherNaPagina(alvo: Document | Element, pessoa, hojeISO, { segundaPassada }): Promise<ResultadoFrame>`, `instalarNoGlobal(alvo?)` e `NOME_DO_GLOBAL = '__botaiNavegador'`.
- O arquivo `dist/navegador.iife.js` sai no subpath `@pilutech/botai-core/navegador.iife.js` e, executado, cria só `globalThis.__botaiNavegador` (`{ preencher: preencherNaPagina }`).
- Publicação: tag `playwright-v<versão>`, workflow `.github/workflows/publicar-playwright.yml`, no mesmo environment de aprovação do `publicar-core.yml`.

## Pontos de confirmação do dono (fora dos workflows)

1. Merge do PR `docs/botai-repo-proprio` (CI verde basta, regra do dono).
2. Primeira publicação de `@piluvitu/ui` 0.1.0 (token do dono no env local), depois trusted publishing.
3. Criar `PiluVitu/Botai` no GitHub e o primeiro push.
4. Primeira publicação de `@pilutech/botai-core`.
5. Religar o projeto `botai-site` da Vercel.
6. Recriar o environment `lojas-botai` e os secrets no repo novo.
7. Merge do PR `chore/botai-sai-do-monorepo` (24 h depois da publicação do core).
8. Fase 3: push da tag `core-v0.4.0` (criada no fim da fase 3), primeira publicação de `@pilutech/botai-playwright` 0.1.0 (token do dono no env local), o trusted publisher dele no npmjs.com e o push da tag `playwright-v0.1.0`.
9. Fase 1: push da tag `core-v0.2.0` (criada no fim da fase 1) e a aprovação do `publicar-core.yml`.
10. Fase 2: `core-distribuicao.yml` à mão na `main` (sem publicar), push da tag `core-v0.3.0` (criada no fim da fase 2), aprovação do npm e a imagem do GHCR tornada pública.

## Ordem de execução (fases 0 a 3)

1. **Antes do workflow:** ponto 1 (o Claude pode fazer: regra do dono, CI verde basta). A fase 0, parte B, extrai a `main` do GitHub e para se a spec, o contrato e os quatro planos não estiverem lá.
2. **Workflow, de uma vez e sem push:** fase 0 partes A e B (A1 a A5 antes da B4, que empacota o `@piluvitu/ui` do worktree `feat/ui-npm`), depois as fases 1, 2 e 3 no repo novo local, sem remoto. Nada disso depende de pacote publicado: o `@piluvitu/ui` vem de `vendor/piluvitu-ui-0.1.0.tgz`, **versionado** no repo novo até o passo C4 (assim todo commit até lá, inclusive os das tags `core-v0.1.0` a `core-v0.4.0`, instala no CI do GitHub sem o npm). Cada fase termina com merge `--ff-only` na `main` local e a tag local da seção "Branches e tags". A fase 2 precisa, no Mac, de Docker 25 ou mais novo de pé (OrbStack), `shellcheck` e `actionlint` no PATH (faltando um, ela para no Passo 1.2 e a fase 3 não começa) e de rede para baixar o Bun 1.4.2 e os runtimes dos alvos cruzados (Tarefa 7).
3. **Dono, na ordem:** C2 e C3 (ponto 2); 24 h depois, C4; C5 (ponto 3: o push leva a `main` com as fases 1 a 3) e C6 (ponto 6); C7; C8 (ponto 4: a 0.1.0 sai por token, empacotada da tag `core-v0.1.0`); C9 (ponto 5); C10 e C11; depois do C8, os pontos 9, 10 e 8, nessa ordem (as tags `core-v*` sobem da mais velha para a mais nova; o `publicar-core.yml` e o `core-distribuicao.yml` rodam no commit da tag).
4. **24 h depois do C8:** fase 0, parte D (workflow, sem push) e o ponto 7 (C12).

## Publicação no npm e environments (fixado pelo plano da fase 0)

| Repo      | Workflow                                             | Tag             | Environment (aprovação do dono)          |
| --------- | ---------------------------------------------------- | --------------- | ---------------------------------------- |
| monorepo  | `.github/workflows/publicar-ui.yml`                  | `ui-v*`         | `npm` (só tags `ui-v*`)                  |
| repo novo | `.github/workflows/publicar-core.yml`                | `core-v*`       | `npm` (tags `core-v*` e `playwright-v*`) |
| repo novo | `.github/workflows/publicar-playwright.yml` (fase 3) | `playwright-v*` | `npm` (o mesmo)                          |
| repo novo | `.github/workflows/botai-release.yml`                | `botai-v*`      | `lojas-botai` (como hoje)                |

- Workflow de npm: job `pacote` (confere tag × versão do `package.json` e commit na `main`, `lint`, `test`, `pnpm pack`, artifact) e job `publicar` (environment acima, `id-token: write`, Node 24.14.0, npm 11.9.0), que extrai o tarball do `pnpm pack` e roda `npm publish <pasta extraída> --access public --provenance` (trusted publishing, sem token). Só o `pnpm pack` aplica o `publishConfig.exports`.
- Pacote publicado que o workspace lê como código-fonte (`@piluvitu/ui` e `@pilutech/botai-core`) tem dois manifestos: `exports` → `./src/<m>.ts` no workspace (extensão, site e zip de fontes da AMO leem o código-fonte); `publishConfig.exports` → `{ "types": "./dist/<m>.d.ts", "default": "./dist/<m>.js" }` no tarball. Subpath novo entra nos dois. O `@pilutech/botai-playwright` ninguém lê como fonte: o `exports` dele aponta direto para `dist/`, sem `publishConfig.exports`.
- `packages/<pacote>/scripts/pacote.test.mjs` confere a lista do `pnpm pack --dry-run --json` e o manifesto do tarball. No core, a lista sai dos **valores** do `publishConfig.exports` (cada `types`/`default`, ou o caminho quando é texto), mais `LICENSE`, `README.md`, `package.json` e a constante `EXTRAS` (arquivo do tarball que nenhum subpath aponta: módulo interno, `bin`). O teste também exige as mesmas chaves no `exports` e no `publishConfig.exports`, e cada `./src/<x>.ts` do workspace trocado por `{ types: ./dist/<x>.d.ts, default: ./dist/<x>.js }` no tarball.
- `scripts/salvaguardas.test.mjs` (raiz do repo novo) exige os workflows da fase 0, toda action de **todo** workflow fixada por SHA, `cooldown` em **todo** ecossistema do Dependabot e, em todo workflow que roda `npm publish`, o environment `npm`, um só `id-token: write` e `--provenance`. Workflow ou ecossistema novo das fases 2 e 3 entra sem mexer no teste, desde que cumpra isso.
- O `botai-release.yml` cria o release da extensão com `--latest=false`.
- Só na fase 0: `vendor/piluvitu-ui-0.1.0.tgz` (versionado) + `overrides` no `pnpm-workspace.yaml` do repo novo, até o `@piluvitu/ui` 0.1.0 estar no npm há 24 h (passo C4, que tira os dois num commit).
