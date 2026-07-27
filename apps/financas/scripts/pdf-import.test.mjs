// Testes do CLI de fatura em PDF (fatia ③). Roda sob `vitest.scripts.config.ts`
// (environment: 'node', SEM o pool do Miniflare/cloudflareTest do resto do
// app) — o CLI é Node puro, fora do Worker de propósito (ver cabeçalho de
// pdf-import.mjs). `node --test` puro NÃO serve aqui: a resolução nativa do
// Node não entende os imports relativos sem extensão de
// packages/tools/src/*.ts (`../money`) que @piluvitu/tools usa — MEDIDO,
// ERR_MODULE_NOT_FOUND. O Vitest resolve isso do mesmo jeito que já resolve
// pra `web/`, então esta suíte usa a mesma ferramenta, só com config própria.
//
// Nada aqui chama o Ollama de verdade: a chamada é sempre stubada via
// injeção de dependência (`fetchImpl`/`extractText`/`readFile`/`writeFile`
// em `run()`).
//
// Rodar: pnpm --filter @piluvitu/financas run test:pdf-import

import { describe, test, expect } from 'vitest'
import { parseCsv } from '@piluvitu/tools/import/csv'
import { idEstavel } from '@piluvitu/tools/import/id'
import {
  extractJsonBlock,
  normalizeLinesPayload,
  parseStatementDate,
  amountFromStatementText,
  validateLine,
  validateLines,
  linesToCsv,
  extractPdfText,
  callOllama,
  parseArgs,
  defaultOutputPath,
  buildPrompt,
  run,
  DEFAULT_MODEL,
} from './pdf-import.mjs'

// ---------------------------------------------------------------------
// Helper: monta um PDF mínimo válido (sem depender de nenhuma lib) — o
// bastante pra testar extração real via pdfjs-dist sem precisar de um
// arquivo de fixture binário versionado.
// ---------------------------------------------------------------------
function buildMinimalPdf(linhasDeTexto, { comConteudo = true } = {}) {
  const content = comConteudo
    ? linhasDeTexto
        .map(
          (l, i) =>
            `BT /F1 10 Tf 50 ${750 - i * 14} Td (${l.replace(/[()\\]/g, (c) => '\\' + c)}) Tj ET`,
        )
        .join('\n')
    : ''

  const objects = []
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
  )
  objects.push(
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  )
  const streamBytes = Buffer.byteLength(content, 'latin1')
  objects.push(
    `5 0 obj\n<< /Length ${streamBytes} >>\nstream\n${content}\nendstream\nendobj\n`,
  )

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += obj
  }
  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let i = 1; i <= objects.length; i++) {
    pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n'
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return Buffer.from(pdf, 'latin1')
}

// ---------------------------------------------------------------------
// extractJsonBlock — JSON de LLM não é JSON até ser validado
// ---------------------------------------------------------------------
describe('extractJsonBlock', () => {
  test('array JSON puro, sem nada em volta', () => {
    expect(extractJsonBlock('[{"a":1}]')).toBe('[{"a":1}]')
  })

  test('extrai de dentro de cercas ```json ... ```', () => {
    const bruto = 'aqui está:\n```json\n[{"a":1}]\n```\nprontinho'
    expect(extractJsonBlock(bruto)).toBe('[{"a":1}]')
  })

  test('extrai de dentro de cercas ``` sem linguagem', () => {
    const bruto = '```\n[{"a":1}]\n```'
    expect(extractJsonBlock(bruto)).toBe('[{"a":1}]')
  })

  test('extrai com prosa antes e depois, sem cerca nenhuma', () => {
    const bruto =
      'Aqui estão os lançamentos extraídos: [{"a":1},{"b":2}] Espero ter ajudado!'
    expect(extractJsonBlock(bruto)).toBe('[{"a":1},{"b":2}]')
  })

  test('respeita chave/colchete dentro de string', () => {
    const bruto = '[{"descricao":"Loja [Centro] {SP}"}]'
    const bloco = extractJsonBlock(bruto)
    expect(JSON.parse(bloco)).toEqual([{ descricao: 'Loja [Centro] {SP}' }])
  })

  test('objeto no topo (não array) também é extraído', () => {
    const bruto = 'resposta: {"linhas":[{"a":1}]} fim'
    expect(extractJsonBlock(bruto)).toBe('{"linhas":[{"a":1}]}')
  })

  test('lança quando não há bloco JSON nenhum', () => {
    expect(() =>
      extractJsonBlock('desculpe, não consegui ler a fatura.'),
    ).toThrow(/nenhum bloco JSON/)
  })

  test('lança quando o bloco JSON nunca fecha (resposta cortada)', () => {
    expect(() => extractJsonBlock('[{"a":1},{"b":2}')).toThrow(
      /nenhum bloco JSON/,
    )
  })
})

