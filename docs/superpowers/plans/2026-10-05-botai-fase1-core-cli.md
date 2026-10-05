# Botaí fase 1: semente única, lote sem repetição, contrato e CLI (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `@pilutech/botai-core` 0.2.0 com a API amigável na raiz (semente única em TS puro, `gerarPessoa(opcoes)`, `gerarPessoas(n)` sem e-mail/CPF/CNPJ repetido), envelope versionado com JSON Schema, arquivos dourados, visão plana com CSV e SQL, e a CLI `botai`, tudo provado por Jest contra o build.

**Architecture:** O motor continua TS puro em `packages/core/src` (sem API de Node nem DOM; uma trava de teste garante). Uma função só, `rngDeSemente`, transforma número ou texto em `sfc32` (cyrb128 sobre UTF-8 NFC) e serve à biblioteca, à CLI e, nas fases seguintes, ao servidor e ao Playwright. A CLI é um `executar(argv, saida)` puro em `src/cli/`, e só `src/bin/botai.ts` fala com o processo; os testes rodam o `dist/bin/botai.js` de verdade contra `dourado/v1`.

**Tech Stack:** TypeScript 5.9, Jest 30 + ts-jest (core), Ajv 8.20 (só em teste, para o JSON Schema 2020-12), `node:sqlite` (só em teste), Vitest 4 + Playwright 1.59 (extensão, sem mudança de ferramenta), pnpm 11.

**Spec:** `docs/superpowers/specs/2026-10-05-botai-repo-proprio-design.md` (§6.1, §6.2, §6.3, §8 e §9, linha da fase 1). **Contrato (nomes obrigatórios):** `docs/superpowers/plans/2026-10-05-botai-repo-proprio-contrato.md`. Os dois estão no monorepo e, depois da fase 0, também no repo novo em `docs/superpowers/`.

**Onde:** repo novo `/Users/piluvitu/PILUTECH/Botai`, branch `feat/core-cli` (sai da `main` deixada pela fase 0). Todo caminho de arquivo deste plano é relativo a esse repo, salvo quando escrito por extenso.

**Origem do código:** escrito e provado num protótipo fora do repo, montado a partir de `packages/tools/src` do monorepo com a estrutura de `packages/core`: `tsc --noEmit` limpo, build `tsc` com `module: nodenext`, e **16 suítes / 243 testes Jest verdes**, inclusive o bin do build contra os dourados, o `EPIPE` e o `npx` de um tarball local gerando as 1000 pessoas em SQL iguais ao dourado. Os valores fixos dos testes (sementes, CPFs, e-mails) saíram dessa execução.

---

## Global Constraints

