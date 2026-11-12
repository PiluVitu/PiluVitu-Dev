/**
 * MIME montado à mão para o caminho Email Routing (EmailMessage com o raw).
 * Sem dependência (o exemplo da Cloudflare usa mimetext; aqui não entra
 * pacote novo), então o teste decodifica o que foi montado e confere byte a
 * byte. Endereços fictícios.
 */
import { describe, expect, it } from 'vitest'
import type { MensagemDeAlerta } from '../domain/alertas'
import { ENDERECO_INVALIDO, montarMime } from './mime'

const DATA = new Date('2026-08-10T09:00:00Z')
const MESSAGE_ID = '6f1c2d3e-0000-4000-8000-000000000001@exemplo.test'

function mensagem(parcial: Partial<MensagemDeAlerta> = {}): MensagemDeAlerta {
  return {
    to: 'dono@exemplo.test',
    from: { name: 'Finanças', email: 'alertas@exemplo.test' },
    subject: 'Orçamento: Mãe › Filha chegou a 81% do limite',
    text: 'Alertas do Finanças em 10/08/2026\n\nOrçamento de agosto de 2026\n- Mãe › Filha: R$ 81,00 de R$ 100,00 (81%). Perto do limite.\n',
    html: '<!doctype html>\n<html lang="pt-BR"><body><p>Mãe › Filha &amp; cia</p></body></html>',
    ...parcial,
  }
}

function montar(parcial: Partial<MensagemDeAlerta> = {}) {
  return montarMime(mensagem(parcial), { data: DATA, messageId: MESSAGE_ID })
}

/** Cabeçalhos do topo, desdobrados: cada dobra (CRLF + espaço) vira \u0000. */
function cabecalhos(raw: string): Map<string, string> {
  const topo = raw.slice(0, raw.indexOf('\r\n\r\n'))
  const mapa = new Map<string, string>()
  for (const linha of topo.replace(/\r\n /g, '\u0000').split('\r\n')) {
    const i = linha.indexOf(':')
    mapa.set(linha.slice(0, i), linha.slice(i + 2))
  }
  return mapa
}

function decodificarBase64(b64: string): string {
  const bin = atob(b64)
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** RFC 2047: o espaço entre duas encoded-words some na decodificação. */
function decodificarPalavras(valor: string): string {
  const palavras = valor.split('\u0000')
  return palavras
    .map((p) => {
      const m = /^=\?UTF-8\?B\?([A-Za-z0-9+/=]*)\?=/.exec(p.trim())
      if (!m) throw new Error(`não é encoded-word: ${p}`)
      return decodificarBase64(m[1])
    })
    .join('')
}

function palavrasDe(valor: string): string[] {
  return valor
    .split('\u0000')
    .map((p) => /=\?UTF-8\?B\?[A-Za-z0-9+/=]*\?=/.exec(p)?.[0] ?? '')
}

function boundaryDe(raw: string): string {
  const tipo = cabecalhos(raw).get('Content-Type') ?? ''
  const b = /boundary="([^"]+)"/.exec(tipo)?.[1]
  if (!b) throw new Error('sem boundary')
  return b
}

function partes(raw: string): Array<{ cabecalhos: string; corpo: string }> {
  const b = boundaryDe(raw)
  const corpo = raw.slice(raw.indexOf('\r\n\r\n') + 4)
  const fim = corpo.indexOf(`\r\n--${b}--`)
  return corpo
    .slice(0, fim)
    .split(`--${b}\r\n`)
    .slice(1)
    .map((p) => {
      const i = p.indexOf('\r\n\r\n')
      return { cabecalhos: p.slice(0, i), corpo: p.slice(i + 4) }
    })
}

