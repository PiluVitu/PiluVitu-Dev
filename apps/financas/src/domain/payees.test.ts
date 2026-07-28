import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPayee, listPayees, normalizeName } from './payees'

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
