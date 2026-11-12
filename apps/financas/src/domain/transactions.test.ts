import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { addMonthsToCompetence } from '../lib/dates'
import {
  accountBalances,
  archiveAccount,
  createAccount,
  listAccounts,
} from './accounts'
import { cashflow } from './cashflow'
import { archiveCategory, createCategory } from './categories'
import { addDebtItem, createDebt, payDebt } from './debts'
import { createInstallmentPlan } from './installments'
import { createPayee } from './payees'
import { createRecurring } from './recurring'
import { generateRecurringOccurrences } from './recurring-auto'
import { byCategory, commitments, DEFAULT_FIXED_NET_CENTS } from './reports'
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  inspectTransaction,
  listBillPayments,
  listOpenBills,
  listTransactions,
  payBill,
  PayBillError,
  RecurringOccurrencePendingError,
  settleTransaction,
  TransactionHasOwnerError,
  undoBillPayment,
  unsettleTransaction,
  updateTransaction,
} from './transactions'

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

function contaCorrente(name: string, opening_balance_cents = 0) {
  return createAccount(env.DB, {
    name,
    scope: 'PF',
    kind: 'checking',
    opening_balance_cents,
  })
}

function cartao(name: string, closing_day: number) {
  return createAccount(env.DB, {
    name,
    scope: 'PF',
    kind: 'credit_card',
    closing_day,
    due_day: 5,
  })
}

describe('createTransaction', () => {
  it('compra de 28/07 em cartao que fecha dia 25 cai na fatura de agosto', async () => {
    const card = await cartao('Nubank cartao', 25)
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -12990,
      purchase_date: '2026-07-28',
      description: 'Steam',
    })
    expect(tx.bill_competence).toBe('2026-08')
    expect(tx.settled_at).toBeNull()
    expect(tx.transfer_id).toBeNull()
  })

  it('compra de 20/07 no mesmo cartao cai na fatura de julho', async () => {
    const card = await cartao('Nubank cartao antes do fechamento', 25)
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -4500,
      purchase_date: '2026-07-20',
      description: 'iFood',
    })
    expect(tx.bill_competence).toBe('2026-07')
  })

  it('bill_competence informada no input vence a derivacao', async () => {
    const card = await cartao('Inter cartao', 25)
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -5000,
      purchase_date: '2026-07-28',
      description: 'ajuste manual',
      bill_competence: '2026-07',
    })
    expect(tx.bill_competence).toBe('2026-07')
  })

  it('lancamento em conta corrente grava bill_competence NULL', async () => {
    const acc = await contaCorrente('Nubank conta')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -8900,
      purchase_date: '2026-07-28',
      description: 'Padaria',
      settled_at: '2026-07-28',
    })
    expect(tx.bill_competence).toBeNull()
    expect(tx.settled_at).toBe('2026-07-28')
    expect(tx.currency).toBe('BRL')
    expect(tx.is_business).toBe(0)
  })

  it('conta inexistente vira erro com mensagem util', async () => {
    await expect(
      createTransaction(env.DB, {
        account_id: 'nao-existe',
        amount_cents: -100,
        purchase_date: '2026-07-20',
        description: 'x',
      }),
    ).rejects.toThrow('conta nao-existe nao existe')
  })

  it('amount_cents = 0 e barrado pelo CHECK do schema', async () => {
    const acc = await contaCorrente('Conta zero')
    await expect(
      createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: 0,
        purchase_date: '2026-07-20',
        description: 'nada aconteceu',
      }),
    ).rejects.toThrow()

    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions WHERE account_id = ?',
    )
      .bind(acc.id)
      .all()
    expect(results).toHaveLength(0)
  })

  it('moeda estrangeira sem amount_original_cents e barrada pelo CHECK', async () => {
    const acc = await contaCorrente('Conta USD')
    await expect(
      createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -12990,
        currency: 'USD',
        purchase_date: '2026-07-20',
        description: 'AWS',
      }),
    ).rejects.toThrow()

    const ok = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -12990,
      currency: 'USD',
      amount_original_cents: -2399,
      fx_rate_ppm: 5415000,
      purchase_date: '2026-07-20',
      description: 'AWS',
    })
    expect(ok.currency).toBe('USD')
    expect(ok.amount_original_cents).toBe(-2399)
    expect(ok.fx_rate_ppm).toBe(5415000)
  })

  // Task 7 da fatia ⑥ (docs/superpowers/specs/2026-07-27-financas-recorrentes-design.md
  // §3.1): o vinculo que fecha o ciclo — "este lancamento e o Starlink de
  // agosto". Antes desta task, so o schema (migration 0006) e um INSERT cru
  // de teste (domain/recurring.test.ts#seedTxVinculada) sabiam gravar a
  // coluna; createTransaction agora aceita de verdade.
  it('grava recurring_expense_id quando informado, e o devolve na linha criada', async () => {
    const acc = await contaCorrente('Conta vinculada')
    const recorrente = await createRecurring(env.DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })

    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -18900,
      purchase_date: '2026-08-10',
      description: 'Starlink de agosto',
      settled_at: '2026-08-10',
      recurring_expense_id: recorrente.id,
    })
    expect(tx.recurring_expense_id).toBe(recorrente.id)
  })

  it('sem recurring_expense_id, a coluna grava NULL (default)', async () => {
    const acc = await contaCorrente('Conta sem vinculo')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -1000,
      purchase_date: '2026-08-10',
      description: 'Mercado',
      settled_at: '2026-08-10',
    })
    expect(tx.recurring_expense_id).toBeNull()
  })

  it('recurring_expense_id inexistente e barrado pela FK (ON DELETE SET NULL, mas id inexistente e erro na criacao)', async () => {
    // A FK (`REFERENCES recurring_expenses(id) ON DELETE SET NULL`,
    // migration 0006) so governa o que acontece quando a recorrente
    // REFERENCIADA e apagada depois — um id que NUNCA existiu continua
    // rejeitado na hora do INSERT, igual a qualquer outra FK do schema (ver
    // teste equivalente de to_account_id em createTransfer, mais abaixo
    // neste arquivo).
    const acc = await contaCorrente('Conta recorrente fantasma')
    await expect(
      createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -1000,
        purchase_date: '2026-08-10',
        description: 'vinculo invalido',
        recurring_expense_id: 'recorrente-que-nao-existe',
      }),
    ).rejects.toThrow()

    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions WHERE account_id = ?',
    )
      .bind(acc.id)
      .all()
    expect(results).toHaveLength(0)
  })
})

// Item 3 (D7): a recorrente que lança sozinha já criou o pendente desta
// ocorrência. Lançar o mesmo pagamento à mão, vinculado a ela, contaria duas
// vezes; a recusa manda o dono marcar o pendente como pago (ou editar o
// valor) no extrato.
describe('createTransaction — ocorrência com pendente gerado (recorrência automática)', () => {
  async function recorrenteComPendente(
    frequency: 'monthly' | 'weekly' = 'monthly',
  ) {
    const acc = await contaCorrente('Conta da recorrente')
    const recorrente = await createRecurring(
      env.DB,
      {
        description: 'Internet fibra',
        scope: 'PF',
        account_id: acc.id,
        frequency,
        day_of_month: 10,
        amount_min_cents: 9990,
        amount_max_cents: 12990,
        starts_on: '2026-01-10',
        auto_generate: true,
      },
      { today: '2026-08-01' },
    )
    // 10/08/2026 é segunda; a semanal também vence nesse dia.
    if (frequency === 'weekly') {
      await env.DB.prepare(
        "UPDATE recurring_expenses SET starts_on = '2026-08-10' WHERE id = ?",
      )
        .bind(recorrente.id)
        .run()
    }
    await generateRecurringOccurrences(env.DB, { today: '2026-08-10' })
    const pendente = await env.DB.prepare(
      'SELECT id FROM transactions WHERE recurring_expense_id = ?',
    )
      .bind(recorrente.id)
      .first<{ id: string }>()
    if (!pendente) throw new Error('a geração não criou o pendente')
    return { acc, recorrente, pendenteId: pendente.id }
  }

  async function contarDaRecorrente(recurringId: string): Promise<number> {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions WHERE recurring_expense_id = ?',
    )
      .bind(recurringId)
      .first<{ n: number }>()
    return row?.n ?? 0
  }

  it('lançar à mão a mesma ocorrência é recusado com recurring_occurrence_pending, sem gravar', async () => {
    const { acc, recorrente } = await recorrenteComPendente()

    const tentativa = createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -11990,
      purchase_date: '2026-08-25',
      description: 'Internet fibra',
      settled_at: '2026-08-25',
      recurring_expense_id: recorrente.id,
    })

    await expect(tentativa).rejects.toBeInstanceOf(
      RecurringOccurrencePendingError,
    )
    await expect(tentativa).rejects.toMatchObject({
      code: 'recurring_occurrence_pending',
      message: expect.stringMatching(/Marque o pendente como pago/),
    })
    expect(await contarDaRecorrente(recorrente.id)).toBe(1)
  })

  it('outra competência, ou sem vínculo com a recorrente, segue como hoje', async () => {
    const { acc, recorrente } = await recorrenteComPendente()

    const setembro = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -11990,
      purchase_date: '2026-09-10',
      description: 'Internet fibra',
      recurring_expense_id: recorrente.id,
    })
    const semVinculo = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -11990,
      purchase_date: '2026-08-10',
      description: 'Internet fibra',
    })

    expect(setembro.recurring_expense_id).toBe(recorrente.id)
    expect(semVinculo.recurring_expense_id).toBeNull()
  })

  it('pendente apagado, ou já conciliado pela importação, não bloqueia mais', async () => {
    const apagado = await recorrenteComPendente()
    await deleteTransaction(env.DB, apagado.pendenteId)
    const depoisDeApagar = await createTransaction(env.DB, {
      account_id: apagado.acc.id,
      amount_cents: -11990,
      purchase_date: '2026-08-10',
      description: 'Internet fibra',
      recurring_expense_id: apagado.recorrente.id,
    })
    expect(depoisDeApagar.recurring_expense_id).toBe(apagado.recorrente.id)

    const conciliado = await recorrenteComPendente()
    await env.DB.prepare(
      "UPDATE transactions SET imported_id = 'fitid-1', import_source = 'ofx' WHERE id = ?",
    )
      .bind(conciliado.pendenteId)
      .run()
    await expect(
      createTransaction(env.DB, {
        account_id: conciliado.acc.id,
        amount_cents: -11990,
        purchase_date: '2026-08-12',
        description: 'Internet fibra',
        recurring_expense_id: conciliado.recorrente.id,
      }),
    ).resolves.toMatchObject({ recurring_expense_id: conciliado.recorrente.id })
  })

  // Só o pendente que a recorrente criou bloqueia. A ocorrência 'vinculado'
  // aponta para um lançamento que o próprio dono fez; um segundo lançamento
  // vinculado na mesma competência é escolha dele, e a mensagem "já tem um
  // pendente criado pela recorrente" seria falsa.
  it('ocorrência vinculada a um lançamento manual não bloqueia outro lançamento vinculado', async () => {
    const acc = await contaCorrente('Conta da recorrente')
    const recorrente = await createRecurring(
      env.DB,
      {
        description: 'Internet fibra',
        scope: 'PF',
        account_id: acc.id,
        day_of_month: 10,
        amount_min_cents: 9990,
        amount_max_cents: 12990,
        starts_on: '2026-01-10',
        auto_generate: true,
      },
      { today: '2026-08-01' },
    )
    await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -11990,
      purchase_date: '2026-08-05',
      description: 'Internet fibra',
      recurring_expense_id: recorrente.id,
    })
    expect(
      await generateRecurringOccurrences(env.DB, { today: '2026-08-10' }),
    ).toMatchObject({ gerados: 0, vinculados: 1 })

    await expect(
      createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -2000,
        purchase_date: '2026-08-20',
        description: 'Internet fibra',
        recurring_expense_id: recorrente.id,
      }),
    ).resolves.toMatchObject({ recurring_expense_id: recorrente.id })
  })

  it('semanal: a mesma ocorrência é o vencimento ±3 dias', async () => {
    const { acc, recorrente } = await recorrenteComPendente('weekly')
    const lancar = (purchase_date: string) =>
      createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -11990,
        purchase_date,
        description: 'Internet fibra',
        recurring_expense_id: recorrente.id,
      })

    await expect(lancar('2026-08-13')).rejects.toBeInstanceOf(
      RecurringOccurrencePendingError,
    )
    await expect(lancar('2026-08-07')).rejects.toBeInstanceOf(
      RecurringOccurrencePendingError,
    )
    await expect(lancar('2026-08-14')).resolves.toMatchObject({
      purchase_date: '2026-08-14',
    })
  })
})

