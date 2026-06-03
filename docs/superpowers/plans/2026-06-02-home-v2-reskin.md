# Home V2 "Cloud (cyan)" Reskin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestilizar a home (`/`) pro Design System V2 — perfil fixo à esquerda, conteúdo "bento" rolável à direita com section-headers + cards V2 + modal de carreira — reusando os dados do Keystatic.

**Architecture:** Mantém o split-scroll e o `home-bento-layout.tsx` (reestilizado no lugar). Adiciona campos editáveis ao Keystatic (perfil: status/local/disciplinas; carreira: `current`/`tags`; projeto: `subtitle`), propaga pelos readers/types, e reestiliza os componentes usando os tokens DS V2 já existentes (fundação / PR #32).

**Tech Stack:** Next.js 16 (App Router, RSC), Tailwind 4, shadcn/ui (Dialog, Button, Card, Avatar, Badge), Keystatic 0.5, Font Awesome 7, Storybook 10 (`@storybook/nextjs`).

**Spec:** `docs/superpowers/specs/2026-06-02-home-v2-reskin-design.md`

**Verificação:** fundação visual ⇒ gates são `lint` + `tsc --noEmit` + `build` + **Storybook**. Sem migração de DB (schema Keystatic é declarativo — sem comando). Jest só onde houver lógica pura.

---

## File Structure

| Arquivo                                                                                              | Responsabilidade            | Ação                                                                       |
| ---------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `keystatic.config.ts`                                                                                | Schema CMS                  | Modificar (siteProfile, carreiras, projects)                               |
| `lib/site-content.ts`                                                                                | Readers + tipos             | Modificar (getSiteProfile/getCarreiras/getProjects + `SiteProfileContent`) |
| `mocks/carreira.ts`, `mocks/projects.ts`                                                             | Tipos de domínio            | Modificar (`current`/`tags`, `subtitle?`)                                  |
| `content/site/profile/index.yaml`, `content/carreiras/*/index.yaml`, `content/projects/*/index.yaml` | Conteúdo                    | Modificar (valores novos)                                                  |
| `components/section-header.tsx` (+story)                                                             | Header de seção             | Criar                                                                      |
| `components/home-footer.tsx` (+story)                                                                | Footer da home              | Criar                                                                      |
| `components/home-bento-layout.tsx`                                                                   | Layout do conteúdo          | Reestilizar                                                                |
| `components/bio.tsx`                                                                                 | Coluna de perfil            | Reestilizar                                                                |
| `components/profile-social-strip.tsx`                                                                | Ícones sociais              | Reestilizar (email→mailto)                                                 |
| `components/job-card.tsx` (+story)                                                                   | Card + modal carreira       | Reestilizar                                                                |
| `components/project-card.tsx` (+story)                                                               | Card de projeto             | Reestilizar                                                                |
| `components/article-card.tsx`, `components/article-section.tsx`                                      | Card de artigo              | Reestilizar (+ index)                                                      |
| `app/(site)/page.tsx`                                                                                | Container + glow + fallback | Modificar                                                                  |

---

## Task 1: Camada de dados (Keystatic schema + tipos + readers + conteúdo)

**Files:**

- Modify: `apps/web/keystatic.config.ts`
- Modify: `apps/web/lib/site-content.ts`
- Modify: `apps/web/mocks/carreira.ts`, `apps/web/mocks/projects.ts`
- Modify: `apps/web/content/site/profile/index.yaml`, `apps/web/content/carreiras/*/index.yaml`, `apps/web/content/projects/*/index.yaml`
- Modify: `apps/web/app/(site)/page.tsx` (fallbackProfile)

- [ ] **Step 1: Adicionar campos ao `keystatic.config.ts`**

No `siteProfile.schema`, após `companyLinkColor` (antes de `bio`), adicionar:

```ts
        availabilityOpen: fields.checkbox({
          label: 'Disponível para oportunidades',
          defaultValue: true,
        }),
        availabilityLabel: fields.text({
          label: 'Texto de disponibilidade',
          defaultValue: 'Disponível para oportunidades',
        }),
        location: fields.text({
          label: 'Localização (meta)',
          description: 'Ex.: Brasil · Remoto',
          defaultValue: 'Brasil · Remoto',
        }),
        disciplines: fields.array(fields.text({ label: 'Disciplina' }), {
          label: 'Disciplinas',
        }),
```

No `carreiras.schema`, após `atribuitions`, adicionar:

```ts
        current: fields.checkbox({ label: 'Cargo atual', defaultValue: false }),
        tags: fields.array(fields.text({ label: 'Tag' }), {
          label: 'Tags (ex.: Remoto)',
        }),
```

No `projects.schema`, após `projectName`, adicionar:

```ts
        subtitle: fields.text({
          label: 'Subtítulo',
          description: 'Ex.: agregador de pull requests',
          defaultValue: '',
        }),
```

- [ ] **Step 2: Atualizar tipos em `mocks/`**

`mocks/carreira.ts` — adicionar ao type `Carreira`:

```ts
  current: boolean
  tags: string[]
```

`mocks/projects.ts` — adicionar ao type `Project`:

```ts
subtitle: string
```

- [ ] **Step 3: Atualizar `SiteProfileContent` + readers em `lib/site-content.ts`**

No type `SiteProfileContent`, após `bio: string`, adicionar:

```ts
  availabilityOpen: boolean
  availabilityLabel: string
  location: string
  disciplines: string[]
```

Em `getSiteProfile`, no objeto retornado (após `bio: entry.bio`), adicionar:

```ts
    availabilityOpen: entry.availabilityOpen ?? true,
    availabilityLabel:
      (entry.availabilityLabel ?? '').trim() || 'Disponível para oportunidades',
    location: (entry.location ?? '').trim(),
    disciplines: [...(entry.disciplines ?? [])].filter((d) => d.trim()),
```

Em `getCarreiras`, no objeto `mapped` (após `atribuitions: [...entry.atribuitions]`), adicionar `current: entry.current ?? false,` e `tags: [...(entry.tags ?? [])].filter((t) => t.trim()),`; e no objeto final tipado `(row): Carreira` adicionar `current: row.current,` e `tags: row.tags,`.

Em `getProjects`, no objeto `mapped` (após `projectName: entry.projectName`), adicionar `subtitle: (entry.subtitle ?? '').trim(),`; e no objeto final `(row): Project` adicionar `subtitle: row.subtitle,`.

- [ ] **Step 4: Atualizar conteúdo YAML**

`content/site/profile/index.yaml` — adicionar ao final:

```yaml
availabilityOpen: true
availabilityLabel: Disponível para oportunidades
location: Brasil · Remoto
disciplines:
  - SRE
  - DevOps
  - Cloud
```

Cada `content/carreiras/*/index.yaml` — adicionar `current` e `tags`. Regra: `current: true` quando o `date` indica vigência (contém "Atual"/"Atualmente"), senão `false`. `tags` reflete o `location` (ex.: `- Remoto` quando `location: Remoto`). Exemplo:

```yaml
current: false
tags:
  - Remoto
```

Cada `content/projects/*/index.yaml` — adicionar `subtitle` (ex.: para `live-prs`: `subtitle: agregador de pull requests`; para os demais, uma frase curta ou `subtitle: ''`).

- [ ] **Step 5: Atualizar `fallbackProfile` em `app/(site)/page.tsx`**

No objeto `fallbackProfile`, após `bio: '...'`, adicionar:

```ts
  availabilityOpen: true,
  availabilityLabel: 'Disponível para oportunidades',
  location: 'Brasil · Remoto',
  disciplines: ['SRE', 'DevOps', 'Cloud'],
```

- [ ] **Step 6: Verificar tipos + build**

Run (em `apps/web/`): `pnpm exec tsc --noEmit` → PASS (os readers passam a expor os novos campos; os componentes ainda não os usam).
Run (raiz): `pnpm --filter @piluvitu/web build` → PASS.

> Sem comando de migração — schema Keystatic é declarativo. Conteúdo antigo fica seguro pelos defaults nos readers.

- [ ] **Step 7: Commit**

```bash
git add apps/web/keystatic.config.ts apps/web/lib/site-content.ts apps/web/mocks apps/web/content apps/web/app
git commit -m "feat(web): add Keystatic fields for home V2 (profile meta, career current/tags, project subtitle)"
```

---

## Task 2: `SectionHeader` (+ story)

**Files:**

- Create: `apps/web/components/section-header.tsx`
- Create: `apps/web/components/section-header.stories.tsx`

- [ ] **Step 1: Criar o componente**

`apps/web/components/section-header.tsx`:

```tsx
import { cn } from '@/lib/utils'

type SectionHeaderProps = {
  label: string
  count?: number | string
  id?: string
  className?: string
}

function padCount(count: number | string | undefined) {
  if (count === undefined) return undefined
  const n = typeof count === 'number' ? count : Number(count)
  return Number.isFinite(n) ? String(n).padStart(2, '0') : String(count)
}

export function SectionHeader({
  label,
  count,
  id,
  className,
}: SectionHeaderProps) {
  const padded = padCount(count)
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <h2
        id={id}
        className="text-muted-foreground font-mono text-xs font-semibold tracking-[0.2em] uppercase"
      >
        {label}
      </h2>
      {padded !== undefined ? (
        <span className="text-muted-foreground font-mono text-xs">
          {padded}
        </span>
      ) : null}
      <span className="bg-border h-px flex-1" aria-hidden />
    </div>
  )
}
```

- [ ] **Step 2: Criar a story**

`apps/web/components/section-header.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { SectionHeader } from './section-header'

const meta: Meta<typeof SectionHeader> = {
  title: 'Home/SectionHeader',
  component: SectionHeader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof SectionHeader>

export const Carreira: Story = { args: { label: 'Carreira', count: 5 } }
export const Projetos: Story = { args: { label: 'Projetos', count: 1 } }
export const SemContador: Story = { args: { label: 'Artigos' } }
```

- [ ] **Step 3: Verificar + commit**

Run (em `apps/web/`): `pnpm exec tsc --noEmit` e `pnpm lint` → PASS.

```bash
git add apps/web/components/section-header.tsx apps/web/components/section-header.stories.tsx
git commit -m "feat(web): SectionHeader component (mono label + count + rule)"
```

---

## Task 3: `HomeFooter` (+ story)

**Files:**

- Create: `apps/web/components/home-footer.tsx`
- Create: `apps/web/components/home-footer.stories.tsx`

- [ ] **Step 1: Criar o componente**

`apps/web/components/home-footer.tsx`:

```tsx
import Link from 'next/link'

type HomeFooterProps = {
  name: string
  year?: number
}

export function HomeFooter({
  name,
  year = new Date().getFullYear(),
}: HomeFooterProps) {
  return (
    <footer className="text-muted-foreground border-border mt-2 flex flex-col gap-2 border-t pt-6 font-mono text-xs sm:flex-row sm:items-center sm:justify-between">
      <span>
        © {year} {name}
      </span>
      <span className="flex flex-wrap items-center gap-x-2">
        <span>piluvitu.com.br</span>
        <span aria-hidden>·</span>
        <Link href="/tools" className="hover:text-foreground transition-colors">
          /tools
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="/votacao"
          className="hover:text-foreground transition-colors"
        >
          /votação
        </Link>
        <span aria-hidden>·</span>
        <Link
          href="/votacao/admin"
          className="hover:text-foreground transition-colors"
        >
          admin
        </Link>
      </span>
    </footer>
  )
}
```

- [ ] **Step 2: Criar a story**

`apps/web/components/home-footer.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { HomeFooter } from './home-footer'

const meta: Meta<typeof HomeFooter> = {
  title: 'Home/HomeFooter',
  component: HomeFooter,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof HomeFooter>

export const Default: Story = {
  args: { name: 'Paulo Victor Torres Silva', year: 2026 },
}
```

- [ ] **Step 3: Verificar + commit**

Run (em `apps/web/`): `pnpm exec tsc --noEmit` e `pnpm lint` → PASS.

```bash
git add apps/web/components/home-footer.tsx apps/web/components/home-footer.stories.tsx
git commit -m "feat(web): HomeFooter component"
```

---

## Task 4: Reestilizar `home-bento-layout.tsx`

**Files:**

- Modify: `apps/web/components/home-bento-layout.tsx`

- [ ] **Step 1: Substituir o conteúdo do arquivo**

`apps/web/components/home-bento-layout.tsx` (conteúdo completo):

```tsx
import { ArticleSection } from '@/components/article-section'
import { HomeFooter } from '@/components/home-footer'
import { JobCard } from '@/components/job-card'
import { ProjectCard } from '@/components/project-card'
import { SectionHeader } from '@/components/section-header'
import type { ArticleCardView } from '@/lib/article-feed'
import type { Carreira } from '@/mocks/carreira'
import type { Project } from '@/mocks/projects'

type HomeBentoLayoutProps = {
  carreiraList: Carreira[]
  projectList: Project[]
  initialBlogPosts: ArticleCardView[]
  profileName: string
}

export function HomeBentoLayout({
  carreiraList,
  projectList,
  initialBlogPosts,
  profileName,
}: HomeBentoLayoutProps) {
  return (
    <div className="flex min-h-0 flex-col gap-10 xl:gap-12">
      <section
        aria-labelledby="carreira-heading"
        className="flex flex-col gap-5"
        suppressHydrationWarning
      >
        <SectionHeader
          id="carreira-heading"
          label="Carreira"
          count={carreiraList.length}
        />
        <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
          {carreiraList.map((carreira) => (
            <JobCard key={carreira.id} {...carreira} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="projetos-heading"
        className="flex flex-col gap-5"
        suppressHydrationWarning
      >
        <SectionHeader
          id="projetos-heading"
          label="Projetos"
          count={projectList.length}
        />
        <div className="grid grid-cols-1 gap-6">
          {projectList.map((project) => (
            <ProjectCard key={project.id} {...project} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="artigos-heading"
        className="flex flex-col gap-5"
        suppressHydrationWarning
      >
        <SectionHeader
          id="artigos-heading"
          label="Artigos"
          count={initialBlogPosts.length}
        />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ArticleSection initialBlogPosts={initialBlogPosts} />
        </div>
      </section>

      <HomeFooter name={profileName} />
    </div>
  )
}
```

> Nota: o contador de Artigos usa `initialBlogPosts.length` (posts do blog conhecidos no server); o feed mescla dev.to client-side. Aceitável pra v1.

- [ ] **Step 2: Verificar + commit** (vai compilar só após Task 6/7 reestilizarem JobCard/ProjectCard, mas a assinatura não muda — `tsc` deve passar já)

Run (em `apps/web/`): `pnpm exec tsc --noEmit` → PASS.

```bash
git add apps/web/components/home-bento-layout.tsx
git commit -m "feat(web): restyle home bento layout with SectionHeader + footer"
```

---

## Task 5: Reestilizar `bio.tsx` + `profile-social-strip.tsx`

**Files:**

- Modify: `apps/web/components/bio.tsx`
- Modify: `apps/web/components/profile-social-strip.tsx`

- [ ] **Step 1: Substituir `bio.tsx`**

```tsx
import Link from 'next/link'
import { faBriefcase, faLocationDot } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { SiteProfileContent, VisitCardContent } from '@/lib/site-content'
import type { Social } from '@/mocks/social'
import { ModeToggle } from './mode-toggle'
import { ProfileVisitCard } from './profile-visit-card'
import { ProfileSocialStrip } from './profile-social-strip'
import { Button } from './ui/button'

type BioProps = {
  profile: SiteProfileContent
  socials: Social[]
  latestDevArticleUrl: string | null
  visitCard: VisitCardContent
}

export function Bio({
  profile,
  socials,
  latestDevArticleUrl,
  visitCard,
}: BioProps) {
  const companyHref = profile.companyLink.trim()
  const hasMeta = Boolean(profile.location) || profile.disciplines.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <ProfileVisitCard
          profile={profile}
          visitCard={visitCard}
          latestDevArticleUrl={latestDevArticleUrl}
        />
        <ModeToggle />
      </div>

      {profile.availabilityOpen ? (
        <p className="text-muted-foreground flex items-center gap-2 font-mono text-xs">
          <span className="bg-ok size-2 rounded-full" aria-hidden />
          {profile.availabilityLabel}
        </p>
      ) : null}

      <h1 className="text-4xl font-bold tracking-tight xl:text-5xl">
        {profile.displayName}
      </h1>

      <div className="flex flex-col gap-4">
        <p>
          <strong className="text-primary font-semibold">
            {profile.roleHighlight}
          </strong>
          {profile.companyName.trim() ? (
            <>
              {' na '}
              {companyHref ? (
                <Button
                  asChild
                  variant="link"
                  className="h-fit p-0"
                  style={{ color: profile.companyLinkColor }}
                >
                  <Link
                    href={companyHref}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                  >
                    {profile.companyName}
                  </Link>
                </Button>
              ) : (
                <span style={{ color: profile.companyLinkColor }}>
                  {profile.companyName}
                </span>
              )}
            </>
          ) : null}
        </p>
        <p className="text-muted-foreground text-pretty">{profile.bio}</p>
        <ProfileSocialStrip socials={socials} />
        {hasMeta ? (
          <div className="text-muted-foreground flex flex-col gap-2 pt-2 font-mono text-sm">
            {profile.location ? (
              <span className="flex items-center gap-2">
                <FontAwesomeIcon
                  icon={faLocationDot}
                  className="size-3.5"
                  aria-hidden
                />
                {profile.location}
              </span>
            ) : null}
            {profile.disciplines.length > 0 ? (
              <span className="flex items-center gap-2">
                <FontAwesomeIcon
                  icon={faBriefcase}
                  className="size-3.5"
                  aria-hidden
                />
                {profile.disciplines.join(' · ')}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Editar `profile-social-strip.tsx` — email vira mailto**

Remover o import `import { EmailContactDialog } from '@/components/email-contact-dialog'` e o `import { cn } from '@/lib/utils'` se ficar sem uso. Definir a constante de contato no topo do arquivo:

```ts
const CONTACT_EMAIL = 'pilutechinformatica@gmail.com'
```

Substituir o bloco `<EmailContactDialog ...> ... </EmailContactDialog>` por:

```tsx
<Link
  href={`mailto:${CONTACT_EMAIL}`}
  className={squircleClass}
  aria-label="Enviar email"
>
  {emailIcon ? (
    <FontAwesomeIcon
      icon={emailIcon}
      className="text-foreground size-7"
      aria-hidden
    />
  ) : null}
</Link>
```

Trocar `rounded-2xl` por `rounded-xl` na `squircleClass` (estética V2).

- [ ] **Step 3: Verificar + commit**

Run (em `apps/web/`): `pnpm exec tsc --noEmit` e `pnpm lint` → PASS. (Se `cn` ficou sem uso, remover o import pra não falhar o lint.)

```bash
git add apps/web/components/bio.tsx apps/web/components/profile-social-strip.tsx
git commit -m "feat(web): restyle bio (status, meta) + social strip (email mailto) for V2"
```

---

## Task 6: Reestilizar `job-card.tsx` (card + modal) (+ story)

**Files:**

- Modify: `apps/web/components/job-card.tsx`
- Create: `apps/web/components/job-card.stories.tsx`

- [ ] **Step 1: Substituir `job-card.tsx`**

```tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Carreira } from '@/mocks/carreira'
import Link from 'next/link'

