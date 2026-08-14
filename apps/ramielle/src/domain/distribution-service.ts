/**
 * O serviço que orquestra propostas + publicação de distribuição de artigo
 * (dev.to, Hashnode, Bluesky, Mastodon) — Task 3 da fatia
 * `.superpowers/sdd/2026-08-13-ramielle-distribuicao/`. Porte 1:1 de
 * `apps/api/internal/distribution/service.go` (119 linhas); `service_test.go`
 * (131 linhas, `fakeHooks`/`fakePub`) é o oráculo de paridade —
 * `distribution-service.test.ts` porta os casos dele.
 *
 * Estilo funcional (sem classe `Service`), mesmo padrão já usado por
 * `domain/distribution.ts`/`domain/sessions.ts`/`domain/votes.ts`: cada
 * operação é uma função que recebe `db: D1Database` (e aqui também os
 * publishers/config) como primeiro(s) parâmetro(s), em vez de campos de
 * struct guardados num construtor.
 *
 * O `HookGenerator` do Go (`GenerateHooks(ctx, Article, platforms)`) vira uma
 * chamada a `chamarPromeia('/llm/hooks', {article, platforms}, cfg)`
 * (`lib/promeia.ts`, já pronto — nada de infraestrutura nova aqui). O
 * contrato do lado promeia é `POST /llm/hooks` (`revisao_rotas.py`):
 * corpo `{article: {title, excerpt, url, tags, voice_sample}, platforms}`,
 * resposta `data: {hooks: [{platform, text}, ...]}`.
 */
import { nowIsoUtc } from '../lib/dates'
import { chamarPromeia, type PromeiaConfig } from '../lib/promeia'
import type { DistributionPlatform, Payload } from '../lib/publishers/types'
import {
  getDistributionTarget,
  listDistributionTargetsBySlug,
  markDistributionTargetFailed,
  markDistributionTargetPosted,
  upsertDistributionTarget,
  type DistributionKind,
  type DistributionTarget,
} from './distribution'

/**
 * Resumo do artigo usado para gerar as chamadas sociais — porte de
 * `pkgllm.Article` (`apps/api/internal/llm/client.go:141-147`).
 * `voiceSample` é o trecho do corpo (~800 chars) usado como referência de
 * tom/voz do autor; vira `article.voice_sample` no corpo mandado ao promeia.
 */
export type Article = {
  title: string
  excerpt: string
  url: string
  tags: string[]
  voiceSample: string
}

/**
 * Um adapter de plataforma já configurado (closure sobre a credencial),
 * pronto pro serviço orquestrar. Porte funcional da interface
 * `distribution.Publisher` do Go (`Platform() string`, `Kind() Kind`,
 * `Publish(ctx, Payload) (string, error)`) — `lib/publishers/types.ts`
 * deixa explícito que compor os 4 adapters (`publishDevTo`/
 * `publishHashnode`/`publishBluesky`/`publishMastodon`) num tipo iterável é
 * decisão de quem implementasse o serviço; esta é essa decisão.
 *
 * Quem monta a lista (Task 4, as rotas) faz algo como:
 * ```ts
 * { platform: DEVTO_PLATFORM, kind: DEVTO_KIND, publish: (p) => publishDevTo(cfg, p) }
 * ```
 */
export type Publisher = {
  platform: DistributionPlatform
  kind: DistributionKind
  publish: (payload: Payload) => Promise<string>
}

/**
 * Deduplica por `platform` — porte do `map[string]Publisher` que
 * `NewService` monta (`service.go:22-27`): se dois publishers da lista
 * compartilham a mesma plataforma, o ÚLTIMO da lista vence (mesma semântica
 * de `m[p.Platform()] = p` sobrescrevendo repetidamente). A ORDEM de
 * iteração do mapa do Go é indeterminada; aqui é determinística (ordem de
 * inserção do `Map`) — inócuo, nenhum teste (nem o do Go, nem este porte)
 * depende da ORDEM de saída de `buildDistributionProposals`, só do
 * conjunto de alvos.
 */
function pubsPorPlataforma(pubs: Publisher[]): Map<string, Publisher> {
  const out = new Map<string, Publisher>()
  for (const p of pubs) out.set(p.platform, p)
  return out
}

