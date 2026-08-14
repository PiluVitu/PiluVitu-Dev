/**
 * Domínio de `/admin` (fatia ③, Task 5; `registerBackup` acrescentada
 * depois, fix da UX do botão de backup — ver `routes/admin.ts` e
 * `docs/superpowers/ROADMAP.md` § 1) — lê `users` (todos, mais recentes
 * primeiro) e `backups` (últimos N), e REGISTRA um backup feito fora do
 * Worker, para os handlers admin (`routes/admin.ts`). `listUsers`/
 * `listBackups` são porte de `Store.ListUsers`
 * (`apps/api/internal/votacao/users.go:49-73`) e `Store.ListBackups`
 * (`apps/api/internal/votacao/backups.go:50-77`); `registerBackup` é NOVA,
 * sem equivalente no Go (que disparava o backup via `VACUUM INTO`,
 * indisponível no D1).
 *
 * ⚠️ Nenhuma das duas leituras devolve algo pronto pro fio ainda —
 * `listUsers` já devolve o shape FINAL (snake_case, `google_sub` NUNCA
 * selecionado — o Go monta um `map[string]any` explícito sem essa coluna,
 * `handlers/admin/users.go`); `listBackups`/`registerBackup` devolvem a ROW
 * crua do D1 (snake_case), igual a `getSessionMovies`/`getVotingSession`
 * (`domain/sessions.ts`) — a conversão pra PascalCase (`backupToWire`,
 * `lib/wire.ts`) é responsabilidade da ROTA, mesma divisão de
 * responsabilidade já estabelecida por `sessionToWire`/`movieToWire`. A
 * MISTURA de convenções entre as duas rotas de LEITURA É o contrato — ver
 * `routes/admin.ts` pro raciocínio completo.
 */
import { toIsoUtc } from '../lib/dates'
import type { BackupRow } from '../lib/wire'

/**
 * Shape final de `GET /admin/users` — já sem `google_sub`, já com `is_admin`
 * como boolean.
 *
 * ⚠️ `picture: string` (NUNCA `string | null`) — o Go declara
 * `votacao.User.Picture` como `string` (nunca ponteiro); o scan usa
 * `sql.NullString.String`, que vira `""` quando a coluna é `NULL`. Mesma
 * convenção que `routes/auth.ts#GET /auth/me` já segue
 * (`picture: user.picture ?? ''`) — os dois campos vêm do MESMO
 * `User.Picture` do Go, não são independentes.
 *
 * `created_at` é RFC3339 (`toIsoUtc`) — o Go serializa `User.CreatedAt`
 * (`time.Time`) via `json.NewEncoder` (`internal/httpx/respond.go:57`), que
 * produz RFC3339 (`"2026-05-19T12:00:00Z"`), nunca o formato cru do D1
 * (`"2026-05-19 12:00:00"`, sem `T`/`Z` — rejeitado como `Invalid Date` no
 * Safari, mesma classe de bug já medida 3× neste projeto).
 */
export type AdminUser = {
  id: number
  name: string
  email: string
  picture: string
  is_admin: boolean
  created_at: string
}

type UsersRowForAdmin = {
  id: number
  name: string
  email: string
  picture: string | null
  is_admin: number
  created_at: string
}

/**
 * Todos os usuários — porte de `Store.ListUsers`. A query já não seleciona
 * `google_sub` (nem `id` é omitido, mas a lista de colunas abaixo é
 * exaustiva de propósito: qualquer coluna nova em `users` no futuro tem que
 * ser adicionada aqui EXPLICITAMENTE pra sair no fio, nunca por acidente).
 *
 * ⚠️ `ORDER BY created_at DESC, id DESC` — o desempate por `id DESC` não é
 * decoração: sem ele, usuários criados no mesmo segundo saem em ordem
 * INDEFINIDA (`users.go:52`, mesmo comentário do brief desta task).
 */
