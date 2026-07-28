import { parseCsv, type MapaColunas } from './csv'
import { idEstavel } from './id'

// Fixture no estilo real de export de fatura/extrato brasileiro: cabeçalho +
// linhas comma-delimited, campos com vírgula quotados (RFC4180). O valor em
// BRL SEMPRE tem vírgula decimal, então precisa estar quotado quando o
// delimitador do CSV também é vírgula — é exatamente essa colisão que a
// linha 2 (descrição com vírgula) e todas as linhas de valor exercitam.
//
// Linha 2 é a prova de que um `split(',')` ingênuo corrompe a leitura: a
// descrição "PADARIA STO ANTONIO, LTDA" tem uma vírgula NO MEIO da linha
// (coluna 1 de 3), então um split ingênuo geraria 4 campos em vez de 3 e
// jogaria a coluna de valor (índice 2) pro lugar errado — o dono veria um
// valor errado, não um erro.
const CSV_FATURA = `Data,Descricao,Valor
28/07/2026,"MERCADO BOM PRECO","-189,90"
15/07/2026,"PADARIA STO ANTONIO, LTDA","-19,90"
2026-07-10,"PAGAMENTO RECEBIDO","300,00"
31/07/2026,"COMPRA PARCELADA","-1.234,56"
10/07/2026,"TARIFA MANUTENCAO","(15,00)"
`

const MAPA: MapaColunas = {
  data: 0,
  descricao: 1,
  valor: 2,
  temCabecalho: true,
}

// Mesmas linhas lógicas de CSV_FATURA, mas ponto-e-vírgula delimitado — o
// formato que muitos bancos brasileiros usam de propósito, justamente
// porque a vírgula já é o separador decimal do BRL. Com `;` como
// delimitador, o valor NÃO precisa de aspas (não há colisão de caractere).
const CSV_FATURA_PONTO_VIRGULA = `Data;Descricao;Valor
28/07/2026;MERCADO BOM PRECO;-189,90
15/07/2026;PADARIA STO ANTONIO;-19,90
2026-07-10;PAGAMENTO RECEBIDO;300,00
31/07/2026;COMPRA PARCELADA;-1.234,56
10/07/2026;TARIFA MANUTENCAO;(15,00)
`

// Prova que a consciência de aspas também vale pro delimitador `;`: a
// descrição tem um `;` NO MEIO da linha (coluna 1 de 3), quotada. Um split
// ingênuo por `;` geraria 4 campos e jogaria a coluna de valor (índice 2)
// pro lugar errado — o mesmo defeito que a fixture de vírgula prova lá em
// cima, só que pro outro delimitador.
const CSV_PONTO_VIRGULA_COM_ASPAS = `Data;Descricao;Valor
15/07/2026;"PADARIA STO ANTONIO; LTDA";-19,90
`

