import { formatJSON, minifyJSON, validateJSON } from './json-format'

describe('JSON format', () => {
  describe('formatJSON', () => {
    test('formata JSON simples com 2 espaços', () => {
      const result = formatJSON('{"a":1,"b":2}')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe('{\n  "a": 1,\n  "b": 2\n}')
    })

    test('é idempotente', () => {
      const first = formatJSON('{"x":1}')
      expect(first.ok).toBe(true)
      if (!first.ok) return
      const second = formatJSON(first.value)
      expect(second.ok).toBe(true)
      if (!second.ok) return
      expect(second.value).toBe(first.value)
    })

    test('retorna erro para JSON inválido', () => {
      const result = formatJSON('{invalid}')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBeTruthy()
    })
  })

  describe('minifyJSON', () => {
    test('remove espaços e newlines', () => {
      const result = minifyJSON('{ "a" : 1 , "b" : 2 }')
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe('{"a":1,"b":2}')
    })

    test('retorna erro para JSON inválido', () => {
      const result = minifyJSON('bad json')
      expect(result.ok).toBe(false)
    })
  })

  describe('validateJSON', () => {
    test('retorna válido para JSON correto', () => {
      expect(validateJSON('{"key":"value"}')).toEqual({ valid: true })
    })

    test('retorna inválido para JSON incorreto', () => {
      const result = validateJSON('{bad}')
      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    test('JSON array é válido', () => {
      expect(validateJSON('[1, 2, 3]')).toEqual({ valid: true })
    })
  })
})
