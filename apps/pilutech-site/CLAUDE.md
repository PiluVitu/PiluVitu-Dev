# CLAUDE.md — `apps/pilutech-site` (`@pilutech/site`)

Landing da PiluTech em `https://pilutech.com.br`: uma página (`/`) com os serviços, o processo, os produtos próprios, as tecnologias, os planos de manutenção, as dúvidas e o contato. Next 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4 e `@piluvitu/ui`. O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz.

- **Spec:** `docs/superpowers/specs/2026-10-02-pilutech-site-design.md`. **Plano:** `docs/superpowers/plans/2026-10-02-pilutech-site.md`. **Design (fonte visual):** `docs/superpowers/design/2026-10-02-pilutech-landing/` (`PiluTech Landing Page.dc.html`, `PiluTechMark.dc.html`, `marca-CLAUDE.md`, `desktop.png`, `mobile.png`).
- **Molde:** o `apps/botai-site` (mesma estrutura, gate, conferência de rotas, testes e deploy).
- **Marca (`marca-CLAUDE.md`):** texto factual, sem slogan e sem emoji; nunca anunciar manutenção de computadores e impressoras (a única menção é a dúvida que responde "Não."; `lib/conteudo.test.ts` trava). Logo único: o símbolo de blocos, variante `1a`.

## Estrutura

```
app/          layout (fontes, metadataBase, viewport), page (/), icon.tsx, apple-icon.tsx, opengraph-image.tsx,
              twitter-image.tsx, sitemap.ts, robots.ts, manifest.ts, globals.css e os E2E (pagina, seo)
components/   landing e as seções (barra, hero + terminal, serviços, como funciona, projetos, tecnologias, planos,
              dúvidas + acordeão, contato, rodapé, WhatsApp flutuante), cabeçalho de seção, PiluTechMark, json-ld, classes.ts
lib/          conteúdo do design, contato (WhatsApp, mailto), CMS (fase do Botaí), marca, site, seo, json-ld,
              imagens geradas (ícone, OG), font-awesome, tokens-do-ds (só os testes importam)
scripts/      conferir-rotas-estaticas.mjs (roda no build)
```

## A página

- **Textos:** os do design, letra por letra, em `lib/conteudo.ts` (listas) e nos componentes (frases únicas). Mudou o design? Mude o texto e o teste que o fixa. Exceção: o foco em infraestrutura e IA, decidido pelo dono em 2026-10-04 e fora do design: o h1, o parágrafo e o terminal do hero, o cartão de IA, o título, a descrição e a imagem OG (que repete o h1).
- **Serviços:** quatro cartões, nesta ordem: Infraestrutura, Inteligência artificial, Aplicativos e Fullstack (o terminal do hero segue a mesma ordem). O número do rótulo (`NN · área`) sai do índice, e a contagem da seção, de `SERVICOS.length`. A grade usa `minmax(min(100%,420px),1fr)`, como a dos Projetos: nos 1180 px cabem só duas colunas (2×2, 580 px cada) e, abaixo de uns 956 px de janela, uma. Com o mínimo de 300 px eram três colunas, e o quarto cartão ficava sozinho na segunda linha. O E2E mede as caixas a 1280 e a 390 px.
- **Cores por contexto:** seção escura leva a classe `dark` e usa os tokens (`bg-background`, `text-foreground`, `text-primary`, `text-muted-foreground`, `bg-card`, `border-border`, `text-ok`), que no `.dark` do `@piluvitu/ui` são a Noite, o texto claro, o Ciano, o Aço, o Grafite, a borda escura e o verde do design. Seção clara não leva classe e cai no `:root` (Névoa, Petróleo, cartão branco). Os Planos usam `bg-primary` no contexto claro (o Petróleo).
  - ⚠️ **Só funciona por causa do `@theme inline` do `app/globals.css`.** O `@theme` do `@piluvitu/ui` não é `inline`: o Tailwind emite `--color-background: hsl(var(--background))` no `:root`, o `var()` é resolvido ali, e os filhos herdam a cor já resolvida (a clara). Sem o bloco, a seção com `dark` troca o `--background` e continua Névoa, sem erro nenhum; teste de classe e axe não pegam (medido com o Tailwind 4.3.3 e o Chromium do Playwright: `rgb(247, 249, 252)` numa `section.dark.bg-background`). O bloco repete as 32 cores do design system que dependem de variável; o `app/globals.test.ts` reprova a que faltar (cor nova no `@piluvitu/ui` entra aqui), e os E2E leem a cor computada de cada seção.
  - ⚠️ O `<html>` não leva `dark`: se levasse, as seções claras herdariam os tokens escuros sem erro nenhum. No Storybook, pelo mesmo motivo, a story de seção clara usa `globals: { fundo: 'claro' }`.
  - Cores sem token ficam no `@theme` do `globals.css` (`noite`, `grafite`, `ciano`, `ciano-claro`, `petroleo-cartao`, `petroleo-borda`, `petroleo-linha`); o `app/globals.test.ts` confere as três que repetem o `.dark`.
