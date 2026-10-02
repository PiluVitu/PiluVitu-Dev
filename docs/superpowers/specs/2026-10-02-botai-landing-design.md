# Botaí: landing própria em `botai.pilutech.com.br` (`apps/botai-site`)

Data: 2026-10-02. Design: `docs/superpowers/design/2026-10-02-botai-landing/Botai Landing.dc.html` (Claude Design, projeto `5dde116f-2b4f-479c-9268-a3dea78c7eb3`), com as capturas `desktop-escuro.png` e `mobile-escuro.png` ao lado.

## 1. Pedido e decisões do dono

- Pedido: "consigo deployar um app só da landing dessa parte para rodar no link correto? Se conseguir faça landing em next para ficar mais prático e rankeado com seo bom ao mesmo tempo […] faça o mesmo desde a criação do botai para poder rankear legal no seo".
- Respostas às perguntas:
  - **Privacidade:** "Mudar tudo pra landing". O app novo serve `/` e `/privacidade`, e é a fonte única do texto da política. No `apps/web`, `/pilulabs/botai` e `/pilulabs/botai/privacidade` viram 308 para `botai.pilutech.com.br`, e o card da PiluLabs passa a apontar para lá.
  - **Vercel:** "Eu, pela CLI". O projeto e o domínio eu crio com a CLI, depois do push. O dono só troca o CNAME provisório do `botai` na Cloudflare.

## 2. O app

- **Pasta e pacote:** `apps/botai-site`, pacote `@pilutech/botai-site` (grafia técnica `botai`, regra do `apps/botai/CLAUDE.md`).
- **Stack:** Next 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4 e `@piluvitu/ui`. Os tokens e o `Button` vêm do pacote, com `@source` para `packages/ui/src`. O `build` roda o gate `scripts/check-tailwind-source.mjs`.
- **Fontes e ícones:** Plus Jakarta Sans e JetBrains Mono por `next/font`, como o `apps/web`. Font Awesome pelos pacotes npm, sem CDN.
- **Rotas estáticas:** todas, sem `revalidate`. O build confere isso como o `apps/web` confere as rotas PiluLabs. O dev roda na porta 3020.
- **Vercel:** projeto próprio com Root Directory `apps/botai-site`. Um `ignoreCommand` faz o projeto só buildar quando mudar o que ele usa: o próprio app, `packages/ui`, `packages/tools`, a entrada do Botaí no CMS e o lockfile.

## 3. Página `/` (o design, 1:1)

Seções na ordem do design:

- topo: "← PiluLabs" para `https://pilutech.com.br`, âncoras e o botão de tema;
- hero, com:
  - `~/pilulabs/botai`, o ícone, o nome e o selo de fase;
  - a proposta e o parágrafo;
  - os botões das 4 lojas;
  - a nota das lojas e o atalho do sistema de quem visita;
  - a captura;
- "Por que existe", com o cartão "De onde vem o nome";
- "O que ele bota", com os 5 recursos e a nota de compatibilidade;
- "Capturas", nas abas 01–03;
- "Como usar", com os 3 passos, a tabela de atalhos e a nota;
- "Privacidade" e "Cuidados";
- o bloco "Bota aí no seu navegador";
- o rodapé, com "Powered by PiluTech" para `https://pilutech.com.br` e "Suporte" para `mailto:pilutechinformatica@gmail.com`.

Regras que o design deixa em aberto:

- **Lojas e fase saem do CMS.** O app lê `apps/web/content/pilulabs/botai/index.yaml` no build: o dono edita em `/admin/pilulabs`, e a landing e o card da PiluLabs mudam juntos.
- **Botões de loja:**
  - loja publicada → link para a loja, em aba nova;
  - loja sem URL → o botão aparece como "Em breve", desabilitado e sem link;
  - o `href: '#'` do protótipo não vai para produção.
- **Regras puras compartilhadas, sem cópia:** `LOJAS`, `ehUrlDaLoja`, `lojasPublicadas`, `fase` e `ATALHOS` saem do `apps/web/lib` para um subpath novo, `@piluvitu/tools/pilulabs`, consumido pelos dois apps. Se o `wxt.config.ts` do Botaí puder importar `ATALHOS` sem quebrar a reprodução do zip de fontes da AMO, ele importa. Senão, segue o espelho documentado de hoje.
- **Tema:** o tema do sistema, com o botão de alternar que lembra a escolha, sem piscar no carregamento.
- **Capturas por tema:** as capturas seguem o tema ativo. A do hero, que é o LCP, não baixa as duas variantes com prioridade.
- **Atalho de quem visita:** o atalho e o nome do sistema são detectados no cliente, depois da hidratação, sem divergir do HTML do servidor:
  - Mac → `⌥⇧P`;
  - Firefox no Linux → `Alt+Shift+P`;
  - o resto → `Ctrl+Shift+Y`.
- **Abas das capturas:** seguem o padrão WAI-ARIA de tabs (`tablist`/`tab`/`tabpanel`, `aria-selected` e setas do teclado).

## 4. Página `/privacidade`

A política que hoje mora em `apps/web/app/(site)/pilulabs/botai/privacidade/page.tsx`, com o mesmo texto, migra para o app novo, no visual do app. Os links internos são ajustados aos caminhos novos. A `loja/textos.md` do Botaí já aponta para `https://botai.pilutech.com.br/privacidade`. O texto que se cola na AMO continua saindo desta página.

## 5. SEO (o centro do pedido)

- **URLs:**
  - `metadataBase` = `https://botai.pilutech.com.br`, com override por `SITE_URL` para preview e local;
  - `alternates.canonical` em cada rota;
  - `<html lang="pt-BR">`.
