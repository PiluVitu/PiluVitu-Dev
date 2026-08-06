import { describe, expect, it } from 'vitest'
import { nowIsoUtc, toIsoUtc } from './dates'

describe('nowIsoUtc', () => {
  it('formata em ISO-8601 UTC com Z e sem milissegundos', () => {
    expect(nowIsoUtc(new Date('2026-05-19T12:00:00.456Z'))).toBe(
      '2026-05-19T12:00:00Z',
    )
  })
  it('sem argumento usa o relógio e devolve o mesmo formato', () => {
    expect(nowIsoUtc()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  })
})

describe('toIsoUtc', () => {
  it('converte o formato do CURRENT_TIMESTAMP do SQLite', () => {
    // ⚠️ MEDIDO: o CURRENT_TIMESTAMP do SQLite grava com ESPAÇO, sem T e sem Z.
    // `new Date('2026-05-19 12:00:00')` é aceito pelo V8 e REJEITADO pelo
    // Safari (Invalid Date) — e o apps/web renderiza esta data no SessionCard.
    expect(toIsoUtc('2026-05-19 12:00:00')).toBe('2026-05-19T12:00:00Z')
  })
  it('deixa passar o que já está em ISO com Z', () => {
    expect(toIsoUtc('2026-05-19T12:00:00Z')).toBe('2026-05-19T12:00:00Z')
  })
  it('normaliza ISO com milissegundos para o formato sem eles', () => {
    expect(toIsoUtc('2026-05-19T12:00:00.123Z')).toBe('2026-05-19T12:00:00Z')
  })
  it('recusa string vazia em vez de devolver Invalid Date', () => {
    expect(() => toIsoUtc('')).toThrow(RangeError)
  })
  it('recusa lixo em vez de devolver Invalid Date', () => {
    // Devolver a string 'Invalid Date' pro cliente seria pior que falhar alto:
    // a tela renderizaria isso como se fosse uma data.
    expect(() => toIsoUtc('nao-e-data')).toThrow(RangeError)
  })
})
