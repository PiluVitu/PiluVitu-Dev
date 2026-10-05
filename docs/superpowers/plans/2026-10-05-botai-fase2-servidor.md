# Botaí fase 2: servidor HTTP, imagem Docker e binários — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa a tarefa. Os passos usam checkbox (`- [ ]`).

**Objetivo:** `@pilutech/botai-core` 0.3.0 com o subpath `/servidor` (`node:http`, sem framework), o comando `botai serve`, a imagem `ghcr.io/piluvitu/botai`, os 6 binários Bun (macOS, Linux e Windows, x64 e arm64) com `SHA256SUMS` e `install.sh` no GitHub Release da tag `core-v*`, tudo conferido contra os arquivos dourados.

**Arquitetura:** a lógica HTTP é uma função pura, `responder(metodo, alvo) → { status, cabecalhos, corpo }`, sobre os módulos da fase 1: a consulta passa pelos mesmos leitores da CLI (`resolverOpcoes`, `lerUF`, `lerDominioEmail`, `lerCampos`, `lerDialeto`, `lerTabela`) e o corpo de `/pessoas` sai de `textoDoLote`, o gerador de texto do lote que esta fase extrai do comando `pessoas` da CLI (os dois escrevem o mesmo texto). `criarServidor()` só liga `responder` ao `node:http`. O `botai serve` mora em `src/bin/` (o único lugar que fala com o processo, regra da fase 1) e o bin o despacha antes do `executar`. A imagem instala o próprio tarball do `pnpm pack` (o mesmo arquivo que vai ao registro) num `node:alpine` fixado por digest, sem rede no build. Os binários saem do mesmo `bin` do pacote, compilados com o Bun do `.bun-version`; os do macOS são reassinados ad-hoc num runner macOS. Um único script de fumaça sem dependência (`scripts/fumaca.mjs`) confere binário e imagem contra os dourados, nos 6 alvos.

**Tech Stack:** TypeScript (o build `tsc` da fase 0), `node:http`/`node:net`, Jest (ts-jest, ambiente `node`), Bun 1.4.2 (`bun build --compile`), Docker (BuildKit/buildx, QEMU), POSIX sh + ShellCheck, GitHub Actions (actionlint), GHCR.

**Spec:** `docs/superpowers/specs/2026-10-05-botai-repo-proprio-design.md` (§6.4 servidor, imagem e binários; §5 segurança; §8 testes; §9 critério da fase 2). **Contrato:** `docs/superpowers/plans/2026-10-05-botai-repo-proprio-contrato.md` (nomes, caminhos, branches, tags; a seção "Fixado pelo plano da fase 2" é deste plano). **Plano anterior:** `docs/superpowers/plans/2026-10-05-botai-fase1-core-cli.md` (CLI, `/plano`, dourados, `MOTOR`). Os três estão no repo novo nos mesmos caminhos (a fase 0 leva `docs/superpowers/` na extração).

## Global Constraints

- Repo `/Users/piluvitu/PILUTECH/Botai`, branch `feat/servidor` criada da `main` local **depois** do `git merge --ff-only feat/core-cli` e da tag local `core-v0.2.0` da fase 1. No fim: `git merge --ff-only feat/servidor` na `main` local e a tag local anotada `core-v0.3.0` no `HEAD` dela (Passo 9.7; contrato, "Branches e tags"). **Nunca** `git push` (de branch ou de tag), `npm publish`, `docker push`, `gh release`, criar repo ou mexer na Vercel e no GHCR por fora do workflow: são passos do dono (seção "Passos do dono"). Nunca crie a tag de outra fase.
- Versão: `@pilutech/botai-core` **0.3.0** (Tarefa 9), pelo caminho da fase 1: `pnpm version 0.3.0 --no-git-tag-version` e `node scripts/gerar-versao.mjs`, que regrava `src/versao.ts` (`MOTOR`); o `lint` barra o arquivo fora de dia. Subpath novo: `/servidor`, nos **dois** manifestos (`exports` → `./src/servidor/index.ts`; `publishConfig.exports` → `{ "types": "./dist/servidor/index.d.ts", "default": "./dist/servidor/index.js" }`; contrato, "Publicação no npm e environments"). Nenhuma dependência de runtime nova (só `node:http` e `node:net`); nenhuma dependência de dev nova no npm.
- Arquivo novo do `dist` que nenhum subpath aponta entra na constante `EXTRAS` de `packages/core/scripts/pacote.test.mjs` (fase 0), na tarefa que o cria: `dist/servidor/consulta.*` (Tarefa 1), `dist/lote.*` e `dist/servidor/rotas.*` (Tarefa 2), `dist/bin/serve.*` (Tarefa 4). Toda conferência do pacote usa `pnpm pack` (só ele aplica o `publishConfig.exports`), nunca `npm pack`.
- Servidor: `GET /pessoa`, `GET /pessoas`, `GET /saude`; query `semente`, `hoje`, `uf`, `dominioEmail`, `n`, `formato`, `dialeto`, `tabela`, `campos`; porta padrão **8790**; host padrão **`127.0.0.1`** (`0.0.0.0` só na imagem). Os valores passam pelos leitores da fase 1, então o servidor aceita e recusa o mesmo que a CLI (`uf` e `dominioEmail` em qualquer caixa, `tabela` com `esquema.tabela`, semente de até 256 caracteres, sem caractere de controle). Só do servidor: `n` obrigatório, de 1 a **10 000** (a CLI vai de 0 a 100 000), e parâmetro desconhecido, repetido ou vazio é 400.
- Imagem: `ghcr.io/piluvitu/botai:<versão>` e `:latest`, `linux/amd64` + `linux/arm64`, base `node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`, usuário `node` (uid 1000), `HEALTHCHECK` em `/saude`, `GITHUB_TOKEN` com `packages: write` **só** no job que faz o push.
- Binários (spec §6.4: macOS, Linux e Windows, x64 e arm64): `botai-darwin-arm64`, `botai-darwin-x64`, `botai-linux-x64`, `botai-linux-arm64`, `botai-windows-x64.exe`, `botai-windows-arm64.exe` + `SHA256SUMS` + `install.sh` no GitHub Release da tag `core-v<versão>`. Bun **1.4.2** em `.bun-version` (raiz), instalado no CI por `oven-sh/setup-bun` fixada por SHA. Alvos x64 no `-baseline`.
- Actions fixadas por SHA, com o comentário de uma palavra que o `scripts/salvaguardas.test.mjs` da fase 0 exige (`uses: <action>@<40 hex> # <versão>`). Uma versão por action no repo inteiro: as cinco que a fase 0 já usa saem com o SHA da fase 0 (tabela "SHAs das actions" do plano da fase 0); as outras cinco são só desta fase. Todas conferidas com `gh api repos/<dono>/<action>/tags` em 2026-10-05:

  | Action                                                              | Versão | SHA                                                                                                    |
  | ------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
  | `actions/checkout`                                                  | v4.4.0 | `11d5960a326750d5838078e36cf38b85af677262` (fase 0)                                                    |
  | `actions/setup-node`                                                | v4.4.0 | `49933ea5288caeca8642d1e84afbd3f7d6820020` (fase 0)                                                    |
  | `pnpm/action-setup`                                                 | v4.3.0 | `b906affcce14559ad1aafd4ab0e942779e9f58b1` (fase 0)                                                    |
  | `actions/upload-artifact`                                           | v4.6.2 | `ea165f8d65b6e75b540449e92b4886f43607fa02` (fase 0)                                                    |
  | `actions/download-artifact`                                         | v4.3.0 | `d3f86a106a0bac45b974a628896c90dbdf5c8093` (fase 0)                                                    |
  | `oven-sh/setup-bun`                                                 | v2.2.0 | `0c5077e51419868618aeaa5fe8019c62421857d6`                                                             |
  | `docker/setup-qemu-action`                                          | v4.4.0 | `99012661954931238ded8c8b007157a8430204e1`                                                             |
  | `docker/setup-buildx-action`                                        | v4.4.1 | `f87e5991a6d7451dcb8d9637bfbc97413f497069`                                                             |
  | `docker/build-push-action`                                          | v7.4.0 | `c3c9e263c25d99ce0380d002d59b67737d91b0dc`                                                             |
  | `docker/login-action`                                               | v4.6.0 | `dbcb813823bdd20940b903addbd779551569679f`                                                             |
  | `rhysd/actionlint` (imagem, roda por `docker run`, não por `uses:`) | 1.7.12 | `sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667` (o mesmo digest do monorepo) |

  Se o `ci.yml` do repo já estiver noutro SHA para uma das cinco da fase 0 (o Dependabot pode ter subido), use o do `ci.yml`.

- `scripts/salvaguardas.test.mjs` (raiz, fase 0) continua verde depois das Tarefas 6, 7 e 8: toda action de todo workflow por SHA, `cooldown` em todo ecossistema do Dependabot (o `docker` desta fase incluso), nenhum `npm publish` nos workflows desta fase. O teste não muda.
- Comandos com binário direto e conferência do código de saída: `/usr/bin/git`, `/usr/bin/grep`, `/bin/ls`, `./node_modules/.bin/jest`, `./node_modules/.bin/tsc`, e o pnpm pelo caminho (`"$(command -v pnpm)"`). O wrapper `rtk` falsifica a saída de git/grep/diff/ls/pnpm/vitest/jest: todo comando de verificação termina em `; echo EXIT=$?`, e o que vale é o `EXIT` e o log em arquivo, nunca o resumo impresso. Cada comando faz `cd` para um caminho absoluto (o cwd não persiste).
- Imports relativos do `packages/core/src` **sem extensão** e **nunca para pasta** (contrato, "`@pilutech/botai-core`: subpaths"): `'../servidor/index'`, não `'../servidor'`; `'../cli/executar'`, não `'../cli'`. O build (`scripts/extensoes.mjs`, fase 0) acrescenta o `.js` no `dist` e falha se o arquivo não existir; um import de pasta vira `../servidor.js` e quebra.
- Só `src/bin/` e `src/servidor/index.ts` falam com o Node (processo, `node:http`, `Buffer`); a trava `src/portabilidade.test.ts` da fase 1 ganha só a exceção do `src/servidor/index.ts` (Tarefa 3). `consulta.ts`, `rotas.ts` e `lote.ts` continuam portáveis (usam só `URL`, `URLSearchParams` e `console`, que existem em Node, Bun, Deno e navegador).
- Comentário em código de produção é exceção (lei do `CLAUDE.md` raiz): 1 a 3 linhas, só o porquê que o código não mostra. Teste e script de fumaça comentam à vontade.
- Colocation: teste ao lado do fonte (`consulta.ts` → `consulta.test.ts`; `src/bin/serve.ts` → `src/bin/serve.test.ts`; `scripts/install.sh` → `scripts/install.test.ts`).
- Ferramentas de teste: Jest para lógica, HTTP, o processo do bin e o `install.sh` (o `jest.config.ts` do core já é `testEnvironment: 'node'`; os testes novos repetem o docblock `/** @jest-environment node */` para não depender disso). Storybook não se aplica (nenhum componente visual). Playwright não se aplica (nenhum fluxo de navegador). A fumaça de binário e imagem é `node scripts/fumaca.mjs`, sem dependência, porque roda nos 6 runners do release sem `pnpm install`.
- Depois de cada tarefa: `pnpm run lint` (o `tsc --noEmit` e o `gerar-versao --conferir` da fase 1 e, a partir da Tarefa 5, o ShellCheck) e `pnpm run test` (build + Jest + `node --test scripts/*.test.mjs`, como a fase 1 deixou) com `EXIT=0`; o `CLAUDE.md` de `packages/core` atualizado na Tarefa 9 com toda tecnologia e fluxo novos desta fase.
- Credenciais: nenhuma nova. O GHCR usa o `GITHUB_TOKEN` do workflow. `BOTAI_VERSAO`, `BOTAI_DESTINO` e `BOTAI_RELEASES` (do `install.sh`) são configuração, não segredo; o `.env.example` não muda.
- Dependências (spec §5.3), confirmadas na documentação oficial em 2026-10-05: `minimumReleaseAge` existe desde o pnpm 10.16.0 e vale **1440 por padrão a partir do pnpm 11**; `trustPolicy: no-downgrade` desde o 10.21.0 (padrão `off`); `blockExoticSubdeps` desde o 10.26.0 (padrão `true`) — fonte: https://pnpm.io/settings/dependency-resolution. Esta fase não acrescenta pacote npm, então não mexe em `pnpm-workspace.yaml`, `allowBuilds` nem no lockfile; o `minimumReleaseAge: 1440` segue sem exceção para `@pilutech/*` e `@piluvitu/*`. Dependabot: `cooldown` tem `default-days` (padrão 3 quando omitido) e `semver-*-days`, mas **Docker e GitHub Actions só aceitam `default-days`** — fonte: https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference ; o intervalo mínimo e máximo de dias: **não confirmado**. O Dependabot atualiza tag **e** digest em `FROM imagem:tag@sha256:…` — fonte: https://docs.docker.com/scout/integrations/source-code-management/github/ . npm trusted publishing (fora desta fase, é o `publicar-core.yml` da fase 0): npm CLI ≥ 11.5.1 e Node ≥ 22.14.0, `id-token: write`, proveniência gerada sozinha — fonte: https://docs.npmjs.com/trusted-publishers .
- Cache de dependências: o `actions/setup-node` v4.4.0 só faz cache com o input `cache:`. Os jobs novos do `ci.yml` (só leitura) usam `cache: pnpm`, como os da fase 0; o `core-distribuicao.yml`, que tem jobs com permissão de escrita, não usa cache nenhum.

## Review Focus

1. **Parâmetro com nome errado ou repetido** (`dominio-email`, `quantidade`, `n=1&n=2`): quem popula banco espera erro, não uma pessoa com o padrão em silêncio (e-mail no domínio errado batendo num `UNIQUE`). Esperado: 400 que nomeia o parâmetro e lista os aceitos. Teste: Tarefa 1 (`parâmetro desconhecido`, `parâmetro repetido`) e Tarefa 2 (a mesma resposta por `responder`).
2. **`docker stop`/`docker compose down` com o servidor como PID 1**: o Node como PID 1 não tem tratador padrão de SIGTERM; sem tratador próprio, o container espera os 10 s e morre com 137, travando o teardown de CI de quem consome. Esperado: sai com 0 em menos de 2 s, mesmo com conexão keep-alive aberta. Testes: Tarefa 3 (encerrar com keep-alive parada), Tarefa 4 (SIGTERM e SIGINT → código 0) e Tarefa 6 (a fumaça exige `ExitCode` 0 depois do `docker stop`).
3. **`n` fora de um inteiro de 1 a 10 000** (`0`, `-1`, `1.5`, `1e3`, `" 5"`, `10001`): um pedido grande ou malformado não pode travar o servidor nem estourar memória. Esperado: 400 com o limite; `n=10000` ainda responde. Testes: Tarefa 1 (tabela de inválidos) e Tarefa 2 (`n` no limite).
4. **`hoje` com data inexistente ou noutro formato** (`2026-02-30`, `05/10/2026`, `2026-10-5`): sem validação, a pessoa sairia com a idade e a validade do cartão deslocadas. Esperado: 400 que começa por `hoje:` e cita o valor recebido. Teste: Tarefa 1.
5. **`install.sh` numa máquina sem o binário certo ou com download corrompido** (Alpine/musl, terminal sob Rosetta, Git Bash no Windows, `armv7l`, SHA256 que não bate): esperado mensagem clara e nada instalado pela metade; sob Rosetta, o binário arm64. Teste: Tarefa 5.

---

## Mapa de arquivos (repo novo)

| Arquivo                                                                                                                           | Responsabilidade                                                                                                 | Tarefa     |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| `packages/core/src/servidor/consulta.ts` (+ `.test.ts`)                                                                           | `URLSearchParams` → opções resolvidas pelos leitores da fase 1; `ErroDeConsulta`; `mensagemDeUso` (texto do 400) | 1          |
| `packages/core/tsconfig.build.json`                                                                                               | `"types": ["node"]` (o build passa a compilar `URL`, `URLSearchParams`, `console` e `node:http`)                 | 1          |
| `packages/core/src/lote.ts` (+ `.test.ts`)                                                                                        | `textoDoLote`: o texto de `botai pessoas` em json, ndjson, csv e sql, como gerador                               | 2          |
| `packages/core/src/cli/executar.ts`                                                                                               | o comando `pessoas` passa a escrever as partes de `textoDoLote`                                                  | 2          |
| `packages/core/src/servidor/rotas.ts` (+ `.test.ts`)                                                                              | `responder(metodo, alvo)`: rotas, envelopes, `Content-Type` por formato, 400/404/405/500                         | 2          |
| `packages/core/src/servidor/index.ts` (+ `.test.ts`)                                                                              | subpath `/servidor`: `criarServidor`, `iniciarServidor`, encerramento com prazo                                  | 3          |
| `packages/core/src/portabilidade.test.ts`                                                                                         | a trava da fase 1 aceita `node:` e `Buffer` só em `src/servidor/index.ts` (além de `src/bin`)                    | 3          |
| `packages/core/src/bin/serve.ts` (+ `.test.ts`)                                                                                   | `botai serve [--porta] [--host]`, ajuda, sinais, erros de uso                                                    | 4          |
| `packages/core/src/bin/botai.ts`, `packages/core/src/cli/ajuda.ts`                                                                | o bin despacha `serve`; a ajuda geral lista o comando                                                            | 4          |
| `packages/core/scripts/install.sh` (+ `install.test.ts`)                                                                          | instalador dos binários (SO/arquitetura, SHA256, `~/.local/bin`)                                                 | 5          |
| `packages/core/jest.config.ts`, `packages/core/tsconfig.json`                                                                     | Jest e `tsc` do `lint` alcançam `scripts/**/*.ts`                                                                | 5          |
| `packages/core/scripts/fumaca.mjs`                                                                                                | fumaça sem dependência: `--binario` ou `--url`, contra os dourados do `indice.json`                              | 6          |
| `packages/core/scripts/fumaca-imagem.sh`                                                                                          | sobe a imagem, espera o `HEALTHCHECK`, roda a fumaça, `docker stop` → 0                                          | 6          |
| `packages/core/Dockerfile`, `packages/core/.dockerignore`                                                                         | imagem a partir do tarball do `pnpm pack`                                                                        | 6          |
| `.bun-version`, `packages/core/scripts/bun-fixo.sh`, `packages/core/scripts/binarios.sh`                                          | Bun fixado (local e CI) e compilação dos 6 alvos                                                                 | 7          |
| `.github/workflows/core-distribuicao.yml`                                                                                         | tag `core-v*`: binários, matriz de 6 runners, imagem, imagem publicada como `services:`, GitHub Release          | 8          |
| `.github/workflows/ci.yml` (jobs `imagem` e `binario`), `.github/dependabot.yml` (ecossistema `docker`), `.gitignore`, `Makefile` | integração                                                                                                       | 6, 7       |
| `packages/core/package.json`                                                                                                      | `exports`/`publishConfig.exports` `./servidor`, scripts `tarball` e `lint:sh`, versão 0.3.0                      | 3, 5, 6, 9 |
| `packages/core/scripts/pacote.test.mjs`                                                                                           | `EXTRAS` com os arquivos internos novos do `dist`                                                                | 1, 2, 4    |
| `packages/core/src/versao.ts`                                                                                                     | `MOTOR` = `'0.3.0'` (regravado pelo `gerar-versao.mjs`)                                                          | 9          |
| `packages/core/README.md`, `packages/core/CLAUDE.md`, `CLAUDE.md`, `README.md`                                                    | documentação                                                                                                     | 9          |

## Costura com a fase 1 (o que este plano consome)

Nomes fixados pelo plano da fase 1 (seção "Fase 1 (0.2.0): nomes que as fases 2 e 3 usam", que a Tarefa 10 dele acrescenta ao contrato do repo novo). O Passo 1.2 confere cada um; faltando algum, pare e reporte (sem adaptar em silêncio).

| Arquivo                  | Nomes                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/gerar.ts`           | `resolverOpcoes(opcoes?: OpcoesDaPessoa): OpcoesResolvidas` (sorteia a semente, usa o hoje de São Paulo, valida semente e hoje), `pessoaResolvida(r): Pessoa`, `pessoasDoLote(n, r): Generator<PessoaDoLote>` (valida `n` **na chamada**), `gerarPessoa`, `OpcoesDaPessoa`, `OpcoesResolvidas` (`{ semente: string; hoje: string; uf?: UF; dominioEmail?: string }`), `PessoaDoLote` (`{ semente: string; pessoa: Pessoa }`) |
| `src/envelope.ts`        | `envelopar(semente, hoje, pessoa): EnvelopeDaPessoa`, `FORMATO`, `EnvelopeDaPessoa`, `EnvelopeDasPessoas`                                                                                                                                                                                                                                                                                                                    |
| `src/opcoes.ts`          | `ErroDeOpcao` (`.opcao`), `LIMITE_DO_LOTE` (100 000), `lerUF` (aceita minúscula), `lerDominioEmail` (devolve em minúsculas)                                                                                                                                                                                                                                                                                                  |
| `src/plano.ts`           | `COLUNAS`, `Coluna`, `FORMATOS`, `Formato`, `DIALETOS`, `Dialeto`, `ErroDoPlano`, `lerCampos`, `lerDialeto`, `lerTabela`, `cabecalhoCsv`, `linhaCsv`, `insertSql`, `paraSql`                                                                                                                                                                                                                                                 |
| `src/versao.ts`          | `MOTOR` (gerado por `scripts/gerar-versao.mjs`)                                                                                                                                                                                                                                                                                                                                                                              |
| `src/hoje.ts`            | `hojeEmSaoPaulo`                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/cli/argumentos.ts`  | `lerArgumentos(argv, definicao: DefinicaoDeOpcoes): ArgumentosLidos` (`--x v`, `--x=v`, curta `-x`; opção desconhecida, repetida ou sem valor lança `ErroDeUso`), `ErroDeUso`, `DefinicaoDeOpcoes` (`Readonly<Record<string, DefinicaoDeOpcao>>`, com `DefinicaoDeOpcao` = `{ tipo: 'texto' \| 'booleano'; curta? }`), `ArgumentosLidos` (`{ opcoes: Record<string, string \| true>; posicionais: string[] }`)               |
| `src/cli/executar.ts`    | `executar(argv, saida: Saida): number`, `Saida`, `SAIDA`; o comando `pessoas` escreve json, ndjson (um `EnvelopeDaPessoa` por linha, com a semente `S/i` ou `S/i/k`), csv (cabeçalho e CRLF) e sql (linha `-- botai: formato 1, motor <v>, semente <S>, hoje <H>` antes dos `INSERT`)                                                                                                                                        |
| `src/bin/botai.ts`       | o bin (`bin.botai` = `dist/bin/botai.js`), único arquivo que fala com o processo                                                                                                                                                                                                                                                                                                                                             |
| `dourado/v1/indice.json` | `{ arquivo, n?, compacto?, opcoes, derivados? }[]`; os `.json` listados são envelopes; `pessoas-lote.json` tem os derivados `.csv`, `.postgres.sql`, `.mysql.sql` e `.sqlite.sql` (o `.sql` sem a linha de comentário). **O envelope não registra `uf` nem `dominioEmail`:** toda conferência contra os dourados monta a consulta pelo `opcoes` do índice, nunca só pelo `.json`                                             |
| `package.json`           | `version` 0.2.0, `bin`, `exports` (fonte) e `publishConfig.exports` (dist), `test` = `pnpm run build && jest && node --test scripts/*.test.mjs`                                                                                                                                                                                                                                                                              |

