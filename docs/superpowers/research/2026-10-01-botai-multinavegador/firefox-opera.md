# Botaí no Firefox e no Opera com o mesmo código (WXT 0.21.4): relatório

Não alterei nada no repositório. Todos os testes rodaram numa cópia em `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/`. O wrapper `rtk` falsificou a saída de `diff`: ele imprimiu "[ok] Files are identical" quando os arquivos eram diferentes. Por isso toda comparação abaixo foi refeita com `/usr/bin/diff`, conferindo o exit code.

## Resumo

- **Opera e Edge saem praticamente de graça.** O `wxt build -b opera` e o `-b edge` geram uma árvore **idêntica byte a byte** à do `chrome-mv3` (`/usr/bin/diff -r`, exit 0). A loja do Opera, porém, não aceita código próprio minificado.
- **O Firefox, sem adaptação, falha em silêncio.** Testei num Firefox 157 real. O "Preencher" devolve `ok: true` com **0 campos** e o aviso mostra "Nenhum campo nesta página". A causa é que `browser.dom` não existe no Firefox, e o Firefox entrega o erro dentro de `InjectionResult.error` em vez de rejeitar a Promise.
- **Com um adaptador de 4 linhas em `dom.ts`, o Firefox 157 preenche igual ao Chrome.** Resultado: "21 de 23 campos preenchidos", com `ref_code` e `select#origem` não reconhecidos. Também funcionam:
  - o "Mostrar na página" via `documentIds`;
  - a shadow root fechada;
  - o Inserir;
  - o aviso desenhado com `createShadowRootUi` (com screenshot).
- **O padrão do WXT 0.21.4 para Firefox é MV2.** É preciso `manifestVersion: 3` no config ou a flag `--mv3`.
- **Para a loja do Firefox (AMO), o build tem de ser reproduzível a partir das fontes.** Provei que um `git archive` dos caminhos certos reconstrói um `firefox-mv3` idêntico byte a byte. O zip de fontes padrão do WXT **não** serve neste monorepo.
- **Atalho:** no Firefox para Linux, `Ctrl+Shift+Y` é o atalho de Downloads e o Firefox não o cede. É preciso `linux: 'Alt+Shift+P'` só no manifesto do Firefox.

## Provado empiricamente

| Prova                                                               | Resultado                                                                                                                              |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `wxt build -b firefox` (padrão)                                     | gera `firefox-mv2` (`background.scripts`, `browser_action`)                                                                            |
| `wxt build -b firefox --mv3`                                        | gera `firefox-mv3`. Único arquivo diferente do Chrome: `manifest.json` (`background.scripts`)                                          |
| `wxt build -b opera` / `-b edge`                                    | idênticos ao `chrome-mv3` (`diff -r` exit 0)                                                                                           |
| Config ramificado (rascunho)                                        | o manifesto do Chrome continua idêntico ao build atual do repo (exit 0), então o `manifesto.e2e.ts` segue verde                        |
| `web-ext lint` (10.7.0) no build atual para Firefox MV3             | 1 erro (`ADDON_ID_REQUIRED`), exit 1                                                                                                   |
| `web-ext lint` com o config proposto (`strict_min_version 153.0`)   | 0 erros. Restam 6 avisos `UNSAFE_VAR_ASSIGNMENT`, todos no código do React DOM e do Font Awesome dentro de `chunks/popup-*.js`; exit 0 |
| Firefox 157 real (Puppeteer + WebDriver BiDi), código atual         | `resumo {x:0, y:0}` e `error: "TypeError: can't access property "openOrClosedShadowRoot", T.dom is undefined"`                         |
| Firefox 157, adaptador com `openOrClosedShadowRoot()` como método   | `"e.openOrClosedShadowRoot is not a function"`: no Firefox é **atributo**                                                              |
| Firefox 157, adaptador correto                                      | `x:21 y:23 k:2`; `documentId` presente; `mostrar` → `true`; raiz fechada 3/3; Inserir na raiz fechada ok                               |
| Fontes do popup no Firefox                                          | `document.fonts`: "Plus Jakarta Sans Variable" e "JetBrains Mono Variable" carregadas                                                  |
| Vitest (Chrome) com os adaptadores                                  | 37 arquivos, 310 testes passando                                                                                                       |
| Fontes via `git archive` → `pnpm install --frozen-lockfile` → build | `firefox-mv3` idêntico ao da árvore de trabalho (exit 0)                                                                               |
| Zip de fontes do WXT (`sourcesRoot: '../..'`)                       | **não** é idêntico: o CSS muda porque o WXT sempre exclui `*.test.*` das fontes                                                        |

