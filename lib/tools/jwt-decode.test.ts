import { decodeJWT } from './jwt-decode'

// eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'

describe('JWT decode', () => {
  test('decodifica header corretamente', () => {
    const result = decodeJWT(SAMPLE_JWT)
    expect(result.header).toEqual({ alg: 'HS256', typ: 'JWT' })
  })

  test('decodifica payload corretamente', () => {
    const result = decodeJWT(SAMPLE_JWT)
    expect(result.payload).toEqual({
      sub: '1234567890',
      name: 'John Doe',
      iat: 1516239022,
    })
  })

  test('preserva assinatura bruta', () => {
    const result = decodeJWT(SAMPLE_JWT)
    expect(result.signature).toBe('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')
  })

  test('lança erro com menos de 3 partes', () => {
    expect(() => decodeJWT('abc.def')).toThrow('3 partes')
  })

  test('lança erro com payload malformado', () => {
    expect(() => decodeJWT('eyJhbGciOiJIUzI1NiJ9.!!!.sig')).toThrow()
  })

  test('aceita token com espaços ao redor', () => {
    const result = decodeJWT(`  ${SAMPLE_JWT}  `)
    expect(result.payload.name).toBe('John Doe')
  })
})
