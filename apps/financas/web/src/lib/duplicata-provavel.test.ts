import { describe, expect, it } from 'vitest'
import {
  JANELA_DIAS,
  detectarProvaveis,
  origemDe,
  rotuloOrigem,
  type TxExistente,
} from './duplicata-provavel'

const ofxSupermercado: TxExistente = {
  purchase_date: '2026-07-10',
  amount_cents: -18990,
  description: 'COMPRA CARTAO 10/07 SUPERMERCADO XPTO',
  import_source: 'ofx',
}

describe('origemDe', () => {
  it('trata null e vazio como lançamento manual', () => {
    expect(origemDe(null)).toBe('manual')
    expect(origemDe('')).toBe('manual')
    expect(origemDe('   ')).toBe('manual')
    expect(origemDe('manual')).toBe('manual')
    expect(origemDe('ofx')).toBe('ofx')
  })
})

describe('rotuloOrigem', () => {
  it('nomeia as origens conhecidas e devolve a crua para as demais', () => {
    expect(rotuloOrigem('pluggy')).toBe('sincronização com o banco')
    expect(rotuloOrigem('manual')).toBe('lançamento manual')
    expect(rotuloOrigem('ofx')).toBe('arquivo OFX')
    expect(rotuloOrigem('inventada')).toBe('inventada')
  })
})

describe('detectarProvaveis — o defeito medido no D1', () => {
  it('a MESMA compra vinda por OFX e depois por Pluggy é sinalizada', () => {
    const [colisao] = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-10',
          amount_cents: -18990,
          description: 'Supermercado Xpto',
        },
      ],
      [ofxSupermercado],
      'pluggy',
    )
    expect(colisao).not.toBeNull()
    expect(colisao?.origem).toBe('ofx')
    expect(colisao?.amount_cents).toBe(-18990)
    expect(colisao?.purchase_date).toBe('2026-07-10')
    expect(colisao?.diasDeDiferenca).toBe(0)
  })

  it('descrições DIFERENTES entre origens não impedem o casamento', () => {
    // É o ponto do critério: OFX e Pluggy descrevem a mesma compra com
    // strings diferentes por construção. Exigir que batam faria a checagem
    // falhar justo no cenário que ela existe pra pegar.
    const [colisao] = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-10',
          amount_cents: -18990,
          description: 'PAG*Mercadinho da Esquina',
        },
      ],
      [ofxSupermercado],
      'pluggy',
    )
    expect(colisao).not.toBeNull()
    expect(colisao?.descricaoBate).toBe(false)
  })

  it('descrição que bate é REFORÇO, sinalizado no resultado', () => {
    const [colisao] = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-10',
          amount_cents: -18990,
          description: 'Supermercado Xpto',
        },
      ],
      [
        {
          ...ofxSupermercado,
          description: 'SUPERMERCADO XPTO',
        },
      ],
      'pluggy',
    )
    expect(colisao?.descricaoBate).toBe(true)
  })

  it('lançamento MANUAL (sem imported_id) também colide — a dedupe exata é cega pra ele', () => {
    const [colisao] = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-05',
          amount_cents: -120000,
          description: 'Aluguel',
        },
      ],
      [
        {
          purchase_date: '2026-07-05',
          amount_cents: -120000,
          description: 'aluguel julho',
          import_source: null,
        },
      ],
      'ofx',
    )
    expect(colisao?.origem).toBe('manual')
  })
})

