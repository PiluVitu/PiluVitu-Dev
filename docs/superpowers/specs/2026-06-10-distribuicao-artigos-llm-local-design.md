# Distribuição de artigos com LLM local — Design

- **Data:** 2026-06-10
- **Status:** Aprovado para implementação (MVP — Fase 0 + Fase 1)
- **Autor:** Paulo Victor T. Silva (+ Claude)

## Objetivo

Replicar — integrado ao monorepo PiluVitu, sem n8n — o fluxo que antes vivia no n8n:

1. Enquanto escrevo um artigo no `/admin`, um botão **"Corrigir texto"** roda uma LLM **local** (Ollama no Mac) que conserta erros de digitação/gramática preservando o meu tom e a estrutura MDX.
2. Ao **publicar**, o sistema lê o post, **republica** o artigo completo em plataformas de blog (dev.to, Hashnode) com `canonical_url` apontando pro meu blog, e **gera chamadas sociais** (Bluesky, Mastodon) com a LLM.
3. As chamadas sociais aparecem numa **tela de aprovação** no `/admin`, **editáveis**, com botão de **refino por IA**. Nada é postado sem eu aprovar; o texto que vai pra rede é sempre o que está no campo na hora do "Publicar".

Tudo "sobe junto com o túnel local": Ollama + Go API + Cloudflare Tunnel orquestrados como um stack único.

## Decisões-chave (travadas no brainstorming)

| Decisão           | Escolha                                                                                        | Porquê                                                                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onde a LLM roda   | **Self-hosted Ollama no Mac (nativo, Metal)**                                                  | Privacidade + custo zero de API. Nativo, não Docker, porque Ollama em container no macOS não acessa a GPU/Metal.                                        |
| Quem orquestra    | **Go API** (não CLI standalone)                                                                | A API já roda no Mac atrás do Cloudflare Tunnel e alcança o Ollama por `localhost`. O `/admin` (Vercel) já chama a API cross-site com cookie de sessão. |
| Gatilho           | **Integrado ao `/admin`**: botão "Corrigir" (interativo) + publish → propor → aprovar → postar | Coerente com o fluxo de escrita atual; sem daemon de polling.                                                                                           |
| Plataformas (MVP) | **dev.to, Hashnode** (artigo) + **Bluesky, Mastodon** (chamadas)                               | APIs abertas/gratuitas. X, Threads, LinkedIn, Instagram = adapters de fase 2/3 (Medium tem API de postagem morta).                                      |
| Startup           | **process-compose**                                                                            | Há ordem de boot real (Ollama saudável + modelo baixado → API) e restart-on-crash; declarativo e versionado.                                            |
| Fonte do artigo   | **`/admin` lê do GitHub (`BLOG_REPO_TOKEN`) e envia o conteúdo pra API**                       | Não duplica credencial do GitHub no Go; a API só faz LLM + postagem.                                                                                    |

## Topologia & alcançabilidade

```
┌─ Vercel ──────────┐         ┌─ Mac (atrás do Cloudflare Tunnel) ──────────────┐
│  /admin (Next.js)  │         │                                                  │
│  • botão Corrigir  │──tunnel─▶  Go API (chi)                                    │
│  • tela Distribuir │  cookie │   • internal/llm     ──localhost:11434──▶ Ollama │
│                    │◀────────│   • internal/distribution ─HTTPS─▶ dev.to /      │
└────────────────────┘         │                          Hashnode/Bluesky/Mastodon
   (fonte do artigo:           └──────────────────────────────────────────────────┘
    GitHub via BLOG_REPO_TOKEN)
```