// ---------------------------------------------------------------------
// normalizeLinesPayload
// ---------------------------------------------------------------------
describe('normalizeLinesPayload', () => {
  test('array passa direto', () => {
    expect(normalizeLinesPayload([{ a: 1 }])).toEqual([{ a: 1 }])
  })

  test('objeto com chave "linhas"', () => {
    expect(normalizeLinesPayload({ linhas: [{ a: 1 }] })).toEqual([{ a: 1 }])
  })

  test('objeto com chave "lines" (inglês)', () => {
    expect(normalizeLinesPayload({ lines: [{ a: 1 }] })).toEqual([{ a: 1 }])
  })

  test('objeto com chave desconhecida mas único valor-array', () => {
    expect(normalizeLinesPayload({ resultado: [{ a: 1 }] })).toEqual([{ a: 1 }])
  })

  test('lança quando não há array em lugar nenhum', () => {
    expect(() => normalizeLinesPayload({ total: 100 })).toThrow(
      /não é uma lista/,
    )
  })

  test('lança para valor primitivo', () => {
    expect(() => normalizeLinesPayload('oi')).toThrow(/não é uma lista/)
  })
})

// ---------------------------------------------------------------------
// parseStatementDate — rejeita, nunca chuta
// ---------------------------------------------------------------------
describe('parseStatementDate', () => {
  test('ISO', () => {
    expect(parseStatementDate('2026-07-28')).toBe('2026-07-28')
  })

  test('BR com barra', () => {
    expect(parseStatementDate('28/07/2026')).toBe('2026-07-28')
  })

  test('BR com traço', () => {
    expect(parseStatementDate('28-07-2026')).toBe('2026-07-28')
  })

  test('29 de fevereiro em ano bissexto é aceito', () => {
    expect(parseStatementDate('29/02/2028')).toBe('2028-02-29')
  })

  test('29 de fevereiro em ano NÃO bissexto é rejeitado', () => {
    expect(() => parseStatementDate('29/02/2026')).toThrow(
      /não existe no calendário/,
    )
  })

  test('31 de fevereiro é rejeitado (mês existe, dia não)', () => {
    expect(() => parseStatementDate('31/02/2026')).toThrow(
      /não existe no calendário/,
    )
  })

  test('mês 13 é rejeitado', () => {
    expect(() => parseStatementDate('01/13/2026')).toThrow(
      /não existe no calendário/,
    )
  })

  test('formato não reconhecido (data por extenso) é rejeitado', () => {
    expect(() => parseStatementDate('28 de julho de 2026')).toThrow(
      /formato de data não reconhecido/,
    )
  })

  test('string vazia é rejeitada', () => {
    expect(() => parseStatementDate('')).toThrow(
      /formato de data não reconhecido/,
    )
  })
})

