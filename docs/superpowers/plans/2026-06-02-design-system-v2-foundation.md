# Design System V2 "Cloud (cyan)" Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar a base visual do app para o Design System V2 "Cloud (cyan)" trocando apenas os valores dos tokens de tema e as fontes, sem reescrever páginas.

**Architecture:** Mapeia os tokens do V2 sobre as variáveis shadcn já existentes em `app/globals.css` (V2 `--accent` ciano → shadcn `--primary`), adiciona tokens semânticos novos (`--ok/--warn/--win`) e troca as fontes via `next/font`. Componentes shadcn herdam o look automaticamente.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS 4 (`@theme`), shadcn/ui, next-themes (já configurado, dark default), next/font/google, Storybook 10 (`@storybook/nextjs`).

**Spec:** `docs/superpowers/specs/2026-06-02-design-system-v2-foundation-design.md`

**Nota sobre verificação:** esta fundação é CSS + config (não há lógica nova). Logo **não há testes Jest** — a verificação é `lint` + `tsc --noEmit` + `build` (gates) e uma **story "Design Tokens"** no Storybook como superfície visual. Os E2E existentes não devem quebrar (nenhuma mudança de DOM/estrutura).

---

## File Structure

| Arquivo                                         | Responsabilidade                                   | Ação                                                                                            |
| ----------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/web/app/layout.tsx`                       | Root layout — carrega fontes globais               | Modificar: trocar Inter por Plus Jakarta Sans + JetBrains Mono                                  |
| `apps/web/app/globals.css`                      | Tema (tokens shadcn + `@theme` Tailwind)           | Modificar: `@theme` (fontes, semânticos, raio, sombra), `:root` (light), `.dark` (dark), `body` |
| `apps/web/components/design-tokens.stories.tsx` | Story de verificação visual da paleta/fontes/forma | Criar                                                                                           |

Tudo num único arquivo de tema (`globals.css`) — é o padrão do projeto e a fonte única de tokens. Sem split.

---

## Task 1: Trocar fontes (Inter → Plus Jakarta Sans + JetBrains Mono)

**Files:**

- Modify: `apps/web/app/layout.tsx:2,6,92,93`
- Modify: `apps/web/app/globals.css` (bloco `@theme` + regra `body`)

- [ ] **Step 1: Trocar import e instâncias de fonte no layout**

Em `apps/web/app/layout.tsx`, substituir a linha 2 (`import { Inter } ...`) e a linha 6 (`const inter = ...`):

```ts
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google'

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})
```

- [ ] **Step 2: Aplicar as variáveis de fonte no `<html>` e limpar o `<body>`**

Em `apps/web/app/layout.tsx`, trocar o bloco de retorno (linhas 91-97):

```tsx
return (
  <html
    lang="pt-BR"
    className={`${sans.variable} ${mono.variable}`}
    suppressHydrationWarning
  >
    <body suppressHydrationWarning>{children}</body>
  </html>
)
```

(remove o `className={inter.className}` do `<body>`)

- [ ] **Step 3: Mapear as fontes no `@theme` e aplicar `font-sans` no `body`**

Em `apps/web/app/globals.css`, dentro do bloco `@theme { ... }` (logo após o bloco de `--color-*`, antes dos `--radius-*`), adicionar:

```css
--font-sans: var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif;
--font-mono: var(--font-jetbrains), ui-monospace, monospace;
```

E na regra `body` do `@layer base` (hoje `body { @apply bg-background text-foreground; }`), adicionar `font-sans`:

```css
body {
  @apply bg-background text-foreground font-sans;
}
```

- [ ] **Step 4: Verificar tipos e build**

Run (em `apps/web/`): `pnpm exec tsc --noEmit`
Expected: PASS (sem erros).

Run (na raiz): `pnpm --filter @piluvitu/web build`
Expected: build conclui; nenhuma referência a `inter` restante (a remoção da var não deve deixar import órfão — confirmar que `Inter` não é mais importado).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/app/globals.css
git commit -m "feat(web): swap fonts to Plus Jakarta Sans + JetBrains Mono (DS V2)"
```