---

### Tarefa 1: Leitura da consulta (`src/servidor/consulta.ts`)

**Files:**

- Create: `packages/core/src/servidor/consulta.ts`
- Test: `packages/core/src/servidor/consulta.test.ts`
- Modify: `packages/core/tsconfig.build.json` (`types`), `packages/core/scripts/pacote.test.mjs` (`EXTRAS`)

**Interfaces:**

- Consumes: `resolverOpcoes`, `OpcoesDaPessoa`, `OpcoesResolvidas` (`src/gerar.ts`); `ErroDeOpcao`, `lerUF`, `lerDominioEmail` (`src/opcoes.ts`); `FORMATOS`, `Formato`, `Dialeto`, `Coluna`, `ErroDoPlano`, `lerCampos`, `lerDialeto`, `lerTabela` (`src/plano.ts`).
- Produces:

  ```ts
  export const LIMITE_DE_PESSOAS = 10_000
  export class ErroDeConsulta extends Error {}
  export interface PedidoDePessoas {
    n: number
    opcoes: OpcoesResolvidas
    formato: Formato
    dialeto?: Dialeto
    tabela?: string
    colunas?: Coluna[]
  }
  export function mensagemDeUso(erro: unknown): string | undefined // ErroDeConsulta, ErroDoPlano → a mensagem; ErroDeOpcao → `${opcao}: ${mensagem}`; outro → undefined
  export function lerConsultaDaPessoa(params: URLSearchParams): OpcoesResolvidas
  export function lerConsultaDasPessoas(
    params: URLSearchParams,
  ): PedidoDePessoas
  ```

  Os erros de valor saem como `ErroDeOpcao`/`ErroDoPlano` da fase 1 (a mesma regra da CLI); os só do HTTP, como `ErroDeConsulta`. Quem responde 400 usa `mensagemDeUso`.

- [ ] **Passo 1.1: Branch a partir da main com a fase 1**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git status --porcelain && /usr/bin/git branch --show-current && /usr/bin/git tag -l 'core-v*'; echo EXIT=$?
```

Esperado: nenhuma linha pendente, `main`, `core-v0.1.0` e `core-v0.2.0` (nenhuma `core-v0.3.0`), `EXIT=0`. Sem uma das duas tags, pare e reporte: a tag de uma fase anterior nunca é criada aqui (contrato, "Branches e tags").

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git merge-base --is-ancestor feat/core-cli main; echo FASE1_NA_MAIN=$?; /usr/bin/git switch -c feat/servidor; echo EXIT=$?
```

Esperado: `FASE1_NA_MAIN=0` e `EXIT=0`. Se `FASE1_NA_MAIN=1`, pare: a fase 1 ainda não entrou na `main` local.

- [ ] **Passo 1.2: Conferir a costura com a fase 1 e as ferramentas**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -e '
const fs = require("fs")
const esperado = {
  "src/gerar.ts": ["resolverOpcoes", "pessoaResolvida", "pessoasDoLote", "gerarPessoa", "OpcoesDaPessoa", "OpcoesResolvidas", "PessoaDoLote"],
  "src/envelope.ts": ["envelopar", "FORMATO", "EnvelopeDaPessoa", "EnvelopeDasPessoas"],
  "src/opcoes.ts": ["ErroDeOpcao", "LIMITE_DO_LOTE", "lerUF", "lerDominioEmail"],
  "src/plano.ts": ["COLUNAS", "Coluna", "FORMATOS", "Formato", "DIALETOS", "Dialeto", "ErroDoPlano", "lerCampos", "lerDialeto", "lerTabela", "cabecalhoCsv", "linhaCsv", "insertSql", "paraSql"],
  "src/versao.ts": ["MOTOR"],
  "src/hoje.ts": ["hojeEmSaoPaulo"],
  "src/cli/argumentos.ts": ["lerArgumentos", "ErroDeUso", "DefinicaoDeOpcoes", "ArgumentosLidos"],
  "src/cli/executar.ts": ["executar", "Saida", "SAIDA"],
}
const faltam = Object.entries(esperado).flatMap(([arquivo, nomes]) => {
  const texto = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : ""
  return nomes
    .filter((nome) => !new RegExp(`export (declare )?(const|function\\*?|class|interface|type) ${nome}\\b`).test(texto))
    .map((nome) => `${arquivo}: ${nome}`)
})
console.log(faltam.length ? `faltam: ${faltam.join(", ")}` : "costura ok")
process.exit(faltam.length ? 1 : 0)
'; echo EXIT=$?
```

Esperado: `costura ok` e `EXIT=0`. Faltando nome, pare e reporte.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -p 'const p = require("./package.json"); [p.version, JSON.stringify(p.bin), p.scripts.test, p.scripts.lint, JSON.stringify(p.exports["./plano"]), JSON.stringify(p.publishConfig.exports["./plano"])].join("\n")'; /usr/bin/grep -n '"types"' tsconfig.json tsconfig.build.json; /usr/bin/grep -n "testMatch" jest.config.ts; /usr/bin/grep -n "^const EXTRAS" scripts/pacote.test.mjs; /bin/ls dourado/v1/indice.json src/bin/botai.ts; /usr/bin/grep -hE "^import .* from '\./" src/pessoa.ts | /usr/bin/head -2; echo EXIT=$?
```

Esperado, na ordem: `0.2.0`; `{"botai":"dist/bin/botai.js"}`; `pnpm run build && jest && node --test scripts/*.test.mjs`; um `lint` com `tsc --noEmit`; `"./src/plano.ts"` e `{"types":"./dist/plano.d.ts","default":"./dist/plano.js"}`; `tsconfig.json` com `"types"` contendo `"jest"` e `"node"` e `tsconfig.build.json` com `"types": []`; `testMatch: ['<rootDir>/src/**/*.test.ts']`; a linha `const EXTRAS = [` (com os arquivos da fase 1); os dois arquivos; imports `from './aleatorio'` sem extensão; `EXIT=0`. Diferente: pare e reporte.

```bash
command -v shellcheck actionlint docker; docker info --format '{{.ServerVersion}}'; echo EXIT=$?
```

Esperado: os três caminhos, a versão do Docker (25 ou mais nova: o `HEALTHCHECK --start-interval` precisa) e `EXIT=0`. Faltando alguma ferramenta, pare e reporte (instalar no Mac é decisão do dono).

- [ ] **Passo 1.3: Escrever o teste que falha**

`packages/core/src/servidor/consulta.test.ts`:

```ts
/** @jest-environment node */
import { hojeEmSaoPaulo } from '../hoje'
import {
  ErroDeConsulta,
  LIMITE_DE_PESSOAS,
  lerConsultaDaPessoa,
  lerConsultaDasPessoas,
  mensagemDeUso,
} from './consulta'

const q = (texto: string) => new URLSearchParams(texto)

// A mensagem que o servidor devolveria no 400.
function erroDe(ler: () => unknown): string {
  try {
    ler()
  } catch (erro) {
    const mensagem = mensagemDeUso(erro)
    if (mensagem === undefined) throw erro
    return mensagem
  }
  throw new Error('esperava um erro de uso')
}

describe('mensagemDeUso', () => {
  test('erro que não é de uso não vira 400', () => {
    expect(mensagemDeUso(new Error('quebrou'))).toBeUndefined()
    expect(mensagemDeUso(new ErroDeConsulta('falta o n'))).toBe('falta o n')
  })
})

describe('lerConsultaDaPessoa', () => {
  test('sem parâmetro: sorteia a semente e usa o hoje de São Paulo', () => {
    const antes = hojeEmSaoPaulo()
    const r = lerConsultaDaPessoa(q(''))
    expect(Object.keys(r).sort()).toEqual(['hoje', 'semente'])
    expect(r.semente).toMatch(/^[0-9a-f]{16}$/)
    expect([antes, hojeEmSaoPaulo()]).toContain(r.hoje)
  })

  test('os quatro parâmetros, lidos como na CLI (uf e domínio em qualquer caixa)', () => {
    expect(
      lerConsultaDaPessoa(
        q('semente=42&hoje=2026-10-05&uf=pi&dominioEmail=Example.com'),
      ),
    ).toEqual({
      semente: '42',
      hoje: '2026-10-05',
      uf: 'PI',
      dominioEmail: 'example.com',
    })
  })

  test('semente com acento separado (NFD) fica registrada em NFC, como na biblioteca', () => {
    expect(lerConsultaDaPessoa(q('semente=Sa%CC%83o')).semente).toBe('São')
  })

  test('semente de 256 caracteres passa; 257, não', () => {
    const noLimite = 's'.repeat(256)
    expect(lerConsultaDaPessoa(q(`semente=${noLimite}`)).semente).toBe(noLimite)
    expect(erroDe(() => lerConsultaDaPessoa(q(`semente=${noLimite}s`)))).toBe(
      'semente: semente com mais de 256 caracteres',
    )
  })

  // Nome errado ou repetido não pode cair no padrão em silêncio.
  test.each([
    ['dominio-email=example.com', 'parâmetro desconhecido: dominio-email'],
    ['n=3', 'parâmetro desconhecido: n'],
    ['semente=1&semente=2', 'parâmetro repetido: semente'],
    ['semente=', 'parâmetro vazio: semente'],
    ['semente=a%01b', 'semente: semente com caractere de controle'],
    [
      'hoje=2026-02-30',
      'hoje: hoje precisa ser uma data AAAA-MM-DD que existe, recebido "2026-02-30"',
    ],
    [
      'hoje=05/10/2026',
      'hoje: hoje precisa ser uma data AAAA-MM-DD que existe, recebido "05/10/2026"',
    ],
    [
      'hoje=2026-10-5',
      'hoje: hoje precisa ser uma data AAAA-MM-DD que existe, recebido "2026-10-5"',
    ],
    ['uf=XX', 'uf: uf desconhecida "XX"'],
    [
      'dominioEmail=semponto',
      'dominioEmail: domínio de e-mail inválido "semponto"',
    ],
    [
      'dominioEmail=a@b.com',
      'dominioEmail: domínio de e-mail inválido "a@b.com"',
    ],
  ])('%s → %s', (consulta, mensagem) => {
    expect(erroDe(() => lerConsultaDaPessoa(q(consulta)))).toContain(mensagem)
  })

  test('o erro de parâmetro desconhecido lista os aceitos', () => {
    expect(erroDe(() => lerConsultaDaPessoa(q('x=1')))).toContain(
      'aceitos: semente, hoje, uf, dominioEmail',
    )
  })
})

describe('lerConsultaDasPessoas', () => {
  test('só o n: formato json, semente sorteada', () => {
    const pedido = lerConsultaDasPessoas(q('n=3'))
    expect(Object.keys(pedido).sort()).toEqual(['formato', 'n', 'opcoes'])
    expect(pedido).toMatchObject({ n: 3, formato: 'json' })
    expect(pedido.opcoes.semente).toMatch(/^[0-9a-f]{16}$/)
  })

  test('tudo junto, no sql (esquema.tabela vale, como na CLI)', () => {
    expect(
      lerConsultaDasPessoas(
        q(
          'n=2&semente=s&hoje=2026-10-05&uf=sp&dominioEmail=example.com&formato=sql&dialeto=mysql&tabela=esquema.clientes&campos=nome,cpf',
        ),
      ),
    ).toEqual({
      n: 2,
      opcoes: {
        semente: 's',
        hoje: '2026-10-05',
        uf: 'SP',
        dominioEmail: 'example.com',
      },
      formato: 'sql',
      dialeto: 'mysql',
      tabela: 'esquema.clientes',
      colunas: ['nome', 'cpf'],
    })
  })

  test('campos também valem no csv', () => {
    expect(
      lerConsultaDasPessoas(q('n=1&formato=csv&campos=cpf')).colunas,
    ).toEqual(['cpf'])
  })

  test(`n de 1 a ${LIMITE_DE_PESSOAS}`, () => {
    expect(lerConsultaDasPessoas(q('n=1')).n).toBe(1)
    expect(lerConsultaDasPessoas(q(`n=${LIMITE_DE_PESSOAS}`)).n).toBe(
      LIMITE_DE_PESSOAS,
    )
  })

  test.each([
    ['', `falta o n (de 1 a ${LIMITE_DE_PESSOAS})`],
    ['n=0', 'n inválido: 0'],
    ['n=-1', 'n inválido: -1'],
    ['n=1.5', 'n inválido: 1.5'],
    ['n=1e3', 'n inválido: 1e3'],
    ['n=%205', 'n inválido:  5'],
    ['n=dez', 'n inválido: dez'],
    [`n=${LIMITE_DE_PESSOAS + 1}`, `n inválido: ${LIMITE_DE_PESSOAS + 1}`],
    ['n=1&n=2', 'parâmetro repetido: n'],
    ['n=1&quantidade=3', 'parâmetro desconhecido: quantidade'],
    ['n=1&formato=xml', 'formato inválido: xml'],
    ['n=1&formato=sql&dialeto=oracle', 'dialeto desconhecido "oracle"'],
    ['n=1&dialeto=mysql', 'dialeto só vale com formato=sql'],
    ['n=1&formato=sql&tabela=a;drop', 'tabela inválida "a;drop"'],
    ['n=1&formato=sql&tabela=1abc', 'tabela inválida "1abc"'],
    ['n=1&formato=csv&tabela=t', 'tabela só vale com formato=sql'],
    ['n=1&campos=nome', 'campos só vale com formato=csv ou formato=sql'],
    [
      'n=1&formato=csv&campos=nao_existe',
      'campos: coluna desconhecida "nao_existe"',
    ],
    ['n=1&formato=csv&campos=nome,nome', 'campos: coluna repetida "nome"'],
    [
      'n=1&formato=csv&campos=nome,',
      'campos: lista vazia ou com vírgula sobrando',
    ],
    [
      'n=1&hoje=2026-02-30',
      'hoje: hoje precisa ser uma data AAAA-MM-DD que existe',
    ],
  ])('%s → %s', (consulta, mensagem) => {
    expect(erroDe(() => lerConsultaDasPessoas(q(consulta)))).toContain(mensagem)
  })
})
```

- [ ] **Passo 1.4: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/servidor/consulta.test.ts > "${TMPDIR:-/tmp}/botai-f2-t1.log" 2>&1; echo EXIT=$?; /usr/bin/grep -m3 -E "Cannot find module|Tests:" "${TMPDIR:-/tmp}/botai-f2-t1.log"
```

Esperado: `EXIT=1` e `Cannot find module './consulta'`.

- [ ] **Passo 1.5: Implementar**

`packages/core/src/servidor/consulta.ts`:

```ts
import {
  type OpcoesDaPessoa,
  type OpcoesResolvidas,
  resolverOpcoes,
} from '../gerar'
import { ErroDeOpcao, lerDominioEmail, lerUF } from '../opcoes'
import {
  type Coluna,
  type Dialeto,
  ErroDoPlano,
  type Formato,
  FORMATOS,
  lerCampos,
  lerDialeto,
  lerTabela,
} from '../plano'

export const LIMITE_DE_PESSOAS = 10_000

export class ErroDeConsulta extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeConsulta'
  }
}

export interface PedidoDePessoas {
  n: number
  opcoes: OpcoesResolvidas
  formato: Formato
  dialeto?: Dialeto
  tabela?: string
  colunas?: Coluna[]
}

const DA_PESSOA = ['semente', 'hoje', 'uf', 'dominioEmail'] as const
const DAS_PESSOAS = [
  ...DA_PESSOA,
  'n',
  'formato',
  'dialeto',
  'tabela',
  'campos',
] as const

export function mensagemDeUso(erro: unknown): string | undefined {
  if (erro instanceof ErroDeConsulta || erro instanceof ErroDoPlano)
    return erro.message
  if (erro instanceof ErroDeOpcao) return `${erro.opcao}: ${erro.message}`
  return undefined
}

function lerValores(
  params: URLSearchParams,
  aceitos: readonly string[],
): Map<string, string> {
  const valores = new Map<string, string>()
  for (const [nome, valor] of params) {
    if (!aceitos.includes(nome))
      throw new ErroDeConsulta(
        `parâmetro desconhecido: ${nome} (aceitos: ${aceitos.join(', ')})`,
      )
    if (valores.has(nome))
      throw new ErroDeConsulta(`parâmetro repetido: ${nome}`)
    if (valor === '') throw new ErroDeConsulta(`parâmetro vazio: ${nome}`)
    valores.set(nome, valor)
  }
  return valores
}

function lerOpcoes(valores: Map<string, string>): OpcoesResolvidas {
  const opcoes: OpcoesDaPessoa = {}
  const semente = valores.get('semente')
  const hoje = valores.get('hoje')
  const uf = valores.get('uf')
  const dominioEmail = valores.get('dominioEmail')
  if (semente !== undefined) opcoes.semente = semente
  if (hoje !== undefined) opcoes.hoje = hoje
  if (uf !== undefined) opcoes.uf = lerUF(uf)
  if (dominioEmail !== undefined)
    opcoes.dominioEmail = lerDominioEmail(dominioEmail)
  return resolverOpcoes(opcoes)
}

export function lerConsultaDaPessoa(params: URLSearchParams): OpcoesResolvidas {
  return lerOpcoes(lerValores(params, DA_PESSOA))
}

export function lerConsultaDasPessoas(
  params: URLSearchParams,
): PedidoDePessoas {
  const valores = lerValores(params, DAS_PESSOAS)

  const n = valores.get('n')
  if (n === undefined)
    throw new ErroDeConsulta(`falta o n (de 1 a ${LIMITE_DE_PESSOAS})`)
  if (!/^\d{1,6}$/.test(n) || Number(n) < 1 || Number(n) > LIMITE_DE_PESSOAS)
    throw new ErroDeConsulta(
      `n inválido: ${n} (um inteiro de 1 a ${LIMITE_DE_PESSOAS})`,
    )

  const formato = valores.get('formato') ?? 'json'
  if (!(FORMATOS as readonly string[]).includes(formato))
    throw new ErroDeConsulta(
      `formato inválido: ${formato} (use ${FORMATOS.join(', ')})`,
    )
  const ehSql = formato === 'sql'
  for (const nome of ['dialeto', 'tabela'])
    if (valores.has(nome) && !ehSql)
      throw new ErroDeConsulta(`${nome} só vale com formato=sql`)
  const campos = valores.get('campos')
  if (campos !== undefined && formato !== 'csv' && !ehSql)
    throw new ErroDeConsulta('campos só vale com formato=csv ou formato=sql')

  const pedido: PedidoDePessoas = {
    n: Number(n),
    opcoes: lerOpcoes(valores),
    formato: formato as Formato,
  }
  const dialeto = valores.get('dialeto')
  const tabela = valores.get('tabela')
  if (dialeto !== undefined) pedido.dialeto = lerDialeto(dialeto)
  if (tabela !== undefined) pedido.tabela = lerTabela(tabela)
  if (campos !== undefined) pedido.colunas = lerCampos(campos)
  return pedido
}
```

- [ ] **Passo 1.6: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/servidor/consulta.test.ts > "${TMPDIR:-/tmp}/botai-f2-t1.log" 2>&1; echo EXIT=$?; /usr/bin/grep -E "Tests:" "${TMPDIR:-/tmp}/botai-f2-t1.log"
```

Esperado: `EXIT=0`, todos os testes passando e nenhum falhando.

- [ ] **Passo 1.7: Tipos do Node no build e o pacote**

O build da fase 0 compila com `"types": []` e `lib: ["es2022"]`, que não têm `URLSearchParams` (nem o `URL`, o `console` e o `node:http` das tarefas seguintes). Em `packages/core/tsconfig.build.json`, troque `"types": []` por `"types": ["node"]` (o `@types/node` já está nas devDependencies desde a fase 0). Quem impede API de Node fora de `src/bin` e `src/servidor/index.ts` é a trava `src/portabilidade.test.ts`, não o tsconfig.

Em `packages/core/scripts/pacote.test.mjs`, acrescente à constante `EXTRAS` exatamente `'dist/servidor/consulta.js'` e `'dist/servidor/consulta.d.ts'`.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && "$(command -v pnpm)" run lint > "${TMPDIR:-/tmp}/botai-f2-lint.log" 2>&1; echo LINT=$?; "$(command -v pnpm)" run test > "${TMPDIR:-/tmp}/botai-f2-test.log" 2>&1; echo TEST=$?; /bin/ls dist/servidor; /usr/bin/grep -E "Tests:|# fail" "${TMPDIR:-/tmp}/botai-f2-test.log"
```

Esperado: `LINT=0`, `TEST=0`, `consulta.d.ts` e `consulta.js` em `dist/servidor`, e `# fail 0` no `node --test`. Se o `pacote.test.mjs` acusar outro arquivo além desses dois, não o acrescente: pare, porque o `files` ou o build vazou algo.

- [ ] **Passo 1.8: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/servidor/consulta.ts packages/core/src/servidor/consulta.test.ts packages/core/tsconfig.build.json packages/core/scripts/pacote.test.mjs && /usr/bin/git commit -m "feat(core): leitura e validação da consulta do servidor"; echo EXIT=$?
```

---

### Tarefa 2: Texto do lote e rotas (`src/lote.ts`, `src/servidor/rotas.ts`)

**Files:**

- Create: `packages/core/src/lote.ts`, `packages/core/src/servidor/rotas.ts`
- Test: `packages/core/src/lote.test.ts`, `packages/core/src/servidor/rotas.test.ts`
- Modify: `packages/core/src/cli/executar.ts` (o comando `pessoas`), `packages/core/scripts/pacote.test.mjs` (`EXTRAS`)

**Interfaces:**

- Consumes: Tarefa 1 (`lerConsultaDaPessoa`, `lerConsultaDasPessoas`, `mensagemDeUso`, `LIMITE_DE_PESSOAS`, `PedidoDePessoas`); fase 1 (`envelopar`, `FORMATO`, `EnvelopeDasPessoas`, `pessoaResolvida`, `pessoasDoLote`, `OpcoesResolvidas`, `PessoaDoLote`, `cabecalhoCsv`, `linhaCsv`, `insertSql`, `COLUNAS`, `Coluna`, `Dialeto`, `Formato`, `MOTOR`, `executar`).
- Produces:

  ```ts
  // src/lote.ts
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
  ): Generator<string>
  // src/servidor/rotas.ts
  export interface Resposta {
    status: number
    cabecalhos: Record<string, string>
    corpo: string
  }
  export const ROTAS: readonly ['/pessoa', '/pessoas', '/saude']
  export const TIPO_POR_FORMATO: Record<Formato, string>
  export function responder(metodo: string, alvo: string): Resposta
  ```

  `textoDoLote` valida `n` **na chamada** (antes de devolver o gerador) e produz, parte a parte, o mesmo texto que `botai pessoas` escrevia; a CLI e o servidor passam a escrever por ele. Corpos do servidor: `/saude` → `{ ok: true, formato: 1, motor }`; `/pessoa` → `EnvelopeDaPessoa`; `/pessoas` → as partes de `textoDoLote` juntas; erros → `{ erro: string }` com 400, 404, 405 (`Allow: GET`) ou 500. JSON do servidor: `JSON.stringify(x, null, 2) + '\n'`, como a CLI. Toda resposta: `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`.

- [ ] **Passo 2.1: Escrever o teste que falha de `textoDoLote`**

`packages/core/src/lote.test.ts`:

```ts
/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EnvelopeDaPessoa, EnvelopeDasPessoas } from './envelope'
import { type OpcoesDaPessoa, resolverOpcoes } from './gerar'
import { type FormaDoLote, textoDoLote } from './lote'
import { ErroDeOpcao, LIMITE_DO_LOTE } from './opcoes'
import { type Dialeto, paraSql } from './plano'
import { MOTOR } from './versao'