## 1. WXT 0.21.4: alvos e ramificação

**VERIFICADO** (fonte em `apps/botai/node_modules/wxt/dist`):

- `core/resolve-config.mjs:49`: `manifestVersion ?? (browser === "firefox" || browser === "safari" ? 2 : 3)`. O Firefox cai em MV2 por padrão. A pasta de saída é `${browser}-mv${manifestVersion}${modeSuffix}`.
- `core/resolve-config.mjs:200`: o zip de fontes (`zipSources`) é ligado por padrão para `firefox` e `opera`.
- `core/utils/manifest.mjs`:
  - no Firefox MV3, o WXT gera `background: { scripts: [...] }` (event page) e não `service_worker`;
  - ele avisa quando faltam `data_collection_permissions` e `gecko.id`;
  - ele **não** remove `minimum_chrome_version` no build do Firefox (confirmado no manifesto gerado).
- O Opera não tem nenhum tratamento especial além do global `OPERA` e do zip de fontes.
- `core/utils/globals.mjs`: `import.meta.env.BROWSER/CHROME/FIREFOX/OPERA/EDGE/MANIFEST_VERSION` são `define` do Vite, ou seja, constantes de compilação. Conferi os bundles: o do Chrome só tem `$.dom.openOrClosedShadowRoot(e)` e o do Firefox só tem `e.openOrClosedShadowRoot`.
- A função `manifest` e a função `vite` recebem `{ browser, manifestVersion, mode, command }` (`ConfigEnv` em `types.d.mts`).
- `wxt submit` é um alias de `publish-browser-extension` (`cli/commands.mjs:77`), que já vem instalado (versão 6.1.1).

**VERIFICADO no Vitest:** no Vitest, `import.meta.env.FIREFOX`, `BROWSER` e `MANIFEST_VERSION` ficam `undefined`, inclusive com `WxtVitest({ browser: 'firefox' })`. Portanto o ramo do Chrome é o padrão nos testes. Para testar o ramo do Firefox, `vi.stubEnv('FIREFOX', true)` funciona (2 testes passaram).

Config proposto (rascunho testado, com `tsc` e `prettier` ok):

```ts
const ATALHO_CHROMIUM = { default: 'Ctrl+Shift+Y', mac: 'Alt+Shift+P' }
// Firefox no Linux (GNOME) usa Ctrl+Shift+Y para Downloads e não cede o atalho.
const ATALHO_FIREFOX = { ...ATALHO_CHROMIUM, linux: 'Alt+Shift+P' }

export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifestVersion: 3, // sem isto, -b firefox gera MV2
  targetBrowsers: ['chrome', 'firefox', 'opera', 'edge'],
  // ...
  manifest: ({ browser, mode }) => {
    const firefox = browser === 'firefox'
    return {
      name: 'Botaí',
      short_name: 'Botaí',
      description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      ...(firefox
        ? {
            browser_specific_settings: {
              gecko: {
                id: 'botai@pilutech.com.br',
                strict_min_version: '153.0',
                data_collection_permissions: { required: ['none'] },
              },
            },
          }
        : { minimum_chrome_version: '123' }),
      permissions: [
        'activeTab',
        'scripting',
        'contextMenus',
        'storage',
        ...(firefox ? ['menus'] : []),
      ], // 'menus' libera menus.getTargetElement no content script
      commands: {
        'botai-preencher': {
          suggested_key: firefox ? ATALHO_FIREFOX : ATALHO_CHROMIUM,
          description: 'Preencher esta página',
        },
      },
      ...(mode === 'e2e' && { host_permissions: ['http://teste.local/*'] }),
    }
  },
  vite: ({ browser }) => ({
    plugins: [react(), tailwindcss()],
    build: { minify: browser === 'opera' ? false : undefined }, // ver Opera
  }),
})
```

