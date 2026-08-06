/**
 * Autenticação Google via JWT RS256 assinado com WebCrypto — SEM disco, SEM
 * biblioteca (`jose`, `googleapis`). A API Go usa Application Default
 * Credentials com um JSON de service account montado em disco; um Worker não
 * tem disco nem aquela lib. O spike rodou contra a service account real
 * (medido em 2026-08-06) e provou que dá com WebCrypto puro:
 *
 *   - `crypto.subtle.importKey('pkcs8', <chave>, {name:'RSASSA-PKCS1-v1_5',
 *     hash:'SHA-256'})` importa sem erro.
 *   - `crypto.subtle.sign` produz assinatura de 256 bytes.
 *   - `POST` no `token_uri` com
 *     `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer` devolve
 *     `200`, `token_type: Bearer`, `expires_in: 3599`, em ~503ms.
 *
 * ⚠️ NÃO adicionar dependência nenhuma pra isto — o próprio spike já provou
 * que não precisa.
 */

/** O subconjunto do JSON de service account que este módulo precisa. */
export type ServiceAccount = {
  client_email: string
  private_key: string
  token_uri: string
}

const CAMPOS_OBRIGATORIOS: (keyof ServiceAccount)[] = [
  'client_email',
  'private_key',
  'token_uri',
]

/**
 * Faz o parse do conteúdo cru de `GOOGLE_SA_JSON` (o secret do Worker) e
 * valida os três campos que este módulo usa. Mensagem de erro é o produto:
 * sempre cita `GOOGLE_SA_JSON` (o nome do secret que o dono precisa
 * conferir) e, quando aplicável, o campo específico que faltou — nunca um
 * "JSON inválido" genérico que obriga a abrir o código pra saber o que
 * checar.
 */
export function parseServiceAccount(json: string): ServiceAccount {
  let bruto: unknown
  try {
    bruto = JSON.parse(json)
  } catch {
    throw new Error(
      'GOOGLE_SA_JSON inválido — o conteúdo configurado não é um JSON válido. Confira `wrangler secret put GOOGLE_SA_JSON` com o conteúdo LITERAL do arquivo de credenciais da service account (baixado do Google Cloud Console).',
    )
  }

  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) {
    throw new Error(
      'GOOGLE_SA_JSON inválido — esperava um objeto JSON com client_email/private_key/token_uri, recebeu outra coisa.',
    )
  }

  const obj = bruto as Record<string, unknown>
  for (const campo of CAMPOS_OBRIGATORIOS) {
    if (typeof obj[campo] !== 'string' || obj[campo] === '') {
      throw new Error(
        `GOOGLE_SA_JSON inválido — falta o campo "${campo}" (ou está vazio). Confira o JSON da service account configurado em GOOGLE_SA_JSON.`,
      )
    }
  }

  return {
    client_email: obj.client_email as string,
    private_key: obj.private_key as string,
    token_uri: obj.token_uri as string,
  }
}

/**
 * `Uint8Array<ArrayBuffer>` em vez do `Uint8Array` bare — mesmo achado
 * MEDIDO em `domain/tiebreak.ts`: TS 5.7+ tornou `Uint8Array` genérico sobre
 * o buffer que o apoia (default `ArrayBufferLike`), e as assinaturas de
 * `SubtleCrypto` em `worker-configuration.d.ts` pedem
 * `ArrayBufferView<ArrayBuffer>`. Todo array de bytes deste arquivo é de
 * fato apoiado num `ArrayBuffer` real — é só precisão de tipo.
 */
type Bytes = Uint8Array<ArrayBuffer>

function paraBytes(origem: ArrayBuffer | Bytes): Bytes {
  return origem instanceof Uint8Array ? origem : new Uint8Array(origem)
}

/**
 * `base64url` NÃO é `btoa`. `btoa` sozinho produz base64 padrão
 * (`+`/`/`/padding `=`) — o Google rejeita um JWT com padding. Troca
 * `+`→`-`, `/`→`_`, e REMOVE o `=` de padding.
 */