describe('createTransfer', () => {
  it('gera duas linhas com o mesmo transfer_id e soma zero', async () => {
    const de = await contaCorrente('Origem PIX', 500000)
    const para = await contaCorrente('Destino PIX', 0)

    const { transfer_id, out, inbound } = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })

    expect(out.transfer_id).toBe(transfer_id)
    expect(inbound.transfer_id).toBe(transfer_id)
    expect(out.account_id).toBe(de.id)
    expect(inbound.account_id).toBe(para.id)
    expect(out.amount_cents).toBe(-150000)
    expect(inbound.amount_cents).toBe(150000)
    expect(out.amount_cents + inbound.amount_cents).toBe(0)

    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions WHERE transfer_id = ?',
    )
      .bind(transfer_id)
      .all()
    expect(results).toHaveLength(2)
  })

  it('nao aparece em v_cashflow, enquanto a despesa comum aparece', async () => {
    const de = await contaCorrente('Origem cashflow', 500000)
    const para = await contaCorrente('Destino cashflow', 0)

    const { transfer_id } = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })
    await createTransaction(env.DB, {
      account_id: de.id,
      amount_cents: -3000,
      purchase_date: '2026-07-21',
      description: 'Mercado',
      settled_at: '2026-07-21',
    })

    const naTransferencia = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM v_cashflow WHERE transfer_id = ?',
    )
      .bind(transfer_id)
      .first<{ n: number }>()
    expect(naTransferencia?.n).toBe(0)

    const consolidado = await env.DB.prepare(
      'SELECT SUM(amount_cents) AS total FROM v_cashflow WHERE account_id = ?',
    )
      .bind(de.id)
      .first<{ total: number }>()
    expect(consolidado?.total).toBe(-3000)
  })

  it('move o saldo das duas contas sem mexer no consolidado', async () => {
    const de = await contaCorrente('Origem saldo', 500000)
    const para = await contaCorrente('Destino saldo', 100000)

    const antes = await accountBalances(env.DB)
    const consolidadoAntes = antes.reduce((acc, s) => acc + s.balance_cents, 0)

    await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })

    const depois = await accountBalances(env.DB)
    const porConta = new Map(depois.map((s) => [s.account_id, s.balance_cents]))
    expect(porConta.get(de.id)).toBe(350000)
    expect(porConta.get(para.id)).toBe(250000)
    expect(depois.reduce((acc, s) => acc + s.balance_cents, 0)).toBe(
      consolidadoAntes,
    )
  })

  it('recusa transferencia para a mesma conta e valor nao positivo', async () => {
    const acc = await contaCorrente('Conta unica')
    const outra = await contaCorrente('Conta outra')
    await expect(
      createTransfer(env.DB, {
        from_account_id: acc.id,
        to_account_id: acc.id,
        amount_cents: 1000,
        date: '2026-07-20',
        description: 'loop',
      }),
    ).rejects.toThrow('transferencia exige duas contas diferentes')
    await expect(
      createTransfer(env.DB, {
        from_account_id: acc.id,
        to_account_id: outra.id,
        amount_cents: 0,
        date: '2026-07-20',
        description: 'zero',
      }),
    ).rejects.toThrow('valor da transferencia deve ser positivo')
  })

  it('to_account_id inexistente rejeita o batch inteiro e nao deixa perna orfa', async () => {
    // Este teste ataca o MESMO call site do createTransfer (FK em accounts,
    // nao trigger de outra tabela) — diferente da cobertura de rollback de
    // schema.test.ts, que mede o motor do D1 via debt_payment_allocations.
    // Se um dia db.batch([...]) virar dois .run() sequenciais por engano,
    // este teste (e so este) pega: a perna da conta que existe ficaria
    // gravada sozinha.
    const de = await contaCorrente('Origem perna orfa', 500000)

    await expect(
      createTransfer(env.DB, {
        from_account_id: de.id,
        to_account_id: 'conta-que-nao-existe',
        amount_cents: 1000,
        date: '2026-07-20',
        description: 'destino invalido',
      }),
    ).rejects.toThrow()

    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions WHERE account_id = ?',
    )
      .bind(de.id)
      .all()
    expect(results).toHaveLength(0)
  })
})

// Categoria por SLUG, nunca pelo UUID literal da migration: o slug e a
// identidade estavel que o codigo procura (mesmo criterio de payDebt achando
// 'quitacao-divida'); um UUID copiado no teste quebraria em silencio se o
// seed mudasse.
async function categoriaPorSlug(slug: string): Promise<string> {
  const row = await env.DB.prepare('SELECT id FROM categories WHERE slug = ?')
    .bind(slug)
    .first<{ id: string }>()
  if (!row) throw new Error(`categoria de slug ${slug} nao esta semeada`)
  return row.id
}

describe('createTransfer — categoria', () => {
  it('grava a categoria SO na perna de saida, e a soma ingenua por categoria nao zera', async () => {
    const pj = await contaCorrente('PJ pro-labore', 900000)
    const pf = await contaCorrente('PF pro-labore', 0)
    const proLabore = await categoriaPorSlug('pro-labore')

    const { out, inbound } = await createTransfer(env.DB, {
      from_account_id: pj.id,
      to_account_id: pf.id,
      amount_cents: 430000,
      date: '2026-08-05',
      description: 'Pro-labore agosto',
      category_id: proLabore,
    })

    expect(out.category_id).toBe(proLabore)

    // A consulta que responde "quanto tirei de pro-labore este ano?" — SEM
    // filtro de sinal, que e exatamente o ponto, e por isso ela vem ANTES da
    // asserção de campo: com a categoria nas DUAS pernas ela devolve 0 (as
    // duas se cancelam), e 0 e um numero plausivel ("nao tirei nada"), entao
    // a resposta errada nao pareceria errada. Esta e a asserção que mata a
    // alternativa, e a mensagem de falha dela nomeia a CONSEQUENCIA.
    const soma = await env.DB.prepare(
      'SELECT SUM(amount_cents) AS total FROM transactions WHERE category_id = ?',
    )
      .bind(proLabore)
      .first<{ total: number }>()
    expect(soma?.total).toBe(-430000)

    expect(inbound.category_id).toBeNull()
  })

  it('aceita categoria que NAO e kind=transfer — o nonsense e inerte, a restricao nao seria', async () => {
    // A tela de categorias so cria expense/income; exigir kind='transfer'
    // prenderia o dono nas duas linhas semeadas pra sempre.
    const de = await contaCorrente('Origem kind', 500000)
    const para = await contaCorrente('Destino kind', 0)
    const alimentacao = await createCategory(env.DB, {
      name: 'Alimentacao',
      kind: 'expense',
    })

    const { out } = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 1000,
      date: '2026-08-05',
      description: 'PIX',
      category_id: alimentacao.id,
    })
    expect(out.category_id).toBe(alimentacao.id)
  })

  it('recusa categoria ARQUIVADA e nao grava nenhuma das duas pernas', async () => {
    const de = await contaCorrente('Origem arquivada', 500000)
    const para = await contaCorrente('Destino arquivada', 0)
    const velha = await createCategory(env.DB, {
      name: 'Aporte antigo',
      kind: 'expense',
    })
    expect(await archiveCategory(env.DB, velha.id)).toBe(true)

    await expect(
      createTransfer(env.DB, {
        from_account_id: de.id,
        to_account_id: para.id,
        amount_cents: 1000,
        date: '2026-08-05',
        description: 'PIX com categoria morta',
        category_id: velha.id,
      }),
    ).rejects.toThrow(/arquivada/)

    // A recusa roda ANTES do batch: nem meia transferencia fica no caixa.
    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions',
    ).all()
    expect(results).toHaveLength(0)
  })

  it('categoria inexistente cai na FK, nao no guard de arquivada (mesma porta de createTransaction)', async () => {
    const de = await contaCorrente('Origem categoria fantasma', 500000)
    const para = await contaCorrente('Destino categoria fantasma', 0)

    const erro = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 1000,
      date: '2026-08-05',
      description: 'PIX com categoria fantasma',
      category_id: 'categoria-que-nao-existe',
    }).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(Error)
    // Nao e RangeError: quem barra e a FK, igual em POST /transactions — o
    // MESMO payload errado nao pode responder codigo diferente por rota.
    expect(erro).not.toBeInstanceOf(RangeError)
    expect((erro as Error).message).not.toMatch(/arquivada/)

    const { results } = await env.DB.prepare(
      'SELECT id FROM transactions',
    ).all()
    expect(results).toHaveLength(0)
  })

  it('transferencia CATEGORIZADA continua fora de cashflow(), commitments() e byCategory()', async () => {
    const pj = await contaCorrente('PJ relatorios', 900000)
    const pf = await contaCorrente('PF relatorios', 0)
    const card = await cartao('Cartao relatorios', 25)
    const proLabore = await categoriaPorSlug('pro-labore')
    const alimentacao = await createCategory(env.DB, {
      name: 'Mercado',
      kind: 'expense',
    })

    await createTransfer(env.DB, {
      from_account_id: pj.id,
      to_account_id: pf.id,
      amount_cents: 430000,
      date: '2026-08-05',
      description: 'Pro-labore agosto',
      category_id: proLabore,
    })

    // Controles POSITIVOS: sem eles os tres `expect` de ausencia passariam
    // contra queries que nao veem NADA, e o teste nao provaria nada.
    await createTransaction(env.DB, {
      account_id: pj.id,
      amount_cents: -3000,
      purchase_date: '2026-08-06',
      description: 'Mercado',
      settled_at: '2026-08-06',
      category_id: alimentacao.id,
    })
    await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -20000,
      purchase_date: '2026-08-10',
      description: 'Compra prevista',
    })

    const fluxo = await cashflow(env.DB, { from: '2026-08', months: 1 })
    expect(fluxo.linhas[0].saiu_cents).toBe(3000)
    expect(fluxo.linhas[0].entrou_cents).toBe(0)

    const comp = await commitments(env.DB, {
      from: '2026-08',
      months: 1,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })
    expect(comp.rows).toHaveLength(1)
    expect(comp.rows[0].account_id).toBe(card.id)
    expect(comp.totals[0]).toEqual({ min: 20000, max: 20000 })

    // byCategory nao filtra por settled, entao a compra de cartao tambem
    // entra (no bucket "Sem categoria") — o que NAO entra e a perna de saida
    // da transferencia, que e o ponto. Somar 430000 aqui inflaria o mes em
    // ~14x o gasto real.
    const cats = await byCategory(env.DB, { competence: '2026-08' })
    expect(cats.rows.map((r) => r.category_id)).not.toContain(proLabore)
    expect(
      cats.rows.find((r) => r.category_id === alimentacao.id)?.total_cents,
    ).toBe(-3000)
    expect(cats.total_cents).toBe(-23000)
  })

  it('accountBalances muda CADA conta e nao muda o consolidado — a categoria nao altera isso', async () => {
    const pj = await contaCorrente('PJ saldo categorizado', 900000)
    const pf = await contaCorrente('PF saldo categorizado', 100000)
    const proLabore = await categoriaPorSlug('pro-labore')

    const antes = await accountBalances(env.DB)
    const consolidadoAntes = antes.reduce((acc, s) => acc + s.balance_cents, 0)

    await createTransfer(env.DB, {
      from_account_id: pj.id,
      to_account_id: pf.id,
      amount_cents: 430000,
      date: '2026-08-05',
      description: 'Pro-labore agosto',
      category_id: proLabore,
    })

    const depois = await accountBalances(env.DB)
    const porConta = new Map(depois.map((s) => [s.account_id, s.balance_cents]))
    expect(porConta.get(pj.id)).toBe(470000)
    expect(porConta.get(pf.id)).toBe(530000)
    expect(depois.reduce((acc, s) => acc + s.balance_cents, 0)).toBe(
      consolidadoAntes,
    )
  })
})

describe('listTransactions', () => {
  it('filtra por conta e por periodo, mais recente primeiro', async () => {
    const acc = await contaCorrente('Extrato')
    const ruido = await contaCorrente('Fora do filtro')

    for (const [date, description] of [
      ['2026-06-30', 'junho'],
      ['2026-07-05', 'julho A'],
      ['2026-07-25', 'julho B'],
    ]) {
      await createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -1000,
        purchase_date: date,
        description,
        settled_at: date,
      })
    }
    await createTransaction(env.DB, {
      account_id: ruido.id,
      amount_cents: -9999,
      purchase_date: '2026-07-10',
      description: 'ruido',
      settled_at: '2026-07-10',
    })

    const rows = await listTransactions(env.DB, {
      account_id: acc.id,
      from: '2026-07-01',
      to: '2026-07-31',
    })
    expect(rows.map((r) => r.description)).toEqual(['julho B', 'julho A'])
  })

  it('respeita o limit', async () => {
    const acc = await contaCorrente('Extrato limitado')
    for (const day of ['01', '02', '03']) {
      await createTransaction(env.DB, {
        account_id: acc.id,
        amount_cents: -100,
        purchase_date: `2026-07-${day}`,
        description: `dia ${day}`,
        settled_at: `2026-07-${day}`,
      })
    }
    const rows = await listTransactions(env.DB, {
      account_id: acc.id,
      limit: 2,
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].description).toBe('dia 03')
  })
})

