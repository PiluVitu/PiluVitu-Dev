# CLAUDE.md — `apps/botai-site` (`@pilutech/botai-site`)

Landing do Botaí em `https://botai.pilutech.com.br`: `/`, `/privacidade` e `/termos`. Next 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4 e `@piluvitu/ui`. O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz.

- **Spec:** `docs/superpowers/specs/2026-10-02-botai-landing-design.md`. **Plano:** `docs/superpowers/plans/2026-10-02-botai-landing.md`. **Design (fonte visual):** `docs/superpowers/design/2026-10-02-botai-landing/` (`Botai Landing.dc.html`, `desktop-escuro.png`, `mobile-escuro.png`).
- **Grafia:** "Botaí" em todo texto visível; `botai` no técnico (ver "Identidade" em `apps/botai/CLAUDE.md`).

## Estrutura

```
app/                  layout (fontes, tema, metadataBase), page (/), privacidade/, termos/, imagens OG e Twitter por rota,
                      icon.png, apple-icon.png, sitemap.ts, robots.ts, manifest.ts e os E2E
components/           landing e as peças (topo, rodapé, botões de loja, selo, atalho, tabela, abas, imagem por tema)
                      e a moldura documento das páginas de texto
lib/                  conteúdo, leitura do CMS, modelo da página, visitante, capturas, site, seo, json-ld, imagem OG
public/               icone-128.png e capturas/ (gerados por make capturas-botai)
scripts/              conferir-rotas-estaticas.mjs (roda no build)
```

## A página

- **Lojas e fase saem do CMS do `apps/web`:** `lib/cms.ts` lê `apps/web/content/pilulabs/botai/index.yaml` no build (o dono edita em `/admin/pilulabs`), só as 4 URLs, pelo `yaml`. Arquivo ausente quebra o build de propósito: em silêncio, a landing sairia "Em breve" com a loja já publicada.
- **Regras compartilhadas:** `@piluvitu/tools/pilulabs` (`lojasPublicadas`, `fase`, `ATALHOS`); o card da PiluLabs no `apps/web` decide igual.
- **Botões de loja:** loja publicada → link em aba nova; sem URL → `<button disabled>` "Em breve", sem link. URL de outro host ou sem `https:` conta como sem URL. O Edge é a exceção (`SO_COM_LINK` em `lib/modelo.ts`, decisão do dono em 2026-10-05): sem URL ele não aparece, porque quem usa Edge instala pela Chrome Web Store; com URL, o botão entra no lugar dele na ordem. O botão quebra o texto (`whitespace-normal`, `max-w-full`) em vez de vazar da lista: a 320 px, "Microsoft Edge Add-ons Em breve" numa linha passa da largura, e o `scrollWidth` da página não acusa porque o vazamento fica no gutter.
- **Nota das lojas:** cita só as publicadas; antes de todas, "Chegando às lojas…". Nenhum texto diz "disponível" antes das lojas.
- **Tema:** `next-themes` (`attribute="class"`, `defaultTheme="system"`), o botão lembra a escolha no `localStorage`; o script do `next-themes` põe `.dark` antes da hidratação, e ícones e capturas trocam por CSS (`dark:`), sem piscar.
- **Capturas por tema:** `ImagemPorTema` põe as duas variantes, lazy, e esconde uma pela classe `.dark`; imagem lazy com `display: none` não é baixada. A do topo (LCP) leva `fetchPriority="high"`, nunca `loading="eager"`/`preload`, que baixariam as duas (ver "Theme detection" na doc do `next/image`).
- **Atalho de quem visita:** `useSyncExternalStore` com o atalho do Windows no servidor; depois da hidratação, `⌥⇧P` no Mac, `Alt+Shift+P` no Firefox para Linux e `Ctrl+Shift+Y` no resto (Android e ChromeOS inclusos).
- **Abas das capturas:** tabs WAI-ARIA com ativação automática, setas (dando a volta), Home e End, foco itinerante; o painel é focável. Os 3 painéis saem no HTML e os inativos levam `hidden`: o Google não interage com a página (Search Central, "Fix lazy-loaded content"), e o texto das cenas 02 e 03 só é indexado se estiver no DOM. As imagens dos painéis escondidos são lazy com `display: none` e não são baixadas.
- **Tabela de atalhos:** a 320 px ela rola dentro da moldura, que é uma região focável (`role="region"`, `tabIndex={0}`, nome da legenda): sem isso, quem usa teclado não rola, e o axe acusa `scrollable-region-focusable`.
- **Um `h1` só:** a proposta, com "Botaí: " só para leitor de tela; o nome grande do design é um `<p>` na linha do selo.
- ⚠️ **CSS do Font Awesome na camada `base`** (`@import … layer(base)` no `globals.css`) e `config.autoAddCss = false` (`lib/font-awesome.ts`, importado pelo `TemaProvider`): o CSS injetado em runtime fica fora de camada e vence as utilities, e o `hidden`/`size-*` dos ícones param de funcionar sem erro nenhum. O E2E do tema pega.
- **E-mail e links da PiluTech:** todo `mailto:` vai para `pilutechinformatica@gmail.com` com `[Botaí]` no assunto (`MAILTO` em `lib/conteudo.ts`, por `mailtoDaPilutech` de `@piluvitu/tools/contato`): `[Botaí] Suporte` no rodapé, `[Botaí] Privacidade` na política, `[Botaí] Termos de uso` nos termos. O texto visível continua o endereço puro, e o `apps/botai/loja/textos.md` também. O "← PiluLabs" do topo leva a `https://piluvitu.com.br/pilulabs` (`URL_DA_PILULABS`, a vitrine no `apps/web`); o "Powered by PiluTech" e a `Organization` do JSON-LD seguem em `https://pilutech.com.br` (`URL_DA_PILUTECH`), a landing da empresa no `apps/pilutech-site`.

