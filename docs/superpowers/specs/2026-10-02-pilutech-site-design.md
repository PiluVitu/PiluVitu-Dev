# PiluTech: landing em `pilutech.com.br` (`apps/pilutech-site`) e e-mail único com o projeto no assunto

Data: 2026-10-02.

O design fica em `docs/superpowers/design/2026-10-02-pilutech-landing/`:

- `PiluTech Landing Page.dc.html`, a fonte visual;
- `PiluTechMark.dc.html`, o símbolo, sempre na variante `1a`;
- `marca-CLAUDE.md`, as regras da marca;
- `desktop.png` e `mobile.png`.

## 1. Pedido e decisões do dono

- Pedido:
  - "O domínio pilutech deve exibir essa pág";
  - "a pág inicial da pilutech devemos ter esse lp";
  - "os projetos devem acionar o email da pilutechinformatica@gmail.com e o email de assunto deve conter o projeto para ser fácil de filtrar pelo gmail".
- Respostas:
  - **Landing:** "App próprio". O `apps/pilutech-site` ganha um projeto Vercel novo, e `pilutech.com.br` e `www` saem do projeto do portfólio.
  - **Vitrine:** "Volta pro piluvitu.com.br/pilulabs". A vitrine PiluLabs (Botaí, Sombraí e Live PRs) volta a morar no domínio pessoal, e o "Saiba mais" da home leva a ela. A landing mostra só os produtos da PiluTech, como no design. Sai o 308 de `/pilulabs` para `pilutech.com.br`.

## 2. O app

- **Identidade:** `apps/pilutech-site`, pacote `@pilutech/site`.
- **Stack:** a mesma do `apps/botai-site`, que serve de referência para estrutura, gate do `@source`, conferência de rotas estáticas, Jest, Storybook, Playwright e `vercel.json` com `ignoreCommand`:
  - Next 16 (App Router), React 19, TypeScript strict;
  - Tailwind 4 e `@piluvitu/ui`, com tokens e `Button`;
  - `next/font` (Plus Jakarta Sans e JetBrains Mono);
  - Font Awesome pelos pacotes npm, inclusive o ícone de marca do WhatsApp.
- **Portas:** dev na 3021, Storybook na 6020.
- **Rotas:** todas estáticas.
- **Símbolo:** o `PiluTechMark` (variante `1a`, o "P de 5 blocos" com o bloco de cima à direita em destaque) vira um componente SVG, sem lockup e com lockup ("PiluTech" em Plus Jakarta Sans 800, tracking −0.035em). Dele saem também o favicon, o `apple-icon` e a imagem OG.

## 3. Página `/` (o design, 1:1)

Seções na ordem do design: barra fixa, Hero (com o terminal), Serviços, Como funciona, Projetos, Tecnologias, Planos de manutenção, Dúvidas, Contato, rodapé e o botão flutuante do WhatsApp.

- **Barra fixa:** símbolo com lockup, links das seções e botão do WhatsApp.
- **Textos:** os do design, sem mudar nada. A regra da marca é texto factual, sem slogan e sem emoji. Nunca anunciar manutenção de computadores e impressoras.
- **Links das seções na barra:**
  - somem abaixo de 900 px por CSS, não por JavaScript;
  - acima disso a barra não pode rolar na horizontal.
- **WhatsApp:**
  - links `https://wa.me/5586981737625?text=…`, com as mensagens do design;
  - o geral e um para cada plano;
  - em aba nova com `rel="noopener noreferrer"`;
  - o botão flutuante tem `aria-label`.
- **Projetos:**
  - cartões do Botaí e do Sombraí com as imagens OG dos domínios deles (`https://botai.pilutech.com.br/opengraph-image` e `https://sombrai.pilutech.com.br/opengraph-image.png`, sem o parâmetro de hash) e o link para cada domínio;
  - o selo de fase do Botaí sai do CMS (`apps/web/content/pilulabs/botai/index.yaml`, por `@piluvitu/tools/pilulabs`, como faz o `apps/botai-site`);
  - nenhum selo diz "disponível" sem fonte.
- **Dúvidas:**
  - acordeão acessível: botão com `aria-expanded` e `aria-controls`, e o primeiro item aberto;
  - todas as respostas no HTML do servidor, as fechadas com `hidden`.
- **E-mail:** `mailto:pilutechinformatica@gmail.com?subject=…`, com o assunto do §6.

## 4. SEO desde a criação

- **URLs:** `metadataBase` = `https://pilutech.com.br`, com override por `SITE_URL`; canonical; `lang="pt-BR"`.
- **Title e description:**
  - title com até 60 caracteres, a partir do `<title>` do design;
  - description de 140–160 caracteres, que diga o que a PiluTech faz e onde (Teresina, PI, com atendimento remoto em todo o Brasil).
