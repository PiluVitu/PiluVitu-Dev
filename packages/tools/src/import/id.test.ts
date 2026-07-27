import { idEstavel } from './id'

// Linha base usada por vários testes — data | valor | descrição é exatamente
// o que compõe a chave do hash (spec §5).
const LINHA_BASE = {
  purchase_date: '2026-07-28',
  amount_cents: -18990,
  description: 'MERCADO BOM PRECO',
}

describe('idEstavel', () => {
  test('é determinístico: mesma linha produz o mesmo id em invocações separadas', async () => {
    // Dois objetos distintos (não a mesma referência), duas chamadas
    // separadas — prova determinismo real, não apenas "retornou algo".
    const linha1 = { ...LINHA_BASE }
    const linha2 = {
      purchase_date: '2026-07-28',
      amount_cents: -18990,
      description: 'MERCADO BOM PRECO',
    }
    const id1 = await idEstavel(linha1)
    const id2 = await idEstavel(linha2)

    expect(id1).toBe(id2)
    expect(id1).toMatch(/^[0-9a-f]{64}$/) // SHA-256 em hex minúsculo
  })

  test('é determinístico entre "execuções" distintas (nova chamada assíncrona a cada vez)', async () => {
    // Simula chamadas em momentos diferentes do event loop, não em paralelo
    // síncrono — ainda assim o resultado tem que bater.
    const primeira = await idEstavel(LINHA_BASE)
    await new Promise((resolve) => setTimeout(resolve, 0))
    const segunda = await idEstavel(LINHA_BASE)
    expect(primeira).toBe(segunda)
  })

  test('muda quando o valor muda', async () => {
    const idBase = await idEstavel(LINHA_BASE)
    const idOutroValor = await idEstavel({
      ...LINHA_BASE,
      amount_cents: -18991,
    })
    expect(idOutroValor).not.toBe(idBase)
  })

  test('muda quando a data muda', async () => {
    const idBase = await idEstavel(LINHA_BASE)
    const idOutraData = await idEstavel({
      ...LINHA_BASE,
      purchase_date: '2026-07-29',
    })
    expect(idOutraData).not.toBe(idBase)
  })

  test('muda quando a descrição muda', async () => {
    const idBase = await idEstavel(LINHA_BASE)
    const idOutraDescricao = await idEstavel({
      ...LINHA_BASE,
      description: 'OUTRO ESTABELECIMENTO',
    })
    expect(idOutraDescricao).not.toBe(idBase)
  })

  // Limitação conhecida (spec §5, ⚠️): duas compras GENUINAMENTE diferentes
  // com mesma data, mesmo valor e mesma descrição (dois cafés de R$ 8 na
  // mesma padaria no mesmo dia) produzem o MESMO id. Isso não é um bug a
  // corrigir aqui — é o trade-off documentado; a tela de conferência
  // (task 5) mostra a duplicata sugerida e o dono decide. Este teste fixa o
  // comportamento como conhecido, pra ninguém "consertar" isso sem
  // perceber a consequência.
  test('duas linhas idênticas geram o mesmo id (limitação conhecida, não é bug)', async () => {
    const cafeUm = {
      purchase_date: '2026-07-28',
      amount_cents: -800,
      description: 'PADARIA CONFEITARIA STO ANTONIO',
    }
    const cafeDois = {
      purchase_date: '2026-07-28',
      amount_cents: -800,
      description: 'PADARIA CONFEITARIA STO ANTONIO',
    }
    const idUm = await idEstavel(cafeUm)
    const idDois = await idEstavel(cafeDois)
    expect(idUm).toBe(idDois)
  })

  test('descrição com diferença só de espaço/maiúsculo ainda gera o mesmo id (normalização)', async () => {
    const idOriginal = await idEstavel(LINHA_BASE)
    const idComEspacos = await idEstavel({
      ...LINHA_BASE,
      description: '  mercado   bom preco  ',
    })
    expect(idComEspacos).toBe(idOriginal)
  })
})
