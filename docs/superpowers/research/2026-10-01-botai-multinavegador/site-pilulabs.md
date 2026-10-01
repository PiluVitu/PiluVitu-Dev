# Botaí no site: plano da página PiluLabs

Não alterei nenhum arquivo do repo e não rodei nenhum teste: o trabalho foi só leitura e pesquisa. Também não usei o scratchpad.

Cada afirmação traz uma marca:

- **[V]** quer dizer VERIFICADO, com a fonte (arquivo e linha, saída de comando ou documentação oficial consultada hoje).
- **[S]** quer dizer SUPOSTO.

---

## 0. Resumo

1. **Ainda não existe nada sobre PiluLabs no site.** Hoje a PiluTech só aparece em dois lugares [V]:
   - `apps/web/app/layout.tsx:73` tem `publisher: 'PiluTech'`;
   - o e-mail `pilutechinformatica@gmail.com` aparece em `components/profile-social-strip.tsx:7` e em `components/email-contact-dialog.tsx:73`.
2. **A política de privacidade precisa estar no ar antes do envio à Chrome Web Store.** A Chrome exige política sempre que a extensão "lida com dados do usuário", mesmo que o processamento seja só local. O Botaí lê o conteúdo de formulários da aba [V]. Por isso a primeira entrega do site é `/pilulabs/botai/privacidade`, e não a vitrine.
3. **O link "Powered by PiluTech" do popup aponta para um domínio que não abre.** `pilutech.com.br` tem NS na Cloudflare, mas nenhum registro A, e o `curl` respondeu `Could not resolve host` [V]. Um revisor da loja que clicar no crédito cai num domínio morto.
4. **Recomendo um modelo híbrido:**
   - uma collection Keystatic `produtos` só com os dados que mudam fora do código (status, links das lojas, versão);
   - uma rota estática por produto (`app/(site)/pilulabs/botai/page.tsx`) para o conteúdo rico;
   - a política de privacidade em TSX versionado no git.
5. **O "em breve" sai dos próprios dados.** O botão de cada loja só aparece quando a URL daquela loja está preenchida e é do domínio certo. O status "Disponível" vem do fato de existir ao menos uma loja publicada. Isso segue a regra da Chrome de que o badge só pode aparecer enquanto o item está na loja [V].
6. **O SEO do site tem lacunas hoje:**
   - `sitemap.xml` e `robots.txt` dão 404 em produção [V];
   - toda subpágina herda o `og:title` e o `og:url` da home, o que se vê em produção em `/tools` [V].
     As páginas novas precisam declarar `openGraph` e também ter arquivos `opengraph-image`/`twitter-image` no próprio segmento. Na seção 5 explico por quê, com base no código do Next 16.2.1 instalado.

---

## 1. O que existe hoje em `apps/web` [V: leitura do código]

| Tema                  | Estado atual                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rotas públicas        | `app/(site)/`: `/`, `/feed`, `/posts/[slug]`, `/tasks`, `/tools` + `/tools/<slug>` (9 páginas), `/votacao/*`. Admin em `app/(admin)/admin/*`. Não há `sitemap.ts` nem `robots.ts`.                                                                                                                                                                                                                                              |
| Layout                | O raiz (`app/layout.tsx`) usa `lang="pt-BR"`, `metadataBase` vindo de `getCanonicalSiteUrl()`, template de título `'%s \| Paulo Victor Torres Silva'` e `openGraph` com `locale: 'pt_BR'`. `app/(site)/layout.tsx` monta ThemeProvider (escuro por padrão), React Query, Toaster e Vercel Analytics.                                                                                                                            |
| i18n                  | Só pt-BR, sem infraestrutura de idiomas.                                                                                                                                                                                                                                                                                                                                                                                        |
| Padrão das subpáginas | `PageTopBar` (← voltar + "Tema"), h1, subtítulo, a linha de terminal `$ ~/tools▌`, `SectionHeader` (rótulo mono + contador + régua) e grid de cards (`ToolCard`). O post usa `~/blog/{slug}` em mono ciano.                                                                                                                                                                                                                     |
| Home                  | Bio fixa à esquerda e, à direita, as seções Carreira, Projetos (`ProjectCard`, hoje só "Live PRs") e Artigos. O `HomeFooter` traz `piluvitu.com.br · /tools · /tasks` (e `/votação`/`admin` conforme o login).                                                                                                                                                                                                                  |
| Conteúdo              | Keystatic 0.5.48 só como leitor (`lib/keystatic-reader.ts` → `lib/site-content.ts`), lendo YAML em `content/{site,socials,carreiras,projects,feeds}`. O editor fica no `/admin`, que lê o GitHub e commita na `main` usando `lib/admin/content-registry.ts` + Zod (`content-schemas.ts`, com `.default()` porque o Keystatic omite campos vazios). `next.config.mjs` já inclui `./content/**/*` no `outputFileTracingIncludes`. |
| Registro em código    | `lib/tools-registry.ts`: um array TS tipado, o padrão alternativo ao Keystatic.                                                                                                                                                                                                                                                                                                                                                 |
| Imagens               | `public/` (estático) e `public/media/` (biblioteca do admin, listada por `media-io.ts`).                                                                                                                                                                                                                                                                                                                                        |
| OG                    | `app/opengraph-image.tsx` e `twitter-image.tsx` reexportam `lib/og-visit-card-image.tsx` (`ImageResponse` 1200×630, lê arquivos de `public` com `readFile`).                                                                                                                                                                                                                                                                    |
| Testes                | Jest (jsdom, `*.test.ts(x)`), Storybook 10 (stories em `components/**` e `app/**`), Playwright (`*.e2e.ts` ao lado da rota, `webServer: pnpm dev` na 3333). Ainda não existe nenhum `page.test.tsx` nem `page.stories.tsx`: o padrão é testar componentes puros com stories e as páginas com E2E.                                                                                                                               |
| Repositório           | `PiluVitu/PiluVitu-Dev` é **público** (`gh api` → `"visibility":"public"`, homepage `https://piluvitu.com.br`). Dá para pôr o link "Código-fonte" na página e entregar o código não minificado à revisão da Opera.                                                                                                                                                                                                              |
| Domínios              | `piluvitu.com.br` responde 200 (Cloudflare na frente). `pilutech.com.br` não resolve.                                                                                                                                                                                                                                                                                                                                           |

