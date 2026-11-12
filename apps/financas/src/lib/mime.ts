import type { MensagemDeAlerta } from '../domain/alertas'

/**
 * Mensagem RFC 5322 + MIME do caminho Email Routing (EmailMessage com o raw),
 * montada sem dependência. Regras em "Alertas por e-mail" no CLAUDE.md.
 */

export const ENDERECO_INVALIDO = 'alertas_endereco_invalido'

export class EnderecoInvalido extends Error {
  readonly code = ENDERECO_INVALIDO
  constructor() {
    super('endereço de e-mail dos alertas inválido na configuração')
    this.name = 'EnderecoInvalido'
  }
}

const CRLF = '\r\n'
const BOUNDARY = '=_financas-alertas'
const MAX_BYTES_POR_PALAVRA = 39
const MAX_LINHA_BASE64 = 76

const ATOMO = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"
const DOT_ATOM = `${ATOMO}(?:\\.${ATOMO})*`
const ENDERECO = new RegExp(`^${DOT_ATOM}@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*$`)
const ID_DA_MENSAGEM = new RegExp(`^${DOT_ATOM}@${DOT_ATOM}$`)

const DIAS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MESES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function endereco(valor: string): string {
  if (!ENDERECO.test(valor)) throw new EnderecoInvalido()
  return valor
}

function base64(bytes: Uint8Array): string {
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binario)
}

/** RFC 2047: palavras de até 75 caracteres, sem partir um caractere UTF-8. */
function encodedWords(texto: string): string {
  const enc = new TextEncoder()
  const palavras: string[] = []
  let atual: number[] = []
  const fechar = () => {
    palavras.push(`=?UTF-8?B?${base64(Uint8Array.from(atual))}?=`)
    atual = []
  }
  for (const caractere of texto) {
    const bytes = enc.encode(caractere)
    if (atual.length + bytes.length > MAX_BYTES_POR_PALAVRA) fechar()
    atual.push(...bytes)
  }
  if (atual.length > 0) fechar()
  return palavras.join(`${CRLF} `)
}

function corpoBase64(texto: string): string {
  const canonico = texto.replace(/\r?\n/g, CRLF)
  const b64 = base64(new TextEncoder().encode(canonico))
  const linhas: string[] = []
  for (let i = 0; i < b64.length; i += MAX_LINHA_BASE64) {
    linhas.push(b64.slice(i, i + MAX_LINHA_BASE64))
  }
  return linhas.join(CRLF)
}

function dataRfc5322(data: Date): string {
  if (Number.isNaN(data.getTime())) throw new RangeError('data inválida')
  const dois = (n: number) => String(n).padStart(2, '0')
  return (
    `${DIAS[data.getUTCDay()]}, ${dois(data.getUTCDate())} ` +
    `${MESES[data.getUTCMonth()]} ${data.getUTCFullYear()} ` +
    `${dois(data.getUTCHours())}:${dois(data.getUTCMinutes())}:${dois(data.getUTCSeconds())} +0000`
  )
}

function parte(tipo: 'text/plain' | 'text/html', conteudo: string): string {
  return [
    `--${BOUNDARY}`,
    `Content-Type: ${tipo}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    corpoBase64(conteudo),
  ].join(CRLF)
}

export function montarMime(
  msg: MensagemDeAlerta,
  { data, messageId }: { data: Date; messageId: string },
): string {
  const de = endereco(msg.from.email)
  const para = endereco(msg.to)
  if (!ID_DA_MENSAGEM.test(messageId)) {
    throw new RangeError('Message-ID inválido')
  }
  const nome = encodedWords(msg.from.name)
  return [
    `From: ${nome ? `${nome} ` : ''}<${de}>`,
    `To: ${para}`,
    `Subject: ${encodedWords(msg.subject)}`,
    `Date: ${dataRfc5322(data)}`,
    `Message-ID: <${messageId}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${BOUNDARY}"`,
    '',
    parte('text/plain', msg.text),
    parte('text/html', msg.html),
    `--${BOUNDARY}--`,
    '',
  ].join(CRLF)
}
