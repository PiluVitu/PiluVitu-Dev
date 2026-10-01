# CLAUDE.md — `apps/extensao` (`@piluvitu/extensao`)

Extensão Chrome MV3 **"piluvitu · dados de teste"**. O Claude Code carrega este arquivo junto com o `CLAUDE.md` da raiz. Spec: `docs/superpowers/specs/2026-10-01-extensao-dados-teste-design.md`. Contrato de nomes entre as fases: `docs/superpowers/plans/2026-10-01-extensao-interfaces.md`. Pesquisa (protótipos, medições e relatórios): `docs/superpowers/research/2026-10-01-extensao-dados-teste/`.

## O que faz

Gera uma pessoa brasileira de teste (falsa, coerente, documentos com dígito verificador certo, CEP real com rua e cidade certas, cartão de teste documentado da Stripe) e preenche o formulário da aba atual:

- **Modo A, a página inteira:** `Alt+Shift+P` (comando `preencher-pagina`, `⌥⇧P` no Mac), o botão "Preencher esta página" do popup ou o item "Preencher esta página" do menu de contexto.
- **Modo B, um campo:** botão direito no campo → `piluvitu · dados de teste › Inserir › CPF / E-mail / CEP…`, para o que a detecção errar.

Distribuição: só o dono, carregada sem empacotar a partir de `.output/chrome-mv3`. Fora: Firefox, `wxt zip`, Chrome Web Store.

## Fronteira

Geração, classificação de campo e formatação de valor são lógica pura em `@piluvitu/tools` (`pessoa`, `campos`, `campos-formatar` e os geradores; ver `packages/tools/CLAUDE.md`). A extensão é a casca: injeta o script, varre o DOM, escreve, lê de volta, contorna, desenha o aviso e mostra o popup.

## Estrutura

```
src/entrypoints/background/       orquestra: atalho, menu, mensagens do popup, injeção, soma dos frames
src/entrypoints/popup/            React + @piluvitu/ui (1a e 1b nesta fase)
src/entrypoints/preencher.content/ registration 'runtime': instala a API __pv (camada DOM + aviso 1f)
src/components/                   componentes de apresentação do popup (+ .stories.tsx + .test.tsx)
src/lib/                          armazenamento, menus, mensagens, páginas proibidas, soma dos frames, textos, data de hoje
src/test/                         setup do Vitest, pessoa dourada, layout falso do jsdom, fixture do Playwright
```

**Todo entrypoint é pasta** (`background/index.ts`, `popup/index.html`, `preencher.content/index.ts`). O WXT trata qualquer arquivo solto em `src/entrypoints/` como entrypoint: um `background.test.ts` ali quebra o build ("Multiple entrypoints with the same name"). Dentro da pasta, só `index.*` é entrypoint; testes, stories, E2E e as páginas de teste (`*.pagina.html`) moram ao lado.

## Fluxos

