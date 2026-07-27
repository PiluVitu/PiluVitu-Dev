import { parseOfx } from './ofx'

// Fixture no estilo real de fatura de cartão de crédito brasileira (Nubank/
// Itaú/BB): OFX 1.02 SGML — header `chave:valor` sem XML declaration, tags
// de dado (FITID, DTPOSTED, TRNAMT, MEMO) SEM fechamento (só as agregadas,
// como <STMTTRN>...</STMTTRN> e <BANKTRANLIST>...</BANKTRANLIST>, fecham).
// Um parser que assume XML bem formado (todas as tags fechadas) quebra
// nisso — é exatamente o defeito que o brief avisa.
//
// A 2ª transação (-19.90) existe pra provar que a conversão pra centavos
// não passa por float: `19.9 * 100` em IEEE 754 dá 1989.9999999999998, não
// 1990 (verificado em runtime — não é um exemplo de manual).
//
// A 4ª transação (22h, fuso -3) reproduz literalmente o bug que já mordeu
// este projeto: uma compra às 22h em fuso -3 é 01h UTC do dia seguinte: se
// o parser converter por UTC, a data desliza um dia.
const OFX_FATURA_CARTAO = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260728120000[-3:BRT]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<CREDITCARDMSGSRSV1>
<CCSTMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<CCSTMTRS>
<CURDEF>BRL
<CCACCTFROM>
<ACCTID>1234567890123456
</CCACCTFROM>
<BANKTRANLIST>
<DTSTART>20260701000000[-3:BRT]
<DTEND>20260731000000[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260728120000[-3:BRT]
<TRNAMT>-189.90
<FITID>2026072800011234
<MEMO>MERCADO BOM PRECO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260715090000[-3:BRT]
<TRNAMT>-19.90
<FITID>2026071500009876
<MEMO>PADARIA CONFEITARIA STO ANTONIO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260710000000[-3:BRT]
<TRNAMT>300.00
<FITID>2026071000004321
<MEMO>PAGAMENTO RECEBIDO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260731220000[-3:BRT]
<TRNAMT>-45.00
<FITID>2026073122001111
<MEMO>UBER TRIP NOITE
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>-1954.80
<DTASOF>20260731220000[-3:BRT]
</LEDGERBAL>
</CCSTMTRS>
</CCSTMTTRNRS>
</CREDITCARDMSGSRSV1>
</OFX>
`

// Extrato de conta-corrente com uma única transação (BANKMSGSRSV1, não
// CREDITCARDMSGSRSV1) — layout diferente do cartão, pra não acoplar o
// parser a um único caminho de agregados.
const OFX_UMA_TRANSACAO = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260728120000[-3:BRT]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0001
<ACCTID>12345-6
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260701000000[-3:BRT]
<DTEND>20260728000000[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260703080000[-3:BRT]
<TRNAMT>-1250.00
<FITID>20260703000123
<MEMO>PARC 01/05 LOJA ELETRO CENTER
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>4310.00
<DTASOF>20260728120000[-3:BRT]
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`

// Statement válido, sintaticamente correto, mas sem nenhuma transação no
// período — situação real (fatura fechada sem movimentação). Diferente de
// arquivo vazio, e diferente de malformado.
const OFX_SEM_TRANSACOES = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260728120000[-3:BRT]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0001
<ACCTID>12345-6
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260701000000[-3:BRT]
<DTEND>20260728000000[-3:BRT]
</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>4310.00
<DTASOF>20260728120000[-3:BRT]
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`

describe('parseOfx', () => {
  test('extrai FITID, DTPOSTED, TRNAMT e MEMO de cada STMTTRN', () => {
    const linhas = parseOfx(OFX_FATURA_CARTAO)
    expect(linhas).toHaveLength(4)
    expect(linhas[0]).toEqual({
      imported_id: '2026072800011234',
      purchase_date: '2026-07-28',
      amount_cents: -18990,
      description: 'MERCADO BOM PRECO',
    })
  })

  test('valor vira centavos inteiros, sem float intermediário', () => {
    // Prova em runtime que o naive `Number('19.90') * 100` erra:
    expect(19.9 * 100).not.toBe(1990)
    expect(Number.isInteger(19.9 * 100)).toBe(false)

    const linhas = parseOfx(OFX_FATURA_CARTAO)
    const padaria = linhas.find((l) => l.imported_id === '2026071500009876')
    expect(padaria?.amount_cents).toBe(-1990)
    expect(Object.is(padaria?.amount_cents, -1990)).toBe(true)
    expect(Number.isInteger(padaria?.amount_cents)).toBe(true)
  })

  test('valor positivo (crédito) também vira centavos inteiros', () => {
    const linhas = parseOfx(OFX_FATURA_CARTAO)
    const pagamento = linhas.find((l) => l.imported_id === '2026071000004321')
    expect(pagamento?.amount_cents).toBe(30000)
  })

  test('DTPOSTED com fuso vira a data local, sem deslocar pra UTC', () => {
    const linhas = parseOfx(OFX_FATURA_CARTAO)
    expect(linhas[0].purchase_date).toBe('2026-07-28')
  })

  test('compra às 22h em fuso -3 não vira o dia seguinte (regressão)', () => {
    // 20260731220000[-3:BRT] = 31/07 22h local = 01/08 01h UTC. Se o parser
    // converter por UTC (o bug que já mordeu este projeto), a data vira
    // 2026-08-01. A data correta, tomada como escrita, é 2026-07-31.
    const linhas = parseOfx(OFX_FATURA_CARTAO)
    const uber = linhas.find((l) => l.imported_id === '2026073122001111')
    expect(uber?.purchase_date).toBe('2026-07-31')
  })

  test('OFX com uma única transação', () => {
    const linhas = parseOfx(OFX_UMA_TRANSACAO)
    expect(linhas).toEqual([
      {
        imported_id: '20260703000123',
        purchase_date: '2026-07-03',
        amount_cents: -125000,
        description: 'PARC 01/05 LOJA ELETRO CENTER',
      },
    ])
  })

  test('arquivo vazio retorna lista vazia, não lança exceção', () => {
    expect(parseOfx('')).toEqual([])
    expect(parseOfx('   \n  ')).toEqual([])
  })

  test('OFX válido sem nenhuma transação retorna lista vazia', () => {
    expect(parseOfx(OFX_SEM_TRANSACOES)).toEqual([])
  })

  test('arquivo malformado (não é OFX) lança erro com mensagem acionável', () => {
    expect(() => parseOfx('isto claramente não é um arquivo OFX')).toThrow()
    expect(() => parseOfx('isto claramente não é um arquivo OFX')).toThrow(
      /OFX/,
    )
  })

  test('STMTTRN sem FITID lança erro mencionando o campo ausente', () => {
    const semFitid = OFX_UMA_TRANSACAO.replace('<FITID>20260703000123\n', '')
    expect(() => parseOfx(semFitid)).toThrow(/FITID/)
  })

  test('STMTTRN sem TRNAMT lança erro mencionando o campo ausente', () => {
    const semValor = OFX_UMA_TRANSACAO.replace('<TRNAMT>-1250.00\n', '')
    expect(() => parseOfx(semValor)).toThrow(/TRNAMT/)
  })

  test('nenhum teste passa contra um parser que sempre retorna []', () => {
    // Sentinela: se algum dia parseOfx virar `() => []`, este teste falha —
    // prova que os testes acima realmente exercitam a extração.
    expect(parseOfx(OFX_FATURA_CARTAO).length).toBeGreaterThan(0)
  })

  // Correção herdada da task 1: bancos reais às vezes usam <NAME> em vez de
  // <MEMO>, ou deixam <MEMO> vazio em lançamentos de tarifa. Exigir <MEMO>
  // (como o parser fazia antes) derruba o arquivo real inteiro por causa de
  // UMA transação — o oposto do objetivo (funcionar com o extrato real do
  // dono). A prioridade é MEMO → NAME → um marcador de placeholder,
  // nunca uma exceção.
  describe('fallback de descrição: MEMO → NAME → placeholder', () => {
    test('usa MEMO quando presente (caminho normal, sem mudança)', () => {
      const linhas = parseOfx(OFX_UMA_TRANSACAO)
      expect(linhas[0].description).toBe('PARC 01/05 LOJA ELETRO CENTER')
    })

    test('usa NAME quando MEMO está ausente', () => {
      const semMemo = OFX_UMA_TRANSACAO.replace(
        '<MEMO>PARC 01/05 LOJA ELETRO CENTER\n',
        '<NAME>LOJA ELETRO CENTER\n',
      )
      const linhas = parseOfx(semMemo)
      expect(linhas[0].description).toBe('LOJA ELETRO CENTER')
    })

    test('usa NAME quando MEMO está presente mas vazio (ex.: linha de tarifa)', () => {
      const memoVazio = OFX_UMA_TRANSACAO.replace(
        '<MEMO>PARC 01/05 LOJA ELETRO CENTER\n',
        '<MEMO>\n<NAME>LOJA ELETRO CENTER\n',
      )
      const linhas = parseOfx(memoVazio)
      expect(linhas[0].description).toBe('LOJA ELETRO CENTER')
    })

    test('usa um placeholder claramente marcado quando MEMO e NAME estão ausentes/vazios — não lança exceção', () => {
      const semDescricao = OFX_UMA_TRANSACAO.replace(
        '<MEMO>PARC 01/05 LOJA ELETRO CENTER\n',
        '<MEMO>\n',
      )
      expect(() => parseOfx(semDescricao)).not.toThrow()
      const linhas = parseOfx(semDescricao)
      expect(linhas[0].description).toBe('(sem descrição)')
    })
  })
})
