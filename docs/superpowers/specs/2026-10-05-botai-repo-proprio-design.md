# Botaí em repo próprio, com biblioteca, CLI, servidor e plugin do Playwright: design

- **Data:** 2026-10-05
- **Status:** em revisão pelo dono
- **Origem:** pedido do dono depois da 1.0.0 nas lojas ("a extensão meio que escalou"). Pesquisa de apoio: workflow `wf_467bdb24-aaa` (4 frentes: binário, Playwright, multilinguagem, código atual).

## 1. Objetivo

O Botaí deixa de ser só uma extensão e vira um produto da PiluTech com três portas de entrada para o mesmo motor:

1. a **extensão** (Chrome, Firefox, Edge, Opera), como hoje;
2. a **biblioteca TypeScript** no npm e o **plugin do Playwright**, para testes em TS;
3. a **CLI** e o **servidor HTTP com imagem Docker**, para qualquer outra linguagem (Python, Go, Java…) popular banco, montar fixtures e alimentar testes.

Tudo sai do monorepo `PiluVitu-Dev` para um repo próprio. O que o PiluVitu usar do Botaí passa a vir do npm.

Critério de sucesso: a mesma semente gera a mesma pessoa na extensão (quando semeada), na biblioteca, na CLI, no servidor e no Playwright, e um teste dourado compartilhado prova isso a cada PR.

## 2. Decisões do dono (2026-10-05)

| Tema                    | Decisão                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testes                  | Integrações de teste só em TS por agora (biblioteca + Playwright). Outras linguagens entram pela CLI e pelo servidor.                                |
| Outras linguagens       | CLI no npm e binário avulso **e** `botai serve` com imagem Docker já na primeira versão. PyPI fica para quando houver usuário Python real.           |
| E-mail padrão           | O mesmo da extensão (`tuamaeaquelaursa.com`), com opção para trocar o domínio. O lote não pode repetir e-mail.                                       |
| Assinatura de código    | Binário sem assinatura por agora, com o passo de liberação documentado.                                                                              |
| Motor de preenchimento  | Sai da extensão agora (fase 3). Correção pedida por loja na 1.0.0 sai de branch da tag `botai-v1.0.0`.                                               |
| Onde mora               | Repo próprio em `/Users/piluvitu/PILUTECH/Botai`, ao lado do Sombraí. O app **não** fica no monorepo.                                                |
| GitHub                  | `PiluVitu/Botai`, público (MIT, "código aberto" no site e nas lojas).                                                                                |
| Histórico               | Vai junto, por `git filter-repo`.                                                                                                                    |
| Design system           | `@piluvitu/ui` é publicado no npm pelo monorepo, e o Botaí o consome de lá.                                                                          |
| URLs das lojas          | O repo do Botaí é a fonte da landing. O card da PiluLabs e o selo da landing da PiluTech continuam no CMS do `apps/web`, atualizados à parte.        |
| PiluVitu usando o Botaí | Só pelo npm (`@pilutech/botai-core`).                                                                                                                |
| Credenciais             | Nada privado no repo público: npm, CMS, Vercel e lojas ficam em env e em secrets do GitHub. O repo guarda a lógica e um `.env.example` com os nomes. |
| Dependências            | Salvaguardas contra versão suspeita no npm fazem parte do fluxo (seção 5).                                                                           |

## 3. Arquitetura final

```
github.com/PiluVitu/Botai  (/Users/piluvitu/PILUTECH/Botai)      pnpm workspace, MIT
├── extensao/              @pilutech/botai            (privado; vai para as lojas)   ← apps/botai
├── site/                  @pilutech/botai-site       (privado; Vercel)              ← apps/botai-site
├── packages/core/         @pilutech/botai-core       (npm): motor + CLI + servidor  ← módulos do Botaí em packages/tools
├── packages/playwright/   @pilutech/botai-playwright (npm), fase 3
├── docs/superpowers/      specs, planos, design e pesquisa do Botaí               ← docs/superpowers/*
└── .github/workflows/     ci, e2e, release das lojas, publicação npm, imagem, trivy

github.com/PiluVitu/PiluVitu-Dev
├── packages/ui/           @piluvitu/ui (npm, novo)   ← consumido pelo Botaí
├── packages/tools/        @piluvitu/tools (privado)  sem os módulos do Botaí
└── apps/web               /tools usa @pilutech/botai-core do npm (CPF, CNPJ)
```

Sentidos de dependência: o Botaí depende de `@piluvitu/ui` (npm). O PiluVitu depende de `@pilutech/botai-core` (npm). Nenhum repo lê arquivo do outro.

## 4. Fase 0: separação