// =====================================================================
// Editar / apagar / liquidar — uma classe do mapa de FK por vez.
// =====================================================================

/** Linha livre: ninguem aponta pra ela. */
async function lancamentoLivre(nomeConta = 'Conta livre') {
  const acc = await contaCorrente(nomeConta)
  const tx = await createTransaction(env.DB, {
    account_id: acc.id,
    amount_cents: -5000,
    purchase_date: '2026-07-10',
    description: 'Padaria',
  })
  return { acc, tx }
}

/** Parcela: installments.transaction_id NOT NULL + CASCADE (o caso mudo). */
async function parcela() {
  const card = await cartao('Cartao parcelado', 25)
  const { plan, installments } = await createInstallmentPlan(env.DB, {
    account_id: card.id,
    description: 'Notebook',
    total_cents: 100000,
    installments_count: 10,
    purchase_date: '2026-07-10',
  })
  return { card, plan, installments, tx_id: installments[2].transaction_id }
}

/** Pagamento de divida: debt_payments.transaction_id RESTRICT, elo 1:1. */
async function pagamentoDeDivida() {
  const acc = await contaCorrente('Conta pagamento')
  const payee = await createPayee(env.DB, { name: 'Pai', kind: 'person' })
  const debt = await createDebt(env.DB, {
    payee_id: payee.id,
    direction: 'i_owe',
    title: 'Pai',
    opened_at: '2026-07-01',
  })
  const item = await addDebtItem(env.DB, {
    debt_id: debt.id,
    description: 'MacBook Air',
    amount_cents: 450000,
    incurred_on: '2026-07-01',
  })
  const { payment, transaction } = await payDebt(env.DB, {
    debt_id: debt.id,
    paid_on: '2026-07-20',
    amount_cents: 100000,
    allocations: [{ item_id: item.id, amount_cents: 100000 }],
    kind: 'cash',
    account_id: acc.id,
  })
  return { acc, debt, item, payment, tx_id: transaction!.id }
}

/** Compra que virou item de divida: debt_items.transaction_id SET NULL. */
async function compraDeItemDeDivida() {
  const { acc, tx } = await lancamentoLivre('Conta compra de item')
  const payee = await createPayee(env.DB, { name: 'Tio', kind: 'person' })
  const debt = await createDebt(env.DB, {
    payee_id: payee.id,
    direction: 'owed_to_me',
    title: 'Tio',
    opened_at: '2026-07-01',
  })
  const item = await addDebtItem(env.DB, {
    debt_id: debt.id,
    description: 'Steam Deck',
    amount_cents: 280000,
    incurred_on: '2026-07-10',
    transaction_id: tx.id,
  })
  return { acc, debt, item, tx }
}

/**
 * Rateio nao tem escritor em producao ainda (0 ocorrencias de parent_id
 * escrito em src/) — o vinculo e feito por UPDATE cru aqui, contra a FK
 * REAL do schema (transactions.parent_id CASCADE), que e o que importa:
 * o guard defensivo tem que valer antes de existir escritor, senao o
 * primeiro rateio de verdade ja nasce podendo apagar as partes em silencio.
 */
async function rateio() {
  const { acc, tx: pai } = await lancamentoLivre('Conta rateio')
  const filha = await createTransaction(env.DB, {
    account_id: acc.id,
    amount_cents: -2000,
    purchase_date: '2026-07-10',
    description: 'parte pet',
  })
  await env.DB.prepare('UPDATE transactions SET parent_id = ? WHERE id = ?')
    .bind(pai.id, filha.id)
    .run()
  return { acc, pai, filha }
}

function contarTx(id: string) {
  return env.DB.prepare('SELECT COUNT(*) AS n FROM transactions WHERE id = ?')
    .bind(id)
    .first<{ n: number }>()
    .then((r) => r?.n ?? 0)
}

describe('inspectTransaction', () => {
  it('classifica cada dono do mapa de FK', async () => {
    const { tx } = await lancamentoLivre()
    expect((await inspectTransaction(env.DB, tx.id))?.class).toBe('free')

    const p = await parcela()
    expect((await inspectTransaction(env.DB, p.tx_id))?.class).toBe(
      'installment_line',
    )

    const pg = await pagamentoDeDivida()
    expect((await inspectTransaction(env.DB, pg.tx_id))?.class).toBe(
      'debt_payment_line',
    )

    const item = await compraDeItemDeDivida()
    expect((await inspectTransaction(env.DB, item.tx.id))?.class).toBe(
      'debt_item_line',
    )

    const r = await rateio()
    expect((await inspectTransaction(env.DB, r.filha.id))?.class).toBe(
      'split_child_line',
    )
    expect((await inspectTransaction(env.DB, r.pai.id))?.class).toBe(
      'split_parent_line',
    )

    const de = await contaCorrente('Origem inspect', 500000)
    const para = await contaCorrente('Destino inspect')
    const { out, transfer_id } = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 1000,
      date: '2026-07-20',
      description: 'PIX',
    })
    const dono = await inspectTransaction(env.DB, out.id)
    expect(dono?.class).toBe('transfer_leg')
    expect(dono?.transfer_id).toBe(transfer_id)
  })

  it('marca linha importada (o dedupe traz de volta se reimportar)', async () => {
    const acc = await contaCorrente('Conta importada')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -3000,
      purchase_date: '2026-07-10',
      description: 'Mercado',
      imported_id: 'FITID-1',
      import_source: 'ofx',
    })
    const dono = await inspectTransaction(env.DB, tx.id)
    // Importada nao muda a CLASSE (nada aponta pra ela) — so o aviso.
    expect(dono).toEqual({
      class: 'free',
      imported: true,
      transfer_id: null,
    })
  })

  it('devolve null para id inexistente', async () => {
    expect(await inspectTransaction(env.DB, 'nao-existe')).toBeNull()
  })
})

describe('updateTransaction — nivel A (rotulos, sempre)', () => {
  it('edita descricao, payee, categoria, PJ/PF e vinculo de recorrente', async () => {
    const { tx } = await lancamentoLivre('Conta rotulos')
    const payee = await createPayee(env.DB, {
      name: 'Padaria do Ze',
      kind: 'merchant',
    })
    const categoria = await env.DB.prepare(
      "SELECT id FROM categories WHERE slug = 'das'",
    ).first<{ id: string }>()
    const recorrente = await createRecurring(env.DB, {
      description: 'Starlink',
      scope: 'PJ',
      day_of_month: 10,
      amount_min_cents: 18900,
      amount_max_cents: 18900,
      starts_on: '2026-01-01',
    })

    const atualizado = await updateTransaction(env.DB, tx.id, {
      description: 'Padaria (corrigido)',
      payee_id: payee.id,
      category_id: categoria!.id,
      is_business: 1,
      recurring_expense_id: recorrente.id,
    })

    expect(atualizado?.description).toBe('Padaria (corrigido)')
    expect(atualizado?.payee_id).toBe(payee.id)
    expect(atualizado?.category_id).toBe(categoria!.id)
    expect(atualizado?.is_business).toBe(1)
    expect(atualizado?.recurring_expense_id).toBe(recorrente.id)
    // Nada de estrutural mudou junto.
    expect(atualizado?.amount_cents).toBe(tx.amount_cents)
    expect(atualizado?.purchase_date).toBe(tx.purchase_date)
  })

  it('rotulo vale ATE numa parcela — nenhum invariante depende dele', async () => {
    const { tx_id } = await parcela()
    const atualizado = await updateTransaction(env.DB, tx_id, {
      description: 'Notebook 3/10 (trabalho)',
      is_business: 1,
    })
    expect(atualizado?.description).toBe('Notebook 3/10 (trabalho)')
    expect(atualizado?.is_business).toBe(1)
  })

  it('toca updated_at (a coluna so era escrita no INSERT)', async () => {
    const { tx } = await lancamentoLivre('Conta updated_at')
    // nowIsoUtc tem resolucao de SEGUNDO: comparar com o updated_at recem
    // criado deixaria um UPDATE que NAO toca a coluna passar por igualdade.
    // Envelhecendo a linha, a asserção so passa se a coluna for reescrita.
    await env.DB.prepare('UPDATE transactions SET updated_at = ? WHERE id = ?')
      .bind('2000-01-01T00:00:00Z', tx.id)
      .run()

    const atualizado = await updateTransaction(env.DB, tx.id, {
      description: 'x',
    })
    expect(atualizado?.updated_at).not.toBe('2000-01-01T00:00:00Z')
    expect(atualizado!.updated_at > '2000-01-01T00:00:00Z').toBe(true)
    expect(atualizado?.created_at).toBe(tx.created_at)
  })

  it('patch vazio devolve a linha intacta, sem UPDATE', async () => {
    const { tx } = await lancamentoLivre('Conta patch vazio')
    expect(await updateTransaction(env.DB, tx.id, {})).toEqual(tx)
  })

  it('id inexistente devolve null', async () => {
    expect(
      await updateTransaction(env.DB, 'nao-existe', { description: 'x' }),
    ).toBeNull()
  })
})

describe('updateTransaction — nivel B (estrutura, so em linha livre)', () => {
  it('edita valor em linha livre', async () => {
    const { tx } = await lancamentoLivre('Conta valor')
    const atualizado = await updateTransaction(env.DB, tx.id, {
      amount_cents: -7300,
    })
    expect(atualizado?.amount_cents).toBe(-7300)
  })

  it('mudar purchase_date RE-DERIVA bill_competence com a regra da conta', async () => {
    const card = await cartao('Nubank re-deriva', 25)
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -12990,
      purchase_date: '2026-07-20',
      description: 'Steam',
    })
    expect(tx.bill_competence).toBe('2026-07')

    // 28/07 e DEPOIS do fechamento (25) => a fatura vira agosto. Sem a
    // re-derivacao, a linha ficaria em '2026-07' em silencio — na fatura
    // errada, sem nenhum erro.
    const atualizado = await updateTransaction(env.DB, tx.id, {
      purchase_date: '2026-07-28',
    })
    expect(atualizado?.purchase_date).toBe('2026-07-28')
    expect(atualizado?.bill_competence).toBe('2026-08')
  })

  it('mover de cartao para conta corrente zera bill_competence', async () => {
    const card = await cartao('Cartao origem', 25)
    const acc = await contaCorrente('Corrente destino')
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -9000,
      purchase_date: '2026-07-28',
      description: 'lancado na conta errada',
    })
    expect(tx.bill_competence).toBe('2026-08')

    const atualizado = await updateTransaction(env.DB, tx.id, {
      account_id: acc.id,
    })
    expect(atualizado?.account_id).toBe(acc.id)
    expect(atualizado?.bill_competence).toBeNull()
  })

  it('mover de conta corrente para cartao deriva a fatura', async () => {
    const acc = await contaCorrente('Corrente origem')
    const card = await cartao('Cartao destino', 25)
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -9000,
      purchase_date: '2026-07-28',
      description: 'era do cartao',
    })
    expect(tx.bill_competence).toBeNull()

    const atualizado = await updateTransaction(env.DB, tx.id, {
      account_id: card.id,
    })
    expect(atualizado?.bill_competence).toBe('2026-08')
  })

  it('conta inexistente no patch vira RangeError, sem gravar nada', async () => {
    const { tx } = await lancamentoLivre('Conta destino fantasma')
    await expect(
      updateTransaction(env.DB, tx.id, { account_id: 'nao-existe' }),
    ).rejects.toThrow('conta nao-existe nao existe')
    const depois = await env.DB.prepare(
      'SELECT account_id FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ account_id: string }>()
    expect(depois?.account_id).toBe(tx.account_id)
  })

  it('RECUSA valor numa parcela (quebraria SUM(parcelas) = total_cents)', async () => {
    const { plan, tx_id } = await parcela()
    await expect(
      updateTransaction(env.DB, tx_id, { amount_cents: -1 }),
    ).rejects.toMatchObject({
      name: 'TransactionHasOwnerError',
      code: 'installment_line',
    })

    const soma = await env.DB.prepare(
      `SELECT SUM(t.amount_cents) AS total FROM installments i
         JOIN transactions t ON t.id = i.transaction_id
        WHERE i.plan_id = ?`,
    )
      .bind(plan.id)
      .first<{ total: number }>()
    expect(soma?.total).toBe(-plan.total_cents)
  })

  it('RECUSA valor num pagamento de divida (divergiria de debt_payments)', async () => {
    const { payment, tx_id } = await pagamentoDeDivida()
    await expect(
      updateTransaction(env.DB, tx_id, { amount_cents: -1 }),
    ).rejects.toMatchObject({ code: 'debt_payment_line' })

    const tx = await env.DB.prepare(
      'SELECT amount_cents FROM transactions WHERE id = ?',
    )
      .bind(tx_id)
      .first<{ amount_cents: number }>()
    expect(Math.abs(tx!.amount_cents)).toBe(payment.amount_cents)
  })

  it('RECUSA data numa perna de transferencia (as duas tem que espelhar)', async () => {
    const de = await contaCorrente('Origem update', 500000)
    const para = await contaCorrente('Destino update')
    const { out } = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 1000,
      date: '2026-07-20',
      description: 'PIX',
    })
    await expect(
      updateTransaction(env.DB, out.id, { purchase_date: '2026-08-01' }),
    ).rejects.toMatchObject({ code: 'transfer_leg' })
  })

  it('RECUSA valor numa compra que e item de divida', async () => {
    const { tx } = await compraDeItemDeDivida()
    await expect(
      updateTransaction(env.DB, tx.id, { amount_cents: -1 }),
    ).rejects.toMatchObject({ code: 'debt_item_line' })
  })

  it('RECUSA valor numa filha e num pai de rateio', async () => {
    const { pai, filha } = await rateio()
    await expect(
      updateTransaction(env.DB, filha.id, { amount_cents: -1 }),
    ).rejects.toMatchObject({ code: 'split_child_line' })
    await expect(
      updateTransaction(env.DB, pai.id, { amount_cents: -1 }),
    ).rejects.toMatchObject({ code: 'split_parent_line' })
  })

  it('a recusa nao vaza SQLITE_CONSTRAINT nem nome de tabela', async () => {
    const { tx_id } = await parcela()
    await expect(
      updateTransaction(env.DB, tx_id, { amount_cents: -1 }),
    ).rejects.toThrow(/parcelamento/)
    const erro = await updateTransaction(env.DB, tx_id, {
      amount_cents: -1,
    }).catch((e: Error) => e)
    expect((erro as Error).message).not.toMatch(
      /SQLITE|D1_ERROR|installments|transactions/i,
    )
  })
})

