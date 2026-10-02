# PiluTech: landing em `pilutech.com.br` (`apps/pilutech-site`) e e-mail com o projeto no assunto — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um app Next 16 só com a landing da PiluTech (`/`), fiel ao design do Claude Design, estático e com SEO completo, servido por um projeto Vercel próprio em `https://pilutech.com.br`; a vitrine PiluLabs volta a morar em `piluvitu.com.br/pilulabs` (sai o proxy dos subdomínios do `apps/web`), e todo e-mail de projeto vai para `pilutechinformatica@gmail.com` com o projeto entre colchetes no assunto.

**Architecture:** `apps/pilutech-site` (`@pilutech/site`) copia o molde do `apps/botai-site`: Next 16 App Router, Tailwind 4 + `@piluvitu/ui` com `@source` e gate, `next/font`, Font Awesome por npm, Jest + Testing Library, Storybook próprio (6020), Playwright no build de produção (3021), conferência de rotas estáticas e `vercel.json` com `ignoreCommand`. A página alterna seções escuras e claras usando os tokens do design system: cada seção escura leva a classe `dark` (o `.dark` do `@piluvitu/ui` redefine as variáveis só dentro dela) e as claras herdam o `:root`. Isso só funciona porque o `app/globals.css` redeclara as cores do design system em `@theme inline`: o `@theme` do pacote não é `inline`, e sem isso a cor sairia resolvida no `:root` e o `dark` de uma seção não mudaria nada (ver "Decisões"). O símbolo `PiluTechMark` (variante 1a) é um SVG com os 5 blocos; dele saem o favicon, o `apple-icon` e a imagem OG (Satori, com a Plus Jakarta Sans 800 do `@fontsource`). O selo do Botaí sai do CMS do `apps/web` pelas regras de `@piluvitu/tools/pilulabs`; o `mailto` com assunto vira lógica pura compartilhada em `@piluvitu/tools/contato`, usada pela landing da PiluTech e pela do Botaí. No `apps/web`, com `pilutech.com.br` fora do projeto, tudo o que o proxy fazia fica morto, e ele sai inteiro junto com a chave `PILUTECH_SUBDOMINIOS`.

**Tech Stack:** Next.js 16.3.8 (App Router, `next/font`, `next/image` com `remotePatterns`, metadata files, `next/og`), React 19.2, TypeScript 5.9 strict, Tailwind CSS 4.3 + `@piluvitu/ui`, Font Awesome 7.2 (svg-core, solid, regular, brands), `@fontsource/plus-jakarta-sans` 5.3.0 (só para a imagem OG), `yaml` 2.9, Jest 30 + ts-jest + Testing Library + user-event, Storybook 10.3.1 (`@storybook/nextjs`), Playwright 1.59.1, `axe-core` 4.11.1, `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-02-pilutech-site-design.md` (leia inteira antes de qualquer tarefa). Fonte visual: `docs/superpowers/design/2026-10-02-pilutech-landing/PiluTech Landing Page.dc.html` (estrutura, textos, espaçamentos e cores), `PiluTechMark.dc.html` (o símbolo, sempre a variante `1a`), `marca-CLAUDE.md` (regras da marca), `desktop.png` e `mobile.png` (o resultado). Molde de código: `apps/botai-site` inteiro e o `apps/botai-site/CLAUDE.md`.

## Global Constraints

- **Branch e escopo:** trabalhe na `feat/pilutech-site` já em checkout. Nunca troque de branch, nunca dê push, nunca toque `/Users/piluvitu/PILUTECH/Sombrai` (outro workflow trabalha lá; os e-mails do Sombraí são dele, spec §6).
- **Wrapper `rtk`:** o shell reescreve `git`, `grep`, `diff`, `find`, `ls`, `prettier`, `jest`, `vitest` e `gh` e **falsifica a saída**. Use `/usr/bin/git`, `/usr/bin/grep`, `/usr/bin/find`, `/bin/ls`, `/opt/homebrew/bin/gh` e os binários de `node_modules/.bin` (`./node_modules/.bin/jest` etc.), sempre terminando o comando com `; echo "exit=$?"`, e julgue pelo exit code.
- **Next 16:** antes de afirmar qualquer API do Next, leia a doc empacotada em `apps/web/node_modules/next/dist/docs/` (`01-app/03-api-reference/...`). Usadas aqui: `02-components/image.md` (`remotePatterns` com `search: ''`), `03-file-conventions/01-metadata/app-icons.md` (`icon.tsx`/`apple-icon.tsx` geradas e estáticas), `opengraph-image.md`, `04-functions/image-response.md` (fontes só `ttf`/`otf`/`woff`), `04-functions/generate-metadata.md` (`verification`) e `generate-viewport.md` (`themeColor`).
- **Identidade:** pasta `apps/pilutech-site`, pacote `@pilutech/site` (o filtro do pnpm é `--filter @pilutech/site`). Marca "PiluTech" em todo texto visível.
- **Stack (spec §2):** "a mesma do `apps/botai-site`": Next 16 (App Router), React 19, TypeScript strict, Tailwind 4 e `@piluvitu/ui`, com tokens e `Button`; `next/font` (Plus Jakarta Sans e JetBrains Mono); Font Awesome pelos pacotes npm, inclusive o ícone de marca do WhatsApp. **Rotas: todas estáticas.**
- **Portas:** dev da landing **3021**, Storybook **6020**; `apps/botai-site` 3020/6019; E2E do `apps/web` **3333**. Antes de um E2E, confira `lsof -nP -iTCP:<porta> -sTCP:LISTEN`; processo que você não subiu, **não mate**: pare e reporte. Rode Playwright com `CI=1` (sobe o próprio servidor e falha se a porta estiver ocupada).
- **Dependências (pnpm 11):** `minimumReleaseAge: 1440` e `allowBuilds` (ver `CLAUDE.md` raiz). Depois de mexer em dependência: `pnpm dedupe --check` e a trava do CodeMirror (`cd apps/web && ./node_modules/.bin/jest components/admin/posts/mdx-editor.codemirror.test.ts`).
- **Textos (spec §3):** "os do design, sem mudar nada". Regra da marca: "texto factual, sem slogan e sem emoji. Nunca anunciar manutenção de computadores e impressoras" (a única menção é a dúvida do design, cuja resposta começa com "Não.").
- **Símbolo (spec §2):** "o `PiluTechMark` (variante `1a`, o 'P de 5 blocos' com o bloco de cima à direita em destaque) vira um componente SVG, sem lockup e com lockup ('PiluTech' em Plus Jakarta Sans 800, tracking −0.035em). Dele saem também o favicon, o `apple-icon` e a imagem OG."
- **WhatsApp (spec §3):** links `https://wa.me/5586981737625?text=…` com as mensagens do design, o geral e um por plano, "em aba nova com `rel="noopener noreferrer"`", e o botão flutuante com `aria-label`.
- **Barra (spec §3):** os links das seções "somem abaixo de 900 px por CSS, não por JavaScript; acima disso a barra não pode rolar na horizontal".
- **Projetos (spec §3):** imagens `https://botai.pilutech.com.br/opengraph-image` e `https://sombrai.pilutech.com.br/opengraph-image.png`, "sem o parâmetro de hash", por `next/image` com `remotePatterns` dos dois domínios; o selo do Botaí sai do CMS (`apps/web/content/pilulabs/botai/index.yaml`, por `@piluvitu/tools/pilulabs`); "nenhum selo diz 'disponível' sem fonte".
- **Dúvidas (spec §3):** "botão com `aria-expanded` e `aria-controls`, e o primeiro item aberto; todas as respostas no HTML do servidor, as fechadas com `hidden`".
- **E-mail (spec §6):** tudo para `pilutechinformatica@gmail.com`; assunto começa por `[Projeto]`: `[PiluTech] Contato pelo site`, `[Botaí] Suporte`, `[Botaí] Privacidade`, `[Botaí] Termos de uso`. "O assunto sempre vai codificado (RFC 6068, UTF-8)." Texto público que cita o e-mail (política, termos, `loja/textos.md`) continua com o endereço puro.
- **SEO (spec §4):** `metadataBase` = `https://pilutech.com.br`, override por `SITE_URL`; canonical; `lang="pt-BR"`; title com até 60 caracteres; description de 140–160; OG e Twitter com imagem própria 1200×630; JSON-LD com a PiluTech num nó só, `@type` `['Organization', 'ProfessionalService']` (ver "Decisões"; endereço só cidade, UF e país; serviços sem preço) + `WebSite`; **sem `FAQPage` e sem nota**; sitemap, robots, manifest, ícones, `theme-color`, `verification.google` opcional (`GOOGLE_SITE_VERIFICATION`); um `h1`, níveis em ordem, `alt` em toda imagem; axe a 1280 e 320 px (não há Lighthouse no PATH nem no repo).
- **Lei de comentários (`CLAUDE.md` raiz):** comentário em produção só com as três condições (porquê invisível, a ausência levaria a "consertar" e quebrar, não cabe em nome/teste/doc), 1 a 3 linhas. Teste é livre para explicar.
- **Colocation:** teste e story ao lado do fonte; E2E `.e2e.ts` ao lado da rota que testa.
- **Sentinela do gate:** nunca escreva o nome da classe sentinela por extenso em `apps/*` (nem em `.md`); cite `SENTINEL_SELECTOR` do script.
- **`next dev`/`next build` reescrevem `CLAUDE.md`/`AGENTS.md`:** quando detecta agente, o Next anexa um bloco `nextjs-agent-rules` ao `CLAUDE.md` do app ou cria um `AGENTS.md`. Depois de rodar o Next (inclusive pelo servidor do E2E), confira `/usr/bin/git status` e descarte o que ele gerou antes de commitar.
- **Deploy (spec §7) não é tarefa de código:** a Tarefa 10 documenta os passos no `apps/pilutech-site/CLAUDE.md`; criar o projeto Vercel, promover a primeira produção, apagar a variável `PILUTECH_SUBDOMINIOS` da Production do `pilu-vitu-dev` (com o redeploy da produção atual) e mover os domínios é feito depois, por quem orquestra, nessa ordem. O merge só vem depois de mover os domínios.
- **Fora (spec §9):** política de privacidade da landing da PiluTech, inglês, analytics (nada de `@vercel/analytics`/`speed-insights` neste app).
- **`$SCRATCH`:** onde um passo usa `$SCRATCH`, é a pasta de rascunho da sessão (a que o sistema indica). Cada chamada do Bash é um shell novo: declare `SCRATCH=<caminho>` no mesmo comando que a usa.
- **Commits:** mensagens no padrão do repo (`tipo(escopo): descrição em pt-BR`), um por tarefa, cada um com lint, tsc, testes e build verdes. O pre-commit roda o `lint-staged` (pode reformatar; confira `git status` depois).

## Review Focus

1. **Celular de 320 px:** a palavra "infraestrutura" do `h1` (40 px) e o botão do e-mail (`pilutechinformatica@gmail.com`, sem espaço para quebrar) podem vazar da caixa para o gutter sem aumentar o `scrollWidth` da página, e o teste de rolagem não acusaria. Quem visita no celular espera tudo dentro da tela. Testes: as classes `wrap-break-word`/`wrap-anywhere` travadas no Jest (`hero.test.tsx` na Tarefa 4, `contato.test.tsx` na Tarefa 6) e o E2E "nenhum elemento passa da área de conteúdo da própria seção", a 320 px (`app/pagina.e2e.ts`, Tarefas 4 e 6).
2. **A variável `PILUTECH_SUBDOMINIOS=1` está ligada hoje na Production do `pilu-vitu-dev`:** `curl -sI https://piluvitu.com.br/pilulabs` responde 308 para `https://pilutech.com.br/`. Se os domínios mudassem de projeto com ela ligada, esse 308 levaria à landing nova, e a vitrine ficaria inacessível (o "Saiba mais" e o rodapé da home e o "← PiluLabs" do Botaí também) até o deploy da `main`. Por isso o deploy apaga a variável e redeploya a produção atual **antes** de mover os domínios, e só segue com `/pilulabs` respondendo 200 (passo 5 do Deploy no `apps/pilutech-site/CLAUDE.md`, Tarefa 10). Depois do merge, `/pilulabs` tem de continuar 200 e os links da home em `/pilulabs`, mesmo que a variável volte por engano. Teste: o E2E da vitrine e da home do `apps/web` roda duas vezes, a segunda com `PILUTECH_SUBDOMINIOS=1` no ambiente, e `pilulabs.e2e.ts` ganha "/pilulabs responde 200, sem 308" (Tarefa 8).
3. **Imagem OG remota fora do ar, ou com outra query:** o `next/image` só aceita os dois caminhos exatos, sem query (`search: ''`), e o cartão do projeto continua com link, nome, selo e `alt` quando a imagem falha. Testes: `next.config.test.ts` com o `hasRemoteMatch` do próprio Next e o E2E com `/_next/image` respondendo 502 (Tarefa 4).
4. **Sem JavaScript (ou antes de hidratar):** abaixo de 900 px os links da barra já vêm escondidos e acima já vêm visíveis; as cinco respostas das dúvidas estão no HTML, a primeira aberta e as outras com `hidden`. Testes: E2E com `javaScriptEnabled: false` (Tarefas 5 e 6) e `renderToStaticMarkup` no `acordeao.test.tsx` (Tarefa 5).
5. **Assunto com acento e caracteres reservados:** `[Botaí] Termos de uso` vai como UTF-8 percent-encoded, espaço nunca vira `+` (o Gmail mostraria o `+`), e um `&`, `?` ou `#` no assunto não corta o link; assim o filtro `subject:Botaí` do Gmail pega. Testes: `packages/tools/src/contato.test.ts` (Tarefa 3) e os testes de link do `apps/botai-site` (Tarefa 9).
6. **Seção escura com as cores escuras:** o `@theme` do `@piluvitu/ui` não é `inline`. Sem o `@theme inline` do `app/globals.css`, barra, hero, Como funciona, Tecnologias, Contato, rodapé, botão flutuante e `PiluTechMark` sairiam com as cores do tema claro, e nenhum teste de classe (`toHaveClass('dark')`), nem o axe (claro sobre claro tem contraste), acusaria. Testes: `app/globals.test.ts` (toda cor do design system que depende de variável está no bloco `inline`, Tarefa 1) e os E2E que leem a cor computada (`getComputedStyle`) de cada seção (`app/pagina.e2e.ts`, Tarefas 1, 4 e 6).
7. **Foco visível nos botões (WCAG 2.4.7):** o `Button` do design system troca o outline por um anel de 1 px na cor do `ring`, que no escuro é o próprio Ciano do botão, e nos Planos é Petróleo sobre o cartão Petróleo. Testes: o `ANEL_DE_FOCO` (anel de 2 px com folga do fundo) travado por `toHaveClass` nos testes do hero, dos planos, da barra e do contato, e o E2E que dá Tab até o "Falar no WhatsApp" do hero e lê o `boxShadow` (Tarefas 4 e 6).
8. **Selo "disponível" pelo caminho real:** o `page.tsx` lê o YAML e passa a fase à `Landing`; com o CMS de hoje (as 4 lojas vazias), um `page.tsx` com a fase fixa passaria em tudo. Teste: a primeira passada do `test:e2e` (`playwright.lojas.config.ts`) builda com `BOTAI_CMS_ITEM=app/lojas-publicadas.yaml` e confere "Extensão de navegador · disponível" no cartão do Botaí e "em breve" no do Sombraí (Tarefa 4), como o `apps/botai-site` já faz.

---

## Decisões tiradas do código (leia antes de começar)

- **O proxy do `apps/web` sai inteiro.** Com `pilutech.com.br` e `www` no projeto novo, nenhum host `*.pilutech.com.br` chega ao `apps/web`: o `botai.` e o `sombrai.` já são de projetos próprios, nenhum item do CMS tem `paginaPropria: true` e não existe rota `/pilulabs/<slug>`. A reescrita do apex, o 308 do apex para `piluvitu.com.br`, a reescrita dos subdomínios e o 308 de `/pilulabs*` ficam todos sem uso. Saem `proxy.ts`, `proxy.test.ts`, `lib/pilutech-dominios.ts` (+ teste), os E2E `subdominios.e2e.ts` e `chave-ligada.e2e.ts`, o parâmetro `subdominiosAtivos` de `linkDoItem`/`itemParaProject`/`metadataDaPagina`/`jsonLdVitrine` e a chave do `.env.example` e das docs. Os 308 de `/pilulabs/botai*` ficam: são `redirects` do `next.config.mjs`, não do proxy.
- **`paginaPropria` continua valendo**, agora só como `/pilulabs/<slug>` no `piluvitu.com.br` (o comportamento de hoje com a chave desligada).
- **O `publisher` do JSON-LD da vitrine passa a ser a PiluTech no site dela** (`https://pilutech.com.br`, `@id` `https://pilutech.com.br/#organizacao`, o mesmo `@id` que o `apps/botai-site` já usa). A `CollectionPage` em si fica em `piluvitu.com.br/pilulabs`, como a spec §5 pede. A `Organization` do `apps/botai-site` ganha o `logo` `https://pilutech.com.br/icon` (o 192 px que este branch cria), e a nota "sai sem `logo`" do `apps/botai-site/CLAUDE.md` muda junto (Tarefa 9).
- **Cores por contexto, sem copiar o design system:** as seções escuras levam a classe `dark` e usam `bg-background`, `text-foreground`, `text-primary`, `text-muted-foreground`, `border-border`, `bg-card` e `text-ok` (no `.dark` do `@piluvitu/ui`, esses tokens são exatamente a Noite, o texto claro, o Ciano, o Aço, a borda escura, o Grafite e o verde do design). As claras não levam classe e caem no `:root` (Névoa, Grafite, Petróleo, cartão branco). O `<html>` **não** leva `dark`: se levasse, as seções claras herdariam os tokens escuros. Ficam no `@theme` do app só as cores sem token: `noite` (fundo do `body`), `grafite` (fundo das imagens dos projetos, numa seção clara), `ciano` e `ciano-claro` (o ✓ dos planos e o hover do botão flutuante) e as três do Petróleo dos planos.
- **As cores do design system redeclaradas em `@theme inline` no `app/globals.css` (sem isso, nenhuma seção escura funciona).** O `@theme` de `packages/ui/src/styles.css` não é `inline`: o Tailwind emite `:root { --color-background: hsl(var(--background)) }` e `.bg-background { background-color: var(--color-background) }`. O `var()` é resolvido no `:root`, e os filhos herdam a cor já resolvida (a clara): uma `<section class="dark bg-background">` troca o `--background` e continua Névoa. Medido com o Tailwind 4.3.3 do repo e o Chromium do Playwright 1.59.1: fundo `rgb(247, 249, 252)`, texto `rgb(15, 20, 31)` e o `text-primary` dentro dela `rgb(5, 91, 128)` (Petróleo em vez de Ciano). Com o bloco `inline`, a utility vira `background-color: hsl(var(--background))`, resolvida em cada elemento: fundo `rgb(9, 11, 17)`, texto `rgb(231, 236, 243)`, primary `rgb(58, 191, 248)`. O bloco repete toda cor do design system que depende de variável (as 32 `--color-x: hsl(var(--x))`, não só as que a página usa: o `Button` traz outras, e um token que faltasse quebraria em silêncio); o `app/globals.test.ts` compara com o `styles.css` do pacote, e os E2E leem a cor computada. O decorador `dark` do `apps/web/.storybook/preview.tsx` tem o mesmo defeito; fica fora deste branch.
- **Anel de foco próprio nos botões (`ANEL_DE_FOCO` em `components/classes.ts`):** a base do `Button` (`packages/ui/src/button.tsx`) tem `focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring`, e no `.dark` o `--ring` é igual ao `--primary` (`198 93% 60%`): o anel Ciano em volta do botão Ciano não aparece. Os botões da landing somam `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background` (folga Noite e anel Ciano; medido no Chromium: `rgb(9, 11, 17) 0px 0px 0px 2px, rgb(58, 191, 248) 0px 0px 0px 4px` no `boxShadow`), e os dos Planos, `focus-visible:ring-white focus-visible:ring-offset-petroleo-cartao`. O `cn` (tailwind-merge 3.5) tira o `ring-1` e o `ring-ring` da base.
- **A PiluTech é um nó só no JSON-LD**, `@type` `['Organization', 'ProfessionalService']`, com o `@id` `https://pilutech.com.br/#organizacao` (o mesmo do `apps/botai-site`) e todas as propriedades que a spec §4 pede às duas (logo, e-mail, telefone, `contactPoint`, endereço só com cidade, UF e país, `areaServed` Brasil e os serviços em `hasOfferCatalog`), mais o `WebSite`. Dois nós (um `Organization` e um `ProfessionalService` com `parentOrganization` apontando para ele) diriam que a PiluTech é filha de si mesma; o Google pede o subtipo mais específico de `Organization` para descrever a empresa, e o schema.org marca o `ProfessionalService` genérico como descontinuado ("deprecated due to confusion with Service"). O nó com os dois tipos mantém os nomes da spec; trocar por `LocalBusiness` é decisão do dono.
- **O contato do portfólio (`piluvitu.com.br`) fica fora do §6, de propósito.** O `mailto:` do `apps/web/components/profile-social-strip.tsx` e o formulário do `components/email-contact-dialog.tsx` (POST ao FormSubmit) também chegam em `pilutechinformatica@gmail.com`, sem `[Projeto]` no assunto. A spec §6 lista os projetos (PiluTech, Botaí, Sombraí), e o portfólio é o site pessoal do dono, não um projeto. Se o dono quiser filtrar também esse contato, é um PR à parte: `mailtoDaPilutech('PiluVitu', 'Contato pelo site')` no strip e um `_subject` com o mesmo prefixo no POST do FormSubmit.
- **Duas dependências novas:** `@fortawesome/free-regular-svg-icons` (o envelope do design é `fa-regular`), fixado em `7.2.0`, a mesma versão dos outros três pacotes do Font Awesome no lock, para o `fontawesome-common-types` continuar único; e `@fontsource/plus-jakarta-sans@5.3.0` (o pacote estático, com `.woff`: o `ImageResponse` não lê `woff2`, e o `@fontsource-variable` que o Botaí já usa só tem `woff2`).
- **Lógica pura compartilhada vai para `@piluvitu/tools`:** `contato.ts` novo (`EMAIL_DA_PILUTECH`, `mailtoDaPilutech`) e `urlsDasLojas` em `pilulabs.ts` (a normalização das 4 URLs que o `apps/botai-site/lib/cms.ts` fazia à mão; ele passa a usar a do pacote). Ficam no app, como no molde, o que é cola de app: `lib/site.ts`, `components/json-ld.tsx` e `scripts/conferir-rotas-estaticas.mjs`.

## Mapa de arquivos

**Novos (`packages/tools`):** `src/contato.ts` (+ `.test.ts`).

**Novos (`apps/pilutech-site`):**

```
package.json  tsconfig.json  next.config.ts (+ .test.ts)  postcss.config.mjs  eslint.config.mjs
jest.config.ts  jest.setup.ts  playwright.config.ts  playwright.lojas.config.ts  vercel.json  vercel.test.ts  .env.example  .prettierignore  CLAUDE.md
.storybook/main.ts  .storybook/preview.tsx
scripts/conferir-rotas-estaticas.mjs (+ .test.mjs)
app/globals.css (+ globals.test.ts)  app/layout.tsx  app/page.tsx  app/pagina.e2e.ts  app/seo.e2e.ts
app/lojas-publicadas.yaml  app/lojas-publicadas.e2e.ts
app/icon.tsx  app/apple-icon.tsx  app/opengraph-image.tsx  app/twitter-image.tsx
app/sitemap.ts  app/robots.ts  app/manifest.ts (+ .test.ts de cada um)
lib/tokens-do-ds.ts  lib/font-awesome.ts  lib/marca.ts  lib/imagem-do-icone.tsx  lib/imagem-og.tsx
lib/contato.ts  lib/cms.ts  lib/conteudo.ts  lib/site.ts  lib/seo.ts  lib/json-ld.ts   (+ .test.ts(x) de cada um, menos os de imagem)
components/classes.ts
components/cabecalho-secao  pilutech-mark  terminal  hero  servicos  como-funciona  projetos  tecnologias  planos
components/acordeao  duvidas  barra  contato  rodape  whatsapp-flutuante  landing   (cada .tsx com .test.tsx e .stories.tsx)
components/json-ld.tsx (+ .test.tsx)
```

**Alterados:** `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `.gitignore`, `Makefile`, `.github/workflows/ci.yml`, `CLAUDE.md` (raiz), `packages/tools/{package.json,src/pilulabs.ts,src/pilulabs.test.ts,CLAUDE.md}`, `packages/ui/CLAUDE.md`, `apps/botai-site/{lib/cms.ts,lib/conteudo.ts,lib/conteudo.test.ts,lib/json-ld.ts,lib/json-ld.test.ts,components/landing.tsx,components/landing.test.tsx,components/rodape.tsx,components/rodape.test.tsx,components/topo.test.tsx,components/topo.stories.tsx,app/privacidade/page.tsx,app/privacidade/page.test.tsx,app/privacidade/privacidade.e2e.ts,app/termos/page.tsx,app/termos/page.test.tsx,app/pagina.e2e.ts,CLAUDE.md}`, `apps/botai/{README.md,CLAUDE.md}`, `apps/web/**` (Tarefa 8).

**Removidos (`apps/web`):** `proxy.ts`, `proxy.test.ts`, `lib/pilutech-dominios.ts`, `lib/pilutech-dominios.test.ts`, `app/(site)/pilulabs/subdominios.e2e.ts`, `app/(site)/pilulabs/chave-ligada.e2e.ts`.

---

### Tarefa 1: Esqueleto do `apps/pilutech-site`

App Next 16 mínimo no padrão do `apps/botai-site`: Tailwind 4 + `@piluvitu/ui` com `@source` e gate, `next/font`, Font Awesome com o CSS na camada `base`, Jest + Testing Library, Storybook próprio (6020), Playwright (3021, build de produção), ESLint, `tsc`, conferência de rotas estáticas, `vercel.json` com `ignoreCommand`, alvos do `Makefile` e job no CI. Todas as dependências do app entram aqui, num `pnpm install` só. O `CabecalhoSecao` entra já no formato do design (rótulo + contagem + linha + `h2`), porque o Storybook precisa de uma story para buildar.

**Files:**

- Modify: `pnpm-workspace.yaml`, `pnpm-lock.yaml` (gerado), `.gitignore`, `Makefile`, `.github/workflows/ci.yml`
- Create (`apps/pilutech-site/`): `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `jest.config.ts`, `jest.setup.ts`, `playwright.config.ts`, `vercel.json`, `vercel.test.ts`, `.env.example`, `.prettierignore`, `.storybook/main.ts`, `.storybook/preview.tsx`, `app/globals.css`, `app/globals.test.ts`, `app/layout.tsx`, `app/page.tsx`, `app/pagina.e2e.ts`, `lib/tokens-do-ds.ts`, `lib/tokens-do-ds.test.ts`, `lib/font-awesome.ts`, `lib/font-awesome.test.ts`, `components/cabecalho-secao.tsx`, `components/cabecalho-secao.test.tsx`, `components/cabecalho-secao.stories.tsx`, `scripts/conferir-rotas-estaticas.mjs`, `scripts/conferir-rotas-estaticas.test.mjs`, `CLAUDE.md`

**Interfaces:**

- Consumes: `@piluvitu/ui/styles.css`, `@piluvitu/ui/cn`, `scripts/check-tailwind-source.mjs` (raiz).
- Produces:
  - `CabecalhoSecao({ id, rotulo, contagem, titulo, tom, children }: { id: string; rotulo: string; contagem: number; titulo: string; tom?: 'padrao' | 'petroleo'; children?: ReactNode })`: rótulo mono em caixa alta, contagem com 2 dígitos (`aria-hidden`), linha, e o `h2` com o `id` (a seção aponta para ele com `aria-labelledby`); `children` entra depois do título.
  - `lib/tokens-do-ds.ts`: `type Tema = 'claro' | 'escuro'`; `lerCssDoDs(): string`; `tokenDoDs(tema: Tema, nome: string, css?: string): string` (o triplo HSL, ex. `'220 33% 5%'`); `hslParaHex(triplo: string): string` (ex. `'#090b11'`); `rgbDoToken(tema: Tema, nome: string, css?: string): string` (como o `getComputedStyle` devolve, ex. `'rgb(9, 11, 17)'`). Só os testes (Jest e E2E) importam.
  - Cores do app no `@theme` (`app/globals.css`): `noite`, `grafite`, `ciano`, `ciano-claro`, `petroleo-cartao`, `petroleo-borda`, `petroleo-linha` (classes `bg-noite`, `text-ciano` etc.). E, num `@theme inline`, as 32 cores do `@piluvitu/ui` que dependem de variável, para o `dark` de uma seção valer (ver "Decisões").
  - `scripts/conferir-rotas-estaticas.mjs`: `export const ROTAS: string[]`; `export function rotasNaoEstaticas(rotasDoManifesto, rotas): string[]`. As Tarefas 2 e 7 acrescentam rotas em `ROTAS`.
  - Scripts do pacote: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, `storybook`, `build-storybook`, `prettier:check`, `prettier:fix`.
  - Storybook: global `fundo` (`'claro' | 'escuro'`, padrão escuro); `parameters.layout: 'fullscreen'` tira o `p-6` do decorador.

- [ ] **Step 1: Workspace, `.gitignore`, `package.json` e install**

Em `pnpm-workspace.yaml`, depois de `  - 'apps/botai-site'`, acrescente `  - 'apps/pilutech-site'`.

`.gitignore`: depois de `apps/botai-site/playwright-report/`, acrescente o bloco abaixo. Ele entra antes de qualquer build: o Tailwind não varre o que o `.gitignore` ignora, e o bundle do Storybook traz o nome da classe sentinela (está em `apps/botai-site/storybook-static/main.*.iframe.bundle.js`). Com o `storybook-static/` fora do `.gitignore`, a prova do gate do Step 7 sairia `exit=0` com o `@source` comentado.

```gitignore

# Landing da PiluTech: mesmo motivo
apps/pilutech-site/storybook-static/
apps/pilutech-site/playwright-report/
```

`apps/pilutech-site/package.json` (os ranges são os do `apps/botai-site`, para o pnpm reaproveitar as versões do lock; o `free-regular` vai fixo em `7.2.0`, a versão dos outros pacotes do Font Awesome no lock, para o `fontawesome-common-types` continuar único):

```json
{
  "name": "@pilutech/site",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3021",
    "build": "next build && node ../../scripts/check-tailwind-source.mjs .next && node scripts/conferir-rotas-estaticas.mjs",
    "start": "next start -p 3021",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "jest && node --test scripts/*.test.mjs",
    "test:e2e": "playwright test",
    "storybook": "storybook dev -p 6020",
    "build-storybook": "storybook build",
    "prettier:check": "prettier --check \"**/*.{js,mjs,ts,tsx,json,md,css}\"",
    "prettier:fix": "prettier --write \"**/*.{js,mjs,ts,tsx,json,md,css}\""
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{js,mjs,cjs,json,md,css}": "prettier --write"
  },
  "dependencies": {
    "@fontsource/plus-jakarta-sans": "^5.3.0",
    "@fortawesome/fontawesome-svg-core": "^7.2.0",
    "@fortawesome/free-brands-svg-icons": "^7.2.0",
    "@fortawesome/free-regular-svg-icons": "7.2.0",
    "@fortawesome/free-solid-svg-icons": "^7.2.0",
    "@fortawesome/react-fontawesome": "^3.3.0",
    "@piluvitu/tools": "workspace:*",
    "@piluvitu/ui": "workspace:*",
    "next": "16.3.8",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "yaml": "^2.9.0"
  },
  "devDependencies": {
    "@playwright/test": "1.59.1",
    "@storybook/nextjs": "10.3.1",
    "@tailwindcss/postcss": "^4.2.2",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "@types/jest": "^30.0.0",
    "@types/node": "^25.5.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "axe-core": "4.11.1",
    "eslint": "^9.39.4",
    "eslint-config-next": "16.3.8",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-storybook": "10.3.1",
    "jest": "^30.4.2",
    "jest-environment-jsdom": "^30.4.1",
    "postcss": "^8.5.8",
    "prettier": "^3.8.1",
    "prettier-plugin-tailwindcss": "^0.7.2",
    "storybook": "10.3.1",
    "tailwindcss": "^4.2.2",
    "ts-jest": "^29.4.9",
    "typescript": "^5.9.3"
  }
}
```

Run:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && pnpm install; echo "install exit=$?"
pnpm dedupe --check; echo "dedupe exit=$?"
/usr/bin/git diff -U0 pnpm-lock.yaml | /usr/bin/grep -E "^\+  ['@a-z]" ; echo "grep exit=$?"
cd apps/web && ./node_modules/.bin/jest components/admin/posts/mdx-editor.codemirror.test.ts; echo "codemirror exit=$?"
```

Expected: `install`, `dedupe` e `codemirror` com `exit=0`. As chaves novas do lock são o importer `apps/pilutech-site:` e, em `packages:` e `snapshots:`, só `'@fontsource/plus-jakarta-sans@5.3.0'` e `'@fortawesome/free-regular-svg-icons@7.2.0'` (pode aparecer snapshot novo de um pacote que já está em `packages:`, com outro conjunto de peers). Versão nova de qualquer outro pacote é defeito: fixe no `package.json` a versão que o lock já tem e rode de novo. Nenhum dos dois pacotes novos tem script de install (o `pnpm install` não pede `allowBuilds`).

- [ ] **Step 2: Configuração do app (sem fonte ainda)**

`apps/pilutech-site/tsconfig.json`:

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    },
    "target": "ES2017"
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

`apps/pilutech-site/next.config.ts` (a Tarefa 4 acrescenta os `remotePatterns`):

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: { formats: ['image/avif', 'image/webp'] },
}

export default nextConfig
```

`apps/pilutech-site/postcss.config.mjs`:

```js
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
```

`apps/pilutech-site/eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from 'eslint/config'
import nextTs from 'eslint-config-next/typescript'
import nextVitals from 'eslint-config-next/core-web-vitals'
import prettier from 'eslint-config-prettier/flat'
import storybook from 'eslint-plugin-storybook'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...storybook.configs['flat/recommended'],
  prettier,
  globalIgnores([
    '.next/**',
    'out/**',
    'next-env.d.ts',
    'storybook-static/**',
    'node_modules/**',
    'test-results/**',
    'playwright-report/**',
    '**/*.tsbuildinfo',
  ]),
])
```

`apps/pilutech-site/jest.config.ts`:

```ts
import type { Config } from 'jest'

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { moduleResolution: 'node' } }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@piluvitu/tools/(.*)$': '<rootDir>/../../packages/tools/src/$1',
  },
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  modulePathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/storybook-static/'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/.next/',
    '<rootDir>/storybook-static/',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
}

export default config
```

`apps/pilutech-site/jest.setup.ts`:

```ts
import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from 'node:util'

// O react-dom/server (renderToStaticMarkup, no teste do acordeão) usa os dois, e o jsdom não os traz.
Object.assign(global, { TextEncoder, TextDecoder })
```

`apps/pilutech-site/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testMatch: ['**/*.e2e.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3021',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm run build && pnpm run start',
    url: 'http://localhost:3021',
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    cwd: '.',
  },
})
```

`apps/pilutech-site/vercel.json` (o selo do Botaí sai do YAML do `apps/web`, que não é dependência deste pacote):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- . ../../packages/ui ../../packages/tools ../web/content/pilulabs/botai ../../pnpm-lock.yaml ../../pnpm-workspace.yaml ../../package.json ../../scripts/check-tailwind-source.mjs"
}
```

`apps/pilutech-site/.env.example`:

```bash
# URL pública (metadataBase, canonical, og:url, JSON-LD, sitemap e robots).
# Ausente, vale https://pilutech.com.br, inclusive no preview da Vercel, que já
# responde com X-Robots-Tag: noindex. Só para conferir o site num host próprio:
# SITE_URL=http://localhost:3021

# Search Console: só o content da meta google-site-verification.
# GOOGLE_SITE_VERIFICATION=
```

`apps/pilutech-site/.prettierignore`:

```
.next
storybook-static
next-env.d.ts
test-results
playwright-report
```

`apps/pilutech-site/.storybook/main.ts` (sem `staticDirs`: o app não tem `public/`, e o Storybook falha com uma pasta que não existe):

```ts
import type { StorybookConfig } from '@storybook/nextjs'

const config: StorybookConfig = {
  stories: ['../components/**/*.stories.@(ts|tsx)'],
  framework: { name: '@storybook/nextjs', options: {} },
}

export default config
```

`apps/pilutech-site/.storybook/preview.tsx`:

```tsx
import type { Preview } from '@storybook/nextjs'
import { cn } from '@piluvitu/ui/cn'
import '../app/globals.css'
import '../lib/font-awesome'

// As seções claras dependem de NÃO estar dentro de .dark: a story de uma delas usa fundo claro.
const preview: Preview = {
  initialGlobals: { fundo: 'escuro' },
  globalTypes: {
    fundo: {
      description: 'Contexto de cor atrás do componente',
      toolbar: {
        title: 'Fundo',
        icon: 'mirror',
        items: [
          { value: 'claro', title: 'Claro (Névoa)' },
          { value: 'escuro', title: 'Escuro (Noite)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, { globals, parameters }) => (
      <div
        className={cn(
          globals.fundo === 'claro' ? undefined : 'dark',
          'bg-background text-foreground min-h-svh',
          parameters.layout === 'fullscreen' ? undefined : 'p-6',
        )}
      >
        <Story />
      </div>
    ),
  ],
}

export default preview
```

- [ ] **Step 3: Escreva os testes que falham**

`apps/pilutech-site/vercel.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const { ignoreCommand } = JSON.parse(
  readFileSync(join(__dirname, 'vercel.json'), 'utf8'),
) as { ignoreCommand: string }

const [comando, caminhos] = ignoreCommand.split(' -- ')

describe('vercel.json (Ignored Build Step)', () => {
  // exit 0 cancela o build; o git diff --quiet sai 0 quando nada mudou.
  it('cancela o build só quando nada que a landing usa mudou', () => {
    expect(comando).toBe('git diff --quiet HEAD^ HEAD')
  })

  // O selo do Botaí sai do YAML do apps/web: sem ele aqui, publicar uma loja pelo /admin não rebuilda a landing.
  it('vigia o app, os pacotes, a entrada do Botaí no CMS e os arquivos de install e build', () => {
    expect(caminhos.split(' ')).toEqual([
      '.',
      '../../packages/ui',
      '../../packages/tools',
      '../web/content/pilulabs/botai',
      '../../pnpm-lock.yaml',
      '../../pnpm-workspace.yaml',
      '../../package.json',
      '../../scripts/check-tailwind-source.mjs',
    ])
  })

  it('todo caminho vigiado existe (um rename deixaria o build preso no passado)', () => {
    for (const caminho of caminhos.split(' '))
      expect([caminho, existsSync(join(__dirname, caminho))]).toEqual([
        caminho,
        true,
      ])
  })
})
```

`apps/pilutech-site/scripts/conferir-rotas-estaticas.test.mjs`:

