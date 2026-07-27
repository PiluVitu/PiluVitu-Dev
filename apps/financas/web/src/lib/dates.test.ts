import { describe, expect, test } from 'vitest'
import { competenciaAtual, todayInTeresina } from './dates'

describe('todayInTeresina', () => {
  test('01:00 UTC (22h do dia anterior em Teresina) ainda devolve o dia anterior', () => {
    // 01:00 UTC de 01/08 é 22:00 de 31/07 em Teresina (UTC-3). É exatamente
    // aqui que new Date().toISOString().slice(0, 10) erraria, gravando
    // '2026-08-01' em vez de '2026-07-31'.
    const agora = new Date('2026-08-01T01:00:00Z')
    expect(agora.toISOString().slice(0, 10)).toBe('2026-08-01') // o jeito ERRADO
    expect(todayInTeresina(agora)).toBe('2026-07-31') // o jeito certo
  })

  test('03:00 UTC já é meia-noite em Teresina: vira o dia', () => {
    expect(todayInTeresina(new Date('2026-08-01T03:00:00Z'))).toBe('2026-08-01')
  })

  test('sem argumento devolve YYYY-MM-DD', () => {
    expect(todayInTeresina()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('competenciaAtual', () => {
  test('01:00 UTC (22h do dia anterior em Teresina) cai na competência do mês anterior', () => {
    // 01:00 UTC de 01/08 é 31/07 em Teresina — a competência é jul/26, não
    // ago/26. Mesmo caso-armadilha de todayInTeresina, um nível acima.
    expect(competenciaAtual(new Date('2026-08-01T01:00:00Z'))).toBe('2026-07')
  })

  test('corta YYYY-MM-DD em YYYY-MM', () => {
    expect(competenciaAtual(new Date('2026-08-01T03:00:00Z'))).toBe('2026-08')
  })

  test('sem argumento devolve YYYY-MM', () => {
    expect(competenciaAtual()).toMatch(/^\d{4}-\d{2}$/)
  })
})