---

## Task 2: Adicionar mapeamentos `@theme` (semânticos, marca translúcida, raio-pill, sombra)

**Files:**

- Modify: `apps/web/app/globals.css` (bloco `@theme`)

- [ ] **Step 1: Adicionar os novos tokens no `@theme`**

Em `apps/web/app/globals.css`, dentro do `@theme`, logo após as linhas de `--color-success` / `--color-success-foreground`, adicionar:

```css
--color-ok: hsl(var(--ok));
--color-ok-foreground: hsl(var(--ok-foreground));
--color-warn: hsl(var(--warn));
--color-warn-foreground: hsl(var(--warn-foreground));
--color-win: hsl(var(--win));
--color-win-foreground: hsl(var(--win-foreground));

--color-accent-soft: rgb(56 189 248 / 0.13);
--color-accent-line: rgb(56 189 248 / 0.32);

--radius-pill: 999px;
--shadow-ds: 0 18px 40px rgb(0 0 0 / 0.45);
```

> Isso cria os utilitários `text-ok` / `bg-warn` / `text-win` / `bg-accent-soft` / `border-accent-line` / `rounded-pill` / `shadow-ds`. Os valores `hsl(var(--ok))` etc. só resolvem depois que `--ok/--warn/--win` forem definidos nos blocos `:root`/`.dark` (Tasks 3 e 4) — sem quebra de build no meio, pois esses utilitários ainda não são usados.

- [ ] **Step 2: Build**

