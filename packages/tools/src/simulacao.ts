import { splitInstallments, type Cents } from './money'

/**
 * Fatia ⑦, Task 4 (docs/superpowers/specs/2026-07-27-financas-reserva-design.md
 * §6): o confronto entre gastar a reserva à vista e financiar um ativo que
 * deprecia — o pedido literal do dono, motivado pelo caso real de um Polo
 * Track R$96.000 financiado contra uma Pop 110i R$13.000 à vista.
 *
 * Lógica pura, sem React/DOM (packages/tools/CLAUDE.md): só aritmética,
 * nunca conselho. A tela que consome isto mostra o número em meses de
 * sobrevivência — a unidade que o dono escolheu ao chamar a reserva de
 * prioridade absoluta —, o julgamento continua sendo dele.
 */

/**
 * Espelha `FixedCostRange` de `apps/financas/src/domain/reserve.ts`
 * (Worker) — este pacote não importa código do Worker (runtimes/bundles
 * diferentes, mesma razão de `lib/dates.ts`/`lib/commitments.ts` da SPA
 * duplicarem tipo em vez de importar através da fronteira).
 */
export type FixedCostRange = { min: number; max: number }

/** Faixa de meses — mesmo shape de `FixedCostRange`, nome próprio só para
 * deixar a assinatura das funções abaixo autoexplicativa. */
export type MonthsRange = { min: number; max: number }

export type CashPurchaseSimulation = {
  /**
   * Quantos meses de reserva este valor representa, como faixa — mesma
   * inversão de `emergencyStatus` (Worker): dividir pelo custo MÁXIMO dá o
   * menor número (pior cenário, o custo caro "come" o valor mais rápido);
   * dividir pelo MÍNIMO dá o maior.
   */
  monthsConsumed: MonthsRange
  /**
   * A faixa de sobrevivência (`saldo - valor`) dividida pelo custo, mesma
   * fórmula/inversão de `meses` em `emergencyStatus` — só que sobre o
   * saldo DEPOIS da compra. Pode ser negativa: gastar mais do que a
   * reserva tem não é clampado em zero, é informação real (o piso caiu
   * abaixo de zero), e a tela não esconde isso.
   */
  survivalAfter: MonthsRange
}

/**
 * Simula pagar `amountCents` à vista, tirando o valor da reserva.
 *
 * `null` quando não há nenhum custo fixo cadastrado (`fixedCost.max === 0`)
 * — mesmas duas mentiras que `emergencyStatus` já evita: nunca `Infinity`
 * ("imortal"), nunca `0` ("falido"). `fixedCost.min` só é lido quando
 * `fixedCost.max > 0`, e o schema garante que os dois andam juntos
 * (`amount_min_cents > 0` é `CHECK` de toda `recurring_expenses` ativa —
 * não existe custo com `max` positivo e `min` zero).
 */
export function simulateCashPurchase(
  amountCents: Cents,
  saldoCents: Cents,
  fixedCost: FixedCostRange,
): CashPurchaseSimulation | null {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new RangeError(
      `valor da compra precisa ser inteiro positivo em centavos: ${String(amountCents)}`,
    )
  }
  if (!Number.isSafeInteger(saldoCents)) {
    throw new RangeError(
      `saldo da reserva precisa ser inteiro em centavos: ${String(saldoCents)}`,
    )
  }
  if (
    !Number.isSafeInteger(fixedCost.min) ||
    !Number.isSafeInteger(fixedCost.max) ||
    fixedCost.min < 0 ||
    fixedCost.max < fixedCost.min
  ) {
    throw new RangeError(
      `faixa de custo fixo inválida: ${JSON.stringify(fixedCost)}`,
    )
  }
  if (fixedCost.max === 0) return null

  const saldoDepois = saldoCents - amountCents
  return {
    monthsConsumed: {
      min: amountCents / fixedCost.max,
      max: amountCents / fixedCost.min,
    },
    survivalAfter: {
      min: saldoDepois / fixedCost.max,
      max: saldoDepois / fixedCost.min,
    },
  }
}

export type FinancedPurchaseSimulation = {
  /**
   * Cada parcela, centavo a centavo — `splitInstallments` de `./money`
   * (resto nas primeiras), nunca arredondamento próprio. A soma é sempre
   * exatamente `totalCents`.
   */
  installments: Cents[]
  /** A parcela de referência para exibição: a primeira — é a que carrega
   * o centavo de resto quando a divisão não é exata. */
  installmentCents: Cents
  monthsCount: number
  totalCents: Cents
  /**
   * Quanto a parcela representa da renda de referência informada — NUNCA
   * calcule isso contra o líquido com freela (R$5.300 num mês bom): é
   * exatamente o que esconderia o risco que este módulo existe para
   * mostrar (ver CLAUDE.md/apps/financas, "Relatório de comprometido").
   * Arredondado com a MESMA regra de `domain/reports.ts#commitments`
   * (`Math.round((cents*100)/fixedNet)`), pela mesma razão: consistência
   * entre as duas telas que respondem "quanto da minha renda isso come".
   */
  pctOfFixedNet: number
}

/**
 * Simula financiar `totalCents` em `monthsCount` parcelas — quanto entra
 * no Comprometido por mês, por quanto tempo, e que fatia da renda fixa de
 * referência (`fixedNetCents`) aquilo representa.
 */
export function simulateFinancedPurchase(
  totalCents: Cents,
  monthsCount: number,
  fixedNetCents: Cents,
): FinancedPurchaseSimulation {
  // splitInstallments já valida totalCents (inteiro positivo) e monthsCount
  // (inteiro 1..360) e lança RangeError — não duplicar a checagem aqui.
  const installments = splitInstallments(totalCents, monthsCount)

  if (!Number.isSafeInteger(fixedNetCents) || fixedNetCents <= 0) {
    throw new RangeError(
      `renda fixa de referência precisa ser inteiro positivo em centavos: ${String(fixedNetCents)}`,
    )
  }

  const installmentCents = installments[0]
  return {
    installments,
    installmentCents,
    monthsCount,
    totalCents,
    pctOfFixedNet: Math.round((installmentCents * 100) / fixedNetCents),
  }
}
