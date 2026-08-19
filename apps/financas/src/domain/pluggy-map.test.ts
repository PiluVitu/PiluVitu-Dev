/**
 * ⚠️ **NENHUM teste aqui toca a API do Pluggy nem a rede** — o adaptador é
 * função PURA sobre um objeto; a transação de entrada é montada à mão. O único
 * `describe` que usa D1 é o do `bill_competence`, e ele fala com o Miniflare
 * local, nunca com a rede.
 *
 * ⚠️ **Toda asserção de conversão é de VALOR, nunca de presença** — um
 * `expect(linha.amount_cents).toBeDefined()` passaria com o sinal trocado, que
 * É o defeito que este arquivo existe pra impedir.
 */
import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PluggyTransacao } from '../lib/pluggy'
import { importTransactions } from './import'
import {
  MOEDA_SUPORTADA,
  STATUS_IMPORTAVEL,
  TIPO_ENTRADA,
  TIPO_SAIDA,
  mapearTransacao,
  mapearTransacoes,
} from './pluggy-map'

/** Transação POSTED, em BRL, válida — cada teste sobrescreve só o que importa. */
function tx(overrides: Partial<PluggyTransacao> = {}): PluggyTransacao {
  return {
    id: 'a1b2c3d4-0000-4000-8000-000000000001',
    description: 'Padaria do Ze',
    amount: 25.5,
    date: '2026-08-15T14:00:00.000Z',
    type: TIPO_SAIDA,
    status: STATUS_IMPORTAVEL,
    currencyCode: MOEDA_SUPORTADA,
    ...overrides,
  } as PluggyTransacao
}

/** Falha alto se a linha foi rejeitada — evita `if (!r.ok) return` mudo. */
function linhaDe(t: PluggyTransacao) {
  const r = mapearTransacao(t)
  if (!r.ok) throw new Error(`esperava linha, veio rejeição: ${r.motivo}`)
  return r.linha
}

function motivoDe(t: PluggyTransacao): string {
  const r = mapearTransacao(t)
  if (r.ok) throw new Error('esperava rejeição, veio linha')
  return r.motivo
}

// ---------------------------------------------------------------------------
// ① SINAL
// ---------------------------------------------------------------------------

describe('① sinal — type manda, amount só dá magnitude', () => {
  // O caso que mais dói errar: no CARTÃO o Pluggy manda a compra POSITIVA
  // ("positive amounts indicate debits"), e aqui compra é NEGATIVA.
  it('compra no cartão (DEBIT, amount POSITIVO) vira NEGATIVO', () => {
    const linha = linhaDe(tx({ type: TIPO_SAIDA, amount: 189.9 }))
    expect(linha.amount_cents).toBe(-18990)
  })

  it('estorno no cartão (CREDIT, amount NEGATIVO) vira POSITIVO', () => {
    const linha = linhaDe(tx({ type: TIPO_ENTRADA, amount: -50.25 }))
    expect(linha.amount_cents).toBe(5025)
  })

  // Conta corrente: o Pluggy já manda despesa negativa. Se o mapeador
  // "invertesse o sinal" (a leitura óbvia da doc), ESTE caso quebraria — é o
  // controle que prova que a regra não é uma inversão cega.
  it('despesa na conta corrente (DEBIT, amount NEGATIVO) continua NEGATIVA', () => {
    const linha = linhaDe(tx({ type: TIPO_SAIDA, amount: -100 }))
    expect(linha.amount_cents).toBe(-10000)
  })

  it('entrada na conta corrente (CREDIT, amount POSITIVO) fica POSITIVA', () => {
    const linha = linhaDe(tx({ type: TIPO_ENTRADA, amount: 4300 }))
    expect(linha.amount_cents).toBe(430000)
  })

  // As duas linhas abaixo têm o MESMO amount (+100) e saem com sinais
  // OPOSTOS: a prova mecânica de que quem decide é o `type`, não o sinal.
  it('mesmo amount, types opostos ⇒ sinais opostos', () => {
    expect(linhaDe(tx({ type: TIPO_SAIDA, amount: 100 })).amount_cents).toBe(
      -10000,
    )
    expect(linhaDe(tx({ type: TIPO_ENTRADA, amount: 100 })).amount_cents).toBe(
      10000,
    )
  })

  it('type ausente REJEITA — não chuta pelo sinal', () => {
    expect(motivoDe(tx({ type: undefined }))).toMatch(/type ausente/)
  })

  it('type desconhecido REJEITA', () => {
    expect(motivoDe(tx({ type: 'TRANSFER' }))).toMatch(/type TRANSFER/)
  })
})