describe('settleTransaction / unsettleTransaction', () => {
  it('grava DATA PURA e devolve true; segunda chamada devolve false', async () => {
    const { tx } = await lancamentoLivre('Conta liquidar')
    expect(tx.settled_at).toBeNull()
    // Mesmo motivo do teste de updated_at em updateTransaction: nowIsoUtc
    // tem resolucao de segundo, entao a linha e envelhecida antes.
    await env.DB.prepare('UPDATE transactions SET updated_at = ? WHERE id = ?')
      .bind('2000-01-01T00:00:00Z', tx.id)
      .run()

    expect(await settleTransaction(env.DB, tx.id, '2026-07-31')).toBe(true)
    const row = await env.DB.prepare(
      'SELECT settled_at, updated_at FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ settled_at: string; updated_at: string }>()
    // Data pura, nunca timestamp: cashflow.ts ramifica em includes('T'), e
    // um UTC aqui jogaria a linha pro mes errado no dia 1.
    expect(row?.settled_at).toBe('2026-07-31')
    expect(row?.settled_at).not.toContain('T')
    expect(row?.updated_at).not.toBe('2000-01-01T00:00:00Z')

    // Ja liquidada: nao ha transicao, entao false (nao um sucesso mudo que
    // sobrescreveria a data escolhida pelo dono).
    expect(await settleTransaction(env.DB, tx.id, '2026-08-05')).toBe(false)
    const depois = await env.DB.prepare(
      'SELECT settled_at FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ settled_at: string }>()
    expect(depois?.settled_at).toBe('2026-07-31')
  })

  it('sai do Comprometido e entra no fluxo de caixa', async () => {
    const card = await cartao('Cartao liquidar', 25)
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -20000,
      purchase_date: '2026-07-10',
      description: 'compra prevista',
    })

    const previstaAntes = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions WHERE id = ? AND settled_at IS NULL',
    )
      .bind(tx.id)
      .first<{ n: number }>()
    expect(previstaAntes?.n).toBe(1)

    await settleTransaction(env.DB, tx.id, '2026-08-05')
    const noFluxo = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM v_cashflow WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ n: number }>()
    expect(noFluxo?.n).toBe(1)
  })

  it('unsettle devolve a linha para PREVISTA; segunda chamada devolve false', async () => {
    const acc = await contaCorrente('Conta desliquidar')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -5000,
      purchase_date: '2026-07-10',
      description: 'marquei sem querer',
      settled_at: '2026-07-10',
    })
    expect(await unsettleTransaction(env.DB, tx.id)).toBe(true)
    const row = await env.DB.prepare(
      'SELECT settled_at FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ settled_at: string | null }>()
    expect(row?.settled_at).toBeNull()
    expect(await unsettleTransaction(env.DB, tx.id)).toBe(false)
  })

  it('id inexistente devolve false nas duas', async () => {
    expect(await settleTransaction(env.DB, 'nao-existe', '2026-07-31')).toBe(
      false,
    )
    expect(await unsettleTransaction(env.DB, 'nao-existe')).toBe(false)
  })

  it('recusa timestamp e data que nao existe no calendario', async () => {
    const { tx } = await lancamentoLivre('Conta data ruim')
    await expect(
      settleTransaction(env.DB, tx.id, '2026-07-31T10:00:00Z'),
    ).rejects.toThrow(RangeError)
    await expect(
      settleTransaction(env.DB, tx.id, '2026-02-30'),
    ).rejects.toThrow(RangeError)
    const row = await env.DB.prepare(
      'SELECT settled_at FROM transactions WHERE id = ?',
    )
      .bind(tx.id)
      .first<{ settled_at: string | null }>()
    expect(row?.settled_at).toBeNull()
  })
})

describe('deleteTransaction', () => {
  it('apaga uma linha livre', async () => {
    const { tx } = await lancamentoLivre('Conta apagar')
    expect(await deleteTransaction(env.DB, tx.id)).toBe(true)
    expect(await contarTx(tx.id)).toBe(0)
  })

  it('id inexistente devolve false (nunca excecao)', async () => {
    expect(await deleteTransaction(env.DB, 'nao-existe')).toBe(false)
  })

  it('perna de transferencia apaga AS DUAS, nunca meia', async () => {
    const de = await contaCorrente('Origem delete', 500000)
    const para = await contaCorrente('Destino delete')
    const { out, inbound, transfer_id } = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 150000,
      date: '2026-07-20',
      description: 'PIX interno',
    })

    expect(await deleteTransaction(env.DB, out.id)).toBe(true)

    // transfer_id nao tem FK (coluna solta): sem cascatear, a perna de
    // entrada ficaria orfa e accountBalances somaria um dinheiro que nao
    // existe mais do outro lado.
    const restantes = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions WHERE transfer_id = ?',
    )
      .bind(transfer_id)
      .first<{ n: number }>()
    expect(restantes?.n).toBe(0)
    expect(await contarTx(inbound.id)).toBe(0)

    const saldos = new Map(
      (await accountBalances(env.DB)).map((s) => [
        s.account_id,
        s.balance_cents,
      ]),
    )
    expect(saldos.get(de.id)).toBe(500000)
    expect(saldos.get(para.id)).toBe(0)
  })

  it('RECUSA parcela — sem o guard, o CASCADE apagaria em SILENCIO', async () => {
    const { plan, installments, tx_id } = await parcela()

    await expect(deleteTransaction(env.DB, tx_id)).rejects.toMatchObject({
      name: 'TransactionHasOwnerError',
      code: 'installment_line',
    })

    // As duas asserções abaixo sao o que pega a remocao do guard: sem ele o
    // DELETE tem SUCESSO (installments.transaction_id e CASCADE), a seq 3
    // some do cronograma e installments_count passa a mentir — nenhum erro
    // em lugar nenhum.
    expect(await contarTx(tx_id)).toBe(1)
    const cronograma = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM installments WHERE plan_id = ?',
    )
      .bind(plan.id)
      .first<{ n: number }>()
    expect(cronograma?.n).toBe(installments.length)
    expect(cronograma?.n).toBe(plan.installments_count)
  })

  it('a recusa da parcela manda cancelar o plano, sem erro cru do banco', async () => {
    const { tx_id } = await parcela()
    const erro = (await deleteTransaction(env.DB, tx_id).catch(
      (e: Error) => e,
    )) as TransactionHasOwnerError
    expect(erro).toBeInstanceOf(TransactionHasOwnerError)
    expect(erro.message).toMatch(/parcelamento/i)
    expect(erro.message).not.toMatch(/SQLITE|D1_ERROR|CASCADE|installments/i)
  })

  it('RECUSA pagamento de divida e aponta a rota certa', async () => {
    const { payment, tx_id } = await pagamentoDeDivida()
    const erro = (await deleteTransaction(env.DB, tx_id).catch(
      (e: Error) => e,
    )) as TransactionHasOwnerError
    expect(erro.code).toBe('debt_payment_line')
    expect(erro.message).toContain('/payments/')
    // O RESTRICT do banco dispararia aqui — mas com SQLITE_CONSTRAINT cru.
    expect(erro.message).not.toMatch(/SQLITE|D1_ERROR|FOREIGN KEY/i)

    expect(await contarTx(tx_id)).toBe(1)
    const pg = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM debt_payments WHERE id = ?',
    )
      .bind(payment.id)
      .first<{ n: number }>()
    expect(pg?.n).toBe(1)
  })

  it('RECUSA filha de rateio, e RECUSA o pai (levaria as filhas junto)', async () => {
    const { pai, filha } = await rateio()

    await expect(deleteTransaction(env.DB, filha.id)).rejects.toMatchObject({
      code: 'split_child_line',
    })
    await expect(deleteTransaction(env.DB, pai.id)).rejects.toMatchObject({
      code: 'split_parent_line',
    })
    expect(await contarTx(filha.id)).toBe(1)
    expect(await contarTx(pai.id)).toBe(1)
  })

  it('PERMITE apagar compra de item de divida — o item sobrevive sem o elo', async () => {
    const { item, tx } = await compraDeItemDeDivida()

    // A tela avisa a partir daqui: o elo com o caixa se perde.
    expect((await inspectTransaction(env.DB, tx.id))?.class).toBe(
      'debt_item_line',
    )
    expect(await deleteTransaction(env.DB, tx.id)).toBe(true)

    const depois = await env.DB.prepare(
      'SELECT amount_cents, transaction_id FROM debt_items WHERE id = ?',
    )
      .bind(item.id)
      .first<{ amount_cents: number; transaction_id: string | null }>()
    expect(depois?.amount_cents).toBe(280000)
    expect(depois?.transaction_id).toBeNull()
  })

  it('PERMITE apagar linha importada — e o dedupe a traz de volta', async () => {
    const acc = await contaCorrente('Conta reimport')
    const tx = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -3000,
      purchase_date: '2026-07-10',
      description: 'Mercado',
      imported_id: 'FITID-42',
      import_source: 'ofx',
    })
    expect((await inspectTransaction(env.DB, tx.id))?.imported).toBe(true)
    expect(await deleteTransaction(env.DB, tx.id)).toBe(true)

    // uq_tx_imported e (account_id, imported_id): apagada a linha, o mesmo
    // arquivo reimporta sem colidir — o "apagar" nao e permanente, e por
    // isso a tela precisa dizer isso ANTES.
    const denovo = await createTransaction(env.DB, {
      account_id: acc.id,
      amount_cents: -3000,
      purchase_date: '2026-07-10',
      description: 'Mercado',
      imported_id: 'FITID-42',
      import_source: 'ofx',
    })
    expect(denovo.id).not.toBe(tx.id)
    expect(denovo.imported_id).toBe('FITID-42')
  })
})

