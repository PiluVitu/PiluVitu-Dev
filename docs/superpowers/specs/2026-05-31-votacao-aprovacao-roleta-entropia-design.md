# Votação — voto de aprovação + roleta de desempate com entropia de câmera

**Data:** 2026-05-31
**Status:** Aprovado (brainstorming) — pronto para o plano de implementação
**Autor:** Paulo Victor (via Claude Code)

## Contexto

A feature de Votação de Filmes (`/votacao`) hoje permite **1 voto por usuário por sessão**
(travado por `UNIQUE(session_id, user_id)`), e o desempate é:

1. determinístico por menor `movie_id` em `ComputeWinner`, e/ou
2. um **runoff** que reabre a votação só com os filmes empatados (`CreateRunoff`).

Cada sessão sorteia **1 filme por categoria** (categorias distintas dentro de uma sessão).

Este design muda três coisas e adiciona um módulo reutilizável:

1. **Voto de aprovação** — cada usuário vota em quantos filmes quiser.
2. **Roleta de desempate** — no empate, a roleta sorteia o vencedor na hora (substitui o runoff por re-votação).
3. **Motor de entropia a partir de foto ao vivo** — a aleatoriedade é reforçada por entropia
   derivada de uma foto capturada na hora, **processada no navegador**; só um hash/digest vai pro
   backend, **nunca a imagem** (modelo "LavaRand" da Cloudflare).
4. **Módulo do site** — `lib/entropy` (lógica pura) + componentes reutilizáveis + uma página
   standalone em `/tools/roleta`, com a votação consumindo a mesma lib.

E um requisito transversal:

5. **Log estruturado** para auditoria do sorteio e rastreabilidade de erros.

## Decisões (brainstorming)

| #   | Decisão                         | Escolha                                                                                         |
| --- | ------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Quantos votos por usuário       | **Aprovação** — quantos filmes quiser (qualquer subconjunto)                                    |
| 2   | Fluxo no empate                 | **Roleta decide na hora** — substitui o runoff por re-votação                                   |
| 3   | Foto / quando                   | **Admin captura ao vivo** no momento do giro                                                    |
| 4   | Escopo do módulo                | **Lib compartilhada `lib/entropy` + tool em `/tools` + votação** consome                        |
| a   | Onde a aleatoriedade é decidida | **Approach A — mistura provably-fair no servidor** (votação) / cliente decide (tool standalone) |
| b   | Voto                            | **Editável até o fechamento**                                                                   |
| c   | Migration do `votes`            | **Rebuild idempotente** no `migrate()` no startup                                               |
| d   | Logging                         | **`log/slog` + `middleware.RequestID`**                                                         |

## Abordagem de aleatoriedade — Approach A (provably-fair)

O browser deriva um **digest de entropia** (foto ao vivo + `crypto.getRandomValues`) e envia
**apenas os 32 bytes de digest** (hex). A Go API mistura esse digest com um nonce próprio
(`crypto/rand`), deriva o índice vencedor entre os filmes empatados, persiste o vencedor +
auditoria e devolve o vencedor + nonce. A roleta no cliente anima até cair no vencedor retornado.

Propriedades:

- **Nenhum lado controla sozinho** o resultado (cliente fornece entropia, servidor fornece nonce).
- **A foto nunca sai do navegador** — só o hash.
- **Reproduzível/auditável**: dado `client_entropy`, `server_nonce`, `session_id` e os `tied_ids`,
  qualquer um recomputa `SHA-256(client ‖ nonce ‖ session_id ‖ tied_ids)` → índice → vencedor.
- A entropia da foto é **misturada no pool**, não é a única fonte (fiel ao LavaRand).

A página `/tools/roleta` standalone usa o caminho **cliente-decide** (PRNG semeado localmente) —
é só um sorteador, não há o que persistir nem fraudar.

## Arquitetura — módulo de entropia

