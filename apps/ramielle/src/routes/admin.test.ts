/**
 * Testes de `GET /admin/users`, `GET /admin/backups`, `POST /admin/backup`
 * contra o app REAL (`../index`) — fatia ③, Task 5 (as duas rotas de
 * leitura, porte de `apps/api/internal/handlers/admin/{users,backup}.go`)
 * + o fix de UX do botão de backup (`POST /admin/backup` deixou de
 * DISPARAR e passou a REGISTRAR — ver `routes/admin.ts` e
 * `docs/superpowers/ROADMAP.md` § 1). Mesmo padrão de
 * `routes/votacao.test.ts`: cookie de sessão genuíno via uma segunda
 * instância `betterAuth()` (emailAndPassword, técnica de teste — produção é
 * só Google), D1 semeado direto via INSERT.
 */
import { env } from 'cloudflare:test'
import { betterAuth } from 'better-auth'
import { describe, expect, test } from 'vitest'
import type { AdminUser } from '../domain/admin'
import app, { type Bindings } from '../index'
import type { Envelope } from '../lib/envelope'
import type { WireBackup } from '../lib/wire'

const DB = env.DB
const BASE_URL_TESTE = 'http://localhost:8787'
const SECRET_TESTE = 'a'.repeat(32)

function testEnv(adminEmails = ''): Bindings {
  return {
    DB,
    BETTER_AUTH_URL: BASE_URL_TESTE,
    BETTER_AUTH_SECRET: SECRET_TESTE,
    GOOGLE_CLIENT_ID: 'client-id-de-teste',
    GOOGLE_CLIENT_SECRET: 'client-secret-de-teste',
    ADMIN_EMAILS: adminEmails,
  }
}

async function cookieDeSessaoValido(
  email: string,
  name: string,
): Promise<string> {
  const authDeTeste = betterAuth({
    database: DB,
    baseURL: BASE_URL_TESTE,
    secret: SECRET_TESTE,
    emailAndPassword: { enabled: true },
  })

  const cadastro = await authDeTeste.api.signUpEmail({
    body: { email, password: 'senha-forte-123', name },
    asResponse: true,
  })
  const cookie = cadastro.headers.getSetCookie()[0]?.split(';')[0]
  if (!cookie) throw new Error('signUpEmail não devolveu cookie de sessão')
  return cookie
}

// --------------------------------------------------------------------------
// Fixtures — semeiam `users`/`backups` direto via INSERT com `id`/
// `created_at` EXPLÍCITOS (necessário pros testes de ORDER BY), mesmo
// padrão de `domain/admin.test.ts`.
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

