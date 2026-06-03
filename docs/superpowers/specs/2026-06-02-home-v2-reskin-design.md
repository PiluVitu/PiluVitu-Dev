# Home V2 "Cloud (cyan)" — Reskin da página inicial

**Data:** 2026-06-02
**Status:** Aprovado (design) — aguardando revisão da spec
**Escopo:** Reskin da rota `/` (home) pro Design System V2, reusando dados e componentes
**Depende de:** fundação DS V2 (branch `feat/design-system-v2-foundation` / PR #32) — tokens, fontes e semânticos já no `globals.css`
**Fonte de design:** Figma `V2-PiluVitu` — node `1:450` (home "1920w dark") + modal de carreira (referência enviada pelo usuário)

---

## 1. Objetivo

Reestilizar a home (`app/(site)/page.tsx` + componentes) pro layout V2: duas colunas (perfil fixo à esquerda, conteúdo rolável à direita) com seções **Carreira / Projetos / Artigos** usando headers padronizados (label mono + contador + régua), cards DS V2, e footer. Os **dados continuam vindo do Keystatic** (perfil, socials, carreiras, projetos) e do blog/dev.to (artigos). Reusa e reestiliza os componentes atuais; não reescreve wiring de dados.

### Não-objetivos

- Mudar de onde os dados vêm (Keystatic/blog continuam as fontes).
- Reskin de outras rotas (votação, tools, tasks, blog) — fora desta entrega.
- Trocar a infra de tema/toggle (já pronta na fundação).

---

## 2. Decisões travadas (brainstorming)

| Decisão                | Escolha                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| Abordagem              | **Fiel ao V2, reusando dados + componentes**                                         |
| Layout                 | Mantém a estrutura **bento** (`home-bento-layout.tsx` reestilizado, não substituído) |
| Layout scroll          | **Esquerda fixa, direita rola** (mantém o split-scroll atual)                        |
| Preservar              | **Modal de carreira** + **visit-card 3D** (triple-click avatar)                      |
| Email na home          | Ícone vira **mailto** (dialog de email sai da home)                                  |
| Cor da empresa         | Mantém o **`companyLinkColor`** configurável (role highlight vira ciano)             |
| Tags da carreira       | **Campos próprios no Keystatic** (`current` + `tags[]`), não derivadas de string     |
| Campos novos do perfil | **Adicionar ao Keystatic** (editáveis)                                               |
| Subtítulo de projeto   | Campo **opcional** novo no Keystatic                                                 |

---

## 3. Layout & estrutura

`app/(site)/page.tsx` usa **scroll da página inteira** (não overflow independente por coluna — esse modelo fazia o footer ficar pinado e estreito). Ajustes:

- Container central **max 1180px** (`--maxw` do V2), padding lateral 40px (22px mobile).
- Grid `xl:grid-cols-12` com **`xl:items-start`** (necessário pro sticky funcionar).
- **Esquerda** (`xl:col-span-4`, **`xl:sticky xl:top-10 xl:self-start`**): `<Bio>`. Como é mais baixa que a viewport, fica fixa por todo o scroll.
- **Direita** (`xl:col-span-8`, fluxo normal): `<HomeBentoLayout>` **reestilizado** (a home segue "bento") com as 3 seções. É o que "rola" (via scroll da página).
- **Footer full-width:** `<HomeFooter>` fica **fora** do grid, abaixo dele, cobrindo as duas colunas; aparece no fim do scroll (não é pinado nem fica dentro da coluna direita).
- **Glow ciano** no topo: um elemento de fundo absoluto com `radial-gradient`/`linear-gradient` usando `--color-accent-soft` (sutil, ~1200px de altura, atrás do conteúdo). Sem imagem.
- **Mobile/tablet** (`< xl`): colunas empilham (perfil em cima, conteúdo embaixo), 1 coluna nos grids. Mantém o comportamento responsivo atual.

---

## 4. Componentes

Todos herdam os tokens DS V2 da fundação: `bg-background/bg-card`, `border-border`, `text-foreground/text-muted-foreground`, `bg-primary/text-primary` (ciano), `rounded-lg` (18px), `rounded-pill`, `shadow-ds`, `font-mono`, `--color-accent-soft/-line`.

### 4.1 Criar

**`components/section-header.tsx`** — header de seção reusável.

- Props: `{ label: string; count?: number | string; id?: string }`.
- Visual (Figma `div.sechead`, 17px de altura): `<h2>` com a `label` em **mono UPPERCASE**, `text-muted-foreground`, `tracking` largo, `text-xs/sm`; ao lado um `span.count` (`text-muted-foreground`, mono) com o número zero-padded (`05`, `01`, `06`); e uma **régua** 1px (`bg-border`, `flex-1`) preenchendo o resto, verticalmente centralizada. Gap ~12px.
- `id` pro `aria-labelledby` da seção.

> A home **continua "bento"**: o `home-bento-layout.tsx` **é mantido** e reestilizado no lugar (ver §4.2) — não criamos um componente substituto nem o apagamos.

**`components/home-footer.tsx`** — `© {ano} {nome}` à esquerda; à direita `piluvitu.com.br · /tools · /votação · admin` (links reais pra `/tools`, `/votacao`, `/votacao/admin`). Mono, `text-muted-foreground`, borda-topo sutil. Componente separado (com story).

### 4.2 Reestilizar (mantêm dados + comportamento)

**`components/home-bento-layout.tsx`** — mantido (a home segue "bento"); reestilizado no lugar.

- Cada uma das 3 `<section>` (Carreira/Projetos/Artigos) passa a usar `<SectionHeader label count>` no lugar do `<h2>` atual.
- Renderiza `<HomeFooter>` ao final.
- Grids seguem: Carreira/Artigos = 2-col (`xl:grid-cols-2`, gap ~14px), Projetos = 1-col largo; mobile = 1-col.
- Contadores: `carreiraList.length`, `projectList.length`, nº de artigos (zero-padded, ex. `String(n).padStart(2, '0')`).
- Mantém as props atuais (`carreiraList`, `projectList`, `initialBlogPosts`); o nome/arquivo do componente **não muda**.

**`components/bio.tsx`** — coluna de perfil (Figma `PERFIL`).

- Topo: avatar (imagem do perfil; `ProfileVisitCard` **mantido** — triple-click abre o card 3D) + `<ModeToggle>` ("Tema") à direita.
- `● Disponível para oportunidades` (dot `bg-ok` + texto mono) — vem do novo campo `availability` (§5).
- `<h1>` nome **grande** (`text-4xl/5xl`, `font-sans` bold, `tracking-tight`) — 2 linhas como no Figma.
- Cargo: `roleHighlight` em **ciano** (`text-primary`, troca a cor lima hardcoded `text-lime-500` que destoa do tema) + " na " + link da empresa. O nome da empresa **mantém o `companyLinkColor`** configurável do Keystatic (cor custom por empresa, inline) — não é forçado pro ciano.
- Bio (`text-muted-foreground`).
- `<ProfileSocialStrip>` (abaixo).
- Meta (novo, §5): linha `📍 {location}` e `💼 {disciplines.join(' · ')}` em mono, ícones FA.

**`components/profile-social-strip.tsx`** — botões-ícone V2 (42×42, `rounded-lg`/`rounded-xl`, `bg-card` hover `bg-accent`, ícone `text-muted-foreground` hover `text-foreground`). Email = link **mailto** (sem dialog).

**`components/job-card.tsx`** — card + modal de carreira.

- **Card** (`article.card`, 353×141, padding ~19px, `bg-card border-border rounded-lg`): topo = logo quadrado 40×40 (`rounded-md`, `bg-accent-soft text-primary`, abreviatura `altImage`) + empresa (`orgName`, semibold) e data (`date`, mono `text-muted-foreground`); cargo (`title`); rodapé = tags **vindas de campos próprios do Keystatic** (§5.3): `current` (checkbox) → pill "Atual" com dot; `tags[]` → demais pills (ex. "Remoto"), todas `rounded-pill border` — + "detalhes →" (`text-primary`, abre o modal).
- **Modal** (referência Image #1, `Dialog` do shadcn já usado): head = logo + título `orgName` + "{title} · {date}" mono + botão fechar; tagline ciano (`orgDescription`, `text-primary`); label **ATRIBUIÇÕES** (mono uppercase, `text-muted-foreground`); lista `atribuitions` com **marcadores quadrados ciano** (`bg-primary`); footer = botão primário full-width "Saiba mais sobre {orgName}" (quando `orgLink`).

**`components/project-card.tsx`** — card de projeto V2 (Figma `Projetos`, padding 25px).

- Head: ícone 48×48 (`rounded-lg bg-accent-soft text-primary`, `projectLogo`/FA) + título (`projectName`) + subtítulo (`subtitle` novo, opcional — `text-muted-foreground`, omite se vazio).
- Descrição (`description`).
- Stack: `tags[]` como `rounded-pill border` mono.
- Links: `Demo` (botão **primário** ciano → `deployLink`) + `Código` (botão **ghost/outline** → `repoLink`), com ícones. Omite cada um se o link faltar.

**`components/article-card.tsx`** — card de artigo V2 (`a.card`, 353×135, padding ~21px).

- Meta: `span.kbd` `~/blog` (mono, `bg-accent-soft`/borda, `text-primary`) + `· post {NN}` (índice zero-padded).
- Título (`text-foreground`, 2 linhas, `line-clamp-2`).
- Rodapé: `{readingTimeMinutes} min de leitura` (mono `text-muted-foreground`) + "ler →" (`text-primary`). Card inteiro é link pro artigo (`url`).
- Mantém o feed atual (dev.to + blog via `ArticleSection`/TanStack Query).

---

## 5. Dados / Keystatic (migração de schema)

> Migração de schema do Keystatic = mudança em `keystatic.config.ts` + reader + valores no `content/`. O agente **não roda migração**; informa o passo. Aqui é schema declarativo (sem SQL) — o "migrar" é só editar a config + preencher o YAML inicial.

### 5.1 `siteProfile` singleton (`keystatic.config.ts`)

Adicionar campos:

- `availabilityOpen: fields.checkbox({ label: 'Disponível para oportunidades', defaultValue: true })`
- `availabilityLabel: fields.text({ label: 'Texto de disponibilidade', defaultValue: 'Disponível para oportunidades' })`
- `location: fields.text({ label: 'Local', description: 'Ex.: Brasil · Remoto' })`
- `disciplines: fields.array(fields.text({ label: 'Disciplina' }), { label: 'Disciplinas', itemLabel: (p) => p.value })` (ex.: SRE, DevOps, Cloud)

`SiteProfileContent` (`lib/site-content.ts`) ganha: `availabilityOpen: boolean`, `availabilityLabel: string`, `location: string`, `disciplines: string[]`. `getSiteProfile` lê os novos campos (com defaults seguros caso ausentes). O `fallbackProfile` em `page.tsx` ganha valores padrão (Brasil · Remoto, SRE/DevOps/Cloud, disponível=true).

### 5.2 `projects` collection — subtítulo

Adicionar `subtitle: fields.text({ label: 'Subtítulo', description: 'Ex.: agregador de pull requests' })` (opcional). `Project` type ganha `subtitle?: string`; reader (`getProjects`) inclui; card omite quando vazio.

### 5.3 `carreiras` collection — tags próprias

Adicionar campos (substituem a derivação por string):

- `current: fields.checkbox({ label: 'Cargo atual', defaultValue: false })` — dirige a pill "Atual" (com dot).
- `tags: fields.array(fields.text({ label: 'Tag' }), { label: 'Tags', itemLabel: (p) => p.value })` — ex.: "Remoto", "Híbrido".

`Carreira` type (`mocks/carreira.ts`) ganha `current: boolean` e `tags: string[]`; `getCarreiras` lê os novos campos (defaults seguros: `current=false`, `tags=[]`). O card renderiza "Atual" se `current`, seguido de cada `tag`.

### 5.4 Conteúdo inicial

Preencher o YAML do `content/site/profile/` (status, local, disciplinas), `content/carreiras/*` (`current`/`tags`) e (opcional) `subtitle` em `content/projects/*` com os valores atuais. Como o Keystatic grava commitando, na prática edito os arquivos YAML no repo (status disponível, "Brasil · Remoto", disciplinas SRE/DevOps/Cloud, `current=true` nos cargos vigentes, tag "Remoto" onde couber).

---

## 6. Comportamentos preservados / removidos

| Item                                | Decisão                                           |
| ----------------------------------- | ------------------------------------------------- |
| Modal de detalhes da carreira       | **Mantido** (reestilizado p/ Image #1)            |
| Visit-card 3D (triple-click avatar) | **Mantido** (ProfileVisitCard segue no Bio)       |
| Theme toggle ("Tema")               | **Mantido** (ModeToggle)                          |
| Feed de artigos (dev.to + blog)     | **Mantido** (ArticleSection/TanStack Query)       |
| Dialog de contato por email         | **Removido da home** — ícone Email vira `mailto:` |

---

## 7. Arquivos afetados

| Arquivo                                                               | Ação                                                                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `app/(site)/page.tsx`                                                 | Ajustar container (maxw 1180, glow), novos campos no `fallbackProfile` (mantém `HomeBentoLayout`)         |
| `components/section-header.tsx` (+ `.stories.tsx`)                    | **Criar**                                                                                                 |
| `components/home-footer.tsx` (+ `.stories.tsx`)                       | **Criar**                                                                                                 |
| `components/home-bento-layout.tsx`                                    | **Reestilizar** (section-headers + footer; mantido — não remover)                                         |
| `components/bio.tsx`                                                  | Reestilizar (status, nome, cargo ciano, empresa mantém `companyLinkColor`, meta rows)                     |
| `components/profile-social-strip.tsx`                                 | Reestilizar (botões-ícone, email mailto)                                                                  |
| `components/job-card.tsx` (+ `.stories.tsx`)                          | Reestilizar card + modal; tags de `current`/`tags[]`                                                      |
| `components/project-card.tsx` (+ `.stories.tsx`)                      | Reestilizar                                                                                               |
| `components/article-card.tsx` (já tem story)                          | Reestilizar                                                                                               |
| `keystatic.config.ts`                                                 | Campos novos: siteProfile (status/local/disciplinas), carreiras (`current`/`tags`), projects (`subtitle`) |
| `lib/site-content.ts`                                                 | `SiteProfileContent` + `getSiteProfile`; `getCarreiras` (novos campos)                                    |
| `mocks/projects.ts`                                                   | `subtitle?`                                                                                               |
| `mocks/carreira.ts`                                                   | `current: boolean`, `tags: string[]`                                                                      |
| `content/site/profile/*`, `content/carreiras/*`, `content/projects/*` | Valores iniciais dos campos novos                                                                         |

**Não tocar:** rotas votação/tools/tasks/blog; infra de tema; `ProfileVisitCard` (lógica do 3D).

---

## 8. Riscos & mitigações

| Risco                                                 | Mitigação                                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Avatar no Figma mostra estado de upload do CMS        | Na home real usa `avatarSrc` (imagem); estado de upload é só do Keystatic                                       |
| Campos novos do Keystatic ausentes em conteúdo antigo | Defaults seguros no reader (`current=false`, `tags=[]`, status/local/disciplinas opcionais) + `fallbackProfile` |
| Split-scroll + glow causar overflow/scroll duplo      | Testar nos breakpoints; glow é `pointer-events-none` atrás do conteúdo                                          |
| Stories quebrarem por novos campos obrigatórios       | Campos novos são opcionais/têm default; atualizar mocks das stories afetadas                                    |
| Reestilização do bento mudar a estrutura de scroll    | Manter as 3 `<section>` e props do `home-bento-layout.tsx`; só trocar `<h2>`→`<SectionHeader>` e cards          |

---

## 9. Verificação (regras do projeto)

1. `pnpm prettier:fix`
2. `pnpm lint` (em `apps/web/`)
3. `pnpm exec tsc --noEmit` (em `apps/web/`)
4. `pnpm --filter @piluvitu/web build`
5. **Storybook**: stories novas/atualizadas (section-header, job-card, project-card, article-card, bio) nos temas dark/light.
6. **E2E**: smoke da home (`app/(site)/home.e2e.ts` se existir/criar) — perfil, seções, abrir modal de carreira, links. Não depende de API.
7. **Visual**: subir dev e conferir vs Figma (perfil fixo + conteúdo rola, glow, headers, cards, modal).

Migração Keystatic: **informo o comando/passo**, não rodo (regra do projeto). Como é schema declarativo, o "passo" é revisar `keystatic.config.ts` e preencher o YAML — sem comando de DB.

---

## 10. Critérios de aceite

- [ ] Home no layout V2: perfil fixo à esquerda, conteúdo rola à direita, glow ciano no topo.
- [ ] Headers de seção com label mono + contador + régua (Carreira 0N / Projetos 0N / Artigos 0N).
- [ ] Cards de carreira/projeto/artigo no visual V2; "detalhes →" abre o modal estilo Image #1.
- [ ] Perfil mostra status, nome grande, cargo ciano "na {empresa}", bio, socials (email=mailto), meta (local + disciplinas) — campos novos editáveis no Keystatic.
- [ ] Visit-card 3D (triple-click) e theme toggle seguem funcionando.
- [ ] Footer com copyright + `piluvitu.com.br · /tools · /votação · admin`.
- [ ] `lint` + `tsc` + `build` + `jest` verdes; stories e E2E da home passam.
