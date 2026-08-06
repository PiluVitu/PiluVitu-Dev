/**
 * As três rotas de `/admin` da votação (fatia ③, Task 5, ÚLTIMA task de
 * código desta fatia) — porte de
 * `apps/api/internal/handlers/admin/users.go#ListUsers` e
 * `apps/api/internal/handlers/admin/backup.go#ListBackups`/`#CreateBackup`
 * (montagem em `router.go:81-95`, todas atrás de `RequireAdmin`). Mesma
 * convenção do resto do monorepo (`routes/votacao.ts`): `Env` local, NUNCA
 * importa `Bindings` de `../index` (evitaria import circular valor↔tipo).
 *
 * ⚠️⚠️ **A ARMADILHA DESTA TASK — as duas rotas de LEITURA têm convenções de
 * wire OPOSTAS, e "deixar consistente" quebra a produção.**
 *
 *   - `GET /admin/users` é **snake_case** (`is_admin`, `created_at`) — o
 *     handler Go monta um `map[string]any` explícito, à mão
 *     (`handlers/admin/users.go`). `domain/admin.ts#listUsers` já devolve
 *     o shape FINAL nesse formato, `google_sub` nunca sai.
 *   - `GET /admin/backups` é **PascalCase** — o handler Go devolve
 *     `[]Backup` DIRETO (`httpx.Data(w, 200, map[string]any{"backups": rows})`),
 *     e o struct `Backup` NÃO tem tag `json:` nenhuma — o encoder usa os
 *     nomes de campo Go como estão. `backupToWire` (`lib/wire.ts`) reproduz
 *     isso byte a byte, MESMO precedente de `sessionToWire`/`movieToWire`
 *     (`routes/votacao.ts`) — nunca montado à mão aqui.
 *
 * O contrato exato que `apps/web` já consome hoje
 * (`apps/web/lib/votacao/types.ts:98-105`,
 * `components/votacao/admin/backups-panel.tsx`): emitir `drive_file_name`
 * em vez de `DriveFileName` quebraria `/admin/sessoes` em produção — a
 * tabela renderiza `undefined` em toda linha, sem erro nenhum.
 */
import { Hono } from 'hono'
import { listBackups, listUsers } from '../domain/admin'
import type { AuthBindings } from '../lib/auth'
import { errJson, okJson } from '../lib/envelope'
import { requireAdmin, type SessionVariables } from '../lib/session'
import { backupToWire } from '../lib/wire'

type Env = {
  Bindings: AuthBindings
  Variables: SessionVariables
}

const adminRoutes = new Hono<Env>()

/**
 * `GET /admin/users` (admin) — porte de `ListUsers`
 * (`handlers/admin/users.go`). `200 {users: [...]}`, snake_case — ver o
 * cabeçalho deste arquivo pro porquê da convenção.
 */
adminRoutes.get('/users', requireAdmin<AuthBindings>(), async (c) => {
  const users = await listUsers(c.env.DB)
  return okJson({ users })
})

/**
 * `GET /admin/backups` (admin) — porte de `ListBackups`
 * (`handlers/admin/backup.go`). `200 {backups: [...]}`, PascalCase via
 * `backupToWire` — teto de 50 aplicado dentro de `domain/admin.ts#listBackups`
 * (mesmo clamp do Go, `backups.go:51`).
 */
adminRoutes.get('/backups', requireAdmin<AuthBindings>(), async (c) => {
  const rows = await listBackups(c.env.DB, 50)
  return okJson({ backups: rows.map(backupToWire) })
})

/**
 * `POST /admin/backup` (admin) — porte de `CreateBackup`
 * (`handlers/admin/backup.go`). **Sempre** `503 backup_disabled` —
 * mensagem copiada LITERAL do Go ("Backup está desativado."). Não é um
 * stub preguiçoso: é o MESMO caminho degradado que a Go já tem quando
 * `h.deps.Runner == nil` (nenhum `GDRIVE_BACKUP_FOLDER_ID` configurado), e
 * `apps/web` já trata esse código (`components/votacao/admin/backups-panel.tsx`).
 *
 * Aqui o degradado é PERMANENTE, não uma pendência de configuração: o D1
 * não tem `VACUUM INTO` (a técnica que `backup.Runner.Run` usa pra gerar o
 * snapshot SQLite antes de subir pro Drive) — o backup deste monorepo já é
 * outro mecanismo inteiramente (`scripts/backup-d1.sh`, export lógico via
 * `wrangler d1 export`), não ligado a este endpoint. Ver
 * `apps/ramielle/CLAUDE.md`.
 */
adminRoutes.post('/backup', requireAdmin<AuthBindings>(), () => {
  return errJson(503, 'backup_disabled', 'Backup está desativado.')
})

export default adminRoutes
