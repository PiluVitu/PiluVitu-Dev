# Roadmap — o que ficou registrado para depois

Itens conhecidos, medidos e deliberadamente adiados. Cada um diz **por que** foi adiado e **o que exatamente** precisa acontecer — não é lista de desejos, é dívida com endereço.

---

## 1. ✅ O botão "Disparar backup" do `/admin/sessoes` sempre falha — FEITO em 2026-08-14

**Estado antes:** `POST /admin/backup` respondia **`503 backup_disabled`**, com a mensagem `"Backup está desativado."` — sempre, por design (paridade com a Go: `handlers/admin/backup.go` devolvia exatamente isso quando o `Runner` não estava configurado). O botão "Fazer backup agora" (`apps/web`) existia, era clicável, e falhar era o único desfecho possível. Um controle que nunca funciona ensina o dono a ignorar erro.

**Solução aplicada: opção (b), trocar o sentido da rota.** `POST /admin/backup` (`apps/ramielle/src/routes/admin.ts`) deixou de tentar _disparar_ o backup (o D1 continua sem `VACUUM INTO` — isso não mudou) e passou a **REGISTRAR** um backup feito fora, no script. Corpo `{file_name, size_bytes, trigger_type}`, valida `trigger_type` contra o `CHECK` da migration `0001`, grava em `backups` reaproveitando `drive_file_id`/`drive_file_name` (os dois recebem o mesmo `file_name` — não existe mais um "id de Drive" separado do nome). Sempre `201` no sucesso; o `503 backup_disabled` não é mais um caminho alcançável desta rota. Continua atrás de `requireAdmin`, provado por mutação.

**`apps/ramielle/scripts/backup-d1.sh`** ganhou um passo final, best-effort: depois de gravar e validar o `.sql.gz` (as checagens que já existiam), chama a rota acima via `curl` (novo seam `RAMIELLE_CURL_BIN`, só pra teste). Autenticação via `RAMIELLE_ADMIN_COOKIE` (cookie de sessão de uma conta admin) — sem ele configurado, o registro é **pulado**, não é erro. **Falha ao registrar NUNCA invalida o backup**: o arquivo já está em disco e válido antes desse passo rodar; qualquer falha (rede, HTTP != 201) vira um aviso em stderr e o script segue, saindo `0`. Provado por mutação: removendo o isolamento (`set +e`/`set -e`) em volta da chamada, uma falha de `curl` derruba o script inteiro — exatamente o que o guard existe pra evitar.

**`apps/web/components/votacao/admin/backups-panel.tsx`** removeu o botão — não sobrou capacidade nenhuma no Worker pra ele chamar (o corpo `{file_name,size_bytes,trigger_type}` só o script possui; o navegador não tem como preencher isso honestamente). No lugar: uma linha fixa com o comando real (`make backup-ramielle`) + o histórico já registrado (`GET /admin/backups`, inalterado — já mostra o mais recente no topo, sem precisar de um destaque duplicado). `useCreateBackup`/`adminCreateBackup` foram removidos (dead code, nada mais os chama).

**Pendência que sobrou, registrada em `apps/ramielle/CLAUDE.md` § _Registro do backup no painel admin_**: o script depende de `RAMIELLE_ADMIN_COOKIE`, que hoje só existe se o dono colar manualmente um cookie de sessão válido (a sessão expira; automatizar a obtenção/renovação por script é decisão futura, fora do escopo deste fix). Sem essa variável, o backup em si roda normal — só não aparece no painel.

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