### 4.1 `@piluvitu/ui` no npm (no monorepo)

- `packages/ui` deixa de ser `private`, ganha build (ESM `.js` + `.d.ts` por subpath, como hoje um export por componente) e publica `styles.css` com os tokens e a classe sentinela.
- Os consumidores do monorepo (`apps/web`, `apps/financas/web`, `apps/pilutech-site`) seguem usando o workspace; só o Botaí consome do npm.
- O consumidor declara `@source` apontando para o pacote em `node_modules`; o gate `check-tailwind-source.mjs` continua a provar, no CSS emitido, que a sentinela sobreviveu.
- Publicação por tag `ui-v<versão>` (seção 5.4).

### 4.2 O repo novo

1. Clone espelho do monorepo numa pasta temporária e `git filter-repo` com `--path` e `--path-rename`:
   - `apps/botai/` → `extensao/`, `apps/botai-site/` → `site/`;
   - de `packages/tools/src/`: `aleatorio`, `uf`, `cpf`, `cnpj`, `rg`, `pis`, `titulo-eleitor`, `celular`, `nascimento`, `senha`, `nome`, `endereco`, `empresa`, `cartao`, `pessoa`, `campos`, `campos-formatar`, `rng-teste` e os testes deles → `packages/core/src/`;
   - specs, planos, design e pesquisa do Botaí em `docs/superpowers/` (lista exata no plano);
   - `.github/workflows/botai-e2e.yml` e `botai-release.yml`.
2. Varredura de segredos no **histórico inteiro** do resultado antes de qualquer push (5.2).
3. Arquivos novos no repo: `package.json` raiz, `pnpm-workspace.yaml` (com as salvaguardas da 5.3), `.npmrc`, `LICENSE` (MIT © PiluTech), `README.md`, `CLAUDE.md` raiz e um por workspace, `.gitignore`, `.env.example`, `scripts/check-tailwind-source.mjs` (cópia), `Makefile` com os alvos que hoje são `*-botai` no monorepo.
4. A tag `botai-v1.0.0` é recriada no commit reescrito equivalente, e o GitHub Release 1.0.0 é refeito no repo novo com os mesmos 4 zips do release do monorepo (baixados com `gh release download`). O release antigo fica no monorepo.
5. Criar `PiluVitu/Botai` no GitHub e o primeiro push só com o OK do dono, na hora.

### 4.3 O que vai, o que fica e o que vira cópia

| Hoje no monorepo                                                     | No repo do Botaí                         | No monorepo depois                                                   |
| -------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| 15 módulos do Botaí em `packages/tools`                              | `packages/core` (fonte única)            | removidos                                                            |
| `cpf`, `cnpj` (também usados pelo `/tools` do web)                   | `packages/core`                          | removidos; o web importa `@pilutech/botai-core/cpf` e `/cnpj` do npm |
| `prng` (`sfc32`, `seedFromBytes`)                                    | cópia em `packages/core`                 | fica: a roleta do web usa                                            |
| `entropy` (`cryptoRandomBytes`)                                      | cópia do necessário na extensão          | fica: a roleta usa                                                   |
| `pilulabs`: `TECLAS_DO_MANIFESTO`, `ATALHOS`, `teclaNoMac`           | `packages/core` (o atalho é da extensão) | removidos (nenhum app do monorepo usa fora do Botaí)                 |
| `pilulabs`: `lojasPublicadas`, `fase`, `ehUrlDaLoja`, `urlsDasLojas` | cópia no `site`                          | fica: `apps/web` e `apps/pilutech-site` usam                         |
| `contato` (`mailtoDaPilutech`)                                       | cópia no `site`                          | fica: `apps/pilutech-site` usa                                       |
| `ico` (`icoDePngs`)                                                  | cópia no `site`                          | fica: `apps/pilutech-site` usa                                       |
| `scripts/check-tailwind-source.mjs`                                  | cópia                                    | fica                                                                 |
| `apps/web/public/pilulabs/botai/icone-128.png`                       | o gerador fica no Botaí                  | fica como arquivo fixo, sem o gerador; o teste de igualdade sai      |

Cópia é aceita onde o código é pequeno e o dono do conceito é outro; o que o PiluVitu consome do Botaí vem sempre do npm.

### 4.4 Fontes que mudam