- O navegador chama o Go API direto (`NEXT_PUBLIC_API_URL` + `credentials: 'include'`), exatamente como o `/votação` faz hoje (`apps/web/lib/votacao/api-client.ts`).
- Ollama **nunca** é exposto à internet — a API fala com ele por `localhost:11434`.
- **Degradação honesta:** Mac desligado → túnel cai → botão "Corrigir" e tela "Distribuição" ficam **desabilitados** com aviso "LLM local offline". O blog (Vercel/ISR) continua no ar normalmente. Endpoints LLM da API respondem **503** se o Ollama estiver indisponível (mesmo padrão fail-soft de Sheets/Drive hoje).

## Modelos no Ollama (Mac M4, 24 GB)

Tudo configurável por env; padrões recomendados:

| Tarefa                      | Env                      | Modelo padrão            | Tamanho (q4) | Por quê                                         |
| --------------------------- | ------------------------ | ------------------------ | ------------ | ----------------------------------------------- |
| Corrigir texto (interativo) | `OLLAMA_MODEL_PROOFREAD` | `qwen2.5:7b-instruct`    | ~4.7 GB      | forte em PT-BR, rápido pra resposta na hora     |
| Gerar/refinar chamadas      | `OLLAMA_MODEL_HOOKS`     | `qwen2.5:14b-instruct`   | ~9 GB        | mais qualidade nos hooks; cabe folgado em 24 GB |
| Base URL                    | `OLLAMA_BASE_URL`        | `http://localhost:11434` | —            | onde a API encontra o Ollama                    |

Pode-se começar com o 7B nas duas tarefas e subir os hooks pro 14B depois — é só trocar a env.

## Startup (process-compose)

`process-compose.yaml` na raiz declara três processos:

1. **ollama** — `ollama serve`; `readiness_probe` em `GET /api/tags`; antes disso um passo `ollama pull` dos modelos das envs (idempotente).
2. **api** — `make dev-api` (ou binário); `depends_on: ollama (healthy)`.
3. **tunnel** — `cloudflared tunnel run …`; `depends_on: api (healthy)`.

`restart: on_failure` em cada um; shutdown limpo dos três no Ctrl-C. Novo comando documentado no `CLAUDE.md` (ex.: `make stack` → `process-compose up`, ou direto `process-compose up`).

## Componentes

### Go API — `internal/llm` (espelha o padrão TMDb)

Cliente do Ollama com seam de teste e fail-soft:

```go
type Client struct { baseURL string; http *http.Client; modelProofread, modelHooks string }
func NewClient(baseURL, modelProofread, modelHooks string) *Client
func NewClientWithHTTP(baseURL string, h *http.Client, ...) *Client // teste (httptest)

// Conserta prosa; preserva frontmatter, code fences, JSX/MDX e links.
func (c *Client) Proofread(ctx context.Context, text string) (corrected string, err error)
// Gera uma chamada por plataforma, respeitando limites de tamanho.
func (c *Client) GenerateHooks(ctx context.Context, a Article, platforms []string) ([]Hook, error)
// Refina uma chamada existente conforme instrução opcional.
func (c *Client) Refine(ctx context.Context, platform, text, instruction string) (refined string, err error)
```

Prompts versionados em arquivo (`internal/llm/prompts/`). Health-check no boot loga disponibilidade; handlers respondem 503 se indisponível.

### Go API — `internal/distribution` (porta + adapters, Open/Closed)

```go
type Kind string // "article_crosspost" | "social_hook"

type Publisher interface {
    Platform() string
    Kind() Kind
    Publish(ctx context.Context, p Payload) (remoteURL string, err error)
}
// MVP: devto, hashnode (article_crosspost); bluesky, mastodon (social_hook).
// Cada adapter é fail-soft: ausente da lista de ativos se faltar a env.
```

- **dev.to** (`DEVTO_API_KEY`): `POST /api/articles` com `body_markdown`, `tags`, `canonical_url`, `published: true`.
- **Hashnode** (`HASHNODE_API_TOKEN`, `HASHNODE_PUBLICATION_ID`): GraphQL `publishPost` com `originalArticleURL` (canonical).
- **Bluesky** (`BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`): cria sessão (AT Protocol) + `createRecord` (`app.bsky.feed.post`), ≤ 300 chars.
- **Mastodon** (`MASTODON_INSTANCE_URL`, `MASTODON_ACCESS_TOKEN`): `POST /api/v1/statuses`, ≤ 500 chars.