O rascunho em `.../multinav/repo/apps/botai/wxt.config.ts` também tem um bloco `zip.sourcesRoot`/`includeSources`. Ele corresponde à opção B da seção 4 e **não** é o recomendado.

## 2. Firefox MV3, API por API

| API / tema                                                                             | No Firefox                                                                                                                                                                                                                                   | O que fazer                                                                                            | Status                                                                                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| background                                                                             | O WXT gera `background.scripts` (event page)                                                                                                                                                                                                 | Nada a mudar. As mensagens foram respondidas no Firefox 157                                            | VERIFICADO (build e teste)                                                                                                           |
| `activeTab`                                                                            | Concedido por clique no botão da barra, item de menu de contexto e atalho (Firefox 63+). Vale para o topo da aba e frames da mesma origem, e cai quando a aba navega                                                                         | Igual ao Chrome                                                                                        | VERIFICADO (MDN, página de permissions)                                                                                              |
| host permissions                                                                       | Produção não tem. No teste, uma extensão instalada por BiDi com `host_permissions` para `127.0.0.1` injetou script sem gesto                                                                                                                 | No E2E, usar uma origem resolvível ou interceptação de rede                                            | VERIFICADO (teste)                                                                                                                   |
| `executeScript` com `files`, `func`+`args`, `allFrames`, `frameIds`                    | Firefox 102+                                                                                                                                                                                                                                 | ok                                                                                                     | VERIFICADO (BCD 8.1.4 e teste)                                                                                                       |
| `documentIds` / `InjectionResult.documentId`                                           | **Firefox 153+**                                                                                                                                                                                                                             | Com mínimo 153 não precisa de adaptador. `mostrar` funcionou no 157                                    | VERIFICADO (BCD, notas do 153, teste)                                                                                                |
| Erro dentro da `func`                                                                  | Vira `InjectionResult.error` (só existe no Firefox) e a Promise **resolve**                                                                                                                                                                  | Tratar `error` em `preencherPagina`/`inserirNoCampo`. Hoje vira "Nenhum campo" em silêncio             | VERIFICADO (teste)                                                                                                                   |
| Recusa de página                                                                       | Mensagem `Missing host permission for the tab` (ou `... or frames`). O Firefox usa a mesma mensagem quando o alvo navegou                                                                                                                    | Acrescentar `/^Missing host permission for the tab/` em `erroEhPaginaProibida`                         | VERIFICADO (`ext-tabs-base.js:849` e teste com `about:blank`)                                                                        |
| `contextMenus` / `menus`                                                               | Os dois namespaces existem, cada um com sua permissão. Nenhuma das duas mostra aviso na instalação (`PermissionNoPrompt`)                                                                                                                    | Acrescentar `'menus'` só no Firefox                                                                    | VERIFICADO (`schemas/menus.json`, teste)                                                                                             |
| contextos `page`/`editable`                                                            | Funcionam, **mas `editable` não inclui campo de senha**                                                                                                                                                                                      | No Firefox, somar `'password'` aos contextos. O Chrome rejeitaria `'password'`, então tem de ramificar | VERIFICADO (nota do BCD, `contextsMap` em `ext-menus.js`)                                                                            |
| Agrupar sob "Botaí ›"                                                                  | Com mais de um item no topo, o Firefox agrupa sob o `name` da extensão                                                                                                                                                                       | Igual ao Chrome                                                                                        | VERIFICADO (`ext-menus.js`, `buildTopLevelElements(root, …, 1)`)                                                                     |
| Títulos dinâmicos (`update`)                                                           | Funcionam. Desde o 136, `update` de id inexistente rejeita ("Cannot find menu item…"), e o `.catch` atual já cobre                                                                                                                           | ok                                                                                                     | VERIFICADO (BCD e teste)                                                                                                             |
| `menus.getTargetElement` + `info.targetElementId`                                      | Firefox 63+. No content script exige a permissão **`menus`**                                                                                                                                                                                 | Opcional para o Inserir. Mais robusto que depender do foco                                             | VERIFICADO (BCD, `menus_child.json`, `typeof` = function no teste). Uso real: SUPOSTO                                                |
| Inserir pelo `activeElement`                                                           | O teste focou o campo por script. Não confirmei se o botão direito real foca o campo no Firefox                                                                                                                                              | Usar `getTargetElement` no Firefox, com o foco como fallback                                           | SUPOSTO                                                                                                                              |
| Atalhos (`commands`)                                                                   | Se a tecla já é do Firefox, a extensão não a recebe ("your event handler will not be called"). Linux: `Ctrl+Shift+Y` é Downloads. Windows: Downloads é `Ctrl+J`, então `Ctrl+Shift+Y` está livre. Nenhum atalho do Firefox usa `Alt+Shift+P` | `linux: 'Alt+Shift+P'` no Firefox                                                                      | VERIFICADO (MDN commands; `browser-sets.inc.xhtml` `key_openDownloads` com `accel,shift` no GNOME; `browserSets.ftl` `[linux] Y`)    |
| Texto do atalho                                                                        | `commands.getAll()` devolve `"Alt+Shift+P"` no Mac (o Chrome devolve `⌥⇧P`)                                                                                                                                                                  | Cosmético, opcional                                                                                    | VERIFICADO (teste)                                                                                                                   |
| "Alterar atalho"                                                                       | `tabs.create('chrome://extensions/shortcuts')` e `'about:addons'` dão "Illegal URL". `commands.openShortcutSettings()` existe a partir do Firefox 137                                                                                        | Usar `openShortcutSettings()` no Firefox                                                               | VERIFICADO (BCD e teste)                                                                                                             |
| `storage.local`                                                                        | Funciona                                                                                                                                                                                                                                     | ok                                                                                                     | VERIFICADO (teste)                                                                                                                   |
| `chrome.dom.openOrClosedShadowRoot`                                                    | Não existe. O equivalente é o **atributo** `element.openOrClosedShadowRoot`, só para extensões                                                                                                                                               | Adaptador abaixo                                                                                       | VERIFICADO (`Element.webidl:299`, BCD, teste). O `()` do enunciado da tarefa está errado                                             |
| `checkVisibility` com `opacityProperty`, `visibilityProperty`, `contentVisibilityAuto` | Firefox 122+                                                                                                                                                                                                                                 | ok                                                                                                     | VERIFICADO (BCD)                                                                                                                     |
| `createShadowRootUi`                                                                   | Implementado com `createElement` + `attachShadow` + `<style>`, sem `customElements` nem `adoptedStyleSheets`. Renderizou fixo no canto com os contornos                                                                                      | ok                                                                                                     | VERIFICADO (fonte do `isolated-element` 3.0.0, screenshot `shot-pagina-aviso.png`)                                                   |
| Reinjeção invalida a instância anterior                                                | Uma reinjeção removeu o aviso anterior                                                                                                                                                                                                       | ok                                                                                                     | VERIFICADO (teste)                                                                                                                   |
| Página com CSP `style-src` estrita e o `<style>` do aviso                              | Não testei                                                                                                                                                                                                                                   | Conferir à mão                                                                                         | SUPOSTO (risco)                                                                                                                      |
| Popup                                                                                  | O Firefox só injeta `border-radius` no `body` (8px, ou 24px com o redesenho "nova"). CSS de `browser_style` só quando ativado. Limite de 800×600. A regra do `body` fora de `@layer` não atrapalha                                           | Conferir visualmente os cantos arredondados e o crédito no rodapé                                      | VERIFICADO (`ExtensionPopups.sys.mjs`, `extension-popup-panel.css`). Painel real: SUPOSTO (o BiDi não fotografa páginas de extensão) |
| Fontes empacotadas                                                                     | Carregam                                                                                                                                                                                                                                     | ok                                                                                                     | VERIFICADO (teste)                                                                                                                   |
| `file:`                                                                                | A partir do 153 há a opção "Access local files on your computer", desligada por padrão, e `isAllowedFileSchemeAccess()` passa a refleti-la (antes devolvia sempre `false`)                                                                   | O texto do 1e precisa da instrução do Firefox (about:addons). O rótulo em pt-BR é SUPOSTO              | VERIFICADO (notas do 153 e BCD)                                                                                                      |
| Páginas proibidas                                                                      | `about:`, `moz-extension:`, `resource:`, `view-source:`, `chrome:`, mais a pref `restrictedDomains` (addons.mozilla.org, accounts.firefox.com, support.mozilla.org e outros), mais os "quarantined domains"                                  | Ampliar `paginas.ts`                                                                                   | VERIFICADO (`all.js:3120`). Leitor de PDF (pdf.js): SUPOSTO                                                                          |
| `gecko.id`                                                                             | Formato de e-mail `^[a-zA-Z0-9-._]*@[a-zA-Z0-9-._]+$`, até 80 caracteres, sem precisar ser dono do domínio. Obrigatório para assinar em MV3. Fica fixo depois da primeira assinatura                                                         | `botai@pilutech.com.br` (livre no AMO: a API devolve 404)                                              | VERIFICADO (MDN, lint, API do AMO)                                                                                                   |
| `data_collection_permissions`                                                          | Obrigatório para extensões **novas** desde **3 de novembro de 2025**. Para "não coleta nada": `{ "required": ["none"] }`. Suportado a partir do Firefox 140 (desktop) e 142 (Android)                                                        | Já no config                                                                                           | VERIFICADO (Extension Workshop, lint)                                                                                                |
| `strict_min_version`                                                                   | `153.0`: lint limpo. `140.0`: aviso só do Android. Abaixo de 140: aviso. O 153 é o ESR atual (lançado em 21/07/2026); o atual é o 157 (29/09/2026)                                                                                           | 153.0 recomendado                                                                                      | VERIFICADO (lint, BCD)                                                                                                               |
| Firefox para Android                                                                   | Sem `gecko_android`, a extensão fica só no desktop                                                                                                                                                                                           | Deixar de fora (o Android não tem menus de contexto nem atalhos)                                       | VERIFICADO (MDN `browser_specific_settings`)                                                                                         |
| Janelas privadas                                                                       | Não testei                                                                                                                                                                                                                                   | Entra no checklist                                                                                     | SUPOSTO                                                                                                                              |