- **Preencher (modo A), sempre no background** (se o popup fechasse no meio, perderia a resposta): `obterOuGerarPessoa()` → injeta `/content-scripts/preencher.js` em `allFrames` → `executeScript({func, args})` chama `__pv.preencher(pessoa, hojeISO)` em cada frame → `somarFrames` (ignora frame que devolveu `null`) → `__pv.aviso(...)` só no frame 0 → devolve `RespostaPreencher` ao popup. Com Y = 0 não há aviso nesta fase (a fase 3 acrescenta "Nenhum campo nesta página").
- **Por que injetar e depois chamar `func`:** a injeção por arquivo não aceita argumentos. O `main()` do content script só (re)instala `globalThis.__pv` ligado ao `ctx` atual; as ações vêm por `func` + `args`.
- **Reinjeção é o mecanismo, não um efeito colateral:** toda ação injeta de novo; o WXT invalida a instância anterior (o aviso, os timers e os contornos saem por `ctx.onInvalidated`). Por isso dois `Alt+Shift+P` seguidos nunca empilham avisos, e o `outline` original do site volta antes de a nova instância salvar o "original" dela. "Mostrar na página" **não** reinjeta, para não perder o registro de campos (`Map<idx, WeakRef>` no mundo isolado; nenhum `data-*` vai para o DOM do site).
- **Mostrar na página (`__pv.mostrar(idx)`):** usado pelo texto âmbar do aviso (e, a partir da fase 3, pela mira do 1c). Rola com `scrollIntoView({block: 'center'})`, **sem** `smooth` (a rolagem animada não anda com a aba em segundo plano), e o contorno pisca âmbar/transparente por 1 s e volta ao contorno que o campo deve ter naquele momento (o do preenchimento se o aviso ainda está na tela, o original do site se ele já saiu). O `limpar` restaura também o campo que está piscando: uma reinjeção no meio do pisco cancela os timers, e sem isso o campo ficaria com a cor do pisco e a instância nova a salvaria como "outline original".
- **Inserir (modo B):** o Chrome não diz qual elemento recebeu o clique, mas o botão direito foca o campo. O background injeta só no `info.frameId` e chama `__pv.inserir(pessoa, kind)`, que acha o `activeElement` mais fundo (atravessando shadow roots abertas e fechadas) e escreve o `valorPara(kind, …)` daquele campo (um `type=date` recebe `aaaa-mm-dd`). Em contenteditable usa `execCommand('insertText')`.
- **Mensagens:** `runtime.onMessage` responde com `sendResponse` + `return true` literal, **nunca Promise**: o Chrome só aceita Promise ali a partir do 148, e o Chromium do Playwright 1.59.1 é o 147. A mensagem `inserir` só é aceita no build `--mode e2e`.
- **Sem pessoa:** atalho, menu, Inserir e "Abrir caixa de entrada" geram e guardam uma antes de agir (o rodapé do 1a promete isso).
- **Menus:** `removeAll()` + recria em `runtime.onInstalled` e em `runtime.onStartup`. "Preencher", separadores, "Nova pessoa" e "Abrir caixa" em `['page', 'editable']` (o padrão `['page']` não aparece quando se clica num campo editável); `Inserir ›` e os 23 itens em `['editable']`. Com mais de um item visível o Chrome agrupa tudo sob o `name` do manifesto, por isso o nome é exatamente `piluvitu · dados de teste`. Os títulos `CPF · …` e `CEP · …` acompanham `pessoaItem.watch`.
- **Armazenamento:** `local:pessoa` guarda a pessoa inteira (não a semente: trocar uma lista de nomes não muda a pessoa já gerada), `version: 1`. Política: qualquer bump futuro migra para `null` e o usuário gera outra (é dado falso, não há nada a preservar). Nada em `sync:`. `hojeISO` é o dia civil de `America/Sao_Paulo`; a idade do popup é recalculada a partir de `nascimento.iso`.
- **Página proibida:** o popup decide só pela URL (`chrome:`, `chrome-extension:`, `edge:`, `about:`, `view-source:`, `devtools:`, `data:`, Chrome Web Store; `file:` sem "Permitir acesso a URLs de arquivo"). O activeTab sempre libera a URL da aba, sem a permissão `tabs`. O leitor de PDF só é detectado quando um "Preencher" falha (`contentType === 'application/pdf'` no frame 0 ou erro `Cannot access …` do `executeScript`).

## Escrita no DOM (o porquê de cada regra)

