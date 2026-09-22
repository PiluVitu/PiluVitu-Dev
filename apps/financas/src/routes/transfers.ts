import { Hono } from 'hono'
import {
  getNomesProprios,
  parearTransferencias,
  setNomesProprios,
} from '../domain/transfer-pairing'
import { errJson, okJson } from '../lib/envelope'

type Env = { Bindings: { DB: D1Database } }

export const transfersRoutes = new Hono<Env>()

transfersRoutes.get('/transfers/self-names', async (c) => {
  const names = await getNomesProprios(c.env.DB)
  return okJson({ names })
})

transfersRoutes.put('/transfers/self-names', async (c) => {
  let body: { names?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', 'corpo da requisicao nao e JSON valido')
  }
  if (
    !Array.isArray(body.names) ||
    body.names.some((n) => typeof n !== 'string')
  ) {
    return errJson(
      422,
      'invalid_setting',
      'names precisa ser uma lista de strings',
      'names',
    )
  }
  await setNomesProprios(c.env.DB, body.names as string[])
  return okJson({ names: await getNomesProprios(c.env.DB) })
})

/**
 * Passa o pareamento no ledger inteiro (ou na janela pedida). Existe pra dois
 * usos: o backfill de quem ja tinha extrato importado antes deste modulo, e
 * uma correcao manual quando o dono cadastra um nome proprio novo. O caminho
 * do dia a dia NAO passa por aqui — `importTransactions` ja pareia sozinho a
 * janela que acabou de gravar.
 */
transfersRoutes.post('/transfers/pair', async (c) => {
  const dryRun = c.req.query('dry_run') === '1'
  const from = c.req.query('from') ?? undefined
  const to = c.req.query('to') ?? undefined

  const { pares } = await parearTransferencias(c.env.DB, {
    from,
    to,
    dry_run: dryRun,
  })

  return okJson({
    dry_run: dryRun,
    pares: pares.length,
    total_cents: pares.reduce((soma, p) => soma + p.amount_cents, 0),
    detalhes: pares,
  })
})
