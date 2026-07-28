#!/usr/bin/env node
//
// Fatura de cartão em PDF -> CSV pro #/importar, via Ollama local (fatia ③).
//
// Spec: docs/superpowers/specs/2026-07-27-financas-pdf-ollama-design.md
//
// Por que existe: banco que só entrega fatura em PDF fica de fora do import
// (fatia ②). Ollama exige GPU/Metal e nenhum instance type de Cloudflare
// Containers oferece GPU — o modelo só roda no Mac do dono, então isto é um
// CLI (não um endpoint no Worker, não um túnel): sem incógnita de
// mixed-content de browser, sem acoplar o app a "o Mac estar ligado" (ver
// §2 do spec pras outras duas opções descartadas).
//
// ⚠️ ESTE CLI NUNCA TOCA O BANCO. Ele só escreve um .csv no formato que
// `packages/tools/src/import/csv.ts#parseCsv` já lê (mesmo caminho da
// fatia ②) — o dono importa por #/importar e confere linha a linha. Um
// modelo de 3B–7B extraindo linha de fatura VAI errar valor, data ou
// descrição de vez em quando; a tela de conferência é a etapa que existe
// pra pegar exatamente isso (duplicata, payee sugerido, confirmação
// explícita). Mandar a saída do LLM direto pro banco jogaria fora essa
// etapa. Zero backend novo nesta fatia — de propósito.
//
// Disciplina de validação (§3 do spec — "JSON de LLM não é JSON até ser
// validado"):
//   - o bloco JSON é extraído mesmo cercado de texto/```fences (o modelo
//     às vezes ignora a instrução de responder só JSON)
//   - toda linha que falha validação é REPORTADA (linha + motivo), nunca
//     descartada em silêncio
//   - valor sempre passa por `parseBRL` (@piluvitu/tools/money) — dinheiro
//     é INTEGER centavos, nunca float
//   - data vira 'YYYY-MM-DD'; uma que não converte é REJEITADA, nunca
//     chutada (validação de calendário real, não só formato — rejeita
//     '31/02/2026')
//   - zero linha válida ⇒ sai com código != 0 e a saída bruta do modelo no
//     log; um CSV vazio que parece sucesso é o pior resultado possível
//   - temperatura zero: extração não é criação, variação entre execuções
//     aqui é defeito

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getDocument, VerbosityLevel } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseBRL, formatBRL } from '@piluvitu/tools/money'

export const DEFAULT_MODEL = 'qwen2.5:7b-instruct'
export const OLLAMA_URL =
  process.env.OLLAMA_URL ?? 'http://localhost:11434/api/generate'

// Limite de sanidade: um texto extraído maior que isto (~80k tokens) é sinal
// de PDF anormal (fatura de centenas de páginas, ou lixo binário que
// escapou pela extração) — melhor recusar com uma mensagem clara do que
// truncar em silêncio e mandar pro modelo um pedaço do meio da fatura sem
// avisar, o que derrubaria linhas sem nenhum sinal disso no CSV final.
const TAMANHO_MAXIMO_TEXTO = 300_000

// -------------------------------------------------------------------------
// 1. Extração de texto do PDF (pdfjs-dist)
//
// Escolha da biblioteca: não há `pdftotext`/`qpdf`/`mutool` na máquina (fato
// medido no spec), então a extração precisa ser JS. `pdfjs-dist` (Mozilla,
// o motor por trás do leitor de PDF do Firefox) foi escolhido em vez de
// `pdf-parse` (fina camada não mantida sobre uma versão travada e antiga do
// próprio pdfjs) ou de um shell-out pra binário que não está instalado
// (proibido pelo brief desta task): é mantido ativamente, publica um build
// "legacy" (`pdfjs-dist/legacy/build/pdf.mjs`) que roda em Node puro sem
// DOM/canvas, e não tem NENHUM lifecycle script no package.json — instala
// sem precisar entrar em `allowBuilds` do pnpm-workspace.yaml.
// -------------------------------------------------------------------------

