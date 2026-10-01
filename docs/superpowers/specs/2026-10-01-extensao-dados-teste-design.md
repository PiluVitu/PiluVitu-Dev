# Extensão Chrome "piluvitu · dados de teste": design

- **Data:** 2026-10-01 · **Branch:** `feat/extensao-dados-teste`
- **Design visual:** projeto "Chrome extension test data" no Claude Design (`Popup Dados de Teste.dc.html`). Há uma cópia versionada e capturas de todos os estados em `docs/superpowers/design/2026-10-01-extensao-dados-teste/` (`1a…1j.png`, `1a…1f-claro.png`, `popup-dados-de-teste.dc.html`).
- **Pesquisa e protótipos:** `docs/superpowers/research/2026-10-01-extensao-dados-teste/`. Os geradores, o classificador, o `valorPara`, a camada DOM, os componentes do popup e o CSS do aviso já foram verificados lá. **O plano porta esse código, não reescreve.** Quando esta spec diz "verificado", a evidência está nos relatórios dessa pasta.
- **Origem:** é o terceiro subprojeto previsto em `2026-05-13-monorepo-go-design.md`, depois do site e da CLI.

## 1. Objetivo

Ferramenta de desenvolvimento que gera uma **pessoa brasileira de teste, falsa, coerente e válida** e **preenche formulários** de cadastro, checkout e cadastro PJ em localhost e staging.

**Sucesso:** abrir um formulário em qualquer site, apertar `Alt+Shift+P` (ou clicar em "Preencher esta página") e, em menos de 1 s, ver os campos reconhecidos preenchidos com a mesma pessoa. Os valores passam na validação do formulário: CPF, CNPJ, PIS e título com dígito verificador correto, CEP real com a rua e a cidade certas, e cartão de teste aceito em sandbox. O framework da página (React, Vue, máscaras) enxerga o valor.

## 2. Decisões tomadas com o dono

| Tema              | Decisão                                                                                                                                                                                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modo de preencher | **A:** um clique preenche a página inteira com uma pessoa. **B:** botão direito num campo → `Inserir › CPF / E-mail / CEP…`, como saída para o que a detecção errar.                                                                                                                                           |
| E-mail            | `<nome>-<sobrenome>-<4 dígitos>@tuamaeaquelaursa.com` (com traço: o site normaliza o nome da caixa para `[a-z0-9]` e traço, e não aceita ponto), uma caixa **pública**. A extensão só abre `https://tuamaeaquelaursa.com/<usuario>` numa aba nova. A API do serviço (protegida por Turnstile) nunca é chamada. |
| Distribuição      | Primeiro só o dono, com a extensão carregada sem empacotar. Depois o time, o que fica fora desta spec.                                                                                                                                                                                                         |
| Stack             | WXT + React 19 + `@piluvitu/ui`. Geradores e classificador ficam como lógica pura em `@piluvitu/tools`.                                                                                                                                                                                                        |
| Ícone             | **1i**: marca com cursor de texto sobre fundo ciano.                                                                                                                                                                                                                                                           |
| Tema do popup     | Segue o sistema (`prefers-color-scheme`), sem botão para trocar.                                                                                                                                                                                                                                               |
| Atalho            | `Alt+Shift+P`, exibido como `⌥⇧P` no Mac.                                                                                                                                                                                                                                                                      |

## 3. Fora do escopo da v1

- **Checkbox e radio, inclusive "aceito os termos".** Não vêm da pessoa, mudam o formulário e costumam ser justamente o que está sendo testado.
- **Iframe de outro domínio, como Stripe Elements e Pagar.me.** O activeTab não dá acesso a eles, e o estado 1d avisa disso.
- **Combobox customizado sem `<select>` nativo**, como o react-select.
- **Telefone fixo, nome da mãe, nome social, órgão emissor e UF do RG.** Ficam como "não reconhecido"; nunca recebem dado errado.
- **Escolha de gateway do cartão.** A v1 usa só os números de teste da Stripe.
- **CNPJ alfanumérico.** Os CNPJs gerados continuam só com números.
- **Retorno 1c depois de preencher pelo atalho ou pelo menu.** Nesse caso quem dá o retorno é o aviso na página.
- **Campos que só habilitam depois da busca de CEP do site** (fica para a v1.1).
- **Também fora:** Firefox, `wxt zip` e Chrome Web Store, sincronização entre aparelhos, leitura de e-mails pela API.

## 4. Arquitetura

```
packages/tools (@piluvitu/tools)        lógica pura, sem DOM, Jest. Cada módulo é exportado por subpath e fica fora do barrel
  aleatorio.ts  Rng injetável (o Prng do prng.ts serve) + rngPadrao (Math.random)
  uf.ts         UFs, região fiscal do CPF, código TSE do título
  cpf.ts cnpj.ts (alterados, compatíveis)   rg.ts  pis.ts  titulo-eleitor.ts
  celular.ts  nascimento.ts  senha.ts  nome.ts  endereco.ts  empresa.ts  cartao.ts
  pessoa.ts     gerarPessoa(rng, hojeISO) → Pessoa
  campos.ts     classificador: FieldDescriptor → {kind, confianca, via, dicas?} | null (+ passada de formulário)
  campos-formatar.ts  valorPara(kind, pessoa, descriptor, dicas?), caber(), escolherOpcao()

apps/extensao (@piluvitu/extensao)      WXT 0.21.4, MV3, srcDir 'src', entrypoints sempre em pasta
  src/entrypoints/
    background/        orquestra: atalho, menu, mensagens do popup, injeção, soma dos frames
    popup/             React + @piluvitu/ui (estados 1a–1e)
    preencher.content/ registration 'runtime': instala a API __pv (camada DOM + aviso 1f)
  src/components/      componentes de apresentação do popup (+ .stories.tsx + .test.tsx)
  src/lib/             armazenamento, menus, páginas proibidas, data de hoje
```

