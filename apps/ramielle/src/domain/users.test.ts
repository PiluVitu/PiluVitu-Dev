import { env } from 'cloudflare:test'
import { describe, expect, test } from 'vitest'
import { upsertVotacaoUser } from './users'

const DB = env.DB

async function countUsersByGoogleSub(googleSub: string): Promise<number> {
  const row = await DB.prepare(
    `SELECT count(*) AS n FROM users WHERE google_sub = ?`,
  )
    .bind(googleSub)
    .first<{ n: number }>()
  return row?.n ?? 0
}

describe('upsertVotacaoUser — insere quando google_sub é novo', () => {
  test('insere 1 linha e devolve o VotacaoUser com id > 0', async () => {
    const user = await upsertVotacaoUser(DB, {
      googleSub: 'sub-novo-1',
      email: 'novo@example.com',
      name: 'Usuário Novo',
      picture: 'https://exemplo.com/avatar.png',
      isAdmin: false,
    })

    expect(user.id).toBeGreaterThan(0)
    expect(user.googleSub).toBe('sub-novo-1')
    expect(user.email).toBe('novo@example.com')
    expect(user.name).toBe('Usuário Novo')
    expect(user.picture).toBe('https://exemplo.com/avatar.png')
    expect(user.isAdmin).toBe(false)
    expect(typeof user.createdAt).toBe('string')

    expect(await countUsersByGoogleSub('sub-novo-1')).toBe(1)
  })

  test('picture ausente grava NULL, nunca string vazia/undefined', async () => {
    const user = await upsertVotacaoUser(DB, {
      googleSub: 'sub-sem-foto',
      email: 'semfoto@example.com',
      name: 'Sem Foto',
      isAdmin: false,
    })

    expect(user.picture).toBeNull()

    const row = await DB.prepare(`SELECT picture FROM users WHERE id = ?`)
      .bind(user.id)
      .first<{ picture: string | null }>()
    expect(row?.picture).toBeNull()
  })
})

describe('upsertVotacaoUser — idempotência (o teste que decide a Task 4)', () => {
  test('chamar duas vezes com o mesmo google_sub mantém 1 linha e o MESMO id', async () => {
    const primeira = await upsertVotacaoUser(DB, {
      googleSub: 'sub-idempotente',
      email: 'primeiro@example.com',
      name: 'Primeiro Nome',
      picture: 'https://exemplo.com/foto1.png',
      isAdmin: false,
    })

    const segunda = await upsertVotacaoUser(DB, {
      googleSub: 'sub-idempotente',
      email: 'segundo@example.com',
      name: 'Segundo Nome',
      picture: 'https://exemplo.com/foto2.png',
      isAdmin: true,
    })

    // Conta as linhas de verdade — não confia só no retorno da função.
    expect(await countUsersByGoogleSub('sub-idempotente')).toBe(1)
    expect(segunda.id).toBe(primeira.id)
  })

  test('a segunda chamada ATUALIZA email/name/picture/is_admin — nunca faz merge preservando o valor antigo', async () => {
    await upsertVotacaoUser(DB, {
      googleSub: 'sub-atualiza',
      email: 'antigo@example.com',
      name: 'Nome Antigo',
      picture: 'https://exemplo.com/antigo.png',
      isAdmin: false,
    })

    const atualizado = await upsertVotacaoUser(DB, {
      googleSub: 'sub-atualiza',
      email: 'novo-email@example.com',
      name: 'Nome Novo',
      picture: 'https://exemplo.com/novo.png',
      isAdmin: true,
    })

    expect(atualizado.email).toBe('novo-email@example.com')
    expect(atualizado.name).toBe('Nome Novo')
    expect(atualizado.picture).toBe('https://exemplo.com/novo.png')
    expect(atualizado.isAdmin).toBe(true)

    // Confirma direto no D1, não só no objeto devolvido.
    const row = await DB.prepare(
      `SELECT email, name, picture, is_admin FROM users WHERE google_sub = ?`,
    )
      .bind('sub-atualiza')
      .first<{
        email: string
        name: string
        picture: string | null
        is_admin: number
      }>()
    expect(row?.email).toBe('novo-email@example.com')
    expect(row?.name).toBe('Nome Novo')
    expect(row?.picture).toBe('https://exemplo.com/novo.png')
    expect(row?.is_admin).toBe(1)
  })

  test('created_at não muda entre a inserção e a atualização', async () => {
    const primeira = await upsertVotacaoUser(DB, {
      googleSub: 'sub-created-at',
      email: 'a@example.com',
      name: 'A',
      isAdmin: false,
    })

    const segunda = await upsertVotacaoUser(DB, {
      googleSub: 'sub-created-at',
      email: 'b@example.com',
      name: 'B',
      isAdmin: true,
    })

    expect(segunda.createdAt).toBe(primeira.createdAt)
  })

  // ⚠️ O teste que prova o desenho central da Task 4: is_admin é SEMPRE
  // recalculado a partir do que o chamador manda — nunca lido do banco como
  // verdade. upsertVotacaoUser em si não decide isso (quem decide é
  // isAdminEmail em lib/session.ts); aqui só provamos que a função OBEDECE
  // ao valor recebido em toda chamada, inclusive revertendo um is_admin=1
  // anterior para 0 quando o chamador manda isAdmin:false.
  test('is_admin obedece ao valor recebido a cada chamada, inclusive revertendo true -> false', async () => {
    await upsertVotacaoUser(DB, {
      googleSub: 'sub-admin-flip',
      email: 'flip@example.com',
      name: 'Flip',
      isAdmin: true,
    })

    const revertido = await upsertVotacaoUser(DB, {
      googleSub: 'sub-admin-flip',
      email: 'flip@example.com',
      name: 'Flip',
      isAdmin: false,
    })

    expect(revertido.isAdmin).toBe(false)
    expect(await countUsersByGoogleSub('sub-admin-flip')).toBe(1)
  })
})

describe('upsertVotacaoUser — dois google_sub diferentes nunca colidem', () => {
  test('dois usuários distintos geram duas linhas com ids diferentes', async () => {
    const a = await upsertVotacaoUser(DB, {
      googleSub: 'sub-distinto-a',
      email: 'a@example.com',
      name: 'A',
      isAdmin: false,
    })
    const b = await upsertVotacaoUser(DB, {
      googleSub: 'sub-distinto-b',
      email: 'b@example.com',
      name: 'B',
      isAdmin: false,
    })

    expect(a.id).not.toBe(b.id)
    expect(await countUsersByGoogleSub('sub-distinto-a')).toBe(1)
    expect(await countUsersByGoogleSub('sub-distinto-b')).toBe(1)
  })
})