// Caminho absoluto (não `file://`) — MEDIDO: o fetch nativo do Node não
// entende o esquema `file://`, e pdfjs tenta buscar as métricas de fonte
// padrão via fetch quando recebe uma URL `file://`. Passando um caminho de
// filesystem puro, a detecção de Node do pdfjs lê o arquivo direto via
// `fs.readFile`, sem warning nenhum.
const STANDARD_FONT_DATA_URL = fileURLToPath(
  new URL('standard_fonts/', import.meta.resolve('pdfjs-dist/package.json')),
)

// Reconstrói o texto da página preservando quebra de linha via `hasEOL` (o
// próprio pdfjs já detecta troca de linha por posição, e já sintetiza itens
// de espaço quando há um vão horizontal entre duas colunas de uma mesma
// linha — MEDIDO contra um PDF com colunas posicionadas via `Td` sem
// caractere de espaço nenhum entre elas). Sem isso, uma fatura tabular
// (data | descrição | valor) vira uma sopa de texto numa linha só, e o
// modelo tem que adivinhar onde termina um lançamento e começa o próximo.
function textoDaPagina(items) {
  let texto = ''
  for (const item of items) {
    if (!('str' in item)) continue
    texto += item.str
    if (item.hasEOL) texto += '\n'
  }
  return texto
}

export async function extractPdfText(pdfBytes) {
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBytes),
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    verbosity: VerbosityLevel.ERRORS,
  })
  try {
    const doc = await loadingTask.promise
    let texto = ''
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      texto += textoDaPagina(content.items) + '\n'
    }
    return texto
  } finally {
    // `doc.destroy` não existe no proxy resolvido — quem libera os recursos
    // é a `loadingTask` (MEDIDO: `doc.destroy` é `undefined`, o método mora
    // em `loadingTask`).
    await loadingTask.destroy()
  }
}

// -------------------------------------------------------------------------
// 2. Prompt + chamada ao Ollama
// -------------------------------------------------------------------------

export function buildPrompt(textoFatura) {
  return `Você é um extrator de dados de fatura de cartão de crédito brasileira.

Abaixo está o texto extraído de um PDF de fatura. Extraia CADA linha de
lançamento (compra, assinatura, tarifa) e devolva APENAS um array JSON, sem
nenhum texto antes ou depois, sem markdown, no formato exato:

[
  {"data": "DD/MM/AAAA", "descricao": "nome do estabelecimento", "valor": "R$ 0,00"}
]

Regras:
- Uma linha do array por lançamento individual da fatura.
- NÃO inclua total da fatura, subtotal, limite de crédito, saldo anterior,
  "fatura anterior" ou qualquer linha que resuma vários lançamentos.
- "data" é a data da COMPRA (não a data de vencimento da fatura), no
  formato DD/MM/AAAA.
- "valor" é o valor impresso na fatura. Lançamentos normais (compras) não
  têm sinal. Estornos/créditos costumam vir com "-" na frente ou entre
  parênteses — preserve esse sinal exatamente como está impresso.
- "descricao" é o nome do estabelecimento/lançamento, como impresso.
- Se não conseguir ler algum campo de uma linha direito, inclua a linha
  mesmo assim com o que conseguir — quem chamou você valida o resto.
- Não invente lançamento nenhum que não esteja no texto abaixo.

Texto da fatura:
"""
${textoFatura}
"""`
}

function erroDeConexaoRecusada(err) {
  return err?.cause?.code === 'ECONNREFUSED' || err?.code === 'ECONNREFUSED'
}

export async function callOllama({
  model,
  prompt,
  url = OLLAMA_URL,
  fetchImpl = fetch,
}) {
  let response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        // Temperatura zero (§6 do spec): extração não é criação, variação
        // entre execuções aqui é defeito, não recurso.
        options: { temperature: 0 },
      }),
    })
  } catch (err) {
    if (erroDeConexaoRecusada(err)) {
      throw new Error(
        `não consegui conectar ao Ollama em ${url} — ele parece estar desligado. Inicie com "ollama serve" (ou abra o app Ollama) e tente de novo`,
      )
    }
    throw new Error(`falha ao chamar o Ollama em ${url}: ${err.message}`)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    if (response.status === 404 && /not found/i.test(body)) {
      throw new Error(
        `modelo "${model}" não está instalado no Ollama local. Instale com: ollama pull ${model}`,
      )
    }
    throw new Error(
      `Ollama respondeu ${response.status} ${response.statusText} em ${url}: ${body.slice(0, 500)}`,
    )
  }

  const payload = await response.json()
  if (typeof payload.response !== 'string') {
    throw new Error(
      `resposta do Ollama não trouxe o campo "response" esperado: ${JSON.stringify(payload).slice(0, 500)}`,
    )
  }
  return payload.response
}

