/**
 * Helper de teste COMPARTILHADO pra mockar o Google Sheets (token endpoint +
 * endpoint de values) — NUNCA chama o Google de verdade. Extraído na fatia
 * ③, Task 4 (dívida técnica registrada no ledger): antes desta task, a MESMA
 * lógica estava duplicada 3× — `lib/gsheets.test.ts`, e dois `describe`s em
 * `routes/votacao.test.ts` (`GET /votacao/categorias` e "segredo NUNCA
 * vaza"). Task 4 precisava de uma 4ª cópia pra testar `POST
 * /votacao/sessions` (que também lê o Sheets) — em vez disso, as 3 cópias
 * existentes foram migradas pra este arquivo.
 *
 * As 3 cópias divergiam só em DETALHE, não em ESTRUTURA: a chave RSA de
 * teste (`gerarServiceAccountDeTeste`) era IDÊNTICA nas 3; o instalador do
 * mock tinha duas variantes — uma simples (`valuesOuStatus: unknown[][] |
 * number`, token sempre sucesso) usada 2×, e uma mais geral (`instalarMock
 * ComCorpo`, controla status+corpo dos DOIS endpoints separadamente) usada
 * pelos testes de vazamento de segredo. `instalarMockGoogleSheets` abaixo
 * unifica as duas: aceita a forma simples (array de linhas, ou só um
 * status), OU a forma geral (`{status, body}`) pra CADA endpoint — a forma
 * simples é só açúcar sobre a geral.
 */
import type { ServiceAccount } from '../lib/google-auth'

export type MockHttpResponse = { status: number; body: unknown }

const TOKEN_SUCESSO_PADRAO: MockHttpResponse = {
  status: 200,
  body: {
    access_token: 'token-de-teste-gsheets',
    token_type: 'Bearer',
    expires_in: 3599,
  },
}

/**
 * Gera uma service account de teste com uma chave RSA REAL (`crypto.subtle.
 * generateKey`) — necessário porque `google-auth.ts#assinarJwt` importa a
 * chave de verdade (`crypto.subtle.importKey('pkcs8', ...)`) antes de
 * assinar; uma chave fake/string não passaria por esse import.
 */
export async function gerarServiceAccountDeTeste(
  clientEmail: string,
): Promise<ServiceAccount> {
  const par = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', par.privateKey)
  const bytes = new Uint8Array(pkcs8)
  let binario = ''
  for (let i = 0; i < bytes.length; i++)
    binario += String.fromCharCode(bytes[i])
  const base64 = btoa(binario)
  const linhas = base64.match(/.{1,64}/g) ?? [base64]
  const pem = `-----BEGIN PRIVATE KEY-----\n${linhas.join('\n')}\n-----END PRIVATE KEY-----\n`
  return {
    client_email: clientEmail,
    private_key: pem,
    token_uri: 'https://oauth2.googleapis.com/token',
  }
}

function normalizarRespostaValues(
  valores: unknown[][] | number | MockHttpResponse,
): MockHttpResponse {
  if (typeof valores === 'number')
    return { status: valores, body: 'erro simulado' }
  if (Array.isArray(valores)) return { status: 200, body: { values: valores } }
  return valores
}

function responderCom(resposta: MockHttpResponse): Response {
  // Corpo string sai CRU (sem content-type json) — mesmo comportamento
  // original pro caso `status: number` (`new Response('erro simulado', {
  // status })`, sem headers). Corpo não-string é JSON.
  if (typeof resposta.body === 'string') {
    return new Response(resposta.body, { status: resposta.status })
  }
  return new Response(JSON.stringify(resposta.body), {
    status: resposta.status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Instala um `globalThis.fetch` que responde ao token endpoint (Google
 * OAuth2) e ao endpoint de values do Sheets (`GET /v4/spreadsheets/{id}/
 * values/{range}`) — qualquer outra URL cai pro `fetch` original. Restaurar
 * SEMPRE num `finally` (`mock.restaurar()`).
 *
 * `sheetsResposta` aceita 3 formas (a mais simples cobre a maioria dos
 * testes):
 *   - `unknown[][]` — linhas da planilha, responde 200 com `{values: [...]}`.
 *   - `number` — status de erro, corpo cru `'erro simulado'` (sem JSON).
 *   - `{status, body}` — controle total do corpo (testes de vazamento de
 *     segredo, que precisam de um corpo com um marcador específico).
 *   - `undefined` — o endpoint de values NUNCA é interceptado (cai pro fetch
 *     original se alcançado) — usado pelos testes que forçam falha ANTES do
 *     Sheets ser sequer chamado (o token endpoint falha primeiro).
 *
 * `tokenResposta` (opcional, default sucesso) tem a mesma forma `{status,
 * body}` — controle total, usado pelos testes que simulam o TOKEN endpoint
 * falhando.
 */
export function instalarMockGoogleSheets(
  tokenUri: string,
  spreadsheetId: string,
  range: string,
  sheetsResposta?: unknown[][] | number | MockHttpResponse,
  tokenResposta: MockHttpResponse = TOKEN_SUCESSO_PADRAO,
): { restaurar: () => void } {
  const fetchOriginal = globalThis.fetch
  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`
  const sheetsNormalizada =
    sheetsResposta === undefined
      ? null
      : normalizarRespostaValues(sheetsResposta)

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlTexto =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    if (urlTexto === tokenUri) {
      return responderCom(tokenResposta)
    }
    if (urlTexto === valuesUrl && sheetsNormalizada !== null) {
      return responderCom(sheetsNormalizada)
    }
    return fetchOriginal(input as Parameters<typeof fetch>[0], init)
  }) as typeof fetch

  return {
    restaurar: () => {
      globalThis.fetch = fetchOriginal
    },
  }
}
