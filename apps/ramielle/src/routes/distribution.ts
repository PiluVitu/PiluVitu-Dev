/**
 * As 3 rotas de distribuição de artigo (dev.to, Hashnode, Bluesky,
 * Mastodon) — Task 4 (ÚLTIMA) da fatia
 * `.superpowers/sdd/2026-08-13-ramielle-distribuicao/`. Porte 1:1 de
 * `apps/api/internal/handlers/distribution/handlers.go` (129 linhas);
 * `handlers_test.go` é o oráculo de paridade de status/`code`/mensagem.
 *
 * Monta `Publisher[]` (`domain/distribution-service.ts`) a partir das 7
 * bindings de credencial (`lib/auth.ts#AuthBindings`) e delega pros três
 * orquestradores da Task 3 (`buildDistributionProposals`/
 * `publishDistributionTargets`/`listDistributionProposals`). Zero lógica de
 * negócio nova aqui — só parse de corpo, tradução de campo, wiring e
 * status/`code`/mensagem.
 *
 * ⚠️ **Achado desta task, MEDIDO contra `apps/api/cmd/api/main.go:93-121` e
 * `internal/router/router.go:89-93` — o brief descreve OUTRA coisa do que
 * o Go realmente faz em produção, e aqui fica o porquê da escolha final.**
 * O brief (e o plano, achado 4 da seção "Fatos medidos") afirma "a feature
 * inteira é 503 `distribution_unavailable` quando nenhuma das 4 plataformas
 * está configurada". Isso é o CONTRATO documentado e testado em
 * `handlers.go#down`/`handlers_test.go#TestPublishHandler503WhenNil` — mas
 * medindo main.go linha a linha: `distH` (o `*Handlers`) só é construído
 * DENTRO de `if len(pubs) > 0 { ... }` (`main.go:108`); quando
 * `len(pubs) == 0`, `distH` fica com o zero-value `nil`, e o router
 * (`router.go:89`, `if deps.DistributionHandlers != nil`) NUNCA registra
 * `/admin/distribution/*` — uma requisição real cai no `404` PADRÃO do chi
 * (texto puro, fora do envelope `httpx`), nunca no `503 distribution_unavailable`
 * dentro do envelope. O caminho que a `down()` prova só é alcançado por
 * `handlers_test.go` chamando o handler DIRETO (bypassando o router) — é
 * código morto no binário real. Decisão: **implementei o CONTRATO
 * documentado/testado (sempre montar; `503` quando `pubs.length === 0`),
 * não o efeito colateral da fiação do main.go**, por três motivos: (1) é
 * o que os comentários E o teste dedicado do Go realmente afirmam ser o
 * comportamento pretendido; (2) Hono não tem como replicar "só registra a
 * rota se o env tiver X" — `app.route()` roda na montagem do módulo, antes
 * de qualquer `env`/request existir, então "desmontar condicionalmente"
 * exigiria reescrever o modelo de roteamento inteiro deste Worker; (3) é
 * exatamente o padrão que TODA outra rota degradável deste Worker já usa
 * (`routes/atelier.ts#promeiaConfigurado`, `routes/votacao.ts`
 * `sheets_disabled`) — sempre montada, 503 decidido dentro do handler a
 * cada request. Reportado ao coordenador, não uma correção silenciosa.
 */
import { Hono } from 'hono'
import {
  buildDistributionProposals,
  listDistributionProposals,
  publishDistributionTargets,
  type Article,
  type Publisher,
  type Selected,
} from '../domain/distribution-service'
import type { AuthBindings } from '../lib/auth'
import { errJson, okJson } from '../lib/envelope'
import { promeiaConfigurado } from '../lib/promeia'
import {
  BLUESKY_KIND,
  BLUESKY_PLATFORM,
  publishBluesky,
} from '../lib/publishers/bluesky'
import {
  DEVTO_KIND,
  DEVTO_PLATFORM,
  publishDevTo,
} from '../lib/publishers/devto'
import {
  HASHNODE_KIND,
  HASHNODE_PLATFORM,
  publishHashnode,
} from '../lib/publishers/hashnode'
import {
  MASTODON_KIND,
  MASTODON_PLATFORM,
  publishMastodon,
} from '../lib/publishers/mastodon'
import { requireAdmin, type SessionVariables } from '../lib/session'

type Env = {
  Bindings: AuthBindings
  Variables: SessionVariables
}

const distributionRoutes = new Hono<Env>()

// Mensagens LITERAIS da tabela do plano (`docs/superpowers/plans/2026-08-13-ramielle-distribuicao.md`
// § "As 3 rotas e o contrato vivo") — o `apps/web` mostra `primary.message`
// direto em `toast.error` (`lib/admin/atelier/api.ts`), então divergir aqui
// muda o que o dono lê na tela.
const MSG_DISTRIBUICAO_INDISPONIVEL = 'Distribuição indisponível.'
const MSG_SLUG_OBRIGATORIO = "Corpo inválido: 'slug' é obrigatório."
const MSG_CORPO_INVALIDO = 'Corpo inválido.'