**Regra de fronteira:** tudo o que dá para testar sem navegador mora em `packages/tools`: geração, classificação e formatação de valor. A extensão é só a casca: injeta o script, varre o DOM, escreve, desenha o aviso e mostra o popup.

## 5. Geradores (`packages/tools`)

**Aleatoriedade injetável.** Cada gerador recebe `rng: Rng = rngPadrao` como primeiro argumento. Chamados sem argumento, `gerarCPF()` e `gerarCNPJ()` continuam iguais para o `apps/web` (`cpf-tool.tsx`, `cnpj-tool.tsx`, `tools.e2e.ts`). A extensão sorteia com `seedFromBytes(cryptoRandomBytes(16))`.

| Campo             | Regra                                                                                                                                                                                                                                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPF               | DV mod 11, como já é hoje. O 9º dígito é a região fiscal da UF do endereço. Se os 9 dígitos da base saírem iguais, sorteia de novo.                                                                                                                                                                               |
| CNPJ              | Algoritmo atual, filial `0001`.                                                                                                                                                                                                                                                                                   |
| RG                | Modelo da SSP-SP, porque não existe padrão nacional. Pesos 2..9; DV = 11 − resto, com 10 → X e 11 → 0. Por padrão não gera X.                                                                                                                                                                                     |
| PIS/NIS           | Pesos 3,2,9,8,7,6,5,4,3,2; DV = 11 − resto, com 10 e 11 → 0. Formato `000.00000.00-0`.                                                                                                                                                                                                                            |
| Título de eleitor | 8 dígitos sequenciais + código TSE da UF + 2 DVs. Para SP e MG, sorteia de novo quando algum resto dá 0: assim o número vale com e sem a exceção disputada.                                                                                                                                                       |
| Celular           | `(DD) 9XXXX-XXXX`, com o DDD do endereço.                                                                                                                                                                                                                                                                         |
| Nascimento        | Idade de 18 a 65 anos em relação a `hojeISO`, calculada só com calendário, sem fuso. Saídas: `iso`, `br` e `idade`.                                                                                                                                                                                               |
| Senha             | **12 caracteres** por padrão, garantindo maiúscula, minúscula, dígito e um símbolo de `!@#$%&*`. Sem caracteres ambíguos nem teclas mortas do ABNT2.                                                                                                                                                              |
| Nome e e-mail     | Listas de nomes F/M, com acentos, e 30 sobrenomes, que incluem o top 10 do IBGE 2022. Nome = prenome + S1 + S2 (S1 ≠ S2). O `email.usuario` é `slug(1ª palavra do prenome)-slug(S2)-NNNN`, e a caixa fica em `https://tuamaeaquelaursa.com/{email.usuario}`. A pessoa tem `sexo`.                                 |
| Endereço          | Catálogo embutido de **34 CEPs reais conferidos no ViaCEP**, cobrindo as 27 UFs. Cada CEP guarda a faixa de numeração e o lado (par ou ímpar), e o número sorteado fica dentro dela. Complemento no formato `Apto {andar}{unidade}`.                                                                              |
| Empresa           | Razão social `{S1} & {S2} {ramo} Ltda`, fantasia `{S2} {Dev\|Labs\|…}` e CNPJ.                                                                                                                                                                                                                                    |
| Cartão            | Números **documentados da Stripe**: Visa `4242 4242 4242 4242` e Mastercard `5555 5555 5555 4444`. Validade entre hoje + 12 e hoje + 59 meses, CVV de 3 dígitos, nome impresso tirado da pessoa (até 26 caracteres). **Não** usa número aleatório com Luhn: ele não passa em sandbox e pode cair num cartão real. |

**Coerência (`gerarPessoa`):**

- a região do CPF e o código do título correspondem à UF do endereço;
- o DDD do celular é o do CEP;
- o e-mail sai do nome;
- a empresa usa os sobrenomes;
- o nome impresso no cartão sai da pessoa.

A "pessoa dourada" (`sfc32(1,2,3,4)`, `'2026-10-01'`) é um _snapshot_: é atualizada de propósito quando um gerador muda. Mesma semente sempre gera a mesma pessoa.

**Por que não usar o `gen()` do design.** Rodando o protótipo, a pesquisa achou 5 bugs:

- o DV do RG está errado (91% saem inválidos);
- falta a regra de SP e MG no título;
- a senha não garante os 4 tipos de caractere (33% falham);
- o número do endereço sai da faixa do CEP;
- o cartão não passa em nenhum gateway.

A pessoa de exemplo `P0` do design também é inválida, então não serve como dado de teste.

## 6. Detecção e preenchimento

### 6.1 Classificador (puro, em `packages/tools`)

**Entrada:** `FieldDescriptor {tag, type, name, id, autocomplete, placeholder, label, ariaLabel, maxLength, pattern, inputMode, section, options?}`.

- O `label` sai de `el.labels`, do `<label>` que envolve o campo (sem o texto das `<option>`) e de `aria-labelledby`.
- A passada de formulário recebe também `hojeISO`. Não há ano fixo no código.

**Sinais, em ordem de prioridade:**

