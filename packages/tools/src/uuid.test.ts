import { uuidV4 } from './uuid'

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('UUID v4', () => {
  test('formato correto', () => {
    expect(uuidV4()).toMatch(UUID_V4_REGEX)
  })

  test('gera valores únicos em batch', () => {
    const uuids = Array.from({ length: 100 }, () => uuidV4())
    const unique = new Set(uuids)
    expect(unique.size).toBe(100)
  })

  test('versão é sempre 4', () => {
    for (let i = 0; i < 20; i++) {
      expect(uuidV4()[14]).toBe('4')
    }
  })
})