// ---------------------------------------------------------------------
// amountFromStatementText — parseBRL é reusado, nunca reimplementado;
// dinheiro nunca passa por float
// ---------------------------------------------------------------------
describe('amountFromStatementText', () => {
  test('valor simples sem sinal vira DESPESA (negativo) — convenção de fatura', () => {
    expect(amountFromStatementText('R$ 32,50')).toBe(-3250)
  })

  test('valor com milhar', () => {
    expect(amountFromStatementText('R$ 1.234,56')).toBe(-123456)
  })

  test('sem "R$", só o número', () => {
    expect(amountFromStatementText('189,90')).toBe(-18990)
  })

  test('valor com sinal negativo explícito vira CRÉDITO (positivo)', () => {
    expect(amountFromStatementText('-R$ 50,00')).toBe(5000)
  })

  test('valor entre parênteses vira CRÉDITO (positivo)', () => {
    expect(amountFromStatementText('(R$ 50,00)')).toBe(5000)
  })

  test('sinal negativo DEPOIS do "R$" também vira CRÉDITO — achado do run real contra o Ollama', () => {
    // qwen2.5:7b-instruct devolveu "R$ -35,00" (não "-R$ 35,00") pra um
    // estorno de um PDF de teste real — parseBRL sozinho rejeita essa
    // forma (só aceita sinal ANTES do "R$").
    expect(amountFromStatementText('R$ -35,00')).toBe(3500)
  })

  test('19,99 é EXATAMENTE -1999 — nunca passa por multiplicação de float', () => {
    // 19.99 * 100 é 1998.9999999999998 em IEEE754 (MEDIDO) — a prova de que
    // isto passa por parseBRL (aritmética de string) e não por float.
    expect(amountFromStatementText('19,99')).toBe(-1999)
    expect(19.99 * 100).not.toBe(1999) // documenta a armadilha que estamos evitando
  })

  test('texto que não é valor monetário lança', () => {
    expect(() => amountFromStatementText('grátis')).toThrow(RangeError)
  })
})

// ---------------------------------------------------------------------
// validateLine / validateLines — linha rejeitada é NOMEADA, nunca some
// ---------------------------------------------------------------------
describe('validateLine', () => {
  test('linha válida', () => {
    const r = validateLine(
      { data: '28/07/2026', descricao: 'Uber', valor: 'R$ 32,50' },
      0,
    )
    expect(r.ok).toBe(true)
    expect(r.line).toEqual({
      purchase_date: '2026-07-28',
      amount_cents: -3250,
      description: 'Uber',
    })
  })

  test('aceita chaves em inglês (date/description/amount)', () => {
    const r = validateLine(
      { date: '28/07/2026', description: 'Uber', amount: 'R$ 32,50' },
      0,
    )
    expect(r.ok).toBe(true)
    expect(r.line.description).toBe('Uber')
  })

  test('campo de data ausente é rejeitado e nomeado', () => {
    const r = validateLine({ descricao: 'Uber', valor: 'R$ 32,50' }, 3)
    expect(r.ok).toBe(false)
    expect(r.index).toBe(3)
    expect(r.reason).toMatch(/data ausente/)
  })

  test('descrição vazia é rejeitada', () => {
    const r = validateLine(
      { data: '28/07/2026', descricao: '  ', valor: 'R$ 32,50' },
      0,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/descrição ausente ou vazio/)
  })

  test('quebra de linha embutida na descrição é colapsada — protege o CSV contra parseCsv quebrando a linha', () => {
    const r = validateLine(
      {
        data: '28/07/2026',
        descricao: 'Uber\nTrip  Sao\r\nPaulo',
        valor: 'R$ 32,50',
      },
      0,
    )
    expect(r.ok).toBe(true)
    expect(r.line.description).toBe('Uber Trip Sao Paulo')
  })

  test('campo de valor ausente é rejeitado', () => {
    const r = validateLine({ data: '28/07/2026', descricao: 'Uber' }, 0)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/valor ausente/)
  })

  test('data em formato inválido é rejeitada com o motivo', () => {
    const r = validateLine(
      { data: '2026/07/28x', descricao: 'Uber', valor: 'R$ 1,00' },
      0,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/data inválida/)
  })

  test('data calendarialmente impossível é rejeitada', () => {
    const r = validateLine(
      { data: '31/02/2026', descricao: 'Uber', valor: 'R$ 1,00' },
      0,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/data inválida/)
  })

  test('valor não numérico é rejeitado com o motivo', () => {
    const r = validateLine(
      { data: '28/07/2026', descricao: 'Uber', valor: 'de graça' },
      0,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/valor inválido/)
  })

  test('valor zero é rejeitado', () => {
    const r = validateLine(
      { data: '28/07/2026', descricao: 'Uber', valor: 'R$ 0,00' },
      0,
    )
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/não pode ser zero/)
  })

  test('linha que não é objeto é rejeitada', () => {
    const r = validateLine('não sou um objeto', 0)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/não é um objeto JSON/)
  })

  test('linha null é rejeitada', () => {
    const r = validateLine(null, 0)
    expect(r.ok).toBe(false)
  })
})