Adaptador mínimo testado (`dom.ts`):

```ts
type ComRaizFechada = Element & {
  readonly openOrClosedShadowRoot?: ShadowRoot | null
}

function raizSombra(el: Element): ShadowRoot | null {
  if (el.shadowRoot) return el.shadowRoot
  if (!(el instanceof HTMLElement)) return null
  // Firefox não tem browser.dom; o equivalente é um atributo (não método) do elemento, só em content scripts.
  return import.meta.env.FIREFOX
    ? ((el as ComRaizFechada).openOrClosedShadowRoot ?? null)
    : (browser.dom.openOrClosedShadowRoot(el) ?? null)
}
```

`paginas.ts` (testado):

```ts
const RECUSAS_DO_CHROME = [
  /^Cannot access /,
  /cannot be scripted/,
  /^Missing host permission for the tab/,
]
```

## 3. Opera (e Edge)

**VERIFICADO**

- O build do Opera é idêntico ao do Chrome enquanto continuar minificado.
- Opera 109 equivale ao Chromium 123 (`engine_version` no BCD), e o Opera atual é o 136 (Chromium 152).
- Regra da loja do Opera: "it can't be obfuscated or minified (this rule doesn't apply to third-party libraries)" (help.opera.com, acceptance criteria). Opções:
  - `build.minify: false` só para o Opera: testei, gera um build de 1,2 MB contra 660 KB do Chrome;
  - ou enviar as fontes com instruções, o que o Opera diz que recebe "lower priority".
