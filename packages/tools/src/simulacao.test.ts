import { sumCents } from './money'
import {
  simulateCashPurchase,
  simulateFinancedPurchase,
  type FixedCostRange,
} from './simulacao'

// Faixa de custo fixo ilustrativa (não é a do dono real, que não foi dada
// neste brief) — números redondos de propósito, só para deixar as contas
// verificáveis de cabeça. A faixa em si (min !== max) é o que importa: o
// mesmo formato de "Starlink fixo + DAS 12-600" que o resto do módulo usa.
const CUSTO_FIXO: FixedCostRange = { min: 20000, max: 80000 } // R$200 a R$800
const SALDO_RESERVA = 5000000 // R$50.000

// Os dois valores REAIS do caso do dono (Polo Track financiado x Pop 110i à
// vista) — brief: "Casos reais como teste: 13.000 à vista e 96.000 em 72x".
const POP_A_VISTA_CENTS = 1300000 // R$13.000,00
const POLO_FINANCIADO_CENTS = 9600000 // R$96.000,00
const POLO_PARCELAS = 72

describe('simulateCashPurchase — à vista (Pop 110i, R$13.000)', () => {
  it('meses consumidos: faixa que INVERTE em relação ao custo (custo alto ⇒ menos meses)', () => {
    const sim = simulateCashPurchase(
      POP_A_VISTA_CENTS,
      SALDO_RESERVA,
      CUSTO_FIXO,
    )
    expect(sim).not.toBeNull()
    // 1.300.000 / 80.000 (custo MÁXIMO) = 16,25 — o menor número de meses
    // que esse valor representa (pior cenário: custo caro come mais rápido)
    // 1.300.000 / 20.000 (custo MÍNIMO) = 65 — o maior
    expect(sim!.monthsConsumed).toEqual({ min: 16.25, max: 65 })
  })

  it('sobrevivência resultante: (saldo - valor) dividido pela mesma faixa, mesma inversão', () => {
    const sim = simulateCashPurchase(
      POP_A_VISTA_CENTS,
      SALDO_RESERVA,
      CUSTO_FIXO,
    )
    // saldo depois de gastar: 5.000.000 - 1.300.000 = 3.700.000
    // min (pior cenário, custo MÁXIMO): 3.700.000 / 80.000 = 46,25
    // max (melhor cenário, custo MÍNIMO): 3.700.000 / 20.000 = 185
    expect(sim!.survivalAfter).toEqual({ min: 46.25, max: 185 })
  })

  it('gastar mais do que o saldo produz sobrevivência NEGATIVA — sem clamp, é só aritmética', () => {
    // A tela não aconselha: um valor que devora a reserva e ainda "deve"
    // meses pra ela é informação real, não algo pra esconder atrás de um
    // piso em zero.
    const amountCents = 6000000 // R$60.000, maior que o saldo de R$50.000
    const sim = simulateCashPurchase(amountCents, SALDO_RESERVA, CUSTO_FIXO)
    // (5.000.000 - 6.000.000) = -1.000.000
    // min: -1.000.000 / 80.000 = -12,5 · max: -1.000.000 / 20.000 = -50
    expect(sim!.survivalAfter).toEqual({ min: -12.5, max: -50 })
  })

  it('sem NENHUM custo fixo cadastrado (max === 0) ⇒ null — nunca Infinity, nunca 0', () => {
    // As mesmas duas mentiras que `emergencyStatus` (Worker) já evita,
    // aplicadas aqui: sem base de comparação, "não calculável" é a única
    // resposta honesta.
    const sim = simulateCashPurchase(POP_A_VISTA_CENTS, SALDO_RESERVA, {
      min: 0,
      max: 0,
    })
    expect(sim).toBeNull()
  })

  it('a inversão é a direção correta — trocar os divisores quebraria isto', () => {
    // Faixa bem assimétrica de propósito: uma implementação que dividisse
    // pelo custo errado em cada lado produziria min > max ou os valores
    // exatamente invertidos, não só "um pouco diferente".
    const sim = simulateCashPurchase(100000, 0, { min: 10000, max: 100000 })
    expect(sim!.monthsConsumed).toEqual({ min: 1, max: 10 })
    expect(sim!.monthsConsumed.min).toBeLessThan(sim!.monthsConsumed.max)
  })

  it('rejeita valor de compra não positivo ou não inteiro', () => {
    expect(() => simulateCashPurchase(0, SALDO_RESERVA, CUSTO_FIXO)).toThrow(
      RangeError,
    )
    expect(() => simulateCashPurchase(-100, SALDO_RESERVA, CUSTO_FIXO)).toThrow(
      RangeError,
    )
    expect(() => simulateCashPurchase(10.5, SALDO_RESERVA, CUSTO_FIXO)).toThrow(
      RangeError,
    )
  })

  it('rejeita saldo não inteiro', () => {
    expect(() =>
      simulateCashPurchase(POP_A_VISTA_CENTS, 10.5, CUSTO_FIXO),
    ).toThrow(RangeError)
  })
})