interface ItemDoIndice {
  arquivo: string
  n?: number
  opcoes: OpcoesDaPessoa
  derivados?: { arquivo: string; formato: 'csv' | 'sql'; dialeto?: Dialeto }[]
}

const DOURADO = join(__dirname, '..', 'dourado', 'v1')
const ler = (arquivo: string) => readFileSync(join(DOURADO, arquivo), 'utf8')
const ITEM = (JSON.parse(ler('indice.json')) as ItemDoIndice[]).find(
  (item) => item.arquivo === 'pessoas-lote.json',
)!
const LOTE = JSON.parse(ler(ITEM.arquivo)) as EnvelopeDasPessoas
const OPCOES = resolverOpcoes(ITEM.opcoes)
const texto = (forma: FormaDoLote) =>
  Array.from(textoDoLote(ITEM.n!, OPCOES, forma)).join('')
const semPrimeiraLinha = (sql: string) => sql.slice(sql.indexOf('\n') + 1)

describe('textoDoLote', () => {
  test('json: o envelope do lote dourado, com 2 espaços e \\n no fim', () => {
    const json = texto({ formato: 'json' })
    expect(json).toBe(`${JSON.stringify({ ...LOTE, motor: MOTOR }, null, 2)}\n`)
  })

  // Cada linha reproduz sozinha: `botai pessoa --semente <a da linha> --hoje <o da linha>`.
  test('ndjson: um envelope por linha, com a semente exata da pessoa', () => {
    const linhas = texto({ formato: 'ndjson' })
      .trimEnd()
      .split('\n')
      .map((linha) => JSON.parse(linha) as EnvelopeDaPessoa)
    expect(linhas.map((l) => l.pessoa)).toEqual(LOTE.pessoas)
    expect(linhas.map((l) => l.semente)).toEqual(
      LOTE.pessoas.map((_, i) => `lote/${i}`),
    )
  })

  test.each((ITEM.derivados ?? []).map((d) => [d.arquivo, d] as const))(
    'igual ao derivado dourado %s',
    (_, derivado) => {
      const obtido = texto({
        formato: derivado.formato,
        ...(derivado.dialeto && { dialeto: derivado.dialeto }),
      })
      if (derivado.formato === 'csv') {
        expect(obtido).toBe(ler(derivado.arquivo))
        return
      }
      expect(obtido.split('\n')[0]).toBe(
        `-- botai: formato 1, motor ${MOTOR}, semente lote, hoje 2026-10-05`,
      )
      expect(semPrimeiraLinha(obtido)).toBe(ler(derivado.arquivo))
    },
  )

  test('sql com dialeto, tabela e colunas', () => {
    const forma = {
      formato: 'sql',
      dialeto: 'mysql',
      tabela: 'esquema.clientes',
      colunas: ['nome', 'cpf'],
    } as const
    expect(semPrimeiraLinha(texto(forma))).toBe(paraSql(LOTE.pessoas, forma))
  })

  test('csv com colunas: o cabeçalho segue a ordem pedida', () => {
    expect(texto({ formato: 'csv', colunas: ['cpf', 'nome'] })).toMatch(
      /^cpf,nome\r\n/,
    )
  })

  // Quem escreve as partes no stdout ou no corpo HTTP não pode ter escrito nada antes do erro.
  test('n fora do limite lança na chamada, antes de devolver qualquer parte', () => {
    expect(() =>
      textoDoLote(LIMITE_DO_LOTE + 1, OPCOES, { formato: 'csv' }),
    ).toThrow(ErroDeOpcao)
  })
})
```

- [ ] **Passo 2.2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/lote.test.ts > "${TMPDIR:-/tmp}/botai-f2-t2.log" 2>&1; echo EXIT=$?; /usr/bin/grep -m3 -E "Cannot find module|Tests:" "${TMPDIR:-/tmp}/botai-f2-t2.log"
```

Esperado: `EXIT=1` e `Cannot find module './lote'`.

- [ ] **Passo 2.3: Implementar `textoDoLote`**

`packages/core/src/lote.ts`:

```ts
import { envelopar, type EnvelopeDasPessoas, FORMATO } from './envelope'
import {
  type OpcoesResolvidas,
  type PessoaDoLote,
  pessoasDoLote,
} from './gerar'
import {
  cabecalhoCsv,
  type Coluna,
  COLUNAS,
  type Dialeto,
  type Formato,
  insertSql,
  linhaCsv,
} from './plano'
import { MOTOR } from './versao'

export interface FormaDoLote {
  formato: Formato
  dialeto?: Dialeto
  tabela?: string
  colunas?: readonly Coluna[]
}

// pessoasDoLote valida o n já aqui, fora do gerador: o erro sai antes da primeira parte.
export function textoDoLote(
  n: number,
  opcoes: OpcoesResolvidas,
  forma: FormaDoLote,
): Generator<string> {
  return partesDoLote(pessoasDoLote(n, opcoes), opcoes, forma)
}

function* partesDoLote(
  lote: Iterable<PessoaDoLote>,
  opcoes: OpcoesResolvidas,
  {
    formato,
    dialeto = 'postgres',
    tabela = 'pessoas',
    colunas = COLUNAS,
  }: FormaDoLote,
): Generator<string> {
  if (formato === 'json') {
    const envelope: EnvelopeDasPessoas = {
      formato: FORMATO,
      motor: MOTOR,
      semente: opcoes.semente,
      hoje: opcoes.hoje,
      pessoas: Array.from(lote, (p) => p.pessoa),
    }
    yield `${JSON.stringify(envelope, null, 2)}\n`
    return
  }
  if (formato === 'csv') yield cabecalhoCsv(colunas)
  if (formato === 'sql')
    yield `-- botai: formato ${FORMATO}, motor ${MOTOR}, semente ${opcoes.semente}, hoje ${opcoes.hoje}\n`
  for (const { semente, pessoa } of lote) {
    if (formato === 'ndjson')
      yield `${JSON.stringify(envelopar(semente, opcoes.hoje, pessoa))}\n`
    else if (formato === 'csv') yield linhaCsv(pessoa, colunas)
    else yield insertSql(pessoa, { dialeto, tabela, colunas })
  }
}
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/lote.test.ts > "${TMPDIR:-/tmp}/botai-f2-t2.log" 2>&1; echo EXIT=$?; /usr/bin/grep -E "Tests:" "${TMPDIR:-/tmp}/botai-f2-t2.log"
```

Esperado: `EXIT=0`.

- [ ] **Passo 2.4: A CLI escreve o lote por `textoDoLote`**

Mover, não copiar: o comando `pessoas` deixa de ter o próprio laço de formatos. Em `packages/core/src/cli/executar.ts`, dentro de `comandoPessoas`, troque o trecho que vai de `const r = opcoesDaPessoa(lidos)` até o último `return SAIDA.ok` da função, inclusive (o `if (formato === 'json')`, o `pessoasDoLote`, o cabeçalho do csv, a linha `-- botai: …` do sql e o `for` sobre o lote), por estas linhas; a `}` que fecha `comandoPessoas` fica onde está:

```ts
const r = opcoesDaPessoa(lidos)
const partes = textoDoLote(n, r, { formato, dialeto, tabela, colunas })
if (formato === 'csv' && texto(lidos, 'semente') === undefined)
  saida.mensagem(`botai: semente ${r.semente}, hoje ${r.hoje}\n`)
for (const parte of partes) saida.dados(parte)
return SAIDA.ok
```

A ordem importa: `textoDoLote` valida o `n` antes do aviso de semente no stderr (o teste da fase 1 `erro de uso: código 2, mensagem no stderr, stdout vazio` exige o stderr só com o erro). Nos imports do arquivo, acrescente `import { textoDoLote } from '../lote'` e tire o que deixou de ser usado: `envelopeDoLote` e `FORMATO` (de `'../envelope'`), `pessoasDoLote` (de `'../gerar'`), `cabecalhoCsv`, `linhaCsv` e `insertSql` (de `'../plano'`). Ficam `envelopar`, `MOTOR`, `COLUNAS` e os leitores.

- [ ] **Passo 2.5: A CLI não mudou de comportamento**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && "$(command -v pnpm)" run build > "${TMPDIR:-/tmp}/botai-f2-build.log" 2>&1; echo BUILD=$?; ./node_modules/.bin/jest src/lote.test.ts src/cli src/bin > "${TMPDIR:-/tmp}/botai-f2-t2-cli.log" 2>&1; echo EXIT=$?; /usr/bin/grep -E "Tests:" "${TMPDIR:-/tmp}/botai-f2-t2-cli.log"
```

Esperado: `BUILD=0` e `EXIT=0`. Os testes do `executar` e do bin da fase 1 (dourados pelo processo, csv e sql byte a byte, ndjson, 1000 em SQL, erro de uso com stdout vazio, pipe cortado) provam que o stdout não mudou.

- [ ] **Passo 2.6: Escrever o teste que falha das rotas**

`packages/core/src/servidor/rotas.test.ts`:

```ts
/** @jest-environment node */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { executar } from '../cli/executar'
import type { EnvelopeDaPessoa, EnvelopeDasPessoas } from '../envelope'
import { hojeEmSaoPaulo } from '../hoje'
import { type Dialeto, FORMATOS } from '../plano'
import { MOTOR } from '../versao'
import { LIMITE_DE_PESSOAS } from './consulta'
import { responder, TIPO_POR_FORMATO } from './rotas'

interface ItemDoIndice {
  arquivo: string
  n?: number
  opcoes: {
    semente: number | string
    hoje: string
    uf?: string
    dominioEmail?: string
  }
  derivados?: { arquivo: string; formato: 'csv' | 'sql'; dialeto?: Dialeto }[]
}

const DOURADO = join(__dirname, '..', '..', 'dourado', 'v1')
const ler = (arquivo: string) => readFileSync(join(DOURADO, arquivo), 'utf8')
const INDICE = JSON.parse(ler('indice.json')) as ItemDoIndice[]
const LOTE = INDICE.find((item) => item.arquivo === 'pessoas-lote.json')!

// O envelope não registra uf nem dominioEmail: a consulta sai do índice, não do .json.
function alvoDe(
  item: ItemDoIndice,
  extras: Record<string, string> = {},
): string {
  const { semente, hoje, uf, dominioEmail } = item.opcoes
  const consulta = new URLSearchParams({ semente: String(semente), hoje })
  if (uf !== undefined) consulta.set('uf', uf)
  if (dominioEmail !== undefined) consulta.set('dominioEmail', dominioEmail)
  if (item.n !== undefined) consulta.set('n', String(item.n))
  for (const [nome, valor] of Object.entries(extras)) consulta.set(nome, valor)
  return `${item.n === undefined ? '/pessoa' : '/pessoas'}?${consulta}`
}

function json(alvo: string): {
  status: number
  corpo: Record<string, unknown>
} {
  const r = responder('GET', alvo)
  expect(r.cabecalhos['Content-Type']).toBe('application/json; charset=utf-8')
  return { status: r.status, corpo: JSON.parse(r.corpo) }
}

// O stdout de `botai …`, pelo mesmo executar que o bin usa.
function cli(...argv: string[]): string {
  let dados = ''
  const codigo = executar(argv, {
    dados: (texto) => {
      dados += texto
    },
    mensagem: () => {},
  })
  expect(codigo).toBe(0)
  return dados
}

const semMotor = (envelope: object) => ({ ...envelope, motor: '' })
const semPrimeiraLinha = (sql: string) => sql.slice(sql.indexOf('\n') + 1)

describe('responder: dourados', () => {
  test.each(INDICE.map((item) => [item.arquivo, item] as const))(
    'igual ao dourado %s',
    (_, item) => {
      const { status, corpo } = json(alvoDe(item))
      expect(status).toBe(200)
      expect(corpo.motor).toBe(MOTOR)
      const dourado = JSON.parse(ler(item.arquivo)) as
        | EnvelopeDaPessoa
        | EnvelopeDasPessoas
      expect(semMotor(corpo)).toEqual(semMotor(dourado))
    },
  )

  test.each((LOTE.derivados ?? []).map((d) => [d.arquivo, d] as const))(
    'igual ao derivado dourado %s',
    (_, derivado) => {
      const extras: Record<string, string> = { formato: derivado.formato }
      if (derivado.dialeto) extras.dialeto = derivado.dialeto
      const r = responder('GET', alvoDe(LOTE, extras))
      expect(r.status).toBe(200)
      expect(r.cabecalhos['Content-Type']).toBe(
        TIPO_POR_FORMATO[derivado.formato],
      )
      const corpo =
        derivado.formato === 'sql' ? semPrimeiraLinha(r.corpo) : r.corpo
      expect(corpo).toBe(ler(derivado.arquivo))
    },
  )
})

describe('responder: o mesmo texto da CLI', () => {
  test.each(FORMATOS)(
    '/pessoas em %s é o stdout de botai pessoas',
    (formato) => {
      const r = responder(
        'GET',
        `/pessoas?n=3&semente=s&hoje=2026-10-05&uf=pi&formato=${formato}`,
      )
      expect(r.status).toBe(200)
      expect(r.corpo).toBe(
        cli(
          'pessoas',
          '-n',
          '3',
          '--semente',
          's',
          '--hoje',
          '2026-10-05',
          '--uf',
          'pi',
          '--formato',
          formato,
        ),
      )
    },
  )

  test('dialeto, tabela e campos chegam ao sql como na CLI', () => {
    const r = responder(
      'GET',
      '/pessoas?n=2&semente=s&hoje=2026-10-05&formato=sql&dialeto=mysql&tabela=esquema.clientes&campos=nome,cpf',
    )
    expect(r.corpo).toBe(
      cli(
        'pessoas',
        '-n',
        '2',
        '--semente',
        's',
        '--hoje',
        '2026-10-05',
        '--formato',
        'sql',
        '--dialeto',
        'mysql',
        '--tabela',
        'esquema.clientes',
        '--campos',
        'nome,cpf',
      ),
    )
  })

  test('/pessoa é o stdout de botai pessoa, com uf e domínio em qualquer caixa', () => {
    const r = responder(
      'GET',
      '/pessoa?semente=7&hoje=2026-10-05&uf=pi&dominioEmail=Example.com',
    )
    expect(r.corpo).toBe(
      cli(
        'pessoa',
        '--semente',
        '7',
        '--hoje',
        '2026-10-05',
        '--uf',
        'pi',
        '--dominio-email',
        'Example.com',
      ),
    )
  })
})

describe('responder', () => {
  test('/saude diz o formato e o motor', () => {
    expect(json('/saude')).toEqual({
      status: 200,
      corpo: { ok: true, formato: 1, motor: MOTOR },
    })
  })

  test('Content-Type de cada formato', () => {
    expect(TIPO_POR_FORMATO).toEqual({
      json: 'application/json; charset=utf-8',
      ndjson: 'application/x-ndjson; charset=utf-8',
      csv: 'text/csv; charset=utf-8; header=present',
      sql: 'application/sql; charset=utf-8',
    })
  })

  test('/pessoa sem semente sorteia uma e a registra: repetir com ela dá a mesma pessoa', () => {
    const primeira = json('/pessoa?hoje=2026-10-05').corpo
    expect(primeira.semente).toMatch(/^[0-9a-f]{16}$/)
    const segunda = json(
      `/pessoa?semente=${String(primeira.semente)}&hoje=2026-10-05`,
    ).corpo
    expect(segunda.pessoa).toEqual(primeira.pessoa)
  })

  test('/pessoa sem hoje usa o dia de São Paulo e o registra', () => {
    const antes = hojeEmSaoPaulo()
    const { corpo } = json('/pessoa?semente=1')
    expect([antes, hojeEmSaoPaulo()]).toContain(corpo.hoje)
  })

  test(`n=${LIMITE_DE_PESSOAS} ainda responde`, () => {
    const r = responder(
      'GET',
      `/pessoas?n=${LIMITE_DE_PESSOAS}&semente=limite&hoje=2026-10-05&formato=ndjson`,
    )
    expect(r.status).toBe(200)
    expect(r.corpo.trimEnd().split('\n')).toHaveLength(LIMITE_DE_PESSOAS)
  })

  test.each([
    [
      '/pessoa?dominio-email=example.com',
      'parâmetro desconhecido: dominio-email',
    ],
    [
      '/pessoa?hoje=2026-02-30',
      'hoje: hoje precisa ser uma data AAAA-MM-DD que existe, recebido "2026-02-30"',
    ],
    ['/pessoas?n=0', 'n inválido: 0'],
    ['/pessoas?n=1&n=2', 'parâmetro repetido: n'],
    ['/pessoas?n=1&formato=csv&campos=x', 'campos: coluna desconhecida "x"'],
  ])('%s → 400 com a mensagem de uso', (alvo, mensagem) => {
    const { status, corpo } = json(alvo)
    expect(status).toBe(400)
    expect(corpo.erro).toContain(mensagem)
  })

  test('rota desconhecida → 404 com as rotas', () => {
    const { status, corpo } = json('/pessoa/')
    expect(status).toBe(404)
    expect(corpo.erro).toBe(
      'rota desconhecida: /pessoa/ (rotas: /pessoa, /pessoas, /saude)',
    )
  })

  test('método que não é GET → 405 com Allow: GET', () => {
    const r = responder('POST', '/pessoa')
    expect(r.status).toBe(405)
    expect(r.cabecalhos.Allow).toBe('GET')
  })

  test('toda resposta leva no-store e nosniff', () => {
    for (const alvo of ['/saude', '/pessoa?semente=1', '/x', '/pessoas']) {
      const r = responder('GET', alvo)
      expect(r.cabecalhos['Cache-Control']).toBe('no-store')
      expect(r.cabecalhos['X-Content-Type-Options']).toBe('nosniff')
    }
  })
})
```

- [ ] **Passo 2.7: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/servidor/rotas.test.ts > "${TMPDIR:-/tmp}/botai-f2-t2.log" 2>&1; echo EXIT=$?; /usr/bin/grep -m3 -E "Cannot find module|Tests:" "${TMPDIR:-/tmp}/botai-f2-t2.log"
```

Esperado: `EXIT=1` e `Cannot find module './rotas'`.

- [ ] **Passo 2.8: Implementar as rotas**

`packages/core/src/servidor/rotas.ts`:

```ts
import { envelopar, FORMATO } from '../envelope'
import { pessoaResolvida } from '../gerar'
import { textoDoLote } from '../lote'
import type { Formato } from '../plano'
import { MOTOR } from '../versao'
import {
  lerConsultaDaPessoa,
  lerConsultaDasPessoas,
  mensagemDeUso,
} from './consulta'

export interface Resposta {
  status: number
  cabecalhos: Record<string, string>
  corpo: string
}

export const ROTAS = ['/pessoa', '/pessoas', '/saude'] as const

const TIPO_JSON = 'application/json; charset=utf-8'

export const TIPO_POR_FORMATO: Record<Formato, string> = {
  json: TIPO_JSON,
  ndjson: 'application/x-ndjson; charset=utf-8',
  csv: 'text/csv; charset=utf-8; header=present',
  sql: 'application/sql; charset=utf-8',
}

const SEMPRE = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}

function texto(status: number, tipo: string, corpo: string): Resposta {
  return { status, cabecalhos: { ...SEMPRE, 'Content-Type': tipo }, corpo }
}

function json(status: number, corpo: unknown): Resposta {
  return texto(status, TIPO_JSON, `${JSON.stringify(corpo, null, 2)}\n`)
}

function pessoa(params: URLSearchParams): Resposta {
  const r = lerConsultaDaPessoa(params)
  return json(200, envelopar(r.semente, r.hoje, pessoaResolvida(r)))
}

function pessoas(params: URLSearchParams): Resposta {
  const pedido = lerConsultaDasPessoas(params)
  const corpo = Array.from(textoDoLote(pedido.n, pedido.opcoes, pedido)).join(
    '',
  )
  return texto(200, TIPO_POR_FORMATO[pedido.formato], corpo)
}

export function responder(metodo: string, alvo: string): Resposta {
  const url = new URL(alvo, 'http://botai.local')
  if (!(ROTAS as readonly string[]).includes(url.pathname))
    return json(404, {
      erro: `rota desconhecida: ${url.pathname} (rotas: ${ROTAS.join(', ')})`,
    })
  if (metodo !== 'GET') {
    const r = json(405, { erro: `método ${metodo} não aceito: use GET` })
    return { ...r, cabecalhos: { ...r.cabecalhos, Allow: 'GET' } }
  }
  try {
    if (url.pathname === '/saude')
      return json(200, { ok: true, formato: FORMATO, motor: MOTOR })
    return url.pathname === '/pessoa'
      ? pessoa(url.searchParams)
      : pessoas(url.searchParams)
  } catch (erro) {
    const mensagem = mensagemDeUso(erro)
    if (mensagem !== undefined) return json(400, { erro: mensagem })
    console.error(erro)
    return json(500, { erro: 'erro interno do botai; veja o log do servidor' })
  }
}
```

- [ ] **Passo 2.9: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/servidor src/lote.test.ts > "${TMPDIR:-/tmp}/botai-f2-t2.log" 2>&1; echo EXIT=$?; /usr/bin/grep -E "Tests:" "${TMPDIR:-/tmp}/botai-f2-t2.log"
```

Esperado: `EXIT=0`. O `n=10000` e o dourado de 1000 levam alguns segundos.

- [ ] **Passo 2.10: Pacote, lint e a suíte inteira**

Em `packages/core/scripts/pacote.test.mjs`, acrescente à constante `EXTRAS` exatamente `'dist/lote.js'`, `'dist/lote.d.ts'`, `'dist/servidor/rotas.js'` e `'dist/servidor/rotas.d.ts'`.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && "$(command -v pnpm)" run lint > "${TMPDIR:-/tmp}/botai-f2-lint.log" 2>&1; echo LINT=$?; "$(command -v pnpm)" run test > "${TMPDIR:-/tmp}/botai-f2-test.log" 2>&1; echo TEST=$?; /usr/bin/grep -E "Tests:|# fail" "${TMPDIR:-/tmp}/botai-f2-test.log"
```