1. O token de `autocomplete` (gramática WHATWG) vale confiança 1.0. `off` é ignorado, e `*-password` só vale em `type=password`.
2. Regras regex em pt-BR e en sobre label, aria-label, name, id e placeholder, com o texto normalizado (camelCase separado, sem acento). Os pesos são 1.0 / 1.0 / 0.95 / 0.9 / 0.8, com bônus quando mais de uma fonte concorda.
3. O formato do placeholder (`___.___.___-__` → CPF etc.).
4. O `type` entra só como pista fraca. `type=tel` **não** quer dizer telefone: no Brasil ele é usado para abrir o teclado numérico em CPF e CEP.

**Passada de formulário.** Resolve os casos genéricos pelo contexto: seção (`fieldset > legend`), campos vizinhos, `maxLength` e as opções do `<select>`.

- "Nome" → nome completo, primeiro nome, nome no cartão ou razão social.
- "Número" → número do endereço, número do cartão ou **nenhum**.
- "Documento" → CPF ou CNPJ.
- Dia/mês/ano → nascimento ou validade do cartão.
- O 2º e-mail e a 2ª senha → confirmação.

**Limiar 0,5.** Abaixo disso o campo fica "não reconhecido".

**Vetos explícitos:** estado civil, nome da mãe, nome social, órgão emissor, UF e expedição do RG, telefone fixo, residencial ou comercial (a regra de celular ganha `not: /fixo|residencial|comercial/`), data de entrega, "melhor dia de vencimento" e "título" no sentido de cargo.

**Kinds:**

- os 23 do submenu `Inserir` do design (1g);
- os automáticos: primeiro nome e sobrenome, partes da data e da validade, DDD, `usuario` (= `email.usuario`), `sexo`, país, `enderecoCompleto`, `cidadeUf`, e confirmação de e-mail e de senha. Valores:
  - `enderecoCompleto` = `"{rua}, {número}, {complemento} - {bairro}, {cidade} - {uf}, {cep}"`;
  - `cidadeUf` = `"{cidade} / {uf}"`;
  - `sexo` num select tenta `F`, `Feminino`, `Mulher`, `Female` (ou o equivalente masculino);
- `ignorar`, para busca, captcha e OTP.

**Dicas da passada de formulário** (`dicas`, que o `valorPara` também recebe):

- `semDdd`: o celular vem logo depois de um campo DDD, então vai sem o DDD;
- `incluirNumero`: o formulário não tem campo de número, então ele vai junto com a rua.

**Contagem.**

- Só entram campos contáveis. Ficam fora `hidden`, checkbox, radio, file, botões, `select[multiple]`, campos disabled ou readonly, invisíveis e os classificados como `ignorar`. O `<select>` nativo escondido de widgets como o select2 **conta**.
- `Y = preenchidos + naoReconhecidos + recusados`.
- `X = preenchidos`, inclusive o campo que já tinha o valor certo.
- `k = naoReconhecidos + recusados`. É esse número que alimenta a lista "Não reconhecidos" do 1c, os segmentos tracejados, a 2ª linha do aviso e os contornos âmbar.
- Os números saem da 1ª passada: `__pv.preencher` responde quando ela termina, e a 2ª passada (§6.3) não muda X, Y nem k.
- Plural: no título concorda com Y ("1 de 1 campo preenchido"); na 2ª linha, com k ("1 não reconhecido").

### 6.2 Valor certo para cada campo (`valorPara`, puro)

O valor é escolhido **antes** de escrever, para caber no campo. Uma escrita feita por script não respeita `maxlength`.

- Usa o formato com máscara quando ele cabe em `maxLength` e em `pattern` (com a flag `v`). Senão, usa só os dígitos.
- `type=date` recebe `aaaa-mm-dd`, `type=month` recebe `aaaa-mm` e `type=number` recebe só dígitos.
- No `<select>`, procura nesta ordem:
  1. valor ou texto normalizados;
  2. igualdade numérica (`03` = `3`);
  3. token dentro do texto (`SP - São Paulo`).
  - Pula a opção de placeholder. Para UF tenta a sigla e o nome. Para país tenta `BR`, `BRA`, `076`, `Brasil` e `Brazil`.
- Senha maior que `maxLength` **não é truncada**: o campo vai para "recusados".

### 6.3 Escrita no DOM (extensão)

- **Roda no mundo ISOLATED**, o padrão do content script. Para cada campo:
  1. despacha `new FocusEvent('focus')` e `new FocusEvent('focusin', {bubbles: true, composed: true})`, **sem** chamar `el.focus()`;
  2. grava pelo setter nativo do protótipo (`HTMLInputElement.prototype.value`);
  3. dispara `input` e `change` com `{bubbles: true, composed: true}`;
  4. despacha `blur` e `focusout` do mesmo jeito, **sem** `el.blur()`.

  Os eventos de foco são sintéticos porque, com o popup aberto, a página não tem foco. Assim o caminho é igual no popup, no atalho e no menu.

- **O que foi testado.** O laboratório da pesquisa usou setter nativo + `input`/`change` com `el.focus()`/`el.blur()` reais, em React 19, react-hook-form, Vue 3, imask, react-imask, maska, @react-input/mask, react-number-format e jQuery Mask.
- **O que não foi testado.** Os eventos de foco sintéticos não foram testados. Eles ganham um caso no E2E (validador `onBlur` e react-hook-form com `mode: 'onBlur'`) e entram no checklist manual com o popup aberto.
- **Nunca digitar caractere a caractere**: isso quebra duas bibliotecas de máscara.
- **Valor igual não é escrito de novo.** Isso evita disparar outra vez a busca de CEP da página.
- **Depois de escrever, lê de volta.** Se nem o valor nem os dígitos batem, o campo vai para `recusados` (contagem no §6.1).
- **Visibilidade.** Pula honeypots, como o do Mailchimp. Um campo é tratado como invisível quando:
  - `checkVisibility({opacityProperty, visibilityProperty, contentVisibilityAuto})` diz que não está visível;
  - um ancestral tem `aria-hidden`;
  - mede menos de 2 px;
  - está fora do documento.

  `<select>` escondido é exceção: o select2 escuta o `change` do nativo.

