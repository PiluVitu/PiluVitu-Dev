# Runbook — cutover da votação (Go → ramielle)

Fatia ④ (`docs/superpowers/plans/2026-08-12-ramielle-fatia4-cutover.md`, Task 6). Este documento é o produto final da fatia: a sequência exata que o **dono** roda pra repontar a votação de `apps/api` (Go) pro `apps/ramielle` (Cloudflare Worker), importar o histórico real e aposentar a Go.

⚠️ **Regra dura, repetida aqui de propósito: nenhum comando deste runbook foi executado por um agente.** Migration `--remote`, `wrangler secret put`, `wrangler deploy`, DNS/Custom Domain, o import de dados e o merge/redeploy da Vercel tocam produção — são todos comandos do **dono**, um por um, na ordem abaixo. **A ordem não é negociável**: cada passo depende do anterior (a FK circular do schema força a ordem do import; o import tem que vir antes do primeiro login; o Custom Domain tem que existir antes de qualquer verificação por HTTP; etc.) — ver `docs/superpowers/plans/2026-08-12-ramielle-fatia4-cutover.md`, seção "Fatos medidos" (linhas 13-167), pros números e as duas armadilhas medidas que sustentam esta ordem.

## Antes de começar

- Terminal na raiz do monorepo (`/Users/piluvitu/WWW/PiluVitu-Dev`).
- `wrangler` autenticado na conta certa (`c52a9959db02d735ef489d9728ccf4de` — mesma conta do finanças, confirmada com `wrangler whoami` na Task 1 da fatia ①).
- Docker Desktop rodando (o histórico real da Go mora num volume Docker).
- Acesso ao Google Cloud Console (o OAuth Client **compartilhado** com a área de admin de outro app e com a API Go — não criar um client novo).
- Acesso ao dashboard da Cloudflare (Workers & Pages → `piluvitu-ramielle`) e ao dashboard da Vercel (projeto `apps/web`).
- Ler `apps/ramielle/CLAUDE.md` (seção "Estado da fatia..." + "Pendências do dono" + o gerador de import + o harness de comparação) — este runbook cita aquele arquivo em vez de repetir; ele é a fonte de verdade sobre _o que_ o código faz, este documento é sobre _a ordem em que rodar_.

⚠️ **Um hook do shell reescreve `git`/`pnpm lint`/`go test` para um wrapper (`rtk`) com saída resumida/enganosa** (já documentado no handoff geral da migração). Onde a verificação abaixo pedir saída crua, use `/usr/bin/git`, `pnpm --filter`, ou `rtk proxy <cmd>`.

---

## 1. Baseline — registrar que a Go já está fora do ar, ANTES de qualquer mudança

**Por quê primeiro:** a votação em produção **já está quebrada hoje**, antes deste runbook tocar em qualquer coisa. Sem registrar isso, o cutover leva a culpa por uma quebra pré-existente.

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://promeia.piluvitu.com.br/health
docker ps -a
```

**Como verificar:** o `curl` devolve **530** (a Cloudflare não alcança a origem); o `docker ps -a` mostra `cloudflare/cloudflared` como `Exited (0) 2 months ago` (×2) e **nenhum** container `api`. Guarde a saída dos dois comandos (print/cole num arquivo) — é a evidência de que o cutover não introduziu esta quebra.

**Como desfazer:** nada a desfazer — é só leitura.

---

## 2. Subir a Go local (`make stack`)

⚠️ **Prefira o caminho curto.** `make stack` (`process-compose up`) encadeia **Ollama** antes da API: `ollama serve` → `ollama-pull` (baixa `qwen2.5:7b-instruct` **e** `qwen2.5:14b-instruct`, vários GB) → só então `api`, com `depends_on: process_completed_successfully` → só então `tunnel`. **Nada do Ollama é usado por este cutover.** Se o pull falhar ou demorar (rede lenta, disco cheio, Ollama não instalado), a API nunca sobe, o túnel nunca sobe, e você fica travado neste passo sem nenhuma pista de que o bloqueio é um download de LLM sem relação com o que está fazendo.

```bash
make tunnel-up          # ← caminho curto: só a API Go + o túnel, sem Ollama
```

```bash
make stack              # só se você TAMBÉM for usar o Atelier/LLM agora
```

⚠️ `make tunnel-up` exige `infra/.env` com `CLOUDFLARE_TUNNEL_TOKEN` (o compose usa `${CLOUDFLARE_TUNNEL_TOKEN:?…}` e falha alto sem ele). O arquivo existe hoje — confira antes de começar.

Necessário pra três coisas mais adiante neste runbook: (a) confirmar que o Docker está de pé antes de tocar no volume de produção no passo 3; (b) ter uma Go local disponível pro passo 12 (comparação lado a lado); (c) ter `promeia.piluvitu.com.br` respondendo de novo — é o host que `NEXT_PUBLIC_ATELIER_URL` (passo 14) tem que apontar em produção.

**Como verificar:** `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/health` devolve `200`. Depois de alguns segundos, `curl -s -o /dev/null -w '%{http_code}\n' https://promeia.piluvitu.com.br/health` também deve parar de devolver `530` (o túnel reconectou).