Esperado: `LINT=0`, `TEST=0` e `# fail 0`. A trava `portabilidade.test.ts` da fase 1 passa sem mudança: `lote.ts`, `consulta.ts` e `rotas.ts` não usam API de Node.

- [ ] **Passo 2.11: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/lote.ts packages/core/src/lote.test.ts packages/core/src/cli/executar.ts packages/core/src/servidor/rotas.ts packages/core/src/servidor/rotas.test.ts packages/core/scripts/pacote.test.mjs && /usr/bin/git commit -m "feat(core): rotas do servidor e textoDoLote compartilhado com a CLI"; echo EXIT=$?
```

---

### Tarefa 3: Servidor HTTP no subpath `/servidor`

**Files:**

- Create: `packages/core/src/servidor/index.ts`
- Test: `packages/core/src/servidor/index.test.ts`
- Modify: `packages/core/package.json` (`exports` e `publishConfig.exports`), `packages/core/src/portabilidade.test.ts`

**Interfaces:**

- Consumes: Tarefa 2 (`responder`, `ROTAS`, `TIPO_POR_FORMATO`, `Resposta`); Tarefa 1 (`LIMITE_DE_PESSOAS`).
- Produces (subpath `@pilutech/botai-core/servidor`):

  ```ts
  export const PORTA_PADRAO = 8790
  export const HOST_PADRAO = '127.0.0.1'
  export interface OpcoesDoServidor {
    porta?: number
    host?: string
  }
  export interface ServidorNoAr {
    servidor: Server
    url: string
    encerrar(): Promise<void>
  }
  export function criarServidor(): Server
  export function iniciarServidor(
    opcoes?: OpcoesDoServidor,
  ): Promise<ServidorNoAr> // rejeita com o erro do listen (code EADDRINUSE, EADDRNOTAVAIL…)
  export {
    responder,
    ROTAS,
    TIPO_POR_FORMATO,
    type Resposta,
    LIMITE_DE_PESSOAS,
  }
  ```

  `url` = `http://<host>:<porta real>` (IPv6 entre colchetes). `encerrar()` fecha as conexões ociosas na hora e derruba as outras depois de 2 s.

- [ ] **Passo 3.1: Escrever o teste que falha**

`packages/core/src/servidor/index.test.ts`:

```ts
/** @jest-environment node */
import { request } from 'node:http'
import { connect } from 'node:net'
import {
  HOST_PADRAO,
  iniciarServidor,
  PORTA_PADRAO,
  type ServidorNoAr,
} from './index'

interface RespostaHttp {
  status: number
  cabecalhos: Record<string, string | string[] | undefined>
  corpo: string
}

function pedir(url: string): Promise<RespostaHttp> {
  return new Promise((resolve, reject) => {
    request(url, { agent: false }, (res) => {
      let corpo = ''
      res.setEncoding('utf8')
      res.on('data', (parte: string) => (corpo += parte))
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          cabecalhos: res.headers,
          corpo,
        }),
      )
    })
      .on('error', reject)
      .end()
  })
}

let noAr: ServidorNoAr | undefined

afterEach(async () => {
  await noAr?.encerrar()
  noAr = undefined
})

describe('iniciarServidor', () => {
  test('padrões do contrato: porta 8790 e só o loopback', () => {
    expect(PORTA_PADRAO).toBe(8790)
    expect(HOST_PADRAO).toBe('127.0.0.1')
  })

  test('sem host, escuta só em 127.0.0.1 (nunca na rede da máquina)', async () => {
    noAr = await iniciarServidor({ porta: 0 })
    expect(noAr.servidor.address()).toMatchObject({
      address: '127.0.0.1',
      family: 'IPv4',
    })
    expect(noAr.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
  })

  test('responde por HTTP com status, Content-Type e Content-Length em bytes', async () => {
    noAr = await iniciarServidor({ porta: 0 })
    const r = await pedir(
      `${noAr.url}/pessoas?n=50&semente=acentos&hoje=2026-10-05&formato=csv`,
    )
    expect(r.status).toBe(200)
    expect(r.cabecalhos['content-type']).toBe(
      'text/csv; charset=utf-8; header=present',
    )
    expect(Number(r.cabecalhos['content-length'])).toBe(
      Buffer.byteLength(r.corpo),
    )
  })

  test('400 por HTTP, com o corpo { erro }', async () => {
    noAr = await iniciarServidor({ porta: 0 })
    const r = await pedir(`${noAr.url}/pessoas?n=0`)
    expect(r.status).toBe(400)
    expect(JSON.parse(r.corpo).erro).toContain('n inválido: 0')
  })

  test('porta ocupada: rejeita com EADDRINUSE', async () => {
    noAr = await iniciarServidor({ porta: 0 })
    const porta = Number(new URL(noAr.url).port)
    await expect(iniciarServidor({ porta })).rejects.toMatchObject({
      code: 'EADDRINUSE',
    })
  })

  // Sem o fechamento das ociosas, uma conexão keep-alive parada segura o close() para sempre.
  test('encerrar não fica preso numa conexão keep-alive parada', async () => {
    noAr = await iniciarServidor({ porta: 0 })
    const { hostname, port } = new URL(noAr.url)
    const socket = connect(Number(port), hostname)
    await new Promise<void>((resolve) =>
      socket.once('connect', () => resolve()),
    )
    socket.write(
      'GET /saude HTTP/1.1\r\nHost: botai\r\nConnection: keep-alive\r\n\r\n',
    )
    await new Promise<void>((resolve) => socket.once('data', () => resolve()))

    const inicio = Date.now()
    await noAr.encerrar()
    noAr = undefined
    expect(Date.now() - inicio).toBeLessThan(2_500)
    socket.destroy()
  })
})
```

- [ ] **Passo 3.2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/servidor/index.test.ts > "${TMPDIR:-/tmp}/botai-f2-t3.log" 2>&1; echo EXIT=$?; /usr/bin/grep -m3 -E "Cannot find module|Tests:" "${TMPDIR:-/tmp}/botai-f2-t3.log"
```

Esperado: `EXIT=1` e `Cannot find module './index'`.

- [ ] **Passo 3.3: Implementar**

`packages/core/src/servidor/index.ts`:

```ts
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { responder } from './rotas'

export { LIMITE_DE_PESSOAS } from './consulta'
export { responder, ROTAS, TIPO_POR_FORMATO, type Resposta } from './rotas'

export const PORTA_PADRAO = 8790
export const HOST_PADRAO = '127.0.0.1'
const PRAZO_PARA_ENCERRAR_MS = 2_000

export interface OpcoesDoServidor {
  porta?: number
  host?: string
}

export interface ServidorNoAr {
  servidor: Server
  url: string
  encerrar(): Promise<void>
}

export function criarServidor(): Server {
  return createServer((req, res) => {
    const resposta = responder(req.method ?? 'GET', req.url ?? '/')
    res.writeHead(resposta.status, {
      ...resposta.cabecalhos,
      'Content-Length': Buffer.byteLength(resposta.corpo),
    })
    res.end(resposta.corpo)
  })
}

function encerrar(servidor: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    const prazo = setTimeout(
      () => servidor.closeAllConnections(),
      PRAZO_PARA_ENCERRAR_MS,
    )
    servidor.close((erro) => {
      clearTimeout(prazo)
      if (erro) reject(erro)
      else resolve()
    })
    servidor.closeIdleConnections()
  })
}

export function iniciarServidor({
  porta = PORTA_PADRAO,
  host = HOST_PADRAO,
}: OpcoesDoServidor = {}): Promise<ServidorNoAr> {
  const servidor = criarServidor()
  return new Promise((resolve, reject) => {
    servidor.once('error', reject)
    servidor.listen(porta, host, () => {
      servidor.off('error', reject)
      const { port } = servidor.address() as AddressInfo
      const hostDaUrl = host.includes(':') ? `[${host}]` : host
      resolve({
        servidor,
        url: `http://${hostDaUrl}:${port}`,
        encerrar: () => encerrar(servidor),
      })
    })
  })
}
```

- [ ] **Passo 3.4: Subpath nos dois manifestos**

Subpath novo entra nos dois manifestos (contrato, "Publicação no npm e environments"): a entrada `./servidor` copia a de `./pessoa` em cada um, trocando `pessoa` por `servidor/index`, como a fase 1 fez com o `./plano`:

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -e '
const fs = require("fs")
const p = JSON.parse(fs.readFileSync("package.json", "utf8"))
for (const m of [p.exports, p.publishConfig.exports])
  m["./servidor"] = JSON.parse(JSON.stringify(m["./pessoa"]).replaceAll("pessoa", "servidor/index"))
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n")
'; node -p 'const p = require("./package.json"); JSON.stringify([p.exports["./servidor"], p.publishConfig.exports["./servidor"]])'; echo EXIT=$?
```

Esperado: `["./src/servidor/index.ts",{"types":"./dist/servidor/index.d.ts","default":"./dist/servidor/index.js"}]` e `EXIT=0`. O `pacote.test.mjs` deriva `dist/servidor/index.*` desse manifesto; `EXTRAS` não muda nesta tarefa.

- [ ] **Passo 3.5: Rodar o teste e ver a trava de portabilidade morder**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/servidor/index.test.ts > "${TMPDIR:-/tmp}/botai-f2-t3.log" 2>&1; echo EXIT=$?; ./node_modules/.bin/jest src/portabilidade.test.ts > "${TMPDIR:-/tmp}/botai-f2-t3p.log" 2>&1; echo PORTABILIDADE=$?; /usr/bin/grep -E "servidor/index.ts" "${TMPDIR:-/tmp}/botai-f2-t3p.log"
```

Esperado: `EXIT=0` (o servidor funciona) e `PORTABILIDADE=1`, listando `servidor/index.ts: /from 'node:/` e `servidor/index.ts: /\bBuffer\b/`: a trava da fase 1 só libera `src/bin`.

- [ ] **Passo 3.6: A trava aceita o Node só em `src/servidor/index.ts`**

Em `packages/core/src/portabilidade.test.ts`, ponha logo abaixo da constante `PROIBIDOS`:

```ts
// src/servidor/index.ts liga o servidor ao node:http (fase 2); consulta.ts e rotas.ts seguem portáveis.
const SO_NO_NODE = [join('servidor', 'index.ts')]
```

e, em `modulosDeProducao`, troque

```ts
const ehModulo =
  entrada.name.endsWith('.ts') && !entrada.name.endsWith('.test.ts')
```

por

```ts
const ehModulo =
  entrada.name.endsWith('.ts') &&
  !entrada.name.endsWith('.test.ts') &&
  !SO_NO_NODE.includes(relative(SRC, caminho))
```

Nada mais muda (a exceção da pasta `bin` e a linha `PROIBIDOS.filter((proibido) => proibido.test(texto))` ficam como estão; a fase 3 mexe nessa linha). Prova de que a exceção é estreita: uma sonda com `process.` noutro arquivo de `src/servidor/` tem de reprovar.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/portabilidade.test.ts > "${TMPDIR:-/tmp}/botai-f2-t3p.log" 2>&1; echo PORTABILIDADE=$?; printf "export const ambiente = () => process.env\n" > src/servidor/zz-sonda.ts && ./node_modules/.bin/jest src/portabilidade.test.ts > "${TMPDIR:-/tmp}/botai-f2-t3s.log" 2>&1; echo SONDA=$?; /bin/rm src/servidor/zz-sonda.ts; /usr/bin/grep -c "zz-sonda.ts" "${TMPDIR:-/tmp}/botai-f2-t3s.log"
```

Esperado: `PORTABILIDADE=0`, `SONDA=1` e uma contagem maior que 0 (a sonda listada); a sonda é apagada no mesmo comando.

- [ ] **Passo 3.7: Build, pacote e prova de que a raiz não puxa `node:http`**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && "$(command -v pnpm)" run build > "${TMPDIR:-/tmp}/botai-f2-build.log" 2>&1; echo BUILD=$?; /bin/ls dist/servidor; node --test scripts/pacote.test.mjs > "${TMPDIR:-/tmp}/botai-f2-pacote.log" 2>&1; echo PACOTE=$?; /usr/bin/grep -rlE "from ['\"]node:" dist --include=*.js; echo EXIT=$?
```

Esperado: `BUILD=0`; `dist/servidor` com `consulta`, `rotas` e `index` (`.js` e `.d.ts`); `PACOTE=0` (o `pnpm pack` leva `dist/servidor/index.*` pelo manifesto e carrega `./servidor` no Node como ESM); e **uma** linha, `dist/servidor/index.js`, com `EXIT=0`. Qualquer outro arquivo do `dist` importando `node:` quebra a extensão, que lê o core no navegador.

- [ ] **Passo 3.8: Lint e a suíte inteira**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && "$(command -v pnpm)" run lint > "${TMPDIR:-/tmp}/botai-f2-lint.log" 2>&1; echo LINT=$?; "$(command -v pnpm)" run test > "${TMPDIR:-/tmp}/botai-f2-test.log" 2>&1; echo TEST=$?; /usr/bin/grep -E "Tests:|# fail" "${TMPDIR:-/tmp}/botai-f2-test.log"
```

Esperado: `LINT=0`, `TEST=0` e `# fail 0`.

- [ ] **Passo 3.9: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/servidor/index.ts packages/core/src/servidor/index.test.ts packages/core/src/portabilidade.test.ts packages/core/package.json && /usr/bin/git commit -m "feat(core): servidor HTTP no subpath /servidor"; echo EXIT=$?; /usr/bin/git status --porcelain
```

Esperado: `EXIT=0` e nenhuma linha pendente.

---

### Tarefa 4: Comando `botai serve`

**Files:**

- Create: `packages/core/src/bin/serve.ts`
- Test: `packages/core/src/bin/serve.test.ts`
- Modify: `packages/core/src/bin/botai.ts` (despacha `serve`), `packages/core/src/cli/ajuda.ts` (linha do `serve` na ajuda geral), `packages/core/scripts/pacote.test.mjs` (`EXTRAS`)

**Interfaces:**

- Consumes: Tarefa 3 (`iniciarServidor`, `PORTA_PADRAO`, `HOST_PADRAO`, `OpcoesDoServidor`, `ServidorNoAr`, por `'../servidor/index'`); fase 1 (`executar`, o bin, e o leitor de argumentos `lerArgumentos`, `ErroDeUso`, `DefinicaoDeOpcoes`, `ArgumentosLidos` de `'../cli/argumentos'`: o `serve` aceita as flags do mesmo jeito que os outros comandos, `--porta 9000` e `--porta=9000`).
- Produces (`src/bin/serve.ts`; mora em `src/bin` porque fala com o processo, regra da fase 1):

  ```ts
  export const USO_DO_SERVE = 'botai serve [--porta 8790] [--host 127.0.0.1]'
  export const AJUDA_SERVE: string
  export class ErroDoServe extends Error {
    readonly codigo: 1 | 2
  } // 2 = uso; 1 = a porta não abriu
  export function lerOpcoesDoServe(
    args: readonly string[],
  ): Required<OpcoesDoServidor>
  export function subirServe(
    args: readonly string[],
    escrever?: (linha: string) => void,
  ): Promise<ServidorNoAr>
  export function executarServe(args: readonly string[]): Promise<void>
  ```

  No stderr, ao subir: `botai serve: ouvindo em <url> (Ctrl+C encerra)`. Os testes e o `fumaca.mjs` acham a URL por `/ouvindo em (http:\/\/\S+)/`: mudar a frase quebra os dois. SIGINT e SIGTERM encerram com código 0. `botai serve --help` (ou `-h`): `AJUDA_SERVE` no stdout, código 0, como os outros comandos da fase 1. O `executar` da fase 1 continua síncrono e não conhece o `serve`: o bin o despacha antes.

- [ ] **Passo 4.1: Escrever o teste que falha**

`packages/core/src/bin/serve.test.ts`:

```ts
/** @jest-environment node */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { request } from 'node:http'
import { join } from 'node:path'
import { HOST_PADRAO, PORTA_PADRAO } from '../servidor/index'
import { MOTOR } from '../versao'
import { ErroDoServe, lerOpcoesDoServe } from './serve'

interface ItemDoIndice {
  arquivo: string
  n?: number
  opcoes: {
    semente: number | string
    hoje: string
    uf?: string
    dominioEmail?: string
  }
}

const RAIZ = join(__dirname, '..', '..')
const BIN = join(
  RAIZ,
  (
    JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as {
      bin: { botai: string }
    }
  ).bin.botai,
)
const DOURADO = join(RAIZ, 'dourado', 'v1')
const ler = (arquivo: string) => readFileSync(join(DOURADO, arquivo), 'utf8')
const INDICE = JSON.parse(ler('indice.json')) as ItemDoIndice[]

interface Servindo {
  filho: ChildProcessWithoutNullStreams
  url: string
}

function botai(args: string[]): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [BIN, ...args])
}

function servir(args: string[]): Promise<Servindo> {
  const filho = botai(['serve', ...args])
  let erro = ''
  return new Promise((resolve, reject) => {
    filho.stderr.on('data', (parte: Buffer) => {
      erro += parte.toString()
      const achado = /ouvindo em (http:\/\/\S+)/.exec(erro)
      if (achado) resolve({ filho, url: achado[1] })
    })
    filho.on('exit', (codigo) =>
      reject(new Error(`serve saiu com ${codigo}: ${erro}`)),
    )
  })
}

function saida(
  filho: ChildProcessWithoutNullStreams,
): Promise<{ codigo: number | null; stdout: string; erro: string }> {
  let stdout = ''
  let erro = ''
  filho.stdout.on('data', (parte: Buffer) => (stdout += parte.toString()))
  filho.stderr.on('data', (parte: Buffer) => (erro += parte.toString()))
  return new Promise((resolve) =>
    filho.once('exit', (codigo) => resolve({ codigo, stdout, erro })),
  )
}

function pedir(url: string): Promise<{ status: number; corpo: string }> {
  return new Promise((resolve, reject) => {
    request(url, { agent: false }, (res) => {
      let corpo = ''
      res.setEncoding('utf8')
      res.on('data', (parte: string) => (corpo += parte))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, corpo }))
    })
      .on('error', reject)
      .end()
  })
}

// O envelope não registra uf nem dominioEmail: a consulta sai do índice.
function alvoDe(item: ItemDoIndice): string {
  const { semente, hoje, uf, dominioEmail } = item.opcoes
  const consulta = new URLSearchParams({ semente: String(semente), hoje })
  if (uf !== undefined) consulta.set('uf', uf)
  if (dominioEmail !== undefined) consulta.set('dominioEmail', dominioEmail)
  if (item.n !== undefined) consulta.set('n', String(item.n))
  return `${item.n === undefined ? '/pessoa' : '/pessoas'}?${consulta}`
}

describe('lerOpcoesDoServe', () => {
  test('sem opção: porta 8790 em 127.0.0.1', () => {
    expect(lerOpcoesDoServe([])).toEqual({
      porta: PORTA_PADRAO,
      host: HOST_PADRAO,
    })
  })

  test('--porta 0 (uma livre) e --host', () => {
    expect(lerOpcoesDoServe(['--porta', '0', '--host', '0.0.0.0'])).toEqual({
      porta: 0,
      host: '0.0.0.0',
    })
  })

  // O leitor de argumentos da fase 1: as flags valem como nos outros comandos.
  test('--porta=0 e --host=::1, como as outras flags da CLI', () => {
    expect(lerOpcoesDoServe(['--porta=0', '--host=::1'])).toEqual({
      porta: 0,
      host: '::1',
    })
  })

  test.each([
    [['--porta', 'abc'], '--porta inválida: abc'],
    [['--porta', '65536'], '--porta inválida: 65536'],
    [['--porta', '-1'], '--porta inválida: -1'],
    [['--porta'], '--porta precisa de um valor'],
    [['--porta='], '--porta precisa de um valor'],
    [['--host', ''], '--host precisa de um valor'],
    [['--porta', '1', '--porta', '2'], 'opção repetida: --porta'],
    [['--port', '1'], 'opção desconhecida: --port'],
    [['extra'], 'argumento inesperado: extra'],
  ])('%j → erro de uso (código 2)', (args, mensagem) => {
    let erro: unknown
    try {
      lerOpcoesDoServe(args)
    } catch (e) {
      erro = e
    }
    expect(erro).toBeInstanceOf(ErroDoServe)
    expect((erro as ErroDoServe).codigo).toBe(2)
    expect((erro as ErroDoServe).message).toContain(mensagem)
  })
})

