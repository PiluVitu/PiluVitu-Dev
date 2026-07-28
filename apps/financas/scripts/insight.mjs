#!/usr/bin/env node
//
// Insight de IA -> le os numeros ja calculados (GET /api/insights/numbers),
// manda pro Ollama local escrever uma leitura em texto por cima deles, e
// publica o resultado (POST /api/insights).
//
// Spec: docs/superpowers/specs/2026-07-28-financas-ui-insights-design.md §3
// Backend (Task 3): apps/financas/src/domain/insights.ts + routes/insights.ts
//
// O Mac EMPURRA, o app LE (spec §3) — nenhuma tela chama este comando, e
// nenhum servidor precisa estar de pe alem do Ollama rodando NESTA maquina
// durante a execucao. O dono roda isto quando quer uma leitura fresca do
// mes; a tela mostra o que foi publicado por ultimo, com a data.
//
// Zero custo de AI: Ollama local, nunca Workers AI (medido funcionando
// nesta conta e DESCARTADO por ser pago — ver §0 do spec).
//
// ⚠️ O MODELO NUNCA VE LANCAMENTO CRU. `GET /api/insights/numbers` devolve
// só agregado (totais por categoria/periodo, ja calculados no Worker via
// `byCategory`) — o prompt (buildPrompt, abaixo) so recebe esses agregados,
// nunca uma linha do livro-caixa. Isso mantem o escopo do INGEST_TOKEN
// honesto mesmo apos a extensao desta task (le totais, escreve prosa,
// nunca toca o livro-caixa — ver CLAUDE.md § Insight de IA).
//
// ⚠️ Temperatura zero (`options.temperature: 0` em callOllama) — isto e
// extracao/resumo de fatos ja calculados, nao criacao; variacao entre
// execucoes aqui e defeito, mesma regra de scripts/pdf-import.mjs.
//
// Disciplina de erro (mesmo padrao de pdf-import.mjs e backup-d1.sh —
// "a mensagem de erro e o produto"):
//   - Ollama desligado -> como iniciar, nunca ECONNREFUSED cru
//   - modelo nao instalado -> o comando exato de "ollama pull"
//   - INGEST_TOKEN ausente do ambiente -> diz isso, e como configurar
//   - API inalcancavel (rede) != API recusou (401/4xx/5xx) — mensagens
//     diferentes pra causas diferentes
//   - modelo devolve texto vazio -> falha alto, com a saida bruta no log;
//     nunca publica insight vazio silenciosamente

import { pathToFileURL } from 'node:url'
import { formatBRL } from '@piluvitu/tools/money'

export const DEFAULT_MODEL = 'qwen2.5:7b-instruct'
export const DEFAULT_OLLAMA_URL = 'http://localhost:11434/api/generate'
// Mesmo host que serve a SPA e a API (ver CLAUDE.md § Deploy) — UI e API
// vivem no mesmo domínio, sem NEXT_PUBLIC_API_URL nem base configuravel.
export const DEFAULT_API_URL = 'https://financas.piluvitu.com.br'

const COMPETENCE_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// Teresina e UTC-3 FIXO (o Piaui nao adota horario de verao desde 2019) —
// mesma constante/formula de src/lib/dates.ts (Worker) e web/src/lib/dates.ts
// (SPA), duplicada aqui de proposito: este CLI e um TERCEIRO runtime (Node
// puro, rodando no Mac do dono), sem fronteira de import pros outros dois
// (mesmo raciocinio ja documentado nos outros dois arquivos).
const TERESINA_OFFSET_MS = 3 * 60 * 60 * 1000

export function competenciaAtual(now = new Date()) {
  return new Date(now.getTime() - TERESINA_OFFSET_MS).toISOString().slice(0, 7)
}

// -------------------------------------------------------------------------
// 1. Prompt — só recebe os agregados de `numbers` (InsightNumbers, ver
//    domain/insights.ts), nunca um lançamento cru. Formata dinheiro sempre
//    via formatBRL (@piluvitu/tools/money) — nunca float solto no texto.
// -------------------------------------------------------------------------