- **Mundo ISOLATED + setter nativo do protótipo + `input`/`change` com `{bubbles: true, composed: true}`**: medido no laboratório em React 19/18, react-hook-form, Vue 3, imask, react-imask, maska, @react-input/mask, react-number-format e jQuery Mask. No mundo MAIN uma atribuição simples quebra o React (o rastreador de valor engole o `onChange`).
- **Foco sintético, nunca `el.focus()`/`el.blur()`**: com o popup aberto a página não tem foco, e assim popup, atalho e menu seguem o mesmo caminho. Validadores de `blur` e o `onBlur` do React (que escuta `focusout`) recebem os eventos sintéticos: coberto no E2E de `react.pagina.tsx`.
- **Nunca caractere a caractere**: quebra o @react-input/mask e embaralha o jQuery Mask.
- **`maxlength` decide antes de escrever**: escrita por script não respeita `maxlength`. O `valorPara` escolhe o formato que cabe; se nada cabe (senha de 12 num `maxlength=6`), o campo vai para "recusados" sem ser escrito nem truncado.
- **Valor igual não é escrito de novo**: evita disparar outra vez a busca de CEP do site.
- **Lê de volta**: se nem o valor nem os dígitos batem, o campo vai para "recusados" (o rótulo ganha " (recusou o valor)").
- **Visibilidade**: `checkVisibility({opacityProperty, visibilityProperty, contentVisibilityAuto})`, ancestral `aria-hidden` (o honeypot do Mailchimp), menos de 2 px, fora do documento. `<select>` escondido conta: o select2 escuta o `change` dele.

## Aviso na página (1f)