### Go API — endpoints (todos com `RequireAdmin`)

| Método | Rota                                 | Entrada                                   | Saída                                                           |
| ------ | ------------------------------------ | ----------------------------------------- | --------------------------------------------------------------- |
| `POST` | `/admin/llm/proofread`               | `{text}`                                  | `{corrected}`                                                   |
| `POST` | `/admin/llm/refine`                  | `{platform, text, instruction?}`          | `{refined}`                                                     |
| `POST` | `/admin/distribution/proposals`      | `{slug, title, excerpt, tags, body, url}` | gera hooks + monta alvos, **persiste**, retorna `{targets:[…]}` |
| `GET`  | `/admin/distribution/{slug}`         | —                                         | estado atual do job + alvos                                     |
| `POST` | `/admin/distribution/{slug}/publish` | `{targets:[{platform, content}]}`         | posta só nos selecionados; atualiza status/URL                  |

Todos no envelope padrão `{ ok, data, notifications }`. Middleware: `r.With(auth.RequireAdmin(deps.Sessions, deps.Store))`.

### Persistência (SQLite — já existe no API)

```sql
CREATE TABLE distribution_targets (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  platform TEXT NOT NULL,          -- devto | hashnode | bluesky | mastodon
  kind TEXT NOT NULL,              -- article_crosspost | social_hook
  content TEXT NOT NULL,           -- markdown (artigo) ou texto da chamada
  status TEXT NOT NULL,            -- pending | posted | failed | skipped
  remote_url TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  posted_at TEXT,
  UNIQUE(slug, platform)
);
```

**Idempotência:** alvo com `status = 'posted'` não é repostado (o `/publish` ignora). Migration informada ao usuário pra rodar (não rodar sozinho).

### Web `/admin` — UI

**(a) Botão "Corrigir texto"** — perto da `MdxToolbar` em `components/admin/posts/post-editor.tsx`. Pega o `body` atual → `POST /admin/llm/proofread` → abre **modal de diff** (aceitar/rejeitar por bloco ou tudo). Nunca sobrescreve sozinho. Loading + desabilitado se API/túnel off.

**(b) Tela "Distribuição"** — aba no editor, também acionada ao "Publicar". Lê o post (`getPost` via `BLOG_REPO_TOKEN`) e chama `proposals`. Renderiza:

```
┌─ Distribuição · "Meu artigo novo" ─────────────────────────────────┐
│ Republicar artigo (canonical → piluvitu.com.br)                     │
│  [✓] dev.to     status: ⏳ pendente                                  │
│  [✓] Hashnode   status: ⏳ pendente                                  │
│                                                                     │
│ Chamadas sociais (editáveis)                                        │
│  [✓] Bluesky  ┌────────────────────────────────────────────┐       │
│               │ Acabei de escrever sobre X... 🧵 link↓      │ ✏️    │
│               └────────────────────────────────────────────┘       │
│               instrução: [ deixa mais informal e curto    ] [Refinar IA]
│               · 142/300 chars                                       │
│  [✓] Mastodon ┌────────────────────────────────────────────┐       │
│               │ Novo post no blog: ...                      │ ✏️    │
│               └────────────────────────────────────────────┘       │
│               instrução: [                                ] [Refinar IA]
│                                                                     │
│              [ Regerar todas ]        [ Publicar selecionadas ]     │
└─────────────────────────────────────────────────────────────────────┘
```

- Campo de cada chamada é **editável**; "Refinar IA" chama `/admin/llm/refine` com o texto + instrução opcional e substitui o conteúdo do campo.
- Contador de caracteres por plataforma (Bluesky 300, Mastodon 500).
- "Publicar selecionadas" envia, por alvo, **o texto que está no campo**. Pós-publish: ✅ com link ou ❌ com erro por alvo.