**Como desfazer:** `Ctrl-C` no terminal onde `make stack` está rodando, ou `make stop` pras portas que ele ocupa. Não altera nada em produção — é só um processo local.

---

## 3. Extrair o banco de produção da Go — com o WAL

⚠️⚠️ **O `.db` de produção tem 4.096 bytes. TODO o dado mora no `-wal` (1.108.312 bytes), não checkpointado.** Copiar só o `.db` copia um banco **vazio** — e vazio não dá erro, dá um "import bem-sucedido" de zero linhas. O banco mora no volume Docker `infra_api-data` (`/data/votacao.db`), **não** em `apps/api/tmp/votacao.db` (esse é o de dev).

```bash
mkdir -p ~/ramielle-cutover-scratch
docker run --rm \
  -v infra_api-data:/data:ro \
  -v ~/ramielle-cutover-scratch:/out \
  alpine sh -c 'cp /data/votacao.db /out/; cp /data/votacao.db-wal /out/ 2>/dev/null || true; cp /data/votacao.db-shm /out/ 2>/dev/null || true'
ls -la ~/ramielle-cutover-scratch
```

O mount de origem é `:ro` (read-only) — este comando nunca escreve no volume de produção. O diretório de destino (`~/ramielle-cutover-scratch`) precisa ser **gravável**: `apps/ramielle/scripts/gerar-import.mjs` mede que abrir um `.db`+`.db-wal` num diretório `555`/arquivos `444` (o que um mount `-v ...:/data:ro` produziria se você tentasse ler direto de lá) falha com "unable to open database file", sem citar WAL nem permissão — por isso a cópia pro diretório gravável é obrigatória, não estilo.

**Como verificar:**

```bash
ls -la ~/ramielle-cutover-scratch/votacao.db ~/ramielle-cutover-scratch/votacao.db-wal
```

Esperado: `votacao.db` com **4.096 bytes** e `votacao.db-wal` presente e **bem maior que zero** (medido em produção: 1.108.312 bytes — pode variar um pouco se novos dados chegaram, mas não deve estar ausente nem em 0 bytes). Se `votacao.db-wal` não aparecer, ou aparecer com 0 bytes: **pare aqui** — o próximo passo (gerar o `.sql` de import) vai recusar com o mesmo aviso, mas é mais barato descobrir agora.

**Como desfazer:** nada em produção foi tocado (mount read-only). `rm -rf ~/ramielle-cutover-scratch` remove só a cópia local.

---

## 4. Confirmar o estado do D1 remoto (read-only)

```bash
pnpm --filter @piluvitu/ramielle exec wrangler d1 migrations list piluvitu-ramielle --remote
```

**Como verificar:** hoje (D1 remoto nunca migrado) espera-se a lista completa de migrations como **pendente** — `0001_votacao.sql`, `0002_better_auth.sql`, `0003_account_provider_idx.sql`. Se alguma já aparecer aplicada e você não esperava isso, **pare e investigue** antes do passo 5 — aplicar em cima de um estado inesperado é o tipo de erro que este passo read-only existe pra prevenir.

**Como desfazer:** nada — é só leitura.

---

## 5. Aplicar as migrations no D1 remoto

```bash
pnpm --filter @piluvitu/ramielle exec wrangler d1 migrations apply piluvitu-ramielle --remote
```

**Como verificar:** repetir o comando do passo 4 (`migrations list --remote`) — deve devolver **"No migrations to apply!"**. `apps/ramielle/CLAUDE.md` também dá pra conferir schema/índices esperados (9 índices ao todo, ver seção "Índice `account(providerId, accountId)`").

