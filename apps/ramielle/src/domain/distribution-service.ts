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
    // ⚠️ M1 (fix round 1) — `chamarPromeia` devolve `json.data as T` sem
    // checar o shape: um `{ok:true}` sem `data.hooks` (ou com `hooks`
    // não-array) viraria `TypeError: ... is not iterable` aqui, que na
    // Task 4 sairia como `500 internal_error` genérico em vez de atribuído
    // ao promeia. O Go, com um slice `nil`, simplesmente não itera —
    // replicado com o guard abaixo.
    const hooks = Array.isArray(data.hooks) ? data.hooks : []
    for (const hook of hooks) {
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
 *
 * ⚠️ **M2 (fix round 1) — aviso pra Task 4 (as rotas).** Este tipo é
 * camelCase; o contrato vivo do `apps/web` é snake_case (`canonical_url`,
 * não `canonicalUrl`). Todo campo além de `platform`/`content` é OPCIONAL
 * — uma rota que repasse o corpo JSON parseado direto (`corpo as
 * Selected`, sem traduzir campo a campo) COMPILA e descarta
 * `title`/`canonical_url`/`description`/`tags` em SILÊNCIO: o Bluesky
 * deixa de criar a reply com o link (armadilha 2 do plano) e os crossposts
 * de artigo saem sem `canonical_url`, gerando conteúdo duplicado contra o
 * próprio blog do dono — sem erro nenhum, sem teste vermelho. A rota
 * precisa TRADUZIR os campos, nunca só repassar o corpo.
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
 * Marca `'posted'` com retentativa — porte NOVO, sem equivalente direto no
 * Go, escrito na correção do C1 (fix round 1, Critical) abaixo.
 *
 * Chamada só DEPOIS que `pub.publish` já retornou sucesso: a publicação
 * JÁ EXISTE na plataforma, então uma falha aqui é SEMPRE uma falha de
 * ESCRITA no D1 (nunca de publicação) — e nunca pode fazer o alvo cair pra
 * `'failed'`/`'pending'`, porque nenhuma das 4 plataformas dedupa do lado
 * delas: rebaixar o selo faz a PRÓXIMA tentativa de publicar chamar
 * `pub.publish` de novo, duplicando o post público.
 *
 * Tenta a escrita com a `remoteUrl` REAL até 2 vezes (a primeira falha
 * pode ser transitória). Se as duas falharem, uma 3ª tentativa grava
 * `'posted'` com `remote_url` VAZIA — perder a URL é barato; perder o
 * selo `'posted'` é o que duplica um post público. Se até essa 3ª
 * tentativa falhar, o erro só vai pro `console.error` (visível via
 * `wrangler tail`) — NUNCA é escrito na coluna `error` (que o admin
 * renderiza, `distribution-panel.tsx:259`, `title={target.error}`):
 * `markDistributionTargetPosted` sempre grava `error=''`, então nenhuma
 * chamada aqui passa texto cru de infraestrutura (`D1_ERROR`/`SQLITE_*`)
 * pra coluna nenhuma.
 */
async function marcarPostadoComRetry(
  db: D1Database,
  slug: string,
  platform: string,
  remoteUrl: string,
): Promise<void> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      await markDistributionTargetPosted(
        db,
        slug,
        platform,
        remoteUrl,
        nowIsoUtc(),
      )
      return
    } catch {
      // tenta de novo — pode ser uma falha transitória de escrita no D1.
    }
  }
  try {
    await markDistributionTargetPosted(db, slug, platform, '', nowIsoUtc())
  } catch (err) {
    console.error(
      `ramielle: falha ao marcar '${platform}'/'${slug}' como posted depois de publicar (D1 indisponível para escrita)`,
      err,
    )
  }
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
 * do Go).
 *
 * ⚠️ **C1 (fix round 1, Critical) — uma falha de ESCRITA ao marcar
 * `'posted'` NUNCA pode virar `'failed'`/`'pending'`.** A entrega original
 * desta task tinha `markDistributionTargetPosted` dentro do MESMO `try` de
 * `pub.publish`: um erro de D1 (não de publicação — o publish já tinha
 * retornado sucesso) caía no mesmo `catch` e virava `MarkFailed` com o
 * texto CRU do driver D1 (`"D1_ERROR: disk I/O error"`) gravado em
 * `error`. Consequência medida por um revisor com um shim de D1: o post
 * JÁ EXISTIA na plataforma, mas o alvo saía `'failed'`, a `remote_url` que
 * o publisher tinha devolvido era perdida pra sempre, e a PRÓXIMA
 * publicação republicava — post DUPLICADO no perfil público (nenhuma das
 * 4 plataformas dedupa do lado delas). Corrigido: `pub.publish` e a
 * gravação de `'posted'` são passos SEPARADOS — `marcarPostadoComRetry`
 * (acima) faz a parte de nunca rebaixar o selo.
 *
 * Diferente disso, as OUTRAS escritas no D1 deste loop (`getDistributionTarget`
 * e o upsert que reseta pra `'pending'` antes de tentar) ainda propagam
 * normalmente se falharem — só a gravação de `'posted'`, que acontece
 * DEPOIS de uma publicação já efetivada, tem a proteção especial acima;
 * nada no plano/brief pede blindar as demais, e mantê-las visíveis é mais
 * seguro.
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

    // ⚠️ M3 (fix round 1) — divergência REAL do Go, a favor da segurança
    // (diferente da divergência que a entrega original desta task tinha
    // documentado aqui, que o C1 acima mostrou não existir de fato no
    // código). O Go faz `existing, err := Get(...); if err == nil &&
    // existing.Status == "posted" { continue }` (`service.go:89-92`): um
    // erro de LEITURA cai no ramo "não está posted" e o Go PUBLICA assim
    // mesmo — duplicando, se o alvo já estava posted e a leitura só falhou
    // por acaso. Aqui, `getDistributionTarget` nunca lança por "não
    // encontrado" (devolve `null`), mas uma falha de LEITURA genuína do D1
    // propaga e interrompe o loop inteiro — NÃO publica. Mais seguro que o
    // Go; intocado por esta correção.
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

    // C1 (fix round 1): SÓ a chamada de rede fica neste `try` — uma falha
    // de ESCRITA ao gravar 'posted' depois que `pub.publish` já retornou
    // sucesso NUNCA cai neste `catch` (ver o comentário da função acima).
    let remoteUrl: string
    try {
      remoteUrl = await pub.publish(payload)
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err)
      await markDistributionTargetFailed(db, slug, sel.platform, mensagem)
      continue
    }

    await marcarPostadoComRetry(db, slug, sel.platform, remoteUrl)
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
