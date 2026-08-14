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

- ~~⚠️ **A `main` está vermelha:** 2 testes de `apps/financas/web` (`BlocoCategorias`)~~ — **RESOLVIDO** em `2449538`: o defeito estava no teste (deriva de calendário — datas de 2026-07 fixas no código sem `vi.useFakeTimers`), não na produção.
- **`chunk<T>` duplicado** entre `src/domain/sessions.ts` e `src/domain/votes.ts` (2ª cópia; a 3ª costuma ser a que diverge).
- **`sort_options_json` tem duas codificações** na mesma coluna: o histórico importado da Go traz `"types":null`, o ramielle grava `"types":[]`. Ninguém lê o campo hoje — mas uma feature futura de "repetir sessão com os mesmos filtros" precisa tolerar as duas.
- **As 4 plataformas de distribuição nunca receberam uma chamada real.** Só o Bluesky tem credencial. ⚠️ Diferente do TMDb, aqui a falha não é silêncio: é um post público que nenhum código despublica.
- **`ADMIN_EMAILS` está em `wrangler.jsonc#vars`** (texto claro, commitado) e é o único gate de privilégio do Worker. Funciona; decidir se vira secret.

---

## 4. Finanças — o que sobrou da varredura de 2026-08-14

A varredura levantou 21 achados; 12 sobreviveram à verificação no código, 8 foram descartados (a maioria sem sintoma descritível; um deles porque **já estava corrigido** e o levantador leu a documentação em vez do código — a mesma armadilha que fez esta varredura existir).

**Fechados no mesmo dia** (`36c2700`, `48e6540`, `ec4d975`, `ea31d60`, `e871b66`, `df49742`): saldo inicial sem campo no formulário (toda conta nascia com 0, e `#/reserva` mostrava "0,0 meses" em vermelho, falso); ausência de `app.onError`; rota de arquivar conta sem botão; duas afirmações falsas no `CLAUDE.md`; e a classe inteira do `mutarERecarregar` (abaixo).

### ⚠️ A classe de defeito que dominou o dia: "concluiu" lido como "falhou"

**7 call sites** tinham a mutação e a recarga no mesmo `try`. Quando o POST devolvia 2xx e o GET seguinte falhava, a tela mostrava o erro do **GET** — o dono lia "falhou", reenviava, e o reenvio **duplicava dado**: pagamento + lançamento de caixa (`debt-detail`), dívida + payee (`DividasPage`), recorrente (`recorrentes`, dupla contagem no Comprometido), item de dívida (`NovoItemForm`, inflando o total e **reabrindo** dívida `settled` — `domain/debts.ts:169-174`).

Resolvido extraindo `web/src/lib/mutar-e-recarregar.ts`, com mensagem específica por ação que nomeia o que a duplicata criaria.

⚠️ **A lição de método, que vale mais que o fix:** a cobertura foi "provada" com `grep "await carregar()"` e o grep **passou batido** no 7º site, onde a recarga se chama `onCreated()` (prop vinda de fora). A frase do commit era literalmente verdadeira e a propriedade continuava falsa. Só a varredura **por propriedade** — abrir os 10 arquivos que fazem POST/PUT/DELETE, um a um — achou o resto. Registrado em `apps/financas/CLAUDE.md` § _O 7º call site, e por que o grep não o achou_.

### Fica registrado, com sintoma medido