describe('botai serve (o bin do build, por processo e HTTP)', () => {
  let servindo: Servindo | undefined

  beforeAll(() => {
    if (!existsSync(BIN))
      throw new Error(`${BIN} não existe: rode pnpm run build antes`)
  })

  afterEach(async () => {
    if (servindo && servindo.filho.exitCode === null) {
      const fim = saida(servindo.filho)
      servindo.filho.kill('SIGKILL')
      await fim
    }
    servindo = undefined
  })

  test('escuta em 127.0.0.1 por padrão e responde igual aos dourados', async () => {
    servindo = await servir(['--porta', '0'])
    expect(servindo.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    for (const item of INDICE) {
      const r = await pedir(`${servindo.url}${alvoDe(item)}`)
      expect(r.status).toBe(200)
      const corpo = JSON.parse(r.corpo) as { motor: string }
      expect(corpo.motor).toBe(MOTOR)
      expect({ ...corpo, motor: '' }).toEqual({
        ...JSON.parse(ler(item.arquivo)),
        motor: '',
      })
    }
  })

  test.each(['SIGTERM', 'SIGINT'] as const)(
    '%s encerra com código 0',
    async (sinal) => {
      servindo = await servir(['--porta', '0'])
      const fim = saida(servindo.filho)
      servindo.filho.kill(sinal)
      expect((await fim).codigo).toBe(0)
    },
  )

  test('--help: a ajuda no stdout, saída 0, sem subir', async () => {
    const { codigo, stdout } = await saida(botai(['serve', '--help']))
    expect(codigo).toBe(0)
    expect(stdout).toContain('GET /pessoa, /pessoas, /saude')
  })

  test('porta ocupada: sai com 1 e diz o que fazer', async () => {
    servindo = await servir(['--porta', '0'])
    const porta = new URL(servindo.url).port
    const { codigo, erro } = await saida(botai(['serve', '--porta', porta]))
    expect(codigo).toBe(1)
    expect(erro).toContain(`a porta ${porta} já está em uso`)
  })

  test('host que não é desta máquina: sai com 2', async () => {
    const { codigo, erro } = await saida(
      botai(['serve', '--porta', '0', '--host', '203.0.113.1']),
    )
    expect(codigo).toBe(2)
    expect(erro).toContain('--host inválido: 203.0.113.1')
  })

  test('opção inválida: sai com 2, sem subir', async () => {
    const { codigo, erro } = await saida(botai(['serve', '--porta', 'abc']))
    expect(codigo).toBe(2)
    expect(erro).toContain('--porta inválida: abc')
  })
})
```

- [ ] **Passo 4.2: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/bin/serve.test.ts > "${TMPDIR:-/tmp}/botai-f2-t4.log" 2>&1; echo EXIT=$?; /usr/bin/grep -m3 -E "Cannot find module|Tests:" "${TMPDIR:-/tmp}/botai-f2-t4.log"
```

Esperado: `EXIT=1` e `Cannot find module './serve'`.

- [ ] **Passo 4.3: Implementar `serve.ts`**

`packages/core/src/bin/serve.ts`:

```ts
import {
  type ArgumentosLidos,
  type DefinicaoDeOpcoes,
  ErroDeUso,
  lerArgumentos,
} from '../cli/argumentos'
import {
  HOST_PADRAO,
  iniciarServidor,
  type OpcoesDoServidor,
  PORTA_PADRAO,
  type ServidorNoAr,
} from '../servidor/index'

export const USO_DO_SERVE = 'botai serve [--porta 8790] [--host 127.0.0.1]'

export const AJUDA_SERVE = `botai serve: servidor HTTP local, GET /pessoa, /pessoas, /saude.

Uso: ${USO_DO_SERVE}

Opções:
  --porta P   porta (padrão 8790; 0 escolhe uma livre)
  --host H    endereço (padrão 127.0.0.1, só esta máquina; 0.0.0.0 abre para a rede)

Parâmetros das rotas: os das flags da CLI em camelCase
(semente, hoje, uf, dominioEmail, n, formato, dialeto, tabela, campos).
`

export class ErroDoServe extends Error {
  readonly codigo: 1 | 2

  constructor(mensagem: string, codigo: 1 | 2) {
    super(mensagem)
    this.name = 'ErroDoServe'
    this.codigo = codigo
  }
}

const OPCOES_DO_SERVE = {
  porta: { tipo: 'texto' },
  host: { tipo: 'texto' },
  help: { tipo: 'booleano', curta: 'h' },
} as const satisfies DefinicaoDeOpcoes

function lerArgumentosDoServe(args: readonly string[]): ArgumentosLidos {
  try {
    return lerArgumentos(args, OPCOES_DO_SERVE)
  } catch (erro) {
    if (erro instanceof ErroDeUso)
      throw new ErroDoServe(`${erro.message} (uso: ${USO_DO_SERVE})`, 2)
    throw erro
  }
}

export function lerOpcoesDoServe(
  args: readonly string[],
): Required<OpcoesDoServidor> {
  const { opcoes, posicionais } = lerArgumentosDoServe(args)
  if (posicionais.length > 0)
    throw new ErroDoServe(
      `argumento inesperado: ${posicionais[0]} (uso: ${USO_DO_SERVE})`,
      2,
    )
  const porta = opcoes.porta as string | undefined
  const host = opcoes.host as string | undefined
  for (const [nome, valor] of [
    ['porta', porta],
    ['host', host],
  ] as const)
    if (valor === '') throw new ErroDoServe(`--${nome} precisa de um valor`, 2)
  if (
    porta !== undefined &&
    (!/^\d{1,5}$/.test(porta) || Number(porta) > 65_535)
  )
    throw new ErroDoServe(
      `--porta inválida: ${porta} (de 0 a 65535; 0 escolhe uma livre)`,
      2,
    )
  return {
    porta: porta === undefined ? PORTA_PADRAO : Number(porta),
    host: host ?? HOST_PADRAO,
  }
}

export async function subirServe(
  args: readonly string[],
  escrever: (linha: string) => void = (linha) =>
    process.stderr.write(`${linha}\n`),
): Promise<ServidorNoAr> {
  const opcoes = lerOpcoesDoServe(args)
  let noAr: ServidorNoAr
  try {
    noAr = await iniciarServidor(opcoes)
  } catch (causa) {
    const codigo = (causa as NodeJS.ErrnoException).code
    if (codigo === 'EADDRINUSE')
      throw new ErroDoServe(
        `a porta ${opcoes.porta} já está em uso em ${opcoes.host}; escolha outra com --porta`,
        1,
      )
    if (codigo === 'EADDRNOTAVAIL' || codigo === 'ENOTFOUND')
      throw new ErroDoServe(
        `--host inválido: ${opcoes.host} (use um endereço desta máquina, como 127.0.0.1 ou 0.0.0.0)`,
        2,
      )
    throw causa
  }
  escrever(`botai serve: ouvindo em ${noAr.url} (Ctrl+C encerra)`)
  // Na imagem o Node é o PID 1 e não tem tratador padrão de SIGTERM: sem este, o docker stop mata com 137.
  const parar = () => {
    noAr.encerrar().then(
      () => process.exit(0),
      () => process.exit(1),
    )
  }
  process.once('SIGINT', parar)
  process.once('SIGTERM', parar)
  return noAr
}

export async function executarServe(args: readonly string[]): Promise<void> {
  try {
    if (lerArgumentosDoServe(args).opcoes.help) {
      process.stdout.write(AJUDA_SERVE)
      return
    }
    await subirServe(args)
  } catch (erro) {
    if (!(erro instanceof ErroDoServe)) throw erro
    process.stderr.write(`botai: ${erro.message}\n`)
    process.exitCode = erro.codigo
  }
}
```

- [ ] **Passo 4.4: O bin despacha o `serve`, e a ajuda geral o lista**

`packages/core/src/bin/botai.ts` inteiro passa a ser (o `build` agora compila com os tipos do Node, Passo 1.7, e o tipo local de `process` que a fase 1 declarava, com o comentário que o justificava, sai):

```ts
#!/usr/bin/env node
import { executar } from '../cli/executar'
import { executarServe } from './serve'

process.stdout.on('error', (erro: NodeJS.ErrnoException) => {
  if (erro.code === 'EPIPE') process.exit(0)
  throw erro
})

const [comando, ...resto] = process.argv.slice(2)
if (comando === 'serve') void executarServe(resto)
else
  process.exitCode = executar(process.argv.slice(2), {
    dados: (texto) => void process.stdout.write(texto),
    mensagem: (texto) => void process.stderr.write(texto),
  })
```

O ramo do `serve` não atribui `process.exitCode` nem chama `process.exit`: o servidor no ar é o que mantém o processo vivo, e é o `executarServe` quem decide o código em erro.

Em `packages/core/src/cli/ajuda.ts`, no `AJUDA_GERAL`, logo depois da linha `  botai validar cpf|cnpj|rg|pis|titulo|cartao <valor>`, acrescente a linha:

```
  botai serve [--porta 8790] [--host 127.0.0.1]
```

Em `packages/core/scripts/pacote.test.mjs`, acrescente à constante `EXTRAS` exatamente `'dist/bin/serve.js'` e `'dist/bin/serve.d.ts'`.

- [ ] **Passo 4.5: Build e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && "$(command -v pnpm)" run build > "${TMPDIR:-/tmp}/botai-f2-build.log" 2>&1; echo BUILD=$?; ./node_modules/.bin/jest src/bin src/cli src/servidor > "${TMPDIR:-/tmp}/botai-f2-t4.log" 2>&1; echo EXIT=$?; /usr/bin/grep -E "Tests:" "${TMPDIR:-/tmp}/botai-f2-t4.log"
```

Esperado: `BUILD=0` e `EXIT=0` (o `serve.test.ts` e, sem mudança, os testes do bin e do `executar` da fase 1).

- [ ] **Passo 4.6: A suíte inteira e o lint**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && "$(command -v pnpm)" run test > "${TMPDIR:-/tmp}/botai-f2-test.log" 2>&1; echo TEST=$?; "$(command -v pnpm)" run lint > "${TMPDIR:-/tmp}/botai-f2-lint.log" 2>&1; echo LINT=$?; /usr/bin/grep -E "Tests:|# fail" "${TMPDIR:-/tmp}/botai-f2-test.log"
```

Esperado: `TEST=0`, `LINT=0` e `# fail 0`.

- [ ] **Passo 4.7: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/bin/serve.ts packages/core/src/bin/serve.test.ts packages/core/src/bin/botai.ts packages/core/src/cli/ajuda.ts packages/core/scripts/pacote.test.mjs && /usr/bin/git commit -m "feat(core): comando botai serve"; echo EXIT=$?; /usr/bin/git status --porcelain
```

Esperado: `EXIT=0` e nenhuma linha pendente.

---

### Tarefa 5: `install.sh` dos binários

**Files:**

- Create: `packages/core/scripts/install.sh`
- Test: `packages/core/scripts/install.test.ts`
- Modify: `packages/core/package.json` (scripts `lint:sh` e `lint`), `packages/core/jest.config.ts` (`testMatch`), `packages/core/tsconfig.json` (`include` do `lint`)

**Interfaces:**

- Consumes: os nomes dos binários e do `SHA256SUMS` do contrato; o release de tag `core-v<versão>`.
- Produces: `install.sh` com as variáveis `BOTAI_VERSAO` (ex.: `0.3.0`; ausente = `releases/latest`), `BOTAI_DESTINO` (padrão `$HOME/.local/bin`) e `BOTAI_RELEASES` (raiz dos releases; padrão `https://github.com/PiluVitu/Botai/releases`; existe para o teste e para espelhos). Baixa `<base>/SHA256SUMS` e `<base>/botai-<so>-<arq>`, com `<base>` = `$BOTAI_RELEASES/latest/download` ou `$BOTAI_RELEASES/download/core-v$BOTAI_VERSAO`. Instala como `$BOTAI_DESTINO/botai`.

- [ ] **Passo 5.1: Escrever o teste que falha**

`packages/core/scripts/install.test.ts`:

```ts
/** @jest-environment node */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = join(__dirname, 'install.sh')
const BINARIOS = [
  'botai-darwin-arm64',
  'botai-darwin-x64',
  'botai-linux-x64',
  'botai-linux-arm64',
]

interface Maquina {
  sistema: string
  arquitetura: string
  rosetta?: boolean
  musl?: boolean
}

interface Execucao {
  codigo: number | null
  stdout: string
  stderr: string
}

let pasta: string
let release: string
let servidor: Server
let releases: string
let pedidos: string[]

function escrever(caminho: string, conteudo: string): void {
  writeFileSync(caminho, conteudo)
  chmodSync(caminho, 0o755)
}

// Cada "binário" falso é um script que diz o próprio nome: prova qual arquivo foi instalado.
function montarRelease(): void {
  release = join(pasta, 'release')
  mkdirSync(release)
  const linhas = BINARIOS.map((nome) => {
    const conteudo = `#!/bin/sh\necho ${nome}\n`
    escrever(join(release, nome), conteudo)
    return `${createHash('sha256').update(conteudo).digest('hex')}  ${nome}`
  })
  writeFileSync(join(release, 'SHA256SUMS'), `${linhas.join('\n')}\n`)
}

// uname, sysctl e ldd falsos na frente do PATH: o teste escolhe a máquina.
function binFalso(maquina: Maquina): string {
  const bin = mkdtempSync(join(pasta, 'bin-'))
  escrever(
    join(bin, 'uname'),
    `#!/bin/sh\ncase "$1" in -s) echo ${maquina.sistema} ;; -m) echo ${maquina.arquitetura} ;; esac\n`,
  )
  escrever(join(bin, 'sysctl'), `#!/bin/sh\necho ${maquina.rosetta ? 1 : 0}\n`)
  escrever(
    join(bin, 'ldd'),
    maquina.musl
      ? '#!/bin/sh\necho "musl libc (x86_64)" >&2\nexit 1\n'
      : '#!/bin/sh\necho "ldd (GNU libc) 2.39"\n',
  )
  return bin
}

function instalar(
  maquina: Maquina,
  env: Record<string, string> = {},
): Promise<Execucao> {
  return new Promise((resolve, reject) => {
    // spawn assíncrono: o servidor do release falso roda neste mesmo processo.
    const filho = spawn('sh', [SCRIPT], {
      env: {
        HOME: pasta,
        PATH: `${binFalso(maquina)}:${process.env.PATH ?? ''}`,
        BOTAI_RELEASES: releases,
        BOTAI_DESTINO: join(pasta, 'destino'),
        ...env,
      },
    })
    let stdout = ''
    let stderr = ''
    filho.stdout.on('data', (parte: Buffer) => (stdout += parte.toString()))
    filho.stderr.on('data', (parte: Buffer) => (stderr += parte.toString()))
    filho.on('error', reject)
    filho.on('close', (codigo) => resolve({ codigo, stdout, stderr }))
  })
}

function rodar(caminho: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const filho = spawn(caminho, [])
    let saida = ''
    filho.stdout.on('data', (parte: Buffer) => (saida += parte.toString()))
    filho.on('error', reject)
    filho.on('close', () => resolve(saida.trim()))
  })
}

const instalado = () => join(pasta, 'destino', 'botai')

beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'botai-install-'))
  pedidos = []
  montarRelease()
  servidor = createServer((req, res) => {
    pedidos.push(req.url ?? '')
    const arquivo = (req.url ?? '').split('/').pop() ?? ''
    const caminho = join(release, arquivo)
    if (!arquivo || !existsSync(caminho)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200).end(readFileSync(caminho))
  })
  await new Promise<void>((resolve) =>
    servidor.listen(0, '127.0.0.1', () => resolve()),
  )
  releases = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()))
  rmSync(pasta, { recursive: true, force: true })
})