**Como desfazer:** **forward-only, sem down migration** — mesma regra do finanças (`apps/financas/CLAUDE.md`). Como o D1 está vazio antes deste passo (nenhuma linha de dado ainda), a correção mais simples se algo sair errado aqui é escrever uma migration nova (`0004_*.sql`) corrigindo o que for necessário — nunca editar `0001`/`0002`/`0003` já aplicadas. Em último caso (schema irrecuperável e ainda sem dado real): `wrangler d1 delete piluvitu-ramielle` + `wrangler d1 create piluvitu-ramielle` + reaplicar as migrations do zero — só é seguro fazer isso **antes** do passo 10 (import); depois dele, isso apagaria o histórico importado.

---

## 6. Cadastrar os secrets

```bash
cd apps/ramielle
wrangler secret put GOOGLE_SA_JSON
wrangler secret put TMDB_API_KEY
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
```

Cada comando pede o valor via stdin (não fica no histórico do shell nem em `ps`). Valores:

| Secret                                      | De onde vem                                                                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_SA_JSON`                            | o JSON **inteiro** da service account que já lê a planilha de filmes na Go — reusar a mesma, não criar uma nova                                                      |
| `TMDB_API_KEY`                              | a mesma chave que `apps/api/.env` já usa                                                                                                                             |
| `BETTER_AUTH_SECRET`                        | gerar com `openssl rand -base64 32` — **nunca** reusar o valor de `.dev.vars` (é só de desenvolvimento)                                                              |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **o MESMO OAuth Client** que já serve a área de admin de outro app e a API Go — ver passo 8. Criar um client novo quebraria a premissa de a redirect URI ser aditiva |

**Como verificar:**

```bash
wrangler secret list
```

`wrangler secret put` não avisa se o nome foi digitado errado ou o comando abortou no meio — o `secret list` é a única forma barata de confirmar que os cinco chegaram (nomes e tipo, nunca o valor). Sem `GSHEETS_MOVIES_SPREADSHEET_ID`/`GSHEETS_MOVIES_RANGE` cadastrados também (opcional — tem default `A2:F` embutido se ausente), `GET /votacao/categorias`/`POST /votacao/sessions` respondem `503 sheets_disabled` em vez de erro — comportamento seguro, considerar cadastrar os dois se a planilha for usada.

**Como desfazer:** `wrangler secret delete <NOME>` remove um secret específico.

---

## 7. Decidir `ADMIN_EMAILS`: `vars` OU secret — nunca os dois

⚠️ **É o único gate de privilégio do Worker** (`src/lib/session.ts` — recalculado a cada request, nunca gravado como verdade) **numa votação livre**: qualquer conta Google entra e vota; `ADMIN_EMAILS` decide só quem vira admin. Hoje está em `wrangler.jsonc#vars` (commitado, e-mail em texto claro: `paulo.tspi@gmail.com`) — e `vars` é **reaplicada a cada `wrangler deploy`**. Se você criar um secret com o mesmo nome sem tirar a entrada de `vars`, ficam **duas fontes** — e a precedência exata var×secret **não foi medida** (`apps/ramielle/CLAUDE.md` registra isso como pendência em aberto). Não teste essa ambiguidade em produção: escolha um caminho e garanta que só ele existe.

**Opção A — manter em `vars` (nenhuma ação nova).** Simples, mas o e-mail fica em texto claro no histórico do git. Só siga em frente se isso for aceitável — é a situação de hoje.

**Opção B — mover pra secret:**

```bash
cd apps/ramielle
wrangler secret put ADMIN_EMAILS   # cole o CSV (ex.: paulo.tspi@gmail.com) quando pedido
```

E **remover a linha `"ADMIN_EMAILS": "..."` de `wrangler.jsonc#vars`** antes/junto do deploy do passo 9 — sem isso, o próximo `wrangler deploy` reaplica o `vars` e você volta a ter as duas fontes. Essa edição de código é reversível por `git revert`, mas **decida antes do primeiro deploy real** (passo 9) — trocar depois de já estar em produção é mais uma variável a controlar durante o cutover, não durante uma operação isolada.

**Como verificar:** `wrangler secret list` (se optou por B) mostra `ADMIN_EMAILS`; `grep ADMIN_EMAILS apps/ramielle/wrangler.jsonc` não deve achar nada nesse caso. Se optou por A, o `grep` deve continuar achando a linha, e nenhum secret `ADMIN_EMAILS` deve existir.

**Como desfazer:** trocar de opção depois é só repetir o passo na direção contrária (`wrangler secret delete ADMIN_EMAILS` + devolver a linha em `vars`, ou vice-versa) + redeploy.

---

## 8. Redirect URI no Google Console — ADITIVA, nunca substituir