function formatCategoryLine(row, index) {
  return `${index + 1}. ${row.category_name}: ${formatBRL(Math.abs(row.total_cents))}`
}

function linhaVariacao(numbers) {
  const { variation_cents, variation_pct, previous_competence } = numbers
  if (variation_pct === null) {
    return `Sem base de comparação: não houve gasto registrado em ${previous_competence}.`
  }
  if (variation_cents === 0) {
    return `Sem variação em relação a ${previous_competence}.`
  }
  const direcao = variation_cents > 0 ? 'Aumento' : 'Redução'
  return `${direcao} de ${formatBRL(Math.abs(variation_cents))} (${Math.abs(variation_pct)}%) em relação a ${previous_competence}.`
}

function linhaMaiorCrescimento(numbers) {
  const b = numbers.biggest_increase
  if (b === null) {
    return '(sem dado suficiente para apontar)'
  }
  const direcao = b.delta_cents >= 0 ? 'aumento' : 'redução'
  return (
    `${b.category_name}: foi de ${formatBRL(Math.abs(b.previous_cents))} ` +
    `para ${formatBRL(Math.abs(b.current_cents))} (${direcao} de ` +
    `${formatBRL(Math.abs(b.delta_cents))}).`
  )
}

/**
 * Monta o prompt a partir de `InsightNumbers` (o payload de
 * `GET /api/insights/numbers`) — nada além disso entra aqui. As "REGRAS
 * OBRIGATÓRIAS" no fim são o que impede o modelo de inventar um número
 * (spec §3: "nenhum número exibido pode vir do modelo" — a tela, Task 5,
 * renderiza os números a partir do dado; o texto que este prompt produz é
 * só a leitura ao redor).
 */
export function buildPrompt(numbers) {
  const {
    competence,
    previous_competence,
    top_categories,
    total_cents,
    previous_total_cents,
  } = numbers

  const linhasCategorias =
    top_categories.length > 0
      ? top_categories.map(formatCategoryLine).join('\n')
      : '(nenhum gasto registrado nesta competência)'

  return `Você escreve um resumo financeiro curto, em português do Brasil, para o dono de um controle financeiro pessoal/PJ.

Abaixo estão os ÚNICOS fatos que você pode usar. Eles já foram calculados por consulta exata ao banco de dados — você NÃO tem acesso a nenhum lançamento individual, só a estes totais já agregados.

Competência: ${competence} (mês anterior de comparação: ${previous_competence})
Total gasto em ${competence}: ${formatBRL(Math.abs(total_cents))}
Total gasto em ${previous_competence}: ${formatBRL(Math.abs(previous_total_cents))}
Variação: ${linhaVariacao(numbers)}

Maiores categorias de gasto em ${competence} (da maior para a menor):
${linhasCategorias}

Categoria com a maior variação de gasto em relação a ${previous_competence}:
${linhaMaiorCrescimento(numbers)}

Escreva um parágrafo de 3 a 5 frases resumindo esses fatos para o dono, em tom direto, sem saudação, sem "espero que ajude", sem markdown, sem lista — só o parágrafo corrido.

REGRAS OBRIGATÓRIAS, sem exceção:
- Use SOMENTE os números e nomes de categoria que aparecem acima. Não calcule nada novo, não arredonde diferente do que já está escrito, não converta nem estime.
- NUNCA invente um valor, uma categoria ou uma porcentagem que não esteja listada acima.
- Se um fato não tem dado suficiente (ex.: "sem base de comparação" ou "nenhum gasto registrado"), diga isso em vez de inventar um número.
- Não é preciso citar todos os números — escolha o que mais importa para contar a história do mês, mas nunca cite um número que não veio da lista acima.`
}