| Unidade                                                                    | Tipo                                               | Responsabilidade                                                                                                                                                                                                                                                                                            | Depende de                                                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `apps/web/lib/entropy/prng.ts`                                             | TS puro (Jest)                                     | PRNG determinístico semeado (sfc32): `pick(n)`, `shuffle(arr)`, `float()`, `nextUint32()`. Dado o mesmo seed → mesma sequência.                                                                                                                                                                             | —                                                                                                                                              |
| `apps/web/lib/entropy/digest.ts`                                           | TS (WebCrypto `crypto.subtle`, roda em Node/jsdom) | `mixEntropy(...sources: Uint8Array[]): Promise<Uint8Array>` (SHA-256 da concatenação). `toHex`/`fromHex`. **Sempre** injeta `crypto.getRandomValues(32)` como uma das fontes → mesmo sem câmera, sai CSPRNG. `seedFromDigest(digest): number[]` (deriva o estado do sfc32).                                 | —                                                                                                                                              |
| `apps/web/lib/entropy/index.ts`                                            | TS                                                 | Barrel de exports.                                                                                                                                                                                                                                                                                          | prng, digest                                                                                                                                   |
| `apps/web/hooks/use-camera-entropy.ts`                                     | hook client (DOM)                                  | `getUserMedia({video})` → desenha N frames (2–3, alguns ms de intervalo) num `<canvas>` offscreen → `getImageData` → `Uint8Array` → `mixEntropy(...frames, cryptoRandom)`. Para a stream e **descarta a imagem**. Retorna `{ capture(): Promise<{digestHex, source}>, state, error }` com `source: 'camera' | 'crypto-only'`.                                                                                                                                | digest.ts |
| `apps/web/components/entropy/roulette-wheel.tsx` (+`.stories.tsx`)         | componente                                         | Roda visual. Props: `options: {id,label,color?}[]`, `winnerId: number                                                                                                                                                                                                                                       | null`, `spinning: boolean`, `onSpinEnd?()`. Anima e **para no `winnerId`**; sem `winnerId` fica idle. Acessível (texto do vencedor anunciado). | —         |
| `apps/web/components/entropy/camera-entropy-capture.tsx` (+`.stories.tsx`) | componente                                         | UI de consentimento + captura. Mostra preview enquanto captura, aviso "processada localmente e descartada; só o hash é enviado", e botão. Emite `onEntropy({digestHex, source})`. Fallback explícito quando sem câmera/permissão.                                                                           | use-camera-entropy                                                                                                                             |

**Por que amostrar 2–3 frames:** o ruído de sensor difere frame-a-frame mesmo em cena estática —
isso é entropia real (fiel ao LavaRand). Sempre misturado com `crypto.getRandomValues` para um piso CSPRNG.

**Regra de camada:** `lib/entropy/prng.ts` e `digest.ts` não tocam DOM/React (testáveis em Jest).
A captura via câmera (DOM) fica no hook/componente.

## Página standalone `/tools/roleta`

100% client-side, showcase do módulo:

- `apps/web/lib/tools/roleta.ts` (+`.test.ts`) — lógica pura: normaliza a lista de opções, e
  `drawWinner(options, prng): index` (delega ao `prng.pick`). Sem DOM.
- `apps/web/components/tools/roleta-tool.tsx` (+`.stories.tsx`) — UI: textarea de opções (uma por
  linha), `<CameraEntropyCapture>` opcional, `<RouletteWheel>`, botão "Girar". Captura entropia →
  semeia o `prng` → escolhe → anima a roleta até o vencedor.
- `apps/web/app/(site)/tools/roleta/page.tsx` — página.
- Entrada em `apps/web/lib/tools-registry.ts` (`{ slug: 'roleta', title: 'Roleta / Sorteio',
description: 'Sorteio com entropia da câmera', icon, group }`).
- E2E: casos novos em `apps/web/e2e/tools.spec.ts` (entropia mockada / `crypto-only`).

