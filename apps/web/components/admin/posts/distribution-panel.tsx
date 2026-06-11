'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import {
  useBuildProposals,
  useDistribution,
  usePublishDistribution,
  useRefineHook,
} from '@/hooks/admin/atelier/use-distribution'
import { PLATFORM_META, platformLabel } from '@/lib/admin/atelier/platform-meta'
import type {
  DistributionTarget,
  SelectedTarget,
} from '@/lib/admin/atelier/types'
import { errorMessage } from '@/lib/votacao/api-client'

interface PostInput {
  slug: string
  title: string
  excerpt: string
  body: string
  tags: string[]
}

const PUBLIC_BASE = 'https://piluvitu.com.br/posts'

export function DistributionPanel({ post }: { post: PostInput }) {
  const [localTargets, setLocalTargets] = useState<DistributionTarget[] | null>(
    null,
  )
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [instructions, setInstructions] = useState<Record<string, string>>({})

  const build = useBuildProposals()
  const refine = useRefineHook()
  const publish = usePublishDistribution(post.slug)

  // Pré-carrega o estado salvo ao reabrir o post: os alvos exibidos DERIVAM de
  // (edições locais desta sessão) ?? (dados salvos no servidor) ?? []. Sem copiar
  // pra state via effect/ref — só derivação (compatível com o React Compiler).
  const existing = useDistribution(post.slug, !!post.slug)
  const targets = localTargets ?? existing.data?.targets ?? []
  // Seleção default por alvo: já publicado vem desmarcado (idempotente),
  // pendente/falho vem marcado p/ (re)publicar; o toggle do usuário sobrescreve.
  const isSel = (t: DistributionTarget) =>
    selected[t.platform] ?? t.status !== 'posted'

  const url = `${PUBLIC_BASE}/${post.slug}`

  async function generate() {
    try {
      const res = await build.mutateAsync({
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        url,
        body: post.body,
        tags: post.tags,
      })
      setLocalTargets(res.targets)
      setSelected({}) // reset overrides → defaults (todos pendentes = marcados)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  function setContent(platform: string, content: string) {
    setLocalTargets((prev) =>
      (prev ?? existing.data?.targets ?? []).map((t) =>
        t.platform === platform ? { ...t, content } : t,
      ),
    )
  }

  async function refineOne(platform: string) {
    const t = targets.find((x) => x.platform === platform)
    if (!t) return
    try {
      const res = await refine.mutateAsync({
        platform,
        text: t.content,
        instruction: instructions[platform] ?? '',
      })
      setContent(platform, res.refined)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function publishSelected() {
    const payload: SelectedTarget[] = targets.filter(isSel).map((t) =>
      t.kind === 'article_crosspost'
        ? {
            platform: t.platform,
            content: t.content,
            title: post.title,
            canonical_url: url,
            description: post.excerpt,
            tags: post.tags,
          }
        : { platform: t.platform, content: t.content, canonical_url: url },
    )
    try {
      const res = await publish.mutateAsync(payload)
      setLocalTargets(res.targets)
      toast.success('Publicação concluída.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  if (targets.length === 0) {
    return (
      <Button type="button" onClick={generate} disabled={build.isPending}>
        {build.isPending ? 'Gerando…' : 'Gerar propostas'}
      </Button>
    )
  }

  const articles = targets.filter((t) => t.kind === 'article_crosspost')
  const socials = targets.filter((t) => t.kind === 'social_hook')

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-muted-foreground font-mono text-sm">
          Republicar artigo (canonical → {url})
        </h3>
        {articles.map((t) => (
          <TargetRow
            key={t.platform}
            target={t}
            selected={isSel(t)}
            onToggle={(v) => setSelected((s) => ({ ...s, [t.platform]: v }))}
          />
        ))}
      </section>

      <section className="space-y-4">
        <h3 className="text-muted-foreground font-mono text-sm">
          Chamadas sociais (editáveis)
        </h3>
        {socials.map((t) => {
          const limit = PLATFORM_META[t.platform]?.charLimit
          return (
            <div key={t.platform} className="space-y-2 rounded-md border p-3">
              <TargetRow
                target={t}
                selected={isSel(t)}
                onToggle={(v) =>
                  setSelected((s) => ({ ...s, [t.platform]: v }))
                }
              />
              <Textarea
                value={t.content}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setContent(t.platform, e.target.value)
                }
                rows={3}
              />
              {limit ? (
                <p
                  className={`text-right text-xs ${t.content.length > limit ? 'text-destructive' : 'text-muted-foreground'}`}
                >
                  {t.content.length}/{limit}
                </p>
              ) : null}
              <div className="flex gap-2">
                <Input
                  placeholder="instrução (ex.: deixa mais informal)"
                  value={instructions[t.platform] ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setInstructions((s) => ({
                      ...s,
                      [t.platform]: e.target.value,
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={refine.isPending}
                  onClick={() => refineOne(t.platform)}
                >
                  Refinar IA
                </Button>
              </div>
            </div>
          )
        })}
      </section>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={generate}
          disabled={build.isPending}
        >
          Regerar todas
        </Button>
        <Button
          type="button"
          onClick={publishSelected}
          disabled={publish.isPending}
        >
          {publish.isPending ? 'Publicando…' : 'Publicar selecionadas'}
        </Button>
      </div>
    </div>
  )
}

function TargetRow({
  target,
  selected,
  onToggle,
}: {
  target: DistributionTarget
  selected: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onToggle(e.target.checked)
          }
        />
        {platformLabel(target.platform)}
      </label>
      <StatusBadge target={target} />
    </div>
  )
}

function StatusBadge({ target }: { target: DistributionTarget }) {
  if (target.status === 'posted')
    return (
      <a
        href={target.remote_url}
        target="_blank"
        rel="noreferrer"
        className="text-ok text-xs underline"
      >
        ✅ publicado
      </a>
    )
  if (target.status === 'failed')
    return (
      <span className="text-destructive text-xs" title={target.error}>
        ❌ falhou
      </span>
    )
  return <span className="text-muted-foreground text-xs">⏳ pendente</span>
}