describe('validateLines', () => {
  test('separa válidas de rejeitadas, preservando o índice original', () => {
    const bruto = [
      { data: '28/07/2026', descricao: 'Uber', valor: 'R$ 32,50' },
      { data: 'data-quebrada', descricao: 'Padaria', valor: 'R$ 8,00' },
      { data: '27/07/2026', descricao: 'Netflix', valor: 'R$ 55,90' },
    ]
    const { valid, errors } = validateLines(bruto)
    expect(valid.length).toBe(2)
    expect(errors.length).toBe(1)
    expect(errors[0].index).toBe(1)
    expect(valid[0].description).toBe('Uber')
    expect(valid[1].description).toBe('Netflix')
  })

  test('zero linhas válidas quando todas falham', () => {
    const { valid, errors } = validateLines([
      { descricao: 'sem data nem valor' },
    ])
    expect(valid.length).toBe(0)
    expect(errors.length).toBe(1)
  })

  test('lista vazia produz duas listas vazias', () => {
    const { valid, errors } = validateLines([])
    expect(valid).toEqual([])
    expect(errors).toEqual([])
  })
})

// ---------------------------------------------------------------------
// linesToCsv — a prova real é que packages/tools/src/import/csv.ts
// consegue reler o que este CLI escreve, sem nenhum ajuste
// ---------------------------------------------------------------------
describe('linesToCsv', () => {
  const linhas = [
    {
      purchase_date: '2026-07-28',
      amount_cents: -3250,
      description: 'Uber Trip',
    },
    {
      purchase_date: '2026-07-27',
      amount_cents: -18990,
      description: 'Loja; com ponto-e-vírgula',
    },
    {
      purchase_date: '2026-07-20',
      amount_cents: 5000,
      description: 'Estorno "parcial"',
    },
  ]

  test('cabeçalho e formato', () => {
    const csv = linesToCsv(linhas)
    const [cabecalho] = csv.split('\r\n')
    expect(cabecalho).toBe('data;descricao;valor')
  })

  test('usa ; como delimitador — decisão documentada (vírgula é decimal do BRL)', () => {
    const csv = linesToCsv(linhas)
    expect(csv).toContain('2026-07-28;"Uber Trip";-R$ 32,50')
  })

  test('descrição é escapada quando contém o delimitador ou aspas', () => {
    const csv = linesToCsv(linhas)
    expect(csv).toContain('"Loja; com ponto-e-vírgula"')
    expect(csv).toContain('"Estorno ""parcial"""')
  })

  test('round-trip completo pelo parseCsv real da fatia ② — a prova de que #/importar leria isto sem ajuste', async () => {
    const csv = linesToCsv(linhas)
    const mapa = { data: 0, descricao: 1, valor: 2, temCabecalho: true }
    const parseadas = parseCsv(csv, mapa)

    expect(parseadas.length).toBe(linhas.length)
    for (let i = 0; i < linhas.length; i++) {
      expect(parseadas[i].purchase_date).toBe(linhas[i].purchase_date)
      expect(parseadas[i].amount_cents).toBe(linhas[i].amount_cents)
      expect(parseadas[i].description).toBe(linhas[i].description)
    }

    // idEstavel (id.ts) é o que a tela de conferência chama pra cada linha
    // de CSV antes de montar a conferência — confirma que também não
    // lança pra nenhuma das três linhas.
    for (const linha of parseadas) {
      const id = await idEstavel(linha)
      expect(typeof id).toBe('string')
      expect(id.length).toBe(64) // hex de SHA-256
    }
  })

  test('CSV de uma única linha ainda é lido corretamente (sem linha extra vazia confundindo o parser)', () => {
    const csv = linesToCsv([
      { purchase_date: '2026-01-01', amount_cents: -100, description: 'Café' },
    ])
    const parseadas = parseCsv(csv, {
      data: 0,
      descricao: 1,
      valor: 2,
      temCabecalho: true,
    })
    expect(parseadas.length).toBe(1)
    expect(parseadas[0].amount_cents).toBe(-100)
  })
})