// ---------------------------------------------------------------------------
// payBill — pagar a fatura do cartão.
//
// O cenário é o mesmo dos números medidos no CLAUDE.md: cartão que fecha dia
// 25 com três compras na fatura de 2026-08 (R$ 250 no total) e uma corrente
// com R$ 5.000 de saldo de abertura. Cada `it` abaixo prova UMA propriedade do
// dinheiro, sempre chamando as funções de relatório de verdade — nunca lendo
// só a linha crua do banco.
// ---------------------------------------------------------------------------
describe('payBill', () => {
  async function cenario() {
    const card = await cartao('Nubank cartao fatura', 25)
    const conta = await contaCorrente('Nubank PJ fatura', 500000)
    for (const [desc, cents, dia] of [
      ['Mercado', 12000, '2026-07-28'],
      ['Posto', 8000, '2026-07-29'],
      ['Farmacia', 5000, '2026-08-02'],
    ] as const) {
      await createTransaction(env.DB, {
        account_id: card.id,
        amount_cents: -cents,
        purchase_date: dia,
        description: desc,
      })
    }
    return { card, conta }
  }

  const pagar = (card: { id: string }, conta: { id: string }) =>
    payBill(env.DB, {
      card_account_id: card.id,
      competence: '2026-08',
      paid_on: '2026-09-05',
      from_account_id: conta.id,
    })

  const saldoDe = async (id: string) =>
    (await accountBalances(env.DB)).find((s) => s.account_id === id)
      ?.balance_cents

  it('devolve as duas pernas com o mesmo transfer_id e liquida as 3 linhas', async () => {
    const { card, conta } = await cenario()
    const res = await pagar(card, conta)

    expect(res.amount_cents).toBe(25000)
    expect(res.settled_count).toBe(3)
    expect(res.out.account_id).toBe(conta.id)
    expect(res.out.amount_cents).toBe(-25000)
    expect(res.inbound.account_id).toBe(card.id)
    expect(res.inbound.amount_cents).toBe(25000)
    expect(res.out.transfer_id).toBe(res.transfer_id)
    expect(res.inbound.transfer_id).toBe(res.transfer_id)
    // A perna que cai no cartão NÃO pode carregar competência: ela inflaria
    // uma fatura futura do próprio cartão que acabou de ser pago.
    expect(res.inbound.bill_competence).toBeNull()
  })

  it('o saldo do cartão ZERA e o da corrente desce exatamente o valor pago', async () => {
    const { card, conta } = await cenario()
    expect(await saldoDe(card.id)).toBe(-25000)
    expect(await saldoDe(conta.id)).toBe(500000)

    await pagar(card, conta)

    expect(await saldoDe(card.id)).toBe(0)
    expect(await saldoDe(conta.id)).toBe(475000)
  })

  it('o consolidado NÃO muda — o dinheiro mudou de lugar, não sumiu', async () => {
    const { card, conta } = await cenario()
    const consolidado = async () =>
      (await accountBalances(env.DB)).reduce((a, s) => a + s.balance_cents, 0)

    const antes = await consolidado()
    await pagar(card, conta)
    expect(await consolidado()).toBe(antes)
  })

  it('commitments() PERDE a competência paga do cartão', async () => {
    const { card, conta } = await cenario()
    const relatorio = () =>
      commitments(env.DB, {
        from: '2026-07',
        months: 3,
        fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
      })

    const antes = await relatorio()
    expect(antes.rows).toHaveLength(1)
    expect(antes.rows[0].account_id).toBe(card.id)
    expect(antes.totals[1]).toEqual({ min: 25000, max: 25000 })

    await pagar(card, conta)

    const depois = await relatorio()
    expect(depois.rows).toHaveLength(0)
    expect(depois.totals).toEqual([
      { min: 0, max: 0 },
      { min: 0, max: 0 },
      { min: 0, max: 0 },
    ])
  })

  /**
   * ⚠️ ACHADO MEDIDO que contradiz a expectativa mais óbvia: cashflow() GANHA
   * uma saída — e isso é CERTO, não dupla contagem.
   *
   * A leitura intuitiva ("a despesa já foi contada na compra, então o
   * pagamento não pode aparecer") é falsa, e a medição do estado ANTES é a
   * prova: as compras nascem com `settled_at` NULL, e `cashflow()` exige
   * `settled_at IS NOT NULL` — ou seja, elas NUNCA estiveram no fluxo de
   * caixa. Nada foi contado ainda.
   *
   * O que o fluxo de caixa mede é dinheiro que se MOVEU. Numa compra de
   * cartão o dinheiro não se move na compra; ele se move quando a fatura é
   * paga. Liquidar as linhas com `settled_at = paid_on` põe os R$ 250 no mês
   * do PAGAMENTO, que é exatamente onde o caixa foi afetado.
   *
   * A dupla contagem que precisa ser impedida é outra: as duas pernas da
   * transferência somariam OS MESMOS R$ 250 de novo. Elas carregam
   * `transfer_id`, e `cashflow()` filtra `transfer_id IS NULL` — por isso o
   * total é 25000 e não 50000. É esse número exato que este teste trava.
   */
  it('cashflow() ganha a saída UMA vez, no mês do pagamento — nunca duas', async () => {
    const { card, conta } = await cenario()

    const antes = await cashflow(env.DB, { from: '2026-07', months: 4 })
    // Nenhuma das compras estava no caixa: elas ainda não tinham sido pagas.
    expect(antes.linhas.every((l) => l.saiu_cents === 0)).toBe(true)

    await pagar(card, conta)

    const depois = await cashflow(env.DB, { from: '2026-07', months: 4 })
    const setembro = depois.linhas.find((l) => l.competence === '2026-09')
    // 25000, NUNCA 50000: as duas pernas da transferência estão fora.
    expect(setembro?.saiu_cents).toBe(25000)
    expect(setembro?.entrou_cents).toBe(0)
    // E nenhum outro mês ganhou nada.
    expect(
      depois.linhas
        .filter((l) => l.competence !== '2026-09')
        .every((l) => l.saiu_cents === 0 && l.entrou_cents === 0),
    ).toBe(true)
  })

  it('byCategory() NÃO muda — as pernas da transferência ficam de fora', async () => {
    const { card, conta } = await cenario()
    const meses = ['2026-07', '2026-08', '2026-09']
    const ler = async () =>
      Promise.all(
        meses.map(async (competence) => {
          const r = await byCategory(env.DB, { competence })
          return { competence, total: r.total_cents, linhas: r.rows.length }
        }),
      )

    const antes = await ler()
    await pagar(card, conta)
    expect(await ler()).toEqual(antes)
  })

  it('pagar a MESMA fatura duas vezes é recusado, e nada é escrito na segunda', async () => {
    const { card, conta } = await cenario()
    await pagar(card, conta)

    const contar = async () =>
      (
        await env.DB.prepare(
          'SELECT COUNT(*) AS n FROM transactions WHERE account_id IN (?, ?)',
        )
          .bind(card.id, conta.id)
          .first<{ n: number }>()
      )?.n

    const linhasDepoisDoPrimeiro = await contar()

    await expect(pagar(card, conta)).rejects.toMatchObject({
      name: 'PayBillError',
      code: 'already_paid',
    })

    // A recusa acontece ANTES do batch: nenhuma perna nova, nenhum centavo a
    // mais saiu da corrente.
    expect(await contar()).toBe(linhasDepoisDoPrimeiro)
    expect(await saldoDe(conta.id)).toBe(475000)
    expect(await saldoDe(card.id)).toBe(0)
  })

  it('⚠️ duas chamadas CONCORRENTES não pagam a fatura duas vezes', async () => {
    // MEDIDO pelo revisor, e é dinheiro: a checagem de `already_paid` era uma
    // LEITURA fora do batch, então duas chamadas simultâneas passavam as
    // duas. `Promise.allSettled` de dois `payBill` idênticos resolvia AMBAS,
    // gravava **4 pernas**, deixava o cartão POSITIVO (+150000) e tirava
    // R$ 1.500 da corrente **duas vezes**.
    //
    // ⚠️ E nenhum relatório denunciava: o consolidado continua batendo (o
    // dinheiro "mudou de lugar" duas vezes). O erro só apareceria olhando o
    // saldo do cartão e estranhando o sinal.
    //
    // O conserto põe a decisão DENTRO do batch (`INSERT ... WHERE EXISTS`),
    // que no D1 é transação: as duas serializam e a segunda não acha linha
    // não-liquidada.
    const { card, conta } = await cenario()

    const [a, b] = await Promise.allSettled([
      pagar(card, conta),
      pagar(card, conta),
    ])

    // Uma passa, a outra é recusada — nunca as duas.
    const ok = [a, b].filter((r) => r.status === 'fulfilled')
    expect(ok).toHaveLength(1)

    // ⚠️ As asserções que importam são as de DINHEIRO, não a contagem de
    // promessas: o cartão zera (nunca fica positivo) e a corrente perde o
    // valor UMA vez.
    expect(await saldoDe(card.id)).toBe(0)
    expect(await saldoDe(conta.id)).toBe(475000)

    // Duas pernas, não quatro.
    const pernas = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM transactions WHERE transfer_id IS NOT NULL AND account_id IN (?, ?)',
    )
      .bind(card.id, conta.id)
      .first<{ n: number }>()
    expect(pernas?.n).toBe(2)
  })

  it('recusa competência sem nenhuma linha', async () => {
    const { card, conta } = await cenario()
    await expect(
      payBill(env.DB, {
        card_account_id: card.id,
        competence: '2027-03',
        paid_on: '2026-09-05',
        from_account_id: conta.id,
      }),
    ).rejects.toMatchObject({ name: 'PayBillError', code: 'no_lines' })
  })

  it('recusa conta que não é cartão', async () => {
    const { conta } = await cenario()
    const outra = await contaCorrente('Outra corrente', 1000)
    await expect(
      payBill(env.DB, {
        card_account_id: conta.id,
        competence: '2026-08',
        paid_on: '2026-09-05',
        from_account_id: outra.id,
      }),
    ).rejects.toMatchObject({ name: 'PayBillError', code: 'invalid_account' })
  })

  it('recusa conta de origem igual ao cartão', async () => {
    const { card } = await cenario()
    await expect(
      payBill(env.DB, {
        card_account_id: card.id,
        competence: '2026-08',
        paid_on: '2026-09-05',
        from_account_id: card.id,
      }),
    ).rejects.toMatchObject({ name: 'PayBillError', code: 'invalid_account' })
  })

  it('recusa quando o valor informado não bate com a fatura, e nomeia o total real', async () => {
    const { card, conta } = await cenario()
    await expect(
      payBill(env.DB, {
        card_account_id: card.id,
        competence: '2026-08',
        paid_on: '2026-09-05',
        from_account_id: conta.id,
        expected_amount_cents: 20000,
      }),
    ).rejects.toMatchObject({ name: 'PayBillError', code: 'amount_mismatch' })

    // Recusou ANTES de escrever: a fatura continua em aberto.
    const relatorio = await commitments(env.DB, {
      from: '2026-08',
      months: 1,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })
    expect(relatorio.totals[0]).toEqual({ min: 25000, max: 25000 })
  })

  it('aceita o valor informado quando ele bate', async () => {
    const { card, conta } = await cenario()
    const res = await payBill(env.DB, {
      card_account_id: card.id,
      competence: '2026-08',
      paid_on: '2026-09-05',
      from_account_id: conta.id,
      expected_amount_cents: 25000,
    })
    expect(res.amount_cents).toBe(25000)
  })

  it('competência que fecha em crédito (estorno maior que as compras) não é fatura a pagar', async () => {
    const card = await cartao('Cartao estornado', 25)
    const conta = await contaCorrente('Corrente estorno', 500000)
    await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -5000,
      purchase_date: '2026-07-28',
      description: 'Compra',
    })
    await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: 9000,
      purchase_date: '2026-07-29',
      description: 'Estorno',
    })
    await expect(
      payBill(env.DB, {
        card_account_id: card.id,
        competence: '2026-08',
        paid_on: '2026-09-05',
        from_account_id: conta.id,
      }),
    ).rejects.toMatchObject({ name: 'PayBillError', code: 'nothing_to_pay' })
  })

  it('paga SÓ a competência pedida — outra fatura do mesmo cartão fica intacta', async () => {
    const card = await cartao('Cartao duas faturas', 25)
    const conta = await contaCorrente('Corrente duas faturas', 500000)
    // Fatura de julho (compra antes do fechamento) e de agosto (depois).
    await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -3000,
      purchase_date: '2026-07-10',
      description: 'Julho',
    })
    await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -7000,
      purchase_date: '2026-07-28',
      description: 'Agosto',
    })

    await payBill(env.DB, {
      card_account_id: card.id,
      competence: '2026-08',
      paid_on: '2026-09-05',
      from_account_id: conta.id,
    })

    const relatorio = await commitments(env.DB, {
      from: '2026-07',
      months: 2,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    })
    // Julho continua devendo os R$ 30; agosto foi pago.
    expect(relatorio.totals[0]).toEqual({ min: 3000, max: 3000 })
    expect(relatorio.totals[1]).toEqual({ min: 0, max: 0 })
    // E o saldo do cartão reflete só a fatura ainda aberta.
    expect(await saldoDe(card.id)).toBe(-3000)
  })

  it('recusa paid_on com timestamp e competência malformada', async () => {
    const { card, conta } = await cenario()
    await expect(
      payBill(env.DB, {
        card_account_id: card.id,
        competence: '2026-08',
        paid_on: '2026-09-05T10:00:00Z',
        from_account_id: conta.id,
      }),
    ).rejects.toBeInstanceOf(RangeError)

    await expect(
      payBill(env.DB, {
        card_account_id: card.id,
        competence: '2026-13',
        paid_on: '2026-09-05',
        from_account_id: conta.id,
      }),
    ).rejects.toBeInstanceOf(RangeError)
  })

  it('a recusa nunca vaza SQLITE/D1_ERROR', async () => {
    const { card, conta } = await cenario()
    await pagar(card, conta)
    const err = await pagar(card, conta).then(
      () => null,
      (e: unknown) => e as Error,
    )
    expect(err).toBeInstanceOf(PayBillError)
    expect(err?.message).not.toMatch(/SQLITE|D1_ERROR|FOREIGN KEY/i)
  })
})