- Envio: formulário em `addons.opera.com/developer/upload/`. Screenshots de 612×408 (máximo 800×600). Não pode ter "Opera" no nome.
- Não existe API oficial de publicação. O `publish-browser-extension` 6.1.1 envia ao Opera usando o **cookie `sessionid`** do painel e uma API interna. Ele exige que a primeira versão já tenha sido enviada à mão e falha quando o cookie expira (fonte em `init-DhMr270n.mjs:1726`).
- A lista oficial de atalhos do Opera não tem nenhum com Shift+Y ou Shift+P.
- Edge: build idêntico ao do Chrome. O `publish-browser-extension` suporta a API do Edge Add-ons. No Edge, `Ctrl+Shift+Y` é "reading bar" só ao ler livros (página de suporte da Microsoft), um risco baixo.

**SUPOSTO** (precisa de um Opera instalado; aqui não há Opera nem Firefox, só Brave, Chrome e Edge)

- Se o Opera respeita `minimum_chrome_version`.
- Se o Opera mantém o atalho de grupo de abas do Chromium (`Alt+Shift+P` no Windows e no Linux). Manter `Ctrl+Shift+Y` evita a dúvida.
- `Alt+Shift+P` no Opera para Mac.
- A URL da página de atalhos no Opera: `chrome://extensions/shortcuts` ou `opera://extensions/shortcuts`.
- Se `addons.opera.com` e a loja do Edge bloqueiam scripts. Se bloquearem, a mensagem cai no regex `cannot be scripted` e o popup vai ao 1e depois da falha.
- Usuários do Opera também podem ligar "Allow Chrome Web Store extensions" (fonte: imprensa, não a documentação oficial).