// ---------------------------------------------------------------------
// extractPdfText — determinístico, não chama o Ollama
// ---------------------------------------------------------------------
describe('extractPdfText', () => {
  test('extrai texto de um PDF real, preservando quebra de linha por lançamento', async () => {
    const pdf = buildMinimalPdf([
      'FATURA CARTAO DE CREDITO',
      '28/07/2026 UBER TRIP SAO PAULO       R$ 32,50',
      '27/07/2026 SUPERMERCADO EXTRA        R$ 189,90',
    ])
    const texto = await extractPdfText(pdf)
    const linhas = texto.split('\n').map((l) => l.trim())
    expect(linhas).toContain('FATURA CARTAO DE CREDITO')
    expect(
      linhas.some(
        (l) => l.includes('UBER TRIP SAO PAULO') && l.includes('R$ 32,50'),
      ),
    ).toBe(true)
    expect(
      linhas.some(
        (l) => l.includes('SUPERMERCADO EXTRA') && l.includes('R$ 189,90'),
      ),
    ).toBe(true)
  })

  test('PDF sem camada de texto (página com conteúdo vazio) devolve texto vazio', async () => {
    const pdf = buildMinimalPdf([], { comConteudo: false })
    const texto = await extractPdfText(pdf)
    expect(texto.trim()).toBe('')
  })

  test('PDF corrompido/inválido lança em vez de travar', async () => {
    await expect(extractPdfText(Buffer.from([1, 2, 3, 4]))).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------
// callOllama — Ollama desligado / modelo não instalado dizem COMO agir,
// nunca um ECONNREFUSED cru
// ---------------------------------------------------------------------
describe('callOllama', () => {
  test('caminho feliz: devolve payload.response', async () => {
    const fetchImpl = async (url, init) => {
      expect(url).toBe('http://localhost:11434/api/generate')
      const body = JSON.parse(init.body)
      expect(body.model).toBe('qwen2.5:7b-instruct')
      expect(body.stream).toBe(false)
      expect(body.options.temperature).toBe(0) // temperatura zero, sempre
      return {
        ok: true,
        json: async () => ({ response: '[{"a":1}]' }),
      }
    }
    const resposta = await callOllama({
      model: 'qwen2.5:7b-instruct',
      prompt: 'oi',
      fetchImpl,
    })
    expect(resposta).toBe('[{"a":1}]')
  })

  test('conexão recusada vira mensagem de como ligar o Ollama, não ECONNREFUSED cru', async () => {
    const fetchImpl = async () => {
      const err = new TypeError('fetch failed')
      err.cause = { code: 'ECONNREFUSED' }
      throw err
    }
    await expect(
      callOllama({ model: 'x', prompt: 'y', fetchImpl }),
    ).rejects.toThrow(/ollama serve/i)
  })

  test('404 "not found" vira mensagem citando "ollama pull <modelo>"', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () =>
        JSON.stringify({ error: "model 'qwen2.5:1b' not found" }),
    })
    await expect(
      callOllama({ model: 'qwen2.5:1b', prompt: 'y', fetchImpl }),
    ).rejects.toThrow(/ollama pull qwen2\.5:1b/)
  })

  test('outro erro HTTP qualquer vira mensagem com status, sem esconder o corpo', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'deu ruim',
    })
    await expect(
      callOllama({ model: 'x', prompt: 'y', fetchImpl }),
    ).rejects.toThrow(/500/)
  })

  test('resposta sem o campo "response" lança em vez de devolver undefined', async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ outra_coisa: 1 }),
    })
    await expect(
      callOllama({ model: 'x', prompt: 'y', fetchImpl }),
    ).rejects.toThrow(/"response"/)
  })
})

// ---------------------------------------------------------------------
// buildPrompt — só confirma que o texto da fatura entra no prompt (não
// testa qualidade de prompt engineering, isso não é determinístico)
// ---------------------------------------------------------------------
describe('buildPrompt', () => {
  test('inclui o texto da fatura e pede JSON', () => {
    const prompt = buildPrompt('28/07/2026 UBER R$ 32,50')
    expect(prompt).toContain('28/07/2026 UBER R$ 32,50')
    expect(prompt).toContain('JSON')
  })
})