function base64url(origem: ArrayBuffer | Bytes): string {
  const bytes = paraBytes(origem)
  let binario = ''
  for (let i = 0; i < bytes.length; i++)
    binario += String.fromCharCode(bytes[i])
  return btoa(binario)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlDeString(texto: string): string {
  return base64url(new TextEncoder().encode(texto))
}

/**
 * A chave PEM vem de DENTRO de um JSON (`GOOGLE_SA_JSON`) — o `JSON.parse`
 * já converteu os `\n` escapados em quebras reais. NÃO fazer
 * `.replace(/\\n/g, '\n')` em cima disso (dupla conversão). Mas também não
 * confiar que veio limpa: remove TODO whitespace do miolo (`\n`/`\r`/
 * espaços) antes do `atob`, e tira os delimitadores `-----BEGIN/END-----`.
 */
function pemParaArrayBuffer(pem: string): ArrayBuffer {
  const semDelimitadores = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  const binario = atob(semDelimitadores)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes.buffer
}

async function importarChavePrivada(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemParaArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

/**
 * Monta e assina o JWT do fluxo "service account" do Google
 * (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`): header
 * `{alg:'RS256', typ:'JWT'}`, claims `iss` (client_email), `scope`, `aud`
 * (token_uri), `iat`/`exp` (exp = iat + 3600). `now` é o relógio INJETADO —
 * é o que torna `iat`/`exp` testáveis sem esperar o relógio de verdade
 * andar.
 */
export async function assinarJwt(
  sa: ServiceAccount,
  scope: string,
  now: Date = new Date(),
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000)
  const exp = iat + 3600

  const headerB64 = base64urlDeString(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
  )
  const claimsB64 = base64urlDeString(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: sa.token_uri,
      iat,
      exp,
    }),
  )
  const entradaAssinada = `${headerB64}.${claimsB64}`

  const chave = await importarChavePrivada(sa.private_key)
  const assinatura = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    chave,
    new TextEncoder().encode(entradaAssinada),
  )

  return `${entradaAssinada}.${base64url(assinatura)}`
}

type TokenResponse = {
  access_token?: string
  expires_in?: number
  token_type?: string
}

type CacheEntry = {
  accessToken: string
  /** Instante (epoch, segundos) em que o token expira de verdade. */
  exp: number
}

/**
 * ⚠️ Cache POR ISOLATE, NÃO global — mesma natureza do `storage: 'memory'`
 * do rate limit do Better Auth (`lib/auth.ts`, já documentado no
 * `apps/ramielle/CLAUDE.md`). Sob carga a Cloudflare pode subir mais de um
 * isolate, e cada um paga o seu próprio access token — aceitável (um token
 * por isolate por hora), mas NUNCA tratar isto como cache compartilhado
 * entre requests de isolates diferentes. Chave: `client_email + '\n' +
 * scope` — o mesmo service account pode pedir tokens pra escopos
 * diferentes (Sheets, Drive), cada combinação com seu próprio token.
 */
const cacheDeTokens = new Map<string, CacheEntry>()

/** Renova com esta margem antes do `exp` real — evita um token que expira
 * NO MEIO de um request em voo. */
const MARGEM_RENOVACAO_SEGUNDOS = 5 * 60

export type GetAccessTokenDeps = {
  /** Relógio injetado — mesmo mecanismo de `assinarJwt`; é o que torna a
   * expiração/margem de renovação do cache testável sem esperar uma hora
   * de verdade. */
  now?: Date
}

/**
 * Troca o JWT assinado por um access token OAuth2 (fluxo service account),
 * com cache por isolate. Primeira chamada pra um `(client_email, scope)`
 * faz `fetch`; chamadas seguintes dentro da validade (menos a margem de 5
 * min) devolvem o token cacheado sem rede nenhuma.
 */
export async function getAccessToken(
  sa: ServiceAccount,
  scope: string,
  deps: GetAccessTokenDeps = {},
): Promise<string> {
  const now = deps.now ?? new Date()
  const agoraSegundos = Math.floor(now.getTime() / 1000)

  const chaveCache = `${sa.client_email}\n${scope}`
  const emCache = cacheDeTokens.get(chaveCache)
  if (emCache && emCache.exp - MARGEM_RENOVACAO_SEGUNDOS > agoraSegundos) {
    return emCache.accessToken
  }

  const jwt = await assinarJwt(sa, scope, now)

  const corpo = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  })

  const res = await fetch(sa.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: corpo.toString(),
  })

  if (!res.ok) {
    // ⚠️ NUNCA ecoar o corpo cru da resposta — `400`/`401` com
    // `{"error":"invalid_grant"}` é o caso real de relógio fora de
    // sincronia ou chave revogada, mas o corpo pode conter detalhe da
    // credencial (ex.: `error_description` citando o `iss`/JWT enviado).
    // Não lemos nem logamos o corpo — só o status HTTP, que não vaza nada.
    throw new Error(
      `Falha ao obter access token do Google (status ${res.status}) — confira se GOOGLE_SA_JSON não foi revogada/desativada e se o relógio do Worker está sincronizado.`,
    )
  }

  let dados: TokenResponse
  try {
    dados = (await res.json()) as TokenResponse
  } catch {
    throw new Error(
      'Resposta do token endpoint do Google não é um JSON válido — o serviço pode estar fora do ar.',
    )
  }

  if (
    typeof dados.access_token !== 'string' ||
    typeof dados.expires_in !== 'number'
  ) {
    throw new Error(
      'Resposta do token endpoint do Google sem access_token/expires_in — formato inesperado.',
    )
  }

  cacheDeTokens.set(chaveCache, {
    accessToken: dados.access_token,
    exp: agoraSegundos + dados.expires_in,
  })

  return dados.access_token
}
