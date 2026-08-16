import { describe, expect, it } from 'vitest'
import {
  abaixoDaMeta,
  custoFixoMensal,
  formatMeses,
  mesesDeSobrevivencia,
} from './reserve'
import type { EmergencyStatusView } from './reserve'

describe('formatMeses', () => {
  it('faixa degenerada (min === max) mostra UM número, sem "entre"', () => {
    expect(formatMeses({ min: 3, max: 3 })).toBe('3,0 meses')
  })

  it('faixa aberta mostra "entre min e max meses" — o exemplo literal do spec', () => {
    expect(formatMeses({ min: 2.1, max: 4.8 })).toBe('entre 2,1 e 4,8 meses')
  })

  it('arredonda pra 1 casa decimal, vírgula (pt-BR)', () => {
    // 100000/78900 = 1.267...  100000/20100 = 4.975...
    expect(formatMeses({ min: 100000 / 78900, max: 100000 / 20100 })).toBe(
      'entre 1,3 e 5,0 meses',
    )
  })
})

describe('abaixoDaMeta — o alerta olha o PISO, nunca o teto', () => {
  it('meses: null nunca dispara alerta (nada calculável, não é risco confirmado)', () => {
    expect(abaixoDaMeta(null, 3)).toBe(false)
  })

  // Espelho do teste de limiar do Comprometido, lado invertido: lá o TETO é
  // o perigo (`pct.max > LIMIAR`); aqui o PISO é o perigo. Faixa aberta de
  // propósito (min < max) — uma faixa degenerada passaria mesmo com a
  // comparação invertida por engano, sem provar nada.
  it('piso abaixo da meta e teto acima ⇒ alerta (mesmo cenário da tela real)', () => {
    expect(abaixoDaMeta({ min: 2, max: 5 }, 3)).toBe(true)
  })

  it('piso igual à meta (não estritamente abaixo) ⇒ sem alerta — mesmo ">" não-inclusivo do Comprometido', () => {
    expect(abaixoDaMeta({ min: 3, max: 5 }, 3)).toBe(false)
  })

  it('piso acima da meta ⇒ sem alerta', () => {
    expect(abaixoDaMeta({ min: 4, max: 6 }, 3)).toBe(false)
  })

  // Prova de que é o PISO que decide, não o teto: teto MUITO acima da meta
  // não é o suficiente pra suprimir o alerta se o piso continuar abaixo —
  // uma implementação que checasse o teto por engano (cópia do Comprometido
  // sem inverter o lado) passaria "sem alerta" aqui, errado.
  it('teto bem acima da meta não esconde um piso abaixo dela', () => {
    expect(abaixoDaMeta({ min: 1, max: 50 }, 3)).toBe(true)
  })
})

// ⑥ A referência de `BlocoSaldos` ("R$ 6.778,40 é muito ou pouco?") sai
// destes dois helpers — não existe rota que devolva `monthlyFixedCost()`
// cru, e a conta de meses NÃO pode ser reescrita à mão em cada tela.
describe('custoFixoMensal', () => {
  function status(over: Partial<EmergencyStatusView>): EmergencyStatusView {
    return {
      saldo_cents: 0,
      meta_cents: { min: 0, max: 0 },
      meses: null,
      contas: [],
      goal_months: 3,
      ...over,
    }
  }

  it('recupera o custo EXATO a partir de meta_cents / goal_months', () => {
    // O Worker calcula `meta = custo * goal_months` sem arredondar
    // (domain/reserve.ts) — a volta é exata, não uma estimativa.
    const custo = { min: 20100, max: 78900 }
    const goal_months = 3
    const recuperado = custoFixoMensal(
      status({
        goal_months,
        meta_cents: {
          min: custo.min * goal_months,
          max: custo.max * goal_months,
        },
      }),
    )
    expect(recuperado).toEqual(custo)
  })

  it('sem nenhuma recorrente cadastrada (meta zerada) devolve null — nunca um custo fixo de R$ 0,00', () => {
    // Um zero aqui seria lido pela tela como "custo fixo zero" e faria a
    // sobrevivência virar infinita. Ausência de dado é ausência.
    expect(
      custoFixoMensal(status({ meta_cents: { min: 0, max: 0 } })),
    ).toBeNull()
  })

  it('goal_months inválido (0) devolve null em vez de dividir por zero', () => {
    expect(
      custoFixoMensal(
        status({ goal_months: 0, meta_cents: { min: 100, max: 200 } }),
      ),
    ).toBeNull()
  })
})

describe('mesesDeSobrevivencia', () => {
  it('⚠️ INVERTE em relação ao custo: o custo MÁXIMO produz o piso de meses', () => {
    // Faixa ABERTA de propósito (min !== max) — com uma faixa degenerada
    // trocar os dois divisores daria o mesmo resultado e o teste não
    // provaria nada. Saldo R$ 1.000,00 contra custo R$ 201,00–R$ 789,00.
    const meses = mesesDeSobrevivencia(100000, { min: 20100, max: 78900 })
    expect(meses).not.toBeNull()
    // piso = 100000/78900 = 1,267 (pior cenário, custo caro)
    expect(meses!.min).toBeCloseTo(100000 / 78900, 6)
    // teto = 100000/20100 = 4,975 (melhor cenário, custo barato)
    expect(meses!.max).toBeCloseTo(100000 / 20100, 6)
    // e o piso é MENOR que o teto — a checagem que pega a inversão trocada
    expect(meses!.min).toBeLessThan(meses!.max)
  })

  it('sem custo fixo (null) devolve null — nunca Infinity ("imortal") nem 0 ("falido")', () => {
    const meses = mesesDeSobrevivencia(100000, null)
    expect(meses).toBeNull()
    expect(meses).not.toBe(Infinity)
  })

  it('custo zerado devolve null em vez de dividir por zero', () => {
    expect(mesesDeSobrevivencia(100000, { min: 0, max: 0 })).toBeNull()
  })

  it('saldo zero devolve 0 meses (é um fato, não ausência de dado)', () => {
    expect(mesesDeSobrevivencia(0, { min: 20100, max: 78900 })).toEqual({
      min: 0,
      max: 0,
    })
  })
})