- **Lojas da landing:** `site/` lê um arquivo do próprio repo (ex.: `site/lojas.json`, editado por PR) no lugar do YAML do CMS do `apps/web`. O E2E da "loja publicada" continua trocando o arquivo por variável de ambiente.
- **CMS do `apps/web`:** o item `botai` continua lá para o card da PiluLabs e o selo da PiluTech; o campo `repo` passa a apontar para `https://github.com/PiluVitu/Botai`.
- **Imagens:** `make capturas-botai` só copia para dentro do repo do Botaí (`site/`). A lista `COPIAS` perde o destino `web/...`.
- **Favicon:** o `/favicon.ico` da landing segue lendo os ícones da extensão (`../extensao/public/icon`), agora dentro do mesmo repo.

### 4.5 CI/CD no repo novo

- `ci.yml`: core (tsc, Jest, build, `npm pack --dry-run` com a lista de arquivos conferida), extensão (o que o job `botai` faz hoje), site (o que o job `botai-site` faz hoje).
- `botai-e2e.yml` e `botai-release.yml` com os paths novos. O zip de fontes da AMO passa a declarar `@piluvitu/ui` como dependência do npm; a reprodução byte a byte do pacote do Firefox tem de ser provada de novo no CI.
- Environment `lojas-botai` recriado no repo novo (revisor = dono, só `main` e tags `botai-v*`). Os secrets são cadastrados pelo dono.
- `trivy.yml` (fs, secret estrito, misconfig) e `dependabot.yml` (5.3).

### 4.6 Vercel

O projeto `botai-site` passa a ser ligado a `PiluVitu/Botai`, Root Directory `site`, com o `ignoreCommand` refeito para os caminhos novos. O domínio `botai.pilutech.com.br` não muda. Primeira produção pelo mesmo caminho de preview + `vercel promote` já documentado no `apps/botai-site/CLAUDE.md`. Mudança no projeto só com o OK do dono.

### 4.7 O monorepo depois

- Saem `apps/botai`, `apps/botai-site`, os módulos do Botaí do `packages/tools`, os jobs `botai` e `botai-site` do `ci.yml`, os workflows `botai-*`, os alvos `*-botai` e `*-botai-site` do Makefile, as configs de lint-staged desses apps e as seções e linhas dos `CLAUDE.md` que falam deles (substituídas por um parágrafo que aponta para o repo novo).
- `apps/web` passa a depender de `@pilutech/botai-core` com versão exata.

### 4.8 Ordem do corte

1. Publicar `@piluvitu/ui` (monorepo).
2. Montar o repo novo localmente, CI verde localmente, varredura de segredos limpa.
3. Criar o repo no GitHub e fazer o push (OK do dono). CI verde lá.
4. Publicar `@pilutech/botai-core` 0.1.0 com a API de hoje (as mesmas funções e subpaths do `packages/tools`).
5. Religar o projeto da Vercel (OK do dono) e conferir a landing em produção.
6. Esperar o `minimumReleaseAge` (24 h) e trocar o monorepo para o npm, removendo o Botaí dele, num PR só.

Rollback: até o passo 6 o monorepo segue intacto; a Vercel volta a apontar para o monorepo se a landing nova falhar.

## 5. Segurança

### 5.1 Credenciais

| Credencial                | Onde fica                                                                                                                                            | Nunca                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Publicação no npm         | trusted publishing (OIDC) do GitHub Actions; a primeira publicação de cada pacote usa um token do dono só no env local (`NPM_TOKEN`), apagado depois | no repo, em `.npmrc` versionado ou em log |
| Lojas (Chrome, AMO, Edge) | environment `lojas-botai` do repo novo, secrets e variables                                                                                          | no repo                                   |
| Vercel                    | integração Git da Vercel; variáveis no painel do projeto (ex.: `GOOGLE_SITE_VERIFICATION`)                                                           | no repo                                   |
| CMS (Keystatic)           | continua só no `apps/web`, em env, como hoje                                                                                                         | no repo do Botaí                          |
| GHCR                      | `GITHUB_TOKEN` do workflow, com `packages: write` só no job da imagem                                                                                | token pessoal                             |

- `.env*` no `.gitignore` (exceto `.env.example`, só com nomes).
- O Trivy de segredos roda estrito no CI e falha o PR.

### 5.2 Histórico que vira público

O `git filter-repo` leva todo commit que tocou os caminhos escolhidos. Antes do primeiro push, uma varredura do histórico inteiro (`gitleaks detect` em todos os commits, ou ferramenta equivalente escolhida no plano) tem de sair limpa. Se achar algo, o segredo é revogado primeiro e o commit é reescrito antes do push.

### 5.3 Dependências (repo novo e monorepo)

