/**
 * Tipo compartilhado pelos 4 adapters de distribuição (dev.to, Hashnode,
 * Bluesky, Mastodon) — porte de `distribution.Payload`
 * (`apps/api/internal/distribution/publisher.go:6-15`).
 *
 * O Go define ali também a interface `Publisher` (`Platform() string`,
 * `Kind() Kind`, `Publish(ctx, Payload) (string, error)`) que cada adapter
 * implementa. Este porte não replica essa interface formalmente — cada
 * arquivo (`devto.ts`/`hashnode.ts`/`bluesky.ts`/`mastodon.ts`) exporta uma
 * função `publish<Plataforma>(cfg, payload): Promise<string>` simples, mesmo
 * estilo funcional já usado por `lib/tmdb.ts` (`searchPoster`) e
 * `lib/promeia.ts` (`chamarPromeia`) neste Worker — sem classes, sem
 * interface. Cada adapter também exporta `<PLATAFORMA>_PLATFORM`/
 * `<PLATAFORMA>_KIND` (as constantes que espelham `Platform()`/`Kind()`).
 * Compor os quatro num Publisher polimórfico iterável é decisão de quem
 * implementar o serviço (Task 3 do plano desta fatia,
 * `docs/superpowers/plans/2026-08-13-ramielle-distribuicao.md`).
 */
export type Payload = {
  // Artigo (kind: 'article_crosspost') — dev.to e Hashnode:
  title?: string
  bodyMd?: string
  description?: string
  canonicalUrl?: string
  tags?: string[]
  // Social (kind: 'social_hook') — Bluesky e Mastodon:
  text?: string
}

/**
 * M4 (fix round 1, achado da revisão): os 4 `<PLATAFORMA>_PLATFORM`
 * exportados por `devto.ts`/`hashnode.ts`/`bluesky.ts`/`mastodon.ts` eram
 * string literal SEM tipo — um typo (`'blusky'`) compilava e só apareceria
 * como dado errado em `distribution_targets.platform` na Task 3 (a chave do
 * `UNIQUE(slug, platform)` e do casamento com `distribution-panel.tsx` do
 * `apps/web`). Os `<PLATAFORMA>_KIND` já eram protegidos pela anotação
 * `: DistributionKind` — este union type dá a mesma proteção pro platform.
 * Não existe um tipo equivalente em `domain/distribution.ts` porque
 * `DistributionTarget.platform` espelha o Go (`Target.Platform string`,
 * sem union) — este tipo é NOVO, específico de `lib/publishers`, sem
 * equivalente no schema Go.
 */
export type DistributionPlatform = 'devto' | 'hashnode' | 'bluesky' | 'mastodon'