```js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rotasNaoEstaticas } from './conferir-rotas-estaticas.mjs'

const estatica = { initialRevalidateSeconds: false }

test('rota estática passa, com ou sem o sufixo de hash das imagens', () => {
  assert.deepEqual(
    rotasNaoEstaticas({ '/': estatica, '/opengraph-image-1a2b3c': estatica }, [
      '/',
      '/opengraph-image',
    ]),
    [],
  )
})

test('rota com revalidate falha', () => {
  assert.deepEqual(
    rotasNaoEstaticas({ '/': { initialRevalidateSeconds: 60 } }, ['/']),
    ['/'],
  )
})

test('rota fora do manifesto falha: virou dinâmica ou sumiu', () => {
  assert.deepEqual(rotasNaoEstaticas({}, ['/icon']), ['/icon'])
})

test('a rota não é confundida com uma filha', () => {
  assert.deepEqual(rotasNaoEstaticas({ '/icon/x': estatica }, ['/icon']), [
    '/icon',
  ])
})
```

`apps/pilutech-site/lib/tokens-do-ds.test.ts`:

```ts
import { hslParaHex, rgbDoToken, tokenDoDs } from './tokens-do-ds'

describe('tokenDoDs', () => {
  // As cores do design (marca-CLAUDE.md) são estes tokens do @piluvitu/ui.
  it('lê o triplo HSL do tema escuro e do claro', () => {
    expect(tokenDoDs('escuro', 'background')).toBe('220 33% 5%')
    expect(tokenDoDs('escuro', 'primary')).toBe('198 93% 60%')
    expect(tokenDoDs('claro', 'primary')).toBe('198 93% 26%')
    expect(tokenDoDs('claro', 'background')).toBe('220 50% 98%')
  })

  it('não confunde --primary com --primary-foreground', () => {
    expect(tokenDoDs('escuro', 'primary-foreground')).toBe('200 75% 6%')
  })

  it('token que não existe lança, em vez de devolver vazio', () => {
    expect(() => tokenDoDs('escuro', 'nao-existe')).toThrow(/--nao-existe/)
  })
})

describe('hslParaHex', () => {
  it.each([
    ['220 33% 5%', '#090b11'],
    ['198 93% 60%', '#3abff8'],
    ['215 33% 93%', '#e7ecf3'],
    ['216 17% 64%', '#94a0b3'],
  ])('%s → %s', (triplo, hex) => {
    expect(hslParaHex(triplo)).toBe(hex)
  })
})

// Os E2E comparam com o getComputedStyle do Chromium, que devolve rgb(r, g, b).
describe('rgbDoToken', () => {
  it.each([
    ['escuro', 'background', 'rgb(9, 11, 17)'],
    ['escuro', 'primary', 'rgb(58, 191, 248)'],
    ['claro', 'background', 'rgb(247, 249, 252)'],
    ['claro', 'primary', 'rgb(5, 91, 128)'],
  ] as const)('%s/%s → %s', (tema, nome, rgb) => {
    expect(rgbDoToken(tema, nome)).toBe(rgb)
  })
})
```

`apps/pilutech-site/app/globals.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { lerCssDoDs, tokenDoDs } from '@/lib/tokens-do-ds'

const CSS = readFileSync(join(__dirname, 'globals.css'), 'utf8')

function corDoApp(nome: string): string {
  const achado = new RegExp(`--color-${nome}:\\s*hsl\\(([^)]+)\\);`).exec(CSS)
  if (!achado) throw new Error(`--color-${nome} não está no @theme`)
  return achado[1].trim()
}

function blocoInline(): string {
  const inicio = CSS.indexOf('@theme inline {')
  if (inicio < 0) throw new Error('o globals.css não tem @theme inline')
  return CSS.slice(inicio, CSS.indexOf('}', inicio))
}

// As cores do @piluvitu/ui que dependem de uma variável (--color-x: hsl(var(--x))), com o valor.
function coresComVariavelDoDs(): [string, string][] {
  return [
    ...lerCssDoDs().matchAll(/--color-([a-z0-9-]+):\s*([^;]*var\(--[^;]+);/g),
  ].map((achado) => [achado[1], achado[2].trim()])
}

// Decisões do plano: o @theme do pacote não é inline, o Tailwind resolve a cor no :root e os
// filhos herdam a clara. Sem este bloco, o `dark` de uma seção não muda cor nenhuma, e só a cor
// computada (E2E) mostraria.
it('o @theme inline redeclara toda cor do design system que depende de variável', () => {
  const cores = coresComVariavelDoDs()
  expect(cores.map(([nome]) => nome)).toEqual(
    expect.arrayContaining([
      'background',
      'foreground',
      'primary',
      'ring',
      'ok',
    ]),
  )
  const bloco = blocoInline()
  expect(
    cores
      .filter(([nome, valor]) => !bloco.includes(`--color-${nome}: ${valor};`))
      .map(([nome]) => nome),
  ).toEqual([])
})

// Estas cores do app repetem o .dark do @piluvitu/ui: se o design system mudar a Noite, o teste avisa.
it.each([
  ['noite', 'background'],
  ['grafite', 'card'],
  ['ciano', 'primary'],
])('--color-%s é o --%s do tema escuro do @piluvitu/ui', (cor, token) => {
  expect(corDoApp(cor)).toBe(tokenDoDs('escuro', token))
})

it('importa o design system e o @source dele (o gate do build confere o efeito)', () => {
  expect(CSS).toContain("@import '@piluvitu/ui/styles.css';")
  expect(CSS).toContain("@source '../../../packages/ui/src';")
})

it('rolagem suave só para quem não pediu menos movimento', () => {
  expect(CSS).toMatch(
    /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*html\s*\{\s*scroll-behavior: smooth;/,
  )
})
```

`apps/pilutech-site/lib/font-awesome.test.ts`:

```ts
import { config } from '@fortawesome/fontawesome-svg-core'
import './font-awesome'

// Injetado em runtime, fora de camada, o CSS do Font Awesome venceria o `hidden` e o `size-*`.
it('o Font Awesome não injeta CSS: ele vem do globals.css, na camada base', () => {
  expect(config.autoAddCss).toBe(false)
})
```

`apps/pilutech-site/components/cabecalho-secao.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { CabecalhoSecao } from './cabecalho-secao'

describe('CabecalhoSecao', () => {
  // A seção aponta para ele com aria-labelledby.
  it('o título é o h2 com o id recebido', () => {
    render(
      <CabecalhoSecao
        id="servicos-titulo"
        rotulo="Serviços"
        contagem={3}
        titulo="Do primeiro protótipo ao servidor em produção."
      />,
    )
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Do primeiro protótipo ao servidor em produção.',
      }),
    ).toHaveAttribute('id', 'servicos-titulo')
  })

  it('o rótulo e a contagem com dois dígitos ficam fora do título', () => {
    render(
      <CabecalhoSecao
        id="duvidas-titulo"
        rotulo="Perguntas frequentes"
        contagem={5}
        titulo="Dúvidas comuns"
      />,
    )
    expect(screen.getByText('Perguntas frequentes')).toBeInTheDocument()
    expect(screen.getByText('05')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      /^Dúvidas comuns$/,
    )
  })

  it('no tom padrão, o rótulo usa o destaque do contexto e a linha a borda', () => {
    const { container } = render(
      <CabecalhoSecao id="a" rotulo="Projetos" contagem={2} titulo="T" />,
    )
    expect(screen.getByText('Projetos')).toHaveClass('text-primary')
    expect(container.querySelector('.h-px')).toHaveClass('bg-border')
  })

  it('no Petróleo, rótulo e contagem em branco e a linha clara do design', () => {
    const { container } = render(
      <CabecalhoSecao
        id="planos-titulo"
        rotulo="Planos de manutenção"
        contagem={3}
        titulo="Seu aplicativo atualizado, monitorado e no ar."
        tom="petroleo"
      />,
    )
    expect(screen.getByText('Planos de manutenção')).toHaveClass(
      'text-primary-foreground',
    )
    expect(screen.getByText('03')).toHaveClass('text-primary-foreground')
    expect(container.querySelector('.h-px')).toHaveClass('bg-petroleo-linha')
  })

  it('o texto de apoio vem depois do título', () => {
    render(
      <CabecalhoSecao id="b" rotulo="Planos" contagem={3} titulo="Título">
        <p>Planos mensais.</p>
      </CabecalhoSecao>,
    )
    const titulo = screen.getByRole('heading', { level: 2 })
    const apoio = screen.getByText('Planos mensais.')
    expect(
      titulo.compareDocumentPosition(apoio) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  // Review Focus 1: a 320 px, palavra longa quebra em vez de vazar para o gutter.
  it('o título quebra palavra longa em vez de vazar', () => {
    render(<CabecalhoSecao id="c" rotulo="R" contagem={1} titulo="T" />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass(
      'wrap-break-word',
    )
  })
})
```

- [ ] **Step 4: Rode os testes e confirme que falham**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/jest; echo "jest exit=$?"
node --test scripts/*.test.mjs; echo "node-test exit=$?"
```

Expected: `jest exit=1`, com 4 suítes falhando e 1 passando. Falham `Cannot find module './tokens-do-ds'`, `'./font-awesome'` e `'./cabecalho-secao'`, e o `globals.test.ts` com `Could not locate module @/lib/tokens-do-ds mapped as: …` (o import vem antes do `readFileSync`, e é a mensagem do Jest para caminho do `moduleNameMapper` que não existe). O `vercel.test.ts` já passa. `node-test exit=1` (`Cannot find module … conferir-rotas-estaticas.mjs`).

- [ ] **Step 5: Implemente o mínimo**

`apps/pilutech-site/lib/tokens-do-ds.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export type Tema = 'claro' | 'escuro'

export function lerCssDoDs(): string {
  return readFileSync(
    join(__dirname, '..', '..', '..', 'packages', 'ui', 'src', 'styles.css'),
    'utf8',
  )
}

export function tokenDoDs(
  tema: Tema,
  nome: string,
  css: string = lerCssDoDs(),
): string {
  const seletor = tema === 'claro' ? ':root {' : '.dark {'
  const inicio = css.indexOf(seletor)
  const bloco = inicio < 0 ? '' : css.slice(inicio, css.indexOf('}', inicio))
  const achado = new RegExp(`--${nome}:\\s*([^;]+);`).exec(bloco)
  if (!achado)
    throw new Error(`--${nome} não está no bloco ${seletor} do @piluvitu/ui`)
  return achado[1].trim()
}

export function hslParaHex(triplo: string): string {
  const [h, s, l] = triplo.replace(/%/g, '').trim().split(/\s+/).map(Number)
  const sat = s / 100
  const luz = l / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(luz, 1 - luz)
  const canal = (n: number) =>
    luz - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return `#${[0, 8, 4]
    .map((n) =>
      Math.round(canal(n) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

export function rgbDoToken(tema: Tema, nome: string, css?: string): string {
  const hex = hslParaHex(tokenDoDs(tema, nome, css))
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}
```

`apps/pilutech-site/lib/font-awesome.ts`:

```ts
import { config } from '@fortawesome/fontawesome-svg-core'

// O CSS do Font Awesome entra pelo globals.css, na camada base: injetado em runtime, fora de camada, venceria o `hidden` e o `size-*`.
config.autoAddCss = false
```

`apps/pilutech-site/app/globals.css`:

```css
@import 'tailwindcss';
@import '@fortawesome/fontawesome-svg-core/styles.css' layer(base);
@import '@piluvitu/ui/styles.css';
@source '../../../packages/ui/src';
/* A documentação do app não pode mudar o CSS da landing (o Tailwind varre os .md). */
@source not '../*.md';

@theme {
  --color-noite: hsl(220 33% 5%);
  --color-grafite: hsl(222 36% 9%);
  --color-ciano: hsl(198 93% 60%);
  --color-ciano-claro: hsl(198 93% 68%);
  --color-petroleo-cartao: hsl(198 93% 20%);
  --color-petroleo-borda: hsl(198 60% 40%);
  --color-petroleo-linha: hsl(198 60% 45%);
}

/* O @theme do @piluvitu/ui não é inline: a cor sairia resolvida no :root, e o `dark` de uma seção não mudaria nada. */
@theme inline {
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-success: hsl(var(--success));
  --color-success-foreground: hsl(var(--success-foreground));
  --color-ok: hsl(var(--ok));
  --color-ok-foreground: hsl(var(--ok-foreground));
  --color-warn: hsl(var(--warn));
  --color-warn-foreground: hsl(var(--warn-foreground));
  --color-win: hsl(var(--win));
  --color-win-foreground: hsl(var(--win-foreground));
  --color-chart-1: hsl(var(--chart-1));
  --color-chart-2: hsl(var(--chart-2));
  --color-chart-3: hsl(var(--chart-3));
  --color-chart-4: hsl(var(--chart-4));
  --color-chart-5: hsl(var(--chart-5));
}

@layer base {
  * {
    @apply border-border;
  }

  html {
    scroll-padding-top: 72px;
  }

  @media (prefers-reduced-motion: no-preference) {
    html {
      scroll-behavior: smooth;
    }
  }

  body {
    @apply bg-noite text-foreground font-sans antialiased;
  }
}
```

`apps/pilutech-site/app/layout.tsx` (a Tarefa 7 troca o `metadata` pelo do SEO):

```tsx
import type { Metadata } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import type { ReactNode } from 'react'
import '@/lib/font-awesome'
import './globals.css'

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

export const metadata: Metadata = { title: 'PiluTech' }

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

`apps/pilutech-site/components/cabecalho-secao.tsx`:

```tsx
import { cn } from '@piluvitu/ui/cn'
import type { ReactNode } from 'react'

type CabecalhoSecaoProps = {
  id: string
  rotulo: string
  contagem: number
  titulo: string
  tom?: 'padrao' | 'petroleo'
  children?: ReactNode
}

export function CabecalhoSecao({
  id,
  rotulo,
  contagem,
  titulo,
  tom = 'padrao',
  children,
}: CabecalhoSecaoProps) {
  const petroleo = tom === 'petroleo'
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3.5">
        <p
          className={cn(
            'font-mono text-[13px] font-semibold tracking-[0.2em] uppercase',
            petroleo ? 'text-primary-foreground' : 'text-primary',
          )}
        >
          {rotulo}
        </p>
        <span
          aria-hidden
          className={cn(
            'font-mono text-[13px]',
            petroleo ? 'text-primary-foreground' : 'text-muted-foreground',
          )}
        >
          {String(contagem).padStart(2, '0')}
        </span>
        <span
          aria-hidden
          className={cn(
            'h-px flex-1',
            petroleo ? 'bg-petroleo-linha' : 'bg-border',
          )}
        />
      </div>
      <h2
        id={id}
        className="max-w-[760px] text-[clamp(30px,3.6vw,44px)] leading-[1.1] font-extrabold tracking-[-0.03em] text-balance wrap-break-word"
      >
        {titulo}
      </h2>
      {children}
    </div>
  )
}
```

`apps/pilutech-site/components/cabecalho-secao.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { CabecalhoSecao } from './cabecalho-secao'

const meta = {
  title: 'Landing/CabecalhoSecao',
  component: CabecalhoSecao,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof CabecalhoSecao>

export default meta
type Story = StoryObj<typeof meta>

export const Claro: Story = {
  args: {
    id: 'servicos-titulo',
    rotulo: 'Serviços',
    contagem: 3,
    titulo: 'Do primeiro protótipo ao servidor em produção.',
  },
  globals: { fundo: 'claro' },
}
export const Escuro: Story = {
  args: {
    id: 'como-funciona-titulo',
    rotulo: 'Como funciona',
    contagem: 4,
    titulo: 'Quatro etapas, com escopo e valor por escrito.',
  },
}
export const Petroleo: Story = {
  args: {
    id: 'planos-titulo',
    rotulo: 'Planos de manutenção',
    contagem: 3,
    titulo: 'Seu aplicativo atualizado, monitorado e no ar.',
    tom: 'petroleo',
  },
  globals: { fundo: 'claro' },
  decorators: [
    (Story) => (
      <div className="bg-primary text-primary-foreground p-8">
        <Story />
      </div>
    ),
  ],
}
```

`apps/pilutech-site/scripts/conferir-rotas-estaticas.mjs`:

```js
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROTAS = ['/']

function escaparRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function rotasNaoEstaticas(rotasDoManifesto, rotas) {
  const chaves = Object.keys(rotasDoManifesto)
  return rotas.filter((rota) => {
    const padrao = new RegExp(`^${escaparRegex(rota)}(-[a-z0-9]+)?$`)
    const chave = chaves.find((k) => padrao.test(k))
    return (
      chave === undefined ||
      rotasDoManifesto[chave].initialRevalidateSeconds !== false
    )
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifesto = JSON.parse(
    readFileSync(
      join(process.cwd(), '.next', 'prerender-manifest.json'),
      'utf8',
    ),
  )
  const falhas = rotasNaoEstaticas(manifesto.routes, ROTAS)
  if (falhas.length > 0) {
    console.error(
      `Rota que deixou de ser estática (ou sumiu do build): ${falhas.join(', ')}`,
    )
    process.exit(1)
  }
  console.log(`Rotas estáticas: ${ROTAS.join(', ')}`)
}
```

`apps/pilutech-site/app/page.tsx` (provisório; a Tarefa 4 troca pela landing):

```tsx
import { CabecalhoSecao } from '@/components/cabecalho-secao'

export default function Home() {
  return (
    <main className="dark bg-background text-foreground min-h-svh px-6 py-16">
      <h1 className="text-4xl font-extrabold">PiluTech</h1>
      <CabecalhoSecao
        id="esqueleto-titulo"
        rotulo="Em construção"
        contagem={0}
        titulo="Landing da PiluTech"
      />
    </main>
  )
}
```

`apps/pilutech-site/app/pagina.e2e.ts` (fumaça; cresce nas Tarefas 4 a 6):

```ts
import { expect, test } from '@playwright/test'
import { rgbDoToken } from '../lib/tokens-do-ds'

test('/ responde com o h1', async ({ page }) => {
  const resposta = await page.goto('/')
  expect(resposta?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('PiluTech')
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
})

// Review Focus 6: sem o @theme inline do globals.css, o `dark` do <main> não muda a cor (sai Névoa).
test('o elemento com `dark` pega as cores do tema escuro', async ({ page }) => {
  await page.goto('/')
  const cores = await page.locator('main').evaluate((el) => {
    const estilo = getComputedStyle(el)
    return { fundo: estilo.backgroundColor, texto: estilo.color }
  })
  expect(cores).toEqual({
    fundo: rgbDoToken('escuro', 'background'),
    texto: rgbDoToken('escuro', 'foreground'),
  })
})
```

- [ ] **Step 6: Rode os testes e confirme que passam**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && pnpm run test; echo "test exit=$?"
```

Expected: Jest (5 suítes: `vercel`, `tokens-do-ds`, `globals`, `font-awesome` e `cabecalho-secao`) e `node --test` (4 testes) verdes, `test exit=0`.

- [ ] **Step 7: Lint, tsc, build (gate + rotas), Storybook e E2E de fumaça**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
pnpm run build; echo "build exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
lsof -nP -iTCP:3021 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test --retries=0; echo "e2e exit=$?"
```

Expected: tudo `exit=0`; o build termina com `Rotas estáticas: /` depois da linha de sucesso do gate. **Prova do gate (uma vez):** confira antes que o `storybook-static/` está ignorado (`/usr/bin/git check-ignore apps/pilutech-site/storybook-static; echo "exit=$?"` → `exit=0`, do Step 1): sem isso, o Tailwind varre o bundle do Storybook, acha a sentinela e a prova dá falso positivo. Comente o `@source '../../../packages/ui/src';` do `globals.css`, rode `pnpm run build; echo "exit=$?"` → `exit=1` com a mensagem do gate; restaure a linha (o `globals.test.ts` também acusaria) e rode de novo → `exit=0`. **Prova do `@theme inline` (uma vez):** comente o bloco `@theme inline` do `globals.css` e rode `CI=1 ./node_modules/.bin/playwright test --retries=0; echo "exit=$?"` → `exit=1` em "o elemento com `dark` pega as cores do tema escuro" (fundo `rgb(247, 249, 252)`); restaure e rode de novo → `exit=0`. Depois do Next, confira `/usr/bin/git status` (Global Constraints: arquivos que o Next gera para agentes).

- [ ] **Step 8: `Makefile`, CI e `CLAUDE.md` do app**

`Makefile`: acrescente `\` ao fim da linha `        dev-botai-site build-botai-site test-botai-site test-e2e-botai-site storybook-botai-site` e, abaixo dela, `        dev-pilutech-site build-pilutech-site test-pilutech-site test-e2e-pilutech-site storybook-pilutech-site` (fecha o `.PHONY`); no alvo `stop`, troque `for p in 8081 8082 3333 6017 3018 6018 3020 6019; do` por `for p in 8081 8082 3333 6017 3018 6018 3020 6019 3021 6020; do`; e, depois do alvo `storybook-botai-site`, acrescente:

```make
# --- pilutech-site (landing da PiluTech, Next 16) ---
# Dev em 3021 e Storybook em 6020. O E2E builda e serve a produção; rode com CI=1.
dev-pilutech-site:
	pnpm --filter @pilutech/site dev

build-pilutech-site:
	pnpm --filter @pilutech/site build

test-pilutech-site:
	pnpm --filter @pilutech/site test

test-e2e-pilutech-site:
	CI=1 pnpm --filter @pilutech/site test:e2e

storybook-pilutech-site:
	pnpm --filter @pilutech/site storybook
```

(Os comandos das receitas são recuados com TAB, como o resto do `Makefile`.)

`.github/workflows/ci.yml`: depois do job `botai-site` (último bloco do arquivo), acrescente o job abaixo **dentro de `jobs:`**, com 2 espaços a mais em cada linha (o bloco está sem o recuo de `jobs:`; `pilutech-site:` fica na mesma coluna de `botai-site:`):

```yaml
pilutech-site:
  name: PiluTech site (lint + tsc + test + build)
  runs-on: ubuntu-latest
  timeout-minutes: 15
  env:
    NEXT_TELEMETRY_DISABLED: '1'
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v4

    - uses: actions/setup-node@v4
      with:
        node-version: '22'
        cache: pnpm

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Lint
      run: pnpm --filter @pilutech/site run lint

    - name: Typecheck
      run: pnpm --filter @pilutech/site run typecheck

    - name: Test (jest + node --test)
      run: pnpm --filter @pilutech/site run test

    # O build lê apps/web/content/pilulabs/botai/index.yaml, que o checkout traz inteiro.
    - name: Build (+ gate do @source + rotas estáticas)
      run: pnpm --filter @pilutech/site run build
```

`apps/pilutech-site/CLAUDE.md` (inicial; a Tarefa 10 escreve a versão completa):

```markdown
# CLAUDE.md — `apps/pilutech-site` (`@pilutech/site`)

Landing da PiluTech em `https://pilutech.com.br`: Next 16 (App Router), React 19, TypeScript strict, Tailwind CSS 4 e `@piluvitu/ui`. O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz.

- **Spec:** `docs/superpowers/specs/2026-10-02-pilutech-site-design.md`. **Plano:** `docs/superpowers/plans/2026-10-02-pilutech-site.md`. **Design:** `docs/superpowers/design/2026-10-02-pilutech-landing/`.
- **Molde:** o `apps/botai-site` (mesma estrutura, gate, conferência de rotas, testes e deploy).

## Comandos

| Comando                        | O quê                                                              |
| ------------------------------ | ------------------------------------------------------------------ |
| `make dev-pilutech-site`       | `next dev` em http://localhost:3021                                |
| `make build-pilutech-site`     | `next build` + gate do `@source` + conferência das rotas estáticas |
| `make test-pilutech-site`      | Jest + `node --test` (scripts)                                     |
| `make test-e2e-pilutech-site`  | build de produção + `next start` na 3021 + Playwright (com `CI=1`) |
| `make storybook-pilutech-site` | Storybook em http://localhost:6020                                 |
```

Run: `cd /Users/piluvitu/WWW/PiluVitu-Dev && make -n test-pilutech-site; echo "exit=$?"` → imprime `pnpm --filter @pilutech/site test`, `exit=0`. E `./node_modules/.bin/prettier --check .github/workflows/ci.yml; echo "exit=$?"` (o YAML do CI precisa continuar válido; `exit=0`).

- [ ] **Step 9: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add pnpm-workspace.yaml pnpm-lock.yaml .gitignore Makefile .github/workflows/ci.yml apps/pilutech-site && /usr/bin/git status --short && /usr/bin/git commit -m "feat(pilutech-site): esqueleto da landing (Next 16, Tailwind 4, @piluvitu/ui, Jest, Storybook e Playwright)"; echo "exit=$?"
```

(Confira no `git status --short` que nada de `.next/`, `storybook-static/`, `test-results/`, `next-env.d.ts`, `tsconfig.tsbuildinfo` ou bloco gerado pelo Next entrou.)

---

### Tarefa 2: Símbolo `PiluTechMark` (variante 1a), favicon e `apple-icon`

O "P de 5 blocos" do `PiluTechMark.dc.html` vira dados (`lib/marca.ts`) e um SVG (`SvgDaMarca`), que serve tanto à página (cores pelos tokens do contexto: no escuro, texto claro e destaque Ciano; no claro, texto Grafite e destaque Petróleo, as duas versões da marca) quanto às imagens geradas (cores em hex, porque o Satori não tem CSS). O `PiluTechMark` junta o lockup "PiluTech" (Plus Jakarta Sans 800, tracking −0.035em, palavra a 60% do símbolo, espaço de 28%, como o `renderVals` do design). Do símbolo saem o `icon.tsx` (192 px, múltiplo de 48 como o Google pede, cantos arredondados) e o `apple-icon.tsx` (180 px, sem arredondar: o iOS arredonda).

**Files:**

- Create: `apps/pilutech-site/lib/marca.ts`, `apps/pilutech-site/lib/marca.test.ts`, `apps/pilutech-site/components/pilutech-mark.tsx`, `apps/pilutech-site/components/pilutech-mark.test.tsx`, `apps/pilutech-site/components/pilutech-mark.stories.tsx`, `apps/pilutech-site/lib/imagem-do-icone.tsx`, `apps/pilutech-site/app/icon.tsx`, `apps/pilutech-site/app/apple-icon.tsx`, `apps/pilutech-site/app/seo.e2e.ts`
- Modify: `apps/pilutech-site/scripts/conferir-rotas-estaticas.mjs` (`ROTAS`)

**Interfaces:**

- Consumes: `tokenDoDs`, `hslParaHex` (Tarefa 1, só nos testes); `cn` de `@piluvitu/ui/cn`.
- Produces:
  - `lib/marca.ts`: `NOME_DA_MARCA = 'PiluTech'`; `BLOCOS_DA_MARCA: readonly { x: number; y: number; destaque: boolean }[]`; `LADO_DO_BLOCO = 14`; `RAIO_DO_BLOCO = 3.5`; `CORES_DA_MARCA = { noite: '#090b11', texto: '#e7ecf3', ciano: '#3abff8', aco: '#94a0b3' }`; `proporcoesDoLockup(tamanho: number): { espaco: number; palavra: number }`; `LADO_DO_ICONE = 192`; `LADO_DO_APPLE_ICON = 180`.
  - `components/pilutech-mark.tsx`: `SvgDaMarca({ tamanho, cores, rotulo }: { tamanho: number; cores?: { base: string; destaque: string }; rotulo?: string })` (sem `cores`, os blocos usam `fill-foreground`/`fill-primary`; com `cores`, `fill` em hex; com `rotulo`, `role="img"` e `aria-label`, senão `aria-hidden`) e `PiluTechMark({ tamanho = 48, lockup = false, className }: { tamanho?: number; lockup?: boolean; className?: string })`.
  - `lib/imagem-do-icone.tsx`: `imagemDoIcone(lado: number, opcoes: { arredondado: boolean }): ImageResponse`.
  - Rotas `/icon` (192×192) e `/apple-icon` (180×180), estáticas.

- [ ] **Step 1: Escreva os testes que falham**

`apps/pilutech-site/lib/marca.test.ts`:

```ts
import {
  BLOCOS_DA_MARCA,
  CORES_DA_MARCA,
  LADO_DO_APPLE_ICON,
  LADO_DO_ICONE,
  NOME_DA_MARCA,
  proporcoesDoLockup,
} from './marca'
import { hslParaHex, tokenDoDs } from './tokens-do-ds'

describe('símbolo da PiluTech, variante 1a (PiluTechMark.dc.html)', () => {
  it('o P de 5 blocos de 14 no quadro de 48', () => {
    expect(BLOCOS_DA_MARCA).toEqual([
      { x: 8.5, y: 0, destaque: false },
      { x: 25.5, y: 0, destaque: true },
      { x: 8.5, y: 17, destaque: false },
      { x: 25.5, y: 17, destaque: false },
      { x: 8.5, y: 34, destaque: false },
    ])
  })

  it('só o bloco de cima à direita é o destaque', () => {
    expect(BLOCOS_DA_MARCA.filter((b) => b.destaque)).toEqual([
      { x: 25.5, y: 0, destaque: true },
    ])
  })

  it('o nome da marca', () => {
    expect(NOME_DA_MARCA).toBe('PiluTech')
  })

  // O design: gap = round(size * 0.28) e a palavra a round(size * 0.6).
  it.each([
    [30, { espaco: 8, palavra: 18 }],
    [28, { espaco: 8, palavra: 17 }],
    [120, { espaco: 34, palavra: 72 }],
  ])('lockup de %i px', (tamanho, esperado) => {
    expect(proporcoesDoLockup(tamanho)).toEqual(esperado)
  })

  // As imagens (favicon, apple-icon, OG) não têm CSS: o hex tem de ser o do .dark do @piluvitu/ui.
  it.each([
    ['noite', 'background'],
    ['texto', 'foreground'],
    ['ciano', 'primary'],
    ['aco', 'muted-foreground'],
  ] as const)('CORES_DA_MARCA.%s é o --%s do tema escuro', (cor, token) => {
    expect(CORES_DA_MARCA[cor]).toBe(hslParaHex(tokenDoDs('escuro', token)))
  })

  // O Google pede favicon quadrado em múltiplo de 48 px; o iOS usa 180.
  it('favicon de 192 px e apple-icon de 180 px', () => {
    expect(LADO_DO_ICONE).toBe(192)
    expect(LADO_DO_ICONE % 48).toBe(0)
    expect(LADO_DO_APPLE_ICON).toBe(180)
  })
})
```

`apps/pilutech-site/components/pilutech-mark.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { PiluTechMark, SvgDaMarca } from './pilutech-mark'

describe('SvgDaMarca', () => {
  // No site, a versão escura ou clara vem do contexto (tokens do .dark ou do :root).
  it('no site, os blocos usam os tokens do contexto', () => {
    const { container } = render(<SvgDaMarca tamanho={30} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '30')
    expect(svg).toHaveAttribute('viewBox', '0 0 48 48')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    const blocos = [...container.querySelectorAll('rect')]
    expect(blocos).toHaveLength(5)
    expect(
      blocos
        .filter((b) => b.classList.contains('fill-primary'))
        .map((b) => [b.getAttribute('x'), b.getAttribute('y')]),
    ).toEqual([['25.5', '0']])
    expect(
      blocos.filter((b) => b.classList.contains('fill-foreground')),
    ).toHaveLength(4)
    for (const bloco of blocos) expect(bloco).toHaveAttribute('rx', '3.5')
  })

  it('nas imagens geradas, as cores vão no fill', () => {
    const { container } = render(
      <SvgDaMarca tamanho={48} cores={{ base: '#fff', destaque: '#0ff' }} />,
    )
    expect(
      [...container.querySelectorAll('rect')].map((b) =>
        b.getAttribute('fill'),
      ),
    ).toEqual(['#fff', '#0ff', '#fff', '#fff', '#fff'])
  })

  it('com rótulo, é uma imagem com nome', () => {
    render(<SvgDaMarca tamanho={48} rotulo="PiluTech" />)
    expect(screen.getByRole('img', { name: 'PiluTech' })).toBeInTheDocument()
  })
})

describe('PiluTechMark', () => {
  it('com lockup: símbolo decorativo e o nome em Jakarta 800, tracking −0.035em, a 60% do símbolo', () => {
    const { container } = render(<PiluTechMark tamanho={30} lockup />)
    const nome = screen.getByText('PiluTech')
    expect(nome).toHaveClass(
      'font-extrabold',
      'tracking-[-0.035em]',
      'text-foreground',
    )
    expect(nome).toHaveStyle({ fontSize: '18px' })
    expect(container.firstElementChild).toHaveStyle({ gap: '8px' })
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('sem lockup: só o símbolo, com o nome para o leitor de tela', () => {
    render(<PiluTechMark tamanho={48} />)
    expect(screen.getByRole('img', { name: 'PiluTech' })).toBeInTheDocument()
    expect(screen.queryByText('PiluTech')).toBeNull()
  })
})
```

- [ ] **Step 2: Rode e confirme que falham**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/jest lib/marca.test.ts components/pilutech-mark.test.tsx; echo "exit=$?"
```

Expected: `exit=1`, `Cannot find module './marca'` e `Cannot find module './pilutech-mark'`.

- [ ] **Step 3: Implemente**

`apps/pilutech-site/lib/marca.ts`:

```ts
export const NOME_DA_MARCA = 'PiluTech'

export const BLOCOS_DA_MARCA = [
  { x: 8.5, y: 0, destaque: false },
  { x: 25.5, y: 0, destaque: true },
  { x: 8.5, y: 17, destaque: false },
  { x: 25.5, y: 17, destaque: false },
  { x: 8.5, y: 34, destaque: false },
] as const

export const LADO_DO_BLOCO = 14
export const RAIO_DO_BLOCO = 3.5

export const CORES_DA_MARCA = {
  noite: '#090b11',
  texto: '#e7ecf3',
  ciano: '#3abff8',
  aco: '#94a0b3',
} as const

export const LADO_DO_ICONE = 192
export const LADO_DO_APPLE_ICON = 180

export function proporcoesDoLockup(tamanho: number): {
  espaco: number
  palavra: number
} {
  return {
    espaco: Math.round(tamanho * 0.28),
    palavra: Math.round(tamanho * 0.6),
  }
}
```

`apps/pilutech-site/components/pilutech-mark.tsx`:

```tsx
import { cn } from '@piluvitu/ui/cn'
import {
  BLOCOS_DA_MARCA,
  LADO_DO_BLOCO,
  NOME_DA_MARCA,
  proporcoesDoLockup,
  RAIO_DO_BLOCO,
} from '@/lib/marca'

type SvgDaMarcaProps = {
  tamanho: number
  cores?: { base: string; destaque: string }
  rotulo?: string
}

export function SvgDaMarca({ tamanho, cores, rotulo }: SvgDaMarcaProps) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 48 48"
      className={cores ? undefined : 'block flex-none'}
      {...(rotulo
        ? { role: 'img', 'aria-label': rotulo }
        : { 'aria-hidden': true })}
    >
      {BLOCOS_DA_MARCA.map((bloco) => (
        <rect
          key={`${bloco.x}-${bloco.y}`}
          x={bloco.x}
          y={bloco.y}
          width={LADO_DO_BLOCO}
          height={LADO_DO_BLOCO}
          rx={RAIO_DO_BLOCO}
          {...(cores
            ? { fill: bloco.destaque ? cores.destaque : cores.base }
            : {
                className: bloco.destaque ? 'fill-primary' : 'fill-foreground',
              })}
        />
      ))}
    </svg>
  )
}

type PiluTechMarkProps = {
  tamanho?: number
  lockup?: boolean
  className?: string
}

export function PiluTechMark({
  tamanho = 48,
  lockup = false,
  className,
}: PiluTechMarkProps) {
  const { espaco, palavra } = proporcoesDoLockup(tamanho)
  return (
    <span
      className={cn('inline-flex items-center leading-none', className)}
      style={lockup ? { gap: espaco } : undefined}
    >
      <SvgDaMarca
        tamanho={tamanho}
        rotulo={lockup ? undefined : NOME_DA_MARCA}
      />
      {lockup ? (
        <span
          className="text-foreground font-extrabold tracking-[-0.035em] whitespace-nowrap"
          style={{ fontSize: palavra }}
        >
          {NOME_DA_MARCA}
        </span>
      ) : null}
    </span>
  )
}
```

`apps/pilutech-site/components/pilutech-mark.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { PiluTechMark } from './pilutech-mark'

const meta = {
  title: 'Marca/PiluTechMark',
  component: PiluTechMark,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PiluTechMark>

export default meta
type Story = StoryObj<typeof meta>

export const LockupDaBarra: Story = { args: { tamanho: 30, lockup: true } }
export const LockupDoRodape: Story = { args: { tamanho: 28, lockup: true } }
export const VersaoClara: Story = {
  args: { tamanho: 48, lockup: true },
  globals: { fundo: 'claro' },
}
export const SoOSimbolo: Story = { args: { tamanho: 96 } }
```

`apps/pilutech-site/lib/imagem-do-icone.tsx`:

```tsx
import { ImageResponse } from 'next/og'
import { SvgDaMarca } from '@/components/pilutech-mark'
import { CORES_DA_MARCA } from './marca'

export function imagemDoIcone(
  lado: number,
  { arredondado }: { arredondado: boolean },
): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: CORES_DA_MARCA.noite,
        borderRadius: arredondado ? Math.round(lado * 0.22) : 0,
      }}
    >
      <SvgDaMarca
        tamanho={Math.round(lado * 0.62)}
        cores={{ base: CORES_DA_MARCA.texto, destaque: CORES_DA_MARCA.ciano }}
      />
    </div>,
    { width: lado, height: lado },
  )
}
```

`apps/pilutech-site/app/icon.tsx`:

```tsx
import { imagemDoIcone } from '@/lib/imagem-do-icone'
import { LADO_DO_ICONE } from '@/lib/marca'

export const size = { width: LADO_DO_ICONE, height: LADO_DO_ICONE }
export const contentType = 'image/png'

export default function Icon() {
  return imagemDoIcone(LADO_DO_ICONE, { arredondado: true })
}
```

`apps/pilutech-site/app/apple-icon.tsx`:

```tsx
import { imagemDoIcone } from '@/lib/imagem-do-icone'
import { LADO_DO_APPLE_ICON } from '@/lib/marca'

export const size = { width: LADO_DO_APPLE_ICON, height: LADO_DO_APPLE_ICON }
export const contentType = 'image/png'

export default function AppleIcon() {
  return imagemDoIcone(LADO_DO_APPLE_ICON, { arredondado: false })
}
```

Em `apps/pilutech-site/scripts/conferir-rotas-estaticas.mjs`, troque `export const ROTAS = ['/']` por:

```js
export const ROTAS = ['/', '/icon', '/apple-icon']
```

- [ ] **Step 4: Rode os testes e confirme que passam**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && pnpm run test; echo "test exit=$?"
```

Expected: `test exit=0`.

- [ ] **Step 5: E2E dos ícones (falha antes do build, passa depois)**

`apps/pilutech-site/app/seo.e2e.ts` (a Tarefa 7 completa este arquivo com o resto do SEO):

