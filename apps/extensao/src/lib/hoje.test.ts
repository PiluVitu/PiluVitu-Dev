import { describe, expect, it } from 'vitest'
import { hojeISO, idadeEm } from './hoje'

describe('hojeISO', () => {
  it('usa o dia civil de São Paulo, não o de UTC', () => {
    expect(hojeISO(new Date('2026-10-02T02:30:00Z'))).toBe('2026-10-01')
    expect(hojeISO(new Date('2026-10-01T03:00:00Z'))).toBe('2026-10-01')
    expect(hojeISO(new Date('2026-10-01T02:59:59Z'))).toBe('2026-09-30')
  })

  it('vira o ano à meia-noite de Brasília', () => {
    expect(hojeISO(new Date('2027-01-01T02:59:59Z'))).toBe('2026-12-31')
    expect(hojeISO(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01')
  })

  it('sem argumento devolve a data de agora no formato aaaa-mm-dd', () => {
    expect(hojeISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('idadeEm', () => {
  it('só completa o ano no dia do aniversário', () => {
    expect(idadeEm('1993-05-29', '2026-05-28')).toBe(32)
    expect(idadeEm('1993-05-29', '2026-05-29')).toBe(33)
  })
})