// ---------------------------------------------------------------------------
// ② FLOAT → INTEIRO
// ---------------------------------------------------------------------------

describe('② float → centavos inteiros', () => {
  it('0.1 + 0.2 (o clássico do IEEE754) vira 30 centavos', () => {
    // 0.30000000000000004 * 100 === 30.000000000000004
    const linha = linhaDe(tx({ type: TIPO_ENTRADA, amount: 0.1 + 0.2 }))
    expect(linha.amount_cents).toBe(30)
  })

  it('19.99 vira 1999, não 1998', () => {
    // 19.99 * 100 === 1998.9999999999998 — truncar perderia 1 centavo por linha
    const linha = linhaDe(tx({ type: TIPO_ENTRADA, amount: 19.99 }))
    expect(linha.amount_cents).toBe(1999)
  })

  it('8.615 (3 casas) arredonda pra cima: 862', () => {
    expect(
      linhaDe(tx({ type: TIPO_ENTRADA, amount: 8.615 })).amount_cents,
    ).toBe(862)
  })

  // Comportamento MEDIDO e documentado, não escondido: 1.005 não é
  // representável e o float real é levemente MENOR que 1.005.
  it('1.005 sai 100 (limitação de float documentada, não bug silencioso)', () => {
    expect(
      linhaDe(tx({ type: TIPO_ENTRADA, amount: 1.005 })).amount_cents,
    ).toBe(100)
  })

  it('negativo arredonda pela MAGNITUDE (simétrico ao positivo)', () => {
    // Math.round(-0.5) === -0 mas Math.round(0.5) === 1: arredondar o valor
    // com sinal faria meio centavo cair pra lados diferentes conforme a
    // direção. Aqui os dois saem com a mesma magnitude.
    const saida = linhaDe(tx({ type: TIPO_SAIDA, amount: -0.005 }))
    const entrada = linhaDe(tx({ type: TIPO_ENTRADA, amount: 0.005 }))
    expect(Math.abs(saida.amount_cents)).toBe(Math.abs(entrada.amount_cents))
    expect(entrada.amount_cents).toBe(1)
    expect(saida.amount_cents).toBe(-1)
  })

  it('amount que arredonda pra ZERO é rejeitado (CHECK amount_cents <> 0)', () => {
    expect(motivoDe(tx({ amount: 0 }))).toMatch(/zero/)
    expect(motivoDe(tx({ amount: 0.001 }))).toMatch(/zero/)
  })

  it('amount não numérico ou não finito é rejeitado', () => {
    expect(motivoDe(tx({ amount: undefined as unknown as number }))).toMatch(
      /amount ausente/,
    )
    expect(motivoDe(tx({ amount: Number.NaN }))).toMatch(/fora de faixa/)
    expect(motivoDe(tx({ amount: Number.POSITIVE_INFINITY }))).toMatch(
      /fora de faixa/,
    )
  })

  it('valores grandes seguem exatos em centavos', () => {
    expect(linhaDe(tx({ type: TIPO_SAIDA, amount: 96000 })).amount_cents).toBe(
      -9600000,
    )
  })
})

// ---------------------------------------------------------------------------
// ③ DATA UTC → GMT-3
// ---------------------------------------------------------------------------