- **Shadow DOM:** percorre raízes abertas e fechadas (`chrome.dom.openOrClosedShadowRoot`).
- **Iframes:** `allFrames: true`. Os de outro domínio ficam de fora sem erro, e o frame do topo conta quantos ficaram.
- **Seletor exibido no 1c.** Por ordem:
  1. `tag#id`, se o id é único na raiz;
  2. senão `tag[name="…"]`, se o name é único;
  3. senão `tag:nth-of-type(n)`.

  Dentro de shadow root ganha o prefixo `host › `. A pesquisa confirmou que essa regra gera exatamente `input[name="ref_code"]` e `select#origem`, como no design.

- **Busca de CEP do site (2ª passada, sem esperar resposta).**
  - Muitos formulários chamam o ViaCEP no `input` ou no `blur` do CEP e sobrescrevem rua, bairro e **complemento**.
  - Uns ~1 s depois, a mesma instância regrava só os campos que **nós** escrevemos e que o site mudou.
  - Isso não altera o resultado já devolvido (X de Y, 1c, aviso).
- **Preencher de novo** sobrescreve com a mesma pessoa. O `outline` original do site é salvo uma única vez, num WeakMap, e restaurado ao limpar.

## 7. Fluxos da extensão

**Injeção.**

1. **Toda ação injeta `/content-scripts/preencher.js` antes de chamar a API:** o modo A em todos os frames (`allFrames: true`) e o Inserir só no `info.frameId`.
2. "Mostrar na página" **não** reinjeta, para não perder o registro de campos.
3. Ao reinjetar, o WXT desmonta a instância anterior: aviso, timers da 2ª passada e contornos saem por `ctx.onInvalidated`. Assim, dois `Alt+Shift+P` seguidos nunca empilham avisos.
4. O `main()` sempre (re)atribui `globalThis.__pv` (`preencher`, `inserir`, `mostrar`, `aviso`) ligado ao `ctx` atual.
5. As ações são chamadas com `func` + `args`, porque a injeção por arquivo não aceita argumentos.
6. Opções do content script:
   - `cssInjectionMode: 'manual'`, porque o modo `'ui'` quebra com registro em runtime;
   - `noScriptStartedPostMessage: true`.
7. **Nenhum `data-*` é gravado no DOM do site.** O registro do "Mostrar" é um `Map<idx, WeakRef>` no mundo isolado.

**Preencher (modo A).** O popup, o atalho (`commands.onCommand('preencher-pagina')`) e o item de menu chamam `preencherPagina(tabId)` no **background**. Ele fica lá porque, se o popup fechar no meio, perderia a resposta. O background:

1. injeta o script;
2. chama `__pv.preencher(pessoa, hojeISO)` em todos os frames;
3. **soma** os resultados, ignorando frame que devolveu `null`;
   - cada linha leva `{documentId, idx, rotulo, seletor}`;
   - o frame 0 informa também `contentType` e quantos iframes ficaram de fora;
4. chama `__pv.aviso(resumo)` só no frame 0;
5. devolve a soma ao popup.

**Mensagens.** O listener de `runtime.onMessage` responde com `sendResponse` + `return true` (literal), nunca com uma Promise: o Chrome só aceita Promise a partir da versão 148, e o Chromium do Playwright é o 147.

**Inserir (modo B).** O Chrome não diz qual elemento recebeu o clique, mas o botão direito foca o campo. Então o background:

1. injeta no `info.frameId`;
2. pega o `activeElement` mais fundo, atravessando `shadowRoot.activeElement`;
3. monta o descriptor e escreve `valorPara(kind, …)`. Em contenteditable usa `execCommand('insertText')`.

**Falhas sem popup** (atalho, menu e Inserir) viram um aviso de uma linha no frame 0, no mesmo visual do 1f e sem a 2ª linha:

- "Não deu para inserir aqui: {motivo}" (textos no §8);
- "Nenhum campo nesta página" quando Y = 0;
- se nem o frame 0 aceita script (página proibida), nada acontece, e o popup aberto mostra o 1e. **Não há badge.**

**Mostrar na página (a mira do 1c).** Chama `__pv.mostrar(idx)` no `documentId` da linha. A página rola até o campo com `scrollIntoView({block: 'center'})` e o contorno âmbar pisca.

**Sem pessoa.** Atalho, menu, Inserir e "Abrir caixa de entrada" geram e guardam uma pessoa antes de agir, como o rodapé do 1a promete.

**Menus.** Em `runtime.onInstalled` e `runtime.onStartup`, chama `removeAll()` e recria. A estrutura vem do 1g:

```
Preencher esta página               contexts ['page', 'editable']
──────────                          separador, ['page', 'editable']
Inserir ›                           ['editable'] → 23 itens + 4 separadores entre os grupos, todos ['editable']
──────────                          separador, ['page', 'editable']
Nova pessoa                         ['page', 'editable']
Abrir caixa de entrada              ['page', 'editable']
```

- **Contexto `editable`:** o padrão `['page']` **não** aparece quando se clica num campo editável. E com um único item visível o Chrome não agrupa sob o nome da extensão. Isso foi verificado no código do Chromium, onde `page` já cobre iframes.
- **Títulos dinâmicos:** `CPF · {cpf}` e `CEP · {cep}` são atualizados por `pessoaItem.watch`. Sem pessoa guardada, aparecem só "CPF" e "CEP".
- **Nome do manifesto:** precisa ser exatamente `piluvitu · dados de teste`. É esse o nome que aparece no grupo.

