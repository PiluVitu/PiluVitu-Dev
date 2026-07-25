import { describe, expect, test } from 'vitest'
import { newId } from './ids'

describe('newId', () => {
  test('devolve UUID v4 no formato canônico', () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  test('não repete em 1000 chamadas', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()))
    expect(ids.size).toBe(1000)
  })
})