describe('GET /admin/users', () => {
  test('sem cookie responde 401 not_authenticated', async () => {
    const res = await app.request('/admin/users', {}, testEnv())
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  // Escrito ANTES do caminho feliz, de propósito (mesmo padrão de
  // GET /votacao/sessions/:id/votes na T6 da fatia ②): é este o teste que a
  // mutação obrigatória desta task (trocar requireAdmin por requireAuth
  // numa das três rotas) tem que quebrar.
  test('conta autenticada mas não-admin responde 403 admin_only', async () => {
    const cookie = await cookieDeSessaoValido(
      'users-naoadmin@example.com',
      'Não Admin',
    )
    const res = await app.request(
      '/admin/users',
      { headers: { cookie } },
      testEnv(), // ADMIN_EMAILS vazio — ninguém é admin
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
  })

  test('happy path — 200, snake_case exato, is_admin boolean, picture "" (nunca null), created_at RFC3339, google_sub NUNCA sai', async () => {
    await novoUsuarioComId({
      id: 1,
      googleSub: 'sub-secreto-nao-deveria-vazar',
      email: 'a@example.com',
      name: 'Fulano',
      isAdmin: true,
      picture: null,
      createdAt: '2026-05-19 12:00:00',
    })

    const cookie = await cookieDeSessaoValido(
      'users-happy-admin@example.com',
      'Admin',
    )
    const res = await app.request(
      '/admin/users',
      { headers: { cookie } },
      testEnv('users-happy-admin@example.com'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ users: AdminUser[] }>

    // O admin recém-logado (upsertVotacaoUser, disparado pelo próprio
    // requireAdmin) TAMBÉM aparece na lista — filtra só a linha semeada à
    // mão, pra não acoplar este teste à ordem relativa entre os dois.
    const fulano = body.data?.users.find((u) => u.email === 'a@example.com')
    expect(fulano).toEqual({
      id: 1,
      name: 'Fulano',
      email: 'a@example.com',
      // ⚠️ C1/I1 (fix round 1 da revisão): `picture` nulo sai "" (nunca
      // `null` — mesma normalização de GET /auth/me, MESMO `User.Picture`
      // do Go) e `created_at` sai RFC3339 (`toIsoUtc`, paridade com
      // `json.NewEncoder` serializando `time.Time` no Go), NUNCA o formato
      // cru "2026-05-19 12:00:00" do CURRENT_TIMESTAMP do SQLite.
      picture: '',
      is_admin: true,
      created_at: '2026-05-19T12:00:00Z',
    })

    // Asserção NEGATIVA — google_sub nunca sai, nem a chave nem o valor, em
    // lugar nenhum do JSON serializado.
    const serializado = JSON.stringify(body)
    expect(serializado).not.toContain('google_sub')
    expect(serializado).not.toContain('sub-secreto-nao-deveria-vazar')
  })

  test('ORDER BY created_at DESC, id DESC — desempate por id quando created_at é IGUAL', async () => {
    await novoUsuarioComId({
      id: 10,
      googleSub: 'sub-ordem-10',
      createdAt: '2026-05-19 12:00:00',
    })
    await novoUsuarioComId({
      id: 11,
      googleSub: 'sub-ordem-11',
      createdAt: '2026-05-19 12:00:00',
    })

    const cookie = await cookieDeSessaoValido(
      'users-ordem-admin@example.com',
      'Admin',
    )
    const res = await app.request(
      '/admin/users',
      { headers: { cookie } },
      testEnv('users-ordem-admin@example.com'),
    )
    const body = (await res.json()) as Envelope<{ users: AdminUser[] }>
    const idsSemeados = body.data?.users
      .map((u) => u.id)
      .filter((id) => id === 10 || id === 11)
    expect(idsSemeados).toEqual([11, 10])
  })
})

describe('GET /admin/backups', () => {
  test('sem cookie responde 401 not_authenticated', async () => {
    const res = await app.request('/admin/backups', {}, testEnv())
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  test('conta autenticada mas não-admin responde 403 admin_only', async () => {
    const cookie = await cookieDeSessaoValido(
      'backups-naoadmin@example.com',
      'Não Admin',
    )
    const res = await app.request(
      '/admin/backups',
      { headers: { cookie } },
      testEnv(),
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
  })

  // ⚠️ A ARMADILHA desta task: PascalCase EXATO — o OPOSTO de /admin/users
  // (snake_case). Ver o cabeçalho de routes/admin.ts.
  test('happy path — 200, chaves PascalCase LITERAIS (drive_file_name NUNCA aparece)', async () => {
    await novoBackupComId({
      id: 1,
      driveFileId: 'drive-abc',
      driveFileName: 'backup-1.sqlite',
      sizeBytes: 999,
      triggerType: 'manual',
      createdAt: '2026-05-19 12:00:00',
    })

    const cookie = await cookieDeSessaoValido(
      'backups-happy-admin@example.com',
      'Admin',
    )
    const res = await app.request(
      '/admin/backups',
      { headers: { cookie } },
      testEnv('backups-happy-admin@example.com'),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Envelope<{ backups: WireBackup[] }>
    expect(body.data?.backups).toEqual([
      {
        ID: 1,
        DriveFileID: 'drive-abc',
        DriveFileName: 'backup-1.sqlite',
        SizeBytes: 999,
        TriggerType: 'manual',
        CreatedAt: '2026-05-19T12:00:00Z',
      },
    ])

    const chaves = Object.keys(body.data!.backups[0]!)
    expect(chaves).toEqual([
      'ID',
      'DriveFileID',
      'DriveFileName',
      'SizeBytes',
      'TriggerType',
      'CreatedAt',
    ])

    // Asserção NEGATIVA — o snake_case do OUTRO endpoint (/admin/users)
    // nunca pode vazar pra cá. Emitir `drive_file_name` em vez de
    // `DriveFileName` quebra `apps/web` (`backups-panel.tsx`) em produção,
    // renderizando `undefined` em toda linha, sem erro nenhum.
    const serializado = JSON.stringify(body)
    expect(serializado).not.toContain('drive_file_name')
    expect(serializado).not.toContain('trigger_type')
  })

  test('teto de 50 — mais de 50 backups na tabela, devolve só 50 (os mais recentes)', async () => {
    for (let i = 0; i < 55; i++) {
      await novoBackupComId({
        id: i + 1,
        createdAt: `2026-05-19 12:00:${String(i).padStart(2, '0')}`,
      })
    }

    const cookie = await cookieDeSessaoValido(
      'backups-teto-admin@example.com',
      'Admin',
    )
    const res = await app.request(
      '/admin/backups',
      { headers: { cookie } },
      testEnv('backups-teto-admin@example.com'),
    )
    const body = (await res.json()) as Envelope<{ backups: WireBackup[] }>
    expect(body.data?.backups).toHaveLength(50)
    expect(body.data?.backups[0]?.ID).toBe(55)
    expect(body.data?.backups[49]?.ID).toBe(6)
  })

  test('ORDER BY created_at DESC, id DESC — desempate por id quando created_at é IGUAL', async () => {
    await novoBackupComId({ id: 20, createdAt: '2026-05-19 12:00:00' })
    await novoBackupComId({ id: 21, createdAt: '2026-05-19 12:00:00' })

    const cookie = await cookieDeSessaoValido(
      'backups-ordem-admin@example.com',
      'Admin',
    )
    const res = await app.request(
      '/admin/backups',
      { headers: { cookie } },
      testEnv('backups-ordem-admin@example.com'),
    )
    const body = (await res.json()) as Envelope<{ backups: WireBackup[] }>
    expect(body.data?.backups.map((b) => b.ID)).toEqual([21, 20])
  })
})

describe('POST /admin/backup', () => {
  function corpoValido(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      file_name: 'ramielle-20260814T030000Z.sql.gz',
      size_bytes: 12345,
      trigger_type: 'manual',
      ...overrides,
    }
  }

  test('sem cookie responde 401 not_authenticated', async () => {
    const res = await app.request(
      '/admin/backup',
      { method: 'POST' },
      testEnv(),
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('not_authenticated')
  })

  // Escrito ANTES do caminho feliz, de propósito (mesmo padrão de
  // GET /votacao/sessions/:id/votes na T6 da fatia ②, e das outras duas
  // rotas deste arquivo): é este o teste que a mutação obrigatória do fix
  // de UX (trocar requireAdmin por requireAuth nesta rota) tem que quebrar.
  // A votação deste Worker é LIVRE — sem o guard certo, qualquer conta
  // Google conseguiria escrever linhas falsas em `backups`.
  test('conta autenticada mas não-admin responde 403 admin_only', async () => {
    const cookie = await cookieDeSessaoValido(
      'backup-naoadmin@example.com',
      'Não Admin',
    )
    const res = await app.request(
      '/admin/backup',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(corpoValido()),
      },
      testEnv(),
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('admin_only')
  })

  test('corpo não é JSON válido -> 400 invalid_json', async () => {
    const cookie = await cookieDeSessaoValido(
      'backup-invalidjson-admin@example.com',
      'Admin',
    )
    const res = await app.request(
      '/admin/backup',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: '{ nao é json',
      },
      testEnv('backup-invalidjson-admin@example.com'),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]?.code).toBe('invalid_json')
  })

  test('file_name ausente/vazio -> 400 file_name_required', async () => {
    const cookie = await cookieDeSessaoValido(
      'backup-semnome-admin@example.com',
      'Admin',
    )
    const res = await app.request(
      '/admin/backup',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(corpoValido({ file_name: '' })),
      },
      testEnv('backup-semnome-admin@example.com'),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]).toMatchObject({
      code: 'file_name_required',
      field: 'file_name',
    })
  })

  test('size_bytes zero/negativo/não-inteiro -> 400 invalid_size_bytes', async () => {
    const cookie = await cookieDeSessaoValido(
      'backup-tamanhoinvalido-admin@example.com',
      'Admin',
    )
    for (const sizeBytes of [0, -5, 1.5]) {
      const res = await app.request(
        '/admin/backup',
        {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify(corpoValido({ size_bytes: sizeBytes })),
        },
        testEnv('backup-tamanhoinvalido-admin@example.com'),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as Envelope<null>
      expect(body.notifications[0]).toMatchObject({
        code: 'invalid_size_bytes',
        field: 'size_bytes',
      })
    }
  })

  test('trigger_type fora do CHECK da migration -> 400 invalid_trigger_type', async () => {
    const cookie = await cookieDeSessaoValido(
      'backup-triggerinvalido-admin@example.com',
      'Admin',
    )
    const res = await app.request(
      '/admin/backup',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(corpoValido({ trigger_type: 'nao-existe' })),
      },
      testEnv('backup-triggerinvalido-admin@example.com'),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as Envelope<null>
    expect(body.notifications[0]).toMatchObject({
      code: 'invalid_trigger_type',
      field: 'trigger_type',
    })
  })

  // ⚠️ O caminho feliz — a troca de sentido da rota (ROADMAP.md § 1, opção
  // b): não dispara nada, REGISTRA um backup feito fora do Worker (o script
  // scripts/backup-d1.sh chama esta rota depois de gravar o .sql.gz). O
  // 503 backup_disabled antigo NÃO existe mais — esta rota nunca mais
  // responde 503.
  test('conta admin, corpo válido — 201, registra e devolve o backup em PascalCase (backupToWire)', async () => {
    const cookie = await cookieDeSessaoValido(
      'backup-happy-admin@example.com',
      'Admin',
    )
    const res = await app.request(
      '/admin/backup',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(corpoValido()),
      },
      testEnv('backup-happy-admin@example.com'),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as Envelope<{ backup: WireBackup }>
    expect(body.notifications[0]).toEqual({
      type: 'success',
      message: 'Backup registrado.',
    })
    expect(body.data?.backup).toMatchObject({
      DriveFileID: 'ramielle-20260814T030000Z.sql.gz',
      DriveFileName: 'ramielle-20260814T030000Z.sql.gz',
      SizeBytes: 12345,
      TriggerType: 'manual',
    })

    // O registro aparece de fato em GET /admin/backups depois — não é só
    // um eco do corpo, é uma linha persistida.
    const listagem = await app.request(
      '/admin/backups',
      { headers: { cookie } },
      testEnv('backup-happy-admin@example.com'),
    )
    const listagemBody = (await listagem.json()) as Envelope<{
      backups: WireBackup[]
    }>
    expect(
      listagemBody.data?.backups.some(
        (b) => b.DriveFileName === 'ramielle-20260814T030000Z.sql.gz',
      ),
    ).toBe(true)
  })
})
