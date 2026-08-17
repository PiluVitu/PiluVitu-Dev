import type { Regra } from '@piluvitu/tools/regras'
import { describe, expect, it } from 'vitest'
import type { PayeeParaSugestao } from './payee-suggest'
import { explicarRegras, sugerirParaLinha } from './regras-import'

function regra(patch: Partial<Regra> = {}): Regra {
  return {
    id: 'r1',
    name: 'regra',
    match_text: null,
    match_account_id: null,
    match_min_cents: null,
    match_max_cents: null,
    match_direction: null,
    set_category_id: null,
    set_payee_id: null,
    set_is_business: null,
    priority: 100,
    active: 1,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...patch,
  }
}

const PAYEE_UBER: PayeeParaSugestao = {
  id: 'p-uber',
  name: 'Uber',
  norm_name: 'UBER',
  default_category_id: 'cat-do-payee',
}

const CATEGORIAS = [
  { id: 'cat-do-payee' },
  { id: 'cat-da-regra' },
  { id: 'cat-transporte' },
]

const LINHA = { description: 'UBER', amount_cents: -2350 }

function chamar(over: {
  regras?: Regra[]
  payees?: PayeeParaSugestao[]
  categories?: { id: string }[]
  linha?: { description: string; amount_cents: number }
}) {
  return sugerirParaLinha(over.linha ?? LINHA, {
    accountId: 'acc-1',
    payees: over.payees ?? [PAYEE_UBER],
    categories: over.categories ?? CATEGORIAS,
    regras: over.regras ?? [],
  })
}

describe('sugerirParaLinha — precedência', () => {
  it('sem regra nenhuma, o default do favorecido continua valendo', () => {
    const s = chamar({})
    expect(s.payee_id).toBe('p-uber')
    expect(s.category_id).toBe('cat-do-payee')
    expect(s.regras).toEqual([])
  })

  it('⚠️ QUANDO OS DOIS DISCORDAM, A REGRA VENCE', () => {
    // Se o default vencesse, uma regra JAMAIS conseguiria corrigir um
    // favorecido já cadastrado — que é onde o dono mais precisa corrigir.
    const s = chamar({
      regras: [
        regra({
          name: 'Uber → Transporte',
          match_text: 'uber',
          set_category_id: 'cat-da-regra',
        }),
      ],
    })
    expect(s.category_id).toBe('cat-da-regra')
    expect(s.payee_id).toBe('p-uber') // a regra não falou de payee: fica o do match
  })

  it('regra que só mexe em is_business NÃO apaga a categoria do favorecido', () => {
    const s = chamar({
      regras: [regra({ match_text: 'uber', set_is_business: 1 })],
    })
    expect(s.category_id).toBe('cat-do-payee')
    expect(s.is_business).toBe(1)
  })

  it('sem regra de PJ, is_business é 0 — o mesmo default de sempre', () => {
    expect(chamar({}).is_business).toBe(0)
  })

  it('regra que não casa não muda nada', () => {
    const s = chamar({
      regras: [regra({ match_text: 'ifood', set_category_id: 'cat-da-regra' })],
    })
    expect(s.category_id).toBe('cat-do-payee')
    expect(s.regras).toEqual([])
  })

  it('regra troca o favorecido, e NÃO encadeia o default do novo', () => {
    // Encadear seria uma terceira camada com ordem imprevisível. O que a
    // regra diz vale; o que ela não diz fica como estava.
    const outro: PayeeParaSugestao = {
      id: 'p-99',
      name: 'Outro',
      norm_name: 'OUTRO',
      default_category_id: 'cat-transporte',
    }
    const s = chamar({
      payees: [PAYEE_UBER, outro],
      regras: [regra({ match_text: 'uber', set_payee_id: 'p-99' })],
    })
    expect(s.payee_id).toBe('p-99')
    expect(s.category_id).toBe('cat-do-payee')
  })

  it('duas regras em conflito: a de maior priority vence, e as DUAS ficam na trilha', () => {
    const s = chamar({
      linha: { description: 'UBER *EATS', amount_cents: -4500 },
      regras: [
        regra({
          id: 'a',
          name: 'Uber',
          priority: 100,
          match_text: 'uber',
          set_category_id: 'cat-transporte',
        }),
        regra({
          id: 'b',
          name: 'Uber Eats',
          priority: 200,
          match_text: 'uber *eats',
          set_category_id: 'cat-da-regra',
        }),
      ],
    })
    expect(s.category_id).toBe('cat-da-regra')
    expect(s.regras.map((r) => r.name)).toEqual(['Uber', 'Uber Eats'])
  })
})

describe('sugerirParaLinha — a categoria arquivada NÃO volta pelo caminho novo', () => {
  it('categoria da REGRA fora da lista carregada é descartada, não enviada', () => {
    // O defeito corrigido em 6ba822c, agora pelo caminho das regras: sem a
    // checagem, o `<select>` mostraria "Sem categoria" enquanto o estado
    // carregaria o id arquivado, e o envio o mandaria assim mesmo.
    const s = chamar({
      categories: [{ id: 'cat-do-payee' }],
      regras: [regra({ match_text: 'uber', set_category_id: 'cat-arquivada' })],
    })
    expect(s.category_id).toBe('')
    expect(s.sugestaoDescartada).toBe(true)
  })

  it('categoria do FAVORECIDO fora da lista continua sendo descartada', () => {
    const s = chamar({ categories: [{ id: 'cat-da-regra' }] })
    expect(s.category_id).toBe('')
    expect(s.sugestaoDescartada).toBe(true)
  })

  it('favorecido da regra fora da lista carregada também é descartado', () => {
    const s = chamar({
      regras: [regra({ match_text: 'uber', set_payee_id: 'p-fantasma' })],
    })
    expect(s.payee_id).toBe('')
    expect(s.sugestaoDescartada).toBe(true)
  })

  it('nada descartado quando tudo existe', () => {
    expect(chamar({}).sugestaoDescartada).toBe(false)
  })
})

describe('explicarRegras', () => {
  it('sem regra, texto vazio', () => {
    expect(explicarRegras([])).toBe('')
  })

  it('uma regra: nomeia a regra', () => {
    expect(explicarRegras([{ id: 'a', name: 'Uber', campos: [] }])).toBe(
      'Sugerido pela regra "Uber".',
    )
  })

  it('duas regras: mostra a ORDEM e diz que a última vence', () => {
    const texto = explicarRegras([
      { id: 'a', name: 'Uber', campos: [] },
      { id: 'b', name: 'Uber Eats', campos: [] },
    ])
    expect(texto).toContain('Uber → Uber Eats')
    expect(texto).toContain('A última vence')
  })
})