```ts
import { expect, test, type Page } from '@playwright/test'
import { LADO_DO_APPLE_ICON, LADO_DO_ICONE } from '../lib/marca'

async function tamanhoDoPng(page: Page, caminho: string) {
  const resposta = await page.request.get(caminho)
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toContain('image/png')
  const corpo = await resposta.body()
  return { largura: corpo.readUInt32BE(16), altura: corpo.readUInt32BE(20) }
}

test('favicon e apple-icon: PNG do símbolo, nos tamanhos declarados', async ({
  page,
}) => {
  await page.goto('/')
  const icone = page.locator('link[rel="icon"]')
  await expect(icone).toHaveCount(1)
  await expect(icone).toHaveAttribute(
    'sizes',
    `${LADO_DO_ICONE}x${LADO_DO_ICONE}`,
  )
  await expect(icone).toHaveAttribute('type', 'image/png')
  expect(
    await tamanhoDoPng(page, (await icone.getAttribute('href')) as string),
  ).toEqual({ largura: LADO_DO_ICONE, altura: LADO_DO_ICONE })
  const apple = page.locator('link[rel="apple-touch-icon"]')
  await expect(apple).toHaveCount(1)
  expect(
    await tamanhoDoPng(page, (await apple.getAttribute('href')) as string),
  ).toEqual({ largura: LADO_DO_APPLE_ICON, altura: LADO_DO_APPLE_ICON })
})
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
pnpm run build; echo "build exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
lsof -nP -iTCP:3021 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test --retries=0; echo "e2e exit=$?"
```

Expected: tudo `exit=0`; o build termina com `Rotas estáticas: /, /icon, /apple-icon`. Abra `.next/server/app/icon.body` (ou baixe `http://localhost:3021/icon` com o servidor de pé) e confira a olho: quadrado Noite de cantos arredondados, P de 5 blocos claro com o de cima à direita em Ciano. Confira `/usr/bin/git status` (arquivos que o Next gera para agentes).

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/pilutech-site && /usr/bin/git status --short && /usr/bin/git commit -m "feat(pilutech-site): símbolo PiluTechMark (variante 1a), favicon e apple-icon"; echo "exit=$?"
```

---

### Tarefa 3: Contato com o projeto no assunto, WhatsApp, conteúdo do design e o selo do Botaí pelo CMS

A lógica pura que dois sites usam vai para `@piluvitu/tools`: `contato.ts` (o e-mail único e o `mailto` com `[Projeto]` no assunto, codificado como a RFC 6068 pede) e `urlsDasLojas` em `pilulabs.ts` (as 4 URLs de loja de um item do CMS já lido, a normalização que o `apps/botai-site/lib/cms.ts` fazia à mão e que agora ele importa). No app: os links do WhatsApp (o geral e um por plano, com as mensagens do design), o telefone, o `mailto` do site, todos os textos e listas do design em `lib/conteudo.ts` e a leitura da fase do Botaí no YAML do `apps/web`. Nada visual ainda.

**Files:**

- Create: `packages/tools/src/contato.ts`, `packages/tools/src/contato.test.ts`, `apps/pilutech-site/lib/contato.ts`, `apps/pilutech-site/lib/contato.test.ts`, `apps/pilutech-site/lib/cms.ts`, `apps/pilutech-site/lib/cms.test.ts`, `apps/pilutech-site/lib/conteudo.ts`, `apps/pilutech-site/lib/conteudo.test.ts`
- Modify: `packages/tools/package.json` (`exports`), `packages/tools/src/pilulabs.ts`, `packages/tools/src/pilulabs.test.ts`, `packages/tools/CLAUDE.md`, `apps/botai-site/lib/cms.ts`

**Interfaces:**

- Consumes: `fase`, `type Fase`, `type UrlsDasLojas` de `@piluvitu/tools/pilulabs`.
- Produces:
  - `@piluvitu/tools/contato`: `EMAIL_DA_PILUTECH = 'pilutechinformatica@gmail.com'`; `mailtoDaPilutech(projeto: string, assunto: string): string`.
  - `@piluvitu/tools/pilulabs`: `urlsDasLojas(item: unknown): UrlsDasLojas`.
  - `apps/pilutech-site/lib/contato.ts`: `WHATSAPP_NUMERO`, `TELEFONE_VISIVEL`, `TELEFONE_INTERNACIONAL`, `linkDoWhatsApp(mensagem: string): string`, `MENSAGENS_DO_WHATSAPP: { geral; essencial; evolucao; infraestrutura }`, `WHATSAPP: Record<keyof typeof MENSAGENS_DO_WHATSAPP, string>`, `MAILTO_DO_SITE`, `ABRE_EM_ABA_NOVA = { target: '_blank', rel: 'noopener noreferrer' }`, e o reexport `EMAIL_DA_PILUTECH`.
  - `apps/pilutech-site/lib/cms.ts`: `ITEM_DO_BOTAI: string`; `lerFaseDoBotai(caminho?: string): Fase` (sem `caminho`, lê `process.env.BOTAI_CMS_ITEM || ITEM_DO_BOTAI`, como o `apps/botai-site`; arquivo ausente lança).
  - `apps/pilutech-site/lib/conteudo.ts`: `SECOES_DA_BARRA` (`{ id; rotulo }[]`), `LINHAS_DO_TERMINAL`, `type Servico = { area; titulo; nome; texto; itens; icone }` e `SERVICOS`, `type Etapa` e `ETAPAS`, `type Projeto = { nome; url; endereco; tipo; texto; imagem: { src; alt } }`, `BOTAI`, `SOMBRAI`, `seloDoProjeto(projeto: Pick<Projeto, 'tipo'>, fase: Fase): string`, `type CartaoDeProjeto = Projeto & { selo: string }`, `cartoesDosProjetos(faseDoBotai: Fase): CartaoDeProjeto[]`, `TECNOLOGIAS` (`{ grupo; itens }[]`), `type Plano = { nome; para; itens; whatsapp }` e `PLANOS`, `type Duvida = { pergunta; resposta }` e `DUVIDAS`.

- [ ] **Step 1: Escreva os testes que falham (pacote)**

`packages/tools/src/contato.test.ts`:

```ts
import { EMAIL_DA_PILUTECH, mailtoDaPilutech } from './contato'

const assuntoDe = (mailto: string) =>
  new URL(mailto).searchParams.get('subject')

describe('mailtoDaPilutech', () => {
  it('todo projeto escreve para o mesmo e-mail', () => {
    expect(EMAIL_DA_PILUTECH).toBe('pilutechinformatica@gmail.com')
    expect(new URL(mailtoDaPilutech('Botaí', 'Suporte')).pathname).toBe(
      'pilutechinformatica@gmail.com',
    )
  })

  // O dono filtra no Gmail com subject:Botaí: o projeto vem primeiro, entre colchetes.
  it('o assunto começa pelo projeto entre colchetes', () => {
    expect(assuntoDe(mailtoDaPilutech('PiluTech', 'Contato pelo site'))).toBe(
      '[PiluTech] Contato pelo site',
    )
    expect(assuntoDe(mailtoDaPilutech('Botaí', 'Termos de uso'))).toBe(
      '[Botaí] Termos de uso',
    )
  })

  // RFC 6068: UTF-8 em percent-encoding. Em mailto o + é literal, e o URLSearchParams poria + no espaço.
  it('codifica em UTF-8, com %20 no espaço e nunca +', () => {
    expect(mailtoDaPilutech('Botaí', 'Suporte')).toBe(
      'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Suporte',
    )
    expect(mailtoDaPilutech('PiluTech', 'Contato pelo site')).not.toContain('+')
  })

  // Review Focus 5.
  it('&, ? e # no assunto não cortam o link nem criam outro campo', () => {
    const url = new URL(mailtoDaPilutech('PiluTech', 'Preço & prazo? #1'))
    expect([...url.searchParams.keys()]).toEqual(['subject'])
    expect(url.searchParams.get('subject')).toBe('[PiluTech] Preço & prazo? #1')
    expect(url.hash).toBe('')
  })
})
```

Em `packages/tools/src/pilulabs.test.ts`, acrescente `urlsDasLojas,` ao import de `./pilulabs` (em ordem alfabética, depois de `TIPOS,`) e, no fim do arquivo:

```ts
describe('urlsDasLojas', () => {
  it('as 4 URLs do item, aparadas, sem o resto do YAML', () => {
    expect(
      urlsDasLojas({
        slug: 'botai',
        nome: 'Botaí',
        chromeUrl: ` ${URL_CHROME} `,
        firefoxUrl: '',
        edgeUrl: URL_EDGE,
        operaUrl: '',
      }),
    ).toEqual({ ...SEM_LOJA, chromeUrl: URL_CHROME, edgeUrl: URL_EDGE })
  })

  // O Keystatic apaga do YAML o campo opcional vazio, e o yaml lê chave sem valor como null.
  it('campo ausente, nulo ou que não é texto vira vazio', () => {
    expect(
      urlsDasLojas({ chromeUrl: 12, firefoxUrl: null, edgeUrl: ['a'] }),
    ).toEqual(SEM_LOJA)
  })

  it.each([[null], [undefined], [''], ['texto'], [42], [[]]])(
    'YAML que não é um objeto (%p): nenhuma loja',
    (bruto) => {
      expect(urlsDasLojas(bruto)).toEqual(SEM_LOJA)
    },
  )
})
```

- [ ] **Step 2: Rode e confirme que falham**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest src/contato.test.ts src/pilulabs.test.ts; echo "exit=$?"
```

Expected: `exit=1`: `Cannot find module './contato'` e `TypeError: (0 , pilulabs_1.urlsDasLojas) is not a function` (o ts-jest só transpila).

- [ ] **Step 3: Implemente no pacote**

`packages/tools/src/contato.ts`:

```ts
export const EMAIL_DA_PILUTECH = 'pilutechinformatica@gmail.com'

export function mailtoDaPilutech(projeto: string, assunto: string): string {
  return `mailto:${EMAIL_DA_PILUTECH}?subject=${encodeURIComponent(`[${projeto}] ${assunto}`)}`
}
```

Em `packages/tools/src/pilulabs.ts`, depois da função `fase`:

```ts
function textoOuVazio(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

export function urlsDasLojas(item: unknown): UrlsDasLojas {
  const campos =
    typeof item === 'object' && item !== null
      ? (item as Record<string, unknown>)
      : {}
  return {
    chromeUrl: textoOuVazio(campos.chromeUrl),
    firefoxUrl: textoOuVazio(campos.firefoxUrl),
    edgeUrl: textoOuVazio(campos.edgeUrl),
    operaUrl: textoOuVazio(campos.operaUrl),
  }
}
```

Em `packages/tools/package.json`, no `exports`, depois de `"./pilulabs": "./src/pilulabs.ts"`, acrescente `"./contato": "./src/contato.ts"` (com a vírgula na linha de cima).

`apps/botai-site/lib/cms.ts` passa a usar a normalização do pacote (o `texto()` e o parse à mão saem; os testes dele não mudam e continuam verdes):

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { urlsDasLojas, type UrlsDasLojas } from '@piluvitu/tools/pilulabs'
import { parse } from 'yaml'

// Lido no build (a rota é estática): o dono edita este item do apps/web em /admin/pilulabs.
export const ITEM_NO_CMS = join(
  process.cwd(),
  '..',
  'web',
  'content',
  'pilulabs',
  'botai',
  'index.yaml',
)

export function lerUrlsDasLojas(
  caminho: string = process.env.BOTAI_CMS_ITEM || ITEM_NO_CMS,
): UrlsDasLojas {
  return urlsDasLojas(parse(readFileSync(caminho, 'utf8')))
}
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/packages/tools && ./node_modules/.bin/jest; echo "jest exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
cd ../../apps/botai-site && pnpm run test; echo "botai-site test exit=$?"
./node_modules/.bin/tsc --noEmit; echo "botai-site tsc exit=$?"
```

Expected: os quatro `exit=0` (o `lib/cms.test.ts` do Botaí, intocado, prova que a troca não mudou nada).

- [ ] **Step 4: Escreva os testes que falham (app)**

`apps/pilutech-site/lib/contato.test.ts`:

```ts
import {
  ABRE_EM_ABA_NOVA,
  EMAIL_DA_PILUTECH,
  linkDoWhatsApp,
  MAILTO_DO_SITE,
  MENSAGENS_DO_WHATSAPP,
  TELEFONE_INTERNACIONAL,
  TELEFONE_VISIVEL,
  WHATSAPP,
  WHATSAPP_NUMERO,
} from './contato'

const soDigitos = (texto: string) => texto.replace(/\D/g, '')

describe('WhatsApp', () => {
  it('o número com DDI e DDD, como o wa.me pede', () => {
    expect(WHATSAPP_NUMERO).toBe('5586981737625')
  })

  it('o telefone visível e o internacional são o mesmo número', () => {
    expect(TELEFONE_VISIVEL).toBe('(86) 98173-7625')
    expect(TELEFONE_INTERNACIONAL).toBe('+55 86 98173-7625')
    expect(`55${soDigitos(TELEFONE_VISIVEL)}`).toBe(WHATSAPP_NUMERO)
    expect(soDigitos(TELEFONE_INTERNACIONAL)).toBe(WHATSAPP_NUMERO)
  })

  it('as mensagens são as do design', () => {
    expect(MENSAGENS_DO_WHATSAPP).toEqual({
      geral: 'Olá! Vim pelo site da PiluTech e quero falar sobre um projeto.',
      essencial: 'Olá! Quero uma proposta do plano Essencial de manutenção.',
      evolucao: 'Olá! Quero uma proposta do plano Evolução de manutenção.',
      infraestrutura: 'Olá! Quero uma proposta do plano de Infraestrutura.',
    })
  })

  it('o link geral, codificado', () => {
    expect(WHATSAPP.geral).toBe(
      'https://wa.me/5586981737625?text=Ol%C3%A1!%20Vim%20pelo%20site%20da%20PiluTech%20e%20quero%20falar%20sobre%20um%20projeto.',
    )
  })

  it.each(Object.entries(MENSAGENS_DO_WHATSAPP))(
    '%s: o texto volta igual do link',
    (chave, mensagem) => {
      const url = new URL(WHATSAPP[chave as keyof typeof WHATSAPP])
      expect(`${url.origin}${url.pathname}`).toBe('https://wa.me/5586981737625')
      expect(url.searchParams.get('text')).toBe(mensagem)
    },
  )

  it('& e # na mensagem não cortam o link', () => {
    expect(new URL(linkDoWhatsApp('a & b #1')).searchParams.get('text')).toBe(
      'a & b #1',
    )
  })
})

describe('e-mail', () => {
  it('o contato do site vai para o e-mail da PiluTech com [PiluTech] no assunto', () => {
    expect(EMAIL_DA_PILUTECH).toBe('pilutechinformatica@gmail.com')
    expect(MAILTO_DO_SITE).toBe(
      'mailto:pilutechinformatica@gmail.com?subject=%5BPiluTech%5D%20Contato%20pelo%20site',
    )
  })
})

it('link externo abre em aba nova sem passar a referência', () => {
  expect(ABRE_EM_ABA_NOVA).toEqual({
    target: '_blank',
    rel: 'noopener noreferrer',
  })
})
```

`apps/pilutech-site/lib/cms.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ITEM_DO_BOTAI, lerFaseDoBotai } from './cms'

describe('lerFaseDoBotai', () => {
  let pasta: string

  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'pilutech-cms-'))
  })
  afterEach(() => {
    rmSync(pasta, { recursive: true, force: true })
  })

  function yaml(conteudo: string): string {
    const caminho = join(pasta, 'index.yaml')
    writeFileSync(caminho, conteudo)
    return caminho
  }

  // O dono edita em /admin/pilulabs, que grava neste arquivo do apps/web.
  it('aponta para o item botai do CMS do apps/web', () => {
    expect(ITEM_DO_BOTAI).toMatch(
      /apps\/web\/content\/pilulabs\/botai\/index\.yaml$/,
    )
  })

  it('lê o item real e devolve uma das duas fases', () => {
    expect(['em-breve', 'disponivel']).toContain(lerFaseDoBotai())
  })

  it('sem loja publicada: em breve', () => {
    expect(lerFaseDoBotai(yaml("chromeUrl: ''\nfirefoxUrl:\n"))).toBe(
      'em-breve',
    )
  })

  it('uma loja publicada basta: disponível', () => {
    expect(
      lerFaseDoBotai(
        yaml(
          "firefoxUrl: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'\n",
        ),
      ),
    ).toBe('disponivel')
  })

  // O dono cola o link pelo /admin/pilulabs: link de outra loja ou em http não publica nada.
  it('URL de outra loja ou em http continua em breve', () => {
    expect(
      lerFaseDoBotai(
        yaml(
          "chromeUrl: 'https://addons.mozilla.org/x'\nedgeUrl: 'http://microsoftedge.microsoft.com/addons/detail/botai/x'\n",
        ),
      ),
    ).toBe('em-breve')
  })

  // Sem o YAML o build tem de quebrar: em silêncio, o selo diria "em breve" com a loja publicada.
  it('arquivo que não existe lança', () => {
    expect(() => lerFaseDoBotai(join(pasta, 'nao-existe.yaml'))).toThrow(
      /ENOENT/,
    )
  })

  // Só o playwright.lojas.config.ts define a variável: builda a landing com um YAML de teste.
  it('BOTAI_CMS_ITEM troca o arquivo lido por padrão', () => {
    process.env.BOTAI_CMS_ITEM = yaml(
      "firefoxUrl: 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'\n",
    )
    try {
      expect(lerFaseDoBotai()).toBe('disponivel')
    } finally {
      delete process.env.BOTAI_CMS_ITEM
    }
  })
})
```

`apps/pilutech-site/lib/conteudo.test.ts`:

```ts
import { MENSAGENS_DO_WHATSAPP, WHATSAPP } from './contato'
import {
  BOTAI,
  cartoesDosProjetos,
  DUVIDAS,
  ETAPAS,
  LINHAS_DO_TERMINAL,
  PLANOS,
  SECOES_DA_BARRA,
  seloDoProjeto,
  SERVICOS,
  SOMBRAI,
  TECNOLOGIAS,
} from './conteudo'

const SEM_DUVIDAS = [
  SECOES_DA_BARRA,
  LINHAS_DO_TERMINAL,
  SERVICOS.map((servico) => ({ ...servico, icone: undefined })),
  ETAPAS,
  BOTAI,
  SOMBRAI,
  TECNOLOGIAS,
  PLANOS,
]
const TODOS_OS_TEXTOS = JSON.stringify([...SEM_DUVIDAS, DUVIDAS])

describe('conteúdo do design', () => {
  it('a barra leva às 5 seções, na ordem do design', () => {
    expect(SECOES_DA_BARRA.map((s) => `${s.rotulo}#${s.id}`)).toEqual([
      'Serviços#servicos',
      'Como funciona#como-funciona',
      'Projetos#projetos',
      'Planos#planos',
      'Dúvidas#duvidas',
    ])
  })

  it('o terminal lista os 5 serviços do design', () => {
    expect(LINHAS_DO_TERMINAL).toEqual([
      'criação de aplicativos',
      'manutenção de aplicativos',
      'provisionamento de infraestrutura',
      'orçamento de infraestrutura',
      'desenvolvimento fullstack',
    ])
  })

  it('3 serviços, 4 etapas, 3 grupos de tecnologia, 3 planos e 5 dúvidas, na ordem', () => {
    expect(SERVICOS.map((s) => `${s.area}: ${s.titulo}`)).toEqual([
      'Aplicativos: Criação e manutenção',
      'Infraestrutura: Provisionamento e orçamento',
      'Fullstack: Desenvolvimento sob medida',
    ])
    expect(ETAPAS.map((e) => e.titulo)).toEqual([
      'Conversa',
      'Proposta',
      'Desenvolvimento',
      'Entrega e acompanhamento',
    ])
    expect(TECNOLOGIAS.map((g) => g.grupo)).toEqual([
      'Front-end',
      'Back-end',
      'Infraestrutura',
    ])
    expect(PLANOS.map((p) => p.nome)).toEqual([
      'Essencial',
      'Evolução',
      'Infraestrutura',
    ])
    expect(DUVIDAS.map((d) => d.pergunta)).toEqual([
      'Quanto custa um aplicativo?',
      'Você assume um aplicativo que outra pessoa fez?',
      'Como funciona o orçamento de infraestrutura?',
      'O atendimento é só em Teresina?',
      'A PiluTech ainda faz manutenção de computadores e impressoras?',
    ])
  })

  it('cada serviço tem 3 itens e um nome completo para o JSON-LD', () => {
    for (const servico of SERVICOS) expect(servico.itens).toHaveLength(3)
    expect(SERVICOS.map((s) => s.nome)).toEqual([
      'Criação e manutenção de aplicativos',
      'Provisionamento e orçamento de infraestrutura',
      'Desenvolvimento fullstack sob medida',
    ])
  })

  it('cada plano pede proposta com a mensagem dele no WhatsApp', () => {
    expect(PLANOS.map((p) => p.whatsapp)).toEqual([
      WHATSAPP.essencial,
      WHATSAPP.evolucao,
      WHATSAPP.infraestrutura,
    ])
    expect(new URL(PLANOS[1].whatsapp).searchParams.get('text')).toBe(
      MENSAGENS_DO_WHATSAPP.evolucao,
    )
  })
})

describe('regras da marca (marca-CLAUDE.md)', () => {
  it('nenhum emoji', () => {
    expect(TODOS_OS_TEXTOS).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  // Nunca anunciar manutenção de computadores e impressoras: a única menção é a dúvida que diz que não.
  it('computadores e impressoras só aparecem na dúvida que responde "Não."', () => {
    expect(JSON.stringify(SEM_DUVIDAS)).not.toMatch(/computador|impressora/i)
    const mencoes = DUVIDAS.filter((d) =>
      /computador|impressora/i.test(d.pergunta + d.resposta),
    )
    expect(mencoes).toHaveLength(1)
    expect(mencoes[0].resposta).toMatch(/^Não\./)
  })

  it('nenhum texto fixo diz "disponível"', () => {
    expect(TODOS_OS_TEXTOS).not.toMatch(/dispon[ií]vel/i)
  })
})

describe('projetos', () => {
  it('sem loja publicada, os dois selos dizem em breve', () => {
    expect(cartoesDosProjetos('em-breve').map((c) => c.selo)).toEqual([
      'Extensão de navegador · em breve',
      'App Android e iPhone · em breve',
    ])
  })

  // O Sombraí não tem fonte de fase (o CMS só guarda lojas de extensão): fica em breve.
  it('com o Botaí publicado, só o selo dele muda', () => {
    expect(cartoesDosProjetos('disponivel').map((c) => c.selo)).toEqual([
      'Extensão de navegador · disponível',
      'App Android e iPhone · em breve',
    ])
  })

  it('o selo é o tipo e a fase', () => {
    expect(seloDoProjeto({ tipo: 'X' }, 'em-breve')).toBe('X · em breve')
  })

  it('cada cartão leva ao domínio do produto', () => {
    expect(cartoesDosProjetos('em-breve').map((c) => c.url)).toEqual([
      'https://botai.pilutech.com.br/',
      'https://sombrai.pilutech.com.br/',
    ])
  })

  it('as imagens são as OG dos domínios, sem o parâmetro de hash', () => {
    expect(BOTAI.imagem.src).toBe(
      'https://botai.pilutech.com.br/opengraph-image',
    )
    expect(SOMBRAI.imagem.src).toBe(
      'https://sombrai.pilutech.com.br/opengraph-image.png',
    )
    for (const projeto of [BOTAI, SOMBRAI])
      expect(new URL(projeto.imagem.src).search).toBe('')
  })
})
```

- [ ] **Step 5: Rode e confirme que falham**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/jest lib/contato.test.ts lib/cms.test.ts lib/conteudo.test.ts; echo "exit=$?"
```

Expected: `exit=1`, com `Cannot find module './contato'` (no `contato.test.ts` e no `conteudo.test.ts`, que importa `./contato` antes de `./conteudo`) e `Cannot find module './cms'`.

- [ ] **Step 6: Implemente no app**

`apps/pilutech-site/lib/contato.ts`:

```ts
import { mailtoDaPilutech } from '@piluvitu/tools/contato'

export { EMAIL_DA_PILUTECH } from '@piluvitu/tools/contato'

export const WHATSAPP_NUMERO = '5586981737625'
export const TELEFONE_VISIVEL = '(86) 98173-7625'
export const TELEFONE_INTERNACIONAL = '+55 86 98173-7625'

export function linkDoWhatsApp(mensagem: string): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`
}

export const MENSAGENS_DO_WHATSAPP = {
  geral: 'Olá! Vim pelo site da PiluTech e quero falar sobre um projeto.',
  essencial: 'Olá! Quero uma proposta do plano Essencial de manutenção.',
  evolucao: 'Olá! Quero uma proposta do plano Evolução de manutenção.',
  infraestrutura: 'Olá! Quero uma proposta do plano de Infraestrutura.',
} as const

export const WHATSAPP: Record<keyof typeof MENSAGENS_DO_WHATSAPP, string> = {
  geral: linkDoWhatsApp(MENSAGENS_DO_WHATSAPP.geral),
  essencial: linkDoWhatsApp(MENSAGENS_DO_WHATSAPP.essencial),
  evolucao: linkDoWhatsApp(MENSAGENS_DO_WHATSAPP.evolucao),
  infraestrutura: linkDoWhatsApp(MENSAGENS_DO_WHATSAPP.infraestrutura),
}

export const MAILTO_DO_SITE = mailtoDaPilutech('PiluTech', 'Contato pelo site')

export const ABRE_EM_ABA_NOVA = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const
```

`apps/pilutech-site/lib/cms.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fase, urlsDasLojas, type Fase } from '@piluvitu/tools/pilulabs'
import { parse } from 'yaml'

// Lido no build (a página é estática): o dono publica as lojas do Botaí pelo /admin/pilulabs do apps/web.
export const ITEM_DO_BOTAI = join(
  process.cwd(),
  '..',
  'web',
  'content',
  'pilulabs',
  'botai',
  'index.yaml',
)

export function lerFaseDoBotai(
  caminho: string = process.env.BOTAI_CMS_ITEM || ITEM_DO_BOTAI,
): Fase {
  return fase(urlsDasLojas(parse(readFileSync(caminho, 'utf8'))))
}
```

`apps/pilutech-site/lib/conteudo.ts` (os textos são os do `PiluTech Landing Page.dc.html`, letra por letra):

```ts
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faLayerGroup,
  faMobileScreen,
  faServer,
} from '@fortawesome/free-solid-svg-icons'
import type { Fase } from '@piluvitu/tools/pilulabs'
import { WHATSAPP } from './contato'

export const SECOES_DA_BARRA = [
  { id: 'servicos', rotulo: 'Serviços' },
  { id: 'como-funciona', rotulo: 'Como funciona' },
  { id: 'projetos', rotulo: 'Projetos' },
  { id: 'planos', rotulo: 'Planos' },
  { id: 'duvidas', rotulo: 'Dúvidas' },
] as const

export const LINHAS_DO_TERMINAL = [
  'criação de aplicativos',
  'manutenção de aplicativos',
  'provisionamento de infraestrutura',
  'orçamento de infraestrutura',
  'desenvolvimento fullstack',
] as const

export type Servico = {
  area: string
  titulo: string
  nome: string
  texto: string
  itens: readonly string[]
  icone: IconDefinition
}

export const SERVICOS: readonly Servico[] = [
  {
    area: 'Aplicativos',
    titulo: 'Criação e manutenção',
    nome: 'Criação e manutenção de aplicativos',
    texto:
      'Aplicativos web e mobile do protótipo à publicação, e manutenção contínua depois do lançamento.',
    itens: ['Web e mobile', 'Publicação nas lojas', 'Correções e atualizações'],
    icone: faMobileScreen,
  },
  {
    area: 'Infraestrutura',
    titulo: 'Provisionamento e orçamento',
    nome: 'Provisionamento e orçamento de infraestrutura',
    texto:
      'Servidores, banco de dados, rede e monitoramento configurados como código, com o custo mensal estimado antes de contratar.',
    itens: [
      'Infraestrutura como código',
      'Custo estimado por item',
      'Monitoramento e alertas',
    ],
    icone: faServer,
  },
  {
    area: 'Fullstack',
    titulo: 'Desenvolvimento sob medida',
    nome: 'Desenvolvimento fullstack sob medida',
    texto:
      'Front-end, back-end e integrações para sistemas internos, painéis e APIs.',
    itens: [
      'APIs e integrações',
      'Painéis e sistemas internos',
      'Modelagem de banco de dados',
    ],
    icone: faLayerGroup,
  },
]

export type Etapa = { titulo: string; texto: string }

export const ETAPAS: readonly Etapa[] = [
  {
    titulo: 'Conversa',
    texto: 'Você explica pelo WhatsApp o que precisa. Sem formulário longo.',
  },
  {
    titulo: 'Proposta',
    texto:
      'Escopo, prazo e valor por escrito, com o custo mensal estimado da infraestrutura.',
  },
  {
    titulo: 'Desenvolvimento',
    texto: 'Entregas por etapa, com um ambiente de teste para você acompanhar.',
  },
  {
    titulo: 'Entrega e acompanhamento',
    texto:
      'Publicação em produção, documentação e, se quiser, um plano de manutenção.',
  },
]

export type Projeto = {
  nome: string
  url: string
  endereco: string
  tipo: string
  texto: string
  imagem: { src: string; alt: string }
}

export const BOTAI: Projeto = {
  nome: 'Botaí',
  url: 'https://botai.pilutech.com.br/',
  endereco: 'botai.pilutech.com.br',
  tipo: 'Extensão de navegador',
  texto:
    'Gera uma pessoa brasileira de teste com CPF e CNPJ válidos e CEP real com endereço, e preenche o formulário com um atalho. Para Chrome, Firefox, Edge e Opera.',
  imagem: {
    src: 'https://botai.pilutech.com.br/opengraph-image',
    alt: 'Botaí: gerador de dados fake para formulários',
  },
}

export const SOMBRAI: Projeto = {
  nome: 'Sombraí',
  url: 'https://sombrai.pilutech.com.br/',
  endereco: 'sombrai.pilutech.com.br',
  tipo: 'App Android e iPhone',
  texto:
    'Mostra quais árvores e plantas nativas do Piauí cabem no quintal, na calçada, na varanda ou no vaso em Teresina, e como cuidar delas no clima daqui.',
  imagem: {
    src: 'https://sombrai.pilutech.com.br/opengraph-image.png',
    alt: 'O ícone do Sombraí e a tela Início do app',
  },
}

export function seloDoProjeto(
  projeto: Pick<Projeto, 'tipo'>,
  fase: Fase,
): string {
  return `${projeto.tipo} · ${fase === 'disponivel' ? 'disponível' : 'em breve'}`
}

export type CartaoDeProjeto = Projeto & { selo: string }

export function cartoesDosProjetos(faseDoBotai: Fase): CartaoDeProjeto[] {
  return [
    { ...BOTAI, selo: seloDoProjeto(BOTAI, faseDoBotai) },
    { ...SOMBRAI, selo: seloDoProjeto(SOMBRAI, 'em-breve') },
  ]
}

export const TECNOLOGIAS = [
  {
    grupo: 'Front-end',
    itens: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
  },
  { grupo: 'Back-end', itens: ['Go', 'Node.js', 'Python', 'PostgreSQL'] },
  {
    grupo: 'Infraestrutura',
    itens: [
      'Docker',
      'Kubernetes',
      'Terraform',
      'AWS',
      'Cloudflare',
      'GitHub Actions',
    ],
  },
] as const

export type Plano = {
  nome: string
  para: string
  itens: readonly string[]
  whatsapp: string
}

export const PLANOS: readonly Plano[] = [
  {
    nome: 'Essencial',
    para: 'Para manter o app no ar e seguro.',
    itens: [
      'Correção de bugs',
      'Atualização de dependências e segurança',
      'Monitoramento de disponibilidade',
      'Backup verificado',
    ],
    whatsapp: WHATSAPP.essencial,
  },
  {
    nome: 'Evolução',
    para: 'Para quem continua lançando funcionalidades.',
    itens: [
      'Tudo do Essencial',
      'Horas mensais para novas funcionalidades',
      'Relatório mensal do que foi feito',
      'Prioridade no atendimento',
    ],
    whatsapp: WHATSAPP.evolucao,
  },
  {
    nome: 'Infraestrutura',
    para: 'Para quem quer alguém cuidando da nuvem.',
    itens: [
      'Revisão mensal de custos',
      'Ajuste de capacidade',
      'Alertas e resposta a incidentes',
      'Atualização dos servidores',
    ],
    whatsapp: WHATSAPP.infraestrutura,
  },
]

export type Duvida = { pergunta: string; resposta: string }

export const DUVIDAS: readonly Duvida[] = [
  {
    pergunta: 'Quanto custa um aplicativo?',
    resposta:
      'Depende do escopo. Depois da conversa inicial você recebe uma proposta por escrito com o que será feito, o prazo e o valor, além do custo mensal estimado da infraestrutura.',
  },
  {
    pergunta: 'Você assume um aplicativo que outra pessoa fez?',
    resposta:
      'Sim. O trabalho começa com uma análise do código e da infraestrutura atuais, e a proposta lista o que precisa ser corrigido antes de seguir.',
  },
  {
    pergunta: 'Como funciona o orçamento de infraestrutura?',
    resposta:
      'É feito um levantamento do uso esperado e cada item recebe uma estimativa de custo: servidores, banco de dados, armazenamento, rede e monitoramento. Quando faz sentido, a comparação inclui mais de um provedor.',
  },
  {
    pergunta: 'O atendimento é só em Teresina?',
    resposta: 'Não. O atendimento é remoto e vale para todo o Brasil.',
  },
  {
    pergunta: 'A PiluTech ainda faz manutenção de computadores e impressoras?',
    resposta:
      'Não. A PiluTech atende apenas aplicativos, infraestrutura e desenvolvimento de software.',
  },
]
```

- [ ] **Step 7: Rode os testes e confirme que passam; lint, tsc e build dos dois sites**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && pnpm run test; echo "test exit=$?"
./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
cd ../botai-site && ./node_modules/.bin/eslint .; echo "botai-site eslint exit=$?"
pnpm run build; echo "botai-site build exit=$?"
cd ../../packages/tools && pnpm run lint; echo "tools lint exit=$?"
```

Expected: todos `exit=0`. Confira `/usr/bin/git status` depois do build do `apps/botai-site`.

- [ ] **Step 8: Documente no `packages/tools/CLAUDE.md`**

No primeiro parágrafo da seção "Módulo `pilulabs`", troque:

```text
porque dois apps decidem a mesma coisa: o `apps/web` (card da PiluLabs, formulário do admin) e o `apps/botai-site` (botões de loja, selo de fase, atalho de quem visita).
```

por:

```text
porque mais de um app decide a mesma coisa: o `apps/web` (card da PiluLabs, formulário do admin), o `apps/botai-site` (botões de loja, selo de fase, atalho de quem visita) e o `apps/pilutech-site` (o selo do Botaí no cartão de projeto).
```

E acrescente ao fim da lista de bullets da mesma seção:

```markdown
- `urlsDasLojas(item)`: as 4 URLs de loja de um item do CMS já lido pelo `yaml` (texto aparado; ausente, nulo ou não-texto vira vazio; YAML que não é objeto dá as 4 vazias). Os dois sites leem o `apps/web/content/pilulabs/botai/index.yaml` com ela, sem o reader do Keystatic.
```

E, antes de `## Dependency policy`, a seção nova:

```markdown
## Módulo `contato` (e-mail dos projetos PiluTech)

`contato.ts`, exposto só por `@piluvitu/tools/contato`. Todo contato de projeto vai para `EMAIL_DA_PILUTECH` (`pilutechinformatica@gmail.com`), e `mailtoDaPilutech(projeto, assunto)` monta o `mailto:` com o assunto `[Projeto] Assunto`, para o dono filtrar no Gmail com `subject:Botaí`, `subject:Sombraí` ou `subject:PiluTech` (spec `docs/superpowers/specs/2026-10-02-pilutech-site-design.md` §6).

- O assunto vai por `encodeURIComponent`: UTF-8 em percent-encoding, espaço como `%20` (RFC 6068). Em `mailto:` o `+` é literal, e o `URLSearchParams` codificaria o espaço como `+`: não troque.
- Usado pelo `apps/pilutech-site` (`[PiluTech] Contato pelo site`) e pelo `apps/botai-site` (`[Botaí] Suporte`, `[Botaí] Privacidade`, `[Botaí] Termos de uso`). Texto que só cita o endereço (política, termos, `apps/botai/loja/textos.md`) continua com o e-mail puro.
```

- [ ] **Step 9: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add packages/tools apps/botai-site/lib/cms.ts apps/pilutech-site && /usr/bin/git status --short && /usr/bin/git commit -m "feat(pilutech): e-mail com o projeto no assunto, links do WhatsApp, textos do design e o selo do Botaí pelo CMS"; echo "exit=$?"
```

---

### Tarefa 4: Hero com terminal, Serviços, Como funciona, Projetos, Tecnologias e Planos

O corpo da página, fiel ao design: o hero escuro com o terminal, as cinco seções de conteúdo alternando escuro, claro e Petróleo, e os cartões de projeto com a imagem OG remota pelo `next/image` (só os dois caminhos exatos, sem query) e o selo do Botaí vindo do CMS. A página `/` passa a ser a `Landing`. Cores pelos tokens do contexto (ver "Decisões"): seção escura = classe `dark`; seção clara = sem classe; Planos = `bg-primary` no contexto claro (o Petróleo) com as cores próprias do `@theme` para cartão, borda e ✓. Os botões levam o `ANEL_DE_FOCO` (ver "Decisões"), e o E2E confere a cor computada de cada seção. O `test:e2e` ganha a primeira passada do molde do `apps/botai-site`: um build com um YAML de teste com loja publicada, que prova o selo "disponível" pelo caminho real (`page.tsx` → `Landing`).

**Files:**

- Create (`apps/pilutech-site/`): `components/classes.ts`, `components/terminal.tsx`, `components/hero.tsx`, `components/servicos.tsx`, `components/como-funciona.tsx`, `components/projetos.tsx`, `components/tecnologias.tsx`, `components/planos.tsx`, `components/landing.tsx` (cada `.tsx` com `.test.tsx` e `.stories.tsx` ao lado), `next.config.test.ts`, `playwright.lojas.config.ts`, `app/lojas-publicadas.yaml`, `app/lojas-publicadas.e2e.ts`
- Modify (`apps/pilutech-site/`): `next.config.ts`, `app/page.tsx`, `app/pagina.e2e.ts`, `playwright.config.ts` (`testIgnore`), `package.json` (`test:e2e`)

**Interfaces:**

- Consumes: `CabecalhoSecao` (Tarefa 1); `WHATSAPP`, `ABRE_EM_ABA_NOVA` (Tarefa 3); `LINHAS_DO_TERMINAL`, `SERVICOS`, `ETAPAS`, `cartoesDosProjetos`, `BOTAI`, `SOMBRAI`, `TECNOLOGIAS`, `PLANOS` (Tarefa 3); `lerFaseDoBotai` (Tarefa 3); `Button` de `@piluvitu/ui/button`; `cn` de `@piluvitu/ui/cn`.
- Produces:
  - `components/classes.ts`: `CONTEUDO` (largura de 1180 px com o gutter `clamp(20px,5vw,48px)`), `ESPACO_DA_SECAO` (padding vertical `clamp(72px,9vw,112px)`), `ANEL_DE_FOCO` (`focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background`), `BOTAO_GRANDE` (50 px, raio 14, 16 px semibold, `gap-2`, com o `ANEL_DE_FOCO`).
  - `test:e2e` = `playwright test -c playwright.lojas.config.ts && playwright test` (as duas passadas do `apps/botai-site`).
  - `Terminal()`, `Hero()` (o `<header id="inicio">`, único `h1`), `Servicos()`, `ComoFunciona()`, `Projetos({ faseDoBotai }: { faseDoBotai: Fase })`, `Tecnologias()`, `Planos()`; cada seção é `<section id=… aria-labelledby="<id>-titulo">`, com o `h2` vindo do `CabecalhoSecao`.
  - `Landing({ faseDoBotai }: { faseDoBotai: Fase })` (a Tarefa 5 acrescenta as Dúvidas; a Tarefa 6, a barra, o contato, o rodapé, o botão flutuante e a prop `ano`).
  - `next.config.ts`: `images.remotePatterns` com `https://botai.pilutech.com.br/opengraph-image` e `https://sombrai.pilutech.com.br/opengraph-image.png`, `port: ''` e `search: ''`.

