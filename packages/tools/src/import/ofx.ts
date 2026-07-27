import type { LinhaImportada } from './index'

// OFX no mundo real é SGML, não XML: tags de dado (FITID, DTPOSTED, TRNAMT,
// MEMO...) normalmente NÃO fecham — o valor termina no próximo `<` ou fim de
// linha. Só as tags agregadas (STMTTRN, BANKTRANLIST...) fecham. O regex de
// campo captura até o próximo `<` ou quebra de linha, o que funciona tanto
// pro dialeto SGML (sem fechamento) quanto pro OFX 2.0 em XML (com
// fechamento, já que `</TAG>` também começa com `<`).
const STMTTRN_BLOCK = /<STMTTRN>[\s\S]*?<\/STMTTRN>/gi

function extractField(bloco: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\r\n]*)`, 'i')
  const match = re.exec(bloco)
  return match === null ? null : match[1].trim()
}

function requireField(bloco: string, tag: string): string {
  const value = extractField(bloco, tag)
  if (value === null || value === '') {
    throw new Error(
      `OFX malformado: tag <${tag}> ausente ou vazia dentro de um <STMTTRN>`,
    )
  }
  return value
}

// TRNAMT do OFX é sempre decimal com ponto (nunca vírgula, nunca separador
// de milhar — ao contrário do formato BRL de `money.ts`/`parseBRL`, que
// espera vírgula decimal e ponto de milhar). Por isso não reusa `parseBRL`:
// o formato não bate. Mesma técnica, porém — nunca `parseFloat`/`Number()`
// sobre a string decimal direto: monta a string de centavos como inteiro e
// só então converte, então não há float no caminho.
const OFX_AMOUNT = /^([+-])?(\d+)(?:\.(\d{1,2}))?$/

function parseOfxAmountCents(raw: string): number {
  const trimmed = raw.trim()
  const match = OFX_AMOUNT.exec(trimmed)
  if (match === null) {
    throw new Error(`OFX malformado: TRNAMT inválido: ${JSON.stringify(raw)}`)
  }
  const [, sign, intPart, decPart = ''] = match
  const cents = Number(intPart + decPart.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) {
    throw new Error(
      `OFX malformado: TRNAMT fora do alcance seguro: ${JSON.stringify(raw)}`,
    )
  }
  if (cents === 0) return 0
  return sign === '-' ? -cents : cents
}

// Bancos reais nem sempre preenchem <MEMO>: alguns usam <NAME> em vez dele,
// outros deixam <MEMO> vazio em lançamentos de tarifa. Exigir <MEMO> (como
// este parser fazia antes) derrubava o arquivo inteiro por causa de UMA
// transação sem a tag — o oposto do objetivo, que é funcionar com o
// extrato real do dono. Prioridade: MEMO → NAME → placeholder marcado;
// nunca lança por causa de descrição ausente.
function resolveDescription(bloco: string): string {
  const memo = extractField(bloco, 'MEMO')
  if (memo !== null && memo !== '') return memo
  const name = extractField(bloco, 'NAME')
  if (name !== null && name !== '') return name
  return '(sem descrição)'
}

// DTPOSTED é 'YYYYMMDDHHMMSS[fuso]' (o fuso é opcional e, quando presente,
// vem como '[-3:BRT]' ou similar). A data é tomada como escrita — os
// primeiros 8 dígitos — nunca reconstruída via `Date`/UTC. Um `Date`
// (mesmo com o offset já separado) reintroduz o mesmo bug que já mordeu
// este projeto: 22h em fuso -3 vira 01h UTC do dia seguinte.
const OFX_DATE = /^(\d{4})(\d{2})(\d{2})/

function parseOfxDate(raw: string): string {
  const match = OFX_DATE.exec(raw.trim())
  if (match === null) {
    throw new Error(`OFX malformado: DTPOSTED inválido: ${JSON.stringify(raw)}`)
  }
  const [, ano, mes, dia] = match
  return `${ano}-${mes}-${dia}`
}

export function parseOfx(texto: string): LinhaImportada[] {
  if (texto.trim() === '') return []

  if (!/<OFX>/i.test(texto)) {
    throw new Error(
      'OFX malformado: tag raiz <OFX> não encontrada — o arquivo não parece ser um extrato OFX',
    )
  }

  const blocos = texto.match(STMTTRN_BLOCK)
  if (blocos === null) return []

  return blocos.map((bloco) => {
    const fitid = requireField(bloco, 'FITID')
    const dtposted = requireField(bloco, 'DTPOSTED')
    const trnamt = requireField(bloco, 'TRNAMT')

    return {
      imported_id: fitid,
      purchase_date: parseOfxDate(dtposted),
      amount_cents: parseOfxAmountCents(trnamt),
      description: resolveDescription(bloco),
    }
  })
}