## Votação — voto de aprovação (múltiplos votos)

### Banco (`apps/api/internal/votacao/schema.sql`)

`votes` troca `UNIQUE(session_id, user_id)` → **`UNIQUE(session_id, user_id, movie_id)`**
(impede aprovar o mesmo filme duas vezes; permite vários filmes por usuário).

### Store (`apps/api/internal/votacao/votes.go`)

- `InsertVote` → **`ReplaceUserVotes(ctx, sessionID, userID, movieIDs []int64) error`**:
  numa transação, `DELETE FROM votes WHERE session_id=? AND user_id=?` e re-insere o conjunto.
  Valida que cada `movieID` pertence à sessão (senão `ErrMovieNotInSession`). Conjunto vazio = remove todos.
- `GetUserVote` → **`GetUserVotes(ctx, sessionID, userID) ([]int64, error)`**.
- `HasVoted` permanece.
- `ListSessionVotesWithUsers` permanece (agora pode retornar várias linhas por usuário — ok).
- `ComputeWinner` / `ComputeTopMovies` / `TallyVotes` **não mudam** (já contam por filme).

### Handler (`apps/api/internal/handlers/votacao/votes.go`)

- `POST /votacao/sessions/{id}/votes` passa a aceitar `{ "movie_ids": [int,...] }` e chama
  `ReplaceUserVotes`. Resposta `200` com `{ "voted_movie_ids": [...] }` + toast. Erros:
  `400 invalid_json`, `400 movie_not_in_session`, `409 session_closed` (não vota em sessão fechada),
  `401 not_authenticated`.
- Remove a semântica de `409 already_voted` (não existe mais — agora é substituição de conjunto).

### GetSession (`apps/api/internal/handlers/votacao/sessions.go`)

- `voted_movie_id` (singular) → **`voted_movie_ids: number[]`** (de `GetUserVotes`).
  `has_voted = len(voted_movie_ids) > 0`.

### Frontend votação

- `apps/web/lib/votacao/types.ts` — `SessionDetail.voted_movie_id` → `voted_movie_ids: number[]`.
- `apps/web/hooks/votacao/use-vote-mutation.ts` — envia `movie_ids: number[]`.
- `apps/web/components/votacao/vote-section.tsx` — multi-seleção (`Set<number>`), inicializada com
  `voted_movie_ids`; botão "Votar (n)"; editável enquanto `!closed`.
- `apps/web/components/votacao/movie-card.tsx` — `selected`/`youVoted` por pertencimento ao set.
- `apps/web/components/votacao/results-list.tsx` — marca "seu voto" em **cada** filme aprovado;
  expõe `total_voters` (distintos) além de `total_votes` (aprovações).
- `GetResults` no backend adiciona `total_voters` (COUNT DISTINCT user_id).

## Votação — desempate na roleta (substitui o runoff)

### CloseSession (`apps/api/internal/handlers/votacao/votes.go`)

- Apura `ComputeTopMovies`. **Topo único** → grava vencedor com `winner_method='votes'`.
  **Empate (≥2)** → fecha com `winner_movie_id = NULL` e `winner_method = NULL` (empate pendente).
- Remove o desempate determinístico por menor id na hora do close.

### Novo endpoint `POST /votacao/sessions/{id}/tiebreak` (admin)

- Body: `{ "entropy": "<hex de 64 chars / 32 bytes>" }`.
- Valida: sessão existe, `status='closed'`, ainda empatada, sem vencedor. Senão:
  `404 session_not_found`, `409 session_not_closed`, `422 no_tie`, `409 winner_already_set`,
  `400 invalid_entropy` (hex/length).
- Mistura: `serverNonce = crypto/rand 32 bytes`;
  `seed = SHA-256(clientEntropy ‖ serverNonce ‖ sessionID ‖ sortedTiedIDs)`.