**Armazenamento.** `storage.defineItem('local:pessoa', {fallback: null, version: 1})` guarda a **pessoa inteira**, não a semente. Assim, trocar uma lista de nomes não muda a pessoa já gerada.

- Se a versão mudar, a pessoa vira `null` e o usuário gera outra.
- Nada vai para `sync:`.
- `hojeISO` é calculado em `America/Sao_Paulo`.
- A idade exibida é recalculada a partir de `nascimento.iso`.

**Página proibida.** O activeTab sempre libera a URL da aba (verificado no código do Chromium), sem precisar da permissão `tabs`.

- **Ao abrir, o popup decide o 1e só pela URL, sem injetar nada.** A URL é proibida quando:
  - começa com `chrome:`, `chrome-extension:`, `edge:`, `about:`, `view-source:`, `devtools:` ou `data:`;
  - é da Chrome Web Store;
  - é `file:` e `extension.isAllowedFileSchemeAccess()` dá falso.
- **O leitor de PDF e outras recusas** só viram 1e quando um "Preencher" falha:
  - pelas mensagens de erro do `executeScript`;
  - ou porque o frame 0 devolve `contentType === 'application/pdf'`.

## 8. Popup (design → código)

**Quando cada estado aparece:**

| Situação                                                 | Estado                                                                                                                           | Pílula do host |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Página proibida (pela URL ou por "Preencher" que falhou) | 1e. Sem pessoa, o cartão de dados vira "Gerar pessoa". Em `file:` sem acesso, usa os textos da tabela "Textos novos ou trocados" | cadeado        |
| Sem pessoa guardada                                      | 1a                                                                                                                               | ponto ok       |
| Com pessoa                                               | 1b                                                                                                                               | ponto ok       |
| "Preencher" pelo popup com X + recusados ≥ 1             | 1c. A lista "Não reconhecidos" e a dica "Para esses…" só aparecem com k ≥ 1                                                      | ponto ok       |
| "Preencher" pelo popup com X + recusados = 0             | 1d. Com Y = 0, usa o texto de "sem formulário"                                                                                   | ponto warn     |

- **A pílula mostra o estado da página, não o da tela.** Fica com cadeado se a página é proibida, mesmo no 1b aberto a partir do 1e. Fica em warn depois de um preenchimento com X = 0. Nos outros casos, ok.
- **Navegação entre estados:**
  - "Ver os dados" (1c, 1d, 1e) leva ao 1b. Se a página é proibida, o "Preencher" do 1b continua desabilitado.
  - "Tentar de novo" (1d) preenche outra vez.
- **Rodapé.** O texto fica ao lado do `kbd` e muda por estado:

  | Estado | Texto                        | Extra                                                              |
  | ------ | ---------------------------- | ------------------------------------------------------------------ |
  | 1a     | "preenche sem abrir o popup" | —                                                                  |
  | 1b     | "preenche sem abrir"         | link "alterar" à direita, que abre `chrome://extensions/shortcuts` |
  | 1c     | "preenche de novo"           | —                                                                  |
  | 1d     | "preenche sem abrir"         | —                                                                  |
  | 1e     | sem rodapé                   | —                                                                  |

- **Atalho exibido.** Vem de `commands.getAll()`. Se vier vazio:
  - o rodapé inteiro vira só o link "definir atalho", com o mesmo destino;
  - o chip de atalho do botão "Preencher esta página" some.

**Implementação.** Os componentes de `research/…/popup/` já foram medidos pixel a pixel contra o design.

- **Tamanho:** `html, body { width: 380px }`, shell com `max-h-[600px]`.
  - Cabeçalho e rodapé fixos; o meio rola (`overflow-y-auto`); os chips de filtro ficam `sticky`.
  - A moldura do canvas não é desenhada, porque o Chrome já desenha a do popup.
- **CSS de entrada (`src/styles.css`):**
  - `@import` de `tailwindcss`, das fontes, de `@fortawesome/fontawesome-svg-core/styles.css` (obrigatório com `config.autoAddCss = false`) e de `@piluvitu/ui/styles.css`;
  - `@source '../../../packages/ui/src'` e `@source not '../.output'`.
- **Em `@layer base`, como em `apps/financas/web/src/styles.css`:**
  - `*, ::after, ::before, ::backdrop, ::file-selector-button { border-color: hsl(var(--border)) }` (o `@piluvitu/ui` não traz isso, e no Tailwind 4 a borda cairia em `currentColor`);
  - `:root { color-scheme: light } .dark { color-scheme: dark }`;
  - `body { @apply bg-background text-foreground antialiased }`.
- **Fora de `@layer`:** `body { font-family: var(--font-sans); font-size: 1rem; line-height: normal }`.
  - O Chrome injeta `system-ui 12px` nas páginas de extensão, e isso vence o `@layer base`.
  - O `line-height: normal` é o que faz a altura bater com o design.
- **Componentes do `@piluvitu/ui`:**
  - `Button` sempre com `gap-2` (o real não tem `gap`); no tamanho `sm`, `rounded-[14px] text-[13px]`;
  - `Avatar`/`AvatarFallback`;
  - `Card` com `rounded-[14px] shadow-none`.
- **Componentes locais:**
  - pílula do host, chips, `kbd`;
  - linha copiável: mostra "copiado" por 1,4 s sem deslocar o layout;
  - aviso de caixa pública, tile de ícone, segmentos de progresso.
