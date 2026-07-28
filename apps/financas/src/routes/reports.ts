import { Hono } from 'hono'
import { cashflow } from '../domain/cashflow'
import { byCategory, commitments } from '../domain/reports'
import { getFixedNetCents, MAX_FIXED_NET_CENTS } from '../domain/settings'
import { errJson, okJson } from '../lib/envelope'

type Env = { Bindings: { DB: D1Database } }

export const reportsRoutes = new Hono<Env>()

/**
 * Precedência (Task 10, fix round 1): `?fixed_net_cents=` PRESENTE E VÁLIDO
 * na query > valor SALVO em `settings` (`PUT /api/settings`) >
 * `DEFAULT_FIXED_NET_CENTS` (esse último já é o fallback interno de
 * `getFixedNetCents` quando nada foi salvo — não precisa ser repetido
 * aqui). A query é só o atalho de depuração/preview que já existia antes
 * desta task — nunca grava nada; só o PUT persiste.
 *
 * ⚠️ Achado do round 1: `fixed_net_cents` PRESENTE mas INVÁLIDO (vazio,
 * não numérico, ≤ 0 — ex. `?fixed_net_cents=` de um bookmark velho ou uma
 * URL de debug digitada errada) é tratado como AUSENTE, caindo pro nível
 * seguinte da precedência (valor salvo), em vez de pular direto pro
 * `DEFAULT_FIXED_NET_CENTS`. A versão original pulava a etapa "valor
 * salvo" nesse caso — o dono podia ter R$ 5.480 salvo e ver a tela voltar
 * silenciosamente pra R$ 3.600 sem nenhum aviso. Escolha deliberada (não
 * `400 invalid_query`): `fixed_net_cents` nunca foi um parâmetro
 * ESTRUTURALMENTE obrigatório como `from`/`months` (que TÊM validação
 * `400`, ver `commitments()`) — é um atalho opcional que sempre se
 * comportou de forma tolerante (nunca lançou), e fazer um bookmark velho
 * quebrar com 400 seria uma regressão de UX maior que o ganho de
 * "consistência" com o resto do catálogo. Coberto por
 * `routes/reports.test.ts` ("fixed_net_cents malformado com valor salvo
 * existente usa o valor salvo, não o default").
 *
 * ⚠️ **M7 (fix final): validação alinhada com `setFixedNetCents`
 * (`domain/settings.ts`) — inteiro, `> 0`, `<= MAX_FIXED_NET_CENTS`.**
 * Antes, este atalho aceitava qualquer `Number.isFinite(n) && n > 0` —
 * `?fixed_net_cents=3600.5` passava direto, produzindo um denominador
 * FRACIONÁRIO de centavo (`3600.5`) num app cujo invariante, ponta a
 * ponta, é centavos INTEIROS (ver `packages/tools`/`formatBRL`/
 * `parseBRL`). O caminho que PERSISTE (`setFixedNetCents`) já exigia
 * `Number.isInteger` e um teto de sanidade; o atalho de leitura/preview
 * (nunca grava, ver parágrafo acima) não tinha por que ser mais
 * permissivo que o caminho que salva — os dois só diferem em UMA coisa,
 * que continua deliberada: valor ausente/inválido aqui cai pro nível
 * seguinte da precedência (tolerante), nunca em `400`/`422`.
 */
async function resolveFixedNetCents(
  db: D1Database,
  queryValue: string | undefined,
): Promise<number> {
  if (queryValue !== undefined) {
    const n = Number(queryValue)
    if (Number.isInteger(n) && n > 0 && n <= MAX_FIXED_NET_CENTS) return n
  }
  return getFixedNetCents(db)
}

reportsRoutes.get('/commitments', async (c) => {
  const from = c.req.query('from') ?? ''
  const months = Number(c.req.query('months') ?? '6')
  const fixed_net_cents = await resolveFixedNetCents(
    c.env.DB,
    c.req.query('fixed_net_cents'),
  )

  try {
    const report = await commitments(c.env.DB, {
      from,
      months,
      fixed_net_cents,
    })
    return okJson(report)
  } catch (err) {
    // RangeError so pode vir das duas validacoes explicitas de commitments()
    // (formato de `from`, janela de `months`) — as duas sao query malformada,
    // por isso 400 (nao o 422 usado quando o RangeError vem de um CAMPO de
    // corpo calendarialmente invalido, como em installments.ts/accounts.ts).
    if (err instanceof RangeError) {
      return errJson(400, 'invalid_query', err.message)
    }
    throw err
  }
})

/**
 * Mapa de fluxo de caixa (Task 2, fatia ⑧) — `cashflow()` já existe desde a
 * Task 1 (`domain/cashflow.ts`), esta rota é o primeiro consumidor HTTP.
 * Default de `months` é 12 (spec §5: "padrão 12 meses até o mês corrente"),
 * não 6 como `/commitments` — o mapa de fluxo é retrospectivo (histórico),
 * então uma janela maior por padrão faz mais sentido pra ver a reserva
 * sendo construída/consumida ao longo do tempo.
 *
 * ⚠️ `cashflow()` valida `months` em 1..24 (mesmo teto de `commitments()`),
 * não 1..36 — qualquer `months` fora dessa faixa já cai no branch de
 * `RangeError` abaixo e sai como 400, sem validação duplicada aqui.
 */
reportsRoutes.get('/cashflow', async (c) => {
  const from = c.req.query('from') ?? ''
  const months = Number(c.req.query('months') ?? '12')

  try {
    const report = await cashflow(c.env.DB, { from, months })
    return okJson(report)
  } catch (err) {
    // RangeError só pode vir das duas validações de cashflow() (formato de
    // `from`, janela de `months`) — query malformada, por isso 400 (mesmo
    // padrão de /commitments e /by-category acima). Sem este branch, um
    // `from`/`months` inválido vazaria como 500 sem envelope — já
    // aconteceu nesse módulo antes.
    if (err instanceof RangeError) {
      return errJson(400, 'invalid_query', err.message)
    }
    throw err
  }
})

reportsRoutes.get('/by-category', async (c) => {
  const competence = c.req.query('competence') ?? ''

  try {
    const report = await byCategory(c.env.DB, { competence })
    return okJson(report)
  } catch (err) {
    // RangeError vem de addMonthsToCompetence (via byCategory), disparado
    // pelo formato de `competence` invalido/ausente — e query string, por
    // isso 400 invalid_query, nunca 422 (mesmo padrao de /commitments acima).
    if (err instanceof RangeError) {
      return errJson(400, 'invalid_query', err.message)
    }
    throw err
  }
})