/**
 * Monta a lista de `Publisher` a partir das 7 bindings — porte 1:1 do
 * bloco `main.go:93-105`, MESMA ordem, MESMA armadilha 9 (só a primeira
 * env var de cada par de 2 é validada antes de construir o publisher; a
 * segunda entra vazia (`?? ''`) e só falharia na hora de publicar de
 * verdade). Exportada só para o teste unitário da armadilha 9 — nenhuma
 * outra rota deste Worker importa isto.
 */
export function montarPublishers(env: AuthBindings): Publisher[] {
  const pubs: Publisher[] = []

  if (env.DEVTO_API_KEY) {
    pubs.push({
      platform: DEVTO_PLATFORM,
      kind: DEVTO_KIND,
      publish: (payload) =>
        publishDevTo({ apiKey: env.DEVTO_API_KEY as string }, payload),
    })
  }
  if (env.HASHNODE_API_TOKEN) {
    // ⚠️ armadilha 9: HASHNODE_PUBLICATION_ID pode estar ausente.
    pubs.push({
      platform: HASHNODE_PLATFORM,
      kind: HASHNODE_KIND,
      publish: (payload) =>
        publishHashnode(
          {
            token: env.HASHNODE_API_TOKEN as string,
            publicationId: env.HASHNODE_PUBLICATION_ID ?? '',
          },
          payload,
        ),
    })
  }
  if (env.BLUESKY_HANDLE) {
    // ⚠️ armadilha 9: BLUESKY_APP_PASSWORD pode estar ausente.
    pubs.push({
      platform: BLUESKY_PLATFORM,
      kind: BLUESKY_KIND,
      publish: (payload) =>
        publishBluesky(
          {
            handle: env.BLUESKY_HANDLE as string,
            appPassword: env.BLUESKY_APP_PASSWORD ?? '',
          },
          payload,
        ),
    })
  }
  if (env.MASTODON_INSTANCE_URL) {
    // ⚠️ armadilha 9: MASTODON_ACCESS_TOKEN pode estar ausente.
    pubs.push({
      platform: MASTODON_PLATFORM,
      kind: MASTODON_KIND,
      publish: (payload) =>
        publishMastodon(
          {
            instanceUrl: env.MASTODON_INSTANCE_URL as string,
            token: env.MASTODON_ACCESS_TOKEN ?? '',
          },
          payload,
        ),
    })
  }

  return pubs
}