## `/privacidade` e `/termos`

- Os dois textos moram no `page.tsx` de cada rota, fonte única (o da AMO se copia da política). A moldura é o `Documento` (`components/documento.tsx`): topo, rótulo, `h1`, "Em vigor desde" e resumo, corpo `prose`, rodapé. A data é texto pronto (formatar em BRT daria o dia anterior) e é a data em que o texto passa a valer.
- Decisões do dono (2026-10-02): responsável só "PiluTech" + `pilutechinformatica@gmail.com`, sem razão social nem CNPJ; foro de Teresina/PI, ressalvado o domicílio do consumidor quando o CDC se aplicar. Plano: `docs/superpowers/plans/2026-10-02-botai-termos.md` (inclui os riscos jurídicos deixados ao dono).
- Texto honesto: nenhuma das duas diz "disponível" nem "publicado nas lojas" (teste das páginas).
- A política amarra o código: a tabela de permissões é a lista de "Justificativa:" de `apps/botai/loja/textos.md`, a linha do `contextMenus` cita cada item de `apps/botai/src/lib/menus.ts`, e "no Firefox o pacote declara que não coleta" lê o `apps/botai/wxt.config.ts` (`page.test.tsx`); o E2E confere que o site não pede nada a outro host, não grava cookie e só guarda `theme` no `localStorage`. Do lado da extensão, `apps/botai/loja/textos.test.ts` trava "sem rede", "uma chave de storage" e a justificativa do `contextMenus` com os mesmos itens do menu. Mudou um deles? Mude a política no mesmo PR.
- O script injetado fica na página até ela recarregar (registro dos campos e último resultado em `api.ts`, segunda passada): a política diz "na memória da página", nunca "só durante a ação".
- Os termos amarram a pessoa: `app/termos/page.test.tsx` lê os `gerar*(rng…)` de `packages/tools/src/pessoa.ts` e exige que cada gerador esteja classificado em `PODE_SER_DE_ALGUEM`; os dados que podem ser de alguém (CPF, CNPJ, RG, PIS/NIS, título de eleitor, celular e o endereço, cujo número cai na numeração real do CEP) precisam aparecer em "Dados que podem ser de alguém" e no "Limite de responsabilidade". Gerador novo na pessoa? Classifique-o e ajuste os dois textos (e "Dados fictícios e pessoas reais" da política).
- Os termos dizem que, sobre os direitos no código, vale a MIT (`apps/botai/LICENSE`, conferido em `lib/conteudo.test.ts`); as proibições tratam de condutas.
- Rodapé: `nav` "Documentos" com "Privacidade" e "Termos de uso" (`DOCUMENTOS`, em `lib/conteudo.ts`), nas três rotas; a seção "Cuidados" da landing leva aos termos.
- O link de histórico aponta para o `page.tsx` de cada rota; as versões da política de antes de 2026-10-02 estão no histórico de `apps/web/app/(site)/pilulabs/botai/privacidade/page.tsx`.

## SEO

