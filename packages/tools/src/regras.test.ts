import {
  aplicarRegras,
  normalizarParaRegra,
  ordenarRegras,
  regraCasa,
  type Regra,
} from './regras'

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

const tx = {
  description: 'UBER   *TRIP SAO PAULO',
  amount_cents: -2350,
  account_id: 'acc-1',
}

describe('normalizarParaRegra', () => {
  it('tira acento e caixa', () => {
    expect(normalizarParaRegra('Farmácia São João')).toBe('FARMACIA SAO JOAO')
  })

  it('colapsa espaço repetido e apara as bordas', () => {
    expect(normalizarParaRegra('  UBER   *TRIP  ')).toBe('UBER *TRIP')
  })
})

describe('regraCasa — cada eixo isolado', () => {
  it('texto casa como SUBSTRING, ignorando caixa e acento', () => {
    expect(regraCasa(regra({ match_text: 'uber' }), tx)).toBe(true)
    expect(
      regraCasa(regra({ match_text: 'pao de acucar' }), {
        ...tx,
        description: 'PÃO DE AÇÚCAR 123',
      }),
    ).toBe(true)
  })

  it('texto que não aparece não casa', () => {
    expect(regraCasa(regra({ match_text: 'ifood' }), tx)).toBe(false)
  })

  it('condição nula é IGNORADA, nunca "casa com nada"', () => {
    // Uma regra só de conta tem que casar com qualquer descrição daquela
    // conta — tratar `match_text: null` como "não casa" faria toda regra
    // parcialmente preenchida virar letra morta, em silêncio.
    expect(regraCasa(regra({ match_account_id: 'acc-1' }), tx)).toBe(true)
  })

  it('conta diferente não casa', () => {
    expect(regraCasa(regra({ match_account_id: 'acc-2' }), tx)).toBe(false)
  })

  it('faixa compara MAGNITUDE, não o valor com sinal', () => {
    // -2350 (despesa). Com o valor cru, `-2350 >= 1000` seria falso e a
    // faixa nunca casaria com despesa nenhuma — que é 100% do caso de uso.
    expect(
      regraCasa(regra({ match_min_cents: 1000, match_max_cents: 5000 }), tx),
    ).toBe(true)
  })

  it('faixa exclui o que está fora, nos dois lados', () => {
    expect(regraCasa(regra({ match_min_cents: 5000 }), tx)).toBe(false)
    expect(regraCasa(regra({ match_max_cents: 1000 }), tx)).toBe(false)
  })

  it('faixa é inclusiva nas bordas', () => {
    expect(
      regraCasa(regra({ match_min_cents: 2350, match_max_cents: 2350 }), tx),
    ).toBe(true)
  })

  it('direção separa saída de entrada', () => {
    expect(regraCasa(regra({ match_direction: 'expense' }), tx)).toBe(true)
    expect(regraCasa(regra({ match_direction: 'income' }), tx)).toBe(false)
    expect(
      regraCasa(regra({ match_direction: 'income' }), {
        ...tx,
        amount_cents: 500000,
      }),
    ).toBe(true)
  })
})

describe('regraCasa — combinação', () => {
  it('todas as condições preenchidas precisam casar (AND, nunca OR)', () => {
    const r = regra({
      match_text: 'uber',
      match_account_id: 'acc-1',
      match_direction: 'expense',
      match_max_cents: 5000,
    })
    expect(regraCasa(r, tx)).toBe(true)
    // Só a conta muda — com OR isto continuaria casando pelo texto.
    expect(regraCasa(r, { ...tx, account_id: 'acc-2' })).toBe(false)
  })

  it('texto que normaliza pra vazio não casa com tudo', () => {
    expect(regraCasa(regra({ match_text: '   ' }), tx)).toBe(false)
  })
})