export function JobCard(props: Carreira) {
  const logo = (
    <Avatar className="bg-accent-soft size-10 shrink-0 rounded-md">
      {props.image && (
        <AvatarImage src={props.image} alt={props.orgName + ' Logo'} />
      )}
      <AvatarFallback className="bg-accent-soft text-primary rounded-md text-xs font-bold">
        {props.altImage}
      </AvatarFallback>
    </Avatar>
  )

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group bg-card border-border hover:bg-accent flex w-full cursor-pointer flex-col gap-3 rounded-lg border p-5 text-left transition-colors"
        >
          <div className="flex items-center gap-3">
            {logo}
            <div className="flex flex-col">
              <span className="leading-tight font-semibold">
                {props.orgName}
              </span>
              <span className="text-muted-foreground font-mono text-xs">
                {props.date}
              </span>
            </div>
          </div>
          <p className="text-sm">{props.title}</p>
          <div className="flex flex-wrap items-center gap-2">
            {props.current ? (
              <span className="border-border inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">
                <span className="bg-ok size-1.5 rounded-full" aria-hidden />
                Atual
              </span>
            ) : null}
            {props.tags.map((tag) => (
              <span
                key={tag}
                className="border-border rounded-full border px-2.5 py-0.5 text-xs"
              >
                {tag}
              </span>
            ))}
            <span className="text-primary ml-auto font-mono text-xs">
              detalhes →
            </span>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-4">
            {logo}
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-xl">{props.orgName}</DialogTitle>
              <p className="text-muted-foreground font-mono text-xs">
                {props.title} · {props.date}
              </p>
            </div>
          </div>
          <DialogDescription className="text-primary pt-2 text-base">
            {props.orgDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
            Atribuições
          </p>
          <ul className="flex flex-col gap-3">
            {props.atribuitions.map((atribuicao) => (
              <li key={atribuicao} className="flex gap-3 text-sm">
                <span
                  className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-[2px]"
                  aria-hidden
                />
                <span>{atribuicao}</span>
              </li>
            ))}
          </ul>
        </div>

        {props.orgLink.trim() ? (
          <DialogFooter>
            <Button asChild className="w-full">
              <Link
                href={props.orgLink}
                rel="noopener noreferrer"
                target="_blank"
              >
                Saiba mais sobre {props.orgName}
              </Link>
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Criar a story**

`apps/web/components/job-card.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { JobCard } from './job-card'

const meta: Meta<typeof JobCard> = {
  title: 'Home/JobCard',
  component: JobCard,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="w-[360px]">
        <Story />
      </div>
    ),
  ],
}
export default meta
type Story = StoryObj<typeof JobCard>

const base = {
  id: 'viralizeplus',
  orgName: 'ViralizePlus',
  orgDescription: 'Sua comunidade de desenvolvimento open source.',
  orgLink: 'https://www.viralizeplus.com.br/',
  altImage: 'V+',
  title: 'Site Reliability Engineer',
  location: 'Remoto',
  date: 'Dez 2024 — Atual',
  atribuitions: [
    'Reestruturação das entregas com GitHub Actions, acelerando releases em ~60%.',
    'Eficiência na AWS com economia de ~40% na fatura mensal.',
    'Monitoramento com Grafana e Prometheus para visibilidade 24/7.',
  ],
  current: true,
  tags: ['Remoto'],
}

export const Atual: Story = { args: base }
export const Passado: Story = {
  args: { ...base, current: false, date: 'Dez 2023 — Out 2024', tags: [] },
}
```

- [ ] **Step 3: Verificar + commit**

Run (em `apps/web/`): `pnpm exec tsc --noEmit` e `pnpm lint` → PASS.

```bash
git add apps/web/components/job-card.tsx apps/web/components/job-card.stories.tsx
git commit -m "feat(web): restyle JobCard card + career detail modal (V2)"
```

---

## Task 7: Reestilizar `project-card.tsx` (+ story)

**Files:**

- Modify: `apps/web/components/project-card.tsx`
- Create: `apps/web/components/project-card.stories.tsx`

- [ ] **Step 1: Substituir `project-card.tsx`**

```tsx
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Project } from '@/mocks/projects'
import { faCode } from '@fortawesome/free-solid-svg-icons'
import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Link from 'next/link'

type ProjectCardProps = Project & {
  className?: string
}

export function ProjectCard(props: ProjectCardProps) {
  const { className, ...project } = props

  return (
    <Card
      className={cn(
        'bg-card border-border flex flex-col gap-5 rounded-lg p-6',
        className,
      )}
    >
      <div className="flex items-center gap-4">
        <Avatar className="bg-accent-soft size-12 shrink-0 rounded-lg">
          {project.image && (
            <AvatarImage
              src={project.projectLogo}
              alt={project.projectName + ' Logo'}
            />
          )}
          <AvatarFallback className="bg-accent-soft text-primary rounded-lg font-bold">
            {project.altImage}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <h3 className="text-xl font-bold">{project.projectName}</h3>
          {project.subtitle ? (
            <p className="text-muted-foreground text-sm">{project.subtitle}</p>
          ) : null}
        </div>
      </div>

      <p className="text-muted-foreground" title={project.description}>
        {project.description}
      </p>

      <div className="flex flex-wrap gap-2">
        {project.tags.map((tag) => (
          <span
            key={tag}
            className="border-border rounded-full border px-2.5 py-0.5 font-mono text-xs"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {project.deployLink ? (
          <Button asChild>
            <Link
              href={project.deployLink}
              rel="noopener noreferrer"
              target="_blank"
            >
              <FontAwesomeIcon
                icon={faArrowUpRightFromSquare}
                className="size-3.5"
              />
              Demo
            </Link>
          </Button>
        ) : null}
        {project.repoLink ? (
          <Button asChild variant="outline">
            <Link
              href={project.repoLink}
              rel="noopener noreferrer nofollow"
              target="_blank"
            >
              <FontAwesomeIcon icon={faCode} className="size-3.5" />
              Código
            </Link>
          </Button>
        ) : null}
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Criar a story**

`apps/web/components/project-card.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { ProjectCard } from './project-card'

const meta: Meta<typeof ProjectCard> = {
  title: 'Home/ProjectCard',
  component: ProjectCard,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
}
export default meta
type Story = StoryObj<typeof ProjectCard>

const base = {
  id: 'live-prs',
  projectName: 'Live PRs',
  subtitle: 'agregador de pull requests',
  projectLogo: '/pr-live-dark.svg',
  description:
    'Agrega os pull requests em que sua revisão foi solicitada, por repositório ou organização. Reúne tudo em cards com estado do PR, checks de CI e assignees.',
  tags: ['React', 'Next', 'Go', 'Tailwind', 'Docker', 'AWS', 'Grafana'],
  deployLink: 'https://example.com',
  repoLink: 'https://github.com/example',
  altImage: 'LPR',
}

export const Default: Story = { args: base }
export const SemSubtitulo: Story = {
  args: { ...base, subtitle: '', repoLink: '' },
}
```

- [ ] **Step 3: Verificar + commit**

Run (em `apps/web/`): `pnpm exec tsc --noEmit` e `pnpm lint` → PASS. (Ajustar o mock da story até o `tsc` passar — o type `Project` exige `subtitle`.)

```bash
git add apps/web/components/project-card.tsx apps/web/components/project-card.stories.tsx
git commit -m "feat(web): restyle ProjectCard (icon, subtitle, stack, Demo/Código) for V2"
```

---

## Task 8: Reestilizar `article-card.tsx` (+ index via `article-section.tsx`)

**Files:**

- Modify: `apps/web/components/article-card.tsx`
- Modify: `apps/web/components/article-section.tsx` (passar `index`)
- Modify: `apps/web/components/article-card.stories.tsx` (passar `index`, refletir V2)

Contexto: `ArticleCardView` tem `source: 'devto' | 'blog'`, `title`, `href`, `isExternal`, `readingTimeMinutes`. O `article-section.tsx` faz `initialBlogPosts.map((article) => <ArticleCard ... />)`.

- [ ] **Step 1: Substituir `article-card.tsx`**

```tsx
import type { ArticleCardView } from '@/lib/article-feed'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type ArticleCardProps = {
  article: ArticleCardView
  index?: number
  className?: string
}

export function ArticleCard({ article, index, className }: ArticleCardProps) {
  const kbd = article.source === 'devto' ? '~/dev' : '~/blog'
  const post = index !== undefined ? String(index + 1).padStart(2, '0') : null

  return (
    <Link
      href={article.href}
      target={article.isExternal ? '_blank' : undefined}
      rel={article.isExternal ? 'noopener noreferrer nofollow' : undefined}
      className={cn(
        'group bg-card border-border flex h-full flex-col gap-4 rounded-lg border p-5 transition-colors',
        'hover:bg-accent',
        'focus-visible:ring-ring focus-visible:ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        className,
      )}
    >
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="bg-accent-soft text-primary rounded px-1.5 py-0.5">
          {kbd}
        </span>
        {post ? (
          <span className="text-muted-foreground">· post {post}</span>
        ) : null}
      </div>
      <h3 className="line-clamp-2 text-lg font-semibold">{article.title}</h3>
      <div className="text-muted-foreground mt-auto flex items-center justify-between font-mono text-xs">
        <span>{article.readingTimeMinutes} min de leitura</span>
        <span className="text-primary transition-transform group-hover:translate-x-0.5">
          ler →
        </span>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Substituir `article-section.tsx` (passar `index`)**

```tsx
import type { ArticleCardView } from '@/lib/article-feed'
import { ArticleCard } from './article-card'

type ArticleSectionProps = {
  initialBlogPosts?: ArticleCardView[]
}

export function ArticleSection({ initialBlogPosts = [] }: ArticleSectionProps) {
  return (
    <>
      {initialBlogPosts.map((article, i) => (
        <ArticleCard key={article.id} article={article} index={i} />
      ))}
    </>
  )
}
```

- [ ] **Step 3: Atualizar `article-card.stories.tsx`**

A story atual (`ComImagem` / `SemImagem`) testava a imagem/fallback que saíram no V2. Substituir as args pra refletir o card novo (adicionar `index`, remover dependência de imagem). Manter o `meta` (title `Blog/ArticleCard`, decorator `w-72`), e trocar as stories por:

```tsx
const baseArticle = {
  id: 'blog-como-usar-husky',
  source: 'blog' as const,
  title: 'Como usar o Husky para garantir a qualidade do seu código',
  href: '/posts/como-usar-husky',
  isExternal: false,
  socialImage: null,
  readingTimeMinutes: 5,
  reactionsCount: 0,
  commentsCount: 0,
  publishedAt: '2026-04-10T10:00:00.000Z',
}

export const Blog: Story = { args: { article: baseArticle, index: 0 } }
export const DevTo: Story = {
  args: {
    article: {
      ...baseArticle,
      id: 'devto-1',
      source: 'devto',
      isExternal: true,
    },
    index: 1,
  },
}
```

- [ ] **Step 4: Verificar + commit**

Run (em `apps/web/`): `pnpm exec tsc --noEmit` e `pnpm lint` → PASS.

```bash
git add apps/web/components/article-card.tsx apps/web/components/article-section.tsx apps/web/components/article-card.stories.tsx
git commit -m "feat(web): restyle ArticleCard (kbd ~/blog, post NN, ler →) for V2"
```

---

## Task 9: `page.tsx` (container 1180 + glow + profileName) + E2E + verificação final

**Files:**

- Modify: `apps/web/app/(site)/page.tsx`
- Create: `apps/web/app/(site)/home.e2e.ts`
- Modify: `CLAUDE.md` (registrar reskin da home)

- [ ] **Step 1: Ajustar `page.tsx`**

No JSX retornado:

1. Adicionar o glow como primeiro filho do container raiz (antes do conteúdo):

```tsx
<div
  aria-hidden
  className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[600px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-accent-soft),transparent)]"
/>
```

2. Limitar a largura central a 1180px: no container raiz, trocar `2xl:max-w-[1920px]` por `2xl:max-w-[1180px]` (mantendo `2xl:mx-auto`).
3. Simplificar o wrapper do perfil: o `<header className="flex flex-col gap-6">` em volta do `<Bio>` pode virar só `<Bio ... />` (o Bio já é um container com `gap-6`). Manter o `<main id="profile" ...>`.
4. Passar `profileName={siteProfile.displayName}` ao `<HomeBentoLayout>`.

- [ ] **Step 2: Criar smoke E2E da home**

`apps/web/app/(site)/home.e2e.ts`:

```ts
import { test, expect } from '@playwright/test'

test.describe('Home V2', () => {
  test('mostra perfil, seções e abre o modal de carreira', async ({ page }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { level: 1, name: /Paulo Victor/i }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Carreira' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Projetos' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Artigos' })).toBeVisible()

    // abre o primeiro card de carreira -> modal
    await page
      .getByRole('button', { name: /detalhes/i })
      .first()
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('Atribuições', { exact: false })).toBeVisible()
  })
})
```

> Confirmar o padrão do Playwright do projeto (`playwright.config`, baseURL). Se a home depender de Keystatic/dev.to em build, o E2E roda contra o dev/preview server padrão do projeto. Ajustar selectors se necessário ao rodar.

- [ ] **Step 3: Rodar a verificação completa**

1. `pnpm prettier:fix`
2. `pnpm lint` (em `apps/web/`)
3. `pnpm exec tsc --noEmit` (em `apps/web/`)
4. `pnpm --filter @piluvitu/web build`
5. `pnpm --filter @piluvitu/web test` (Jest — deve seguir verde; sem lógica nova)
6. (Opcional, se o ambiente permitir) `pnpm --filter @piluvitu/web test:e2e` para o smoke da home.

- [ ] **Step 4: Atualizar `CLAUDE.md`**

Na seção relevante (ex.: após a descrição da home/App Router), registrar que a home foi reestilizada pro DS V2: layout split-scroll (perfil fixo + bento rolável), `SectionHeader`/`HomeFooter`, cards V2, modal de carreira, e os campos novos do Keystatic (perfil: availability/location/disciplines; carreira: current/tags; projeto: subtitle) + link pra spec.

- [ ] **Step 5: Commit**

```bash
git add apps/web CLAUDE.md
git commit -m "feat(web): home V2 page container (1180 + glow), profile wiring, E2E smoke + docs"
```

---

## Self-Review

**Spec coverage:**

- §3 layout/glow/maxw → Task 9 ✅
- §4.1 section-header/home-footer → Tasks 2,3 ✅
- §4.2 bento restyle → Task 4 ✅; bio → Task 5 ✅; social-strip (mailto) → Task 5 ✅; job-card card+modal → Task 6 ✅; project-card → Task 7 ✅; article-card → Task 8 ✅
- §5 schema/readers/types/content → Task 1 ✅
- §6 preservado (modal, visit-card, toggle; email→mailto) → Tasks 5,6 ✅
- §9 verificação → Tasks (cada uma) + Task 9 ✅
- §10 aceite → Task 9 Step 3/6 ✅

**Placeholder scan:** sem TODO/TBD; todo passo de código tem código. (`article-section.tsx` Step 1 pede leitura porque o arquivo não foi colado aqui — Step 3 dá a edição concreta.)

**Type/consistency:** `Carreira` ganha `current`/`tags` (Task 1) e são usados em job-card (Task 6) e mocks/stories; `Project` ganha `subtitle` usado em project-card (Task 7); `SiteProfileContent` ganha availability/location/disciplines usados em bio (Task 5) e fallback (Task 1). `HomeBentoLayout` ganha `profileName` (Task 4) passado em page.tsx (Task 9). Ordem das tasks garante que os tipos existam antes do uso.

**Ordem recomendada:** 1 (dados) → 2,3 (novos) → 4 (bento) → 5,6,7,8 (cards) → 9 (page+verificação). Tasks 4-8 dependem da Task 1 (tipos) e 2/3 (componentes novos).