- **URLs:** `metadataBase` = `urlDoSite()`: `https://botai.pilutech.com.br`, ou `SITE_URL` (só a origem; valor sem esquema é ignorado). Preview e local sem `SITE_URL` apontam canonical, `og:url`, JSON-LD, sitemap e robots para a produção, e o preview da Vercel já responde com `X-Robots-Tag: noindex`.
- **Textos (`lib/seo.ts`):** título da home com até 60 caracteres e descrição de 140–160, com os termos buscados; a política e os termos com os deles. O Google não tem limite e trunca pela largura do dispositivo (Search Central, "title link" e "snippet"); os limites são da spec e ficam no teste.
- **Open Graph e Twitter:** `metadataDaPagina` repete `type`, `locale`, `siteName`, `url`, `title` e `description` (o Next substitui o `openGraph` inteiro) e não declara imagem: cada rota tem `opengraph-image.tsx` e `twitter-image.tsx` estáticos (1200×630, `lib/imagem-og.tsx`, lendo `app/icon.png`).
- **JSON-LD (`lib/json-ld.ts`):** em `/`, `Organization` (PiluTech), `WebSite` e `SoftwareApplication` (`BrowserApplication`, preço 0 em BRL, `installUrl` só das lojas publicadas, capturas, PiluTech como `publisher` e `author`); em `/privacidade` e `/termos`, `BreadcrumbList` (`jsonLdDaTrilha`). `serializarJsonLd` troca `<` por `\u003c`.
  - Sem `aggregateRating`/`review` (o Google proíbe copiar a nota das lojas), sem `FAQPage` e sem `HowTo`.
  - ⚠️ O rich result de app exige nota ou review (Search Central, "Software app", 2026-09-08): o markup ajuda o Google a entender a página, mas não gera estrela nem preço no resultado. Não prometa isso.
  - A `Organization` leva o `logo` `https://pilutech.com.br/icon` (`LOGO_DA_PILUTECH`): o símbolo da PiluTech, 192 px, gerado pelo `apps/pilutech-site`, que tem a rota no `ROTAS` (o build dele quebra se ela sumir). O ícone do Botaí não é o logo da empresa.
- **Sitemap e robots:** `/`, `/privacidade` e `/termos`; robots libera tudo e aponta o sitemap.
- **Ícones:** `app/icon.png` e `app/apple-icon.png` (300×300, cópias do `edge-logo-300.png` das lojas, geradas por `make capturas-botai`; o Google aceita PNG, não SVG), `/favicon.ico` (`app/favicon.ico/route.ts`, estático: `faviconDoBotai` de `lib/favicon.ts` empacota com `icoDePngs` os PNGs de 16, 32 e 48 px da própria extensão, `apps/botai/public/icon/`, lidos no build; não é cópia versionada, e pasta sem os ícones quebra o build), `app/manifest.ts` e `theme-color` claro e escuro (o `--background` dos dois temas do `@piluvitu/ui`, conferido no teste).
- **Search Console:** `GOOGLE_SITE_VERIFICATION` vira `metadata.verification.google`. Cadastrar o domínio é passo do dono.
- **Lighthouse:** não há ferramenta no repo nem no PATH; as checagens estão no `app/seo.e2e.ts` (título, descrição, canonical, OG com a imagem 1200×630, JSON-LD, `h1` único, níveis de título, `alt`, robots, sitemap, ícones, manifest e `axe-core` WCAG 2.1 A/AA nos dois temas) e a 320 px nos E2E das rotas.

## Build

- `pnpm build` = `next build` + o gate do `@source` (`scripts/check-tailwind-source.mjs .next`; a classe que ele procura está em `SENTINEL_SELECTOR`, no topo do script) + `scripts/conferir-rotas-estaticas.mjs`, que falha se uma rota de `ROTAS` sumir do `prerender-manifest.json` ou ganhar `revalidate`. Rota nova entra em `ROTAS`.
- `@source not '../*.md'`: a documentação do app não muda o CSS. O `storybook-static/` está no `.gitignore` da raiz pelo mesmo motivo (sem ele, o Tailwind varreria CSS já compilado e o gate aprovaria `@source` quebrado).

## Testes

| Camada                                  | Ferramenta                                   | Onde                                          |
| --------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| Lógica (CMS, modelo, visitante, SEO…)   | Jest + ts-jest (jsdom)                       | `*.test.ts` ao lado; `make test-botai-site`   |
| Componentes                             | Jest + Testing Library + user-event          | `*.test.tsx` ao lado                          |
| Estados visuais                         | Storybook `@storybook/nextjs`, porta 6019    | `*.stories.tsx` ao lado (tema na barra)       |
| Script do build                         | `node --test`                                | `scripts/*.test.mjs`                          |
| Rotas, SEO, teclado, tema, rede, 320 px | Playwright no build de produção (porta 3020) | `app/**/*.e2e.ts`; `make test-e2e-botai-site` |

- O E2E builda e sobe `next start`; rode com `CI=1` e a 3020 livre. Ele não roda no CI (como o do `apps/web`).
- **Duas passadas no `test:e2e`:** primeiro o `playwright.lojas.config.ts`, que builda com `BOTAI_CMS_ITEM=app/lojas-publicadas.yaml` (Firefox publicado, Chrome com link de outra loja, Edge em `http:`) e roda `app/lojas-publicadas.e2e.ts`; depois o `playwright.config.ts`, que builda com o CMS real e roda o resto. O CMS real tem só a Chrome Web Store publicada (desde 2026-10-05); a primeira passada é a que exercita link de outra loja e Edge em `http:` (que some, sem "Em breve"). A ordem deixa o `.next` com o CMS real; um `distDir` à parte faria o `next build` mexer no `include` do `tsconfig.json`.
- O axe roda a 1280 e a 320 px, nos dois temas, nas três rotas: a meta da spec é o Lighthouse mobile.
- ⚠️ O `next dev` (e o servidor do E2E, que roda `next build`/`next start`) pode anexar a este arquivo um bloco de regras para agentes ou criar um `AGENTS.md`: confira `git status` antes de commitar.