- **Foco visível:** o `Button` do design system desenha um anel de 1 px na cor do `ring`, que no escuro é o Ciano do próprio botão. Os botões da landing levam o `ANEL_DE_FOCO` (`components/classes.ts`: anel de 2 px com folga do fundo), e os "Pedir proposta" dos Planos, anel branco com folga Petróleo. Os testes de componente travam as classes, e o E2E dá Tab até o "Falar no WhatsApp" do hero e lê o `boxShadow`.
- **Barra:** `sticky`, escura, com o lockup e o WhatsApp. Os links das seções são `hidden min-[900px]:flex`: somem abaixo de 900 px por CSS (o E2E confere com o JavaScript desligado) e, a 900 px, cabem sem rolagem. `scroll-padding-top: 72px` no `html` para a âncora não ficar sob a barra; rolagem suave só com `prefers-reduced-motion: no-preference`.
- **WhatsApp:** `lib/contato.ts` monta `https://wa.me/5586981737625?text=…` com as mensagens do design: a geral (barra, hero, contato e botão flutuante) e uma por plano. Todo link externo abre em aba nova com `rel="noopener noreferrer"` (`ABRE_EM_ABA_NOVA`). O botão flutuante tem `aria-label`; o "Pedir proposta" de cada plano diz o plano só para o leitor de tela (`sr-only`).
- **E-mail:** `mailto:pilutechinformatica@gmail.com?subject=%5BPiluTech%5D%20Contato%20pelo%20site`, por `mailtoDaPilutech` de `@piluvitu/tools/contato` (ver "Módulo `contato`" em `packages/tools/CLAUDE.md`). O botão do e-mail quebra o endereço (`wrap-anywhere`, `max-w-full`): a 320 px ele não cabe numa linha.
- **Projetos:** as imagens são as OG de `https://botai.pilutech.com.br/opengraph-image` e `https://sombrai.pilutech.com.br/opengraph-image.png`, pelo `next/image` com `remotePatterns` exatos (`search: ''`, sem o hash que o design trazia; o `next.config.test.ts` usa o `hasRemoteMatch` do Next). Imagem fora do ar não derruba o cartão: fundo Grafite, `alt`, link e selo continuam.
- **Selo do Botaí:** `lib/cms.ts` lê `apps/web/content/pilulabs/botai/index.yaml` no build, por `urlsDasLojas` e `fase` de `@piluvitu/tools/pilulabs`; uma loja publicada pelo `/admin/pilulabs` vira "disponível". Arquivo ausente quebra o build de propósito: em silêncio, o selo diria "em breve" com a loja no ar. `BOTAI_CMS_ITEM` troca o arquivo lido (só o `playwright.lojas.config.ts` a define). O Sombraí não tem fonte de fase e fica "em breve" até alguém mudar o texto.
- **Dúvidas:** acordeão da WAI-ARIA (`button` dentro de `h3`, `aria-expanded`, `aria-controls`), a primeira aberta, uma por vez. As cinco respostas saem no HTML e as fechadas levam `hidden`: o Google não clica, e sem JavaScript a página continua legível. Ids fixos (`duvida-<n>-pergunta` e `-resposta`).
- **Rodapé:** o ano é o do build (`new Date().getFullYear()` na página estática).
- **Fonte mono sem o fallback automático do `next/font`** (`adjustFontFallback: false`, `fallback: ['ui-monospace', 'monospace']` no `app/layout.tsx`). O `→` dos serviços e dos projetos (U+2192) fica fora do subset `latin` da JetBrains Mono; o fallback automático é o Arial com `size-adjust` de 134,59%, que desenhava a seta com 1,35em, mais que o dobro da do design (que cai na mono do sistema, ~0,6em). O E2E "as setas … têm a largura de uma célula mono" mede.
- ⚠️ **CSS do Font Awesome na camada `base`** (`@import … layer(base)`) e `config.autoAddCss = false` (`lib/font-awesome.ts`, importado pelo layout e pelo Storybook), como no `apps/botai-site`: injetado em runtime, fora de camada, ele venceria o `size-*` dos ícones.