- [ ] **Step 1: Escreva os testes que falham**

`apps/pilutech-site/next.config.test.ts`:

```ts
/** @jest-environment node */
import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern'
import { BOTAI, SOMBRAI } from '@/lib/conteudo'
import nextConfig from './next.config'

const padroes = nextConfig.images?.remotePatterns ?? []
const aceita = (url: string) => hasRemoteMatch([], padroes, new URL(url))

describe('next.config: imagens remotas', () => {
  it('aceita as duas imagens OG dos projetos, como estão no conteúdo', () => {
    expect(aceita(BOTAI.imagem.src)).toBe(true)
    expect(aceita(SOMBRAI.imagem.src)).toBe(true)
  })

  // Review Focus 3: o otimizador não pode virar proxy de outro caminho, host, porta ou query.
  it.each([
    'https://botai.pilutech.com.br/opengraph-image?c38af07e9157d6d9',
    'https://sombrai.pilutech.com.br/opengraph-image.png?x=1',
    'https://botai.pilutech.com.br/capturas/01-pagina-preenchida-escuro.png',
    'http://botai.pilutech.com.br/opengraph-image',
    'https://evil.pilutech.com.br/opengraph-image',
    'https://botai.pilutech.com.br:8443/opengraph-image',
  ])('recusa %s', (url) => {
    expect(aceita(url)).toBe(false)
  })

  it('mantém AVIF e WebP', () => {
    expect(nextConfig.images?.formats).toEqual(['image/avif', 'image/webp'])
  })
})
```

`apps/pilutech-site/components/terminal.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { LINHAS_DO_TERMINAL } from '@/lib/conteudo'
import { Terminal } from './terminal'

describe('Terminal', () => {
  it('o comando, as 5 linhas numa lista e a agenda aberta', () => {
    render(<Terminal />)
    expect(screen.getByText(/pilutech servicos$/)).toBeInTheDocument()
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(LINHAS_DO_TERMINAL.map((linha) => `✓ ${linha}`))
    expect(
      screen.getByText(/agenda aberta para novos projetos$/),
    ).toBeInTheDocument()
  })

  it('os símbolos de terminal ficam fora do leitor de tela', () => {
    const { container } = render(<Terminal />)
    const decorativos = [
      ...container.querySelectorAll('[aria-hidden="true"]'),
    ].map((e) => e.textContent)
    expect(decorativos).toEqual(expect.arrayContaining(['$', '✓', '●']))
  })
})
```

`apps/pilutech-site/components/hero.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { WHATSAPP } from '@/lib/contato'
import { Hero } from './hero'

describe('Hero', () => {
  it('é o banner escuro, com a âncora #inicio', () => {
    render(<Hero />)
    const banner = screen.getByRole('banner')
    expect(banner).toHaveAttribute('id', 'inicio')
    expect(banner).toHaveClass('dark')
  })

  it('o h1 e os textos do design', () => {
    render(<Hero />)
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Aplicativos, infraestrutura e desenvolvimento fullstack.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('~/pilutech · Teresina, PI · atendimento remoto'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'A PiluTech cria e mantém aplicativos, provisiona infraestrutura em nuvem e entrega o orçamento de cada item antes de você contratar. Você fala direto com quem desenvolve.',
      ),
    ).toBeInTheDocument()
  })

  it('Falar no WhatsApp abre a conversa geral em aba nova', () => {
    render(<Hero />)
    const link = screen.getByRole('link', { name: 'Falar no WhatsApp' })
    expect(link).toHaveAttribute('href', WHATSAPP.geral)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('Ver serviços leva à seção, na mesma aba', () => {
    render(<Hero />)
    const link = screen.getByRole('link', { name: 'Ver serviços' })
    expect(link).toHaveAttribute('href', '#servicos')
    expect(link).not.toHaveAttribute('target')
  })

  it('traz o terminal', () => {
    render(<Hero />)
    expect(
      screen.getByText(/agenda aberta para novos projetos$/),
    ).toBeInTheDocument()
  })

  // Review Focus 1: "infraestrutura" a 40 px num celular de 320 px.
  it('o h1 quebra palavra longa em vez de vazar', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass(
      'wrap-break-word',
    )
  })

  // Review Focus 7: o anel do Button (1 px na cor do ring) é o Ciano do próprio botão no escuro.
  it('os dois botões têm anel de foco de 2 px com folga do fundo', () => {
    render(<Hero />)
    for (const nome of ['Falar no WhatsApp', 'Ver serviços'])
      expect(screen.getByRole('link', { name: nome })).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-offset-background',
      )
  })
})
```

`apps/pilutech-site/components/servicos.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { SERVICOS } from '@/lib/conteudo'
import { Servicos } from './servicos'

describe('Servicos', () => {
  it('seção clara, rotulada pelo título, com a âncora #servicos', () => {
    render(<Servicos />)
    const secao = screen.getByRole('region', {
      name: 'Do primeiro protótipo ao servidor em produção.',
    })
    expect(secao).toHaveAttribute('id', 'servicos')
    expect(secao).not.toHaveClass('dark')
    expect(within(secao).getByText('Serviços')).toBeInTheDocument()
    expect(within(secao).getByText('03')).toBeInTheDocument()
  })

  it('os 3 cartões: número e área, título, texto e itens', () => {
    render(<Servicos />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(SERVICOS.map((s) => s.titulo))
    for (const rotulo of [
      '01 · Aplicativos',
      '02 · Infraestrutura',
      '03 · Fullstack',
    ])
      expect(screen.getByText(rotulo)).toBeInTheDocument()
    for (const servico of SERVICOS) {
      expect(screen.getByText(servico.texto)).toBeInTheDocument()
      for (const item of servico.itens)
        expect(screen.getByText(item)).toBeInTheDocument()
    }
  })

  it('os ícones são decorativos', () => {
    const { container } = render(<Servicos />)
    const icones = container.querySelectorAll('svg')
    expect(icones).toHaveLength(3)
    for (const icone of icones)
      expect(icone).toHaveAttribute('aria-hidden', 'true')
  })
})
```

`apps/pilutech-site/components/como-funciona.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { ETAPAS } from '@/lib/conteudo'
import { ComoFunciona } from './como-funciona'

describe('ComoFunciona', () => {
  it('seção escura, rotulada pelo título, com a âncora #como-funciona', () => {
    render(<ComoFunciona />)
    const secao = screen.getByRole('region', {
      name: 'Quatro etapas, com escopo e valor por escrito.',
    })
    expect(secao).toHaveAttribute('id', 'como-funciona')
    expect(secao).toHaveClass('dark')
  })

  it('as 4 etapas numa lista ordenada, com número, título e texto', () => {
    render(<ComoFunciona />)
    const lista = screen.getByRole('list')
    expect(lista.tagName).toBe('OL')
    const itens = within(lista).getAllByRole('listitem')
    expect(
      itens.map(
        (li) => within(li).getByRole('heading', { level: 3 }).textContent,
      ),
    ).toEqual(ETAPAS.map((e) => e.titulo))
    expect(
      itens.map((li) => li.querySelector('[aria-hidden="true"]')?.textContent),
    ).toEqual(['01', '02', '03', '04'])
    for (const etapa of ETAPAS)
      expect(screen.getByText(etapa.texto)).toBeInTheDocument()
  })
})
```

`apps/pilutech-site/components/projetos.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { BOTAI, SOMBRAI } from '@/lib/conteudo'
import { Projetos } from './projetos'

function cartao(href: string): HTMLElement {
  const link = document.querySelector(`a[href="${href}"]`)
  if (!(link instanceof HTMLElement)) throw new Error(`sem cartão para ${href}`)
  return link
}

describe('Projetos', () => {
  it('seção clara, rotulada pelo título, com a âncora #projetos', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    const secao = screen.getByRole('region', {
      name: 'Produtos próprios da PiluTech.',
    })
    expect(secao).toHaveAttribute('id', 'projetos')
    expect(secao).not.toHaveClass('dark')
  })

  it('os dois produtos, cada um levando ao domínio dele em aba nova', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Botaí', 'Sombraí'])
    for (const projeto of [BOTAI, SOMBRAI]) {
      const link = cartao(projeto.url)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(within(link).getByText(projeto.texto)).toBeInTheDocument()
      expect(link).toHaveTextContent(projeto.endereco)
    }
  })

  it('a imagem OG de cada domínio passa pelo otimizador do Next, com o alt do design', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    for (const projeto of [BOTAI, SOMBRAI]) {
      const imagem = screen.getByRole('img', { name: projeto.imagem.alt })
      expect(imagem.getAttribute('src')).toContain(
        `url=${encodeURIComponent(projeto.imagem.src)}&`,
      )
    }
  })

  it('sem loja publicada, os dois selos dizem em breve', () => {
    render(<Projetos faseDoBotai="em-breve" />)
    expect(
      within(cartao(BOTAI.url)).getByText('Extensão de navegador · em breve'),
    ).toBeInTheDocument()
    expect(
      within(cartao(SOMBRAI.url)).getByText('App Android e iPhone · em breve'),
    ).toBeInTheDocument()
  })

  it('com o Botaí publicado no CMS, só o selo dele diz disponível', () => {
    render(<Projetos faseDoBotai="disponivel" />)
    expect(
      within(cartao(BOTAI.url)).getByText('Extensão de navegador · disponível'),
    ).toBeInTheDocument()
    expect(
      within(cartao(SOMBRAI.url)).getByText('App Android e iPhone · em breve'),
    ).toBeInTheDocument()
  })
})
```

`apps/pilutech-site/components/tecnologias.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { TECNOLOGIAS } from '@/lib/conteudo'
import { Tecnologias } from './tecnologias'

describe('Tecnologias', () => {
  it('seção escura, rotulada pelo título, com a âncora #tecnologias', () => {
    render(<Tecnologias />)
    const secao = screen.getByRole('region', {
      name: 'Ferramentas usadas no dia a dia.',
    })
    expect(secao).toHaveAttribute('id', 'tecnologias')
    expect(secao).toHaveClass('dark')
  })

  it('os 3 grupos, cada um com a lista de ferramentas do design', () => {
    render(<Tecnologias />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(TECNOLOGIAS.map((g) => g.grupo))
    for (const grupo of TECNOLOGIAS)
      expect(
        within(screen.getByRole('list', { name: grupo.grupo }))
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual([...grupo.itens])
  })
})
```

`apps/pilutech-site/components/planos.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { PLANOS } from '@/lib/conteudo'
import { Planos } from './planos'

describe('Planos', () => {
  it('seção Petróleo (o primary do tema claro), com a âncora #planos e o texto de apoio', () => {
    render(<Planos />)
    const secao = screen.getByRole('region', {
      name: 'Seu aplicativo atualizado, monitorado e no ar.',
    })
    expect(secao).toHaveAttribute('id', 'planos')
    expect(secao).toHaveClass('bg-primary', 'text-primary-foreground')
    expect(secao).not.toHaveClass('dark')
    expect(
      within(secao).getByText(
        'Planos mensais. O valor depende do tamanho do aplicativo e da infraestrutura, e vem na proposta.',
      ),
    ).toBeInTheDocument()
  })

  it('os 3 planos, com o público e os itens', () => {
    render(<Planos />)
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(PLANOS.map((p) => p.nome))
    for (const plano of PLANOS) {
      expect(screen.getByText(plano.para)).toBeInTheDocument()
      for (const item of plano.itens)
        expect(screen.getByText(item)).toBeInTheDocument()
    }
  })

  // O texto visível é "Pedir proposta" nos três; o nome acessível diz de qual plano é.
  it('cada "Pedir proposta" abre o WhatsApp com a mensagem do plano, em aba nova', () => {
    render(<Planos />)
    for (const plano of PLANOS) {
      const link = screen.getByRole('link', {
        name: `Pedir proposta do plano ${plano.nome}`,
      })
      expect(link).toHaveAttribute('href', plano.whatsapp)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(within(link).getByText(`do plano ${plano.nome}`)).toHaveClass(
        'sr-only',
      )
    }
  })

  // Review Focus 7: o anel padrão seria Petróleo sobre o cartão Petróleo (cerca de 1,4:1).
  it('o foco de cada "Pedir proposta" é um anel branco com folga Petróleo', () => {
    render(<Planos />)
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-white',
        'focus-visible:ring-offset-petroleo-cartao',
      )
      expect(link).not.toHaveClass('focus-visible:ring-ring')
    }
  })
})
```

`apps/pilutech-site/components/landing.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { Landing } from './landing'

describe('Landing', () => {
  it('um único h1, no banner, fora do main', () => {
    render(<Landing faseDoBotai="em-breve" />)
    const [h1, ...outros] = screen.getAllByRole('heading', { level: 1 })
    expect(outros).toEqual([])
    expect(screen.getByRole('banner')).toContainElement(h1)
    expect(screen.getByRole('main')).not.toContainElement(
      screen.getByRole('banner'),
    )
  })

  it('as seções do corpo, na ordem do design', () => {
    render(<Landing faseDoBotai="em-breve" />)
    expect(
      within(screen.getByRole('main'))
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual([
      'Do primeiro protótipo ao servidor em produção.',
      'Quatro etapas, com escopo e valor por escrito.',
      'Produtos próprios da PiluTech.',
      'Ferramentas usadas no dia a dia.',
      'Seu aplicativo atualizado, monitorado e no ar.',
    ])
  })

  it('o selo do Botaí segue a fase recebida', () => {
    render(<Landing faseDoBotai="disponivel" />)
    expect(
      screen.getByText('Extensão de navegador · disponível'),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rode e confirme que falham**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/jest next.config.test.ts components; echo "exit=$?"
```

Expected: `exit=1`: os componentes novos dão `Cannot find module`, e o `next.config.test.ts` falha em "aceita as duas imagens OG" (sem `remotePatterns`, nada é aceito). Os testes do `CabecalhoSecao` e do `PiluTechMark` continuam verdes.

- [ ] **Step 3: Implemente**

`apps/pilutech-site/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'botai.pilutech.com.br',
        port: '',
        pathname: '/opengraph-image',
        search: '',
      },
      {
        protocol: 'https',
        hostname: 'sombrai.pilutech.com.br',
        port: '',
        pathname: '/opengraph-image.png',
        search: '',
      },
    ],
  },
}

export default nextConfig
```

`apps/pilutech-site/components/classes.ts`:

```ts
export const CONTEUDO =
  'mx-auto w-full max-w-[1180px] px-[clamp(20px,5vw,48px)]'
export const ESPACO_DA_SECAO = 'py-[clamp(72px,9vw,112px)]'
export const ANEL_DE_FOCO =
  'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background'
export const BOTAO_GRANDE = `h-[50px] gap-2 rounded-[14px] px-[22px] text-base font-semibold ${ANEL_DE_FOCO}`
```

`apps/pilutech-site/components/terminal.tsx`:

```tsx
import { LINHAS_DO_TERMINAL } from '@/lib/conteudo'

export function Terminal() {
  return (
    <div className="bg-card border-border min-w-0 overflow-hidden rounded-3xl border">
      <div className="border-border text-muted-foreground flex items-center justify-between border-b px-[22px] py-4 font-mono text-[13px] tracking-[0.12em]">
        <span>~/pilutech</span>
        <span aria-hidden className="flex gap-1.5">
          <span className="bg-border size-[9px] rounded-[3px]" />
          <span className="bg-border size-[9px] rounded-[3px]" />
          <span className="bg-primary size-[9px] rounded-[3px]" />
        </span>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-[26px] font-mono text-[clamp(14px,1.4vw,17px)] leading-[1.4]">
        <p>
          <span aria-hidden className="text-primary">
            $
          </span>{' '}
          pilutech servicos
        </p>
        <ul className="flex flex-col gap-3.5">
          {LINHAS_DO_TERMINAL.map((linha) => (
            <li key={linha}>
              <span aria-hidden className="text-ok">
                ✓
              </span>{' '}
              {linha}
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground">
          <span aria-hidden className="text-primary">
            ●
          </span>{' '}
          agenda aberta para novos projetos
        </p>
      </div>
    </div>
  )
}
```

`apps/pilutech-site/components/hero.tsx`:

```tsx
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { ABRE_EM_ABA_NOVA, WHATSAPP } from '@/lib/contato'
import { BOTAO_GRANDE, CONTEUDO } from './classes'
import { Terminal } from './terminal'

export function Hero() {
  return (
    <header
      id="inicio"
      className="dark bg-background text-foreground bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-accent-soft),transparent)]"
    >
      <div
        className={cn(
          CONTEUDO,
          'grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-14 py-[clamp(64px,10vw,128px)]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-7">
          <p className="text-primary font-mono text-[13px] tracking-[0.2em] uppercase">
            ~/pilutech · Teresina, PI · atendimento remoto
          </p>
          <h1 className="text-[clamp(40px,5.6vw,68px)] leading-[1.04] font-extrabold tracking-[-0.035em] text-balance wrap-break-word">
            Aplicativos, infraestrutura e desenvolvimento fullstack.
          </h1>
          <p className="text-muted-foreground max-w-[560px] text-[clamp(17px,1.6vw,20px)] leading-[1.6] text-pretty">
            A PiluTech cria e mantém aplicativos, provisiona infraestrutura em
            nuvem e entrega o orçamento de cada item antes de você contratar.
            Você fala direto com quem desenvolve.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className={BOTAO_GRANDE}>
              <a href={WHATSAPP.geral} {...ABRE_EM_ABA_NOVA}>
                <FontAwesomeIcon icon={faWhatsapp} className="size-[18px]" />
                Falar no WhatsApp
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className={cn(BOTAO_GRANDE, 'text-foreground bg-transparent')}
            >
              <a href="#servicos">Ver serviços</a>
            </Button>
          </div>
        </div>
        <Terminal />
      </div>
    </header>
  )
}
```

`apps/pilutech-site/components/servicos.tsx`:

```tsx
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { cn } from '@piluvitu/ui/cn'
import { SERVICOS } from '@/lib/conteudo'
import { CabecalhoSecao } from './cabecalho-secao'
import { CONTEUDO, ESPACO_DA_SECAO } from './classes'

export function Servicos() {
  return (
    <section
      id="servicos"
      aria-labelledby="servicos-titulo"
      className="bg-background text-foreground"
    >
      <div className={cn(CONTEUDO, ESPACO_DA_SECAO, 'flex flex-col gap-12')}>
        <CabecalhoSecao
          id="servicos-titulo"
          rotulo="Serviços"
          contagem={SERVICOS.length}
          titulo="Do primeiro protótipo ao servidor em produção."
        />
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5">
          {SERVICOS.map((servico, indice) => (
            <li
              key={servico.area}
              className="bg-card border-border flex min-w-0 flex-col gap-[18px] rounded-3xl border p-8"
            >
              <div className="border-border text-primary flex size-12 items-center justify-center rounded-2xl border">
                <FontAwesomeIcon icon={servico.icone} className="size-[19px]" />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
                  {String(indice + 1).padStart(2, '0')} · {servico.area}
                </p>
                <h3 className="text-[23px] font-bold tracking-[-0.02em]">
                  {servico.titulo}
                </h3>
              </div>
              <p className="text-muted-foreground text-base leading-[1.6] text-pretty">
                {servico.texto}
              </p>
              <ul className="border-border flex flex-col gap-2.5 border-t pt-4 text-[15px]">
                {servico.itens.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden className="text-primary font-mono">
                      →
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
```

`apps/pilutech-site/components/como-funciona.tsx`:

```tsx
import { cn } from '@piluvitu/ui/cn'
import { ETAPAS } from '@/lib/conteudo'
import { CabecalhoSecao } from './cabecalho-secao'
import { CONTEUDO, ESPACO_DA_SECAO } from './classes'

export function ComoFunciona() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="como-funciona-titulo"
      className="dark bg-background text-foreground"
    >
      <div className={cn(CONTEUDO, ESPACO_DA_SECAO, 'flex flex-col gap-12')}>
        <CabecalhoSecao
          id="como-funciona-titulo"
          rotulo="Como funciona"
          contagem={ETAPAS.length}
          titulo="Quatro etapas, com escopo e valor por escrito."
        />
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-5">
          {ETAPAS.map((etapa, indice) => (
            <li
              key={etapa.titulo}
              className="bg-card border-border flex min-w-0 flex-col gap-3.5 rounded-3xl border p-7"
            >
              <span
                aria-hidden
                className="text-primary font-mono text-[28px] font-semibold"
              >
                {String(indice + 1).padStart(2, '0')}
              </span>
              <h3 className="text-xl font-bold tracking-[-0.02em]">
                {etapa.titulo}
              </h3>
              <p className="text-muted-foreground text-[15px] leading-[1.6]">
                {etapa.texto}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
```

`apps/pilutech-site/components/projetos.tsx`:

```tsx
import type { Fase } from '@piluvitu/tools/pilulabs'
import { cn } from '@piluvitu/ui/cn'
import Image from 'next/image'
import { ABRE_EM_ABA_NOVA } from '@/lib/contato'
import { cartoesDosProjetos } from '@/lib/conteudo'
import { CabecalhoSecao } from './cabecalho-secao'
import { CONTEUDO, ESPACO_DA_SECAO } from './classes'

export function Projetos({ faseDoBotai }: { faseDoBotai: Fase }) {
  const cartoes = cartoesDosProjetos(faseDoBotai)
  return (
    <section
      id="projetos"
      aria-labelledby="projetos-titulo"
      className="bg-background text-foreground"
    >
      <div className={cn(CONTEUDO, ESPACO_DA_SECAO, 'flex flex-col gap-12')}>
        <CabecalhoSecao
          id="projetos-titulo"
          rotulo="Projetos"
          contagem={cartoes.length}
          titulo="Produtos próprios da PiluTech."
        />
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-6">
          {cartoes.map((projeto) => (
            <li key={projeto.nome} className="min-w-0">
              <a
                href={projeto.url}
                {...ABRE_EM_ABA_NOVA}
                className="bg-card border-border hover:border-primary text-foreground flex h-full flex-col overflow-hidden rounded-[28px] border transition-colors"
              >
                <Image
                  src={projeto.imagem.src}
                  alt={projeto.imagem.alt}
                  width={1200}
                  height={630}
                  sizes="(min-width: 1180px) 530px, (min-width: 960px) 45vw, calc(100vw - 40px)"
                  className="bg-grafite border-border block aspect-[1200/630] h-auto w-full border-b object-cover"
                />
                <div className="flex flex-col gap-3.5 p-7">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[26px] font-extrabold tracking-[-0.03em]">
                      {projeto.nome}
                    </h3>
                    <span className="border-border text-muted-foreground rounded-[10px] border px-2.5 py-[5px] font-mono text-xs tracking-[0.12em] uppercase">
                      {projeto.selo}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-base leading-[1.6] text-pretty">
                    {projeto.texto}
                  </p>
                  <span className="text-primary font-mono text-sm">
                    {projeto.endereco} <span aria-hidden>→</span>
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
```

`apps/pilutech-site/components/tecnologias.tsx`:

```tsx
import { cn } from '@piluvitu/ui/cn'
import { TECNOLOGIAS } from '@/lib/conteudo'
import { CabecalhoSecao } from './cabecalho-secao'
import { CONTEUDO, ESPACO_DA_SECAO } from './classes'

export function Tecnologias() {
  return (
    <section
      id="tecnologias"
      aria-labelledby="tecnologias-titulo"
      className="dark bg-background text-foreground"
    >
      <div className={cn(CONTEUDO, ESPACO_DA_SECAO, 'flex flex-col gap-12')}>
        <CabecalhoSecao
          id="tecnologias-titulo"
          rotulo="Tecnologias"
          contagem={TECNOLOGIAS.length}
          titulo="Ferramentas usadas no dia a dia."
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5">
          {TECNOLOGIAS.map((grupo, indice) => {
            const id = `tecnologias-grupo-${indice + 1}`
            return (
              <div
                key={grupo.grupo}
                className="border-border flex min-w-0 flex-col gap-4 border-t pt-5"
              >
                <h3
                  id={id}
                  className="text-muted-foreground font-mono text-xs font-normal tracking-[0.2em] uppercase"
                >
                  {grupo.grupo}
                </h3>
                <ul
                  aria-labelledby={id}
                  className="flex flex-wrap gap-2 font-mono text-[15px]"
                >
                  {grupo.itens.map((item) => (
                    <li
                      key={item}
                      className="border-border rounded-xl border px-3.5 py-2"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
```

`apps/pilutech-site/components/planos.tsx`:

```tsx
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { ABRE_EM_ABA_NOVA } from '@/lib/contato'
import { PLANOS } from '@/lib/conteudo'
import { CabecalhoSecao } from './cabecalho-secao'
import { BOTAO_GRANDE, CONTEUDO, ESPACO_DA_SECAO } from './classes'

export function Planos() {
  return (
    <section
      id="planos"
      aria-labelledby="planos-titulo"
      className="bg-primary text-primary-foreground"
    >
      <div className={cn(CONTEUDO, ESPACO_DA_SECAO, 'flex flex-col gap-12')}>
        <CabecalhoSecao
          id="planos-titulo"
          rotulo="Planos de manutenção"
          contagem={PLANOS.length}
          titulo="Seu aplicativo atualizado, monitorado e no ar."
          tom="petroleo"
        >
          <p className="max-w-[640px] text-[17px] leading-[1.6]">
            Planos mensais. O valor depende do tamanho do aplicativo e da
            infraestrutura, e vem na proposta.
          </p>
        </CabecalhoSecao>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5">
          {PLANOS.map((plano) => (
            <li
              key={plano.nome}
              className="bg-petroleo-cartao border-petroleo-borda flex min-w-0 flex-col gap-[22px] rounded-3xl border p-8"
            >
              <div className="flex flex-col gap-2">
                <h3 className="text-2xl font-extrabold tracking-[-0.02em]">
                  {plano.nome}
                </h3>
                <p className="text-[15px] leading-[1.5]">{plano.para}</p>
              </div>
              <ul className="flex flex-1 flex-col gap-3 text-[15px]">
                {plano.itens.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden className="text-ciano font-mono">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className={cn(
                  BOTAO_GRANDE,
                  'text-petroleo-cartao focus-visible:ring-offset-petroleo-cartao h-[46px] w-full bg-white hover:bg-white/90 focus-visible:ring-white',
                )}
              >
                <a href={plano.whatsapp} {...ABRE_EM_ABA_NOVA}>
                  Pedir proposta
                  <span className="sr-only"> do plano {plano.nome}</span>
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
```

`apps/pilutech-site/components/landing.tsx`:

```tsx
import type { Fase } from '@piluvitu/tools/pilulabs'
import { ComoFunciona } from './como-funciona'
import { Hero } from './hero'
import { Planos } from './planos'
import { Projetos } from './projetos'
import { Servicos } from './servicos'
import { Tecnologias } from './tecnologias'

export type ModeloDaLanding = { faseDoBotai: Fase }

export function Landing({ faseDoBotai }: ModeloDaLanding) {
  return (
    <>
      <Hero />
      <main>
        <Servicos />
        <ComoFunciona />
        <Projetos faseDoBotai={faseDoBotai} />
        <Tecnologias />
        <Planos />
      </main>
    </>
  )
}
```

`apps/pilutech-site/app/page.tsx`:

```tsx
import { Landing } from '@/components/landing'
import { lerFaseDoBotai } from '@/lib/cms'

export default function Home() {
  return <Landing faseDoBotai={lerFaseDoBotai()} />
}
```

Stories (todas com `layout: 'fullscreen'`; as seções claras e a página com `globals: { fundo: 'claro' }`, porque dentro de `.dark` elas herdariam os tokens escuros):

`components/terminal.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Terminal } from './terminal'

const meta = {
  title: 'Landing/Terminal',
  component: Terminal,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Terminal>

export default meta
type Story = StoryObj<typeof meta>

export const Escuro: Story = {}
```

`components/hero.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Hero } from './hero'

const meta = {
  title: 'Landing/Hero',
  component: Hero,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Hero>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
```

`components/servicos.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Servicos } from './servicos'

const meta = {
  title: 'Landing/Servicos',
  component: Servicos,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Servicos>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
```

`components/como-funciona.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { ComoFunciona } from './como-funciona'

const meta = {
  title: 'Landing/ComoFunciona',
  component: ComoFunciona,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ComoFunciona>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
```

`components/projetos.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Projetos } from './projetos'

const meta = {
  title: 'Landing/Projetos',
  component: Projetos,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Projetos>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: { faseDoBotai: 'em-breve' } }
export const BotaiPublicado: Story = { args: { faseDoBotai: 'disponivel' } }
```

`components/tecnologias.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Tecnologias } from './tecnologias'

const meta = {
  title: 'Landing/Tecnologias',
  component: Tecnologias,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Tecnologias>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
```

`components/planos.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Planos } from './planos'

const meta = {
  title: 'Landing/Planos',
  component: Planos,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Planos>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
```

`components/landing.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Landing } from './landing'

const meta = {
  title: 'Landing/Pagina',
  component: Landing,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Landing>

export default meta
type Story = StoryObj<typeof meta>

export const EmBreve: Story = { args: { faseDoBotai: 'em-breve' } }
export const BotaiPublicado: Story = { args: { faseDoBotai: 'disponivel' } }
```

- [ ] **Step 4: Rode os testes e confirme que passam**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && pnpm run test; echo "test exit=$?"
```

Expected: `test exit=0`.

- [ ] **Step 5: E2E da página até aqui**

`apps/pilutech-site/app/pagina.e2e.ts` (substitui o de fumaça):

```ts
import { expect, test, type Page } from '@playwright/test'
import { lerFaseDoBotai } from '../lib/cms'
import { BOTAI, cartoesDosProjetos } from '../lib/conteudo'
import { WHATSAPP } from '../lib/contato'
import { rgbDoToken } from '../lib/tokens-do-ds'

// O esperado sai do mesmo YAML que a página lê no build.
const cartoes = cartoesDosProjetos(lerFaseDoBotai())

const fundo = (page: Page, seletor: string) =>
  page.locator(seletor).evaluate((el) => getComputedStyle(el).backgroundColor)

const H2_DO_CORPO = [
  'Do primeiro protótipo ao servidor em produção.',
  'Quatro etapas, com escopo e valor por escrito.',
  'Produtos próprios da PiluTech.',
  'Ferramentas usadas no dia a dia.',
  'Seu aplicativo atualizado, monitorado e no ar.',
]

// Review Focus 1: um elemento que vaza para o gutter não aumenta o scrollWidth da página. Confere cada
// elemento contra a área de conteúdo (sem o padding) do contêiner da própria seção, e o texto que vaza
// da própria caixa (scrollWidth > clientWidth com overflow visível).
async function vazamentos(page: Page): Promise<string[]> {
  return page
    .locator('nav, header#inicio, main > section, footer')
    .evaluateAll((areas) =>
      areas.flatMap((area) => {
        const caixa = area.firstElementChild as HTMLElement
        const estilo = getComputedStyle(caixa)
        const limites = caixa.getBoundingClientRect()
        const esquerda = limites.left + parseFloat(estilo.paddingLeft)
        const direita = limites.right - parseFloat(estilo.paddingRight)
        return [...caixa.querySelectorAll<HTMLElement>('*')]
          .filter((el) => {
            const r = el.getBoundingClientRect()
            // Até 1 px de largura: o sr-only e o que não tem caixa.
            if (r.width <= 1) return false
            const foraDaCaixa =
              r.left < esquerda - 0.5 || r.right > direita + 0.5
            const textoVazando =
              getComputedStyle(el).overflowX === 'visible' &&
              el.clientWidth > 0 &&
              el.scrollWidth > el.clientWidth + 1
            return foraDaCaixa || textoVazando
          })
          .map(
            (el) =>
              `${area.id || area.tagName.toLowerCase()} <${el.tagName.toLowerCase()}> ${(el.textContent ?? '').trim().slice(0, 40)}`,
          )
      }),
    )
}

test.describe('/', () => {
  test('o h1 e as seções do design, na ordem, sem erro de hidratação', async ({
    page,
  }) => {
    const erros: string[] = []
    page.on('console', (mensagem) => {
      if (
        mensagem.type() === 'error' &&
        /hydrat|#418|#423|#425/i.test(mensagem.text())
      )
        erros.push(mensagem.text())
    })
    const resposta = await page.goto('/')
    expect(resposta?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Aplicativos, infraestrutura e desenvolvimento fullstack.',
    )
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(
      H2_DO_CORPO,
    )
    await page.waitForLoadState('networkidle')
    expect(erros).toEqual([])
  })

  // No banner: na Tarefa 6 o botão flutuante também se chama "Falar no WhatsApp".
  test('Falar no WhatsApp e Ver serviços', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const banner = page.getByRole('banner')
    await expect(
      banner.getByRole('link', { name: 'Falar no WhatsApp' }),
    ).toHaveAttribute('href', WHATSAPP.geral)
    await banner.getByRole('link', { name: 'Ver serviços' }).click()
    await expect(page).toHaveURL(/#servicos$/)
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Do primeiro protótipo ao servidor em produção.',
      }),
    ).toBeInViewport()
  })

  // Review Focus 6: o `dark` de cada seção só vale com o @theme inline do globals.css.
  test('cada seção com as cores do design', async ({ page }) => {
    await page.goto('/')
    const noite = rgbDoToken('escuro', 'background')
    const nevoa = rgbDoToken('claro', 'background')
    for (const [secao, esperado] of [
      ['header#inicio', noite],
      ['#servicos', nevoa],
      ['#como-funciona', noite],
      ['#projetos', nevoa],
      ['#tecnologias', noite],
      ['#planos', rgbDoToken('claro', 'primary')],
    ])
      expect([secao, await fundo(page, secao)]).toEqual([secao, esperado])
    expect(
      await page
        .getByRole('heading', { level: 1 })
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe(rgbDoToken('escuro', 'foreground'))
    expect(await fundo(page, 'header#inicio a[href^="https://wa.me/"]')).toBe(
      rgbDoToken('escuro', 'primary'),
    )
  })

  // Review Focus 7: sem o ANEL_DE_FOCO, o anel é 1 px Ciano em volta do botão Ciano.
  test('o foco pelo teclado no "Falar no WhatsApp" do hero mostra o anel Ciano com folga Noite', async ({
    page,
  }) => {
    await page.goto('/')
    const botao = page
      .getByRole('banner')
      .getByRole('link', { name: 'Falar no WhatsApp' })
    for (
      let i = 0;
      i < 20 && !(await botao.evaluate((el) => el === document.activeElement));
      i++
    )
      await page.keyboard.press('Tab')
    await expect(botao).toBeFocused()
    const sombra = await botao.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(sombra).toContain(
      `${rgbDoToken('escuro', 'background')} 0px 0px 0px 2px`,
    )
    expect(sombra).toContain(`${rgbDoToken('escuro', 'ring')} 0px 0px 0px 4px`)
  })

  test('os cartões dos projetos: domínio em aba nova, imagem OG pelo otimizador e o selo do CMS', async ({
    page,
  }) => {
    await page.goto('/')
    for (const projeto of cartoes) {
      const link = page.locator(`a[href="${projeto.url}"]`)
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      await expect(link).toContainText(projeto.selo)
      const imagem = link.getByRole('img', { name: projeto.imagem.alt })
      expect(await imagem.getAttribute('src')).toContain(
        `/_next/image?url=${encodeURIComponent(projeto.imagem.src)}&`,
      )
    }
  })

  // Review Focus 3.
  test('com a imagem remota fora do ar, o cartão continua com link, nome, selo e alt', async ({
    page,
  }) => {
    await page.route(/\/_next\/image\?/, (rota) =>
      rota.fulfill({ status: 502, body: '' }),
    )
    await page.goto('/')
    const botai = page.locator(`a[href="${BOTAI.url}"]`)
    await botai.scrollIntoViewIfNeeded()
    await expect(
      botai.getByRole('heading', { level: 3, name: 'Botaí' }),
    ).toBeVisible()
    await expect(botai).toContainText(cartoes[0].selo)
    await expect(
      botai.getByRole('img', { name: BOTAI.imagem.alt }),
    ).toHaveCount(1)
  })

  test.describe('a 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('sem rolagem horizontal', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const largura = await page.evaluate(() => ({
        rolavel: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }))
      expect(largura.rolavel).toBeLessThanOrEqual(largura.visivel)
    })

    test('nenhum elemento passa da área de conteúdo da própria seção', async ({
      page,
    }) => {
      await page.goto('/')
      expect(await vazamentos(page)).toEqual([])
    })
  })
})
```

Se o teste de vazamento acusar algo, a correção é no componente (quebra de linha, `min-w-0`, `max-w-full`), nunca no teste.

**A primeira passada do `test:e2e` (Review Focus 8),** no molde do `apps/botai-site` (`playwright.lojas.config.ts`, `app/lojas-publicadas.yaml` e `app/lojas-publicadas.e2e.ts` dele): o CMS real tem as 4 lojas do Botaí vazias, e só um build com loja publicada exercita o selo "disponível" vindo do `page.tsx`.

`apps/pilutech-site/app/lojas-publicadas.yaml`:

```yaml
# YAML de teste do playwright.lojas.config.ts, no lugar de apps/web/content/pilulabs/botai/index.yaml.
slug: botai
chromeUrl: https://addons.mozilla.org/x
firefoxUrl: https://addons.mozilla.org/pt-BR/firefox/addon/botai/
edgeUrl: http://microsoftedge.microsoft.com/addons/detail/botai/xyz
operaUrl: ''
```

`apps/pilutech-site/app/lojas-publicadas.e2e.ts`:

```ts
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { lerFaseDoBotai } from '../lib/cms'
import { BOTAI, SOMBRAI } from '../lib/conteudo'

// Roda só pelo playwright.lojas.config.ts, que builda a landing com este YAML no lugar do CMS.
test('a fixture: Firefox publicado, então o Botaí está disponível', () => {
  expect(lerFaseDoBotai(join(__dirname, 'lojas-publicadas.yaml'))).toBe(
    'disponivel',
  )
})

