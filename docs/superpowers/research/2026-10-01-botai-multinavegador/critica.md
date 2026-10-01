# Botaí multinavegador: crítica de completude dos 3 relatórios

Não alterei nada no repositório. As consultas a fontes vivas estão em `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/critico/` (JSONs do BCD baixados do `main` do mdn/browser-compat-data).

## 0. Veredito

- **No geral, os três relatórios se sustentam.** As 4 afirmações mais arriscadas se confirmaram em fonte viva (seção 1).
- **Há 3 contradições que mudam código:**
  - a versão mínima do Firefox (153 contra 140);
  - o zip de fontes da AMO (A contra B);
  - o Opera (zip idêntico ao do Chrome ou build sem minificar).
- **Correções:**
  - "A primeira submissão é manual nas 4 lojas" só vale para o `wxt submit`. A API da AMO cria add-on.
  - "153 é o ESR atual" é impreciso hoje, mas passa a valer em 13/10.
  - O conflito de `Ctrl+Shift+Y` no Windows (suposição do relatório do site) não existe.
- **Lacunas:**
  - verificação em duas etapas obrigatória na conta da CWS;
  - Edge sem nenhum teste, embora esteja instalado na máquina;
  - `test:e2e`/`manifesto.e2e.ts` só montam o build do Chrome;
  - rascunhos duplicados de captura de tela e de nomes de script;
  - identidade do publicador (e-mail imutável, PiluTech ME ou pessoa física, Trader);
  - documentação raiz desatualizada.

---

## 1. Checagem em fonte viva das afirmações de maior risco

