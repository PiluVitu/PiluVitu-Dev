/**
 * Domínio de `/admin` (fatia ③, Task 5) — lê `users` (todos, mais recentes
 * primeiro) e `backups` (últimos N) para os handlers admin
 * (`routes/admin.ts`). Porte de `Store.ListUsers`
 * (`apps/api/internal/votacao/users.go:49-73`) e `Store.ListBackups`
 * (`apps/api/internal/votacao/backups.go:50-77`).
 *
 * ⚠️ Nenhuma das duas devolve algo pronto pro fio ainda — `listUsers` já
 * devolve o shape FINAL (snake_case, `google_sub` NUNCA selecionado — o Go
 * monta um `map[string]any` explícito sem essa coluna,
 * `handlers/admin/users.go`); `listBackups` devolve a ROW crua do D1
 * (snake_case), igual a `getSessionMovies`/`getVotingSession`
 * (`domain/sessions.ts`) — a conversão pra PascalCase (`backupToWire`,
 * `lib/wire.ts`) é responsabilidade da ROTA, mesma divisão de
 * responsabilidade já estabelecida por `sessionToWire`/`movieToWire`. A
 * MISTURA de convenções entre as duas rotas É o contrato — ver
 * `routes/admin.ts` pro raciocínio completo.
 */
import type { BackupRow } from '../lib/wire'

/** Shape final de `GET /admin/users` — já sem `google_sub`, já com `is_admin` como boolean. */
export type AdminUser = {
  id: number
  name: string
  email: string
  picture: string | null
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
    picture: row.picture,
    is_admin: row.is_admin === 1,
    created_at: row.created_at,
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
