import { describe, expect, it } from 'vitest'
import { fechamentoDoPeriodo, isStaleInsight } from './insight'

describe('fechamentoDoPeriodo', () => {
  it('é a meia-noite do dia 1 seguinte em Fortaleza, escrita em UTC', () => {
    expect(fechamentoDoPeriodo('2026-10')).toBe('2026-11-01T03:00:00Z')
  })

  it('dezembro fecha no ano seguinte', () => {
    expect(fechamentoDoPeriodo('2026-12')).toBe('2027-01-01T03:00:00Z')
  })
})

describe('isStaleInsight: frescor contra o período, não só a idade', () => {
  it('um insight gerado depois de o mês fechar nunca fica desatualizado', () => {
    // O do Cron, no dia 1: os números de um mês fechado não mudam mais.
    const doCron = { periodo: '2026-10', generated_at: '2026-11-01T12:00:00Z' }
    expect(isStaleInsight(doCron, new Date('2026-11-20T12:00:00Z'))).toBe(false)
    expect(isStaleInsight(doCron, new Date('2027-06-01T12:00:00Z'))).toBe(false)
  })

  it('um insight do mês corrente com mais de 7 dias fica desatualizado', () => {
    const parcial = { periodo: '2026-07', generated_at: '2026-07-04T12:00:00Z' }
    expect(isStaleInsight(parcial, new Date('2026-07-25T12:00:00Z'))).toBe(true)
  })

  it('um insight do mês corrente com até 7 dias ainda vale', () => {
    const parcial = { periodo: '2026-07', generated_at: '2026-07-20T12:00:00Z' }
    expect(isStaleInsight(parcial, new Date('2026-07-25T12:00:00Z'))).toBe(
      false,
    )
  })

  it('um insight parcial de um mês que já fechou continua desatualizado', () => {
    const parcial = { periodo: '2026-10', generated_at: '2026-10-10T12:00:00Z' }
    expect(isStaleInsight(parcial, new Date('2026-11-15T12:00:00Z'))).toBe(true)
  })

  it('às 23:59 do último dia em Fortaleza o mês ainda não fechou', () => {
    const quase = { periodo: '2026-10', generated_at: '2026-11-01T02:59:59Z' }
    expect(isStaleInsight(quase, new Date('2026-11-20T12:00:00Z'))).toBe(true)
  })
})