## Marca e imagens geradas

- `lib/marca.ts` guarda o símbolo como dados (`BLOCOS_DA_MARCA`: 5 blocos de 14 no quadro de 48, o de cima à direita em destaque) e as cores em hex para as imagens (`CORES_DA_MARCA`, conferidas contra o `.dark` do `@piluvitu/ui`).
- `SvgDaMarca` (em `components/pilutech-mark.tsx`) desenha com os tokens do contexto (`fill-foreground`/`fill-primary`: as versões escura e clara da marca) ou com `cores` em hex, para o Satori, que não tem CSS. `PiluTechMark` junta o lockup "PiluTech" em Jakarta 800, tracking −0.035em, a 60% do símbolo, com espaço de 28%, como o design.
- `app/icon.tsx` (192 px, múltiplo de 48 como o Google pede, cantos arredondados) e `app/apple-icon.tsx` (180 px) saem de `lib/imagem-do-icone.tsx`. O `/icon` também é o `logo` da `Organization`.
- A imagem OG (`lib/imagem-og.tsx`, 1200×630) usa a Plus Jakarta Sans de `@fontsource/plus-jakarta-sans`, o pacote estático com `.woff`: o `ImageResponse` só lê `ttf`/`otf`/`woff`, e o `@fontsource-variable` do Botaí só tem `woff2`.

## SEO

- **URLs:** `metadataBase` = `urlDoSite()`: `https://pilutech.com.br`, ou `SITE_URL` (só a origem; valor sem esquema é ignorado). Preview e local sem `SITE_URL` apontam canonical, `og:url`, JSON-LD, sitemap e robots para a produção; o preview da Vercel já responde com `X-Robots-Tag: noindex`.
- **Textos (`lib/seo.ts`):** título `PiluTech · Infraestrutura, IA e desenvolvimento de software` (59 caracteres; a spec pede até 60) e descrição de 158 caracteres com o que a PiluTech faz, na ordem dos serviços, e onde. O texto pedido pelo dono tinha 167; saiu o "em nuvem" depois de "Infraestrutura" para caber nos 140–160. Os limites ficam no teste.
- **Open Graph e Twitter:** `metadataDaPagina` repete `type`, `locale`, `siteName`, `url`, `title` e `description` (o Next substitui o `openGraph` inteiro) e não declara imagem: ela vem de `opengraph-image.tsx`/`twitter-image.tsx`.
- **JSON-LD (`lib/json-ld.ts`):**
  - a PiluTech num nó só, `@type` `['Organization', 'ProfessionalService']`, com `@id` `https://pilutech.com.br/#organizacao` (o mesmo do `apps/botai-site` e do `publisher` da vitrine do `apps/web`): logo (`/icon`), e-mail, telefone, `contactPoint` comercial, Brasil como `areaServed`, endereço só com Teresina, PI e BR, os 4 serviços em `hasOfferCatalog` (na ordem da página, com o nome completo e o texto de cada cartão), sem preço. Dois nós ligados por `parentOrganization` diriam que a empresa é filha de si mesma; o Google pede o subtipo mais específico de `Organization`, e o schema.org marca o `ProfessionalService` genérico como descontinuado (trocar por `LocalBusiness` é decisão do dono);
  - `WebSite`;
  - sem `FAQPage` (o Google não mostra mais o rich result de FAQ, removido em maio de 2026) e sem nota. `serializarJsonLd` troca `<` por `\u003c`.
- **Rotas técnicas:** `sitemap.xml` (só `/`), `robots.txt` (libera tudo e aponta o sitemap), `manifest.webmanifest`, `theme-color` Noite (`#090b11`, o `--background` do `.dark`). `GOOGLE_SITE_VERIFICATION` vira `verification.google`; cadastrar o domínio no Search Console é passo do dono.
- **Lighthouse:** não há ferramenta no repo nem no PATH. As checagens estão no `app/seo.e2e.ts` (título, descrição, canonical, OG 1200×630, JSON-LD, `h1` único, níveis, `alt`, robots, sitemap, ícones, manifest, `theme-color` e `axe-core` WCAG 2.1 A/AA a 1280 e 320 px) e no `app/pagina.e2e.ts` (320 px sem vazamento).

## Build