function strOr(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function tagsOr(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : []
}

/**
 * Primeiros `n` code points de `s` — porte de `firstRunes`
 * (`apps/api/internal/handlers/distribution/handlers.go:121-129`, que
 * decodifica rune a rune até `n` ou o fim da string). `[...s]` itera por
 * code point (o "rune" do Go) — mesma técnica já usada pro limite de
 * caracteres em `lib/publishers/bluesky.ts`/`mastodon.ts`.
 */
function firstRunes(s: string, n: number): string {
  return [...s].slice(0, n).join('')
}

type SelectedWire = {
  platform?: unknown
  content?: unknown
  title?: unknown
  canonical_url?: unknown
  description?: unknown
  tags?: unknown
}

/**
 * Traduz UM alvo do corpo JSON (snake_case, contrato vivo do `apps/web` —
 * `lib/admin/atelier/types.ts#SelectedTarget`) pro `Selected` camelCase que
 * `publishDistributionTargets` consome (`domain/distribution-service.ts`).
 *
 * ⚠️ **É este mapeamento campo a campo, e não um cast, que evita a
 * armadilha que a T3 deixou avisada**: `Selected` é camelCase
 * (`canonicalUrl`), o corpo que chega é snake_case (`canonical_url`), e
 * como TODO campo além de `platform`/`content` é opcional, um `body.targets
 * as Selected[]` teria COMPILADO e descartado `title`/`canonical_url`/
 * `description`/`tags` em silêncio — o Bluesky deixaria de criar a reply
 * com o link, e os crossposts sairiam sem canonical, duplicando conteúdo
 * contra o próprio blog do dono. `distribution.test.ts` prova o
 * mapeamento `canonical_url → canonicalUrl` ponta a ponta (corpo da
 * requisição → corpo REAL enviado ao dev.to).
 */
function traduzirSelected(bruto: unknown): Selected {
  const t: SelectedWire =
    typeof bruto === 'object' && bruto !== null ? (bruto as SelectedWire) : {}
  return {
    platform: strOr(t.platform),
    content: strOr(t.content),
    title: typeof t.title === 'string' ? t.title : undefined,
    canonicalUrl:
      typeof t.canonical_url === 'string' ? t.canonical_url : undefined,
    description: typeof t.description === 'string' ? t.description : undefined,
    tags: Array.isArray(t.tags)
      ? t.tags.filter((x): x is string => typeof x === 'string')
      : undefined,
  }
}

type ProposalsWireBody = {
  slug?: unknown
  title?: unknown
  excerpt?: unknown
  url?: unknown
  body?: unknown
  tags?: unknown
}

/**
 * `POST /admin/distribution/proposals` — porte de `Handlers.Proposals`
 * (`handlers.go:52-79`). `200 {data:{targets:[...]}}` | `400 invalid_json`
 * | `502 proposals_failed` | `503 distribution_unavailable`.
 */
distributionRoutes.post(
  '/distribution/proposals',
  requireAdmin<AuthBindings>(),
  async (c) => {
    const pubs = montarPublishers(c.env)
    if (pubs.length === 0) {
      return errJson(
        503,
        'distribution_unavailable',
        MSG_DISTRIBUICAO_INDISPONIVEL,
      )
    }

    let corpo: ProposalsWireBody
    try {
      corpo = await c.req.json()
    } catch {
      return errJson(400, 'invalid_json', MSG_SLUG_OBRIGATORIO)
    }
    const slug = strOr(corpo.slug)
    if (slug === '') {
      return errJson(400, 'invalid_json', MSG_SLUG_OBRIGATORIO)
    }

    const bodyMd = strOr(corpo.body)
    const art: Article = {
      title: strOr(corpo.title),
      excerpt: strOr(corpo.excerpt),
      url: strOr(corpo.url),
      tags: tagsOr(corpo.tags),
      voiceSample: firstRunes(bodyMd, 800),
    }

    try {
      const targets = await buildDistributionProposals(
        c.env.DB,
        pubs,
        promeiaConfigurado(c.env),
        slug,
        art,
        bodyMd,
      )
      return okJson({ targets })
    } catch (err) {
      console.error('POST /admin/distribution/proposals falhou', err)
      return errJson(502, 'proposals_failed', 'Falha ao gerar propostas.')
    }
  },
)

/**
 * `GET /admin/distribution/:slug` — porte de `Handlers.Get`
 * (`handlers.go:81-95`). `200 {data:{targets:[...]}}` | `500 internal_error`
 * | `503 distribution_unavailable`.
 */
distributionRoutes.get(
  '/distribution/:slug',
  requireAdmin<AuthBindings>(),
  async (c) => {
    const pubs = montarPublishers(c.env)
    if (pubs.length === 0) {
      return errJson(
        503,
        'distribution_unavailable',
        MSG_DISTRIBUICAO_INDISPONIVEL,
      )
    }

    const slug = c.req.param('slug')
    try {
      const targets = await listDistributionProposals(c.env.DB, slug)
      return okJson({ targets })
    } catch (err) {
      console.error('GET /admin/distribution/:slug falhou', err)
      return errJson(500, 'internal_error', 'Falha ao ler distribuição.')
    }
  },
)

/**
 * `POST /admin/distribution/:slug/publish` — porte de `Handlers.Publish`
 * (`handlers.go:97-119`). `200 {data:{targets:[...]}}` (sempre RELIDO do
 * banco) | `400 invalid_json` | `502 publish_failed` |
 * `503 distribution_unavailable`.
 */
distributionRoutes.post(
  '/distribution/:slug/publish',
  requireAdmin<AuthBindings>(),
  async (c) => {
    const pubs = montarPublishers(c.env)
    if (pubs.length === 0) {
      return errJson(
        503,
        'distribution_unavailable',
        MSG_DISTRIBUICAO_INDISPONIVEL,
      )
    }

    const slug = c.req.param('slug')

    let corpo: { targets?: unknown }
    try {
      corpo = await c.req.json()
    } catch {
      return errJson(400, 'invalid_json', MSG_CORPO_INVALIDO)
    }
    // Paridade com o decode do Go: `targets` ausente é `nil`/`[]` válido
    // (corpo `{}` não é erro); `targets` presente mas de tipo errado É erro
    // de decode no Go (`[]dist.Selected` não bate) — replicado aqui.
    if (corpo.targets !== undefined && !Array.isArray(corpo.targets)) {
      return errJson(400, 'invalid_json', MSG_CORPO_INVALIDO)
    }
    const selected: Selected[] = (
      (corpo.targets as unknown[] | undefined) ?? []
    ).map(traduzirSelected)

    try {
      const targets = await publishDistributionTargets(
        c.env.DB,
        pubs,
        slug,
        selected,
      )
      return okJson({ targets })
    } catch (err) {
      console.error('POST /admin/distribution/:slug/publish falhou', err)
      return errJson(502, 'publish_failed', 'Falha ao publicar.')
    }
  },
)

export default distributionRoutes