No **Google Cloud Console → APIs & Services → Credentials**, no **mesmo** OAuth Client Web application do passo 6 (não criar um novo), em **Authorized redirect URIs → ADD URI**:

```
https://ramielle.piluvitu.com.br/api/auth/callback/google
```

⚠️ **Só ADICIONAR — nunca remover uma URI existente.** É o mesmo client que hoje serve a área de admin de outro app **e** a API Go (`promeia.piluvitu.com.br/auth/google/callback`); apagar qualquer URI de lá quebra o que já está no ar.

**Como verificar:** a lista de redirect URIs no console mostra a nova entrada **junto** com as que já existiam antes (contar antes e depois — o número só deve crescer em 1).

**Como desfazer:** remover só a URI de `ramielle.piluvitu.com.br` da lista, deixando as demais intactas.

---

## 9. `wrangler deploy` + Custom Domain

O deploy do ramielle **nunca rodou pelo CI** — nem sequer existe um workflow de deploy pra ele em `.github/workflows/` (diferente do finanças, que tem `deploy-financas.yml`, mas cujas duas execuções saíram `skipped` porque falta `vars.CLOUDFLARE_ACCOUNT_ID` — ver `apps/financas/CLAUDE.md`). Pro ramielle o caminho manual não é só "o provado", é o **único que existe**.

```bash
pnpm --filter @piluvitu/ramielle run deploy
```

Depois, criar o Custom Domain no dashboard: **Workers & Pages → `piluvitu-ramielle` → Settings → Domains & Routes → Add → Custom Domain** → `ramielle.piluvitu.com.br` (o `wrangler.jsonc` já declara a rota; falta o domínio existir de fato).

⚠️ **`ramielle.piluvitu.com.br` não é um nome livre — existe um wildcard `*.piluvitu.com.br` → Vercel.** Um 404 nesse host **antes** do Custom Domain existir é indistinguível, por status, de um 404 depois — a distinção é por **header**, não por status:

```bash
curl -sI https://ramielle.piluvitu.com.br/health
```

- Se aparecer o header `x-vercel-error: DEPLOYMENT_NOT_FOUND` ⇒ o Custom Domain **não existe** (ou ainda não propagou) — caiu no wildcard, quem respondeu foi a Vercel.
- Se vier `200` com corpo `{"ok":true,...}` (o envelope de `/health`) ⇒ o Worker está respondendo de verdade.

Uma segunda checagem, contra uma rota que **não existe** no ramielle, confirma que você está batendo no catch-all do Worker (não mais confundível com o wildcard):

```bash
curl -s https://ramielle.piluvitu.com.br/rota-que-nao-existe
```

Esperado: corpo `{"ok":false,...,"code":"not_found"}` (o envelope do catch-all Hono) — **nunca** HTML da Vercel.

**Como verificar:** os dois `curl` acima batendo com o esperado ("Worker respondendo", não "wildcard Vercel").

**Como desfazer:** `wrangler rollback` reverte o Worker pra uma versão anterior (aqui, a "anterior" seria "nunca publicado" — o comando funciona mesmo assim, consultar `wrangler deployments list piluvitu-ramielle` primeiro). Remover o Custom Domain: mesma tela do dashboard, botão de remover ao lado do domínio listado.

---

## 10. Import do histórico real — ANTES de qualquer login no ramielle

⚠️⚠️ **Ordem obrigatória: `migrations apply --remote` (passo 5) → import (este passo) → só então liberar login/repontar o `apps/web`.** Se alguém logar antes, `upsertVotacaoUser` cria `users.id = 1` via `AUTOINCREMENT`, e o import colide (`UNIQUE constraint failed: users.id`). O import é **atômico** — se falhar, nada fica gravado pela metade — mas a ordem continua sendo a única forma de nunca chegar nesse erro.

```bash
# 1. Gerar o .sql a partir da cópia do passo 3, com --esperado como guarda
#    (recusa gerar se a contagem lida não bater com os números medidos —
#    defesa contra uma cópia parcialmente checkpointada).
pnpm --filter @piluvitu/ramielle run gerar-import -- \
  ~/ramielle-cutover-scratch/votacao.db \
  --saida ~/ramielle-cutover-scratch/import.sql \
  --esperado 4,4,42,54,2,0

# 2. Rodar o import de verdade.
pnpm --filter @piluvitu/ramielle exec wrangler d1 execute piluvitu-ramielle \
  --remote --file ~/ramielle-cutover-scratch/import.sql
```