- `pnpm build` = `next build` + o gate do `@source` (`scripts/check-tailwind-source.mjs .next`; a classe que ele procura está em `SENTINEL_SELECTOR`, no topo do script) + `scripts/conferir-rotas-estaticas.mjs`, que falha se uma rota de `ROTAS` (`/`, `/icon`, `/apple-icon`, `/opengraph-image`, `/twitter-image`, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`) sumir do `prerender-manifest.json` ou ganhar `revalidate`. Rota nova entra em `ROTAS`.
- `@source not '../*.md'`, e o `storybook-static/` no `.gitignore` da raiz, pelo mesmo motivo do `apps/botai-site`: sem eles, o Tailwind varreria a documentação e CSS já compilado, e o gate aprovaria `@source` quebrado.

## Testes

| Camada                                       | Ferramenta                                   | Onde                                           |
| -------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| Lógica (conteúdo, contato, CMS, marca, SEO…) | Jest + ts-jest (jsdom)                       | `*.test.ts` ao lado; `make test-pilutech-site` |
| Componentes                                  | Jest + Testing Library + user-event          | `*.test.tsx` ao lado                           |
| Estados visuais                              | Storybook `@storybook/nextjs`, porta 6020    | `*.stories.tsx` ao lado (global `fundo`)       |
| Script do build                              | `node --test`                                | `scripts/*.test.mjs`                           |
| Página, SEO, teclado, sem JS, 320 px, axe    | Playwright no build de produção (porta 3021) | `app/*.e2e.ts`; `make test-e2e-pilutech-site`  |

- O E2E builda e sobe `next start`; rode com `CI=1` e a 3021 livre. Ele não roda no CI (como o do `apps/botai-site`).
- **Duas passadas no `test:e2e`**, como no `apps/botai-site`: primeiro o `playwright.lojas.config.ts`, que builda com `BOTAI_CMS_ITEM=app/lojas-publicadas.yaml` (Firefox publicado, Chrome com link de outra loja, Edge em `http:`) e roda `app/lojas-publicadas.e2e.ts` (o selo do Botaí "disponível", o do Sombraí "em breve"); depois o `playwright.config.ts`, que builda com o CMS real e roda o resto. O CMS real tem hoje as 4 lojas vazias, e só a primeira passada exercita o caminho "loja publicada" no build de produção. A ordem deixa o `.next` com o CMS real.
- Os E2E de cor (`getComputedStyle` de cada seção) e de foco (`boxShadow` depois do Tab) comparam com `rgbDoToken` (`lib/tokens-do-ds.ts`), que lê o `styles.css` do `@piluvitu/ui`: mudou a cor no design system, o esperado muda junto.
- O teste de vazamento a 320 px confere cada elemento contra a área de conteúdo da própria seção: um vazamento no gutter não aumenta o `scrollWidth` da página. Se ele acusar, a correção é no componente.
- ⚠️ O `next dev`/`next build` pode anexar a este arquivo um bloco de regras para agentes ou criar um `AGENTS.md`: confira `git status` antes de commitar.

## Deploy (Vercel, projeto próprio)

1. Projeto `pilutech-site` ligado ao repo (`vercel project add pilutech-site` e `vercel link` na raiz do checkout, ou o painel): **Root Directory `apps/pilutech-site`**, framework Next.js, install e build padrão (`pnpm install` na raiz, `pnpm build`), Node 22.x, "Include files outside the root directory in the Build Step" ligado (o build lê `packages/*` e o YAML do Botaí no `apps/web`). Pela CLI, o que o `vercel project update` não cobre vai por `vercel api /v9/projects/pilutech-site -X PATCH` com `rootDirectory`, `nodeVersion` (`22.x`), `sourceFilesOutsideRootDirectory: true` e `enableAffectedProjectsDeployments: false`; confira os nomes dos campos no `vercel api list` antes.
2. ⚠️ **"Skip deployments" (Root Directory) desligado:** a Vercel pula projeto de monorepo cujo código e dependências não mudaram, e o YAML do Botaí mora no `apps/web`, que não é dependência deste pacote: publicar uma loja pelo `/admin/pilulabs` não rebuildaria a landing. Quem filtra é o `ignoreCommand` do `vercel.json` (roda na Root Directory; `exit 0` cancela).
3. Env: nenhuma obrigatória. `GOOGLE_SITE_VERIFICATION` em Production quando o dono cadastrar o domínio no Search Console. Não ponha `SITE_URL` nem `BOTAI_CMS_ITEM` em ambiente nenhum.
4. **Primeira produção, antes do merge:** a produção do projeto sai da `main`, e a `main` só tem o app depois do merge. Depois do push do branch, ache o preview (`vercel ls pilutech-site`); se saiu `CANCELED` (o `ignoreCommand` compara `HEAD^` com `HEAD`) ou não existe, gere um com `vercel deploy` na raiz do checkout do branch. Promova: `vercel promote <url-do-preview> --yes`.
5. ⚠️ **Antes de mover os domínios, desligue a chave antiga no `pilu-vitu-dev`.** Em 2026-10-02, `PILUTECH_SUBDOMINIOS=1` estava na Production dele, e `piluvitu.com.br/pilulabs` respondia 308 para `https://pilutech.com.br/`. Com o apex já neste projeto, esse 308 levaria à landing, e a vitrine ficaria inacessível (o "Saiba mais" e o rodapé da home e o "← PiluLabs" do Botaí também) até o deploy da `main`. Apague a variável da Production (o `id` sai de `vercel api /v9/projects/pilu-vitu-dev/env`; depois `vercel api /v9/projects/pilu-vitu-dev/env/<id> -X DELETE`, ou o painel) e redeploye a produção atual (painel → Deployments → Redeploy, ou `vercel redeploy <url-da-produção-atual>`): a variável só vale no build. O código antigo, com a chave desligada, responde 200 em `/pilulabs`, linka `/pilulabs` e continua mostrando a vitrine no apex enquanto o domínio estiver lá. Só siga com `curl -sI https://piluvitu.com.br/pilulabs` respondendo 200, sem `location`.
6. **Domínios, na hora do merge:** `pilutech.com.br` e `www.pilutech.com.br` saem do projeto `pilu-vitu-dev` (o do `apps/web`) e entram no `pilutech-site`, o `www` com 308 para o apex. Um domínio só fica num projeto: `vercel domains inspect pilutech.com.br` diz onde está. Use o `POST /v1/projects/pilu-vitu-dev/domains/<domínio>/move` (`vercel api`), que leva o domínio direto para o `pilutech-site`, sem intervalo fora de projeto; confira antes o corpo (o projeto de destino e, no `www`, o redirect 308 para o apex) na doc do endpoint ou no `vercel api list`. Sem ele: tire os dois do projeto antigo (`vercel api /v9/projects/pilu-vitu-dev/domains/www.pilutech.com.br -X DELETE`, depois o apex) e ponha no novo (`vercel domains add pilutech.com.br pilutech-site`; o `www` por `vercel api /v10/projects/pilutech-site/domains -X POST` com `name=www.pilutech.com.br`, `redirect=pilutech.com.br` e `redirectStatusCode=308`). O DNS não muda: o dono já apontou o apex e o `www` para a Vercel.
7. Confira: `curl -sI https://<preview>.vercel.app | grep -i x-robots-tag` mostra `noindex`; `curl -sI https://pilutech.com.br` responde 200, sem `x-robots-tag: noindex`; `curl -sI https://www.pilutech.com.br` responde 308 para o apex; o `<link rel="canonical">` aponta para `https://pilutech.com.br`; `https://pilutech.com.br/sitemap.xml` lista `/`; `curl -sI https://piluvitu.com.br/pilulabs` continua 200.
8. **Merge depois de mover os domínios.** O mesmo merge leva a vitrine de volta para `piluvitu.com.br/pilulabs` (o `apps/web` deixa de servir `pilutech.com.br`) e o "← PiluLabs" do Botaí para lá. Depois do deploy da `main`, `curl -sI https://piluvitu.com.br/pilulabs` responde 200, sem `location`. Se a variável `PILUTECH_SUBDOMINIOS` voltar ao `pilu-vitu-dev` por engano, ela não muda mais nada.

## Comandos

| Comando                                  | O quê                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `make dev-pilutech-site`                 | `next dev` em http://localhost:3021                                                                                      |
| `make build-pilutech-site`               | `next build` + gate do `@source` + conferência das rotas estáticas                                                       |
| `make test-pilutech-site`                | Jest + `node --test`                                                                                                     |
| `make test-e2e-pilutech-site`            | as duas passadas (loja publicada, depois o CMS real): build de produção + `next start` na 3021 + Playwright (com `CI=1`) |
| `make storybook-pilutech-site`           | Storybook em http://localhost:6020                                                                                       |
| `pnpm --filter @pilutech/site typecheck` | `tsc --noEmit`                                                                                                           |
| `pnpm --filter @pilutech/site lint`      | ESLint                                                                                                                   |
