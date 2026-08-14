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

## 2. Substituir a Go por completo

**Estado hoje:** a votação inteira já saiu da Go — `piluvitu.com.br` fala com o `ramielle.piluvitu.com.br` desde o cutover. **O que ainda depende da Go é só o Atelier** (revisão de artigo + distribuição), porque `NEXT_PUBLIC_ATELIER_URL` aponta para `promeia.piluvitu.com.br`, que hoje é o hostname da Go.

⚠️ **As rotas do Atelier JÁ EXISTEM no ramielle** (`/admin/llm/proofread`, `/admin/llm/refine`, `/admin/distribution/*`) e respondem `503` só porque faltam os secrets. Não falta código — falta ligar.

**O que falta, na ordem:**

1. Subir o **promeia** local e deixá-lo alcançável pelo ramielle (o Worker precisa de uma URL pública — hoje o túnel aponta para o container da Go).
2. Cadastrar `PROMEIA_URL` + `PROMEIA_TOKEN` como secrets do ramielle.
3. Repontar `NEXT_PUBLIC_ATELIER_URL` para `https://ramielle.piluvitu.com.br`.
4. Só então a Go fica dispensável (passo 16 do runbook de cutover).

**Detalhe que decide o passo 1:** o mapeamento `promeia.piluvitu.com.br → api:8080` mora no **dashboard da Cloudflare**, não no repositório (não há arquivo de ingress em `infra/`). Repontá-lo para o promeia é ação de dashboard, do dono.

---

## 3. Dívidas menores, já medidas

- ⚠️ **A `main` está vermelha:** 2 testes de `apps/financas/web` (`BlocoCategorias`) falham — sobre refazer a busca ao trocar o mês e sobre refetch falho após carregamento bem-sucedido. **Confirmado pré-existente**, rodando na própria `main` num worktree limpo. Não vem da migração.
- **`chunk<T>` duplicado** entre `src/domain/sessions.ts` e `src/domain/votes.ts` (2ª cópia; a 3ª costuma ser a que diverge).
- **`sort_options_json` tem duas codificações** na mesma coluna: o histórico importado da Go traz `"types":null`, o ramielle grava `"types":[]`. Ninguém lê o campo hoje — mas uma feature futura de "repetir sessão com os mesmos filtros" precisa tolerar as duas.
- **As 4 plataformas de distribuição nunca receberam uma chamada real.** Só o Bluesky tem credencial. ⚠️ Diferente do TMDb, aqui a falha não é silêncio: é um post público que nenhum código despublica.
- **`ADMIN_EMAILS` está em `wrangler.jsonc#vars`** (texto claro, commitado) e é o único gate de privilégio do Worker. Funciona; decidir se vira secret.