test('o selo do Botaí diz disponível, e o do Sombraí continua em breve', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator(`a[href="${BOTAI.url}"]`)).toContainText(
    'Extensão de navegador · disponível',
  )
  await expect(page.locator(`a[href="${SOMBRAI.url}"]`)).toContainText(
    'App Android e iPhone · em breve',
  )
})
```

`apps/pilutech-site/playwright.lojas.config.ts`:

```ts
import { join } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testMatch: ['**/lojas-publicadas.e2e.ts'],
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3021',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm run build && pnpm run start',
    url: 'http://localhost:3021',
    reuseExistingServer: false,
    timeout: 300_000,
    cwd: '.',
    env: { BOTAI_CMS_ITEM: join(__dirname, 'app', 'lojas-publicadas.yaml') },
  },
})
```

Em `apps/pilutech-site/playwright.config.ts`, depois de `testMatch: ['**/*.e2e.ts'],`, acrescente `testIgnore: ['**/lojas-publicadas.e2e.ts'],`. Em `apps/pilutech-site/package.json`, troque `"test:e2e": "playwright test"` por `"test:e2e": "playwright test -c playwright.lojas.config.ts && playwright test"` (a ordem deixa o `.next` com o CMS real).

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
pnpm run build; echo "build exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
lsof -nP -iTCP:3021 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test -c playwright.lojas.config.ts --retries=0; echo "e2e lojas exit=$?"
CI=1 ./node_modules/.bin/playwright test --retries=0; echo "e2e exit=$?"
```

Expected: tudo `exit=0`. **Prova da passada das lojas (uma vez):** troque, no `app/page.tsx`, `lerFaseDoBotai()` por `'em-breve'` e rode a passada das lojas → `exit=1` no "o selo do Botaí diz disponível"; desfaça e rode de novo → `exit=0`. Compare a página (desktop a 1280 px e celular a 390 px) com `desktop.png` e `mobile.png` do design, seção por seção, do hero aos planos: cores, tamanhos, espaços e textos. Confira `/usr/bin/git status` (arquivos do Next para agentes).

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/pilutech-site && /usr/bin/git status --short && /usr/bin/git commit -m "feat(pilutech-site): hero com terminal, serviços, como funciona, projetos, tecnologias e planos"; echo "exit=$?"
```

---

### Tarefa 5: Dúvidas com acordeão acessível

A seção "Perguntas frequentes" do design com o padrão de acordeão da WAI-ARIA: cada pergunta é um `<button>` dentro de um `h3`, com `aria-expanded` e `aria-controls`; a primeira vem aberta; abrir uma fecha a outra (como o `toggle` do design); Enter e Espaço funcionam porque é botão nativo. As cinco respostas saem no HTML do servidor e as fechadas levam `hidden`: o Google não interage com a página, e sem JavaScript a primeira resposta continua legível. Os ids são fixos (`duvida-<n>-pergunta`/`duvida-<n>-resposta`): há um acordeão só na página, e o `useId` não acrescentaria nada.

**Files:**

- Create (`apps/pilutech-site/components/`): `acordeao.tsx`, `acordeao.test.tsx`, `acordeao.stories.tsx`, `duvidas.tsx`, `duvidas.test.tsx`, `duvidas.stories.tsx`
- Modify (`apps/pilutech-site/`): `components/landing.tsx`, `components/landing.test.tsx`, `app/pagina.e2e.ts`

**Interfaces:**

- Consumes: `DUVIDAS`, `type Duvida` (Tarefa 3); `CabecalhoSecao` (Tarefa 1); `ESPACO_DA_SECAO` (Tarefa 4).
- Produces: `Acordeao({ itens, prefixo = 'duvida' }: { itens: readonly Duvida[]; prefixo?: string })` (`'use client'`); `Duvidas()` (`<section id="duvidas" aria-labelledby="duvidas-titulo">`, largura de 860 px como o design). A `Landing` passa a terminar o `<main>` com `<Duvidas />`.

- [ ] **Step 1: Escreva os testes que falham**

`apps/pilutech-site/components/acordeao.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToStaticMarkup } from 'react-dom/server'
import { DUVIDAS } from '@/lib/conteudo'
import { Acordeao } from './acordeao'

const perguntas = () => screen.getAllByRole('button')
const estados = () => perguntas().map((b) => b.getAttribute('aria-expanded'))

describe('Acordeao', () => {
  it('cada pergunta é um botão num h3, ligado à resposta por aria-controls', () => {
    render(<Acordeao itens={DUVIDAS} />)
    DUVIDAS.forEach((duvida, indice) => {
      const botao = screen.getByRole('button', { name: duvida.pergunta })
      expect(botao.parentElement?.tagName).toBe('H3')
      expect(botao).toHaveAttribute('id', `duvida-${indice + 1}-pergunta`)
      const resposta = document.getElementById(
        botao.getAttribute('aria-controls') ?? '',
      )
      expect(resposta).toHaveAttribute('id', `duvida-${indice + 1}-resposta`)
      expect(resposta).toHaveTextContent(duvida.resposta)
    })
  })

  it('a primeira vem aberta e as outras fechadas, com hidden', () => {
    render(<Acordeao itens={DUVIDAS} />)
    expect(estados()).toEqual(['true', 'false', 'false', 'false', 'false'])
    expect(screen.getByText(DUVIDAS[0].resposta)).toBeVisible()
    for (const duvida of DUVIDAS.slice(1))
      expect(screen.getByText(duvida.resposta)).not.toBeVisible()
  })

  it('abrir uma fecha a outra, e clicar de novo fecha', async () => {
    const user = userEvent.setup()
    render(<Acordeao itens={DUVIDAS} />)
    const terceira = screen.getByRole('button', { name: DUVIDAS[2].pergunta })
    await user.click(terceira)
    expect(estados()).toEqual(['false', 'false', 'true', 'false', 'false'])
    expect(screen.getByText(DUVIDAS[2].resposta)).toBeVisible()
    await user.click(terceira)
    expect(estados()).toEqual(['false', 'false', 'false', 'false', 'false'])
  })

  it('pelo teclado: Tab chega na pergunta, Enter e Espaço abrem e fecham', async () => {
    const user = userEvent.setup()
    render(<Acordeao itens={DUVIDAS} />)
    await user.tab()
    expect(perguntas()[0]).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(perguntas()[0]).toHaveAttribute('aria-expanded', 'false')
    await user.tab()
    expect(perguntas()[1]).toHaveFocus()
    await user.keyboard(' ')
    expect(perguntas()[1]).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(DUVIDAS[1].resposta)).toBeVisible()
  })

  it('o sinal é − na aberta e + nas fechadas, fora do leitor de tela', () => {
    const { container } = render(<Acordeao itens={DUVIDAS} />)
    expect(
      [...container.querySelectorAll('button [aria-hidden="true"]')].map(
        (sinal) => sinal.textContent,
      ),
    ).toEqual(['−', '+', '+', '+', '+'])
  })

  // Review Focus 4: o Google não clica no acordeão, e sem JavaScript as respostas têm de estar no HTML.
  it('no HTML do servidor: as 5 respostas, a primeira aberta e 4 com hidden', () => {
    const html = renderToStaticMarkup(<Acordeao itens={DUVIDAS} />)
    for (const duvida of DUVIDAS) expect(html).toContain(duvida.resposta)
    expect(html.match(/ hidden=""/g)).toHaveLength(4)
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1)
  })
})
```

`apps/pilutech-site/components/duvidas.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { DUVIDAS } from '@/lib/conteudo'
import { Duvidas } from './duvidas'

describe('Duvidas', () => {
  it('seção clara, rotulada pelo título, com a âncora #duvidas', () => {
    render(<Duvidas />)
    const secao = screen.getByRole('region', { name: 'Dúvidas comuns' })
    expect(secao).toHaveAttribute('id', 'duvidas')
    expect(secao).not.toHaveClass('dark')
    expect(within(secao).getByText('Perguntas frequentes')).toBeInTheDocument()
    expect(within(secao).getByText('05')).toBeInTheDocument()
  })

  it('as 5 perguntas do design, no acordeão', () => {
    render(<Duvidas />)
    expect(
      screen.getAllByRole('button').map((b) => b.getAttribute('aria-controls')),
    ).toEqual(DUVIDAS.map((_, i) => `duvida-${i + 1}-resposta`))
  })
})
```

Em `apps/pilutech-site/components/landing.test.tsx`, no teste "as seções do corpo, na ordem do design", acrescente `'Dúvidas comuns',` depois de `'Seu aplicativo atualizado, monitorado e no ar.',`.

- [ ] **Step 2: Rode e confirme que falham**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/jest components/acordeao.test.tsx components/duvidas.test.tsx components/landing.test.tsx; echo "exit=$?"
```

Expected: `exit=1`: `Cannot find module './acordeao'`, `'./duvidas'`, e a landing sem o `h2` "Dúvidas comuns".

- [ ] **Step 3: Implemente**

`apps/pilutech-site/components/acordeao.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { Duvida } from '@/lib/conteudo'

type AcordeaoProps = { itens: readonly Duvida[]; prefixo?: string }

export function Acordeao({ itens, prefixo = 'duvida' }: AcordeaoProps) {
  const [aberto, setAberto] = useState(0)
  return (
    <div className="border-border flex flex-col border-t">
      {itens.map((item, indice) => {
        const estaAberto = aberto === indice
        const id = `${prefixo}-${indice + 1}`
        return (
          <div key={item.pergunta} className="border-border border-b">
            <h3>
              <button
                type="button"
                id={`${id}-pergunta`}
                aria-expanded={estaAberto}
                aria-controls={`${id}-resposta`}
                onClick={() => setAberto(estaAberto ? -1 : indice)}
                className="text-foreground focus-visible:outline-ring flex w-full cursor-pointer items-center justify-between gap-5 py-[22px] text-left text-lg font-bold tracking-[-0.01em] focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                {item.pergunta}
                <span
                  aria-hidden
                  className="border-border text-primary flex size-8 flex-none items-center justify-center rounded-[10px] border font-mono text-xl"
                >
                  {estaAberto ? '−' : '+'}
                </span>
              </button>
            </h3>
            <div id={`${id}-resposta`} hidden={!estaAberto}>
              <p className="text-muted-foreground pr-[52px] pb-6 text-base leading-[1.65] text-pretty">
                {item.resposta}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

`apps/pilutech-site/components/duvidas.tsx`:

```tsx
import { cn } from '@piluvitu/ui/cn'
import { DUVIDAS } from '@/lib/conteudo'
import { Acordeao } from './acordeao'
import { CabecalhoSecao } from './cabecalho-secao'
import { ESPACO_DA_SECAO } from './classes'

export function Duvidas() {
  return (
    <section
      id="duvidas"
      aria-labelledby="duvidas-titulo"
      className="bg-background text-foreground"
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-[860px] flex-col gap-10 px-[clamp(20px,5vw,48px)]',
          ESPACO_DA_SECAO,
        )}
      >
        <CabecalhoSecao
          id="duvidas-titulo"
          rotulo="Perguntas frequentes"
          contagem={DUVIDAS.length}
          titulo="Dúvidas comuns"
        />
        <Acordeao itens={DUVIDAS} />
      </div>
    </section>
  )
}
```

Em `apps/pilutech-site/components/landing.tsx`, acrescente `import { Duvidas } from './duvidas'` e `<Duvidas />` depois de `<Planos />`.

`apps/pilutech-site/components/acordeao.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { DUVIDAS } from '@/lib/conteudo'
import { Acordeao } from './acordeao'