- **Fontes empacotadas:** `@fontsource-variable/plus-jakarta-sans` e `jetbrains-mono`, com `--font-plus-jakarta` e `--font-jetbrains` apontando para as famílias "Variable".
- **Ícones:** Font Awesome 7 solid, nas mesmas faixas de versão do `apps/web`.
- **Tema:** `tema.ts` é o **primeiro import** de `main.tsx` (`matchMedia` + classe `.dark` no `<html>`). O CSP do MV3 não aceita script inline no `<head>`.

**Textos novos ou trocados:**

| Onde                     | Texto                                                                                                                                                            | Tipo                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1a, linha "cartão"       | "número de teste documentado, Luhn válido"                                                                                                                       | troca "faixa de sandbox, Luhn válido"                                               |
| 1b, nota do cartão       | "Número de teste documentado da Stripe. Passa no Luhn; só aprova em sandbox."                                                                                    | troca "Número de sandbox: passa no Luhn e é recusado por qualquer adquirente real." |
| 1c, item recusado        | "{rótulo} (recusou o valor)"                                                                                                                                     | novo                                                                                |
| 1d com Y = 0             | título "Nenhum formulário nesta página"; corpo "Não achei campos de formulário visíveis. Formulários dentro de iframe de outro domínio ficam de fora."           | novo                                                                                |
| 1e em `file:` sem acesso | título "Falta liberar o acesso a arquivos"; corpo "Em chrome://extensions, nos detalhes da extensão, ative 'Permitir acesso a URLs de arquivo' e tente de novo." | novo                                                                                |
| 1e sem pessoa            | "Gere uma pessoa para copiar os dados à mão." + botão "Gerar pessoa"                                                                                             | novo                                                                                |
| Singular                 | "1 de 1 campo preenchido", "Encontrei 1 campo, mas…", "1 não reconhecido"                                                                                        | novo                                                                                |
| Rodapé sem atalho        | "definir atalho"                                                                                                                                                 | novo                                                                                |
| Aviso de falha           | "Não deu para inserir aqui: nenhum campo em foco" / "…: iframe de outro domínio" / "…: o campo recusou o valor"; "Nenhum campo nesta página"                     | novo                                                                                |
| Aviso, botão de fechar   | ícone ×, `aria-label="Fechar"`                                                                                                                                   | vem do design                                                                       |
| Comando (`description`)  | "Preencher esta página"                                                                                                                                          | vem do 1j                                                                           |

## 9. Aviso na página (1f)