Se o banco de produção tiver crescido desde a medição do plano (4 usuários / 4 sessões / 42 filmes / 54 votos / 2 tiebreaks / 0 backups), o `--esperado` vai **recusar** gerar o `.sql`. Isso é proteção, não erro — recontar as 6 tabelas na cópia e refazer o comando com os números atuais. **Nunca** rodar sem `--esperado`.

Um comando só, que já imprime as 6 contagens na ordem que o `--esperado` espera:

```bash
sqlite3 ~/ramielle-cutover-scratch/votacao.db \
  'SELECT (SELECT count(*) FROM users) || "," ||
          (SELECT count(*) FROM voting_sessions) || "," ||
          (SELECT count(*) FROM session_movies) || "," ||
          (SELECT count(*) FROM votes) || "," ||
          (SELECT count(*) FROM tiebreaks) || "," ||
          (SELECT count(*) FROM backups);'
```

Saída esperada hoje: `4,4,42,54,2,0` — cole o que sair direto no `--esperado`.

⚠️ Use **aspas simples** em volta do SQL. Com aspas duplas o shell não protege o `*` da mesma forma e o SQLite reclama de token inesperado — erro que parece problema no banco e não é.

**Como verificar:**

```bash
pnpm --filter @piluvitu/ramielle exec wrangler d1 execute piluvitu-ramielle --remote \
  --command "SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM voting_sessions) sessions, (SELECT count(*) FROM session_movies) movies, (SELECT count(*) FROM votes) votes, (SELECT count(*) FROM tiebreaks) tiebreaks;"

pnpm --filter @piluvitu/ramielle exec wrangler d1 execute piluvitu-ramielle --remote \
  --command "PRAGMA foreign_key_check;"
```

Esperado: as contagens batendo com o que foi lido no passo anterior (referência medida no plano: 4/4/42/54/2), e `PRAGMA foreign_key_check` devolvendo **vazio** (nenhuma linha — FK íntegra).

**Como desfazer:** o D1 tem **Time Travel** embutido — restaura o banco **inteiro** pra um instante (nunca uma tabela/linha, e é destrutivo pra tudo escrito depois desse ponto). Antes de rodar o import de verdade, anote o estado atual:

```bash
pnpm --filter @piluvitu/ramielle exec wrangler d1 time-travel info piluvitu-ramielle
```

Se o import sair errado, restaurar pra ANTES dele:

```bash
pnpm --filter @piluvitu/ramielle exec wrangler d1 time-travel restore piluvitu-ramielle --timestamp=<instante-antes-do-import>
```

Como o D1 estava **vazio** antes deste passo (só schema, zero linhas — confirmado no passo 4), restaurar pra esse ponto não perde nada além do próprio import malsucedido. Alternativa mais pesada, só se o Time Travel não servir: apagar e recriar o D1 (`wrangler d1 delete piluvitu-ramielle` + `d1 create` + reaplicar migrations) — só é segura **antes** de qualquer login real ter acontecido depois do import.

---

## 11. Primeiro backup do D1 — imediatamente após o import

⚠️ **Até este ponto o D1 remoto está vazio (nada a perder); a partir daqui ele guarda o único registro do histórico de votação que existe.** Sem backup agendado, esse histórico fica sem nenhuma cópia fora da Cloudflare.

```bash
cd apps/ramielle
./scripts/backup-d1.sh
# ou, da raiz do monorepo:
make backup-ramielle
```

Script novo desta task (`apps/ramielle/scripts/backup-d1.sh`), irmão de `apps/financas/scripts/backup-d1.sh` — mesmo desenho (export lógico via `wrangler d1 export --remote`, comprime, rotaciona; recusa em vez de aceitar export vazio/truncado/corrompido; a rotação só roda depois de um backup novo e válido existir). Variáveis (todas opcionais, default entre parênteses): `RAMIELLE_D1_NAME` (`piluvitu-ramielle`), `RAMIELLE_BACKUP_DIR` (`~/Backups/ramielle`), `RAMIELLE_BACKUP_KEEP` (`30`), `WRANGLER_BIN` (`pnpm exec wrangler`).

**Como verificar:**

```bash
ls -la ~/Backups/ramielle/
gzip -t ~/Backups/ramielle/ramielle-*.sql.gz && echo "gzip íntegro"
gzip -dc ~/Backups/ramielle/ramielle-*.sql.gz | grep -c 'INSERT INTO'
```