## 4. Publicação e automação

**Firefox (VERIFICADO, Extension Workshop):**

- As versões release e beta exigem extensão assinada pela Mozilla.
- Canal **listed** (no AMO, com atualização automática) ou **unlisted** (assinada sem página pública, boa para uso só do dono). Leva até 24 h, mais se cair em revisão manual.
- Formas de enviar:
  - `web-ext sign --channel listed|unlisted --api-key --api-secret --upload-source-code <zip> --amo-metadata <json>` (opções conferidas no web-ext 10.7.0);
  - ou `wxt submit --firefox-zip … --firefox-sources-zip …`, com as variáveis `FIREFOX_JWT_ISSUER/SECRET`, `FIREFOX_CHANNEL` e `FIREFOX_EXTENSION_ID`.
- **Fontes obrigatórias** para código empacotado ou minificado. O revisor precisa gerar uma cópia idêntica ("There must be no differences"). Requisitos:
  - README com sistema operacional, ferramentas, versões e comandos;
  - lockfile;
  - pacotes privados incluídos;
  - até 200 MB.
- Ambiente padrão do revisor: Ubuntu 24.04, Node 24.14.0, npm 11.9.0, ARM64.

**Monorepo: o zip de fontes padrão do WXT não serve (VERIFICADO).**

- Por padrão, o `sourcesRoot` é `apps/botai`, sem `packages/*` e sem `pnpm-lock.yaml`.
- **Opção A (recomendada, VERIFICADA):** `zip.zipSources: false` e as fontes geradas por `git archive`:
  ```
  git archive --format=zip -o botai-sources.zip HEAD package.json pnpm-lock.yaml pnpm-workspace.yaml \
    .gitignore .prettierrc scripts/check-tailwind-source.mjs apps/botai packages/tools packages/ui
  ```
  Instalar (`pnpm install --frozen-lockfile --filter "@pilutech/botai..."`, pnpm 11.1.1) e rodar `wxt build -b firefox --mv3` gera saída idêntica byte a byte ao build da árvore de trabalho. Não muda código nenhum.
- **Opção B (VERIFICADA, com efeito colateral):** WXT com `sourcesRoot: '../..'`. O WXT sempre exclui `**/*.test.*` das fontes. Como testes e stories têm classes Tailwind (`.ring`, `w-[380px]`, `min-h-[220px]`…), o CSS sai diferente. Somar `@source not` para testes e stories em `styles.css` torna o build idêntico. Porém o Storybook importa o mesmo `styles.css` e perderia as classes que só aparecem nas stories (consequência lógica, não medida no Storybook).
- **Não verifiquei** se o build sai determinístico entre Linux/Node 24 e macOS/Node 22. Proposta: um passo de CI que reconstrói a partir do zip de fontes no Ubuntu e compara.

**Scripts propostos (`apps/botai/package.json`):**

```json
"build:firefox": "wxt build -b firefox && node ../../scripts/check-tailwind-source.mjs .output/firefox-mv3",
"build:opera": "wxt build -b opera && node ../../scripts/check-tailwind-source.mjs .output/opera-mv3",
"zip:todos": "wxt zip && wxt zip -b firefox && wxt zip -b opera && wxt zip -b edge",
"lint:firefox": "web-ext lint --source-dir .output/firefox-mv3 --no-config-discovery"
```