/**
 * Monta os alvos de distribuição — artigos de crosspost (conteúdo = corpo
 * completo) + hooks sociais (gerados via promeia) —, PERSISTE tudo, e
 * devolve a lista. Porte de `Service.BuildProposals` (`service.go:42-70`).
 *
 * ⚠️ **A lista devolvida é a de MEMÓRIA, com `status:'pending'` SEMPRE**
 * (armadilha 5 do plano) — nunca relida do banco. Se algum dos alvos já
 * estava `'posted'` (reproposta), o UPSERT abaixo preserva o `status` real
 * NO BANCO (`upsertDistributionTarget`, `CASE WHEN ... THEN 'posted'`), mas
 * o valor DEVOLVIDO por esta função continua `'pending'` — a proteção
 * contra rebaixar um alvo já publicado mora no upsert, não neste retorno.
 * `publishDistributionTargets` (abaixo) é quem relê o banco.
 *
 * ⚠️ **Os DOIS estados do gerador de hooks** (acréscimo do coordenador,
 * medido em `service.go:54-63` — o brief original não capturava isso):
 * - `promeiaCfg === null` (gerador NÃO configurado, ex.: `PROMEIA_URL`/
 *   `PROMEIA_TOKEN` ausentes) ⇒ pula os sociais em SILÊNCIO — devolve só os
 *   artigos, sem erro. Mandar o dono subir um serviço que já está de pé (ou
 *   que ele simplesmente não configurou ainda) impediria gerar crosspost de
 *   artigo sempre que o Mac estiver desligado — o caso comum.
 * - `promeiaCfg` configurado mas `chamarPromeia` LANÇA
 *   (`PromeiaInalcancavel`/`PromeiaRecusou`) ⇒ o erro PROPAGA e esta função
 *   inteira falha — nenhum alvo é persistido, nem os de artigo já montados
 *   em memória. O loop de `upsertDistributionTarget` só roda DEPOIS que a
 *   lista inteira monta com sucesso (mesma ordem de `service.go:64-70`:
 *   `return nil, err` acontece ANTES do loop de `Upsert`).
 */
export async function buildDistributionProposals(
  db: D1Database,
  pubs: Publisher[],
  promeiaCfg: PromeiaConfig | null,
  slug: string,
  art: Article,
  bodyMd: string,
): Promise<DistributionTarget[]> {
  const pubsUnicos = [...pubsPorPlataforma(pubs).values()]
  const targets: DistributionTarget[] = []

  // 1) artigos (republicação): conteúdo = corpo completo.
  for (const pub of pubsUnicos) {
    if (pub.kind === 'article_crosspost') {
      targets.push({
        slug,
        platform: pub.platform,
        kind: 'article_crosspost',
        content: bodyMd,
        status: 'pending',
        remote_url: '',
        error: '',
      })
    }
  }

  // 2) sociais: uma chamada ao promeia (que gera uma chamada de chat por
  // plataforma do lado dele) — nunca uma requisição por adapter aqui.
  const social = pubsUnicos
    .filter((p) => p.kind === 'social_hook')
    .map((p) => p.platform)
  if (social.length > 0 && promeiaCfg !== null) {
    const data = await chamarPromeia<{
      hooks: { platform: string; text: string }[]
    }>(
      '/llm/hooks',
      {
        article: {
          title: art.title,
          excerpt: art.excerpt,
          url: art.url,
          tags: art.tags,
          voice_sample: art.voiceSample,
        },
        platforms: social,
      },
      promeiaCfg,
    )
    for (const hook of data.hooks) {
      targets.push({
        slug,
        platform: hook.platform,
        kind: 'social_hook',
        content: hook.text,
        status: 'pending',
        remote_url: '',
        error: '',
      })
    }
  }
  // promeiaCfg === null: pula os sociais em silêncio — nenhum alvo social
  // entra em `targets`, nenhum erro lançado.

  for (const target of targets) {
    await upsertDistributionTarget(db, {
      slug: target.slug,
      platform: target.platform,
      kind: target.kind,
      content: target.content,
      status: target.status,
    })
  }

  return targets
}