// -------------------------------------------------------------------------
// 3. Extração do bloco JSON da resposta do modelo (§3 do spec — "JSON de
//    LLM não é JSON até ser validado"). Tolera cercas de markdown e prosa
//    antes/depois, mesmo pedindo no prompt "só JSON" — modelos de 3B-7B
//    ignoram essa instrução com alguma frequência.
// -------------------------------------------------------------------------

function semCercasDeMarkdown(texto) {
  const bloco = /```(?:json)?\s*([\s\S]*?)```/i.exec(texto)
  return bloco !== null ? bloco[1] : texto
}

// Varre o texto à procura do primeiro `[` ou `{` e devolve o span até o
// fechamento correspondente, respeitando string entre aspas (senão um `}`
// dentro de uma descrição quebraria a contagem de profundidade).
function blocoJsonBalanceado(texto) {
  let inicio = -1
  let abre = ''
  let fecha = ''
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] === '[' || texto[i] === '{') {
      inicio = i
      abre = texto[i]
      fecha = abre === '[' ? ']' : '}'
      break
    }
  }
  if (inicio === -1) return null

  let profundidade = 0
  let dentroDeString = false
  let escapando = false
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i]
    if (dentroDeString) {
      if (escapando) escapando = false
      else if (c === '\\') escapando = true
      else if (c === '"') dentroDeString = false
      continue
    }
    if (c === '"') dentroDeString = true
    else if (c === abre) profundidade++
    else if (c === fecha) {
      profundidade--
      if (profundidade === 0) return texto.slice(inicio, i + 1)
    }
  }
  return null // nunca fechou — resposta cortada/truncada
}

export function extractJsonBlock(rawResponse) {
  const semCercas = semCercasDeMarkdown(rawResponse)
  const bloco =
    blocoJsonBalanceado(semCercas) ?? blocoJsonBalanceado(rawResponse)
  if (bloco === null) {
    throw new Error('nenhum bloco JSON encontrado na resposta do modelo')
  }
  return bloco
}

const CHAVES_DE_LISTA = [
  'linhas',
  'lines',
  'itens',
  'items',
  'lancamentos',
  'lançamentos',
  'transacoes',
  'transações',
  'transactions',
]

// O prompt pede um array no topo, mas um modelo de 3B-7B às vezes embrulha
// em `{"linhas": [...]}` mesmo assim — aceita as duas formas em vez de
// falhar por um detalhe de formato que a validação de linha já cobre.
export function normalizeLinesPayload(parsed) {
  if (Array.isArray(parsed)) return parsed
  if (parsed !== null && typeof parsed === 'object') {
    for (const chave of CHAVES_DE_LISTA) {
      if (Array.isArray(parsed[chave])) return parsed[chave]
    }
    const primeiraLista = Object.values(parsed).find((v) => Array.isArray(v))
    if (primeiraLista !== undefined) return primeiraLista
  }
  throw new Error(
    'o JSON extraído não é uma lista de lançamentos nem contém uma',
  )
}

// -------------------------------------------------------------------------
// 4. Validação linha a linha — data, valor, descrição
// -------------------------------------------------------------------------

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/
const DATA_BR_BARRA = /^(\d{2})\/(\d{2})\/(\d{4})$/
const DATA_BR_TRACO = /^(\d{2})-(\d{2})-(\d{4})$/

