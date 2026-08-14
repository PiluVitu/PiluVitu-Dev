/**
 * Domínio de `distribution_targets` — base da fatia de distribuição de
 * artigo (dev.to, Hashnode, Bluesky, Mastodon). Porte 1:1 de
 * `apps/api/internal/distribution/store.go` (116 linhas) — schema em
 * `migrations/0004_distribution.sql` (porte de
 * `apps/api/internal/distribution/schema.sql`).
 *
 * `DistributionTarget` já é o shape final do fio: ao contrário de
 * `VotingSession`/`SessionMovie` (PascalCase, sem tag `json:` no Go), o
 * struct `Target` do Go TEM tags `json:"snake_case"` explícitas
 * (`store.go:20-28`) — o encoder já emite snake_case, então não existe
 * `distributionTargetToWire` nenhum: este domínio devolve direto o que sai
 * no fio, mesmo papel que `AdminUser` (`domain/admin.ts`) já cumpre pra
 * `GET /admin/users`.
 *
 * ⚠️ **`created_at`/`posted_at` existem na tabela mas NÃO saem daqui** — a
 * lista de colunas de toda query abaixo é EXAUSTIVA de propósito (mesmo
 * comentário de `listUsers`), espelhando o `SELECT` do Go
 * (`store.go:68-69,91-92`), que também as omite. Consequência: a armadilha
 * de data crua do D1 (`"2026-05-19 12:00:00"` quebrando `new Date()` no
 * Safari — já medida 3× neste projeto, ver `lib/dates.ts`) **não se aplica
 * hoje**, porque nenhuma das duas colunas atravessa o fio. Se algum dia
 * alguém expuser `created_at`/`posted_at` numa resposta, a normalização tem
 * que passar por `toIsoUtc` (`lib/dates.ts`) antes de sair — mesmo padrão
 * já seguido por `sessionToWire`/`movieToWire`/`backupToWire`.
 */

/**
 * Porte de `distribution.Kind` (`store.go:11-17`) — separa republicação de
 * artigo (`article_crosspost`) de chamada social (`social_hook`).
 */
export type DistributionKind = 'article_crosspost' | 'social_hook'

/**
 * Porte do comentário `// pending | posted | failed | skipped` em
 * `distribution.Target.Status` (`store.go:25`) — o Go não define um tipo
 * próprio pra isto (é `string` cru, só documentado no comentário); aqui
 * vira union por precisão de tipo, sem mudar nenhum valor possível.
 */
export type DistributionStatus = 'pending' | 'posted' | 'failed' | 'skipped'

/**
 * Porte de `distribution.Target` (`store.go:19-28`) — já com as tags
 * `json:"snake_case"` do Go refletidas nos nomes de campo (ver o
 * comentário do arquivo).
 */
export type DistributionTarget = {
  slug: string
  platform: string
  kind: DistributionKind
  content: string
  status: DistributionStatus
  remote_url: string
  error: string
}

// Lista de colunas exaustiva, na mesma ordem do SELECT do Go
// (`store.go:68-69,91-92`) — `id`/`created_at`/`posted_at` ficam de fora de
// propósito (ver o comentário do arquivo).
const TARGET_COLUMNS = `slug, platform, kind, content, status, remote_url, error`

/** `''`/`undefined` vira `'pending'` — porte de `statusOr` (`store.go:44-50`). */
function statusOr(
  status: DistributionStatus | '' | undefined,
): DistributionStatus {
  return status === undefined || status === '' ? 'pending' : status
}

export type UpsertDistributionTargetInput = {
  slug: string
  platform: string
  kind: DistributionTarget['kind']
  content: string
  /** Vazio ou omitido vira `'pending'` (`statusOr` acima). */
  status?: DistributionStatus | ''
}

/**
 * Insere ou atualiza por `(slug, platform)` — porte de `Store.Upsert`
 * (`store.go:52-64`). O `ON CONFLICT` depende do `UNIQUE(slug, platform)`
 * da migration.
 *
 * ⚠️ **`content` é SEMPRE sobrescrito pelo valor novo; `status` só é
 * sobrescrito quando a linha existente NÃO está `'posted'`** — o `CASE
 * WHEN distribution_targets.status = 'posted' THEN 'posted' ELSE
 * excluded.status END` (idêntico ao Go, `store.go:61`) é o que faz um
 * re-upsert (o fluxo normal de "gerar propostas de novo") reescrever o
 * texto salvo de um alvo já publicado SEM rebaixar o selo `'posted'` nem
 * mexer em `remote_url` (que este UPDATE nem toca). É comportamento
 * OBSERVÁVEL do produto, não uma sobra pra "limpar" — ver o teste
 * `upsert preserva status/remote_url de um alvo já posted` em
 * `distribution.test.ts`.
 */