const meta = {
  title: 'Landing/Acordeao',
  component: Acordeao,
  parameters: { layout: 'padded' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Acordeao>

export default meta
type Story = StoryObj<typeof meta>

export const DuvidasDoDesign: Story = { args: { itens: DUVIDAS } }
export const UmaPergunta: Story = { args: { itens: DUVIDAS.slice(0, 1) } }
```

`apps/pilutech-site/components/duvidas.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Duvidas } from './duvidas'

const meta = {
  title: 'Landing/Duvidas',
  component: Duvidas,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof Duvidas>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
```

- [ ] **Step 4: Rode os testes e confirme que passam**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && pnpm run test; echo "test exit=$?"
```

Expected: `test exit=0`.

- [ ] **Step 5: E2E do acordeão (teclado e sem JavaScript)**

Em `apps/pilutech-site/app/pagina.e2e.ts`: acrescente `DUVIDAS` ao import de `../lib/conteudo`; acrescente `'Dúvidas comuns',` ao fim de `H2_DO_CORPO`; e, dentro do `test.describe('/', …)`, antes do `test.describe('a 320 px', …)`:

```ts
test('dúvidas: abre e fecha pelo teclado, uma por vez', async ({ page }) => {
  await page.goto('/')
  const perguntas = page.locator('#duvidas').getByRole('button')
  await expect(perguntas).toHaveCount(5)
  await expect(perguntas.nth(0)).toHaveAttribute('aria-expanded', 'true')
  await perguntas.nth(1).focus()
  await page.keyboard.press('Enter')
  await expect(perguntas.nth(1)).toHaveAttribute('aria-expanded', 'true')
  await expect(perguntas.nth(0)).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText(DUVIDAS[1].resposta)).toBeVisible()
  await expect(page.getByText(DUVIDAS[0].resposta)).toBeHidden()
  await page.keyboard.press('Tab')
  await expect(perguntas.nth(2)).toBeFocused()
  await page.keyboard.press('Space')
  await expect(perguntas.nth(2)).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Space')
  await expect(perguntas.nth(2)).toHaveAttribute('aria-expanded', 'false')
})

// Review Focus 4.
test('dúvidas sem JavaScript: as 5 respostas no HTML, a primeira aberta', async ({
  browser,
}) => {
  const contexto = await browser.newContext({ javaScriptEnabled: false })
  const page = await contexto.newPage()
  await page.goto('/')
  const html = await page.content()
  for (const duvida of DUVIDAS) expect(html).toContain(duvida.resposta)
  await expect(page.getByText(DUVIDAS[0].resposta)).toBeVisible()
  for (const duvida of DUVIDAS.slice(1))
    await expect(page.getByText(duvida.resposta)).toBeHidden()
  await contexto.close()
})
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
pnpm run build; echo "build exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
lsof -nP -iTCP:3021 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test -c playwright.lojas.config.ts --retries=0; echo "e2e lojas exit=$?"
CI=1 ./node_modules/.bin/playwright test --retries=0; echo "e2e exit=$?"
```

Expected: tudo `exit=0`; o build continua com `Rotas estáticas: /, /icon, /apple-icon` (o acordeão é ilha de cliente numa página estática). Compare a seção com o `desktop.png`. Confira `/usr/bin/git status`.

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/pilutech-site && /usr/bin/git status --short && /usr/bin/git commit -m "feat(pilutech-site): dúvidas com acordeão acessível, respostas no HTML do servidor"; echo "exit=$?"
```

---

### Tarefa 6: Barra fixa, Contato, Rodapé e WhatsApp flutuante — a página completa

A moldura do design: a barra fixa com o símbolo e o lockup, os links das seções (escondidos abaixo de 900 px só por CSS, `hidden min-[900px]:flex`) e o botão do WhatsApp; o contato com o telefone e o e-mail (`[PiluTech] Contato pelo site` no assunto); o rodapé com o símbolo e o texto do design (o ano vem do build); e o botão flutuante do WhatsApp, fixo no canto, com `aria-label`. A `Landing` fica completa e o E2E da página cobre a barra, as âncoras, os links externos, o WhatsApp, o e-mail e o celular de 320 px.

**Files:**

- Create (`apps/pilutech-site/components/`): `barra.tsx`, `contato.tsx`, `rodape.tsx`, `whatsapp-flutuante.tsx` (cada um com `.test.tsx` e `.stories.tsx`)
- Modify (`apps/pilutech-site/`): `components/landing.tsx`, `components/landing.test.tsx`, `components/landing.stories.tsx`, `app/page.tsx`, `app/pagina.e2e.ts`

**Interfaces:**

- Consumes: `PiluTechMark` (Tarefa 2); `WHATSAPP`, `ABRE_EM_ABA_NOVA`, `MAILTO_DO_SITE`, `EMAIL_DA_PILUTECH`, `TELEFONE_VISIVEL` (Tarefa 3); `SECOES_DA_BARRA` (Tarefa 3); `CONTEUDO`, `ANEL_DE_FOCO`, `BOTAO_GRANDE` (Tarefa 4); `rgbDoToken` (Tarefa 1, só no E2E).
- Produces: `Barra()` (`<nav aria-label="Principal">`), `Contato()` (`<section id="contato">`), `Rodape({ ano }: { ano: number })`, `WhatsappFlutuante()`; `Landing({ faseDoBotai, ano }: { faseDoBotai: Fase; ano: number })` na ordem do design: barra, hero, `<main>` (serviços, como funciona, projetos, tecnologias, planos, dúvidas, contato), rodapé, botão flutuante.

- [ ] **Step 1: Escreva os testes que falham**

`apps/pilutech-site/components/barra.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { WHATSAPP } from '@/lib/contato'
import { SECOES_DA_BARRA } from '@/lib/conteudo'
import { Barra } from './barra'

describe('Barra', () => {
  it('é a navegação principal, escura e fixa no topo', () => {
    render(<Barra />)
    expect(screen.getByRole('navigation', { name: 'Principal' })).toHaveClass(
      'dark',
      'sticky',
      'top-0',
    )
  })

  it('o símbolo com o nome leva ao início', () => {
    render(<Barra />)
    expect(screen.getByRole('link', { name: 'PiluTech' })).toHaveAttribute(
      'href',
      '#inicio',
    )
  })

  it('os links das 5 seções, na ordem do design', () => {
    render(<Barra />)
    expect(
      within(screen.getByRole('list'))
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual(SECOES_DA_BARRA.map((s) => [s.rotulo, `#${s.id}`]))
  })

  // Spec: somem abaixo de 900 px por CSS, não por JavaScript (o E2E confere com o JavaScript desligado).
  it('os links das seções somem abaixo de 900 px por CSS', () => {
    render(<Barra />)
    expect(screen.getByRole('list')).toHaveClass('hidden', 'min-[900px]:flex')
  })

  it('o WhatsApp abre a conversa geral em aba nova', () => {
    render(<Barra />)
    const link = screen.getByRole('link', { name: 'WhatsApp' })
    expect(link).toHaveAttribute('href', WHATSAPP.geral)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // Review Focus 7: no escuro, o anel padrão do Button é o Ciano do próprio botão.
  it('o botão do WhatsApp tem anel de foco de 2 px com folga do fundo', () => {
    render(<Barra />)
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveClass(
      'focus-visible:ring-2',
      'focus-visible:ring-offset-2',
      'focus-visible:ring-offset-background',
    )
  })
})
```

`apps/pilutech-site/components/contato.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import { MAILTO_DO_SITE, WHATSAPP } from '@/lib/contato'
import { Contato } from './contato'

describe('Contato', () => {
  it('seção escura, rotulada pelo título, com a âncora #contato', () => {
    render(<Contato />)
    const secao = screen.getByRole('region', {
      name: 'Conte o que você precisa.',
    })
    expect(secao).toHaveAttribute('id', 'contato')
    expect(secao).toHaveClass('dark')
    expect(within(secao).getByText('contato')).toBeInTheDocument()
    expect(
      within(secao).getByText(
        'A conversa é direta com quem vai desenvolver. Pelo WhatsApp ou por e-mail.',
      ),
    ).toBeInTheDocument()
  })

  it('o WhatsApp com o telefone, na conversa geral, em aba nova', () => {
    render(<Contato />)
    const link = screen.getByRole('link', {
      name: 'WhatsApp (86) 98173-7625',
    })
    expect(link).toHaveAttribute('href', WHATSAPP.geral)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('o e-mail vai com [PiluTech] Contato pelo site no assunto', () => {
    render(<Contato />)
    const link = screen.getByRole('link', {
      name: 'E-mail pilutechinformatica@gmail.com',
    })
    expect(link).toHaveAttribute('href', MAILTO_DO_SITE)
    expect(link).not.toHaveAttribute('target')
  })

  // Review Focus 1: o endereço não tem espaço; a 320 px ele tem de quebrar dentro do botão.
  it('o botão do e-mail quebra o endereço em vez de vazar', () => {
    render(<Contato />)
    expect(
      screen.getByRole('link', {
        name: 'E-mail pilutechinformatica@gmail.com',
      }),
    ).toHaveClass('wrap-anywhere', 'whitespace-normal', 'max-w-full', 'h-auto')
  })

  // Review Focus 7: no escuro, o anel padrão do Button é o Ciano do próprio botão.
  it('os dois botões têm anel de foco de 2 px com folga do fundo', () => {
    render(<Contato />)
    for (const nome of [
      'WhatsApp (86) 98173-7625',
      'E-mail pilutechinformatica@gmail.com',
    ])
      expect(screen.getByRole('link', { name: nome })).toHaveClass(
        'focus-visible:ring-2',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-offset-background',
      )
  })
})
```

`apps/pilutech-site/components/rodape.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { Rodape } from './rodape'

describe('Rodape', () => {
  it('é o contentinfo escuro, com o símbolo e o nome', () => {
    render(<Rodape ano={2026} />)
    expect(screen.getByRole('contentinfo')).toHaveClass('dark')
    expect(screen.getByText('PiluTech')).toBeInTheDocument()
  })

  it('o texto do design, com o ano recebido', () => {
    const { rerender } = render(<Rodape ano={2026} />)
    expect(
      screen.getByText(
        '© 2026 PiluTech · Paulo Victor T S · pilutechinformatica@gmail.com',
      ),
    ).toBeInTheDocument()
    rerender(<Rodape ano={2027} />)
    expect(screen.getByText(/^© 2027 PiluTech/)).toBeInTheDocument()
  })
})
```

`apps/pilutech-site/components/whatsapp-flutuante.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { WHATSAPP } from '@/lib/contato'
import { WhatsappFlutuante } from './whatsapp-flutuante'

describe('WhatsappFlutuante', () => {
  it('tem nome, leva à conversa geral e abre em aba nova', () => {
    render(<WhatsappFlutuante />)
    const link = screen.getByRole('link', { name: 'Falar no WhatsApp' })
    expect(link).toHaveAttribute('aria-label', 'Falar no WhatsApp')
    expect(link).toHaveAttribute('href', WHATSAPP.geral)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('fica fixo no canto de baixo, acima do resto', () => {
    render(<WhatsappFlutuante />)
    expect(screen.getByRole('link')).toHaveClass(
      'fixed',
      'right-5',
      'bottom-5',
      'z-30',
    )
  })

  it('o ícone é decorativo', () => {
    const { container } = render(<WhatsappFlutuante />)
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })
})
```

`apps/pilutech-site/components/landing.test.tsx` (substitui o da Tarefa 4):

```tsx
import { render, screen, within } from '@testing-library/react'
import { Landing } from './landing'

const segue = (antes: Element, depois: Element) =>
  Boolean(
    antes.compareDocumentPosition(depois) & Node.DOCUMENT_POSITION_FOLLOWING,
  )

describe('Landing', () => {
  it('um único h1, no banner, fora do main', () => {
    render(<Landing faseDoBotai="em-breve" ano={2026} />)
    const [h1, ...outros] = screen.getAllByRole('heading', { level: 1 })
    expect(outros).toEqual([])
    expect(screen.getByRole('banner')).toContainElement(h1)
    expect(screen.getByRole('main')).not.toContainElement(
      screen.getByRole('banner'),
    )
  })

  it('a ordem do design: barra, hero, main, rodapé e o botão flutuante', () => {
    render(<Landing faseDoBotai="em-breve" ano={2026} />)
    const barra = screen.getByRole('navigation', { name: 'Principal' })
    const hero = screen.getByRole('banner')
    const main = screen.getByRole('main')
    const rodape = screen.getByRole('contentinfo')
    // O primeiro "Falar no WhatsApp" é o botão do hero; o segundo, o flutuante.
    const [, flutuante] = screen.getAllByRole('link', {
      name: 'Falar no WhatsApp',
    })
    expect(segue(barra, hero) && segue(hero, main) && segue(main, rodape)).toBe(
      true,
    )
    expect(segue(rodape, flutuante)).toBe(true)
  })

  it('as seções do main, na ordem do design', () => {
    render(<Landing faseDoBotai="em-breve" ano={2026} />)
    expect(
      within(screen.getByRole('main'))
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual([
      'Do primeiro protótipo ao servidor em produção.',
      'Quatro etapas, com escopo e valor por escrito.',
      'Produtos próprios da PiluTech.',
      'Ferramentas usadas no dia a dia.',
      'Seu aplicativo atualizado, monitorado e no ar.',
      'Dúvidas comuns',
      'Conte o que você precisa.',
    ])
  })

  it('o selo do Botaí segue a fase, e o rodapé o ano', () => {
    render(<Landing faseDoBotai="disponivel" ano={2027} />)
    expect(
      screen.getByText('Extensão de navegador · disponível'),
    ).toBeInTheDocument()
    expect(screen.getByText(/^© 2027 PiluTech/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rode e confirme que falham**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/jest components; echo "exit=$?"
```

Expected: `exit=1`: `Cannot find module './barra'`, `'./contato'`, `'./rodape'`, `'./whatsapp-flutuante'`, e a landing sem navegação, contato e rodapé.

- [ ] **Step 3: Implemente**

`apps/pilutech-site/components/barra.tsx`:

```tsx
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { ABRE_EM_ABA_NOVA, WHATSAPP } from '@/lib/contato'
import { SECOES_DA_BARRA } from '@/lib/conteudo'
import { ANEL_DE_FOCO, CONTEUDO } from './classes'
import { PiluTechMark } from './pilutech-mark'

export function Barra() {
  return (
    <nav
      aria-label="Principal"
      className="dark bg-background/94 text-foreground border-border sticky top-0 z-20 border-b"
    >
      <div
        className={cn(
          CONTEUDO,
          'flex h-[68px] items-center justify-between gap-6',
        )}
      >
        <a href="#inicio" className="flex">
          <PiluTechMark tamanho={30} lockup />
        </a>
        <div className="flex items-center gap-7">
          <ul className="hidden gap-6 text-[15px] min-[900px]:flex">
            {SECOES_DA_BARRA.map((secao) => (
              <li key={secao.id}>
                <a
                  href={`#${secao.id}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {secao.rotulo}
                </a>
              </li>
            ))}
          </ul>
          <Button
            asChild
            className={cn(
              'h-[38px] gap-2 rounded-xl px-3.5 text-sm font-semibold',
              ANEL_DE_FOCO,
            )}
          >
            <a href={WHATSAPP.geral} {...ABRE_EM_ABA_NOVA}>
              <FontAwesomeIcon icon={faWhatsapp} className="size-4" />
              WhatsApp
            </a>
          </Button>
        </div>
      </div>
    </nav>
  )
}
```

`apps/pilutech-site/components/contato.tsx`:

```tsx
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons'
import { faEnvelope } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import {
  ABRE_EM_ABA_NOVA,
  EMAIL_DA_PILUTECH,
  MAILTO_DO_SITE,
  TELEFONE_VISIVEL,
  WHATSAPP,
} from '@/lib/contato'
import { BOTAO_GRANDE, CONTEUDO } from './classes'

export function Contato() {
  return (
    <section
      id="contato"
      aria-labelledby="contato-titulo"
      className="dark bg-background text-foreground bg-[radial-gradient(60%_70%_at_50%_100%,rgb(56_189_248/0.12),transparent)]"
    >
      <div
        className={cn(
          CONTEUDO,
          'flex flex-col items-center gap-7 py-[clamp(80px,10vw,128px)] text-center',
        )}
      >
        <p className="text-primary font-mono text-[13px] tracking-[0.2em] uppercase">
          contato
        </p>
        <h2
          id="contato-titulo"
          className="max-w-[760px] text-[clamp(34px,4.6vw,56px)] leading-[1.06] font-extrabold tracking-[-0.035em] text-balance wrap-break-word"
        >
          Conte o que você precisa.
        </h2>
        <p className="text-muted-foreground max-w-[560px] text-lg leading-[1.6]">
          A conversa é direta com quem vai desenvolver. Pelo WhatsApp ou por
          e-mail.
        </p>
        <div className="flex max-w-full flex-wrap justify-center gap-3">
          <Button asChild className={BOTAO_GRANDE}>
            <a href={WHATSAPP.geral} {...ABRE_EM_ABA_NOVA}>
              <FontAwesomeIcon icon={faWhatsapp} className="size-[18px]" />
              <span className="sr-only">WhatsApp </span>
              {TELEFONE_VISIVEL}
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            className={cn(
              BOTAO_GRANDE,
              'text-foreground h-auto min-h-[50px] max-w-full bg-transparent py-3 wrap-anywhere whitespace-normal',
            )}
          >
            <a href={MAILTO_DO_SITE}>
              <FontAwesomeIcon
                icon={faEnvelope}
                className="size-[18px] flex-none"
              />
              <span className="sr-only">E-mail </span>
              {EMAIL_DA_PILUTECH}
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
```

`apps/pilutech-site/components/rodape.tsx`:

```tsx
import { cn } from '@piluvitu/ui/cn'
import { EMAIL_DA_PILUTECH } from '@/lib/contato'
import { CONTEUDO } from './classes'
import { PiluTechMark } from './pilutech-mark'

export function Rodape({ ano }: { ano: number }) {
  return (
    <footer className="dark bg-background text-foreground border-border border-t">
      <div
        className={cn(
          CONTEUDO,
          'flex flex-wrap items-center justify-between gap-5 py-8',
        )}
      >
        <PiluTechMark tamanho={28} lockup />
        <p className="text-muted-foreground font-mono text-[13px]">
          © {ano} PiluTech · Paulo Victor T S · {EMAIL_DA_PILUTECH}
        </p>
      </div>
    </footer>
  )
}
```

`apps/pilutech-site/components/whatsapp-flutuante.tsx`:

```tsx
import { faWhatsapp } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { ABRE_EM_ABA_NOVA, WHATSAPP } from '@/lib/contato'

export function WhatsappFlutuante() {
  return (
    <a
      href={WHATSAPP.geral}
      {...ABRE_EM_ABA_NOVA}
      aria-label="Falar no WhatsApp"
      className="dark bg-primary text-primary-foreground hover:bg-ciano-claro fixed right-5 bottom-5 z-30 flex size-14 items-center justify-center rounded-[18px] shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
    >
      <FontAwesomeIcon icon={faWhatsapp} className="size-7" />
    </a>
  )
}
```

`apps/pilutech-site/components/landing.tsx`:

```tsx
import type { Fase } from '@piluvitu/tools/pilulabs'
import { Barra } from './barra'
import { ComoFunciona } from './como-funciona'
import { Contato } from './contato'
import { Duvidas } from './duvidas'
import { Hero } from './hero'
import { Planos } from './planos'
import { Projetos } from './projetos'
import { Rodape } from './rodape'
import { Servicos } from './servicos'
import { Tecnologias } from './tecnologias'
import { WhatsappFlutuante } from './whatsapp-flutuante'

export type ModeloDaLanding = { faseDoBotai: Fase; ano: number }

export function Landing({ faseDoBotai, ano }: ModeloDaLanding) {
  return (
    <>
      <Barra />
      <Hero />
      <main>
        <Servicos />
        <ComoFunciona />
        <Projetos faseDoBotai={faseDoBotai} />
        <Tecnologias />
        <Planos />
        <Duvidas />
        <Contato />
      </main>
      <Rodape ano={ano} />
      <WhatsappFlutuante />
    </>
  )
}
```

`apps/pilutech-site/app/page.tsx` (a página é estática: o ano é o do build):

```tsx
import { Landing } from '@/components/landing'
import { lerFaseDoBotai } from '@/lib/cms'

export default function Home() {
  return (
    <Landing faseDoBotai={lerFaseDoBotai()} ano={new Date().getFullYear()} />
  )
}
```

Em `apps/pilutech-site/components/landing.stories.tsx`, troque os `args` por `{ faseDoBotai: 'em-breve', ano: 2026 }` e `{ faseDoBotai: 'disponivel', ano: 2026 }`.

Stories novas:

`components/barra.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Barra } from './barra'

const meta = {
  title: 'Landing/Barra',
  component: Barra,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Barra>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
```

`components/contato.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Contato } from './contato'

const meta = {
  title: 'Landing/Contato',
  component: Contato,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Contato>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
```

`components/rodape.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { Rodape } from './rodape'

const meta = {
  title: 'Landing/Rodape',
  component: Rodape,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Rodape>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = { args: { ano: 2026 } }
```

`components/whatsapp-flutuante.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs'
import { WhatsappFlutuante } from './whatsapp-flutuante'

const meta = {
  title: 'Landing/WhatsappFlutuante',
  component: WhatsappFlutuante,
  parameters: { layout: 'fullscreen' },
  globals: { fundo: 'claro' },
} satisfies Meta<typeof WhatsappFlutuante>

export default meta
type Story = StoryObj<typeof meta>

export const SobreFundoClaro: Story = {}
export const SobreFundoEscuro: Story = { globals: { fundo: 'escuro' } }
```

- [ ] **Step 4: Rode os testes e confirme que passam**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && pnpm run test; echo "test exit=$?"
```

Expected: `test exit=0`.

- [ ] **Step 5: E2E da página inteira**

`apps/pilutech-site/app/pagina.e2e.ts` (substitui o das Tarefas 4 e 5, com tudo):

```ts
import { expect, test, type Page } from '@playwright/test'
import { lerFaseDoBotai } from '../lib/cms'
import {
  BOTAI,
  cartoesDosProjetos,
  DUVIDAS,
  SECOES_DA_BARRA,
} from '../lib/conteudo'
import { EMAIL_DA_PILUTECH, MAILTO_DO_SITE, WHATSAPP } from '../lib/contato'
import { rgbDoToken } from '../lib/tokens-do-ds'

// O esperado sai do mesmo YAML que a página lê no build.
const cartoes = cartoesDosProjetos(lerFaseDoBotai())

const fundo = (page: Page, seletor: string) =>
  page.locator(seletor).evaluate((el) => getComputedStyle(el).backgroundColor)
const corDoTexto = (page: Page, seletor: string) =>
  page.locator(seletor).evaluate((el) => getComputedStyle(el).color)

const H2_DA_PAGINA = [
  'Do primeiro protótipo ao servidor em produção.',
  'Quatro etapas, com escopo e valor por escrito.',
  'Produtos próprios da PiluTech.',
  'Ferramentas usadas no dia a dia.',
  'Seu aplicativo atualizado, monitorado e no ar.',
  'Dúvidas comuns',
  'Conte o que você precisa.',
]

const barra = (page: Page) =>
  page.getByRole('navigation', { name: 'Principal' })

// Review Focus 1: um elemento que vaza para o gutter não aumenta o scrollWidth da página. Confere cada
// elemento contra a área de conteúdo (sem o padding) do contêiner da própria seção, e o texto que vaza
// da própria caixa (scrollWidth > clientWidth com overflow visível).
async function vazamentos(page: Page): Promise<string[]> {
  return page
    .locator('nav, header#inicio, main > section, footer')
    .evaluateAll((areas) =>
      areas.flatMap((area) => {
        const caixa = area.firstElementChild as HTMLElement
        const estilo = getComputedStyle(caixa)
        const limites = caixa.getBoundingClientRect()
        const esquerda = limites.left + parseFloat(estilo.paddingLeft)
        const direita = limites.right - parseFloat(estilo.paddingRight)
        return [...caixa.querySelectorAll<HTMLElement>('*')]
          .filter((el) => {
            const r = el.getBoundingClientRect()
            // Até 1 px de largura: o sr-only e o que não tem caixa.
            if (r.width <= 1) return false
            const foraDaCaixa =
              r.left < esquerda - 0.5 || r.right > direita + 0.5
            const textoVazando =
              getComputedStyle(el).overflowX === 'visible' &&
              el.clientWidth > 0 &&
              el.scrollWidth > el.clientWidth + 1
            return foraDaCaixa || textoVazando
          })
          .map(
            (el) =>
              `${area.id || area.tagName.toLowerCase()} <${el.tagName.toLowerCase()}> ${(el.textContent ?? '').trim().slice(0, 40)}`,
          )
      }),
    )
}

test.describe('/', () => {
  test('o h1 e as seções do design, na ordem, sem erro de hidratação', async ({
    page,
  }) => {
    const erros: string[] = []
    page.on('console', (mensagem) => {
      if (
        mensagem.type() === 'error' &&
        /hydrat|#418|#423|#425/i.test(mensagem.text())
      )
        erros.push(mensagem.text())
    })
    const resposta = await page.goto('/')
    expect(resposta?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Aplicativos, infraestrutura e desenvolvimento fullstack.',
    )
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(
      H2_DA_PAGINA,
    )
    await page.waitForLoadState('networkidle')
    expect(erros).toEqual([])
  })

  // No banner: o botão flutuante também se chama "Falar no WhatsApp".
  test('Falar no WhatsApp e Ver serviços', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const banner = page.getByRole('banner')
    await expect(
      banner.getByRole('link', { name: 'Falar no WhatsApp' }),
    ).toHaveAttribute('href', WHATSAPP.geral)
    await banner.getByRole('link', { name: 'Ver serviços' }).click()
    await expect(page).toHaveURL(/#servicos$/)
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Do primeiro protótipo ao servidor em produção.',
      }),
    ).toBeInViewport()
  })

  // Review Focus 6: o `dark` de cada seção só vale com o @theme inline do globals.css.
  test('cada seção com as cores do design', async ({ page }) => {
    await page.goto('/')
    const noite = rgbDoToken('escuro', 'background')
    const nevoa = rgbDoToken('claro', 'background')
    for (const [secao, esperado] of [
      ['header#inicio', noite],
      ['#servicos', nevoa],
      ['#como-funciona', noite],
      ['#projetos', nevoa],
      ['#tecnologias', noite],
      ['#planos', rgbDoToken('claro', 'primary')],
      ['#duvidas', nevoa],
      ['#contato', noite],
      ['footer', noite],
      ['a[aria-label="Falar no WhatsApp"]', rgbDoToken('escuro', 'primary')],
      [
        'header#inicio a[href^="https://wa.me/"]',
        rgbDoToken('escuro', 'primary'),
      ],
    ])
      expect([secao, await fundo(page, secao)]).toEqual([secao, esperado])
    // O fundo da barra tem 94% de opacidade (o Chromium devolve oklab): confere o texto.
    expect(await corDoTexto(page, 'nav')).toBe(
      rgbDoToken('escuro', 'foreground'),
    )
    expect(await corDoTexto(page, 'h1')).toBe(
      rgbDoToken('escuro', 'foreground'),
    )
  })

  // Review Focus 7: sem o ANEL_DE_FOCO, o anel é 1 px Ciano em volta do botão Ciano.
  test('o foco pelo teclado no "Falar no WhatsApp" do hero mostra o anel Ciano com folga Noite', async ({
    page,
  }) => {
    await page.goto('/')
    const botao = page
      .getByRole('banner')
      .getByRole('link', { name: 'Falar no WhatsApp' })
    for (
      let i = 0;
      i < 20 && !(await botao.evaluate((el) => el === document.activeElement));
      i++
    )
      await page.keyboard.press('Tab')
    await expect(botao).toBeFocused()
    const sombra = await botao.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(sombra).toContain(
      `${rgbDoToken('escuro', 'background')} 0px 0px 0px 2px`,
    )
    expect(sombra).toContain(`${rgbDoToken('escuro', 'ring')} 0px 0px 0px 4px`)
  })

  test.describe('barra fixa', () => {
    for (const largura of [900, 1280]) {
      test(`a ${largura} px: os 5 links visíveis, sem rolagem horizontal na barra`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: largura, height: 800 })
        await page.goto('/')
        for (const secao of SECOES_DA_BARRA)
          await expect(
            barra(page).getByRole('link', { name: secao.rotulo, exact: true }),
          ).toBeVisible()
        const medida = await barra(page).evaluate((nav) => {
          const caixa = nav.firstElementChild as HTMLElement
          return {
            caixa: caixa.scrollWidth - caixa.clientWidth,
            nav: nav.scrollWidth - nav.clientWidth,
          }
        })
        expect(medida).toEqual({ caixa: 0, nav: 0 })
      })
    }

    test('a 899 px os links somem e ficam o símbolo e o WhatsApp', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 899, height: 800 })
      await page.goto('/')
      await expect(
        barra(page).getByRole('link', { name: 'Serviços', exact: true }),
      ).toBeHidden()
      await expect(
        barra(page).getByRole('link', { name: 'PiluTech' }),
      ).toBeVisible()
      await expect(
        barra(page).getByRole('link', { name: 'WhatsApp' }),
      ).toBeVisible()
    })

    // Review Focus 4: é CSS, então vale antes da hidratação e sem JavaScript.
    test('sem JavaScript, a mesma regra dos 900 px', async ({ browser }) => {
      for (const [largura, visivel] of [
        [899, false],
        [900, true],
      ] as const) {
        const contexto = await browser.newContext({
          javaScriptEnabled: false,
          viewport: { width: largura, height: 800 },
        })
        const page = await contexto.newPage()
        await page.goto('/')
        const link = barra(page).getByRole('link', {
          name: 'Serviços',
          exact: true,
        })
        if (visivel) await expect(link).toBeVisible()
        else await expect(link).toBeHidden()
        await contexto.close()
      }
    })

    test('fica no topo ao rolar', async ({ page }) => {
      await page.goto('/')
      await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
      await expect(barra(page)).toBeInViewport()
      expect((await barra(page).boundingBox())?.y).toBe(0)
    })

    for (const secao of SECOES_DA_BARRA) {
      test(`${secao.rotulo} leva à seção, sem a barra cobrir o começo dela`, async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto('/')
        await barra(page)
          .getByRole('link', { name: secao.rotulo, exact: true })
          .click()
        await expect(page).toHaveURL(new RegExp(`#${secao.id}$`))
        await expect(
          page.locator(`#${secao.id}`).getByRole('heading', { level: 2 }),
        ).toBeInViewport()
        await expect
          .poll(
            async () => (await page.locator(`#${secao.id}`).boundingBox())?.y,
          )
          .toBeGreaterThanOrEqual(68)
      })
    }
  })

  test('todo link externo abre em aba nova, sem passar a referência', async ({
    page,
  }) => {
    await page.goto('/')
    const externos = await page.locator('a[href^="http"]').all()
    expect(externos.length).toBeGreaterThan(0)
    for (const link of externos) {
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  test('o WhatsApp: a conversa geral na barra, no hero, no contato e no botão flutuante, e uma por plano', async ({
    page,
  }) => {
    await page.goto('/')
    const hrefs = await page
      .locator('a[href^="https://wa.me/"]')
      .evaluateAll((links) => links.map((a) => a.getAttribute('href')))
    expect(hrefs.filter((h) => h === WHATSAPP.geral)).toHaveLength(4)
    expect(hrefs.filter((h) => h !== WHATSAPP.geral)).toEqual([
      WHATSAPP.essencial,
      WHATSAPP.evolucao,
      WHATSAPP.infraestrutura,
    ])
  })

  test('o botão flutuante tem nome e continua na tela ao rolar', async ({
    page,
  }) => {
    await page.goto('/')
    const flutuante = page.locator('a[aria-label="Falar no WhatsApp"]')
    await expect(flutuante).toHaveAttribute('href', WHATSAPP.geral)
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded()
    await expect(flutuante).toBeInViewport()
  })

  test('o e-mail vai para a PiluTech com [PiluTech] no assunto', async ({
    page,
  }) => {
    await page.goto('/')
    const email = page.getByRole('link', {
      name: `E-mail ${EMAIL_DA_PILUTECH}`,
    })
    await expect(email).toHaveAttribute('href', MAILTO_DO_SITE)
    expect(
      new URL((await email.getAttribute('href')) as string).searchParams.get(
        'subject',
      ),
    ).toBe('[PiluTech] Contato pelo site')
  })

  test('os cartões dos projetos: domínio em aba nova, imagem OG pelo otimizador e o selo do CMS', async ({
    page,
  }) => {
    await page.goto('/')
    for (const projeto of cartoes) {
      const link = page.locator(`a[href="${projeto.url}"]`)
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toContainText(projeto.selo)
      const imagem = link.getByRole('img', { name: projeto.imagem.alt })
      expect(await imagem.getAttribute('src')).toContain(
        `/_next/image?url=${encodeURIComponent(projeto.imagem.src)}&`,
      )
    }
  })

  // Review Focus 3.
  test('com a imagem remota fora do ar, o cartão continua com link, nome, selo e alt', async ({
    page,
  }) => {
    await page.route(/\/_next\/image\?/, (rota) =>
      rota.fulfill({ status: 502, body: '' }),
    )
    await page.goto('/')
    const botai = page.locator(`a[href="${BOTAI.url}"]`)
    await botai.scrollIntoViewIfNeeded()
    await expect(
      botai.getByRole('heading', { level: 3, name: 'Botaí' }),
    ).toBeVisible()
    await expect(botai).toContainText(cartoes[0].selo)
    await expect(
      botai.getByRole('img', { name: BOTAI.imagem.alt }),
    ).toHaveCount(1)
  })

  test('dúvidas: abre e fecha pelo teclado, uma por vez', async ({ page }) => {
    await page.goto('/')
    const perguntas = page.locator('#duvidas').getByRole('button')
    await expect(perguntas).toHaveCount(5)
    await expect(perguntas.nth(0)).toHaveAttribute('aria-expanded', 'true')
    await perguntas.nth(1).focus()
    await page.keyboard.press('Enter')
    await expect(perguntas.nth(1)).toHaveAttribute('aria-expanded', 'true')
    await expect(perguntas.nth(0)).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText(DUVIDAS[1].resposta)).toBeVisible()
    await expect(page.getByText(DUVIDAS[0].resposta)).toBeHidden()
    await page.keyboard.press('Tab')
    await expect(perguntas.nth(2)).toBeFocused()
    await page.keyboard.press('Space')
    await expect(perguntas.nth(2)).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Space')
    await expect(perguntas.nth(2)).toHaveAttribute('aria-expanded', 'false')
  })

  // Review Focus 4.
  test('dúvidas sem JavaScript: as 5 respostas no HTML, a primeira aberta', async ({
    browser,
  }) => {
    const contexto = await browser.newContext({ javaScriptEnabled: false })
    const page = await contexto.newPage()
    await page.goto('/')
    const html = await page.content()
    for (const duvida of DUVIDAS) expect(html).toContain(duvida.resposta)
    await expect(page.getByText(DUVIDAS[0].resposta)).toBeVisible()
    for (const duvida of DUVIDAS.slice(1))
      await expect(page.getByText(duvida.resposta)).toBeHidden()
    await contexto.close()
  })

  test.describe('a 320 px', () => {
    test.use({ viewport: { width: 320, height: 800 } })

    test('sem rolagem horizontal', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const largura = await page.evaluate(() => ({
        rolavel: document.documentElement.scrollWidth,
        visivel: document.documentElement.clientWidth,
      }))
      expect(largura.rolavel).toBeLessThanOrEqual(largura.visivel)
    })

    test('nenhum elemento passa da área de conteúdo da própria seção', async ({
      page,
    }) => {
      await page.goto('/')
      expect(await vazamentos(page)).toEqual([])
    })
  })
})
```

Se o teste de vazamento acusar algo, a correção é no componente, nunca no teste.

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
pnpm run build; echo "build exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
lsof -nP -iTCP:3021 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test -c playwright.lojas.config.ts --retries=0; echo "e2e lojas exit=$?"
CI=1 ./node_modules/.bin/playwright test --retries=0; echo "e2e exit=$?"
```

Expected: tudo `exit=0`. Compare a página inteira com `desktop.png` (1280 px) e `mobile.png` (390 px): a barra com o lockup e só o WhatsApp no celular, o contato com os dois botões, o rodapé e o botão flutuante no canto. Confira `/usr/bin/git status`.

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/pilutech-site && /usr/bin/git status --short && /usr/bin/git commit -m "feat(pilutech-site): barra fixa, contato, rodapé e WhatsApp flutuante; a página completa"; echo "exit=$?"
```

---

### Tarefa 7: SEO desde a criação (metadata, OG/Twitter, JSON-LD, sitemap, robots, manifest, verificação)

Tudo o que a spec §4 pede, no molde do `apps/botai-site`: `metadataBase` em `https://pilutech.com.br` (ou `SITE_URL`, só a origem; preview e local sem ela apontam para a produção, e o preview da Vercel já responde com `X-Robots-Tag: noindex`), canonical, `lang`, título de até 60 caracteres e descrição de 140–160, Open Graph e Twitter com a imagem própria 1200×630 (o lockup em Plus Jakarta Sans 800 do `@fontsource`, o `h1` e a linha de Teresina), o JSON-LD com a PiluTech num nó só, `@type` `['Organization', 'ProfessionalService']` (o mesmo `@id` que o `apps/botai-site` usa; ver "Decisões"), e o `WebSite`, sem `FAQPage` e sem nota, e as rotas técnicas. O `theme-color` é a Noite. Todas as rotas continuam estáticas e entram na conferência do build.

**Files:**

- Create (`apps/pilutech-site/`): `lib/site.ts`, `lib/site.test.ts`, `lib/seo.ts`, `lib/seo.test.ts`, `lib/json-ld.ts`, `lib/json-ld.test.ts`, `components/json-ld.tsx`, `components/json-ld.test.tsx`, `lib/imagem-og.tsx`, `app/opengraph-image.tsx`, `app/twitter-image.tsx`, `app/sitemap.ts`, `app/sitemap.test.ts`, `app/robots.ts`, `app/robots.test.ts`, `app/manifest.ts`, `app/manifest.test.ts`
- Modify (`apps/pilutech-site/`): `app/layout.tsx`, `app/page.tsx`, `app/seo.e2e.ts`, `scripts/conferir-rotas-estaticas.mjs` (`ROTAS`)

**Interfaces:**

- Consumes: `NOME_DA_MARCA`, `CORES_DA_MARCA`, `proporcoesDoLockup`, `LADO_DO_ICONE`, `LADO_DO_APPLE_ICON` (Tarefa 2); `SvgDaMarca` (Tarefa 2); `EMAIL_DA_PILUTECH`, `TELEFONE_INTERNACIONAL` (Tarefa 3); `SERVICOS` (Tarefa 3); `Landing`, `lerFaseDoBotai` (Tarefas 3 e 6).
- Produces:
  - `lib/site.ts`: `SITE_DE_PRODUCAO = 'https://pilutech.com.br'`; `urlDoSite(env?): string`; `urlAbsoluta(caminho: string, siteUrl?: string): string`.
  - `lib/seo.ts`: `TITULO_DA_HOME`, `DESCRICAO_DA_HOME`, `COR_DO_TEMA`, `type PaginaDoSite`, `metadataDaPagina(pagina): Metadata`, `metadataDoSite(siteUrl, env?): Metadata`, `VIEWPORT: Viewport`.
  - `lib/json-ld.ts`: `CONTEXTO`, `ID_DA_PILUTECH = 'https://pilutech.com.br/#organizacao'`, `LOGO_DA_PILUTECH = 'https://pilutech.com.br/icon'`, `TIPOS_DA_PILUTECH = ['Organization', 'ProfessionalService']`, `type NoJsonLd`, `serializarJsonLd(dados): string`, `jsonLdDaHome(siteUrl): { '@context'; '@graph': NoJsonLd[] }` (o grafo é `[a PiluTech, o WebSite]`).
  - `components/json-ld.tsx`: `JsonLd({ dados }: { dados: unknown })`.
  - `lib/imagem-og.tsx`: `size`, `contentType`, `alt`, `imagemOg(): Promise<ImageResponse>`.
  - Rotas `/opengraph-image`, `/twitter-image`, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`.

- [ ] **Step 1: Escreva os testes que falham**

`apps/pilutech-site/lib/site.test.ts`:

```ts
import { SITE_DE_PRODUCAO, urlAbsoluta, urlDoSite } from './site'

describe('urlDoSite', () => {
  it('sem SITE_URL, a produção', () => {
    expect(urlDoSite({})).toBe('https://pilutech.com.br')
  })

  // O preview já responde com X-Robots-Tag: noindex, e o canonical aponta para a produção.
  it('o host do preview da Vercel nunca vira canonical', () => {
    expect(
      urlDoSite({
        VERCEL_ENV: 'preview',
        VERCEL_URL: 'pilutech-site-git-x.vercel.app',
      }),
    ).toBe(SITE_DE_PRODUCAO)
  })

  it('SITE_URL vale como origem, sem a barra final', () => {
    expect(urlDoSite({ SITE_URL: 'http://localhost:3021/' })).toBe(
      'http://localhost:3021',
    )
  })

  it.each(['pilutech.local', 'ftp://pilutech.local', '   '])(
    'SITE_URL inválida (%p) cai na produção',
    (valor) => {
      expect(urlDoSite({ SITE_URL: valor })).toBe(SITE_DE_PRODUCAO)
    },
  )
})

describe('urlAbsoluta', () => {
  it('monta a URL a partir do site', () => {
    expect(urlAbsoluta('/', SITE_DE_PRODUCAO)).toBe('https://pilutech.com.br/')
    expect(urlAbsoluta('/sitemap.xml', SITE_DE_PRODUCAO)).toBe(
      'https://pilutech.com.br/sitemap.xml',
    )
  })
})
```

`apps/pilutech-site/lib/seo.test.ts`:

```ts
import {
  COR_DO_TEMA,
  DESCRICAO_DA_HOME,
  metadataDaPagina,
  metadataDoSite,
  TITULO_DA_HOME,
  VIEWPORT,
} from './seo'
import { hslParaHex, tokenDoDs } from './tokens-do-ds'

const SITE = 'https://pilutech.com.br'

describe('textos de busca', () => {
  // O <title> do design tem 66 caracteres; a spec pede até 60.
  it('título: até 60 caracteres, a partir do <title> do design', () => {
    expect(TITULO_DA_HOME).toBe(
      'PiluTech · Apps, infraestrutura e desenvolvimento fullstack',
    )
    expect(TITULO_DA_HOME.length).toBeLessThanOrEqual(60)
  })

  it('descrição: 140–160 caracteres, o que a PiluTech faz e onde', () => {
    expect(DESCRICAO_DA_HOME.length).toBeGreaterThanOrEqual(140)
    expect(DESCRICAO_DA_HOME.length).toBeLessThanOrEqual(160)
    for (const termo of [
      'aplicativos',
      'infraestrutura',
      'fullstack',
      'Teresina (PI)',
      'remoto',
      'todo o Brasil',
    ])
      expect(DESCRICAO_DA_HOME).toContain(termo)
  })

  it('regras da marca: sem computadores e impressoras, sem emoji', () => {
    for (const texto of [TITULO_DA_HOME, DESCRICAO_DA_HOME]) {
      expect(texto).not.toMatch(/computador|impressora/i)
      expect(texto).not.toMatch(/\p{Extended_Pictographic}/u)
    }
  })
})

describe('metadataDaPagina', () => {
  // O Next substitui o openGraph do layout inteiro: locale e siteName vêm de novo.
  it('canonical, Open Graph e Twitter, sem declarar imagem (ela vem do opengraph-image.tsx)', () => {
    expect(
      metadataDaPagina({
        caminho: '/',
        titulo: TITULO_DA_HOME,
        descricao: DESCRICAO_DA_HOME,
      }),
    ).toEqual({
      title: { absolute: TITULO_DA_HOME },
      description: DESCRICAO_DA_HOME,
      alternates: { canonical: '/' },
      openGraph: {
        type: 'website',
        locale: 'pt_BR',
        siteName: 'PiluTech',
        url: '/',
        title: TITULO_DA_HOME,
        description: DESCRICAO_DA_HOME,
      },
      twitter: {
        card: 'summary_large_image',
        title: TITULO_DA_HOME,
        description: DESCRICAO_DA_HOME,
      },
    })
  })
})

describe('metadataDoSite', () => {
  // O tipo é `null | string | URL | undefined`: `toEqual(new URL(…))` passaria sempre.
  it('metadataBase no site e a PiluTech como autora', () => {
    const metadata = metadataDoSite(SITE, {})
    expect(metadata.metadataBase?.toString()).toBe(`${SITE}/`)
    expect(metadata).toMatchObject({
      applicationName: 'PiluTech',
      creator: 'PiluTech',
      publisher: 'PiluTech',
      formatDetection: { telephone: false, address: false, email: false },
    })
    expect(metadata).not.toHaveProperty('verification')
  })

  it('GOOGLE_SITE_VERIFICATION vira a meta do Search Console', () => {
    expect(
      metadataDoSite(SITE, { GOOGLE_SITE_VERIFICATION: ' abc123 ' })
        .verification,
    ).toEqual({ google: 'abc123' })
  })

  it('vazia, nenhuma meta de verificação', () => {
    expect(
      metadataDoSite(SITE, { GOOGLE_SITE_VERIFICATION: '' }),
    ).not.toHaveProperty('verification')
  })
})

// A página é escura de cima a baixo: a barra do navegador é a Noite, o --background do .dark.
it('theme-color: a Noite do @piluvitu/ui', () => {
  expect(COR_DO_TEMA).toBe(hslParaHex(tokenDoDs('escuro', 'background')))
  expect(VIEWPORT).toEqual({ themeColor: COR_DO_TEMA })
})
```

`apps/pilutech-site/lib/json-ld.test.ts`:

```ts
import { SERVICOS } from './conteudo'
import {
  CONTEXTO,
  ID_DA_PILUTECH,
  jsonLdDaHome,
  LOGO_DA_PILUTECH,
  serializarJsonLd,
  TIPOS_DA_PILUTECH,
  type NoJsonLd,
} from './json-ld'
import { DESCRICAO_DA_HOME } from './seo'

const SITE = 'https://pilutech.com.br'
const EMAIL = 'pilutechinformatica@gmail.com'
const TELEFONE = '+55 86 98173-7625'

function no(id: string, grafo: NoJsonLd[]): NoJsonLd | undefined {
  return grafo.find((n) => n['@id'] === id)
}

describe('jsonLdDaHome', () => {
  const dados = jsonLdDaHome(SITE)
  const pilutech = no(ID_DA_PILUTECH, dados['@graph'])

  // Decisões do plano: uma empresa, um nó. Dois nós ligados por parentOrganization diriam que a
  // PiluTech é filha de si mesma; os dois tipos da spec §4 ficam no mesmo nó.
  it('um grafo com a PiluTech (Organization e ProfessionalService num nó só) e o site', () => {
    expect(dados['@context']).toBe(CONTEXTO)
    expect(TIPOS_DA_PILUTECH).toEqual(['Organization', 'ProfessionalService'])
    expect(dados['@graph'].map((n) => n['@type'])).toEqual([
      ['Organization', 'ProfessionalService'],
      'WebSite',
    ])
    expect(JSON.stringify(dados)).not.toContain('parentOrganization')
  })

  // O mesmo @id que o apps/botai-site usa: os sites descrevem a mesma empresa.
  it('a PiluTech: logo, e-mail, telefone, contato comercial, Brasil inteiro e endereço só com cidade, UF e país', () => {
    expect(ID_DA_PILUTECH).toBe('https://pilutech.com.br/#organizacao')
    expect(LOGO_DA_PILUTECH).toBe('https://pilutech.com.br/icon')
    expect(pilutech).toMatchObject({
      '@type': ['Organization', 'ProfessionalService'],
      '@id': ID_DA_PILUTECH,
      name: 'PiluTech',
      description: DESCRICAO_DA_HOME,
      url: SITE,
      logo: LOGO_DA_PILUTECH,
      image: LOGO_DA_PILUTECH,
      email: EMAIL,
      telephone: TELEFONE,
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: EMAIL,
        telephone: TELEFONE,
        areaServed: 'BR',
        availableLanguage: 'pt-BR',
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Teresina',
        addressRegion: 'PI',
        addressCountry: 'BR',
      },
      areaServed: { '@type': 'Country', name: 'Brasil' },
    })
    expect(
      Object.keys(pilutech?.address as Record<string, unknown>).sort(),
    ).toEqual(['@type', 'addressCountry', 'addressLocality', 'addressRegion'])
  })

  it('os 3 serviços do design no catálogo, como Service, sem preço', () => {
    const catalogo = pilutech?.hasOfferCatalog as {
      '@type': string
      name: string
      itemListElement: {
        '@type': string
        itemOffered: { '@type': string; name: string; description: string }
      }[]
    }
    expect(catalogo['@type']).toBe('OfferCatalog')
    expect(catalogo.name).toBe('Serviços da PiluTech')
    expect(catalogo.itemListElement.map((o) => o.itemOffered.name)).toEqual([
      'Criação e manutenção de aplicativos',
      'Provisionamento e orçamento de infraestrutura',
      'Desenvolvimento fullstack sob medida',
    ])
    expect(catalogo.itemListElement).toEqual(
      SERVICOS.map((servico) => ({
        '@type': 'Offer',
        itemOffered: {
          '@type': 'Service',
          name: servico.nome,
          description: servico.texto,
        },
      })),
    )
  })

  it('WebSite: o site na raiz do domínio, publicado pela PiluTech', () => {
    expect(no(`${SITE}/#site`, dados['@graph'])).toEqual({
      '@type': 'WebSite',
      '@id': `${SITE}/#site`,
      name: 'PiluTech',
      url: `${SITE}/`,
      inLanguage: 'pt-BR',
      publisher: { '@id': ID_DA_PILUTECH },
    })
  })

  // Spec §4: sem FAQPage (o Google não mostra mais o rich result de FAQ, removido em maio de 2026) e sem nota.
  it('sem FAQPage, nota, review nem preço', () => {
    const texto = JSON.stringify(dados)
    for (const proibido of [
      'FAQPage',
      'aggregateRating',
      'review',
      'price',
      'priceRange',
    ])
      expect(texto).not.toContain(proibido)
  })

  it('outro site muda as URLs da página, não as da PiluTech', () => {
    const local = jsonLdDaHome('http://localhost:3021')
    expect(no('http://localhost:3021/#site', local['@graph'])?.url).toBe(
      'http://localhost:3021/',
    )
    expect(no(ID_DA_PILUTECH, local['@graph'])).toMatchObject({
      url: SITE,
      logo: LOGO_DA_PILUTECH,
    })
  })
})

describe('serializarJsonLd', () => {
  // Um texto com </script> não pode fechar a tag.
  it('troca < por \\u003c', () => {
    expect(serializarJsonLd({ nome: '</script><b>' })).toBe(
      '{"nome":"\\u003c/script>\\u003cb>"}',
    )
  })
})
```

`apps/pilutech-site/components/json-ld.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { JsonLd } from './json-ld'

it('um script application/ld+json com o JSON escapado', () => {
  const { container } = render(<JsonLd dados={{ name: '</script>' }} />)
  const script = container.querySelector('script[type="application/ld+json"]')
  expect(script?.innerHTML).toBe('{"name":"\\u003c/script>"}')
})
```

`apps/pilutech-site/app/sitemap.test.ts`:

```ts
import sitemap from './sitemap'

const SITE_URL_ORIGINAL = process.env.SITE_URL
beforeEach(() => {
  delete process.env.SITE_URL
})
afterAll(() => {
  if (SITE_URL_ORIGINAL !== undefined) process.env.SITE_URL = SITE_URL_ORIGINAL
})

it('lista a página única, no domínio de produção', () => {
  expect(sitemap()).toEqual([{ url: 'https://pilutech.com.br/' }])
})
```

`apps/pilutech-site/app/robots.test.ts`:

```ts
import robots from './robots'

const SITE_URL_ORIGINAL = process.env.SITE_URL
beforeEach(() => {
  delete process.env.SITE_URL
})
afterAll(() => {
  if (SITE_URL_ORIGINAL !== undefined) process.env.SITE_URL = SITE_URL_ORIGINAL
})

it('libera tudo e aponta o sitemap', () => {
  expect(robots()).toEqual({
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://pilutech.com.br/sitemap.xml',
  })
})
```

`apps/pilutech-site/app/manifest.test.ts`:

```ts
import manifest from './manifest'

it('nome, idioma, a Noite e o ícone de 192 px', () => {
  expect(manifest()).toEqual({
    name: 'PiluTech',
    short_name: 'PiluTech',
    description:
      'Criação e manutenção de aplicativos, infraestrutura em nuvem e desenvolvimento fullstack. A PiluTech fica em Teresina (PI) e atende remoto em todo o Brasil.',
    lang: 'pt-BR',
    start_url: '/',
    display: 'browser',
    background_color: '#090b11',
    theme_color: '#090b11',
    icons: [{ src: '/icon', sizes: '192x192', type: 'image/png' }],
  })
})
```

- [ ] **Step 2: Rode e confirme que falham**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/jest lib/site.test.ts lib/seo.test.ts lib/json-ld.test.ts components/json-ld.test.tsx app; echo "exit=$?"
```

Expected: `exit=1`, `Cannot find module` para `./site`, `./seo`, `./json-ld`, `./sitemap`, `./robots` e `./manifest` (o `globals.test.ts` continua verde).

- [ ] **Step 3: Implemente**

`apps/pilutech-site/lib/site.ts`:

```ts
export const SITE_DE_PRODUCAO = 'https://pilutech.com.br'

export function urlDoSite(
  env: Record<string, string | undefined> = process.env,
): string {
  const valor = env.SITE_URL?.trim()
  if (!valor) return SITE_DE_PRODUCAO
  try {
    const url = new URL(valor)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : SITE_DE_PRODUCAO
  } catch {
    return SITE_DE_PRODUCAO
  }
}

export function urlAbsoluta(
  caminho: string,
  siteUrl: string = urlDoSite(),
): string {
  return new URL(caminho, `${siteUrl}/`).href
}
```

`apps/pilutech-site/lib/seo.ts`:

```ts
import type { Metadata, Viewport } from 'next'
import { CORES_DA_MARCA, NOME_DA_MARCA } from './marca'

export const TITULO_DA_HOME =
  'PiluTech · Apps, infraestrutura e desenvolvimento fullstack'
export const DESCRICAO_DA_HOME =
  'Criação e manutenção de aplicativos, infraestrutura em nuvem e desenvolvimento fullstack. A PiluTech fica em Teresina (PI) e atende remoto em todo o Brasil.'

export const COR_DO_TEMA = CORES_DA_MARCA.noite

export type PaginaDoSite = {
  caminho: string
  titulo: string
  descricao: string
}

export function metadataDaPagina({
  caminho,
  titulo,
  descricao,
}: PaginaDoSite): Metadata {
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: NOME_DA_MARCA,
      url: caminho,
      title: titulo,
      description: descricao,
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descricao,
    },
  }
}

export function metadataDoSite(
  siteUrl: string,
  env: Record<string, string | undefined> = process.env,
): Metadata {
  const google = env.GOOGLE_SITE_VERIFICATION?.trim()
  return {
    metadataBase: new URL(`${siteUrl}/`),
    applicationName: NOME_DA_MARCA,
    creator: NOME_DA_MARCA,
    publisher: NOME_DA_MARCA,
    formatDetection: { telephone: false, address: false, email: false },
    ...(google ? { verification: { google } } : {}),
  }
}

export const VIEWPORT: Viewport = { themeColor: COR_DO_TEMA }
```

`apps/pilutech-site/lib/json-ld.ts`:

```ts
import { EMAIL_DA_PILUTECH, TELEFONE_INTERNACIONAL } from './contato'
import { SERVICOS } from './conteudo'
import { NOME_DA_MARCA } from './marca'
import { DESCRICAO_DA_HOME } from './seo'
import { SITE_DE_PRODUCAO, urlAbsoluta } from './site'

export const CONTEXTO = 'https://schema.org'
export const ID_DA_PILUTECH = `${SITE_DE_PRODUCAO}/#organizacao`
export const LOGO_DA_PILUTECH = `${SITE_DE_PRODUCAO}/icon`
export const TIPOS_DA_PILUTECH = ['Organization', 'ProfessionalService']

export type NoJsonLd = Record<string, unknown>

export function serializarJsonLd(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, '\\u003c')
}

export function jsonLdDaHome(siteUrl: string): {
  '@context': string
  '@graph': NoJsonLd[]
} {
  const raiz = urlAbsoluta('/', siteUrl)
  return {
    '@context': CONTEXTO,
    '@graph': [
      {
        '@type': TIPOS_DA_PILUTECH,
        '@id': ID_DA_PILUTECH,
        name: NOME_DA_MARCA,
        description: DESCRICAO_DA_HOME,
        url: SITE_DE_PRODUCAO,
        logo: LOGO_DA_PILUTECH,
        image: LOGO_DA_PILUTECH,
        email: EMAIL_DA_PILUTECH,
        telephone: TELEFONE_INTERNACIONAL,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'sales',
          email: EMAIL_DA_PILUTECH,
          telephone: TELEFONE_INTERNACIONAL,
          areaServed: 'BR',
          availableLanguage: 'pt-BR',
        },
        address: {
          '@type': 'PostalAddress',
          addressLocality: 'Teresina',
          addressRegion: 'PI',
          addressCountry: 'BR',
        },
        areaServed: { '@type': 'Country', name: 'Brasil' },
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Serviços da PiluTech',
          itemListElement: SERVICOS.map((servico) => ({
            '@type': 'Offer',
            itemOffered: {
              '@type': 'Service',
              name: servico.nome,
              description: servico.texto,
            },
          })),
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${raiz}#site`,
        name: NOME_DA_MARCA,
        url: raiz,
        inLanguage: 'pt-BR',
        publisher: { '@id': ID_DA_PILUTECH },
      },
    ],
  }
}
```

`apps/pilutech-site/components/json-ld.tsx`:

```tsx
import { serializarJsonLd } from '@/lib/json-ld'

export function JsonLd({ dados }: { dados: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializarJsonLd(dados) }}
    />
  )
}
```

`apps/pilutech-site/lib/imagem-og.tsx` (o `ImageResponse` só lê `ttf`/`otf`/`woff`: por isso o `@fontsource` estático, com `.woff`):

```tsx
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { SvgDaMarca } from '@/components/pilutech-mark'
import { CORES_DA_MARCA, NOME_DA_MARCA, proporcoesDoLockup } from './marca'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt =
  'PiluTech: aplicativos, infraestrutura e desenvolvimento fullstack'

const PASTA_DAS_FONTES = join(
  process.cwd(),
  'node_modules',
  '@fontsource',
  'plus-jakarta-sans',
  'files',
)

async function fonte(peso: 500 | 800) {
  return {
    name: 'Plus Jakarta Sans',
    data: await readFile(
      join(PASTA_DAS_FONTES, `plus-jakarta-sans-latin-${peso}-normal.woff`),
    ),
    weight: peso,
    style: 'normal' as const,
  }
}

export async function imagemOg(): Promise<ImageResponse> {
  const simbolo = 120
  const { espaco, palavra } = proporcoesDoLockup(simbolo)
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 80,
        background: CORES_DA_MARCA.noite,
        backgroundImage:
          'radial-gradient(60% 60% at 50% 0%, rgba(56, 189, 248, 0.13), transparent)',
        color: CORES_DA_MARCA.texto,
        fontFamily: 'Plus Jakarta Sans',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: espaco }}>
        <SvgDaMarca
          tamanho={simbolo}
          cores={{ base: CORES_DA_MARCA.texto, destaque: CORES_DA_MARCA.ciano }}
        />
        <div
          style={{
            display: 'flex',
            fontSize: palavra,
            fontWeight: 800,
            letterSpacing: -2.5,
          }}
        >
          {NOME_DA_MARCA}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          maxWidth: 1000,
          fontSize: 64,
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: -2.2,
        }}
      >
        Aplicativos, infraestrutura e desenvolvimento fullstack.
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 30,
          fontWeight: 500,
          color: CORES_DA_MARCA.aco,
        }}
      >
        pilutech.com.br · Teresina, PI · atendimento remoto
      </div>
    </div>,
    { ...size, fonts: [await fonte(800), await fonte(500)] },
  )
}
```

`apps/pilutech-site/app/opengraph-image.tsx`:

```tsx
import { imagemOg } from '@/lib/imagem-og'

export { alt, contentType, size } from '@/lib/imagem-og'

export default function Image() {
  return imagemOg()
}
```

`apps/pilutech-site/app/twitter-image.tsx`:

```tsx
export { alt, contentType, default, size } from './opengraph-image'
```

`apps/pilutech-site/app/sitemap.ts`:

```ts
import type { MetadataRoute } from 'next'
import { urlAbsoluta } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: urlAbsoluta('/') }]
}
```

`apps/pilutech-site/app/robots.ts`:

```ts
import type { MetadataRoute } from 'next'
import { urlAbsoluta } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: urlAbsoluta('/sitemap.xml'),
  }
}
```

`apps/pilutech-site/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next'
import { LADO_DO_ICONE, NOME_DA_MARCA } from '@/lib/marca'
import { COR_DO_TEMA, DESCRICAO_DA_HOME } from '@/lib/seo'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NOME_DA_MARCA,
    short_name: NOME_DA_MARCA,
    description: DESCRICAO_DA_HOME,
    lang: 'pt-BR',
    start_url: '/',
    display: 'browser',
    background_color: COR_DO_TEMA,
    theme_color: COR_DO_TEMA,
    icons: [
      {
        src: '/icon',
        sizes: `${LADO_DO_ICONE}x${LADO_DO_ICONE}`,
        type: 'image/png',
      },
    ],
  }
}
```

`apps/pilutech-site/app/layout.tsx`: troque `import type { Metadata } from 'next'` por `import type { Metadata, Viewport } from 'next'`, acrescente `import { metadataDoSite, VIEWPORT } from '@/lib/seo'` e `import { urlDoSite } from '@/lib/site'`, e troque `export const metadata: Metadata = { title: 'PiluTech' }` por:

```tsx
export const metadata: Metadata = metadataDoSite(urlDoSite())
export const viewport: Viewport = VIEWPORT
```

`apps/pilutech-site/app/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { Landing } from '@/components/landing'
import { lerFaseDoBotai } from '@/lib/cms'
import { jsonLdDaHome } from '@/lib/json-ld'
import { DESCRICAO_DA_HOME, metadataDaPagina, TITULO_DA_HOME } from '@/lib/seo'
import { urlDoSite } from '@/lib/site'

export const metadata: Metadata = metadataDaPagina({
  caminho: '/',
  titulo: TITULO_DA_HOME,
  descricao: DESCRICAO_DA_HOME,
})

export default function Home() {
  return (
    <>
      <JsonLd dados={jsonLdDaHome(urlDoSite())} />
      <Landing faseDoBotai={lerFaseDoBotai()} ano={new Date().getFullYear()} />
    </>
  )
}
```

Em `apps/pilutech-site/scripts/conferir-rotas-estaticas.mjs`, troque o `ROTAS` por:

```js
export const ROTAS = [
  '/',
  '/icon',
  '/apple-icon',
  '/opengraph-image',
  '/twitter-image',
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest',
]
```

- [ ] **Step 4: Rode os testes e confirme que passam**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && pnpm run test; echo "test exit=$?"
```

Expected: `test exit=0`.

- [ ] **Step 5: E2E do SEO**

`apps/pilutech-site/app/seo.e2e.ts` (substitui o da Tarefa 2, que fica incluído):

```ts
import { expect, test, type Page } from '@playwright/test'
import type { AxeResults, RunOptions } from 'axe-core'
import { LADO_DO_APPLE_ICON, LADO_DO_ICONE } from '../lib/marca'
import { COR_DO_TEMA, DESCRICAO_DA_HOME, TITULO_DA_HOME } from '../lib/seo'
import { SITE_DE_PRODUCAO } from '../lib/site'

const naProducao = (caminho: string) =>
  new URL(caminho, `${SITE_DE_PRODUCAO}/`).href

// O metadataBase é a produção; o servidor do teste é a 3021: só o caminho serve para pedir.
async function caminhoDaMeta(page: Page, seletor: string): Promise<string> {
  const conteudo = await page.locator(seletor).first().getAttribute('content')
  expect(conteudo).toBeTruthy()
  const url = new URL(conteudo as string)
  return url.pathname + url.search
}

async function tamanhoDoPng(page: Page, caminho: string) {
  const resposta = await page.request.get(caminho)
  expect(resposta.status()).toBe(200)
  expect(resposta.headers()['content-type']).toContain('image/png')
  const corpo = await resposta.body()
  return { largura: corpo.readUInt32BE(16), altura: corpo.readUInt32BE(20) }
}

test('title, description, canonical, lang e indexável', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(TITULO_DA_HOME)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    DESCRICAO_DA_HOME,
  )
  const canonical = await page
    .locator('link[rel="canonical"]')
    .getAttribute('href')
  expect(new URL(canonical as string).href).toBe(naProducao('/'))
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await expect(
    page.locator('meta[name="robots"][content*="noindex"]'),
  ).toHaveCount(0)
  await expect(
    page.locator('meta[name="google-site-verification"]'),
  ).toHaveCount(0)
})

test('Open Graph e Twitter, com a imagem própria de 1200×630', async ({
  page,
}) => {
  await page.goto('/')
  const og = (propriedade: string) =>
    page.locator(`meta[property="og:${propriedade}"]`)
  await expect(og('type')).toHaveAttribute('content', 'website')
  await expect(og('locale')).toHaveAttribute('content', 'pt_BR')
  await expect(og('site_name')).toHaveAttribute('content', 'PiluTech')
  await expect(og('title')).toHaveAttribute('content', TITULO_DA_HOME)
  await expect(og('description')).toHaveAttribute('content', DESCRICAO_DA_HOME)
  await expect(og('image:alt')).toHaveAttribute(
    'content',
    'PiluTech: aplicativos, infraestrutura e desenvolvimento fullstack',
  )
  expect(
    new URL((await og('url').getAttribute('content')) as string).href,
  ).toBe(naProducao('/'))
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  )
  const imagemOg = await caminhoDaMeta(page, 'meta[property="og:image"]')
  expect(imagemOg.startsWith('/opengraph-image')).toBe(true)
  expect(await tamanhoDoPng(page, imagemOg)).toEqual({
    largura: 1200,
    altura: 630,
  })
  const imagemTwitter = await caminhoDaMeta(page, 'meta[name="twitter:image"]')
  expect(await tamanhoDoPng(page, imagemTwitter)).toEqual({
    largura: 1200,
    altura: 630,
  })
})

test('um h1 só e títulos sem pular nível', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  const niveis = await page
    .locator('h1, h2, h3, h4, h5, h6')
    .evaluateAll((titulos) => titulos.map((t) => Number(t.tagName[1])))
  expect(niveis[0]).toBe(1)
  for (let i = 1; i < niveis.length; i++)
    expect(niveis[i] - niveis[i - 1]).toBeLessThanOrEqual(1)
})

test('toda imagem tem alt, e as dos projetos um alt descritivo', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('img:not([alt])')).toHaveCount(0)
  const alts = await page
    .locator('#projetos img')
    .evaluateAll((imagens) => imagens.map((i) => i.getAttribute('alt') ?? ''))
  expect(alts).toHaveLength(2)
  for (const alt of alts) expect(alt.length).toBeGreaterThan(30)
})

// A meta da spec é o Lighthouse mobile (não há Lighthouse no PATH): o axe a 1280 e a 320 px.
for (const largura of [1280, 320]) {
  test(`acessibilidade (axe, WCAG 2.1 A e AA) a ${largura} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: largura, height: 800 })
    await page.goto('/')
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') })
    const violacoes = await page.evaluate(async () => {
      const { axe } = window as unknown as {
        axe: {
          run: (alvo: Document, opcoes: RunOptions) => Promise<AxeResults>
        }
      }
      const { violations } = await axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
        },
      })
      return violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        )
    })
    expect(violacoes).toEqual([])
  })
}