- Repo `/Users/piluvitu/PILUTECH/Botai`; branch `feat/core-cli`; ao fim da fase, `git merge --ff-only` na `main` local (contrato, "Branches e tags").
- **Nunca** `git push`, `npm publish`/`pnpm publish`, criar repo no GitHub ou mexer na Vercel. Isso é do dono (seção "Passos do dono").
- Versão do pacote: `@pilutech/botai-core` **0.2.0** (contrato, "Versões iniciais").
- Raiz `@pilutech/botai-core` com os nomes do contrato: `Semente`, `OpcoesDaPessoa { semente?, hoje?, uf?, dominioEmail? }`, `DOMINIO_EMAIL_PADRAO = 'tuamaeaquelaursa.com'`, `FORMATO = 1`, `MOTOR: string`, `rngDeSemente(semente): Prng` (TS puro; `rngDeSemente(42) ≡ rngDeSemente('42')`), `sementeAleatoria(): string`, `hojeEmSaoPaulo(agora?): string`, `gerarPessoa(opcoes?)`, `gerarPessoas(n, opcoes?)`, `EnvelopeDaPessoa`, `EnvelopeDasPessoas`.
- `/pessoa`: `gerarPessoa(rng, hojeISO)` passa a se chamar `montarPessoa(rng, hojeISO, opcoes?)`; para o mesmo `rng` a pessoa não muda (a pessoa dourada de `pessoa.test.ts`, `sfc32(1,2,3,4)` em `2026-10-01`, fica igual); a extensão é ajustada nesta fase.
- Lote: a pessoa `i` (base 0) usa a semente `` `${S}/${i}` ``; se `email.endereco`, `cpf` ou `empresa.cnpj` repetir um anterior do lote, ela é sorteada de novo com `` `${S}/${i}/${k}` ``, k = 2, 3… (spec §6.2, contrato).
- Toda saída JSON é `{ formato, motor, semente, hoje, pessoa }` (ou `pessoas`); `semente` sempre texto (`String(semente)`); JSON Schema publicado no pacote (spec §6.2).
- Mudar a pessoa que uma semente gera é versão major (spec §6.2); na série 0.x isso é a minor.
- Arquivos dourados em `packages/core/dourado/v1/*.json`, cada um um `EnvelopeDaPessoa` ou `EnvelopeDasPessoas` (contrato).
- CLI: binário `botai`; `botai pessoa`, `botai pessoas -n N`, `botai cpf|cnpj|rg|pis|titulo|celular|cep`, `botai validar <tipo> <valor>`; flags `--semente`, `--hoje`, `--uf`, `--dominio-email`, `--formato json|ndjson|csv|sql`, `--dialeto postgres|mysql|sqlite`, `--tabela` (padrão `pessoas`), `--campos a,b,c`; dados no stdout, mensagens no stderr, saída ≠ 0 em erro de uso (spec §6.3, contrato).
- O core **não tem dependência de runtime** (spec §5.4); `files` em lista fechada, `"publishConfig": { "access": "public" }`, `"license": "MIT"` (contrato).
- Dois manifestos (contrato, "Publicação no npm e environments"): `exports` aponta para `./src/<m>.ts` no workspace (extensão, site e zip de fontes da AMO leem o código-fonte) e `publishConfig.exports` aponta para `{ "types": "./dist/<m>.d.ts", "default": "./dist/<m>.js" }` no tarball. **Subpath novo entra nos dois.** Só o `pnpm pack` aplica o `publishConfig.exports`: toda conferência do pacote neste plano usa `pnpm pack` (o `npm pack` publicaria o manifesto do workspace). `packages/core/scripts/pacote.test.mjs` (fase 0) confere a lista do `pnpm pack --dry-run --json` e o manifesto do tarball; arquivo novo em `dist/` ou fora dele entra na lista desse teste (regra R5).
- Dependências (spec §5.3): pnpm ≥ 11; `minimumReleaseAge: 1440` sem `minimumReleaseAgeExclude` para `@pilutech/*` ou `@piluvitu/*`; `allowBuilds` explícito (nada novo aqui: `ajv` e `@types/node` não têm script de instalação); `--frozen-lockfile` no CI; `pnpm dedupe --check` e `pnpm audit --audit-level high` depois de cada dependência nova. Nomes conferidos na documentação oficial em 2026-10-05 (https://pnpm.io/settings/dependency-resolution): `minimumReleaseAge` (desde v10.16.0, padrão 1440 a partir da v11), `minimumReleaseAgeExclude` (v10.16.0), `trustPolicy: no-downgrade | off` (v10.21.0, padrão `off`), `trustPolicyExclude` (v10.22.0), `blockExoticSubdeps` (v10.26.0, padrão `true`). A fase 1 não altera essas chaves (são da fase 0); só confere que continuam no `pnpm-workspace.yaml`. Dependabot `cooldown` (`default-days`, `semver-major-days`, `semver-minor-days`, `semver-patch-days`, `include`, `exclude`; padrão 3 dias, https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference) e trusted publishing do npm (npm CLI ≥ 11.5.1, Node ≥ 22.14.0, `id-token: write`, proveniência automática, https://docs.npmjs.com/trusted-publishers) também ficam como a fase 0 deixou.
- Dependências novas desta fase, só de desenvolvimento do core: `ajv@^8.20.0` (publicada em 2026-04-24) e `@types/node@^25.5.0` (2026-03-12, a mesma do monorepo), se ainda não estiver.
- Testes do core precisam de Node ≥ 22.13 (o teste do SQL roda `node:sqlite`).
- Lei de comentários do `CLAUDE.md` raiz: produção com comentário raro, de 1 a 3 linhas, só para o porquê que o código não mostra; teste livre.
- Identificadores em português, como o resto do repo; teste, story e e2e ao lado do fonte.
- Comandos com binário direto e exit code conferido: `/usr/bin/git`, `/usr/bin/grep`, `/usr/bin/diff`, `/bin/ls`, `./node_modules/.bin/jest`, `./node_modules/.bin/vitest`, sempre com `; echo "exit=$?"`. O wrapper `rtk` falsifica a saída de git, grep, diff, ls, pnpm, vitest e jest: decida pelo `exit=`, nunca pelo texto do wrapper.
- Cada comando `cd` para um caminho absoluto no mesmo comando (o shell do agente volta ao diretório inicial a cada chamada).
- Commits convencionais em pt-BR com `/usr/bin/git`, sem linhas de atribuição.
- Ao fim de cada tarefa: `lint` (tsc) e testes do core limpos; quando a tarefa toca a extensão, `lint` e Vitest dela também.
- `CLAUDE.md` do workspace atualizado a cada tecnologia ou fluxo novo (core na tarefa 10; extensão na tarefa 2).
- Jest para lógica do core; a extensão segue com Vitest (exceção já documentada no `CLAUDE.md` dela), Storybook e Playwright. Esta fase não cria componente visual.
- Credenciais: nenhuma nesta fase; nada de `.env` com valor.

## Review Focus

- **Saída cortada por pipe** (`botai pessoas -n 50000 --formato ndjson | head -1`): o processo deve sair com 0 e sem stack trace no stderr (EPIPE). Teste na tarefa 9 (`saída cortada por pipe (| head) termina com 0 e sem mensagem`).
- **Semente com acento em NFD** (colada de nome de arquivo do macOS, `Sa\u0303o`) e em NFC (`S\u00e3o`): a mesma pessoa, e o envelope registra a forma NFC. Testes nas tarefas 1 (`texto em NFD (acento separado) é a mesma semente que em NFC`) e 4 (`semente em NFD fica registrada em NFC`).
- **Erro de uso em csv/sql depois de começar a escrever** (`-n 100001 --formato csv`, `--campos nome,xyz`): nada pode sair no stdout antes da mensagem de erro, senão quem redireciona para arquivo fica com um CSV ou SQL pela metade. Testes nas tarefas 8 (tabela `erros de uso`, todas com `stdout` vazio) e 9 (`erro de uso: código 2, mensagem no stderr, stdout vazio`).
- **Semente que começa com traço** (`--semente -5`, `--semente=-5`): é a semente `"-5"`, não "opção desconhecida". Testes nas tarefas 7 (`valor que começa com traço é valor, não opção`) e 8 (`--semente -5 e --semente=-5 são a semente "-5"`).
- **Lote grande numa UF de um logradouro só** (`--uf PI`, 2000 pessoas) e prefixo do lote: nada repete, e as primeiras k pessoas de um lote de n são o lote de k (quem aumenta o `-n` não perde as linhas que já carregou). Testes na tarefa 3 (`UF com um só logradouro (PI), 2000 pessoas: nada repete` e `prefixo estável`).

---

## Pré-condições (o que a fase 0 deixa) e regras de adaptação

O plano da fase 0 é escrito em paralelo a este. Antes da tarefa 1, confira o estado do repo novo. Cada item diz o que conferir, o esperado e o que fazer se for diferente. Qualquer divergência fora destas regras: pare e reporte (BLOCKED), sem improvisar.

**C1. Repo limpo na `main`.**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git status --short && /usr/bin/git branch --show-current && /usr/bin/git tag -l 'core-v*' && /usr/bin/git remote -v; echo "exit=$?"
```

Esperado: nada pendente, `main`, a tag `core-v0.1.0` (criada na B11 da fase 0; contrato, "Branches e tags") e nenhum remote ou um `origin` que o dono criou, `exit=0`. Sem a tag ou com pendência: pare. A fase roda local; nada nela precisa do remote.

**C2. O pacote do core.**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -p "const p=require('./package.json'); [p.name, p.version, Object.keys(p.exports).join(' '), JSON.stringify(p.exports['./pessoa']), JSON.stringify(p.publishConfig), JSON.stringify(p.scripts), JSON.stringify(p.files), JSON.stringify(p.dependencies ?? {})].join('\n')"
```

Esperado: `@pilutech/botai-core`, `0.1.0`, os subpaths do contrato (`./aleatorio` … `./atalhos`) sem `.`, `exports["./pessoa"]` = `"./src/pessoa.ts"`, `publishConfig` com `"access":"public"` e um `exports` com as mesmas chaves (`"./pessoa": {"types":"./dist/pessoa.d.ts","default":"./dist/pessoa.js"}`), scripts `build`, `lint` e `test`, `files` com `dist`, dependências `{}`. Diferente: pare. (Os scripts deste plano que editam o `package.json` mexem no `publishConfig.exports` só quando ele existe; se a fase 0 apontou o `exports` direto para `dist/` sem `publishConfig.exports`, eles continuam corretos, mas registre a divergência do contrato no relatório.)

**C3. Extensão dos imports relativos.**

```bash
/usr/bin/grep -n -m 3 "from './" /Users/piluvitu/PILUTECH/Botai/packages/core/src/pessoa.ts
```

Esperado: `from './aleatorio'` (sem extensão; contrato, "`@pilutech/botai-core`: subpaths"): a fase 0 deixa o código-fonte como o `packages/tools` de hoje, e o `build` acrescenta o `.js` no `dist` com `scripts/extensoes.mjs`, que também falha se um import não tiver arquivo. **R1:** os trechos deste plano estão escritos com `.js` (o protótipo era `nodenext`). Logo depois de criar ou editar cada arquivo `.ts` de `packages/core/src`, tire o `.js` de todo import relativo, menos os que apontam para `dist/` (que são JS de verdade, como o `'../dist/plano.js'` dos testes do bin):

```bash
sed -i '' -E "/\/dist\//!s#(from '\.{1,2}/[^']+)\.js'#\1'#g" <arquivo>; /usr/bin/grep -n "from '\.\{1,2\}/[^']*\.js'" <arquivo>; echo "exit=$?"
```

Esperado: só linhas com `/dist/` (ou nenhuma, `exit=1`). Nunca misture os dois estilos, e nunca importe uma pasta (`'./cli'`): escreva o arquivo (`'./cli/executar'`). Se o `pessoa.ts` vier com `.js` ou `.ts`, a fase 0 mudou a convenção: pare e reporte.

**C4. Ferramenta de build.**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -p "require('./package.json').scripts.build"
```

Esperado: um `tsc -p …` (o tsc emite `dist/<arquivo>.js` e `.d.ts` para todo `src/**/*.ts` que não é teste, mantendo as pastas: `src/bin/botai.ts` vira `dist/bin/botai.js`). **R2:** se for um bundler com lista de entradas (esbuild, tsup), acrescente à lista `src/index.ts` (tarefa 1, passo 12), `src/plano.ts` (tarefa 5, passo 3) e `src/bin/botai.ts` (tarefa 9, passo 3), saindo em `dist/index.js`, `dist/plano.js` e `dist/bin/botai.js`.

**C5. Tipos do Node nos testes.**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && /usr/bin/grep -n '"types"' tsconfig*.json; node -p "Object.keys(require('./package.json').devDependencies).join(' ')"
```

Esperado: nenhum `"types"`, ou um que inclua `"node"`; `@types/node` nas devDependencies ou instalado na tarefa 4. **R3:** na tarefa 4, se `"types"` existir sem `"node"`, acrescente `"node"` ao array do `tsconfig.json` que o `lint` e o Jest usam (não ao de build).

**C6. Jest em CommonJS.**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && /usr/bin/grep -n -E "useESM|extensionsToTreatAsEsm|moduleNameMapper|testEnvironment|setupFiles" jest.config.*
```

Esperado: sem `useESM`; sem `moduleNameMapper` (os imports relativos não têm extensão, regra R1; não acrescente um para `.js`); `testEnvironment` `node` (ou ausente, que é `node`). **R4:** com `useESM`, troque `__dirname` por `import.meta.dirname` nos testes deste plano e importe `jest` de `@jest/globals`. Os testes usam os globais `describe`, `test`, `expect` e `jest` sem import, como os de hoje; se a fase 0 passou a importá-los de `@jest/globals`, importe do mesmo jeito. **R4b:** se o `testEnvironment` for `jsdom` (como o `packages/tools` de hoje, que injeta `webcrypto` num `jest.setup.ts`), ponha `/** @jest-environment node */` na primeira linha de `src/semente.test.ts` (tarefa 1): o teste troca `globalThis.crypto`, e no jsdom essa propriedade pode não ser reconfigurável.

**C7. Tudo verde antes de começar.**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core build; echo "exit=$?"; pnpm --filter @pilutech/botai-core test; echo "exit=$?"; pnpm --filter @pilutech/botai test; echo "exit=$?"
```

Esperado: os três `exit=0`. Diferente: pare.

**C8. A extensão usa o core pelo npm do workspace.**

```bash
/usr/bin/grep -rn "botai-core/pessoa" /Users/piluvitu/PILUTECH/Botai/extensao/src/lib/armazenamento.ts /Users/piluvitu/PILUTECH/Botai/extensao/src/test/pessoa-dourada.ts
```

Esperado: as duas importam `gerarPessoa` de `@pilutech/botai-core/pessoa`. Diferente: pare.

**C9. Salvaguardas de dependência e Node.**

```bash
/usr/bin/grep -n -E "minimumReleaseAge|trustPolicy|blockExoticSubdeps" /Users/piluvitu/PILUTECH/Botai/pnpm-workspace.yaml; node -p process.versions.node
```

Esperado: `minimumReleaseAge: 1440`, sem `minimumReleaseAgeExclude`; `trustPolicy: no-downgrade`; `blockExoticSubdeps` ausente (padrão `true` no pnpm 11) ou `true`; Node ≥ 22.13. Sem `minimumReleaseAge`, com `minimumReleaseAgeExclude` cobrindo `@pilutech/*` ou `@piluvitu/*`, sem `trustPolicy: no-downgrade` ou com `blockExoticSubdeps: false`: pare (spec §5.3; a fase 1 não conserta salvaguarda da fase 0 por conta própria). Node antigo: use o Node que a fase 0 fixou (`.nvmrc` ou `engines`).

**C10. Binários do Jest e do tsc no core.**

```bash
/bin/ls /Users/piluvitu/PILUTECH/Botai/packages/core/node_modules/.bin/jest /Users/piluvitu/PILUTECH/Botai/packages/core/node_modules/.bin/tsc; echo "exit=$?"
```

Esperado: os dois existem, `exit=0`. Diferente: use `pnpm --filter @pilutech/botai-core exec jest <arquivo>` no lugar de `./node_modules/.bin/jest <arquivo>`.

**C11. A lista fechada do pacote (`scripts/pacote.test.mjs`).**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /bin/ls packages/core/scripts/pacote.test.mjs; echo "exit=$?"; /usr/bin/grep -rn "pacote.test.mjs\|pack --dry-run" packages/core/package.json .github/workflows; /usr/bin/grep -n "dist/" packages/core/scripts/pacote.test.mjs | /usr/bin/head -20
```

Esperado (contrato, "Publicação no npm"): o arquivo existe (`exit=0`), é chamado por um script do `package.json` do core ou pelo `ci.yml`, e monta a lista esperada a partir dos valores do `publishConfig.exports`, mais a constante `EXTRAS` (arquivos que nenhum subpath aponta). Anote **como ele roda** (ex.: `node --test packages/core/scripts/pacote.test.mjs`) e se o `pnpm --filter @pilutech/botai-core test` já o inclui. Arquivo ausente: pare.

**R5 (vale para as tarefas 1, 3, 4, 5, 6, 7, 8 e 9).** Depois do build de cada uma dessas tarefas, rode o `pacote.test.mjs` do jeito anotado em C11. Ele vai acusar os arquivos novos do pacote; acrescente à constante `EXTRAS` (a lista fora da derivação do `publishConfig.exports`; inclusive `.map` se a fase 0 emite) **exatamente** estes, e mais nada (os que um subpath novo já aponta, como `dist/index.*` e o esquema, podem entrar ou não: a lista não repete):

| Tarefa | Arquivos novos no tarball                                                                                                                                                                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | `dist/index.js`, `dist/index.d.ts` (a entrada `.` não deriva de um nome de arquivo plano), `dist/opcoes.js`, `dist/opcoes.d.ts`, `dist/semente.js`, `dist/semente.d.ts`, `dist/hoje.js`, `dist/hoje.d.ts` |
| 3      | `dist/gerar.js`, `dist/gerar.d.ts`                                                                                                                                                                        |
| 4      | `dist/versao.js`, `dist/versao.d.ts`, `dist/envelope.js`, `dist/envelope.d.ts`                                                                                                                            |
| 5      | nenhum além do que o `exports["./plano"]` já deriva (`dist/plano.js`, `dist/plano.d.ts`)                                                                                                                  |
| 6      | `esquema/envelope-v1.schema.json` (subpath que não está em `dist/`)                                                                                                                                       |
| 7      | `dist/cli/argumentos.js`, `dist/cli/argumentos.d.ts`                                                                                                                                                      |
| 8      | `dist/cli/ajuda.js`, `dist/cli/ajuda.d.ts`, `dist/cli/avulsos.js`, `dist/cli/avulsos.d.ts`, `dist/cli/executar.js`, `dist/cli/executar.d.ts`                                                              |
| 9      | `dist/bin/botai.js`, `dist/bin/botai.d.ts`                                                                                                                                                                |

Rode de novo e confira `exit=0`; o `pacote.test.mjs` entra no `git add` do commit da tarefa. Se ele acusar qualquer outro arquivo (ex.: `dourado/`, `src/`, um `.test.js`), não o acrescente: pare, porque o `files` ou o build vazou algo.

**C12. Node do CI do core.**

```bash
/usr/bin/grep -n "node-version" /Users/piluvitu/PILUTECH/Botai/.github/workflows/ci.yml
```

Esperado: o job do core em Node ≥ 22.13 (o teste do SQL da tarefa 5 roda `node:sqlite`, sem flag a partir do 22.13). **R7:** se for menor, na tarefa 5 troque o `node-version` desse job por `'24.14.0'` (o Node que o contrato fixa para a publicação) e acrescente `.github/workflows/ci.yml` ao commit da tarefa 5.

## Mapa de arquivos

`packages/core/` (o pacote `@pilutech/botai-core`):

| Arquivo                                                                                                          | Responsabilidade                                                                                                                        | Tarefa                 |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `src/opcoes.ts` (+ teste)                                                                                        | `ErroDeOpcao`, `LIMITE_DO_LOTE` e a validação de `hoje`, `uf`, `dominioEmail` e `n`                                                     | 1                      |
| `src/semente.ts` (+ teste)                                                                                       | `Semente`, `textoDaSemente`, `bytesUtf8`, `cyrb128`, `rngDeSemente`, `sementeAleatoria`                                                 | 1                      |
| `src/hoje.ts` (+ teste)                                                                                          | `hojeEmSaoPaulo` (portado de `extensao/src/lib/hoje.ts`)                                                                                | 1                      |
| `src/index.ts` (+ teste)                                                                                         | a raiz `.`: só reexporta; o teste trava a lista de nomes                                                                                | 1, 3, 4                |
| `src/nome.ts`, `src/nome.test.ts`                                                                                | `gerarEmail(rng, nome, dominio?)`; `caixaUrl: string \| null`                                                                           | 2                      |
| `src/pessoa.ts`, `src/pessoa.test.ts`                                                                            | `montarPessoa(rng, hojeISO, opcoes?)` e `OpcoesDaMontagem`                                                                              | 2                      |
| `src/campos-formatar.test.ts`                                                                                    | só o comentário que cita `gerarPessoa(sfc32…)`                                                                                          | 2                      |
| `src/gerar.ts` (+ teste)                                                                                         | `resolverOpcoes`, `gerarPessoa(opcoes)`, `pessoasDoLote`, `loteCom`, `gerarPessoas`                                                     | 3                      |
| `scripts/gerar-versao.mjs`, `src/versao.ts` (gerado e versionado) (+ teste)                                      | `MOTOR` lido do `package.json` no build                                                                                                 | 4                      |
| `src/envelope.ts` (+ teste)                                                                                      | `FORMATO`, envelopes, `envelopar`, `envelopeDoLote`                                                                                     | 4                      |
| `src/portabilidade.test.ts`                                                                                      | trava: fora de `src/bin`, nada de API de Node ou DOM                                                                                    | 4                      |
| `src/plano.ts` (+ teste)                                                                                         | `COLUNAS`, `pessoaPlana`, CSV (RFC 4180) e SQL por dialeto                                                                              | 5                      |
| `esquema/envelope-v1.schema.json`, `src/envelope.esquema.test.ts`                                                | JSON Schema 2020-12 do envelope, publicado                                                                                              | 6                      |
| `dourado/v1/indice.json`, `scripts/gerar-dourados.mjs`, `dourado/v1/*` (gerados), `src/envelope.dourado.test.ts` | arquivos dourados e a conferência da biblioteca                                                                                         | 6                      |
| `src/cli/argumentos.ts` (+ teste)                                                                                | leitor de argumentos sem dependência                                                                                                    | 7                      |
| `src/cli/ajuda.ts`, `src/cli/avulsos.ts`, `src/cli/executar.ts` (+ teste)                                        | comandos da CLI, puros (`executar(argv, saida)`)                                                                                        | 8                      |
| `src/bin/botai.ts`, `src/bin/botai.test.ts`                                                                      | o bin; o teste roda `dist/bin/botai.js`                                                                                                 | 9                      |
| `package.json`                                                                                                   | `version`, `exports` e `publishConfig.exports` (`.`, `./plano`, `./esquema/…`), `bin`, `files`, `sideEffects`, scripts, devDependencies | 1, 4, 5, 6, 9          |
| `scripts/pacote.test.mjs` (da fase 0)                                                                            | a lista fechada do `pnpm pack`, com os arquivos novos de cada tarefa (regra R5)                                                         | 1, 3, 4, 5, 6, 7, 8, 9 |
| `README.md`, `CLAUDE.md`                                                                                         | documentação                                                                                                                            | 10                     |

Fora do core: `extensao/src/{test/pessoa-dourada.ts, test/pessoa-dourada.test.ts, lib/armazenamento.ts, lib/hoje.ts, lib/hoje.test.ts, entrypoints/background/acoes.ts, entrypoints/background/ouvintes.ts, entrypoints/background/ouvintes.test.ts, entrypoints/popup/App.tsx, entrypoints/popup/App.test.tsx}` e `extensao/CLAUDE.md` (tarefas 2 e 6); `.prettierignore` (tarefa 6); `.github/workflows/ci.yml` (tarefa 5, só pela regra R7); `CLAUDE.md` raiz e o contrato em `docs/superpowers/plans/` (tarefa 10).

---

### Task 1: Entradas do motor: semente, hoje e validação das opções

**Files:**

- Create: `packages/core/src/opcoes.ts`, `packages/core/src/opcoes.test.ts`
- Create: `packages/core/src/semente.ts`, `packages/core/src/semente.test.ts`
- Create: `packages/core/src/hoje.ts`, `packages/core/src/hoje.test.ts`
- Create: `packages/core/src/index.ts`, `packages/core/src/index.test.ts`
- Modify: `packages/core/package.json` (`exports["."]` e `publishConfig.exports["."]`, `sideEffects`), `packages/core/scripts/pacote.test.mjs` (R5)

**Interfaces:**

- Consumes: `sfc32(a, b, c, d): Prng` e `type Prng` de `src/prng.ts`; `lerDataISO(iso): DataCivil` de `src/nascimento.ts`; `UFS`, `type UF` de `src/uf.ts` (todos da fase 0, sem mudança).
- Produces:
  - `src/opcoes.ts`: `type NomeDaOpcao = 'semente' | 'hoje' | 'uf' | 'dominioEmail' | 'n'`; `class ErroDeOpcao extends Error { readonly opcao: NomeDaOpcao }`; `LIMITE_DO_LOTE = 100_000`; `lerHoje(hoje: string): string`; `lerUF(uf: string): UF`; `lerDominioEmail(dominio: string): string` (minúsculo); `lerQuantidade(n: number): number`.
  - `src/semente.ts`: `type Semente = number | string`; `textoDaSemente(semente: Semente): string` (NFC, validado); `bytesUtf8(texto: string): number[]`; `cyrb128(bytes: readonly number[]): [number, number, number, number]`; `rngDeSemente(semente: Semente): Prng`; `sementeAleatoria(): string` (16 hex).
  - `src/hoje.ts`: `hojeEmSaoPaulo(agora?: Date): string`.
  - raiz `.`: `ErroDeOpcao`, `LIMITE_DO_LOTE`, `hojeEmSaoPaulo`, `rngDeSemente`, `sementeAleatoria` e os tipos `NomeDaOpcao`, `Prng`, `Semente`, `UF`.

- [ ] **Step 1: Conferir as pré-condições na `main` e criar a branch**

Primeiro rode C1 a C12 da seção "Pré-condições" ainda na `main` (o C1 espera a `main`), e anote no relatório da tarefa o resultado de cada uma e as regras (R1 a R7) que valem. Só então:

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git switch -c feat/core-cli; echo "exit=$?"
```

Expected: `Switched to a new branch 'feat/core-cli'`, `exit=0`.

- [ ] **Step 2: Escrever o teste que falha de `opcoes`**

`packages/core/src/opcoes.test.ts`:

```ts
import {
  ErroDeOpcao,
  LIMITE_DO_LOTE,
  lerDominioEmail,
  lerHoje,
  lerQuantidade,
  lerUF,
} from './opcoes.js'

const opcaoDoErro = (f: () => unknown): string | undefined => {
  try {
    f()
  } catch (erro) {
    if (erro instanceof ErroDeOpcao) return erro.opcao
    throw erro
  }
  return undefined
}

describe('lerHoje', () => {
  test('aceita data que existe, inclusive 29 de fevereiro de ano bissexto', () => {
    expect(lerHoje('2026-10-05')).toBe('2026-10-05')
    expect(lerHoje('2028-02-29')).toBe('2028-02-29')
  })

  test.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-1-5', 'hoje', ''])(
    'recusa %j',
    (valor) => {
      expect(opcaoDoErro(() => lerHoje(valor))).toBe('hoje')
    },
  )
})

describe('lerUF', () => {
  test('aceita sigla em qualquer caixa e devolve maiúscula', () => {
    expect(lerUF('PI')).toBe('PI')
    expect(lerUF('pi')).toBe('PI')
  })

  test.each(['XX', 'Piauí', '', 'P I'])('recusa %j', (valor) => {
    expect(opcaoDoErro(() => lerUF(valor))).toBe('uf')
  })
})

describe('lerDominioEmail', () => {
  test.each([
    ['example.com', 'example.com'],
    ['Example.COM', 'example.com'],
    ['teste.empresa.com.br', 'teste.empresa.com.br'],
    ['meu-dominio.local', 'meu-dominio.local'],
  ])('aceita %j', (valor, esperado) => {
    expect(lerDominioEmail(valor)).toBe(esperado)
  })

  test.each([
    'localhost',
    '',
    'a..com',
    '-a.com',
    'a-.com',
    'a_b.com',
    'a b.com',
    'ção.com',
    '1.2.3.4',
    `${'a'.repeat(64)}.com`,
    `${'a.'.repeat(127)}com`,
    'user@example.com',
  ])('recusa %j', (valor) => {
    expect(opcaoDoErro(() => lerDominioEmail(valor))).toBe('dominioEmail')
  })
})

describe('lerQuantidade', () => {
  test('aceita de 0 ao limite', () => {
    expect(lerQuantidade(0)).toBe(0)
    expect(lerQuantidade(LIMITE_DO_LOTE)).toBe(100_000)
  })

  test.each([-1, 1.5, Number.NaN, LIMITE_DO_LOTE + 1])('recusa %j', (n) => {
    expect(opcaoDoErro(() => lerQuantidade(n))).toBe('n')
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/opcoes.test.ts; echo "exit=$?"
```

Expected: FAIL com `Cannot find module './opcoes.js'` (ou `TS2307`), `exit=1`.

- [ ] **Step 4: Implementar `opcoes`**

`packages/core/src/opcoes.ts`:

```ts
import { lerDataISO } from './nascimento.js'
import { type UF, UFS } from './uf.js'

export type NomeDaOpcao = 'semente' | 'hoje' | 'uf' | 'dominioEmail' | 'n'

export class ErroDeOpcao extends Error {
  readonly opcao: NomeDaOpcao

  constructor(opcao: NomeDaOpcao, mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeOpcao'
    this.opcao = opcao
  }
}

export const LIMITE_DO_LOTE = 100_000

export function lerHoje(hoje: string): string {
  try {
    lerDataISO(hoje)
  } catch {
    throw new ErroDeOpcao(
      'hoje',
      `hoje precisa ser uma data AAAA-MM-DD que existe, recebido "${hoje}"`,
    )
  }
  return hoje
}

export function lerUF(uf: string): UF {
  const sigla = uf.toUpperCase()
  if (!(UFS as readonly string[]).includes(sigla))
    throw new ErroDeOpcao(
      'uf',
      `uf desconhecida "${uf}" (use uma das 27 siglas, ex.: SP)`,
    )
  return sigla as UF
}

const ROTULO_DE_DOMINIO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function lerDominioEmail(dominio: string): string {
  const minusculo = dominio.toLowerCase()
  const rotulos = minusculo.split('.')
  const valido =
    minusculo.length <= 253 &&
    rotulos.length >= 2 &&
    rotulos.every((r) => ROTULO_DE_DOMINIO.test(r)) &&
    !/^\d+$/.test(rotulos[rotulos.length - 1])
  if (!valido)
    throw new ErroDeOpcao(
      'dominioEmail',
      `domínio de e-mail inválido "${dominio}" (ex.: example.com)`,
    )
  return minusculo
}

export function lerQuantidade(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > LIMITE_DO_LOTE)
    throw new ErroDeOpcao(
      'n',
      `n precisa ser um inteiro de 0 a ${LIMITE_DO_LOTE}, recebido ${n}`,
    )
  return n
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/opcoes.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 6: Escrever o teste que falha de `semente`**

Os números fixos foram medidos no protótipo; eles são o contrato da semente.

`packages/core/src/semente.test.ts`:

```ts
import { ErroDeOpcao } from './opcoes.js'
import {
  bytesUtf8,
  cyrb128,
  rngDeSemente,
  sementeAleatoria,
  textoDaSemente,
} from './semente.js'

const primeiros = (semente: number | string, n = 3) => {
  const rng = rngDeSemente(semente)
  return Array.from({ length: n }, () => rng.nextUint32())
}

describe('rngDeSemente', () => {
  test('número e texto são a mesma semente: 42 ≡ "42"', () => {
    expect(primeiros(42, 20)).toEqual(primeiros('42', 20))
    expect(primeiros(-5, 20)).toEqual(primeiros('-5', 20))
    expect(primeiros(0, 20)).toEqual(primeiros('0', 20))
  })

  // Valores fixos de propósito: mudar o hash, a codificação ou o sfc32 muda
  // a pessoa de toda semente, e isso é versão major.
  test('estável: os primeiros valores de sementes conhecidas não mudam', () => {
    expect(primeiros(42)).toEqual([2258495261, 801819658, 1739561921])
    expect(primeiros('botai')).toEqual([2689368236, 3757199645, 1206963042])
    expect(primeiros('ação 🧀')).toEqual([2218003296, 965529650, 4207509537])
  })

  test('o hash é o cyrb128 dos bytes UTF-8 do texto', () => {
    expect(cyrb128(bytesUtf8('42'))).toEqual([
      2814168319, 14930478, 1039855864, 944835771,
    ])
  })

  test('sementes diferentes dão sequências diferentes', () => {
    expect(primeiros('lote/0')).not.toEqual(primeiros('lote/1'))
    expect(primeiros('a')).not.toEqual(primeiros('A'))
  })

  test('texto em NFD (acento separado) é a mesma semente que em NFC', () => {
    const nfd = 'Sa\u0303o Joa\u0303o'
    const nfc = 'S\u00e3o Jo\u00e3o'
    expect(nfd).not.toBe(nfc)
    expect(primeiros(nfd, 10)).toEqual(primeiros(nfc, 10))
    expect(textoDaSemente(nfd)).toBe(nfc)
  })

  test.each([
    ['', 'semente vazia'],
    [1.5, 'inteira'],
    [Number.NaN, 'inteira'],
    [2 ** 53, 'inteira'],
    ['x'.repeat(257), 'mais de 256'],
    ['a\nDROP TABLE x', 'caractere de controle'],
    ['a\u0000b', 'caractere de controle'],
  ])('recusa %j', (semente, trecho) => {
    expect(() => rngDeSemente(semente)).toThrow(ErroDeOpcao)
    expect(() => rngDeSemente(semente)).toThrow(trecho)
  })

  test('aceita até 256 caracteres e números negativos', () => {
    expect(() => rngDeSemente('x'.repeat(256))).not.toThrow()
    expect(() => rngDeSemente(-5)).not.toThrow()
  })

  test('o erro diz qual opção falhou', () => {
    try {
      rngDeSemente('')
      throw new Error('não lançou')
    } catch (erro) {
      expect((erro as ErroDeOpcao).opcao).toBe('semente')
    }
  })
})

describe('bytesUtf8', () => {
  test('1, 2, 3 e 4 bytes por caractere', () => {
    expect(bytesUtf8('a')).toEqual([97])
    expect(bytesUtf8('é')).toEqual([195, 169])
    expect(bytesUtf8('€')).toEqual([226, 130, 172])
    expect(bytesUtf8('🧀')).toEqual([240, 159, 167, 128])
    expect(bytesUtf8('ação 🧀')).toEqual([
      97, 195, 167, 195, 163, 111, 32, 240, 159, 167, 128,
    ])
  })
})

describe('sementeAleatoria', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  const trocarCrypto = (valor: unknown) =>
    Object.defineProperty(globalThis, 'crypto', {
      value: valor,
      configurable: true,
      writable: true,
    })
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'crypto', original)
    else delete (globalThis as { crypto?: unknown }).crypto
    jest.restoreAllMocks()
  })

  test('16 dígitos hexadecimais, e duas chamadas não repetem', () => {
    const a = sementeAleatoria()
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(sementeAleatoria()).not.toBe(a)
  })

  test('usa crypto.getRandomValues quando existe', () => {
    trocarCrypto({
      getRandomValues: (destino: Uint32Array) => {
        destino[0] = 0xdeadbeef
        destino[1] = 1
        return destino
      },
    })
    expect(sementeAleatoria()).toBe('deadbeef00000001')
  })

  test('sem crypto, cai no Math.random', () => {
    trocarCrypto(undefined)
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(sementeAleatoria()).toBe('8000000080000000')
  })
})
```

- [ ] **Step 7: Rodar e ver falhar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/semente.test.ts; echo "exit=$?"
```

Expected: FAIL com `Cannot find module './semente.js'`, `exit=1`.

- [ ] **Step 8: Implementar `semente`**

`packages/core/src/semente.ts` (a linha de comentário dá a origem do hash, que é de terceiro):

```ts
import { ErroDeOpcao } from './opcoes.js'
import { type Prng, sfc32 } from './prng.js'

export type Semente = number | string

const TAMANHO_MAXIMO_DA_SEMENTE = 256

export function textoDaSemente(semente: Semente): string {
  if (typeof semente === 'number') {
    if (!Number.isSafeInteger(semente))
      throw new ErroDeOpcao(
        'semente',
        `semente numérica precisa ser inteira, recebido ${semente}`,
      )
    return String(semente)
  }
  if (typeof semente !== 'string')
    throw new ErroDeOpcao('semente', 'semente precisa ser número ou texto')
  const texto = semente.normalize('NFC')
  if (texto.length === 0) throw new ErroDeOpcao('semente', 'semente vazia')
  if (texto.length > TAMANHO_MAXIMO_DA_SEMENTE)
    throw new ErroDeOpcao(
      'semente',
      `semente com mais de ${TAMANHO_MAXIMO_DA_SEMENTE} caracteres`,
    )
  if (/[\u0000-\u001f\u007f]/.test(texto))
    throw new ErroDeOpcao('semente', 'semente com caractere de controle')
  return texto
}

export function bytesUtf8(texto: string): number[] {
  const bytes: number[] = []
  for (const caractere of texto) {
    const c = caractere.codePointAt(0)!
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    else if (c < 0x10000)
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    else
      bytes.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      )
  }
  return bytes
}

// cyrb128, de github.com/bryc/code (domínio público).
export function cyrb128(
  bytes: readonly number[],
): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (const k of bytes) {
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

export function rngDeSemente(semente: Semente): Prng {
  const [a, b, c, d] = cyrb128(bytesUtf8(textoDaSemente(semente)))
  return sfc32(a, b, c, d)
}

interface CryptoMinimo {
  getRandomValues(destino: Uint32Array): Uint32Array
}

export function sementeAleatoria(): string {
  const valores = new Uint32Array(2)
  const cripto = (globalThis as { crypto?: CryptoMinimo }).crypto
  if (cripto) cripto.getRandomValues(valores)
  else
    for (let i = 0; i < valores.length; i++)
      valores[i] = Math.floor(Math.random() * 0x100000000)
  return Array.from(valores, (v) => v.toString(16).padStart(8, '0')).join('')
}
```

- [ ] **Step 9: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/semente.test.ts; echo "exit=$?"
```

Expected: PASS (inclusive os três valores fixos e o caso NFD), `exit=0`. Se os valores fixos não baterem, o hash, a codificação ou o `sfc32` divergiu do protótipo: confira o `sfc32` de `src/prng.ts` (15 descartes iniciais) antes de mexer no teste.

- [ ] **Step 10: Portar `hojeEmSaoPaulo` com teste primeiro**

`packages/core/src/hoje.test.ts` (os casos são os de `extensao/src/lib/hoje.test.ts`):

```ts
import { hojeEmSaoPaulo } from './hoje.js'

describe('hojeEmSaoPaulo', () => {
  test('usa o dia civil de São Paulo, não o de UTC', () => {
    expect(hojeEmSaoPaulo(new Date('2026-10-02T02:30:00Z'))).toBe('2026-10-01')
    expect(hojeEmSaoPaulo(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10-01')
    expect(hojeEmSaoPaulo(new Date('2026-10-01T02:59:59Z'))).toBe('2026-09-30')
  })

  test('vira o ano à meia-noite de Brasília', () => {
    expect(hojeEmSaoPaulo(new Date('2027-01-01T02:59:59Z'))).toBe('2026-12-31')
    expect(hojeEmSaoPaulo(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01')
  })

  test('sem argumento devolve a data de agora no formato AAAA-MM-DD', () => {
    expect(hojeEmSaoPaulo()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/hoje.test.ts; echo "exit=$?"
```

Expected: FAIL com `Cannot find module './hoje.js'`, `exit=1`.

`packages/core/src/hoje.ts`:

```ts
const DIA_EM_SAO_PAULO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  const partes = Object.fromEntries(
    DIA_EM_SAO_PAULO.formatToParts(agora).map((parte) => [
      parte.type,
      parte.value,
    ]),
  )
  return `${partes.year}-${partes.month}-${partes.day}`
}
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/hoje.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 11: Raiz do pacote, com a lista de nomes travada**

`packages/core/src/index.test.ts` (versão da tarefa 1; as tarefas 3 e 4 ampliam a lista):

```ts
import * as raiz from './index.js'

test('a raiz expõe exatamente a API do contrato', () => {
  expect(Object.keys(raiz).sort()).toEqual([
    'ErroDeOpcao',
    'LIMITE_DO_LOTE',
    'hojeEmSaoPaulo',
    'rngDeSemente',
    'sementeAleatoria',
  ])
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/index.test.ts; echo "exit=$?"
```

Expected: FAIL com `Cannot find module './index.js'`, `exit=1`.

`packages/core/src/index.ts` (versão da tarefa 1):

```ts
export { hojeEmSaoPaulo } from './hoje.js'
export { ErroDeOpcao, LIMITE_DO_LOTE, type NomeDaOpcao } from './opcoes.js'
export type { Prng } from './prng.js'
export { rngDeSemente, sementeAleatoria, type Semente } from './semente.js'
export type { UF } from './uf.js'
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/index.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 12: Publicar a raiz no `package.json`**

A entrada `.` copia o formato da entrada `./pessoa` que a fase 0 deixou, nos dois manifestos (contrato: subpath novo entra no `exports` e no `publishConfig.exports`). `sideEffects: false` deixa o bundler da extensão podar o que ela não usa da raiz.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -e '
const fs = require("fs")
const p = JSON.parse(fs.readFileSync("package.json", "utf8"))
const comoPessoa = (exports) => ({ ".": JSON.parse(JSON.stringify(exports["./pessoa"]).replaceAll("pessoa", "index")), ...exports })
p.exports = comoPessoa(p.exports)
if (p.publishConfig?.exports) p.publishConfig.exports = comoPessoa(p.publishConfig.exports)
p.sideEffects = false
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n")
'; echo "exit=$?"; node -p 'const p=require("./package.json"); JSON.stringify([p.exports["."], p.publishConfig.exports?.["."]])'
```

Expected: `exit=0` e `["./src/index.ts",{"types":"./dist/index.d.ts","default":"./dist/index.js"}]` (a entrada `.` igual à de `./pessoa` com `index` no lugar, em cada manifesto). Pela regra R2, se o build tem lista de entradas, acrescente `src/index.ts` agora.

- [ ] **Step 13: Lint, build e a suíte inteira**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core lint; echo "exit=$?"; pnpm --filter @pilutech/botai-core build; echo "exit=$?"; /bin/ls packages/core/dist/index.js packages/core/dist/index.d.ts packages/core/dist/semente.js; echo "exit=$?"; pnpm --filter @pilutech/botai-core test; echo "exit=$?"
```

Expected: os quatro `exit=0`. Aplique a regra R5 (linha da tarefa 1): se o `test` do core já roda o `pacote.test.mjs` e só ele falhou, acrescente os arquivos e rode a linha de novo; se não roda, rode o `pacote.test.mjs` à parte até `exit=0`.

- [ ] **Step 14: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/opcoes.ts packages/core/src/opcoes.test.ts packages/core/src/semente.ts packages/core/src/semente.test.ts packages/core/src/hoje.ts packages/core/src/hoje.test.ts packages/core/src/index.ts packages/core/src/index.test.ts packages/core/package.json packages/core/scripts/pacote.test.mjs && /usr/bin/git commit -m "feat(core): semente única (rngDeSemente), hojeEmSaoPaulo e validação das opções"; echo "exit=$?"
```

Expected: `exit=0`.

---

### Task 2: `montarPessoa` com `uf` e `dominioEmail`, e a extensão ajustada

**Files:**

- Modify: `packages/core/src/nome.ts` (interface `Email` e `gerarEmail`), `packages/core/src/nome.test.ts`
- Modify: `packages/core/src/pessoa.ts` (imports e a função), `packages/core/src/pessoa.test.ts`
- Modify: `packages/core/src/campos-formatar.test.ts` (comentário da linha 5)
- Modify: `packages/core/scripts/pacote.test.mjs` (o teste da pessoa dourada do `dist` passa a chamar `montarPessoa`)
- Modify: `extensao/src/test/pessoa-dourada.ts`, `extensao/src/lib/armazenamento.ts`, `extensao/src/lib/hoje.ts`, `extensao/src/lib/hoje.test.ts`, `extensao/src/entrypoints/background/acoes.ts`, `extensao/src/entrypoints/background/ouvintes.ts`, `extensao/src/entrypoints/background/ouvintes.test.ts`, `extensao/src/entrypoints/popup/App.tsx`, `extensao/src/entrypoints/popup/App.test.tsx`, `extensao/CLAUDE.md`

**Interfaces:**

- Consumes: `lerUF`, `lerDominioEmail`, `ErroDeOpcao` (tarefa 1); `hojeEmSaoPaulo` pela raiz `@pilutech/botai-core` (tarefa 1).
- Produces:
  - `src/nome.ts`: `interface Email { usuario: string; endereco: string; caixaUrl: string | null }`; `gerarEmail(rng: Rng, nome: Nome, dominio: string = DOMINIO_EMAIL): Email` (`caixaUrl` é `null` quando `dominio !== DOMINIO_EMAIL`).
  - `src/pessoa.ts`: `interface OpcoesDaMontagem { uf?: UF; dominioEmail?: string }`; `montarPessoa(rng: Rng, hojeISO: string, opcoes: OpcoesDaMontagem = {}): Pessoa`. `gerarPessoa` deixa de existir em `/pessoa`.

- [ ] **Step 1: Teste que falha do domínio do e-mail**

Em `packages/core/src/nome.test.ts`, logo depois do teste `'e-mail: usuario = 1ª palavra do prenome - S2 - 4 dígitos, na caixa pública'`, acrescente:

```ts
test('e-mail com outro domínio: mesmo usuario, sem caixa pública', () => {
  const nome = gerarNome(sfc32(1, 2, 3, 4))
  const padrao = gerarEmail(sfc32(5, 5, 5, 5), nome)
  const outro = gerarEmail(sfc32(5, 5, 5, 5), nome, 'example.com')
  expect(outro).toEqual({
    usuario: padrao.usuario,
    endereco: `${padrao.usuario}@example.com`,
    caixaUrl: null,
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/nome.test.ts; echo "exit=$?"
```

Expected: FAIL com `TS2554: Expected 2 arguments, but got 3`, `exit=1`.

- [ ] **Step 2: `gerarEmail` com domínio**

Em `packages/core/src/nome.ts`, troque a interface `Email` e a função `gerarEmail` (de `export interface Email {` até o fim do arquivo) por:

```ts
export interface Email {
  usuario: string
  endereco: string
  caixaUrl: string | null
}

export function gerarEmail(
  rng: Rng,
  nome: Nome,
  dominio: string = DOMINIO_EMAIL,
): Email {
  const primeiro = slugNome(nome.prenome.split(' ')[0])
  const ultimo = slugNome(nome.sobrenomes[1])
  const usuario = `${primeiro}-${ultimo}-${digitosAleatorios(rng, 4).join('')}`
  return {
    usuario,
    endereco: `${usuario}@${dominio}`,
    caixaUrl:
      dominio === DOMINIO_EMAIL ? `https://${DOMINIO_EMAIL}/${usuario}` : null,
  }
}
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/nome.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 3: Testes que falham de `montarPessoa`**

Em `packages/core/src/pessoa.test.ts`:

1. Troque toda ocorrência de `gerarPessoa` por `montarPessoa` (o import, o `describe` e as chamadas): `/usr/bin/sed -i '' 's/gerarPessoa/montarPessoa/g' /Users/piluvitu/PILUTECH/Botai/packages/core/src/pessoa.test.ts`.
2. Troque o import de `uf` por estes dois:

```ts
import { CODIGO_UF_TITULO, REGIAO_FISCAL_CPF, type UF, UFS } from './uf.js'
import { ErroDeOpcao } from './opcoes.js'
```

3. Acrescente no fim do arquivo:

```ts
describe('montarPessoa com opções', () => {
  const DOURADA = () => montarPessoa(sfc32(1, 2, 3, 4), '2026-10-01')

  test('opções vazias não mudam a pessoa dourada', () => {
    expect(montarPessoa(sfc32(1, 2, 3, 4), '2026-10-01', {})).toEqual(DOURADA())
  })

  test('uf fixa o endereço, e CPF, título e DDD seguem a UF', () => {
    for (const uf of UFS) {
      const p = montarPessoa(sfc32(1, 2, 3, 4), '2026-10-01', { uf })
      expect(p.endereco.uf).toBe(uf)
      expect(Number(p.cpf[10])).toBe(REGIAO_FISCAL_CPF[uf])
      expect(p.tituloEleitor.replace(/\s/g, '').slice(8, 10)).toBe(
        CODIGO_UF_TITULO[uf],
      )
      expect(p.celular.ddd).toBe(p.endereco.ddd)
      expect(p.nome).toEqual(DOURADA().nome)
    }
  })

  test('uf em minúscula vale; uf desconhecida lança ErroDeOpcao', () => {
    expect(
      montarPessoa(sfc32(1, 2, 3, 4), '2026-10-01', { uf: 'pi' as UF }).endereco
        .uf,
    ).toBe('PI')
    expect(() =>
      montarPessoa(sfc32(1, 2, 3, 4), '2026-10-01', { uf: 'XX' as UF }),
    ).toThrow(ErroDeOpcao)
  })

  test('dominioEmail troca só o domínio do e-mail e zera a caixa', () => {
    const p = montarPessoa(sfc32(1, 2, 3, 4), '2026-10-01', {
      dominioEmail: 'Example.COM',
    })
    expect(p.email).toEqual({
      usuario: 'vinicius-costa-6607',
      endereco: 'vinicius-costa-6607@example.com',
      caixaUrl: null,
    })
    expect({ ...p, email: DOURADA().email }).toEqual(DOURADA())
  })

  test('dominioEmail igual ao padrão mantém a caixa pública', () => {
    expect(
      montarPessoa(sfc32(1, 2, 3, 4), '2026-10-01', {
        dominioEmail: 'tuamaeaquelaursa.com',
      }),
    ).toEqual(DOURADA())
  })

  test.each(['localhost', '', 'a b.com'])(
    'dominioEmail %j lança ErroDeOpcao',
    (dominioEmail) => {
      expect(() =>
        montarPessoa(sfc32(1, 2, 3, 4), '2026-10-01', { dominioEmail }),
      ).toThrow(ErroDeOpcao)
    },
  )
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/pessoa.test.ts; echo "exit=$?"
```

Expected: FAIL com `Module './pessoa.js' has no exported member 'montarPessoa'`, `exit=1`.

- [ ] **Step 4: `montarPessoa`**

Em `packages/core/src/pessoa.ts`, troque o bloco de imports por:

```ts
import type { Rng } from './aleatorio.js'
import { type Celular, gerarCelular } from './celular.js'
import { type Cartao, gerarCartao } from './cartao.js'
import { gerarCPF } from './cpf.js'
import { type Empresa, gerarEmpresa } from './empresa.js'
import { type Endereco, gerarEndereco } from './endereco.js'
import { type Nascimento, gerarNascimento } from './nascimento.js'
import { type Email, type Nome, gerarEmail, gerarNome } from './nome.js'
import { lerDominioEmail, lerUF } from './opcoes.js'
import { gerarPIS } from './pis.js'
import { gerarRG } from './rg.js'
import { gerarSenha } from './senha.js'
import { gerarTituloEleitor } from './titulo-eleitor.js'
import type { UF } from './uf.js'
```

e troque o comentário da ordem do rng e a função `gerarPessoa` (do comentário até o fim do arquivo) por:

```ts
export interface OpcoesDaMontagem {
  uf?: UF
  dominioEmail?: string
}

// A ordem das chamadas a rng é parte do contrato: mudar a ordem muda a pessoa de uma semente.
export function montarPessoa(
  rng: Rng,
  hojeISO: string,
  opcoes: OpcoesDaMontagem = {},
): Pessoa {
  const uf = opcoes.uf === undefined ? undefined : lerUF(opcoes.uf)
  const dominio =
    opcoes.dominioEmail === undefined
      ? undefined
      : lerDominioEmail(opcoes.dominioEmail)
  const nome = gerarNome(rng)
  const endereco = gerarEndereco(rng, uf)
  const nascimento = gerarNascimento(rng, hojeISO)
  return {
    nome,
    nascimento,
    cpf: gerarCPF(rng, endereco.uf),
    rg: { numero: gerarRG(rng), orgaoEmissor: 'SSP', uf: 'SP' },
    pis: gerarPIS(rng),
    tituloEleitor: gerarTituloEleitor(rng, endereco.uf),
    celular: gerarCelular(rng, endereco.ddd),
    email: gerarEmail(rng, nome, dominio),
    senha: gerarSenha(rng),
    endereco,
    empresa: gerarEmpresa(rng, nome.sobrenomes),
    cartao: gerarCartao(rng, hojeISO, nome.noCartao),
  }
}
```

A interface `Pessoa` não muda.

- [ ] **Step 5: Rodar e ver passar, com a pessoa dourada intacta**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/pessoa.test.ts src/nome.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`. O teste `pessoa dourada: semente (1,2,3,4) em 2026-10-01` passa sem nenhuma linha do objeto esperado alterada (`/usr/bin/git diff packages/core/src/pessoa.test.ts` mostra só o rename, o import e o bloco novo).

- [ ] **Step 6: Comentário que ainda cita o nome antigo**

Em `packages/core/src/campos-formatar.test.ts`, troque `gerarPessoa(sfc32(1,2,3,4), '2026-10-01')` por `montarPessoa(sfc32(1,2,3,4), '2026-10-01')` no comentário do topo.

Em `packages/core/scripts/pacote.test.mjs` (fase 0), o teste `o build gera a mesma pessoa dourada que o código-fonte` importa `gerarPessoa` de `dist/pessoa.js` e o chama com `(sfc32(1, 2, 3, 4), '2026-10-01')`: troque, nesse teste, `gerarPessoa` por `montarPessoa` (as duas ocorrências; os valores esperados não mudam).

Depois confira que o nome antigo sumiu do core:

```bash
/usr/bin/grep -rn "gerarPessoa(rng\|gerarPessoa(sfc32\|gerarPessoa(seed\|{ gerarPessoa }" /Users/piluvitu/PILUTECH/Botai/packages/core/src /Users/piluvitu/PILUTECH/Botai/packages/core/scripts /Users/piluvitu/PILUTECH/Botai/extensao/src; echo "exit=$?"
```

Expected: só as duas linhas da extensão (`armazenamento.ts` e `pessoa-dourada.ts`), que mudam nos passos 9 e 10; `exit=0`.

- [ ] **Step 7: Lint, build e suíte do core**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core lint; echo "exit=$?"; pnpm --filter @pilutech/botai-core build; echo "exit=$?"; pnpm --filter @pilutech/botai-core test; echo "exit=$?"
```

Expected: os três `exit=0`.

- [ ] **Step 8: Testes que falham na extensão (pessoa sem caixa pública)**

Com `caixaUrl: null` possível, a extensão não pode abrir aba com `url: null`. Ela só gera o domínio padrão, então o caso não aparece na prática; os testes travam a guarda que o tipo exige.

Em `extensao/src/entrypoints/background/ouvintes.test.ts`, dentro do `describe` que tem `'"Abrir caixa de entrada" abre a caixa pública da pessoa numa aba nova'`, acrescente:

```ts
it('"Abrir caixa de entrada" com pessoa sem caixa pública (outro domínio) não abre aba', async () => {
  await pessoaItem.setValue({ ...P, email: { ...P.email, caixaUrl: null } })
  const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
  await aoClicarMenu(clique('botai-abrir-caixa'), ABA)
  expect(abrir).not.toHaveBeenCalled()
})
```

Em `extensao/src/entrypoints/popup/App.test.tsx`, logo depois de `'"Caixa de entrada" abre a caixa pública da pessoa'`, acrescente:

```tsx
it('"Caixa de entrada" de pessoa sem caixa pública não abre aba', async () => {
  const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
  await pessoaItem.setValue({ ...P, email: { ...P.email, caixaUrl: null } })
  render(<App />)
  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Caixa de entrada' }))
  expect(abrir).not.toHaveBeenCalled()
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/extensao && ./node_modules/.bin/wxt prepare && ./node_modules/.bin/vitest run src/entrypoints/background/ouvintes.test.ts src/entrypoints/popup/App.test.tsx; echo "exit=$?"
```

Expected: FAIL nos dois testes novos (`expected "spy" to not be called`), `exit=1`.

- [ ] **Step 9: Guardas da caixa**

`extensao/src/entrypoints/background/ouvintes.ts`, no ramo `MENU.abrirCaixa`, troque:

```ts
const pessoa = await obterOuGerarPessoa()
await browser.tabs.create({ url: pessoa.email.caixaUrl })
return
```

por:

```ts
const pessoa = await obterOuGerarPessoa()
if (pessoa.email.caixaUrl)
  await browser.tabs.create({ url: pessoa.email.caixaUrl })
return
```

`extensao/src/entrypoints/popup/App.tsx`, troque:

```tsx
const abrirCaixa = (dono: Pessoa) =>
  void browser.tabs.create({ url: dono.email.caixaUrl })
```

por:

```tsx
const abrirCaixa = (dono: Pessoa) => {
  if (dono.email.caixaUrl)
    void browser.tabs.create({ url: dono.email.caixaUrl })
}
```

- [ ] **Step 10: `montarPessoa` e `hojeEmSaoPaulo` na extensão**

`extensao/src/test/pessoa-dourada.ts` inteiro:

```ts
import { montarPessoa } from '@pilutech/botai-core/pessoa'
import { sfc32 } from '@pilutech/botai-core/prng'

export const PESSOA_DOURADA = montarPessoa(sfc32(1, 2, 3, 4), '2026-10-01')
```

`extensao/src/lib/armazenamento.ts`: troque `import { gerarPessoa, type Pessoa } from '@pilutech/botai-core/pessoa'` por

```ts
import { hojeEmSaoPaulo } from '@pilutech/botai-core'
import { montarPessoa, type Pessoa } from '@pilutech/botai-core/pessoa'
```

apague a linha `import { hojeISO } from './hoje'` e troque `gerarPessoa(seedFromBytes(cryptoRandomBytes(16)), hojeISO())` por `montarPessoa(seedFromBytes(cryptoRandomBytes(16)), hojeEmSaoPaulo())`. As linhas de `cryptoRandomBytes` e `seedFromBytes` ficam como a fase 0 deixou.

`extensao/src/lib/hoje.ts` inteiro (o `hojeISO` foi para o core como `hojeEmSaoPaulo`):

```ts
import { calcularIdade, lerDataISO } from '@pilutech/botai-core/nascimento'

export function idadeEm(nascimentoISO: string, hoje: string): number {
  return calcularIdade(lerDataISO(nascimentoISO), lerDataISO(hoje))
}
```

`extensao/src/lib/hoje.test.ts` inteiro (os casos do `hojeISO` estão em `packages/core/src/hoje.test.ts`):

```ts
import { describe, expect, it } from 'vitest'
import { idadeEm } from './hoje'

describe('idadeEm', () => {
  it('só completa o ano no dia do aniversário', () => {
    expect(idadeEm('1993-05-29', '2026-05-28')).toBe(32)
    expect(idadeEm('1993-05-29', '2026-05-29')).toBe(33)
  })
})
```

`extensao/src/entrypoints/background/acoes.ts`: troque `import { hojeISO } from '../../lib/hoje'` por `import { hojeEmSaoPaulo } from '@pilutech/botai-core'` e `args: [pessoa, hojeISO()],` por `args: [pessoa, hojeEmSaoPaulo()],`.

`extensao/src/entrypoints/popup/App.tsx`: troque `import { hojeISO, idadeEm } from '../../lib/hoje'` por `import { idadeEm } from '../../lib/hoje'`, acrescente `import { hojeEmSaoPaulo } from '@pilutech/botai-core'` logo depois do `import type { Pessoa } from '@pilutech/botai-core/pessoa'`, e troque `idadeEm(pessoa.nascimento.iso, hojeISO())` por `idadeEm(pessoa.nascimento.iso, hojeEmSaoPaulo())`.

`extensao/src/entrypoints/popup/App.test.tsx`: troque `import { hojeISO, idadeEm } from '../../lib/hoje'` por `import { idadeEm } from '../../lib/hoje'`, acrescente `import { hojeEmSaoPaulo } from '@pilutech/botai-core'` como primeira linha, e troque `idadeEm(P.nascimento.iso, hojeISO())` por `idadeEm(P.nascimento.iso, hojeEmSaoPaulo())`.

Confira que nenhuma chamada ao `hojeISO()` sobrou (o parâmetro `hojeISO` do content script continua, é outro nome):

```bash
/usr/bin/grep -rn "hojeISO()\|import { hojeISO\|gerarPessoa(" /Users/piluvitu/PILUTECH/Botai/extensao/src; echo "exit=$?"
```

Expected: nenhuma linha, `exit=1`.

- [ ] **Step 11: Extensão verde (Vitest e lint)**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core build; echo "exit=$?"; pnpm --filter @pilutech/botai test; echo "exit=$?"; pnpm --filter @pilutech/botai lint; echo "exit=$?"
```

Expected: os três `exit=0` (o `lint` da extensão é `wxt prepare && tsc --noEmit && eslint .`; o `tsc` é quem garante que `caixaUrl: string | null` foi tratado).

- [ ] **Step 12: `extensao/CLAUDE.md`**

Troque as duas menções ao `hojeISO`:

- na linha do fluxo "Preencher (modo A)", `__botai.preencher(pessoa, hojeISO)` vira `__botai.preencher(pessoa, hojeEmSaoPaulo())`;
- na linha "Armazenamento", a frase `` `hojeISO` é o dia civil de `America/Sao_Paulo` `` vira `` `hojeEmSaoPaulo()` (do `@pilutech/botai-core`) é o dia civil de `America/Sao_Paulo` ``.

E acrescente à seção "Armazenamento" esta linha:

```markdown
- A pessoa sai de `montarPessoa(rng, hoje)` do core (antes `gerarPessoa(rng, hoje)`), sempre com o domínio padrão. Mesmo assim `email.caixaUrl` é `string | null` no tipo (o core devolve `null` para outro domínio), e o menu "Abrir caixa" e o botão "Caixa de entrada" só abrem aba quando há URL.
```

```bash
/usr/bin/grep -n "hojeISO" /Users/piluvitu/PILUTECH/Botai/extensao/CLAUDE.md; echo "exit=$?"
```

Expected: nenhuma linha, `exit=1`.

- [ ] **Step 13: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/nome.ts packages/core/src/nome.test.ts packages/core/src/pessoa.ts packages/core/src/pessoa.test.ts packages/core/src/campos-formatar.test.ts packages/core/scripts/pacote.test.mjs extensao/src extensao/CLAUDE.md && /usr/bin/git commit -m "feat(core): montarPessoa com uf e dominioEmail; extensão usa o hoje do core"; echo "exit=$?"
```

Expected: `exit=0`.

---

### Task 3: `gerarPessoa(opcoes)` e `gerarPessoas(n)` sem repetição

**Files:**

- Create: `packages/core/src/gerar.ts`, `packages/core/src/gerar.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/index.test.ts`, `packages/core/scripts/pacote.test.mjs` (R5)

**Interfaces:**

- Consumes: `montarPessoa`, `OpcoesDaMontagem`, `Pessoa` (tarefa 2); `rngDeSemente`, `sementeAleatoria`, `textoDaSemente`, `Semente` (tarefa 1); `lerHoje`, `lerQuantidade` (tarefa 1); `hojeEmSaoPaulo` (tarefa 1).
- Produces (`src/gerar.ts`):
  - `interface OpcoesDaPessoa extends OpcoesDaMontagem { semente?: Semente; hoje?: string }` (a do contrato);
  - `interface OpcoesResolvidas extends OpcoesDaMontagem { semente: string; hoje: string }`;
  - `interface PessoaDoLote { semente: string; pessoa: Pessoa }` (a semente exata que gerou a pessoa: `S/i` ou `S/i/k`);
  - `type Montador = (semente: string, opcoes: OpcoesResolvidas) => Pessoa`;
  - `TENTATIVAS_POR_PESSOA = 1000`;
  - `resolverOpcoes(opcoes?: OpcoesDaPessoa): OpcoesResolvidas` (sorteia a semente e usa `hojeEmSaoPaulo()` quando faltam);
  - `pessoaResolvida(opcoes: OpcoesResolvidas): Pessoa`;
  - `gerarPessoa(opcoes?: OpcoesDaPessoa): Pessoa`;
  - `loteCom(quantidade, opcoes: OpcoesResolvidas, montar: Montador): Generator<PessoaDoLote>`;
  - `pessoasDoLote(n: number, opcoes: OpcoesResolvidas): Generator<PessoaDoLote>` (valida `n` na chamada, antes de gerar);
  - `gerarPessoas(n: number, opcoes?: OpcoesDaPessoa): Pessoa[]`.

- [ ] **Step 1: Teste que falha**

`packages/core/src/gerar.test.ts` (os valores fixos são do protótipo; o caso `mil-3` é uma repetição de e-mail real, achada procurando sementes `mil-0`, `mil-1`…):

```ts
import {
  gerarPessoa,
  gerarPessoas,
  loteCom,
  type OpcoesResolvidas,
  pessoasDoLote,
  resolverOpcoes,
  TENTATIVAS_POR_PESSOA,
} from './gerar.js'
import { hojeEmSaoPaulo } from './hoje.js'
import { ErroDeOpcao } from './opcoes.js'
import type { Pessoa } from './pessoa.js'
import type { UF } from './uf.js'

const HOJE = '2026-10-05'

describe('gerarPessoa(opcoes)', () => {
  test('semente e hoje fixos: pessoa conhecida', () => {
    const p = gerarPessoa({ semente: 'botai', hoje: HOJE })
    expect(p.nome.completo).toBe('Larissa Almeida Conceição')
    expect(p.cpf).toBe('610.246.647-08')
    expect(p.email.endereco).toBe('larissa-conceicao-1063@tuamaeaquelaursa.com')
    expect(p.endereco.uf).toBe('ES')
    expect(p.empresa.cnpj).toBe('68.069.290/0001-63')
  })

  test('semente numérica = a mesma semente em texto', () => {
    const p = gerarPessoa({ semente: 42, hoje: HOJE })
    expect(p).toEqual(gerarPessoa({ semente: '42', hoje: HOJE }))
    expect(p.nome.completo).toBe('Márcio Carvalho Rodrigues')
    expect(p.cpf).toBe('634.132.403-07')
  })

  test('uf: mesmo nome, endereço e documentos da UF pedida', () => {
    const p = gerarPessoa({ semente: 'botai', hoje: HOJE, uf: 'PI' })
    expect(p.nome.completo).toBe('Larissa Almeida Conceição')
    expect(p.endereco.cidade).toBe('Teresina')
    expect(p.cpf).toBe('610.246.643-84')
    expect(p.celular.ddd).toBe('86')
    expect(
      gerarPessoa({ semente: 'botai', hoje: HOJE, uf: 'pi' as UF }),
    ).toEqual(p)
  })

  test('dominioEmail: só o e-mail muda, e sem caixa pública', () => {
    const padrao = gerarPessoa({ semente: 'botai', hoje: HOJE })
    const p = gerarPessoa({
      semente: 'botai',
      hoje: HOJE,
      dominioEmail: 'example.com',
    })
    expect(p.email.endereco).toBe('larissa-conceicao-1063@example.com')
    expect(p.email.caixaUrl).toBeNull()
    expect({ ...p, email: padrao.email }).toEqual(padrao)
  })

  test('sem hoje usa a data de São Paulo', () => {
    expect(gerarPessoa({ semente: 'botai' })).toEqual(
      gerarPessoa({ semente: 'botai', hoje: hojeEmSaoPaulo() }),
    )
  })

  test('sem semente sorteia: duas chamadas dão pessoas diferentes', () => {
    expect(gerarPessoa({ hoje: HOJE }).cpf).not.toBe(
      gerarPessoa({ hoje: HOJE }).cpf,
    )
  })

  test.each([
    [{ hoje: '2026-02-30' }, 'hoje'],
    [{ uf: 'XX' as UF }, 'uf'],
    [{ dominioEmail: 'localhost' }, 'dominioEmail'],
    [{ semente: '' }, 'semente'],
  ])('opção inválida %j lança ErroDeOpcao(%s)', (opcoes, opcao) => {
    expect(() => gerarPessoa(opcoes)).toThrow(ErroDeOpcao)
    try {
      gerarPessoa(opcoes)
    } catch (erro) {
      expect((erro as ErroDeOpcao).opcao).toBe(opcao)
    }
  })
})

describe('resolverOpcoes', () => {
  test('registra a semente como texto e sorteia quando falta', () => {
    expect(resolverOpcoes({ semente: 42, hoje: HOJE })).toEqual({
      semente: '42',
      hoje: HOJE,
    })
    expect(resolverOpcoes({ hoje: HOJE }).semente).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('gerarPessoas(n, opcoes)', () => {
  test('a pessoa i do lote é a da semente S/i', () => {
    const lote = gerarPessoas(5, { semente: 'lote', hoje: HOJE })
    expect(lote).toHaveLength(5)
    lote.forEach((p, i) =>
      expect(p).toEqual(gerarPessoa({ semente: `lote/${i}`, hoje: HOJE })),
    )
  })

  test('n = 0 dá lote vazio; n inválido lança antes de gerar', () => {
    expect(gerarPessoas(0, { semente: 'x', hoje: HOJE })).toEqual([])
    const r = resolverOpcoes({ semente: 'x', hoje: HOJE })
    for (const n of [-1, 1.5, 100_001])
      expect(() => pessoasDoLote(n, r)).toThrow(ErroDeOpcao)
  })

  test('1000 pessoas da semente mil-3: sem e-mail, CPF ou CNPJ repetido', () => {
    const lote = gerarPessoas(1000, { semente: 'mil-3', hoje: HOJE })
    expect(new Set(lote.map((p) => p.email.endereco)).size).toBe(1000)
    expect(new Set(lote.map((p) => p.cpf)).size).toBe(1000)
    expect(new Set(lote.map((p) => p.empresa.cnpj)).size).toBe(1000)
  })

  // Caso real: mil-3/971 repete o e-mail de mil-3/387, e a 972ª pessoa sai de mil-3/971/2.
  test('repetição real é sorteada de novo com S/i/2', () => {
    const lote = [
      ...pessoasDoLote(1000, resolverOpcoes({ semente: 'mil-3', hoje: HOJE })),
    ]
    const sorteadasDeNovo = lote
      .map((p) => p.semente)
      .filter((s) => s.split('/').length === 3)
    expect(sorteadasDeNovo).toEqual(['mil-3/971/2'])
    const repetida = gerarPessoa({ semente: 'mil-3/971', hoje: HOJE })
    expect(repetida.email.endereco).toBe(
      'felipe-oliveira-9071@tuamaeaquelaursa.com',
    )
    expect(lote[387].pessoa.email.endereco).toBe(repetida.email.endereco)
    expect(lote[971].pessoa.email.endereco).toBe(
      'aline-pereira-1476@tuamaeaquelaursa.com',
    )
  })

  test('prefixo estável: as 200 primeiras de um lote de 1000 = o lote de 200', () => {
    const opcoes = { semente: 'mil-3', hoje: HOJE }
    expect(gerarPessoas(1000, opcoes).slice(0, 200)).toEqual(
      gerarPessoas(200, opcoes),
    )
  })

  test('UF com um só logradouro (PI), 2000 pessoas: nada repete', () => {
    const lote = gerarPessoas(2000, { semente: 'pi', hoje: HOJE, uf: 'PI' })
    expect(lote.every((p) => p.endereco.uf === 'PI')).toBe(true)
    expect(new Set(lote.map((p) => p.email.endereco)).size).toBe(2000)
    expect(new Set(lote.map((p) => p.cpf)).size).toBe(2000)
    expect(new Set(lote.map((p) => p.empresa.cnpj)).size).toBe(2000)
  })
})

describe('loteCom (sorteio de novo, campo a campo)', () => {
  const r: OpcoesResolvidas = { semente: 's', hoje: HOJE }
  const A = gerarPessoa({ semente: 'a', hoje: HOJE })
  const B = gerarPessoa({ semente: 'b', hoje: HOJE })

  test('e-mail, CPF e CNPJ repetidos forçam S/i/2, S/i/3, S/i/4…', () => {
    const porSemente: Record<string, Pessoa> = {
      's/0': A,
      's/1': { ...B, email: A.email },
      's/1/2': { ...B, cpf: A.cpf },
      's/1/3': { ...B, empresa: A.empresa },
      's/1/4': B,
    }
    const sementes = [...loteCom(2, r, (s) => porSemente[s])].map(
      (p) => p.semente,
    )
    expect(sementes).toEqual(['s/0', 's/1/4'])
  })

  test(`sem saída em ${TENTATIVAS_POR_PESSOA} tentativas, lança em vez de travar`, () => {
    expect(() => [...loteCom(2, r, () => A)]).toThrow(
      'nenhuma pessoa sem repetição na posição 1',
    )
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/gerar.test.ts; echo "exit=$?"
```

Expected: FAIL com `Cannot find module './gerar.js'`, `exit=1`.

- [ ] **Step 2: Implementar**

`packages/core/src/gerar.ts`:

```ts
import { hojeEmSaoPaulo } from './hoje.js'
import { lerHoje, lerQuantidade } from './opcoes.js'
import { type OpcoesDaMontagem, type Pessoa, montarPessoa } from './pessoa.js'
import {
  type Semente,
  rngDeSemente,
  sementeAleatoria,
  textoDaSemente,
} from './semente.js'

export interface OpcoesDaPessoa extends OpcoesDaMontagem {
  semente?: Semente
  hoje?: string
}

export interface OpcoesResolvidas extends OpcoesDaMontagem {
  semente: string
  hoje: string
}

export interface PessoaDoLote {
  semente: string
  pessoa: Pessoa
}

export type Montador = (semente: string, opcoes: OpcoesResolvidas) => Pessoa

export const TENTATIVAS_POR_PESSOA = 1000

export function resolverOpcoes(opcoes: OpcoesDaPessoa = {}): OpcoesResolvidas {
  const { semente, hoje, ...montagem } = opcoes
  return {
    ...montagem,
    semente:
      semente === undefined ? sementeAleatoria() : textoDaSemente(semente),
    hoje: hoje === undefined ? hojeEmSaoPaulo() : lerHoje(hoje),
  }
}

const montarDaSemente: Montador = (semente, opcoes) =>
  montarPessoa(rngDeSemente(semente), opcoes.hoje, {
    uf: opcoes.uf,
    dominioEmail: opcoes.dominioEmail,
  })

export function pessoaResolvida(opcoes: OpcoesResolvidas): Pessoa {
  return montarDaSemente(opcoes.semente, opcoes)
}

export function gerarPessoa(opcoes: OpcoesDaPessoa = {}): Pessoa {
  return pessoaResolvida(resolverOpcoes(opcoes))
}

export function* loteCom(
  quantidade: number,
  opcoes: OpcoesResolvidas,
  montar: Montador,
): Generator<PessoaDoLote> {
  const emails = new Set<string>()
  const cpfs = new Set<string>()
  const cnpjs = new Set<string>()
  for (let i = 0; i < quantidade; i++) {
    let escolhida: PessoaDoLote | undefined
    for (let k = 1; k <= TENTATIVAS_POR_PESSOA && !escolhida; k++) {
      const semente =
        k === 1 ? `${opcoes.semente}/${i}` : `${opcoes.semente}/${i}/${k}`
      const pessoa = montar(semente, opcoes)
      const repete =
        emails.has(pessoa.email.endereco) ||
        cpfs.has(pessoa.cpf) ||
        cnpjs.has(pessoa.empresa.cnpj)
      if (!repete) escolhida = { semente, pessoa }
    }
    if (!escolhida)
      throw new Error(
        `gerarPessoas: nenhuma pessoa sem repetição na posição ${i} em ${TENTATIVAS_POR_PESSOA} tentativas`,
      )
    emails.add(escolhida.pessoa.email.endereco)
    cpfs.add(escolhida.pessoa.cpf)
    cnpjs.add(escolhida.pessoa.empresa.cnpj)
    yield escolhida
  }
}

export function pessoasDoLote(
  n: number,
  opcoes: OpcoesResolvidas,
): Generator<PessoaDoLote> {
  return loteCom(lerQuantidade(n), opcoes, montarDaSemente)
}

export function gerarPessoas(n: number, opcoes: OpcoesDaPessoa = {}): Pessoa[] {
  return Array.from(pessoasDoLote(n, resolverOpcoes(opcoes)), (p) => p.pessoa)
}
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/gerar.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0` (o arquivo leva cerca de 1 s: gera alguns lotes de 1000 e 2000).

- [ ] **Step 3: Raiz com `gerarPessoa`, `gerarPessoas` e `DOMINIO_EMAIL_PADRAO`**

`packages/core/src/index.test.ts` (versão da tarefa 3):

```ts
import * as raiz from './index.js'

test('a raiz expõe exatamente a API do contrato', () => {
  expect(Object.keys(raiz).sort()).toEqual([
    'DOMINIO_EMAIL_PADRAO',
    'ErroDeOpcao',
    'LIMITE_DO_LOTE',
    'gerarPessoa',
    'gerarPessoas',
    'hojeEmSaoPaulo',
    'rngDeSemente',
    'sementeAleatoria',
  ])
  expect(raiz.DOMINIO_EMAIL_PADRAO).toBe('tuamaeaquelaursa.com')
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/index.test.ts; echo "exit=$?"
```

Expected: FAIL (a lista não bate), `exit=1`.

`packages/core/src/index.ts` (versão da tarefa 3):

```ts
export { gerarPessoa, gerarPessoas, type OpcoesDaPessoa } from './gerar.js'
export { hojeEmSaoPaulo } from './hoje.js'
export { DOMINIO_EMAIL as DOMINIO_EMAIL_PADRAO } from './nome.js'
export { ErroDeOpcao, LIMITE_DO_LOTE, type NomeDaOpcao } from './opcoes.js'
export type { Pessoa } from './pessoa.js'
export type { Prng } from './prng.js'
export { rngDeSemente, sementeAleatoria, type Semente } from './semente.js'
export type { UF } from './uf.js'
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/index.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 4: Lint e suíte**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core lint; echo "exit=$?"; pnpm --filter @pilutech/botai-core build; echo "exit=$?"; pnpm --filter @pilutech/botai-core test; echo "exit=$?"
```

Expected: os três `exit=0`. Aplique a regra R5 (linha da tarefa 3): se o `test` do core já roda o `pacote.test.mjs` e só ele falhou, acrescente os arquivos e rode a linha de novo; se não roda, rode o `pacote.test.mjs` à parte até `exit=0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/gerar.ts packages/core/src/gerar.test.ts packages/core/src/index.ts packages/core/src/index.test.ts packages/core/scripts/pacote.test.mjs && /usr/bin/git commit -m "feat(core): gerarPessoa(opcoes) e gerarPessoas sem e-mail, CPF ou CNPJ repetido"; echo "exit=$?"
```

Expected: `exit=0`.

---

### Task 4: Envelope, `FORMATO`, `MOTOR` lido do `package.json`, versão 0.2.0

**Files:**

- Create: `packages/core/scripts/gerar-versao.mjs`, `packages/core/src/versao.ts` (gerado e versionado), `packages/core/src/versao.test.ts`
- Create: `packages/core/src/envelope.ts`, `packages/core/src/envelope.test.ts`
- Create: `packages/core/src/portabilidade.test.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/index.test.ts`, `packages/core/package.json` (`version`, scripts `build` e `lint`, devDependency `@types/node` se faltar), `packages/core/scripts/pacote.test.mjs` (R5), `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `resolverOpcoes`, `pessoaResolvida`, `pessoasDoLote`, `OpcoesDaPessoa`, `OpcoesResolvidas` (tarefa 3).
- Produces:
  - `src/versao.ts`: `MOTOR: string` (hoje `'0.2.0'`);
  - `src/envelope.ts`: `FORMATO = 1`; `interface EnvelopeDaPessoa { formato: 1; motor: string; semente: string; hoje: string; pessoa: Pessoa }`; `interface EnvelopeDasPessoas { …; pessoas: Pessoa[] }`; `envelopar(semente: string, hoje: string, pessoa: Pessoa): EnvelopeDaPessoa`; `envelopeDoLote(n: number, opcoes: OpcoesResolvidas): EnvelopeDasPessoas`; `gerarEnvelopeDaPessoa(opcoes?: OpcoesDaPessoa): EnvelopeDaPessoa`; `gerarEnvelopeDasPessoas(n: number, opcoes?: OpcoesDaPessoa): EnvelopeDasPessoas`;
  - raiz completa do contrato (lista no passo 9).

- [ ] **Step 1: `@types/node` para os testes que leem arquivo e abrem processo**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -p "require('./package.json').devDependencies['@types/node'] ?? 'falta'"
```

Se imprimir `falta`:

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core add -D @types/node@^25.5.0; echo "exit=$?"; pnpm dedupe --check; echo "exit=$?"; pnpm audit --audit-level high; echo "exit=$?"
```

Expected: os três `exit=0` (o `minimumReleaseAge` aceita a 25.5.0, de 2026-03-12). Se o `audit` acusar algo que já existia na `main`, registre no relatório; só bloqueia o que veio com esta dependência. Aplique a regra R3 se o `tsconfig.json` limitar `"types"`.

- [ ] **Step 2: Teste que falha do `MOTOR`**

`packages/core/src/versao.test.ts`:

```ts
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MOTOR } from './versao.js'

const RAIZ = join(__dirname, '..')

describe('MOTOR', () => {
  test('é a versão do package.json', () => {
    const pacote = JSON.parse(
      readFileSync(join(RAIZ, 'package.json'), 'utf8'),
    ) as { version: string }
    expect(MOTOR).toBe(pacote.version)
  })

  test('src/versao.ts está em dia (gerar-versao --conferir sai com 0)', () => {
    const r = spawnSync(
      process.execPath,
      [join(RAIZ, 'scripts', 'gerar-versao.mjs'), '--conferir'],
      { encoding: 'utf8' },
    )
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/versao.test.ts; echo "exit=$?"
```

Expected: FAIL com `Cannot find module './versao.js'`, `exit=1`.

- [ ] **Step 3: Gerador da versão, versão 0.2.0 e scripts**

`packages/core/scripts/gerar-versao.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs'

const raiz = new URL('../', import.meta.url)
const { version } = JSON.parse(
  readFileSync(new URL('package.json', raiz), 'utf8'),
)
const destino = new URL('src/versao.ts', raiz)
const esperado = `export const MOTOR: string = '${version}'\n`

if (process.argv.includes('--conferir')) {
  if (readFileSync(destino, 'utf8') !== esperado) {
    console.error(
      `src/versao.ts não bate com o package.json (${version}): rode node scripts/gerar-versao.mjs`,
    )
    process.exit(1)
  }
} else {
  writeFileSync(destino, esperado)
}
```

O `build` passa a gravar `src/versao.ts` antes de compilar, e o `lint` confere que o arquivo versionado está em dia (quem sobe a versão sem regenerar é barrado):

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -e '
const fs = require("fs")
const p = JSON.parse(fs.readFileSync("package.json", "utf8"))
p.version = "0.2.0"
p.scripts.build = "node scripts/gerar-versao.mjs && " + p.scripts.build
p.scripts.lint = "node scripts/gerar-versao.mjs --conferir && " + p.scripts.lint
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n")
'; echo "exit=$?"; node scripts/gerar-versao.mjs; echo "exit=$?"; /bin/cat src/versao.ts
```

Expected: `exit=0` duas vezes e `export const MOTOR: string = '0.2.0'`.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/versao.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 4: Teste que falha dos envelopes**

`packages/core/src/envelope.test.ts`:

```ts
import {
  envelopar,
  FORMATO,
  gerarEnvelopeDaPessoa,
  gerarEnvelopeDasPessoas,
} from './envelope.js'
import { gerarPessoa, gerarPessoas } from './gerar.js'
import { MOTOR } from './versao.js'

const HOJE = '2026-10-05'

describe('envelopes', () => {
  test('FORMATO é 1', () => {
    expect(FORMATO).toBe(1)
  })

  test('envelope da pessoa: formato, motor, semente em texto, hoje e a pessoa', () => {
    expect(gerarEnvelopeDaPessoa({ semente: 42, hoje: HOJE })).toEqual({
      formato: 1,
      motor: MOTOR,
      semente: '42',
      hoje: HOJE,
      pessoa: gerarPessoa({ semente: 42, hoje: HOJE }),
    })
  })

  test('sem semente e sem hoje, o envelope traz o que reproduz a pessoa', () => {
    const e = gerarEnvelopeDaPessoa()
    expect(e.semente).toMatch(/^[0-9a-f]{16}$/)
    expect(e.hoje).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(gerarPessoa({ semente: e.semente, hoje: e.hoje })).toEqual(e.pessoa)
  })

  test('semente em NFD fica registrada em NFC', () => {
    expect(
      gerarEnvelopeDaPessoa({ semente: 'Sa\u0303o', hoje: HOJE }).semente,
    ).toBe('S\u00e3o')
  })

  test('envelope do lote: a semente do lote e as pessoas em ordem', () => {
    expect(gerarEnvelopeDasPessoas(3, { semente: 'lote', hoje: HOJE })).toEqual(
      {
        formato: 1,
        motor: MOTOR,
        semente: 'lote',
        hoje: HOJE,
        pessoas: gerarPessoas(3, { semente: 'lote', hoje: HOJE }),
      },
    )
  })

  test('lote sem semente: a semente sorteada reproduz o lote', () => {
    const e = gerarEnvelopeDasPessoas(3, { hoje: HOJE })
    expect(gerarPessoas(3, { semente: e.semente, hoje: HOJE })).toEqual(
      e.pessoas,
    )
  })

  test('envelopar monta o envelope de uma pessoa do lote', () => {
    const pessoa = gerarPessoa({ semente: 'lote/0', hoje: HOJE })
    expect(envelopar('lote/0', HOJE, pessoa)).toEqual({
      formato: 1,
      motor: MOTOR,
      semente: 'lote/0',
      hoje: HOJE,
      pessoa,
    })
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/envelope.test.ts; echo "exit=$?"
```

Expected: FAIL com `Cannot find module './envelope.js'`, `exit=1`.

- [ ] **Step 5: Implementar os envelopes**

`packages/core/src/envelope.ts`:

```ts
import {
  type OpcoesDaPessoa,
  type OpcoesResolvidas,
  pessoaResolvida,
  pessoasDoLote,
  resolverOpcoes,
} from './gerar.js'
import type { Pessoa } from './pessoa.js'
import { MOTOR } from './versao.js'

export const FORMATO = 1

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

export function envelopar(
  semente: string,
  hoje: string,
  pessoa: Pessoa,
): EnvelopeDaPessoa {
  return { formato: FORMATO, motor: MOTOR, semente, hoje, pessoa }
}

export function envelopeDoLote(
  n: number,
  opcoes: OpcoesResolvidas,
): EnvelopeDasPessoas {
  const pessoas = Array.from(pessoasDoLote(n, opcoes), (p) => p.pessoa)
  return {
    formato: FORMATO,
    motor: MOTOR,
    semente: opcoes.semente,
    hoje: opcoes.hoje,
    pessoas,
  }
}

export function gerarEnvelopeDaPessoa(
  opcoes: OpcoesDaPessoa = {},
): EnvelopeDaPessoa {
  const resolvidas = resolverOpcoes(opcoes)
  return envelopar(
    resolvidas.semente,
    resolvidas.hoje,
    pessoaResolvida(resolvidas),
  )
}

export function gerarEnvelopeDasPessoas(
  n: number,
  opcoes: OpcoesDaPessoa = {},
): EnvelopeDasPessoas {
  return envelopeDoLote(n, resolverOpcoes(opcoes))
}
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/envelope.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 6: Trava de portabilidade**

`packages/core/src/portabilidade.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = __dirname
const PROIBIDOS = [
  /\bprocess\./,
  /from 'node:/,
  /\brequire\(/,
  /\bBuffer\b/,
  /\bdocument\./,
  /\bwindow\./,
]

function modulosDeProducao(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(pasta, entrada.name)
    if (entrada.isDirectory())
      return entrada.name === 'bin' ? [] : modulosDeProducao(caminho)
    const ehModulo =
      entrada.name.endsWith('.ts') && !entrada.name.endsWith('.test.ts')
    return ehModulo ? [caminho] : []
  })
}

// O motor roda em Node, Bun, Deno e no navegador (extensão e Playwright):
// só src/bin conversa com o processo.
test('fora de src/bin, nenhum módulo usa API de Node ou do navegador', () => {
  const violacoes = modulosDeProducao(SRC).flatMap((arquivo) => {
    const texto = readFileSync(arquivo, 'utf8')
    return PROIBIDOS.filter((proibido) => proibido.test(texto)).map(
      (proibido) => `${relative(SRC, arquivo)}: ${proibido}`,
    )
  })
  expect(violacoes).toEqual([])
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/portabilidade.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`. Este teste nasce verde porque é uma trava: prove que ele morde.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && printf "export const ambiente = process.env\n" > src/sonda-portabilidade.ts && ./node_modules/.bin/jest src/portabilidade.test.ts; echo "exit=$?"; /bin/rm src/sonda-portabilidade.ts
```

Expected: FAIL listando `sonda-portabilidade.ts: /\bprocess\./`, `exit=1`; o arquivo de sonda é apagado no mesmo comando.

- [ ] **Step 7: Raiz completa**

`packages/core/src/index.test.ts` (versão final):

```ts
import * as raiz from './index.js'

test('a raiz expõe exatamente a API do contrato', () => {
  expect(Object.keys(raiz).sort()).toEqual([
    'DOMINIO_EMAIL_PADRAO',
    'ErroDeOpcao',
    'FORMATO',
    'LIMITE_DO_LOTE',
    'MOTOR',
    'gerarEnvelopeDaPessoa',
    'gerarEnvelopeDasPessoas',
    'gerarPessoa',
    'gerarPessoas',
    'hojeEmSaoPaulo',
    'rngDeSemente',
    'sementeAleatoria',
  ])
  expect(raiz.DOMINIO_EMAIL_PADRAO).toBe('tuamaeaquelaursa.com')
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/index.test.ts; echo "exit=$?"
```

Expected: FAIL (faltam `FORMATO`, `MOTOR` e os envelopes), `exit=1`.

`packages/core/src/index.ts` (versão final):

```ts
export {
  type EnvelopeDaPessoa,
  type EnvelopeDasPessoas,
  FORMATO,
  gerarEnvelopeDaPessoa,
  gerarEnvelopeDasPessoas,
} from './envelope.js'
export { gerarPessoa, gerarPessoas, type OpcoesDaPessoa } from './gerar.js'
export { hojeEmSaoPaulo } from './hoje.js'
export { DOMINIO_EMAIL as DOMINIO_EMAIL_PADRAO } from './nome.js'
export { ErroDeOpcao, LIMITE_DO_LOTE, type NomeDaOpcao } from './opcoes.js'
export type { Pessoa } from './pessoa.js'
export type { Prng } from './prng.js'
export { rngDeSemente, sementeAleatoria, type Semente } from './semente.js'
export type { UF } from './uf.js'
export { MOTOR } from './versao.js'
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/index.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 8: Lint, build e suíte**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core lint; echo "exit=$?"; pnpm --filter @pilutech/botai-core build; echo "exit=$?"; pnpm --filter @pilutech/botai-core test; echo "exit=$?"
```

Expected: os três `exit=0`. Aplique a regra R5 (linha da tarefa 4): se o `test` do core já roda o `pacote.test.mjs` e só ele falhou, acrescente os arquivos e rode a linha de novo; se não roda, rode o `pacote.test.mjs` à parte até `exit=0`.

- [ ] **Step 9: A extensão continua verde com a raiz nova**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai test; echo "exit=$?"; pnpm --filter @pilutech/botai lint; echo "exit=$?"
```

Expected: os dois `exit=0`.

- [ ] **Step 10: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/scripts/gerar-versao.mjs packages/core/src/versao.ts packages/core/src/versao.test.ts packages/core/src/envelope.ts packages/core/src/envelope.test.ts packages/core/src/portabilidade.test.ts packages/core/src/index.ts packages/core/src/index.test.ts packages/core/package.json packages/core/scripts/pacote.test.mjs pnpm-lock.yaml && /usr/bin/git commit -m "feat(core): envelope com formato e motor, versão 0.2.0"; echo "exit=$?"
```

Expected: `exit=0`.

---

### Task 5: Visão plana, CSV e SQL (`/plano`)

**Files:**

- Create: `packages/core/src/plano.ts`, `packages/core/src/plano.test.ts`
- Modify: `packages/core/package.json` (`exports["./plano"]` e `publishConfig.exports["./plano"]`), `packages/core/scripts/pacote.test.mjs` (R5), `.github/workflows/ci.yml` (só pela regra R7)

**Interfaces:**

- Consumes: `Pessoa` (tarefa 2), `gerarPessoas` (tarefa 3, só no teste).
- Produces (`src/plano.ts`, subpath `@pilutech/botai-core/plano`):
  - `COLUNAS` (33 nomes, em ordem), `type Coluna`, `type ValorPlano = string | number | null`, `type PessoaPlana = Record<Coluna, ValorPlano>`, `class ErroDoPlano extends Error`;
  - `pessoaPlana(pessoa: Pessoa): PessoaPlana`; `lerCampos(texto: string): Coluna[]`;
  - `cabecalhoCsv(colunas?: readonly Coluna[]): string`; `linhaCsv(pessoa: Pessoa, colunas?): string`; `paraCsv(pessoas: readonly Pessoa[], colunas?): string`;
  - `FORMATOS = ['json', 'ndjson', 'csv', 'sql']`, `type Formato` (os formatos da saída de lote; a CLI da tarefa 8 e o servidor da fase 2 leem daqui);
  - `DIALETOS = ['postgres', 'mysql', 'sqlite']`, `type Dialeto`, `interface OpcoesDoSql { dialeto?: Dialeto; tabela?: string; colunas?: readonly Coluna[] }`;
  - `lerDialeto(texto: string): Dialeto`; `lerTabela(texto: string): string`; `insertSql(pessoa: Pessoa, opcoes?: OpcoesDoSql): string`; `paraSql(pessoas: readonly Pessoa[], opcoes?: OpcoesDoSql): string`.

Colunas e origem (vão para o README e o `CLAUDE.md` na tarefa 10):

| Coluna             | Campo da `Pessoa`                   | Coluna                  | Campo da `Pessoa`      |
| ------------------ | ----------------------------------- | ----------------------- | ---------------------- |
| `nome`             | `nome.completo`                     | `celular`               | `celular.formatado`    |
| `prenome`          | `nome.prenome`                      | `celular_e164`          | `celular.e164`         |
| `sobrenomes`       | `nome.sobrenomes` unidos por espaço | `cep`                   | `endereco.cep`         |
| `sexo`             | `nome.sexo`                         | `logradouro`            | `endereco.logradouro`  |
| `nascimento`       | `nascimento.iso`                    | `numero`                | `endereco.numero`      |
| `idade`            | `nascimento.idade` (número)         | `complemento`           | `endereco.complemento` |
| `cpf`              | `cpf`                               | `bairro`                | `endereco.bairro`      |
| `rg`               | `rg.numero`                         | `cidade`                | `endereco.cidade`      |
| `rg_orgao_emissor` | `rg.orgaoEmissor`                   | `uf`                    | `endereco.uf`          |
| `rg_uf`            | `rg.uf`                             | `empresa_razao_social`  | `empresa.razaoSocial`  |
| `pis`              | `pis`                               | `empresa_nome_fantasia` | `empresa.nomeFantasia` |
| `titulo_eleitor`   | `tituloEleitor`                     | `empresa_cnpj`          | `empresa.cnpj`         |
| `email`            | `email.endereco`                    | `cartao_bandeira`       | `cartao.bandeira`      |
| `email_usuario`    | `email.usuario`                     | `cartao_numero`         | `cartao.numero`        |
| `email_caixa_url`  | `email.caixaUrl` (pode ser `null`)  | `cartao_titular`        | `cartao.titular`       |
| `senha`            | `senha`                             | `cartao_validade`       | `cartao.validade`      |
|                    |                                     | `cartao_cvv`            | `cartao.cvv`           |

- [ ] **Step 1: Teste que falha**

`packages/core/src/plano.test.ts` (o último teste de SQL executa o INSERT gerado num SQLite em memória, por `node:sqlite` num processo filho):

```ts
import { spawnSync } from 'node:child_process'
import { gerarPessoas } from './gerar.js'
import { montarPessoa, type Pessoa } from './pessoa.js'
import {
  cabecalhoCsv,
  COLUNAS,
  ErroDoPlano,
  FORMATOS,
  insertSql,
  lerCampos,
  lerDialeto,
  lerTabela,
  linhaCsv,
  paraCsv,
  paraSql,
  pessoaPlana,
} from './plano.js'
import { sfc32 } from './prng.js'

const DOURADA = montarPessoa(sfc32(1, 2, 3, 4), '2026-10-01')
const comNome = (p: Pessoa, completo: string): Pessoa => ({
  ...p,
  nome: { ...p.nome, completo },
})
const semCaixa = (p: Pessoa): Pessoa => ({
  ...p,
  email: { ...p.email, caixaUrl: null },
})

describe('pessoaPlana', () => {
  test('a pessoa dourada achatada, coluna por coluna', () => {
    expect(pessoaPlana(DOURADA)).toEqual({
      nome: 'Vinícius Oliveira Costa',
      prenome: 'Vinícius',
      sobrenomes: 'Oliveira Costa',
      sexo: 'M',
      nascimento: '1993-05-29',
      idade: 33,
      cpf: '647.692.234-39',
      rg: '25.547.934-7',
      rg_orgao_emissor: 'SSP',
      rg_uf: 'SP',
      pis: '161.51127.87-1',
      titulo_eleitor: '6080 6730 1600',
      email: 'vinicius-costa-6607@tuamaeaquelaursa.com',
      email_usuario: 'vinicius-costa-6607',
      email_caixa_url: 'https://tuamaeaquelaursa.com/vinicius-costa-6607',
      senha: 's7YZgw&$iLak',
      celular: '(84) 99114-8037',
      celular_e164: '+5584991148037',
      cep: '59090-000',
      logradouro: 'Avenida Engenheiro Roberto Freire',
      numero: '3360',
      complemento: 'Apto 74',
      bairro: 'Ponta Negra',
      cidade: 'Natal',
      uf: 'RN',
      empresa_razao_social: 'Oliveira & Costa Logística Ltda',
      empresa_nome_fantasia: 'Costa Digital',
      empresa_cnpj: '35.728.569/0001-52',
      cartao_bandeira: 'mastercard',
      cartao_numero: '5555555555554444',
      cartao_titular: 'VINICIUS O COSTA',
      cartao_validade: '08/28',
      cartao_cvv: '430',
    })
  })

  test('as chaves saem na ordem de COLUNAS', () => {
    expect(Object.keys(pessoaPlana(DOURADA))).toEqual([...COLUNAS])
  })

  test('sem caixa pública, email_caixa_url é null', () => {
    expect(pessoaPlana(semCaixa(DOURADA)).email_caixa_url).toBeNull()
  })
})

describe('lerCampos', () => {
  test('aceita espaços e mantém a ordem pedida', () => {
    expect(lerCampos('cpf, nome ,idade')).toEqual(['cpf', 'nome', 'idade'])
  })

  test.each([
    ['', 'vazia'],
    ['nome,', 'vazia'],
    ['nome,nome', 'repetida "nome"'],
    ['nome,Nome', 'desconhecida "Nome"'],
    ['endereco', 'desconhecida "endereco"'],
  ])('recusa %j', (texto, trecho) => {
    expect(() => lerCampos(texto)).toThrow(ErroDoPlano)
    expect(() => lerCampos(texto)).toThrow(trecho)
  })
})

describe('CSV (RFC 4180)', () => {
  test('cabeçalho com os nomes das colunas e CRLF', () => {
    expect(cabecalhoCsv(['nome', 'cpf'])).toBe('nome,cpf\r\n')
    expect(cabecalhoCsv()).toBe(`${COLUNAS.join(',')}\r\n`)
  })

  test('linha da pessoa dourada, todas as colunas', () => {
    expect(linhaCsv(DOURADA)).toBe(
      'Vinícius Oliveira Costa,Vinícius,Oliveira Costa,M,1993-05-29,33,647.692.234-39,25.547.934-7,SSP,SP,161.51127.87-1,6080 6730 1600,vinicius-costa-6607@tuamaeaquelaursa.com,vinicius-costa-6607,https://tuamaeaquelaursa.com/vinicius-costa-6607,s7YZgw&$iLak,(84) 99114-8037,+5584991148037,59090-000,Avenida Engenheiro Roberto Freire,3360,Apto 74,Ponta Negra,Natal,RN,Oliveira & Costa Logística Ltda,Costa Digital,35.728.569/0001-52,mastercard,5555555555554444,VINICIUS O COSTA,08/28,430\r\n',
    )
  })

  test('aspas, vírgula e quebra de linha vão entre aspas, com aspas dobradas', () => {
    expect(linhaCsv(comNome(DOURADA, 'Joana "Ju", da Silva'), ['nome'])).toBe(
      '"Joana ""Ju"", da Silva"\r\n',
    )
    expect(linhaCsv(comNome(DOURADA, 'linha1\nlinha2'), ['nome'])).toBe(
      '"linha1\nlinha2"\r\n',
    )
  })

  test('null vira campo vazio; texto vazio vira ""', () => {
    expect(linhaCsv(semCaixa(DOURADA), ['email_caixa_url', 'idade'])).toBe(
      ',33\r\n',
    )
    expect(linhaCsv(comNome(DOURADA, ''), ['nome'])).toBe('""\r\n')
  })

  test('paraCsv: cabeçalho e uma linha por pessoa', () => {
    const lote = gerarPessoas(3, { semente: 'csv', hoje: '2026-10-05' })
    expect(paraCsv(lote, ['nome', 'cpf']).split('\r\n')).toEqual([
      'nome,cpf',
      ...lote.map((p) => `${p.nome.completo},${p.cpf}`),
      '',
    ])
  })
})

describe('SQL', () => {
  test('postgres (padrão): aspas duplas nos nomes, simples nos textos, número cru', () => {
    expect(
      insertSql(DOURADA, {
        colunas: ['nome', 'idade', 'email_caixa_url', 'senha'],
      }),
    ).toBe(
      `INSERT INTO "pessoas" ("nome", "idade", "email_caixa_url", "senha") VALUES ('Vinícius Oliveira Costa', 33, 'https://tuamaeaquelaursa.com/vinicius-costa-6607', 's7YZgw&$iLak');\n`,
    )
  })

  test('aspas simples são dobradas em todo dialeto', () => {
    for (const dialeto of ['postgres', 'mysql', 'sqlite'] as const)
      expect(
        insertSql(comNome(DOURADA, "Joana D'Arc"), {
          dialeto,
          colunas: ['nome'],
        }),
      ).toContain("VALUES ('Joana D''Arc');")
  })

  test('mysql: crase nos nomes, esquema.tabela e barra invertida escapada', () => {
    expect(
      insertSql(comNome(DOURADA, 'a\\b'), {
        dialeto: 'mysql',
        tabela: 'app.clientes',
        colunas: ['nome'],
      }),
    ).toBe("INSERT INTO `app`.`clientes` (`nome`) VALUES ('a\\\\b');\n")
  })

  test('postgres e sqlite: barra invertida fica como está', () => {
    for (const dialeto of ['postgres', 'sqlite'] as const)
      expect(
        insertSql(comNome(DOURADA, 'a\\b'), { dialeto, colunas: ['nome'] }),
      ).toBe('INSERT INTO "pessoas" ("nome") VALUES (\'a\\b\');\n')
  })

  test('null vira NULL', () => {
    expect(insertSql(semCaixa(DOURADA), { colunas: ['email_caixa_url'] })).toBe(
      'INSERT INTO "pessoas" ("email_caixa_url") VALUES (NULL);\n',
    )
  })

  test('sem colunas, vão todas, na ordem de COLUNAS', () => {
    expect(insertSql(DOURADA)).toContain(
      `(${COLUNAS.map((c) => `"${c}"`).join(', ')})`,
    )
  })

  test('paraSql: um INSERT por pessoa', () => {
    const lote = gerarPessoas(4, { semente: 'sql', hoje: '2026-10-05' })
    expect(paraSql(lote, { dialeto: 'sqlite' }).split('\n')).toHaveLength(5)
  })

  test('o SQL do sqlite roda de verdade e devolve a visão plana', () => {
    const lote = gerarPessoas(3, {
      semente: 'sqlite',
      hoje: '2026-10-05',
      dominioEmail: 'example.com',
    })
    lote[0] = comNome(lote[0], `Joana D'Arc "Ju", a\\b; DROP TABLE x;--`)
    const ddl = `CREATE TABLE "pessoas" (${COLUNAS.map(
      (c) => `"${c}" ${c === 'idade' ? 'INTEGER' : 'TEXT'}`,
    ).join(', ')});`
    const programa = [
      "const { DatabaseSync } = require('node:sqlite')",
      "const entrada = JSON.parse(require('node:fs').readFileSync(0, 'utf8'))",
      "const db = new DatabaseSync(':memory:')",
      'db.exec(entrada.ddl)',
      'db.exec(entrada.sql)',
      "process.stdout.write(JSON.stringify(db.prepare('SELECT * FROM pessoas').all()))",
    ].join('\n')
    const r = spawnSync(process.execPath, ['--no-warnings', '-e', programa], {
      input: JSON.stringify({ ddl, sql: paraSql(lote, { dialeto: 'sqlite' }) }),
      encoding: 'utf8',
    })
    expect(r.stderr).toBe('')
    expect(JSON.parse(r.stdout)).toEqual(lote.map(pessoaPlana))
  })
})

describe('lerTabela e lerDialeto', () => {
  test.each(['pessoas', 'app.pessoas', '_t1', 'P2', 'x'.repeat(63)])(
    'aceita a tabela %j',
    (tabela) => {
      expect(lerTabela(tabela)).toBe(tabela)
    },
  )

  test.each([
    '',
    '1x',
    'x;drop table y',
    'a.b.c',
    'pes soas',
    '"x"',
    'tabela-1',
    'x'.repeat(64),
  ])('recusa a tabela %j', (tabela) => {
    expect(() => lerTabela(tabela)).toThrow(ErroDoPlano)
  })

  test('insertSql também recusa tabela inválida', () => {
    expect(() => insertSql(DOURADA, { tabela: 'x;y' })).toThrow(ErroDoPlano)
  })

  test('formatos e dialetos conhecidos, e recusa do resto', () => {
    expect(FORMATOS).toEqual(['json', 'ndjson', 'csv', 'sql'])
    expect(lerDialeto('mysql')).toBe('mysql')
    expect(() => lerDialeto('oracle')).toThrow('dialeto desconhecido "oracle"')
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/plano.test.ts; echo "exit=$?"
```

Expected: FAIL com `Cannot find module './plano.js'`, `exit=1`.

- [ ] **Step 2: Implementar**

`packages/core/src/plano.ts`:

```ts
import type { Pessoa } from './pessoa.js'

export const COLUNAS = [
  'nome',
  'prenome',
  'sobrenomes',
  'sexo',
  'nascimento',
  'idade',
  'cpf',
  'rg',
  'rg_orgao_emissor',
  'rg_uf',
  'pis',
  'titulo_eleitor',
  'email',
  'email_usuario',
  'email_caixa_url',
  'senha',
  'celular',
  'celular_e164',
  'cep',
  'logradouro',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
  'empresa_razao_social',
  'empresa_nome_fantasia',
  'empresa_cnpj',
  'cartao_bandeira',
  'cartao_numero',
  'cartao_titular',
  'cartao_validade',
  'cartao_cvv',
] as const

export type Coluna = (typeof COLUNAS)[number]
export type ValorPlano = string | number | null
export type PessoaPlana = Record<Coluna, ValorPlano>

const VALOR_DA_COLUNA: Record<Coluna, (p: Pessoa) => ValorPlano> = {
  nome: (p) => p.nome.completo,
  prenome: (p) => p.nome.prenome,
  sobrenomes: (p) => p.nome.sobrenomes.join(' '),
  sexo: (p) => p.nome.sexo,
  nascimento: (p) => p.nascimento.iso,
  idade: (p) => p.nascimento.idade,
  cpf: (p) => p.cpf,
  rg: (p) => p.rg.numero,
  rg_orgao_emissor: (p) => p.rg.orgaoEmissor,
  rg_uf: (p) => p.rg.uf,
  pis: (p) => p.pis,
  titulo_eleitor: (p) => p.tituloEleitor,
  email: (p) => p.email.endereco,
  email_usuario: (p) => p.email.usuario,
  email_caixa_url: (p) => p.email.caixaUrl,
  senha: (p) => p.senha,
  celular: (p) => p.celular.formatado,
  celular_e164: (p) => p.celular.e164,
  cep: (p) => p.endereco.cep,
  logradouro: (p) => p.endereco.logradouro,
  numero: (p) => p.endereco.numero,
  complemento: (p) => p.endereco.complemento,
  bairro: (p) => p.endereco.bairro,
  cidade: (p) => p.endereco.cidade,
  uf: (p) => p.endereco.uf,
  empresa_razao_social: (p) => p.empresa.razaoSocial,
  empresa_nome_fantasia: (p) => p.empresa.nomeFantasia,
  empresa_cnpj: (p) => p.empresa.cnpj,
  cartao_bandeira: (p) => p.cartao.bandeira,
  cartao_numero: (p) => p.cartao.numero,
  cartao_titular: (p) => p.cartao.titular,
  cartao_validade: (p) => p.cartao.validade,
  cartao_cvv: (p) => p.cartao.cvv,
}

export class ErroDoPlano extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDoPlano'
  }
}

export function pessoaPlana(pessoa: Pessoa): PessoaPlana {
  return Object.fromEntries(
    COLUNAS.map((c) => [c, VALOR_DA_COLUNA[c](pessoa)]),
  ) as PessoaPlana
}

export function lerCampos(texto: string): Coluna[] {
  const nomes = texto.split(',').map((c) => c.trim())
  if (nomes.some((c) => c === ''))
    throw new ErroDoPlano('campos: lista vazia ou com vírgula sobrando')
  const repetida = nomes.find((c, i) => nomes.indexOf(c) !== i)
  if (repetida) throw new ErroDoPlano(`campos: coluna repetida "${repetida}"`)
  const desconhecida = nomes.find(
    (c) => !(COLUNAS as readonly string[]).includes(c),
  )
  if (desconhecida)
    throw new ErroDoPlano(
      `campos: coluna desconhecida "${desconhecida}" (colunas: ${COLUNAS.join(', ')})`,
    )
  return nomes as Coluna[]
}

function campoCsv(valor: ValorPlano): string {
  if (valor === null) return ''
  if (typeof valor === 'number') return String(valor)
  if (valor === '' || /[",\r\n]/.test(valor))
    return `"${valor.replace(/"/g, '""')}"`
  return valor
}

export function cabecalhoCsv(colunas: readonly Coluna[] = COLUNAS): string {
  return `${colunas.join(',')}\r\n`
}

export function linhaCsv(
  pessoa: Pessoa,
  colunas: readonly Coluna[] = COLUNAS,
): string {
  const campos = colunas.map((c) => campoCsv(VALOR_DA_COLUNA[c](pessoa)))
  return `${campos.join(',')}\r\n`
}

export function paraCsv(
  pessoas: readonly Pessoa[],
  colunas: readonly Coluna[] = COLUNAS,
): string {
  return (
    cabecalhoCsv(colunas) + pessoas.map((p) => linhaCsv(p, colunas)).join('')
  )
}

export const FORMATOS = ['json', 'ndjson', 'csv', 'sql'] as const
export type Formato = (typeof FORMATOS)[number]

export const DIALETOS = ['postgres', 'mysql', 'sqlite'] as const
export type Dialeto = (typeof DIALETOS)[number]

export interface OpcoesDoSql {
  dialeto?: Dialeto
  tabela?: string
  colunas?: readonly Coluna[]
}

const PARTE_DO_NOME_SQL = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/

export function lerDialeto(texto: string): Dialeto {
  if (!(DIALETOS as readonly string[]).includes(texto))
    throw new ErroDoPlano(
      `dialeto desconhecido "${texto}" (use ${DIALETOS.join(', ')})`,
    )
  return texto as Dialeto
}

export function lerTabela(texto: string): string {
  const partes = texto.split('.')
  if (partes.length > 2 || !partes.every((p) => PARTE_DO_NOME_SQL.test(p)))
    throw new ErroDoPlano(
      `tabela inválida "${texto}" (letras, dígitos e _, até 63 caracteres; opcionalmente esquema.tabela)`,
    )
  return texto
}

function identificador(nome: string, dialeto: Dialeto): string {
  return dialeto === 'mysql' ? `\`${nome}\`` : `"${nome}"`
}

function literalSql(valor: ValorPlano, dialeto: Dialeto): string {
  if (valor === null) return 'NULL'
  if (typeof valor === 'number') return String(valor)
  const escapado = dialeto === 'mysql' ? valor.replace(/\\/g, '\\\\') : valor
  return `'${escapado.replace(/'/g, "''")}'`
}

export function insertSql(pessoa: Pessoa, opcoes: OpcoesDoSql = {}): string {
  const dialeto = opcoes.dialeto ?? 'postgres'
  const colunas = opcoes.colunas ?? COLUNAS
  const tabela = lerTabela(opcoes.tabela ?? 'pessoas')
    .split('.')
    .map((p) => identificador(p, dialeto))
    .join('.')
  const nomes = colunas.map((c) => identificador(c, dialeto)).join(', ')
  const valores = colunas
    .map((c) => literalSql(VALOR_DA_COLUNA[c](pessoa), dialeto))
    .join(', ')
  return `INSERT INTO ${tabela} (${nomes}) VALUES (${valores});\n`
}

export function paraSql(
  pessoas: readonly Pessoa[],
  opcoes: OpcoesDoSql = {},
): string {
  return pessoas.map((p) => insertSql(p, opcoes)).join('')
}
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/plano.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 3: Subpath `./plano`**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -e '
const fs = require("fs")
const p = JSON.parse(fs.readFileSync("package.json", "utf8"))
const comoPessoa = (exports) => ({ ...exports, "./plano": JSON.parse(JSON.stringify(exports["./pessoa"]).replaceAll("pessoa", "plano")) })
p.exports = comoPessoa(p.exports)
if (p.publishConfig?.exports) p.publishConfig.exports = comoPessoa(p.publishConfig.exports)
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n")
'; echo "exit=$?"; node -p 'const p=require("./package.json"); JSON.stringify([p.exports["./plano"], p.publishConfig.exports?.["./plano"]])'
```

Expected: `exit=0` e `["./src/plano.ts",{"types":"./dist/plano.d.ts","default":"./dist/plano.js"}]` (o formato da `./pessoa` em cada manifesto). Regra R2: com bundler de entradas, acrescente `src/plano.ts`. Regra R7: se o C12 achou o job do core em Node < 22.13, troque o `node-version` dele por `'24.14.0'` agora.

- [ ] **Step 4: Lint, build e suíte**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core lint; echo "exit=$?"; pnpm --filter @pilutech/botai-core build; echo "exit=$?"; /bin/ls packages/core/dist/plano.js; echo "exit=$?"; pnpm --filter @pilutech/botai-core test; echo "exit=$?"
```

Expected: os quatro `exit=0`. Aplique a regra R5 (linha da tarefa 5): se o `test` do core já roda o `pacote.test.mjs` e só ele falhou, confira se a derivação do `exports` cobriu `dist/plano.*` e rode a linha de novo; se não roda, rode o `pacote.test.mjs` à parte até `exit=0`.

- [ ] **Step 5: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/plano.ts packages/core/src/plano.test.ts packages/core/package.json packages/core/scripts/pacote.test.mjs .github/workflows/ci.yml && /usr/bin/git commit -m "feat(core): visão plana, CSV e SQL por dialeto (/plano)"; echo "exit=$?"
```

Expected: `exit=0` (o `git add` de arquivo versionado sem mudança não faz nada; o `ci.yml` só muda pela R7).

---

### Task 6: JSON Schema do envelope e arquivos dourados v1

**Files:**

- Create: `packages/core/dourado/v1/indice.json`, `packages/core/scripts/gerar-dourados.mjs`, `packages/core/src/envelope.dourado.test.ts`
- Create (gerados pelo script): `packages/core/dourado/v1/pessoa-semente-numero.json`, `pessoa-semente-texto.json`, `pessoa-semente-unicode.json`, `pessoa-uf.json`, `pessoa-dominio-email.json`, `pessoa-29-de-fevereiro.json`, `pessoas-lote.json`, `pessoas-lote.csv`, `pessoas-lote.postgres.sql`, `pessoas-lote.mysql.sql`, `pessoas-lote.sqlite.sql`, `pessoas-1000.json`
- Create: `packages/core/esquema/envelope-v1.schema.json`, `packages/core/src/envelope.esquema.test.ts`
- Create: `extensao/src/test/pessoa-dourada.test.ts`
- Create or Modify: `.prettierignore` (raiz do repo)
- Modify: `packages/core/package.json` (`files`, `exports` e `publishConfig.exports` com `"./esquema/envelope-v1.schema.json"`, devDependency `ajv`), `packages/core/scripts/pacote.test.mjs` (R5), `pnpm-lock.yaml`

**Interfaces:**

- Consumes: `gerarEnvelopeDaPessoa`, `gerarEnvelopeDasPessoas`, `EnvelopeDaPessoa`, `EnvelopeDasPessoas` (tarefa 4); `paraCsv`, `paraSql`, `Dialeto` (tarefa 5); `gerarPessoa` pela raiz (extensão).
- Produces:
  - `dourado/v1/indice.json`: lista de `{ arquivo, n?, compacto?, opcoes: OpcoesDaPessoa, derivados?: { arquivo, formato: 'csv' | 'sql', dialeto? }[] }`. Os arquivos `.json` são envelopes (contrato); `.csv` e `.sql` são derivados do lote `pessoas-lote.json`, gerados por `paraCsv`/`paraSql` com todas as colunas (o `.sql` sem a linha de comentário que a CLI põe antes). Fases 2 e 3 leem esta pasta.
  - `scripts/gerar-dourados.mjs`: regrava todos os arquivos a partir do `dist/`.
  - `esquema/envelope-v1.schema.json`: JSON Schema 2020-12 de `EnvelopeDaPessoa | EnvelopeDasPessoas`, publicado em `@pilutech/botai-core/esquema/envelope-v1.schema.json`.

- [ ] **Step 1: Ajv como devDependency**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core add -D ajv@^8.20.0; echo "exit=$?"; pnpm dedupe --check; echo "exit=$?"; pnpm audit --audit-level high; echo "exit=$?"; node -p "Object.keys(require('./packages/core/package.json').dependencies ?? {}).length"
```

Expected: três `exit=0` e `0` (o core continua sem dependência de runtime). O `ajv` não tem script de instalação; nada muda no `allowBuilds`.

- [ ] **Step 2: Índice, gerador e teste que falha dos dourados**

`packages/core/dourado/v1/indice.json`:

```json
[
  {
    "arquivo": "pessoa-semente-numero.json",
    "opcoes": { "semente": 42, "hoje": "2026-10-05" }
  },
  {
    "arquivo": "pessoa-semente-texto.json",
    "opcoes": { "semente": "botai", "hoje": "2026-10-05" }
  },
  {
    "arquivo": "pessoa-semente-unicode.json",
    "opcoes": { "semente": "Teresina-PI 🧀 ação", "hoje": "2026-10-05" }
  },
  {
    "arquivo": "pessoa-uf.json",
    "opcoes": { "semente": "botai", "hoje": "2026-10-05", "uf": "PI" }
  },
  {
    "arquivo": "pessoa-dominio-email.json",
    "opcoes": {
      "semente": "botai",
      "hoje": "2026-10-05",
      "dominioEmail": "example.com"
    }
  },
  {
    "arquivo": "pessoa-29-de-fevereiro.json",
    "opcoes": { "semente": "bissexto", "hoje": "2028-02-29" }
  },
  {
    "arquivo": "pessoas-lote.json",
    "n": 5,
    "opcoes": {
      "semente": "lote",
      "hoje": "2026-10-05",
      "dominioEmail": "example.com"
    },
    "derivados": [
      { "arquivo": "pessoas-lote.csv", "formato": "csv" },
      {
        "arquivo": "pessoas-lote.postgres.sql",
        "formato": "sql",
        "dialeto": "postgres"
      },
      {
        "arquivo": "pessoas-lote.mysql.sql",
        "formato": "sql",
        "dialeto": "mysql"
      },
      {
        "arquivo": "pessoas-lote.sqlite.sql",
        "formato": "sql",
        "dialeto": "sqlite"
      }
    ]
  },
  {
    "arquivo": "pessoas-1000.json",
    "n": 1000,
    "compacto": true,
    "opcoes": { "semente": "mil-3", "hoje": "2026-10-05" }
  }
]
```

`packages/core/scripts/gerar-dourados.mjs`:

```js
import { readFileSync, writeFileSync } from 'node:fs'
import {
  gerarEnvelopeDaPessoa,
  gerarEnvelopeDasPessoas,
} from '../dist/index.js'
import { paraCsv, paraSql } from '../dist/plano.js'

const pasta = new URL('../dourado/v1/', import.meta.url)
const indice = JSON.parse(readFileSync(new URL('indice.json', pasta), 'utf8'))

for (const item of indice) {
  const envelope =
    item.n === undefined
      ? gerarEnvelopeDaPessoa(item.opcoes)
      : gerarEnvelopeDasPessoas(item.n, item.opcoes)
  const json = item.compacto
    ? JSON.stringify(envelope)
    : JSON.stringify(envelope, null, 2)
  writeFileSync(new URL(item.arquivo, pasta), `${json}\n`)
  for (const derivado of item.derivados ?? []) {
    const texto =
      derivado.formato === 'csv'
        ? paraCsv(envelope.pessoas)
        : paraSql(envelope.pessoas, { dialeto: derivado.dialeto })
    writeFileSync(new URL(derivado.arquivo, pasta), texto)
  }
  console.log(`dourado/v1/${item.arquivo}`)
}
```

`packages/core/src/envelope.dourado.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type EnvelopeDaPessoa,
  type EnvelopeDasPessoas,
  gerarEnvelopeDaPessoa,
  gerarEnvelopeDasPessoas,
} from './envelope.js'
import type { OpcoesDaPessoa } from './gerar.js'
import { type Dialeto, paraCsv, paraSql } from './plano.js'

interface ItemDoIndice {
  arquivo: string
  n?: number
  compacto?: boolean
  opcoes: OpcoesDaPessoa & { semente: number | string; hoje: string }
  derivados?: { arquivo: string; formato: 'csv' | 'sql'; dialeto?: Dialeto }[]
}

const DOURADO = join(__dirname, '..', 'dourado', 'v1')
const ler = (arquivo: string) => readFileSync(join(DOURADO, arquivo), 'utf8')
const INDICE = JSON.parse(ler('indice.json')) as ItemDoIndice[]

// motor muda a cada versão; o que o dourado trava é a pessoa.
const semMotor = (e: EnvelopeDaPessoa | EnvelopeDasPessoas) => ({
  ...e,
  motor: '',
})

describe('arquivos dourados v1 (biblioteca)', () => {
  test('o índice cobre semente numérica, texto, Unicode, uf, domínio, 29/02, lote e 1000', () => {
    expect(INDICE.map((i) => i.arquivo)).toEqual([
      'pessoa-semente-numero.json',
      'pessoa-semente-texto.json',
      'pessoa-semente-unicode.json',
      'pessoa-uf.json',
      'pessoa-dominio-email.json',
      'pessoa-29-de-fevereiro.json',
      'pessoas-lote.json',
      'pessoas-1000.json',
    ])
  })

  test.each(INDICE.map((item) => [item.arquivo, item] as const))(
    '%s',
    (_, item) => {
      const dourado = JSON.parse(ler(item.arquivo)) as
        | EnvelopeDaPessoa
        | EnvelopeDasPessoas
      const gerado =
        item.n === undefined
          ? gerarEnvelopeDaPessoa(item.opcoes)
          : gerarEnvelopeDasPessoas(item.n, item.opcoes)
      expect(semMotor(gerado)).toEqual(semMotor(dourado))
      expect(dourado.motor).toMatch(/^\d+\.\d+\.\d+/)
      for (const derivado of item.derivados ?? []) {
        const pessoas = (gerado as EnvelopeDasPessoas).pessoas
        const texto =
          derivado.formato === 'csv'
            ? paraCsv(pessoas)
            : paraSql(pessoas, { dialeto: derivado.dialeto })
        expect(texto).toBe(ler(derivado.arquivo))
      }
    },
  )

  test('o lote de 1000 tem uma pessoa sorteada de novo (mil-3/971/2)', () => {
    const lote = JSON.parse(ler('pessoas-1000.json')) as EnvelopeDasPessoas
    expect(lote.pessoas[971].email.endereco).toBe(
      'aline-pereira-1476@tuamaeaquelaursa.com',
    )
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/envelope.dourado.test.ts; echo "exit=$?"
```

Expected: FAIL com `ENOENT` em `pessoa-semente-numero.json`, `exit=1`.

- [ ] **Step 3: Deixar a pasta fora do prettier**

O lint-staged roda `prettier --write` em `*.json` no commit: ele quebraria o `pessoas-1000.json` compacto em 1,7 MB e reformataria os outros. Acrescente a linha ao `.prettierignore` da raiz (o comando cria o arquivo se não existir):

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/grep -qx "packages/core/dourado/" .prettierignore 2>/dev/null || printf "packages/core/dourado/\n" >> .prettierignore; /bin/cat .prettierignore; echo "exit=$?"
```

Expected: a linha `packages/core/dourado/` presente, `exit=0`.

- [ ] **Step 4: Gerar os dourados e conferir à mão**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core build; echo "exit=$?"; cd /Users/piluvitu/PILUTECH/Botai/packages/core && node scripts/gerar-dourados.mjs; echo "exit=$?"; /bin/ls -l dourado/v1
```

Expected: `exit=0` duas vezes, os 8 nomes `.json` impressos e 13 arquivos na pasta (`pessoas-1000.json` com cerca de 1,1 MB). Confira três valores que os testes da tarefa 3 também fixam (se um deles não bater, pare: o motor mudou):

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -p "const t=require('./dourado/v1/pessoa-semente-texto.json'); [t.semente, t.pessoa.nome.completo, t.pessoa.cpf].join(' | ')"; node -p "require('./dourado/v1/pessoas-1000.json').pessoas[971].email.endereco"; /usr/bin/head -c 120 dourado/v1/pessoas-lote.mysql.sql; echo
```

Expected: `botai | Larissa Almeida Conceição | 610.246.647-08`, `aline-pereira-1476@tuamaeaquelaursa.com` e um `INSERT INTO \`pessoas\` (\`nome\`, …`.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/envelope.dourado.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 5: Teste que falha do JSON Schema**

`packages/core/src/envelope.esquema.test.ts` (o import nomeado `{ Ajv2020 }` funciona em CommonJS e em ESM; o import padrão não constrói sob `module: nodenext`):

```ts
import { Ajv2020 } from 'ajv/dist/2020.js'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gerarEnvelopeDaPessoa, gerarEnvelopeDasPessoas } from './envelope.js'

const RAIZ = join(__dirname, '..')
const esquema = JSON.parse(
  readFileSync(join(RAIZ, 'esquema', 'envelope-v1.schema.json'), 'utf8'),
) as object
const validar = new Ajv2020({ allErrors: true, strict: true }).compile(esquema)
const HOJE = '2026-10-05'

describe('esquema/envelope-v1.schema.json', () => {
  test('todo dourado .json (menos o índice) segue o esquema', () => {
    const pasta = join(RAIZ, 'dourado', 'v1')
    const arquivos = readdirSync(pasta).filter(
      (a) => a.endsWith('.json') && a !== 'indice.json',
    )
    expect(arquivos).toHaveLength(8)
    for (const arquivo of arquivos) {
      const ok = validar(JSON.parse(readFileSync(join(pasta, arquivo), 'utf8')))
      expect({ arquivo, erros: validar.errors ?? null }).toEqual({
        arquivo,
        erros: null,
      })
      expect(ok).toBe(true)
    }
  })

  test('envelopes com uf, outro domínio, 29/02 e lote vazio também seguem', () => {
    for (const envelope of [
      gerarEnvelopeDaPessoa({
        semente: 'x',
        hoje: HOJE,
        uf: 'AP',
        dominioEmail: 'example.com',
      }),
      gerarEnvelopeDasPessoas(500, { semente: 'y', hoje: '2028-02-29' }),
      gerarEnvelopeDasPessoas(0, { semente: 'z', hoje: HOJE }),
    ])
      expect(validar(envelope)).toBe(true)
  })

  test('recusa campo a mais, formato 2, CPF sem máscara e semente vazia', () => {
    const e = gerarEnvelopeDaPessoa({ semente: 42, hoje: HOJE })
    expect(validar({ ...e, extra: 1 })).toBe(false)
    expect(validar({ ...e, formato: 2 })).toBe(false)
    expect(validar({ ...e, pessoa: { ...e.pessoa, cpf: '64769223439' } })).toBe(
      false,
    )
    expect(validar({ ...e, semente: '' })).toBe(false)
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/envelope.esquema.test.ts; echo "exit=$?"
```

Expected: FAIL com `ENOENT` em `esquema/envelope-v1.schema.json`, `exit=1`.

- [ ] **Step 6: Escrever o esquema**

`packages/core/esquema/envelope-v1.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Envelope do Botaí, formato 1",
  "description": "Saída de @pilutech/botai-core: uma pessoa (pessoa) ou um lote (pessoas), com a semente e o hoje que a reproduzem. formato muda quando a forma muda; motor é a versão do pacote que gerou os dados.",
  "oneOf": [
    { "$ref": "#/$defs/envelopeDaPessoa" },
    { "$ref": "#/$defs/envelopeDasPessoas" }
  ],
  "$defs": {
    "envelopeDaPessoa": {
      "type": "object",
      "additionalProperties": false,
      "required": ["formato", "motor", "semente", "hoje", "pessoa"],
      "properties": {
        "formato": { "const": 1 },
        "motor": { "$ref": "#/$defs/versao" },
        "semente": { "$ref": "#/$defs/semente" },
        "hoje": { "$ref": "#/$defs/dataIso" },
        "pessoa": { "$ref": "#/$defs/pessoa" }
      }
    },
    "envelopeDasPessoas": {
      "type": "object",
      "additionalProperties": false,
      "required": ["formato", "motor", "semente", "hoje", "pessoas"],
      "properties": {
        "formato": { "const": 1 },
        "motor": { "$ref": "#/$defs/versao" },
        "semente": { "$ref": "#/$defs/semente" },
        "hoje": { "$ref": "#/$defs/dataIso" },
        "pessoas": { "type": "array", "items": { "$ref": "#/$defs/pessoa" } }
      }
    },
    "versao": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+" },
    "semente": { "type": "string", "minLength": 1, "maxLength": 256 },
    "dataIso": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "uf": {
      "enum": [
        "AC",
        "AL",
        "AP",
        "AM",
        "BA",
        "CE",
        "DF",
        "ES",
        "GO",
        "MA",
        "MT",
        "MS",
        "MG",
        "PA",
        "PB",
        "PR",
        "PE",
        "PI",
        "RJ",
        "RN",
        "RS",
        "RO",
        "RR",
        "SC",
        "SP",
        "SE",
        "TO"
      ]
    },
    "texto": { "type": "string", "minLength": 1 },
    "pessoa": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "nome",
        "nascimento",
        "cpf",
        "rg",
        "pis",
        "tituloEleitor",
        "celular",
        "email",
        "senha",
        "endereco",
        "empresa",
        "cartao"
      ],
      "properties": {
        "nome": {
          "type": "object",
          "additionalProperties": false,
          "required": ["sexo", "prenome", "sobrenomes", "completo", "noCartao"],
          "properties": {
            "sexo": { "enum": ["F", "M"] },
            "prenome": { "$ref": "#/$defs/texto" },
            "sobrenomes": {
              "type": "array",
              "items": { "$ref": "#/$defs/texto" },
              "minItems": 2,
              "maxItems": 2
            },
            "completo": { "$ref": "#/$defs/texto" },
            "noCartao": { "type": "string", "pattern": "^[A-Z ]{1,26}$" }
          }
        },
        "nascimento": {
          "type": "object",
          "additionalProperties": false,
          "required": ["iso", "br", "idade"],
          "properties": {
            "iso": { "$ref": "#/$defs/dataIso" },
            "br": { "type": "string", "pattern": "^\\d{2}/\\d{2}/\\d{4}$" },
            "idade": { "type": "integer", "minimum": 0 }
          }
        },
        "cpf": {
          "type": "string",
          "pattern": "^\\d{3}\\.\\d{3}\\.\\d{3}-\\d{2}$"
        },
        "rg": {
          "type": "object",
          "additionalProperties": false,
          "required": ["numero", "orgaoEmissor", "uf"],
          "properties": {
            "numero": {
              "type": "string",
              "pattern": "^\\d{2}\\.\\d{3}\\.\\d{3}-[\\dX]$"
            },
            "orgaoEmissor": { "const": "SSP" },
            "uf": { "const": "SP" }
          }
        },
        "pis": {
          "type": "string",
          "pattern": "^\\d{3}\\.\\d{5}\\.\\d{2}-\\d$"
        },
        "tituloEleitor": {
          "type": "string",
          "pattern": "^\\d{4} \\d{4} \\d{4}$"
        },
        "celular": {
          "type": "object",
          "additionalProperties": false,
          "required": ["ddd", "numero", "formatado", "digitos", "e164"],
          "properties": {
            "ddd": { "type": "string", "pattern": "^[1-9]{2}$" },
            "numero": { "type": "string", "pattern": "^9\\d{4}-\\d{4}$" },
            "formatado": {
              "type": "string",
              "pattern": "^\\(\\d{2}\\) 9\\d{4}-\\d{4}$"
            },
            "digitos": { "type": "string", "pattern": "^\\d{11}$" },
            "e164": { "type": "string", "pattern": "^\\+55\\d{11}$" }
          }
        },
        "email": {
          "type": "object",
          "additionalProperties": false,
          "required": ["usuario", "endereco", "caixaUrl"],
          "properties": {
            "usuario": {
              "type": "string",
              "pattern": "^[a-z]+-[a-z]+-\\d{4}$"
            },
            "endereco": {
              "type": "string",
              "pattern": "^[a-z]+-[a-z]+-\\d{4}@[a-z0-9.-]+$"
            },
            "caixaUrl": { "type": ["string", "null"], "pattern": "^https://" }
          }
        },
        "senha": { "type": "string", "minLength": 12, "maxLength": 16 },
        "endereco": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "cep",
            "logradouro",
            "bairro",
            "cidade",
            "uf",
            "ddd",
            "numero",
            "complemento"
          ],
          "properties": {
            "cep": { "type": "string", "pattern": "^\\d{5}-\\d{3}$" },
            "logradouro": { "$ref": "#/$defs/texto" },
            "bairro": { "$ref": "#/$defs/texto" },
            "cidade": { "$ref": "#/$defs/texto" },
            "uf": { "$ref": "#/$defs/uf" },
            "ddd": { "type": "string", "pattern": "^[1-9]{2}$" },
            "numero": { "type": "string", "pattern": "^\\d+$" },
            "complemento": { "type": "string" }
          }
        },
        "empresa": {
          "type": "object",
          "additionalProperties": false,
          "required": ["razaoSocial", "nomeFantasia", "cnpj"],
          "properties": {
            "razaoSocial": { "$ref": "#/$defs/texto" },
            "nomeFantasia": { "$ref": "#/$defs/texto" },
            "cnpj": {
              "type": "string",
              "pattern": "^\\d{2}\\.\\d{3}\\.\\d{3}/\\d{4}-\\d{2}$"
            }
          }
        },
        "cartao": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "bandeira",
            "numero",
            "numeroFormatado",
            "titular",
            "validade",
            "mes",
            "ano",
            "cvv"
          ],
          "properties": {
            "bandeira": { "enum": ["visa", "mastercard"] },
            "numero": { "type": "string", "pattern": "^\\d{16}$" },
            "numeroFormatado": {
              "type": "string",
              "pattern": "^\\d{4} \\d{4} \\d{4} \\d{4}$"
            },
            "titular": { "type": "string", "pattern": "^[A-Z ]{1,26}$" },
            "validade": { "type": "string", "pattern": "^\\d{2}/\\d{2}$" },
            "mes": { "type": "string", "pattern": "^(0[1-9]|1[0-2])$" },
            "ano": { "type": "string", "pattern": "^\\d{2}$" },
            "cvv": { "type": "string", "pattern": "^\\d{3}$" }
          }
        }
      }
    }
  }
}
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/envelope.esquema.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0` (o Ajv em modo `strict` não reclama de palavra-chave desconhecida).

- [ ] **Step 7: Publicar o esquema, não os dourados**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -e '
const fs = require("fs")
const p = JSON.parse(fs.readFileSync("package.json", "utf8"))
if (!p.files.includes("esquema")) p.files.push("esquema")
const ESQUEMA = "./esquema/envelope-v1.schema.json"
p.exports[ESQUEMA] = ESQUEMA
if (p.publishConfig?.exports) p.publishConfig.exports[ESQUEMA] = ESQUEMA
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n")
'; echo "exit=$?"; pnpm pack --dry-run --json 2>/dev/null | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8")); const f=r.files.map(x=>x.path); console.log(f.includes("esquema/envelope-v1.schema.json"), f.some(x=>x.startsWith("dourado/")), f.some(x=>x.startsWith("src/")))'
```

Expected: `exit=0` e `true false false` (o `pnpm pack --dry-run --json` do pnpm 11 imprime um objeto `{ name, version, filename, files: [{ path }] }`, não um array). Aplique a regra R5 (linha da tarefa 6): o esquema é um subpath que não está em `dist/`, então entra à mão na lista do `pacote.test.mjs`; rode-o até `exit=0`.

- [ ] **Step 8: A extensão confere os dourados com o core que empacota**

`extensao/src/test/pessoa-dourada.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type EnvelopeDaPessoa, gerarPessoa } from '@pilutech/botai-core'
import { describe, expect, it } from 'vitest'
import { PESSOA_DOURADA } from './pessoa-dourada'

const DOURADO = path.resolve(
  import.meta.dirname,
  '../../../packages/core/dourado/v1',
)

describe('o motor que a extensão empacota', () => {
  it('a pessoa dourada de sfc32(1, 2, 3, 4) continua a mesma', () => {
    expect(PESSOA_DOURADA.cpf).toBe('647.692.234-39')
    expect(PESSOA_DOURADA.email.endereco).toBe(
      'vinicius-costa-6607@tuamaeaquelaursa.com',
    )
  })

  it.each([
    'pessoa-semente-texto.json',
    'pessoa-semente-unicode.json',
    'pessoa-29-de-fevereiro.json',
  ])('reproduz o dourado %s', (arquivo) => {
    const dourado = JSON.parse(
      readFileSync(path.join(DOURADO, arquivo), 'utf8'),
    ) as EnvelopeDaPessoa
    expect(
      gerarPessoa({ semente: dourado.semente, hoje: dourado.hoje }),
    ).toEqual(dourado.pessoa)
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core build; echo "exit=$?"; cd /Users/piluvitu/PILUTECH/Botai/extensao && ./node_modules/.bin/wxt prepare && ./node_modules/.bin/vitest run src/test/pessoa-dourada.test.ts; echo "exit=$?"
```

Expected: PASS (4 testes), `exit=0`.

- [ ] **Step 9: Lint e suítes**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core lint; echo "exit=$?"; pnpm --filter @pilutech/botai-core test; echo "exit=$?"; pnpm --filter @pilutech/botai lint; echo "exit=$?"; pnpm --filter @pilutech/botai test; echo "exit=$?"
```

Expected: os quatro `exit=0`.

- [ ] **Step 10: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add .prettierignore packages/core/dourado packages/core/esquema packages/core/scripts/gerar-dourados.mjs packages/core/scripts/pacote.test.mjs packages/core/src/envelope.dourado.test.ts packages/core/src/envelope.esquema.test.ts packages/core/package.json pnpm-lock.yaml extensao/src/test/pessoa-dourada.test.ts && /usr/bin/git commit -m "feat(core): JSON Schema do envelope e arquivos dourados v1"; echo "exit=$?"
```

Expected: `exit=0`. Confira que o hook não reformatou os dourados: `/usr/bin/git show --stat HEAD -- packages/core/dourado/v1/pessoas-1000.json` mostra `1 +` (uma linha só de JSON compacto).

---

### Task 7: CLI: leitor de argumentos

**Files:**

- Create: `packages/core/src/cli/argumentos.ts`, `packages/core/src/cli/argumentos.test.ts`
- Modify: `packages/core/scripts/pacote.test.mjs` (R5)

**Interfaces:**

- Produces (`src/cli/argumentos.ts`): `interface DefinicaoDeOpcao { tipo: 'texto' | 'booleano'; curta?: string }`; `type DefinicaoDeOpcoes = Readonly<Record<string, DefinicaoDeOpcao>>`; `interface ArgumentosLidos { opcoes: Record<string, string | true>; posicionais: string[] }`; `class ErroDeUso extends Error`; `lerArgumentos(argv: readonly string[], definicao: DefinicaoDeOpcoes): ArgumentosLidos`.

Por que um leitor próprio e não `node:util` `parseArgs`: mensagens em português, valor que começa com traço (`--semente -5`) aceito como valor, e o módulo continua sem API de Node (a trava da tarefa 4 vale para `src/cli`). Nenhuma dependência nova.

- [ ] **Step 1: Teste que falha**

`packages/core/src/cli/argumentos.test.ts`:

```ts
import {
  type DefinicaoDeOpcoes,
  ErroDeUso,
  lerArgumentos,
} from './argumentos.js'

const DEFINICAO: DefinicaoDeOpcoes = {
  semente: { tipo: 'texto' },
  n: { tipo: 'texto', curta: 'n' },
  formatado: { tipo: 'booleano' },
  help: { tipo: 'booleano', curta: 'h' },
}

const ler = (...argv: string[]) => lerArgumentos(argv, DEFINICAO)

describe('lerArgumentos', () => {
  test('opção longa com espaço ou com =', () => {
    expect(ler('--semente', 'abc').opcoes).toEqual({ semente: 'abc' })
    expect(ler('--semente=abc').opcoes).toEqual({ semente: 'abc' })
    expect(ler('--semente=a=b').opcoes).toEqual({ semente: 'a=b' })
    expect(ler('--semente=').opcoes).toEqual({ semente: '' })
  })

  test('opção curta separada, colada ou com =', () => {
    expect(ler('-n', '5').opcoes).toEqual({ n: '5' })
    expect(ler('-n5').opcoes).toEqual({ n: '5' })
    expect(ler('-n=5').opcoes).toEqual({ n: '5' })
    expect(ler('--n', '5').opcoes).toEqual({ n: '5' })
  })

  test('valor que começa com traço é valor, não opção', () => {
    expect(ler('--semente', '-5').opcoes).toEqual({ semente: '-5' })
    expect(ler('--semente=-5').opcoes).toEqual({ semente: '-5' })
    expect(ler('-n', '-1').opcoes).toEqual({ n: '-1' })
  })

  test('booleanas', () => {
    expect(ler('--formatado', '-h').opcoes).toEqual({
      formatado: true,
      help: true,
    })
  })

  test('posicionais, "-" sozinho e tudo depois de "--"', () => {
    expect(ler('cpf', '-', '--', '--semente', 'x')).toEqual({
      opcoes: {},
      posicionais: ['cpf', '-', '--semente', 'x'],
    })
  })

  test.each([
    [['--x'], 'opção desconhecida: --x'],
    [['-x'], 'opção desconhecida: -x'],
    [['--constructor'], 'opção desconhecida: --constructor'],
    [['--semente'], '--semente precisa de um valor'],
    [['-n'], '-n precisa de um valor'],
    [['--semente', 'a', '--semente', 'b'], 'opção repetida: --semente'],
    [['-n', '1', '--n', '2'], 'opção repetida: -n'],
    [['--formatado=sim'], '--formatado não recebe valor'],
  ])('%j: %s', (argv, mensagem) => {
    expect(() => lerArgumentos(argv, DEFINICAO)).toThrow(ErroDeUso)
    expect(() => lerArgumentos(argv, DEFINICAO)).toThrow(mensagem)
  })
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/cli/argumentos.test.ts; echo "exit=$?"
```

Expected: FAIL com `Cannot find module './argumentos.js'`, `exit=1`.

- [ ] **Step 2: Implementar**

`packages/core/src/cli/argumentos.ts`:

```ts
export interface DefinicaoDeOpcao {
  tipo: 'texto' | 'booleano'
  curta?: string
}

export type DefinicaoDeOpcoes = Readonly<Record<string, DefinicaoDeOpcao>>

export interface ArgumentosLidos {
  opcoes: Record<string, string | true>
  posicionais: string[]
}

export class ErroDeUso extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeUso'
  }
}

function tem(objeto: object, chave: string): boolean {
  return Object.prototype.hasOwnProperty.call(objeto, chave)
}

function nomeDaCurta(curta: string, definicao: DefinicaoDeOpcoes): string {
  const nome = Object.keys(definicao).find((n) => definicao[n].curta === curta)
  if (nome === undefined) throw new ErroDeUso(`opção desconhecida: -${curta}`)
  return nome
}

function separar(
  atual: string,
  definicao: DefinicaoDeOpcoes,
): { nome: string; valor: string | undefined } {
  if (atual.startsWith('--')) {
    const igual = atual.indexOf('=')
    const nome = igual === -1 ? atual.slice(2) : atual.slice(2, igual)
    if (!tem(definicao, nome))
      throw new ErroDeUso(`opção desconhecida: --${nome}`)
    return { nome, valor: igual === -1 ? undefined : atual.slice(igual + 1) }
  }
  const nome = nomeDaCurta(atual[1], definicao)
  const resto = atual.slice(2).replace(/^=/, '')
  return { nome, valor: resto === '' ? undefined : resto }
}

export function lerArgumentos(
  argv: readonly string[],
  definicao: DefinicaoDeOpcoes,
): ArgumentosLidos {
  const opcoes: Record<string, string | true> = {}
  const posicionais: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const atual = argv[i]
    if (atual === '--') {
      posicionais.push(...argv.slice(i + 1))
      break
    }
    if (!atual.startsWith('-') || atual === '-') {
      posicionais.push(atual)
      continue
    }
    const { nome, valor } = separar(atual, definicao)
    const { tipo, curta } = definicao[nome]
    const rotulo = curta === undefined ? `--${nome}` : `-${curta}`
    if (tem(opcoes, nome)) throw new ErroDeUso(`opção repetida: ${rotulo}`)
    if (tipo === 'booleano') {
      if (valor !== undefined) throw new ErroDeUso(`${rotulo} não recebe valor`)
      opcoes[nome] = true
    } else if (valor !== undefined) opcoes[nome] = valor
    else if (i + 1 < argv.length) opcoes[nome] = argv[++i]
    else throw new ErroDeUso(`${rotulo} precisa de um valor`)
  }
  return { opcoes, posicionais }
}
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/cli/argumentos.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 3: Lint, build e suíte**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core lint; echo "exit=$?"; pnpm --filter @pilutech/botai-core build; echo "exit=$?"; /bin/ls packages/core/dist/cli/argumentos.js; echo "exit=$?"; pnpm --filter @pilutech/botai-core test; echo "exit=$?"
```

Expected: os quatro `exit=0` (o `portabilidade.test.ts` da tarefa 4 já varre `src/cli`). Aplique a regra R5 (linha da tarefa 7): se o `test` do core já roda o `pacote.test.mjs` e só ele falhou, acrescente os arquivos e rode a linha de novo; se não roda, rode o `pacote.test.mjs` à parte até `exit=0`.

- [ ] **Step 4: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/cli/argumentos.ts packages/core/src/cli/argumentos.test.ts packages/core/scripts/pacote.test.mjs && /usr/bin/git commit -m "feat(core): leitor de argumentos da CLI"; echo "exit=$?"
```

Expected: `exit=0`.

---

### Task 8: CLI: comandos `pessoa`, `pessoas`, avulsos, `validar` e ajuda

**Files:**

- Create: `packages/core/src/cli/ajuda.ts`, `packages/core/src/cli/avulsos.ts`, `packages/core/src/cli/executar.ts`, `packages/core/src/cli/executar.test.ts`
- Modify: `packages/core/scripts/pacote.test.mjs` (R5)

**Interfaces:**

- Consumes: `lerArgumentos`, `ErroDeUso`, `DefinicaoDeOpcoes`, `ArgumentosLidos` (tarefa 7); `envelopar`, `envelopeDoLote`, `FORMATO` (tarefa 4); `resolverOpcoes`, `pessoaResolvida`, `pessoasDoLote`, `OpcoesDaPessoa`, `OpcoesResolvidas` (tarefa 3); `ErroDeOpcao`, `lerUF`, `NomeDaOpcao` (tarefa 1); `rngDeSemente`, `sementeAleatoria` (tarefa 1); `MOTOR` (tarefa 4); `COLUNAS`, `FORMATOS`, `Formato`, `ErroDoPlano`, `cabecalhoCsv`, `linhaCsv`, `insertSql`, `lerCampos`, `lerDialeto`, `lerTabela` (tarefa 5); geradores e validadores da fase 0 (`gerarCPF`, `validarCPF`, `gerarCNPJ`, `validarCNPJ`, `gerarRG`, `validarRG`, `gerarPIS`, `validarPIS`, `gerarTituloEleitor`, `validarTituloEleitor`, `gerarCelular`, `gerarEndereco`, `luhnValido`, `somenteDigitos`).
- Produces (`src/cli/executar.ts`): `interface Saida { dados(texto: string): void; mensagem(texto: string): void }`; `SAIDA = { ok: 0, invalido: 1, uso: 2, interno: 3 }`; `executar(argv: readonly string[], saida: Saida): number`. A fase 2 (servidor) reaproveita os módulos de `src/` diretamente, não o `executar`.

Comportamento fixado aqui (vai para o README e o `CLAUDE.md`):

- `pessoa`: envelope em JSON com 2 espaços e `\n` final.
- `pessoas`: `-n` obrigatório (0 a 100 000); `json` (padrão) é o `EnvelopeDasPessoas`; `ndjson` é um `EnvelopeDaPessoa` por linha, com a semente exata da pessoa (`S/i` ou `S/i/k`), de modo que `botai pessoa --semente <a da linha> --hoje <o da linha>` reproduz aquela linha sozinha; `csv` sai com cabeçalho e CRLF, e sem `--semente` avisa `botai: semente <S>, hoje <H>` no stderr; `sql` começa por `-- botai: formato 1, motor <versão>, semente <S>, hoje <H>` e segue com um `INSERT` por pessoa.
- Toda validação acontece antes da primeira escrita no stdout.
- Avulsos: só dígitos por padrão, `--formatado` com máscara; `--uf` vale para `cpf`, `titulo`, `celular` e `cep` e é erro de uso nos outros; `--semente` reproduz o valor.
- `validar`: tipos `cpf`, `cnpj`, `rg`, `pis`, `titulo`, `cartao`; escreve `válido` (saída 0) ou `inválido` (saída 1).
- `botai` sem comando: ajuda no stderr, saída 2. `--help`/`-h`/`ajuda`: ajuda no stdout, saída 0. `--versao`/`--version`: `MOTOR`.
- Saídas: 0 ok, 1 inválido no `validar`, 2 erro de uso (inclui `ErroDeOpcao` e `ErroDoPlano`, prefixados pela flag: `botai: --uf: uf desconhecida "XX" …`), 3 erro interno.

- [ ] **Step 1: Teste que falha**

`packages/core/src/cli/executar.test.ts` (os valores dos avulsos com `--semente avulso` vêm do protótipo):

```ts
import { validarCPF } from '../cpf.js'
import type { EnvelopeDaPessoa, EnvelopeDasPessoas } from '../envelope.js'
import { gerarEnvelopeDaPessoa } from '../envelope.js'
import { gerarPessoa, gerarPessoas } from '../gerar.js'
import { MOTOR } from '../versao.js'
import { executar, SAIDA } from './executar.js'

const HOJE = '2026-10-05'

function rodar(...argv: string[]) {
  let stdout = ''
  let stderr = ''
  const codigo = executar(argv, {
    dados: (t) => {
      stdout += t
    },
    mensagem: (t) => {
      stderr += t
    },
  })
  return { codigo, stdout, stderr }
}

describe('botai pessoa', () => {
  test('envelope em JSON, igual ao da biblioteca, e nada no stderr', () => {
    const r = rodar('pessoa', '--semente', '42', '--hoje', HOJE)
    expect(r).toEqual({
      codigo: 0,
      stdout: `${JSON.stringify(gerarEnvelopeDaPessoa({ semente: 42, hoje: HOJE }), null, 2)}\n`,
      stderr: '',
    })
  })

  test('--semente -5 e --semente=-5 são a semente "-5"', () => {
    for (const argv of [
      ['pessoa', '--semente', '-5', '--hoje', HOJE],
      ['pessoa', '--semente=-5', '--hoje', HOJE],
    ]) {
      const r = rodar(...argv)
      expect(r.codigo).toBe(0)
      expect((JSON.parse(r.stdout) as EnvelopeDaPessoa).semente).toBe('-5')
    }
  })

  test('--uf e --dominio-email chegam à pessoa', () => {
    const r = rodar(
      'pessoa',
      '--semente',
      'botai',
      '--hoje',
      HOJE,
      '--uf',
      'pi',
      '--dominio-email',
      'example.com',
    )
    expect((JSON.parse(r.stdout) as EnvelopeDaPessoa).pessoa).toEqual(
      gerarPessoa({
        semente: 'botai',
        hoje: HOJE,
        uf: 'PI',
        dominioEmail: 'example.com',
      }),
    )
  })

  test('sem semente e sem hoje, o envelope traz os dois', () => {
    const e = JSON.parse(rodar('pessoa').stdout) as EnvelopeDaPessoa
    expect(e.semente).toMatch(/^[0-9a-f]{16}$/)
    expect(gerarPessoa({ semente: e.semente, hoje: e.hoje })).toEqual(e.pessoa)
  })
})

describe('botai pessoas', () => {
  const LOTE = ['pessoas', '-n', '3', '--semente', 'lote', '--hoje', HOJE]

  test('json (padrão): envelope do lote', () => {
    const e = JSON.parse(rodar(...LOTE).stdout) as EnvelopeDasPessoas
    expect(e).toEqual({
      formato: 1,
      motor: MOTOR,
      semente: 'lote',
      hoje: HOJE,
      pessoas: gerarPessoas(3, { semente: 'lote', hoje: HOJE }),
    })
  })

  test('ndjson: um envelope por linha, cada um com a semente exata da pessoa', () => {
    const linhas = rodar(...LOTE, '--formato', 'ndjson')
      .stdout.trimEnd()
      .split('\n')
      .map((l) => JSON.parse(l) as EnvelopeDaPessoa)
    expect(linhas.map((l) => l.semente)).toEqual(['lote/0', 'lote/1', 'lote/2'])
    for (const l of linhas)
      expect(gerarPessoa({ semente: l.semente, hoje: l.hoje })).toEqual(
        l.pessoa,
      )
  })

  test('csv: cabeçalho e linhas com CRLF; --campos escolhe e ordena', () => {
    const r = rodar(...LOTE, '--formato', 'csv', '--campos', 'cpf, nome')
    const pessoas = gerarPessoas(3, { semente: 'lote', hoje: HOJE })
    expect(r.stdout).toBe(
      `cpf,nome\r\n${pessoas.map((p) => `${p.cpf},${p.nome.completo}\r\n`).join('')}`,
    )
    expect(r.stderr).toBe('')
  })

  test('csv sem --semente avisa a semente no stderr, não no stdout', () => {
    const r = rodar(
      'pessoas',
      '-n',
      '1',
      '--formato',
      'csv',
      '--campos',
      'nome',
    )
    expect(r.stderr).toMatch(
      /^botai: semente [0-9a-f]{16}, hoje \d{4}-\d{2}-\d{2}\n$/,
    )
    expect(r.stdout.startsWith('nome\r\n')).toBe(true)
  })

  test('sql: comentário com formato, motor, semente e hoje, e um INSERT por pessoa', () => {
    const r = rodar(...LOTE, '--formato', 'sql', '--campos', 'nome')
    const linhas = r.stdout.trimEnd().split('\n')
    expect(linhas[0]).toBe(
      `-- botai: formato 1, motor ${MOTOR}, semente lote, hoje ${HOJE}`,
    )
    expect(linhas.slice(1)).toHaveLength(3)
    expect(linhas[1]).toMatch(
      /^INSERT INTO "pessoas" \("nome"\) VALUES \('.+'\);$/,
    )
  })

  test('sql com --dialeto mysql e --tabela esquema.tabela', () => {
    const r = rodar(
      ...LOTE,
      '--formato',
      'sql',
      '--dialeto',
      'mysql',
      '--tabela',
      'app.clientes',
      '--campos',
      'cpf',
    )
    expect(r.stdout.split('\n')[1]).toMatch(
      /^INSERT INTO `app`\.`clientes` \(`cpf`\) VALUES \('[\d.-]+'\);$/,
    )
  })

  test('-n 0 em csv dá só o cabeçalho', () => {
    expect(
      rodar(
        'pessoas',
        '-n',
        '0',
        '--semente',
        'x',
        '--formato',
        'csv',
        '--campos',
        'nome',
      ).stdout,
    ).toBe('nome\r\n')
  })
})

describe('avulsos', () => {
  test.each([
    [['cpf'], '37188580375'],
    [['cpf', '--formatado'], '371.885.803-75'],
    [['cpf', '--formatado', '--uf', 'SP'], '371.885.808-80'],
    [['cnpj', '--formatado'], '37.188.580/0001-00'],
    [['rg'], '371885802'],
    [['pis', '--formatado'], '137.18858.03-6'],
    [['titulo', '--formatado'], '3718 8580 0191'],
    [['titulo', '--formatado', '--uf', 'PI'], '3718 8580 1597'],
    [['celular', '--formatado', '--uf', 'PI'], '(86) 96580-3241'],
    [['celular'], '62965803241'],
    [['cep', '--uf', 'PI'], '64000020'],
  ])('%j com --semente avulso', (argv, esperado) => {
    expect(rodar(...argv, '--semente', 'avulso')).toEqual({
      codigo: 0,
      stdout: `${esperado}\n`,
      stderr: '',
    })
  })

  test('sem semente, sorteia um CPF válido', () => {
    expect(validarCPF(rodar('cpf').stdout.trim())).toBe(true)
  })
})

describe('validar', () => {
  test.each([
    ['cpf', '647.692.234-39', 'válido', SAIDA.ok],
    ['cpf', '647.692.234-30', 'inválido', SAIDA.invalido],
    ['cnpj', '35.728.569/0001-52', 'válido', SAIDA.ok],
    ['rg', '25.547.934-7', 'válido', SAIDA.ok],
    ['pis', '161.51127.87-1', 'válido', SAIDA.ok],
    ['titulo', '6080 6730 1600', 'válido', SAIDA.ok],
    ['cartao', '4242424242424242', 'válido', SAIDA.ok],
    ['cartao', '4242424242424241', 'inválido', SAIDA.invalido],
  ])('%s %s → %s', (tipo, valor, texto, codigo) => {
    expect(rodar('validar', tipo, valor)).toEqual({
      codigo,
      stdout: `${texto}\n`,
      stderr: '',
    })
  })
})

describe('ajuda e versão', () => {
  test('--help no stdout com saída 0', () => {
    const r = rodar('--help')
    expect(r.codigo).toBe(0)
    expect(r.stdout).toContain('Uso:')
    expect(r.stderr).toBe('')
  })

  test.each([
    [['pessoa', '--help'], '--dominio-email'],
    [['pessoas', '-h'], 'Colunas: nome, prenome'],
    [['cpf', '--help'], '--formatado'],
    [['validar', '--help'], 'Tipos: cpf'],
  ])('%j', (argv, trecho) => {
    const r = rodar(...argv)
    expect(r.codigo).toBe(0)
    expect(r.stdout).toContain(trecho)
  })

  test('--versao e --version imprimem MOTOR', () => {
    expect(rodar('--versao').stdout).toBe(`${MOTOR}\n`)
    expect(rodar('--version').stdout).toBe(`${MOTOR}\n`)
  })

  test('sem comando: ajuda no stderr e saída 2', () => {
    const r = rodar()
    expect(r.codigo).toBe(SAIDA.uso)
    expect(r.stdout).toBe('')
    expect(r.stderr).toContain('Uso:')
  })
})

describe('erros de uso: saída 2, mensagem no stderr e nada no stdout', () => {
  test.each([
    [['foo'], 'comando desconhecido "foo"'],
    [['pessoa', 'extra'], 'argumento inesperado: extra'],
    [['pessoa', '--formatado'], 'opção desconhecida: --formatado'],
    [['pessoa', '--semente'], '--semente precisa de um valor'],
    [['pessoa', '--semente', ''], '--semente: semente vazia'],
    [['pessoa', '--semente', 'a', '--semente', 'b'], 'opção repetida'],
    [['pessoa', '--uf', 'XX'], '--uf: uf desconhecida "XX"'],
    [['pessoa', '--hoje', '2026-02-30'], '--hoje: hoje precisa ser uma data'],
    [['pessoa', '--dominio-email', 'localhost'], '--dominio-email: domínio'],
    [['pessoas'], '-n é obrigatório'],
    [['pessoas', '-n', 'x'], '-n precisa ser um inteiro'],
    [['pessoas', '-n', '100001', '--formato', 'csv'], '-n: n precisa ser'],
    [['pessoas', '-n', '100001', '--formato', 'sql'], '-n: n precisa ser'],
    [['pessoas', '-n', '1', '--formato', 'xml'], '--formato desconhecido'],
    [['pessoas', '-n', '1', '--dialeto', 'mysql'], '--dialeto só vale'],
    [['pessoas', '-n', '1', '--tabela', 't'], '--tabela só vale'],
    [['pessoas', '-n', '1', '--campos', 'nome'], '--campos só vale'],
    [
      ['pessoas', '-n', '1', '--formato', 'sql', '--dialeto', 'oracle'],
      'dialeto desconhecido',
    ],
    [
      ['pessoas', '-n', '1', '--formato', 'sql', '--tabela', 'x;drop table y'],
      'tabela inválida',
    ],
    [
      ['pessoas', '-n', '1', '--formato', 'csv', '--campos', 'nome,nome'],
      'repetida',
    ],
    [
      ['pessoas', '-n', '1', '--formato', 'csv', '--campos', 'nome,xyz'],
      'desconhecida "xyz"',
    ],
    [['cnpj', '--uf', 'SP'], '--uf não vale para cnpj'],
    [['validar', 'cpf'], 'uso: botai validar <tipo> <valor>'],
    [['validar', 'xyz', '1'], 'tipo desconhecido "xyz"'],
  ])('%j', (argv, trecho) => {
    const r = rodar(...argv)
    expect(r.codigo).toBe(SAIDA.uso)
    expect(r.stdout).toBe('')
    expect(r.stderr).toMatch(/^botai: /)
    expect(r.stderr).toContain(trecho)
  })
})

test('erro inesperado vira saída 3 com a mensagem no stderr', () => {
  let stderr = ''
  const codigo = executar(['--versao'], {
    dados: () => {
      throw new Error('disco cheio')
    },
    mensagem: (t) => {
      stderr += t
    },
  })
  expect(codigo).toBe(SAIDA.interno)
  expect(stderr).toBe('botai: erro interno: disco cheio\n')
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/cli/executar.test.ts; echo "exit=$?"
```

Expected: FAIL com `Cannot find module './executar.js'`, `exit=1`.

- [ ] **Step 2: Textos de ajuda**

`packages/core/src/cli/ajuda.ts`:

```ts
import { COLUNAS } from '../plano.js'

export const AJUDA_GERAL = `botai: gera pessoas brasileiras de teste, coerentes e reproduzíveis.

Uso:
  botai pessoa  [--semente S] [--hoje AAAA-MM-DD] [--uf UF] [--dominio-email D]
  botai pessoas -n N [--semente S] [--hoje AAAA-MM-DD] [--uf UF] [--dominio-email D]
                [--formato json|ndjson|csv|sql] [--dialeto postgres|mysql|sqlite]
                [--tabela T] [--campos a,b,c]
  botai cpf|cnpj|rg|pis|titulo|celular|cep [--formatado] [--uf UF] [--semente S]
  botai validar cpf|cnpj|rg|pis|titulo|cartao <valor>
  botai --versao

A mesma semente e o mesmo --hoje geram a mesma pessoa em qualquer máquina.
Sem --semente, sorteia uma; sem --hoje, usa a data de hoje em São Paulo.

Saída: dados no stdout, mensagens no stderr.
Códigos de saída: 0 ok, 1 valor inválido (validar), 2 erro de uso, 3 erro interno.

Ajuda de um comando: botai <comando> --help
`

export const AJUDA_PESSOA = `botai pessoa: uma pessoa, em JSON ({ formato, motor, semente, hoje, pessoa }).

Opções:
  --semente S          número ou texto; a mesma semente gera a mesma pessoa
  --hoje AAAA-MM-DD    data de referência da idade e da validade do cartão
  --uf UF              sigla da UF do endereço (CPF, título e DDD seguem a UF)
  --dominio-email D    domínio do e-mail (padrão tuamaeaquelaursa.com, caixa pública)
`

export const AJUDA_PESSOAS = `botai pessoas: um lote de N pessoas sem e-mail, CPF ou CNPJ repetido.

Opções:
  -n N                 quantas pessoas (0 a 100000), obrigatório
  --semente S          a pessoa i do lote usa a semente S/i
  --hoje AAAA-MM-DD    data de referência
  --uf UF              sigla da UF de todos os endereços
  --dominio-email D    domínio dos e-mails
  --formato F          json (padrão), ndjson, csv ou sql
  --dialeto D          postgres (padrão), mysql ou sqlite; só com --formato sql
  --tabela T           tabela do INSERT (padrão pessoas; aceita esquema.tabela); só com sql
  --campos a,b,c       colunas do csv e do sql, nesta ordem

Colunas: ${COLUNAS.join(', ')}
`

export const AJUDA_AVULSO = `botai cpf|cnpj|rg|pis|titulo|celular|cep: um documento avulso.

Opções:
  --formatado          com máscara (padrão: só dígitos)
  --uf UF              só para cpf, titulo, celular e cep
  --semente S          reproduz o mesmo valor
`

export const AJUDA_VALIDAR = `botai validar <tipo> <valor>: confere o dígito verificador.

Tipos: cpf, cnpj, rg, pis, titulo, cartao
Escreve "válido" (saída 0) ou "inválido" (saída 1).
`
```

- [ ] **Step 3: Avulsos e validadores**

`packages/core/src/cli/avulsos.ts`:

```ts
import { luhnValido } from '../cartao.js'
import { gerarCelular } from '../celular.js'
import { gerarCNPJ, validarCNPJ } from '../cnpj.js'
import { gerarCPF, validarCPF } from '../cpf.js'
import { gerarEndereco } from '../endereco.js'
import { gerarPIS, validarPIS } from '../pis.js'
import type { Prng } from '../prng.js'
import { gerarRG, validarRG } from '../rg.js'
import { gerarTituloEleitor, validarTituloEleitor } from '../titulo-eleitor.js'
import type { UF } from '../uf.js'

export interface Avulso {
  aceitaUf: boolean
  gerar(rng: Prng, uf: UF | undefined): string
}

export const AVULSOS: Readonly<Record<string, Avulso>> = {
  cpf: { aceitaUf: true, gerar: (rng, uf) => gerarCPF(rng, uf) },
  cnpj: { aceitaUf: false, gerar: (rng) => gerarCNPJ(rng) },
  rg: { aceitaUf: false, gerar: (rng) => gerarRG(rng) },
  pis: { aceitaUf: false, gerar: (rng) => gerarPIS(rng) },
  titulo: {
    aceitaUf: true,
    gerar: (rng, uf) => gerarTituloEleitor(rng, uf ?? 'SP'),
  },
  celular: {
    aceitaUf: true,
    gerar: (rng, uf) => gerarCelular(rng, gerarEndereco(rng, uf).ddd).formatado,
  },
  cep: { aceitaUf: true, gerar: (rng, uf) => gerarEndereco(rng, uf).cep },
}

export const VALIDADORES: Readonly<Record<string, (valor: string) => boolean>> =
  {
    cpf: validarCPF,
    cnpj: validarCNPJ,
    rg: validarRG,
    pis: validarPIS,
    titulo: (valor) => validarTituloEleitor(valor),
    cartao: luhnValido,
  }
```

- [ ] **Step 4: `executar`**

`packages/core/src/cli/executar.ts`:

```ts
import { somenteDigitos } from '../aleatorio.js'
import { envelopar, envelopeDoLote, FORMATO } from '../envelope.js'
import {
  type OpcoesDaPessoa,
  type OpcoesResolvidas,
  pessoaResolvida,
  pessoasDoLote,
  resolverOpcoes,
} from '../gerar.js'
import { ErroDeOpcao, lerUF, type NomeDaOpcao } from '../opcoes.js'
import {
  cabecalhoCsv,
  COLUNAS,
  ErroDoPlano,
  type Formato,
  FORMATOS,
  insertSql,
  lerCampos,
  lerDialeto,
  lerTabela,
  linhaCsv,
} from '../plano.js'
import { rngDeSemente, sementeAleatoria } from '../semente.js'
import { MOTOR } from '../versao.js'
import {
  AJUDA_AVULSO,
  AJUDA_GERAL,
  AJUDA_PESSOA,
  AJUDA_PESSOAS,
  AJUDA_VALIDAR,
} from './ajuda.js'
import {
  type ArgumentosLidos,
  type DefinicaoDeOpcoes,
  ErroDeUso,
  lerArgumentos,
} from './argumentos.js'
import { AVULSOS, VALIDADORES } from './avulsos.js'

export interface Saida {
  dados(texto: string): void
  mensagem(texto: string): void
}

export const SAIDA = { ok: 0, invalido: 1, uso: 2, interno: 3 } as const

const FLAG_DA_OPCAO: Record<NomeDaOpcao, string> = {
  semente: '--semente',
  hoje: '--hoje',
  uf: '--uf',
  dominioEmail: '--dominio-email',
  n: '-n',
}

const AJUDA = { tipo: 'booleano', curta: 'h' } as const

const OPCOES_DA_PESSOA = {
  semente: { tipo: 'texto' },
  hoje: { tipo: 'texto' },
  uf: { tipo: 'texto' },
  'dominio-email': { tipo: 'texto' },
  help: AJUDA,
} as const satisfies DefinicaoDeOpcoes

const OPCOES_DAS_PESSOAS = {
  ...OPCOES_DA_PESSOA,
  n: { tipo: 'texto', curta: 'n' },
  formato: { tipo: 'texto' },
  dialeto: { tipo: 'texto' },
  tabela: { tipo: 'texto' },
  campos: { tipo: 'texto' },
} as const satisfies DefinicaoDeOpcoes

const OPCOES_DO_AVULSO = {
  formatado: { tipo: 'booleano' },
  uf: { tipo: 'texto' },
  semente: { tipo: 'texto' },
  help: AJUDA,
} as const satisfies DefinicaoDeOpcoes

function texto(lidos: ArgumentosLidos, nome: string): string | undefined {
  const valor = lidos.opcoes[nome]
  return typeof valor === 'string' ? valor : undefined
}

function semPosicionais(lidos: ArgumentosLidos): void {
  if (lidos.posicionais.length > 0)
    throw new ErroDeUso(`argumento inesperado: ${lidos.posicionais[0]}`)
}

function opcoesDaPessoa(lidos: ArgumentosLidos): OpcoesResolvidas {
  const opcoes: OpcoesDaPessoa = {}
  const semente = texto(lidos, 'semente')
  const hoje = texto(lidos, 'hoje')
  const uf = texto(lidos, 'uf')
  const dominioEmail = texto(lidos, 'dominio-email')
  if (semente !== undefined) opcoes.semente = semente
  if (hoje !== undefined) opcoes.hoje = hoje
  if (uf !== undefined) opcoes.uf = lerUF(uf)
  if (dominioEmail !== undefined) opcoes.dominioEmail = dominioEmail
  return resolverOpcoes(opcoes)
}

const json = (valor: unknown) => `${JSON.stringify(valor, null, 2)}\n`

function comandoPessoa(argv: readonly string[], saida: Saida): number {
  const lidos = lerArgumentos(argv, OPCOES_DA_PESSOA)
  if (lidos.opcoes.help) {
    saida.dados(AJUDA_PESSOA)
    return SAIDA.ok
  }
  semPosicionais(lidos)
  const r = opcoesDaPessoa(lidos)
  saida.dados(json(envelopar(r.semente, r.hoje, pessoaResolvida(r))))
  return SAIDA.ok
}

function lerN(valor: string | undefined): number {
  if (valor === undefined) throw new ErroDeUso('-n é obrigatório')
  if (!/^\d+$/.test(valor))
    throw new ErroDeUso(`-n precisa ser um inteiro, recebido "${valor}"`)
  return Number(valor)
}

function lerFormato(valor: string | undefined): Formato {
  const formato = valor ?? 'json'
  if (!(FORMATOS as readonly string[]).includes(formato))
    throw new ErroDeUso(
      `--formato desconhecido "${formato}" (use ${FORMATOS.join(', ')})`,
    )
  return formato as Formato
}

function comandoPessoas(argv: readonly string[], saida: Saida): number {
  const lidos = lerArgumentos(argv, OPCOES_DAS_PESSOAS)
  if (lidos.opcoes.help) {
    saida.dados(AJUDA_PESSOAS)
    return SAIDA.ok
  }
  semPosicionais(lidos)
  const n = lerN(texto(lidos, 'n'))
  const formato = lerFormato(texto(lidos, 'formato'))
  const ehSql = formato === 'sql'
  for (const nome of ['dialeto', 'tabela'])
    if (texto(lidos, nome) !== undefined && !ehSql)
      throw new ErroDeUso(`--${nome} só vale com --formato sql`)
  const campos = texto(lidos, 'campos')
  if (campos !== undefined && formato !== 'csv' && !ehSql)
    throw new ErroDeUso('--campos só vale com --formato csv ou sql')
  const colunas = campos === undefined ? COLUNAS : lerCampos(campos)
  const dialeto = lerDialeto(texto(lidos, 'dialeto') ?? 'postgres')
  const tabela = lerTabela(texto(lidos, 'tabela') ?? 'pessoas')
  const r = opcoesDaPessoa(lidos)

  if (formato === 'json') {
    saida.dados(json(envelopeDoLote(n, r)))
    return SAIDA.ok
  }
  const lote = pessoasDoLote(n, r)
  if (formato === 'csv') {
    if (texto(lidos, 'semente') === undefined)
      saida.mensagem(`botai: semente ${r.semente}, hoje ${r.hoje}\n`)
    saida.dados(cabecalhoCsv(colunas))
  }
  if (ehSql)
    saida.dados(
      `-- botai: formato ${FORMATO}, motor ${MOTOR}, semente ${r.semente}, hoje ${r.hoje}\n`,
    )
  for (const { semente, pessoa } of lote) {
    if (formato === 'ndjson')
      saida.dados(`${JSON.stringify(envelopar(semente, r.hoje, pessoa))}\n`)
    else if (formato === 'csv') saida.dados(linhaCsv(pessoa, colunas))
    else saida.dados(insertSql(pessoa, { dialeto, tabela, colunas }))
  }
  return SAIDA.ok
}

function comandoAvulso(
  nome: string,
  argv: readonly string[],
  saida: Saida,
): number {
  const lidos = lerArgumentos(argv, OPCOES_DO_AVULSO)
  if (lidos.opcoes.help) {
    saida.dados(AJUDA_AVULSO)
    return SAIDA.ok
  }
  semPosicionais(lidos)
  const avulso = AVULSOS[nome]
  const uf = texto(lidos, 'uf')
  if (uf !== undefined && !avulso.aceitaUf)
    throw new ErroDeUso(`--uf não vale para ${nome}`)
  const rng = rngDeSemente(texto(lidos, 'semente') ?? sementeAleatoria())
  const valor = avulso.gerar(rng, uf === undefined ? undefined : lerUF(uf))
  saida.dados(`${lidos.opcoes.formatado ? valor : somenteDigitos(valor)}\n`)
  return SAIDA.ok
}

function comandoValidar(argv: readonly string[], saida: Saida): number {
  const lidos = lerArgumentos(argv, { help: AJUDA })
  if (lidos.opcoes.help) {
    saida.dados(AJUDA_VALIDAR)
    return SAIDA.ok
  }
  const [tipo, valor, ...sobra] = lidos.posicionais
  if (tipo === undefined || valor === undefined || sobra.length > 0)
    throw new ErroDeUso('uso: botai validar <tipo> <valor>')
  if (!Object.prototype.hasOwnProperty.call(VALIDADORES, tipo))
    throw new ErroDeUso(
      `tipo desconhecido "${tipo}" (use ${Object.keys(VALIDADORES).join(', ')})`,
    )
  const valido = VALIDADORES[tipo](valor)
  saida.dados(valido ? 'válido\n' : 'inválido\n')
  return valido ? SAIDA.ok : SAIDA.invalido
}

function despachar(argv: readonly string[], saida: Saida): number {
  const [comando, ...resto] = argv
  if (comando === undefined) {
    saida.mensagem(AJUDA_GERAL)
    return SAIDA.uso
  }
  if (comando === '--help' || comando === '-h' || comando === 'ajuda') {
    saida.dados(AJUDA_GERAL)
    return SAIDA.ok
  }
  if (comando === '--versao' || comando === '--version') {
    saida.dados(`${MOTOR}\n`)
    return SAIDA.ok
  }
  if (comando === 'pessoa') return comandoPessoa(resto, saida)
  if (comando === 'pessoas') return comandoPessoas(resto, saida)
  if (comando === 'validar') return comandoValidar(resto, saida)
  if (Object.prototype.hasOwnProperty.call(AVULSOS, comando))
    return comandoAvulso(comando, resto, saida)
  throw new ErroDeUso(`comando desconhecido "${comando}" (veja botai --help)`)
}

export function executar(argv: readonly string[], saida: Saida): number {
  try {
    return despachar(argv, saida)
  } catch (erro) {
    if (erro instanceof ErroDeUso || erro instanceof ErroDoPlano) {
      saida.mensagem(`botai: ${erro.message}\n`)
      return SAIDA.uso
    }
    if (erro instanceof ErroDeOpcao) {
      saida.mensagem(`botai: ${FLAG_DA_OPCAO[erro.opcao]}: ${erro.message}\n`)
      return SAIDA.uso
    }
    const mensagem = erro instanceof Error ? erro.message : String(erro)
    saida.mensagem(`botai: erro interno: ${mensagem}\n`)
    return SAIDA.interno
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/cli/executar.test.ts; echo "exit=$?"
```

Expected: PASS, `exit=0`.

- [ ] **Step 6: Lint, build e suíte**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core lint; echo "exit=$?"; pnpm --filter @pilutech/botai-core build; echo "exit=$?"; pnpm --filter @pilutech/botai-core test; echo "exit=$?"
```

Expected: os três `exit=0`. Aplique a regra R5 (linha da tarefa 8): se o `test` do core já roda o `pacote.test.mjs` e só ele falhou, acrescente os arquivos e rode a linha de novo; se não roda, rode o `pacote.test.mjs` à parte até `exit=0`.

- [ ] **Step 7: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/cli packages/core/scripts/pacote.test.mjs && /usr/bin/git commit -m "feat(core): comandos da CLI botai (pessoa, pessoas, avulsos e validar)"; echo "exit=$?"
```

Expected: `exit=0`.

---

### Task 9: O bin `botai`, testado pelo build contra os dourados

**Files:**

- Create: `packages/core/src/bin/botai.ts`, `packages/core/src/bin/botai.test.ts`
- Modify: `packages/core/package.json` (`bin`, script `test`), `packages/core/scripts/pacote.test.mjs` (R5)

**Interfaces:**

- Consumes: `executar` (tarefa 8); `paraSql`, `Dialeto` (tarefa 5); `dourado/v1` (tarefa 6).
- Produces: `bin: { "botai": "dist/bin/botai.js" }` (sem `./` na frente, para o npm não "limpar" o caminho com aviso). O `dist/bin/botai.js` é o que o `npx` executa e o que a fase 2 empacota com Bun.

- [ ] **Step 1: Teste que falha**

`packages/core/src/bin/botai.test.ts`:

```ts
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { EnvelopeDaPessoa, EnvelopeDasPessoas } from '../envelope.js'
import type { OpcoesDaPessoa } from '../gerar.js'
import { type Dialeto, paraSql } from '../plano.js'

interface ItemDoIndice {
  arquivo: string
  n?: number
  opcoes: OpcoesDaPessoa & { semente: number | string; hoje: string }
  derivados?: { arquivo: string; formato: 'csv' | 'sql'; dialeto?: Dialeto }[]
}

const RAIZ = join(__dirname, '..', '..')
const BIN = join(RAIZ, 'dist', 'bin', 'botai.js')
const DOURADO = join(RAIZ, 'dourado', 'v1')
const ler = (arquivo: string) => readFileSync(join(DOURADO, arquivo), 'utf8')
const INDICE = JSON.parse(ler('indice.json')) as ItemDoIndice[]

function botai(...argv: string[]) {
  const r = spawnSync(process.execPath, [BIN, ...argv], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return { codigo: r.status, stdout: r.stdout, stderr: r.stderr }
}

function argumentosDe(item: ItemDoIndice): string[] {
  const { semente, hoje, uf, dominioEmail } = item.opcoes
  const argv =
    item.n === undefined ? ['pessoa'] : ['pessoas', '-n', String(item.n)]
  argv.push('--semente', String(semente), '--hoje', hoje)
  if (uf !== undefined) argv.push('--uf', uf)
  if (dominioEmail !== undefined) argv.push('--dominio-email', dominioEmail)
  return argv
}

const semMotor = (e: EnvelopeDaPessoa | EnvelopeDasPessoas) => ({
  ...e,
  motor: '',
})

beforeAll(() => {
  if (!existsSync(BIN))
    throw new Error(`${BIN} não existe: rode pnpm run build antes`)
})

describe('bin botai do build', () => {
  test('começa com o shebang do node', () => {
    expect(readFileSync(BIN, 'utf8').split('\n')[0]).toBe('#!/usr/bin/env node')
  })

  test('--versao é a versão do package.json', () => {
    const { version } = JSON.parse(
      readFileSync(join(RAIZ, 'package.json'), 'utf8'),
    ) as { version: string }
    expect(botai('--versao')).toEqual({
      codigo: 0,
      stdout: `${version}\n`,
      stderr: '',
    })
  })

  test.each(INDICE.map((item) => [item.arquivo, item] as const))(
    'reproduz o dourado %s',
    (_, item) => {
      const r = botai(...argumentosDe(item))
      expect(r.stderr).toBe('')
      expect(r.codigo).toBe(0)
      const dourado = JSON.parse(ler(item.arquivo)) as
        | EnvelopeDaPessoa
        | EnvelopeDasPessoas
      expect(semMotor(JSON.parse(r.stdout))).toEqual(semMotor(dourado))
    },
  )

  test('csv e sql do lote dourado, byte a byte', () => {
    const item = INDICE.find((i) => i.arquivo === 'pessoas-lote.json')!
    for (const derivado of item.derivados ?? []) {
      const argv = [...argumentosDe(item), '--formato', derivado.formato]
      if (derivado.dialeto) argv.push('--dialeto', derivado.dialeto)
      const r = botai(...argv)
      expect(r.codigo).toBe(0)
      const saida =
        derivado.formato === 'sql'
          ? r.stdout.slice(r.stdout.indexOf('\n') + 1)
          : r.stdout
      expect(saida).toBe(ler(derivado.arquivo))
    }
  })

  test('ndjson do lote dourado: uma pessoa por linha, na ordem', () => {
    const item = INDICE.find((i) => i.arquivo === 'pessoas-lote.json')!
    const r = botai(...argumentosDe(item), '--formato', 'ndjson')
    const dourado = JSON.parse(ler(item.arquivo)) as EnvelopeDasPessoas
    const linhas = r.stdout
      .trimEnd()
      .split('\n')
      .map((l) => JSON.parse(l) as EnvelopeDaPessoa)
    expect(linhas.map((l) => l.pessoa)).toEqual(dourado.pessoas)
    expect(linhas.map((l) => l.semente)).toEqual(
      dourado.pessoas.map((_, i) => `lote/${i}`),
    )
  })

  test('1000 pessoas em SQL: igual ao dourado e sem e-mail, CPF ou CNPJ repetido', () => {
    const dourado = JSON.parse(ler('pessoas-1000.json')) as EnvelopeDasPessoas
    const r = botai(
      'pessoas',
      '-n',
      '1000',
      '--semente',
      dourado.semente,
      '--hoje',
      dourado.hoje,
      '--formato',
      'sql',
    )
    expect(r.codigo).toBe(0)
    const [comentario, ...inserts] = r.stdout.split('\n')
    expect(comentario).toMatch(
      /^-- botai: formato 1, motor \d+\.\d+\.\d+\S*, semente mil-3, hoje 2026-10-05$/,
    )
    expect(inserts.join('\n')).toBe(paraSql(dourado.pessoas))
    expect(inserts.filter((l) => l.startsWith('INSERT INTO'))).toHaveLength(
      1000,
    )
    for (const campo of ['email', 'cpf', 'cnpj'] as const) {
      const valores = dourado.pessoas.map((p) =>
        campo === 'email'
          ? p.email.endereco
          : campo === 'cpf'
            ? p.cpf
            : p.empresa.cnpj,
      )
      expect(new Set(valores).size).toBe(1000)
    }
  })

  test('erro de uso: código 2, mensagem no stderr, stdout vazio', () => {
    expect(botai('pessoas', '-n', '100001', '--formato', 'csv')).toEqual({
      codigo: 2,
      stdout: '',
      stderr:
        'botai: -n: n precisa ser um inteiro de 0 a 100000, recebido 100001\n',
    })
  })

  test('validar inválido sai com 1', () => {
    expect(botai('validar', 'cpf', '111.111.111-11')).toEqual({
      codigo: 1,
      stdout: 'inválido\n',
      stderr: '',
    })
  })

  test('saída cortada por pipe (| head) termina com 0 e sem mensagem', async () => {
    const filho = spawn(process.execPath, [
      BIN,
      'pessoas',
      '-n',
      '20000',
      '--semente',
      'pipe',
      '--hoje',
      '2026-10-05',
      '--formato',
      'ndjson',
    ])
    let stderr = ''
    filho.stderr.setEncoding('utf8').on('data', (t: string) => {
      stderr += t
    })
    filho.stdout.once('data', () => filho.stdout.destroy())
    const codigo = await new Promise<number | null>((resolve) =>
      filho.on('close', resolve),
    )
    expect(stderr).toBe('')
    expect(codigo).toBe(0)
  }, 30_000)
})
```

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/bin/botai.test.ts; echo "exit=$?"
```

Expected: FAIL com `dist/bin/botai.js não existe: rode pnpm run build antes`, `exit=1`.

- [ ] **Step 2: O bin**

`packages/core/src/bin/botai.ts` (o único arquivo que fala com o processo; o tipo local de `process` mantém o resto do pacote compilando sem `@types/node`):

```ts
#!/usr/bin/env node
import { executar } from '../cli/executar.js'

// Tipo mínimo local: só este arquivo fala com o processo, e o resto do pacote compila sem @types/node.
declare const process: {
  argv: string[]
  exitCode: number | undefined
  exit(codigo: number): never
  stdout: {
    write(texto: string): boolean
    on(evento: 'error', ouvinte: (erro: { code?: string }) => void): void
  }
  stderr: { write(texto: string): boolean }
}

process.stdout.on('error', (erro) => {
  if (erro.code === 'EPIPE') process.exit(0)
  throw erro
})

process.exitCode = executar(process.argv.slice(2), {
  dados: (texto) => void process.stdout.write(texto),
  mensagem: (texto) => void process.stderr.write(texto),
})
```

- [ ] **Step 3: `bin` no `package.json` e `test` depois do build**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node -e '
const fs = require("fs")
const p = JSON.parse(fs.readFileSync("package.json", "utf8"))
p.bin = { botai: "dist/bin/botai.js" }
if (!p.scripts.test.startsWith("pnpm run build && ")) p.scripts.test = "pnpm run build && " + p.scripts.test
fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n")
'; echo "exit=$?"; node -p 'const p=require("./package.json"); JSON.stringify([p.bin, p.scripts.test])'
```

Expected: `exit=0` e `[{"botai":"dist/bin/botai.js"},"pnpm run build && jest"]` (com o `test` da fase 0 depois do `&&`, se não era `jest`). Regra R2: com bundler de entradas, acrescente `src/bin/botai.ts` e confirme que o shebang sobrevive (o teste `começa com o shebang do node` cobre). O `bin` vale igual no workspace e no tarball (não há `publishConfig.bin`).

- [ ] **Step 4: Build e o teste do bin**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core build; echo "exit=$?"; cd /Users/piluvitu/PILUTECH/Botai/packages/core && ./node_modules/.bin/jest src/bin/botai.test.ts; echo "exit=$?"
```

Expected: `exit=0` e PASS (shebang, versão, os 8 dourados, CSV/SQL byte a byte, ndjson, 1000 em SQL, erro de uso, `validar` e o pipe cortado), `exit=0`.

- [ ] **Step 5: Fumaça à mão**

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && node dist/bin/botai.js --help | /usr/bin/head -3; node dist/bin/botai.js pessoas -n 3 --semente lote --hoje 2026-10-05 --formato csv --campos nome,cpf,email; echo "exit=$?"; node dist/bin/botai.js pessoas -n 50000 --semente x --hoje 2026-10-05 --formato ndjson | /usr/bin/head -c 60; echo; node dist/bin/botai.js cnpj --uf SP; echo "exit=$?"
```

Expected: as 3 linhas do topo da ajuda; o CSV com cabeçalho `nome,cpf,email` e 3 linhas, `exit=0`; 60 caracteres de JSON sem nenhum stack trace; `botai: --uf não vale para cnpj` e `exit=2`.

- [ ] **Step 6: Lint e suíte inteira**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core lint; echo "exit=$?"; pnpm --filter @pilutech/botai-core test; echo "exit=$?"
```

Expected: os dois `exit=0`. Aplique a regra R5 (linha da tarefa 9): se o `test` do core já roda o `pacote.test.mjs` e só ele falhou, acrescente os arquivos e rode a linha de novo; se não roda, rode o `pacote.test.mjs` à parte até `exit=0`.

- [ ] **Step 7: Commit**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/src/bin packages/core/package.json packages/core/scripts/pacote.test.mjs && /usr/bin/git commit -m "feat(core): bin botai, testado pelo build contra os dourados"; echo "exit=$?"
```

Expected: `exit=0`.

---

### Task 10: Documentação, verificação final e merge na `main` local

**Files:**

- Modify: `packages/core/README.md` (substituído inteiro), `packages/core/CLAUDE.md` (seções novas), `CLAUDE.md` (raiz, comandos), `docs/superpowers/plans/2026-10-05-botai-repo-proprio-contrato.md` (seção nova no fim)

**Interfaces:**

- Consumes: tudo das tarefas 1 a 9.
- Produces: o contrato ganha os nomes da fase 1 que as fases 2 e 3 usam.

- [ ] **Step 1: README do core**

Substitua `packages/core/README.md` inteiro por:

````markdown
# @pilutech/botai-core

O motor do [Botaí](https://botai.pilutech.com.br): gera pessoas brasileiras de teste, coerentes e reproduzíveis. O CPF sai da região fiscal da UF do endereço, o DDD do celular é o do CEP, o e-mail vem do nome, a empresa vem dos sobrenomes, e os documentos passam no dígito verificador. A mesma semente e o mesmo `hoje` geram a mesma pessoa na biblioteca, na CLI e na extensão.

- Sem dependência de runtime. ESM com tipos.
- Roda em Node, Bun, Deno e navegador: fora do `bin`, nenhum módulo usa API de Node ou do DOM.
- MIT © PiluTech.

## Instalar

```bash
npm i -D @pilutech/botai-core
```

## Biblioteca

```ts
import {
  gerarEnvelopeDaPessoa,
  gerarPessoa,
  gerarPessoas,
} from '@pilutech/botai-core'

const pessoa = gerarPessoa({ semente: 'cadastro-1', hoje: '2026-10-05' })
const lote = gerarPessoas(100, {
  semente: 'carga',
  uf: 'PI',
  dominioEmail: 'example.com',
})
const comSemente = gerarEnvelopeDaPessoa() // { formato, motor, semente, hoje, pessoa }
```

| Raiz                                                                        | O que faz                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `gerarPessoa(opcoes?)`                                                      | uma pessoa                                                    |
| `gerarPessoas(n, opcoes?)`                                                  | `n` pessoas (até 100 000) sem e-mail, CPF ou CNPJ repetido    |
| `gerarEnvelopeDaPessoa(opcoes?)`, `gerarEnvelopeDasPessoas(n, opcoes?)`     | o mesmo, dentro do envelope com a semente e o `hoje` usados   |
| `rngDeSemente(semente)`                                                     | o gerador (`sfc32`) de uma semente; `42` e `'42'` dão o mesmo |
| `sementeAleatoria()`                                                        | 16 dígitos hexadecimais                                       |
| `hojeEmSaoPaulo(agora?)`                                                    | a data civil de São Paulo (`AAAA-MM-DD`)                      |
| `FORMATO`, `MOTOR`, `DOMINIO_EMAIL_PADRAO`, `LIMITE_DO_LOTE`, `ErroDeOpcao` | constantes e o erro de opção inválida (`erro.opcao` diz qual) |

Opções: `semente` (número inteiro ou texto de até 256 caracteres), `hoje` (`AAAA-MM-DD`), `uf` (sigla) e `dominioEmail`.

Subpaths: `/pessoa` (`montarPessoa(rng, hoje, opcoes?)`), `/plano` (visão plana, CSV e SQL), `/cpf`, `/cnpj`, `/rg`, `/pis`, `/titulo-eleitor`, `/celular`, `/nascimento`, `/senha`, `/nome`, `/endereco`, `/empresa`, `/cartao`, `/uf`, `/aleatorio`, `/prng`, `/campos`, `/campos-formatar`, `/atalhos` e o esquema `/esquema/envelope-v1.schema.json`.

### Reproduzir uma pessoa

- Fixe a semente **e** o `hoje`. Sem `hoje`, vale a data de hoje em São Paulo, e a idade e a validade do cartão mudam de um dia para o outro.
- Texto vira NFC antes do hash: `São` digitado ou colado de um nome de arquivo do macOS é a mesma semente.
- Fixe a versão do pacote. Mudar a pessoa que uma semente gera é versão major (na série 0.x, a minor).
- No lote, a pessoa `i` (a partir de 0) vem da semente `S/i`. Se ela repetir o e-mail, o CPF ou o CNPJ de uma anterior, é sorteada de novo com `S/i/2`, `S/i/3`… Na saída `ndjson` da CLI, cada linha traz a semente exata.
- As primeiras `k` pessoas de um lote de `n` são o lote de `k`.

### E-mail

O domínio padrão é `tuamaeaquelaursa.com`, uma caixa de entrada **pública**: quem souber o endereço lê. Serve para testar cadastro com confirmação por e-mail, nunca para conta real. Com `dominioEmail: 'example.com'` o domínio muda e `email.caixaUrl` vira `null`.

## CLI

```bash
npx @pilutech/botai-core pessoa --semente 42 --hoje 2026-10-05
npx @pilutech/botai-core pessoas -n 1000 --semente carga --hoje 2026-10-05 --formato sql > pessoas.sql
npx @pilutech/botai-core pessoas -n 50 --formato csv --campos nome,cpf,email > pessoas.csv
npx @pilutech/botai-core cpf --formatado --uf PI
npx @pilutech/botai-core validar cnpj 35.728.569/0001-52
```

Instalado no projeto, o binário se chama `botai`.

| Comando                                                                                                                                      | Saída                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `botai pessoa [--semente S] [--hoje AAAA-MM-DD] [--uf UF] [--dominio-email D]`                                                               | envelope JSON                                                                    |
| `botai pessoas -n N [as mesmas opções] [--formato json\|ndjson\|csv\|sql] [--dialeto postgres\|mysql\|sqlite] [--tabela T] [--campos a,b,c]` | o lote                                                                           |
| `botai cpf\|cnpj\|rg\|pis\|titulo\|celular\|cep [--formatado] [--uf UF] [--semente S]`                                                       | um valor (só dígitos sem `--formatado`; `--uf` só em cpf, titulo, celular e cep) |
| `botai validar cpf\|cnpj\|rg\|pis\|titulo\|cartao <valor>`                                                                                   | `válido` ou `inválido`                                                           |
| `botai --help`, `botai <comando> --help`, `botai --versao`                                                                                   | ajuda e versão                                                                   |

- Dados no stdout, mensagens no stderr. Saída `0` ok, `1` valor inválido no `validar`, `2` erro de uso, `3` erro interno.
- `json`: `{ formato, motor, semente, hoje, pessoas }`. `ndjson`: um `{ formato, motor, semente, hoje, pessoa }` por linha. `csv`: RFC 4180, com cabeçalho, CRLF e nulo como campo vazio. `sql`: uma linha de comentário com formato, motor, semente e hoje, e um `INSERT` por pessoa.
- `--tabela` aceita `tabela` ou `esquema.tabela` (letras, dígitos e `_`).

### Colunas do CSV e do SQL

| Coluna             | Campo da `Pessoa`                   | Coluna                  | Campo da `Pessoa`      |
| ------------------ | ----------------------------------- | ----------------------- | ---------------------- |
| `nome`             | `nome.completo`                     | `celular`               | `celular.formatado`    |
| `prenome`          | `nome.prenome`                      | `celular_e164`          | `celular.e164`         |
| `sobrenomes`       | `nome.sobrenomes` unidos por espaço | `cep`                   | `endereco.cep`         |
| `sexo`             | `nome.sexo`                         | `logradouro`            | `endereco.logradouro`  |
| `nascimento`       | `nascimento.iso`                    | `numero`                | `endereco.numero`      |
| `idade`            | `nascimento.idade` (número)         | `complemento`           | `endereco.complemento` |
| `cpf`              | `cpf`                               | `bairro`                | `endereco.bairro`      |
| `rg`               | `rg.numero`                         | `cidade`                | `endereco.cidade`      |
| `rg_orgao_emissor` | `rg.orgaoEmissor`                   | `uf`                    | `endereco.uf`          |
| `rg_uf`            | `rg.uf`                             | `empresa_razao_social`  | `empresa.razaoSocial`  |
| `pis`              | `pis`                               | `empresa_nome_fantasia` | `empresa.nomeFantasia` |
| `titulo_eleitor`   | `tituloEleitor`                     | `empresa_cnpj`          | `empresa.cnpj`         |
| `email`            | `email.endereco`                    | `cartao_bandeira`       | `cartao.bandeira`      |
| `email_usuario`    | `email.usuario`                     | `cartao_numero`         | `cartao.numero`        |
| `email_caixa_url`  | `email.caixaUrl` (pode ser nulo)    | `cartao_titular`        | `cartao.titular`       |
| `senha`            | `senha`                             | `cartao_validade`       | `cartao.validade`      |
|                    |                                     | `cartao_cvv`            | `cartao.cvv`           |

Uma tabela que recebe tudo, no Postgres:

```sql
CREATE TABLE pessoas (
  nome text, prenome text, sobrenomes text, sexo text, nascimento date, idade integer,
  cpf text UNIQUE, rg text, rg_orgao_emissor text, rg_uf text, pis text, titulo_eleitor text,
  email text UNIQUE, email_usuario text, email_caixa_url text, senha text,
  celular text, celular_e164 text, cep text, logradouro text, numero text, complemento text,
  bairro text, cidade text, uf text, empresa_razao_social text, empresa_nome_fantasia text,
  empresa_cnpj text UNIQUE, cartao_bandeira text, cartao_numero text, cartao_titular text,
  cartao_validade text, cartao_cvv text
);
```

```bash
npx @pilutech/botai-core pessoas -n 1000 --semente carga --hoje 2026-10-05 --formato sql | psql "$DATABASE_URL"
```

### De outras linguagens

Python:

```python
import json, subprocess

saida = subprocess.run(
    ["npx", "--yes", "@pilutech/botai-core@0.2.0", "pessoas", "-n", "10",
     "--semente", "testes", "--hoje", "2026-10-05", "--formato", "ndjson"],
    capture_output=True, text=True, check=True,
).stdout
pessoas = [json.loads(linha)["pessoa"] for linha in saida.splitlines()]
```

Go: `exec.Command("npx", "--yes", "@pilutech/botai-core@0.2.0", "pessoa", "--semente", "x", "--hoje", "2026-10-05").Output()` e `json.Unmarshal` no envelope.

## Contrato

- `esquema/envelope-v1.schema.json` (JSON Schema 2020-12) descreve o envelope. `formato` muda quando a forma muda; `motor` é a versão do pacote que gerou os dados.
- O repositório guarda arquivos dourados (`packages/core/dourado/v1`): as pessoas esperadas para sementes e datas fixas, conferidas pela biblioteca, pela CLI e pela extensão a cada mudança.

## Licença

MIT © PiluTech
````

- [ ] **Step 2: `packages/core/CLAUDE.md`**

Na seção que documenta `/pessoa` (vinda do `packages/tools/CLAUDE.md`), troque toda menção a `gerarPessoa(rng, hojeISO)` por `montarPessoa(rng, hojeISO, opcoes?)` e confira:

```bash
/usr/bin/grep -n "gerarPessoa(rng" /Users/piluvitu/PILUTECH/Botai/packages/core/CLAUDE.md; echo "exit=$?"
```

Expected: nenhuma linha, `exit=1`. Depois acrescente ao fim do arquivo:

```markdown
## API da raiz (0.2.0, fase 1)

Plano: `docs/superpowers/plans/2026-10-05-botai-fase1-core-cli.md`. Os nomes são os do contrato (`docs/superpowers/plans/2026-10-05-botai-repo-proprio-contrato.md`), e `src/index.test.ts` trava a lista exata do que a raiz exporta: mudou a raiz, mude o contrato no mesmo PR.

- `gerarPessoa(opcoes?)`, `gerarPessoas(n, opcoes?)`, `gerarEnvelopeDaPessoa`, `gerarEnvelopeDasPessoas`, `rngDeSemente`, `sementeAleatoria`, `hojeEmSaoPaulo`, `FORMATO`, `MOTOR`, `DOMINIO_EMAIL_PADRAO`, `LIMITE_DO_LOTE`, `ErroDeOpcao`.
- Opções (`src/opcoes.ts`): `semente` (inteiro seguro, ou texto de 1 a 256 caracteres sem caractere de controle), `hoje` (`AAAA-MM-DD` que existe), `uf` (sigla, qualquer caixa), `dominioEmail` (hostname ASCII com 2 ou mais rótulos, guardado em minúsculas). Opção inválida lança `ErroDeOpcao` com `.opcao`; a CLI transforma em saída 2 com o nome da flag, e o servidor da fase 2 transforma em 400.
- Subpath novo entra no `exports` (`./src/<m>.ts`, para o workspace) **e** no `publishConfig.exports` (`dist/`, para o tarball); arquivo novo no tarball entra na lista de `scripts/pacote.test.mjs`. A conferência é sempre pelo `pnpm pack`, que é quem aplica o `publishConfig`.
- `resolverOpcoes` sorteia a semente e usa `hojeEmSaoPaulo()` quando faltam. `pessoasDoLote(n, resolvidas)` é o gerador que a CLI percorre linha a linha. `loteCom` recebe o montador por parâmetro só para o teste forçar repetição.

## Semente

- `rngDeSemente(s) = sfc32(cyrb128(bytes UTF-8 de NFC(String(s))))`. TS puro, sem WebCrypto, para dar o mesmo resultado em Node, Bun, navegador e na extensão. `42 ≡ '42'`.
- `semente.test.ts` fixa os primeiros valores de `42`, `'botai'` e `'ação 🧀'`. Mudar o hash, a codificação, a normalização ou o `sfc32` muda a pessoa de toda semente: versão major (na 0.x, a minor) e dourados regravados no mesmo PR.
- `sementeAleatoria()`: 16 hex de `crypto.getRandomValues`, com `Math.random` só onde não existe `crypto`.

## `montarPessoa(rng, hojeISO, opcoes?)` (`/pessoa`)

- É o antigo `gerarPessoa(rng, hojeISO)`. Sem opções, a pessoa de um `rng` não mudou (a pessoa dourada de `pessoa.test.ts` está igual).
- `uf` vai para `gerarEndereco`; o número de chamadas ao `rng` não muda, então o nome é o mesmo com ou sem `uf`.
- `dominioEmail` muda só o domínio do e-mail. `email.caixaUrl` é `null` fora de `tuamaeaquelaursa.com` (o tipo virou `string | null`; a extensão só abre aba quando há URL).

## Lote

- Pessoa `i` = semente `S/i`. Se `email.endereco`, `cpf` ou `empresa.cnpj` repetem um anterior do lote, sai `S/i/2`, `S/i/3`… até `TENTATIVAS_POR_PESSOA` (1000) e então lança, em vez de travar.
- Caso real fixado em teste: na semente `mil-3`, `mil-3/971` repete o e-mail de `mil-3/387`, e a pessoa 971 sai de `mil-3/971/2`.
- Prefixo estável: as primeiras `k` pessoas de um lote de `n` são o lote de `k`.
- Nome, endereço e CEP repetem (34 logradouros); só e-mail, CPF e CNPJ são únicos.
- `LIMITE_DO_LOTE` = 100 000 (100 mil pessoas em cerca de 1,6 s no Node 22, medido no protótipo da fase 1).

## Envelope, esquema e dourados

- `{ formato: 1, motor, semente, hoje, pessoa | pessoas }`; `semente` é a resolvida (texto, NFC) e `motor` é `MOTOR`.
- `esquema/envelope-v1.schema.json` (JSON Schema 2020-12) vai no pacote. `envelope.esquema.test.ts` o valida com o Ajv (só devDependency) contra todos os dourados e casos extras.
- `dourado/v1/indice.json` diz que entradas geram cada arquivo; `scripts/gerar-dourados.mjs` regrava tudo a partir do `dist/`. **Regravar um dourado quer dizer que a pessoa de uma semente mudou: versão major.** As comparações ignoram `motor`.
- `pessoas-1000.json` fica compacto (1,1 MB). A pasta está no `.prettierignore` e fora do `files` (não vai para o npm).
- Quem confere os dourados: `envelope.dourado.test.ts` (biblioteca), `bin/botai.test.ts` (CLI do build) e `extensao/src/test/pessoa-dourada.test.ts` (o core que a extensão empacota). As fases 2 e 3 acrescentam o servidor e o Playwright.

## Versão do motor

`MOTOR` vem de `src/versao.ts`, que `scripts/gerar-versao.mjs` grava a partir do `version` do `package.json` no começo do `build`. O `lint` roda `gerar-versao --conferir` e falha se o arquivo versionado ficou para trás. Subiu a versão? `node scripts/gerar-versao.mjs` e commite os dois juntos.

## Visão plana, CSV e SQL (`/plano`)

- `FORMATOS` (`json`, `ndjson`, `csv`, `sql`) e `DIALETOS` moram aqui; a CLI e o servidor da fase 2 leem daqui.
- 33 colunas em `COLUNAS`, em `snake_case` ASCII (a tabela com a origem de cada uma está no README). `idade` é número; `email_caixa_url` pode ser `null`; o resto é texto, com a máscara que a `Pessoa` já tem (CPF, CNPJ, CEP).
- CSV: RFC 4180, CRLF e cabeçalho; aspas só quando precisa; `null` vira campo vazio e texto vazio vira `""` (é assim que o `COPY … CSV` do Postgres distingue os dois).
- SQL: um `INSERT` por pessoa. Postgres e SQLite citam nomes com `"`, o MySQL com crase; aspas simples dobradas em todos; barra invertida dobrada só no MySQL (no Postgres com `standard_conforming_strings` e no SQLite ela é literal); `null` vira `NULL`.
- `--tabela` passa por `lerTabela` (`[A-Za-z_][A-Za-z0-9_]{0,62}`, com `esquema.` opcional), então o nome citado nunca fecha a aspa.
- `plano.test.ts` executa o SQL do SQLite num `node:sqlite` em memória (processo filho) e compara com `pessoaPlana`; por isso os testes pedem Node ≥ 22.13.

## CLI (`botai`)

- `src/cli/executar.ts` é puro: `executar(argv, saida)` devolve o código de saída e escreve por `saida.dados` e `saida.mensagem`. Só `src/bin/botai.ts` toca o processo: tipo local de `process` (o pacote compila sem `@types/node`), `process.exitCode` em vez de `process.exit` (a doc do Node avisa que `process.exit` pode perder escrita pendente no stdout) e saída 0 no `EPIPE` (`| head`).
- Leitor de argumentos próprio (`src/cli/argumentos.ts`), sem dependência: mensagens em português e valor que começa com traço (`--semente -5`).
- Toda validação roda antes da primeira escrita no stdout: erro de uso nunca deixa CSV ou SQL pela metade.
- Saídas: 0 ok, 1 inválido no `validar`, 2 erro de uso, 3 erro interno.
- `ndjson` traz a semente exata de cada pessoa; `csv` sem `--semente` avisa a semente no stderr; `sql` começa com `-- botai: formato 1, motor …, semente …, hoje …`.
- Testes: `cli/executar.test.ts` (em processo, rápido) e `bin/botai.test.ts` (roda `node dist/bin/botai.js`; por isso o `test` do pacote faz `build` antes).
- `portabilidade.test.ts`: fora de `src/bin`, nenhum módulo pode citar `process.`, `node:`, `require(`, `Buffer`, `document.` ou `window.`.
```

- [ ] **Step 3: `CLAUDE.md` raiz**

Na tabela de comandos do `CLAUDE.md` raiz (criada na fase 0), acrescente estas linhas; se a fase 0 não fez tabela, crie a seção `## Comandos do core` com elas:

```markdown
| `pnpm --filter @pilutech/botai-core build` | `gerar-versao` + build do core (o `test` do core já roda o build antes) |
| `node packages/core/dist/bin/botai.js --help` | a CLI do build local (`npx` do pacote publicado faz o mesmo) |
| `node packages/core/scripts/gerar-dourados.mjs` | regrava `packages/core/dourado/v1` a partir do `dist/`. Mudou um dourado? É versão major |
| `node packages/core/scripts/gerar-versao.mjs` | regrava `packages/core/src/versao.ts` depois de mudar a versão do `package.json` |
```

E, na lista dos workspaces, a linha do `packages/core` passa a citar "motor, CLI `botai` (fase 1), servidor (fase 2) e `/navegador` (fase 3)".

- [ ] **Step 4: Contrato: nomes da fase 1 que cruzam fases**

Confira que o contrato veio na extração (`/bin/ls /Users/piluvitu/PILUTECH/Botai/docs/superpowers/plans/2026-10-05-botai-repo-proprio-contrato.md; echo "exit=$?"`). Com `exit≠0`, pare: a fase 0 devia ter levado os docs (spec §4.2). Com `exit=0`, acrescente ao fim do contrato:

```markdown
## Fase 1 (0.2.0): nomes que as fases 2 e 3 usam

Plano: `docs/superpowers/plans/2026-10-05-botai-fase1-core-cli.md`.

- `/pessoa`: `montarPessoa(rng, hojeISO, opcoes?: OpcoesDaMontagem)`, `OpcoesDaMontagem { uf?: UF; dominioEmail?: string }`; `Email.caixaUrl: string | null` (`null` fora de `tuamaeaquelaursa.com`).
- Raiz, além do que está acima: `gerarEnvelopeDaPessoa(opcoes?)`, `gerarEnvelopeDasPessoas(n, opcoes?)`, `LIMITE_DO_LOTE = 100_000`, `ErroDeOpcao` (`.opcao: 'semente' | 'hoje' | 'uf' | 'dominioEmail' | 'n'`), tipos `NomeDaOpcao`, `Pessoa`, `Prng`, `UF`.
- Internos do pacote (fora da raiz; o servidor da fase 2 importa de `src/`): `resolverOpcoes(opcoes?): OpcoesResolvidas` (`{ semente: string; hoje: string; uf?; dominioEmail? }`), `pessoaResolvida(r)`, `pessoasDoLote(n, r): Generator<{ semente; pessoa }>` (valida `n` na chamada), `envelopar(semente, hoje, pessoa)`, `envelopeDoLote(n, r)`, `lerUF`, `lerHoje`, `lerDominioEmail`, `lerQuantidade`.
- `/plano`: `COLUNAS` (33), `Coluna`, `PessoaPlana`, `pessoaPlana`, `lerCampos(texto)`, `cabecalhoCsv`, `linhaCsv`, `paraCsv`, `FORMATOS`, `Formato`, `DIALETOS`, `Dialeto`, `lerDialeto`, `lerTabela`, `insertSql(pessoa, { dialeto?, tabela?, colunas? })`, `paraSql`, `ErroDoPlano`.
- CLI: `executar(argv, saida: { dados, mensagem }): number`, `SAIDA = { ok: 0, invalido: 1, uso: 2, interno: 3 }`, bin em `dist/bin/botai.js`. Formatos: `json` = `EnvelopeDasPessoas`; `ndjson` = um `EnvelopeDaPessoa` por linha, com a semente exata (`S/i` ou `S/i/k`); `csv` com cabeçalho e CRLF; `sql` com a linha `-- botai: formato 1, motor <v>, semente <S>, hoje <H>` antes dos `INSERT`.
- Erro de opção (`ErroDeOpcao`, `ErroDoPlano`) vira saída 2 na CLI e 400 no servidor.
- Dourados: `packages/core/dourado/v1/indice.json` (`{ arquivo, n?, compacto?, opcoes, derivados? }[]`) e `pessoa-semente-numero.json`, `pessoa-semente-texto.json`, `pessoa-semente-unicode.json`, `pessoa-uf.json`, `pessoa-dominio-email.json`, `pessoa-29-de-fevereiro.json`, `pessoas-lote.json` (+ `.csv`, `.postgres.sql`, `.mysql.sql`, `.sqlite.sql`), `pessoas-1000.json`. As comparações ignoram `motor`.
- JSON Schema: `@pilutech/botai-core/esquema/envelope-v1.schema.json`.
- Ponto de confirmação do dono da fase 1 (fora dos workflows; ponto 9 da lista acima): push da tag `core-v0.2.0`, criada localmente no merge da fase 1, que dispara o `publicar-core.yml` atrás do environment `npm`. A `main` sobe no C5 da fase 0.
```

- [ ] **Step 5: Verificação completa do repo**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm install --frozen-lockfile; echo "exit=$?"; pnpm dedupe --check; echo "exit=$?"; pnpm audit --audit-level high; echo "exit=$?"; pnpm -r lint; echo "exit=$?"; pnpm -r test; echo "exit=$?"
```

Expected: os cinco `exit=0`. No `pnpm -r`, confira na saída `Scope: N of N workspace projects` (um workspace sem o script some em silêncio, ver `CLAUDE.md` raiz). Se o `pnpm audit` acusar algo, rode o mesmo comando na `main` para comparar: o que já existia antes desta fase vai para o relatório; o que esta fase trouxe bloqueia.

- [ ] **Step 6: Conteúdo do pacote (lista fechada)**

A lista inteira do tarball da 0.2.0, pelo `pnpm pack` (o que publica; contrato). Ela tem de ser igual, arquivo por arquivo, à que o `pacote.test.mjs` espera depois das regras R5 das tarefas 1 a 9.

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai-core build; echo "exit=$?"; cd /Users/piluvitu/PILUTECH/Botai/packages/core && pnpm pack --dry-run --json 2>/dev/null | node -e '
const r = JSON.parse(require("fs").readFileSync(0, "utf8"))
const f = r.files.map((x) => x.path)
const NOVOS = ["index", "opcoes", "semente", "hoje", "gerar", "versao", "envelope", "plano", "cli/argumentos", "cli/ajuda", "cli/avulsos", "cli/executar", "bin/botai"]
const deve = ["package.json", "esquema/envelope-v1.schema.json", ...NOVOS.flatMap((m) => [`dist/${m}.js`, `dist/${m}.d.ts`])]
const faltam = deve.filter((x) => !f.includes(x))
const sobram = f.filter((x) => /^(src|dourado|scripts)\/|\.test\./.test(x))
console.log(r.name, r.version, "faltam:", faltam, "sobram:", sobram)
process.exit(faltam.length || sobram.length ? 1 : 0)
'; echo "exit=$?"
```

Expected: `@pilutech/botai-core 0.2.0 faltam: [] sobram: []` e `exit=0`. Rode também o `pacote.test.mjs` do jeito anotado em C11 e confira `exit=0`.

- [ ] **Step 7: Pronto quando: o tarball do `pnpm pack`, importado e pelo `npx`, 1000 pessoas em SQL**

O teste usa o tarball que seria publicado (manifesto do `publishConfig`, bin, shebang, `files`), numa pasta nova a cada execução para o cache do `npx` não servir um build velho. Três conferências: o manifesto do tarball aponta para `dist/`; a raiz e o `/plano` importam de um projeto que instalou o tarball; o `npx` gera as 1000 pessoas iguais ao dourado.

```bash
cd /Users/piluvitu/PILUTECH/Botai/packages/core && D=$(/usr/bin/mktemp -d) && pnpm pack --pack-destination "$D" >/dev/null 2>&1; echo "exit=$?"; /usr/bin/tar -xOf "$D/pilutech-botai-core-0.2.0.tgz" package/package.json | node -e '
const p = JSON.parse(require("fs").readFileSync(0, "utf8"))
const ok = p.exports["."].default === "./dist/index.js" && p.exports["./plano"].default === "./dist/plano.js" && p.exports["./esquema/envelope-v1.schema.json"] === "./esquema/envelope-v1.schema.json" && p.bin.botai === "dist/bin/botai.js" && Object.keys(p.dependencies ?? {}).length === 0
console.log("manifesto do tarball:", ok)
process.exit(ok ? 0 : 1)
'; echo "exit=$?"; cd "$D" && npm init -y >/dev/null && npm install --no-audit --no-fund "$D/pilutech-botai-core-0.2.0.tgz" >/dev/null 2>&1; echo "exit=$?"; node --input-type=module -e 'import { gerarPessoa, MOTOR } from "@pilutech/botai-core"; import { paraSql } from "@pilutech/botai-core/plano"; console.log(MOTOR, gerarPessoa({ semente: "botai", hoje: "2026-10-05" }).cpf, typeof paraSql)'; echo "exit=$?"; npx --yes --package "$D/pilutech-botai-core-0.2.0.tgz" -- botai pessoas -n 1000 --semente mil-3 --hoje 2026-10-05 --formato sql > "$D/mil.sql"; echo "exit=$?"; /usr/bin/wc -l "$D/mil.sql"; cd /Users/piluvitu/PILUTECH/Botai/packages/core && node --input-type=module -e '
import { readFileSync } from "node:fs"
import { paraSql } from "./dist/plano.js"
const sql = readFileSync(process.argv[1], "utf8")
const dourado = JSON.parse(readFileSync("dourado/v1/pessoas-1000.json", "utf8"))
const corpo = sql.slice(sql.indexOf("\n") + 1)
const unicos = (re) => new Set(corpo.split("\n").filter(Boolean).map((l) => l.match(re)[0])).size
console.log("igual ao dourado:", corpo === paraSql(dourado.pessoas))
console.log("e-mails:", unicos(/[a-z]+-[a-z]+-\d{4}@[a-z0-9.-]+/), "CPFs:", unicos(/\d{3}\.\d{3}\.\d{3}-\d{2}/), "CNPJs:", unicos(/\d{2}\.\d{3}\.\d{3}\/0001-\d{2}/))
process.exit(corpo === paraSql(dourado.pessoas) ? 0 : 1)
' "$D/mil.sql"; echo "exit=$?"
```

Expected, na ordem: `exit=0` (pack); `manifesto do tarball: true` e `exit=0`; `exit=0` (install); `0.2.0 610.246.647-08 function` e `exit=0`; `exit=0` (npx); `1001` linhas (comentário + 1000 `INSERT`); `igual ao dourado: true`, `e-mails: 1000 CPFs: 1000 CNPJs: 1000` e `exit=0`. O `npm install` e o `npx` instalam só o tarball local (o core não tem dependência); nada é publicado.

- [ ] **Step 8: Extensão ainda verde: E2E, pacotes e reprodução da AMO**

```bash
cd /Users/piluvitu/PILUTECH/Botai && pnpm --filter @pilutech/botai test:e2e; echo "exit=$?"
```

Expected: `exit=0` (builds de Chrome, Firefox e Opera com o gate do `@source`, build `--mode e2e` e Playwright com a extensão desempacotada).

```bash
cd /Users/piluvitu/PILUTECH/Botai && make zip-botai; echo "exit=$?"; V=$(node -p "require('./extensao/package.json').version") && docker run --rm -v "$PWD:/repo:ro" node:24.14.0 bash /repo/extensao/scripts/reproduzir-fontes.sh "/repo/extensao/.output/botai-$V-sources.zip" "/repo/extensao/.output/botai-$V-firefox.zip"; echo "exit=$?"
```

Expected: `exit=0` e `IDENTICO: botai-1.0.0-firefox.zip`, `exit=0`. Use o alvo e o caminho do script que a fase 0 documentou no `extensao/CLAUDE.md` ("Reprodução") se forem outros. Sem Docker de pé (OrbStack), registre no relatório que este passo ficou para o job `pacotes` do `botai-release.yml` no primeiro PR do dono.

- [ ] **Step 9: Commit da documentação**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git add packages/core/README.md packages/core/CLAUDE.md CLAUDE.md docs/superpowers/plans && /usr/bin/git commit -m "docs(core): README, CLAUDE.md e contrato da fase 1 (CLI e API da raiz)"; echo "exit=$?"; /usr/bin/git status --short; echo "exit=$?"
```

Expected: `exit=0` e nenhum arquivo pendente.

- [ ] **Step 10: Merge `--ff-only` na `main` local**

```bash
cd /Users/piluvitu/PILUTECH/Botai && /usr/bin/git switch main && /usr/bin/git merge --ff-only feat/core-cli; echo "exit=$?"; /usr/bin/git log --oneline -11
```

Expected: `exit=0` e os 10 commits da fase no topo da `main`. Nada de push.

- [ ] **Step 11: Tag local `core-v0.2.0` (sem push)**

A tag nasce aqui, no merge, porque as fases 2 e 3 seguem antes de qualquer push e a `main` sai da 0.2.0 (contrato, "Branches e tags"). O dono só faz o push dela.

```bash
cd /Users/piluvitu/PILUTECH/Botai && test "$(node -p "require('./packages/core/package.json').version")" = 0.2.0 && /usr/bin/git tag -a core-v0.2.0 -m "@pilutech/botai-core 0.2.0" && /usr/bin/git tag -l 'core-v*'; echo "exit=$?"
```

Expected: `core-v0.1.0` e `core-v0.2.0`, `exit=0`. A fase 2 (`docs/superpowers/plans/2026-10-05-botai-fase2-servidor.md`) parte desta `main`.

---

## Decisões deste plano além da spec e do contrato

Para quem revisa: o que a spec e o contrato não fixavam e este plano fixou.

1. **Hash da semente:** cyrb128 (domínio público) sobre os bytes UTF-8 do texto em NFC, e o resultado vai direto para o `sfc32`. Semente vazia, com mais de 256 caracteres, com caractere de controle ou número que não é inteiro seguro é recusada.
2. **`sementeAleatoria()`:** 16 dígitos hexadecimais (64 bits) de `crypto.getRandomValues`, com `Math.random` só onde não há `crypto`.
3. **`email.caixaUrl` vira `string | null`:** `null` quando o domínio não é o padrão. A extensão ganha duas guardas (menu e popup) e dois testes.
4. **Validação das opções** num módulo só (`opcoes.ts`), com `ErroDeOpcao.opcao`: `uf` aceita minúscula; `dominioEmail` é hostname ASCII com 2 ou mais rótulos, guardado em minúsculas.
5. **Limites:** `LIMITE_DO_LOTE = 100 000` e `TENTATIVAS_POR_PESSOA = 1000` (depois disso o lote lança em vez de travar); `loteCom` recebe o montador para o teste forçar repetição campo a campo.
6. **Envelope sem as opções:** a forma do contrato não registra `uf` nem `dominioEmail`; as entradas de cada dourado ficam em `dourado/v1/indice.json`. Os dourados incluem derivados `.csv` e `.sql` do lote, um lote de 1000 compacto com a semente `mil-3` (que tem um sorteio de novo real), comparações que ignoram `motor`, e ficam fora do pacote do npm.
7. **Raiz com quatro nomes além do contrato:** `gerarEnvelopeDaPessoa`, `gerarEnvelopeDasPessoas`, `LIMITE_DO_LOTE` e `ErroDeOpcao`; `sideEffects: false` no `package.json`.
8. **`MOTOR`:** `src/versao.ts` gerado por `scripts/gerar-versao.mjs` no `build`, versionado, e conferido no `lint`.
9. **Visão plana:** 33 colunas em `snake_case` ASCII, valores com a máscara da `Pessoa`; CSV com CRLF, nulo vazio e texto vazio `""`; SQL com um `INSERT` por pessoa, escape por dialeto e tabela validada (aceita `esquema.tabela`).
10. **CLI:** leitor de argumentos próprio; saídas 0/1/2/3; `-n` obrigatório; `--campos` só com csv/sql e `--dialeto`/`--tabela` só com sql (erro de uso, não silêncio); `ndjson` com a semente exata de cada linha; `csv` sem `--semente` avisa a semente no stderr; `sql` com uma linha de comentário de origem; avulsos só com dígitos por padrão, com `--semente` e com `--uf` só onde faz sentido; `validar` também aceita `cartao` (Luhn); `--versao` e `--version`; `botai` sem comando é erro de uso.
11. **Bin:** tipo local de `process`, `process.exitCode`, e `EPIPE` termina com 0.
12. **Travas de teste:** varredura de portabilidade em `src` (fora de `src/bin`), SQL executado de verdade no `node:sqlite` (por isso Node ≥ 22.13 nos testes), JSON Schema validado com Ajv (devDependency), e o `test` do core rodando o `build` antes.
13. **`FORMATOS` e `Formato` em `/plano`** (não escondidos na CLI): o plano da fase 2 os consome de lá.
14. **Dois manifestos e `pnpm pack`:** cada subpath novo (`.`, `./plano`, o esquema) entra no `exports` e no `publishConfig.exports`, e toda conferência do pacote usa o `pnpm pack` (contrato, fixado pela fase 0).
15. **Extensão "semeada":** a extensão não tem modo semeado; o que se confere é que o core que ela empacota reproduz os dourados (`extensao/src/test/pessoa-dourada.test.ts`).

## Passos do dono (fora das tarefas)

Ordem com as outras fases: contrato, "Ordem de execução (fases 0 a 3)" (este é o ponto 9).

1. **A `main` sobe no C5 da fase 0** (criar o repo e o primeiro push), que já leva esta fase. Se a fase 1 rodou depois do C5: `/usr/bin/git -C /Users/piluvitu/PILUTECH/Botai push origin main` (o CI do repo novo roda o job do core, que agora inclui o `test` com build e o bin contra os dourados).
2. **Publicar o 0.2.0**, depois do C8 da fase 0 (o trusted publisher do core já configurado), pelo push da tag que o Step 11 da tarefa 10 criou; ela dispara a publicação da fase 0 (trusted publishing com proveniência, atrás do environment com aprovação): `/usr/bin/git -C /Users/piluvitu/PILUTECH/Botai push origin core-v0.2.0`. Nunca recrie a tag no `HEAD`: a `main` pode já estar na 0.3.0 ou na 0.4.0.
3. **Depois de 24 h** (`minimumReleaseAge`), a conferência literal da spec, já do registro: `cd "$(mktemp -d)" && npx --yes @pilutech/botai-core@0.2.0 pessoas -n 1000 --formato sql --semente mil-3 --hoje 2026-10-05 | /usr/bin/wc -l` deve dar `1001`.
4. **Monorepo:** o `apps/web` só usa `/cpf` e `/cnpj`, que não mudaram; subir a versão exata para 0.2.0 é opcional, e o `/pessoa` mudou de forma incompatível (`gerarPessoa` → `montarPessoa`, `caixaUrl` pode ser `null`) para quem o usar.
