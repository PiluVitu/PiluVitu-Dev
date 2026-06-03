# Design System V2 "Cloud (cyan)" — Fundação

**Data:** 2026-06-02
**Status:** Aprovado (design) — aguardando revisão da spec
**Escopo:** Fundação (tokens + fontes + forma), sem reescrever páginas
**Fonte de design:** Figma `V2-PiluVitu` — node `1:1870` ("1920w dark"), seção "Design System — Cloud (cyan)"

---

## 1. Objetivo

Trocar a base visual do app do tema atual (shadcn **slate**, claro por padrão, `--primary` rosa, fonte Inter) para o **Design System V2 "Cloud (cyan)"**: dark-first, acento ciano, fontes Plus Jakarta Sans + JetBrains Mono, cards macios com sombra.

A entrega é **fundacional**: reescrevemos os _valores_ dos tokens de tema e as fontes. Tudo que já consome os tokens shadcn (`bg-background`, `text-foreground`, `bg-primary`, `<Button>`, `<Card>`, `<Badge>`, etc.) herda o look novo automaticamente, **sem** reescrever páginas, estrutura de componentes ou copy.

### Não-objetivos (fora do escopo desta fundação)

- Reestilizar páginas individualmente (home, votação, tools, tasks, blog).
- Introduzir as classes literais do Figma (`.btn`, `.card`, `.tag`, `.seg`). O repo usa shadcn/ui; mapeamos via tokens.
- Mexer no `ThemeProvider` / toggle — **já existem e dark já é o default** (ver §7).
- Criar/alterar lógica testável em Jest (fundação é CSS + config).

---

## 2. Decisões travadas (do brainstorming)

| Decisão               | Escolha                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| Alcance               | **Fundação primeiro**                                                  |
| Tema padrão           | **Dark "Cloud" como padrão + variante light derivada** (toggle mantém) |
| Arquitetura de tokens | **Mapear V2 → tokens shadcn existentes** + adicionar semânticos novos  |

### Pegadinha de nomenclatura (crítica)

No **V2**, `--accent` é a **cor de marca** (ciano). No **shadcn**, `--accent` é o _fundo sutil de hover_; a marca chama-se `--primary`. Portanto:

- V2 `--accent` (ciano `#38bdf8`) → shadcn **`--primary`**
- shadcn `--accent` (hover bg) → V2 `--surface-hover` `#18212f`

Mapear "accent→accent" quebraria o tema inteiro. Esta spec usa o mapeamento correto acima.

---

## 3. Tokens — paleta dark (novo padrão, bloco `.dark`)

Valores V2 convertidos para HSL-triplet (formato que o shadcn consome via `hsl(var(--token))`).

| Token shadcn               | ← V2                           | Hex        | HSL-triplet   |
| -------------------------- | ------------------------------ | ---------- | ------------- |
| `--background`             | `--bg`                         | `#090c12`  | `220 33% 5%`  |
| `--foreground`             | `--text`                       | `#e7ecf3`  | `215 33% 93%` |
| `--card`                   | `--surface`                    | `#0f1420`  | `222 36% 9%`  |
| `--card-foreground`        | `--text`                       | `#e7ecf3`  | `215 33% 93%` |
| `--popover`                | `--surface`                    | `#0f1420`  | `222 36% 9%`  |
| `--popover-foreground`     | `--text`                       | `#e7ecf3`  | `215 33% 93%` |
| `--primary`                | `--accent` (marca)             | `#38bdf8`  | `198 93% 60%` |
| `--primary-foreground`     | `--accent-ink`                 | `#04141c`  | `200 75% 6%`  |
| `--secondary`              | `--surface-2`                  | `#141b2a`  | `221 35% 12%` |
| `--secondary-foreground`   | `--text`                       | `#e7ecf3`  | `215 33% 93%` |
| `--muted`                  | `--surface-2`                  | `#141b2a`  | `221 35% 12%` |
| `--muted-foreground`       | `--text-dim`                   | `#93a0b3`  | `216 17% 64%` |
| `--accent` (hover)         | `--surface-hover`              | `#18212f`  | `217 32% 14%` |
| `--accent-foreground`      | `--text`                       | `#e7ecf3`  | `215 33% 93%` |
| `--destructive`            | danger                         | `#f87171`  | `0 91% 71%`   |
| `--destructive-foreground` | `--accent-ink`                 | `#04141c`  | `200 75% 6%`  |
| `--border`                 | `--accent-line` (blend sólido) | ~`#163247` | `205 40% 18%` |
| `--input`                  | idem                           | ~`#163247` | `205 40% 18%` |
| `--ring`                   | `--accent`                     | `#38bdf8`  | `198 93% 60%` |