test('JSON-LD: a PiluTech (Organization e ProfessionalService num nó só) e o WebSite, sem FAQPage', async ({
  page,
}) => {
  await page.goto('/')
  const textos = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents()
  expect(textos).toHaveLength(1)
  const dados = JSON.parse(textos[0]) as {
    '@graph': Record<string, unknown>[]
  }
  expect(dados['@graph'].map((n) => n['@type'])).toEqual([
    ['Organization', 'ProfessionalService'],
    'WebSite',
  ])
  expect(dados['@graph'][0]).toMatchObject({
    '@id': 'https://pilutech.com.br/#organizacao',
    logo: 'https://pilutech.com.br/icon',
  })
  expect(textos[0]).not.toContain('FAQPage')
})

test('robots.txt libera tudo e aponta o sitemap', async ({ page }) => {
  const texto = await (await page.request.get('/robots.txt')).text()
  expect(texto).toContain('Allow: /')
  expect(texto).toContain(`Sitemap: ${SITE_DE_PRODUCAO}/sitemap.xml`)
})

test('sitemap.xml lista a página', async ({ page }) => {
  const xml = await (await page.request.get('/sitemap.xml')).text()
  expect(xml).toContain(`<loc>${SITE_DE_PRODUCAO}/</loc>`)
})

test('favicon e apple-icon: PNG do símbolo, nos tamanhos declarados', async ({
  page,
}) => {
  await page.goto('/')
  const icone = page.locator('link[rel="icon"]')
  await expect(icone).toHaveCount(1)
  await expect(icone).toHaveAttribute(
    'sizes',
    `${LADO_DO_ICONE}x${LADO_DO_ICONE}`,
  )
  await expect(icone).toHaveAttribute('type', 'image/png')
  expect(
    await tamanhoDoPng(page, (await icone.getAttribute('href')) as string),
  ).toEqual({ largura: LADO_DO_ICONE, altura: LADO_DO_ICONE })
  const apple = page.locator('link[rel="apple-touch-icon"]')
  await expect(apple).toHaveCount(1)
  expect(
    await tamanhoDoPng(page, (await apple.getAttribute('href')) as string),
  ).toEqual({ largura: LADO_DO_APPLE_ICON, altura: LADO_DO_APPLE_ICON })
  // O logo do JSON-LD é este mesmo ícone, sem a query do <link>.
  expect(await tamanhoDoPng(page, '/icon')).toEqual({
    largura: LADO_DO_ICONE,
    altura: LADO_DO_ICONE,
  })
})

test('manifest e theme-color', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1)
  const manifesto = await (
    await page.request.get('/manifest.webmanifest')
  ).json()
  expect(manifesto.name).toBe('PiluTech')
  const temas = page.locator('meta[name="theme-color"]')
  await expect(temas).toHaveCount(1)
  await expect(temas).toHaveAttribute('content', COR_DO_TEMA)
})
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && ./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
pnpm run build; echo "build exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
lsof -nP -iTCP:3021 -sTCP:LISTEN; CI=1 ./node_modules/.bin/playwright test -c playwright.lojas.config.ts --retries=0; echo "e2e lojas exit=$?"
CI=1 ./node_modules/.bin/playwright test --retries=0; echo "e2e exit=$?"
```

Expected: tudo `exit=0`; o build termina com as 8 rotas de `ROTAS` estáticas. Abra `http://localhost:3021/opengraph-image` (servidor de pé, ou `.next/server/app/opengraph-image.body`) e confira a olho: fundo Noite com o brilho no topo, o lockup em Jakarta 800, o `h1` e a linha de Teresina em Aço. Se o `tsc` recusar o `Buffer` no `data` da fonte, use `data: (await readFile(…)).buffer as ArrayBuffer` (o tipo do `next/og` é `ArrayBuffer`); não troque a fonte. Confira `/usr/bin/git status`.

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/pilutech-site && /usr/bin/git status --short && /usr/bin/git commit -m "feat(pilutech-site): SEO (metadata, OG/Twitter, JSON-LD da PiluTech e do site, sitemap, robots, manifest)"; echo "exit=$?"
```

---

### Tarefa 8: `apps/web` — a vitrine volta para `piluvitu.com.br/pilulabs` e o proxy dos subdomínios sai

Com `pilutech.com.br` e `www` no projeto `pilutech-site` (e o merge só depois de movê-los, spec §7), o `apps/web` não recebe mais host nenhum de `pilutech.com.br`, e tudo o que o `proxy.ts` fazia fica sem uso (ver "Decisões tiradas do código"). Saem o proxy, o `lib/pilutech-dominios.ts`, os dois E2E de subdomínio e a chave `PILUTECH_SUBDOMINIOS`; `linkDoItem`, `itemParaProject`, `metadataDaPagina` e `jsonLdVitrine` perdem o parâmetro da chave; "Saiba mais", rodapé, canonical e JSON-LD da vitrine ficam em `/pilulabs`; o `publisher` da vitrine passa a ser a PiluTech no site dela. Os 308 de `/pilulabs/botai` e `/pilulabs/botai/privacidade` ficam (são `redirects` do `next.config.mjs`). O comportamento novo que muda para quem visita é o da produção com a chave ligada: `piluvitu.com.br/pilulabs` deixa de responder 308. Saem também os restos do modelo de subdomínio no CMS: o rótulo do `slug` ("é o subdomínio") e a dica do `site` (`https://<slug>.pilutech.com.br`, um host que sem o proxy só serve se o produto tiver projeto Vercel próprio), no Keystatic e no formulário do `/admin/pilulabs`.

**Files:**

- Delete (`apps/web/`): `proxy.ts`, `proxy.test.ts`, `lib/pilutech-dominios.ts`, `lib/pilutech-dominios.test.ts`, `app/(site)/pilulabs/subdominios.e2e.ts`, `app/(site)/pilulabs/chave-ligada.e2e.ts`
- Modify (`apps/web/`): `lib/pilulabs.ts`, `lib/pilulabs.test.ts`, `lib/pilulabs-json-ld.ts`, `lib/pilulabs-json-ld.test.ts`, `lib/pilulabs-conteudo.test.ts`, `lib/site-url.test.ts`, `app/(site)/page.tsx`, `app/(site)/pilulabs/page.tsx`, `app/(site)/pilulabs/pilulabs.e2e.ts`, `app/(site)/home.e2e.ts`, `components/secao-pilulabs.test.tsx`, `components/secao-pilulabs.stories.tsx`, `components/home-footer.test.tsx`, `components/home-footer.stories.tsx`, `components/home-bento-layout.test.tsx`, `components/pilulabs/vitrine.stories.tsx`, `keystatic.config.ts` (rótulo do `slug` e dica do `site`), `components/admin/content/pilulabs-form.tsx` (placeholder do `site`), `.env.example`, `CLAUDE.md`; e a linha do `apps/web` na tabela do `CLAUDE.md` raiz

**Interfaces:**

- Consumes: nada das tarefas anteriores (o `@id` `https://pilutech.com.br/#organizacao` é o mesmo da Tarefa 7, escrito por extenso: o `apps/web` não importa do `apps/pilutech-site`).
- Produces (`apps/web/lib`): `linkDoItem(item: Pick<ItemPiluLabs, 'slug' | 'paginaPropria' | 'site' | 'repo'>): string | null`; `itemParaProject(item: ItemPiluLabs): Project`; `metadataDaPagina(pagina: PaginaPiluLabs): Metadata`; `jsonLdVitrine(siteUrl: string, partes: ParteDaVitrine[])`. Somem `subdominiosAtivos`, `urlPublica`, `destinoDoHost`, `ehCaminhoIntocavel`, `rotearPorHost`, `DOMINIO_PILUTECH` e `SITE_DO_AUTOR`.

- [ ] **Step 1: Escreva os testes do contrato novo**

`apps/web/lib/pilulabs-json-ld.test.ts` (substitui o arquivo):

```ts
import { CONTEXTO_SCHEMA, jsonLdVitrine } from './pilulabs-json-ld'

const SITE = 'https://piluvitu.com.br'

describe('jsonLdVitrine', () => {
  // A vitrine mora no piluvitu.com.br; quem publica é a PiluTech, no site dela, com o
  // mesmo @id da Organization do apps/pilutech-site e do apps/botai-site.
  it('é uma CollectionPage em /pilulabs, publicada pela PiluTech', () => {
    expect(jsonLdVitrine(SITE, [])).toEqual({
      '@context': CONTEXTO_SCHEMA,
      '@type': 'CollectionPage',
      name: 'PiluLabs',
      description: 'Produtos e apps da PiluTech',
      url: 'https://piluvitu.com.br/pilulabs',
      inLanguage: 'pt-BR',
      publisher: {
        '@type': 'Organization',
        '@id': 'https://pilutech.com.br/#organizacao',
        name: 'PiluTech',
        url: 'https://pilutech.com.br',
      },
    })
  })

  it('lista em hasPart o link de cada item; sem link, sem url', () => {
    expect(
      jsonLdVitrine(SITE, [
        { nome: 'Botaí', href: 'https://botai.pilutech.com.br' },
        { nome: 'Página própria', href: '/pilulabs/exemplo' },
        { nome: 'Sem link', href: null },
      ]),
    ).toMatchObject({
      hasPart: [
        {
          '@type': 'SoftwareApplication',
          name: 'Botaí',
          url: 'https://botai.pilutech.com.br/',
        },
        {
          '@type': 'SoftwareApplication',
          name: 'Página própria',
          url: 'https://piluvitu.com.br/pilulabs/exemplo',
        },
        { '@type': 'SoftwareApplication', name: 'Sem link' },
      ],
    })
  })
})
```

`apps/web/lib/pilulabs.test.ts`:

- No `describe('metadataDaPagina', …)`: o primeiro teste passa a se chamar `'canonical e og:url no caminho do piluvitu.com.br'` e chama `metadataDaPagina(PAGINA)` (o objeto esperado não muda); apague o teste `'chave ligada: canonical e og:url no subdomínio, siteName pilutech.com.br'`; em `'não declara imagens'`, troque `metadataDaPagina(PAGINA, true)` por `metadataDaPagina(PAGINA)`.
- Troque o `describe('linkDoItem', …)` inteiro por:

```ts
describe('linkDoItem', () => {
  const site = 'https://botai.pilutech.com.br'

  it('página própria: a rota no piluvitu.com.br, mesmo com site', () => {
    expect(linkDoItem(item({ paginaPropria: true, site }))).toBe(
      '/pilulabs/botai',
    )
  })

  it('senão o site', () => {
    expect(linkDoItem(item({ site, repo: REPO_BOTAI }))).toBe(site)
  })

  it('senão o repo', () => {
    expect(linkDoItem(item({ repo: REPO_BOTAI }))).toBe(REPO_BOTAI)
  })

  it('senão nenhum', () => {
    expect(linkDoItem(item())).toBeNull()
  })
})
```

- No `describe('itemParaProject', …)`: apague o teste `'com os subdomínios ligados, Acessar vai ao site'` e tire o `, false` das três chamadas `itemParaProject(…, false)` que sobram.

`apps/web/lib/pilulabs-conteudo.test.ts`: troque o comentário `// O subdomínio de um slug só serve a página se houver item com paginaPropria.` por `// Só o item com paginaPropria leva à rota própria: sem ele, a página fica órfã.` e o último teste do `describe` por:

```ts
it('todo listado tem descrição, link e o logo em public/', () => {
  for (const item of itensListados(itens)) {
    expect([item.slug, item.descricao !== '']).toEqual([item.slug, true])
    expect([item.slug, linkDoItem(item) !== null]).toEqual([item.slug, true])
    if (item.logo.startsWith('/'))
      expect([
        item.logo,
        existsSync(join(RAIZ_WEB, 'public', item.logo)),
      ]).toEqual([item.logo, true])
  }
})
```

`apps/web/lib/site-url.test.ts`: troque o comentário `// A Vercel escolhe o domínio de produção mais curto, e pilutech.com.br tem o` / `// mesmo tamanho de piluvitu.com.br: só a variável explícita segura o canônico.` por `// Com mais de um domínio no projeto, a Vercel escolhe o de produção mais curto,` / `// que pode não ser o canônico: só a variável explícita segura o canônico.`, e nos dois testes troque `VERCEL_PROJECT_PRODUCTION_URL: 'pilutech.com.br'` por `VERCEL_PROJECT_PRODUCTION_URL: 'outro.com.br'` (e o esperado do segundo, `'https://pilutech.com.br'`, por `'https://outro.com.br'`).

Componentes:

- `components/secao-pilulabs.test.tsx`: apague o teste `'com os subdomínios ligados, a vitrine é pilutech.com.br'`.
- `components/home-footer.test.tsx`: apague o teste `'com os subdomínios ligados, /pilulabs leva a pilutech.com.br'`.
- `components/home-bento-layout.test.tsx`: troque `hrefVitrine: 'https://pilutech.com.br/'` por `hrefVitrine: '/pilulabs'` e o esperado `['/pilulabs/botai', 'https://pilutech.com.br/']` por `['/pilulabs/botai', '/pilulabs']`.

E2E:

- `app/(site)/pilulabs/pilulabs.e2e.ts`: troque `linkDoItem(item, false)` por `linkDoItem(item)` e, dentro do `test.describe('/pilulabs', …)`, depois do primeiro teste:

```ts
// Review Focus 2: a chave antiga dos subdomínios pode voltar na Vercel; ela não muda mais nada.
test('responde 200, sem 308, com o canonical e o og:url em /pilulabs', async ({
  page,
}) => {
  const resposta = await page.request.get('/pilulabs', { maxRedirects: 0 })
  expect(resposta.status()).toBe(200)
  await page.goto('/pilulabs')
  const canonical = await page
    .locator('link[rel="canonical"]')
    .getAttribute('href')
  expect(new URL(canonical as string).pathname).toBe('/pilulabs')
  const ogUrl = await page
    .locator('meta[property="og:url"]')
    .getAttribute('content')
  expect(new URL(ogUrl as string).pathname).toBe('/pilulabs')
})
```

- `app/(site)/home.e2e.ts`: troque `itemParaProject(item, false)` por `itemParaProject(item)` e, no teste `'o rodapé só mostra /pilulabs com item listado'`, depois do `toHaveCount`, acrescente:

```ts
if (listados.length > 0)
  await expect(
    page.getByRole('link', { name: '/pilulabs', exact: true }),
  ).toHaveAttribute('href', '/pilulabs')
```

- [ ] **Step 2: Rode e confirme que falham (inclusive com a variável que vai sobrar na Vercel)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web && ./node_modules/.bin/jest lib/pilulabs-json-ld.test.ts; echo "jest exit=$?"
lsof -nP -iTCP:3333 -sTCP:LISTEN
PILUTECH_SUBDOMINIOS=1 CI=1 ./node_modules/.bin/playwright test --retries=0 '\(site\)/pilulabs/pilulabs' '\(site\)/home'; echo "e2e com a chave exit=$?"
```

Expected: `jest exit=1` (o `publisher` ainda é `https://piluvitu.com.br/pilulabs`); `e2e com a chave exit=1`, com "responde 200, sem 308" recebendo 308 e o rodapé/"Saiba mais" em `https://pilutech.com.br/` (é o bug que a produção teria com a variável esquecida). Os outros testes de Jest editados no Step 1 já passam com o código de hoje (o parâmetro ausente vira "chave desligada"); quem prova a troca é o `tsc` do Step 4.

- [ ] **Step 3: Implemente**

Apague os arquivos:

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web && /usr/bin/git rm -q proxy.ts proxy.test.ts lib/pilutech-dominios.ts lib/pilutech-dominios.test.ts 'app/(site)/pilulabs/subdominios.e2e.ts' 'app/(site)/pilulabs/chave-ligada.e2e.ts'; echo "exit=$?"
```

`apps/web/lib/pilulabs.ts`: apague `import { DOMINIO_PILUTECH, urlPublica } from './pilutech-dominios'` e troque as três funções:

```ts
export function linkDoItem(
  item: Pick<ItemPiluLabs, 'slug' | 'paginaPropria' | 'site' | 'repo'>,
): string | null {
  if (item.paginaPropria) return `/pilulabs/${item.slug}`
  return item.site || item.repo || null
}
```

```ts
export function itemParaProject(item: ItemPiluLabs): Project {
  const link = linkDoItem(item)
```

(o resto do corpo de `itemParaProject` não muda)

```ts
// O Next substitui o openGraph do layout inteiro, e a imagem só vem do
// opengraph-image.tsx do próprio segmento: por isso tudo de novo e sem images.
export function metadataDaPagina({
  caminho,
  titulo,
  descricao,
}: PaginaPiluLabs): Metadata {
  return {
    title: { absolute: titulo },
    description: descricao,
    alternates: { canonical: caminho },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      siteName: 'piluvitu.com.br',
      url: caminho,
      title: titulo,
      description: descricao,
    },
    twitter: {
      card: 'summary_large_image',
      title: titulo,
      description: descricao,
    },
  }
}
```

`apps/web/lib/pilulabs-json-ld.ts` (substitui o arquivo):

```ts
export const CONTEXTO_SCHEMA = 'https://schema.org'

const PILUTECH = {
  '@type': 'Organization',
  '@id': 'https://pilutech.com.br/#organizacao',
  name: 'PiluTech',
  url: 'https://pilutech.com.br',
}

export type ParteDaVitrine = { nome: string; href: string | null }

function absoluto(siteUrl: string, caminho: string): string {
  return new URL(caminho, `${siteUrl}/`).href
}

export function jsonLdVitrine(siteUrl: string, partes: ParteDaVitrine[]) {
  return {
    '@context': CONTEXTO_SCHEMA,
    '@type': 'CollectionPage',
    name: 'PiluLabs',
    description: 'Produtos e apps da PiluTech',
    url: absoluto(siteUrl, '/pilulabs'),
    inLanguage: 'pt-BR',
    publisher: PILUTECH,
    ...(partes.length > 0
      ? {
          hasPart: partes.map((parte) => ({
            '@type': 'SoftwareApplication',
            name: parte.nome,
            ...(parte.href ? { url: absoluto(siteUrl, parte.href) } : {}),
          })),
        }
      : {}),
  }
}
```

`apps/web/app/(site)/pilulabs/page.tsx` (substitui o arquivo):

```tsx
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { PageTopBar } from '@/components/page-top-bar'
import { Vitrine, type ItemVitrine } from '@/components/pilulabs/vitrine'
import { fase, lojasPublicadas } from '@piluvitu/tools/pilulabs'
import {
  itensListados,
  linkDoItem,
  metadataDaPagina,
  siglaDoItem,
} from '@/lib/pilulabs'
import { jsonLdVitrine } from '@/lib/pilulabs-json-ld'
import { getPiluLabs } from '@/lib/site-content'
import { getCanonicalSiteUrl } from '@/lib/site-url'

export const metadata: Metadata = metadataDaPagina({
  caminho: '/pilulabs',
  titulo: 'PiluLabs | produtos da PiluTech',
  descricao:
    'Produtos e apps que o Paulo Victor faz e mantém. Powered by PiluTech.',
})

export default async function PiluLabsPage() {
  const listados = itensListados(await getPiluLabs())
  const itens: ItemVitrine[] = listados.map((item) => ({
    item: { ...item, sigla: siglaDoItem(item) },
    href: linkDoItem(item),
    fase: fase(item),
    lojas: lojasPublicadas(item).map(({ loja }) => loja),
  }))
  const partes = itens.map(({ item, href }) => ({ nome: item.nome, href }))

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-8 sm:px-8 xl:py-10">
      <JsonLd dados={jsonLdVitrine(getCanonicalSiteUrl(), partes)} />
      <PageTopBar backHref="/" backLabel="Paulo Victor" />

      <header className="mt-10 mb-12">
        <h1 className="text-4xl font-bold tracking-tight">PiluLabs</h1>
        <p className="text-muted-foreground mt-2">
          Produtos e apps que eu faço e mantenho. Powered by PiluTech.
        </p>
        <p className="mt-4 font-mono text-sm">
          <span className="text-primary">$ ~/pilulabs</span>{' '}
          <span
            className="bg-primary ml-0.5 inline-block h-4 w-2 animate-pulse align-text-bottom"
            aria-hidden
          />
        </p>
      </header>

      <Vitrine itens={itens} hrefAutor="/" />
    </div>
  )
}
```

`apps/web/app/(site)/page.tsx`: apague `import { subdominiosAtivos, urlPublica } from '@/lib/pilutech-dominios'` e troque

```tsx
const subdominios = subdominiosAtivos()
const hrefPiluLabs = urlPublica('/pilulabs', subdominios)
const totalPiluLabs = itensListados(piluLabs).length
const naHome = selecionarParaHome(piluLabs).map((item) =>
  itemParaProject(item, subdominios),
)
```

por

```tsx
const hrefPiluLabs = '/pilulabs'
const totalPiluLabs = itensListados(piluLabs).length
const naHome = selecionarParaHome(piluLabs).map((item) => itemParaProject(item))
```

CMS: em `apps/web/keystatic.config.ts`, troque `label: 'Slug (sem acento; é o subdomínio e a pasta da rota)',` por `label: 'Slug (sem acento; é a pasta da rota própria)',` e `description: 'O padrão é https://<slug>.pilutech.com.br',` por `description: 'URL https da landing do produto (ex.: https://botai.pilutech.com.br)',`; em `apps/web/components/admin/content/pilulabs-form.tsx`, troque `placeholder="https://<slug>.pilutech.com.br"` por `placeholder="URL https da landing do produto"`. São textos de ajuda: o grep do Step 4 confere que não sobrou o modelo antigo, e o `pilulabs-form.test.tsx` e a trava do catálogo continuam verdes (nenhum deles lê rótulo nem dica).

Stories: em `components/secao-pilulabs.stories.tsx` e `components/home-footer.stories.tsx`, apague o `export const ComSubdominios: Story = {…}`; em `components/pilulabs/vitrine.stories.tsx`, renomeie `ComLojasESubdominios` para `ComLojas` e troque o `hrefAutor: 'https://piluvitu.com.br/'` dela por `hrefAutor: '/'`.

`apps/web/.env.example`: apague o bloco de 6 linhas que começa em `# PiluLabs: subdomínios *.pilutech.com.br (proxy.ts).` e termina em `# PILUTECH_SUBDOMINIOS=1` (e a linha em branco depois dele), e troque as linhas 3 e 4 (`# Em produção, defina-a sempre: VERCEL_PROJECT_PRODUCTION_URL é o domínio de produção mais` / `# curto, e pilutech.com.br (mesmo projeto) empata com piluvitu.com.br. NEXT_PUBLIC_SITE_URL tem prioridade.`) por:

```bash
# Em produção, defina-a sempre: VERCEL_PROJECT_PRODUCTION_URL é o domínio de produção mais
# curto do projeto, que pode não ser o canônico. NEXT_PUBLIC_SITE_URL tem prioridade.
```

- [ ] **Step 4: Rode os testes, tsc, lint, build, Storybook e os E2E (sem e com a variável)**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/web && ./node_modules/.bin/jest; echo "jest exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
./node_modules/.bin/eslint .; echo "eslint exit=$?"
pnpm run build:ci; echo "build exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
lsof -nP -iTCP:3333 -sTCP:LISTEN
CI=1 ./node_modules/.bin/playwright test --retries=0 '\(site\)/pilulabs/pilulabs' '\(site\)/home'; echo "e2e exit=$?"
PILUTECH_SUBDOMINIOS=1 CI=1 ./node_modules/.bin/playwright test --retries=0 '\(site\)/pilulabs/pilulabs' '\(site\)/home'; echo "e2e com a chave exit=$?"
/usr/bin/grep -rn "pilutech-dominios\|urlPublica\|subdominiosAtivos\|PILUTECH_SUBDOMINIOS\|rotearPorHost\|pilutech\.localhost\|é o subdomínio\|<slug>\.pilutech" --include='*.ts' --include='*.tsx' --include='*.mjs' --include='.env.example' . | /usr/bin/grep -v node_modules | /usr/bin/grep -v '/\.next/'; echo "grep exit=$?"
```

Expected: todos `exit=0`, menos o último `grep exit=1` (nada sobrou no código; o comentário novo do `pilulabs.e2e.ts` fala em "chave antiga dos subdomínios" justamente para não casar). O `tsc` é quem prova que nenhuma chamada ficou com o segundo argumento (o `ts-jest` só transpila). O `build:ci` não lista mais `ƒ Proxy (Middleware)` na saída. Confira `/usr/bin/git status` (o `next dev` do E2E pode reescrever o `apps/web/CLAUDE.md`; ver o ⚠️ na seção _Testes_ dele).

- [ ] **Step 5: Documente (`apps/web/CLAUDE.md` e a linha do `apps/web` no `CLAUDE.md` raiz)**

Em `apps/web/CLAUDE.md`, substitua a seção PiluLabs inteira (do título `### PiluLabs (…` até a linha antes de `### Admin unificado`) por:

````markdown
### PiluLabs (`/pilulabs`): vitrine dos projetos e produtos PiluTech

Tudo o que o autor publica, produto PiluTech (Botaí, Sombraí) ou projeto (Live PRs), mora numa coleção só, `pilulabs`. Ela alimenta a seção PiluLabs da home, a vitrine `/pilulabs` e o CRUD `/admin/pilulabs`. A vitrine mora em `piluvitu.com.br/pilulabs`; `pilutech.com.br` é a landing da empresa, no `apps/pilutech-site`.

- **Specs:**
  - `docs/superpowers/specs/2026-10-01-pilulabs-v2-subdominios-design.md`: a v2, com a coleção única, a home e os subdomínios;
  - `docs/superpowers/specs/2026-10-01-botai-multinavegador-design.md` §6: a v1, só com o Botaí;
  - `docs/superpowers/specs/2026-10-02-pilutech-site-design.md` §5: a vitrine volta para o `piluvitu.com.br`, e o proxy dos subdomínios sai.
- **Planos:** `docs/superpowers/plans/2026-10-01-pilulabs-v2.md`, `docs/superpowers/plans/2026-10-01-botai-fase2-pilulabs-site.md` e `docs/superpowers/plans/2026-10-02-pilutech-site.md` (Tarefa 8).

**Rota:** `/pilulabs`, a vitrine: todos os listados, agrupados por tipo.

O Botaí e o Sombraí não têm rota aqui: `botai.pilutech.com.br` é a landing do `apps/botai-site` e `sombrai.pilutech.com.br` a do projeto do Sombraí, cada uma num projeto Vercel próprio; o link do card é o `site`. Os caminhos antigos do Botaí (`/pilulabs/botai` e `/pilulabs/botai/privacidade`) respondem 308 para a landing, com a query, pelos `redirects` do `next.config.mjs`.

- **Coleção `pilulabs` (`content/pilulabs/<slug>/index.yaml`), campos:**
  - `slug`: sem acento; é a pasta da rota própria (`/pilulabs/<slug>`);
  - `order`, `nome`, `subtitulo` e `descricao` (o texto do card);
  - `tipo`: `extensao` | `mobile` | `web` | `cli`. Ausente, vira `web`. Fora da lista, o reader do Keystatic lança erro e derruba a coleção inteira (ver o ⚠️ abaixo);
  - `tags`;
  - `logo`: path em `public/` ou URL;
  - `sigla`: vazia, vira as 2 primeiras letras do nome;
  - `site` e `repo`: só `https:`. Outro esquema vira vazio, e um `href="javascript:…"` nunca chega ao card;
  - as 4 URLs de loja;
  - `destaque`, `data` (`AAAA-MM-DD`), `listado` e `paginaPropria`.

  Leitura: `getPiluLabs()`, em `lib/site-content.ts`. Edição: `/admin/pilulabs`. As coleções `projects` e `produtos` saíram.

- ⚠️ **Um YAML que o reader do Keystatic recusa derruba o build.**
  - **A armadilha:** o site lê pelo reader (`getPiluLabs`), mais estrito que o `normalizarItem`. `tipo` fora das opções, booleano em texto (`listado: "true"`), `order` que não é inteiro, texto em número e `data: ''` lançam erro. Como o `.all()` faz `Promise.all`, um item derruba a coleção inteira: home, `/pilulabs`, `/api/admin/stats` e o `next build`. O `apps/botai-site` lê o mesmo `content/pilulabs/botai/index.yaml` no build dele (só as 4 URLs de loja, pelo `yaml`, sem o reader). A data inexistente sem aspas (`2026-02-30`) ele não recusa: o js-yaml a rola para `2026-03-02`. A chave sem valor ele lê como ausente.
  - **No admin:** o `pilulabsSchema` é mais estrito ainda (`https:`, host da loja, data real, chave sem valor recusada), e o `GET /api/admin/content/pilulabs` valida dentro de um `Promise.all`: um item recusado vira 502 na lista inteira, e o reorder também falha.
  - **Por que `data` é `fields.date`:** o `yaml` do admin grava `data: 2026-10-01` sem aspas, e o `js-yaml` do reader lê isso como `Date`, que um `fields.text` recusaria.
  - **A defesa:**
    - o registry do admin tem `omitirSeVazio: ['data']`, e o `serializeEntry` apaga a chave vazia;
    - o `lib/pilulabs-conteudo.test.ts` reprova o YAML que o reader recusa (`camposInvalidosNoYaml`, que espelha o parse de cada campo do `keystatic.config.ts`) e o que o `pilulabsSchema` recusa. Os dois leitores precisam das travas porque o Jest e os E2E leem pelo `yaml` + `normalizarItem`, tolerantes, e ficariam verdes.
- **Regras (lógica pura, testada no Jest):**
  - `@piluvitu/tools/pilulabs` (`packages/tools/src/pilulabs.ts`), sem `node:fs`, importável no cliente e compartilhado com o `apps/botai-site`:
    - `Loja`, `LOJAS` e `ehUrlDaLoja`: só aceita `https:` no host exato da loja;
    - `lojasPublicadas`, `fase` e `ATALHOS` (derivado de `TECLAS_DO_MANIFESTO`, o `suggested_key` do Botaí);
    - `ehHttps`, `TipoItem` e `TIPOS` (na ordem da vitrine) e `ehDataValida`.
  - `lib/pilulabs.ts`:
    - `normalizarItem`;
    - `itensListados`: só `listado: true`, por `order` e depois `slug`;
    - `selecionarParaHome(itens, 4)`: primeiro os destaques, por `order`; depois os demais, pela `data` mais nova. A data vazia conta como a mais antiga, e o empate vai por `order` e depois `slug`;
    - `linkDoItem(item)`: a página própria é `/pilulabs/<slug>`; senão vale o `site`, depois o `repo`. Sem nenhum, o card fica sem botão;
    - `siglaDoItem`;
    - `itemParaProject`: o card da home. "Acessar" leva ao `linkDoItem`, e some quando seria o próprio `repo`; "Código" leva ao `repo`;
    - `metadataDaPagina`.
  - Status "● Em breve"/"● Disponível" e ícones de loja aparecem só em `tipo: extensao`.
- **Home:**
  - a seção PiluLabs (`components/secao-pilulabs.tsx`) mostra até 4 cards (`selecionarParaHome` → `itemParaProject` → `ProjectCard`) e a contagem dos listados;
  - abaixo dos cards, sempre, "Saiba mais no PiluLabs", para `/pilulabs`;
  - o rodapé (`HomeFooter`, prop `piluLabsHref`) mostra `/pilulabs` quando há listado.
- **Domínios:** o `apps/web` não serve host nenhum de `pilutech.com.br` desde 2026-10-02. O apex e o `www` são do `apps/pilutech-site`, o `botai.` do `apps/botai-site` e o `sombrai.` do projeto do Sombraí, cada um num projeto Vercel próprio. Saíram o `proxy.ts` (reescrita do apex e dos subdomínios, 308 do apex para o portfólio e de `/pilulabs*` para os subdomínios), o `lib/pilutech-dominios.ts` e a chave `PILUTECH_SUBDOMINIOS`. A variável saiu da Production do projeto antes da troca dos domínios (passo 5 do "Deploy" em `apps/pilutech-site/CLAUDE.md`: com ela ligada, o 308 de `/pilulabs` levaria à landing nova); se voltar, não muda nada (o E2E da vitrine e da home roda também com ela no ambiente).
- **Trava do catálogo (`lib/pilulabs-conteudo.test.ts`):** lê o YAML sem o Keystatic, pelo `lerYamlsDoConteudo`/`lerItensDoConteudo`, porque o reader é ESM puro e exige `server-only`. Ela exige que:
  - todo item com `paginaPropria` tenha `app/(site)/pilulabs/<slug>/page.tsx`, e também `privacidade/page.tsx` se for extensão;
  - toda pasta de rota com `page.tsx` tenha item com `paginaPropria`, porque só o item com `paginaPropria` leva até ela;
  - todo listado tenha `descricao`, link e, se o `logo` for caminho, o arquivo em `public/`;
  - todo YAML abra no reader do Keystatic: `camposInvalidosNoYaml` vazio, o que inclui `data` ausente ou `AAAA-MM-DD` de um dia que existe;
  - todo YAML passe no `pilulabsSchema` do admin.

  Se mudar um campo no `keystatic.config.ts`, mude também a regra dele em `camposInvalidosNoYaml`.

- **Novo item:**
  - pelo `/admin/pilulabs`, ou por PR no YAML (as travas acima pegam o que o reader ou o admin recusariam);
  - **produto com página própria:**
    1. `content/pilulabs/<slug>/index.yaml` com `paginaPropria: true` e `listado: false`;
    2. o logo em `public/pilulabs/<slug>/`;
    3. `app/(site)/pilulabs/<slug>/{page,opengraph-image,twitter-image}.tsx`, e o mesmo em `privacidade/` se for extensão;
    4. `listado: true` quando a página estiver pronta.
  - **produto com landing própria** (o Botaí, no `apps/botai-site`; o Sombraí): `paginaPropria: false` e o `site` na URL da landing.
- **Lançar o Botaí:** as URLs das lojas aprovadas entram pelo `/admin/pilulabs`; o card daqui, a landing do Botaí e o selo do Botaí na landing da PiluTech (as duas releem o YAML no build; ver o `ignoreCommand` dos `vercel.json` delas) mudam juntos. Edge e Opera entram quando aprovarem.
- ⚠️ **As rotas PiluLabs, e as imagens OG delas, têm de continuar estáticas, sem `revalidate`.**
  - **Por quê:** `lib/og-pilulabs-image.tsx` lê o ícone de `public/` com `readFile`. Na Vercel, `public/` vai para a CDN e não para o lambda. Se a rota virar ISR ou dinâmica (um `revalidate`, um `fetch` com cache de tempo, `cookies()`), a revalidação roda sem a pasta: o ícone some da imagem OG, sem erro nenhum.
  - **Como conferir, depois do `next build`, em `apps/web`:**

    ```bash
    node -e 'const { routes } = require("./.next/prerender-manifest.json"); const ks = Object.keys(routes); for (const r of ["/pilulabs", ...["opengraph-image", "twitter-image"].map((t) => ks.find((k) => new RegExp(`^/pilulabs/${t}(-[a-z0-9]+)?$`).test(k)) || `/pilulabs/${t}`)]) console.log(r, routes[r] ? routes[r].initialRevalidateSeconds : "NÃO ESTÁTICA")'
    ```

    As três linhas têm de terminar em `false`. A chave das imagens tem sufixo de hash (`/pilulabs/opengraph-image-<hash>`), porque o segmento está dentro do grupo `(site)`.

- **Ícones e capturas:**
  - `public/pilulabs/botai/icone-128.png` (o logo do card) é gerado por `make capturas-botai`, no `apps/botai`, e versionado. Não edite à mão; as capturas do Botaí moram no `apps/botai-site/public/capturas/`.
  - `public/pilulabs/sombrai/icone.png` é uma cópia de `Sombrai/site/src/assets/app-icon.png` (repo `PiluVitu/Sombrai`, privado e só lido daqui), reduzida com `sips -Z 256`. Se o ícone mudar lá, refaça a cópia.

- ⚠️ **SEO: `openGraph` é substituído inteiro, e a imagem é por segmento.**
  - **A armadilha:** no Next 16 a mesclagem é rasa. A página que declara `openGraph` perde `locale` e `siteName` do layout, por isso `metadataDaPagina` repete tudo. Ela também só ganha a imagem do `opengraph-image.tsx` do próprio segmento.
  - **Por isso:** a vitrine tem `opengraph-image.tsx` e `twitter-image.tsx` (o módulo é `lib/og-pilulabs-image.tsx`); uma página nova com `openGraph` próprio precisa dos dela.
  - ⚠️ **Ruído do `next dev --webpack` (o `pnpm dev` e o servidor do E2E), não erro:** ao servir as imagens PiluLabs, ele imprime `Attempted import error: … does not contain a default export (imported as 'handler')` e `export 'alt' … was not found (possible exports: runtime)` para o `twitter-image.tsx`, que reexporta do `./opengraph-image`. As imagens saem certas, byte a byte iguais às do build de produção (Turbopack, que não reclama). Medido: tirar o gerador para um módulo à parte (no `lib/` ou ao lado da rota) passa o aviso também para o `opengraph-image.tsx`, e importar e reexportar localmente ainda deixa `alt`, `size` e `contentType` de fora. Não reestruture para calar o aviso.
  - **O que o E2E confere:** o `og:title` e que cada `og:image`/`twitter:image` responde PNG.
- **JSON-LD (`lib/pilulabs-json-ld.ts`, com o componente `<JsonLd>`):**
  - `CollectionPage` em `/pilulabs`, com o `linkDoItem` de cada listado em `hasPart`;
  - `url` é `/pilulabs` no site canônico, e o `publisher` é a PiluTech no site dela (`https://pilutech.com.br`, `@id` `https://pilutech.com.br/#organizacao`, o mesmo do `apps/pilutech-site` e do `apps/botai-site`);
  - `serializarJsonLd` troca `<` por `\u003c`, para um texto do YAML com `</script>` não fechar a tag.
- **Componentes (`components/pilulabs/` e `components/secao-pilulabs.tsx`, todos com story e teste):**
  - `StatusProduto`;
  - `ProdutoCard`:
    - link interno na mesma aba, externo em aba nova;
    - sem link, vira `<article>`;
    - o logo por URL sai sem o otimizador do `next/image`;
    - sem logo, mostra a sigla;
  - `Vitrine`, que agrupa por tipo;
  - `SecaoPiluLabs`.

  ⚠️ Componentes e stories não importam valor de `lib/pilulabs-conteudo.ts` (que importa `node:fs`) nem de `lib/site-content.ts` (o reader do Keystatic): os dois quebram o bundle do Storybook e o do cliente. Dado de runtime chega por prop, vindo da página, ou vem de `@piluvitu/tools/pilulabs`, como os `TIPOS` do formulário do admin.