O gate do design system passou no `firefox-mv3` (exit 0). O `web-ext lint` sai 1 com erro e 0 só com avisos (VERIFICADO). `--warnings-as-errors` não dá, por causa dos 6 avisos de bibliotecas. O zip sai como `pilutechbotai-0.1.0-firefox.zip`; dá para mudar com `zip.name`.

**CI (proposta):**

- No job `botai` do `ci.yml`, acrescentar `build:firefox` e `lint:firefox`.
- Novo `botai-release.yml`, disparado por tag `botai-v*` ou à mão:
  1. `zip:todos`;
  2. `web-ext lint`;
  3. `git archive` das fontes;
  4. reconstrução das fontes num diretório temporário e `diff -r` contra o `.output/firefox-mv3`;
  5. upload dos artefatos;
  6. job de `wxt submit` atrás de um environment com segredos (AMO e Edge). Opera à mão.
- Makefile: `build-botai-firefox`, `build-botai-opera`, `zip-botai`.

## 5. Testes: estratégia mínima e confiável

1. **Vitest:** roda igual. Os ramos do Firefox são testados com `vi.stubEnv('FIREFOX', true)` (VERIFICADO). Exemplo em `.../repo/apps/botai/src/entrypoints/preencher.content/dom-firefox.test.ts`.
2. **Playwright Chromium:** continua como está. Cobre Chrome, Opera e Edge, já que o bundle é idêntico.
3. **`manifesto.e2e.ts`:** somar asserções do `firefox-mv3`:
   - `gecko.id`, `strict_min_version` e `data_collection_permissions`;
   - `menus` nas permissões;
   - ausência de `minimum_chrome_version`;
   - `background.scripts`.
4. **`web-ext lint` no CI**, falhando só em erro.
5. **Teste de fumaça no Firefox com Puppeteer + WebDriver BiDi (provado aqui):**
   - `puppeteer-core` 25.12.0 com Firefox stable baixado por `@puppeteer/browsers`;
   - lançar com `browser: 'firefox'`, `args: ['-remote-allow-system-access']` e `extraPrefsFirefox: { 'extensions.webextensions.uuids': JSON.stringify({ 'botai@pilutech.com.br': UUID }) }`;
   - instalar com `browser.installExtension(pasta)` (usa `webExtension.install`);
   - `goto('moz-extension://UUID/popup.html')` nunca recebe o evento de load: usar `timeout` + `catch` e depois `evaluate`, que funciona;
   - `runtime.sendMessage` cobre preencher, mostrar e inserir, como as costuras do E2E atual;
   - não fotografa páginas de extensão ("privileged scope"); páginas web sim.

   Em CI Linux: SUPOSTO. O Playwright não carrega extensão no Firefox (só serviços pagos, e só MV2): SUPOSTO, segundo os resultados de busca.

6. **Checklist manual por navegador:**
   - Firefox: popup no painel real, gesto real do activeTab, atalho real no Linux, Windows e Mac, menu num campo de **senha**, Inserir pelo menu real, `file:` com a opção do 153, PDF, páginas do AMO, janela privada, página com CSP estrita.
   - Opera: atalho, URL da página de atalhos, menu.

## 6. Impacto no código de `apps/botai`

- `wxt.config.ts`: manifesto por navegador, `manifestVersion: 3`, `targetBrowsers`, `minify` do Opera, zip (`zipSources: false` na opção A).
- `src/entrypoints/preencher.content/dom.ts`: o adaptador `raizSombra`. **Necessário e suficiente para o preenchimento.**
- `src/lib/paginas.ts`:
  - regex `Missing host permission`;
  - esquemas `moz-extension:`, `resource:`, `opera:`;
  - domínios restritos do Firefox e as lojas do Opera e do Edge (as lojas são SUPOSTO).