**Nota sobre `--border`/`--input`:** o V2 usa `--accent-line = rgba(56,189,248,.32)` (linha ciano translúcida). Como o shadcn consome a borda via `hsl(var(--border))` (sem canal alpha), usamos a **cor sólida equivalente** ao blend de `accent-line` sobre `--surface` (`~205 40% 18%`). Valor exato afinado na implementação contra o screenshot.

### Tokens semânticos novos (votação)

Expostos como o `--success` de hoje (par `:root`/`.dark` + `@theme { --color-* }`). Hex confirmados 1:1 no Figma durante a implementação (lidos do screenshot da seção "Semânticas — Votação").

| Token    | Significado (V2)   | Hex       | HSL-triplet   |
| -------- | ------------------ | --------- | ------------- |
| `--ok`   | seu voto · sucesso | `#34d399` | `158 64% 52%` |
| `--warn` | empate · atenção   | `#fbbf24` | `43 96% 56%`  |
| `--win`  | vencedor           | `#a78bfa` | `255 92% 76%` |

- Foregrounds (`--ok-foreground`, `--warn-foreground`, `--win-foreground`): ink escuro `200 75% 6%` (texto sobre a cor).
- `--success` é **mantido** com o mesmo valor de `--ok` (não quebra usos atuais de `text-success`); `--ok` passa a ser o nome canônico daqui pra frente.

### Tokens de marca translúcidos (opcionais, com alpha)

Expostos direto em `@theme` (têm canal alpha, então não viram triplet shadcn):

```css
@theme {
  --color-accent-soft: rgb(
    56 189 248 / 0.13
  ); /* V2 --accent-soft → bg-accent-soft */
  --color-accent-line: rgb(
    56 189 248 / 0.32
  ); /* V2 --accent-line → border-accent-line */
}
```

Para fills/anéis de marca sutis (ex.: chip selecionado, ring de foco suave) quando uma página quiser, sem hardcode de hex.

---

## 4. Tokens — paleta light (derivada)

O Figma só mostra o frame dark. Derivamos um light coerente: **mantém o ciano de marca**, inverte superfícies pra claro e texto pra escuro. Vai no bloco `:root` (light). Marcado como **derivado** — refinar se aparecer um frame light no Figma.

| Token                     | Hex       | HSL-triplet   |
| ------------------------- | --------- | ------------- |
| `--background`            | `#f6f8fc` | `220 50% 98%` |
| `--foreground`            | `#0f1420` | `222 36% 9%`  |
| `--card` / `--popover`    | `#ffffff` | `0 0% 100%`   |
| `--secondary` / `--muted` | `#eef2f8` | `216 42% 95%` |
| `--accent` (hover)        | `#e6ecf5` | `216 43% 93%` |
| `--muted-foreground`      | `#4a586b` | `215 18% 35%` |
| `--primary`               | `#38bdf8` | `198 93% 60%` |
| `--primary-foreground`    | `#04141c` | `200 75% 6%`  |
| `--border` / `--input`    | —         | `216 30% 88%` |
| `--ring`                  | `#38bdf8` | `198 93% 60%` |

Semânticos no light: mesmos hues, luminosidade ajustada para contraste sobre fundo claro (afinado na implementação).

---

## 5. Tipografia

Trocar **Inter → Plus Jakarta Sans** (texto e títulos) e adicionar **JetBrains Mono** (datas, labels, tags, metadados), ambos via `next/font/google`.