describe('ordenarRegras', () => {
  it('priority ASC decide primeiro', () => {
    const ordem = ordenarRegras([
      regra({ id: 'b', priority: 200 }),
      regra({ id: 'a', priority: 50 }),
    ]).map((r) => r.id)
    expect(ordem).toEqual(['a', 'b'])
  })

  it('empate de priority desempata por created_at, depois por id', () => {
    // ⚠️ As três partes importam: mesma lição do cursor de 3 colunas do
    // extrato (migration 0008). Duas regras com priority E created_at
    // iguais precisam de uma ordem TOTAL, senão o mesmo conjunto de regras
    // produz categorias diferentes entre execuções.
    const ordem = ordenarRegras([
      regra({ id: 'z', priority: 100, created_at: '2026-08-02T00:00:00Z' }),
      regra({ id: 'm', priority: 100, created_at: '2026-08-01T00:00:00Z' }),
      regra({ id: 'a', priority: 100, created_at: '2026-08-01T00:00:00Z' }),
    ]).map((r) => r.id)
    expect(ordem).toEqual(['a', 'm', 'z'])
  })

  it('não muta o array recebido', () => {
    const entrada = [regra({ id: 'b', priority: 200 }), regra({ id: 'a' })]
    ordenarRegras(entrada)
    expect(entrada.map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('aplicarRegras', () => {
  it('sem regra nenhuma, nada muda e a trilha fica vazia', () => {
    expect(aplicarRegras(tx, [])).toEqual({
      category_id: null,
      payee_id: null,
      is_business: null,
      aplicadas: [],
    })
  })

  it('regra que casa devolve o efeito e a trilha com o nome', () => {
    const r = aplicarRegras(tx, [
      regra({
        id: 'r1',
        name: 'Uber → Transporte',
        match_text: 'uber',
        set_category_id: 'cat-transporte',
      }),
    ])
    expect(r.category_id).toBe('cat-transporte')
    expect(r.aplicadas).toEqual([
      { id: 'r1', name: 'Uber → Transporte', campos: ['category_id'] },
    ])
  })

  it('regra que NÃO casa não entra na trilha nem muda nada', () => {
    const r = aplicarRegras(tx, [
      regra({ match_text: 'ifood', set_category_id: 'cat-comida' }),
    ])
    expect(r.category_id).toBeNull()
    expect(r.aplicadas).toEqual([])
  })

  it('regra pausada (active = 0) nunca aplica', () => {
    const r = aplicarRegras(tx, [
      regra({ active: 0, match_text: 'uber', set_category_id: 'cat-x' }),
    ])
    expect(r.category_id).toBeNull()
    expect(r.aplicadas).toEqual([])
  })

  it('COMPÕE: duas regras que casam contribuem CAMPOS diferentes', () => {
    // O caso que mata "primeira que casa vence": a regra ampla marca PJ, a
    // estreita categoriza. Com first-match-wins o dono perderia uma das
    // duas e teria que repetir `is_business` em cada regra de comércio.
    const r = aplicarRegras(tx, [
      regra({
        id: 'ampla',
        name: 'Cartão PJ',
        priority: 10,
        match_account_id: 'acc-1',
        set_is_business: 1,
      }),
      regra({
        id: 'estreita',
        name: 'Uber',
        priority: 20,
        match_text: 'uber',
        set_category_id: 'cat-transporte',
      }),
    ])
    expect(r.is_business).toBe(1)
    expect(r.category_id).toBe('cat-transporte')
    expect(r.aplicadas.map((a) => a.id)).toEqual(['ampla', 'estreita'])
  })

  it('CONFLITO no mesmo campo: a de MAIOR priority (a última) vence', () => {
    // UBER EATS é comida, não transporte — o dono resolve isso pondo a
    // regra estreita DEPOIS, e o resultado é previsível pela ordem que ele
    // vê na tela, não por uma métrica de especificidade que ele adivinha.
    const eats = {
      ...tx,
      description: 'UBER *EATS PEDIDO 4471',
    }
    const r = aplicarRegras(eats, [
      regra({
        id: 'uber',
        name: 'Uber → Transporte',
        priority: 100,
        match_text: 'uber',
        set_category_id: 'cat-transporte',
      }),
      regra({
        id: 'eats',
        name: 'Uber Eats → Alimentação',
        priority: 200,
        match_text: 'uber *eats',
        set_category_id: 'cat-alimentacao',
      }),
    ])
    expect(r.category_id).toBe('cat-alimentacao')
    // ⚠️ A regra sobrescrita CONTINUA na trilha — é o conflito que o dono
    // precisa ver pra saber que existe uma ordem a reordenar. Omiti-la
    // esconderia justamente o que a trilha existe pra mostrar.
    expect(r.aplicadas.map((a) => a.id)).toEqual(['uber', 'eats'])
  })

  it('inverter a priority inverte o vencedor — a ordem é MESMO o que decide', () => {
    const eats = { ...tx, description: 'UBER *EATS PEDIDO 4471' }
    const r = aplicarRegras(eats, [
      regra({
        id: 'uber',
        priority: 200,
        match_text: 'uber',
        set_category_id: 'cat-transporte',
      }),
      regra({
        id: 'eats',
        priority: 100,
        match_text: 'uber *eats',
        set_category_id: 'cat-alimentacao',
      }),
    ])
    expect(r.category_id).toBe('cat-transporte')
  })

  it('set_is_business = 0 é uma AÇÃO, não "não mexe"', () => {
    // A distinção é o motivo de a coluna ser nullable em vez de NOT NULL
    // DEFAULT 0: `0` marca PF de propósito (sobrescrevendo uma regra ampla
    // de PJ que veio antes), `null` deixa o campo em paz.
    const r = aplicarRegras(tx, [
      regra({
        id: 'a',
        priority: 10,
        match_account_id: 'acc-1',
        set_is_business: 1,
      }),
      regra({ id: 'b', priority: 20, match_text: 'uber', set_is_business: 0 }),
    ])
    expect(r.is_business).toBe(0)
  })

  it('regra sem nenhuma ação não entra na trilha (linha escrita por fora)', () => {
    const r = aplicarRegras(tx, [regra({ match_text: 'uber' })])
    expect(r.aplicadas).toEqual([])
  })
})
