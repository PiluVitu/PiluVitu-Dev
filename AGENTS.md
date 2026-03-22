# AGENTS.md — orientação para agentes e contribuidores

## Visão do projeto

Site pessoal / portfolio em **Next.js 16** (App Router), **React 19**, **TypeScript** estrito e **Tailwind CSS 4**. UI com **Radix UI** e padrão **shadcn/ui** (`components/ui/`). Ícones vectoriais com [**Font Awesome**](https://docs.fontawesome.com/web/use-with/react/) (`@fortawesome/react-fontawesome`, pacotes `free-brands-svg-icons` e `free-solid-svg-icons`). Dados estáticos de exemplo em `mocks/`. **Storybook 10** para documentação e desenvolvimento isolado de componentes.

Pastas relevantes:

| Área                       | Caminho       |
| -------------------------- | ------------- |
| Rotas e layout             | `app/`        |
| Componentes de página e UI | `components/` |
| Utilitários                | `lib/`        |
| Hooks                      | `hooks/`      |
| Dados mock                 | `mocks/`      |
| Stories                    | `stories/`    |
| Config Storybook           | `.storybook/` |
| Conteúdo Keystatic (site) | `content/site/` (perfil, cartão de visita) |
| Conteúdo Keystatic (coleções) | `content/socials/`, `content/carreiras/`, `content/projects/` |

Alias de importação: `@/*` → raiz do repositório (ver `tsconfig.json`).

## Ambiente de desenvolvimento

- **Gestor de pacotes**: [pnpm](https://pnpm.io/) (há `pnpm-lock.yaml` e `pnpm-workspace.yaml`; este último serve sobretudo para `allowBuilds`, não há workspace multi-pacote).
- **Node.js**: alinhar com a versão LTS suportada pelo Next.js 16 (confirmar localmente com `node -v`).

Instalação a partir da **raiz do repositório**:

```bash
pnpm install
```

## Build e execução

Todos os comandos abaixo correm na **raiz** (`piluvitu-dev/`).

| Objetivo                    | Comando                                                     |
| --------------------------- | ----------------------------------------------------------- |
| Servidor de desenvolvimento | `pnpm dev` → [http://localhost:3000](http://localhost:3000) |
| Build de produção           | `pnpm build`                                                |
| Servidor após build         | `pnpm start`                                                |
| Storybook                   | `pnpm storybook` → porta **6006**                           |
| Build estático do Storybook | `pnpm build-storybook` (saída em `storybook-static/`)       |

## Testes

Não existe script `test` no `package.json` (nem Jest/Vitest/Playwright configurados no manifesto). Para alterações em UI, usar **Storybook** como verificação manual. Se no futuro existir suite automatizada, **confirmar no CI** ou no `README` quando for adicionada.

## Lint, tipos e formatação

Ordem sugerida antes de commit/PR:

1. `pnpm prettier:check` — ou `pnpm prettier:fix` para corrigir (Prettier com `prettier-plugin-tailwindcss`; ver `.prettierrc`).
2. `pnpm lint` — ESLint flat config (`eslint.config.mjs`): Next (core-web-vitals + TypeScript), Storybook, TanStack Query, Prettier (desliga regras conflituosas).

Correção automática de ESLint:

```bash
pnpm style-fix
```

O hook **pre-commit** (Husky) executa `pnpm prettier:fix` (ver `.husky/pre-commit`).

**Tipos**: não há `tsc` dedicado nos scripts; o `next build` valida tipos. Opcionalmente: `pnpm exec tsc --noEmit` para checagem rápida sem build completo.

## Estilo e arquitetura

- Preferir componentes existentes em `components/ui/` e padrões já usados nas páginas (`app/(site)/` e secções).
- Conteúdo estático repetível: mocks em `mocks/`; alinhar tipos com os consumidos pelos cards/secções.
- Imagens remotas: padrões permitidos em `next.config.mjs` (`media.dev.to`, `media2.dev.to`); novos hosts exigem atualizar `images.remotePatterns`.
- Grandes mudanças de estrutura de pastas ou de contratos de props: alinhar com o restante do site e com Storybook quando aplicável.

### Font Awesome

- **Setup**: seguir a [documentação oficial para React](https://docs.fontawesome.com/web/use-with/react/); dependências já declaradas no `package.json`.
- **Ícones disponíveis no CMS** (cartão de visita e redes sociais): lista curada em `lib/visit-card-fontawesome.ts` (`VISIT_CARD_FA_ICON_MAP`, `VISIT_CARD_FA_SELECT_OPTIONS`). Novo ícone = import explícito no mapa + entrada nessa lista e no `keystatic.config.ts`.
- **Keystatic — ícone ao lado do nome**: o `fields.select` nativo só mostra texto; usamos `fontawesomeIconSelectField()` (`lib/keystatic-fontawesome-icon-select-field.tsx`, fábrica servidor) + input cliente `lib/keystatic-fa-icon-picker-input.tsx` (`Picker`/`Item` de `@keystar/ui`, alinhado ao UI do Keystatic). A fábrica **não** pode estar num ficheiro com `'use client'` no topo (o `keystatic.config` corre no servidor).
- **Cores**: em UI com tema claro/escuro, preferir `text-foreground` ou `text-muted-foreground` nos SVG (herdam `currentColor`), salvo casos específicos (ex. métricas de artigos com `text-success` quando o valor > 0).
- **Pré-visualização**: página **`/keystatic/icon-preview`** (layout com `app/globals.css`) para ver todos os ícones escolhíveis no Keystatic; o campo no editor aponta para esta rota.

### Cartão de visita (triplo clique na foto)

- **Conteúdo**: singleton Keystatic **«Cartão de visita»** → `content/site/visit-card/` (`index.yaml`). Até **8 células**; cada uma tem destino (URL manual, último artigo dev.to, ou formulário de email) e ícone (Font Awesome ou imagem em `/public`).
- **Código**: `getVisitCard()` / `VISIT_CARD_FALLBACK` em `lib/site-content.ts`; `getLatestDevToArticleUrl()` e `getDevToUsername()` em `lib/dev-to.ts` (fetch com `try/catch` para build sem rede).
- **UI**: `components/profile-visit-card.tsx` — triplo clique no avatar da bio abre o cartão em 3D (animado em `app/globals.css`).

### Redes sociais (strip da bio)

- Coleção Keystatic **Redes sociais** com `iconMode` (`fontawesome` \| `image`) e `fontawesomeIcon` (chave do mapa acima). Conteúdo em `content/socials/*/`.
- Fallback por slug antigo: `lib/social-default-fa.ts`. Tipos em `mocks/social.ts`; leitura em `getSocials()` em `lib/site-content.ts`.
- Componentes: `components/profile-social-strip.tsx`, `components/social-card.tsx`.

### Tema: cor `success`

- Variáveis `--success` / `--success-foreground` em `app/globals.css` (`:root` e `.dark`), expostas no `@theme` como `text-success` (e afins). Usada, por exemplo, em `components/article-card.tsx` para ícones (e números) de reações/comentários quando o contador > 0.

### Artigos (dev.to)

- Cliente: `hooks/useArticleData.ts` (TanStack Query); username da API: `NEXT_PUBLIC_DEVTO_USERNAME` (ver `.env.example`).
- Cartões: `components/article-card.tsx` (ícones Font Awesome para reações e comentários; estados visuais descritos acima).

## Segurança

- **Não commitar** ficheiros `.env` nem segredos. O `.gitignore` ignora `.env*.local`.
- Variáveis públicas usadas no código: `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (ex.: `components/email-card.tsx`); `NEXT_PUBLIC_DEVTO_USERNAME` e opcionalmente `NEXT_PUBLIC_VISIT_CARD_HANDLE` (cartão de visita / API dev.to). Definir em ambiente local/produção sem expor chaves privadas no repositório; ver `.env.example`.
- **Keystatic (modo GitHub)**: após configurar em `/keystatic`, replicar `KEYSTATIC_GITHUB_CLIENT_ID`, `KEYSTATIC_GITHUB_CLIENT_SECRET`, `KEYSTATIC_SECRET`, `NEXT_PUBLIC_KEYSTATIC_GITHUB_APP_SLUG` no ambiente local e na Vercel; ver `.env.example`. O repositório alvo é configurável com `KEYSTATIC_GITHUB_REPO` (`owner/name`; há default em `keystatic.config.ts`). Na GitHub App, registar callback OAuth para `http://localhost:3000/api/keystatic/github/oauth/callback` e para o domínio de produção.
- **Keystatic e deploy na Vercel**: cada **Save** no Keystatic faz **commit** no ramo que estiveres a usar no editor. Se esse ramo for **`main`**, o push dispara normalmente o **deploy de produção** na Vercel (como qualquer outro commit em `main`). Para iterar à vontade e usar só a **pré-visualização** (draft + ramo) sem publicar já, cria ou escolhe **outro ramo** no seletor do Keystatic (ex. `content/atualizacao-bio`), guarda aí, prevê no site com o link de preview; quando estiveres satisfeito, abre **PR para `main`** ou faz merge — aí sim o conteúdo passa a produção no próximo deploy.

## Commits e pull requests

Não há `.github/workflows` nem outro ficheiro de CI versionado neste repo; a verificação local recomendada é **Prettier → ESLint → `pnpm build`**.

- Títulos e descrições em frases claras; referenciar o problema ou objetivo.
- Incluir alterações de Storybook só quando fizer sentido para o que mudou.
- Se a equipa exigir divulgação de uso de IA em PRs, seguir a política interna.