describe('montarMime — estrutura', () => {
  it('todo fim de linha é CRLF: nenhum \\n solto nem \\r solto', () => {
    const raw = montar()
    expect(raw).not.toMatch(/[^\r]\n/)
    expect(raw).not.toMatch(/\r[^\n]/)
    expect(raw.endsWith('\r\n')).toBe(true)
  })

  it('nenhuma linha passa de 998 octetos, e as do corpo em base64 de 76', () => {
    const textoLongo = `${'Lançamento muito longo, '.repeat(200)}\n`
    const raw = montar({ text: textoLongo, html: `<p>${textoLongo}</p>` })
    const enc = new TextEncoder()
    for (const linha of raw.split('\r\n')) {
      expect(enc.encode(linha).length).toBeLessThanOrEqual(998)
    }
    for (const parte of partes(raw)) {
      for (const linha of parte.corpo.split('\r\n')) {
        expect(linha.length).toBeLessThanOrEqual(76)
      }
    }
  })

  it('cabeçalhos: From com nome em encoded-word, To, Date RFC 5322 em +0000, Message-ID e MIME-Version', () => {
    const h = cabecalhos(montar())
    expect(h.get('From')).toBe(
      '=?UTF-8?B?RmluYW7Dp2Fz?= <alertas@exemplo.test>',
    )
    expect(h.get('To')).toBe('dono@exemplo.test')
    expect(h.get('Date')).toBe('Mon, 10 Aug 2026 09:00:00 +0000')
    expect(h.get('Message-ID')).toBe(`<${MESSAGE_ID}>`)
    expect(h.get('MIME-Version')).toBe('1.0')
  })

  it('Date usa o instante injetado em UTC, com dia e hora de dois dígitos', () => {
    const raw = montarMime(mensagem(), {
      data: new Date('2027-01-03T23:05:09.999Z'),
      messageId: MESSAGE_ID,
    })
    expect(cabecalhos(raw).get('Date')).toBe('Sun, 03 Jan 2027 23:05:09 +0000')
  })

  it('multipart/alternative com boundary fora do alfabeto do base64 (começa com "=_")', () => {
    const raw = montar()
    const b = boundaryDe(raw)
    expect(cabecalhos(raw).get('Content-Type')).toBe(
      `multipart/alternative; boundary="${b}"`,
    )
    expect(b.startsWith('=_')).toBe(true)
    for (const parte of partes(raw)) {
      expect(parte.corpo).not.toContain(b)
    }
    expect(raw).toContain(`\r\n--${b}--\r\n`)
  })

  // RFC 2045 §6.8 e RFC 2046 §4.1.1: texto vai ao base64 na forma canônica,
  // com CRLF. Decodificar devolve text e html com cada \n trocado por \r\n.
  it('duas partes, text/plain e text/html, ambas UTF-8 em base64, e decodificar devolve text e html na forma canônica (CRLF)', () => {
    const msg = mensagem()
    const [texto, html, sobra] = partes(montar())
    expect(sobra).toBeUndefined()
    expect(texto.cabecalhos).toBe(
      'Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64',
    )
    expect(html.cabecalhos).toBe(
      'Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64',
    )
    expect(decodificarBase64(texto.corpo.replace(/\r\n/g, ''))).toBe(
      msg.text.replace(/\n/g, '\r\n'),
    )
    expect(decodificarBase64(html.corpo.replace(/\r\n/g, ''))).toBe(
      msg.html.replace(/\n/g, '\r\n'),
    )
  })

  it('texto que já vem com CRLF, ou misturado, não ganha \\r a mais', () => {
    const [texto] = partes(montar({ text: 'linha1\r\nlinha2\nlinha3\r\n' }))
    expect(decodificarBase64(texto.corpo.replace(/\r\n/g, ''))).toBe(
      'linha1\r\nlinha2\r\nlinha3\r\n',
    )
  })
})

