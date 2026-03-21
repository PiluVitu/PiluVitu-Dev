# AGENTS.md — orientação para agentes e contribuidores

## Visão do projeto

Site pessoal / portfolio em **Next.js 16** (App Router), **React 19**, **TypeScript** estrito e **Tailwind CSS 4**. UI com **Radix UI** e padrão **shadcn/ui** (`components/ui/`). Dados estáticos de exemplo em `mocks/`. **Storybook 10** para documentação e desenvolvimento isolado de componentes.

Pastas relevantes:

| Área | Caminho |
|------|---------|
| Rotas e layout | `app/` |
| Componentes de página e UI | `components/` |
| Utilitários | `lib/` |
| Hooks | `hooks/` |
| Dados mock | `mocks/` |
| Stories | `stories/` |
| Config Storybook | `.storybook/` |

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

| Objetivo | Comando |
|----------|---------|
| Servidor de desenvolvimento | `pnpm dev` → [http://localhost:3000](http://localhost:3000) |
| Build de produção | `pnpm build` |
| Servidor após build | `pnpm start` |
| Storybook | `pnpm storybook` → porta **6006** |
| Build estático do Storybook | `pnpm build-storybook` (saída em `storybook-static/`) |

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

- Preferir componentes existentes em `components/ui/` e padrões já usados nas páginas (`app/page.tsx` e secções).
- Conteúdo estático repetível: mocks em `mocks/`; alinhar tipos com os consumidos pelos cards/secções.
- Imagens remotas: padrões permitidos em `next.config.mjs` (`media.dev.to`, `media2.dev.to`); novos hosts exigem atualizar `images.remotePatterns`.
- Grandes mudanças de estrutura de pastas ou de contratos de props: alinhar com o restante do site e com Storybook quando aplicável.

## Segurança

- **Não commitar** ficheiros `.env` nem segredos. O `.gitignore` ignora `.env*.local`.
- Variável pública usada no código: `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (ex.: `components/email-card.tsx`). Definir em ambiente local/produção sem expor chaves privadas no repositório.

## Commits e pull requests

Não há `.github/workflows` nem outro ficheiro de CI versionado neste repo; a verificação local recomendada é **Prettier → ESLint → `pnpm build`**.

- Títulos e descrições em frases claras; referenciar o problema ou objetivo.
- Incluir alterações de Storybook só quando fizer sentido para o que mudou.
- Se a equipa exigir divulgação de uso de IA em PRs, seguir a política interna.