- **Montagem:** `createShadowRootUi(ctx, { name: 'piluvitu-aviso', position: 'inline', anchor: 'html', css })`, com `import css from './aviso.css?inline'`. Fica só no frame 0.
- **Não usa o `@piluvitu/ui` nem o Tailwind.** Testado numa página hostil:
  - o `--primary` do site vazou para dentro do aviso;
  - o `rem` seguiu o `font-size` do site;
  - `@property` não funciona dentro do shadow;
  - o WXT move `@property` e `@font-face` para o `<head>` do site (wxt#1955).
- **No lugar disso, CSS próprio** (`research/…/aviso/toast.css`):
  - ~50 linhas em **px**, com variáveis próprias `--pv-*` cujos valores de tema foram copiados dos tokens;
  - `:host { all: initial !important }`;
  - fonte do sistema e o mesmo `prefers-color-scheme`.
- **DOM puro** (`createElement`/`textContent`), sem React no content script.
- **Comportamento:**
  - fica 4 s e pausa com o mouse em cima, com uma barra fina mostrando o tempo;
  - tem um × para fechar;
  - o texto âmbar rola até o 1º campo não reconhecido **do frame 0**. Se não houver nenhum ali, não é clicável;
  - com k = 0, a 2ª linha some.
- **Contornos nos campos:** `outline` com `!important`.
  - Preenchido: ciano sólido `#38bdf8`. Não reconhecido ou recusado: âmbar tracejado `#f5b82e`.
  - Saem junto com o aviso, ou no primeiro `pointerdown`/`focusin` **do usuário** (`event.isTrusted`) dentro de um campo. Os eventos que a própria escrita dispara (§6.3, inclusive na 2ª passada) não contam.
  - Frames filhos limpam os próprios contornos depois de 4 s, sem seguir a pausa do aviso. Os valores originais do site são restaurados.
  - O contraste sobre branco é baixo (2,1:1 e 1,8:1). Fica assim mesmo: é ferramenta de dev, e quem carrega a informação é o aviso.

## 10. Ícone e manifesto

- **Ícone 1i.** Os 4 PNGs já renderizados em `research/…/icones/` são versionados em `public/icon/{16,32,48,128}.png`:
  - 16 px: versão ajustada ao pixel;
  - 32 e 48 px: redesenhados com retângulos em pixel inteiro;
  - 128 px: como no design.
- Não há script nem dependência para gerar os ícones.
- O `action.default_icon` vem da meta do `popup/index.html`, em JSON estrito.
- **Manifesto:**
  - `name`: `piluvitu · dados de teste`;
  - `version`: vem do `package.json`;
  - `minimum_chrome_version`: `"123"` (era `"121"`, o piso do `checkVisibility` com `opacityProperty`; subiu porque `contextMenus.removeAll`/`update` só devolvem Promise a partir do 123);
  - `permissions`: `activeTab`, `scripting`, `contextMenus`, `storage`;
  - **nenhum** `host_permissions` e nenhum `content_scripts`;
  - `commands.preencher-pagina`: `suggested_key` `Alt+Shift+P`, `description` "Preencher esta página".

## 11. Integração no monorepo

- **`pnpm-workspace.yaml`:** acrescentar `apps/extensao` (a lista é explícita).
- **Dependências** (lista completa):
  - de runtime: `@piluvitu/tools` e `@piluvitu/ui` (`workspace:*`), `react`/`react-dom` `^19.2.0`, `@fortawesome/fontawesome-svg-core` e `@fortawesome/free-solid-svg-icons` `^7.2.0`, `@fortawesome/react-fontawesome` `^3.3.0` (as faixas do `apps/web`), `@fontsource-variable/plus-jakarta-sans` e `@fontsource-variable/jetbrains-mono` `^5.3.0`;
  - de desenvolvimento:
    - `wxt` `0.21.4`;
    - `vite` `^7.2.0` e `@vitejs/plugin-react` `^5.1.0` direto, **sem `@wxt-dev/module-react`**, porque ele puxa o plugin 6, que exige Vite 8, e quebra o build;
    - `tailwindcss`/`@tailwindcss/vite` `^4.2.2`, `vitest` `^4.1.10`, `jsdom` `^27.0.0`, testing-library (`react`, `jest-dom`, `user-event`), `@types/react`/`@types/react-dom`, `typescript` `^5.9.3` e `prettier` nas faixas do financas;
    - a pilha de ESLint do `packages/ui`;
    - `@playwright/test` fixado em `1.59.1` e `storybook`/`@storybook/react-vite` fixados em `10.3.1`, que são as versões que o lockfile resolve para o `apps/web`. Com faixa solta, o pnpm resolveria Chromium e Storybook diferentes dos do `apps/web`;
  - nenhum pacote novo precisa de `allowBuilds`.
- **`wxt.config.ts`:**
  - `srcDir: 'src'`;
  - `imports: false` (importa explicitamente de `wxt/browser` e `wxt/utils/*`);
  - `webExt.disabled` e `dev.reloadCommand: false`;
  - `dev.server.port: 3018`.
- **Modo `e2e`:** `wxt build --mode e2e` gera em `.output/chrome-mv3-e2e`. Só nele o manifesto recebe `...(mode === 'e2e' && { host_permissions: ['http://teste.local/*'] })`. Assim o manifesto de produção nem tem a chave `host_permissions`, nem vazia.
- **Scripts:**
  - `wxt prepare &&` na frente de `lint`, `test` e `storybook`. **Sem `postinstall`:** se ele falhar, quebra o `pnpm install` de todos os jobs.
  - `build` = `wxt build && node ../../scripts/check-tailwind-source.mjs .output/chrome-mv3`. O gate aponta para a pasta exata, porque apontar para `.output` dá falso positivo com um `chrome-mv3-e2e` antigo.
- **`tsconfig.json`:** estende `.wxt/tsconfig.json` com `"jsx": "react-jsx"`, que o gerado não traz, e `"noUncheckedIndexedAccess": false`, porque o código cru de `packages/tools` não passa com essa flag.
- **`.gitignore` da raiz**, uma linha por caminho: `apps/extensao/.output/`, `apps/extensao/.wxt/`, `apps/extensao/storybook-static/`, `apps/extensao/playwright-report/` e `apps/extensao/web-ext.config.ts`. É questão de correção, não de limpeza: sem isso o Tailwind lê builds antigos e o gate passa sem medir nada.
- **Lint:** ESLint copiado de `packages/ui`, com override para as fixtures do Playwright e ignores, e `lint-staged` no `package.json` do app.
- **`packages/tools`:** ganha o script `lint` (`tsc --noEmit`). Hoje o `pnpm -r lint` pula o pacote.
- **Makefile:**
  - alvos `dev-extensao`, `build-extensao`, `test-extensao`, `test-e2e-extensao` e `storybook-extensao`;
  - portas 3018 e 6018 no `make stop`;
  - corrigir o `lint:`, que faz `cd ../promeia` (quebrado) em vez de `cd apps/promeia`.
- **CI:**
  - novo job `extensao` no `ci.yml`: lint → test → build + gate;
  - no job `web`, um passo novo `pnpm --filter @piluvitu/tools lint`, ao lado do teste que já existe;
  - **o E2E vai num workflow próprio**, `extensao-e2e.yml` (paths `apps/extensao/**` e `packages/tools/**`, `playwright install --with-deps --no-shell chromium`), fora do workflow `CI`. Assim ele não segura o deploy do finanças, que espera o `CI` passar, e ainda não foi rodado no Linux;
  - na descrição do `ci.yml` no `CLAUDE.md` raiz, trocar o job `api` (já removido) por `extensao`.
- **Documentação:**
  - `apps/extensao/CLAUDE.md` novo, sem escrever o nome da classe sentinela, com o checklist manual e a nota sobre dados que podem coincidir com reais;
  - linhas novas no `CLAUDE.md` raiz;
  - `packages/tools/CLAUDE.md`: módulos e subpaths;
  - `packages/ui/CLAUDE.md`: terceiro consumidor, com `@source` de profundidade 3.

## 12. Testes

| Camada                                | Ferramenta                                                                                                              | Cobre                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Geradores (`tools`)                   | **Jest**                                                                                                                | Vetores fixos por documento, com exemplos externos como o título da Wikipédia, o RG da ngmatematica e o CNPJ da Receita. 1000 sementes passando nos validadores do próprio pacote. Título de SP e MG válido nas duas regras. Pessoa dourada e mesma semente gerando a mesma pessoa. Coerência. Idade sempre entre 18 e 65 para todo dia de 2024 a 2032. Catálogo de endereços (27 UFs, número dentro da faixa). Senha com os 4 tipos. Cartão com Luhn e validade no futuro. |
| Classificador e `valorPara` (`tools`) | **Jest**                                                                                                                | Os ~80 vetores de campo e os 14 de formulário de `research/…/deteccao/campos.test.ts`, portados com 3 ajustes: #67 ("Telefone fixo") passa a esperar `null`, #77 ("Cidade / UF") passa a esperar `cidadeUf`, e F9/F12 conferem as `dicas`. Formatação por `maxLength`, `pattern` e `type`. Escolha de opção.                                                                                                                                                                |
| Background, armazenamento, popup      | **Vitest + `WxtVitest` + jsdom**                                                                                        | Handlers de atalho, menu e mensagem (com stub de `contextMenus`, `commands` e `scripting`, que o `fakeBrowser` não implementa). Soma dos frames. Geração automática sem pessoa. Títulos dinâmicos. Escolha de estado do popup. Linha copiável com mock de clipboard. Páginas proibidas. Importa `WxtVitest` de `wxt/testing/vitest-plugin` e `fakeBrowser` de `wxt/testing/fake-browser`.                                                                                   |
| Estados visuais                       | **Storybook react-vite** próprio (porta 6018)                                                                           | Stories só com props, sem `browser.*`, nos temas claro e escuro: 1a–1e, mais as variantes 1d sem campo, singulares, 1e sem pessoa, 1e de arquivo, 1b vindo do 1e (Preencher desabilitado) e rodapé sem atalho. O aviso 1f numa página hostil dentro de shadow root.                                                                                                                                                                                                         |
| Fluxos críticos                       | **Playwright** (`*.e2e.ts` ao lado do código, `channel: 'chromium'`, build `e2e`, páginas servidas por `context.route`) | Cadastro realista: X de Y, valores iguais aos da pessoa, honeypot intocado, campos React e com máscara. Validador `onBlur` e react-hook-form com `mode: 'onBlur'`. Busca de CEP simulada com `setTimeout` de 200 ms na página. Inserir. Mostrar na página. Popup → 1c.                                                                                                                                                                                                      |

**Costuras de teste** (só no build `e2e`, com `import.meta.env.MODE === 'e2e'`):

- o popup aceita `?aba=<tabId>` como aba-alvo. Aberto como aba, ele se enxerga como a aba ativa;
- o background aceita `{tipo: 'inserir', tabId, frameId, kind}` para o E2E chamar o mesmo `inserir()` do menu, com o campo focado por `page.focus()`;
- atalho e clique de menu não dá para acionar pelo Playwright. Eles ficam nos testes Vitest dos handlers;
- o E2E repete a checagem até os menus existirem.

**Build de produção.** `test:e2e` = `build && build:e2e && playwright test`. A garantia do build de produção é uma asserção sobre `.output/chrome-mv3/manifest.json`: `!('host_permissions' in manifest)` e `!('content_scripts' in manifest)`.

**Checklist manual.** Fica no `apps/extensao/CLAUDE.md` e é feito na primeira carga sem empacotar:

- o gesto real que concede o activeTab: clique no ícone, `Alt+Shift+P` e menu nativo;
- os eventos de foco com o popup aberto;
- o ícone em tela Retina.

**Exceções ao padrão do repo:**

- Vitest na extensão, como no financas: o WXT é Vite e o `fakeBrowser` vem pronto;
- um 2º Storybook, porque o do `apps/web` é webpack e não enxerga o Tailwind da extensão.

Os testes rodam no host, como nos outros workspaces: o repo não tem devcontainer.

## 13. Riscos e limitações conhecidas

- **CPF, CNPJ e celular gerados podem pertencer a gente real**, porque não existe faixa reservada. Fluxos que mandam SMS vão escrever para um desconhecido.
- **A caixa de e-mail é pública.** O popup avisa no próprio campo.
- **O activeTab cai quando a aba navega.** A página seguinte de um fluxo precisa de um novo acionamento, e o atalho resolve.
- **O `wxt dev` adiciona `tabs` e `host_permissions` de localhost**, o que esconde bugs de activeTab. O comportamento real se valida com `wxt build` carregado sem empacotar.
- **O `suggested_key` só vale na primeira instalação.** Se `Alt+Shift+P` já estiver em uso, o rodapé mostra "definir atalho".

## 14. Fases (um plano por fase, nesta ordem)

Os três planos são escritos juntos depois que a spec for aprovada e executados em sequência. Cada fase atualiza o `CLAUDE.md` do workspace que tocou.

1. **Geradores e classificador (`packages/tools`).**
   - Escopo: `aleatorio`, `uf`, geradores, `gerarPessoa`, `campos` e `campos-formatar`, portados da pesquisa, com Jest e o script `lint`. Não toca em nenhum app.
   - **Pronto quando** o Jest do tools e o do `apps/web` passarem sem mudar `cpf-tool`/`cnpj-tool`.
2. **Extensão preenchendo (o critério de sucesso).**
   - Escopo:
     - workspace, WXT, gate, ESLint, Makefile e job de CI;
     - armazenamento;
     - background com `preencherPagina`, atalho e o menu completo com Inserir;
     - content script: varredura, escrita, leitura de volta, visibilidade, shadow DOM e soma dos frames;
     - popup 1a/1b com o Storybook próprio;
     - aviso 1f e ícone;
     - Vitest e harness Playwright com as costuras;
     - E2E de cadastro e de Inserir.
   - **Pronto quando** o `Alt+Shift+P` preencher a página de teste com a extensão carregada sem empacotar.
3. **Retorno e acabamento.**
   - Escopo: 1c, 1d e 1e (+ `file:`), Mostrar na página, 2ª passada do CEP, avisos de falha, workflow `extensao-e2e.yml` e checklist manual.
   - **Pronto quando** todos os estados do design estiverem cobertos por story e E2E.