describe('③ data UTC → dia local de Teresina', () => {
  // A borda que o brief exige: 23h30 UTC é 20h30 do MESMO dia em Teresina.
  it('23h30 UTC do dia 15 continua sendo dia 15 (20h30 local)', () => {
    const linha = linhaDe(tx({ date: '2026-08-15T23:30:00.000Z' }))
    expect(linha.purchase_date).toBe('2026-08-15')
  })

  // E a borda que de fato vira o dia: 01h UTC do dia 16 é 22h do dia 15.
  it('01h UTC do dia 16 vira dia 15 (22h local do dia anterior)', () => {
    const linha = linhaDe(tx({ date: '2026-08-16T01:00:00.000Z' }))
    expect(linha.purchase_date).toBe('2026-08-15')
  })

  it('02h59 UTC ainda é o dia anterior; 03h00 UTC já é o dia', () => {
    expect(
      linhaDe(tx({ date: '2026-08-16T02:59:00.000Z' })).purchase_date,
    ).toBe('2026-08-15')
    expect(
      linhaDe(tx({ date: '2026-08-16T03:00:00.000Z' })).purchase_date,
    ).toBe('2026-08-16')
  })

  // A armadilha na direção OPOSTA: data SEM hora já é local. Converter
  // empurraria pro dia anterior — o mesmo bug, espelhado.
  it('data SEM hora passa direto (converter empurraria pro dia anterior)', () => {
    expect(linhaDe(tx({ date: '2026-08-15' })).purchase_date).toBe('2026-08-15')
  })

  it('data sem hora no dia 1 do mês NÃO retrocede pro mês anterior', () => {
    expect(linhaDe(tx({ date: '2026-08-01' })).purchase_date).toBe('2026-08-01')
  })

  it('date inválida ou ausente é rejeitada', () => {
    expect(motivoDe(tx({ date: '' }))).toMatch(/date inválida/)
    expect(motivoDe(tx({ date: '2026-02-30' }))).toMatch(/date inválida/)
    expect(motivoDe(tx({ date: 'ontem' }))).toMatch(/date inválida/)
  })
})

// ---------------------------------------------------------------------------
// ③b O EFEITO no bill_competence — contra o D1 real, não argumentado
// ---------------------------------------------------------------------------

describe('③b bill_competence: o efeito da data no campo NÃO patchável', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM transactions'),
      env.DB.prepare('DELETE FROM accounts'),
    ])
    await env.DB.prepare(
      `INSERT INTO accounts (id, name, scope, kind, institution, currency, closing_day, due_day,
         credit_limit_cents, opening_balance_cents, opening_date, archived_at, created_at, updated_at)
       VALUES ('cartao', 'Nubank cartao', 'PF', 'credit_card', 'Nubank', 'BRL', 15, 25, NULL, 0,
         NULL, NULL, '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')`,
    ).run()
  })

  // Cartão que FECHA DIA 15. Uma compra às 22h do dia 15 (01h UTC do dia 16)
  // é do dia 15 => fatura de AGOSTO. Cortar slice(0,10) do UTC daria dia 16
  // => fatura de SETEMBRO, uma fatura inteira à frente, e bill_competence
  // NÃO é patchável depois.
  it('compra às 22h do dia do fechamento cai na fatura do mês, não na seguinte', async () => {
    const { linhas, rejeitadas } = mapearTransacoes([
      tx({ id: 'uuid-borda', date: '2026-08-16T01:00:00.000Z', amount: 100 }),
    ])
    expect(rejeitadas).toEqual([])
    expect(linhas[0].purchase_date).toBe('2026-08-15')

    const r = await importTransactions(env.DB, {
      account_id: 'cartao',
      import_source: 'pluggy',
      rows: linhas,
    })
    expect(r.imported).toBe(1)

    const row = await env.DB.prepare(
      'SELECT purchase_date, bill_competence, amount_cents FROM transactions WHERE imported_id = ?',
    )
      .bind('uuid-borda')
      .first<{
        purchase_date: string
        bill_competence: string
        amount_cents: number
      }>()

    expect(row?.purchase_date).toBe('2026-08-15')
    // O valor que importa: 2026-08, NUNCA 2026-09.
    expect(row?.bill_competence).toBe('2026-08')
    // E o sinal chegou ao banco invertido em relação ao fio (compra no cartão
    // vem positiva do Pluggy).
    expect(row?.amount_cents).toBe(-10000)
  })

  it('compra no dia SEGUINTE ao fechamento cai na fatura seguinte (controle)', async () => {
    const { linhas } = mapearTransacoes([
      tx({ id: 'uuid-depois', date: '2026-08-16T14:00:00.000Z', amount: 100 }),
    ])
    expect(linhas[0].purchase_date).toBe('2026-08-16')

    await importTransactions(env.DB, {
      account_id: 'cartao',
      import_source: 'pluggy',
      rows: linhas,
    })

    const row = await env.DB.prepare(
      'SELECT bill_competence FROM transactions WHERE imported_id = ?',
    )
      .bind('uuid-depois')
      .first<{ bill_competence: string }>()
    expect(row?.bill_competence).toBe('2026-09')
  })
})

// ---------------------------------------------------------------------------
// ④ STATUS
// ---------------------------------------------------------------------------