// ---------------------------------------------------------------------
// parseArgs / defaultOutputPath
// ---------------------------------------------------------------------
describe('parseArgs', () => {
  test('só o caminho do PDF', () => {
    const args = parseArgs(['fatura.pdf'])
    expect(args.pdfPath).toBe('fatura.pdf')
    expect(args.model).toBe(DEFAULT_MODEL)
    expect(args.error).toBe(null)
  })

  test('--modelo troca o modelo default', () => {
    const args = parseArgs(['fatura.pdf', '--modelo', 'qwen2.5:3b-instruct'])
    expect(args.model).toBe('qwen2.5:3b-instruct')
  })

  test('--saida define o caminho de saída', () => {
    const args = parseArgs(['fatura.pdf', '--saida', '/tmp/saida.csv'])
    expect(args.output).toBe('/tmp/saida.csv')
  })

  test('--help não exige caminho de PDF', () => {
    const args = parseArgs(['--help'])
    expect(args.help).toBe(true)
  })

  test('flag sem valor vira erro explícito, nunca um default silencioso', () => {
    const args = parseArgs(['fatura.pdf', '--saida'])
    expect(args.error).toMatch(/--saida precisa de um valor/)
  })
})

describe('defaultOutputPath', () => {
  test('troca a extensão .pdf por .csv mantendo o diretório', () => {
    expect(defaultOutputPath('/tmp/faturas/nubank.pdf')).toBe(
      '/tmp/faturas/nubank.csv',
    )
  })

  test('sem diretório', () => {
    expect(defaultOutputPath('fatura.pdf')).toBe('fatura.csv')
  })
})