function construirDataOuLancar(ano, mes, dia, origem) {
  // Round-trip via Date.UTC — mesma técnica de `lib/dates.ts#isRealCalendarDate`
  // no Worker: rejeita '31/02/2026', que um regex de formato deixaria passar.
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  const real =
    data.getUTCFullYear() === ano &&
    data.getUTCMonth() === mes - 1 &&
    data.getUTCDate() === dia
  if (!real) {
    throw new Error(`data não existe no calendário: ${JSON.stringify(origem)}`)
  }
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

// Aceita ISO ('AAAA-MM-DD') e os dois formatos BR mais comuns que um modelo
// costuma devolver mesmo o prompt pedindo DD/MM/AAAA. Qualquer outra coisa
// é REJEITADA, nunca chutada (§3 do spec).
export function parseStatementDate(bruto) {
  const trimmed = String(bruto).trim()

  const iso = DATA_ISO.exec(trimmed)
  if (iso !== null) {
    return construirDataOuLancar(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      trimmed,
    )
  }

  const barra = DATA_BR_BARRA.exec(trimmed)
  if (barra !== null) {
    return construirDataOuLancar(
      Number(barra[3]),
      Number(barra[2]),
      Number(barra[1]),
      trimmed,
    )
  }

  const traco = DATA_BR_TRACO.exec(trimmed)
  if (traco !== null) {
    return construirDataOuLancar(
      Number(traco[3]),
      Number(traco[2]),
      Number(traco[1]),
      trimmed,
    )
  }

  throw new Error(`formato de data não reconhecido: ${JSON.stringify(trimmed)}`)
}

// Convenção desta ferramenta (documentada no CLAUDE.md do app): uma linha
// de fatura SEM sinal é uma COMPRA (despesa — grava negativo, mesma
// convenção de `transactions.amount_cents` no domínio do Worker); uma
// linha com sinal negativo ou entre parênteses no PDF é um
// ESTORNO/crédito (grava positivo). `parseBRL` (@piluvitu/tools/money) já
// devolve negativo quando o texto tem "-"; parênteses são despidas e
// convertidas em sinal antes — mesma técnica de
// `packages/tools/src/import/csv.ts#parseCsvValor`. O resultado de
// `parseBRL` é invertido pra aplicar essa convenção.
//
// ⚠️ ACHADO NO RUN REAL contra qwen2.5:7b-instruct: o modelo às vezes
// devolve o sinal DEPOIS do "R$" ("R$ -35,00"), não antes ("-R$ 35,00") —
// a regex de `parseBRL` só aceita sinal ANTES do "R$" e rejeitava essa
// forma. Normaliza a posição do "-" pra frente do texto antes de delegar,
// em vez de deixar `parseBRL` (que não deveria conhecer essa peculiaridade
// de LLM) lidar com isso.
export function amountFromStatementText(bruto) {
  const trimmed = String(bruto).trim()
  const comParenteses = /^\((.*)\)$/.exec(trimmed)
  const semParenteses =
    comParenteses !== null ? comParenteses[1].trim() : trimmed

  const temSinalNegativo = comParenteses !== null || semParenteses.includes('-')
  const semNenhumSinal = semParenteses.replace('-', '').trim()
  const paraParseBRL = temSinalNegativo ? `-${semNenhumSinal}` : semNenhumSinal

  const cents = parseBRL(paraParseBRL)
  return cents === 0 ? 0 : -cents
}

function primeiroCampo(objeto, chaves) {
  for (const chave of chaves) {
    const valor = objeto[chave]
    if (valor !== undefined && valor !== null) return valor
  }
  return undefined
}

const CHAVES_DATA = ['data', 'date', 'dt']
const CHAVES_DESCRICAO = ['descricao', 'descrição', 'description', 'desc']
const CHAVES_VALOR = ['valor', 'value', 'amount', 'valor_total']

// Devolve `{ok:true, line}` ou `{ok:false, index, reason, raw}` — NUNCA
// lança. É o chamador (validateLines/run) quem decide o que fazer com uma
// linha rejeitada; aqui só se decide o motivo.
export function validateLine(bruta, index) {
  if (bruta === null || typeof bruta !== 'object' || Array.isArray(bruta)) {
    return {
      ok: false,
      index,
      reason: 'linha não é um objeto JSON',
      raw: bruta,
    }
  }

  const dataBruta = primeiroCampo(bruta, CHAVES_DATA)
  const descricaoBruta = primeiroCampo(bruta, CHAVES_DESCRICAO)
  const valorBruto = primeiroCampo(bruta, CHAVES_VALOR)

  if (dataBruta === undefined) {
    return { ok: false, index, reason: 'campo de data ausente', raw: bruta }
  }
  if (descricaoBruta === undefined || String(descricaoBruta).trim() === '') {
    return {
      ok: false,
      index,
      reason: 'campo de descrição ausente ou vazio',
      raw: bruta,
    }
  }
  if (valorBruto === undefined) {
    return { ok: false, index, reason: 'campo de valor ausente', raw: bruta }
  }

  let purchase_date
  try {
    purchase_date = parseStatementDate(String(dataBruta))
  } catch (err) {
    return {
      ok: false,
      index,
      reason: `data inválida (${JSON.stringify(dataBruta)}): ${err.message}`,
      raw: bruta,
    }
  }

  let amount_cents
  try {
    amount_cents = amountFromStatementText(String(valorBruto))
  } catch (err) {
    return {
      ok: false,
      index,
      reason: `valor inválido (${JSON.stringify(valorBruto)}): ${err.message}`,
      raw: bruta,
    }
  }
  if (amount_cents === 0) {
    return { ok: false, index, reason: 'valor não pode ser zero', raw: bruta }
  }

  return {
    ok: true,
    line: {
      purchase_date,
      amount_cents,
      // `parseCsv` (packages/tools/src/import/csv.ts) quebra o arquivo em
      // linhas ANTES de parsear campos entre aspas — uma descrição com
      // '\n'/'\r' embutido (o modelo colar duas linhas do PDF numa
      // "descricao" só, por exemplo) partiria a linha do CSV em duas e
      // corromperia o parse sem erro nenhum aparente. Colapsa qualquer
      // sequência de espaço em branco (incl. quebra de linha) num único
      // espaço — defesa deste CLI, não mudança no parser compartilhado.
      description: String(descricaoBruta).trim().replace(/\s+/g, ' '),
    },
  }
}

export function validateLines(rawLines) {
  const valid = []
  const errors = []
  rawLines.forEach((bruta, index) => {
    const resultado = validateLine(bruta, index)
    if (resultado.ok) valid.push(resultado.line)
    else errors.push(resultado)
  })
  return { valid, errors }
}

// -------------------------------------------------------------------------
// 5. CSV — mesmo formato que packages/tools/src/import/csv.ts#parseCsv já
//    lê (o caminho da fatia ②, sem mudar uma linha dele). Delimitador ';'
//    de propósito, mesmo motivo documentado em csv.ts: a vírgula já é o
//    separador decimal do BRL. `detectarDelimitador` (csv.ts) conta ';' vs
//    ',' na primeira linha do arquivo — o cabeçalho abaixo tem 2 ';' e 0
//    ',', então o import detecta ';' sozinho.
// -------------------------------------------------------------------------

function escaparCampoCsv(valor) {
  return `"${String(valor).replace(/"/g, '""')}"`
}

export function linesToCsv(lines) {
  const cabecalho = ['data', 'descricao', 'valor'].join(';')
  const linhas = lines.map((linha) =>
    [
      linha.purchase_date,
      escaparCampoCsv(linha.description),
      formatBRL(linha.amount_cents),
    ].join(';'),
  )
  return [cabecalho, ...linhas].join('\r\n') + '\r\n'
}

// -------------------------------------------------------------------------
// 6. CLI — parsing de argumentos e orquestração
// -------------------------------------------------------------------------

const FLAGS_COM_VALOR = {
  '--modelo': 'model',
  '--model': 'model',
  '--saida': 'output',
  '--output': 'output',
  '--url': 'url',
}

export function parseArgs(argv) {
  const args = {
    pdfPath: undefined,
    model: DEFAULT_MODEL,
    output: undefined,
    url: OLLAMA_URL,
    help: false,
    error: null,
  }
  const posicionais = []

  for (let i = 0; i < argv.length; i++) {
    const atual = argv[i]
    if (atual === '--help' || atual === '-h') {
      args.help = true
      continue
    }
    const campo = FLAGS_COM_VALOR[atual]
    if (campo !== undefined) {
      const valor = argv[i + 1]
      if (valor === undefined) {
        args.error = `a opção ${atual} precisa de um valor`
        return args
      }
      args[campo] = valor
      i++
      continue
    }
    posicionais.push(atual)
  }

  args.pdfPath = posicionais[0]
  return args
}

export function defaultOutputPath(pdfPath) {
  const { dir, name } = path.parse(pdfPath)
  return path.join(dir, `${name}.csv`)
}

function usage() {
  return `Uso: node scripts/pdf-import.mjs <fatura.pdf> [opções]

Lê uma fatura de cartão de crédito em PDF, manda o texto pro Ollama local
extrair os lançamentos, valida cada linha e escreve um CSV pronto pra
#/importar. NÃO grava nada no banco — a tela de conferência do import é
quem decide o que entra de fato (ver CLAUDE.md do app).

Opções:
  --modelo, --model <nome>   Modelo do Ollama (default: ${DEFAULT_MODEL})
  --saida, --output <path>   Caminho do CSV de saída (default: <fatura>.csv)
  --url <url>                URL do Ollama (default: ${OLLAMA_URL})
  --help, -h                 Mostra esta ajuda

Requisitos:
  - Ollama rodando localmente (ollama serve)
  - Modelo instalado (ex.: ollama pull ${DEFAULT_MODEL})
`
}

export async function run(argv, deps = {}) {
  const {
    readFile = readFileSync,
    writeFile = writeFileSync,
    fetchImpl = fetch,
    extractText = extractPdfText,
    log = console.log,
    logError = console.error,
  } = deps

  const args = parseArgs(argv)

  if (args.help) {
    log(usage())
    return 0
  }
  if (args.error) {
    logError(`erro: ${args.error}`)
    log(usage())
    return 2
  }
  if (args.pdfPath === undefined) {
    logError('erro: informe o caminho do PDF da fatura.')
    log(usage())
    return 2
  }

  let pdfBytes
  try {
    pdfBytes = readFile(args.pdfPath)
  } catch (err) {
    logError(`erro: não consegui ler "${args.pdfPath}": ${err.message}`)
    return 1
  }

  log(`==> extraindo texto de ${args.pdfPath}`)
  let texto
  try {
    texto = await extractText(pdfBytes)
  } catch (err) {
    logError(
      `erro: não consegui abrir o PDF (${err.message}). Confira se é mesmo um PDF válido.`,
    )
    return 1
  }

  if (texto.trim() === '') {
    logError(
      'erro: este PDF não tem camada de texto — parece ser uma fatura escaneada (imagem).\n' +
        '      OCR está fora do escopo desta ferramenta; não dá pra continuar com este arquivo.',
    )
    return 1
  }

  if (texto.length > TAMANHO_MAXIMO_TEXTO) {
    logError(
      `erro: o texto extraído (${texto.length} caracteres) passa do limite de ${TAMANHO_MAXIMO_TEXTO} — ` +
        'recusado em vez de truncado (truncar cortaria lançamentos no meio, sem nenhum aviso no CSV final).',
    )
    return 1
  }

  log(
    `==> consultando o Ollama (modelo ${args.model}, ${args.url}) — pode levar alguns segundos`,
  )
  let rawResponse
  try {
    rawResponse = await callOllama({
      model: args.model,
      prompt: buildPrompt(texto),
      url: args.url,
      fetchImpl,
    })
  } catch (err) {
    logError(`erro: ${err.message}`)
    return 1
  }

  let rawLines
  try {
    const jsonText = extractJsonBlock(rawResponse)
    rawLines = normalizeLinesPayload(JSON.parse(jsonText))
  } catch (err) {
    logError(`erro: ${err.message}`)
    logError('--- saída bruta do modelo ---')
    logError(rawResponse)
    return 1
  }

  const { valid, errors } = validateLines(rawLines)

  for (const erro of errors) {
    logError(
      `aviso: linha ${erro.index + 1} rejeitada — ${erro.reason}: ${JSON.stringify(erro.raw)}`,
    )
  }

  if (valid.length === 0) {
    logError('')
    logError('erro: nenhuma linha válida foi extraída — nada foi escrito.')
    logError('--- saída bruta do modelo ---')
    logError(rawResponse)
    return 1
  }

  const outputPath = args.output ?? defaultOutputPath(args.pdfPath)
  writeFile(outputPath, linesToCsv(valid))

  log('')
  log(`==> ${valid.length} linha(s) válida(s), ${errors.length} rejeitada(s)`)
  log(
    `==> CSV gravado em ${outputPath} — importe por #/importar e confira linha a linha`,
  )
  return 0
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const codigoDeSaida = await run(process.argv.slice(2))
  process.exitCode = codigoDeSaida
}
