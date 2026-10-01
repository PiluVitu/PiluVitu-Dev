import { serializarJsonLd } from './json-ld'

describe('serializarJsonLd', () => {
  // Um texto do YAML com "</script>" fecharia a tag e viraria HTML.
  it('troca < por \\u003c e continua sendo JSON válido', () => {
    const dados = { name: '</script><script>alert(1)</script>' }
    const serializado = serializarJsonLd(dados)
    expect(serializado).not.toContain('<')
    expect(JSON.parse(serializado)).toEqual(dados)
  })
})