// ---------------------------------------------------------------------
// run() — orquestração ponta a ponta, com Ollama e I/O sempre stubados
// ---------------------------------------------------------------------
describe('run', () => {
  function fetchImplComResposta(respostaBruta) {
    return async () => ({
      ok: true,
      json: async () => ({ response: respostaBruta }),
    })
  }

  test('caminho feliz: lê PDF stubado, chama Ollama stubado, grava CSV válido, devolve 0', async () => {
    const logs = []
    const errs = []
    let escrito = null

    const codigo = await run(['fatura.pdf'], {
      readFile: () => Buffer.from('bytes-do-pdf'),
      extractText: async () => '28/07/2026 UBER R$ 32,50',
      fetchImpl: fetchImplComResposta(
        '[{"data":"28/07/2026","descricao":"Uber","valor":"R$ 32,50"}]',
      ),
      writeFile: (caminho, conteudo) => {
        escrito = { caminho, conteudo }
      },
      log: (m) => logs.push(m),
      logError: (m) => errs.push(m),
    })

    expect(codigo).toBe(0)
    expect(escrito.caminho).toBe('fatura.csv')
    expect(escrito.conteudo).toContain('2026-07-28')
    expect(escrito.conteudo).toContain('-R$ 32,50')
    expect(
      logs.some((l) => l.includes('1 linha(s) válida(s), 0 rejeitada(s)')),
    ).toBe(true)
    expect(errs.length).toBe(0)
  })

  test('linha rejeitada é NOMEADA no log (índice + motivo), mesmo com outras linhas válidas', async () => {
    const errs = []
    const codigo = await run(['fatura.pdf'], {
      readFile: () => Buffer.from('x'),
      extractText: async () => 'texto',
      fetchImpl: fetchImplComResposta(
        JSON.stringify([
          { data: '28/07/2026', descricao: 'Uber', valor: 'R$ 32,50' },
          { data: 'lixo', descricao: 'Padaria', valor: 'R$ 8,00' },
        ]),
      ),
      writeFile: () => {},
      log: () => {},
      logError: (m) => errs.push(m),
    })

    expect(codigo).toBe(0) // ainda tem 1 linha válida
    expect(
      errs.some(
        (m) => m.includes('linha 2 rejeitada') && m.includes('data inválida'),
      ),
    ).toBe(true)
  })

  test('zero linhas válidas ⇒ código != 0, nada é escrito, saída bruta do modelo vai pro log', async () => {
    const errs = []
    let escreveu = false
    const respostaCrua = JSON.stringify([{ descricao: 'sem data nem valor' }])

    const codigo = await run(['fatura.pdf'], {
      readFile: () => Buffer.from('x'),
      extractText: async () => 'texto',
      fetchImpl: fetchImplComResposta(respostaCrua),
      writeFile: () => {
        escreveu = true
      },
      log: () => {},
      logError: (m) => errs.push(m),
    })

    expect(codigo).not.toBe(0)
    expect(escreveu).toBe(false)
    expect(errs.some((m) => m.includes('nenhuma linha válida'))).toBe(true)
    expect(errs.some((m) => m.includes(respostaCrua))).toBe(true)
  })

  test('resposta do modelo sem JSON nenhum ⇒ código != 0 com a saída bruta no log', async () => {
    const errs = []
    const codigo = await run(['fatura.pdf'], {
      readFile: () => Buffer.from('x'),
      extractText: async () => 'texto',
      fetchImpl: fetchImplComResposta('desculpe, não consigo processar isso.'),
      writeFile: () => {},
      log: () => {},
      logError: (m) => errs.push(m),
    })
    expect(codigo).not.toBe(0)
    expect(
      errs.some((m) => m.includes('desculpe, não consigo processar isso')),
    ).toBe(true)
  })

  test('PDF sem camada de texto para ANTES de chamar o Ollama, com mensagem clara', async () => {
    const errs = []
    let chamouOllama = false
    const codigo = await run(['escaneada.pdf'], {
      readFile: () => Buffer.from('x'),
      extractText: async () => '   \n  ',
      fetchImpl: async () => {
        chamouOllama = true
        return { ok: true, json: async () => ({ response: '[]' }) }
      },
      writeFile: () => {},
      log: () => {},
      logError: (m) => errs.push(m),
    })
    expect(codigo).not.toBe(0)
    expect(chamouOllama).toBe(false)
    expect(errs.some((m) => m.includes('não tem camada de texto'))).toBe(true)
  })

  test('Ollama desligado: mensagem de como ligar chega até o usuário final via run()', async () => {
    const errs = []
    const codigo = await run(['fatura.pdf'], {
      readFile: () => Buffer.from('x'),
      extractText: async () => 'texto',
      fetchImpl: async () => {
        const err = new TypeError('fetch failed')
        err.cause = { code: 'ECONNREFUSED' }
        throw err
      },
      writeFile: () => {},
      log: () => {},
      logError: (m) => errs.push(m),
    })
    expect(codigo).not.toBe(0)
    expect(errs.some((m) => /ollama serve/i.test(m))).toBe(true)
  })

  test('PDF ilegível (readFile lança) vira erro claro, código != 0', async () => {
    const errs = []
    const codigo = await run(['nao-existe.pdf'], {
      readFile: () => {
        throw new Error('ENOENT: no such file or directory')
      },
      log: () => {},
      logError: (m) => errs.push(m),
    })
    expect(codigo).not.toBe(0)
    expect(errs.some((m) => m.includes('não consegui ler'))).toBe(true)
  })

  test('sem argumento nenhum: uso é impresso, código de saída indica erro de uso', async () => {
    const codigo = await run([], { log: () => {}, logError: () => {} })
    expect(codigo).toBe(2)
  })

  test('--help imprime o uso e sai com 0, sem tocar em I/O nenhum', async () => {
    const logs = []
    const codigo = await run(['--help'], {
      log: (m) => logs.push(m),
      logError: () => {
        throw new Error('não deveria logar erro pro --help')
      },
    })
    expect(codigo).toBe(0)
    expect(logs.some((m) => m.includes('Uso:'))).toBe(true)
  })

  test('CSV escrito por run() também sobrevive ao round-trip real do parseCsv da fatia ②', async () => {
    let escrito = null
    await run(['fatura.pdf'], {
      readFile: () => Buffer.from('x'),
      extractText: async () => 'texto',
      fetchImpl: fetchImplComResposta(
        JSON.stringify([
          { data: '28/07/2026', descricao: 'Uber', valor: 'R$ 32,50' },
          {
            data: '27/07/2026',
            descricao: 'Supermercado Extra',
            valor: 'R$ 189,90',
          },
        ]),
      ),
      writeFile: (caminho, conteudo) => {
        escrito = conteudo
      },
      log: () => {},
      logError: () => {},
    })

    const parseadas = parseCsv(escrito, {
      data: 0,
      descricao: 1,
      valor: 2,
      temCabecalho: true,
    })
    expect(parseadas.length).toBe(2)
    expect(parseadas[0].amount_cents).toBe(-3250)
    expect(parseadas[1].amount_cents).toBe(-18990)
  })
})
