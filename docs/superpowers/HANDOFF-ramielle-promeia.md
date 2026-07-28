# Handoff — migração ramielle + promeia

Escrito em 2026-07-28, no fim de uma sessão longa, para que a próxima retome sem redescobrir nada.

## Onde parou

- **`main` enviada**, contendo os merges de `feat/financas-pj` (50 commits) e `feat/distribuicao-artigos-llm-local` (45 commits). Antes disso a `main` estava **atrás da produção** — o finanças já rodava em `financas.piluvitu.com.br` a partir da branch.
- **Branch `feat/ramielle-promeia`** criada a partir da `main` atualizada. Vazia de código; só correção de spec.
- Suítes na `main`: **web 100 · Go 216 · Worker 474 · SPA 295 · tools 123 · ui 14**.

## Leia nesta ordem

1. `docs/superpowers/specs/2026-07-28-ramielle-promeia-design.md` — **o spec da migração.** §0 (fatos medidos), §3 (segurança), §7.1 (a regra de corte), §7.2 (o fluxo de artigo).
2. `docs/superpowers/specs/2026-07-27-financas-roadmap.md` — o que existe, o que falta, e o deploy automatizado.
3. `README.md` — como rodar e publicar.
4. `CLAUDE.md` da raiz e o de cada workspace.

## A regra que evita rediscussão

**Este trabalho precisa de GPU, modelo local ou acesso a arquivo em disco?**
Sim ⇒ **promeia** (Python, MacBook, túnel). Não ⇒ **ramielle** (Worker).

⚠️ **"Tem a ver com AI" NÃO é o critério.** Gerar a revisão de um artigo exige modelo local (promeia); publicar no dev.to/Hashnode/Bluesky/Mastodon é HTTP para API externa, sem GPU (ramielle). A fronteira é **por operação, não por assunto**. Errar isso faz publicar um artigo depender do laptop estar ligado.

## Fatos medidos — não re-derivar

- **Workers AI funciona nesta conta** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast` responde; `llama-3.1-8b` devolve `5028: deprecated on 2026-05-30`) e foi **descartado por custo**. A restrição do dono é zero custo de AI com infra local.
- **Ollama 0.32.0** no Mac, com `qwen2.5:3b-instruct` e `7b-instruct`.
- **O nível de revisão JÁ EXISTE**: `Proofread(ctx, text, careful bool)` em `internal/llm/client.go:104`, exposto como `{"text","careful"}`. `careful=false` roda o 3b, `true` roda o 7b. **É porte, não feature nova** — e o contrato do corpo deve ficar igual, para o admin não mudar.
- **13 das 33 rotas do Go são código morto**: `/cpf/*`, `/cnpj/*`, `/uuid`, `/base64/*`, `/json/*`, `/jwt/decode`, `/qr/*`. O `apps/web` importa `@piluvitu/tools` direto. **Apagar, não migrar.**
- **Não existe cliente Ollama em Go no `main` antigo** — o que existe veio pelo merge da distribuição (`internal/llm/`).
- **Não há `pdftotext`/`qpdf`/`mutool`** na máquina.

## Decisões de arquitetura já tomadas

- **O Mac empurra, o app lê.** promeia processa e faz `POST` para ramielle, que grava no D1. O app **nunca** depende do Mac ligado — lê do banco, mostrando a data de geração. Já provado com o insight.
- **O navegador nunca fala com promeia.** Fluxo: navegador → ramielle → promeia. O Worker guarda o token; o navegador nunca o vê. Chamar direto exigiria o token no cliente.
- **promeia no túnel é alcançável pela internet** — token próprio (`PROMEIA_TOKEN`) em toda rota, senão é GPU grátis publicada.
- **Trabalho longo vira job.** Transcrição leva minutos; nem navegador nem Worker seguram.
- **Degradação com duas mensagens distintas**: "não alcancei" (suba o promeia) ≠ "alcancei e falhou".
- **Allowlist**: finanças e admin só `paulo.tspi@gmail.com`; votação livre por enquanto. O padrão de duas camadas do finanças já existe e é para ser reusado, não reinventado.
- **Split de hostname aprovado pelo dono**, com o custo de CORS aceito. ⚠️ CORS quebra **só em produção** — local tudo é `localhost`.

## Armadilhas que já custaram tempo real

- **`rtk` mente.** `rtk prettier --check` imprime sucesso mesmo falhando (o exit code está certo), e o `git log` dele mostrou a `main` sem merges que já existiam. Em verificação que importa, use `git --no-pager` ou `rtk proxy`.
- **`pnpm -r <script>` pula em silêncio** workspace sem aquele script. Já deixou 14 componentes sem lint por um commit inteiro.
- **Migration no D1 é forward-only**; índice não é alterável, só dropado (irreversível). Ordem sempre **migration → deploy**.
- **`timeout` não existe no macOS.**
- **Tailwind v4 varre todo arquivo não-ignorado da árvore do app, inclusive `.md`.** Escrever o nome da classe sentinela dentro de `apps/*` **desativa o gate** — já aconteceu, no commit que entregou o gate. Cite `SENTINEL_SELECTOR`.
- **Teste que não pode falhar** foi o defeito mais recorrente desta sessão: `STRICT` testado na direção errada, teste de rota casando com link do menu, lazy-loading passando com import estático, mock devolvendo shape errado três vezes. **Verifique por mutação** — quebre o código de propósito e veja o teste falhar.

## Processo

Rito que vinha sendo usado, e que pegou dezenas de defeitos: **spec → plano → subagent-driven-development** (implementador por task → pacote de revisão → revisor → rodada de correção → ledger). Specs em `docs/superpowers/specs/`, planos em `docs/superpowers/plans/`.

## Próximo passo

Escrever o plano da migração. ⚠️ **A ordem do spec merece reavaliação**: ele propõe começar portando o insight "porque é o mais simples e já provado", mas isso foi escrito quando o fluxo de revisão de artigo ainda estava parado numa branch. Agora ele está na `main`, funcionando, e é o que o dono mais usa.

## Pendente do lado do dono

- Cadastrar `CLOUDFLARE_ACCOUNT_ID` (Variables) e `CLOUDFLARE_API_TOKEN` (Secrets) — sem isso a Action de deploy fica skipada.
- Aplicar a migration `0007` (tabela de insights) e publicar.
- **Rotar o client secret do Google**, exposto em texto claro numa conversa antiga.
- Ambiente de dev para o Worker: hoje **produção é o primeiro lugar onde uma migration roda**.