describe('simulateFinancedPurchase — financiado (Polo Track, R$96.000 em 72x)', () => {
  it('a soma das parcelas bate EXATAMENTE com o total — nenhum centavo perdido ou inventado', () => {
    const sim = simulateFinancedPurchase(
      POLO_FINANCIADO_CENTS,
      POLO_PARCELAS,
      360000,
    )
    expect(sim.installments).toHaveLength(POLO_PARCELAS)
    expect(sumCents(sim.installments)).toBe(POLO_FINANCIADO_CENTS)
  })

  it('9.600.000 / 72 não divide exato — o resto vai nas PRIMEIRAS parcelas (splitInstallments)', () => {
    const sim = simulateFinancedPurchase(
      POLO_FINANCIADO_CENTS,
      POLO_PARCELAS,
      360000,
    )
    // base = floor(9.600.000 / 72) = 133.333; resto = 9.600.000 - 133.333*72 = 24
    // as 24 primeiras ganham +1 centavo (133.334), as 48 restantes ficam em 133.333
    expect(sim.installments.slice(0, 24)).toEqual(Array(24).fill(133334))
    expect(sim.installments.slice(24)).toEqual(Array(48).fill(133333))
    expect(sim.installmentCents).toBe(133334)
  })

  it('% da renda fixa de R$3.600 — nunca do líquido com freela (R$5.300)', () => {
    const sim = simulateFinancedPurchase(
      POLO_FINANCIADO_CENTS,
      POLO_PARCELAS,
      360000, // R$3.600 — o piso conservador, nunca os R$5.300 com freela
    )
    // 133.334 * 100 / 360.000 = 37,037...% → arredondado (mesma regra de
    // domain/reports.ts#commitments: Math.round((cents*100)/fixedNet))
    expect(sim.pctOfFixedNet).toBe(37)
  })

  it('o mesmo financiamento contra o líquido COM freela (R$5.300) dá um número menor — prova que o denominador importa', () => {
    const semFreela = simulateFinancedPurchase(
      POLO_FINANCIADO_CENTS,
      POLO_PARCELAS,
      360000,
    )
    const comFreela = simulateFinancedPurchase(
      POLO_FINANCIADO_CENTS,
      POLO_PARCELAS,
      530000,
    )
    expect(comFreela.pctOfFixedNet).toBeLessThan(semFreela.pctOfFixedNet)
    // 133.334 * 100 / 530.000 = 25,157...% → 25
    expect(comFreela.pctOfFixedNet).toBe(25)
  })

  it('expõe o total e a quantidade de parcelas de volta, sem recomputar em quem exibe', () => {
    const sim = simulateFinancedPurchase(
      POLO_FINANCIADO_CENTS,
      POLO_PARCELAS,
      360000,
    )
    expect(sim.totalCents).toBe(POLO_FINANCIADO_CENTS)
    expect(sim.monthsCount).toBe(POLO_PARCELAS)
  })

  it('propaga a validação de splitInstallments (total/parcelas fora do domínio do schema)', () => {
    expect(() => simulateFinancedPurchase(0, 72, 360000)).toThrow(RangeError)
    expect(() => simulateFinancedPurchase(9600000, 0, 360000)).toThrow(
      RangeError,
    )
    expect(() => simulateFinancedPurchase(9600000, 361, 360000)).toThrow(
      RangeError,
    )
  })

  it('rejeita renda fixa de referência não positiva ou não inteira', () => {
    expect(() =>
      simulateFinancedPurchase(POLO_FINANCIADO_CENTS, POLO_PARCELAS, 0),
    ).toThrow(RangeError)
    expect(() =>
      simulateFinancedPurchase(POLO_FINANCIADO_CENTS, POLO_PARCELAS, -1),
    ).toThrow(RangeError)
    expect(() =>
      simulateFinancedPurchase(POLO_FINANCIADO_CENTS, POLO_PARCELAS, 10.5),
    ).toThrow(RangeError)
  })
})
