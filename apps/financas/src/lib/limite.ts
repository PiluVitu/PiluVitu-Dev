import type { MiddlewareHandler } from 'hono'
import { errJson } from './envelope'
import { isRotaDeAuth } from './session'

/**
 * Limite por IP nas escritas de /api, com o binding de rate limit do Workers
 * (`ratelimits` no wrangler.jsonc). Números, medição e falha aberta: ver
 * "Cabeçalhos de segurança e limite de taxa" no CLAUDE.md do app.
 */
export type LimiteBindings = {
  ESCRITAS_LIMITE?: RateLimit
  IMPORTACAO_LIMITE?: RateLimit
}

type Balde = keyof LimiteBindings

/** O `period` de cada binding no wrangler.jsonc (conferido em teste). */
export const PERIODO_S: Record<Balde, number> = {
  ESCRITAS_LIMITE: 10,
  IMPORTACAO_LIMITE: 60,
}

export const CHAVE_SEM_IP = 'sem-ip'

const METODOS_DE_ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function baldeDa(metodo: string, caminho: string): Balde | null {
  if (!METODOS_DE_ESCRITA.has(metodo)) return null
  if (caminho === '/api/health' || isRotaDeAuth(caminho)) return null
  if (
    caminho === '/api/transactions/import' ||
    caminho.startsWith('/api/pluggy/')
  ) {
    return 'IMPORTACAO_LIMITE'
  }
  return 'ESCRITAS_LIMITE'
}

export function limitarEscritas<
  TBindings extends LimiteBindings,
>(): MiddlewareHandler<{ Bindings: TBindings }> {
  return async (c, next) => {
    const balde = baldeDa(c.req.method, c.req.path)
    if (!balde) return next()

    let liberado = true
    try {
      const limitador = c.env[balde]
      if (!limitador) throw new Error('binding ausente')
      const chave = c.req.header('cf-connecting-ip') ?? CHAVE_SEM_IP
      liberado = (await limitador.limit({ key: chave })).success
    } catch (err) {
      console.error(
        `[financas] ${balde} indisponível; a escrita segue sem limite:`,
        err instanceof Error ? err.message : 'erro sem mensagem',
      )
    }
    if (liberado) return next()

    const periodo = PERIODO_S[balde]
    const res = errJson(
      429,
      'rate_limited',
      `Muitas gravações em pouco tempo. Espere ${periodo} segundos e tente de novo.`,
    )
    res.headers.set('Retry-After', String(periodo))
    return res
  }
}