Esperado: um arquivo `ramielle-<timestamp-UTC>.sql.gz`, `gzip -t` sem erro, e a contagem de `INSERT INTO` **maior que zero** (o script já recusa sozinho um dump vazio/truncado — código de saída ≠ 0, nada gravado — mas confirmar aqui não custa nada).

**Agendar diariamente** (mesmo mecanismo do finanças — `apps/financas/CLAUDE.md`, seção "Agendar diariamente"): copiar o `.plist` de exemplo de lá, trocar `com.piluvitu.financas-backup` → `com.piluvitu.ramielle-backup`, o `cd apps/financas && ./scripts/backup-d1.sh` → `cd apps/ramielle && ./scripts/backup-d1.sh`, e os caminhos de log. Carregar com `launchctl load ~/Library/LaunchAgents/com.piluvitu.ramielle-backup.plist`.

**Como desfazer:** o script só **lê** o D1 (`wrangler d1 export`) — nada em produção é alterado. `rm ~/Backups/ramielle/ramielle-<timestamp>.sql.gz` remove um arquivo local específico, se necessário.

---

## 12. Comparação lado a lado — Go (cópia congelada) × ramielle real

Critério de aceitação do spec (§11): "votação migrada responde igual à do Go — comparação lado a lado antes de aposentar". Usa `apps/ramielle/scripts/comparar-com-go.mjs` (T4 desta fatia), comparando a **Go local**, apontada pra MESMA cópia congelada do passo 3 (nunca o volume de produção mutável — evita que um voto real mude um lado e não o outro no meio da comparação), contra o **ramielle real** já publicado (passo 9) e já com o histórico importado (passo 10).

```bash
# Sobe a Go local apontando pra cópia congelada (não o volume de produção):
SQLITE_PATH=~/ramielle-cutover-scratch/votacao.db make dev-api
```

Em outro terminal, depois de logar como admin **nos dois lados** (Google de verdade — a Go local em `http://localhost:8080` e o ramielle real em `https://ramielle.piluvitu.com.br`) e copiar o cabeçalho `Cookie` inteiro de cada sessão (DevTools → Network → qualquer request autenticado → Request Headers → Cookie):

```bash
COOKIE_GO='piluvitu_session=...' \
COOKIE_RAMIELLE='better-auth.session_token=...' \
  pnpm --filter @piluvitu/ramielle run comparar-com-go -- \
  --go-url http://localhost:8080 \
  --ramielle-url https://ramielle.piluvitu.com.br \
  --relatorio ~/ramielle-cutover-scratch/cutover.report.txt
```

⚠️ A conta usada pro cookie **precisa estar em `ADMIN_EMAILS` nos dois lados** (5 das 8 rotas comparadas são admin-only) — o script confirma isso sozinho no pré-voo antes de gastar as outras 7 chamadas.

**Como verificar:** código de saída **0** — "as 8 rotas comparadas batem, de fato comparadas". Qualquer coisa diferente de 0 precisa de leitura do relatório antes de prosseguir:

- **1** = alguma divergência real, rota pulada, ou rota "não-comparada" (os dois lados recusaram do mesmo jeito — não prova nada, corrigir o cenário e repetir).
- **2** = uso incorreto (variável de cookie ausente, opção errada).
- **3** = pré-voo falhou (cookie expirado/inválido, ou a conta não é admin num dos dois lados) — relogar e repetir.

**Não avançar pro passo 13 com código de saída diferente de 0.**

**Como desfazer:** o script só faz **GET** — nunca escreve. `Ctrl-C` na Go local (`make dev-api`) encerra o processo; nada em produção foi tocado.

---

## 13. CORS em produção — a única verificação que só faz sentido AGORA

`apps/web` mora em `piluvitu.com.br`; o ramielle em `ramielle.piluvitu.com.br` — origens diferentes, então o cookie de sessão só atravessa com CORS + credenciais corretos. Local nunca reproduz isso (os dois lados são `localhost`) — esta é a primeira oportunidade real de testar.

```bash
curl -sI -H 'Origin: https://piluvitu.com.br' https://ramielle.piluvitu.com.br/auth/me

curl -sI -X OPTIONS \
  -H 'Origin: https://piluvitu.com.br' \
  -H 'Access-Control-Request-Method: POST' \
  https://ramielle.piluvitu.com.br/api/auth/sign-in/social
```

**Como verificar:** as duas respostas trazem `access-control-allow-origin: https://piluvitu.com.br` e `access-control-allow-credentials: true`; o preflight (`OPTIONS`) devolve **204** (não 404 — o CORS está montado acima do catch-all em `src/index.ts`, `apps/ramielle/CLAUDE.md` § "O CORS entra ANTES DE TUDO").