- **Compartilhamento:** Open Graph e Twitter com imagem própria de 1200×630.
- **JSON-LD:**
  - `Organization` (PiluTech, url, logo, `email`, `telephone`, `contactPoint`);
  - um `ProfessionalService` (`areaServed` Brasil, `address` só com cidade, UF e país, os serviços como `hasOfferCatalog` ou `makesOffer`, sem preço);
  - `WebSite`;
  - sem `FAQPage` (rich result restrito a governo e saúde) e sem nota.
- **Rotas técnicas:** sitemap, robots, manifest, ícones, `theme-color` e `verification.google` opcional (`GOOGLE_SITE_VERIFICATION`).
- **HTML:** um `h1`, `h2`/`h3` em ordem, `alt` nas imagens.
- **Desempenho:** imagens externas por `next/image` com `remotePatterns` dos dois domínios.
- **Meta de qualidade:** a mesma do `apps/botai-site`. Lighthouse mobile com SEO 100, Acessibilidade ≥ 95 e Performance ≥ 90 se houver ferramenta disponível; senão, as checagens equivalentes no E2E, com o axe a 1280 e 320 px.

## 5. A vitrine volta para `piluvitu.com.br/pilulabs` (`apps/web`)

- `urlPublica('/pilulabs')` e os links da vitrine ("Saiba mais", rodapé, canonical, JSON-LD) passam a ser `/pilulabs` no `piluvitu.com.br`, com a chave `PILUTECH_SUBDOMINIOS` ligada ou não.
- O `apps/web` deixa de servir `pilutech.com.br`. Sai do `proxy.ts` o que ficar morto (a reescrita do apex, o 308 de `/pilulabs` e o resto que não tiver mais uso), com testes. Se a chave `PILUTECH_SUBDOMINIOS` não governar mais nada, ela sai do código, da documentação e do `.env.example`, e o dono apaga a variável na Vercel.
- Os 308 de `/pilulabs/botai` e `/pilulabs/botai/privacidade` para a landing do Botaí ficam.
- Na landing do Botaí, o "← PiluLabs" passa a apontar para `https://piluvitu.com.br/pilulabs`. O "Powered by PiluTech" continua em `https://pilutech.com.br`, que agora é a landing da empresa.

## 6. E-mail único, com o projeto no assunto

Todo contato de projeto vai para `pilutechinformatica@gmail.com`. O assunto começa pelo nome do projeto entre colchetes, para filtrar no Gmail com `subject:Botaí`, `subject:Sombraí` ou `subject:PiluTech`:

- PiluTech, landing: `[PiluTech] Contato pelo site`;
- Botaí, landing: `[Botaí] Suporte`, `[Botaí] Privacidade` e `[Botaí] Termos de uso`, cada um no link correspondente;
- Sombraí (no repositório dele, outro workflow):
  - o "Achou algo errado?" do app manda para `pilutechinformatica@gmail.com`, com o assunto `[Sombraí] …`;
  - os links do site ganham `[Sombraí] Privacidade` e `[Sombraí] Termos de uso`.

O assunto sempre vai codificado (RFC 6068, UTF-8). Quando um texto público cita o e-mail (política, termos, `loja/textos.md`), ele continua sendo `pilutechinformatica@gmail.com`.

## 7. Deploy (depois do código)

- **Meu, pela CLI:**
  1. criar o projeto Vercel `pilutech-site` (Root Directory `apps/pilutech-site`, Node 22, "pular quando não muda" desligado);
  2. primeira produção a partir do preview;
  3. na hora do merge, tirar `pilutech.com.br` e `www` (que faz 308 para o apex) do `pilu-vitu-dev` e pôr no `pilutech-site`.
- **DNS:** o dono já apontou o apex e o `www` para a Vercel, e a troca de projeto não muda o registro.
- **Ordem do merge:** depois de mover os domínios. Os links da vitrine passam a ser `/pilulabs` no mesmo merge.

## 8. Testes

- **Jest:** metadata, JSON-LD, links do WhatsApp e do `mailto` com assunto, acordeão, selo do CMS.
- **Storybook:** um `.stories.tsx` por componente visual.
- **Playwright:**
  - seções, âncoras, acordeão pelo teclado;
  - links externos;
  - checagens de SEO;
  - 320 px sem rolagem horizontal;
  - axe.
- **No `apps/web`:** os testes da vitrine e do proxy acompanham.
- **Docs:** `apps/pilutech-site/CLAUDE.md`, a linha nova no `CLAUDE.md` raiz e as seções afetadas do `apps/web/CLAUDE.md` e do `apps/botai-site/CLAUDE.md`.

## 9. Fora

- Política de privacidade da landing da PiluTech (o dono não pediu; ela não tem formulário).
- Inglês.
- Analytics.
