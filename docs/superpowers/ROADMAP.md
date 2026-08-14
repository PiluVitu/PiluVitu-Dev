# Roadmap — o que ficou registrado para depois

Itens conhecidos, medidos e deliberadamente adiados. Cada um diz **por que** foi adiado e **o que exatamente** precisa acontecer — não é lista de desejos, é dívida com endereço.

---

## 1. O botão "Disparar backup" do `/admin/sessoes` sempre falha

**Estado hoje:** `POST /admin/backup` responde **`503 backup_disabled`**, com a mensagem `"Backup está desativado."` — sempre, por design. É paridade com a Go: `handlers/admin/backup.go` devolve exatamente isso quando o `Runner` não está configurado, e o `apps/web` já trata esse caminho.

**Por que está assim:** o backup da Go usava `VACUUM INTO` do SQLite, que **o D1 não tem**. O backup real deste Worker é `apps/ramielle/scripts/backup-d1.sh` (export lógico via `wrangler d1 export --remote`, gzip, rotação) — um script de máquina, não uma rota HTTP. Um Worker não tem como se auto-exportar: `wrangler d1 export` é uma operação da API de gerenciamento da Cloudflare, autenticada com credencial de conta, que **não pode viver num Worker público**.

**O problema real, e é de UX, não de backend:** o botão existe, é clicável, e falhar é o único desfecho possível. Um controle que nunca funciona ensina o dono a ignorar erro — e o dia em que o erro for de verdade, ele já não olha.

**Caminhos possíveis (decidir antes de implementar):**

- **(a) Esconder o botão** quando o backup não estiver disponível, e mostrar no lugar o comando (`make backup-ramielle`) + a data do último backup em disco. Menor esforço, resolve o engano. ⚠️ Exige o `apps/web` saber que a rota é permanentemente 503 — hoje ele não distingue "desligado" de "falhou".
- **(b) Trocar o sentido da rota:** em vez de _disparar_ backup, `GET /admin/backups` já lista o histórico da tabela `backups`. Fazer o `POST` virar um **registro** de backup feito fora (o script chamaria a rota depois de gravar o `.sql.gz`), em vez de tentar executá-lo. Mantém o painel útil e verdadeiro.
- **(c) Cloudflare Queue / Cron Trigger** disparando o export por outra via. Mais infraestrutura do que o problema pede.

**Recomendação:** (b) — é o único que deixa o painel dizer a verdade (_"último backup: há 3 horas"_) sem inventar capacidade que o Worker não tem. A tabela `backups` já existe e já é lida.

**Onde mexer:** `apps/ramielle/src/routes/admin.ts` (a rota), `apps/ramielle/scripts/backup-d1.sh` (passaria a registrar), `apps/web/components/votacao/admin/backups-panel.tsx` (a UI).

---

## 2. ✅ Substituir a Go — FEITO em 2026-08-14

**A Go não serve mais tráfego nenhum.** A cadeia em produção é
`piluvitu.com.br → ramielle.piluvitu.com.br → promeia.piluvitu.com.br → Ollama local`,
provada ponta a ponta: o log do promeia registrou um `POST /llm/proofread 200 OK`
vindo de `2a06:98c0:…` — faixa da **Cloudflare**, ou seja, o Worker. Não do
navegador do dono (IPv6 residencial) nem de curl local (`127.0.0.1`). É a §3 do
spec funcionando: o navegador nunca fala com o Mac, porque teria que carregar o
`PROMEIA_TOKEN` — e token no cliente é token público.

**O código de `apps/api` CONTINUA no repositório, de propósito** — decisão do
dono, como referência de paridade. O que foi desligado:

- **CI**: o job `api` saiu de `ci.yml`; `deploy-api.yml` (Cloud Run) foi apagado.
- **Makefile**: `make test`/`make lint` não rodam mais `go test`/`go vet`; `make dev`
  não sobe mais a Go. `dev-api`/`build-api`/`stack` ficam marcados como aposentados;
  `build-cli` sobrevive (o CLI de terminal é o único Go que ainda faz sentido).
- **compose**: o `depends_on: [api]` do `cloudflared` foi removido. ⚠️ Era ele que
  fazia `make tunnel-up` subir a Go sem necessidade, dando a impressão de que ela
  ainda era parte do caminho. Provado depois da mudança: `docker compose --profile
  tunnel up -d cloudflared` sobe **só** o túnel, e a cadeia inteira segue verde.

⚠️ **O que passou a depender do Mac estar ligado:** o botão "Corrigir texto" e a
distribuição só funcionam com o `apps/promeia` rodando em `:8082`. Ele é um
processo solto — **não sobrevive a reiniciar o Mac**, e não há `launchd`
configurado (decisão do dono). É a fragilidade real do desenho, e é por desenho:
o spec chama o promeia de oportunista.

⚠️ **`apps/ramielle/scripts/comparar-com-go.mjs` ficou órfão** — ele compara as
duas APIs lado a lado, e uma delas não roda mais. Continua útil se a Go for
ressuscitada localmente (`make dev-api`) para conferir uma dúvida de paridade;
fora disso, é história.

---

## 3. Dívidas menores, já medidas

- ⚠️ **A `main` está vermelha:** 2 testes de `apps/financas/web` (`BlocoCategorias`) falham — sobre refazer a busca ao trocar o mês e sobre refetch falho após carregamento bem-sucedido. **Confirmado pré-existente**, rodando na própria `main` num worktree limpo. Não vem da migração.
- **`chunk<T>` duplicado** entre `src/domain/sessions.ts` e `src/domain/votes.ts` (2ª cópia; a 3ª costuma ser a que diverge).
- **`sort_options_json` tem duas codificações** na mesma coluna: o histórico importado da Go traz `"types":null`, o ramielle grava `"types":[]`. Ninguém lê o campo hoje — mas uma feature futura de "repetir sessão com os mesmos filtros" precisa tolerar as duas.
- **As 4 plataformas de distribuição nunca receberam uma chamada real.** Só o Bluesky tem credencial. ⚠️ Diferente do TMDb, aqui a falha não é silêncio: é um post público que nenhum código despublica.
- **`ADMIN_EMAILS` está em `wrangler.jsonc#vars`** (texto claro, commitado) e é o único gate de privilégio do Worker. Funciona; decidir se vira secret.