**Como desfazer:** nada — é só leitura.

---

## 14. ⚠️ Merge + redeploy da Vercel — **a partir daqui pessoas reais votam no ramielle**

A env inlinada (`NEXT_PUBLIC_API_URL`) só passa a valer depois deste passo — é compilada em build time, editar a variável sozinha não reponta produção.

⚠️⚠️ **É AQUI que a reversibilidade barata acaba, não no passo 16.** Assim que este deploy sair, `piluvitu.com.br/votacao` está falando com o ramielle: qualquer pessoa que votar a partir de agora grava **no D1**, não na Go. O passo 16 é só a decisão de desligar infra que já não recebe tráfego — o marcador 🛑 lá embaixo é o ponto de não-retorno _operacional_, mas o de **dados** é este.

Consequência prática pro rollback: entre o 14 e o 16 pode haver horas (o checklist do passo 15 é pra ser feito com calma, do celular e do laptop). Voltar depois disso **não é só um revert** — ver "Como desfazer" abaixo.

⚠️⚠️ **Cadastrar `NEXT_PUBLIC_ATELIER_URL` na Vercel ANTES do redeploy — com a URL do túnel da Go (`https://promeia.piluvitu.com.br`, reativado no passo 2), NUNCA o placeholder `http://localhost:8080` do `.env.example`.** Achado da revisão da T1 desta fatia: sem essa variável, o Atelier cai no default, que do navegador do admin **em produção é a máquina dele**, não a Go — reproduz, por gatilho diferente (env ausente em vez de derivação acidental de `apiBase`), o mesmo bug que a T1 existe pra evitar: card "Distribuição" **vazio, sem erro nenhum**, em todo post que tinha distribuição salva. A instrução genérica do `CLAUDE.md` da raiz ("copiar todas as `NEXT_PUBLIC_*` do `.env.example`") **leva ao valor errado** se seguida literalmente aqui.

Passos:

1. Vercel dashboard → projeto `apps/web` → Settings → Environment Variables → adicionar (Production):
   - `NEXT_PUBLIC_API_URL` = `https://ramielle.piluvitu.com.br`
   - `NEXT_PUBLIC_ATELIER_URL` = `https://promeia.piluvitu.com.br`
2. Merge do branch `feat/ramielle-promeia` em `main` (PR normal — não é um passo especial deste runbook, é o fluxo de PR de sempre do repositório).
3. Confirmar que o push em `main` disparou um novo deploy de produção na Vercel (ou disparar manualmente via dashboard → Deployments → Redeploy).

**Como verificar:** o deploy novo aparece como "Production" no dashboard da Vercel; `curl -s https://piluvitu.com.br/_next/static/chunks/*.js | grep -o 'ramielle\.piluvitu\.com\.br'` encontra o novo host inlinado no bundle (mesma técnica de verificação que a T2 usou pra confirmar `promeia.piluvitu.com.br` estava inlinado antes do repoint — ver "Fatos medidos" do plano).

**Como desfazer:** mecanicamente há dois caminhos — reverter o merge (`git revert` do commit de merge em `main`, push, novo deploy automático) **ou**, mais rápido numa emergência, na Vercel: Deployments → deployment de produção **anterior** → "Promote to Production".

⚠️ **Mas os dois só desfazem o ROTEAMENTO, não os dados.** Se alguém já votou depois deste passo, esses votos estão no **D1** e o site volta a apontar pra uma Go que (a) não os tem e (b) está fora do ar até você subir de novo. Os votos não somem — ficam **órfãos**, invisíveis pro site, até você repontar de volta pro ramielle.

Antes de reverter, decida conscientemente:

1. **Ninguém votou ainda** (confira: `wrangler d1 execute piluvitu-ramielle --remote --command "SELECT count(*) FROM votes WHERE created_at > '<timestamp do deploy>'"`) ⇒ revert é limpo, siga.
2. **Alguém já votou** ⇒ reverter perde essas sessões de vista. Prefira **corrigir pra frente** (o problema costuma ser config: secret faltando, origem fora de `CORS_ALLOWED_ORIGINS`, `NEXT_PUBLIC_ATELIER_URL` errada) em vez de voltar. Se voltar for inevitável, exporte o D1 antes (passo 11) pra não depender só do Time Travel.

---

## 15. Verificar a votação real em `https://piluvitu.com.br/votacao`