- **Testes:**
  - **Jest de componente:** usa `renderToStaticMarkup`, via `lib/render-estatico.ts`, sem Testing Library e sem dependência nova. Componente com TanStack Query vai embrulhado num `QueryClientProvider` (ver `home-footer.test.tsx`).
  - ⚠️ **O `ts-jest` daqui só transpila** (`isolatedModules: true` no `tsconfig.json`): um teste com tipo errado ou com export inexistente roda e falha em runtime (`TypeError: (0 , pilulabs_1.normalizarItem) is not a function`), sem erro de TypeScript. O tipo só é checado pelo `tsc --noEmit`.
  - ⚠️ **O filtro do Playwright é uma regex:**
    - `playwright test "app/(site)/pilulabs/pilulabs.e2e.ts"` não casa nada (os parênteses viram grupo) e sai com `No tests found` e `exit=1`, o que parece um vermelho de TDD;
    - `pilulabs/pilulabs.e2e.ts` casa o E2E do site e o do admin;
    - use `'\(site\)/pilulabs/pilulabs'` ou `'admin/pilulabs/pilulabs'`;
    - o `prettier --check` tem a mesma armadilha com glob: passe a pasta `"app/(site)/pilulabs"`.
  - **E2E (`app/(site)/pilulabs/pilulabs.e2e.ts`, `home.e2e.ts` e `app/(admin)/admin/pilulabs/pilulabs.e2e.ts`):**
    - o esperado sai do YAML, por `lerItensDoConteudo`, e por isso continua valendo quando o dono muda o catálogo;
    - a 320 px, a vitrine não rola na horizontal;
    - os 308 dos caminhos antigos do Botaí, com a query (`pilulabs.e2e.ts`);
    - `/pilulabs` responde 200, sem 308, com canonical e `og:url` em `/pilulabs`, e o rodapé da home leva a `/pilulabs`. Rode também com `PILUTECH_SUBDOMINIOS=1 CI=1 ./node_modules/.bin/playwright test --retries=0 '\(site\)/pilulabs/pilulabs' '\(site\)/home'`: prova que a variável que sobrar na Vercel não muda nada.
  - ⚠️ **Porta 3333:** antes do Playwright, ela tem de estar livre (`make stop`). Com `reuseExistingServer`, um `next dev` de outro worktree responderia no lugar, e o teste rodaria contra o código errado. Rode com `CI=1`, que faz o Playwright subir o próprio servidor e falhar se a porta estiver ocupada.
  - ⚠️ **O `next dev` reescreve este arquivo.** Quando detecta um agente de IA, ele anexa no fim o bloco entre os comentários HTML `BEGIN:nextjs-agent-rules` e `END:nextjs-agent-rules` (`node_modules/next/dist/server/lib/generate-agent-files.js`; o log diz "Generated CLAUDE.md for AI agents"). Depois de um E2E, confira `git status` e tire o bloco antes de commitar. Não escreva o marcador de abertura completo, com o `<!--`, neste arquivo: o `next dev` seguinte trocaria tudo o que vai dele até o marcador de fim por um bloco novo (medido: perde o _Admin unificado_ e as seções seguintes).
- **Fora:**
  - página do Botaí e do Sombraí no `apps/web`: os dois têm landing própria;
  - lojas de app mobile (Play Store e App Store) no modelo;
  - `sitemap.ts`/`robots.ts`, que vão para a fatia de SEO global.
````

Na seção _Environment variables (web)_ do mesmo arquivo, troque:

```text
- `NEXT_PUBLIC_SITE_URL` — domínio canônico (`https://piluvitu.com.br`) do `metadataBase`, do `og:image` e do canonical. **Obrigatória em Production** desde que o projeto tem os domínios `pilutech.com.br`: sem ela, `getCanonicalSiteUrl()` usa o `VERCEL_PROJECT_PRODUCTION_URL`, o domínio de produção mais curto, e `pilutech.com.br` empata com `piluvitu.com.br` (passo 0 de _PiluLabs_).
- `PILUTECH_SUBDOMINIOS` — `1` liga os subdomínios `*.pilutech.com.br` do PiluLabs: links, `canonical` e `og:url` das páginas PiluLabs passam para `pilutech.com.br`, e `/pilulabs*` no `piluvitu.com.br` responde 308 para lá. Só em **Production**, depois do passo 4 de _PiluLabs_; fora dela (`VERCEL_ENV` preview ou development), o código a ignora, mesmo marcada. As páginas leem a variável no build: mudar pede redeploy. Ausente (padrão) = desligado.
```

por:

```text
- `NEXT_PUBLIC_SITE_URL` — domínio canônico (`https://piluvitu.com.br`) do `metadataBase`, do `og:image` e do canonical. **Obrigatória em Production:** sem ela, `getCanonicalSiteUrl()` usa o `VERCEL_PROJECT_PRODUCTION_URL`, o domínio de produção mais curto do projeto, que pode não ser o canônico (`lib/site-url.test.ts`).
```

Na seção _Content structure (Keystatic YAML)_ do mesmo arquivo, troque:

```text
com visibilidade, destaque, lojas e subdomínio (ver _PiluLabs_)
```

por:

```text
com visibilidade, destaque e lojas (ver _PiluLabs_)
```

No `CLAUDE.md` raiz, na linha do `apps/web` da tabela de workspaces, troque:

```text
`/pilulabs` e os subdomínios `*.pilutech.com.br` (`proxy.ts`),
```

por:

```text
`/pilulabs`,
```

Confira: `/usr/bin/grep -n "urlPublica\|subdominiosAtivos\|pilutech-dominios\|pilutech\.localhost\|chave-ligada\|subdominios\.e2e\|PILUTECH_SUBDOMINIOS\|proxy\.ts\|e subdomínio\|é o subdomínio" apps/web/CLAUDE.md CLAUDE.md` → só o bullet **Domínios** (que cita `proxy.ts`, `lib/pilutech-dominios.ts` e `PILUTECH_SUBDOMINIOS` como removidos) e o bullet dos E2E (que manda rodar com `PILUTECH_SUBDOMINIOS=1`). Rode `./node_modules/.bin/prettier --check apps/web/CLAUDE.md CLAUDE.md; echo "exit=$?"` na raiz → `exit=0` (ou `--write` e confira o diff).

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add -A apps/web CLAUDE.md && /usr/bin/git status --short && /usr/bin/git commit -m "refactor(web): a vitrine volta para piluvitu.com.br/pilulabs e sai o proxy dos subdomínios pilutech.com.br"; echo "exit=$?"
```

(O `git status --short` deve mostrar só os arquivos desta tarefa: os 6 `D`, os `M` listados em **Files** e o `CLAUDE.md` raiz.)

---

### Tarefa 9: Botaí — e-mails com `[Botaí]` no assunto, o "← PiluLabs" em `piluvitu.com.br/pilulabs` e o logo da PiluTech no JSON-LD

Na landing do Botaí, cada `mailto:` ganha o assunto do lugar de onde sai (spec §6): `[Botaí] Suporte` no botão do rodapé, `[Botaí] Privacidade` nos dois links da política e `[Botaí] Termos de uso` no link dos termos, por `mailtoDaPilutech` de `@piluvitu/tools/contato`. O texto visível continua o endereço puro. O "← PiluLabs" do topo passa a apontar para a vitrine no domínio pessoal; o "Powered by PiluTech" e a `Organization` seguem em `https://pilutech.com.br`, que agora é a landing da empresa. A `Organization` do JSON-LD ganha o `logo` `https://pilutech.com.br/icon`, o 192 px que a Tarefa 2 criou (a nota do `CLAUDE.md` do app prometia o logo "quando houver o arquivo"). As docs do Botaí deixam de dizer que `pilutech.com.br` é a vitrine servida pelo `apps/web`.

**Files:**

- Modify (`apps/botai-site/`): `lib/conteudo.ts`, `lib/conteudo.test.ts`, `lib/json-ld.ts`, `lib/json-ld.test.ts`, `components/rodape.tsx`, `components/rodape.test.tsx`, `components/landing.tsx`, `components/landing.test.tsx`, `components/topo.test.tsx`, `components/topo.stories.tsx`, `app/privacidade/page.tsx`, `app/privacidade/page.test.tsx`, `app/privacidade/privacidade.e2e.ts`, `app/termos/page.tsx`, `app/termos/page.test.tsx`, `app/pagina.e2e.ts`, `CLAUDE.md`
- Modify: `apps/botai/README.md`, `apps/botai/CLAUDE.md`, `CLAUDE.md` (raiz, linha do `apps/botai-site`)

**Interfaces:**

- Consumes: `EMAIL_DA_PILUTECH`, `mailtoDaPilutech` (Tarefa 3).
- Produces (`apps/botai-site/lib/conteudo.ts`): `URL_DA_PILULABS = 'https://piluvitu.com.br/pilulabs'`; `MAILTO: { suporte: string; privacidade: string; termos: string }`; `EMAIL_DE_SUPORTE` passa a ser o `EMAIL_DA_PILUTECH` do pacote (mesmo valor). Em `apps/botai-site/lib/json-ld.ts`: `LOGO_DA_PILUTECH = 'https://pilutech.com.br/icon'`, no `logo` da `Organization`.

- [ ] **Step 1: Escreva os testes que falham**

`apps/botai-site/lib/conteudo.test.ts`: acrescente `EMAIL_DE_SUPORTE`, `MAILTO`, `URL_DA_PILULABS` e `URL_DA_PILUTECH` ao import de `./conteudo` e, no fim do arquivo:

```ts
describe('contato e links da PiluTech', () => {
  // O dono filtra no Gmail com subject:Botaí: cada link diz de onde veio (RFC 6068, UTF-8).
  it('suporte, privacidade e termos vão para o e-mail da PiluTech com [Botaí] no assunto', () => {
    expect(EMAIL_DE_SUPORTE).toBe('pilutechinformatica@gmail.com')
    expect(MAILTO).toEqual({
      suporte:
        'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Suporte',
      privacidade:
        'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Privacidade',
      termos:
        'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Termos%20de%20uso',
    })
  })

  it('a vitrine PiluLabs mora no piluvitu.com.br, e a PiluTech no pilutech.com.br', () => {
    expect(URL_DA_PILULABS).toBe('https://piluvitu.com.br/pilulabs')
    expect(URL_DA_PILUTECH).toBe('https://pilutech.com.br')
  })
})
```

`apps/botai-site/lib/json-ld.test.ts`: acrescente `LOGO_DA_PILUTECH,` ao import de `./json-ld` (depois de `jsonLdDaTrilha,`) e troque o comentário `// Sem logo: não há logo da PiluTech no repo, e o ícone do Botaí não é o logo da empresa.` e o teste `'Organization: a PiluTech, sem logo'` inteiro por:

```ts
// O logo é o /icon do apps/pilutech-site (192 px; está no ROTAS dele, e o build quebra se sumir).
// O ícone do Botaí não é o logo da empresa.
it('Organization: a PiluTech, com o logo do site dela', () => {
  expect(LOGO_DA_PILUTECH).toBe('https://pilutech.com.br/icon')
  expect(no('Organization', dados['@graph'])).toEqual({
    '@type': 'Organization',
    '@id': ID_DA_PILUTECH,
    name: 'PiluTech',
    url: 'https://pilutech.com.br',
    logo: LOGO_DA_PILUTECH,
  })
})
```

`apps/botai-site/components/rodape.test.tsx`: no primeiro teste, troque o esperado `'mailto:pilutechinformatica@gmail.com'` do link "Suporte" por `'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Suporte'`.

`apps/botai-site/app/privacidade/page.test.tsx`: no teste `'contato, termos e histórico'`, troque o esperado `'mailto:pilutechinformatica@gmail.com',` por `'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Privacidade',` (vale para os dois links do e-mail, que o `for` percorre).

`apps/botai-site/app/termos/page.test.tsx`: no teste `'privacidade, contato e histórico'`, troque `).toHaveAttribute('href', 'mailto:pilutechinformatica@gmail.com')` por `).toHaveAttribute('href', 'mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Termos%20de%20uso')`.

`apps/botai-site/components/landing.test.tsx`: no teste `'a política fica em /privacidade, e o rodapé leva à PiluTech'`, acrescente no fim:

```tsx
expect(screen.getByRole('link', { name: 'PiluLabs' })).toHaveAttribute(
  'href',
  'https://piluvitu.com.br/pilulabs',
)
```

`apps/botai-site/components/topo.test.tsx` e `components/topo.stories.tsx`: troque `'https://pilutech.com.br'` por `'https://piluvitu.com.br/pilulabs'` (as props de exemplo passam a ser as da landing; no teste, nas duas linhas).

`apps/botai-site/app/privacidade/privacidade.e2e.ts`: troque `page.locator('a[href="mailto:pilutechinformatica@gmail.com"]').first(),` por `page.locator('a[href="mailto:pilutechinformatica@gmail.com?subject=%5BBota%C3%AD%5D%20Privacidade"]').first(),`.

`apps/botai-site/app/pagina.e2e.ts`: dentro do `test.describe('/', …)`, depois do teste `'as âncoras do topo levam às seções'`:

```ts
test('o topo volta para a PiluLabs no piluvitu.com.br, e o suporte leva [Botaí] no assunto', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page
      .getByRole('navigation', { name: 'Topo' })
      .getByRole('link', { name: 'PiluLabs' }),
  ).toHaveAttribute('href', 'https://piluvitu.com.br/pilulabs')
  const suporte = page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Suporte' })
  expect(
    new URL((await suporte.getAttribute('href')) as string).searchParams.get(
      'subject',
    ),
  ).toBe('[Botaí] Suporte')
})
```

- [ ] **Step 2: Rode e confirme que falham**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && ./node_modules/.bin/jest lib/conteudo.test.ts lib/json-ld.test.ts components/rodape.test.tsx components/landing.test.tsx app/privacidade/page.test.tsx app/termos/page.test.tsx; echo "exit=$?"
```

Expected: `exit=1`: `MAILTO`/`URL_DA_PILULABS`/`LOGO_DA_PILUTECH` indefinidos, a `Organization` sem `logo`, os `href` dos e-mails sem `?subject=`, e o "PiluLabs" ainda em `https://pilutech.com.br`.

- [ ] **Step 3: Implemente**

`apps/botai-site/lib/conteudo.ts`: acrescente no topo `import { EMAIL_DA_PILUTECH, mailtoDaPilutech } from '@piluvitu/tools/contato'` e troque

```ts
export const URL_DA_PILUTECH = 'https://pilutech.com.br'
export const EMAIL_DE_SUPORTE = 'pilutechinformatica@gmail.com'
```

por

```ts
export const URL_DA_PILUTECH = 'https://pilutech.com.br'
export const URL_DA_PILULABS = 'https://piluvitu.com.br/pilulabs'
export const EMAIL_DE_SUPORTE = EMAIL_DA_PILUTECH
export const MAILTO = {
  suporte: mailtoDaPilutech(NOME, 'Suporte'),
  privacidade: mailtoDaPilutech(NOME, 'Privacidade'),
  termos: mailtoDaPilutech(NOME, 'Termos de uso'),
} as const
```

`apps/botai-site/components/rodape.tsx`: troque o import de `@/lib/conteudo` por `import { DOCUMENTOS, MAILTO, URL_DA_PILUTECH } from '@/lib/conteudo'` e, no botão Suporte, troque:

```text
<a href={`mailto:${EMAIL_DE_SUPORTE}`}>
```

por:

```text
<a href={MAILTO.suporte}>
```

`apps/botai-site/app/privacidade/page.tsx`: acrescente `MAILTO,` ao import de `@/lib/conteudo` e troque o corpo de `Email()` por `return <a href={MAILTO.privacidade}>{EMAIL_DE_SUPORTE}</a>`.

`apps/botai-site/app/termos/page.tsx`: acrescente `MAILTO,` ao import de `@/lib/conteudo` e, em "Contato", troque:

```text
<a href={`mailto:${EMAIL_DE_SUPORTE}`}>{EMAIL_DE_SUPORTE}</a>.
```

por:

```text
<a href={MAILTO.termos}>{EMAIL_DE_SUPORTE}</a>.
```

`apps/botai-site/components/landing.tsx`: no import de `@/lib/conteudo`, troque `URL_DA_PILUTECH,` por `URL_DA_PILULABS,` e troque `voltar={{ href: URL_DA_PILUTECH, rotulo: 'PiluLabs' }}` por `voltar={{ href: URL_DA_PILULABS, rotulo: 'PiluLabs' }}`.

`apps/botai-site/lib/json-ld.ts`: logo depois da linha do `ID_DA_PILUTECH`, acrescente

```ts
export const LOGO_DA_PILUTECH = `${URL_DA_PILUTECH}/icon`
```

e, no nó `Organization` do `jsonLdDaHome`, depois de `url: URL_DA_PILUTECH,`, acrescente `logo: LOGO_DA_PILUTECH,`.

- [ ] **Step 4: Rode os testes, lint, tsc, build e os E2E do Botaí**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/botai-site && pnpm run test; echo "test exit=$?"
./node_modules/.bin/eslint .; echo "eslint exit=$?"
./node_modules/.bin/tsc --noEmit; echo "tsc exit=$?"
pnpm run build; echo "build exit=$?"
./node_modules/.bin/storybook build --quiet; echo "storybook exit=$?"
lsof -nP -iTCP:3020 -sTCP:LISTEN; CI=1 pnpm run test:e2e; echo "e2e exit=$?"
/usr/bin/grep -rn 'mailto:\${' --include='*.tsx' --include='*.ts' app components lib; echo "grep exit=$?"
```

Expected: todos `exit=0`, menos o último `grep exit=1` (nenhum `mailto:` montado à mão sobrou). O `test:e2e` faz as duas passadas (YAML de teste, depois o CMS real). Confira `/usr/bin/git status` (o build reescreve o `.next`; o Next pode mexer no `CLAUDE.md` do app).

- [ ] **Step 5: Docs (Botaí, landing do Botaí e a linha da raiz)**

`apps/botai-site/CLAUDE.md`:

- Em `## A página`, acrescente ao fim da lista:

```markdown
- **E-mail e links da PiluTech:** todo `mailto:` vai para `pilutechinformatica@gmail.com` com `[Botaí]` no assunto (`MAILTO` em `lib/conteudo.ts`, por `mailtoDaPilutech` de `@piluvitu/tools/contato`): `[Botaí] Suporte` no rodapé, `[Botaí] Privacidade` na política, `[Botaí] Termos de uso` nos termos. O texto visível continua o endereço puro, e o `apps/botai/loja/textos.md` também. O "← PiluLabs" do topo leva a `https://piluvitu.com.br/pilulabs` (`URL_DA_PILULABS`, a vitrine no `apps/web`); o "Powered by PiluTech" e a `Organization` do JSON-LD seguem em `https://pilutech.com.br` (`URL_DA_PILUTECH`), a landing da empresa no `apps/pilutech-site`.
```

- Em `## SEO`, troque o sub-bullet do JSON-LD:

```text
  - A `Organization` sai **sem `logo`**: não há logo da PiluTech no repo, e o ícone do Botaí não é o logo da empresa. Entra quando houver o arquivo (≥ 112×112).
```

por:

```text
  - A `Organization` leva o `logo` `https://pilutech.com.br/icon` (`LOGO_DA_PILUTECH`): o símbolo da PiluTech, 192 px, gerado pelo `apps/pilutech-site`, que tem a rota no `ROTAS` (o build dele quebra se ela sumir). O ícone do Botaí não é o logo da empresa.
```

- Em `## Deploy`, passo 7, troque:

```text
(domínio no projeto do `apps/web`, "Passos do dono" na seção PiluLabs do `apps/web/CLAUDE.md`), porque o "← PiluLabs" do topo, o "Powered by PiluTech" do rodapé e a `Organization` do JSON-LD apontam para ele
```

por:

```text
(a landing da PiluTech, projeto `pilutech-site`; ver "Deploy" em `apps/pilutech-site/CLAUDE.md`), porque o "Powered by PiluTech" do rodapé e a `Organization` do JSON-LD apontam para ele
```

`apps/botai/README.md`, seção "Publicação": o passo 1 inteiro, troque:

```text
1. **Domínios na Vercel:** `pilutech.com.br` e `www.pilutech.com.br` (redirecionando para o apex) no projeto do `apps/web`; `botai.pilutech.com.br` no projeto `botai-site` (Root Directory `apps/botai-site`; ver "Deploy" em `apps/botai-site/CLAUDE.md`). Antes, confira `NEXT_PUBLIC_SITE_URL=https://piluvitu.com.br` em Production (passo 0 da seção PiluLabs do `apps/web/CLAUDE.md`).
```

por:

```text
1. **Domínios na Vercel:** `pilutech.com.br` e `www.pilutech.com.br` (redirecionando para o apex) no projeto `pilutech-site` (Root Directory `apps/pilutech-site`; ver "Deploy" em `apps/pilutech-site/CLAUDE.md`); `botai.pilutech.com.br` no projeto `botai-site` (Root Directory `apps/botai-site`; ver "Deploy" em `apps/botai-site/CLAUDE.md`).
```

e, no fim do passo 2, troque:

```text
Com `curl -sI https://pilutech.com.br` respondendo 200 (a vitrine, servida pelo `apps/web`), ligue `PILUTECH_SUBDOMINIOS=1` em Production no projeto do `apps/web` e faça o redeploy. O "Powered by PiluTech" do popup abre `https://pilutech.com.br`, que passa a ser a vitrine PiluLabs.
```

por:

```text
O "Powered by PiluTech" do popup abre `https://pilutech.com.br`, a landing da PiluTech.
```

`apps/botai/CLAUDE.md`, no bullet **Créditos**, troque:

```text
(o domínio serve a vitrine PiluLabs a partir dos passos 1 e 2 da "Publicação" do `README.md`)
```

por:

```text
(a landing da PiluTech, no `apps/pilutech-site`; domínio nos passos 1 e 2 da "Publicação" do `README.md`)
```

`CLAUDE.md` raiz, na linha do `apps/botai-site` da tabela de workspaces, troque:

```text
`/` e `/privacidade`, lojas e fase lidas do CMS
```

por:

```text
`/`, `/privacidade` e `/termos`, e-mails com `[Botaí]` no assunto, lojas e fase lidas do CMS
```

Os textos públicos do Botaí que só citam o e-mail não mudam; confira com `cd apps/botai && ./node_modules/.bin/vitest run loja/textos.test.ts; echo "exit=$?"` → `exit=0`. E `./node_modules/.bin/prettier --check apps/botai-site/CLAUDE.md apps/botai/README.md apps/botai/CLAUDE.md CLAUDE.md; echo "exit=$?"` na raiz → `exit=0`.

- [ ] **Step 6: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add apps/botai-site apps/botai/README.md apps/botai/CLAUDE.md CLAUDE.md && /usr/bin/git status --short && /usr/bin/git commit -m "feat(botai-site): e-mails com [Botaí] no assunto, o PiluLabs em piluvitu.com.br/pilulabs e o logo da PiluTech no JSON-LD"; echo "exit=$?"
```

---

### Tarefa 10: Documentação do app e da raiz, e verificação final

O `CLAUDE.md` completo do `apps/pilutech-site` (com a seção Deploy no molde do `apps/botai-site`: projeto, "pular quando não muda" desligado, primeira produção pelo preview, a chave `PILUTECH_SUBDOMINIOS` desligada na produção do `apps/web` e só então a troca dos domínios, e o merge depois), o `CLAUDE.md` raiz (workspace novo, comandos, portas, lint-staged, CI e Vercel) e o consumidor novo no `packages/ui/CLAUDE.md`. Depois, a verificação de tudo o que o branch mexeu.

**Files:**

- Modify: `apps/pilutech-site/CLAUDE.md`, `CLAUDE.md` (raiz), `packages/ui/CLAUDE.md`

**Interfaces:**

- Consumes: tudo das Tarefas 1 a 9 (só documenta e verifica).
- Produces: nada de código.

- [ ] **Step 1: `apps/pilutech-site/CLAUDE.md` completo**

Substitua o arquivo por:

````markdown
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

- **Textos:** os do design, letra por letra, em `lib/conteudo.ts` (listas) e nos componentes (frases únicas). Mudou o design? Mude o texto e o teste que o fixa.
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
- ⚠️ **CSS do Font Awesome na camada `base`** (`@import … layer(base)`) e `config.autoAddCss = false` (`lib/font-awesome.ts`, importado pelo layout e pelo Storybook), como no `apps/botai-site`: injetado em runtime, fora de camada, ele venceria o `size-*` dos ícones.

## Marca e imagens geradas

- `lib/marca.ts` guarda o símbolo como dados (`BLOCOS_DA_MARCA`: 5 blocos de 14 no quadro de 48, o de cima à direita em destaque) e as cores em hex para as imagens (`CORES_DA_MARCA`, conferidas contra o `.dark` do `@piluvitu/ui`).
- `SvgDaMarca` (em `components/pilutech-mark.tsx`) desenha com os tokens do contexto (`fill-foreground`/`fill-primary`: as versões escura e clara da marca) ou com `cores` em hex, para o Satori, que não tem CSS. `PiluTechMark` junta o lockup "PiluTech" em Jakarta 800, tracking −0.035em, a 60% do símbolo, com espaço de 28%, como o design.
- `app/icon.tsx` (192 px, múltiplo de 48 como o Google pede, cantos arredondados) e `app/apple-icon.tsx` (180 px) saem de `lib/imagem-do-icone.tsx`. O `/icon` também é o `logo` da `Organization`.
- A imagem OG (`lib/imagem-og.tsx`, 1200×630) usa a Plus Jakarta Sans de `@fontsource/plus-jakarta-sans`, o pacote estático com `.woff`: o `ImageResponse` só lê `ttf`/`otf`/`woff`, e o `@fontsource-variable` do Botaí só tem `woff2`.

## SEO

- **URLs:** `metadataBase` = `urlDoSite()`: `https://pilutech.com.br`, ou `SITE_URL` (só a origem; valor sem esquema é ignorado). Preview e local sem `SITE_URL` apontam canonical, `og:url`, JSON-LD, sitemap e robots para a produção; o preview da Vercel já responde com `X-Robots-Tag: noindex`.
- **Textos (`lib/seo.ts`):** título `PiluTech · Apps, infraestrutura e desenvolvimento fullstack` (59 caracteres; o `<title>` do design tem 66, e a spec pede até 60) e descrição de 156 caracteres com o que a PiluTech faz e onde. Os limites ficam no teste.
- **Open Graph e Twitter:** `metadataDaPagina` repete `type`, `locale`, `siteName`, `url`, `title` e `description` (o Next substitui o `openGraph` inteiro) e não declara imagem: ela vem de `opengraph-image.tsx`/`twitter-image.tsx`.
- **JSON-LD (`lib/json-ld.ts`):**
  - a PiluTech num nó só, `@type` `['Organization', 'ProfessionalService']`, com `@id` `https://pilutech.com.br/#organizacao` (o mesmo do `apps/botai-site` e do `publisher` da vitrine do `apps/web`): logo (`/icon`), e-mail, telefone, `contactPoint` comercial, Brasil como `areaServed`, endereço só com Teresina, PI e BR, os 3 serviços em `hasOfferCatalog`, sem preço. Dois nós ligados por `parentOrganization` diriam que a empresa é filha de si mesma; o Google pede o subtipo mais específico de `Organization`, e o schema.org marca o `ProfessionalService` genérico como descontinuado (trocar por `LocalBusiness` é decisão do dono);
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
````

- [ ] **Step 2: `CLAUDE.md` raiz e `packages/ui/CLAUDE.md`**

`CLAUDE.md` raiz (as edições, na ordem do arquivo):

1. Tabela de workspaces: logo depois da linha do `apps/botai-site` (que a Tarefa 9 já mudou), acrescente a linha abaixo (o prettier realinha a tabela):

```text
> | `apps/pilutech-site` | `apps/pilutech-site/CLAUDE.md` | Landing da PiluTech em `pilutech.com.br` (Next 16 + Tailwind 4 + `@piluvitu/ui`): uma página estática fiel ao design, WhatsApp por mensagem, e-mail com `[PiluTech]` no assunto, selo do Botaí lido do CMS do `apps/web`, SEO (metadata, OG, JSON-LD, sitemap, robots, manifest), Jest + Storybook (6020) + Playwright (3021), projeto Vercel próprio |
```

2. Na linha do `packages/ui` da mesma tabela, troque:

```text
consumidos por `apps/web`, `apps/financas/web`, `apps/botai` e `apps/botai-site`
```

por:

```text
consumidos por `apps/web`, `apps/financas/web`, `apps/botai`, `apps/botai-site` e `apps/pilutech-site`
```

3. **Tech Stack**, troque:

```text
com nove frentes:
```

por:

```text
com dez frentes:
```

4. Depois do bullet do `apps/botai-site` na Tech Stack, acrescente o do `apps/pilutech-site`; para isso, troque:

```text
- **`apps/botai-site`** — **Next.js 16** (App Router), **React 19**, **Tailwind CSS 4** e `@piluvitu/ui`: a landing do Botaí em `botai.pilutech.com.br`, todas as rotas estáticas, lojas e fase lidas do YAML do CMS do `apps/web` no build, regras de `@piluvitu/tools/pilulabs`. Projeto Vercel próprio (Root Directory `apps/botai-site`). → detalhes em `apps/botai-site/CLAUDE.md`.
```

por:

```text
- **`apps/botai-site`** — **Next.js 16** (App Router), **React 19**, **Tailwind CSS 4** e `@piluvitu/ui`: a landing do Botaí em `botai.pilutech.com.br`, todas as rotas estáticas, lojas e fase lidas do YAML do CMS do `apps/web` no build, regras de `@piluvitu/tools/pilulabs`. Projeto Vercel próprio (Root Directory `apps/botai-site`). → detalhes em `apps/botai-site/CLAUDE.md`.
- **`apps/pilutech-site`** — **Next.js 16** (App Router), **React 19**, **Tailwind CSS 4** e `@piluvitu/ui`: a landing da PiluTech em `pilutech.com.br`, uma página estática fiel ao design, com o selo do Botaí lido do YAML do CMS do `apps/web` no build e o e-mail com o projeto no assunto (`@piluvitu/tools/contato`). Projeto Vercel próprio (Root Directory `apps/pilutech-site`). → detalhes em `apps/pilutech-site/CLAUDE.md`.
```

5. No bullet do `packages/tools`, troque:

```text
consumida pelo web, pela extensão e pela landing do Botaí
```

por:

```text
consumida pelo web, pela extensão e pelas landings do Botaí e da PiluTech
```

6. No bullet do `packages/ui`, troque:

```text
(WXT/Vite) e `apps/botai-site` (Next). → detalhes em `packages/ui/CLAUDE.md`.
```

por:

```text
(WXT/Vite), `apps/botai-site` e `apps/pilutech-site` (Next). → detalhes em `packages/ui/CLAUDE.md`.
```

7. **Dependency security policy**, troque:

```text
`apps/botai-site`, `packages/*`). The Python side
```

por:

```text
`apps/botai-site`, `apps/pilutech-site`, `packages/*`). The Python side
```

8. **Commands**, linha do `make stop`: troque:

```text
8081/8082/3333/6017/3018/6018/3020/6019 se travarem
```

por:

```text
8081/8082/3333/6017/3018/6018/3020/6019/3021/6020 se travarem
```

9. **Commands**, depois da linha do `make storybook-botai-site` (o prettier realinha a tabela): troque:

```text
| `make storybook-botai-site`             | Storybook em http://localhost:6019                                                                                      |
```

por:

```text
| `make storybook-botai-site`             | Storybook em http://localhost:6019                                                                                      |
| `make dev-pilutech-site` | `next dev` em http://localhost:3021 |
| `make build-pilutech-site` | `next build` + gate do `@source` + conferência das rotas estáticas |
| `make test-pilutech-site` | Jest + `node --test` |
| `make test-e2e-pilutech-site` | build de produção + `next start` na 3021 + Playwright (com `CI=1`), em duas passadas: loja publicada e CMS real |
| `make storybook-pilutech-site` | Storybook em http://localhost:6020 |
```

10. **Gate do design system → Amarrado em**, no fim do bullet: troque:

```text
E em `apps/botai-site/package.json` → `build` (`next build && node ../../scripts/check-tailwind-source.mjs .next && node scripts/conferir-rotas-estaticas.mjs`).
```

por:

```text
E em `apps/botai-site/package.json` → `build` (`next build && node ../../scripts/check-tailwind-source.mjs .next && node scripts/conferir-rotas-estaticas.mjs`). E em `apps/pilutech-site/package.json` → `build`, igual ao do `apps/botai-site`.
```

11. **Pre-commit hook**: troque:

```text
Configs em cinco níveis
```

por:

```text
Configs em seis níveis
```

12. Depois do bullet do `apps/botai-site/package.json` no pre-commit, acrescente o do `apps/pilutech-site`; para isso, troque:

```text
- **`apps/botai-site/package.json`** → a mesma config do `apps/web` (`*.{ts,tsx}: [eslint --fix, prettier --write]`), pelo mesmo motivo: o ESLint flat do app só resolve com cwd nele.
```

por:

```text
- **`apps/botai-site/package.json`** → a mesma config do `apps/web` (`*.{ts,tsx}: [eslint --fix, prettier --write]`), pelo mesmo motivo: o ESLint flat do app só resolve com cwd nele.
- **`apps/pilutech-site/package.json`** → a mesma config do `apps/botai-site`, pelo mesmo motivo.
```

13. **CI / CD**, linha do `ci.yml`: troque:

```text
Em paralelo, **seis** jobs
```

por:

```text
Em paralelo, **sete** jobs
```

14. Na mesma linha, no fim do trecho do botai-site: troque:

```text
a conferência das rotas estáticas; o E2E roda local).
```

por:

```text
a conferência das rotas estáticas; o E2E roda local) e pilutech-site (os mesmos passos do botai-site; o E2E roda local).
```

15. **Vercel**, depois do bullet **Landing do Botaí**: troque:

```text
- **Landing do Botaí:** projeto à parte, Root Directory `apps/botai-site`, com o "Skip deployments" desligado e o `ignoreCommand` do `apps/botai-site/vercel.json` (ver "Deploy" em `apps/botai-site/CLAUDE.md`).
```

por:

```text
- **Landing do Botaí:** projeto à parte, Root Directory `apps/botai-site`, com o "Skip deployments" desligado e o `ignoreCommand` do `apps/botai-site/vercel.json` (ver "Deploy" em `apps/botai-site/CLAUDE.md`).
- **Landing da PiluTech:** projeto à parte (`pilutech-site`), Root Directory `apps/pilutech-site`, com o "Skip deployments" desligado e o `ignoreCommand` do `apps/pilutech-site/vercel.json`; domínios `pilutech.com.br` e `www` (308 para o apex), que saíram do projeto do `apps/web` (ver "Deploy" em `apps/pilutech-site/CLAUDE.md`).
```

`packages/ui/CLAUDE.md`: depois do bullet do `apps/botai-site` na lista de consumidores, acrescente:

```markdown
- **`apps/pilutech-site`** (landing da PiluTech, 2026-10-02) — quinto consumidor, Next 16 como o `apps/botai-site`: `app/globals.css` importa `@piluvitu/ui/styles.css` + `@source '../../../packages/ui/src'` (3 `../`) e `@source not '../*.md'`; usa `Button`, `cn` e os tokens do `.dark` por seção (a classe `dark` numa seção, nunca no `<html>`, para as seções claras ficarem no `:root`). Gate amarrado no `build` contra `.next`.
  - ⚠️ **`.dark` num elemento que não é o `:root` não muda as cores das utilities deste pacote.** O `@theme` de `src/styles.css` não é `inline`: o Tailwind emite `--color-background: hsl(var(--background))` no `:root`, onde o `var()` é resolvido, e os filhos herdam a cor pronta. Quem põe `dark` numa seção (o `apps/pilutech-site`) redeclara as cores em `@theme inline` no próprio `globals.css` (o `app/globals.test.ts` dele compara com este arquivo). Os apps que põem `dark` no `<html>` não são afetados; o decorador `dark` do `apps/web/.storybook/preview.tsx` é, e fica como está até alguém mexer nele.
```

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && ./node_modules/.bin/prettier --write CLAUDE.md packages/ui/CLAUDE.md apps/pilutech-site/CLAUDE.md; echo "exit=$?"
/usr/bin/git diff --stat
```

Expected: `exit=0`; o diff mostra só os três arquivos (o prettier realinha as tabelas).

- [ ] **Step 3: Verificação final do branch**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && pnpm install --frozen-lockfile; echo "install exit=$?"
pnpm dedupe --check; echo "dedupe exit=$?"
(cd apps/web && ./node_modules/.bin/jest components/admin/posts/mdx-editor.codemirror.test.ts); echo "codemirror exit=$?"
(cd packages/tools && pnpm run lint && pnpm run test); echo "tools exit=$?"
(cd packages/ui && pnpm run lint && pnpm run test); echo "ui exit=$?"
(cd apps/pilutech-site && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run prettier:check && ./node_modules/.bin/storybook build --quiet); echo "pilutech-site exit=$?"
(cd apps/botai-site && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && pnpm run prettier:check); echo "botai-site exit=$?"
(cd apps/web && ./node_modules/.bin/eslint . && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/jest && pnpm run build:ci); echo "web exit=$?"
(cd apps/botai && ./node_modules/.bin/vitest run loja/textos.test.ts); echo "botai textos exit=$?"
```

Expected: todos `exit=0`. Depois, os E2E, um por vez, com as portas livres (`lsof -nP -iTCP:<porta> -sTCP:LISTEN` vazio):

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev/apps/pilutech-site && CI=1 pnpm run test:e2e; echo "e2e pilutech exit=$?"
cd ../botai-site && CI=1 pnpm run test:e2e; echo "e2e botai exit=$?"
cd ../web && CI=1 ./node_modules/.bin/playwright test --retries=0 '\(site\)/pilulabs/pilulabs' '\(site\)/home'; echo "e2e web exit=$?"
PILUTECH_SUBDOMINIOS=1 CI=1 ./node_modules/.bin/playwright test --retries=0 '\(site\)/pilulabs/pilulabs' '\(site\)/home'; echo "e2e web com a chave exit=$?"
```

Expected: os quatro `exit=0`. Por fim, confira os requisitos da spec que não têm teste automático:

- a página a 1280 e a 390 px, lado a lado com `desktop.png` e `mobile.png` (Playwright `page.screenshot({ fullPage: true })` em `$SCRATCH`, aberto pelo `Read`): seções, textos, cores e espaçamentos;
- `/usr/bin/grep -rn "computador\|impressora" apps/pilutech-site/app apps/pilutech-site/components apps/pilutech-site/lib` → só a dúvida em `lib/conteudo.ts` e os testes;
- `/usr/bin/git status --short` sem `.next/`, `storybook-static/`, `test-results/`, `next-env.d.ts`, `AGENTS.md` ou bloco `nextjs-agent-rules` nos `CLAUDE.md`.

- [ ] **Step 4: Commit**

```bash
cd /Users/piluvitu/WWW/PiluVitu-Dev && /usr/bin/git add CLAUDE.md packages/ui/CLAUDE.md apps/pilutech-site/CLAUDE.md && /usr/bin/git status --short && /usr/bin/git commit -m "docs(pilutech-site): CLAUDE.md do app com o deploy, raiz e design system"; echo "exit=$?"
```