Run (na raiz): `pnpm --filter @piluvitu/web build`
Expected: build conclui sem erro.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): add DS V2 @theme tokens (ok/warn/win, accent-soft/line, pill, shadow)"
```

---

## Task 3: Reescrever a paleta dark (`.dark`) com o V2 "Cloud (cyan)"

**Files:**

- Modify: `apps/web/app/globals.css` (bloco `.dark`, hoje linhas ~135-157)

- [ ] **Step 1: Substituir o conteúdo do bloco `.dark`**

Em `apps/web/app/globals.css`, substituir todo o corpo do bloco `.dark { ... }` por:

```css
.dark {
  --background: 220 33% 5%;
  --foreground: 215 33% 93%;
  --card: 222 36% 9%;
  --card-foreground: 215 33% 93%;
  --popover: 222 36% 9%;
  --popover-foreground: 215 33% 93%;
  --primary: 198 93% 60%;
  --primary-foreground: 200 75% 6%;
  --secondary: 221 35% 12%;
  --secondary-foreground: 215 33% 93%;
  --muted: 221 35% 12%;
  --muted-foreground: 216 17% 64%;
  --accent: 217 32% 14%;
  --accent-foreground: 215 33% 93%;
  --destructive: 0 91% 71%;
  --destructive-foreground: 200 75% 6%;
  --border: 205 40% 18%;
  --input: 205 40% 18%;
  --ring: 198 93% 60%;
  --success: 158 64% 52%;
  --success-foreground: 200 75% 6%;
  --ok: 158 64% 52%;
  --ok-foreground: 200 75% 6%;
  --warn: 43 96% 56%;
  --warn-foreground: 200 75% 6%;
  --win: 255 92% 76%;
  --win-foreground: 200 75% 6%;
}
```

- [ ] **Step 2: Verificar visualmente no Storybook (dark)**

Run (na raiz): `pnpm --filter @piluvitu/web storybook`
Expected: Storybook abre; componentes shadcn (Button/Card/Badge) aparecem com fundo dark azulado e acento ciano. (Confirmação final na story de tokens, Task 5.)

- [ ] **Step 3: Build**

Run: `pnpm --filter @piluvitu/web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): apply DS V2 dark palette (Cloud cyan) to .dark theme"
```

---

## Task 4: Reescrever a paleta light (`:root`) derivada + `--radius` 18px

**Files:**

- Modify: `apps/web/app/globals.css` (bloco `:root`, hoje linhas ~110-133)

- [ ] **Step 1: Substituir o conteúdo do bloco `:root`**

Em `apps/web/app/globals.css`, substituir todo o corpo do bloco `:root { ... }` (o bloco de tema dentro do `@layer base`, que termina com `--radius: 0.75rem;`) por:

```css
:root {
  --background: 220 50% 98%;
  --foreground: 222 36% 9%;
  --card: 0 0% 100%;
  --card-foreground: 222 36% 9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 36% 9%;
  --primary: 198 93% 60%;
  --primary-foreground: 200 75% 6%;
  --secondary: 216 42% 95%;
  --secondary-foreground: 222 36% 9%;
  --muted: 216 42% 95%;
  --muted-foreground: 215 18% 35%;
  --accent: 216 43% 93%;
  --accent-foreground: 222 36% 9%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --border: 216 30% 88%;
  --input: 216 30% 88%;
  --ring: 198 93% 60%;
  --success: 158 64% 40%;
  --success-foreground: 0 0% 100%;
  --ok: 158 64% 40%;
  --ok-foreground: 0 0% 100%;
  --warn: 38 92% 45%;
  --warn-foreground: 0 0% 100%;
  --win: 255 60% 60%;
  --win-foreground: 0 0% 100%;
  --radius: 1.125rem;
}
```

> `--radius: 1.125rem` (18px) é theme-independent (só no `:root`); a escala shadcn vira lg=18 / md=16 / sm=14 px. `--ring`/`--primary` ciano valem nos dois temas.

- [ ] **Step 2: Verificar visualmente no Storybook (light via toggle)**

Run (na raiz): `pnpm --filter @piluvitu/web storybook`
Expected: alternando para light, superfícies ficam claras, texto escuro, acento ciano preservado; sem contraste grosseiramente quebrado.

- [ ] **Step 3: Build**

Run: `pnpm --filter @piluvitu/web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): derive DS V2 light palette + soften radius to 18px"
```

---

## Task 5: Story "Design Tokens" (verificação visual)

**Files:**

- Create: `apps/web/components/design-tokens.stories.tsx`

- [ ] **Step 1: Criar a story**

Criar `apps/web/components/design-tokens.stories.tsx` com o conteúdo completo:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'

const meta: Meta = {
  title: 'Design System/Tokens',
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
}
export default meta
type Story = StoryObj

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`border-border h-16 w-full rounded-lg border ${className}`}
      />
      <span className="text-muted-foreground font-mono text-xs">{label}</span>
    </div>
  )
}

const colors: Array<{ label: string; className: string }> = [
  { label: 'background', className: 'bg-background' },
  { label: 'foreground', className: 'bg-foreground' },
  { label: 'card', className: 'bg-card' },
  { label: 'secondary', className: 'bg-secondary' },
  { label: 'muted', className: 'bg-muted' },
  { label: 'accent (hover)', className: 'bg-accent' },
  { label: 'primary', className: 'bg-primary' },
  { label: 'destructive', className: 'bg-destructive' },
  { label: 'ok', className: 'bg-ok' },
  { label: 'warn', className: 'bg-warn' },
  { label: 'win', className: 'bg-win' },
  { label: 'accent-soft', className: 'bg-accent-soft' },
]

export const Colors: Story = {
  render: () => (
    <div className="bg-background p-8">
      <h2 className="text-foreground mb-4 text-lg font-semibold">Cores</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {colors.map((c) => (
          <Swatch key={c.label} label={c.label} className={c.className} />
        ))}
      </div>
    </div>
  ),
}

export const Typography: Story = {
  render: () => (
    <div className="bg-background text-foreground space-y-4 p-8">
      <p className="font-sans text-3xl font-bold">
        Plus Jakarta Sans — Display
      </p>
      <p className="font-sans text-base">
        Plus Jakarta Sans — corpo de leitura confortável.
      </p>
      <p className="text-muted-foreground font-mono text-sm">
        JetBrains Mono — labels · metadados · 2026-06-02
      </p>
    </div>
  ),
}

export const ShapeAndShadow: Story = {
  render: () => (
    <div className="bg-background flex flex-wrap items-end gap-6 p-8">
      <div className="shadow-ds bg-card text-card-foreground flex h-32 w-48 items-center justify-center rounded-lg">
        rounded-lg (18px) + shadow-ds
      </div>
      <span className="rounded-pill bg-primary text-primary-foreground px-4 py-1 text-sm">
        rounded-pill
      </span>
    </div>
  ),
}
```