describe('detectarProvaveis — a janela de data', () => {
  it(`aceita ${JANELA_DIAS} dia de diferença (a conversão de fuso)`, () => {
    const [antes] = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-11',
          amount_cents: -18990,
          description: 'X',
        },
      ],
      [ofxSupermercado],
      'pluggy',
    )
    const [depois] = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-09',
          amount_cents: -18990,
          description: 'X',
        },
      ],
      [ofxSupermercado],
      'pluggy',
    )
    expect(antes?.diasDeDiferenca).toBe(1)
    expect(depois?.diasDeDiferenca).toBe(1)
  })

  it('recusa 2 dias de diferença', () => {
    const [colisao] = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-12',
          amount_cents: -18990,
          description: 'X',
        },
      ],
      [ofxSupermercado],
      'pluggy',
    )
    expect(colisao).toBeNull()
  })

  it('atravessa a virada de mês sem erro de aritmética', () => {
    const [colisao] = detectarProvaveis(
      [
        {
          purchase_date: '2026-08-01',
          amount_cents: -5000,
          description: 'X',
        },
      ],
      [
        {
          purchase_date: '2026-07-31',
          amount_cents: -5000,
          description: 'Y',
          import_source: 'ofx',
        },
      ],
      'pluggy',
    )
    expect(colisao?.diasDeDiferenca).toBe(1)
  })

  it('prefere o candidato de data EXATA quando há dois na janela', () => {
    const [colisao] = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-10',
          amount_cents: -5000,
          description: 'X',
        },
      ],
      [
        {
          purchase_date: '2026-07-09',
          amount_cents: -5000,
          description: 'vizinha',
          import_source: 'ofx',
        },
        {
          purchase_date: '2026-07-10',
          amount_cents: -5000,
          description: 'exata',
          import_source: 'ofx',
        },
      ],
      'pluggy',
    )
    expect(colisao?.description).toBe('exata')
  })
})

describe('detectarProvaveis — o valor', () => {
  it('exige o centavo EXATO', () => {
    const [colisao] = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-10',
          amount_cents: -18991,
          description: 'X',
        },
      ],
      [ofxSupermercado],
      'pluggy',
    )
    expect(colisao).toBeNull()
  })

  it('não casa valor de sinal oposto (estorno não é a compra)', () => {
    const [colisao] = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-10',
          amount_cents: 18990,
          description: 'X',
        },
      ],
      [ofxSupermercado],
      'pluggy',
    )
    expect(colisao).toBeNull()
  })
})

describe('detectarProvaveis — o que NÃO pode virar ruído', () => {
  it('dois cafés de R$ 12 no MESMO extrato OFX não se marcam entre si', () => {
    // O contra-exemplo do brief. A checagem só cruza ORIGENS DIFERENTES;
    // dentro da mesma origem quem manda é a dedupe exata por imported_id.
    const linhas = [
      { purchase_date: '2026-07-10', amount_cents: -1200, description: 'Café' },
      { purchase_date: '2026-07-10', amount_cents: -1200, description: 'Café' },
    ]
    const resultado = detectarProvaveis(
      linhas,
      [
        {
          purchase_date: '2026-07-10',
          amount_cents: -1200,
          description: 'CAFE',
          import_source: 'ofx',
        },
      ],
      'ofx',
    )
    expect(resultado).toEqual([null, null])
  })

  it('cada lançamento gravado é consumido por UMA linha só', () => {
    // Um café já existe (OFX); o Pluggy traz DOIS. O primeiro é a
    // duplicata, o segundo é genuinamente novo e tem que nascer marcado.
    const resultado = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-10',
          amount_cents: -1200,
          description: 'Café',
        },
        {
          purchase_date: '2026-07-10',
          amount_cents: -1200,
          description: 'Café',
        },
      ],
      [
        {
          purchase_date: '2026-07-10',
          amount_cents: -1200,
          description: 'CAFE',
          import_source: 'ofx',
        },
      ],
      'pluggy',
    )
    expect(resultado[0]).not.toBeNull()
    expect(resultado[1]).toBeNull()
  })

  it('conta sem nenhum lançamento de outra origem não marca nada', () => {
    const resultado = detectarProvaveis(
      [
        {
          purchase_date: '2026-07-10',
          amount_cents: -18990,
          description: 'X',
        },
      ],
      [],
      'pluggy',
    )
    expect(resultado).toEqual([null])
  })

  it('12 meses de OFX + a MESMA janela por Pluggy marca TODAS as linhas', () => {
    // O estrago real descrito no defeito: o dono importa por OFX hoje,
    // liga o Pluggy amanhã e sincroniza a mesma janela.
    const existentes: TxExistente[] = Array.from({ length: 30 }, (_, i) => ({
      purchase_date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      amount_cents: -(1000 + i),
      description: `COMPRA ${i}`,
      import_source: 'ofx',
    }))
    const linhas = existentes.map((t) => ({
      purchase_date: t.purchase_date,
      amount_cents: t.amount_cents,
      description: `Compra ${t.amount_cents}`,
    }))
    const resultado = detectarProvaveis(linhas, existentes, 'pluggy')
    expect(resultado.filter((c) => c !== null)).toHaveLength(30)
  })
})