/**
 * Alvo escolhido pra publicar, com o conteúdo final (editado na UI) — porte
 * de `distribution.Selected` (`service.go:73-80`). `content` é o texto
 * final: pra social é o hook, pra artigo é o corpo MD.
 *
 * ⚠️ **Não tem campo `kind`, de propósito** — mesma proteção estrutural do
 * Go, onde `Selected` também não carrega `Kind`. Ver a armadilha 8 no
 * comentário de `publishDistributionTargets` abaixo.
 */
export type Selected = {
  platform: string
  content: string
  title?: string
  canonicalUrl?: string
  description?: string
  tags?: string[]
}

/**
 * Publica os alvos selecionados — pula os que já estão `'posted'`
 * (idempotência, armadilha 3), reseta `'failed'`→`'pending'` antes de
 * retentar, e devolve o estado ATUAL relido do banco (nunca a lista de
 * memória — diferente de `buildDistributionProposals`). Porte de
 * `Service.Publish` (`service.go:83-114`).
 *
 * ⚠️ **`kind` vem do adapter (`pub.kind`), NUNCA do cliente** (armadilha
 * 8) — `Selected` nem tem campo `kind` (mesma estrutura do Go); mesma
 * proteção de `service.go:95` (`kind := pub.Kind()`), replicada aqui pelo
 * TIPO, não só pelo código: mesmo que um chamador force um objeto com
 * `kind` extra via cast, o valor gravado é sempre `pub.kind`.
 *
 * ⚠️ **Nenhuma das 4 plataformas dedupa do lado delas** — o `continue`
 * quando `existente.status === 'posted'` é a ÚNICA proteção contra publicar
 * em duplicidade em todo o sistema.
 *
 * Falhas de publicação (`pub.publish` rejeitando) são capturadas POR ALVO —
 * marcam `failed` com a mensagem e o loop CONTINUA pros próximos
 * selecionados (mesma semântica do `perr != nil { markFailed; continue }`
 * do Go). Diferente disso, uma falha de ESCRITA no D1 (upsert/mark*)
 * propaga normalmente — o Go descarta esses erros (`_ = s.store.Upsert(...)`
 * etc.), mas nada no plano/brief desta task pede replicar esse descarte
 * silencioso, e mantê-los visíveis é mais seguro.
 */
export async function publishDistributionTargets(
  db: D1Database,
  pubs: Publisher[],
  slug: string,
  selected: Selected[],
): Promise<DistributionTarget[]> {
  const porPlataforma = pubsPorPlataforma(pubs)

  for (const sel of selected) {
    const pub = porPlataforma.get(sel.platform)
    if (pub === undefined) continue // plataforma sem adapter configurado

    const existente = await getDistributionTarget(db, slug, sel.platform)
    if (existente !== null && existente.status === 'posted') {
      continue // idempotência (armadilha 3) — pula alvo já publicado
    }

    // Re-upsert reseta um alvo 'failed' pra 'pending' antes de tentar de
    // novo; 'posted' já foi filtrado acima e nunca chega aqui.
    await upsertDistributionTarget(db, {
      slug,
      platform: sel.platform,
      kind: pub.kind,
      content: sel.content,
      status: 'pending',
    })

    const payload: Payload = {
      text: sel.content,
      bodyMd: sel.content,
      title: sel.title,
      canonicalUrl: sel.canonicalUrl,
      description: sel.description,
      tags: sel.tags,
    }

    try {
      const remoteUrl = await pub.publish(payload)
      await markDistributionTargetPosted(
        db,
        slug,
        sel.platform,
        remoteUrl,
        nowIsoUtc(),
      )
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err)
      await markDistributionTargetFailed(db, slug, sel.platform, mensagem)
    }
  }

  return listDistributionTargetsBySlug(db, slug)
}

/**
 * Estado atual dos alvos de um slug — porte de `Service.List`
 * (`service.go:117-119`), fininho por cima de `listDistributionTargetsBySlug`
 * (`domain/distribution.ts`). Existe pra dar à Task 4 (rotas) um ponto de
 * import simétrico a `buildDistributionProposals`/`publishDistributionTargets`
 * — mesmo papel trivial que `Service.List` cumpre no Go (delega 1:1 pro
 * store).
 */
export async function listDistributionProposals(
  db: D1Database,
  slug: string,
): Promise<DistributionTarget[]> {
  return listDistributionTargetsBySlug(db, slug)
}