- ⚠️ **`CLOUDFLARE_API_TOKEN` não existe** — `gh secret list` volta vazio. `CLOUDFLARE_ACCOUNT_ID` já foi cadastrado em Variables (2026-08-14), então o `deploy-financas.yml` **deixou de ser skipado e agora falha**: run `31821708562`, no primeiro step, com `necessary to set a CLOUDFLARE_API_TOKEN`. Falha inofensiva (erro de auth antes de tocar em nada) e a cadeia inteira está provada correta — só falta a credencial, que só o dono cria. **Enquanto isso, toda publicação é manual**, e foi assim que a produção ficou 4 commits atrás com um Critical no ar.
- ⚠️ **O backup do finanças não tem agendamento.** Medido: nenhum plist de finanças em `~/Library/LaunchAgents`, `crontab -l` vazio, e o destino padrão não existe. A receita do `launchd` está pronta em `apps/financas/CLAUDE.md`; instalar é ação manual. Hoje custa pouco (banco com dados de seed) — custa o livro-caixa inteiro no dia em que ele começar a lançar de verdade.
- **Dar baixa em dívida é porta de mão única.** De `written_off` não se volta: as duas reaberturas (`domain/debts.ts:171` e `:658`) exigem `status='settled'`, e a lista fixa `?status=open` em `DividasPage.tsx:85`. Sem rota de reabertura e sem filtro, a dívida some e o histórico que a confirmação promete preservar fica inalcançável.
- **O livro-caixa é write-only pela UI.** `GET /api/transactions` existe paginado e **não tem tela**; não há `PUT`/`DELETE` de transação. Import com coluna mapeada errada, ou plano de 60× lançado por engano, só se corrige por `wrangler d1 execute --remote`. A listagem é a metade barata (rota pronta, sem consumidor).
- **`POST /api/transfers` nunca é chamado** (0 ocorrências em `web/src`). Mover dinheiro entre contas próprias só é registrável como duas transações soltas — o que vira uma despesa a mais em `#/fluxo` e `#/comprometido`. Toda a máquina anti-dupla-contagem (`transfer_id`, batch de duas pernas, filtros) existe, é testada, e nunca roda.
- **`DividasPage.tsx:134-141` faz dois POSTs no mesmo callback.** Payee criado (201) + dívida recusada (422) deixa um payee órfão, e recriar gera um segundo — `POST /api/payees` não deduplica. Pré-existente, não é regressão.
- **A lista de colunas de `transactions` tem 4 cópias** (`transactions.ts:62-65` com 20, `installments.ts:81-101` com 19, `import.ts:83-103` com 19, `debts.ts:355-360` com 20 à mão). ⚠️ **Provado por mutação que `tsc` NÃO é gate**: coluna nova faltando em `installments.ts` compila com "No errors found"; a mesma omissão em `payDebt` dá 21 erros. Em `installments`/`import` as linhas são `unknown[][]` posicionais.
- **`settled_at` guarda dois formatos na mesma coluna** — data pura em transferência e pagamento de dívida (`transactions.ts:162`, `debts.ts:331`), timestamp UTC no resto. Zero sintoma hoje (`cashflow()` trata os dois); a próxima query que assumir UTC e subtrair 3 h joga as datas-sem-hora pro dia anterior. Corrigir é migration de **dado**, não de código.
- **`--primary` a 2,0:1 de contraste no tema claro** (`packages/ui/src/styles.css:126`), usado no link que abre uma dívida. O `underline` resolveu a afordância, não a legibilidade. ⚠️ Token **compartilhado com `apps/web`** — mudar exige conferida visual lá.
- **⛔ Fatia ④ (Open Finance)** — bloqueada: participação direta exige R$ 1.000.000. Precisa de um spike de ~1 h sobre o Pluggy antes de virar promessa. Ver `apps/financas/CLAUDE.md` § _Pendente — Open Finance / Pluggy_.
- **Sem ambiente de dev para o Worker** — produção segue sendo o primeiro lugar onde uma migration roda.

---

## 5. Modelos locais (promeia) — medido em 2026-08-14

O dono perguntou por `deepseek-v4-flash`, `deepseek-v4-pro` e `kimi-k3`. **Os três estão no `ollama.com/library`, mas só como tags `:cloud`** — não baixam, rodam nos servidores da Ollama, e o `kimi-k3` exige assinatura Pro/Max. Isso quebra as duas premissas de uma vez: **custo zero** e a razão de o `apps/promeia` existir (se o modelo está na nuvem, o Mac vira um salto sem função — o Worker chamaria direto).

Tamanhos, pra fechar a questão contra os ~16 GB úteis de um MacBook Air M4 de 24 GB: DeepSeek V4-Flash tem **82,5 GB** no menor quant (1 bit, 284B MoE), Kimi K3 tem **466–594 GB** (2,8T). ⚠️ A pegadinha do MoE: **"13B ativos" reduz _processamento_, não _memória residente_** — os 284B precisam estar todos endereçáveis, porque o roteador pode escolher qualquer expert a cada token.

**`qwen3.8` também não serve** — só existe em 27b, **18 GB**, acima do teto de _wired memory_ do Metal numa máquina de 24 GB.

**O que cabe:** `qwen3.5:4b` (3,4 GB), `qwen3.5:9b` (6,6 GB), `gemma4:12b` (7,6 GB).

**Recomendação registrada:** trocar **só na revisão de artigo** (`MODEL_PROOFREAD`/`MODEL_PROOFREAD_CAREFUL`/`MODEL_HOOKS`), o que de brinde mata a divergência do `MODEL_HOOKS` apontando pro 7b porque o `qwen2.5:14b` nunca foi baixado. **No insight, não trocar** — a tarefa é redigir um parágrafo sobre números já calculados; o gargalo é o prompt e a quantidade de dado, não o modelo. Evidência: o insight de 2026-08 saiu dizendo _"mantendo-se igual ao mesmo período do ano anterior"_ sobre um banco que não tem ano anterior.

⚠️ **Não existe benchmark verificável de pt-BR** para nenhum dos candidatos (o Open Portuguese LLM Leaderboard está arquivado). A escolha final entre `qwen3.5:9b` e `gemma4:12b` só se resolve rodando o mesmo artigo real nos dois e lendo lado a lado.

✅ **RESOLVIDA em 2026-08-14, e não do jeito que esta seção supunha.** Medido pelo caminho real do `proofread` (um bloco por chamada, títulos chegando sozinhos ao modelo): **a família `qwen3.5` REBAIXA o nível dos títulos** — `qwen3.5:4b` preservou 1/9, `qwen3.5:9b` 4/9, o 9b ainda vazando espanhol. Defaults finais: `MODEL_PROOFREAD=qwen2.5:7b-instruct` (9/9) e `MODEL_PROOFREAD_CAREFUL`/`MODEL_HOOKS=gemma4:12b` (9/9). ⚠️ A primeira tentativa (commit `6808f60`) escolheu o `qwen3.5` porque mediu com o **texto inteiro numa chamada só** — formato que a produção nunca usa e que esconde exatamente esse defeito. História completa em `apps/promeia/CLAUDE.md` § _Modelos de 2026_.