describe('listOpenBills', () => {
  // Cartão que fecha dia 25: 10/07 cai na fatura de JULHO, 28/07 e 02/08 caem
  // na de AGOSTO — duas competências abertas no mesmo cartão, que é o caso
  // que a tela precisa saber separar.
  async function cartaoComDuasFaturas() {
    const card = await cartao('Nubank duas faturas', 25)
    for (const [desc, cents, dia] of [
      ['Padaria', 3000, '2026-07-10'],
      ['Mercado', 12000, '2026-07-28'],
      ['Posto', 8000, '2026-08-02'],
    ] as const) {
      await createTransaction(env.DB, {
        account_id: card.id,
        amount_cents: -cents,
        purchase_date: dia,
        description: desc,
      })
    }
    return card
  }

  it('agrupa por competencia com total POSITIVO e a contagem de linhas', async () => {
    const card = await cartaoComDuasFaturas()

    // Da mais antiga pra mais nova — a fatura vencida primeiro.
    expect(await listOpenBills(env.DB, card.id)).toEqual([
      { competence: '2026-07', amount_cents: 3000, line_count: 1 },
      { competence: '2026-08', amount_cents: 20000, line_count: 2 },
    ])
  })

  it('nao conta linha JA liquidada, e a competencia some quando todas caem', async () => {
    const card = await cartaoComDuasFaturas()
    const [julho] = await listTransactions(env.DB, {
      account_id: card.id,
      from: '2026-07-10',
      to: '2026-07-10',
    })
    await settleTransaction(env.DB, julho.id, '2026-07-20')

    // Julho tinha UMA linha só: liquidada, a competência inteira sai da lista.
    expect(await listOpenBills(env.DB, card.id)).toEqual([
      { competence: '2026-08', amount_cents: 20000, line_count: 2 },
    ])
  })

  it('competencia que fecha em CREDITO nao aparece — e e a mesma que payBill recusa', async () => {
    const card = await cartao('Cartao com estorno', 25)
    await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -5000,
      purchase_date: '2026-07-28',
      description: 'Compra',
    })
    await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: 9000,
      purchase_date: '2026-07-29',
      description: 'Estorno maior',
    })

    // A tela não pode oferecer um botão que o servidor então recusa: a lista
    // vem vazia pelo MESMO critério (`HAVING SUM < 0`) do `nothing_to_pay`.
    expect(await listOpenBills(env.DB, card.id)).toEqual([])

    const conta = await contaCorrente('Corrente estorno')
    await expect(
      payBill(env.DB, {
        card_account_id: card.id,
        // Fecha dia 25: as duas linhas de 28 e 29/07 caem na fatura de AGOSTO.
        competence: '2026-08',
        paid_on: '2026-09-05',
        from_account_id: conta.id,
      }),
    ).rejects.toMatchObject({ code: 'nothing_to_pay' })
  })

  it('a fatura some da lista depois de paga — a leitura e a escrita concordam', async () => {
    const card = await cartaoComDuasFaturas()
    const conta = await contaCorrente('Corrente paga fatura', 500000)

    const antes = await listOpenBills(env.DB, card.id)
    const agosto = antes.find((b) => b.competence === '2026-08')!

    const res = await payBill(env.DB, {
      card_account_id: card.id,
      competence: '2026-08',
      paid_on: '2026-09-05',
      from_account_id: conta.id,
      // ⚠️ O total que a TELA leu vai como confirmação: se as duas consultas
      // discordassem, isto viraria `amount_mismatch` em vez de pagamento.
      expected_amount_cents: agosto.amount_cents,
    })

    // O N que a tela mostrou é o N que o servidor liquidou.
    expect(res.settled_count).toBe(agosto.line_count)
    expect(res.amount_cents).toBe(agosto.amount_cents)

    // Julho continua aberta: pagar agosto não tocou na outra competência.
    expect(await listOpenBills(env.DB, card.id)).toEqual([
      { competence: '2026-07', amount_cents: 3000, line_count: 1 },
    ])
  })

  it('a perna da transferencia que cai no cartao nao vira fatura nova', async () => {
    const card = await cartaoComDuasFaturas()
    const conta = await contaCorrente('Corrente perna', 500000)
    await payBill(env.DB, {
      card_account_id: card.id,
      competence: '2026-08',
      paid_on: '2026-09-05',
      from_account_id: conta.id,
    })

    // A perna de ENTRADA é +25000 no próprio cartão. Se ela contasse, a lista
    // ganharia uma competência (ou mudaria o total de julho).
    const abertas = await listOpenBills(env.DB, card.id)
    expect(abertas).toEqual([
      { competence: '2026-07', amount_cents: 3000, line_count: 1 },
    ])
  })

  // ⚠️ Este teste existe porque a MUTAÇÃO do filtro `transfer_id IS NULL` não
  // matava nada, e a razão é real: hoje `createTransfer`/`payBill` gravam as
  // pernas com `bill_competence` NULL, então o filtro `bill_competence IS NOT
  // NULL` já as descarta sozinho — o de `transfer_id` é DEFENSIVO (o mesmo
  // raciocínio, e as mesmas palavras, do comentário de `payBill`). Um guard
  // que nenhum teste cobre é um guard que alguém apaga por parecer redundante,
  // e a redundância acabaria no instante em que uma perna passasse a carregar
  // competência. O cenário é forjado com UPDATE justamente porque o domínio
  // ainda não sabe produzi-lo.
  it('perna de transferencia COM competencia continua fora — o guard e defensivo, nao inerte', async () => {
    const card = await cartaoComDuasFaturas()

    // Uma linha normal do cartão (nasce com bill_competence derivado) que
    // passa a carregar `transfer_id` — a forma que uma perna teria se
    // `createTransfer` um dia derivasse competência.
    const [julho] = await listTransactions(env.DB, {
      account_id: card.id,
      from: '2026-07-10',
      to: '2026-07-10',
    })
    await env.DB.prepare(
      "UPDATE transactions SET transfer_id = 'transferencia-forjada' WHERE id = ?",
    )
      .bind(julho.id)
      .run()

    // Sem o filtro de `transfer_id`, julho voltaria como fatura em aberto.
    expect(await listOpenBills(env.DB, card.id)).toEqual([
      { competence: '2026-08', amount_cents: 20000, line_count: 2 },
    ])
  })

  it('cartao sem fatura aberta devolve lista vazia, nao erro', async () => {
    const card = await cartao('Cartao zerado', 25)
    expect(await listOpenBills(env.DB, card.id)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// DESFAZER O PAGAMENTO DA FATURA (migration 0020).
//
// payBill passa a registrar QUAIS linhas liquidou (bill_payment_lines). Sem
// esse registro, desfazer teria de adivinhar pela data (`settled_at =
// paid_on`), e uma compra da mesma competência liquidada à mão na mesma data
// seria desfeita junto, em silêncio. Os testes abaixo provam o registro, o
// desfazer medido pelos relatórios de verdade e as duas portas que deixam de
// ser o caminho (DELETE da perna e unsettle da linha).
// ---------------------------------------------------------------------------

/** Cartão que fecha dia 25: três compras na fatura de 2026-08 (R$ 250). */
async function cenarioDeFatura(sufixo: string) {
  const card = await cartao(`Cartao desfazer ${sufixo}`, 25)
  const conta = await contaCorrente(`Corrente desfazer ${sufixo}`, 500000)
  const ids: string[] = []
  for (const [desc, cents, dia] of [
    ['Mercado', 12000, '2026-07-28'],
    ['Posto', 8000, '2026-07-29'],
    ['Farmacia', 5000, '2026-08-02'],
  ] as const) {
    const tx = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -cents,
      purchase_date: dia,
      description: desc,
    })
    ids.push(tx.id)
  }
  return { card, conta, ids }
}

function pagarAgosto(card: { id: string }, conta: { id: string }) {
  return payBill(env.DB, {
    card_account_id: card.id,
    competence: '2026-08',
    paid_on: '2026-09-05',
    from_account_id: conta.id,
  })
}

async function linhasRegistradas(transfer_id: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    'SELECT transaction_id FROM bill_payment_lines WHERE transfer_id = ? ORDER BY transaction_id',
  )
    .bind(transfer_id)
    .all<{ transaction_id: string }>()
  return results.map((r) => r.transaction_id)
}

async function settledAtDe(id: string): Promise<string | null> {
  const row = await env.DB.prepare(
    'SELECT settled_at FROM transactions WHERE id = ?',
  )
    .bind(id)
    .first<{ settled_at: string | null }>()
  return row?.settled_at ?? null
}

async function contar(sql: string, ...binds: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...binds)
    .first<{ n: number }>()
  return row?.n ?? 0
}

/**
 * O que o dono enxerga — saldos, consolidado e os três relatórios — sempre
 * pelas funções de verdade, nunca pela linha crua: é o mesmo critério dos
 * testes de payBill, aplicado agora à volta.
 */
async function retrato(card: { id: string }, conta: { id: string }) {
  const saldos = await accountBalances(env.DB)
  const saldo = (id: string) =>
    saldos.find((s) => s.account_id === id)?.balance_cents
  return {
    cartao: saldo(card.id),
    corrente: saldo(conta.id),
    consolidado: saldos.reduce((a, s) => a + s.balance_cents, 0),
    comprometido: await commitments(env.DB, {
      from: '2026-07',
      months: 3,
      fixed_net_cents: DEFAULT_FIXED_NET_CENTS,
    }),
    fluxo: await cashflow(env.DB, { from: '2026-07', months: 4 }),
    categorias: await Promise.all(
      ['2026-07', '2026-08', '2026-09'].map((competence) =>
        byCategory(env.DB, { competence }),
      ),
    ),
  }
}

describe('payBill registra o pagamento (bill_payments)', () => {
  it('grava cartão, competência, data e valor do pagamento', async () => {
    const { card, conta } = await cenarioDeFatura('registro')
    const pago = await pagarAgosto(card, conta)

    const { results } = await env.DB.prepare(
      'SELECT transfer_id, card_account_id, competence, paid_on, amount_cents FROM bill_payments',
    ).all()
    expect(results).toEqual([
      {
        transfer_id: pago.transfer_id,
        card_account_id: card.id,
        competence: '2026-08',
        paid_on: '2026-09-05',
        amount_cents: 25000,
      },
    ])
  })

  it('as linhas registradas são EXATAMENTE as que o pagamento liquidou', async () => {
    const { card, conta, ids } = await cenarioDeFatura('exatas')

    // Tudo que mora no mesmo cartão e NÃO pode entrar no registro:
    const julho = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -3000,
      purchase_date: '2026-07-10',
      description: 'Outra fatura',
    })
    const jaPaga = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -4000,
      purchase_date: '2026-08-01',
      description: 'Paga antes',
    })
    await settleTransaction(env.DB, jaPaga.id, '2026-08-10')
    const filha = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -2000,
      purchase_date: '2026-08-03',
      description: 'Parte de rateio',
    })
    await env.DB.prepare('UPDATE transactions SET parent_id = ? WHERE id = ?')
      .bind(ids[0], filha.id)
      .run()
    const pernaForjada = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -6000,
      purchase_date: '2026-08-04',
      description: 'Perna com competencia',
    })
    await env.DB.prepare(
      "UPDATE transactions SET transfer_id = 'transferencia-forjada' WHERE id = ?",
    )
      .bind(pernaForjada.id)
      .run()

    const estado = async () =>
      new Map(
        (
          await env.DB.prepare('SELECT id, settled_at FROM transactions').all<{
            id: string
            settled_at: string | null
          }>()
        ).results.map((r) => [r.id, r.settled_at]),
      )
    const antes = await estado()
    const pago = await pagarAgosto(card, conta)
    const depois = await estado()

    const liquidadasAgora = [...antes]
      .filter(([id, s]) => s === null && depois.get(id) !== null)
      .map(([id]) => id)
      .sort()

    expect(await linhasRegistradas(pago.transfer_id)).toEqual(liquidadasAgora)
    expect(liquidadasAgora).toEqual([...ids].sort())
    expect(liquidadasAgora).toHaveLength(pago.settled_count)
    for (const fora of [julho.id, jaPaga.id, filha.id, pernaForjada.id]) {
      expect(liquidadasAgora).not.toContain(fora)
    }
  })

  it('⚠️ duas chamadas CONCORRENTES registram UM pagamento só, com as 3 linhas', async () => {
    // A guarda de corrida de payBill (INSERT ... WHERE EXISTS) protege as
    // pernas; o registro tem de seguir a mesma guarda. Sem ela, a chamada que
    // perde a corrida não grava perna nenhuma mas deixaria um pagamento
    // registrado apontando para uma transferência que não existe.
    const { card, conta, ids } = await cenarioDeFatura('corrida registro')

    const resultados = await Promise.allSettled([
      pagarAgosto(card, conta),
      pagarAgosto(card, conta),
    ])
    const ok = resultados.filter((r) => r.status === 'fulfilled')
    expect(ok).toHaveLength(1)
    const vencedor = (ok[0] as PromiseFulfilledResult<{ transfer_id: string }>)
      .value

    const { results } = await env.DB.prepare(
      'SELECT transfer_id FROM bill_payments',
    ).all<{ transfer_id: string }>()
    expect(results.map((r) => r.transfer_id)).toEqual([vencedor.transfer_id])
    expect(await linhasRegistradas(vencedor.transfer_id)).toEqual(
      [...ids].sort(),
    )
    expect(await contar('SELECT COUNT(*) AS n FROM bill_payment_lines')).toBe(3)
  })
})