describe('④ status — só POSTED entra, e o resto é REPORTADO', () => {
  it('POSTED vira linha', () => {
    expect(mapearTransacao(tx({ status: 'POSTED' })).ok).toBe(true)
  })

  it('PENDING é rejeitada, e o motivo explica a fatura aberta', () => {
    const motivo = motivoDe(tx({ status: 'PENDING' }))
    expect(motivo).toMatch(/PENDING/)
    // A parte que evita o pior desfecho: o dono achar que sincronizou o mês
    // e não ver a fatura aberta, sem nenhuma explicação.
    expect(motivo).toMatch(/fatura ainda aberta/i)
  })

  it('status ausente ou desconhecido é rejeitado (nunca aceito por omissão)', () => {
    expect(motivoDe(tx({ status: undefined }))).toMatch(/status ausente/)
    expect(motivoDe(tx({ status: 'CANCELLED' }))).toMatch(/status CANCELLED/)
  })

  // Pendente NÃO some: vai pra `rejeitadas` com índice e id, pra tela contar.
  it('pendentes ficam CONTÁVEIS em rejeitadas, não descartadas', () => {
    const r = mapearTransacoes([
      tx({ id: 'ok-1', status: 'POSTED' }),
      tx({ id: 'pend-1', status: 'PENDING' }),
      tx({ id: 'pend-2', status: 'PENDING' }),
    ])
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].imported_id).toBe('ok-1')
    expect(r.rejeitadas.map((x) => x.id)).toEqual(['pend-1', 'pend-2'])
    expect(r.rejeitadas.map((x) => x.index)).toEqual([1, 2])
  })
})

// ---------------------------------------------------------------------------
// ⑤ imported_id  /  ⑥ mapeamento campo a campo
// ---------------------------------------------------------------------------

describe('⑤ imported_id é o UUID do Pluggy', () => {
  it('vai cru pro imported_id', () => {
    const linha = linhaDe(tx({ id: 'a1b2c3d4-0000-4000-8000-00000000dead' }))
    expect(linha.imported_id).toBe('a1b2c3d4-0000-4000-8000-00000000dead')
  })

  it('transação sem id é rejeitada — não há com que deduplicar', () => {
    expect(motivoDe(tx({ id: '' }))).toMatch(/sem id/)
    expect(motivoDe(tx({ id: '   ' }))).toMatch(/sem id/)
  })
})

describe('⑥ mapeamento campo a campo', () => {
  it('a linha tem EXATAMENTE as 4 chaves de LinhaImportada', () => {
    // O que não tem correspondente (payee_id, category_id, is_business) fica
    // FORA — as regras de categorização resolvem depois. Se alguém inventar
    // um palpite aqui, esta asserção cai.
    expect(Object.keys(linhaDe(tx())).sort()).toEqual([
      'amount_cents',
      'description',
      'imported_id',
      'purchase_date',
    ])
  })

  it('description é aparada; vazia é rejeitada', () => {
    expect(linhaDe(tx({ description: '  Posto Ipiranga  ' })).description).toBe(
      'Posto Ipiranga',
    )
    expect(motivoDe(tx({ description: '   ' }))).toMatch(/description vazia/)
  })

  it('moeda diferente de BRL é rejeitada, nunca achatada como real', () => {
    // amount_original_cents/fx_rate_ppm não existem em LinhaImportada e
    // importTransactions grava 'BRL' fixo: aceitar gravaria dólar como real.
    const motivo = motivoDe(tx({ currencyCode: 'USD' }))
    expect(motivo).toMatch(/USD/)
    expect(motivo).toMatch(/BRL/)
  })

  it('currencyCode ausente é tratado como BRL', () => {
    expect(mapearTransacao(tx({ currencyCode: undefined })).ok).toBe(true)
  })

  it('mapearTransacoes preserva a ordem e não perde nenhuma transação', () => {
    const entrada = [
      tx({ id: 'a', amount: 10, type: TIPO_SAIDA }),
      tx({ id: 'b', status: 'PENDING' }),
      tx({ id: 'c', amount: 20, type: TIPO_ENTRADA }),
    ]
    const r = mapearTransacoes(entrada)
    expect(r.linhas.length + r.rejeitadas.length).toBe(entrada.length)
    expect(r.linhas.map((l) => l.imported_id)).toEqual(['a', 'c'])
    expect(r.linhas.map((l) => l.amount_cents)).toEqual([-1000, 2000])
  })

  it('lista vazia devolve resultado vazio, sem lançar', () => {
    expect(mapearTransacoes([])).toEqual({ linhas: [], rejeitadas: [] })
  })
})