- pnpm ≥ 11, scripts de instalação bloqueados e `allowBuilds` explícito.
- `minimumReleaseAge: 1440` também para os nossos pacotes: sem exceção para `@pilutech/*` e `@piluvitu/*`. Uma conta do npm invadida não empurra versão nova para o outro repo no mesmo dia.
- Configurações do pnpm a confirmar no plano (nomes e versão mínima): `trustPolicy: no-downgrade` (falha se um pacote perder a proveniência que tinha) e `blockExoticSubdeps` (dependência transitiva vinda de git ou tarball).
- CI sempre com `--frozen-lockfile`, `pnpm dedupe --check` e `pnpm audit --audit-level high`.
- Dependabot com `cooldown` (dias de espera antes de propor versão nova; valores no plano), minor e patch agrupados, major isolado, nada de merge automático.
- Actions fixadas por SHA, `permissions` mínimas por job.

### 5.4 Publicação dos nossos pacotes

- Trusted publishing com proveniência, a partir de tag (`core-v*`, `playwright-v*`, `ui-v*`), num job atrás de environment com aprovação do dono.
- `files` em lista fechada no `package.json`; o CI confere a saída do `npm pack --dry-run`.
- O core não tem dependência de runtime.
- 2FA na conta do npm.

## 6. `@pilutech/botai-core`

### 6.1 Biblioteca

- **0.1.0 (fase 0):** as funções e subpaths de hoje (`/pessoa`, `/cpf`, `/cnpj`, `/campos`, `/campos-formatar`…), com build ESM `.js` + `.d.ts` (ferramenta no plano), compilado sem `lib: dom`.
- **Fase 1:** a API amigável:
  - `gerarPessoa({ semente?, hoje?, uf?, dominioEmail? })`;
  - `gerarPessoas(n, { semente, hoje?, uf?, dominioEmail? })`;
  - `rngDeSemente(numero | texto)`: uma função só, em TS puro (sem WebCrypto), usada por toda interface;
  - `hojeEmSaoPaulo()`, que é o `hoje` padrão (a pessoa padrão muda de um dia para o outro; quem quer reprodução fixa o `hoje`).

### 6.2 Contrato

- Toda saída é `{ formato, motor, semente, hoje, pessoa }`. `formato` é a versão do JSON; `motor` é a versão do pacote. JSON Schema publicado no pacote.
- Arquivos dourados (`dourado/v1/*.json`): pessoas esperadas para um conjunto fixo de sementes e datas. Biblioteca, CLI, servidor, extensão (semeada) e Playwright são testados contra eles.
- Mudar a pessoa que uma semente gera é versão major.
- Lote: a pessoa `i` é a da semente `S/i`. Se o e-mail, o CPF ou o CNPJ repetir um anterior do lote, ela é sorteada de novo, de forma determinística (`S/i/2`, `S/i/3`…). Nada quebra `UNIQUE`.
- E-mail: domínio padrão `tuamaeaquelaursa.com`; `dominioEmail` troca.

### 6.3 CLI (fase 1)

```
botai pessoa  [--semente S] [--hoje AAAA-MM-DD] [--uf UF] [--dominio-email D]
botai pessoas -n N [--semente S] [--formato json|ndjson|csv|sql] [--dialeto postgres|mysql|sqlite] [--tabela T] [--campos a,b,c]
botai cpf|cnpj|rg|pis|titulo|celular|cep [--formatado] [--uf UF]
botai validar cpf|cnpj|... <valor>
```

- CSV e SQL usam uma visão plana documentada da pessoa (nome, cpf, email, celular, cep, logradouro, número, cidade, uf…); `--campos` escolhe as colunas.
- Saída de dados no stdout, mensagens no stderr, código de saída diferente de zero em erro de uso.

### 6.4 Servidor, imagem e binários (fase 2)

- `botai serve [--porta 8790] [--host 127.0.0.1]`: `GET /pessoa`, `GET /pessoas` (mesmos parâmetros da CLI, `formato` por query), `GET /saude`. Escuta em `127.0.0.1` por padrão; na imagem Docker, `0.0.0.0`.
- Imagem `ghcr.io/piluvitu/botai`, por tag, com o servidor como entrada.
- Binários Bun (`bun build --compile`) para macOS, Linux e Windows (x64 e arm64) nos GitHub Releases, com `install.sh` e o passo de liberação do Gatekeeper e do SmartScreen documentado. Sem assinatura.

## 7. `@pilutech/botai-playwright` e o motor DOM (fase 3)

- O motor de preenchimento (`campos`, `descrever`, `escrever`, `preencherDocumento`…) sai de `extensao/src/entrypoints/preencher.content/` para `@pilutech/botai-core/navegador`, sem API de extensão: o acesso a shadow root fechada vira um adaptador que a extensão injeta. A extensão passa a usar esse motor e mantém o comportamento (os testes atuais dela continuam valendo).
- O motor sai também como bundle IIFE para ser injetado por `page.evaluate`/`addInitScript` (passam pela CSP da página).
- Fixture:

```ts
import { test, expect } from '@pilutech/botai-playwright'

test('cadastro', async ({ page, botai }) => {
  await page.goto('/cadastro')
  const resultado = await botai.preencher(page) // percorre os frames
  expect(resultado.naoReconhecidos).toEqual([])
  await expect(page.getByLabel('E-mail')).toHaveValue(
    botai.pessoa.email.endereco,
  )
})
```

- Semente padrão derivada do projeto e do título do teste (não do retry nem do worker), registrada em anotação `botai-semente`; em falha, a pessoa vai anexada como `botai-pessoa.json`. `test.use({ botaiSemente, botaiHoje, botaiUf })` fixa.
- Exporta `test` pronto e `fixturesBotai()` para `mergeTests`. `@playwright/test` é peer dependency.
- Limites documentados: shadow root fechada não é suportada pelo Playwright.

## 8. Testes

- TDD em tudo, como no resto do projeto.
- Core: Jest (os testes vêm do `packages/tools` com os módulos), incluindo a pessoa dourada e os arquivos dourados.
- CLI e servidor: Jest chamando o build (processo e HTTP) contra os arquivos dourados.
- Extensão: Vitest, Storybook e Playwright como hoje.
- Site: Jest, Storybook e Playwright como hoje.
- Playwright: os próprios testes do Playwright com as páginas de formulário que a extensão já usa (`cadastro.pagina.html`, `react.pagina.tsx`).

## 9. Fases e critério de pronto

| Fase | Entrega                                                                                                                                                                      | Pronto quando                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 0    | `@piluvitu/ui` no npm; repo `PiluVitu/Botai` com histórico; CI, E2E e release das lojas lá; core 0.1.0 no npm; Vercel religada; monorepo sem o Botaí e com o `/tools` no npm | landing em produção servida pelo repo novo; CI verde nos dois repos; reprodução da AMO provada; nenhum arquivo do Botaí no monorepo |
| 1    | semente única, lote sem repetição, contrato e dourados, CLI                                                                                                                  | `npx @pilutech/botai-core pessoas -n 1000 --formato sql` sem repetição e igual aos dourados                                         |
| 2    | servidor, imagem Docker, binários e workflow de release                                                                                                                      | a imagem responde no CI de um projeto de teste; os binários rodam nos 3 sistemas                                                    |
| 3    | motor DOM no core, extensão usando o core, plugin do Playwright                                                                                                              | os E2E da extensão continuam verdes e o fixture preenche o `cadastro.pagina.html`                                                   |

Um plano por fase, escrito na hora de cada fase.

## 10. Passos do dono

1. npm (2026-10-05): `@piluvitu` é o escopo do usuário `piluvitu`, sem organização; a organização `pilutech` foi criada para o escopo `@pilutech`. Falta ligar o 2FA, se ainda não estiver. Todo pacote leva `"publishConfig": { "access": "public" }`: com escopo, o padrão é privado (pago).
2. Fazer a primeira publicação de cada pacote com um token no env local, quando o plano chegar lá, e depois configurar o trusted publishing no npmjs.com.
3. Dar o OK para criar `PiluVitu/Botai` e para religar o projeto `botai-site` da Vercel.
4. Cadastrar os secrets do environment `lojas-botai` no repo novo.
5. Atualizar, nos painéis das lojas, o link do código-fonte (AMO) para o repo novo.

## 11. Fora de escopo

PyPI e outros pacotes por linguagem, assinatura de código, versão mobile, plugin específico do Jest (a biblioteca já serve), mudanças no visual.

## 12. Riscos e pontos a confirmar no plano

- Os escopos `@pilutech` (organização) e `@piluvitu` (usuário) existem segundo o dono; ainda não há pacote publicado em nenhum dos dois.
- Nomes e versões mínimas das configurações do pnpm em 5.3 e a sintaxe do `cooldown` do Dependabot.
- Ferramenta de build do core e do ui (`tsc` com extensões nos imports, ou um bundler).
- O `@piluvitu/ui` publicado precisa funcionar nos três consumidores do Botaí (WXT/Vite e Next) com o `@source` em `node_modules`.
- A reprodução byte a byte do zip da AMO com `@piluvitu/ui` vindo do npm.
- Se o binário Bun do macOS gerado em runner Linux sai com assinatura ad-hoc válida.
- `git filter-repo` deixa de fora commits que não tocaram os caminhos; o log do repo novo começa no primeiro commit do Botaí.