describe('montarMime — assunto e nome em encoded-word', () => {
  it('o assunto decodificado devolve o original, com acentos e "›"', () => {
    const subject = 'Orçamento: Mãe › Filha chegou a 81% do limite'
    expect(
      decodificarPalavras(cabecalhos(montar({ subject })).get('Subject') ?? ''),
    ).toBe(subject)
  })

  it('assunto longo: várias encoded-words de até 75 caracteres, dobradas com CRLF + espaço, linhas de até 76', () => {
    const subject = `Fatura do ${'Cartão Ação Ñandu 💳 '.repeat(8)}vence amanhã`
    const raw = montar({ subject })
    const valor = cabecalhos(raw).get('Subject') ?? ''
    const palavras = palavrasDe(valor)
    expect(palavras.length).toBeGreaterThan(2)
    for (const p of palavras) expect(p.length).toBeLessThanOrEqual(75)
    expect(decodificarPalavras(valor)).toBe(subject)

    const topo = raw.slice(0, raw.indexOf('\r\n\r\n')).split('\r\n')
    const inicio = topo.findIndex((l) => l.startsWith('Subject: '))
    const linhasDoAssunto = [topo[inicio]]
    for (let i = inicio + 1; topo[i]?.startsWith(' '); i++) {
      linhasDoAssunto.push(topo[i])
    }
    expect(linhasDoAssunto).toHaveLength(palavras.length)
    for (const l of linhasDoAssunto) expect(l.length).toBeLessThanOrEqual(76)
  })

  it('nenhuma encoded-word parte um caractere UTF-8 no meio: cada uma decodifica sozinha', () => {
    const subject = 'ç'.repeat(100) + '💳'.repeat(30)
    for (const p of palavrasDe(
      cabecalhos(montar({ subject })).get('Subject') ?? '',
    )) {
      const b64 = /^=\?UTF-8\?B\?(.*)\?=$/.exec(p)?.[1] ?? ''
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
      expect(() =>
        new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      ).not.toThrow()
    }
  })

  it('nome do remetente longo também é dobrado e decodifica igual', () => {
    const name = 'Finanças — alertas do orçamento e das faturas de cartão'
    const valor =
      cabecalhos(montar({ from: { name, email: 'alertas@exemplo.test' } })).get(
        'From',
      ) ?? ''
    expect(valor.endsWith(' <alertas@exemplo.test>')).toBe(true)
    expect(decodificarPalavras(valor.slice(0, valor.lastIndexOf(' <')))).toBe(
      name,
    )
  })

  // Assunto e nome vêm de dado do usuário (nome de categoria e de cartão).
  // Em encoded-word, um \r\n vira base64: não existe linha nova no cabeçalho.
  it('tentativa de injeção no assunto e no nome fica dentro do encoded-word', () => {
    const raw = montar({
      subject: 'Mercado\r\nBcc: x@y.test',
      from: {
        name: 'Finanças\r\nBcc: x@y.test',
        email: 'alertas@exemplo.test',
      },
    })
    expect(raw).not.toMatch(/^Bcc:/im)
    expect(raw).not.toContain('x@y.test')
    const h = cabecalhos(raw)
    expect(decodificarPalavras(h.get('Subject') ?? '')).toBe(
      'Mercado\r\nBcc: x@y.test',
    )
  })

  it('assunto só ASCII também vai em encoded-word (nenhum dado cru no cabeçalho)', () => {
    expect(
      cabecalhos(montar({ subject: 'Finanças: 2 alertas de hoje' })).get(
        'Subject',
      ),
    ).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/)
    expect(cabecalhos(montar({ subject: 'Plain ASCII' })).get('Subject')).toBe(
      '=?UTF-8?B?UGxhaW4gQVNDSUk=?=',
    )
  })
})

describe('montarMime — endereços (vêm do env, mas são conferidos)', () => {
  it.each([
    ['com espaço', 'dono @exemplo.test'],
    ['com \\r\\n', 'dono@exemplo.test\r\nBcc: x@y.test'],
    ['com caractere de controle', 'dono\u0007@exemplo.test'],
    ['com "<"', '<dono@exemplo.test'],
    ['com ">"', 'dono@exemplo.test>'],
    ['sem "@"', 'dono.exemplo.test'],
    ['com dois "@"', 'dono@outro@exemplo.test'],
    ['vazio', ''],
    ['com vírgula (dois destinatários)', 'a,dono@exemplo.test'],
  ])(
    'destinatário %s: lança com code alertas_endereco_invalido, sem o endereço na mensagem',
    (_rotulo, to) => {
      let erro: unknown
      try {
        montar({ to })
      } catch (e) {
        erro = e
      }
      expect(erro).toBeInstanceOf(Error)
      expect((erro as { code?: string }).code).toBe(ENDERECO_INVALIDO)
      expect(ENDERECO_INVALIDO).toBe('alertas_endereco_invalido')
      if (to.length > 0) expect((erro as Error).message).not.toContain(to)
    },
  )

  it('remetente inválido também lança', () => {
    expect(() =>
      montar({
        from: { name: 'Finanças', email: 'alertas@exemplo.test\r\nBcc: x@y' },
      }),
    ).toThrow(expect.objectContaining({ code: ENDERECO_INVALIDO }))
  })

  it('Message-ID fora do formato id@domínio é recusado', () => {
    expect(() =>
      montarMime(mensagem(), { data: DATA, messageId: 'sem-arroba' }),
    ).toThrow(RangeError)
    expect(() =>
      montarMime(mensagem(), { data: DATA, messageId: 'a@b\r\nBcc: x@y' }),
    ).toThrow(RangeError)
  })

  it('data inválida é recusada', () => {
    expect(() =>
      montarMime(mensagem(), {
        data: new Date(Number.NaN),
        messageId: MESSAGE_ID,
      }),
    ).toThrow(RangeError)
  })
})
