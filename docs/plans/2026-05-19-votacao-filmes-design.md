# Votação de Filmes — Design

> Status: aprovado em brainstorming. Pronto pra fase de planning detalhado e implementação.
> Data: 2026-05-19
> Autor: paulo.tspi@gmail.com

## Contexto

Existe hoje uma automação no n8n que lê uma planilha Google Sheets de filmes/séries, sorteia 1 título por categoria, e chama a API de um site externo pra criar uma votação em grupo. A automação será descontinuada e a lógica migra pra dentro do PiluVitu, com UI própria, persistência local em SQLite e backup automático no Google Drive.

## Decisões de produto

| Decisão | Escolha |
|---|---|
| Onde os usuários votam | UI própria no PiluVitu (Next.js) |
| Fonte do catálogo de filmes | Google Sheets em runtime (sem migração) |
| Auth dos votantes | Google OAuth, no Go API (não Better Auth) |
| Mecânica do voto | Escolha única, 1 vencedor por sessão |
| Backup do DB | Cron diário + botão on-demand no admin |
| Histórico | Visível pra qualquer Google logado |
| Quem pode votar | Qualquer Google logado |
| Sorteio quando filme+série juntos | 1 por categoria, agnóstico de tipo |
| Pôster | TMDb API por título, fail-soft (placeholder se 404) |
| Tipo (filme/série), assistido, categorias | Toggles no form de criar sessão |

## Stack

| Camada | Tech |
|---|---|
| UI (admin + votação + histórico) | Next.js 16 + React 19 + shadcn/ui |
| Auth (OAuth Google + sessão) | Go API com `golang.org/x/oauth2/google` + `alexedwards/scs` (cookie HttpOnly, SameSite=Lax) |
| API de domínio | Go API com chi + `modernc.org/sqlite` (puro Go, sem CGo) |
| Persistência | SQLite arquivo `/data/votacao.db` em volume Docker |
| Catálogo de filmes | Google Sheets (Service Account, escopo `spreadsheets.readonly`) |
| Pôsters | TMDb API (`/search/movie`, `/search/tv`) |
| Backup | Google Drive (Service Account, escopo `drive.file`) + `VACUUM INTO` |
| Cron | `robfig/cron/v3` in-process |

## Setup Google (uma vez)

1. **Service Account** no Google Cloud Console com 2 escopos:
   - `https://www.googleapis.com/auth/spreadsheets.readonly`
   - `https://www.googleapis.com/auth/drive.file`