export async function listUsers(db: D1Database): Promise<AdminUser[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, email, picture, is_admin, created_at
         FROM users
        ORDER BY created_at DESC, id DESC`,
    )
    .all<UsersRowForAdmin>()
  return results.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    // `?? ''` — coluna NULL vira string vazia, nunca `null` (ver o
    // comentário de `AdminUser.picture` acima).
    picture: row.picture ?? '',
    is_admin: row.is_admin === 1,
    // toIsoUtc — nunca o formato cru "YYYY-MM-DD HH:MM:SS" do
    // CURRENT_TIMESTAMP do SQLite (ver o comentário de `AdminUser.created_at`
    // acima).
    created_at: toIsoUtc(row.created_at),
  }))
}

/**
 * Os `limit` backups mais recentes — porte de `Store.ListBackups`
 * (`backups.go:50-77`). Devolve a ROW crua do D1 (snake_case) — a rota
 * converte pra `WireBackup` via `backupToWire`.
 *
 * ⚠️ Mesmo clamp do Go: `limit <= 0 || limit > 200` cai pro default 50
 * (`backups.go:51`). O handler admin (`routes/admin.ts`) sempre passa 50,
 * então este clamp nunca dispara na prática — portado mesmo assim, porque
 * paridade é o critério, não "é sempre 50 então não precisa".
 *
 * `ORDER BY created_at DESC, id DESC` — mesma razão de `listUsers`
 * (`backups.go:56`).
 */
export async function listBackups(
  db: D1Database,
  limit: number,
): Promise<BackupRow[]> {
  const clampedLimit = limit <= 0 || limit > 200 ? 50 : limit
  const { results } = await db
    .prepare(
      `SELECT id, drive_file_id, drive_file_name, size_bytes, trigger_type, created_at
         FROM backups
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .bind(clampedLimit)
    .all<BackupRow>()
  return results
}

/** Corpo já validado de `POST /admin/backup` — ver `routes/admin.ts`. */
export type RegisterBackupInput = {
  fileName: string
  sizeBytes: number
  triggerType: 'cron' | 'manual' | 'session_close'
}

/**
 * Registra um backup feito FORA do Worker — `apps/ramielle/scripts/backup-d1.sh`
 * chama a rota depois de gravar e validar o `.sql.gz` local. Sem
 * equivalente no Go: lá `POST /admin/backup` DISPARAVA o backup (`VACUUM
 * INTO` + upload pro Drive); o D1 não tem `VACUUM INTO`, e `wrangler d1
 * export` é uma operação da API de gerenciamento da Cloudflare que não pode
 * viver num Worker público. Ver `routes/admin.ts` e
 * `docs/superpowers/ROADMAP.md` § 1 pro raciocínio completo da troca de
 * sentido da rota.
 *
 * ⚠️ **`drive_file_id`/`drive_file_name` recebem o MESMO valor
 * (`input.fileName`).** As colunas são herdadas do desenho antigo (Drive),
 * onde um arquivo tinha um ID de Drive separado do nome de exibição. Um
 * backup local não tem essa distinção — o nome do arquivo (com o carimbo
 * UTC embutido pelo script, `ramielle-<carimbo>.sql.gz`) já é único sozinho.
 * Inventar um "id" fake só para preencher a coluna seria pior que
 * reaproveitá-la com o mesmo valor de `drive_file_name`.
 *
 * INSERT simples com `RETURNING id` + um segundo SELECT pra devolver a
 * linha completa (com `created_at` já aplicado pelo default da migration)
 * — mesmo padrão de `domain/sessions.ts#createVotingSession`.
 */
export async function registerBackup(
  db: D1Database,
  input: RegisterBackupInput,
): Promise<BackupRow> {
  const inserted = await db
    .prepare(
      `INSERT INTO backups (drive_file_id, drive_file_name, size_bytes, trigger_type)
       VALUES (?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(input.fileName, input.fileName, input.sizeBytes, input.triggerType)
    .first<{ id: number }>()

  if (inserted === null) {
    throw new Error(
      'registerBackup: INSERT ... RETURNING id não devolveu linha',
    )
  }

  const row = await db
    .prepare(
      `SELECT id, drive_file_id, drive_file_name, size_bytes, trigger_type, created_at
         FROM backups WHERE id = ?`,
    )
    .bind(inserted.id)
    .first<BackupRow>()

  if (row === null) {
    throw new Error('registerBackup: linha não encontrada logo após o insert')
  }
  return row
}