describe('parseCsv', () => {
  test('CSV com cabeçalho, mapeado por índice de coluna', () => {
    const linhas = parseCsv(CSV_FATURA, MAPA)
    expect(linhas).toHaveLength(5)
    expect(linhas[0]).toEqual({
      purchase_date: '2026-07-28',
      amount_cents: -18990,
      description: 'MERCADO BOM PRECO',
    })
  })

  test('valor em formato brasileiro (milhar + decimal) vira centavos via parseBRL', () => {
    const linhas = parseCsv(CSV_FATURA, MAPA)
    const parcelada = linhas.find((l) => l.description === 'COMPRA PARCELADA')
    expect(parcelada?.amount_cents).toBe(-123456)
  })

  test('valor negativo com sinal e com parênteses', () => {
    const linhas = parseCsv(CSV_FATURA, MAPA)

    const comSinal = linhas.find((l) => l.description === 'MERCADO BOM PRECO')
    expect(comSinal?.amount_cents).toBe(-18990)

    const comParenteses = linhas.find(
      (l) => l.description === 'TARIFA MANUTENCAO',
    )
    expect(comParenteses?.amount_cents).toBe(-1500)

    const positivo = linhas.find((l) => l.description === 'PAGAMENTO RECEBIDO')
    expect(positivo?.amount_cents).toBe(30000)
  })

  test('data em DD/MM/AAAA e em AAAA-MM-DD', () => {
    const linhas = parseCsv(CSV_FATURA, MAPA)

    const emBr = linhas.find((l) => l.description === 'MERCADO BOM PRECO')
    expect(emBr?.purchase_date).toBe('2026-07-28')

    const emIso = linhas.find((l) => l.description === 'PAGAMENTO RECEBIDO')
    expect(emIso?.purchase_date).toBe('2026-07-10')
  })

  test('campo com vírgula dentro de aspas não corrompe as colunas seguintes', () => {
    const linhas = parseCsv(CSV_FATURA, MAPA)
    const padaria = linhas.find((l) =>
      l.description.startsWith('PADARIA STO ANTONIO'),
    )
    // Se um split ingênuo tivesse corrompido a linha, a descrição estaria
    // truncada (sem o ", LTDA") e/ou o valor não seria -19,90.
    expect(padaria).toEqual({
      purchase_date: '2026-07-15',
      amount_cents: -1990,
      description: 'PADARIA STO ANTONIO, LTDA',
    })
  })

  test('CSV sem linhas de dados (só cabeçalho) retorna lista vazia', () => {
    expect(parseCsv('Data,Descricao,Valor\n', MAPA)).toEqual([])
  })

  test('texto vazio retorna lista vazia, não lança exceção', () => {
    expect(parseCsv('', MAPA)).toEqual([])
    expect(parseCsv('   \n  ', MAPA)).toEqual([])
  })

  test('mapa sem cabeçalho (temCabecalho: false) inclui a primeira linha', () => {
    const semCabecalho = '28/07/2026,"MERCADO BOM PRECO","-189,90"\n'
    const linhas = parseCsv(semCabecalho, { ...MAPA, temCabecalho: false })
    expect(linhas).toHaveLength(1)
    expect(linhas[0].description).toBe('MERCADO BOM PRECO')
  })

  test('nenhum teste passa contra um parser que sempre retorna []', () => {
    // Sentinela, mesmo espírito do de ofx.test.ts: se parseCsv virar
    // `() => []`, os testes acima que checam .length e campos falhariam,
    // mas este deixa a intenção explícita.
    expect(parseCsv(CSV_FATURA, MAPA).length).toBeGreaterThan(0)
  })

  // Fixa o comportamento descrito no brief (item 8): duas linhas
  // IDÊNTICAS no mesmo arquivo (mesma data, mesmo valor, mesma descrição)
  // geram o MESMO id — a limitação documentada do hash de CSV (spec §5).
  // Este teste prova o fluxo completo: parseCsv → idEstavel.
  test('duas linhas idênticas no mesmo arquivo geram o mesmo id (limitação conhecida)', async () => {
    const csvComDuplicata = `Data,Descricao,Valor
28/07/2026,"PADARIA STO ANTONIO","-8,00"
28/07/2026,"PADARIA STO ANTONIO","-8,00"
`
    const linhas = parseCsv(csvComDuplicata, MAPA)
    expect(linhas).toHaveLength(2)

    const [id1, id2] = await Promise.all(linhas.map(idEstavel))
    expect(id1).toBe(id2)
  })

  describe('delimitador ; (comum em export brasileiro, detectado por arquivo)', () => {
    test('valor BRL SEM aspas funciona quando o delimitador é ; (caso comum real)', () => {
      const linhas = parseCsv(CSV_FATURA_PONTO_VIRGULA, MAPA)
      expect(linhas).toHaveLength(5)

      const parcelada = linhas.find((l) => l.description === 'COMPRA PARCELADA')
      expect(parcelada).toEqual({
        purchase_date: '2026-07-31',
        amount_cents: -123456,
        description: 'COMPRA PARCELADA',
      })

      const comParenteses = linhas.find(
        (l) => l.description === 'TARIFA MANUTENCAO',
      )
      expect(comParenteses?.amount_cents).toBe(-1500)
    })

    test('campo com ; dentro de aspas não corrompe as colunas seguintes', () => {
      const linhas = parseCsv(CSV_PONTO_VIRGULA_COM_ASPAS, MAPA)
      expect(linhas).toEqual([
        {
          purchase_date: '2026-07-15',
          amount_cents: -1990,
          description: 'PADARIA STO ANTONIO; LTDA',
        },
      ])
    })

    // O teste que protege a idempotência: se o dono reexportar o MESMO
    // extrato do banco num formato diferente (ex.: trocou de vírgula pra
    // ; num export posterior, ou o banco mudou o layout), o id sintético
    // não pode mudar — senão a reimportação duplicaria tudo, exatamente o
    // requisito que esta fatia inteira existe pra garantir (spec §5, §10).
    // O id depende só dos DADOS (data|valor|descrição), nunca da pontuação
    // do arquivo.
    test('idEstavel é o mesmo pra linhas logicamente iguais, seja o arquivo , ou ; delimitado', async () => {
      const comVirgula = parseCsv(CSV_FATURA, MAPA)
      const comPontoVirgula = parseCsv(CSV_FATURA_PONTO_VIRGULA, MAPA)

      const mercadoVirgula = comVirgula.find(
        (l) => l.description === 'MERCADO BOM PRECO',
      )
      const mercadoPontoVirgula = comPontoVirgula.find(
        (l) => l.description === 'MERCADO BOM PRECO',
      )
      expect(mercadoVirgula).toBeDefined()
      expect(mercadoPontoVirgula).toBeDefined()
      // Mesma linha lógica, vinda de dois arquivos com delimitador diferente
      // — os campos já batem antes mesmo do hash.
      expect(mercadoVirgula).toEqual(mercadoPontoVirgula)

      const idVirgula = await idEstavel(mercadoVirgula!)
      const idPontoVirgula = await idEstavel(mercadoPontoVirgula!)
      expect(idVirgula).toBe(idPontoVirgula)
    })
  })
})
