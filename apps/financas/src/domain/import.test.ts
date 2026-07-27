import type { LinhaImportada } from '@piluvitu/tools/import'
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { ImportError, importTransactions } from './import'
import { commitments } from './reports'

async function seedAccount(
  id: string,
  kind: 'credit_card' | 'checking' = 'checking',
  closingDay: number | null = null,
  dueDay: number | null = null,
) {
  await env.DB.prepare(
    `INSERT INTO accounts (id, name, scope, kind, institution, currency, closing_day, due_day,
       credit_limit_cents, opening_balance_cents, opening_date, archived_at, created_at, updated_at)
     VALUES (?, ?, 'PF', ?, 'Nubank', 'BRL', ?, ?, NULL, 0, NULL, NULL,
       '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')`,
  )
    .bind(id, `conta ${id}`, kind, closingDay, dueDay)
    .run()
  return id
}

function linha(overrides: Partial<LinhaImportada> = {}): LinhaImportada {
  return {
    imported_id: 'fitid-1',
    purchase_date: '2026-07-10',
    amount_cents: -1500,
    description: 'Padaria X',
    ...overrides,
  }
}

async function countTransactions(accountId?: string): Promise<number> {
  const row = accountId
    ? await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?',
      )
        .bind(accountId)
        .first<{ n: number }>()
    : await env.DB.prepare('SELECT COUNT(*) AS n FROM transactions').first<{
        n: number
      }>()
  return row?.n ?? 0
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM transactions'),
    env.DB.prepare('DELETE FROM accounts'),
  ])
})

