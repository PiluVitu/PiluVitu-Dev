/**
 * As três rotas de `/admin` da votação (fatia ③, Task 5, porte original) —
 * porte de `apps/api/internal/handlers/admin/users.go#ListUsers` e
 * `apps/api/internal/handlers/admin/backup.go#ListBackups` (montagem em
 * `router.go:81-95`, todas atrás de `RequireAdmin`). Mesma convenção do
 * resto do monorepo (`routes/votacao.ts`): `Env` local, NUNCA importa
 * `Bindings` de `../index` (evitaria import circular valor↔tipo).
 *
 * ⚠️⚠️ **A duas rotas de LEITURA têm convenções de wire OPOSTAS, e "deixar
 * consistente" quebra a produção.**
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
 *
 * `POST /admin/backup` NÃO é mais porte de `CreateBackup` (a Go disparava
 * o backup; aqui ele já não existe mais como capacidade do Worker) — ver o
 * comentário da própria rota, mais abaixo, e `docs/superpowers/ROADMAP.md`
 * § 1.
 */
import { Hono } from 'hono'
import { listBackups, listUsers, registerBackup } from '../domain/admin'
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

const TRIGGER_TYPES = new Set(['cron', 'manual', 'session_close'])

type ParsedRegisterBackupBody = {
  fileName: string
  sizeBytes: number
  triggerType: 'cron' | 'manual' | 'session_close'
}

/**
 * Valida o corpo de `POST /admin/backup` — rota NOVA (ver o comentário da
 * rota abaixo), sem decoder Go pra espelhar. `null` sinaliza corpo
 * genericamente inválido (não é um objeto) — a rota decide `400
 * invalid_json`; um campo específico faltando/com tipo errado devolve um
 * erro dedicado com `field`, mesmo padrão de `title_required` em
 * `POST /votacao/sessions` (`routes/votacao.ts`).
 */
function parseRegisterBackupBody(
  raw: unknown,
):
  | ParsedRegisterBackupBody
  | { field: string; code: string; message: string }
  | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null
  }
  const body = raw as Record<string, unknown>

  if (typeof body.file_name !== 'string' || body.file_name.trim() === '') {
    return {
      field: 'file_name',
      code: 'file_name_required',
      message: 'Informe o nome do arquivo de backup.',
    }
  }

  if (
    typeof body.size_bytes !== 'number' ||
    !Number.isInteger(body.size_bytes) ||
    body.size_bytes <= 0
  ) {
    return {
      field: 'size_bytes',
      code: 'invalid_size_bytes',
      message: "'size_bytes' precisa ser um inteiro positivo.",
    }
  }

  if (
    typeof body.trigger_type !== 'string' ||
    !TRIGGER_TYPES.has(body.trigger_type)
  ) {
    return {
      field: 'trigger_type',
      code: 'invalid_trigger_type',
      message:
        "'trigger_type' precisa ser 'cron', 'manual' ou 'session_close'.",
    }
  }

  return {
    fileName: body.file_name,
    sizeBytes: body.size_bytes,
    triggerType: body.trigger_type as 'cron' | 'manual' | 'session_close',
  }
}

/**
 * `POST /admin/backup` (admin) — trocou de sentido. Não existe MAIS
 * equivalente Go pra portar: lá a rota DISPARAVA o backup (`VACUUM INTO` +
 * upload pro Drive, síncrono dentro do request); aqui o D1 não tem `VACUUM
 * INTO`, e `wrangler d1 export` é uma operação da API de gerenciamento da
 * Cloudflare (credencial de CONTA) que não pode viver num Worker público —
 * ver `apps/ramielle/CLAUDE.md` § _Backup do D1_.
 *
 * A troca de sentido está decidida e justificada em
 * `docs/superpowers/ROADMAP.md` § 1, opção (b): em vez de *disparar* um
 * backup, esta rota agora **REGISTRA** um backup feito FORA do Worker —
 * `scripts/backup-d1.sh` chama esta rota, best-effort, DEPOIS de gravar e
 * validar o `.sql.gz` local (as três checagens do próprio script:
 * não-vazio, tem `CREATE TABLE`, gzip íntegro, mais a guarda de tamanho
 * contra o backup anterior). O motivo de existir uma rota pra isso em vez
 * de o script escrever direto no D1: o painel (`GET /admin/backups`, já
 * existente) e o resto da API só enxergam o D1 de produção através do
 * Worker — não há credencial de `wrangler d1 execute --remote` disponível
 * pro script "gravar direto" sem reimplementar o mesmo caminho de auth que
 * esta rota já tem.
 *
 * A ANTIGA resposta `503 backup_disabled` some por completo — não é mais
 * um caminho alcançável desta rota (o Worker nunca dispara backup; a
 * pergunta "está desabilitado?" deixou de fazer sentido pra este endpoint).
 * `apps/web` também deixou de chamar esta rota do navegador: o corpo
 * (`file_name`/`size_bytes`) só o script tem — ver `backups-panel.tsx`.
 *
 * Continua atrás de `requireAdmin` (a votação deste Worker é LIVRE —
 * qualquer conta Google loga — então sem o guard certo qualquer votante
 * conseguiria escrever linhas falsas em `backups`); mutação obrigatória
 * (trocar `requireAdmin` por `requireAuth`) rodada e revertida contra o
 * teste "conta autenticada mas não-admin responde 403" em
 * `routes/admin.test.ts`.
 */
adminRoutes.post('/backup', requireAdmin<AuthBindings>(), async (c) => {
  let rawBody: unknown
  try {
    rawBody = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', 'Corpo da requisição inválido.')
  }

  const parsed = parseRegisterBackupBody(rawBody)
  if (parsed === null) {
    return errJson(400, 'invalid_json', 'Corpo da requisição inválido.')
  }
  if ('code' in parsed) {
    return errJson(400, parsed.code, parsed.message, parsed.field)
  }

  const row = await registerBackup(c.env.DB, parsed)
  return okJson({ backup: backupToWire(row) }, 201, [
    { type: 'success', message: 'Backup registrado.' },
  ])
})

export default adminRoutes
