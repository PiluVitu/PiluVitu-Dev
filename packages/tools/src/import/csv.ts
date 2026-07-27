import { parseBRL } from '../money'
import type { LinhaImportada } from './index'

// O dono mapeia as colunas uma vez por banco (spec §6) — não há
// autodetecção de layout, que erra em silêncio (a classe de defeito que
// este projeto passou a sessão inteira caçando). `temCabecalho` também é
// explícito pelo mesmo motivo: adivinhar se a primeira linha é cabeçalho
// corrompe a primeira transação em silêncio em vez de gritar um erro.
export type MapaColunas = {
  data: number
  valor: number
  descricao: number
  temCabecalho: boolean
}

// CSV não carrega um id natural (diferente do FITID do OFX), então
// `parseCsv` não tem como preencher `imported_id` sozinho — quem calcula é
// `idEstavel` (id.ts), que é assíncrono (WebCrypto `subtle.digest`) e por
// isso mora numa função separada, em vez de forçar `parseCsv` inteiro a
// virar `Promise` só por causa do hash. O chamador (task 3) faz
// `{ ...linha, imported_id: await idEstavel(linha) }` por linha.
export type LinhaCsv = Omit<LinhaImportada, 'imported_id'>

// Split CSV consciente de aspas (RFC4180): um campo entre aspas pode conter
// o delimitador (vírgula) e aspas duplicadas (`""` → `"` literal). Um
// `linha.split(',')` ingênuo corrompe qualquer linha com vírgula dentro de
// aspas — a descrição vira dois campos e todas as colunas seguintes (lidas
// por índice, ex. valor) passam a apontar pro pedaço errado. O dono veria
// um valor errado, não um erro.
function dividirLinhaCsv(linha: string): string[] {
  const campos: string[] = []
  let atual = ''
  let dentroDeAspas = false

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (dentroDeAspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') {
          atual += '"'
          i++
        } else {
          dentroDeAspas = false
        }
      } else {
        atual += c
      }
      continue
    }
    if (c === '"') {
      dentroDeAspas = true
    } else if (c === ',') {
      campos.push(atual)
      atual = ''
    } else {
      atual += c
    }
  }
  campos.push(atual)
  return campos
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/

// Data tomada como escrita — nunca reconstruída via `Date`/UTC. Mesmo
// motivo do `parseOfxDate` em ofx.ts: um `Date` reintroduz o bug que já
// deslocou uma compra feita às 22h pro dia seguinte.
function parseCsvData(bruto: string): string {
  const trimmed = bruto.trim()
  const iso = DATA_ISO.exec(trimmed)
  if (iso !== null) {
    const [, ano, mes, dia] = iso
    return `${ano}-${mes}-${dia}`
  }
  const br = DATA_BR.exec(trimmed)
  if (br !== null) {
    const [, dia, mes, ano] = br
    return `${ano}-${mes}-${dia}`
  }
  throw new Error(`CSV malformado: data inválida: ${JSON.stringify(bruto)}`)
}

// CSV brasileiro escreve negativo tanto com sinal ('-1.234,56') quanto com
// parênteses ('(1.234,56)', comum em fatura de cartão). O sinal `parseBRL`
// já resolve; os parênteses são despidos aqui antes de delegar — `parseBRL`
// é REUSADO, não reimplementado, pra converter o formato BRL em centavos
// inteiros sem passar por float.
function parseCsvValor(bruto: string): number {
  const trimmed = bruto.trim()
  const comParenteses = /^\((.*)\)$/.exec(trimmed)
  if (comParenteses !== null) {
    const cents = parseBRL(comParenteses[1])
    return cents === 0 ? 0 : -Math.abs(cents)
  }
  return parseBRL(trimmed)
}

export function parseCsv(texto: string, mapa: MapaColunas): LinhaCsv[] {
  if (texto.trim() === '') return []

  const todasAsLinhas = texto
    .split(/\r\n|\r|\n/)
    .filter((linha) => linha.trim() !== '')
  const linhasDeDados = mapa.temCabecalho
    ? todasAsLinhas.slice(1)
    : todasAsLinhas

  return linhasDeDados.map((linha) => {
    const campos = dividirLinhaCsv(linha)
    const dataBruta = campos[mapa.data]
    const valorBruto = campos[mapa.valor]
    const descricaoBruta = campos[mapa.descricao]

    if (
      dataBruta === undefined ||
      valorBruto === undefined ||
      descricaoBruta === undefined
    ) {
      throw new Error(
        `CSV malformado: linha tem menos colunas do que o mapa espera: ${JSON.stringify(linha)}`,
      )
    }

    return {
      purchase_date: parseCsvData(dataBruta),
      amount_cents: parseCsvValor(valorBruto),
      description: descricaoBruta.trim(),
    }
  })
}