**`app/layout.tsx`:**

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
// <html className={`${sans.variable} ${mono.variable}`}>
// body deixa de usar inter.className; passa a herdar font-sans
```

**`app/globals.css` (`@theme`):**

```css
@theme {
  --font-sans: var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
}
```

No `globals.css`, a regra `body` existente (`@layer base { body { @apply bg-background text-foreground } }`) ganha **`@apply font-sans`**, e o `<body>` deixa de receber `inter.className`. Assim o corpo herda Plus Jakarta Sans e `font-mono` (datas/labels/tags) renderiza JetBrains Mono em todo o app, como no V2.

---

## 6. Forma & sombra

| Token           | Hoje             | V2                            | Ação                              |
| --------------- | ---------------- | ----------------------------- | --------------------------------- |
| `--radius`      | `0.75rem` (12px) | `--r-card` 18px               | `--radius: 1.125rem` (18px)       |
| `--radius-pill` | —                | `--r-pill` 999px              | novo token p/ tags/badges/pílulas |
| `--shadow-ds`   | —                | `--shadow` `0 18px 40px /.45` | novo token de sombra de card      |

- `--radius: 18px` → escala shadcn lg=18 / md=16 / sm=14. Deixa inputs/botões mais arredondados — **proposital** pelo look macio do V2.
- `--radius-pill` e `--shadow-ds` expostos via `@theme` (`--radius-pill`, `--shadow-ds`) para virarem utilitários `rounded-pill` / `shadow-ds`.

```css
@theme {
  --radius-pill: 999px;
  --shadow-ds: 0 18px 40px rgb(0 0 0 / 0.45);
}
```

---

## 7. Tema padrão & toggle (já existente — só verificar)

- `next-themes@^0.4.6` **já é dependência**.
- `components/theme-provider.tsx` envolve `app/(site)/layout.tsx` com `attribute="class" defaultTheme="dark" enableSystem`. **Dark já é o default**; `components/mode-toggle.tsx` já alterna.
- Implicação de `enableSystem`: visitante com SO em modo claro vê a **variante light** — por isso a qualidade do light de §4 importa.
- `ThemeProvider` cobre só as rotas `(site)`. Rotas fora dele (`/keystatic`, `/admin` do TinaCMS) renderizam sempre `:root` (light). Aceitável para a fundação; fora de escopo ajustar.

Nenhuma mudança de código de tema aqui além de **confirmar** que o default dark continua e que os novos valores renderizam nos dois temas.

---

## 8. Arquivos afetados

| Arquivo                                    | Mudança                                                                                                                                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/app/globals.css`                 | Reescrever valores `:root` (light derivado) e `.dark` (V2 dark); adicionar `--ok/--warn/--win` (+ foregrounds), `--radius-pill`, `--shadow-ds`, `--color-accent-soft/-line`, `--font-sans/--font-mono`; ajustar `--radius`; manter `--success` como espelho de `--ok` |
| `apps/web/app/layout.tsx`                  | Trocar Inter por Plus Jakarta Sans + JetBrains Mono; aplicar `.variable` no `<html>`; remover `inter.className` do `<body>`                                                                                                                                           |
| `apps/web/components/*.stories.tsx` (nova) | Story "Design Tokens" mostrando paleta, fontes, raio e sombra (superfície de verificação visual)                                                                                                                                                                      |
| `apps/web/components.json`                 | (verificar) `baseColor` segue `slate`; sem mudança funcional — tokens é que mudam                                                                                                                                                                                     |

**Não tocar:** páginas, componentes de UI (estrutura), `ThemeProvider`, conteúdo Keystatic/Tina.

---

## 9. Riscos & mitigações

| Risco                                                                                                         | Mitigação                                                                               |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Contraste insuficiente em algum par (ex.: `text-muted-foreground` sobre `--surface-2`)                        | Passada de verificação no Storybook + checar WCAG AA nos pares principais               |
| `--radius: 18px` deixar inputs/botões redondos demais                                                         | Decisão proposital documentada; afinar na story se destoar do Figma                     |
| Light derivado destoar de um eventual frame light oficial                                                     | Marcado como derivado; trivial de re-sincronizar depois                                 |
| Hardcodes de cor existentes (ex.: `bg-amber-950` no banner de draft em `(site)/layout.tsx`) não herdam tokens | Fora de escopo; listar como follow-up de reskin                                         |
| `--border` sólido perder o tom translúcido do V2                                                              | `--color-accent-line` disponível p/ bordas acentuadas; geral fica no sólido equivalente |

---

## 10. Verificação (regras do projeto)

Ordem antes de concluir (CLAUDE.md):

1. `pnpm prettier:fix`
2. `pnpm lint` (ESLint + sem erros de tipo)
3. `pnpm exec tsc --noEmit` (em `apps/web/`)
4. `pnpm --filter @piluvitu/web build`
5. Passada visual no **Storybook** (`pnpm --filter @piluvitu/web storybook`) — story "Design Tokens" + checar componentes shadcn (Button/Card/Badge/Input) nos temas dark e light.

Fundação é CSS + config → **sem testes Jest novos** (não há lógica). A story de tokens é a superfície de verificação visual; E2E existentes não devem quebrar (sem mudança de DOM/estrutura).

---

## 11. Critérios de aceite

- [ ] App renderiza no dark "Cloud (cyan)" por padrão; acento ciano `#38bdf8` visível em `<Button>`/links/foco.
- [ ] Toggle "Tema" alterna para a variante light derivada sem quebra de contraste grosseira.
- [ ] Fontes: corpo em Plus Jakarta Sans; `font-mono` em JetBrains Mono.
- [ ] `--ok/--warn/--win` disponíveis como utilitários (`text-ok`, `bg-warn`, etc.); `text-success` antigo segue funcionando.
- [ ] Cards com raio 18px e sombra `--shadow-ds`.
- [ ] `lint` + `tsc --noEmit` + `build` verdes; Storybook abre e a story de tokens reflete a paleta.