// -------------------------------------------------------------------------
// 2. Ollama — mesmo padrão de erro de scripts/pdf-import.mjs (duplicado de
//    propósito: são dois CLIs independentes, sem um módulo compartilhado
//    entre eles hoje — mesma decisão já tomada pros mirrors de datas do
//    Worker/SPA).
// -------------------------------------------------------------------------

function erroDeConexaoRecusada(err) {
  return err?.cause?.code === 'ECONNREFUSED' || err?.code === 'ECONNREFUSED'
}

export async function callOllama({ model, prompt, url, fetchImpl }) {
  let response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        // Temperatura zero: extração/resumo de fatos já calculados não é
        // criação — variação entre execuções aqui é defeito.
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
// 3. API — GET /api/insights/numbers + POST /api/insights, os dois
//    autenticados pelo INGEST_TOKEN (Authorization: Bearer). Distingue
//    "não consegui alcançar a API" (fetch lançou — rede/DNS/TLS) de "a API
//    recusou a requisição" (fetch respondeu, response.ok === false).
// -------------------------------------------------------------------------

async function apiRequest(url, { token, fetchImpl, init = {} }) {
  let response
  try {
    response = await fetchImpl(url, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${token}`,
      },
    })
  } catch (err) {
    throw new Error(
      `não consegui alcançar a API em ${url} — confira a conexão e a URL (--api-url ou $FINANCAS_API_URL). Detalhe: ${err.message}`,
    )
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    if (response.status === 401) {
      throw new Error(
        `a API recusou o token (401 em ${url}) — confira se o INGEST_TOKEN deste comando é o MESMO configurado no servidor ("wrangler secret put INGEST_TOKEN" em produção, ou a chave INGEST_TOKEN de .dev.vars em dev)`,
      )
    }
    throw new Error(
      `a API recusou a requisição (${response.status} ${response.statusText} em ${url}): ${body.slice(0, 500)}`,
    )
  }

  return response
}

async function parseEnvelope(response, url) {
  let body
  try {
    body = await response.json()
  } catch (err) {
    throw new Error(
      `resposta da API em ${url} não é JSON válido: ${err.message}`,
    )
  }
  if (
    body === null ||
    typeof body !== 'object' ||
    typeof body.ok !== 'boolean'
  ) {
    throw new Error(
      `resposta da API em ${url} não tem o formato esperado (envelope ok/data/notifications): ${JSON.stringify(body).slice(0, 500)}`,
    )
  }
  if (!body.ok) {
    const mensagem = body.notifications?.[0]?.message ?? 'motivo não informado'
    throw new Error(`a API recusou a requisição em ${url}: ${mensagem}`)
  }
  return body.data
}

export async function fetchNumbers({ apiUrl, token, competence, fetchImpl }) {
  const url = `${apiUrl}/api/insights/numbers?competence=${encodeURIComponent(competence)}`
  const response = await apiRequest(url, { token, fetchImpl })
  return parseEnvelope(response, url)
}

export async function postInsight({
  apiUrl,
  token,
  texto,
  modelo,
  periodo,
  fetchImpl,
}) {
  const url = `${apiUrl}/api/insights`
  const response = await apiRequest(url, {
    token,
    fetchImpl,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ texto, modelo, periodo }),
    },
  })
  return parseEnvelope(response, url)
}

// -------------------------------------------------------------------------
// 4. CLI — parsing de argumentos e orquestração
// -------------------------------------------------------------------------

const FLAGS_COM_VALOR = {
  '--competencia': 'competence',
  '--competence': 'competence',
  '--modelo': 'model',
  '--model': 'model',
  '--url': 'ollamaUrl',
  '--api-url': 'apiUrl',
  '--api': 'apiUrl',
}

export function parseArgs(argv) {
  const args = {
    competence: undefined,
    model: undefined,
    ollamaUrl: undefined,
    apiUrl: undefined,
    help: false,
    error: null,
  }

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
    args.error = `opção desconhecida: ${atual}`
    return args
  }

  return args
}

function usage() {
  return `Uso: node scripts/insight.mjs [opções]

Lê os números já calculados de uma competência (GET /api/insights/numbers),
manda pro Ollama local escrever uma leitura em texto por cima deles, e
publica o resultado (POST /api/insights). NÃO envia nenhum lançamento cru
pro modelo — só os totais agregados que a API já calculou.

Opções:
  --competencia, --competence <YYYY-MM>  Competência a resumir (default: mês corrente, fuso de Teresina)
  --modelo, --model <nome>               Modelo do Ollama (default: ${DEFAULT_MODEL})
  --url <url>                            URL do Ollama (default: ${DEFAULT_OLLAMA_URL}, ou $OLLAMA_URL)
  --api-url, --api <url>                 URL base da API (default: ${DEFAULT_API_URL}, ou $FINANCAS_API_URL)
  --help, -h                             Mostra esta ajuda

Requisitos:
  - Ollama rodando localmente (ollama serve) com o modelo instalado (ex.: ollama pull ${DEFAULT_MODEL})
  - Variável de ambiente INGEST_TOKEN definida com o MESMO valor configurado
    no servidor ("wrangler secret put INGEST_TOKEN" em produção, ou a chave
    INGEST_TOKEN de .dev.vars em dev)
`
}

export async function run(argv, deps = {}) {
  const {
    fetchImpl = fetch,
    env = process.env,
    log = console.log,
    logError = console.error,
    now = () => new Date(),
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

  const token = env.INGEST_TOKEN
  if (!token) {
    logError(
      'erro: a variável de ambiente INGEST_TOKEN não está definida — este comando não tem como se autenticar na API.\n' +
        '      Defina antes de rodar, com o MESMO valor configurado no servidor via "wrangler secret put INGEST_TOKEN"\n' +
        '      (ou a chave INGEST_TOKEN de apps/financas/.dev.vars em desenvolvimento). Ex.: export INGEST_TOKEN=...',
    )
    return 1
  }

  const competence = args.competence ?? competenciaAtual(now())
  if (!COMPETENCE_RE.test(competence)) {
    logError(`erro: competência inválida (esperado YYYY-MM): ${competence}`)
    log(usage())
    return 2
  }

  const model = args.model ?? DEFAULT_MODEL
  const ollamaUrl = args.ollamaUrl ?? env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL
  const apiUrl = (
    args.apiUrl ??
    env.FINANCAS_API_URL ??
    DEFAULT_API_URL
  ).replace(/\/+$/, '')

  log(`==> buscando os números de ${competence} em ${apiUrl}`)
  let numbers
  try {
    numbers = await fetchNumbers({ apiUrl, token, competence, fetchImpl })
  } catch (err) {
    logError(`erro: ${err.message}`)
    return 1
  }

  const prompt = buildPrompt(numbers)

  log(
    `==> consultando o Ollama (modelo ${model}, ${ollamaUrl}) — pode levar alguns segundos`,
  )
  let rawResponse
  try {
    rawResponse = await callOllama({ model, prompt, url: ollamaUrl, fetchImpl })
  } catch (err) {
    logError(`erro: ${err.message}`)
    return 1
  }

  const texto = rawResponse.trim()
  if (texto === '') {
    logError('erro: o modelo devolveu texto vazio — nada foi publicado.')
    logError('--- saída bruta do modelo ---')
    logError(rawResponse)
    return 1
  }

  log(`==> publicando o insight de ${competence} (modelo ${model})`)
  try {
    await postInsight({
      apiUrl,
      token,
      texto,
      modelo: model,
      periodo: competence,
      fetchImpl,
    })
  } catch (err) {
    logError(`erro: ${err.message}`)
    logError('--- texto gerado (NÃO publicado) ---')
    logError(texto)
    return 1
  }

  log('')
  log(`==> insight de ${competence} publicado com sucesso`)
  log('')
  log(texto)
  return 0
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const codigoDeSaida = await run(process.argv.slice(2))
  process.exitCode = codigoDeSaida
}