## Fluxos de dados

**Corrigir (interativo):** editor (`body`) → `POST /admin/llm/proofread` → Ollama → `{corrected}` → modal de diff → usuário aceita → atualiza `body` no editor.

**Publicar → distribuir:**

1. Save normal: `PUT /api/admin/posts/[slug]` → commit no GitHub → revalida ISR (fluxo atual, intacto).
2. `/admin` lê o post (`getPost`) e chama `POST /admin/distribution/proposals` com o conteúdo.
3. API gera hooks (Ollama) + monta alvos (article_crosspost p/ dev.to/Hashnode; social_hook p/ Bluesky/Mastodon), persiste como `pending`, retorna.
4. Usuário edita/refina/seleciona → `POST /admin/distribution/{slug}/publish`.
5. API posta nos selecionados via adapters, grava `posted`/`failed` + `remote_url`/`error`.

## Categorias de conteúdo

- **Republicação (artigo inteiro):** dev.to + Hashnode recebem o **corpo completo** + `canonical_url`/`originalArticleURL` pro blog (não compete no SEO consigo mesmo). LLM mínima (no máximo afina tags/descrição).
- **Chamadas sociais (hook):** Bluesky + Mastodon recebem texto **curto gerado/refinado pela LLM**, com link — é o que é editável/aprovável.

## Erros & resiliência

- Ollama off → endpoints LLM respondem **503**; UI desabilita botões com aviso.
- Falha de uma plataforma não derruba as outras (postagem por alvo, erro isolado e gravado).
- `proposals` é regenerável sem repostar (não toca em alvos já `posted`).
- Timeouts generosos nos endpoints LLM (geração local pode levar segundos); MVP é request/response com loading (sem streaming).

## Testes (obrigatório — CLAUDE.md)

- **Go (`go test -race`):** `internal/llm` (Ollama mockado via `httptest`); cada adapter de `internal/distribution` (API da plataforma mockada); geração de propostas; idempotência do `/publish`.
- **Web (colocation):** `*.test.tsx` + `*.stories.tsx` do botão "Corrigir" (loading/erro/diff) e da tela "Distribuição" (editável, refino, contadores, status).
- **E2E (Playwright, `*.e2e.ts` ao lado da rota):** corrigir → aprovar → status, com API mockada.

## Env vars novas

**API (`apps/api/.env.example`):** `OLLAMA_BASE_URL`, `OLLAMA_MODEL_PROOFREAD`, `OLLAMA_MODEL_HOOKS`, `DEVTO_API_KEY`, `HASHNODE_API_TOKEN`, `HASHNODE_PUBLICATION_ID`, `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`, `MASTODON_INSTANCE_URL`, `MASTODON_ACCESS_TOKEN`. Todas opcionais/fail-soft.

**Web:** nenhuma nova obrigatória (reusa `NEXT_PUBLIC_API_URL` e `BLOG_REPO_TOKEN`).

## Fora de escopo (YAGNI / fases seguintes)

- **Fase 2/3 — adapters futuros** (a interface `Publisher` já acomoda): X/Twitter, Threads, LinkedIn (app review `w_member_social`), Instagram (conta Business + Facebook Page + imagem em URL pública + app review; stories limitado).
- Medium (API de postagem descontinuada — no máximo rascunho manual).
- Streaming token-a-token no "Corrigir".
- Agendamento de posts; geração de imagem de capa por IA.

## Documentação a atualizar ao implementar

- `apps/api/CLAUDE.md` — módulos `llm`/`distribution`, endpoints, envs, Ollama nativo, fluxo.
- `apps/web/CLAUDE.md` — botão "Corrigir", tela "Distribuição".
- `CLAUDE.md` (raiz) — `process-compose`/`make stack` e o stack local Ollama+API+túnel.
