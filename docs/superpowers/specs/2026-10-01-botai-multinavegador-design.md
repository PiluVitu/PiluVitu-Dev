# Botaí em Firefox, Opera e Edge, publicação nas lojas e página PiluLabs: design

- **Data:** 2026-10-01 · **Branches:**
  - fases 1 e 3 em `feat/botai-multinavegador`, empilhada sobre a `feat/extensao-dados-teste` (PR #45). O repo só aceita squash, então depois do merge do #45: `git rebase --onto origin/main <SHA final do #45> feat/botai-multinavegador` (hoje `b1d7b2b`);
  - fase 2 (site) em `feat/pilulabs-site`, a partir da `main`. Ela só mexe no `apps/web` e não espera o #45.
- **Base:** a extensão Botaí (`apps/botai`, ver `apps/botai/CLAUDE.md`) e a spec `2026-10-01-extensao-dados-teste-design.md`.
- **Pesquisa:** os relatórios `firefox-opera`, `publicacao`, `site-pilulabs` e `critica`, em `docs/superpowers/research/2026-10-01-botai-multinavegador/`. Quando esta spec diz "verificado", a evidência está lá. O protótipo do Firefox foi testado num Firefox 157 real.

## 1. Objetivo

Publicar o Botaí em **4 lojas** (Chrome Web Store, Firefox Add-ons, Microsoft Edge Add-ons e Opera Add-ons) com **o mesmo código**, com build e release automatizados, e apresentá-lo no site do autor, na página **PiluLabs**.

**Sucesso:**

- **Builds:** `make zip-botai` gera 3 pacotes (Chrome e Edge, Firefox, Opera) mais o zip de fontes da AMO. Os 3 são validados no CI, e o Firefox também passa pelo `web-ext lint`.
- **Firefox:** preenche a página de teste igual ao Chrome, com o resultado "21 de 23".
- **Release:** a tag `botai-v1.0.0` gera o GitHub Release com os pacotes e o zip de fontes, enviados à mão na primeira vez (§7). A partir da `botai-v1.0.1`, a tag publica na Chrome, na AMO e no Edge pelo job `lojas`, depois da aprovação manual. O Opera recebe o zip para envio à mão.
- **Site:** `piluvitu.com.br/pilulabs/botai` e a política de privacidade estão no ar antes do primeiro envio, e `curl -I https://pilutech.com.br` responde com o redirect.

## 2. Decisões

**Do dono:**

| Tema       | Decisão                                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lojas      | As 4: Chrome Web Store, Firefox AMO (**listed**), Edge e Opera (envio **manual**, porque o Opera não tem API oficial)                                                               |
| Publicador | **PiluTech** (a ME, com CNPJ). É o nome que aparece nas lojas e o responsável na política. Na Chrome Web Store tende a ser **Trader**: confirmar com o contador antes de preencher. |
| Licença    | **MIT**, só para o Botaí: `apps/botai` e os pacotes que ele empacota, `packages/tools` e `packages/ui`. Não vale para o repo inteiro.                                               |
| Ícone      | O **1i** atual. O ícone do manifesto não muda. Para a CWS sai um PNG de 128 px próprio da loja, do mesmo desenho, com arte de 96 px e 16 px de margem (§5).                         |

**Adotadas, as recomendações da pesquisa:**

| Tema               | Decisão                                                                                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Firefox            | MV3, `strict_min_version: '153.0'`. O `documentIds` e o `isAllowedFileSchemeAccess` reais só existem a partir do 153, e o ESR 140 acaba em 13/10/2026. `gecko.id` permanente: `botai@pilutech.com.br`. `data_collection_permissions: { required: ['none'] }`.                                            |
| Atalho             | Chromium: `{ default: 'Ctrl+Shift+Y', mac: 'Alt+Shift+P' }`. Firefox: o mesmo mais `linux: 'Alt+Shift+P'`, porque no Firefox para Linux `Ctrl+Shift+Y` abre os Downloads e ele não cede a tecla.                                                                                                         |
| Inserir no Firefox | `menus.getTargetElement(info.targetElementId)` (permissão `menus`, sem aviso na instalação), com o foco como reserva                                                                                                                                                                                     |
| Opera              | Build próprio **sem minificar** (regra da loja: código próprio não pode ser minificado) e envio manual.                                                                                                                                                                                                  |
| Edge               | Usa o **zip do Chrome**. O navegador Chromium é detectado em tempo de execução (§4), e não por constante de compilação, porque o bundle do Edge tem de continuar igual ao do Chrome e quem instala pela CWS no Edge ou no Opera também precisa ver o próprio navegador.                                  |
| Fontes para a AMO  | Zip de fontes do WXT com `sourcesRoot` na raiz do monorepo (a "opção B" da crítica). O CI reproduz o build a partir desse zip e compara byte a byte em todo PR do Botaí (§5).                                                                                                                            |
| Publicação         | `wxt submit` num job do workflow `botai-release.yml`, com o environment `lojas-botai` e aprovação manual. CWS pela **API v2**, porque a v1.1 morre em 15/10/2026. Também AMO e Edge. A primeira versão em cada loja (a 1.0.0) é enviada à mão, com os zips do Release.                                   |
| Versão             | Primeira versão pública **1.0.0**. O bump entra num PR (`make versao-botai`), e a tag `botai-v*` vai na `main` depois do merge (`make release-botai`).                                                                                                                                                   |
| Site               | Modelo **híbrido**: uma collection Keystatic `produtos` só com catálogo, status e links das lojas, e uma rota TSX por produto. A política fica em TSX versionado. A página nasce com `listado: false` + `noindex` e só é anunciada depois da aprovação. O "Em breve" e os botões de loja saem dos dados. |
| Idioma             | Listagem nas lojas e política em pt-BR. Exceção: o `SOURCE-CODE-REVIEW.md` do zip de fontes, em inglês, para o revisor da AMO.                                                                                                                                                                           |

## 3. Fora do escopo

- **Ficam de fora:** Safari, Firefox para Android e listagem em inglês (`_locales`).
- **Publicação no Opera:** sem automação. O cookie de sessão que o `wxt submit` usa é frágil.
- **Admin do site:** o CRUD de `produtos` no `/admin` fica para uma fatia seguinte. Na primeira, as URLs das lojas são editadas no YAML por PR.
- **SEO global** fica numa fatia própria: `sitemap.ts`/`robots.ts` do site inteiro e a correção do `og:title` herdado em `/tools`. Esta spec só garante o SEO das páginas novas.
- **Tarefas de painel que só o dono pode fazer:** criar contas, pagar a taxa, ativar 2FA e gerar credenciais (ver o §7).

## 4. Código multinavegador (`apps/botai`)

**`wxt.config.ts`**, consolidado na crítica (§4):

- `manifestVersion: 3`, porque sem isso o `-b firefox` gera MV2;
- `targetBrowsers: ['chrome', 'firefox', 'opera']` (o Edge usa o build do Chrome);
- `manifest` ramificado por `browser`:
  - no Firefox: `browser_specific_settings.gecko` e a permissão extra `menus`;
  - nos demais: `minimum_chrome_version: '123'`;
- atalho por navegador (§2);
- `homepage_url: 'https://piluvitu.com.br/pilulabs/botai'`;
- `vite.build.minify: false` só para o Opera;
- `zip`, o bloco da crítica (§4):
  - `name: 'botai'`, porque o padrão gera `pilutechbotai-…`;
  - `sourcesRoot` na raiz;
  - `includeSources`: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc` (arquivo oculto, só entra citado pelo nome), `scripts/check-tailwind-source.mjs`, `apps/botai/**`, `packages/tools/**` e `packages/ui/**`;
  - `excludeSources`: `apps/botai/.output/**` e `apps/botai/.wxt/**` (com `sourcesRoot` na raiz, a exclusão do outDir do WXT não os pega), `**/storybook-static/**` e `**/test-results/**`.

No `styles.css`, `@source not` para `*.test.*` do app e do `packages/ui`. Assim o CSS gerado a partir do zip de fontes é idêntico.

**Mudanças de código para o Firefox funcionar.** Sem elas, ele preenche 0 campos em silêncio. O grau de prova varia:

- **testados no protótipo, num Firefox 157:** o adaptador do `dom.ts` (21 de 23), a recusa `Missing host permission` e o `InjectionResult.error`;
- **verificados só no BCD, na fonte do Firefox ou por `typeof`:** o contexto `'password'`, o `getTargetElement` e o `openShortcutSettings`;
- **SUPOSTOS, e por isso no checklist da fase 1:** o Inserir pelo menu real, a página de atalhos no Edge e no Opera, as lojas do Edge e do Opera como proibidas e a detecção do navegador.

| Onde                                                                                                                     | O quê                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `preencher.content/dom.ts`                                                                                               | Adaptador da raiz sombra fechada. No Chrome é `browser.dom.openOrClosedShadowRoot(el)`; no Firefox é o **atributo** `el.openOrClosedShadowRoot`, não um método. Escolhe por `import.meta.env.FIREFOX`.                                                                                                                                                                                                                                                                                     |
| `background/acoes.ts`                                                                                                    | Tratar `InjectionResult.error`. No Firefox, uma exceção dentro da `func` volta no resultado em vez de rejeitar a Promise; a recusa da página continua sendo rejeição. No frame 0, `error` vira `throw` dentro do `try`: vai ao 1e só se casar `erroEhPaginaProibida`, senão sobe, como no Chrome (senão um defeito do Botaí aparece como "o navegador não deixa"). Nos demais frames, conta como `result: null`. No `inserirNoCampo`, `error` no frame do clique segue a regra do frame 0. |
| `lib/paginas.ts`                                                                                                         | No Firefox, a recusa é `/^Missing host permission for the tab/`. Esquemas novos: `moz-extension:`, `resource:` e `opera:`. Domínios da pref `extensions.webextensions.restrictedDomains` do Firefox (addons.mozilla.org, accounts.firefox.com, support.mozilla.org…). Cada entrada vale só no próprio navegador: o Chrome não pode dar 1e em addons.mozilla.org. `microsoftedge.microsoft.com` e `addons.opera.com` entram com conferência no checklist.                                   |
| `lib/menus.ts`                                                                                                           | Contexto `'password'` no Firefox, onde `editable` não inclui senha                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Inserir (`background/ouvintes.ts`, `background/acoes.ts`, `lib/mensagens.ts`, `preencher.content/api.ts` e `inserir.ts`) | No Firefox, o `info.targetElementId` vai do clique até o content script, que usa `browser.menus.getTargetElement`. O foco fica como reserva. Os tipos do `@wxt-dev/browser` 0.3.4 não têm `targetElementId` nem `menus`: exige cast.                                                                                                                                                                                                                                                       |
| `lib/navegador.ts` (novo)                                                                                                | `navegadorAtual()`: o Firefox por `import.meta.env.FIREFOX`; entre os Chromium, em tempo de execução, por `navigator.userAgentData.brands` ("Microsoft Edge", "Opera"; o resto é Chrome).                                                                                                                                                                                                                                                                                                  |
| Popup `App.tsx`                                                                                                          | "alterar"/"definir atalho": `commands.openShortcutSettings()` no Firefox; `chrome://extensions/shortcuts` nos Chromium. No Edge e no Opera, o checklist confere se essa URL abre; se não abrir, `edge://` ou `opera://extensions/shortcuts`.                                                                                                                                                                                                                                               |
| Textos do 1e e do `file:`                                                                                                | Um por navegador, via prop `navegador` vinda do `navegadorAtual()`. Hoje dizem "O Chrome não deixa…".                                                                                                                                                                                                                                                                                                                                                                                      |

**Testes:**

- Vitest:
  - ramos do Firefox com `vi.stubEnv('FIREFOX', true)`, o que foi provado (no Vitest, o padrão é o ramo Chromium);
  - o detector com `vi.stubGlobal('navigator', …)`;
  - um teste por caso do `InjectionResult.error`.
- Stories do 1e por navegador.
- `manifesto.e2e.ts`:
  - lê a versão do `package.json` em vez de fixar `'0.1.0'`; senão todo PR de versão fica vermelho;
  - soma as asserções de `.output/firefox-mv3/manifest.json`;
  - lê `.output/opera-mv3/background.js` e exige código legível (quebras de linha, nomes não minificados).

  O `test:e2e` passa a buildar também `-b firefox` e `-b opera`, e o `botai-e2e.yml`, que só chama esse script, não muda.

- O E2E funcional continua só no Chromium, pelo Playwright. O Firefox e o Edge ficam no checklist manual. O teste de fumaça com `puppeteer-core` fica fora das fases, sem dependência nova.

## 5. Build, CI e release

- **Scripts do `apps/botai`:**
  - `zip`: os 3 pacotes e o zip de fontes;
  - `zip:firefox` e `zip:opera`;
  - `lint:firefox`: `web-ext lint` sobre `.output/firefox-mv3`;
  - `test:e2e`: builda também Firefox e Opera (§4).

  O `web-ext` entra como devDependency **fixada**. Confira se ele exige `allowBuilds`.

- **Makefile.** São dois alvos de versão, porque o repo só aceita squash e o bump e a tag ficam separados por uma revisão:
  - `zip-botai`;
  - `versao-botai V=x.y.z`: branch, `pnpm version --no-git-tag-version`, commit e `gh pr create`;
  - `release-botai`: só roda com `HEAD` igual a `origin/main`. Lê a versão, aborta se a tag já existe, cria a tag anotada `botai-v<versão>` e dá push.
- **Gate:** o `check-tailwind-source.mjs` também roda contra `.output/firefox-mv3` e `.output/opera-mv3`.
- **CI (`ci.yml`, job `botai`):** lint, testes, builds de Chrome, Firefox e Opera com os gates, e `web-ext lint`.
- **Release (`.github/workflows/botai-release.yml`).** Três gatilhos:
  - tag `botai-v*`;
  - `workflow_dispatch` com `lojas: nenhuma | dry-run | submeter` e `adiar_chrome` (padrão `false`);
  - `pull_request` que toca `apps/botai/**`, `packages/ui/**`, `packages/tools/**` ou o próprio workflow. Fica fora do `ci.yml` para não segurar o deploy do finanças.
  1. **Job `pacotes`:**
     - na tag, confere que ela é `botai-v<versão do package.json>` e que o commit está na `main`;
     - verificação completa e `wxt zip` dos 3 pacotes;
     - reprodução do build do Firefox a partir do zip de fontes, num diretório limpo, com `cmp` byte a byte, em `ubuntu-24.04` com Node 24.14.0 (o ambiente do revisor da AMO). Assim um PR que quebre a reprodução falha no PR, e não na tag;
     - copia os zips para `botai-zips/` e sobe como artifact, porque o `upload-artifact` ignora a pasta oculta `.output`;
     - GitHub Release só no push de tag, com `permissions: contents: write` e `--latest=false`. No dispatch e no PR, só o artifact.
  2. **Job `lojas`**, com `environment: lojas-botai` e aprovação manual. Baixa o artifact e, no push de tag, roda em modo `submeter`:
     - `pnpm exec wxt submit --chrome-zip … --edge-zip <o zip do Chrome> --firefox-zip … --firefox-sources-zip botai-X-sources.zip`;
     - env: `CHROME_API_VERSION: v2` (sem ela, o publicador usa a v1.1), `CHROME_EXTENSION_ID` ← `vars.BOTAI_CHROME_EXTENSION_ID`, `EDGE_PRODUCT_ID` ← `vars.BOTAI_EDGE_PRODUCT_ID`, `FIREFOX_EXTENSION_ID: botai@pilutech.com.br` (obrigatória), `FIREFOX_CHANNEL: listed`, `FIREFOX_COMPATIBILITY: firefox`, mais os secrets abaixo;
     - cada loja só entra se os secrets dela existirem; sem nenhum, o job sai com `::notice::`;
     - na CWS, `CHROME_PUBLISH_TYPE: STAGED_PUBLISH` só com `adiar_chrome: true`. O padrão é publicar, senão toda atualização fica presa a um clique no painel.
  3. **No PR**, o `lojas` roda sem environment, no modo `nenhuma`: monta e imprime em `::notice::` o `wxt submit` de cada loja, sem enviar, e o `actionlint` valida o workflow. É o único teste possível antes das credenciais, porque o `--dry-run` exige credenciais reais.
  4. **Opera:** o zip sem minificar fica no Release, para envio manual.

- **Secrets e variables** do environment `lojas-botai`, com os nomes do relatório `publicacao` §6:
  - secrets: `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`, `EDGE_CLIENT_ID`, `EDGE_API_KEY` (a chave do Edge expira; a data aparece no Partner Center);
  - variables: `BOTAI_CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `BOTAI_EDGE_PRODUCT_ID`.

  O `.env.submit` entra no `.gitignore`.

- **Material da listagem, versionado em `apps/botai/loja/`:**
  - textos em pt-BR:
    - resumo de até 250 caracteres (limite da AMO) e descrição de 250 ou mais (mínimo do Edge);
    - single purpose, "remote code: não" e a categoria de dados "Website content" da CWS;
    - a justificativa de cada permissão, inclusive `menus` (só no Firefox);
  - por loja: CWS em Developer Tools; AMO em `web-development`, licença MIT, só desktop;
  - `icone-128.png`: arte de 96 px e margem de 16 px, do mesmo desenho 1i (o `public/icon/128.png` ocupa o quadro todo);
  - capturas, num script Playwright único (`playwright.capturas.config.ts`):
    - o popup sai das stories do Storybook, a 2×, com atalho `Ctrl+Shift+Y` e tema por prop, independentemente do sistema onde o script roda (a extensão real mostraria `⌥⇧P` num Mac);
    - a extensão real dá só a página preenchida, com um fixture de opção `aparencia` repassado ao `launchPersistentContext` (o fixture atual ignora `test.use`);
    - tamanhos: 1280×800, 640×400, tile de 440×280, ao menos 2 de 612×408 com fundo branco para o Opera e logo de 300×300 para o Edge, nos temas claro e escuro;
    - o script grava também em `apps/web/public/pilulabs/botai/`, para o site usar as mesmas imagens.
- **`apps/botai/SOURCE-CODE-REVIEW.md`**, em inglês, entra no zip de fontes por `apps/botai/**`. Traz Ubuntu 24.04, Node 24.14.0, `corepack enable` (pnpm 11.1.1) e os comandos exatos, e diz que os arquivos da raiz vão só para a reprodução. As notas para o revisor da AMO e do Opera apontam para ele.
- **Licença:**
  - `LICENSE` MIT (© PiluTech) em `apps/botai`, `packages/tools` e `packages/ui`. O de `packages/ui` mantém também o "Copyright (c) 2023 shadcn", de onde vêm os componentes;
  - `"license": "MIT"` nos três `package.json` e uma menção no README.

## 6. Página PiluLabs (`apps/web`)

**Rotas:**

| Rota                          | Arquivo                                         | O que é                                                                                                                                                                                                                                                          |
| ----------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/pilulabs`                   | `app/(site)/pilulabs/page.tsx` (+ `layout.tsx`) | Vitrine dos produtos PiluTech listados. O visual segue `/tools`: `PageTopBar`, h1, a linha de terminal `$ ~/pilulabs▌`, `SectionHeader` e cards. Sem produto listado, mostra o estado vazio: "PiluLabs: produtos da PiluTech. Em breve.", com link para o autor. |
| `/pilulabs/botai`             | `app/(site)/pilulabs/botai/page.tsx`            | Página do produto, que também serve de `homepage_url` e de página de suporte nas lojas                                                                                                                                                                           |
| `/pilulabs/botai/privacidade` | `…/privacidade/page.tsx`                        | Política de privacidade em pt-BR. É a URL que vai para as lojas, e o mesmo texto é colado na AMO. Segue o `robots` da página do produto.                                                                                                                         |

As três rotas têm `opengraph-image.tsx` e `twitter-image.tsx` próprios ou `openGraph.images` explícito. Uma página que declara `openGraph` sem arquivo no próprio segmento perde a imagem (`resolve-metadata.js`, relatório `site-pilulabs` §5).

**Conteúdo:**

- **Collection Keystatic `produtos`** (`content/produtos/botai/index.yaml`), com os campos: `produtoSlug`, `order`, `nome`, `tipo`, `listado`, `resumo`, `icone`, `tags`, `chromeUrl`, `firefoxUrl`, `edgeUrl`, `operaUrl` e `repoLink`. Fica sem `versao`, que ninguém atualizaria a cada release; o JSON-LD sai sem `softwareVersion`.
- **Leitura:** `getProdutos()` novo em `lib/site-content.ts`, no padrão `skipCacheWhenDraft`.
- **Lógica pura em `lib/pilulabs.ts`:**
  - `lojasPublicadas` só aceita a URL quando ela tem o host certo da loja;
  - `fase` é "em-breve" ou "disponível";
  - `metadataDoProduto(produto)` monta o `robots`;
  - `ATALHOS`, que espelha o `wxt.config.ts`: Chromium com `Ctrl+Shift+Y` e `⌥⇧P` no Mac; Firefox igual, mais `Alt+Shift+P` no Linux. O `apps/web` não importa nada do `apps/botai`.
- **Página do Botaí:**
  - o que é e a origem do nome ("bota aí");
  - recursos; as capturas entram na fase 3, junto com o script que as gera;
  - como usar: o atalho por navegador e sistema, vindo do `ATALHOS`;
  - botões de loja próprios do design system, com ícones Font Awesome, só para as lojas publicadas;
  - caixa pública e limites;
  - "Código-fonte" (o repo é público) e "Powered by PiluTech".
- **Política:**
  - os fatos vêm do código (relatório `site-pilulabs` §3.4): nada é transmitido; só a pessoa fictícia fica em `storage.local`; o conteúdo dos formulários é lido localmente depois de um gesto do usuário; há a caixa pública de terceiro;
  - tem uma tabela de permissões;
  - o responsável é a PiluTech, com contato `pilutechinformatica@gmail.com` (o e-mail que o site já usa), o mesmo contato de suporte nas 4 lojas. Se a política traz razão social e CNPJ, o dono decide com o contador, junto com o Trader;
  - traz a data da última atualização.
- **Visibilidade:**
  - com `listado: false`, a página fica acessível por link, com `robots: { index: false }`, e fora de `/pilulabs`. A fatia de SEO global filtra o sitemap por `listado`;
  - com `listado: true` e sem nenhuma loja, aparece "● Em breve";
  - com ao menos uma loja publicada, aparece "● Disponível", com os botões.
- **SEO das páginas novas:**
  - `generateMetadata` lendo o `getProdutos()`, porque o `robots` depende do YAML, com `openGraph` próprio para não herdar o da home;
  - JSON-LD `SoftwareApplication` (`BrowserApplication`, `price: 0`, sem `aggregateRating` copiado das lojas) e `BreadcrumbList`.
- **Na home:**
  - o link `/pilulabs` no rodapé só aparece com ao menos 1 produto listado;
  - o card do Botaí em "Projetos" sai dos `produtos` com `listado: true`, mapeados para `Project` no `app/(site)/page.tsx`. Não sai da collection `projects`, que não tem `listado` e mostraria o card antes do lançamento.
- **Testes:**
  - Jest:
    - `lib/pilulabs.ts`, inclusive o `noindex` (`metadataDoProduto`) e os botões só para as lojas publicadas, com fixtures;
    - os componentes novos, com stories;
    - a trava do modelo híbrido: lê `content/produtos/*/index.yaml` e exige `app/(site)/pilulabs/<slug>/page.tsx` e `privacidade/page.tsx` para todo produto com `listado: true`;
  - E2E (`pilulabs.e2e.ts`): só o que não muda com o YAML. As três rotas respondem, com h1, JSON-LD válido e o link da privacidade.

## 7. Ordem de lançamento e o que só o dono faz

1. **Fase 2 (site) em produção**, deploy na Vercel:
   - `/pilulabs` (estado vazio), `/pilulabs/botai` com `listado: false` e `/pilulabs/botai/privacidade`.
   - **Dono**, para o "Powered by PiluTech" do popup não cair num domínio morto (hoje `pilutech.com.br` não tem registro A):
     1. criar um registro proxiado, por exemplo `A @ 192.0.2.1` com a nuvem laranja, e o mesmo para `www`, porque o Single Redirect da Cloudflare só age sobre tráfego proxiado;
     2. criar o Single Redirect 308 para `https://piluvitu.com.br/pilulabs`;
     3. conferir com `curl -I https://pilutech.com.br`.
2. **Contas (dono):**
   - **Chrome Web Store:** taxa de US$ 5, verificação em duas etapas obrigatória, e-mail de login **imutável** (recomendado um dedicado da PiluTech) e dados de Trader da PiluTech.
   - **AMO:** com 2FA.
   - **Edge:** Partner Center.
   - **Opera:** conta de desenvolvedor.
   - Antes do primeiro envio, conferir se o nome colide na CWS e no INPI. Já existe "GetBotAI" na AMO.
3. **Primeiro envio manual em cada loja (dono)**:
   - antes da tag, criar o environment `lojas-botai`, com o próprio dono como revisor;
   - `make release-botai` na 1.0.0: a tag gera o Release, e o job `lojas` sai com `::notice::` porque ainda não há secrets;
   - com os zips do Release e os textos de `apps/botai/loja/`: Chrome com publicação adiada; AMO listed com o zip de fontes e o `SOURCE-CODE-REVIEW.md`; Edge com o zip do Chrome; Opera com o zip sem minificar.
4. **Credenciais (dono):**
   - criar a conta de serviço da CWS, as chaves JWT da AMO e a API key do Edge;
   - cadastrar os secrets e as variables;
   - rodar o `botai-release.yml` com `dry-run`.
5. **Lançamento**, quando a CWS e a AMO aprovarem:
   - publicar o item adiado na Chrome, em até 30 dias da aprovação;
   - AMO e Edge ficam públicos assim que aprovam, antes do `listado: true`;
   - preencher as URLs das lojas no YAML e marcar `listado: true`, por PR. Edge e Opera entram no YAML quando aprovarem; o `lojasPublicadas` trata loja por loja, e o Opera pode levar meses;
   - a home, o rodapé e `/pilulabs` passam a mostrar o Botaí.

Esse passo a passo vira uma seção "Publicação" no `apps/botai/CLAUDE.md` e no README.

## 8. Riscos

- **E2E do Firefox:** nenhum caminho foi provado no CI Linux. Por isso o comportamento do Firefox fica no checklist manual.
- **Edge e Opera:** sem teste funcional ainda. Pontos a conferir no checklist manual:
  - a página de atalhos (`edge://`/`opera://`);
  - a detecção do navegador (`userAgentData.brands`) e o texto do 1e;
  - os atalhos reservados de cada navegador.
- **Revisão das lojas:** cada uma tem um prazo incerto. A Chrome dá 30 dias para publicar depois de aprovar, e o Opera põe código minificado numa fila de menor prioridade.
- **Fontes reproduzíveis:** a prova byte a byte foi feita sem o código novo. O `cmp` roda em todo PR do Botaí (§5), e é ele que garante a reprodução.

## 9. Fases (um plano por fase)

1. **Multinavegador** (`feat/botai-multinavegador`):
   - config (com o `zip`), adaptadores, detector e textos por navegador;
   - testes, `web-ext lint` e os builds de Firefox e Opera no CI;
   - `make zip-botai` e o job `pacotes` do `botai-release.yml` no gatilho de PR, com a reprodução das fontes;
   - `LICENSE` e `SOURCE-CODE-REVIEW.md`;
   - docs: `apps/botai/CLAUDE.md`, README e o `CLAUDE.md` da raiz.

   **Pronto quando:** os 3 builds passam nos gates e no lint, a reprodução das fontes está verde, e o checklist passa no Firefox (preenche a página de teste) e no Edge, que está instalado na máquina.

2. **Site PiluLabs** (`feat/pilulabs-site`): collection `produtos`, `lib/pilulabs.ts`, as três rotas com SEO, rodapé condicional e card, testes e stories, e `apps/web/CLAUDE.md`. O Botaí entra com `listado: false` e sem capturas.
3. **Release e lojas** (`feat/botai-multinavegador`):
   - o job `lojas` e o Release na tag;
   - `make versao-botai`/`release-botai`;
   - `apps/botai/loja/`, com textos, ícone 128 e capturas, e o script de capturas; as capturas entram também na página do Botaí;
   - versão 1.0.0;
   - seção "Publicação" nos docs.

Nenhuma tag `botai-v*` é criada antes de o #45 e as fases 1 e 3 estarem na `main`.