describe('importTransactions', () => {
  it('importa N linhas e a tabela transactions cresce N', async () => {
    const accountId = await seedAccount('acc-1')
    const rows = [
      linha({ imported_id: 'fitid-1' }),
      linha({ imported_id: 'fitid-2' }),
      linha({ imported_id: 'fitid-3' }),
    ]

    const before = await countTransactions(accountId)
    const result = await importTransactions(env.DB, {
      account_id: accountId,
      import_source: 'ofx',
      rows,
    })
    const after = await countTransactions(accountId)

    expect(after - before).toBe(3)
    expect(result).toEqual({ total: 3, imported: 3, skipped: 0 })
  })

  it('reimportar as MESMAS linhas não cria nenhuma linha nova (contado no D1)', async () => {
    const accountId = await seedAccount('acc-1')
    const rows = [
      linha({ imported_id: 'fitid-1' }),
      linha({ imported_id: 'fitid-2' }),
    ]

    await importTransactions(env.DB, {
      account_id: accountId,
      import_source: 'ofx',
      rows,
    })
    const afterFirst = await countTransactions(accountId)
    expect(afterFirst).toBe(2)

    const result = await importTransactions(env.DB, {
      account_id: accountId,
      import_source: 'ofx',
      rows,
    })
    const afterSecond = await countTransactions(accountId)

    // A contagem no D1, não a resposta, é a prova real de idempotência.
    expect(afterSecond).toBe(afterFirst)
    expect(result).toEqual({ total: 2, imported: 0, skipped: 2 })
  })

  it('o mesmo imported_id em OUTRA conta é aceito (o índice é por conta)', async () => {
    const accountA = await seedAccount('acc-a')
    const accountB = await seedAccount('acc-b')
    const row = linha({ imported_id: 'fitid-compartilhado' })

    await importTransactions(env.DB, {
      account_id: accountA,
      import_source: 'ofx',
      rows: [row],
    })
    const result = await importTransactions(env.DB, {
      account_id: accountB,
      import_source: 'ofx',
      rows: [row],
    })

    expect(result).toEqual({ total: 1, imported: 1, skipped: 0 })
    expect(await countTransactions(accountA)).toBe(1)
    expect(await countTransactions(accountB)).toBe(1)
  })

  it('lote acima de 5 linhas gera múltiplos statements (espiando db.batch)', async () => {
    const accountId = await seedAccount('acc-1')
    // 12 linhas => ceil(12/5) = 3 statements no INSERT de transactions.
    const rows = Array.from({ length: 12 }, (_, i) =>
      linha({ imported_id: `fitid-${i}`, purchase_date: '2026-07-10' }),
    )

    const batchSizes: number[] = []
    const spyDb = new Proxy(env.DB, {
      get(target, prop, receiver) {
        if (prop === 'batch') {
          return (statements: D1PreparedStatement[]) => {
            batchSizes.push(statements.length)
            return target.batch(statements)
          }
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as D1Database

    const result = await importTransactions(spyDb, {
      account_id: accountId,
      import_source: 'csv',
      rows,
    })

    expect(result.imported).toBe(12)
    // 12 linhas / 5 por statement = 3 statements num único batch().
    expect(batchSizes).toEqual([3])
    expect(await countTransactions(accountId)).toBe(12)
  })

  it('account_id inexistente lança ImportError invalid_account', async () => {
    await expect(
      importTransactions(env.DB, {
        account_id: 'conta-que-nao-existe',
        import_source: 'ofx',
        rows: [linha()],
      }),
    ).rejects.toMatchObject({
      name: 'ImportError',
      code: 'invalid_account',
    })
    expect(await countTransactions()).toBe(0)
  })

  it('linha com valor zero é recusada pelo CHECK do schema (erro de constraint, nenhuma linha gravada)', async () => {
    const accountId = await seedAccount('acc-1')

    await expect(
      importTransactions(env.DB, {
        account_id: accountId,
        import_source: 'ofx',
        rows: [linha({ imported_id: 'fitid-zero', amount_cents: 0 })],
      }),
    ).rejects.toThrow(/CONSTRAINT|constraint/i)
    expect(await countTransactions(accountId)).toBe(0)
  })

  it('import_source fora do enum lança ImportError invalid_import_source', async () => {
    const accountId = await seedAccount('acc-1')

    await expect(
      importTransactions(env.DB, {
        account_id: accountId,
        import_source: 'excel',
        rows: [linha()],
      }),
    ).rejects.toMatchObject({
      name: 'ImportError',
      code: 'invalid_import_source',
    })
    expect(await countTransactions(accountId)).toBe(0)
  })

  it('lança ImportError quando um dos ImportError customizados carrega .code (usado pela rota p/ 422)', async () => {
    expect(new ImportError('x', 'y')).toBeInstanceOf(Error)
  })

  describe('bill_competence', () => {
    it('conta credit_card: toda linha ganha bill_competence, e compra após o fechamento cai no mês SEGUINTE', async () => {
      // Mesmo caso canônico já usado em domain/installments.test.ts: cartão
      // fecha dia 25, compra em 28/07 (depois do fechamento) cai em '2026-08'.
      const accountId = await seedAccount('acc-cc', 'credit_card', 25, 5)
      const rows = [
        linha({ imported_id: 'fitid-depois', purchase_date: '2026-07-28' }),
        linha({ imported_id: 'fitid-antes', purchase_date: '2026-07-10' }),
      ]

      const result = await importTransactions(env.DB, {
        account_id: accountId,
        import_source: 'ofx',
        rows,
      })
      expect(result).toEqual({ total: 2, imported: 2, skipped: 0 })

      const gravadas = await env.DB.prepare(
        'SELECT imported_id, bill_competence FROM transactions WHERE account_id = ? ORDER BY imported_id',
      )
        .bind(accountId)
        .all<{ imported_id: string; bill_competence: string | null }>()

      const porId = new Map(
        gravadas.results.map((r) => [r.imported_id, r.bill_competence]),
      )
      // Nenhuma linha ficou sem competência (é o que faz o extrato de cartão
      // entrar em commitments() — ver teste de integração abaixo).
      expect(porId.get('fitid-depois')).toBe('2026-08')
      expect(porId.get('fitid-antes')).toBe('2026-07')
    })

    it('conta checking: bill_competence permanece NULL', async () => {
      const accountId = await seedAccount('acc-ck', 'checking')
      const rows = [
        linha({ imported_id: 'fitid-1', purchase_date: '2026-07-28' }),
      ]

      await importTransactions(env.DB, {
        account_id: accountId,
        import_source: 'ofx',
        rows,
      })

      const row = await env.DB.prepare(
        'SELECT bill_competence FROM transactions WHERE account_id = ? AND imported_id = ?',
      )
        .bind(accountId, 'fitid-1')
        .first<{ bill_competence: string | null }>()
      expect(row?.bill_competence).toBeNull()
    })
  })

  describe('integração com commitments()', () => {
    it('linhas importadas num cartão aparecem em commitments() na competência derivada', async () => {
      const accountId = await seedAccount('acc-cc-commit', 'credit_card', 25, 5)
      const rows = [
        // Ambas depois do fechamento (dia 25) => competência '2026-08'.
        linha({
          imported_id: 'fitid-a',
          purchase_date: '2026-07-28',
          amount_cents: -100000, // R$ 1.000,00
        }),
        linha({
          imported_id: 'fitid-b',
          purchase_date: '2026-07-29',
          amount_cents: -50000, // R$ 500,00
        }),
      ]

      const result = await importTransactions(env.DB, {
        account_id: accountId,
        import_source: 'ofx',
        rows,
      })
      // As linhas importadas nascem com settled_at NULL (fatura ainda em
      // aberto) — é exatamente o que commitments() soma como "previsto".
      expect(result).toEqual({ total: 2, imported: 2, skipped: 0 })
      const settled = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? AND settled_at IS NOT NULL',
      )
        .bind(accountId)
        .first<{ n: number }>()
      expect(settled?.n).toBe(0)

      const report = await commitments(env.DB, {
        from: '2026-08',
        months: 1,
        fixed_net_cents: 360000,
      })

      const linhaConta = report.rows.find((r) => r.account_id === accountId)
      expect(linhaConta).toBeDefined()
      // -SUM(amount_cents) das duas linhas: 100000 + 50000 = 150000.
      expect(linhaConta?.cells).toEqual([150000])
    })
  })
})
