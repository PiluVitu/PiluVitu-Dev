/**
 * `next/headers` falso para os testes do preview e do admin, no lugar do request store do Next.
 * Cada teste liga com `jest.mock('next/headers', () => jest.requireActual('@/lib/next-headers-falso').modulo)`.
 *
 * Imita o que o Next 16 faz num route handler: `cookies().set/delete` gravam no Set-Cookie da
 * resposta e o `get` seguinte já vê o valor novo; `draftMode().enable()` grava o
 * `__prerender_bypass` com as opções de `server/async-storage/draft-mode-provider.js`.
 */

export type OpcoesDoCookie = {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  path?: string
  maxAge?: number
  expires?: Date
}

export type CookieDaResposta = {
  nome: string
  valor: string
  opcoes: OpcoesDoCookie
  apagado: boolean
}

const estado = {
  pedido: new Map<string, string>(),
  resposta: [] as CookieDaResposta[],
  draftLigado: false,
  previewModeId: 'id-do-preview-do-build',
}

export const nextHeadersFalso = {
  /** Zera tudo e define os cookies que o navegador mandou no pedido. */
  reiniciar(cookiesDoPedido: Record<string, string> = {}, draftLigado = false) {
    estado.pedido = new Map(Object.entries(cookiesDoPedido))
    estado.resposta = []
    estado.draftLigado = draftLigado
  },
  /** Cada Set-Cookie que a resposta levaria, na ordem em que foi gravado. */
  get setCookies(): readonly CookieDaResposta[] {
    return estado.resposta
  },
  /** O último Set-Cookie de cada nome, que é o que o navegador fica valendo. */
  final(nome: string): CookieDaResposta | undefined {
    return [...estado.resposta].reverse().find((c) => c.nome === nome)
  },
  get draftLigado() {
    return estado.draftLigado
  },
  get previewModeId() {
    return estado.previewModeId
  },
}

function gravar(nome: string, valor: string, opcoes: OpcoesDoCookie) {
  const apagado = opcoes.expires !== undefined && opcoes.expires.getTime() <= 0
  estado.resposta.push({ nome, valor, opcoes, apagado })
}

function valorAtual(nome: string): string | undefined {
  const ultimo = nextHeadersFalso.final(nome)
  if (ultimo) return ultimo.apagado ? undefined : ultimo.valor
  return estado.pedido.get(nome)
}

const jar = {
  get(nome: string) {
    const valor = valorAtual(nome)
    return valor === undefined ? undefined : { name: nome, value: valor }
  },
  has(nome: string) {
    return valorAtual(nome) !== undefined
  },
  set(nome: string, valor: string, opcoes: OpcoesDoCookie = {}) {
    gravar(nome, valor, { path: '/', ...opcoes })
    return jar
  },
  delete(nome: string) {
    gravar(nome, '', { path: '/', expires: new Date(0) })
    return jar
  },
}

function opcoesDoBypass(): OpcoesDoCookie {
  const dev = process.env.NODE_ENV === 'development'
  return {
    httpOnly: true,
    sameSite: dev ? 'lax' : 'none',
    secure: !dev,
    path: '/',
  }
}

export const modulo = {
  cookies: async () => jar,
  headers: async () => new Headers(),
  draftMode: async () => ({
    get isEnabled() {
      return estado.draftLigado
    },
    enable() {
      gravar('__prerender_bypass', estado.previewModeId, opcoesDoBypass())
      estado.draftLigado = true
    },
    disable() {
      gravar('__prerender_bypass', '', {
        ...opcoesDoBypass(),
        expires: new Date(0),
      })
      estado.draftLigado = false
    },
  }),
}

type ModuloDoPreview = {
  selarPreview: (
    dados: { branch: string; login: string },
    agora: number,
  ) => string
}

/** Sela um preview como o `/preview/start` faz, para os testes dos leitores. */
export function selarPreviewDeTeste(
  branch: string,
  { login = 'dona-do-blog', agora = Date.now() } = {},
): string {
  const { selarPreview } = jest.requireActual<ModuloDoPreview>('@/lib/preview')
  return selarPreview({ branch, login }, agora)
}

/** Resposta de um route handler, inclusive o `redirect()` do Next, que é um throw. */
export async function responder(
  handler: () => Promise<Response>,
): Promise<{ status: number; location: string | null; corpo: string }> {
  try {
    const res = await handler()
    return {
      status: res.status,
      location: res.headers.get('location'),
      corpo: await res.text(),
    }
  } catch (erro) {
    const digest = (erro as { digest?: unknown }).digest
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
      const [, , url, status] = digest.split(';')
      return { status: Number(status), location: url ?? null, corpo: '' }
    }
    throw erro
  }
}
