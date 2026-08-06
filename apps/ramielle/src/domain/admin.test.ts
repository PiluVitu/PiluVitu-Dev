import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { listBackups, listUsers } from './admin'

const DB = env.DB

// --------------------------------------------------------------------------
// Helpers de fixture — semeiam `users`/`backups` direto via INSERT, com
// `id`/`created_at` EXPLÍCITOS (SQLite aceita atribuir qualquer inteiro a
// uma coluna `INTEGER PRIMARY KEY`, mesmo fora da sequência de
// autoincremento — mesmo padrão de `domain/sessions.test.ts#novaSessaoComId`)
// — necessário pros testes de ORDER BY abaixo.
// --------------------------------------------------------------------------

async function novoUsuarioComId(row: {
  id: number
  googleSub: string
  email?: string
  name?: string
  picture?: string | null
  isAdmin?: boolean
  createdAt: string
}): Promise<void> {
  const {
    id,
    googleSub,
    email = `${googleSub}@example.com`,
    name = `User ${googleSub}`,
    picture = null,
    isAdmin = false,
    createdAt,
  } = row
  await DB.prepare(
    `INSERT INTO users (id, google_sub, email, name, picture, is_admin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, googleSub, email, name, picture, isAdmin ? 1 : 0, createdAt)
    .run()
}

async function novoBackupComId(row: {
  id: number
  driveFileId?: string
  driveFileName?: string
  sizeBytes?: number
  triggerType?: 'cron' | 'manual' | 'session_close'
  createdAt: string
}): Promise<void> {
  const {
    id,
    driveFileId = `drive-${id}`,
    driveFileName = `backup-${id}.sqlite`,
    sizeBytes = 1000 + id,
    triggerType = 'cron',
    createdAt,
  } = row
  await DB.prepare(
    `INSERT INTO backups (id, drive_file_id, drive_file_name, size_bytes, trigger_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, driveFileId, driveFileName, sizeBytes, triggerType, createdAt)
    .run()
}

describe('listUsers', () => {
  it('devolve array vazio quando não há usuário nenhum', async () => {
    expect(await listUsers(DB)).toEqual([])
  })

  it('NUNCA inclui google_sub — o Go monta um shape controlado à mão (handlers/admin/users.go)', async () => {
    // ⚠️ `name` explícito, propositalmente DIFERENTE do marcador de
    // google_sub — o default de `novoUsuarioComId` (`User ${googleSub}`)
    // embutiria o marcador dentro de `name` também, e a asserção negativa
    // abaixo checa o JSON inteiro (não só a chave `google_sub`); sem isto o
    // teste "passaria" mesmo com google_sub vazando, só que mascarado por
    // `name` vazando o mesmo valor.
    await novoUsuarioComId({
      id: 1,
      googleSub: 'sub-secreto-nao-deveria-vazar',
      email: 'a@example.com',
      name: 'Fulano',
      createdAt: '2026-05-19 12:00:00',
    })

    const users = await listUsers(DB)
    expect(users).toHaveLength(1)
    expect(Object.keys(users[0]!)).toEqual([
      'id',
      'name',
      'email',
      'picture',
      'is_admin',
      'created_at',
    ])

    // Asserção NEGATIVA sobre o JSON serializado — a chave e o VALOR de
    // google_sub têm que sumir por completo, não só ficar de fora do shape
    // declarado (Object.keys acima já prova o shape; isto prova que o valor
    // não vaza por nenhum outro campo).
    const serializado = JSON.stringify(users)
    expect(serializado).not.toContain('google_sub')
    expect(serializado).not.toContain('sub-secreto-nao-deveria-vazar')
  })

  // ⚠️ C1 (fix round 1 da revisão): esta era a lacuna. `created_at` saía
  // CRU do D1 ("2026-05-19 12:00:00", sem T/Z) — o Go serializa `time.Time`
  // via `json.NewEncoder` (`internal/httpx/respond.go:57`), que produz
  // RFC3339 ("2026-05-19T12:00:00Z"). `new Date('2026-05-19 12:00:00')` é
  // aceito no V8 e REJEITADO no Safari (Invalid Date) — mesma classe de bug
  // já medida 3× neste projeto (`apps/ramielle/CLAUDE.md`).
  it('created_at é RFC3339 (toIsoUtc) — nunca o formato cru do D1, paridade com json.Marshal(time.Time) do Go', async () => {
    await novoUsuarioComId({
      id: 1,
      googleSub: 'sub-data',
      createdAt: '2026-05-19 12:00:00',
    })
    const [user] = await listUsers(DB)
    expect(user?.created_at).toBe('2026-05-19T12:00:00Z')
  })

  it('is_admin sai como boolean — não o INTEGER 0|1 do banco', async () => {
    await novoUsuarioComId({
      id: 1,
      googleSub: 'sub-admin',
      isAdmin: true,
      createdAt: '2026-05-19 12:00:00',
    })
    await novoUsuarioComId({
      id: 2,
      googleSub: 'sub-nao-admin',
      isAdmin: false,
      createdAt: '2026-05-19 12:00:01',
    })

    const users = await listUsers(DB)
    expect(users.find((u) => u.id === 1)?.is_admin).toBe(true)
    expect(users.find((u) => u.id === 2)?.is_admin).toBe(false)
  })

  // ⚠️ Fix round 1 da revisão: `picture` nulo tinha ficado `null` aqui, mas
  // o Go declara `votacao.User.Picture` como `string` (nunca ponteiro) —
  // `sql.NullString.String` vira `""` quando a coluna é `NULL`. MESMO campo
  // que `GET /auth/me` já normaliza (`routes/auth.ts`, `picture: user.
  // picture ?? ''`) — não são campos independentes, os dois vêm do mesmo
  // `User.Picture` do Go.
  it('picture nulo vira string vazia — MESMA normalização de GET /auth/me, nunca null', async () => {
    await novoUsuarioComId({
      id: 1,
      googleSub: 'sub-sem-foto',
      picture: null,
      createdAt: '2026-05-19 12:00:00',
    })
    const [user] = await listUsers(DB)
    expect(user?.picture).toBe('')
  })

  it('ORDER BY created_at DESC — caso normal (id e created_at crescem juntos)', async () => {
    await novoUsuarioComId({
      id: 1,
      googleSub: 'sub-1',
      createdAt: '2026-05-19 12:00:00',
    })
    await novoUsuarioComId({
      id: 2,
      googleSub: 'sub-2',
      createdAt: '2026-05-19 12:00:01',
    })
    await novoUsuarioComId({
      id: 3,
      googleSub: 'sub-3',
      createdAt: '2026-05-19 12:00:02',
    })

    const users = await listUsers(DB)
    expect(users.map((u) => u.id)).toEqual([3, 2, 1])
  })

  // ⚠️ Lição medida na T3 desta fatia: valores INDISTINGUÍVEIS não provam
  // ordem. created_at IGUAL nos dois — só o desempate `id DESC` decide.
  it('ORDER BY created_at DESC, id DESC — o desempate por id só é exercido com created_at IGUAL', async () => {
    await novoUsuarioComId({
      id: 1,
      googleSub: 'sub-1',
      createdAt: '2026-05-19 12:00:00',
    })
    await novoUsuarioComId({
      id: 2,
      googleSub: 'sub-2',
      createdAt: '2026-05-19 12:00:00',
    })

    const users = await listUsers(DB)
    expect(users.map((u) => u.id)).toEqual([2, 1])
  })
})

describe('listBackups', () => {
  it('devolve array vazio quando não há backup nenhum', async () => {
    expect(await listBackups(DB, 50)).toEqual([])
  })

  it('devolve a ROW crua do D1 (snake_case) — a conversão pra PascalCase é responsabilidade da rota (backupToWire)', async () => {
    await novoBackupComId({
      id: 1,
      driveFileId: 'drive-abc',
      driveFileName: 'backup-1.sqlite',
      sizeBytes: 999,
      triggerType: 'manual',
      createdAt: '2026-05-19 12:00:00',
    })

    const [backup] = await listBackups(DB, 50)
    expect(backup).toEqual({
      id: 1,
      drive_file_id: 'drive-abc',
      drive_file_name: 'backup-1.sqlite',
      size_bytes: 999,
      trigger_type: 'manual',
      created_at: '2026-05-19 12:00:00',
    })
  })

  it('ORDER BY created_at DESC — caso normal (id e created_at crescem juntos)', async () => {
    await novoBackupComId({ id: 1, createdAt: '2026-05-19 12:00:00' })
    await novoBackupComId({ id: 2, createdAt: '2026-05-19 12:00:01' })
    await novoBackupComId({ id: 3, createdAt: '2026-05-19 12:00:02' })

    const backups = await listBackups(DB, 50)
    expect(backups.map((b) => b.id)).toEqual([3, 2, 1])
  })

  // ⚠️ Mesma lição da T3: created_at IGUAL nos dois — só id DESC decide.
  it('ORDER BY created_at DESC, id DESC — o desempate por id só é exercido com created_at IGUAL', async () => {
    await novoBackupComId({ id: 1, createdAt: '2026-05-19 12:00:00' })
    await novoBackupComId({ id: 2, createdAt: '2026-05-19 12:00:00' })

    const backups = await listBackups(DB, 50)
    expect(backups.map((b) => b.id)).toEqual([2, 1])
  })

  it('teto: mais de 50 linhas na tabela, devolve só 50 (as mais recentes)', async () => {
    for (let i = 0; i < 55; i++) {
      await novoBackupComId({
        id: i + 1,
        createdAt: `2026-05-19 12:00:${String(i).padStart(2, '0')}`,
      })
    }

    const backups = await listBackups(DB, 50)
    expect(backups).toHaveLength(50)
    // As 50 mais recentes são os ids 55..6 (i=54..5) — os 5 mais antigos
    // (ids 1..5, i=0..4) ficam de fora.
    expect(backups[0]?.id).toBe(55)
    expect(backups[49]?.id).toBe(6)
  })

  // ⚠️ Porta o CLAMP do Go (`backups.go:51`), não só o "sempre 50" — o
  // handler admin sempre passa 50, mas a função em si tem que se comportar
  // como a Go pra qualquer valor. Minor da revisão (fix round 1): a
  // fronteira do clamp (`> 200`) não estava fixada — `200` é o maior valor
  // que NÃO clampa, `201` é o menor que clampa; sem os dois, um off-by-one
  // em `> 200` (ex.: trocado por `>= 200`) passaria batido.
  it('clamp: limit <= 0, ou > 200, cai pro default 50 — a fronteira exata (200 passa, 201 clampa) e um limit VÁLIDO qualquer não são afetados', async () => {
    for (let i = 0; i < 205; i++) {
      await novoBackupComId({
        id: i + 1,
        createdAt: `2026-05-19 ${String(12 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00`,
      })
    }

    expect(await listBackups(DB, 0)).toHaveLength(50)
    expect(await listBackups(DB, -5)).toHaveLength(50)
    expect(await listBackups(DB, 500)).toHaveLength(50)
    expect(await listBackups(DB, 10)).toHaveLength(10)
    // Fronteira exata do clamp: 200 é válido (NÃO clampa — devolve as 200
    // linhas pedidas), 201 já cai no default 50.
    expect(await listBackups(DB, 200)).toHaveLength(200)
    expect(await listBackups(DB, 201)).toHaveLength(50)
  })
})
