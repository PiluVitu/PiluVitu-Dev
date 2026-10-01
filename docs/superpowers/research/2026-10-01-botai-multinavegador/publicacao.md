# Botaí: build automatizado e publicação nas lojas (Chrome, Firefox, Opera, Edge)

Pesquisa feita em 2026-10-01. Não alterei nenhum arquivo do repo. Testei tudo num clone (`git clone` do branch `feat/extensao-dados-teste` @ `b1d7b2b`) e numa cópia limpa dentro do scratchpad.

Legenda: **[V]** = verificado (a fonte vem junto) · **[S]** = suposto, não verificado.

---

## 0. O que pesa mais

1. **[V] A API v1.1 da Chrome Web Store para de funcionar em 15/10/2026, daqui a duas semanas.** O blog oficial diz: "We plan to support the old API until 15th October 2026" (https://developer.chrome.com/blog/cws-api-v2). O `publish-browser-extension@6.1.1` (o que roda por trás do `wxt submit`) **usa v1.1 por padrão** quando `CHROME_API_VERSION` não está definida (`ChromeWebStoreV1_1Options`, marcado `@deprecated Will be removed October 15th, 2026`). O exemplo de GitHub Action em https://wxt.dev/guide/essentials/publishing.html ainda usa `CHROME_CLIENT_ID/SECRET/REFRESH_TOKEN`, ou seja, está desatualizado. Por isso o workflow precisa começar direto na v2 com service account e `CHROME_API_VERSION=v2`.
2. **[V] Sem `manifestVersion`, o WXT gera Firefox em MV2.** O código é `manifestVersion = mergedConfig.manifestVersion ?? (browser === "firefox" || browser === "safari" ? 2 : 3)`, em `node_modules/wxt/dist/core/resolve-config.mjs`. Medi: `wxt zip -b firefox` saiu em `.output/firefox-mv2` com `browser_action`. Isso se resolve com `manifestVersion: 3` no `wxt.config.ts`.
3. **[V] O `sources.zip` padrão do WXT não deixa o revisor da AMO reconstruir o build neste monorepo.** O `sourcesRoot` padrão é `apps/botai`, então ficam de fora `packages/tools`, `packages/ui`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` e o `package.json` da raiz. Resolve com `sourcesRoot` na raiz do monorepo + `includeSources`. Seção 2.3.
4. **[V] Mesmo assim o build não batia: o Tailwind lê os arquivos de teste.** O WXT exclui `*.test.*` do sources.zip sem dar opção de desligar ("you cannot replace the default values"). Só que o Tailwind v4 varre esses testes (`@source '../../../packages/ui/src'` + detecção automática), e eles trazem `.container`, `.ring` e `.invisible`. O CSS do revisor saía com 14 regras a menos e o diff falhava. Resolve com duas linhas `@source not` no `styles.css`. Com elas, **o pacote do Firefox reconstruído a partir do sources.zip ficou idêntico byte a byte**, testado em dois ambientes: macOS com Node 22.22.3, e Debian 12 com Node 24.14.0 (o Node padrão do revisor da AMO) via Docker `node:24.14.0`.
5. **[V] Chrome, Opera e Edge saem idênticos.** Rodei `diff -r` entre `.output/chrome-mv3`, `opera-mv3` e `edge-mv3`: nenhuma diferença. Um zip Chromium serve para as três lojas.
6. **[V] A Opera não tem API oficial.** O `publish-browser-extension` publica lá usando o cookie `sessionid` do painel (`cookie: INGRESSCOOKIE_API; sessionid=…`) e só atualiza um pacote que já tenha versão anterior. Recomendo envio manual ou não publicar na Opera (seção 3).
7. **[V] A primeira submissão é manual nas quatro lojas.** A CWS API v2 "does not support creating new items" (blog cws-api-v2). O publicador do Firefox faz `GET /api/v5/addons/addon/{id}` antes de enviar, logo o add-on precisa existir. A Opera exige "at least one previous version". O Edge diz "To initially publish a new extension, you use Partner Center".

---

## 1. Chrome Web Store (CWS)

### Conta

- **[V]** Taxa única de registro. A doc oficial confirma que existe ("pay a one-time registration fee", https://developer.chrome.com/docs/webstore/register) mas não diz o valor. **US$ 5** aparece só em fontes secundárias (Computerworld, chromeunboxed).
- **[V]** O e-mail da conta não muda depois de criada; trocar exige conta nova e transferência dos itens (mesma página). É obrigatório verificar o e-mail de contato (https://developer.chrome.com/docs/webstore/set-up-account).
- **[V]** Todo desenvolvedor declara se é **Trader ou Non-Trader** (DSA da União Europeia). Para trader, nome legal, contato e outros dados ficam visíveis a usuários da UE (https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure).

### Listagem

- **[V]** Fonte: https://developer.chrome.com/docs/webstore/images
  - Obrigatórios: ícone 128×128 (arte de 96×96 com 16 px de margem transparente), pelo menos 1 screenshot de 1280×800 ou 640×400 (máximo 5) e o small promo tile de 440×280.
  - Opcional: marquee de 1400×560.
- **[V] Medi o `public/icon/128.png`: ele ocupa o quadro inteiro, de (0,0) a (127,127), sem a margem de 16 px.** Isso é recomendação, não motivo de recusa, mas o ícone vai parecer maior que os vizinhos na loja. Vale um PNG próprio para a loja.
- **[V]** Categoria **Developer Tools** existe (https://developer.chrome.com/docs/webstore/best-practices).
- **[V]** Para ter listagem em mais de um idioma, o pacote precisa ter `_locales`: "Each locale corresponds to one of the `_locales/LOCALE_CODE` directories" (https://developer.chrome.com/docs/webstore/cws-dashboard-listing/). **O Botaí não tem `_locales`, então hoje só cabe uma listagem (pt-BR).**

### Aba Privacy practices

- **[V]** Campos (https://developer.chrome.com/docs/webstore/cws-dashboard-privacy): single purpose, uma justificativa por permissão, declaração de remote code, tipos de dados + certificações, e URL da política de privacidade.
- **[V] A política de privacidade é obrigatória mesmo que os dados fiquem só no navegador.** A FAQ (https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) diz, no item 3: "Extensions are required to disclose how they handle user data, even when data is processed or stored locally". No item 14: "Yes. This policy requires all Products that handle user information to post a privacy policy… may not need to be long". O Botaí lê campos e URL da aba (o que a CWS chama de "website content", definido como "any information about the websites… a user requests or interacts with") e guarda a pessoa em `storage.local`. Conclusão: **publicar uma política curta.** Rascunho na seção 6.

### Revisão e visibilidade

- **[V]** Prazos (https://developer.chrome.com/docs/webstore/review-process): "For most extensions, review is completed within a few days, but it can take up to a few weeks". Se passar de 3 semanas, contatar o suporte. Desenvolvedor novo e extensão nova recebem revisão mais rigorosa. O Botaí não tem host permissions nem `tabs`, então o perfil de risco é baixo **[S]**.
- **[V]** Visibilidade: Public, Unlisted (instala quem tiver a URL) ou Private (trusted testers / Google Groups) (https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).
- **[V]** Publicação adiada: com a opção desmarcada, há "up to 30 days to publish" depois da aprovação (https://developer.chrome.com/docs/webstore/publish). Pela API: `publishType: STAGED_PUBLISH`.

### API v2

- **[V]** Métodos: `media.upload`, `publishers.items.publish`, `fetchStatus`, `cancelSubmission` e `setPublishedDeployPercentage`. Não há criação de item. Endpoint: `https://chromewebstore.googleapis.com` (https://developer.chrome.com/docs/webstore/api/reference/rest).
- **[V]** Autenticação por service account (https://developer.chrome.com/docs/webstore/service-accounts):
  - criar uma service account num projeto GCP com a "Chrome Web Store API" habilitada, sem nenhuma role;
  - adicionar o e-mail dela no painel, seção Account;
  - "you can only add one service account to your publisher".
  - O Publisher ID aparece em **Publisher > Settings** (https://developer.chrome.com/docs/webstore/using-api).
- **[V]** O `publish-browser-extension@6.1.1` (`dist/init-*.mjs`) gera um JWT RS256 com `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` e troca em `oauth2.googleapis.com/token` com o escopo `chromewebstore`. Variáveis lidas: `CHROME_API_VERSION=v2`, `CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` e, opcionais, `CHROME_PUBLISH_TYPE`, `CHROME_DEPLOY_PERCENTAGE`, `CHROME_CANCEL_PENDING`, `CHROME_SKIP_REVIEW`.
- **[S]** A chave privada precisa chegar como PEM com quebras de linha reais (o código usa `createSign().sign(privateKey)`). Para cadastrar: `jq -r .private_key chave.json | gh secret set CHROME_SERVICE_ACCOUNT_PRIVATE_KEY --env lojas-botai`.

---

## 2. Firefox (AMO)

### 2.1 Conta e canais

- **[V]** A conta em addons.mozilla.org é grátis, exige aceitar o Firefox Add-on Distribution Agreement e confirmar o e-mail (https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).
- **[V]** 2FA é obrigatória para entrar na AMO desde 15/03/2021. Envio pela API usa as chaves e não pede o segundo fator (https://blog.mozilla.org/addons/2021/03/11/two-factor-authentication-required-for-extension-developers).
- **[V]** Os dois canais:
  - **Listed**: aparece na AMO, com atualização automática, e é publicado depois da validação automática. Continua sujeito a revisão manual depois.
  - **Unlisted**: assinado para distribuição própria, não aparece na AMO.
  - Prazo: "It can take up to 24 hours for your submission to be signed and published, or longer if… selected for manual review".
- **[V]** As chaves de API (JWT issuer/secret) ficam em https://addons.mozilla.org/developers/addon/api/key/. O publicador gera um JWT HS256 que vale 30 s (`createFirefoxJwt`). Variáveis: `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`, `FIREFOX_CHANNEL` (padrão `listed`), `FIREFOX_COMPATIBILITY` e `FIREFOX_SOURCES_ZIP`.
- **[V]** Licença: só precisa ser escolhida na primeira versão listed. Depois, "If neither are provided… it will inherit the previous version's license" (https://mozilla.github.io/addons-server/topics/api/addons.html). **O repo é público e não tem LICENSE** (`gh api` → `license: null`).
- **[V]** A categoria `web-development` existe; conferi na API viva `GET https://addons.mozilla.org/api/v5/addons/categories/`. O resumo tem limite de 250 caracteres e os screenshots recomendados são 1280×800 (proporção 1.6:1) (https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/).

### 2.2 Manifesto

- **[V]** `data_collection_permissions` é obrigatório para extensão nova desde 03/11/2025. Para quem não transmite nada: `"required": ["none"]`. Funciona a partir do Firefox desktop 140 e do Android 142 (https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/). O WXT 0.21.4 avisa quando falta o campo e quando falta o `gecko.id` (`core/utils/manifest.mjs`, linhas 58–59).
- **[V]** Política de privacidade: o Firefox define transmissão como dado "handled outside of the add-on or the local browser". Como o Botaí não transmite, `none` é a declaração correta. Fontes: add-on-policies e o anúncio de 2025, que diz que a política não precisa mais ser hospedada na AMO.
- **[V]** Rodei `web-ext@10.7.0 lint` (o mesmo addons-linter da AMO) no build com a config proposta: **0 erros, 6 avisos**, todos `UNSAFE_VAR_ASSIGNMENT`. Eles vêm de `innerHTML` dentro do react-dom e do `@fortawesome/fontawesome-svg-core` no chunk do popup; `background.js` e `preencher.js` têm zero ocorrências. Sem o `gecko_android`, aparecia um 7º aviso (`KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`).

### 2.3 Código-fonte exigido e o problema do monorepo

- **[V]** A AMO exige o fonte quando há minificação ou bundler (webpack etc.). O README precisa trazer sistema operacional, ferramentas com versão e "all the commands to generate an identical copy", mais o lockfile. Os revisores comparam com diff e "there must be no differences". Ambiente padrão deles: Ubuntu 24.04.4, Node 24.14.0, npm 11.9.0. Limite de 200 MB (https://extensionworkshop.com/documentation/publish/source-code-submission/).
- **[V] Como o WXT monta o zip de fonte** (`core/zip.mjs` e `resolve-config.mjs`):
  - `zipSources` liga sozinho para `firefox` **e** `opera`;
  - `sourcesRoot` padrão é a pasta do app;
  - sempre exclui `**/node_modules`, `**/*.+(test|spec).?(c|m)+(j|t)s?(x)`, `__tests__` e o `outDir` relativo ao root do app. Esse último padrão vira `.output/**` e **não pega** `apps/botai/.output` quando `sourcesRoot` é a raiz, então ele tem de ser excluído na mão;
  - `dotSources: false`, mas um nome literal como `.npmrc` em `includeSources` entra mesmo assim (medido).
- **[V] Configuração validada** (`lint` e os 308 testes do Vitest passam no clone; o Prettier está ok):

```ts
// apps/botai/wxt.config.ts — trecho novo/alterado
import { fileURLToPath } from 'node:url'
const raizDoMonorepo = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  // ...
  manifestVersion: 3,
  zip: {
    name: 'botai',
    sourcesRoot: raizDoMonorepo,
    includeSources: [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.npmrc',
      'scripts/check-tailwind-source.mjs',
      'apps/botai/**',
      'packages/tools/**',
      'packages/ui/**',
    ],
    excludeSources: [
      'apps/botai/.output/**',
      'apps/botai/.wxt/**',
      '**/storybook-static/**',
      '**/test-results/**',
    ],
  },
  manifest: ({ mode, browser }) => ({
    name: 'Botaí',
    short_name: 'Botaí',
    description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'botai@pilutech.com.br',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
            gecko_android: { strict_min_version: '142.0' },
          },
        }
      : { minimum_chrome_version: '123' }),
    // permissions, commands (com o comentário do Alt+Shift+P) e host_permissions do e2e: iguais
  }),
})
```

```css
/* apps/botai/src/styles.css — depois de @source not '../.output'; */
@source not './**/*.test.*';
@source not '../../../packages/ui/src/**/*.test.*';
```

- **[V] Efeito no CSS do Chrome:** compilei com e sem as duas linhas. Sem elas, o CSS tinha a mais só `.container` (com 5 media queries), `.ring` e `.invisible`; o `.sr-only` muda só de posição. Nenhum código de produção usa essas classes (grep sem match fora de `*.test.*`). O gate `check-tailwind-source.mjs` passa em `chrome-mv3`, `firefox-mv3` e `opera-mv3`.
- **[V] Reprodução de ponta a ponta.** O script `scratchpad/multinav/reproduzir.sh` faz o que o revisor faria: descompacta o sources.zip numa pasta limpa, sem `.git`, roda `pnpm install --frozen-lockfile` e `wxt zip -b firefox`, e compara:
  - mac + Node 22.22.3: `IDENTICO: .output/firefox-mv3` e `IDENTICO: botai-0.1.0-firefox.zip (byte a byte)`;
  - Docker `node:24.14.0` (Debian 12) + `corepack enable` (pnpm 11.1.1 lido do `packageManager`): `IDENTICO`.
  - O sources.zip tem 156 arquivos, ~418 KB, e nenhum `node_modules`, `.output`, `.wxt` ou `*.test.*`.
- **[V]** O `pnpm install --frozen-lockfile` funciona com só 3 dos 7 workspaces presentes. O lockfile tem importers de `apps/web` e de outros, e o pnpm 11.1.1 ignora os que faltam (exit 0).
- O revisor precisa de um README dentro do zip. Rascunho em inglês, porque o revisor da AMO lê inglês: `scratchpad/multinav/rascunhos/apps/botai/SOURCE-CODE-REVIEW.md`, com `corepack enable` → `pnpm install --frozen-lockfile` → `pnpm --filter @pilutech/botai exec wxt zip -b firefox`.

---

## 3. Opera Add-ons

- **[V]** O envio é manual pelo formulário em `addons.opera.com/developer/upload/`. A doc oficial não menciona API (https://help.opera.com/en/extensions/publishing-guidelines/). Screenshot preferido de 612×408, no máximo 800×600 e com fundo branco. **Não serve o mesmo 1280×800 das outras lojas.**
- **[V]** Código-fonte: "it can't be obfuscated or minified (this rule doesn't apply to third-party libraries)". Se for, é preciso "post a link where we can download the unobfuscated code, and… instructions" (https://help.opera.com/en/extensions/acceptance-criteria/). O README do `web-ext-deploy` orienta a subir o zip de fonte num lugar público ou apontar um repo aberto com README. **O repo é público** (`gh repo view` → `PUBLIC`), então o asset `botai-X-sources.zip` do GitHub Release serve de link.
- **[V]** Automação só por caminho não oficial: o `publish-browser-extension` usa o cookie `sessionid` com um `csrftoken` fixo, exige versão anterior e copia a short description em inglês da versão anterior (`OperaAddonsStore`, `dist/init-*.mjs`).
- **[S]** O cookie de sessão expira, então automatizar no CI seria frágil.
- **[S]** Prazo de revisão: só há relatos de meses no fórum (https://forums.opera.com/post/217947). Nada oficial.
- **[S]** Custo da conta: não achei na doc oficial; acredito que seja grátis.
- **[S]** Segundo o fórum (https://forums.opera.com/post/292773), o Opera instala direto da Chrome Web Store, com botão "Add to Opera". Se for verdade, publicar na CWS já atende quem usa Opera.

## 4. Edge

- **[V]** "There is no registration fee", com conta Individual ou Company (https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account).
- **[V]** Requisitos da listagem (https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension):
  - certificação em até 7 dias úteis;
  - descrição com no mínimo 250 caracteres;
  - logo 1:1, recomendado 300×300 e mínimo 128;
  - screenshots de 640×480 ou 1280×800 (máximo 6);
  - aba Privacy igual à da CWS;
  - política de privacidade obrigatória "if the extension collects any privacy information".
- **[V]** API v1.1 com Client ID + API key. As chaves têm data de expiração mostrada no Partner Center. Não cria produto nem altera metadados (https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api). O publicador suporta (`EDGE_PRODUCT_ID`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`).
- Conclusão: **custo zero, mesmo zip do Chrome** (verifiquei que é idêntico). Só soma trabalho de listagem e renovação de chave.

---

## 5. Automação no GitHub Actions

### 5.1 Scripts e Makefile

Os scripts abaixo foram testados no clone: `pnpm --filter @pilutech/botai run zip:all` deu exit 0 e gerou `botai-X-chrome.zip`, `-firefox.zip`, `-opera.zip` e `-sources.zip`.

```json
"zip": "wxt zip && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3",
"zip:firefox": "wxt zip -b firefox && node ../../scripts/check-tailwind-source.mjs .output/firefox-mv3",
"zip:opera": "wxt zip -b opera && node ../../scripts/check-tailwind-source.mjs .output/opera-mv3",
"zip:all": "pnpm run zip && pnpm run zip:firefox && pnpm run zip:opera"
```

- **[V]** O `wxt submit` funciona sem dependência nova: o WXT traz o binário `wxt-publish-extension` (`createAliasedCommand` em `cli/cli-utils.mjs`). Rodei `wxt submit --help` → `publish-extension/6.1.1`. As versões batem com `npm view`: wxt 0.21.4 é a latest, publish-browser-extension 6.1.1 também, web-ext está em 10.7.0. O publicador suporta 4 lojas: chrome, firefox, edge e opera.
- **[V]** `--dry-run` (ou `DRY_RUN=true`) "Check authentication, but don't upload". Ou seja, **ele precisa das credenciais**. Sem elas dá `Invalid config: chrome.extensionId… publisherId… serviceAccountClientEmail… serviceAccountPrivateKey` (testado).
- **[V] Defeito no `wxt submit init`:** o `publish-browser-extension@6.1.1` usa `RegExp.escape` ao gravar o `.env.submit`, e no Node 22.22.3 (o do repo) `typeof RegExp.escape` é `undefined`; no Node 24.12.0 é `function`. Então o `init` quebra no Node 22, embora o `engines` declare `>=22.0.0`. O `submit` não passa por esse código. Saída: rodar o `init` com Node 24 ou cadastrar os secrets à mão.
- **[V] `.env.submit` não está no `.gitignore`** (`git check-ignore` → exit 1), e o CLI lê esse arquivo sozinho (`dist/cli.mjs`, linha 41). É preciso acrescentar `.env.submit` ao `.gitignore`.
- Sugestão de Makefile:
  - `zip-botai: pnpm --filter @pilutech/botai zip:all`
  - `release-botai NIVEL=patch|minor|major: cd apps/botai && pnpm version $(NIVEL) --tag-version-prefix botai-v --message "chore(botai): versão %s" && git push --follow-tags`

### 5.2 Versão e changelog

- **[V]** A versão do manifest vem do `apps/botai/package.json`. Se a versão tiver sufixo (`1.0.0-beta.1`), o WXT põe `version: 1.0.0` e, só fora do Firefox, `version_name` (`simplifyVersion` em `manifest.mjs`). **[S]** Como as lojas exigem que `version` sempre suba, versão com sufixo só serve para builds internos.
- **[V]** O pnpm 11.1.1 tem `pnpm version … --tag-version-prefix`. Testei no clone `pnpm version patch --tag-version-prefix botai-v --message "chore(botai): versão %s"`: criou o commit `chore(botai): versão 0.2.1` e a tag **anotada** `botai-v0.2.1` (`git cat-file -t` → `tag`). Por ser anotada, `git push --follow-tags` a envia. Esse caminho roda o husky. O `pnpm version` exige working tree limpo; `--no-git-checks` dispensa isso.
- O changelog sai dos commits convencionais: `git log` desde a tag `botai-v*` anterior, filtrado por `apps/botai`, `packages/tools` e `packages/ui`. Vira as notas do GitHub Release. Hoje o repo não tem nenhuma tag nem release.

### 5.3 Workflow `botai-release.yml`

Rascunho completo em `scratchpad/multinav/rascunhos/.github/workflows/botai-release.yml`. **[V] `actionlint` 1.7.12 (imagem Docker `rhysd/actionlint`, que inclui shellcheck) passou sem achados.** Segue o padrão dos workflows do repo: `checkout@v4`, `pnpm/action-setup@v4`, Node 22, `--frozen-lockfile`.

- **Gatilhos:** `push` de tags `botai-v*` e `workflow_dispatch` com o input `lojas: nenhuma | dry-run | submeter`.
- **Job `empacotar`:**
  1. confere que a tag é igual a `botai-v<versão do package.json>`;
  2. roda `lint` e `test`;
  3. roda `zip:all`, que inclui os gates do `@source`;
  4. roda `pnpm dlx web-ext@10.7.0 lint` (testado com pnpm 11: exit 0);
  5. **reproduz o sources.zip no próprio CI** e roda `cmp` contra o zip enviado, o mesmo teste do revisor da AMO;
  6. gera as notas;
  7. copia os zips para `botai-zips/` e sobe como artifact.
  - **[V]** O passo 7 existe porque o `upload-artifact` ignora arquivo oculto, e a regra conta "files within folders beginning with `.`". Logo `.output/*.zip` sumiria (https://github.com/actions/upload-artifact).
- **Job `github-release`** (só em tag, `permissions: contents: write`): `gh release create "$GITHUB_REF_NAME" botai-zips/*.zip --notes-file … --latest=false`. O `--latest=false` existe porque é monorepo.
- **Job `lojas`** (`environment: lojas-botai`): `pnpm exec wxt submit` com `CHROME_API_VERSION: v2`. Cada loja só entra se o secret dela existir; sem nenhum, sai com `::notice::`. É o mesmo padrão "fica pulado até cadastrar" do `deploy-financas.yml`. O Edge reusa o zip do Chrome. A Opera fica fora.
  - **[V]** Environment com required reviewers e secrets de environment funcionam no plano Free para repo público, com até 6 revisores ("required reviewers are only available for public repositories" no Free) (https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments). Hoje o repo tem 0 secrets de repositório e os environments `Preview` e `Production`.
- **[S] Sugestão para o `ci.yml`:** no job `botai`, trocar ou complementar o `build` por `zip:all` (ou um `wxt build -b firefox` com o gate), para que PR que quebre o Firefox falhe antes da release.

### 5.4 Screenshots via Playwright

- **[S]** Rascunho em `rascunhos/apps/botai/capturas.loja.ts` + `playwright.loja.config.ts` (`testMatch: **/*.loja.ts`, fora da suíte E2E). Ele:
  - serve `cadastro.pagina.html` em 1280×800;
  - preenche por mensagem;
  - fotografa a página com o aviso;
  - fotografa o popup em 380×600 e o encaixa num quadro de 1280×800.
- **Não validei aqui:** neste sandbox até o `popup.e2e.ts` existente trava em `sw.evaluate`, então é o ambiente e não o script. Para a Opera faltaria uma variante de 612×408. O promo tile de 440×280 também pode sair de um template HTML.

---

## 6. Quem faz o quê

### Só o dono pode fazer (contas, pagamento, credenciais)

1. **Chrome Web Store:**
   - criar a conta (de preferência com um e-mail dedicado da PiluTech, porque não muda depois), pagar a taxa, verificar o e-mail;
   - declarar Trader ou Non-Trader;
   - em "Add new item", subir `botai-X-chrome.zip`;
   - preencher Store listing (pt-BR, Developer Tools, ícone, ≥1 screenshot, promo 440×280), Privacy (textos abaixo + URL da política) e Distribution (visibilidade e regiões);
   - enviar a primeira versão.
   - Para a automação: projeto GCP → habilitar a "Chrome Web Store API" → criar a service account e uma chave JSON → adicionar o e-mail dela no painel (Account) → anotar o Publisher ID e o Extension ID.
2. **AMO:**
   - conta Mozilla com 2FA; aceitar o acordo;
   - "Submit a New Add-on", canal listed;
   - subir `botai-X-firefox.zip` e `botai-X-sources.zip`, indicando o `SOURCE-CODE-REVIEW.md` nas notas para o revisor;
   - escolher a licença, a categoria Web Development e a compatibilidade (só Firefox desktop);
   - gerar as chaves JWT em `/developers/addon/api/key/`.
3. **Opera:** se for publicar, conta + upload manual + link do sources.zip do Release + screenshot de 612×408.
4. **Edge** (se quiser): conta no Partner Center (grátis) → Create new extension com o zip do Chrome → descrição de 250+ caracteres → logo 300×300 → Privacy → Publish API → Create API credentials.
5. **GitHub:** criar o environment `lojas-botai` com o próprio dono como reviewer (**sem** "prevent self-review", porque ele é o único mantenedor). Cadastrar:
   - **secrets:** `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY` (com `jq -r .private_key … | gh secret set … --env lojas-botai`), `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`, `EDGE_CLIENT_ID`, `EDGE_API_KEY`;
   - **variables:** `BOTAI_CHROME_EXTENSION_ID`, `CHROME_PUBLISHER_ID`, `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL`, `BOTAI_EDGE_PRODUCT_ID`.
   - Depois, rodar o workflow com `lojas: dry-run`.
6. Publicar a página da política de privacidade numa URL estável.

### O que dá para deixar pronto no repo

- `wxt.config.ts`, `styles.css` e `package.json` conforme `rascunhos/mudancas-botai.diff`. As três mudanças passaram em lint, testes e prettier e foram reproduzidas byte a byte.
- `.github/workflows/botai-release.yml` (rascunho validado pelo actionlint) e o passo de build Firefox no `ci.yml`.
- `.env.submit` no `.gitignore`; alvos `zip-botai` e `release-botai` no Makefile.
- `apps/botai/SOURCE-CODE-REVIEW.md` (vai junto no sources.zip).
- Política de privacidade pt-BR/en (`rascunhos/PRIVACIDADE.md`) e textos de listagem (`rascunhos/listagem.md`): resumo, descrições pt-BR/en, single purpose e as justificativas abaixo.
  - **activeTab:** "Acesso temporário só à aba em que o usuário aciona o Botaí (ícone, atalho ou menu de contexto), para ler os campos do formulário e escrever os dados de teste. Sem acesso a outras abas nem em segundo plano."
  - **scripting:** "Injetar, sob demanda e só na aba liberada pelo activeTab, o script que identifica os campos e os preenche."
  - **contextMenus:** "Itens 'Preencher esta página' e 'Inserir › CPF/E-mail/CEP…' no botão direito."
  - **storage:** "Guardar no próprio navegador (storage.local) a pessoa de teste gerada… Nada é sincronizado nem enviado."
  - **Remote code:** não.
- O script de capturas (falta validar fora do sandbox) e um ícone 128 com margem para a loja.
- Atualizar `apps/botai/CLAUDE.md` (a linha "Fora: Firefox, `wxt zip`, Chrome Web Store" deixa de valer; entram uma seção de release e lojas e a armadilha dos testes no `@source`) e `apps/botai/README.md` (instalação pelas lojas).

---

## 7. Decisões que o dono precisa tomar

1. **ID do Firefox** (`gecko.id`), que é permanente depois de publicado. Proposta: `botai@pilutech.com.br`.
2. **Trader ou Non-Trader na CWS.** A PiluTech é ME, o que puxa para Trader, e aí os dados legais ficam públicos na UE. É uma questão legal/fiscal.
3. **Em quais lojas publicar:**
   - CWS + AMO: recomendado;
   - Edge: grátis, mesmo zip;
   - Opera: só manual, revisão incerta, e o usuário de Opera talvez já instale pela CWS.
4. **Onde fica a política de privacidade e a página da extensão.** O `pilutech.com.br` não está no ar; a alternativa é a página PiluLabs no `piluvitu.com.br` ou um `PRIVACY.md` no GitHub. Isso define a Homepage URL e a Privacy URL das quatro lojas.
5. **"Website content" na aba de dados da CWS.** A FAQ manda declarar mesmo o tratamento local. Declarar, explicando na política que nada sai do navegador, é o mais seguro [S].
6. **Idioma da listagem:** só pt-BR (sem trabalho extra; público brasileiro) ou pt-BR + en, que na CWS exige `_locales` + `__MSG_` no manifest.
7. **Licença do código.** O repo é público e sem LICENSE; a AMO pede uma licença na primeira versão listed. Opções: uma licença aberta (MIT, por exemplo) ou "All Rights Reserved".
8. **Visibilidade inicial na CWS:** Public direto ou Unlisted/Private (trusted testers) primeiro. E se a primeira publicação é imediata ou adiada (`STAGED_PUBLISH`).
9. **Política de versão:** de que número sai a primeira versão pública (0.1.0 → 1.0.0?), como se bumpa (PR com `--no-git-tag-version` e depois tag na main, ou `make release-botai` direto na main) e se existe um `CHANGELOG.md` versionado ou só as notas do Release.
10. **Credencial do Chrome:** chave JSON da service account guardada como secret (é o que o `wxt submit` suporta) ou Workload Identity Federation sem chave, o que obriga a trocar o `wxt submit` por chamadas próprias à API v2 [S].
11. **Compatibilidade com Firefox Android:** manter só desktop (`FIREFOX_COMPATIBILITY=firefox`) ou testar o Android, que não tem `contextMenus` nem `commands` [S].
12. **Idioma do `SOURCE-CODE-REVIEW.md`:** em inglês, para o revisor, fugindo da convenção pt-BR do repo.

---

### Arquivos (tudo no scratchpad; nada no repo)

- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/rascunhos/mudancas-botai.diff`
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/rascunhos/apps/botai/wxt.config.ts`
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/rascunhos/apps/botai/SOURCE-CODE-REVIEW.md`
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/rascunhos/apps/botai/capturas.loja.ts`
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/rascunhos/apps/botai/playwright.loja.config.ts`
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/rascunhos/.github/workflows/botai-release.yml`
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/rascunhos/PRIVACIDADE.md`
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/rascunhos/listagem.md`
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/reproduzir.sh`
- Clone com as mudanças aplicadas e `node_modules` instalado: `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/clone`