**Uma observação de marca [V].** O componente `Marca` do Botaí (`apps/botai/src/components/marca.tsx`, três `rect` 7×7) é idêntico ao `VisitCardLogoOg` em `apps/web/lib/og-visit-card-image.tsx`, que é o logo do cartão de visita do autor. O ícone 128 px do Botaí é outro desenho: fundo ciano com uma barra e três quadrados.

---

## 2. Requisitos externos que moldam o site

### Chrome Web Store [V]

- **Política de privacidade.** É obrigatória quando a extensão "handles any user data", com link num campo próprio do painel ([privacy](https://developer.chrome.com/docs/webstore/program-policies/privacy)). O FAQ diz textualmente: _"Extensions are required to disclose how they handle user data, even when data is processed or stored locally on a user's device and is not transmitted to external servers or third parties."_ A definição de dados do usuário inclui _"Website content and resources, Form data"_ ([user-data-faq](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)). O Botaí lê os campos dos formulários, então precisa da política.
- **Imagens** ([images](https://developer.chrome.com/docs/webstore/images)):
  - ícone 128×128, com arte de 96×96 e 16 px de margem transparente;
  - de 1 a 5 capturas de 1280×800 ou 640x400, sem margem (sangradas);
  - bloco promocional pequeno 440×280, **obrigatório**;
  - marquee 1400×560, opcional.
- **Badge** ([branding](https://developer.chrome.com/docs/webstore/branding)): não pode ser modificado (só redimensionado) e precisa linkar para o item na loja, _"available in the store at all times that you use the badge"_.
- **Publicação adiada** ([publish](https://developer.chrome.com/docs/webstore/publish)): dá para desmarcar a publicação automática e publicar à mão em até 30 dias depois da aprovação. Isso serve para sincronizar o lançamento com o site.
- **Formato da URL**: `https://chromewebstore.google.com/detail/<nome>/<id>` (testado com `curl`: 200).

### Firefox (AMO) [V]

- A política define _"data transmission refers to any data that is collected, used, transferred, shared, or handled outside of the add-on or the local browser"_, então o processamento local não conta como transmissão ([policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)).
- A declaração no manifesto (`browser_specific_settings.gecko.data_collection_permissions`, com `"required": ["none"]` quando não há coleta) é obrigatória para extensões novas desde 3/11/2025 ([data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)). Esse ponto é do trabalho do Firefox, mas o texto da política do site tem de bater com ele.
- O listing pede o **texto** da política nos detalhes, _"even if you host a copy on your website"_. As capturas recomendadas são de 1280×800, ou outro tamanho na proporção 1,6:1 ([listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/)). Há badges "Get the add-on" de 172×60 e 129×45, além de SVG ([promoting](https://extensionworkshop.com/documentation/publish/promoting-your-extension/)).
- **Formato da URL**: `https://addons.mozilla.org/pt-BR/firefox/addon/<slug>/` (200).

### Opera add-ons [V]

- Capturas: _"612×408 pixels… preferable… maximum 800×600"_, ao menos duas. Isso não aproveita a mesma imagem de 1280×800 sem recompor.
- A página de suporte é opcional, mas se for informada _"must be relevant… If it is not, your extension may be rejected"_. A página `/pilulabs/botai` faz esse papel ([publishing-guidelines](https://help.opera.com/en/extensions/publishing-guidelines/)).
- Código minificado (o Vite minifica) exige um link para o código não minificado e instruções de build ([acceptance-criteria](https://help.opera.com/en/extensions/acceptance-criteria/)). O repo é público.
- O badge "Get it from Opera add-ons" existe em inglês, russo, alemão, ucraniano, francês e polonês, **sem pt-BR**, e não pode ser modificado ([branding](https://help.opera.com/en/extensions/branding-guidelines)).
- **Formato da URL**: `https://addons.opera.com/pt-br/extensions/details/<slug>/` (200).

### Google: dados estruturados [V]

- Para o rich result de `SoftwareApplication` são obrigatórios `name`, `offers.price` **e** `aggregateRating` ou `review`. As categorias aceitas incluem `DeveloperApplication` e `BrowserApplication`. App gratuito leva `price: 0` ([software-app](https://developers.google.com/search/docs/appearance/structured-data/software-app)).
- _"Don't aggregate reviews or ratings from other websites."_ ([review-snippet](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)). Logo, copiar as notas das lojas é proibido e **o Botaí não vai ganhar estrelas no Google**. O JSON-LD continua útil para semântica, breadcrumb e motores de IA.

### `homepage_url` [V]

O Chrome, a Opera e o Firefox usam `homepage_url` (o Firefox prefere `developer.url`, se existir) ([MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/homepage_url)). O tipo `homepage_url?: string` existe em `@wxt-dev/browser/src/gen/index.d.ts:9792` (WXT 0.21.4 instalado). Sugestão: `homepage_url: 'https://piluvitu.com.br/pilulabs/botai'` no `wxt.config.ts`.

---

## 3. Arquitetura proposta

### 3.1 Rotas

| Rota                          | Arquivo                                                                            | O que é                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `/pilulabs`                   | `app/(site)/pilulabs/page.tsx` (+ `layout.tsx` com `<main>`, como em `/tools`)     | Vitrine de produtos e apps PiluTech                                 |
| `/pilulabs/botai`             | `app/(site)/pilulabs/botai/page.tsx` + `opengraph-image.tsx` + `twitter-image.tsx` | Página do produto. Serve também de suporte e homepage para as lojas |
| `/pilulabs/botai/privacidade` | `app/(site)/pilulabs/botai/privacidade/page.tsx`                                   | Política de privacidade (a URL que vai para as três lojas)          |
| `/sitemap.xml`, `/robots.txt` | `app/sitemap.ts`, `app/robots.ts`                                                  | Novos, para o site inteiro                                          |

A rota é estática por produto, sem `[slug]` genérico. Os motivos estão na tabela da seção 3.2.

### 3.2 Modelo de conteúdo: collection Keystatic ou páginas estáticas

| Opção                                                             | Prós                                                                                                                                                                                                                                                                       | Contras                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Collection `produtos` com tudo, renderizada por `[slug]`**   | Reaproveitável; o próximo produto não exige código                                                                                                                                                                                                                         | Texto rico (recursos, como usar, FAQ, capturas com `alt`) pediria `fields.mdx`/`document`, e o CRUD do admin só sabe escrever campos planos e arrays de string (o MDX só existe para posts, no repo do blog). Toda página de produto ficaria igual. |
| **B. Registry TS (`lib/pilulabs-registry.ts`), como em `/tools`** | Tipado, sem dependência do CMS, testável                                                                                                                                                                                                                                   | Para trocar o status ou publicar o link da loja quando a aprovação chega por e-mail, seria preciso um commit de código                                                                                                                              |
| **C. Híbrido (recomendado)**                                      | A collection `produtos` guarda só o catálogo, o status e as lojas, que mudam fora do código e cabem no CRUD do `/admin` (commit + redeploy, o fluxo atual). A página e a política ficam em TSX versionado, com o layout livre por produto e o texto legal revisado por PR. | São duas fontes, então é preciso uma trava (teste) de que cada produto listado tem rota.                                                                                                                                                            |

**Esboço da collection** (em `keystatic.config.ts`, plana, compatível com o `serializeEntry` do admin) [S: não compilado]:

```ts
produtos: collection({
  label: 'Produtos (PiluLabs)',
  slugField: 'produtoSlug',
  path: 'content/produtos/*/',
  schema: {
    produtoSlug: fields.slug({ name: { label: 'Slug técnico (sem acento)' } }),
    order: fields.integer({ label: 'Ordem (menor primeiro)' }),
    nome: fields.text({ label: 'Nome de exibição (com acento)' }),
    tipo: fields.select({ label: 'Tipo', defaultValue: 'extensao', options: [
      { label: 'Extensão de navegador', value: 'extensao' },
      { label: 'App web', value: 'web' },
      { label: 'CLI', value: 'cli' },
    ] }),
    listado: fields.checkbox({ label: 'Aparece em /pilulabs e no sitemap', defaultValue: false }),
    resumo: fields.text({ label: 'Descrição curta oficial' }),
    icone: fields.text({ label: 'Ícone (path em public/)' }),
    tags: fields.array(fields.text({ label: 'Tag' }), { label: 'Tags' }),
    versao: fields.text({ label: 'Versão publicada' }),
    chromeUrl: fields.text({ label: 'Chrome Web Store (vazio = não publicado)' }),
    firefoxUrl: fields.text({ label: 'Firefox Add-ons (vazio = não publicado)' }),
    operaUrl: fields.text({ label: 'Opera add-ons (vazio = não publicado)' }),
    repoLink: fields.text({ label: 'Código-fonte' }),
  },
}),
```

```yaml
# content/produtos/botai/index.yaml
produtoSlug: botai
order: 0
nome: Botaí
tipo: extensao
listado: true
resumo: Gerador de dados fake para formulários (CPF, CNPJ, CEP)
icone: /pilulabs/botai/icone-128.png
tags: [Extensão, Formulários, QA, CPF, CEP]
versao: 0.1.0
repoLink: https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai
```

Para editar pelo `/admin` faltam [V: comparando com `projects`]:

- uma entrada em `COLLECTIONS` (`content-registry.ts`) e na união `CollectionKey`;
- `produtoSchema` em `content-schemas.ts`, com campos opcionais em `.default('')` e um `refine` de host por loja;
- `components/admin/content/produto-{form,list}.tsx` com stories;
- `app/(admin)/admin/produtos/page.tsx` com E2E;
- um item na `admin-sidebar.tsx`.

Pode ser uma segunda fatia: na primeira, a URL da loja é editada no YAML por PR.

### 3.3 Estado "em breve": derivado dos dados, sem flag manual

Lógica pura em `lib/pilulabs.ts`, testada no Jest [S: esboço]:

```ts
export type Loja = 'chrome' | 'firefox' | 'opera'
const HOST: Record<Loja, string> = {
  chrome: 'chromewebstore.google.com',
  firefox: 'addons.mozilla.org',
  opera: 'addons.opera.com',
}
type ComLojas = Record<`${Loja}Url`, string>

export function lojasPublicadas(p: ComLojas): { loja: Loja; url: string }[] {
  return (Object.keys(HOST) as Loja[]).flatMap((loja) => {
    const url = p[`${loja}Url`].trim()
    if (!url) return []
    try {
      return new URL(url).hostname === HOST[loja] ? [{ loja, url }] : []
    } catch {
      return []
    }
  })
}

export const fase = (p: ComLojas) =>
  lojasPublicadas(p).length > 0 ? 'disponivel' : 'em-breve'
```

- **Visibilidade.**
  - `listado: false`: o produto não aparece em `/pilulabs` nem no sitemap, mas a página continua acessível por link direto e leva `robots: { index: false }`. É assim que a privacidade e a página de suporte ficam no ar para os revisores sem anunciar o produto.
  - `listado: true` sem nenhuma loja: o cartão mostra a pílula "● Em breve".
  - Com uma ou mais lojas: a pílula vira "● Disponível" e aparecem só os botões das lojas publicadas (as aprovações chegam em datas diferentes).
- **Sequência de lançamento.**
  1. Deploy da privacidade e da página com `listado: false`.
  2. Envio às três lojas com a URL da privacidade e da página.
  3. Na Chrome, publicação adiada.
  4. Aprovadas as lojas: publicar, preencher as URLs e marcar `listado: true` (um commit pelo admin dispara o redeploy).
- **Sem loja ainda**, o botão alternativo pode ser "Instalar a partir do código" (README; o repo é público) [S: depende de decisão].

### 3.4 Política de privacidade: fatos tirados do código [V]

| Fato                                                                                                                                                | Fonte                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Permissões `activeTab`, `scripting`, `contextMenus`, `storage`; sem `host_permissions` em produção                                                  | `apps/botai/wxt.config.ts` e `manifesto.e2e.ts`                                                       |
| Guarda só a pessoa **fictícia** em `chrome.storage.local`, chave `botai_pessoa`; nada em `sync:`                                                    | `src/lib/armazenamento.ts`; CLAUDE.md do app                                                          |
| Nenhuma chamada de rede: não há `fetch`/XHR/WebSocket/sendBeacon em `apps/botai/src`                                                                | `grep` (o único `fetch` em `packages/tools` é `qr-encode.ts`, de um `data:` URL, que o Botaí não usa) |
| Lê os campos de formulário (atributos, rótulos e valor atual) da aba ativa só depois de um gesto (atalho, popup ou menu) e escreve neles localmente | CLAUDE.md, "Fluxos" e "Escrita no DOM"                                                                |
| Abre abas: `https://tuamaeaquelaursa.com/<usuario>` (caixa **pública** de terceiro), `https://pilutech.com.br`, `chrome://extensions/shortcuts`     | `src/entrypoints/popup/App.tsx:26-27`, `background/ouvintes.ts:37`, `packages/tools/src/nome.ts:144`  |
| Sem analytics, sem anúncios, sem código remoto                                                                                                      | `grep` + manifesto                                                                                    |

Seções propostas, em pt-BR:

1. Quem é o responsável e como falar com ele.
2. O que a extensão acessa e quando.
3. O que fica guardado.
4. O que é enviado: nada.
5. Terceiros (a caixa pública; os dados gerados podem coincidir com pessoas reais).
6. Permissões e o porquê de cada uma (tabela).
7. Como apagar: desinstalar remove o `storage.local` [S: comportamento padrão dos navegadores]; "Nova pessoa" só substitui.
8. Mudanças, com data de "última atualização".

O mesmo texto vai colado no campo de privacidade do AMO. No painel da Chrome, a aba "Privacy practices" precisa declarar a categoria "Website content" (processamento local) de forma coerente com a página [S: é interpretação do FAQ, a equipe de publicação deve confirmar].

---

## 4. Reaproveitamento

**Componentes [V: existem]:**

- **`@piluvitu/ui`**: `card`, `badge`, `button` (`asChild` + `Link`, sempre com `gap-2` quando tem ícone), `aspect-ratio` (capturas 16:10), `dialog` (ampliar captura), `separator`, `avatar`. O pacote ainda tem `sheet`, `chart` e `ajuda`, que não são necessários aqui.
- **`apps/web`**:
  - `PageTopBar` (`backHref="/pilulabs"`) e `SectionHeader`;
  - `ToolCard`, como molde para um `ProdutoCard`;
  - o padrão da pílula de `components/votacao/session-status-badge.tsx` ("● Aberta" ciano), como molde para "● Em breve / ● Disponível";
  - `HomeFooter`, ganhando o link `/pilulabs`;
  - `og-visit-card-image.tsx`, como molde do OG (lê PNG de `public` com `readFile`).
- **Ícones Font Awesome 7.2.0** [V: `node -e`]: `faChrome`, `faFirefoxBrowser`, `faOpera`, `faGithub`, `faKeyboard`, `faShieldHalved`, `faPuzzlePiece`, `faFlask` (para o PiluLabs), `faArrowUpRightFromSquare`. Servem para botões próprios do DS caso o dono não queira os badges oficiais.
- **Não importar nada de `apps/botai` dentro de `apps/web`.** Os PNGs (ícone e capturas) são copiados para `apps/web/public/pilulabs/botai/`, fora de `public/media` para não poluir a biblioteca do admin. O Vercel publica a partir de `apps/web` e o `next/image` local só enxerga `public/`.

### Capturas pelo Playwright do Botaí

Há duas fontes, porque o popup de verdade do navegador não pode ser capturado pelo Playwright. Por isso o fixture abre `popup.html` como aba.

1. **Popup isolado, com dados fixos.** O `storybook-static` do Botaí já tem as stories de todos os estados, por exemplo `popup-1b-·-pessoa-pronta--escuro`/`--claro`, `popup-1c-·-resultado--escuro`, `popup-1e-·-página-proibida--escuro` e `página-1f-·-aviso--com-nao-reconhecidos` [V: `storybook-static/index.json`]. As stories recebem `atalho` por prop, o que deixa escolher `Ctrl+Shift+Y` independentemente do sistema onde a captura roda. Basta um script Playwright que abra `iframe.html?id=<id>&viewMode=story` com `deviceScaleFactor: 2` e capture o `#storybook-root`. É o que vai bem no site.
2. **Extensão real, para a imagem de 1280×800 das lojas.** Reaproveita o `src/test/extensao.fixture.ts`: `servir`, `idDaAba`, `abrirPopup(…, '?aba=<tabId>')`. A costura `?aba=` só existe no build `--mode e2e` [V: CLAUDE.md do Botaí]. A pessoa fica fixa gravando `PESSOA_DOURADA` no storage. A chave de metadado do WXT é `botai_pessoa$`, e com `version: 1` nem é preciso gravá-la [V: `@wxt-dev/storage/dist/index.mjs:63,289`].

Esboço [S: não executado]. Ele fica fora do `testMatch` `**/*.e2e.ts` e fora do `include` do Vitest (`src/**/*.test.{ts,tsx}`) [V]. Fica com uma configuração própria (`playwright.capturas.config.ts`, `testMatch: ['**/*.captura.ts']`), um script `capturas` (`pnpm run build:e2e && playwright test -c playwright.capturas.config.ts`) e um alvo `make capturas-botai`:

```ts
// apps/botai/src/capturas/loja.captura.ts
test('1280×800: página preenchida + popup 1c', async ({
  context,
  sw,
  extensionId,
}) => {
  await sw.evaluate(
    (p) => chrome.storage.local.set({ botai_pessoa: p }),
    PESSOA_DOURADA,
  )
  await servir(context, { '/cadastro': { corpo: VITRINE } }) // página-vitrine estilizada
  const aba = await context.newPage()
  await aba.setViewportSize({ width: 1280, height: 800 })
  await aba.goto(`${ORIGEM}/cadastro`)
  const popup = await abrirPopup(
    context,
    extensionId,
    `?aba=${await idDaAba(sw, `${ORIGEM}/cadastro`)}`,
  )
  await popup.setViewportSize({ width: 380, height: 600 })
  await popup.getByRole('button', { name: /Preencher esta página/ }).click()
  await aba.locator('botai-aviso .botai-titulo').waitFor()
  const [fundo, pop] = await Promise.all([aba.screenshot(), popup.screenshot()])
  const quadro = await context.newPage()
  await quadro.setViewportSize({ width: 1280, height: 800 })
  await quadro.setContent(`<body style="margin:0"><img src="data:image/png;base64,${fundo.toString('base64')}">
    <img src="data:image/png;base64,${pop.toString('base64')}" style="position:absolute;top:8px;right:16px;width:380px;border-radius:12px;box-shadow:0 12px 40px #0008">`)
  await quadro.screenshot({ path: 'loja/capturas/chrome-1280x800-01.png' })
})
```

Pendências do esboço:

- **Tema e escala:** o fixture atual ignora `test.use(...)`, porque monta o próprio `launchPersistentContext`. Para tema claro/escuro (`colorScheme`) e escala 2× (`deviceScaleFactor`), ele precisaria de um fixture de opção, por exemplo `aparencia`, repassado ao `launchPersistentContext` [S].
- **Página-vitrine:** `cadastro.pagina.html` não tem CSS (labels crus) [V]. Para material de divulgação, sugiro uma `vitrine.pagina.html` estilizada [S].
- **Tamanhos por loja:**
  - Chrome: 1280×800 (até 5) + 440×280 (obrigatória) + 1400×560 (opcional);
  - AMO: 1280×800;
  - Opera: 612×408 (proporção diferente, 1,5:1).
    O mesmo quadro HTML pode ser renderizado em cada tamanho. As peças promocionais saem de um template HTML com marca, nome e slogan.
- **Vídeo:** prefiro `<video autoplay muted loop playsinline>` em MP4/WebM a um GIF. O `recordVideo` do Playwright grava na escala 1×, então talvez seja melhor gravar a tela à mão [S].

---

## 5. SEO

**Armadilha confirmada no código do Next 16.2.1 [V].** Em `node_modules/next/dist/lib/metadata/resolve-metadata.js`:

- na mesclagem, `case 'openGraph'` substitui o objeto inteiro (linha ~182);
- as imagens de arquivo (`opengraph-image`) só entram no segmento onde o arquivo está, e só se a página não declarou `openGraph.images` (linhas 148-157).

Resultado: uma página **sem** `openGraph` herda título e URL da home, que é o que aparece hoje em produção em `/tools`: `og:title` = "Paulo Victor Torres Silva | SRE…" e `og:url` = `https://piluvitu.com.br` [V: `curl`]. Uma página **com** `openGraph` e sem arquivo no segmento perde a imagem. Portanto:

```ts
// app/(site)/pilulabs/botai/page.tsx
export const metadata: Metadata = {
  title: {
    absolute: 'Botaí: gerador de dados fake para formulários | PiluLabs',
  },
  description:
    'Extensão que bota dados fake e válidos (CPF, CNPJ, CEP real, cartão de teste) nos formulários da aba atual. Powered by PiluTech.',
  alternates: { canonical: '/pilulabs/botai' },
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'piluvitu.com.br',
    url: '/pilulabs/botai',
    title: 'Botaí',
    description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  },
  twitter: { card: 'summary_large_image', title: 'Botaí', description: '…' },
}
// + app/(site)/pilulabs/botai/opengraph-image.tsx (ImageResponse 1200×630: ícone, "Botaí", resumo, "PiluLabs · Powered by PiluTech")
// + twitter-image.tsx reexportando o mesmo módulo (padrão do app/twitter-image.tsx)
```

`/pilulabs` e `/privacidade` seguem a mesma regra: declarar `openGraph` (`locale` e `siteName` repetidos, porque a mesclagem é rasa) e ter imagem própria ou reaproveitada.

**JSON-LD.** O guia do Next manda usar um `<script>` nativo com `.replace(/</g, '\\u003c')` [V: `node_modules/next/dist/docs/01-app/02-guides/json-ld.md`]:

```ts
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: 'Botaí',
      description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      applicationCategory: 'DeveloperApplication',
      applicationSubCategory: 'Extensão de navegador',
      operatingSystem: 'Windows, macOS, Linux, ChromeOS',
      softwareRequirements: 'Google Chrome 123 ou superior',
      softwareVersion: produto.versao,
      inLanguage: 'pt-BR',
      url: `${site}/pilulabs/botai`,
      image: `${site}/pilulabs/botai/icone-128.png`,
      screenshot: [
        /* capturas */
      ],
      featureList: [
        'CPF, CNPJ, RG, PIS e título com dígito verificador',
        'CEP real com rua e cidade',
        'Cartão de teste da Stripe',
      ],
      offers: { '@type': 'Offer', price: 0, priceCurrency: 'BRL' },
      installUrl: lojasPublicadas(produto).map((l) => l.url),
      publisher: {
        '@type': 'Organization',
        name: 'PiluTech',
        url: 'https://pilutech.com.br',
      },
      author: {
        '@type': 'Person',
        name: 'Paulo Victor Torres Silva',
        url: site,
      },
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'PiluLabs',
          item: `${site}/pilulabs`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Botaí',
          item: `${site}/pilulabs/botai`,
        },
      ],
    },
  ],
}
```

As propriedades usadas existem em [schema.org/SoftwareApplication](https://schema.org/SoftwareApplication) [V]. Sem nota nem avaliação não há rich result de app, mas o breadcrumb continua valendo. O `softwareRequirements` precisa ser atualizado quando os builds do Firefox e da Opera fecharem as versões mínimas.

**Sitemap e robots** (`app/sitemap.ts`, `app/robots.ts`, file conventions do Next) [V: docs incluídos no pacote]:

- O sitemap lista `/`, `/tools`, `/tools/<slug>` (de `TOOLS`), `/posts/<slug>` (`getBlogPostSlugs()`), `/pilulabs` e os produtos com `listado: true` (página e privacidade).
- O robots usa `sitemap: ${base}/sitemap.xml` e `disallow: ['/admin', '/api', '/preview']`.
- Ressalva [V: glossário do Next]: `draftMode()` é uma API de request, e `lib/site-content.ts` a chama em `skipCacheWhenDraft()`. Usar `getProdutos()` no sitemap ou nas páginas deixa tudo dinâmico, como a home já é. É aceitável. Para manter o sitemap em cache, ele pode ler com `createReader(process.cwd(), keystaticConfig)` direto [S].

---

## 6. Wireframes (texto)

### `/pilulabs`

```
┌────────────────────────────────────────────────────────────────────┐
│ ← Paulo Victor                                          [ Tema ]   │ PageTopBar
│                                                                    │
│ PiluLabs                                                           │ h1
│ Produtos e apps que eu faço e mantenho. Powered by PiluTech ↗      │ (texto a aprovar)
│ $ ~/pilulabs▌                                                      │ linha de terminal
│                                                                    │
│ EXTENSÕES  01 ─────────────────────────────────────────────────    │ SectionHeader por tipo
│ ┌──────────────────────────────┐ ┌──────────────────────────────┐  │ grid 1/2/3 colunas
│ │ [ícone] Botaí   (● Em breve) │ │  (próximo produto PiluTech)  │  │ ProdutoCard = Link inteiro
│ │ Gerador de dados fake para   │ │                              │  │
│ │ formulários (CPF, CNPJ, CEP) │ │                              │  │
│ │ [Extensão] [Formulários] [QA]│ │                              │  │ tags mono
│ │  Chrome · Firefox · Opera   →│ │                              │  │ ícones FA das lojas
│ └──────────────────────────────┘ └──────────────────────────────┘  │
│                                                                    │
│ © 2026 Paulo Victor · piluvitu.com.br · /tools · /tasks · /pilulabs│ HomeFooter (+ link)
└────────────────────────────────────────────────────────────────────┘
```

### `/pilulabs/botai`

```
┌────────────────────────────────────────────────────────────────────┐
│ ← PiluLabs                                              [ Tema ]   │
│ ~/pilulabs/botai                                                   │ mono ciano
│ [ícone 64]  Botaí                          (● Em breve|Disponível) │ h1 + pílula
│             Gerador de dados fake para formulários (CPF, CNPJ, CEP)│
│             v0.1.0 · Chrome · Firefox · Opera · Powered by PiluTech↗│
│                                                                    │
│ em breve:   "Chegando nas lojas."  [Instalar a partir do código →] │ CTA por estado
│ disponível: [Chrome Web Store] [Firefox Add-ons] [Opera add-ons]   │ só as publicadas
│                                                                    │
│ ┌────────────────────────────────────────────────────────────────┐ │ AspectRatio 16:10
│ │   captura 1280×800: formulário preenchido + popup 1c + aviso   │ │ next/image, priority
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ DE ONDE VEM O NOME ────────────────────────────────────────────    │
│ "Bota aí", expressão piauiense: é o que ele faz, bota os dados...  │
│                                                                    │
│ O QUE ELE BOTA  05 ────────────────────────────────────────────    │ 5 cards
│ [Documentos] CPF, CNPJ, RG, PIS, título (DV certo)                 │
│ [Endereço]   CEP real com rua, bairro, cidade e UF                 │
│ [Contato]    nome, nascimento, celular, e-mail (caixa pública)     │
│ [Empresa]    razão social, fantasia, CNPJ                          │
│ [Cartão]     cartão de teste documentado da Stripe                 │
│                                                                    │
│ COMO USAR ─────────────────────────────────────────────────────    │
│ 1 Página inteira: [Ctrl+Shift+Y] / [⌥⇧P], ou ícone › Preencher     │ <kbd>; atalho por
│ 2 Um campo: botão direito › Botaí › Inserir › CPF                  │ navegador vem do
│ 3 Ver e copiar: o popup mostra a pessoa; "Nova pessoa" troca       │ conteúdo (a confirmar
│                                                                    │ no Firefox e na Opera)
│ CAPTURAS  04 ──────────────────────────────────────────────────    │ grid de popups
│ [1a primeiro uso] [1b pessoa pronta] [1c resultado] [1e proibida]  │ claro/escuro; clique
│                                                                    │ → Dialog ampliado
│ PRIVACIDADE ───────────────────────────────────────────────────    │
│ Nada sai do seu navegador: sem rede, sem analytics; só guarda a    │
│ pessoa fictícia. [Política de privacidade →]                       │
│                                                                    │
│ CUIDADOS ──────────────────────────────────────────────────────    │ texto do README
│ • A caixa de e-mail é pública • CPF/CNPJ podem existir de verdade  │
│ • Use só em localhost e staging                                    │
│                                                                    │
│ ┌ Feito por Paulo Victor · Powered by PiluTech ↗ · Código-fonte ↗ ┐│ card do autor
│ └ Suporte: e-mail                                                  ┘│ (padrão do post)
└────────────────────────────────────────────────────────────────────┘
```

### `/pilulabs/botai/privacidade`

```
← Botaí
~/pilulabs/botai/privacidade
Política de privacidade do Botaí
Última atualização: AAAA-MM-DD · vale para a versão 0.1.0
Resumo em 3 linhas: não coleta, não envia, só guarda a pessoa fictícia
1 Responsável e contato · 2 O que acessa e quando · 3 O que guarda · 4 O que envia (nada)
5 Terceiros (tuamaeaquelaursa.com, pilutech.com.br) · 6 Permissões (tabela) · 7 Como apagar · 8 Mudanças
(classe .post-prose para a tipografia)
```

---

## 7. Testes e documentação (regras do repo)

- **Jest:**
  - `lib/pilulabs.test.ts`, cobrindo `lojasPublicadas` (vazio, host errado, URL inválida, uma e três lojas), `fase` e o montador de JSON-LD (só lojas publicadas em `installUrl`, `<` escapado);
  - `content-schemas.test.ts`, cobrindo `produtoSchema` (padrões e `refine` de host);
  - um teste de trava que lê `content/produtos/*/index.yaml` e exige `app/(site)/pilulabs/<slug>/page.tsx` e `privacidade/page.tsx` para todo produto com `listado: true`.
- **Storybook:** `produto-card.stories.tsx` (EmBreve, Disponivel, UmaLoja, Claro), `lojas-botoes.stories.tsx`, `capturas-galeria.stories.tsx`, `status-produto.stories.tsx`.
- **Playwright:** `app/(site)/pilulabs/pilulabs.e2e.ts` cobrindo:
  - o cartão do Botaí com a pílula certa, sem link de loja enquanto o YAML não tiver URL;
  - a navegação até `/pilulabs/botai`;
  - um `script[type="application/ld+json"]` válido (`JSON.parse`);
  - `/privacidade` com h1 e o link a partir da página;
  - o link `/pilulabs` no rodapé (estender `home.e2e.ts`).
- **CLAUDE.md:**
  - `apps/web/CLAUDE.md`: seção "PiluLabs" com rotas, modelo híbrido, armadilha do OG e sitemap/robots, mais a nova collection em "Content structure";
  - `apps/botai/CLAUDE.md`: `homepage_url`, script de capturas, URL da política, e as linhas "Fora: … Chrome Web Store" e "Distribuição: só o dono" deixam de valer.
  - O README do Botaí ganha "Instalar pela loja" com os links.

**Ordem sugerida das fatias:**

1. Privacidade + `/pilulabs/botai` com `listado: false` + `homepage_url` + o redirecionamento de `pilutech.com.br`.
2. Capturas e assets.
3. `/pilulabs` + rodapé + sitemap/robots.
4. CRUD `produtos` no `/admin`.
5. Publicar as lojas e preencher as URLs.

---

## 8. O que ficou como SUPOSTO

- Os esboços de código (collection, `lib/pilulabs.ts`, metadata, JSON-LD, script de capturas) não foram compilados nem executados.
- O fixture precisa de uma opção para `colorScheme`/`deviceScaleFactor`, porque o atual ignora `test.use`.
- Desinstalar a extensão apaga o `storage.local` (comportamento padrão dos navegadores, não testado aqui).
- Quais categorias marcar na aba "Privacy practices" da Chrome é uma interpretação do FAQ.
- `pilutech.com.br` pode ser redirecionado por uma Single Redirect da Cloudflare (a doc confirma que é preciso tráfego proxiado no hostname, ou seja, criar um registro DNS proxiado).
- Os atalhos do Firefox e da Opera: no Firefox, `Ctrl+Shift+Y` provavelmente conflita com a janela de Downloads no Windows e no Linux. A página da Mozilla não carregou, então não confirmei. Isso depende das frentes do Firefox e da Opera, e a página deve ler o atalho por navegador a partir de dados.
- Um composto (página real + popup real) é aceito como captura nas lojas.

---

## 9. DECISÕES QUE O DONO PRECISA TOMAR

1. **Onde fica a página.** `piluvitu.com.br/pilulabs` agora (recomendado, com redirecionamento 308 quando o site da PiluTech existir) ou esperar `pilutech.com.br`.
2. **`pilutech.com.br` hoje não resolve.** Apontar o domínio (já na Cloudflare) para `piluvitu.com.br/pilulabs` até o site da PiluTech existir? Sem isso, o "Powered by PiluTech" do popup leva a um domínio morto durante a revisão das lojas.
3. **Antes da aprovação:** mostrar "Em breve" publicamente em `/pilulabs`, ou deixar a página só por link direto (`listado: false`, noindex) até a primeira loja aprovar.
4. **Modelo de conteúdo:** o híbrido recomendado (collection `produtos` + rota estática por produto) ou o registry TS (mais simples, mas trocar o link da loja exige commit de código). E o CRUD no `/admin`: entra já ou numa segunda fatia, editando o YAML por PR enquanto isso?
5. **Botões de loja:** badges oficiais (sem modificação; a Opera não tem pt-BR) ou botões próprios do DS com ícones FA.
6. **Privacidade:**
   - responsável nominal: pessoa física "Paulo Victor Torres Silva" ou a PiluTech (com razão social e CNPJ, se for a ME);
   - e-mail de contato (`pilutechinformatica@gmail.com`?);
   - só pt-BR ou também em inglês.
7. **Home:**
   - criar uma seção "PiluLabs" na home, só o link `/pilulabs` no rodapé, ou também na bio;
   - o "Live PRs" continua em "Projetos" ou vai para o PiluLabs;
   - o Botaí também aparece em "Projetos"?
8. **Capturas:**
   - tema (escuro, claro ou os dois);
   - atalho exibido (`Ctrl+Shift+Y` ou `⌥⇧P`);
   - criar uma página-vitrine estilizada para o fundo;
   - vídeo ou GIF na página;
   - gerar no Mac ou no CI Linux.
9. **Marca:** o SVG `Marca` do Botaí é idêntico ao logo do cartão de visita do site. Manter assim ou diferenciar os dois?
10. **"Instalar a partir do código"** (repo público) como CTA enquanto as lojas não aprovam: sim ou não?
11. **Versão e changelog:** mostrar `vX.Y.Z` e notas de versão na página? Se sim, quem atualiza o YAML a cada release?
12. **SEO do site inteiro:** criar `sitemap.ts`/`robots.ts` para todas as rotas (hoje 404) e o que bloquear (`/admin`, `/api`, `/preview`, `/votacao`?). E corrigir de quebra o `og:title`/`og:url` herdados da home em `/tools` e nas outras subpáginas?
13. **Rich result:** aceitar que o Google não vai mostrar estrelas para o Botaí, já que as regras proíbem copiar as notas das lojas para o JSON-LD.

---

### Fontes

- [Chrome: privacy policy](https://developer.chrome.com/docs/webstore/program-policies/privacy) · [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) · [Images](https://developer.chrome.com/docs/webstore/images) · [Branding](https://developer.chrome.com/docs/webstore/branding) · [Publish](https://developer.chrome.com/docs/webstore/publish)
- [AMO policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) · [Data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) · [Appealing listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/) · [Promoting](https://extensionworkshop.com/documentation/publish/promoting-your-extension/)
- [Opera publishing guidelines](https://help.opera.com/en/extensions/publishing-guidelines/) · [Acceptance criteria](https://help.opera.com/en/extensions/acceptance-criteria/) · [Opera badge](https://help.opera.com/en/extensions/branding-guidelines)
- [Google SoftwareApplication](https://developers.google.com/search/docs/appearance/structured-data/software-app) · [Review snippet](https://developers.google.com/search/docs/appearance/structured-data/review-snippet) · [schema.org/SoftwareApplication](https://schema.org/SoftwareApplication)
- [MDN homepage_url](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/homepage_url) · [Cloudflare Single Redirects](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-dashboard/)
- Next 16.2.1 local: `apps/web/node_modules/next/dist/docs/01-app/{02-guides/json-ld.md, 03-api-reference/03-file-conventions/01-metadata/{sitemap,robots,opengraph-image}.md, 03-api-reference/04-functions/generate-metadata.md, 04-glossary.md}` e `apps/web/node_modules/next/dist/lib/metadata/resolve-metadata.js`

### Arquivos relevantes

- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/app/layout.tsx`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/app/(site)/layout.tsx`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/app/(site)/tools/page.tsx`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/keystatic.config.ts`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/lib/site-content.ts`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/lib/admin/content-registry.ts`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/lib/admin/content-schemas.ts`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/lib/og-visit-card-image.tsx`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/components/home-footer.tsx`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/components/page-top-bar.tsx`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/components/section-header.tsx`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/web/components/votacao/session-status-badge.tsx`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/botai/wxt.config.ts`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/botai/src/test/extensao.fixture.ts`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/botai/src/test/pessoa-dourada.ts`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/botai/src/lib/armazenamento.ts`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/botai/src/entrypoints/popup/App.tsx`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/botai/src/components/marca.tsx`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/botai/storybook-static/index.json`
