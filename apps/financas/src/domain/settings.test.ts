import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_FIXED_NET_CENTS } from './reports'
import {
  getFixedNetCents,
  MAX_FIXED_NET_CENTS,
  setFixedNetCents,
} from './settings'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

describe('getFixedNetCents', () => {
  it('devolve o default (R$ 3.600, líquido SEM freela) quando nada foi salvo', async () => {
    expect(await getFixedNetCents(env.DB)).toBe(DEFAULT_FIXED_NET_CENTS)
    expect(DEFAULT_FIXED_NET_CENTS).toBe(360000)
  })

  it('devolve o valor salvo por setFixedNetCents', async () => {
    await setFixedNetCents(env.DB, 548000)
    expect(await getFixedNetCents(env.DB)).toBe(548000)
  })

  it('grava como TEXT (centavos em string), nunca número cru', async () => {
    await setFixedNetCents(env.DB, 420000)
    const row = await env.DB.prepare(
      `SELECT value, typeof(value) AS t FROM settings WHERE key = 'fixed_net_cents'`,
    ).first<{ value: string; t: string }>()
    expect(row?.t).toBe('text')
    expect(row?.value).toBe('420000')
  })
})

describe('setFixedNetCents — validação (zero, negativo, não inteiro, absurdo)', () => {
  it.each([
    ['zero', 0],
    ['negativo', -100000],
    ['não inteiro (fração de centavo)', 360000.5],
  ])('rejeita %s com RangeError', async (_label, value) => {
    await expect(setFixedNetCents(env.DB, value)).rejects.toThrow(RangeError)
  })

  it('rejeita valor absurdamente grande, acima do teto de sanidade', async () => {
    await expect(
      setFixedNetCents(env.DB, MAX_FIXED_NET_CENTS + 1),
    ).rejects.toThrow(RangeError)
  })

  it('aceita exatamente o teto de sanidade (sem falso positivo na borda)', async () => {
    expect(await setFixedNetCents(env.DB, MAX_FIXED_NET_CENTS)).toBe(
      MAX_FIXED_NET_CENTS,
    )
  })

  it('salvar de novo SUBSTITUI o valor anterior (upsert) — não duplica linha', async () => {
    await setFixedNetCents(env.DB, 100000)
    await setFixedNetCents(env.DB, 200000)
    const { results } = await env.DB.prepare(
      `SELECT * FROM settings WHERE key = 'fixed_net_cents'`,
    ).all()
    expect(results.length).toBe(1)
    expect(await getFixedNetCents(env.DB)).toBe(200000)
  })

  it('valor inválido não fica salvo — rejeita ANTES de gravar, não depois', async () => {
    await setFixedNetCents(env.DB, 250000)
    await expect(setFixedNetCents(env.DB, -1)).rejects.toThrow(RangeError)
    expect(await getFixedNetCents(env.DB)).toBe(250000)
  })
})
