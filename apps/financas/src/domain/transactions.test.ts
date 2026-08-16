import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { accountBalances, createAccount } from './accounts'
import { addDebtItem, createDebt, payDebt } from './debts'
import { createInstallmentPlan } from './installments'
import { createPayee } from './payees'
import { createRecurring } from './recurring'
import {
  createTransaction,
  createTransfer,
  deleteTransaction,
  inspectTransaction,
  listTransactions,
  settleTransaction,
  TransactionHasOwnerError,
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
