import { describe, expect, test } from 'vitest'
import {
  addMonthsToCompetence,
  billCompetence,
  competenceDueDate,
  nowIsoUtc,
  todayInTeresina,
} from './dates'

describe('todayInTeresina', () => {
  test('22h do dia 31 em Teresina continua sendo dia 31', () => {
    // 31/07 às 22h em UTC-3 já é 01/08 em UTC — é exatamente aqui que o
    // lançamento pularia de mês se a data saísse de toISOString() cru.
    const agora = new Date('2026-07-31T22:00:00-03:00')
    expect(agora.toISOString().slice(0, 10)).toBe('2026-08-01') // o jeito ERRADO
    expect(todayInTeresina(agora)).toBe('2026-07-31') // o jeito certo
  })

  test('23:59:59 local do dia 31 ainda é dia 31', () => {
    expect(todayInTeresina(new Date('2026-08-01T02:59:59Z'))).toBe('2026-07-31')
  })

  test('00:00 local do dia 1 já é dia 1', () => {
    expect(todayInTeresina(new Date('2026-08-01T03:00:00Z'))).toBe('2026-08-01')
  })

  test('Teresina é UTC-3 fixo: janeiro e julho usam o mesmo offset', () => {
    // Sem horário de verão desde 2019 — janeiro não pode virar UTC-2.
    expect(todayInTeresina(new Date('2027-01-01T02:30:00Z'))).toBe('2026-12-31')
    expect(todayInTeresina(new Date('2026-07-01T02:30:00Z'))).toBe('2026-06-30')
  })

  test('sem argumento devolve YYYY-MM-DD', () => {
    expect(todayInTeresina()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('nowIsoUtc', () => {
  test('devolve UTC com segundos e Z, sem milissegundos', () => {
    expect(nowIsoUtc(new Date('2026-07-25T13:04:05.789Z'))).toBe(
      '2026-07-25T13:04:05Z',
    )
  })

  test('sem argumento devolve YYYY-MM-DDTHH:MM:SSZ', () => {
    expect(nowIsoUtc()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })
})

describe('billCompetence', () => {
  test('compra depois do fechamento cai na fatura do mês seguinte', () => {
    expect(billCompetence('2026-07-28', 25)).toBe('2026-08')
  })

  test('compra antes do fechamento cai na fatura do próprio mês', () => {
    expect(billCompetence('2026-07-20', 25)).toBe('2026-07')
  })

  test('compra no dia exato do fechamento ainda é a fatura do mês', () => {
    expect(billCompetence('2026-07-25', 25)).toBe('2026-07')
  })

  test('vira o ano corretamente', () => {
    expect(billCompetence('2026-12-28', 25)).toBe('2027-01')
  })

  test('fechamento 31 em fevereiro cai para o último dia do mês', () => {
    // Cartão que fecha dia 31 fecha 28/02 em 2026: compra em 28/02 é fatura de fevereiro.
    expect(billCompetence('2026-02-28', 31)).toBe('2026-02')
    expect(billCompetence('2026-03-01', 31)).toBe('2026-03')
  })

  test('fechamento 31 em mês de 30 dias cai para o dia 30', () => {
    expect(billCompetence('2026-04-30', 31)).toBe('2026-04')
    expect(billCompetence('2026-05-01', 31)).toBe('2026-05')
  })

  test('rejeita data e dia de fechamento inválidos', () => {
    expect(() => billCompetence('28/07/2026', 25)).toThrow(RangeError)
    expect(() => billCompetence('2026-07-28', 0)).toThrow(RangeError)
    expect(() => billCompetence('2026-07-28', 32)).toThrow(RangeError)
  })
})

describe('addMonthsToCompetence', () => {
  test('soma dentro do mesmo ano', () => {
    expect(addMonthsToCompetence('2026-08', 3)).toBe('2026-11')
  })

  test('soma 12 meses mantém o mês e avança um ano', () => {
    expect(addMonthsToCompetence('2026-11', 12)).toBe('2027-11')
  })

  test('vira o ano em dezembro', () => {
    expect(addMonthsToCompetence('2026-12', 1)).toBe('2027-01')
  })

  test('n = 0 devolve a mesma competência', () => {
    expect(addMonthsToCompetence('2026-08', 0)).toBe('2026-08')
  })

  test('aceita n negativo', () => {
    expect(addMonthsToCompetence('2026-01', -1)).toBe('2025-12')
  })

  test('60 parcelas a partir de agosto/2026 terminam em julho/2031', () => {
    expect(addMonthsToCompetence('2026-08', 59)).toBe('2031-07')
  })

  test('rejeita competência malformada', () => {
    expect(() => addMonthsToCompetence('2026-13', 1)).toThrow(RangeError)
    expect(() => addMonthsToCompetence('2026-08-01', 1)).toThrow(RangeError)
  })
})

describe('competenceDueDate', () => {
  test('monta a data de vencimento na competência', () => {
    expect(competenceDueDate('2026-08', 5)).toBe('2026-08-05')
  })

  test('dia 31 em mês de 30 dias cai para o dia 30', () => {
    expect(competenceDueDate('2026-09', 31)).toBe('2026-09-30')
  })

  test('dia 31 em fevereiro cai para o dia 28', () => {
    expect(competenceDueDate('2026-02', 31)).toBe('2026-02-28')
  })

  test('rejeita competência e dia inválidos', () => {
    expect(() => competenceDueDate('2026-00', 5)).toThrow(RangeError)
    expect(() => competenceDueDate('2026-08', 0)).toThrow(RangeError)
  })
})