- Índice **sem viés** entre os empatados (ordenados asc). Implementação: rejection sampling sobre
  os bytes do seed (descarta o resto que causaria viés de módulo) → `idx ∈ [0, n)`.
- `winner = tied[idx]`. Grava vencedor (`winner_method='roulette'`), insere linha em `tiebreaks`,
  loga `event=tiebreak_draw`. Retorna `{ winner_movie_id, tied_movie_ids, server_nonce }`.

### Tabela `tiebreaks` (auditoria durável)

```sql
CREATE TABLE IF NOT EXISTS tiebreaks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  triggered_by    INTEGER NOT NULL REFERENCES users(id),
  tied_ids_json   TEXT NOT NULL,
  client_entropy  TEXT NOT NULL,   -- hash hex enviado pelo cliente (NUNCA a imagem)
  server_nonce    TEXT NOT NULL,   -- hex do nonce do servidor
  winner_movie_id INTEGER NOT NULL REFERENCES session_movies(id),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tiebreaks_session ON tiebreaks(session_id);
```

`voting_sessions` ganha `winner_method TEXT` (`'votes' | 'roulette' | NULL`).

### Lógica pura testável (Go)

`apps/api/internal/votacao/tiebreak.go` — `PickTiebreakIndex(seed []byte, n int) int`
(determinístico dado o seed, sem viés) + `TiebreakSeed(clientEntropy, serverNonce []byte,
sessionID int64, tiedIDs []int64) []byte`. Testes em `tiebreak_test.go`
(determinismo, distribuição aproximadamente uniforme, reprodutibilidade do seed).

### Frontend desempate

- **Remove** `RunoffButton`, `CreateRunoff` (handler + rota), `use-create-runoff.ts` e os
  testes/stories que dependem do runoff.
- Novo `apps/web/components/votacao/tiebreak-roulette.tsx` (+`.stories.tsx`): só admin, sessão
  fechada e empatada. Fluxo: `<CameraEntropyCapture>` → `useCreateTiebreak` (POST tiebreak) →
  `<RouletteWheel winnerId={...}>` anima até o vencedor → atualiza results.
- `apps/web/hooks/votacao/use-create-tiebreak.ts` — mutation; invalida results/detail no sucesso.
- `apps/web/lib/votacao/results.ts` / `results-list.tsx` — badge "🎲 Vencedor no desempate" quando
  `winner_method='roulette'`.

## Privacidade & honestidade

- A foto é capturada, hasheada e **descartada no navegador**. Só o digest hex (32 bytes) trafega.
- O servidor revela `server_nonce` → qualquer um recomputa o sorteio (provably-fair).
- Sem câmera/permissão → `source='crypto-only'` (CSPRNG do navegador); nada quebra.
- Nada de pixel buffer em log (cliente) e a imagem não existe no servidor.

## Logging, auditoria e rastreabilidade (§8)

### Backend (`log/slog`)

- `main.go` inicializa o `slog` default: **JSON em prod, texto em dev** (sinal do ambiente já
  existente, ex. `SESSION_COOKIE_SECURE`).
- `internal/router/router.go` adiciona `middleware.RequestID` antes do `Logger` → todo log tem `request_id`.
- `internal/logging` (novo): `FromContext(ctx) *slog.Logger` enriquecido com `request_id` + `user_id`.
- **Toda via de erro loga no ponto da falha** antes do envelope:
  `log.Error("...", "err", err, "session_id", id, "code", code)`. (Hoje os erros somem.)
- Eventos `Info` de negócio: `votes_replaced` (user, session, set antigo→novo), `session_closed`
  (winner | empate), `tiebreak_draw`.
- **`tiebreak_draw`** (auditoria crítica): `session_id`, `user_id`, `tied_ids`, `client_entropy`
  (hash), `server_nonce`, `index`, `winner_movie_id`, `request_id` — **e** linha persistida em `tiebreaks`.

### Frontend