export async function upsertDistributionTarget(
  db: D1Database,
  input: UpsertDistributionTargetInput,
): Promise<void> {
  const status = statusOr(input.status)
  await db
    .prepare(
      `INSERT INTO distribution_targets (slug, platform, kind, content, status)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(slug, platform) DO UPDATE SET
         content = excluded.content,
         kind    = excluded.kind,
         status  = CASE WHEN distribution_targets.status = 'posted' THEN 'posted' ELSE excluded.status END`,
    )
    .bind(input.slug, input.platform, input.kind, input.content, status)
    .run()
}

/**
 * Todos os alvos de um artigo, ordenados por `kind` depois `platform` —
 * porte de `Store.ListBySlug` (`store.go:66-86`). `ORDER BY kind, platform`
 * é comparação de string simples nas duas pontas (Go: `ORDER BY` no SQL
 * também), sem colação especial — não há acento nem caractere fora do BMP
 * em nenhum dos dois valores (são identificadores internos, não texto
 * livre), então unidade de código UTF-16 e byte UTF-8 concordam.
 */
export async function listDistributionTargetsBySlug(
  db: D1Database,
  slug: string,
): Promise<DistributionTarget[]> {
  const { results } = await db
    .prepare(
      `SELECT ${TARGET_COLUMNS}
         FROM distribution_targets
        WHERE slug = ?
        ORDER BY kind, platform`,
    )
    .bind(slug)
    .all<DistributionTarget>()
  return results
}

/**
 * `null` quando o alvo não existe — nunca lança. Porte de `Store.Get`
 * (`store.go:88-100`): lá, `row.Scan` devolve `sql.ErrNoRows` sem tradução
 * pra um sentinela; o único chamador (`service.go:89`) trata QUALQUER erro
 * como "não postado ainda" (`err == nil && existing.Status == "posted"`) —
 * ou seja, na prática "não encontrado" e "erro" são tratados igual a
 * "segue o fluxo normal". Devolver `null` aqui é a tradução direta desse
 * comportamento observável, mesmo padrão de `getVotingSession`
 * (`domain/sessions.ts`) — quem decidiria um 404 seria a rota (fora do
 * escopo desta task).
 */
export async function getDistributionTarget(
  db: D1Database,
  slug: string,
  platform: string,
): Promise<DistributionTarget | null> {
  return db
    .prepare(
      `SELECT ${TARGET_COLUMNS}
         FROM distribution_targets
        WHERE slug = ? AND platform = ?`,
    )
    .bind(slug, platform)
    .first<DistributionTarget>()
}

/**
 * Marca publicado — porte de `Store.MarkPosted` (`store.go:102-108`).
 * `postedAtIso` é o relógio INJETADO pelo chamador (`nowIsoUtc()` de
 * `lib/dates.ts`), nunca `new Date()` chamado aqui dentro — mesmo padrão
 * de `closeVotingSession` (`domain/sessions.ts`), que mantém este domínio
 * testável sem mockar relógio global. `posted_at` não sai no fio hoje (ver
 * o comentário do arquivo), mas é gravado do mesmo jeito, por paridade.
 */
export async function markDistributionTargetPosted(
  db: D1Database,
  slug: string,
  platform: string,
  remoteUrl: string,
  postedAtIso: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE distribution_targets
          SET status = 'posted', remote_url = ?, error = '', posted_at = ?
        WHERE slug = ? AND platform = ?`,
    )
    .bind(remoteUrl, postedAtIso, slug, platform)
    .run()
}

/**
 * Marca falho — porte de `Store.MarkFailed` (`store.go:110-116`). Não toca
 * `remote_url`/`posted_at` (o Go também não).
 */
export async function markDistributionTargetFailed(
  db: D1Database,
  slug: string,
  platform: string,
  errorMessage: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE distribution_targets
          SET status = 'failed', error = ?
        WHERE slug = ? AND platform = ?`,
    )
    .bind(errorMessage, slug, platform)
    .run()
}
