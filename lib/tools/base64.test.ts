import { encodeBase64, decodeBase64 } from './base64'

describe('Base64', () => {
  test('round-trip com ASCII simples', () => {
    const text = 'hello world'
    expect(decodeBase64(encodeBase64(text))).toBe(text)
  })

  test('round-trip com caracteres acentuados', () => {
    const text = 'olá, coração!'
    expect(decodeBase64(encodeBase64(text))).toBe(text)
  })

  test('round-trip com emojis (multibyte)', () => {
    const text = '🎉🚀 ção'
    expect(decodeBase64(encodeBase64(text))).toBe(text)
  })

  test('encodeBase64 produz string válida em base64', () => {
    const encoded = encodeBase64('test')
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  test('string vazia retorna string vazia após round-trip', () => {
    expect(decodeBase64(encodeBase64(''))).toBe('')
  })
})
