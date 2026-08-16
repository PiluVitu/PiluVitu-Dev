import { applyD1Migrations, env } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  archiveCategory,
  createCategory,
  listCategories,
  updateCategory,
} from './categories'

// Ids semeados pela migration 0001 — 'Custos da PJ' é RAIZ e mãe de
// DAS/Contador/INSS (0001:486-497). A hierarquia já existe no banco de
// produção; estes testes usam a de verdade, não uma inventada.
const CUSTOS_PJ = '00000000-0000-4000-8000-000000000001'
const DAS = '00000000-0000-4000-8000-000000000002'

beforeEach(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

describe('createCategory', () => {
  it('cria uma categoria raiz — o caso que produção não conseguia fazer', async () => {
    const c = await createCategory(env.DB, { name: 'Mercado', kind: 'expense' })

    expect(c.name).toBe('Mercado')
    expect(c.kind).toBe('expense')
    expect(c.parent_id).toBeNull()
    expect(c.archived_at).toBeNull()

    const row = await env.DB.prepare(
      'SELECT name, kind, parent_id FROM categories WHERE id = ?',
    )
      .bind(c.id)
      .first<{ name: string; kind: string; parent_id: string | null }>()
    expect(row).toEqual({ name: 'Mercado', kind: 'expense', parent_id: null })
  })

  it('nasce com slug NULL — slug é identidade semeada, nunca do cliente', async () => {
    const c = await createCategory(env.DB, {
      name: 'Gasolina',
      kind: 'expense',
    })
    expect(c.slug).toBeNull()

    const row = await env.DB.prepare('SELECT slug FROM categories WHERE id = ?')
      .bind(c.id)
      .first<{ slug: string | null }>()
    expect(row?.slug).toBeNull()

    // Duas categorias novas nascem as duas com slug NULL e NÃO colidem —
    // uq_categories_slug é parcial (WHERE slug IS NOT NULL).
    const outra = await createCategory(env.DB, {
      name: 'Almoço',
      kind: 'expense',
    })
    expect(outra.slug).toBeNull()
  })

  it('cria filha de uma raiz (a hierarquia que já existe no seed)', async () => {
    const filha = await createCategory(env.DB, {
      name: 'Certificado digital',
      kind: 'expense',
      parent_id: CUSTOS_PJ,
      default_scope: 'PJ',
    })
    expect(filha.parent_id).toBe(CUSTOS_PJ)
    expect(filha.default_scope).toBe('PJ')
  })

  it('RECUSA neta: mãe que já é filha criaria um 3º nível', async () => {
    // O CHECK do schema (0001:100) só barra parent_id = id — este caso passa
    // por ele sem reclamar. Quem barra é o TS.
    await expect(
      createCategory(env.DB, {
        name: 'Honorário extra',
        kind: 'expense',
        parent_id: DAS,
      }),
    ).rejects.toThrow(/2 níveis/)

    const { results } = await env.DB.prepare(
      'SELECT id FROM categories WHERE name = ?',
    )
      .bind('Honorário extra')
      .all()
    expect(results).toHaveLength(0)
  })

  it('recusa mãe inexistente', async () => {
    await expect(
      createCategory(env.DB, {
        name: 'X',
        kind: 'expense',
        parent_id: 'nao-existe',
      }),
    ).rejects.toThrow(/não existe/)
  })

  it('recusa mãe arquivada — filha visível sob mãe invisível', async () => {
    const mae = await createCategory(env.DB, { name: 'Lazer', kind: 'expense' })
    expect(await archiveCategory(env.DB, mae.id)).toBe(true)

    await expect(
      createCategory(env.DB, {
        name: 'Cinema',
        kind: 'expense',
        parent_id: mae.id,
      }),
    ).rejects.toThrow(/arquivada/)
  })

  it('recusa name vazio e kind fora do enum', async () => {
    await expect(
      createCategory(env.DB, { name: '   ', kind: 'expense' }),
    ).rejects.toThrow(/name/)
    await expect(
      createCategory(env.DB, {
        name: 'X',
        kind: 'lucro' as unknown as 'expense',
      }),
    ).rejects.toThrow(/kind/)
  })

  it('recusa default_scope fora de PJ/PF', async () => {
    await expect(
      createCategory(env.DB, {
        name: 'X',
        kind: 'expense',
        default_scope: 'PX' as unknown as 'PJ',
      }),
    ).rejects.toThrow(/default_scope/)
  })
})

describe('listCategories', () => {
  it('esconde arquivada e filtra por kind', async () => {
    const c = await createCategory(env.DB, { name: 'Mercado', kind: 'expense' })
    await createCategory(env.DB, { name: 'Freela', kind: 'income' })

    const antes = await listCategories(env.DB)
    expect(antes.map((x) => x.name)).toContain('Mercado')

    await archiveCategory(env.DB, c.id)
    const depois = await listCategories(env.DB)
    expect(depois.map((x) => x.name)).not.toContain('Mercado')

    // includeArchived a traz de volta — prova que ela foi arquivada, não
    // apagada (o histórico continua categorizado).
    const comArquivadas = await listCategories(env.DB, {
      includeArchived: true,
    })
    expect(comArquivadas.map((x) => x.name)).toContain('Mercado')

    const receitas = await listCategories(env.DB, { kind: 'income' })
    expect(receitas.every((x) => x.kind === 'income')).toBe(true)
    expect(receitas.map((x) => x.name)).toContain('Freela')
  })
})

describe('updateCategory', () => {
  it('renomeia e troca default_scope', async () => {
    const c = await createCategory(env.DB, { name: 'Mercado', kind: 'expense' })
    const upd = await updateCategory(env.DB, c.id, {
      name: 'Supermercado',
      default_scope: 'PF',
    })
    expect(upd?.name).toBe('Supermercado')
    expect(upd?.default_scope).toBe('PF')

    const row = await env.DB.prepare(
      'SELECT name, default_scope FROM categories WHERE id = ?',
    )
      .bind(c.id)
      .first<{ name: string; default_scope: string | null }>()
    expect(row).toEqual({ name: 'Supermercado', default_scope: 'PF' })
  })

  it('devolve null pra id inexistente (patch cheio e patch vazio)', async () => {
    expect(await updateCategory(env.DB, 'nao-existe', { name: 'X' })).toBeNull()
    expect(await updateCategory(env.DB, 'nao-existe', {})).toBeNull()
  })

  it('patch vazio devolve a linha atual, sem escrever', async () => {
    const c = await createCategory(env.DB, { name: 'Mercado', kind: 'expense' })
    const igual = await updateCategory(env.DB, c.id, {})
    expect(igual?.name).toBe('Mercado')
  })

  it('promove filha a raiz (parent_id: null)', async () => {
    const filha = await createCategory(env.DB, {
      name: 'Certificado digital',
      kind: 'expense',
      parent_id: CUSTOS_PJ,
    })
    const upd = await updateCategory(env.DB, filha.id, { parent_id: null })
    expect(upd?.parent_id).toBeNull()
  })

  it('RECUSA o ciclo A→B→A', async () => {
    const a = await createCategory(env.DB, { name: 'A', kind: 'expense' })
    const b = await createCategory(env.DB, {
      name: 'B',
      kind: 'expense',
      parent_id: a.id,
    })

    // O CHECK do schema não vê nada de errado aqui: nenhuma das duas linhas
    // aponta pra si mesma. Duas guardas independentes barram: A já é mãe
    // (viraria 3º nível) e B já é filha (não é raiz).
    await expect(
      updateCategory(env.DB, a.id, { parent_id: b.id }),
    ).rejects.toThrow(/3º nível/)

    const row = await env.DB.prepare(
      'SELECT parent_id FROM categories WHERE id = ?',
    )
      .bind(a.id)
      .first<{ parent_id: string | null }>()
    expect(row?.parent_id).toBeNull()
  })

  it('RECUSA ser mãe de si mesma (o que o CHECK barraria — barrado antes, com mensagem)', async () => {
    const a = await createCategory(env.DB, { name: 'A', kind: 'expense' })
    await expect(
      updateCategory(env.DB, a.id, { parent_id: a.id }),
    ).rejects.toThrow(/si mesma/)
  })

  it('RECUSA pendurar numa mãe que já é filha (3 níveis por outra porta)', async () => {
    const solta = await createCategory(env.DB, {
      name: 'Solta',
      kind: 'expense',
    })
    await expect(
      updateCategory(env.DB, solta.id, { parent_id: DAS }),
    ).rejects.toThrow(/2 níveis/)
  })

  it('conta filha ARQUIVADA no guard de profundidade (estrutura, não visibilidade)', async () => {
    const mae = await createCategory(env.DB, { name: 'Mãe', kind: 'expense' })
    const filha = await createCategory(env.DB, {
      name: 'Filha',
      kind: 'expense',
      parent_id: mae.id,
    })
    await archiveCategory(env.DB, filha.id)

    // A filha sumiu da tela, mas continua ocupando o 2º nível na tabela —
    // mover a mãe pra baixo de outra raiz criaria uma neta de verdade.
    await expect(
      updateCategory(env.DB, mae.id, { parent_id: CUSTOS_PJ }),
    ).rejects.toThrow(/3º nível/)
  })
})

describe('archiveCategory', () => {
  it('arquiva, e a segunda vez devolve false (404 na rota)', async () => {
    const c = await createCategory(env.DB, { name: 'Mercado', kind: 'expense' })
    expect(await archiveCategory(env.DB, c.id)).toBe(true)
    expect(await archiveCategory(env.DB, c.id)).toBe(false)
    expect(await archiveCategory(env.DB, 'nao-existe')).toBe(false)
  })

  it('NÃO apaga a linha — só carimba archived_at (o histórico segue categorizado)', async () => {
    const c = await createCategory(env.DB, { name: 'Mercado', kind: 'expense' })
    await archiveCategory(env.DB, c.id)

    const row = await env.DB.prepare(
      'SELECT id, archived_at FROM categories WHERE id = ?',
    )
      .bind(c.id)
      .first<{ id: string; archived_at: string | null }>()
    expect(row?.id).toBe(c.id)
    expect(row?.archived_at).toEqual(expect.any(String))
  })

  it('RECUSA arquivar mãe com filha ATIVA', async () => {
    // 'Custos da PJ' é mãe de DAS/Contador/INSS, todas ativas no seed.
    await expect(archiveCategory(env.DB, CUSTOS_PJ)).rejects.toThrow(
      /filhas primeiro/,
    )

    const row = await env.DB.prepare(
      'SELECT archived_at FROM categories WHERE id = ?',
    )
      .bind(CUSTOS_PJ)
      .first<{ archived_at: string | null }>()
    expect(row?.archived_at).toBeNull()
  })

  it('PERMITE arquivar mãe cujas filhas já estão arquivadas', async () => {
    const mae = await createCategory(env.DB, { name: 'Lazer', kind: 'expense' })
    const filha = await createCategory(env.DB, {
      name: 'Cinema',
      kind: 'expense',
      parent_id: mae.id,
    })

    await expect(archiveCategory(env.DB, mae.id)).rejects.toThrow(
      /filhas primeiro/,
    )
    expect(await archiveCategory(env.DB, filha.id)).toBe(true)
    expect(await archiveCategory(env.DB, mae.id)).toBe(true)
  })
})
