import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPayee, listPayees, normalizeName, updatePayee } from './payees'

describe('normalizeName', () => {
  it('sobe pra caixa alta', () => {
    expect(normalizeName('Pai')).toBe('PAI')
  })

  it('remove acento', () => {
    expect(normalizeName('Padaria Pão de Açúcar')).toBe('PADARIA PAO DE ACUCAR')
  })

  it('colapsa espaco duplo', () => {
    expect(normalizeName('Pai   Jose  ')).toBe('PAI JOSE')
  })

  it('corta sufixo de cidade + UF', () => {
    expect(normalizeName('MERCADO SAO LUIZ  TERESINA PI')).toBe(
      'MERCADO SAO LUIZ',
    )
  })

  it('corta sufixo de maquininha', () => {
    expect(normalizeName('Restaurante Tempero PAGSEGURO')).toBe(
      'RESTAURANTE TEMPERO',
    )
  })

  it('nao corta quando sobraria nome vazio', () => {
    expect(normalizeName('Mercado PI')).toBe('MERCADO')
    expect(normalizeName('PAGSEGURO')).toBe('PAGSEGURO')
  })
})

describe('createPayee / listPayees', () => {
  beforeEach(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
    await env.DB.prepare('DELETE FROM payees').run()
  })

  it('grava norm_name normalizado', async () => {
    const payee = await createPayee(env.DB, {
      name: 'Mercado São Luiz  Teresina PI',
      kind: 'merchant',
    })

    const row = await env.DB.prepare(
      'SELECT name, norm_name, kind, document, default_category_id FROM payees WHERE id = ?',
    )
      .bind(payee.id)
      .first<{
        name: string
        norm_name: string
        kind: string
        document: string | null
        default_category_id: string | null
      }>()

    expect(row?.name).toBe('Mercado São Luiz  Teresina PI')
    expect(row?.norm_name).toBe('MERCADO SAO LUIZ')
    expect(row?.kind).toBe('merchant')
    expect(row?.document).toBeNull()
    expect(row?.default_category_id).toBeNull()
    expect(payee.norm_name).toBe('MERCADO SAO LUIZ')
  })

  it('filtra por kind', async () => {
    await createPayee(env.DB, { name: 'Pai', kind: 'person' })
    await createPayee(env.DB, { name: 'Receita Federal', kind: 'government' })
    await createPayee(env.DB, { name: 'Minha PJ', kind: 'self_entity' })

    const pessoas = await listPayees(env.DB, { kind: 'person' })
    expect(pessoas.map((p) => p.name)).toEqual(['Pai'])

    const todos = await listPayees(env.DB)
    expect(todos).toHaveLength(3)
  })
})

describe('updatePayee', () => {
  // Categoria semeada pela migration 0001 — 'DAS — Simples Nacional'.
  const DAS = '00000000-0000-4000-8000-000000000002'

  it('ENSINA a categoria padrão de um payee já criado (o buraco real)', async () => {
    // DividasPage.tsx posta só { name, kind } — todo payee de produção nasce
    // com default_category_id NULL, e sem PUT ele ficava NULL pra sempre.
    const payee = await createPayee(env.DB, { name: 'Pai', kind: 'person' })
    expect(payee.default_category_id).toBeNull()

    const upd = await updatePayee(env.DB, payee.id, {
      default_category_id: DAS,
    })
    expect(upd?.default_category_id).toBe(DAS)

    const row = await env.DB.prepare(
      'SELECT default_category_id FROM payees WHERE id = ?',
    )
      .bind(payee.id)
      .first<{ default_category_id: string | null }>()
    expect(row?.default_category_id).toBe(DAS)
  })

  it('RECALCULA norm_name ao renomear — é a chave de matching do import', async () => {
    const payee = await createPayee(env.DB, {
      name: 'Mercado São Luiz  Teresina PI',
      kind: 'merchant',
    })
    expect(payee.norm_name).toBe('MERCADO SAO LUIZ')

    const upd = await updatePayee(env.DB, payee.id, {
      name: 'Padaria do Zé PAGSEGURO',
    })
    expect(upd?.name).toBe('Padaria do Zé PAGSEGURO')
    // Sem o recálculo, o payee continuaria casando com 'MERCADO SAO LUIZ' na
    // próxima importação — silenciosamente, com a categoria errada.
    expect(upd?.norm_name).toBe('PADARIA DO ZE')

    const row = await env.DB.prepare(
      'SELECT norm_name FROM payees WHERE id = ?',
    )
      .bind(payee.id)
      .first<{ norm_name: string }>()
    expect(row?.norm_name).toBe('PADARIA DO ZE')
  })

  it('corrige document e aceita voltar campos pra null', async () => {
    const payee = await createPayee(env.DB, {
      name: 'Minha PJ',
      kind: 'self_entity',
      document: '00000000000000',
      default_category_id: DAS,
    })

    const upd = await updatePayee(env.DB, payee.id, {
      document: '11444777000161',
      default_category_id: null,
    })
    expect(upd?.document).toBe('11444777000161')
    expect(upd?.default_category_id).toBeNull()
  })

  it('devolve null pra id inexistente (patch cheio e patch vazio)', async () => {
    expect(await updatePayee(env.DB, 'nao-existe', { name: 'X' })).toBeNull()
    expect(await updatePayee(env.DB, 'nao-existe', {})).toBeNull()
  })

  it('patch vazio devolve a linha atual sem alterar nada', async () => {
    const payee = await createPayee(env.DB, { name: 'Pai', kind: 'person' })
    const igual = await updatePayee(env.DB, payee.id, {})
    expect(igual?.name).toBe('Pai')
    expect(igual?.norm_name).toBe('PAI')
  })

  it('recusa name vazio com RangeError, sem tocar a linha', async () => {
    const payee = await createPayee(env.DB, { name: 'Pai', kind: 'person' })
    await expect(updatePayee(env.DB, payee.id, { name: '  ' })).rejects.toThrow(
      /name/,
    )

    const row = await env.DB.prepare('SELECT name FROM payees WHERE id = ?')
      .bind(payee.id)
      .first<{ name: string }>()
    expect(row?.name).toBe('Pai')
  })
})