| #   | Afirmação (quem disse)                                                                                                                                                              | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Fonte                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `documentIds` / `InjectionResult.documentId` só a partir do Firefox 153 (firefox-opera)                                                                                             | **CONFIRMADO.** `InjectionTarget.documentIds` firefox `153` (Chrome 106). `InjectionResult.documentId` firefox `153`. `InjectionResult.error` firefox `102` e Chrome `false`, ou seja, só o Firefox devolve erro dentro do resultado em vez de rejeitar                                                                                                                                                                                                              | BCD `webextensions/api/scripting.json` (main, baixado hoje)                                                                                                            |
| 2   | `data_collection_permissions` obrigatório para extensão nova na AMO desde 03/11/2025, `required: ['none']`, Firefox 140+ desktop / 142+ Android (ambos)                             | **CONFIRMADO.** "From November 3, 2025, all new extensions must adopt…". Extensões antigas "will have to at a later date"                                                                                                                                                                                                                                                                                                                                            | https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/                                                                                      |
| 3   | CWS API v1.1 até 15/10/2026; `publish-browser-extension` 6.1.1 usa v1.1 por padrão (publicacao)                                                                                     | **CONFIRMADO.** Blog (publicado em 15/10/2025): "We plan to support the old API until 15th October 2026"; a v2 "does not support creating new items". No código: `apiVersion` é `optional(literal("v1.1"))` (`init-DhMr270n.mjs:1228`), `dynamic(v => v?.apiVersion === "v2" ? V2 : V1_1)` (`:1399`) e o store v1.1 bate em `/upload/chromewebstore/v1.1/items/{itemId}` (`:165`). A 6.1.1 é a última no npm (10/08/2026); o wxt 0.21.4 declara `^5.1.0 \|\| ^6.0.0` | https://developer.chrome.com/blog/cws-api-v2 · `node_modules/.pnpm/publish-browser-extension@6.1.1/.../dist/init-DhMr270n.mjs`                                         |
| 4   | O `wxt submit` cobre as 4 lojas (ambos)                                                                                                                                             | **CONFIRMADO, cada loja por um caminho:**<br>• Chrome: v1.1 ou v2 (service account, `/v2/{+name}:publish`, `:1932`).<br>• Firefox: AMO v5. Faz `GET /api/v5/addons/addon/{id}` antes de enviar (`:1626`), então **não cria** o add-on.<br>• Edge: API v1.1 por API key (`/v1/products/{productId}/submissions`, `:1475-1545`).<br>• Opera: cookie `sessionid` + `csrftoken` fixo `"1234…"` (`:1734-1743`), uma API não oficial                                       | código acima · https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api ("There aren't REST API endpoints for: Creating a new product") |
| 5   | "Primeira submissão manual nas 4 lojas" (publicacao)                                                                                                                                | **PARCIALMENTE ERRADO.** A AMO tem `POST /api/v5/addons/addon/`, que cria o add-on listed com `license`, `name`, `summary` e categorias. O `web-ext sign --amo-metadata` usa isso. Só o `wxt submit` exige que o add-on já exista                                                                                                                                                                                                                                    | https://mozilla.github.io/addons-server/topics/api/addons.html                                                                                                         |
| 6   | "Firefox 153 é o ESR atual; o atual é o 157" (firefox-opera)                                                                                                                        | **IMPRECISO.** Hoje `FIREFOX_ESR = 140.17.0esr` e `FIREFOX_ESR_NEXT = 153.4.0esr`. **O ESR 140 chega ao fim da vida em 13/10/2026** (passa para o 153). O 157 saiu em 29/09. O ritmo virou quinzenal: 155 em 01/09, 156 em 15/09, 157 em 29/09. Conclusão: o mínimo 153 deixa de fora só o ESR 140, que acaba em 12 dias                                                                                                                                             | https://product-details.mozilla.org/1.0/firefox_versions.json · `firefox_history_major_releases.json` · https://whattrainisitnow.com/release/?version=esr              |
| 7   | `Ctrl+Shift+Y` = Downloads no Firefox para Linux (firefox-opera) contra "provavelmente Windows e Linux" (site)                                                                      | **firefox-opera CORRETO.** `key_openDownloads` só tem `modifiers="accel,shift"` sob `#ifdef XP_GNOME`; `browserSets.ftl` traz `[linux] Y`. A suposição do relatório do site para o Windows cai                                                                                                                                                                                                                                                                       | `scratchpad/multinav/k_browser-sets.inc.xhtml:179-182`, `browserSets.ftl:59-61`                                                                                        |
| 8   | No Firefox, `editable` não inclui senha; `getTargetElement` 63+; `openShortcutSettings` 137+; `dom.openOrClosedShadowRoot` inexistente; `isAllowedFileSchemeAccess` real só no 153+ | **CONFIRMADO** (notas do BCD: "The 'editable' context does not include password fields", "Use `element.openOrClosedShadowRoot`")                                                                                                                                                                                                                                                                                                                                     | BCD `menus.json`, `commands.json`, `dom.json`, `extension.json`                                                                                                        |
| 9   | Regra do Opera sobre código minificado                                                                                                                                              | **CONFIRMADO.** "it can't be obfuscated or minified (this rule doesn't apply to third-party libraries)". Para código ofuscado é preciso link e instruções, e a revisão "may be handled with a lower priority"                                                                                                                                                                                                                                                        | https://help.opera.com/en/extensions/acceptance-criteria/                                                                                                              |
| 10  | Usuário do Opera instala direto da CWS ("Add to Opera")                                                                                                                             | **CONTINUA SUPOSTO.** Só há fórum e imprensa, nada em help.opera.com                                                                                                                                                                                                                                                                                                                                                                                                 | [forums.opera.com/post/187835](https://forums.opera.com/post/187835)                                                                                                   |
| 11  | `pilutech.com.br` não resolve; `robots.txt` e `sitemap.xml` dão 404 (site)                                                                                                          | **CONFIRMADO hoje.** curl `(6) Could not resolve host`; NS `george`/`rosalyn.ns.cloudflare.com`, sem A; os dois arquivos com 404                                                                                                                                                                                                                                                                                                                                     | `curl`/`dig`                                                                                                                                                           |
| 12  | `.env.submit` fora do `.gitignore` (publicacao)                                                                                                                                     | **CONFIRMADO.** `/usr/bin/git check-ignore` saiu com exit 1                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                                                      |
| 13  | ID `botai@pilutech.com.br` livre na AMO                                                                                                                                             | **CONFIRMADO.** Por GUID e pelo slug `botai`: 404 (o slug também está livre). Atenção: existe **"GetBotAI"** (`getbotai`) na AMO, nome parecido                                                                                                                                                                                                                                                                                                                      | API AMO v5                                                                                                                                                             |

---

## 2. Contradições entre os relatórios e como resolver

**C1. `strict_min_version`: 153 (firefox-opera) contra 140 + `gecko_android` 142 (publicacao).**

A config da publicacao, com mínimo 140, quebraria duas coisas no Firefox 140–152:

- o "Mostrar na página" e a mira do 1c, que usam `documentIds` (VERIFICADO: o BCD diz 153);
- o 1e do `file:`, porque `isAllowedFileSchemeAccess` sempre devolve `false` antes do 153.

O ganho do 140 é só o ESR 140, que acaba em 13/10/2026. **Resolução: 153.0, sem `gecko_android`** (lint limpo, medido pelo firefox-opera).

**C2. Fontes para a AMO: opção A (`git archive`, firefox-opera) contra B (`sourcesRoot` na raiz + `@source not`, publicacao).**

O argumento do firefox-opera contra a B ("o Storybook perderia classes") vem do próprio rascunho dele. O `proposta.diff:96-97` exclui `*.stories.*` e `*.e2e.*`, e isso é desnecessário. A exclusão fixa do WXT é só `**/__tests__/**` e `**/*.+(test|spec).?(c|m)+(j|t)s?(x)` (`resolve-config.mjs:205-206`), que não pega stories. A variante da publicacao exclui só `*.test.*`, o Storybook não renderiza testes, e o efeito é zero.

A B também é a única **reproduzida no ambiente do revisor**: Docker `node:24.14.0`, com zip idêntico byte a byte. A A só foi reproduzida no macOS.

**Resolução: B na variante da publicacao, com o passo de reprodução no CI.** A fica como plano B.

**C3. Opera: "um zip Chromium serve às três lojas" (publicacao) contra `minify: false` só para o Opera (firefox-opera).** Pela regra do Opera (VERIFICADA), o zip minificado só passa com link e instruções, e em fila de menor prioridade. Se adotar `minify: false`, o Opera ganha um zip próprio (cerca de 1,2 MB). O Chrome e o Edge continuam com o mesmo zip. Fica como decisão do dono (D8).

**C4. Atalho.** O relatório do site supôs conflito no Windows; não existe (seção 1, item 7). A página PiluLabs tem de ler o atalho por navegador e sistema a partir de dados, porque no Firefox para Linux ele é `Alt+Shift+P`.

**C5. Configs parciais.**

- O diff da publicacao não tem: a permissão `menus`, o contexto `password`, o `linux: 'Alt+Shift+P'`, o adaptador de `dom.ts` e o tratamento de `InjectionResult.error`. **Sem o adaptador, o Firefox preenche 0 campos em silêncio**: a publicacao "validou" só o empacotamento, não o funcionamento.
- O do firefox-opera não tem a config de zip nem o `homepage_url`. O `homepage_url` só aparece no relatório do site.

Config consolidada na seção 4.

**C6. Rascunhos duplicados.**

- Captura de tela: `capturas.loja.ts` + `playwright.loja.config.ts` (publicacao) contra `src/capturas/loja.captura.ts` + `playwright.capturas.config.ts` (site).
- Scripts: `build:firefox`/`zip:todos`/`lint:firefox` contra `zip:firefox`/`zip:all`.
- Makefile: `build-botai-firefox`/`zip-botai` contra `zip-botai`/`release-botai`.

Escolher um conjunto. Sugestão: `zip`, `zip:firefox`, `zip:opera`, `zip:todos` (mantendo o pt-BR do repo), `lint:firefox`, e um único `playwright.capturas.config.ts`.

**C7. Política de privacidade.** Há um `PRIVACIDADE.md` (rascunho da publicacao) e a rota `/pilulabs/botai/privacidade` (site). Resolução: a rota do site é a URL oficial das lojas. O mesmo texto vai colado no campo da AMO, que pede o texto mesmo com versão hospedada.

**C8. Canal da AMO.** O firefox-opera lembra que a distribuição hoje é "só o dono" (unlisted); a publicacao assume listed. O pedido do usuário ("publicar", vitrine no site) aponta para **listed**.

**C9. Docs da raiz desatualizados.** O `CLAUDE.md` da raiz fala em "cinco jobs" no `ci.yml`, mas o `ci.yml` tem um job `botai` (linhas 197-223). A tabela de workspaces não lista `apps/botai`. Ele cita um `deploy-api.yml` que não existe em `.github/workflows/`, onde só há `botai-e2e.yml`, `ci.yml`, `deploy-financas.yml` e `trivy.yml`.

---

## 3. Lacunas que o plano de implementação precisa cobrir

1. **A CWS exige verificação em duas etapas na conta Google para publicar e atualizar.** Ninguém citou isso. Fonte: https://developer.chrome.com/docs/webstore/program-policies/two-step-verification
2. **Edge sem nenhum teste.** O Edge está instalado na máquina, mas nada foi verificado. Pontos abertos:
   - se `tabs.create('chrome://extensions/shortcuts')` abre a página de atalhos no Edge e no Opera (SUPOSTO);
   - se o 1e diz "O Chrome não deixa…" dentro do Edge e do Opera;
   - se `microsoftedge.microsoft.com` e `addons.opera.com` entram em `paginas.ts`.
3. **E2E do manifesto do Firefox.** O `test:e2e` roda `pnpm run build` (só o Chrome). Asserções sobre `firefox-mv3` exigem `wxt build -b firefox` no script, no `botai-e2e.yml` e no job `botai` do `ci.yml` (com o gate `check-tailwind-source` em `.output/firefox-mv3` e o `web-ext lint`).
4. **Política de dependências.** `web-ext` (328 pacotes) e `puppeteer-core` passam por `minimumReleaseAge` e `allowBuilds`. Um `pnpm dlx web-ext@10.7.0` foge do lockfile, o que é menos auditável. Ninguém mediu se o `web-ext` precisa de script de instalação.
5. **Reprodução das fontes depois do código novo.** A prova byte a byte da publicacao foi feita **sem** o adaptador `dom.ts` e os demais ramos do Firefox. Tem de ser refeita no CI (o passo `cmp` do `botai-release.yml`) com o código final.
6. **Inserir no Firefox.** Ninguém confirmou que o botão direito real foca o campo. Recomendo `menus.getTargetElement(info.targetElementId)` (Firefox 63+, permissão `menus`, sem aviso na instalação), com o foco como reserva.
7. **Checklist manual do Firefox e do Opera:** janela privada, página com CSP `style-src` estrita (o `<style>` do aviso), leitor de PDF, domínios restritos da AMO e cantos e crédito do popup no painel real. Os dois relatórios citam; falta virar seção do `apps/botai/CLAUDE.md`.
8. **Fluxo de assets entre os apps.** As capturas saem de `apps/botai` e o site lê de `apps/web/public/pilulabs/botai/`. Ninguém definiu quem copia nem quando. Sugestão: o script de capturas grava direto nas duas pastas, ou numa fonte única, e o PNG é versionado.
9. **Identidade do publicador.** Isso amarra decisões que estavam espalhadas:
   - o e-mail da conta CWS é **imutável** e precisa de 2SV;
   - o nome exibido nas 4 lojas;
   - Trader ou Non-Trader (DSA: com Trader, os dados legais ficam públicos na UE);
   - o "responsável" da política de privacidade;
   - o contato de suporte.

   Tem de ser uma decisão só.

10. **Ordem obrigatória.** A página de privacidade e o `homepage_url` têm de estar no ar **antes** do envio à CWS. O `pilutech.com.br` tem de resolver (redirecionamento) antes de um revisor clicar no "Powered by PiluTech".
11. **Nome.** Há "GetBotAI" na AMO. Colisão na CWS e na loja do Edge e marca no INPI: não verificados (SUPOSTO, checagem barata).
12. **Versão.** A mesma `version` vale para as 4 lojas e tem sempre de subir. O WXT não emite `version_name` no Firefox. Falta decidir com que versão sair.
13. **Documentação obrigatória** (regra global do dono):
    - `apps/botai/CLAUDE.md`: "Fora: Firefox, `wxt zip`, Chrome Web Store" e "Distribuição: só o dono" deixam de valer; entram release e lojas, a armadilha do `@source not` dos testes, e o atalho e as recusas por navegador;
    - `README.md`: instalação por loja;
    - `CLAUDE.md` da raiz: tabela de workspaces e de CI;
    - `apps/web/CLAUDE.md`: seção PiluLabs.
14. **Testes por fatia** (regra global do dono): ninguém consolidou. Fica assim:
    - Vitest para os ramos do Firefox com `vi.stubEnv('FIREFOX', true)` (provado);
    - stories de `pagina-proibida` por navegador;
    - Jest para `lib/pilulabs.ts`;
    - Playwright para `pilulabs.e2e.ts` e para o manifesto do Firefox.

    O E2E funcional do Firefox não sai pelo Playwright (SUPOSTO forte); a única prova foi feita com Puppeteer + BiDi, e só localmente.

15. **O Safari ficou fora**, porque o usuário não pediu. Uma linha no `CLAUDE.md` dizendo isso evita reabrir o assunto.

---

## 4. Config consolidada (junta os dois rascunhos; ainda não compilada nesta forma)

```ts
// apps/botai/wxt.config.ts
const ATALHO_CHROMIUM = { default: 'Ctrl+Shift+Y', mac: 'Alt+Shift+P' }
// Firefox no Linux (GNOME) usa Ctrl+Shift+Y para Downloads e não cede a tecla.
const ATALHO_FIREFOX = { ...ATALHO_CHROMIUM, linux: 'Alt+Shift+P' }
const raizDoMonorepo = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  srcDir: 'src',
  imports: false,
  manifestVersion: 3, // sem isto, -b firefox gera MV2
  targetBrowsers: ['chrome', 'firefox', 'edge', 'opera'],
  zip: {
    name: 'botai',
    sourcesRoot: raizDoMonorepo, // zipSources: padrão do WXT (firefox e opera)
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
  manifest: ({ browser, mode }) => {
    const firefox = browser === 'firefox'
    return {
      name: 'Botaí',
      short_name: 'Botaí',
      description: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
      homepage_url: 'https://piluvitu.com.br/pilulabs/botai', // depende de D12
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
      ],
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
    ...(browser === 'opera' && { build: { minify: false } }), // só se D8 = sem minificar
  }),
})
```

```css
/* apps/botai/src/styles.css, depois de @source not '../.output'; */
@source not './**/*.test.*';
@source not '../../../packages/ui/src/**/*.test.*';
```

Fora da config, mudanças de código necessárias para o Firefox **funcionar** (todas do relatório firefox-opera):

- adaptador `raizSombra` em `dom.ts` (atributo, não método);
- tratar `InjectionResult.error` em `acoes.ts`;
- `/^Missing host permission for the tab/` e os esquemas e domínios do Firefox em `paginas.ts`;
- contexto `'password'` em `menus.ts`;
- `commands.openShortcutSettings()` no `App.tsx`;
- texto do 1e por navegador;
- `getTargetElement` no Inserir.

Fora do código: `.env.submit` no `.gitignore`.

## 5. Ordem das fatias sugerida

1. **Código multinavegador:** config acima, adaptadores, testes Vitest com `stubEnv`, manifesto do Firefox no E2E, `web-ext lint` e o build do Firefox no CI, docs.
2. **Site, fatia 1:** `/pilulabs/botai/privacidade` + `/pilulabs/botai` com `listado: false` e noindex, mais o redirecionamento de `pilutech.com.br` na Cloudflare.
3. **Assets:** ícone 128 com margem, capturas 1280×800, tile 440×280, 612×408 para o Opera, logo 300×300 para o Edge.
4. **Contas e primeiros envios** (dono): CWS com 2SV e taxa, AMO com 2FA, Edge e, se for o caso, Opera.
5. **`botai-release.yml`** com o environment `lojas-botai`, `CHROME_API_VERSION=v2` desde o primeiro dia, depois um `dry-run`.
6. **Site, fatia 2:** `/pilulabs`, link no rodapé, `sitemap`/`robots`, URLs das lojas aprovadas e `listado: true`. Depois, o CRUD de `produtos` no `/admin`.

---

## 6. DECISÕES QUE O DONO PRECISA TOMAR (consolidadas, com recomendação)

**Navegadores e lojas**

1. **Lojas:** CWS + AMO (recomendado). Edge (recomendado: grátis, mesmo zip, API oficial). Opera: gerar o build sim; enviar à loja só à mão (sem API oficial e com revisão de prazo incerto).
2. **Firefox mínimo:** **153.0** (recomendado; o ESR 140 acaba em 13/10/2026). O 140 exigiria trocar `documentIds` por `frameIds` e perderia o `file:`.
3. **`gecko.id`, permanente:** **`botai@pilutech.com.br`** (recomendado; livre na AMO).
4. **Canal da AMO:** **listed** (recomendado, porque há vitrine pública) ou unlisted.
5. **Atalho no Firefox para Linux:** **`Alt+Shift+P`** (recomendado; verificado como livre).
6. **Inserir no Firefox:** **`menus.getTargetElement`**, com o foco como reserva (recomendado).
7. **Fontes para a AMO:** **opção B** (`sourcesRoot` na raiz + `@source not` só para `*.test.*`), com reprodução no CI (recomendado). A (`git archive`) fica como reserva.
8. **Opera:** **build sem minificar** (cumpre a regra e escapa da fila de menor prioridade; zip próprio de ~1,2 MB) e envio manual (recomendado). Não usar o cookie `OPERA_SESSION_ID` no CI, que é frágil.
9. **Textos de página proibida e de `file:`:** um por navegador, via prop `navegador` (recomendado), ou um texto neutro.

**Automação** 10. **Publicação:** `wxt submit` num job com environment `lojas-botai` e aprovação manual, para CWS v2 + AMO + Edge (recomendado). A primeira versão em cada loja é manual. 11. **Credencial do Chrome:** chave JSON da service account como secret (recomendado; é o que o `wxt submit` suporta) ou WIF (exige código próprio). 12. **Fluxo de versão:** bump num PR (`--no-git-tag-version`) e a tag `botai-v*` na `main` depois do merge, via `make release-botai` (recomendado; a `main` está sem proteção, o que facilita errar). Primeira versão pública: **1.0.0** (recomendado) ou manter 0.x. 13. **Dependências novas:** `web-ext` como devDependency fixada, para o lint no CI (recomendado, auditável). `puppeteer-core` para o teste de fumaça no Firefox: começar como script local opcional, fora do CI, até provar que roda em Linux (recomendado).

**Identidade e jurídico** 14. **Quem publica:** PiluTech (ME, com CNPJ) ou pessoa física. Isso define o nome do publicador nas lojas, o "responsável" da política e Trader ou Non-Trader na CWS. Recomendação: decidir junto com o contador. Como é grátis e sem monetização, Non-Trader é defensável; publicar como "PiluTech" puxa para Trader, com dados públicos na UE. 15. **E-mail da conta CWS** (imutável, com 2SV) e contato de suporte: recomendado um e-mail dedicado da PiluTech, o mesmo nas 4 lojas e na política. 16. **Licença do repositório público** (a AMO pede na primeira versão listed): MIT (recomendado: simplifica a revisão de fontes da AMO e do Opera) ou "All Rights Reserved". 17. **Nome:** conferir colisões na CWS e no INPI ("GetBotAI" existe na AMO). Recomendado antes do primeiro envio.

**Site e lançamento** 18. **Onde mora a página:** `piluvitu.com.br/pilulabs` agora (recomendado), com 308 quando o site da PiluTech existir. 19. **`pilutech.com.br`:** Single Redirect na Cloudflare para `piluvitu.com.br/pilulabs` **antes** do envio às lojas (recomendado). A alternativa é trocar o link do popup. 20. **Antes da aprovação:** página só por link direto (`listado: false`, noindex) e publicação adiada na CWS (`STAGED_PUBLISH`) para sincronizar com o site (recomendado). 21. **Modelo de conteúdo:** híbrido (collection `produtos` + rota estática por produto), com o CRUD do `/admin` numa segunda fatia (recomendado). 22. **Política de privacidade:** pt-BR primeiro (recomendado), inglês opcional. Declarar "Website content" na CWS e explicar que nada sai do navegador (recomendado). 23. **Idioma da listagem:** só pt-BR (recomendado; pt-BR + en exige `_locales`). 24. **Botões de loja:** próprios do design system, com ícones FA (recomendado; o badge do Opera não tem pt-BR) ou badges oficiais. 25. **Capturas:** temas claro e escuro, atalho `Ctrl+Shift+Y`, página-vitrine estilizada, geradas no Mac; um único script (resolve a C6). 26. **Home:** link `/pilulabs` no rodapé + card em "Projetos" (recomendado). Decidir se o "Live PRs" migra para o PiluLabs. 27. **Marca:** o SVG `Marca` do Botaí é idêntico ao logo do cartão de visita. Diferenciar (recomendado, para não confundir autor e produto) ou manter. 28. **SEO global:** `sitemap.ts`/`robots.ts` e a correção do `og:title`/`og:url` herdados em `/tools` e nas outras subpáginas, numa fatia separada (recomendado). Aceitar que não haverá estrelas no rich result. 29. **CTA "Instalar a partir do código"** enquanto as lojas não aprovam: não (recomendado). Usar "Em breve" com a página não listada.

Arquivos relevantes:

- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/botai/wxt.config.ts`
- `/Users/piluvitu/WWW/PiluVitu-Dev/apps/botai/src/styles.css`
- `/Users/piluvitu/WWW/PiluVitu-Dev/.github/workflows/ci.yml`
- `/Users/piluvitu/WWW/PiluVitu-Dev/.github/workflows/botai-e2e.yml`
- `/Users/piluvitu/WWW/PiluVitu-Dev/node_modules/.pnpm/publish-browser-extension@6.1.1/node_modules/publish-browser-extension/dist/init-DhMr270n.mjs`
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/proposta.diff`
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/rascunhos/mudancas-botai.diff`
- `/private/tmp/claude-501/-Users-piluvitu-WWW-PiluVitu-Dev/8edd1313-ac44-4917-a3ae-1ea4365be1c4/scratchpad/multinav/critico/` (JSONs do BCD baixados hoje)

Fontes adicionais: [CWS 2SV](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification) · [CWS API v2](https://developer.chrome.com/blog/cws-api-v2) · [Firefox data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) · [Edge Add-ons API](https://learn.microsoft.com/en-us/microsoft-edge/extensions/update/api/using-addons-api) · [AMO add-ons API](https://mozilla.github.io/addons-server/topics/api/addons.html) · [Opera acceptance criteria](https://help.opera.com/en/extensions/acceptance-criteria/) · [Firefox product-details](https://product-details.mozilla.org/1.0/firefox_versions.json) · [whattrainisitnow ESR](https://whattrainisitnow.com/release/?version=esr) · [Opera forum, instalar da CWS](https://forums.opera.com/post/187835)