- **`/`:**
  - `title` com até 60 caracteres, que diga o que é e para quê (ex.: "Botaí: gerador de CPF, CNPJ e CEP para testar formulários");
  - `description` de 140–160 caracteres, com os termos que as pessoas buscam (gerador de CPF/CNPJ válido, CEP real, preencher formulário, extensão Chrome/Firefox/Edge/Opera, dados de teste);
  - texto honesto: nada de "disponível" antes das lojas.
  - A redação final sai da pesquisa da tarefa de SEO.
- **`/privacidade`:** título e descrição próprios.
- **Compartilhamento:**
  - Open Graph completo (`type`, `locale: pt_BR`, `siteName`, `url`, `title`, `description`) e Twitter `summary_large_image`;
  - imagem própria de 1200×630 por rota, com `opengraph-image.tsx` e `twitter-image.tsx` estáticos.
- **JSON-LD:**
  - `SoftwareApplication` (`applicationCategory: BrowserApplication`, `operatingSystem`, `offers` com preço 0 em BRL, `installUrl` só das lojas publicadas, `screenshot`, `inLanguage: pt-BR`, `publisher` e `author` PiluTech);
  - `Organization` PiluTech (`url` `https://pilutech.com.br`, `logo`);
  - `WebSite`.
  - Sem `aggregateRating` (o Google proíbe copiar nota das lojas), sem `FAQPage` (rich result restrito a sites de governo e saúde desde 2023) e sem `HowTo` (descontinuado).
  - O escape de `<` para `<` fica como no `apps/web`.
- **`app/sitemap.ts` e `app/robots.ts`:**
  - o sitemap lista `/` e `/privacidade`;
  - o robots libera tudo e aponta o sitemap;
  - em preview, a Vercel já manda `X-Robots-Tag: noindex`, e isso fica conferido.
- **Ícones:** `app/icon.png`, `app/apple-icon.png` e `app/manifest.ts`, a partir do ícone do Botaí, mais `theme-color` claro e escuro.
- **HTML semântico:**
  - um único `h1`, que leva o nome e a proposta sem mudar o visual do design;
  - `h2` e `h3` em ordem;
  - `alt` descritivo nas capturas;
  - links com texto claro.
- **Desempenho:**
  - `next/image`, com tamanhos e `priority` só no LCP;
  - sem CSS ou JS de terceiros por CDN.
  - Meta: Lighthouse mobile com SEO 100, Acessibilidade ≥ 95 e Performance ≥ 90 no build de produção, medido com uma ferramenta já disponível. Se não houver nenhuma, as mesmas checagens entram no E2E (título, descrição, canonical, JSON-LD válido, `h1` único, `alt`, ausência de rolagem horizontal a 320 px).
- **Search Console:** `GOOGLE_SITE_VERIFICATION` opcional vira `metadata.verification.google`. Cadastrar o domínio é passo do dono.

## 6. Mudanças no `apps/web`

- **Rotas:**
  - saem `app/(site)/pilulabs/botai/**` (página, política e as imagens OG delas);
  - `next.config.mjs` ganha os redirects permanentes `/pilulabs/botai` → `https://botai.pilutech.com.br` e `/pilulabs/botai/privacidade` → `https://botai.pilutech.com.br/privacidade`.
- **CMS:** o item `botai` passa a `paginaPropria: false`, mantendo o `site` em `https://botai.pilutech.com.br`. As travas de rota continuam valendo.
- **Arquivos públicos:**
  - as capturas do Botaí saem de `apps/web/public/pilulabs/botai/capturas`;
  - o `icone-128.png` fica, porque é o logo do card.
- **Código, testes e docs:** as importações de lojas, fase e atalhos passam para `@piluvitu/tools/pilulabs`. Testes, E2E e o `apps/web/CLAUDE.md` acompanham.

## 7. Mudanças no `apps/botai`

- **Capturas:** o `make capturas-botai` copia as 6 capturas (3 cenas × 2 temas) e o ícone para `apps/botai-site/public/`, e o ícone também para `apps/web/public/pilulabs/botai/`. O `loja/imagens.test.ts` confere as cópias novas.
- **Docs:** o `README.md` ("Publicação") e o `CLAUDE.md` passam a falar do app novo.

## 8. CI e testes

- **CI:** job novo no `ci.yml` para o `apps/botai-site`: lint, `tsc`, testes e build com o gate.
- **Testes:**
  - lógica (metadata, JSON-LD, leitura do CMS, lojas e fase, atalho por sistema) no Jest, como o `apps/web`;
  - um `.stories.tsx` por componente visual, num Storybook próprio na porta 6019;
  - Playwright nas duas rotas: seções, abas por teclado, tema, botões de loja com e sem URL, as checagens de SEO do §5 e 320 px.
- **Docs:** um `apps/botai-site/CLAUDE.md` e a linha nova na tabela do `CLAUDE.md` raiz.

## 9. Passos depois do código

- **Meus, pela CLI:**
  - criar o projeto Vercel `botai-site` ligado ao repo, com Root Directory `apps/botai-site`;
  - adicionar o domínio `botai.pilutech.com.br`.
- **Do dono:** trocar, na Cloudflare, o CNAME provisório do `botai` pelo valor que a Vercel mostrar, em DNS only.
- **Merge:** o PR só entra com o domínio respondendo pelo projeto novo, para os 308 do `apps/web` não apontarem para um host vazio.

## 10. Fora

- Inglês e `hreflang`.
- Blog ou páginas de conteúdo extra.
- Analytics: o Botaí promete "sem analytics", e a landing segue a mesma linha.
