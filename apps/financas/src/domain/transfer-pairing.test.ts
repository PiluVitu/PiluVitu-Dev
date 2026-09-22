import { env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { createAccount } from './accounts'
import { createTransaction } from './transactions'
import { byCategory } from './reports'
import {
  contraparteEhPropria,
  getNomesProprios,
  parearTransferencias,
  setNomesProprios,
} from './transfer-pairing'

const db = env.DB

const NOMES = ['Paulo Victor Torres Silva', 'Pilu Tech']

async function conta(name: string, scope: 'PJ' | 'PF') {
  return createAccount(db, { name, scope, kind: 'checking' })
}

async function lancamento(
  account_id: string,
  amount_cents: number,
  description: string,
  purchase_date = '2026-09-02',
) {
  return createTransaction(db, {
    account_id,
    amount_cents,
    purchase_date,
    description,
  })
}

describe('contraparteEhPropria', () => {
  it('reconhece o nome proprio no fim da descricao do Pix', () => {
    expect(
      contraparteEhPropria('Pix enviado  - Paulo Victor Torres Silva', NOMES),
    ).toBe(true)
  })

  it('reconhece a razao social da PJ', () => {
    expect(contraparteEhPropria('Pix recebido - Pilu Tech', NOMES)).toBe(true)
  })

  it('ignora acento e caixa', () => {
    expect(
      contraparteEhPropria(
        'Transferencia enviada|PAULO VICTOR TORRES SILVA',
        NOMES,
      ),
    ).toBe(true)
  })

  // O caso que MOTIVA a regra existir: sem ela, o par de R$ 50 de 2026-06-25
  // (Nubank -> Inter) seria casado por valor+data e esconderia uma despesa real.
  it('recusa contraparte de terceiro', () => {
    expect(
      contraparteEhPropria('Pix recebido - Livia R P Oliveira', NOMES),
    ).toBe(false)
  })

  it('sem nomes cadastrados nao reconhece ninguem', () => {
    expect(
      contraparteEhPropria('Pix enviado - Paulo Victor Torres Silva', []),
    ).toBe(false)
  })
})

describe('nomes proprios (settings)', () => {
  it('devolve lista vazia quando nunca foi configurado', async () => {
    expect(await getNomesProprios(db)).toEqual([])
  })

  it('persiste e devolve os nomes gravados', async () => {
    await setNomesProprios(db, NOMES)
    expect(await getNomesProprios(db)).toEqual(NOMES)
  })

  it('descarta nome vazio ou so espaco', async () => {
    await setNomesProprios(db, ['  ', 'Pilu Tech', ''])
    expect(await getNomesProprios(db)).toEqual(['Pilu Tech'])
  })
})

describe('parearTransferencias', () => {
  beforeEach(async () => {
    await setNomesProprios(db, NOMES)
  })

  it('pareia saida e entrada de mesmo valor e data em contas diferentes', async () => {
    const pj = await conta('Inter Empresa', 'PJ')
    const pf = await conta('Inter', 'PF')
    const saida = await lancamento(
      pj.id,
      -430000,
      'Pix enviado  - Paulo Victor Torres Silva',
    )
    const entrada = await lancamento(pf.id, 430000, 'Pix recebido - Pilu Tech')

    const r = await parearTransferencias(db)

    expect(r.pares).toHaveLength(1)
    expect(r.pares[0].saida_id).toBe(saida.id)
    expect(r.pares[0].entrada_id).toBe(entrada.id)
    expect(r.pares[0].amount_cents).toBe(430000)

    const rows = await db
      .prepare('SELECT id, transfer_id FROM transactions WHERE id IN (?, ?)')
      .bind(saida.id, entrada.id)
      .all<{ id: string; transfer_id: string | null }>()
    const ids = rows.results.map((x) => x.transfer_id)
    expect(ids[0]).not.toBeNull()
    expect(ids[0]).toBe(ids[1])
  })

  // A REGRESSAO QUE ORIGINOU ESTE MODULO: com as duas pernas pareadas,
  // byCategory (que alimenta o KPI "Gasto em <mes>") para de contar a saida.
  it('tira a transferencia do total de gasto do mes', async () => {
    const pj = await conta('Inter Empresa', 'PJ')
    const pf = await conta('Inter', 'PF')
    await lancamento(pj.id, -430000, 'Pix enviado  - Paulo Victor Torres Silva')
    await lancamento(pf.id, 430000, 'Pix recebido - Pilu Tech')
    await lancamento(pf.id, -12345, 'Mercado')

    const antes = await byCategory(db, { competence: '2026-09' })
    expect(Math.abs(antes.total_cents)).toBe(430000 + 12345)

    await parearTransferencias(db)

    const depois = await byCategory(db, { competence: '2026-09' })
    expect(Math.abs(depois.total_cents)).toBe(12345)
  })

  it('NAO pareia quando a contraparte da entrada e de terceiro', async () => {
    const a = await conta('Nubank', 'PF')
    const b = await conta('Inter', 'PF')
    await lancamento(
      a.id,
      -5000,
      'Transferencia enviada|Paulo Victor Torres Silva',
      '2026-06-25',
    )
    await lancamento(
      b.id,
      5000,
      'Pix recebido - Livia R P Oliveira',
      '2026-06-25',
    )

    const r = await parearTransferencias(db)

    expect(r.pares).toHaveLength(0)
  })

  it('NAO pareia duas linhas da mesma conta', async () => {
    const a = await conta('Inter', 'PF')
    await lancamento(a.id, -5000, 'Pix enviado - Paulo Victor Torres Silva')
    await lancamento(a.id, 5000, 'Pix recebido - Pilu Tech')

    const r = await parearTransferencias(db)

    expect(r.pares).toHaveLength(0)
  })

  it('sem nomes cadastrados nao pareia nada (fail closed)', async () => {
    await setNomesProprios(db, [])
    const pj = await conta('Inter Empresa', 'PJ')
    const pf = await conta('Inter', 'PF')
    await lancamento(pj.id, -430000, 'Pix enviado  - Paulo Victor Torres Silva')
    await lancamento(pf.id, 430000, 'Pix recebido - Pilu Tech')

    const r = await parearTransferencias(db)

    expect(r.pares).toHaveLength(0)
  })

  it('com 2 saidas e 1 entrada pareia so um par', async () => {
    const pj = await conta('Inter Empresa', 'PJ')
    const pf = await conta('Inter', 'PF')
    await lancamento(pj.id, -430000, 'Pix enviado - Paulo Victor Torres Silva')
    await lancamento(pj.id, -430000, 'Pix enviado - Pilu Tech')
    await lancamento(pf.id, 430000, 'Pix recebido - Pilu Tech')

    const r = await parearTransferencias(db)

    expect(r.pares).toHaveLength(1)
  })

  it('e idempotente: rodar de novo nao cria par novo', async () => {
    const pj = await conta('Inter Empresa', 'PJ')
    const pf = await conta('Inter', 'PF')
    await lancamento(pj.id, -430000, 'Pix enviado - Paulo Victor Torres Silva')
    await lancamento(pf.id, 430000, 'Pix recebido - Pilu Tech')

    expect((await parearTransferencias(db)).pares).toHaveLength(1)
    expect((await parearTransferencias(db)).pares).toHaveLength(0)
  })

  it('dry_run encontra o par sem gravar transfer_id', async () => {
    const pj = await conta('Inter Empresa', 'PJ')
    const pf = await conta('Inter', 'PF')
    const saida = await lancamento(
      pj.id,
      -430000,
      'Pix enviado - Paulo Victor Torres Silva',
    )
    await lancamento(pf.id, 430000, 'Pix recebido - Pilu Tech')

    const r = await parearTransferencias(db, { dry_run: true })

    expect(r.pares).toHaveLength(1)
    const row = await db
      .prepare('SELECT transfer_id FROM transactions WHERE id = ?')
      .bind(saida.id)
      .first<{ transfer_id: string | null }>()
    expect(row?.transfer_id).toBeNull()
  })

  it('respeita a janela de datas', async () => {
    const pj = await conta('Inter Empresa', 'PJ')
    const pf = await conta('Inter', 'PF')
    await lancamento(
      pj.id,
      -430000,
      'Pix enviado - Paulo Victor Torres Silva',
      '2026-03-02',
    )
    await lancamento(pf.id, 430000, 'Pix recebido - Pilu Tech', '2026-03-02')

    const fora = await parearTransferencias(db, {
      from: '2026-09-01',
      to: '2026-10-01',
    })
    expect(fora.pares).toHaveLength(0)

    const dentro = await parearTransferencias(db, {
      from: '2026-03-01',
      to: '2026-04-01',
    })
    expect(dentro.pares).toHaveLength(1)
  })
})