## Deploy (Vercel, projeto próprio)

1. Projeto `botai-site` ligado ao repo, **Root Directory `apps/botai-site`**, framework Next.js, install e build padrão (`pnpm install` na raiz, `pnpm build`), Node 22.x. "Include files outside the root directory in the Build Step" ligado (o build lê `packages/*` e o YAML do `apps/web`).
2. ⚠️ **"Skip deployments" (Root Directory) desligado:** a Vercel pula projeto de monorepo cujo código e dependências não mudaram, e o YAML do CMS mora no `apps/web`, que não é dependência deste pacote: publicar uma loja pelo `/admin/pilulabs` não rebuildaria a landing. Quem filtra é o `ignoreCommand` do `vercel.json` (roda na Root Directory; `exit 0` cancela), que vigia o app, `packages/ui`, `packages/tools`, a entrada do Botaí no CMS, os ícones da extensão (`apps/botai/public/icon`, de onde sai o `/favicon.ico`) e os arquivos de install e build.
3. Domínio `botai.pilutech.com.br`: um domínio só fica num projeto, então, se ele estiver no projeto do `apps/web` (o README antigo do Botaí mandava pôr lá), tire-o de lá primeiro (`vercel domains inspect botai.pilutech.com.br` diz onde está). Depois, adicione-o ao `botai-site`; na Cloudflare, o `CNAME botai` com o valor que a Vercel mostrar, em **DNS only** (passo do dono).
4. Env: nenhuma obrigatória. `GOOGLE_SITE_VERIFICATION` em Production quando o dono cadastrar o domínio no Search Console. Não ponha `SITE_URL` nem `BOTAI_CMS_ITEM` em ambiente nenhum.
5. **Primeira produção, antes do merge:** a produção do projeto sai da `main`, e a `main` só tem o `apps/botai-site` depois do merge; sem isto, o domínio fica sem deploy de produção para servir. Depois do push do branch, ache o preview dele (`vercel ls botai-site`). Se ele saiu `CANCELED` (o `ignoreCommand` compara `HEAD^` com `HEAD`, e o último commit do branch pode não tocar nada vigiado) ou não existe, gere um com `vercel deploy` na raiz do checkout do branch. Promova: `vercel promote <url-do-preview> --yes` (a Vercel rebuilda o preview com o ambiente de produção; ver "Promote a deployment from preview to production" na doc dela).
6. Confira: `curl -sI https://<preview>.vercel.app | grep -i x-robots-tag` mostra `noindex`; `curl -sI https://botai.pilutech.com.br`, `curl -sI https://botai.pilutech.com.br/privacidade` e `curl -sI https://botai.pilutech.com.br/termos` respondem 200, sem `x-robots-tag: noindex`; o `<link rel="canonical">` de `https://botai.pilutech.com.br` aponta para ele mesmo; `https://botai.pilutech.com.br/sitemap.xml` lista as três rotas.
7. **Merge, só com os dois hosts no ar:** `botai.pilutech.com.br` (passo 6), porque os 308 do `apps/web` apontam para ele, e `https://pilutech.com.br` respondendo 200 (a landing da PiluTech, projeto `pilutech-site`; ver "Deploy" em `apps/pilutech-site/CLAUDE.md`), porque o "Powered by PiluTech" do rodapé e a `Organization` do JSON-LD apontam para ele (`URL_DA_PILUTECH`, em `lib/conteudo.ts`). Em 2026-10-02 o `pilutech.com.br` não tinha registro A, e o `CNAME botai` era provisório.

## Comandos

| Comando                                        | O quê                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `make dev-botai-site`                          | `next dev` em http://localhost:3020                                                                      |
| `make build-botai-site`                        | `next build` + gate do `@source` + conferência das rotas estáticas                                       |
| `make test-botai-site`                         | Jest + `node --test`                                                                                     |
| `make test-e2e-botai-site`                     | 2 builds de produção (YAML de teste, depois o CMS real) + `next start` na 3020 + Playwright (com `CI=1`) |
| `make storybook-botai-site`                    | Storybook em http://localhost:6019                                                                       |
| `pnpm --filter @pilutech/botai-site typecheck` | `tsc --noEmit`                                                                                           |
| `pnpm --filter @pilutech/botai-site lint`      | ESLint                                                                                                   |