describe('undoBillPayment', () => {
  it('volta saldos, consolidado, commitments(), cashflow() e byCategory() EXATAMENTE ao estado de antes do pagamento', async () => {
    const { card, conta, ids } = await cenarioDeFatura('estado')
    const antes = await retrato(card, conta)

    const pago = await pagarAgosto(card, conta)
    // O pagamento mexeu de fato no que o dono vê — senão a volta não prova nada.
    expect(await retrato(card, conta)).not.toEqual(antes)

    const desfeito = await undoBillPayment(env.DB, pago.transfer_id)
    expect(desfeito).toEqual({
      transfer_id: pago.transfer_id,
      competence: '2026-08',
      amount_cents: 25000,
      unsettled_count: 3,
    })

    expect(await retrato(card, conta)).toEqual(antes)
    for (const id of ids) expect(await settledAtDe(id)).toBeNull()
    expect(
      await contar(
        'SELECT COUNT(*) AS n FROM transactions WHERE transfer_id = ?',
        pago.transfer_id,
      ),
    ).toBe(0)
    expect(await contar('SELECT COUNT(*) AS n FROM bill_payments')).toBe(0)
    expect(await contar('SELECT COUNT(*) AS n FROM bill_payment_lines')).toBe(0)
  })

  it('desfazer duas vezes: a segunda devolve null e não mexe em nada', async () => {
    const { card, conta } = await cenarioDeFatura('duas vezes')
    const pago = await pagarAgosto(card, conta)
    expect(await undoBillPayment(env.DB, pago.transfer_id)).not.toBeNull()

    const linhas = async () =>
      (await env.DB.prepare('SELECT * FROM transactions ORDER BY id').all())
        .results
    const depoisDoPrimeiro = await linhas()

    expect(await undoBillPayment(env.DB, pago.transfer_id)).toBeNull()
    expect(await linhas()).toEqual(depoisDoPrimeiro)
  })

  it('⚠️ duas chamadas CONCORRENTES desfazem uma vez só', async () => {
    const { card, conta } = await cenarioDeFatura('corrida desfazer')
    const antes = await retrato(card, conta)
    const pago = await pagarAgosto(card, conta)

    const resultados = await Promise.allSettled([
      undoBillPayment(env.DB, pago.transfer_id),
      undoBillPayment(env.DB, pago.transfer_id),
    ])
    expect(resultados.every((r) => r.status === 'fulfilled')).toBe(true)
    const valores = resultados.map(
      (r) => (r as PromiseFulfilledResult<unknown>).value,
    )
    // Uma resposta diz o que desfez; a outra diz que não havia o que desfazer.
    expect(valores.filter((v) => v !== null)).toHaveLength(1)
    expect(await retrato(card, conta)).toEqual(antes)
  })

  it('id sem pagamento registrado devolve null — e uma transferência comum fica intacta', async () => {
    expect(await undoBillPayment(env.DB, 'nao-existe')).toBeNull()

    const de = await contaCorrente('Origem comum', 100000)
    const para = await contaCorrente('Destino comum')
    const t = await createTransfer(env.DB, {
      from_account_id: de.id,
      to_account_id: para.id,
      amount_cents: 30000,
      date: '2026-09-01',
      description: 'PIX interno',
    })
    expect(await undoBillPayment(env.DB, t.transfer_id)).toBeNull()
    expect(
      await contar(
        'SELECT COUNT(*) AS n FROM transactions WHERE transfer_id = ?',
        t.transfer_id,
      ),
    ).toBe(2)
  })

  it('compra que entrou na MESMA competência DEPOIS do pagamento fica intocada — em aberto ou liquidada à mão na MESMA data', async () => {
    // A segunda compra é o caso que derruba a heurística "desfaz o que tem
    // settled_at = paid_on": mesma fatura, mesma data, e não foi o pagamento
    // que a liquidou.
    const { card, conta } = await cenarioDeFatura('compra nova')
    const pago = await pagarAgosto(card, conta)

    const aberta = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -1500,
      purchase_date: '2026-08-03',
      description: 'Padaria',
    })
    const liquidadaAMao = await createTransaction(env.DB, {
      account_id: card.id,
      amount_cents: -2500,
      purchase_date: '2026-08-04',
      description: 'Cinema',
    })
    await settleTransaction(env.DB, liquidadaAMao.id, '2026-09-05')
    // updated_at antigo: qualquer UPDATE que encostasse nelas o trocaria.
    await env.DB.prepare(
      "UPDATE transactions SET updated_at = '2000-01-01T00:00:00Z' WHERE id IN (?, ?)",
    )
      .bind(aberta.id, liquidadaAMao.id)
      .run()

    const desfeito = await undoBillPayment(env.DB, pago.transfer_id)
    expect(desfeito?.unsettled_count).toBe(3)

    const { results } = await env.DB.prepare(
      'SELECT id, settled_at, updated_at FROM transactions WHERE id IN (?, ?) ORDER BY amount_cents',
    )
      .bind(aberta.id, liquidadaAMao.id)
      .all()
    expect(results).toEqual([
      {
        id: liquidadaAMao.id,
        settled_at: '2026-09-05',
        updated_at: '2000-01-01T00:00:00Z',
      },
      { id: aberta.id, settled_at: null, updated_at: '2000-01-01T00:00:00Z' },
    ])
    // A fatura volta a ter as 3 compras do pagamento mais a nova em aberto.
    expect(await listOpenBills(env.DB, card.id)).toEqual([
      { competence: '2026-08', amount_cents: 26500, line_count: 4 },
    ])
  })

  it('linha desmarcada à mão depois do pagamento e liquidada de novo à mão NÃO é desfeita pelo pagamento', async () => {
    const { card, conta, ids } = await cenarioDeFatura('remarcada')
    const pago = await pagarAgosto(card, conta)

    expect(await unsettleTransaction(env.DB, ids[0])).toBe(true)
    // Ao desmarcar, a linha sai do registro daquele pagamento (D4).
    expect(await linhasRegistradas(pago.transfer_id)).toEqual(
      [ids[1], ids[2]].sort(),
    )
    expect(await settleTransaction(env.DB, ids[0], '2026-09-05')).toBe(true)
    expect(await linhasRegistradas(pago.transfer_id)).toEqual(
      [ids[1], ids[2]].sort(),
    )

    const desfeito = await undoBillPayment(env.DB, pago.transfer_id)
    expect(desfeito?.unsettled_count).toBe(2)
    expect(await settledAtDe(ids[0])).toBe('2026-09-05')
    expect(await settledAtDe(ids[1])).toBeNull()
    expect(await settledAtDe(ids[2])).toBeNull()
  })

  it('as linhas que voltam para "em aberto" ganham updated_at novo', async () => {
    // Uma linha reaberta com o updated_at do pagamento mentiria sobre quando
    // foi mexida pela última vez (mesma regra de updateTransaction).
    const { card, conta, ids } = await cenarioDeFatura('updated_at')
    const pago = await pagarAgosto(card, conta)
    await env.DB.prepare(
      "UPDATE transactions SET updated_at = '2000-01-01T00:00:00Z' WHERE id IN (?, ?, ?)",
    )
      .bind(...ids)
      .run()

    await undoBillPayment(env.DB, pago.transfer_id)

    const { results } = await env.DB.prepare(
      'SELECT updated_at FROM transactions WHERE id IN (?, ?, ?)',
    )
      .bind(...ids)
      .all<{ updated_at: string }>()
    expect(results).toHaveLength(3)
    for (const { updated_at } of results) {
      expect(updated_at).not.toBe('2000-01-01T00:00:00Z')
    }
  })

  it('depois de desfazer, pagar a mesma fatura de novo funciona', async () => {
    const { card, conta, ids } = await cenarioDeFatura('pagar de novo')
    const primeiro = await pagarAgosto(card, conta)
    await undoBillPayment(env.DB, primeiro.transfer_id)

    const segundo = await pagarAgosto(card, conta)
    expect(segundo.transfer_id).not.toBe(primeiro.transfer_id)
    expect(segundo.amount_cents).toBe(25000)
    expect(segundo.settled_count).toBe(3)
    expect(await linhasRegistradas(segundo.transfer_id)).toEqual(
      [...ids].sort(),
    )

    const saldos = await accountBalances(env.DB)
    const saldo = (id: string) =>
      saldos.find((s) => s.account_id === id)?.balance_cents
    expect(saldo(card.id)).toBe(0)
    expect(saldo(conta.id)).toBe(475000)
  })

  it('desfazer UM pagamento não mexe nos outros: outra fatura do mesmo cartão e a de outro cartão seguem pagas e registradas', async () => {
    // Com um pagamento só na base, um desfazer que reabrisse as linhas de
    // TODOS os pagamentos (subquery sem o transfer_id) ou apagasse o registro
    // de todos passaria em todos os testes acima. Aqui há três registrados ao
    // mesmo tempo: julho e agosto no mesmo cartão, agosto em outro cartão.
    const card = await cartao('Cartao tres pagamentos', 25)
    const outro = await cartao('Outro cartao tres pagamentos', 25)
    const conta = await contaCorrente('Corrente tres pagamentos', 500000)
    const compra = (
      account_id: string,
      cents: number,
      purchase_date: string,
      description: string,
    ) =>
      createTransaction(env.DB, {
        account_id,
        amount_cents: -cents,
        purchase_date,
        description,
      })
    const deJulho = await compra(card.id, 3000, '2026-07-10', 'Livraria')
    const deAgosto = await compra(card.id, 5000, '2026-07-28', 'Restaurante')
    const doOutro = await compra(outro.id, 7000, '2026-07-28', 'Academia')

    const pagar = (
      card_account_id: string,
      competence: string,
      paid_on: string,
    ) =>
      payBill(env.DB, {
        card_account_id,
        competence,
        paid_on,
        from_account_id: conta.id,
      })
    const pJulho = await pagar(card.id, '2026-07', '2026-08-05')
    const pAgosto = await pagar(card.id, '2026-08', '2026-09-05')
    const pOutro = await pagar(outro.id, '2026-08', '2026-09-05')

    // bill_payment_leg é só das PERNAS: uma compra do cartão pago, registrada
    // num pagamento ou nova, continua 'free' (apagável e editável).
    const nova = await compra(card.id, 900, '2026-09-01', 'Banca')
    for (const id of [deJulho.id, deAgosto.id, nova.id, doOutro.id]) {
      expect((await inspectTransaction(env.DB, id))?.class).toBe('free')
    }

    const registroDosOutros = async () => {
      const ids = [pJulho.transfer_id, pOutro.transfer_id]
      return {
        pagamentos: (
          await env.DB.prepare(
            'SELECT * FROM bill_payments WHERE transfer_id IN (?, ?) ORDER BY transfer_id',
          )
            .bind(...ids)
            .all()
        ).results,
        linhas: (
          await env.DB.prepare(
            'SELECT * FROM bill_payment_lines WHERE transfer_id IN (?, ?) ORDER BY transfer_id, transaction_id',
          )
            .bind(...ids)
            .all()
        ).results,
      }
    }
    const antes = await registroDosOutros()
    expect(antes.pagamentos).toHaveLength(2)
    expect(antes.linhas).toHaveLength(2)

    expect(
      (await undoBillPayment(env.DB, pAgosto.transfer_id))?.unsettled_count,
    ).toBe(1)

    expect(await settledAtDe(deAgosto.id)).toBeNull()
    expect(await settledAtDe(deJulho.id)).toBe('2026-08-05')
    expect(await settledAtDe(doOutro.id)).toBe('2026-09-05')
    expect(await registroDosOutros()).toEqual(antes)
    expect(
      (await listBillPayments(env.DB, card.id)).map((p) => p.transfer_id),
    ).toEqual([pJulho.transfer_id])
    expect(
      (await listBillPayments(env.DB, outro.id)).map((p) => p.transfer_id),
    ).toEqual([pOutro.transfer_id])
    for (const perna of [
      pJulho.out,
      pJulho.inbound,
      pOutro.out,
      pOutro.inbound,
    ]) {
      expect((await inspectTransaction(env.DB, perna.id))?.class).toBe(
        'bill_payment_leg',
      )
    }
  })
})