⚠️ **Confirmar o host EFETIVO do site antes de testar.** `better-auth/dist/api/middlewares/origin-check.mjs:67` valida `callbackURL` **e** `errorCallbackURL` contra `trustedOrigins`, e hoje isso é exatamente `https://piluvitu.com.br` (via `wrangler.jsonc#vars.CORS_ALLOWED_ORIGINS`, do qual `trustedOrigins` deriva). Se o site for servido em **qualquer outro host** — `www.piluvitu.com.br`, ou um preview `*.vercel.app` — o login vira **`403 INVALID_CALLBACK_URL`**. Testar direto em `https://piluvitu.com.br` (sem `www`); se precisar testar num preview, acrescente essa origem a `CORS_ALLOWED_ORIGINS` em `wrangler.jsonc` **antes**, redeploy do ramielle, teste, e reverta depois.

Checklist manual, do celular **e** do laptop:

- [ ] `https://piluvitu.com.br/votacao` carrega a tela de votação, com o botão "Entrar com Google" (não mais um `<a href>` de navegação top-level — dispara `POST /api/auth/sign-in/social`).
- [ ] Login completa e mostra as sessões de votação reais (o histórico importado no passo 10 — títulos/filmes reconhecíveis, não uma lista vazia).
- [ ] Votar numa sessão aberta grava o voto (recarregar a página confirma que persistiu).
- [ ] `/admin/sessoes` (conta admin) mostra a lista de usuários (`GET /admin/users`) com o histórico importado.
- [ ] ⚠️ **O botão "Disparar backup" de `/admin/sessoes` vai falhar sempre — isso é esperado, não é regressão.** `POST /admin/backup` no ramielle responde **503 `backup_disabled`** por design (o D1 não tem `VACUUM INTO`; o backup real é o script do passo 11). É o mesmo caminho degradado que a própria Go já tinha — confirmar que a UI mostra uma mensagem de erro tratada, não uma tela quebrada.

**Como verificar:** os itens acima, na ordem, do celular e do laptop (dois motores de cookie/JS diferentes).

**Como desfazer:** se qualquer item falhar, **não prosseguir pro passo 16**. Reverter o passo 14 (merge/redeploy da Vercel) devolve `apps/web` a falar com a Go — que, lembrando o passo 1, já estava fora do ar antes deste runbook começar; reverter não "conserta" nada sozinho, só tira a votação real do caminho do ramielle até o problema ser corrigido e o cutover repetido a partir do passo que falhou.

---

## 16. 🛑 PONTO DE NÃO-RETORNO — aposentar a Go

**Só chegar aqui depois do passo 15 inteiro verde.** A partir deste ponto, o plano considera a Go aposentável — decisão do dono, não deste runbook, sobre quando de fato desligar/desmontar a infraestrutura dela (o container, o túnel dedicado à votação, etc. — o túnel de `promeia.piluvitu.com.br` continua vivo por causa do Atelier, ver passo 14; é só a votação que sai da Go).

⚠️ **Por que é o ponto de não-retorno, e não o import (passo 10):** o import tem rollback razoável via D1 Time Travel (passo 10, "como desfazer") enquanto o D1 ainda está com pouco tráfego novo em cima. Depois do passo 15 verde, porém, pessoas reais já podem ter votado no ramielle (o site em produção já aponta pra lá) — "desfazer" a partir daqui significaria reconciliar votos novos gravados no ramielle com o estado antigo da Go, que está **fora do ar há dois meses** e cuja infraestrutura já foi desmontada (túnel/container caídos, ver passo 1). Voltar atrás depois deste ponto não é um comando, é um projeto de reconciliação de dados.

**Como verificar:** não aplicável — este passo é uma decisão, não uma verificação técnica.

**Como desfazer:** não há undo padronizado — ver o parágrafo acima. Se algo grave aparecer **depois** deste ponto, a resposta é investigar e corrigir no ramielle (que já é a fonte de verdade a partir daqui), não reviver a Go.

---

## Depois do cutover

- O Atelier (revisão de artigo + distribuição) continua na Go via `NEXT_PUBLIC_ATELIER_URL` — só migra quando o `apps/promeia` ganhar essas rotas (spec §7.2, ainda não construído). Só quando isso acontecer a Go fica de fato aposentável por completo.
- O backup agendado no passo 11 precisa continuar rodando (`launchctl list | grep ramielle` confirma que o `LaunchAgent` está carregado).
- `apps/ramielle/CLAUDE.md` — seção "Pendências do dono" — lista o que este runbook cobre; manter os dois sincronizados se outro passo manual surgir depois desta fatia.