- `apps/web/lib/log.ts` (novo): wrapper leve sobre `console` (nível + prefixo). Loga **etapas** do
  fluxo de entropia/roleta (`source`, prefixo do digest, vencedor) e **erros** com contexto.
  **Nunca** loga bytes de imagem / pixel buffer. Ponto de integração comentado para error-reporter
  futuro (sem nova dependência agora).

## Migration (rebuild idempotente do `votes`)

A troca de `UNIQUE` exige rebuild (SQLite não altera `UNIQUE` in-place). No `migrate()`
(`apps/api/internal/votacao/store.go`), passo idempotente: via `PRAGMA index_list(votes)` detecta
o índice único antigo `(session_id,user_id)`; se presente, dentro de uma transação:
`CREATE TABLE votes_new (...novo schema...)` → `INSERT ... SELECT` (de-dup por
`session_id,user_id,movie_id`) → `DROP votes` → `ALTER TABLE votes_new RENAME TO votes` → recria índices.
Roda no startup como o resto do schema. Também documento o SQL manual.

> **Conforme a regra do projeto, não rodo migrations.** Em **dev**, o caminho limpo é apagar o
> SQLite de dev: `rm apps/api/tmp/votacao.db` (recriado no próximo start). Em **prod**, o rebuild
> idempotente roda sozinho no deploy (com backup antes via fluxo de backup existente).

## Testes (diretivas de QA do projeto)

- **Jest:** `lib/entropy/prng.test.ts` (determinismo + distribuição), `lib/entropy/digest.test.ts`
  (mix estável, hex), `lib/tools/roleta.test.ts`, `lib/votacao/results.test.ts` (multi-voto/roleta).
- **Go:** `tiebreak_test.go` (índice determinístico/sem viés, seed reproduzível),
  `votes_test.go` (`ReplaceUserVotes`, validação de filme, de-dup), apuração com aprovação,
  handler do tiebreak (`tiebreak_test.go` em handlers — 404/409/422/200 + envelope).
- **Storybook:** `roulette-wheel`, `camera-entropy-capture`, `roleta-tool`, `vote-section` (multi),
  `results-list` (vencedor por roleta), `tiebreak-roulette`.
- **Playwright:** `apps/web/app/(site)/votacao/votacao.e2e.ts` (multi-voto + roleta com entropia
  mockada via `page.route`/`addInitScript`) e `apps/web/e2e/tools.spec.ts` (`/tools/roleta`).
- **Lint/build:** `pnpm prettier:fix` → `pnpm lint` → `make test` → `pnpm --filter @piluvitu/web build`
  - `cd apps/api && go vet ./... && go test ./...`.

## Atualização de documentação

- `CLAUDE.md`: novo fluxo de voto de aprovação, roleta de desempate, módulo `lib/entropy`,
  endpoint `/votacao/sessions/{id}/tiebreak`, tabela `tiebreaks`, logging `slog`/`RequestID`,
  e a nova tool `/tools/roleta`.

## Fora de escopo (YAGNI)

- Endpoint genérico de RNG reutilizável (descartado na decisão #4).
- Ranking/voto ponderado (escolhido aprovação simples).
- Error-reporter no cliente (só deixo o ponto de integração).
- Captura de entropia por participantes (só o admin captura).

## Unidades e interfaces (resumo)

- **`lib/entropy/prng`** — entra seed (number[]), sai sequência determinística. Pura.
- **`lib/entropy/digest`** — entram fontes de bytes, sai digest. Sempre injeta CSPRNG. Pura.
- **`use-camera-entropy`** — DOM → digest hex + source. Descarta imagem.
- **`RouletteWheel`** — options + winnerId → animação. Sem lógica de sorteio.
- **`tiebreak.go`** — entropia(cliente)+nonce(servidor)+ids → índice. Puro/determinístico.
- **`ReplaceUserVotes`** — conjunto de movieIDs por usuário, transacional, validado.
- **`POST /tiebreak`** — orquestra: valida → mistura → persiste → audita → responde.