2. Compartilhar a planilha de filmes com o e-mail da SA (Viewer).
3. Criar pasta "PiluVitu Backups" no Drive, compartilhar com SA (Editor), copiar `folderId` da URL.
4. JSON key salvo em `infra/secrets/google-sa.json`, montado read-only no container.
5. **OAuth Client ID** separado (Web application) pro login dos votantes — `Authorized redirect URI`: `https://api.piluvitu.com.br/auth/google/callback`.
6. TMDb: criar conta gratuita em [themoviedb.org](https://themoviedb.org), copiar API key.

### Env vars

```
GOOGLE_APPLICATION_CREDENTIALS=/secrets/google-sa.json
GSHEETS_MOVIES_SPREADSHEET_ID=<id da planilha>
GSHEETS_MOVIES_RANGE=A2:F
GDRIVE_BACKUP_FOLDER_ID=<id da pasta>
GDRIVE_BACKUP_KEEP=30
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URL=https://api.piluvitu.com.br/auth/google/callback
SESSION_SECRET=<random 32 bytes hex>
ADMIN_EMAILS=paulo.tspi@gmail.com
TMDB_API_KEY=...
SQLITE_PATH=/data/votacao.db
BACKUP_CRON=0 3 * * *
```

## Layout da planilha

| Col | Conteúdo | Uso |
|---|---|---|
| A | Nº | id externo (auditoria, gravado em `sheet_number`) |
| B | Título | `title` |
| C | Filme ou Série? | `type` (`filme` / `serie`) |
| D | Gênero | `category` |
| E | Assistido? | `was_watched` (snapshot no momento do sortear) |
| F | Nota? | ignorada (só pós-assistido) |

Reader normaliza categoria pra lowercase, pula linhas sem categoria/título, ignora coluna G+.

## Schema SQLite (`apps/api/internal/votacao/schema.sql`)

```sql
CREATE TABLE users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub      TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL,
  name            TEXT NOT NULL,
  picture         TEXT,
  is_admin        INTEGER NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE voting_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('open','closed')),
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at         DATETIME,
  winner_movie_id   INTEGER REFERENCES session_movies(id),
  sort_options_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE session_movies (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('filme','serie')),
  poster_url    TEXT,
  tmdb_id       INTEGER,
  was_watched   INTEGER NOT NULL DEFAULT 0,
  sheet_number  INTEGER,
  UNIQUE (session_id, category)
);

CREATE TABLE votes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES voting_sessions(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  movie_id    INTEGER NOT NULL REFERENCES session_movies(id),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, user_id)
);

CREATE TABLE backups (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  drive_file_id   TEXT NOT NULL,
  drive_file_name TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  trigger_type    TEXT NOT NULL CHECK (trigger_type IN ('cron','manual','session_close')),
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  token   TEXT PRIMARY KEY,
  data    BLOB NOT NULL,
  expiry  DATETIME NOT NULL
);
CREATE INDEX idx_sessions_expiry ON sessions(expiry);
```

## Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/auth/google/login` | público | Inicia OAuth, redireciona Google |
| GET | `/auth/google/callback` | público | Recebe code, valida ID token, upsert user, cria sessão scs |
| POST | `/auth/logout` | logado | Destrói sessão |
| GET | `/auth/me` | logado | Retorna user atual |
| POST | `/votacao/sessions` | admin | Lê Sheets, filtra, sorteia, busca TMDb, cria sessão `open` |
| GET | `/votacao/sessions` | logado | Lista sessões (com vencedor se closed) |
| GET | `/votacao/sessions/:id` | logado | Detalhe + filmes + se já votei |
| POST | `/votacao/sessions/:id/votes` | logado | Registra voto (idempotente via UNIQUE) |
| POST | `/votacao/sessions/:id/close` | admin | Fecha, calcula winner, dispara backup `session_close` |
| GET | `/votacao/sessions/:id/results` | logado (se closed); admin sempre | Tally por filme |
| POST | `/admin/backup` | admin | Backup on-demand |
| GET | `/admin/backups` | admin | Histórico de backups |

Admin é determinado por `is_admin` em `users`, populado no upsert comparando email contra `ADMIN_EMAILS` (CSV). Inicialmente: `paulo.tspi@gmail.com`.

CORS: `AllowCredentials: true`, origens explícitas (sem `*`), reusa a config atual em `internal/router/router.go`.

## Sorteio (`internal/votacao/sortear.go`)

Função pura, sem I/O:

```go
type SheetMovie struct {
    Number    int
    Title     string
    Type      string  // "filme" | "serie"
    Category  string  // normalizado lowercase
    Watched   bool
}

type SortOptions struct {
    Types           []string  // ["filme"], ["serie"], ou ambos
    IncludeWatched  bool
    Categories      []string  // subset de categorias a considerar
}

func SortOnePerCategory(movies []SheetMovie, opts SortOptions, rng *rand.Rand) ([]SheetMovie, error) {
    filtered := filter(movies, opts)                 // aplica types + watched + categories
    byCat := groupByCategory(filtered)               // map[string][]SheetMovie
    if len(byCat) == 0 {
        return nil, ErrNoCandidates
    }
    picked := make([]SheetMovie, 0, len(byCat))
    for _, cat := range slices.Sorted(maps.Keys(byCat)) {
        list := byCat[cat]
        picked = append(picked, list[rng.Intn(len(list))])
    }
    return picked, nil
}
```

100% testável com `*_test.go` colocated (regras do projeto: testes ao lado da fonte).

## Backup (`internal/backup/runner.go`)

```go
func Run(ctx context.Context, trigger string) error {
    snapPath := filepath.Join(os.TempDir(), fmt.Sprintf("votacao-snapshot-%d.db", time.Now().UnixNano()))
    defer os.Remove(snapPath)

    // 1. VACUUM INTO — snapshot consistente sem lock
    if _, err := db.ExecContext(ctx, "VACUUM INTO ?", snapPath); err != nil {
        return fmt.Errorf("vacuum: %w", err)
    }

    // 2. Upload pro Drive
    name := fmt.Sprintf("votacao-%s-%s.db", time.Now().Format("2006-01-02-150405"), trigger)
    fileID, size, err := gdrive.Upload(ctx, snapPath, name)
    if err != nil { return err }

    // 3. INSERT em backups
    if _, err := db.ExecContext(ctx, `INSERT INTO backups ...`, fileID, name, size, trigger); err != nil {
        return err
    }

    // 4. Rotation — mantém GDRIVE_BACKUP_KEEP mais novos
    return gdrive.Rotate(ctx, keep)
}
```

Cron in-process via `robfig/cron/v3`. `BACKUP_CRON` default `0 3 * * *` (3 da manhã, horário local).

## Estrutura de pacotes Go

```
apps/api/internal/
  auth/
    google.go           # oauth2 flow
    middleware.go       # RequireAuth, RequireAdmin
    session.go          # scs setup com sqlite3store
  votacao/
    schema.sql
    store.go            # acesso DB
    sortear.go          # pura
    sortear_test.go
    sessions.go         # criar, fechar, calcular winner
    votes.go
  gsheets/
    client.go
    movies.go           # ReadMovies(ctx) → []SheetMovie
    movies_test.go      # com fixture JSON
  gdrive/
    client.go
    backup.go           # upload + rotation
  tmdb/
    client.go           # SearchPoster(title, type) → url, tmdbID, error
    client_test.go
  backup/
    runner.go
    cron.go
  handlers/votacao/     # HTTP handlers thin
  handlers/admin/
```

UI Next.js segue regra de colocation:

```
apps/web/app/(site)/votacao/
  page.tsx
  page.test.tsx
  page.stories.tsx
  [id]/
    page.tsx
    page.test.tsx
  historico/
    page.tsx
  admin/
    page.tsx
apps/web/components/votacao/
  movie-card.tsx
  movie-card.stories.tsx
  movie-card.test.tsx
  vote-button.tsx
  session-status-badge.tsx
  create-session-form.tsx
  results-chart.tsx
  backup-list.tsx
apps/web/lib/votacao/
  api-client.ts
  types.ts
apps/web/e2e/votacao.spec.ts  # Playwright E2E
```

## Fluxos críticos

### Criar sessão (admin)
1. Admin clica "Nova votação" → modal carrega categorias disponíveis (`GET /votacao/categorias` lê do Sheets, dedup).
2. Submit `POST /votacao/sessions` com `{ title, types, include_watched, categories }`.
3. Go: lê Sheets → filtra → sorteia → pra cada filme chama TMDb → INSERT em transação.
4. Retorna sessão com filmes e `poster_url` (ou null).

### Votar
1. Votante abre `/votacao/[id]`, vê filmes em grid de cards.
2. Clica num card (radio), botão "Votar" habilita.
3. `POST /votacao/sessions/:id/votes` com `{ movie_id }`.
4. UNIQUE constraint impede voto duplicado (409 → UI mostra "você já votou").

### Fechar sessão (admin)
1. Admin clica "Encerrar" → confirmação modal.
2. `POST /votacao/sessions/:id/close`.
3. Go: calcula winner via SQL (`COUNT(*) GROUP BY movie_id ORDER BY DESC LIMIT 1`), em empate pega o primeiro (admin desempata manual depois se precisar).
4. UPDATE session SET status='closed', winner_movie_id, closed_at.
5. Dispara `backup.Run(ctx, "session_close")` async (não bloqueia resposta).

### Backup automático
1. Cron `0 3 * * *` chama `backup.Run(ctx, "cron")`.
2. Falhas: log + alerta (futuro: push notification ou e-mail). Não derruba a app.

## Testes

| Camada | Ferramenta | Cobertura |
|---|---|---|
| `sortear.go` (puro) | `go test` | Happy + edge (sem categorias, filtros vazios, 1 candidato) |
| `gsheets.movies.go` | `go test` com fixture HTTP | Parse de várias linhas + edge cases (categoria vazia, header) |
| `tmdb.client.go` | `go test` com `httptest.Server` | Happy + 404 + ambiguidade |
| `backup.runner.go` | `go test` com SQLite temp + Drive mock | VACUUM INTO funcionando, rotation |
| Handlers HTTP | `go test` com `httptest` | Auth, validação, status codes |
| UI components | Jest + Storybook | Cada componente isolado |
| Rotas Next.js | Jest + RTL | Renderização + interação |
| Fluxos críticos | Playwright (`votacao.spec.ts`) | Login → criar sessão → votar → fechar → ver histórico |

## Roadmap de implementação

| Fase | Escopo | Critério de saída |
|---|---|---|
| 1 | DB + migrations + store básico | Schema criado, CRUD com testes, container sobe com volume `api-data` montado |
| 2 | Auth Go (OAuth + scs) | `/auth/google/login` funcionando local, `/auth/me` retorna user, `is_admin` setado via env |
| 3 | Sheets reader + sorteio puro | `gsheets.ReadMovies()` lê planilha real, `SortOnePerCategory()` 100% testado |
| 4 | TMDb client + handlers de sessions | `POST /votacao/sessions` cria sessão end-to-end com posters |
| 5 | Vote + close + results | Fluxo completo no backend, testes de integração |
| 6 | Drive backup + cron | `POST /admin/backup` sobe arquivo, cron ativo, rotation funcionando |
| 7 | Next.js UI completa | Todas rotas, Storybook, E2E happy path |
| 8 | Polimento | Loading/error states, mobile, E2E edge cases, observabilidade |

Cada fase = 1 PR mergeável. Após fase 7 a feature já é usável; fase 8 melhora qualidade.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| TMDb retorna pôster errado (título ambíguo) | Admin pode editar pôster manualmente após sortear (futuro). MVP: fail-soft pra placeholder. |
| API Down (Sheets/TMDb/Drive) | Sortear retorna 502 com mensagem clara. Backup falha → log + retry no próximo cron. |
| Container reinicia durante votação | Cookie scs sobrevive (DB), DB sobrevive (volume). Sessão de votação intacta. |
| Volume Docker corrompido | Backups diários no Drive (30 mais recentes). Recovery: download do mais recente + bind mount. |
| Cloudflare Tunnel offline (Mac desligado) | Votação indisponível enquanto isso. Inerente ao setup atual; resolve quando migrar pra Cloud Run. |
| Custo TMDb | API gratuita, 50 req/s. Volume real: ~5 req por sessão criada (1x/semana). |

## Fora do escopo (intencionalmente)

- Sistema de comentários nos filmes
- Notificações (e-mail/push) quando sessão abre
- Importação de catálogo via TMDb (manter Sheets como source-of-truth manual)
- Múltiplos grupos/famílias (1 grupo só)
- Rank/ELO de filmes vencedores
- App mobile separado (PWA do site já basta)
- Admin com permissões granulares (admin é admin de tudo)