- `src/entrypoints/background/acoes.ts`: tratar `InjectionResult.error` (Firefox). Se adotar o `getTargetElement`, passar `info.targetElementId`.
- `src/entrypoints/background/ouvintes.ts` + `preencher.content/api.ts` + `inserir.ts`: `inserir(pessoa, kind, alvoId?)` usando `browser.menus.getTargetElement(alvoId)` no Firefox. Os tipos vêm do `@types/chrome` e não têm `menus`, então precisa de cast.
- `src/lib/menus.ts`: contextos com `'password'` só no Firefox (cast em `ContextType`).
- `src/entrypoints/popup/App.tsx`: "Alterar atalho" com `browser.commands.openShortcutSettings()` no Firefox (cast) e a URL do Opera.
- `src/components/pagina-proibida.tsx` (+ stories e testes): hoje o texto diz "O Chrome não deixa…" e cita `chrome://extensions`. Proposta: uma prop `navegador` vinda do `App`, mantendo o componente só de props.
- Opcional: formatar o atalho do Firefox (`Alt+Shift+P` → `⌥⇧P` no Mac).
- `manifesto.e2e.ts`: asserções do Firefox. Fixture nova do Firefox com Puppeteer, se adotada.
- `package.json` e Makefile: scripts e alvos. Dependências novas, se aprovadas: `web-ext`, `puppeteer-core`, `@puppeteer/browsers`.
- `.github/workflows`: `ci.yml` e o novo `botai-release.yml`.
- Documentação:
  - `apps/botai/CLAUDE.md` hoje diz "Fora: Firefox, `wxt zip`, Chrome Web Store";
  - `README.md` (instalação por navegador);
  - o `CLAUDE.md` da raiz, cuja tabela de workspaces nem lista `apps/botai`.

Fora do escopo desta tarefa: a apresentação na página PiluLabs do site.

## Arquivos no scratchpad (`.../scratchpad/multinav/`)

- `proposta.diff`: patch de `wxt.config.ts`, `styles.css` (opção B; descartar se for a A), `dom.ts`, `paginas.ts` e `dom-firefox.test.ts`.
- `repo/apps/botai/`: cópia com os rascunhos e os builds em `.output/` (chrome, edge, opera, firefox-mv3 e firefox-mv3-e2e).
- `tools/spike-firefox.mjs`, `spike-extra.mjs`, `spike-shot.mjs` e os logs `spike1.log` a `spike4.log`.
- `shot-pagina-aviso.png`, `lint-*.json`, `botai-sources-gitarchive.zip`.
- Builds de reprodutibilidade em `srcA/`, `srcC/` e `srcbuild/`.

## DECISÕES QUE O DONO PRECISA TOMAR

1. **Versão mínima do Firefox:** `153.0` (ESR atual; dispensa adaptador de `documentId` e deixa `file:` funcionar) ou `140.0` (cobre o ESR 140, mas exige trocar `documentIds` por `frameIds` e `file:` nunca funciona).
2. **ID do Firefox**, permanente depois da primeira assinatura: `botai@pilutech.com.br`? (Está livre no AMO.)
3. **Canal no Firefox:** AMO listado (público) ou unlisted (assinado, só para o dono). Hoje a distribuição é "só o dono".
4. **Atalho no Firefox para Linux:** `Alt+Shift+P` (proposto) ou outra tecla.
5. **Inserir no Firefox:** adotar `menus.getTargetElement` (mais robusto, mais código) ou manter só o foco (não testado com o menu real).
6. **Fontes para o AMO:** opção A (`git archive`, sem mexer em código, recomendada) ou B (zip do WXT + `@source not` + uma entrada de CSS própria para o Storybook).
7. **Opera:** build sem minificar (passa na regra da loja, 1,2 MB) ou minificado + fontes (fila de revisão menor prioridade). Envio manual ou via `OPERA_SESSION_ID` (cookie, frágil).
8. **Edge Add-ons e Chrome Web Store:** publicar também? O Edge sai com o mesmo zip, de graça.
9. **Dependências novas no repo** (passam pela política do pnpm): `web-ext` (328 pacotes) para o lint no CI, `puppeteer-core` + `@puppeteer/browsers` para o teste de fumaça no Firefox. A alternativa é deixar o Firefox só no lint + checklist manual.
10. **Publicação automática:** job de `wxt submit` no CI com segredos do AMO e do Edge, ou publicar à mão a partir dos artefatos do workflow.
11. **Textos de página proibida e de acesso a `file:`:** um texto por navegador ou um texto neutro ("O navegador não deixa…").
