import { type Context, Hono } from 'hono'
import type { AuthBindings } from '../lib/auth'
import { errJson, okJson } from '../lib/envelope'
import { buscarSessaoDoHistorico, listarHistorico } from '../domain/historico'

export type HistoricoBindings = AuthBindings & {
  HISTORICO_LIMITE?: RateLimit
}

// Público e só leitura: nada de requireAuth/resolveSession, que gravam no D1
// e podem devolver Set-Cookie, o que impediria o cache compartilhado.
const historicoRoutes = new Hono<{ Bindings: HistoricoBindings }>()

const CACHE_PUBLICO = 'public, max-age=60, s-maxage=300'

type Ctx = Context<{ Bindings: HistoricoBindings }>

// Teto de 6 dígitos: OFFSET maior que isso não tem sessão nenhuma.
function lerPagina(valor: string | undefined): number | null {
  if (valor === undefined) return 1
  if (!/^[1-9]\d{0,5}$/.test(valor)) return null
  return Number(valor)
}

function lerId(valor: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(valor)) return null
  const id = Number(valor)
  return Number.isSafeInteger(id) ? id : null
}

function contextoDeExecucao(
  c: Ctx,
): { waitUntil(p: Promise<unknown>): void } | null {
  try {
    return c.executionCtx
  } catch {
    return null
  }
}

/**
 * No Custom Domain o Worker é a origem e o CDN não guarda a resposta dele: o
 * cache é a Cache API. Chave sem cabeçalho (cookie não separa entradas).
 */
async function comCache(
  c: Ctx,
  caminho: string,
  gerar: () => Promise<Response>,
): Promise<Response> {
  const chave = new Request(new URL(caminho, c.req.url).toString())
  const cache = await caches.open('historico')
  const guardada = await cache.match(chave)
  if (guardada) return new Response(guardada.body, guardada)

  const limite = c.env.HISTORICO_LIMITE
  if (limite) {
    const ip = c.req.header('cf-connecting-ip') ?? 'sem-ip'
    const { success } = await limite.limit({ key: ip })
    if (!success) {
      return errJson(
        429,
        'rate_limited',
        'Muitos pedidos. Tente de novo em instantes.',
      )
    }
  }

  const res = await gerar()
  if (res.status !== 200) return res
  res.headers.set('Cache-Control', CACHE_PUBLICO)
  const ctx = contextoDeExecucao(c)
  ctx?.waitUntil(cache.put(chave, res.clone()))
  return res
}

historicoRoutes.get('/historico', async (c) => {
  const page = lerPagina(c.req.query('page'))
  if (page === null) {
    return errJson(400, 'invalid_page', 'Página inválida.', 'page')
  }
  return comCache(c, `/votacao/historico?page=${page}`, async () =>
    okJson(await listarHistorico(c.env.DB, page)),
  )
})

historicoRoutes.get('/historico/:id', async (c) => {
  const id = lerId(c.req.param('id'))
  if (id === null) {
    return errJson(400, 'invalid_id', 'Identificador inválido.')
  }
  return comCache(c, `/votacao/historico/${id}`, async () => {
    const sessao = await buscarSessaoDoHistorico(c.env.DB, id)
    if (!sessao) {
      return errJson(404, 'not_found', 'Votação não encontrada no histórico.')
    }
    return okJson(sessao)
  })
})

export default historicoRoutes