describe('install.sh', () => {
  test('Linux x64 com glibc: baixa da última versão, confere e instala executável', async () => {
    const r = await instalar({ sistema: 'Linux', arquitetura: 'x86_64' })

    expect(r.codigo).toBe(0)
    expect(statSync(instalado()).mode & 0o111).toBe(0o111)
    expect(await rodar(instalado())).toBe('botai-linux-x64')
    expect(pedidos).toEqual([
      '/latest/download/SHA256SUMS',
      '/latest/download/botai-linux-x64',
    ])
    expect(r.stdout).toContain('botai instalado em')
  })

  test('aarch64 vira arm64', async () => {
    const r = await instalar({ sistema: 'Linux', arquitetura: 'aarch64' })

    expect(r.codigo).toBe(0)
    expect(await rodar(instalado())).toBe('botai-linux-arm64')
  })

  test('Mac Apple Silicon num terminal sob Rosetta instala o arm64', async () => {
    const r = await instalar({
      sistema: 'Darwin',
      arquitetura: 'x86_64',
      rosetta: true,
    })

    expect(r.codigo).toBe(0)
    expect(await rodar(instalado())).toBe('botai-darwin-arm64')
  })

  test('Mac Intel instala o x64', async () => {
    const r = await instalar({ sistema: 'Darwin', arquitetura: 'x86_64' })

    expect(r.codigo).toBe(0)
    expect(await rodar(instalado())).toBe('botai-darwin-x64')
  })

  test('BOTAI_VERSAO baixa da tag core-v<versão>', async () => {
    const r = await instalar(
      { sistema: 'Linux', arquitetura: 'x86_64' },
      { BOTAI_VERSAO: '0.3.0' },
    )

    expect(r.codigo).toBe(0)
    expect(pedidos).toEqual([
      '/download/core-v0.3.0/SHA256SUMS',
      '/download/core-v0.3.0/botai-linux-x64',
    ])
  })

  test('SHA256 que não confere: sai com erro e não instala nada', async () => {
    writeFileSync(join(release, 'botai-linux-x64'), '#!/bin/sh\necho trocado\n')

    const r = await instalar({ sistema: 'Linux', arquitetura: 'x86_64' })

    expect(r.codigo).not.toBe(0)
    expect(r.stderr).toContain('não confere')
    expect(existsSync(instalado())).toBe(false)
  })

  test('binário ausente no release: erro com a URL', async () => {
    rmSync(join(release, 'botai-linux-arm64'))

    const r = await instalar({ sistema: 'Linux', arquitetura: 'arm64' })

    expect(r.codigo).not.toBe(0)
    expect(r.stderr).toContain('/latest/download/botai-linux-arm64')
  })

  test('Linux com musl (Alpine): recusa sem baixar e indica a imagem e o npm', async () => {
    const r = await instalar({
      sistema: 'Linux',
      arquitetura: 'x86_64',
      musl: true,
    })

    expect(r.codigo).not.toBe(0)
    expect(r.stderr).toContain('musl')
    expect(r.stderr).toContain('ghcr.io/piluvitu/botai')
    expect(pedidos).toEqual([])
  })

  test('Windows (Git Bash): recusa e indica os .exe', async () => {
    const r = await instalar({
      sistema: 'MINGW64_NT-10.0-26100',
      arquitetura: 'x86_64',
    })

    expect(r.codigo).not.toBe(0)
    expect(r.stderr).toContain('botai-windows-x64.exe')
    expect(r.stderr).toContain('botai-windows-arm64.exe')
    expect(pedidos).toEqual([])
  })

  test('arquitetura sem binário (armv7l): recusa', async () => {
    const r = await instalar({ sistema: 'Linux', arquitetura: 'armv7l' })

    expect(r.codigo).not.toBe(0)
    expect(r.stderr).toContain('armv7l')
  })

  test('destino fora do PATH: avisa como acrescentar', async () => {
    const r = await instalar({ sistema: 'Linux', arquitetura: 'x86_64' })

    expect(r.stderr).toContain('não está no PATH')
    expect(r.stderr).toContain(`export PATH="${join(pasta, 'destino')}:$PATH"`)
  })

  test('destino no PATH: sem aviso', async () => {
    const bin = binFalso({ sistema: 'Linux', arquitetura: 'x86_64' })
    const r = await instalar(
      { sistema: 'Linux', arquitetura: 'x86_64' },
      { PATH: `${bin}:${join(pasta, 'destino')}:${process.env.PATH ?? ''}` },
    )

    expect(r.codigo).toBe(0)
    expect(r.stderr).toBe('')
  })

  test('reinstalar troca o binário anterior', async () => {
    await instalar({ sistema: 'Linux', arquitetura: 'x86_64' })
    const r = await instalar({ sistema: 'Linux', arquitetura: 'aarch64' })

    expect(r.codigo).toBe(0)
    expect(await rodar(instalado())).toBe('botai-linux-arm64')
  })
})
```

- [ ] **Passo 5.2: Jest e tsc alcançam `scripts/`**

O Jest da fase 0 só olha `src/` e o `tsc` do `lint` só inclui `src/**/*.ts` (Passo 1.2). Em `packages/core/jest.config.ts`, troque o `testMatch` por:

```ts
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/scripts/**/*.test.ts'],
```

Em `packages/core/tsconfig.json`, troque `"include": ["src/**/*.ts"]` por `"include": ["src/**/*.ts", "scripts/**/*.ts"]`. O `tsconfig.build.json` não muda (ele tem o próprio `include` de `src`): `install.test.ts` não vai para o `dist`. Os `scripts/*.test.mjs` continuam com o `node --test` (o `testMatch` só pega `.ts`).

- [ ] **Passo 5.3: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest scripts/install.test.ts > "${TMPDIR:-/tmp}/botai-f2-t5.log" 2>&1; echo EXIT=$?; /usr/bin/grep -E "Tests:" "${TMPDIR:-/tmp}/botai-f2-t5.log"
```

Esperado: `EXIT=1`, 13 falhando (o `sh` não acha `scripts/install.sh`).

- [ ] **Passo 5.4: Implementar**

`packages/core/scripts/install.sh` (POSIX sh; o `curl … | sh` roda no `sh` do sistema, que é o dash no Ubuntu):

```sh
#!/bin/sh
# Instala o binário `botai` de um GitHub Release de PiluVitu/Botai em ~/.local/bin.
# curl -fsSL https://github.com/PiluVitu/Botai/releases/latest/download/install.sh | sh
set -eu

RELEASES=${BOTAI_RELEASES:-https://github.com/PiluVitu/Botai/releases}

erro() {
  printf 'botai: %s\n' "$1" >&2
  exit 1
}

baixar() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 3 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    erro "falta curl ou wget para baixar o binário"
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d ' ' -f 1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d ' ' -f 1
  else
    erro "falta sha256sum ou shasum para conferir o binário"
  fi
}

case "$(uname -s)" in
  Darwin) so=darwin ;;
  Linux) so=linux ;;
  MINGW* | MSYS* | CYGWIN*) erro "no Windows, baixe botai-windows-x64.exe (ou botai-windows-arm64.exe) em $RELEASES (veja o README)" ;;
  *) erro "sistema sem binário: $(uname -s). Use o npm (npx @pilutech/botai-core) ou a imagem ghcr.io/piluvitu/botai" ;;
esac

case "$(uname -m)" in
  x86_64 | amd64) arq=x64 ;;
  arm64 | aarch64) arq=arm64 ;;
  *) erro "arquitetura sem binário: $(uname -m). Use o npm (npx @pilutech/botai-core) ou a imagem ghcr.io/piluvitu/botai" ;;
esac

# Terminal sob Rosetta: o uname diz x86_64 num Mac Apple Silicon.
if [ "$so" = darwin ] && [ "$arq" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
  arq=arm64
fi

if [ "$so" = linux ] && ldd --version 2>&1 | grep -qi musl; then
  erro "Linux com musl (Alpine) não tem binário: use a imagem ghcr.io/piluvitu/botai ou o npm (npx @pilutech/botai-core)"
fi

nome="botai-$so-$arq"
if [ -n "${BOTAI_VERSAO:-}" ]; then
  base="$RELEASES/download/core-v$BOTAI_VERSAO"
else
  base="$RELEASES/latest/download"
fi
destino=${BOTAI_DESTINO:-$HOME/.local/bin}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
trap 'exit 1' INT TERM

baixar "$base/SHA256SUMS" "$tmp/SHA256SUMS" || erro "não deu para baixar $base/SHA256SUMS"
baixar "$base/$nome" "$tmp/$nome" || erro "não deu para baixar $base/$nome"

esperado=$(awk -v n="$nome" '$2 == n || $2 == "*" n { print $1 }' "$tmp/SHA256SUMS")
[ -n "$esperado" ] || erro "o SHA256SUMS não tem a linha de $nome"
obtido=$(sha256 "$tmp/$nome")
[ "$esperado" = "$obtido" ] || erro "o SHA256 de $nome não confere (esperado $esperado, baixado $obtido); nada foi instalado"

mkdir -p "$destino"
cp "$tmp/$nome" "$destino/.botai-novo"
chmod 755 "$destino/.botai-novo"
mv -f "$destino/.botai-novo" "$destino/botai"
printf 'botai instalado em %s/botai (%s)\n' "$destino" "$nome"

case ":$PATH:" in
  *":$destino:"*) ;;
  *) printf 'botai: %s não está no PATH; acrescente ao perfil do seu shell: export PATH="%s:%s"\n' "$destino" "$destino" "\$PATH" >&2 ;;
esac
```

```bash
chmod +x /Users/piluvitu/PILUTECH/Botai/packages/core/scripts/install.sh; echo EXIT=$?
```

- [ ] **Passo 5.5: ShellCheck no `lint`**

Em `packages/core/package.json`, o script `"lint:sh": "shellcheck scripts/*.sh"`, encadeado no fim do `lint` que a fase 1 deixou (o ShellCheck vem do sistema: Homebrew no Mac, já instalado nos runners `ubuntu-24.04`; não do npm):

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -e '
const fs = require("fs")
const p = JSON.parse(fs.readFileSync("package.json", "utf8"))
p.scripts["lint:sh"] = "shellcheck scripts/*.sh"
if (!p.scripts.lint.endsWith(" && pnpm run lint:sh")) p.scripts.lint += " && pnpm run lint:sh"
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n")
'; node -p 'const p = require("./package.json"); [p.scripts.lint, p.scripts["lint:sh"]].join("\n")'; echo EXIT=$?
```

Esperado: o `lint` da fase 1 terminando em `&& pnpm run lint:sh`, a linha `shellcheck scripts/*.sh` e `EXIT=0`.

- [ ] **Passo 5.6: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest scripts/install.test.ts > "${TMPDIR:-/tmp}/botai-f2-t5.log" 2>&1; echo EXIT=$?; /usr/bin/grep -E "Tests:" "${TMPDIR:-/tmp}/botai-f2-t5.log"; shellcheck scripts/install.sh; echo SHELLCHECK=$?; "$(command -v pnpm)" run lint > "${TMPDIR:-/tmp}/botai-f2-lint.log" 2>&1; echo LINT=$?
```

Esperado: `EXIT=0` com 13 passando, `SHELLCHECK=0`, `LINT=0` (no protótipo de 2026-10-05 os 13 passaram e o ShellCheck 0.11.0 saiu limpo).

- [ ] **Passo 5.7: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/scripts/install.sh packages/core/scripts/install.test.ts && /usr/bin/git add -u packages/core && /usr/bin/git commit -m "feat(core): install.sh dos binários com conferência do SHA256"; echo EXIT=$?
```

---

### Tarefa 6: Imagem Docker, fumaça e job `imagem` do CI

**Files:**

- Create: `packages/core/Dockerfile`, `packages/core/.dockerignore`, `packages/core/scripts/fumaca.mjs`, `packages/core/scripts/fumaca-imagem.sh`
- Modify: `packages/core/package.json` (script `tarball`), `.gitignore` (raiz), `Makefile` (raiz), `.github/workflows/ci.yml` (job `imagem`), `.github/dependabot.yml` (ecossistema `docker`)

**Interfaces:**

- Consumes: o `bin.botai` e o `files` do pacote (o tarball); `botai serve` (Tarefa 4) e a linha `ouvindo em <url>`; os dourados.
- Produces:
  - `pnpm --filter @pilutech/botai-core run tarball` → `packages/core/pacote/botai-core.tgz` (o mesmo arquivo do `npm publish`).
  - Imagem: `ENTRYPOINT ["botai"]`, `CMD ["serve", "--host", "0.0.0.0", "--porta", "8790"]` (o `docker run <imagem> pessoa …` usa a CLI).
  - `node scripts/fumaca.mjs --binario <caminho>` e `node scripts/fumaca.mjs --url <base>` (sai com 0 ou com o `AssertionError`); `bash scripts/fumaca-imagem.sh <imagem>`.
  - `make imagem` (tag `botai:local`) e `make fumaca-imagem`.

- [ ] **Passo 6.1: A fumaça (o teste desta tarefa)**

`packages/core/scripts/fumaca.mjs`:

```js
// Fumaça contra os dourados, sem dependência: roda com o node puro nos 6 runners do release.
//   node scripts/fumaca.mjs --binario dist-bin/botai-linux-x64
//   node scripts/fumaca.mjs --url http://127.0.0.1:8790
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const VERSAO = JSON.parse(
  readFileSync(join(RAIZ, 'package.json'), 'utf8'),
).version
const PASTA_DOURADA = join(RAIZ, 'dourado', 'v1')
const ler = (arquivo) => readFileSync(join(PASTA_DOURADA, arquivo), 'utf8')
// O índice da fase 1 diz como cada dourado foi gerado; o envelope não guarda uf nem dominioEmail.
const INDICE = JSON.parse(ler('indice.json'))

function argumentosDe(item, extras = []) {
  const { semente, hoje, uf, dominioEmail } = item.opcoes
  const args =
    item.n === undefined ? ['pessoa'] : ['pessoas', '-n', String(item.n)]
  args.push('--semente', String(semente), '--hoje', hoje)
  if (uf !== undefined) args.push('--uf', uf)
  if (dominioEmail !== undefined) args.push('--dominio-email', dominioEmail)
  return [...args, ...extras]
}

function alvoDe(item, extras = {}) {
  const { semente, hoje, uf, dominioEmail } = item.opcoes
  const consulta = new URLSearchParams({ semente: String(semente), hoje })
  if (uf !== undefined) consulta.set('uf', uf)
  if (dominioEmail !== undefined) consulta.set('dominioEmail', dominioEmail)
  if (item.n !== undefined) consulta.set('n', String(item.n))
  for (const [nome, valor] of Object.entries(extras)) consulta.set(nome, valor)
  return `${item.n === undefined ? '/pessoa' : '/pessoas'}?${consulta}`
}

// O sql da CLI e do servidor tem a linha "-- botai: …" antes dos INSERT; o derivado dourado, não.
const comoDerivado = (derivado, texto) =>
  derivado.formato === 'sql' ? texto.slice(texto.indexOf('\n') + 1) : texto

// O motor é a versão do pacote: um binário que não a embutiu (lendo o package.json em
// tempo de execução, por exemplo) falha aqui, e não no computador de quem baixou.
function igualAoDourado(obtido, item, origem) {
  const dourado = JSON.parse(ler(item.arquivo))
  assert.equal(
    obtido.motor,
    VERSAO,
    `${origem}: motor ${obtido.motor}, esperado ${VERSAO}`,
  )
  assert.deepEqual(
    { ...obtido, motor: dourado.motor },
    dourado,
    `${origem}: difere do dourado`,
  )
}

function conferirSha256(binario) {
  const somas = join(dirname(binario), 'SHA256SUMS')
  if (!existsSync(somas)) return
  const linha = readFileSync(somas, 'utf8')
    .split('\n')
    .find((l) => l.trim().split(/\s+\*?/)[1] === basename(binario))
  assert.ok(linha, `SHA256SUMS sem a linha de ${basename(binario)}`)
  const obtido = createHash('sha256')
    .update(readFileSync(binario))
    .digest('hex')
  assert.equal(
    obtido,
    linha.split(/\s+/)[0],
    `SHA256 de ${basename(binario)} não confere`,
  )
}

async function conferirUrl(base) {
  const saude = await fetch(`${base}/saude`)
  assert.equal(saude.status, 200, '/saude')
  assert.deepEqual(await saude.json(), { ok: true, formato: 1, motor: VERSAO })
  for (const item of INDICE) {
    const resposta = await fetch(`${base}${alvoDe(item)}`)
    assert.equal(
      resposta.status,
      200,
      `${item.arquivo}: status ${resposta.status}`,
    )
    igualAoDourado(await resposta.json(), item, `HTTP ${item.arquivo}`)
    for (const derivado of item.derivados ?? []) {
      const extras = { formato: derivado.formato }
      if (derivado.dialeto) extras.dialeto = derivado.dialeto
      const texto = await (await fetch(`${base}${alvoDe(item, extras)}`)).text()
      assert.equal(
        comoDerivado(derivado, texto),
        ler(derivado.arquivo),
        `HTTP ${derivado.arquivo}`,
      )
    }
  }
  const invalida = await fetch(`${base}/pessoas?n=0`)
  assert.equal(invalida.status, 400, '/pessoas?n=0')
}

function servir(binario) {
  const filho = spawn(binario, ['serve', '--porta', '0'])
  const url = new Promise((resolve, reject) => {
    let erro = ''
    filho.stderr.on('data', (parte) => {
      erro += parte
      const achado = /ouvindo em (http:\/\/\S+)/.exec(erro)
      if (achado) resolve(achado[1])
    })
    filho.on('exit', (codigo) =>
      reject(new Error(`serve saiu com ${codigo}: ${erro}`)),
    )
  })
  return { filho, url }
}

async function conferirBinario(binario) {
  conferirSha256(binario)
  const botai = (args) =>
    execFileSync(binario, args, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    })
  for (const item of INDICE) {
    igualAoDourado(
      JSON.parse(botai(argumentosDe(item))),
      item,
      `CLI ${item.arquivo}`,
    )
    for (const derivado of item.derivados ?? []) {
      const extras = ['--formato', derivado.formato]
      if (derivado.dialeto) extras.push('--dialeto', derivado.dialeto)
      assert.equal(
        comoDerivado(derivado, botai(argumentosDe(item, extras))),
        ler(derivado.arquivo),
        `CLI ${derivado.arquivo}`,
      )
    }
  }
  const { filho, url } = servir(binario)
  try {
    await conferirUrl(await url)
  } finally {
    const fim = new Promise((resolve) => filho.once('exit', resolve))
    filho.kill('SIGTERM')
    const codigo = await fim
    // No Windows o kill não entrega sinal: o processo morre sem passar pelo encerrar().
    if (process.platform !== 'win32')
      assert.equal(codigo, 0, `serve saiu com ${codigo} no SIGTERM`)
  }
}

const [modo, alvo] = process.argv.slice(2)
assert.ok(INDICE.length > 0, `nenhum dourado em ${PASTA_DOURADA}/indice.json`)
if (modo === '--binario' && alvo) await conferirBinario(alvo)
else if (modo === '--url' && alvo) await conferirUrl(alvo)
else {
  console.error(
    'uso: node scripts/fumaca.mjs --binario <caminho> | --url <base>',
  )
  process.exit(2)
}
console.log(`fumaça ok: ${alvo} (${INDICE.length} dourados, motor ${VERSAO})`)
```

`packages/core/scripts/fumaca-imagem.sh`:

```bash
#!/usr/bin/env bash
# Sobe a imagem, espera o HEALTHCHECK, confere as rotas contra os dourados e para com SIGTERM.
# Uso: scripts/fumaca-imagem.sh <imagem>
set -euo pipefail

imagem=${1:?uso: scripts/fumaca-imagem.sh <imagem>}
cd "$(dirname "$0")/.."
nome="botai-fumaca-$$"
trap 'docker rm -f "$nome" >/dev/null 2>&1 || true' EXIT

docker run -d --name "$nome" -p 127.0.0.1::8790 "$imagem" >/dev/null

estado=starting
for _ in $(seq 1 30); do
  estado=$(docker inspect -f '{{.State.Health.Status}}' "$nome")
  [ "$estado" = healthy ] && break
  sleep 1
done
if [ "$estado" != healthy ]; then
  echo "fumaca-imagem: o HEALTHCHECK não chegou a healthy (último estado: $estado)" >&2
  docker logs "$nome" >&2
  exit 1
fi

usuario=$(docker exec "$nome" id -u)
if [ "$usuario" = 0 ]; then
  echo "fumaca-imagem: o servidor roda como root" >&2
  exit 1
fi

porta=$(docker port "$nome" 8790/tcp | head -n 1 | sed 's/.*://')
node scripts/fumaca.mjs --url "http://127.0.0.1:$porta"

docker stop -t 5 "$nome" >/dev/null
codigo=$(docker inspect -f '{{.State.ExitCode}}' "$nome")
if [ "$codigo" != 0 ]; then
  echo "fumaca-imagem: o docker stop terminou com $codigo (esperado 0: o SIGTERM encerra o servidor)" >&2
  exit 1
fi
echo "fumaca-imagem: $imagem ok"
```

```bash
chmod +x /Users/piluvitu/PILUTECH/Botai/packages/core/scripts/fumaca-imagem.sh; echo EXIT=$?
```

- [ ] **Passo 6.2: Ver a fumaça falhar sem a imagem**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && docker info --format '{{.ServerVersion}}'; echo DOCKER=$?; bash scripts/fumaca-imagem.sh botai:local; echo EXIT=$?
```

Esperado: `DOCKER=0` (Docker 25 ou mais novo: o `HEALTHCHECK --start-interval` precisa) e `EXIT=125` com `Unable to find image 'botai:local'` (ou `pull access denied`).

- [ ] **Passo 6.3: Tarball, Dockerfile e `.dockerignore`**

Em `packages/core/package.json`, acrescente o script:

```json
"tarball": "pnpm run build && rm -rf pacote && pnpm pack --pack-destination pacote && mv pacote/*.tgz pacote/botai-core.tgz"
```

`packages/core/Dockerfile`:

```dockerfile
FROM node:24.21.0-alpine3.24@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

LABEL org.opencontainers.image.source="https://github.com/PiluVitu/Botai" \
      org.opencontainers.image.description="Botaí: pessoa brasileira de teste por HTTP (GET /pessoa, /pessoas, /saude) e pela CLI botai" \
      org.opencontainers.image.licenses="MIT"

# O tarball é o mesmo arquivo do npm publish; sem dependência, instala com --offline.
COPY pacote/botai-core.tgz /tmp/botai-core.tgz
RUN npm install --global --offline --no-audit --no-fund --no-update-notifier --ignore-scripts /tmp/botai-core.tgz \
 && rm /tmp/botai-core.tgz \
 && npm cache clean --force

USER node
EXPOSE 8790
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --start-interval=1s --retries=3 \
  CMD wget -q -T 2 -O /dev/null http://127.0.0.1:8790/saude || exit 1
ENTRYPOINT ["botai"]
CMD ["serve", "--host", "0.0.0.0", "--porta", "8790"]
```

`packages/core/.dockerignore`:

```
*
!pacote/botai-core.tgz
```

Na raiz, `.gitignore`, acrescente:

```
packages/core/pacote/
packages/core/dist-bin/
```

- [ ] **Passo 6.4: `make imagem` e `make fumaca-imagem`**

No `Makefile` da raiz, acrescente (recuo com TAB):

```make
.PHONY: imagem fumaca-imagem

imagem: ## Imagem botai:local a partir do tarball do npm (build sem rede)
	pnpm --filter @pilutech/botai-core run tarball
	docker build --network=none -t botai:local packages/core

fumaca-imagem: imagem ## Sobe a botai:local e confere contra os dourados
	cd packages/core && bash scripts/fumaca-imagem.sh botai:local
```

- [ ] **Passo 6.5: Ver a fumaça passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai && make fumaca-imagem > "${TMPDIR:-/tmp}/botai-f2-t6.log" 2>&1; echo EXIT=$?; /usr/bin/grep -E "fumaça ok|fumaca-imagem" "${TMPDIR:-/tmp}/botai-f2-t6.log"; docker image ls botai:local --format '{{.Size}}'; echo EXIT=$?
```

Esperado: `EXIT=0`, as linhas `fumaça ok: http://127.0.0.1:<porta> (<n> dourados, motor <versão>)` e `fumaca-imagem: botai:local ok`, e o tamanho da imagem (anote para o `CLAUDE.md`; no protótipo de 2026-10-05, 240 MB no `docker image ls` do Docker 29 com o containerd, quase tudo o binário `node` de 122 MB). Medido no protótipo: `healthy` em 1,5 s, `docker stop` em 1 s com `ExitCode` 0, `id -u` = 1000, e o build com `--network=none` passa.

- [ ] **Passo 6.6: Job `imagem` no `ci.yml` e Dependabot**

Em `.github/workflows/ci.yml`, acrescente o job no mesmo nível dos outros (`dependencias`, `core`, `extensao`, `site`), com as linhas `uses:` que o próprio `ci.yml` já usa e a mesma `node-version` do job `core` (`'22'` na fase 0; `'24.14.0'` se a regra R7 da fase 1 a trocou):

```yaml
imagem:
  name: Imagem do core (docker build + fumaça)
  runs-on: ubuntu-24.04
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
      with:
        persist-credentials: false

    - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

    - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
      with:
        node-version: '22'
        cache: pnpm

    - name: Instalar dependências
      run: pnpm install --frozen-lockfile

    - name: Build e tarball do npm
      run: pnpm --filter @pilutech/botai-core run tarball

    - name: docker build sem rede (a imagem só instala o tarball)
      run: docker build --network=none -t botai:fumaca packages/core

    - name: Fumaça (HEALTHCHECK, dourados, usuário, SIGTERM)
      working-directory: packages/core
      run: bash scripts/fumaca-imagem.sh botai:fumaca
```

Em `.github/dependabot.yml`, acrescente no fim de `updates:` o ecossistema `docker`, no mesmo formato dos dois da fase 0 (o `salvaguardas.test.mjs` conta `  - package-ecosystem:` e exige um `    cooldown:` para cada; Docker só aceita `default-days`, ver Global Constraints):

```yaml
- package-ecosystem: 'docker'
  directory: '/packages/core'
  schedule:
    interval: 'weekly'
    day: 'monday'
    time: '09:00'
    timezone: 'America/Sao_Paulo'
  open-pull-requests-limit: 5
  labels:
    - 'dependencies'
  commit-message:
    prefix: 'chore'
    include: 'scope'
  cooldown:
    default-days: 7
```

```bash
cd /Users/piluvitu/PILUTECH/Botai && actionlint .github/workflows/ci.yml; echo ACTIONLINT=$?; shellcheck packages/core/scripts/*.sh; echo SHELLCHECK=$?; node --test scripts/salvaguardas.test.mjs > "${TMPDIR:-/tmp}/botai-f2-salvaguardas.log" 2>&1; echo SALVAGUARDAS=$?; /usr/bin/grep -E "^# (pass|fail)" "${TMPDIR:-/tmp}/botai-f2-salvaguardas.log"
```

Esperado: `ACTIONLINT=0` (actionlint 1.7.12; com o ShellCheck no PATH ele também confere os `run:`), `SHELLCHECK=0`, `SALVAGUARDAS=0` e `# fail 0` (actions por SHA no job novo, três ecossistemas com três `cooldown`).

- [ ] **Passo 6.7: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/Dockerfile packages/core/.dockerignore packages/core/scripts/fumaca.mjs packages/core/scripts/fumaca-imagem.sh packages/core/package.json .gitignore Makefile .github/workflows/ci.yml .github/dependabot.yml && /usr/bin/git commit -m "feat(core): imagem Docker do servidor e fumaça no CI"; echo EXIT=$?
```

---

### Tarefa 7: Binários Bun com versão fixada

**Files:**

- Create: `.bun-version` (raiz), `packages/core/scripts/bun-fixo.sh`, `packages/core/scripts/binarios.sh`
- Modify: `Makefile` (raiz), `.github/workflows/ci.yml` (job `binario`)

**Interfaces:**

- Consumes: o `bin.botai` do pacote (Tarefa 4); `fumaca.mjs --binario` (Tarefa 6).
- Produces:
  - `bash scripts/bun-fixo.sh` → imprime o caminho do Bun do `.bun-version`, baixado uma vez para `${XDG_CACHE_HOME:-$HOME/.cache}/botai/bun-<versão>/` e conferido por SHA256 fixado no script.
  - `BUN=<caminho> bash scripts/binarios.sh <alvo>... | local` → um caminho `dist-bin/botai-<alvo>[.exe]` por linha no stdout; alvos `darwin-arm64 darwin-x64 linux-x64 linux-arm64 windows-x64 windows-arm64`; os `darwin-*` só no macOS (reassinados ad-hoc).
  - `make binario-local`.

- [ ] **Passo 7.1: Ver o alvo de fumaça falhar sem binário**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node scripts/fumaca.mjs --binario dist-bin/botai-darwin-arm64 > "${TMPDIR:-/tmp}/botai-f2-t7.log" 2>&1; echo EXIT=$?; /usr/bin/grep -m1 -E "ENOENT" "${TMPDIR:-/tmp}/botai-f2-t7.log"
```

Esperado: `EXIT=1` e `spawnSync dist-bin/botai-darwin-arm64 ENOENT`.

- [ ] **Passo 7.2: `.bun-version` e `bun-fixo.sh`**

`.bun-version` (raiz), uma linha:

```
1.4.2
```

`packages/core/scripts/bun-fixo.sh` (SHA256 copiados de `https://github.com/oven-sh/bun/releases/download/bun-v1.4.2/SHASUMS256.txt` em 2026-10-05):

```bash
#!/usr/bin/env bash
# Baixa uma vez o Bun do .bun-version para o cache do usuário, confere o SHA256 e imprime o caminho.
# Uso: BUN="$(bash scripts/bun-fixo.sh)" bash scripts/binarios.sh local
set -euo pipefail

# Os SHA256 são do SHASUMS256.txt do release bun-v<versão>; trocou o .bun-version, troque-os.
VERSAO_DOS_SHA256=1.4.2

raiz=$(cd "$(dirname "$0")/../../.." && pwd)
versao=$(tr -d '[:space:]' < "$raiz/.bun-version")
if [ "$versao" != "$VERSAO_DOS_SHA256" ]; then
  echo "bun-fixo: o .bun-version pede $versao, mas os SHA256 deste script são do $VERSAO_DOS_SHA256" >&2
  exit 1
fi

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) pacote=bun-darwin-aarch64 sha=90987a3a16d7db556d886ac3d551e7b6d3edf0a1cf43acaed622e8676be1d12f ;;
  Darwin-x86_64) pacote=bun-darwin-x64 sha=80520d7e17526308c9185d261679ac6d27798d3803a0e9f7ff9121ab8affb012 ;;
  Linux-x86_64) pacote=bun-linux-x64 sha=36368faef7527875d5ffa52e53cd48021741f2a83eb6208a8dd64068d422a913 ;;
  Linux-aarch64) pacote=bun-linux-aarch64 sha=54328bbc2d9c8e0c9f892c544d66c57a83b84139e34909e5ee81758f1ac8fda7 ;;
  *) echo "bun-fixo: sem Bun fixado para $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

pasta="${XDG_CACHE_HOME:-$HOME/.cache}/botai/bun-$versao"
bun="$pasta/$pacote/bun"
if [ ! -x "$bun" ]; then
  mkdir -p "$pasta"
  zip="$pasta/$pacote.zip"
  curl -fsSL --retry 3 -o "$zip" "https://github.com/oven-sh/bun/releases/download/bun-v$versao/$pacote.zip"
  if command -v sha256sum >/dev/null 2>&1; then
    obtido=$(sha256sum "$zip" | cut -d ' ' -f 1)
  else
    obtido=$(shasum -a 256 "$zip" | cut -d ' ' -f 1)
  fi
  if [ "$obtido" != "$sha" ]; then
    rm -f "$zip"
    echo "bun-fixo: o SHA256 de $pacote.zip não confere (esperado $sha, baixado $obtido)" >&2
    exit 1
  fi
  unzip -q -o "$zip" -d "$pasta"
  rm -f "$zip"
fi
echo "$bun"
```

- [ ] **Passo 7.3: `binarios.sh`**

`packages/core/scripts/binarios.sh`:

```bash
#!/usr/bin/env bash
# Compila o bin do pacote (o mesmo arquivo que vai ao npm) com o Bun do .bun-version.
# Uso: scripts/binarios.sh <alvo>... | local
#   alvos: darwin-arm64 darwin-x64 linux-x64 linux-arm64 windows-x64 windows-arm64; "local" = o desta máquina.
# Escreve no stdout o caminho de cada binário (dist-bin/botai-<alvo>[.exe]); o resto vai ao stderr.
set -euo pipefail

cd "$(dirname "$0")/.."
raiz=$(cd ../.. && pwd)
bun=${BUN:-bun}
esperada=$(tr -d '[:space:]' < "$raiz/.bun-version")
atual=$("$bun" --version)
if [ "$atual" != "$esperada" ]; then
  echo "binarios: o Bun é $atual e o .bun-version pede $esperada; rode com BUN=\"\$(bash scripts/bun-fixo.sh)\"" >&2
  exit 1
fi

entrada=$(node -p "require('./package.json').bin.botai")
if [ ! -f "$entrada" ]; then
  echo "binarios: $entrada não existe; rode o build antes" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo "uso: scripts/binarios.sh <alvo>... | local" >&2
  exit 2
fi

alvos=()
for alvo in "$@"; do
  if [ "$alvo" = local ]; then
    case "$(uname -s)-$(uname -m)" in
      Darwin-arm64) alvo=darwin-arm64 ;;
      Darwin-x86_64) alvo=darwin-x64 ;;
      Linux-x86_64) alvo=linux-x64 ;;
      Linux-aarch64) alvo=linux-arm64 ;;
      *) echo "binarios: esta máquina ($(uname -s)-$(uname -m)) não é um dos 6 alvos" >&2; exit 1 ;;
    esac
  fi
  alvos+=("$alvo")
done

mkdir -p dist-bin
for alvo in "${alvos[@]}"; do
  # x64 no -baseline: roda em CPU sem AVX2 (máquinas antigas, emuladores).
  case "$alvo" in
    darwin-arm64) alvo_bun="bun-darwin-arm64" ;;
    darwin-x64) alvo_bun="bun-darwin-x64-baseline" ;;
    linux-x64) alvo_bun="bun-linux-x64-baseline" ;;
    linux-arm64) alvo_bun="bun-linux-arm64" ;;
    windows-x64) alvo_bun="bun-windows-x64-baseline" ;;
    windows-arm64) alvo_bun="bun-windows-arm64" ;;
    *) echo "binarios: alvo desconhecido: $alvo" >&2; exit 2 ;;
  esac
  saida="dist-bin/botai-$alvo"
  [[ "$alvo" == windows-* ]] && saida="$saida.exe"
  "$bun" build --compile --minify --target="$alvo_bun" "$entrada" --outfile "$saida" >&2

  # O Bun 1.4.2 deixa inválida a assinatura do binário macOS de outra arquitetura (codesign -v
  # falha); a ad-hoc refeita aqui é válida nos dois.
  if [[ "$alvo" == darwin-* ]]; then
    if [ "$(uname -s)" != Darwin ]; then
      echo "binarios: $saida precisa da assinatura ad-hoc do codesign: compile os alvos darwin no macOS" >&2
      exit 1
    fi
    codesign --force --sign - "$saida" >&2
    codesign -v "$saida" >&2
  fi
  echo "$saida"
done
```

```bash
chmod +x /Users/piluvitu/PILUTECH/Botai/packages/core/scripts/bun-fixo.sh /Users/piluvitu/PILUTECH/Botai/packages/core/scripts/binarios.sh; shellcheck /Users/piluvitu/PILUTECH/Botai/packages/core/scripts/*.sh; echo SHELLCHECK=$?
```

Esperado: `SHELLCHECK=0`.

- [ ] **Passo 7.4: `make binario-local`**

No `Makefile` da raiz:

```make
.PHONY: binario-local

binario-local: ## Binário Bun desta máquina (Bun do .bun-version) + fumaça contra os dourados
	pnpm --filter @pilutech/botai-core run build
	cd packages/core && b=$$(BUN="$$(bash scripts/bun-fixo.sh)" bash scripts/binarios.sh local) && node scripts/fumaca.mjs --binario "$$b"
```

- [ ] **Passo 7.5: Ver o binário local passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai && make binario-local > "${TMPDIR:-/tmp}/botai-f2-t7.log" 2>&1; echo EXIT=$?; /usr/bin/grep -E "fumaça ok" "${TMPDIR:-/tmp}/botai-f2-t7.log"; /bin/ls -la packages/core/dist-bin; codesign -v packages/core/dist-bin/botai-darwin-arm64; echo CODESIGN=$?
```

Esperado: `EXIT=0`, `fumaça ok: dist-bin/botai-darwin-arm64 (<n> dourados, motor <versão>)`, o binário com uns 62 MB e `CODESIGN=0`. O Bun 1.3.14 do Homebrew da máquina **não** é usado (o `binarios.sh` recusa versão diferente do `.bun-version`).

Prova extra dos alvos cruzados nesta máquina (não vai para o commit; o `dist-bin` está no `.gitignore`):

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && BUN="$(bash scripts/bun-fixo.sh)" bash scripts/binarios.sh darwin-x64 linux-x64 windows-x64 windows-arm64 > "${TMPDIR:-/tmp}/botai-f2-t7b.log"; echo EXIT=$?; /bin/cat "${TMPDIR:-/tmp}/botai-f2-t7b.log"; arch -x86_64 dist-bin/botai-darwin-x64 pessoa --semente 42 --hoje 2026-10-05 > /dev/null; echo ROSETTA=$?
```

Esperado: `EXIT=0`, as quatro linhas `dist-bin/botai-darwin-x64`, `dist-bin/botai-linux-x64`, `dist-bin/botai-windows-x64.exe`, `dist-bin/botai-windows-arm64.exe` (o Bun 1.4.2 compila `bun-windows-arm64`: conferido em 2026-10-05, runtime `bun-windows-aarch64-v1.4.2`), e `ROSETTA=0` (se o Rosetta 2 estiver instalado; sem ele, `arch` falha com "Bad CPU type" e isso não é defeito do binário). O Bun baixa o runtime de cada alvo cruzado na hora de compilar: precisa de rede.

- [ ] **Passo 7.6: Job `binario` no `ci.yml`**

No mesmo nível do job `imagem`, com as mesmas linhas `uses:` e a mesma `node-version` do job `core`:

```yaml
binario:
  name: Binário Bun linux-x64 (dourados + serve)
  runs-on: ubuntu-24.04
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
      with:
        persist-credentials: false

    - uses: pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4.3.0

    - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
      with:
        node-version: '22'
        cache: pnpm

    - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
      with:
        bun-version-file: .bun-version

    - name: Instalar dependências
      run: pnpm install --frozen-lockfile

    - name: Build
      run: pnpm --filter @pilutech/botai-core run build

    - name: Compilar linux-x64
      working-directory: packages/core
      run: bash scripts/binarios.sh linux-x64

    - name: Fumaça do binário
      working-directory: packages/core
      run: node scripts/fumaca.mjs --binario dist-bin/botai-linux-x64
```

```bash
cd /Users/piluvitu/PILUTECH/Botai && actionlint .github/workflows/ci.yml; echo ACTIONLINT=$?; node --test scripts/salvaguardas.test.mjs > "${TMPDIR:-/tmp}/botai-f2-salvaguardas.log" 2>&1; echo SALVAGUARDAS=$?
```

Esperado: `ACTIONLINT=0` e `SALVAGUARDAS=0` (o `oven-sh/setup-bun` também vai por SHA).

- [ ] **Passo 7.7: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add .bun-version packages/core/scripts/bun-fixo.sh packages/core/scripts/binarios.sh Makefile .github/workflows/ci.yml && /usr/bin/git commit -m "feat(core): binários Bun com versão fixada e fumaça"; echo EXIT=$?
```

---

### Tarefa 8: Workflow `core-distribuicao.yml`

**Files:**

- Create: `.github/workflows/core-distribuicao.yml`
- Modify (só se faltar `--latest=false`): os outros workflows que criam GitHub Release

**Interfaces:**

- Consumes: `tarball` (Tarefa 6), `binarios.sh` (Tarefa 7), `fumaca.mjs` e `fumaca-imagem.sh` (Tarefa 6), `install.sh` (Tarefa 5), `Dockerfile` (Tarefa 6).
- Produces: na tag `core-v<versão>`: imagem `ghcr.io/piluvitu/botai:<versão>` e `:latest` (amd64 + arm64); GitHub Release da tag com os 6 binários, `SHA256SUMS` e `install.sh`, marcado como **Latest** do repo (o `install.sh` sem `BOTAI_VERSAO` baixa de `releases/latest`). No PR e no `workflow_dispatch`: tudo menos as duas publicações, mais o actionlint.

- [ ] **Passo 8.1: Ver o actionlint falhar sem o workflow**

```bash
cd /Users/piluvitu/PILUTECH/Botai && actionlint .github/workflows/core-distribuicao.yml; echo EXIT=$?
```

Esperado: `could not read ".github/workflows/core-distribuicao.yml"` e `EXIT=3` (no actionlint 1.7.12, 3 é erro fatal, como arquivo que não existe; 1 é problema achado num arquivo lido).

- [ ] **Passo 8.2: Escrever o workflow**

`.github/workflows/core-distribuicao.yml`:

```yaml
name: Core Distribuição

# Tag core-v*: binários Bun dos 6 alvos + SHA256SUMS + install.sh no GitHub Release e a
# imagem ghcr.io/piluvitu/botai. PR e dispatch rodam tudo, menos as duas publicações.
on:
  push:
    tags: ['core-v*']
  pull_request:
    branches: [main]
    paths:
      - 'packages/core/**'
      - '.bun-version'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - '.github/workflows/core-distribuicao.yml'
  workflow_dispatch:

concurrency:
  group: core-distribuicao-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

jobs:
  pacote:
    name: Core (lint, testes, build e tarball do npm)
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

      - name: Instalar dependências
        run: pnpm install --frozen-lockfile

      - name: Versão (packages/core/package.json)
        id: versao
        run: echo "versao=$(node -p "require('./packages/core/package.json').version")" >> "$GITHUB_OUTPUT"

      - name: Tag = core-v<versão>, num commit da main
        if: github.event_name == 'push'
        env:
          VERSAO: ${{ steps.versao.outputs.versao }}
        run: |
          set -euo pipefail
          if [ "$GITHUB_REF_NAME" != "core-v$VERSAO" ]; then
            echo "::error::a tag $GITHUB_REF_NAME não bate com a versão $VERSAO de packages/core/package.json"
            exit 1
          fi
          if ! git merge-base --is-ancestor "$GITHUB_SHA" origin/main; then
            echo "::error::o commit da tag $GITHUB_REF_NAME não está na main"
            exit 1
          fi

      - name: Lint (tsc + ShellCheck)
        run: pnpm --filter @pilutech/botai-core run lint

      - name: Testes (Jest)
        run: pnpm --filter @pilutech/botai-core run test

      - name: Build e tarball do npm (a imagem instala exatamente ele)
        run: pnpm --filter @pilutech/botai-core run tarball

      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: core-pacote
          path: |
            packages/core/dist/
            packages/core/pacote/
          if-no-files-found: error
          retention-days: 7

  binarios:
    name: Binários Bun (6 alvos; os do macOS assinados ad-hoc)
    needs: pacote
    runs-on: macos-15
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: core-pacote
          path: packages/core

      - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0
        with:
          bun-version-file: .bun-version

      - name: Compilar os 6 alvos
        working-directory: packages/core
        run: bash scripts/binarios.sh darwin-arm64 darwin-x64 linux-x64 linux-arm64 windows-x64 windows-arm64

      - name: SHA256SUMS
        working-directory: packages/core/dist-bin
        run: |
          shasum -a 256 botai-* > SHA256SUMS
          cat SHA256SUMS

      - uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: core-binarios
          path: packages/core/dist-bin/
          if-no-files-found: error
          retention-days: 7

  fumaca-binarios:
    name: Binário ${{ matrix.alvo }} no próprio sistema
    needs: binarios
    strategy:
      fail-fast: false
      matrix:
        include:
          - { alvo: linux-x64, runner: ubuntu-24.04, arquivo: botai-linux-x64 }
          - {
              alvo: linux-arm64,
              runner: ubuntu-24.04-arm,
              arquivo: botai-linux-arm64,
            }
          - {
              alvo: darwin-arm64,
              runner: macos-15,
              arquivo: botai-darwin-arm64,
            }
          - {
              alvo: darwin-x64,
              runner: macos-15-intel,
              arquivo: botai-darwin-x64,
            }
          - {
              alvo: windows-x64,
              runner: windows-2025,
              arquivo: botai-windows-x64.exe,
            }
          - {
              alvo: windows-arm64,
              runner: windows-11-arm,
              arquivo: botai-windows-arm64.exe,
            }
    runs-on: ${{ matrix.runner }}
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: core-binarios
          path: packages/core/dist-bin

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'

      - name: Permissão de execução (o artifact não guarda o bit)
        if: runner.os != 'Windows'
        run: chmod +x "packages/core/dist-bin/${{ matrix.arquivo }}"

      - name: Assinatura ad-hoc válida (macOS)
        if: runner.os == 'macOS'
        run: codesign -v "packages/core/dist-bin/${{ matrix.arquivo }}"

      - name: SHA256, dourados, serve e SIGTERM
        working-directory: packages/core
        run: node scripts/fumaca.mjs --binario "dist-bin/${{ matrix.arquivo }}"

  imagem:
    name: Imagem (fumaça e push no GHCR)
    needs: [pacote, fumaca-binarios]
    if: github.event_name == 'push'
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          name: core-pacote
          path: packages/core

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'

      - uses: docker/setup-qemu-action@99012661954931238ded8c8b007157a8430204e1 # v4.4.0

      - uses: docker/setup-buildx-action@f87e5991a6d7451dcb8d9637bfbc97413f497069 # v4.4.1

      - name: Build amd64 para a fumaça
        uses: docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0
        with:
          context: packages/core
          platforms: linux/amd64
          load: true
          tags: botai:fumaca

      - name: Fumaça da imagem (HEALTHCHECK, dourados, usuário, SIGTERM)
        working-directory: packages/core
        run: bash scripts/fumaca-imagem.sh botai:fumaca

      - uses: docker/login-action@dbcb813823bdd20940b903addbd779551569679f # v4.6.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Push de ghcr.io/piluvitu/botai (versão e latest; amd64 e arm64)
        uses: docker/build-push-action@c3c9e263c25d99ce0380d002d59b67737d91b0dc # v7.4.0
        with:
          context: packages/core
          platforms: linux/amd64,linux/arm64
          push: true
          tags: |
            ghcr.io/piluvitu/botai:${{ needs.pacote.outputs.versao }}
            ghcr.io/piluvitu/botai:latest

  # A imagem publicada como service de um job, do jeito que um projeto de outra linguagem a usaria.
  imagem-publicada:
    name: Imagem publicada como service (projeto de teste)
    needs: [pacote, imagem]
    if: github.event_name == 'push'
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    permissions:
      contents: read
      packages: read
    services:
      botai:
        image: ghcr.io/piluvitu/botai:${{ needs.pacote.outputs.versao }}
        credentials:
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
        ports:
          - 8790:8790
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: '22'

      - name: Fumaça contra o service
        working-directory: packages/core
        run: node scripts/fumaca.mjs --url http://127.0.0.1:8790

  release:
    name: GitHub Release (binários, SHA256SUMS e install.sh)
    needs: [pacote, imagem-publicada]
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
          name: core-binarios
          path: dist-bin

      - name: Notas (commits do core desde a tag core-v anterior)
        env:
          VERSAO: ${{ needs.pacote.outputs.versao }}
        run: |
          set -euo pipefail
          anterior=$(git describe --tags --abbrev=0 --match 'core-v*' "$GITHUB_REF_NAME^" 2>/dev/null || true)
          instalar="curl -fsSL https://github.com/PiluVitu/Botai/releases/download/$GITHUB_REF_NAME/install.sh | BOTAI_VERSAO=$VERSAO sh"
          {
            echo "## @pilutech/botai-core $VERSAO"
            echo
            echo "Binário desta versão: \`$instalar\`"
            echo
            echo "Imagem: \`docker run --rm -p 8790:8790 ghcr.io/piluvitu/botai:$VERSAO\`"
            echo
            git log --no-merges --format='- %s (%h)' "${anterior:+$anterior..}$GITHUB_REF_NAME" -- packages/core
          } > notas.md
          cat notas.md

      # O release pode já existir (criado por outro workflow da mesma tag): aí só anexa.
      - name: Criar o release ou anexar a ele
        env:
          GH_TOKEN: ${{ github.token }}
          VERSAO: ${{ needs.pacote.outputs.versao }}
        run: |
          set -euo pipefail
          arquivos=(dist-bin/botai-* dist-bin/SHA256SUMS packages/core/scripts/install.sh)
          if gh release view "$GITHUB_REF_NAME" >/dev/null 2>&1; then
            gh release upload "$GITHUB_REF_NAME" "${arquivos[@]}" --clobber
            gh release edit "$GITHUB_REF_NAME" --latest
          else
            gh release create "$GITHUB_REF_NAME" "${arquivos[@]}" \
              --verify-tag \
              --title "botai-core $VERSAO" \
              --notes-file notas.md \
              --latest
          fi

  actionlint:
    name: actionlint dos workflows
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
        with:
          persist-credentials: false

      - name: actionlint (imagem fixada por digest)
        run: >-
          docker run --rm -v "$GITHUB_WORKSPACE:/repo" --workdir /repo
          rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667
          -color
```

- [ ] **Passo 8.3: Só o core é o "Latest"**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/grep -n -A8 "gh release create" .github/workflows/*.yml; echo EXIT=$?
```

O `-A8` mostra o comando inteiro: no `botai-release.yml` da fase 0 ele quebra em várias linhas com `\`, e o `--latest=false` fica numa linha de baixo. Todo comando que não for do `core-distribuicao.yml` (a do `botai-release.yml` da extensão, a do `publicar-core.yml` ou a do `publicar-playwright.yml`, se criarem release) precisa de `--latest=false` no mesmo comando; o `botai-release.yml` veio do monorepo com ele. Se faltar em algum, acrescente-o e inclua o arquivo no commit. Sem isso, um release da extensão vira o "Latest" e o `install.sh` padrão recebe 404.

- [ ] **Passo 8.4: actionlint e salvaguardas passam**

```bash
cd /Users/piluvitu/PILUTECH/Botai && actionlint; echo ACTIONLINT=$?; docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667 -color; echo ACTIONLINT_IMAGEM=$?; node --test scripts/salvaguardas.test.mjs > "${TMPDIR:-/tmp}/botai-f2-salvaguardas.log" 2>&1; echo SALVAGUARDAS=$?; /usr/bin/grep -c "npm publish" .github/workflows/core-distribuicao.yml
```

Esperado: `ACTIONLINT=0` e `ACTIONLINT_IMAGEM=0` (a imagem é a mesma do job; no protótipo de 2026-10-05, o actionlint 1.7.12 aceitou os rótulos `ubuntu-24.04-arm`, `macos-15-intel`, `windows-2025` e `windows-11-arm`), `SALVAGUARDAS=0` (todo `uses:` do workflow novo por SHA) e `0` na contagem: a publicação no npm é só do `publicar-core.yml`, e o `core-distribuicao.yml` não tem `id-token: write`.

- [ ] **Passo 8.5: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add .github/workflows/core-distribuicao.yml && /usr/bin/git add -u .github/workflows && /usr/bin/git commit -m "ci(core): workflow de distribuição (binários, imagem e release)"; echo EXIT=$?
```

---

### Tarefa 9: Documentação, versão 0.3.0 e verificação final

**Files:**

- Modify: `packages/core/package.json` (`version` 0.3.0), `packages/core/src/versao.ts` (regravado), `packages/core/README.md`, `packages/core/CLAUDE.md`, `CLAUDE.md` (raiz), `README.md` (raiz)

**Interfaces:**

- Consumes: tudo das Tarefas 1–8; `scripts/gerar-versao.mjs` (fase 1).
- Produces: `MOTOR` = `'0.3.0'`; a documentação de uso e de manutenção; a tag local `core-v0.3.0` no merge (Passo 9.7).

- [ ] **Passo 9.1: Versão**

O `MOTOR` sai de `src/versao.ts`, que `scripts/gerar-versao.mjs` (fase 1) grava a partir do `package.json`; o `lint` barra o arquivo fora de dia. O mesmo caminho que a fase 3 usa para a 0.4.0:

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && "$(command -v pnpm)" version 0.3.0 --no-git-tag-version && node scripts/gerar-versao.mjs && /bin/cat src/versao.ts; echo EXIT=$?
```

Esperado: `export const MOTOR: string = '0.3.0'` e `EXIT=0`.

Versões antigas escritas à mão:

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/grep -rn "0\.2\.0" packages/core README.md CLAUDE.md --include=*.ts --include=*.json --include=*.mjs --include=*.md --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=dourado; echo EXIT=$?
```

Classifique cada linha: (a) exemplo de uso que mostra a versão atual (ex.: `npx --yes @pilutech/botai-core@0.2.0` no README do core) → troque para `0.3.0`; (b) histórico (ex.: a seção "Fase 1 (0.2.0)" do `CLAUDE.md` do core) → deixe; (c) teste que fixa o `MOTOR` em texto → troque para ler do `package.json`. Rode o comando de novo e confira que só sobraram linhas do tipo (b).

- [ ] **Passo 9.2: README do pacote (página do npm)**

Em `packages/core/README.md`, depois da seção da CLI, acrescente:

````markdown
## Servidor HTTP (`botai serve`)

Para qualquer linguagem que fale HTTP. Escuta só em `127.0.0.1` por padrão.

```bash
npx @pilutech/botai-core serve                  # http://127.0.0.1:8790
npx @pilutech/botai-core serve --porta 9000 --host 0.0.0.0
```

| Rota           | Parâmetros (query)                                                                                                                                                                                                                      | Resposta                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `GET /pessoa`  | `semente`, `hoje` (`AAAA-MM-DD`), `uf`, `dominioEmail`                                                                                                                                                                                  | `{ formato, motor, semente, hoje, pessoa }` |
| `GET /pessoas` | os de `/pessoa` + `n` (1 a 10 000, obrigatório), `formato` (`json`, `ndjson`, `csv`, `sql`), `dialeto` (`postgres`, `mysql`, `sqlite`; só no `sql`), `tabela` (só no `sql`; aceita `esquema.tabela`), `campos` (só no `csv` e no `sql`) | o mesmo texto de `botai pessoas`            |
| `GET /saude`   | nenhum                                                                                                                                                                                                                                  | `{ ok: true, formato, motor }`              |

- Os nomes são os das flags da CLI em camelCase, e os valores valem o mesmo que na CLI (`uf` e `dominioEmail` em qualquer caixa; semente de até 256 caracteres). Parâmetro desconhecido, repetido ou vazio, ou valor inválido, dá **400** com `{ "erro": "…" }`, que diz qual parâmetro (e, no desconhecido, lista os aceitos).
- Sem `semente`, o servidor sorteia uma e a devolve no envelope; sem `hoje`, usa o dia de São Paulo, então a mesma semente gera outra pessoa no dia seguinte. Para reproduzir, passe os dois.
- `Content-Type`: `application/json`, `application/x-ndjson`, `text/csv; header=present` ou `application/sql`, todos com `charset=utf-8`.
- `Ctrl+C` ou `SIGTERM` encerram na hora, com código 0.

```bash
curl 'http://127.0.0.1:8790/pessoa?semente=42&hoje=2026-10-05'
curl 'http://127.0.0.1:8790/pessoas?n=100&semente=seed&hoje=2026-10-05&formato=sql&dialeto=postgres' > seed.sql
```

Em Python, sem pacote nenhum:

```python
import json, urllib.request
with urllib.request.urlopen("http://127.0.0.1:8790/pessoa?semente=42&hoje=2026-10-05") as r:
    pessoa = json.load(r)["pessoa"]
```

## Docker

```bash
docker run --rm -p 8790:8790 ghcr.io/piluvitu/botai:0.3.0          # o servidor
docker run --rm ghcr.io/piluvitu/botai:0.3.0 pessoa --semente 42    # a CLI
```

A imagem roda como usuário sem privilégio, escuta em `0.0.0.0:8790` e tem `HEALTHCHECK` em `/saude`. Para outra porta, mapeie com `-p 9000:8790` em vez de mudar a interna (o `HEALTHCHECK` olha a 8790).

No GitHub Actions, como service:

```yaml
services:
  botai:
    image: ghcr.io/piluvitu/botai:0.3.0
    ports: ['8790:8790']
```

No docker compose:

```yaml
services:
  botai:
    image: ghcr.io/piluvitu/botai:0.3.0
    ports: ['8790:8790']
```

## Binário sem Node

Binários para macOS (arm64 e x64), Linux (x64 e arm64, glibc) e Windows (x64 e arm64) em cada [release `core-v*`](https://github.com/PiluVitu/Botai/releases), com `SHA256SUMS`. Uns 60 a 90 MB cada: levam o runtime do Bun dentro.

```bash
curl -fsSL https://github.com/PiluVitu/Botai/releases/latest/download/install.sh | sh
```

- Detecta o sistema e a arquitetura (num terminal sob Rosetta, instala o arm64), confere o SHA256 e instala em `~/.local/bin/botai`.
- `BOTAI_VERSAO=0.3.0` fixa a versão; `BOTAI_DESTINO=/outra/pasta` muda o destino.
- Alpine e outros Linux com musl não têm binário: use a imagem ou o npm.

Conferir à mão: `shasum -a 256 -c --ignore-missing SHA256SUMS` (macOS) ou `sha256sum -c --ignore-missing SHA256SUMS` (Linux); no Windows, `Get-FileHash .\botai-windows-x64.exe -Algorithm SHA256` (ou o `botai-windows-arm64.exe`) e compare com a linha do `SHA256SUMS`.

### Binário sem assinatura: o aviso do sistema

Os binários não são assinados por um desenvolvedor identificado (só a assinatura ad-hoc no macOS).

- **macOS:** o `curl` (e o `install.sh`) não marca o arquivo com quarentena, e ele roda sem aviso. Baixado pelo navegador, o macOS bloqueia na primeira execução. Libere com `xattr -d com.apple.quarantine ./botai-darwin-arm64` (ou em Ajustes do Sistema › Privacidade e Segurança › "Abrir Mesmo Assim", que fica disponível por cerca de uma hora depois da tentativa: https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unknown-developer-mh40616/mac).
- **Windows:** o SmartScreen mostra "O Windows protegeu o computador" ("Windows protected your PC"): clique em "Mais informações" e em "Executar assim mesmo". Ou, no PowerShell, `Unblock-File .\botai-windows-x64.exe`, que tira a marca de arquivo baixado da internet (https://learn.microsoft.com/powershell/module/microsoft.powershell.utility/unblock-file). Com o Controle Inteligente de Aplicativos ligado, o Windows bloqueia binário sem assinatura de qualquer origem: use o npm ou a imagem.
````

- [ ] **Passo 9.3: `CLAUDE.md` do core**

Em `packages/core/CLAUDE.md`, acrescente a seção:

```markdown
## Servidor, imagem e binários (fase 2, 0.3.0)

Plano: `docs/superpowers/plans/2026-10-05-botai-fase2-servidor.md`.

- **`/servidor`** (`src/servidor/`): `node:http`, sem framework. `responder(metodo, alvo)` é puro (`consulta.ts` lê, `rotas.ts` responde); `criarServidor()` (`index.ts`) só o liga ao HTTP. A raiz do pacote não importa `/servidor`: a raiz roda no navegador da extensão. A trava `src/portabilidade.test.ts` aceita API de Node só em `src/bin/` e em `src/servidor/index.ts`; por isso o build compila com `"types": ["node"]` (`tsconfig.build.json`) sem que o motor possa usá-los.
- **Uma validação só:** a consulta passa pelos leitores da CLI (`resolverOpcoes`, `lerUF`, `lerDominioEmail`, `lerCampos`, `lerDialeto`, `lerTabela`), e `mensagemDeUso` transforma `ErroDeOpcao`, `ErroDoPlano` e `ErroDeConsulta` no texto do 400. Só do HTTP: parâmetro desconhecido, repetido ou vazio é 400 (ignorar daria a pessoa padrão em silêncio para quem errou o nome, `dominio-email` em vez de `dominioEmail`) e `n` vai de 1 a 10 000 (a CLI vai de 0 a 100 000).
- **`textoDoLote`** (`src/lote.ts`): o texto de `botai pessoas` em json, ndjson, csv e sql, parte a parte. A CLI escreve as partes no stdout e o servidor as junta no corpo; mudar um formato muda os dois. Ele valida o `n` antes de devolver o gerador, então nada é escrito antes de um erro.
- **`botai serve`** (`src/bin/serve.ts`): o bin (`src/bin/botai.ts`) despacha `serve` antes do `executar`, que é síncrono e não conhece o comando. As flags passam pelo `lerArgumentos` da CLI (`--porta 9000` e `--porta=9000` valem; erro de uso sai com 2).
- **Encerramento:** `close()` + `closeIdleConnections()` na hora e `closeAllConnections()` depois de 2 s. O `serve` trata SIGINT e SIGTERM (sai com 0): na imagem o Node é o PID 1 e não tem tratador padrão, e sem isso o `docker stop` esperava 10 s e matava com 137.
- **A linha `botai serve: ouvindo em <url>`** no stderr é contrato: `serve.test.ts` e `scripts/fumaca.mjs` acham a URL por ela (com `--porta 0`).
- **Imagem** (`Dockerfile`): instala o tarball do npm (`pnpm run tarball` → `pacote/botai-core.tgz`), o mesmo arquivo do `npm publish`; `--offline` e `docker build --network=none` passam porque o pacote não tem dependência. Base `node:24.21.0-alpine3.24` por digest (o Dependabot `docker` sobe tag e digest), `USER node`, `HEALTHCHECK --start-interval` (Docker ≥ 25), `ENTRYPOINT ["botai"]` e `CMD ["serve", "--host", "0.0.0.0", "--porta", "8790"]`. O `.dockerignore` deixa só o tarball no contexto (sem ele iriam `node_modules` e os ~400 MB do `dist-bin`). Tamanho medido no protótipo de 2026-10-05: 240 MB no `docker image ls` do Docker 29 com o containerd, quase tudo o binário `node` (122 MB).
- **GHCR:** o primeiro push cria o pacote **privado** (padrão do GitHub); o dono o torna público uma vez. Só o job `imagem` do `core-distribuicao.yml` tem `packages: write`.
- **Binários:** Bun do `.bun-version` (1.4.2). Local: `scripts/bun-fixo.sh` baixa para o cache e confere SHA256 fixados no script (trocou a versão, troque os SHA256); o `binarios.sh` recusa outro Bun. No CI, `oven-sh/setup-bun` com `bun-version-file`. Medido com o 1.4.2 em 2026-10-05: alvos x64 e x64-baseline geram binários diferentes (usamos o baseline, que roda sem AVX2); o binário macOS de outra arquitetura sai com assinatura inválida, por isso os darwin são compilados no runner `macos-15` e reassinados ad-hoc (`codesign --force --sign -`); tamanhos: darwin-arm64 ~62 MB, darwin-x64 ~69 MB, linux ~81 MB, windows-x64 ~86 MB, windows-arm64 ~74 MB (este medido com um script mínimo, não com o `botai`); compilar alvo cruzado baixa o runtime daquele alvo (precisa de rede).
- **`install.sh`:** POSIX sh (roda no dash), `BOTAI_VERSAO`, `BOTAI_DESTINO`, `BOTAI_RELEASES` (raiz dos releases, para o teste). Baixa de `releases/latest`, então o release do core tem de ser o "Latest" do repo: todo outro workflow que cria release usa `--latest=false`. Teste: `scripts/install.test.ts` (release falso num `node:http` e `uname`/`sysctl`/`ldd` falsos no PATH); `spawn` assíncrono, porque o `spawnSync` travaria o servidor do release no mesmo processo.
- **Fumaça** (`scripts/fumaca.mjs`): `.mjs` sem dependência, fora do Jest de propósito: roda nos 6 runners do release (Windows incluso) só com `setup-node`, sem `pnpm install`. Confere SHA256, os dourados pela CLI e pelo HTTP, `/saude` e o SIGTERM (exceto no Windows, onde o kill não entrega sinal).
- **Workflow `core-distribuicao.yml`:** `pacote` → `binarios` (macOS) → `fumaca-binarios` (ubuntu-24.04, ubuntu-24.04-arm, macos-15, macos-15-intel, windows-2025, windows-11-arm) → `imagem` (fumaça amd64, push amd64+arm64) → `imagem-publicada` (a imagem do GHCR como `services:`, como um projeto de teste a usaria) → `release` (cria o release da tag, ou anexa a um que já exista, e marca `--latest`). No PR e no dispatch, só até `fumaca-binarios`, mais o actionlint.

| Comando                                          | O quê                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `make imagem`                                    | tarball + `docker build --network=none -t botai:local`                                     |
| `make fumaca-imagem`                             | sobe a `botai:local`, espera o `HEALTHCHECK`, confere contra os dourados e o `docker stop` |
| `make binario-local`                             | build + binário Bun desta máquina + fumaça                                                 |
| `pnpm --filter @pilutech/botai-core run tarball` | `pacote/botai-core.tgz`                                                                    |
| `bash packages/core/scripts/binarios.sh <alvo>…` | binários em `dist-bin/` (`BUN` = o do `bun-fixo.sh`)                                       |
```

Se o tamanho medido no Passo 6.5 for outro, escreva o medido no lugar dos 240 MB.

- [ ] **Passo 9.4: `CLAUDE.md` e `README.md` da raiz**

No `CLAUDE.md` da raiz do repo, na tabela de comandos, acrescente `make imagem`, `make fumaca-imagem` e `make binario-local` (descrições do Passo 9.3); na tabela de workflows, a linha:

```markdown
| `core-distribuicao.yml` | tag `core-v*`, PR que toca `packages/core/**`/`.bun-version`, dispatch | binários Bun (6 alvos) + matriz de fumaça em 6 runners; na tag, imagem `ghcr.io/piluvitu/botai` (único job com `packages: write`), a imagem publicada como service e o GitHub Release com binários, `SHA256SUMS` e `install.sh` |
```

e, em `ci.yml`, os jobs `imagem` e `binario`. No `README.md` da raiz, na lista do topo (a dos itens **Site**, **Chrome e Edge** e **Biblioteca**, que a fase 0 escreveu), logo depois do item **Biblioteca**, o item: ``- **Servidor, imagem e binários:** `botai serve`, a imagem `ghcr.io/piluvitu/botai` e binários sem Node ([`packages/core/README.md`](./packages/core/README.md)).``

- [ ] **Passo 9.5: Verificação final ("pronto quando")**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && "$(command -v pnpm)" run lint > "${TMPDIR:-/tmp}/botai-f2-final-lint.log" 2>&1; echo LINT=$?; "$(command -v pnpm)" run test > "${TMPDIR:-/tmp}/botai-f2-final-test.log" 2>&1; echo TEST=$?; /usr/bin/grep -E "Tests:" "${TMPDIR:-/tmp}/botai-f2-final-test.log"
```

Esperado: `LINT=0` e `TEST=0` (servidor e serve respondem igual aos dourados no Jest; o `pacote.test.mjs` confere o tarball com `/servidor` e os `EXTRAS` desta fase).

```bash
cd /Users/piluvitu/PILUTECH/Botai && make fumaca-imagem > "${TMPDIR:-/tmp}/botai-f2-final-imagem.log" 2>&1; echo IMAGEM=$?; make binario-local > "${TMPDIR:-/tmp}/botai-f2-final-bin.log" 2>&1; echo BINARIO=$?; actionlint; echo ACTIONLINT=$?; /usr/bin/grep -h "fumaça ok" "${TMPDIR:-/tmp}/botai-f2-final-imagem.log" "${TMPDIR:-/tmp}/botai-f2-final-bin.log"
```

Esperado: `IMAGEM=0`, `BINARIO=0`, `ACTIONLINT=0` e as duas linhas `fumaça ok … motor 0.3.0`.

```bash
cd /Users/piluvitu/PILUTECH/Botai && "$(command -v pnpm)" install --frozen-lockfile > "${TMPDIR:-/tmp}/botai-f2-install.log" 2>&1; echo INSTALL=$?; "$(command -v pnpm)" dedupe --check > "${TMPDIR:-/tmp}/botai-f2-dedupe.log" 2>&1; echo DEDUPE=$?; /usr/bin/git diff --stat main -- pnpm-lock.yaml pnpm-workspace.yaml; echo EXIT=$?
```

Esperado: `INSTALL=0`, `DEDUPE=0` e nenhuma linha no `git diff` (esta fase não mexe em dependência).

```bash
cd /Users/piluvitu/PILUTECH/Botai && "$(command -v pnpm)" audit --audit-level high > "${TMPDIR:-/tmp}/botai-f2-audit.log" 2>&1; echo AUDIT=$?; node --test scripts/*.test.mjs > "${TMPDIR:-/tmp}/botai-f2-raiz.log" 2>&1; echo RAIZ=$?; "$(command -v pnpm)" -r run lint > "${TMPDIR:-/tmp}/botai-f2-r-lint.log" 2>&1; echo R_LINT=$?; "$(command -v pnpm)" -r run test > "${TMPDIR:-/tmp}/botai-f2-r-test.log" 2>&1; echo R_TEST=$?; /usr/bin/grep -h "Scope:" "${TMPDIR:-/tmp}/botai-f2-r-lint.log" "${TMPDIR:-/tmp}/botai-f2-r-test.log"
```

Esperado: `AUDIT=0`, `RAIZ=0` (salvaguardas e gate da raiz, que o `pnpm -r` não inclui), `R_LINT=0`, `R_TEST=0` e o `Scope:` com todos os workspaces (um workspace sem o script some em silêncio). Nada fora do core mudou, mas o `.gitignore`, o `Makefile` e os workflows são da raiz. Se o `pnpm audit` acusar algo, rode o mesmo comando na `main` para comparar: o que já existia antes desta fase vai para o relatório; o que esta fase trouxe bloqueia (e ela não trouxe dependência nenhuma).

- [ ] **Passo 9.6: Commit e merge na main local**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/package.json packages/core/src/versao.ts packages/core/README.md packages/core/CLAUDE.md CLAUDE.md README.md && /usr/bin/git add -u packages/core && /usr/bin/git commit -m "docs(core): servidor, imagem e binários; versão 0.3.0"; echo EXIT=$?
```

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git status --porcelain; /usr/bin/git switch main && /usr/bin/git merge --ff-only feat/servidor; echo EXIT=$?; /usr/bin/git log --oneline -10
```

Esperado: árvore limpa, `EXIT=0` e os 9 commits da fase (um por tarefa) no topo da `main`. **Sem push.**

- [ ] **Passo 9.7: Tag local `core-v0.3.0` (sem push)**

A tag nasce aqui, no merge, porque a fase 3 segue antes de qualquer push e a `main` sai da 0.3.0 (contrato, "Branches e tags"). O dono só faz o push dela; ninguém a recria noutro commit.

```bash
cd /Users/piluvitu/PILUTECH/Botai && test "$(/usr/bin/git branch --show-current)" = main && test "$(node -p "require('./packages/core/package.json').version")" = 0.3.0 && test "$(/usr/bin/git tag -l core-v0.2.0)" = core-v0.2.0 && test -z "$(/usr/bin/git tag -l core-v0.3.0)" && /usr/bin/git tag -a core-v0.3.0 -m "@pilutech/botai-core 0.3.0" && /usr/bin/git tag -l 'core-v*'; echo EXIT=$?
```

Esperado: `core-v0.1.0`, `core-v0.2.0` e `core-v0.3.0`, `EXIT=0`. `EXIT≠0` sem a lista: um dos `test` falhou (fora da `main`, versão diferente de 0.3.0, sem a `core-v0.2.0` ou com a `core-v0.3.0` já criada); pare e reporte. A fase 3 (`docs/superpowers/plans/2026-10-05-botai-fase3-playwright.md`) parte desta `main`.

---

## Decisões deste plano além da spec e do contrato

Para quem revisa: o que a spec e o contrato não fixavam e este plano fixou.

1. **Uma regra de validação só:** o servidor lê os valores com os leitores da CLI (`resolverOpcoes`, `lerUF`, `lerDominioEmail`, `lerCampos`, `lerDialeto`, `lerTabela`) e responde 400 com `mensagemDeUso` (o `ErroDeOpcao` sai prefixado pelo nome do parâmetro, como a CLI prefixa pela flag). Só é do HTTP: parâmetro desconhecido, repetido ou vazio, `n` obrigatório de 1 a 10 000 e o `formato`.
2. **`textoDoLote` no lugar de um `formatarPessoas(envelope)`:** o ndjson da fase 1 leva a semente exata de cada pessoa (`S/i` ou `S/i/k`), que o `EnvelopeDasPessoas` não guarda; por isso o texto do lote sai do gerador `pessoasDoLote`, e a CLI e o servidor escrevem pela mesma função.
3. **`botai serve` em `src/bin/`:** a fase 1 deixou só `src/bin` falar com o processo e um `executar` síncrono; o bin despacha o `serve` antes dele. A trava de portabilidade ganha uma exceção, de um arquivo: `src/servidor/index.ts`.
4. **Tipos do Node no build** (`tsconfig.build.json`): o servidor precisa de `node:http`, `URL` e `console`; a trava de portabilidade, e não o tsconfig, é o que impede API de Node no motor.
5. **Binários:** alvos x64 no `-baseline` (CPU sem AVX2); os `darwin-*` compilados no runner `macos-15` e reassinados ad-hoc (`codesign --force --sign -`), porque o Bun 1.4.2 deixa inválida a assinatura do binário macOS de outra arquitetura. Ad-hoc não é assinatura de desenvolvedor: a spec ("sem assinatura") continua valendo, e o README documenta o Gatekeeper e o SmartScreen.
6. **Imagem a partir do tarball do `pnpm pack`:** o mesmo arquivo que vai ao npm, instalado com `--offline` num build com `--network=none`.
7. **Release do core é o "Latest" do repo:** o `install.sh` sem `BOTAI_VERSAO` baixa de `releases/latest`; todo outro workflow que cria release usa `--latest=false`.
8. **`botai serve` lê as flags pelo `lerArgumentos` da fase 1:** `--porta=9000`, opção repetida e argumento sobrando se comportam como nos outros comandos; o `ErroDeUso` vira `ErroDoServe` com código 2.
9. **Seis binários, não cinco:** a spec §6.4 pede x64 e arm64 nos três sistemas, e o contrato listava cinco (sem Windows arm64). O Bun 1.4.2 compila `bun-windows-arm64` (conferido em 2026-10-05) e o runner `windows-11-arm` é gratuito em repositório público; entra `botai-windows-arm64.exe`, acrescentado ao contrato.

---

## Passos do dono (fora das tarefas; nenhum agente faz)

Ordem do contrato ("Ordem de execução", passo 3): depois do C5 (a `main` com as fases 1 a 3 no GitHub) e do C8, e depois do ponto 9 (push da `core-v0.2.0` e a publicação da 0.2.0). As tags `core-v*` sobem da mais velha para a mais nova.

1. **Rodar a distribuição sem publicar**, para ver a matriz dos 6 alvos antes da tag (ponto 10 do contrato): `gh workflow run core-distribuicao.yml --repo PiluVitu/Botai --ref main` e `gh run watch --repo PiluVitu/Botai`. Os 6 `fumaca-binarios` têm de passar (critério da spec: "os binários rodam nos 3 sistemas"). A `main` já pode estar na 0.4.0 (fase 3): o que este passo prova são os runners e a matriz; a 0.3.0 em si é provada pelo run da tag. Repositório público: os runners `ubuntu-24.04-arm`, `macos-15-intel` e `windows-11-arm` entram sem custo.
2. **Push da tag `core-v0.3.0`**, criada no Passo 9.7 (nunca recrie no `HEAD`: a `main` já está numa versão mais nova): `/usr/bin/git -C /Users/piluvitu/PILUTECH/Botai push origin core-v0.3.0`. Dispara o `publicar-core.yml` (npm, atrás do environment `npm`, fluxo da fase 0) e o `core-distribuicao.yml` (binários, imagem, imagem publicada como service e o release).
3. **Aprovar a publicação no npm** no environment `npm` do `publicar-core.yml` (como na fase 1).
4. **Tornar pública a imagem** depois do primeiro push: GitHub → Packages → `botai` → Package settings → Change visibility → Public (o GHCR cria privado: "When you first publish a package, the default visibility is private", https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry). Confira sem login: `docker logout ghcr.io; docker pull ghcr.io/piluvitu/botai:0.3.0`.
5. **Conferir o instalador do release de verdade:** `curl -fsSL https://github.com/PiluVitu/Botai/releases/latest/download/install.sh | sh` e `~/.local/bin/botai pessoa --semente 42 --hoje 2026-10-05`.
6. **Monorepo:** nada a fazer. A 0.3.0 só acrescenta `/servidor` e o `botai serve`; o `/tools` do `apps/web` usa `/cpf` e `/cnpj`, que não mudaram.