- [ ] **Step 2: Lint + tipos**

Run (em `apps/web/`): `pnpm exec tsc --noEmit`
Expected: PASS.

Run (na raiz): `pnpm lint`
Expected: PASS (sem erros ESLint na story nova).

- [ ] **Step 3: Conferir no Storybook**

Run: `pnpm --filter @piluvitu/web storybook`
Expected: aparece "Design System / Tokens" com Colors, Typography, ShapeAndShadow; alternar dark/light reflete as duas paletas.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/design-tokens.stories.tsx
git commit -m "test(web): add Design Tokens story as DS V2 visual verification surface"
```

---

## Task 6: Passada final de verificação + atualizar CLAUDE.md

**Files:**

- Modify: `apps/web/CLAUDE.md` ou `CLAUDE.md` raiz (seção Theme/Tech Stack) — registrar o DS V2

- [ ] **Step 1: Rodar a sequência completa de qualidade (regras do projeto)**

Run, em ordem:

1. `pnpm prettier:fix`
2. `pnpm lint`
3. `pnpm exec tsc --noEmit` (em `apps/web/`)
4. `pnpm --filter @piluvitu/web build`

Expected: todos verdes.

- [ ] **Step 2: Conferir critérios de aceite da spec (§11)**

Verificar manualmente no Storybook/dev:

- App dark "Cloud (cyan)" por padrão; acento ciano `#38bdf8` em Button/links/foco.
- Toggle alterna para light derivado sem contraste grosseiro.
- Corpo em Plus Jakarta Sans; `font-mono` em JetBrains Mono.
- `text-ok/bg-warn/text-win` funcionam; `text-success` antigo segue válido.
- Cards com raio 18px + `shadow-ds`.

- [ ] **Step 3: Atualizar o CLAUDE.md (regra do projeto: tecnologia nova/fluxo alterado)**

Na seção **### Theme** do `CLAUDE.md` raiz, acrescentar parágrafo registrando: tema agora é o **Design System V2 "Cloud (cyan)"** (dark default via next-themes), tokens shadcn mapeados do V2, fontes Plus Jakarta Sans + JetBrains Mono, semânticos `--ok/--warn/--win` (votação), `--radius-pill`/`--shadow-ds`, e link para a spec `docs/superpowers/specs/2026-06-02-design-system-v2-foundation-design.md`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md apps/web
git commit -m "docs: register DS V2 Cloud theme foundation in CLAUDE.md"
```

---

## Self-Review (preenchido pelo autor do plano)

**Spec coverage:**

- §3 dark palette → Task 3 ✅
- §3 semânticos + accent-soft/line → Task 2 (mapeamento) + Tasks 3/4 (valores) ✅
- §4 light palette → Task 4 ✅
- §5 fontes → Task 1 ✅
- §6 raio/pill/shadow → Task 2 (pill/shadow) + Task 4 (--radius) ✅
- §7 tema default → sem código (já configurado); confirmado em Tasks 3/4 Step 2 ✅
- §8 arquivos → Tasks 1-6 cobrem layout.tsx, globals.css, story; CLAUDE.md em Task 6 ✅
- §10 verificação → Task 6 ✅
- §11 aceite → Task 6 Step 2 ✅

**Placeholder scan:** sem TBD/TODO; todo passo de código tem o código completo. ✅

**Type/consistency:** nomes de token consistentes entre `@theme` (`--color-ok` → `hsl(var(--ok))`) e blocos `:root`/`.dark` (`--ok`, `--ok-foreground`). Utilitários usados na story (`bg-ok`, `bg-warn`, `bg-win`, `bg-accent-soft`, `rounded-pill`, `shadow-ds`, `font-mono`) todos definidos no `@theme` da Task 2 + valores nas Tasks 3/4. ✅