CSS próprio em px (`preencher.content/aviso.css`, variáveis `--pv-*` com os valores dos tokens copiados), DOM puro (`aviso-dom.ts`, sem React e sem `innerHTML`), montado por `createShadowRootUi(ctx, { name: 'piluvitu-aviso', position: 'inline', anchor: 'html', css })` só no frame 0. **Não usa `@piluvitu/ui` nem Tailwind** porque, medido numa página hostil: o `--primary` do site vazou para dentro do aviso (os tokens do pacote estão em `:root`/`.dark`, nunca em `:host`); o `rem` seguiu o `font-size` do site; `@property` não funciona em shadow root; e o WXT move `@property`/`@font-face` para o `<head>` do site (wxt#1955). `anchor: 'html'` para um `transform` no `body` do site não capturar o `position: fixed`. Contornos: ciano sólido `#38bdf8` e âmbar tracejado `#f5b82e` com `!important`; o contraste sobre branco é baixo (2,1:1 e 1,8:1) e fica assim (ferramenta de dev, quem carrega a informação é o aviso). Saem com o aviso ou no primeiro `pointerdown`/`focusin` **do usuário** (`isTrusted`) num campo; frames filhos limpam sozinhos em 4 s.

## Popup

- `html, body { width: 380px }`, shell com `max-h-[600px]`, meio rolando e chips `sticky`.
- O Chrome injeta `body { font: 12px system-ui }` nas páginas de extensão **fora de `@layer`**, o que vence o `@layer base` do Tailwind: por isso a regra do `body` em `src/styles.css` fica fora de `@layer`, com `line-height: normal` (é o que faz a altura bater com o design).
- `tema.ts` é o primeiro import de `main.tsx` (o CSP do MV3 não aceita script inline no `<head>`); o tema segue o `prefers-color-scheme`, sem botão.
- O `Button` do `@piluvitu/ui` não tem `gap`: toda chamada com ícone leva `gap-2`; no `sm`, `rounded-[14px] text-[13px]`.
- Fontes empacotadas por fontsource (`--font-plus-jakarta`/`--font-jetbrains` apontando para as famílias "Variable"); Font Awesome com `config.autoAddCss = false` e o CSS importado no `styles.css`.
- O atalho exibido vem de `commands.getAll()`; vazio (tecla tomada por outro app) ⇒ o rodapé vira "definir atalho" e o chip do botão some.

## Stack e configuração (armadilhas medidas)

- **`@vitejs/plugin-react` 5 direto, sem `@wxt-dev/module-react`**: o módulo puxa o plugin 6, que exige Vite 8, e o build quebra com `ERR_PACKAGE_PATH_NOT_EXPORTED './internal'` no Vite 7 do repo.
- **`minimum_chrome_version: '123'`**: o piso é o da API mais nova usada. `contextMenus.removeAll`/`update` só devolvem Promise a partir do 123 (no 121–122 devolvem `undefined` e o `.catch` de `atualizarTitulosMenu` lança); o `checkVisibility` com `opacityProperty`/`visibilityProperty`/`contentVisibilityAuto` pede 121. Ao usar API nova do `browser.*`, confira o "since Chrome N" nos tipos de `@wxt-dev/browser` e suba o piso (e o `manifesto.e2e.ts`).
- **`imports: false`**: tudo é importado explicitamente (`wxt/browser`, `wxt/utils/storage`, `wxt/utils/define-*`).
- **`wxt prepare &&` na frente de `lint`, `test` e `storybook`, nunca `postinstall`**: um `postinstall` que falhe derruba o `pnpm install` de **todos** os jobs do CI (e o deploy do finanças espera o CI).
- **`tsconfig.json`**: `jsx: react-jsx` (o gerado não traz) e `noUncheckedIndexedAccess: false` (o código cru de `@piluvitu/tools` não passa com essa flag, que o tsconfig gerado liga).
- **Content script**: `registration: 'runtime'` (nunca vai para `content_scripts`; sem `matches`, porque em runtime o WXT copiaria os `matches` para `host_permissions`); `cssInjectionMode: 'manual'` (com `'ui'` e sem `matches` o WXT declara o CSS em `web_accessible_resources` com `matches: []` e o Chrome recusa carregá-lo); `noScriptStartedPostMessage: true` (nenhum `postMessage` chega ao site em teste).
- **Gate do design system**: o `build` roda `check-tailwind-source.mjs` contra a pasta exata `.output/chrome-mv3`, nunca `.output` inteira (um `chrome-mv3-e2e` antigo tem o CSS de outro build e dá falso positivo). `@source not '../.output'` no `styles.css` **e** as linhas do `.gitignore` da raiz: sem elas o Tailwind colhe classes de builds antigos e o gate aprova `@source` quebrado. Não escreva o nome da classe sentinela em nenhum arquivo deste app; referencie `SENTINEL_SELECTOR` do script.
- **Modo e2e**: `wxt build --mode e2e` gera `.output/chrome-mv3-e2e` com `host_permissions: ['http://teste.local/*']`; o manifesto de produção nem tem a chave (o E2E `manifesto.e2e.ts` garante).
- **Dev**: `make dev-extensao` (porta 3018; `dev.reloadCommand: false` libera um dos 4 atalhos). O `wxt dev` acrescenta a permissão `tabs` e `host_permissions` de localhost: injeção funciona sem gesto em dev e esconde bug de activeTab. Comportamento real só com `make build-extensao` + carregar sem empacotar.

## Testes

| Camada                                                             | Ferramenta                                       | Onde                                                  |
| ------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------- |
| Lógica da extensão, background, componentes, DOM do content script | **Vitest** + `WxtVitest` + `fakeBrowser` + jsdom | `*.test.ts(x)` ao lado do fonte; `make test-extensao` |
| Estados visuais                                                    | **Storybook react-vite** próprio, porta 6018     | `*.stories.tsx` ao lado; `make storybook-extensao`    |
| Fluxos críticos                                                    | **Playwright** com a extensão desempacotada      | `*.e2e.ts` ao lado; `make test-e2e-extensao`          |

- **Vitest, e não Jest**, como no finanças: o WXT é Vite e o `fakeBrowser` vem pronto. Ele não implementa `contextMenus`, `commands`, `scripting`, `dom` nem `extension.isAllowedFileSchemeAccess`: os testes trocam essas funções por stubs com `Object.assign(fakeBrowser.<api>, …)`. O jsdom não tem layout, `checkVisibility`, `CSS.escape`, `isContentEditable` nem `execCommand`: `src/test/layout.ts` simula o layout, `src/test/setup.ts` dá o `CSS.escape`, e contenteditable fica no E2E.
- **Um segundo Storybook**: o do `apps/web` é webpack/Next e não enxerga o Tailwind deste app. As stories são só de props (sem `browser.*`), nos temas claro e escuro (barra "Tema" ou `globals: { tema: 'claro' }`). A story do aviso o monta numa página hostil.
- **Playwright**: `channel: 'chromium'` (sem ele o headless não carrega extensão; Chrome e Edge de marca removeram o `--load-extension`); páginas servidas por `context.route` em `http://teste.local`; a página React é empacotada pelo Vite em memória dentro do teste (o React 19 não publica UMD). Costuras só do build e2e: o popup aceita `?aba=<tabId>` (aberto como aba ele se enxerga como a aba ativa) e o background aceita a mensagem `{tipo: 'inserir'}`. Atalho e menu nativo não dá para acionar pelo Playwright: ficam nos testes Vitest dos handlers (`ouvintes.test.ts`).
- Os testes rodam no host, como nos outros workspaces: o repo não tem devcontainer.

## Comandos

| Comando                                 | O quê                                                 |
| --------------------------------------- | ----------------------------------------------------- |
| `make dev-extensao`                     | `wxt dev` na 3018 (carregar `.output/chrome-mv3-dev`) |
| `make build-extensao`                   | `wxt build` + gate em `.output/chrome-mv3`            |
| `make test-extensao`                    | Vitest                                                |
| `make test-e2e-extensao`                | build + build e2e + Playwright                        |
| `make storybook-extensao`               | Storybook na 6018                                     |
| `pnpm --filter @piluvitu/extensao lint` | `wxt prepare` + `tsc --noEmit` + `eslint .`           |

## Checklist manual (primeira carga sem empacotar, e a cada mudança em injeção, menu ou atalho)

1. `make build-extensao` e, em `chrome://extensions` (modo do desenvolvedor), "Carregar sem compactação" apontando para `apps/extensao/.output/chrome-mv3`.
2. Página de teste: `cd apps/extensao/src/entrypoints/preencher.content && python3 -m http.server 8019` e abrir `http://localhost:8019/cadastro.pagina.html`.
3. O gesto real que concede o activeTab, um de cada vez, recarregando a página entre eles:
   - clique no ícone → "Gerar pessoa" (se for a primeira vez) → "Preencher esta página": o aviso mostra "21 de 23 campos preenchidos";
   - `Alt+Shift+P` (`⌥⇧P` no Mac) **sem** abrir o popup: mesmo resultado;
   - botão direito em "Código de indicação" → `piluvitu · dados de teste › Inserir › CPF`: o CPF entra no campo.
4. Eventos de foco com o popup aberto: numa página com validação no `blur` (por exemplo um formulário com react-hook-form em `mode: 'onBlur'`), preencher pelo popup dispara a validação.
5. Ícone nítido na barra em tela Retina (usa o PNG de 32 px) e em tela 1× (16 px).
6. `chrome://extensions/shortcuts` mostra "Preencher esta página" com `Alt+Shift+P`; se outro app já usa a tecla, o rodapé do popup mostra "definir atalho".

## Riscos e limites conhecidos

- **CPF, CNPJ e celular gerados podem pertencer a gente real**: não existe faixa reservada. Fluxos que mandam SMS ou consultam bureau vão bater num desconhecido. Use só em localhost e staging.
- **A caixa de e-mail é pública** (`tuamaeaquelaursa.com`): quem souber o endereço lê. A extensão só abre `https://tuamaeaquelaursa.com/<usuario>` numa aba; a API do serviço nunca é chamada. Nunca para conta real.
- **O activeTab cai quando a aba navega**: a página seguinte de um fluxo precisa de um novo gesto (o atalho resolve).
- **iframe de outro domínio** (Stripe Elements, Pagar.me) fica de fora: o activeTab só concede a origem do frame de cima.
- **O `suggested_key` só vale na primeira instalação**: mudar o padrão depois não chega a quem já instalou.
- **Fora da v1**: checkbox e radio (inclusive "aceito os termos"), combobox sem `<select>` nativo, telefone fixo, nome da mãe, nome social, órgão emissor e UF do RG, CNPJ alfanumérico, campos que só habilitam depois da busca de CEP do site.