describe('listBillPayments', () => {
  /** Duas faturas abertas no mesmo cartão: julho (R$ 30) e agosto (R$ 200). */
  async function cartaoComDuasFaturasPagas() {
    const card = await cartao('Cartao historico', 25)
    const corrente = await contaCorrente('Corrente historico', 500000)
    const reserva = await contaCorrente('Reserva historico', 500000)
    for (const [desc, cents, dia] of [
      ['Padaria', 3000, '2026-07-10'],
      ['Mercado', 12000, '2026-07-28'],
      ['Posto', 8000, '2026-08-02'],
    ] as const) {
      await createTransaction(env.DB, {
        account_id: card.id,
        amount_cents: -cents,
        purchase_date: dia,
        description: desc,
      })
    }
    // Agosto é pago PRIMEIRO, com data mais nova: a ordem da lista é a da
    // data do pagamento, não a da gravação.
    const agosto = await payBill(env.DB, {
      card_account_id: card.id,
      competence: '2026-08',
      paid_on: '2026-09-05',
      from_account_id: reserva.id,
    })
    const julho = await payBill(env.DB, {
      card_account_id: card.id,
      competence: '2026-07',
      paid_on: '2026-08-05',
      from_account_id: corrente.id,
    })
    return { card, corrente, reserva, agosto, julho }
  }

  it('lista do pagamento mais recente para o mais antigo, com origem, valor e número de lançamentos', async () => {
    const { card, corrente, reserva, agosto, julho } =
      await cartaoComDuasFaturasPagas()

    // Pagamento de OUTRO cartão nunca aparece.
    const outro = await cartao('Outro cartao historico', 25)
    await createTransaction(env.DB, {
      account_id: outro.id,
      amount_cents: -7700,
      purchase_date: '2026-07-28',
      description: 'Compra do outro',
    })
    await payBill(env.DB, {
      card_account_id: outro.id,
      competence: '2026-08',
      paid_on: '2026-09-10',
      from_account_id: corrente.id,
    })

    expect(await listBillPayments(env.DB, card.id)).toEqual([
      {
        transfer_id: agosto.transfer_id,
        competence: '2026-08',
        paid_on: '2026-09-05',
        amount_cents: 20000,
        line_count: 2,
        from_account_id: reserva.id,
        from_account_name: 'Reserva historico',
      },
      {
        transfer_id: julho.transfer_id,
        competence: '2026-07',
        paid_on: '2026-08-05',
        amount_cents: 3000,
        line_count: 1,
        from_account_id: corrente.id,
        from_account_name: 'Corrente historico',
      },
    ])
  })

  it('no mesmo dia, o pagamento gravado por último vem primeiro', async () => {
    const { card, agosto, julho } = await cartaoComDuasFaturasPagas()
    await env.DB.prepare(
      'UPDATE bill_payments SET paid_on = ?, created_at = ? WHERE transfer_id = ?',
    )
      .bind('2026-09-05', '2026-09-05T09:00:00Z', agosto.transfer_id)
      .run()
    await env.DB.prepare(
      'UPDATE bill_payments SET paid_on = ?, created_at = ? WHERE transfer_id = ?',
    )
      .bind('2026-09-05', '2026-09-05T10:00:00Z', julho.transfer_id)
      .run()

    expect(
      (await listBillPayments(env.DB, card.id)).map((p) => p.transfer_id),
    ).toEqual([julho.transfer_id, agosto.transfer_id])
  })

  it('devolve no máximo os 12 mais recentes', async () => {
    const card = await cartao('Cartao treze faturas', 25)
    const conta = await contaCorrente('Corrente treze faturas', 5000000)
    const competencias: string[] = []
    for (let i = 0; i < 13; i++) {
      const competence = addMonthsToCompetence('2025-01', i)
      competencias.push(competence)
      await createTransaction(env.DB, {
        account_id: card.id,
        amount_cents: -1000 - i,
        purchase_date: `${competence}-10`,
        description: `Compra ${competence}`,
      })
      await payBill(env.DB, {
        card_account_id: card.id,
        competence,
        paid_on: `${addMonthsToCompetence(competence, 1)}-05`,
        from_account_id: conta.id,
      })
    }

    const lista = await listBillPayments(env.DB, card.id)
    expect(lista).toHaveLength(12)
    expect(lista.map((p) => p.competence)).toEqual(
      competencias.slice(1).reverse(),
    )
  })

  it('cartão sem pagamento registrado devolve lista vazia, e o pagamento desfeito sai da lista', async () => {
    const card = await cartao('Cartao sem historico', 25)
    expect(await listBillPayments(env.DB, card.id)).toEqual([])

    const { card: pago, conta } = await cenarioDeFatura('some da lista')
    const res = await pagarAgosto(pago, conta)
    expect(await listBillPayments(env.DB, pago.id)).toHaveLength(1)
    await undoBillPayment(env.DB, res.transfer_id)
    expect(await listBillPayments(env.DB, pago.id)).toEqual([])
  })
})

describe('pernas de pagamento de fatura registrado', () => {
  it('inspectTransaction classifica as duas pernas como bill_payment_leg', async () => {
    const { card, conta } = await cenarioDeFatura('classe')
    const pago = await pagarAgosto(card, conta)
    for (const perna of [pago.out, pago.inbound]) {
      expect((await inspectTransaction(env.DB, perna.id))?.class).toBe(
        'bill_payment_leg',
      )
    }
  })

  it('apagar uma perna é RECUSADO apontando para "Desfazer pagamento" — nada muda', async () => {
    // Era o defeito das duas vozes: o DELETE cascateava as pernas e deixava as
    // compras liquidadas, então o Comprometido dizia "pago" sem o dinheiro ter
    // saído. Agora a única porta é o desfazer, que faz as duas metades.
    const { card, conta, ids } = await cenarioDeFatura('apagar perna')
    const pago = await pagarAgosto(card, conta)

    for (const perna of [pago.out, pago.inbound]) {
      const erro = (await deleteTransaction(env.DB, perna.id).catch(
        (e: Error) => e,
      )) as TransactionHasOwnerError
      expect(erro).toBeInstanceOf(TransactionHasOwnerError)
      expect(erro.code).toBe('bill_payment_leg')
      expect(erro.message).toContain('Desfazer pagamento')
      expect(erro.message).not.toMatch(
        /SQLITE|D1_ERROR|FOREIGN KEY|bill_payment|transfer_id/i,
      )
    }

    expect(
      await contar(
        'SELECT COUNT(*) AS n FROM transactions WHERE transfer_id = ?',
        pago.transfer_id,
      ),
    ).toBe(2)
    for (const id of ids) expect(await settledAtDe(id)).toBe('2026-09-05')
    expect(await contar('SELECT COUNT(*) AS n FROM bill_payments')).toBe(1)
  })

  it('valor/data/conta da perna são recusados citando o desfazer; rótulo continua editável', async () => {
    const { card, conta } = await cenarioDeFatura('editar perna')
    const pago = await pagarAgosto(card, conta)

    const erro = (await updateTransaction(env.DB, pago.out.id, {
      amount_cents: -100,
    }).catch((e: Error) => e)) as TransactionHasOwnerError
    expect(erro).toBeInstanceOf(TransactionHasOwnerError)
    expect(erro.code).toBe('bill_payment_leg')
    expect(erro.message).toContain('Desfazer pagamento')

    const editada = await updateTransaction(env.DB, pago.out.id, {
      description: 'Fatura de agosto',
    })
    expect(editada?.description).toBe('Fatura de agosto')
    expect(editada?.amount_cents).toBe(-25000)
  })

  it('perna de pagamento ANTIGO (sem registro) segue como hoje: transfer_leg, e o DELETE leva as duas', async () => {
    const { card, conta, ids } = await cenarioDeFatura('pagamento antigo')
    const pago = await pagarAgosto(card, conta)
    // Simula um pagamento feito antes da migration 0020: sem registro.
    await env.DB.prepare('DELETE FROM bill_payments WHERE transfer_id = ?')
      .bind(pago.transfer_id)
      .run()

    expect((await inspectTransaction(env.DB, pago.out.id))?.class).toBe(
      'transfer_leg',
    )
    expect(await deleteTransaction(env.DB, pago.out.id)).toBe(true)
    expect(
      await contar(
        'SELECT COUNT(*) AS n FROM transactions WHERE transfer_id = ?',
        pago.transfer_id,
      ),
    ).toBe(0)
    // As compras seguem liquidadas: sem registro, voltá-las é à mão, linha a
    // linha (POST /api/transactions/:id/unsettle).
    for (const id of ids) expect(await settledAtDe(id)).toBe('2026-09-05')
  })

  it('a recusa não promete um botão que não existe: o 13º pagamento fica fora do painel, e a mensagem diz até onde o painel alcança', async () => {
    // O painel lista só os 12 mais recentes (LIMIT 12 de listBillPayments).
    // Do 13º para trás a perna segue recusada e o botão não aparece; uma
    // recusa que mandasse "use Desfazer pagamento no painel" sem dizer isso
    // mandaria o dono procurar o que não está lá.
    const card = await cartao('Cartao treze pernas', 25)
    const conta = await contaCorrente('Corrente treze pernas', 5000000)
    const pagos: Awaited<ReturnType<typeof payBill>>[] = []
    for (let i = 0; i < 13; i++) {
      const competence = addMonthsToCompetence('2025-01', i)
      await createTransaction(env.DB, {
        account_id: card.id,
        amount_cents: -1000 - i,
        purchase_date: `${competence}-10`,
        description: `Compra ${competence}`,
      })
      pagos.push(
        await payBill(env.DB, {
          card_account_id: card.id,
          competence,
          paid_on: `${addMonthsToCompetence(competence, 1)}-05`,
          from_account_id: conta.id,
        }),
      )
    }
    const maisAntigo = pagos[0]
    expect(
      (await listBillPayments(env.DB, card.id)).map((p) => p.transfer_id),
    ).not.toContain(maisAntigo.transfer_id)

    const recusaApagar = (await deleteTransaction(
      env.DB,
      maisAntigo.out.id,
    ).catch((e: Error) => e)) as TransactionHasOwnerError
    const recusaEditar = (await updateTransaction(env.DB, maisAntigo.out.id, {
      amount_cents: -1,
    }).catch((e: Error) => e)) as TransactionHasOwnerError
    for (const erro of [recusaApagar, recusaEditar]) {
      expect(erro).toBeInstanceOf(TransactionHasOwnerError)
      expect(erro.message).toContain('12 pagamentos mais recentes')
      expect(erro.message).toContain('arquivado')
    }

    // O desfazer em si não tem limite: a porta que sobra (POST
    // /api/bills/payments/:transfer_id/undo, ver CLAUDE.md) alcança o 13º.
    expect(
      (await undoBillPayment(env.DB, maisAntigo.transfer_id))?.unsettled_count,
    ).toBe(1)
  })

  it('cartão arquivado sai de Contas, a perna segue recusada, e o desfazer pela função ainda funciona', async () => {
    const { card, conta, ids } = await cenarioDeFatura('arquivado')
    const pago = await pagarAgosto(card, conta)
    expect(await archiveAccount(env.DB, card.id)).toBe(true)
    expect((await listAccounts(env.DB)).map((c) => c.id)).not.toContain(card.id)

    const erro = (await deleteTransaction(env.DB, pago.out.id).catch(
      (e: Error) => e,
    )) as TransactionHasOwnerError
    expect(erro).toBeInstanceOf(TransactionHasOwnerError)
    expect(erro.message).toContain('arquivado')

    expect(
      (await undoBillPayment(env.DB, pago.transfer_id))?.unsettled_count,
    ).toBe(3)
    for (const id of ids) expect(await settledAtDe(id)).toBeNull()
  })
})
