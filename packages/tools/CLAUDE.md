# CLAUDE.md — `packages/tools` (`@piluvitu/tools`)

Guidance for the **pure-logic package**. O Claude Code carrega este arquivo **junto** com o `CLAUDE.md` da raiz. Os **consumidores React** (UI das ferramentas) vivem em `apps/web` — ver `apps/web/CLAUDE.md`, seção "Tools dashboard".

## Propósito

`@piluvitu/tools` é **TypeScript puro, sem React/Next/DOM** — funções determinísticas testáveis em Jest e portáveis (CLI futura). É a camada de lógica por trás do dashboard `/tools` do web.

- **Fonte:** `packages/tools/src/*` — `cpf`, `cnpj`, `base64`, `json-format`, `jwt-decode`, `uuid`, `qr-encode`, `qr-decode`, e o módulo de entropia/roleta (`prng`, `entropy`, `roleta`). Barrel em `index.ts`; alguns expostos por subpaths.
- **Testes colocated:** `*.test.ts` ao lado do fonte (lei de colocation na raiz). `jest.config.ts` + `jest.setup.ts` (jsdom; `jest.setup.ts` injeta `webcrypto` pra `crypto.subtle`).
- **Rodar:** `pnpm --filter @piluvitu/tools test` ou `pnpm -r test` / `make test` na raiz.
- **Tipos:** `pnpm --filter @piluvitu/tools lint` (`tsc --noEmit`), que também roda no job `web` do CI. Até 2026-10 o pacote não tinha `lint`: só era checado pelos apps que o importam, e o `pnpm -r lint` o pulava em silêncio.

## Módulo de entropia + roleta (lógica pura)

- **`prng`** — PRNG determinístico sfc32 + `seedFromBytes`.
- **`entropy`** — `toHex`/`fromHex`, `cryptoRandomBytes`, `mixEntropy`/`mixEntropyHex` — digest SHA-256 que **sempre** dobra um sample fresco de CSPRNG, então nunca fica mais fraco que `crypto.getRandomValues` mesmo com fonte de baixa entropia.
- **`roleta`** — `normalizeOptions`, `drawWinnerIndex` — sorteio puro determinístico a partir de um digest hex.

Exportados via subpaths (`@piluvitu/tools/prng|entropy|roleta`). Testados em Jest/jsdom.

> A captura de câmera, a roda visual e o logger client (`hooks/use-camera-entropy.ts`, `components/entropy/*`, `lib/log.ts`) são **UI** e ficam em `apps/web` — a imagem nunca sai do browser; só o hash de 32 bytes chega aqui/no backend.

## Módulo `money` (dinheiro)

`money.ts` — `parseBRL` (string BRL → centavos inteiros, aceita `'1.360,00'`/`'R$ 1.360,00'`/sinal negativo, nunca passa por float), `formatBRL` (formatação manual, byte-a-byte estável entre runtimes — não usa `Intl.NumberFormat`), `formatBRLSemCentavos`, `splitInstallments` (parcelamento com resto nas primeiras parcelas) e `sumCents`. Exposto via `@piluvitu/tools/money`.

### `formatBRLSemCentavos` — o formatador que existe por uma MEDIDA

`R$ 21.123`. Nasceu pra caber num card de grid de 2 colunas a 390px (Android do dono). **MEDIDO em Chrome real a 390×844:** `R$ 21.122,50` a 24px pede **155,5px** e a caixa útil de um card ali é **137px** — a linha **quebra em duas** (confirmado com `Range.getClientRects()`, não estimado). Sem os centavos o mesmo valor mede **118,8px** e cabe numa linha só.

⚠️ **Mora AQUI, não num `lib/` da SPA, e a razão não é conveniência: dinheiro tem UM formatador neste monorepo.** Uma segunda função de formatar dinheiro fora deste módulo é uma segunda separação de milhar, um segundo `R$ `, um segundo tratamento de sinal — a classe de cópia que já custou caro (`todayInTeresina`, `normalizeName`). Some-se o alcance: o Worker (`apps/financas/src`) já importa `@piluvitu/tools/money` e **não** enxerga `web/src/lib`; local, esta função nasceria inalcançável pra ele.

⚠️ **ARREDONDA, não trunca — e arredonda a MAGNITUDE.** Nada torna a operação aditiva: uma coluna de partes sem centavos **não** soma exatamente o total sem centavos, e o que se escolhe é só o TAMANHO do desencontro. Arredondar erra ≤ 50 centavos por valor e os erros se **cancelam** (uns pra cima, outros pra baixo); truncar erraria até 99 e todo erro iria pro **mesmo lado**, acumulando — uma lista de 8 linhas divergiria ~R$ 7 do total, sempre com o total parecendo maior que a soma do que está na tela. É também o arredondamento que o resto do módulo já usa (`pct_of_fixed_net` em `domain/reports.ts`, o float→centavos de `domain/pluggy-map.ts`).

⚠️ **`Math.round` na magnitude, nunca no valor com sinal** — `Math.round(-0.5)` é `-0` e `Math.round(0.5)` é `1`, então arredondar com sinal faria meio real cair pra lados diferentes conforme a direção (mesma lição já paga em `domain/pluggy-map.ts`). E `-0` nunca chega à tela: 49 centavos negativos viram `R$ 0`, não `-R$ 0`.

**Testes:** os DOIS lados da fronteira do meio real (`,49` desce / `,50` sobe — só um deles não distingue arredondar de truncar), o espelho no negativo, o `-R$ 0`, e **dois casos que documentam a não-aditividade** em vez de escondê-la: um em que a soma das partes exibidas diverge do total exibido (com a asserção de que o erro por parte é ≤ 50 centavos) e um em que arredondar faz partes e total baterem exatamente onde truncar divergiria em R$ 7. ⚠️ **Verificado por mutação:** trocar `Math.round` por `Math.trunc` derruba **8** testes; arredondar com sinal (`Math.abs(Math.round(cents / 100))`) derruba **2**.

**`packages/tools`: 147 → 158 testes.**

## Módulo `simulacao` (confronto reserva × ativo que deprecia, fatia ⑦ Task 4)

`simulacao.ts` — o pedido literal do dono (fundo de emergência como prioridade matemática absoluta, antes de qualquer ativo que deprecia), na forma de duas funções puras que `apps/financas/web/src/pages/reserva.tsx` consome lado a lado. Aritmética, não conselho: nenhuma das duas funções (nem a tela que as chama) escreve "não compre" — o julgamento fica com quem lê o número.

- **`simulateCashPurchase(amountCents, saldoCents, fixedCost): CashPurchaseSimulation | null`** — quantos meses de reserva um valor à vista consome (`monthsConsumed`) e a faixa de sobrevivência resultante depois de gastar (`survivalAfter`, sobre `saldoCents - amountCents`, sem clamp em zero — sobrevivência negativa é informação real, não caso de borda a esconder). `null` quando `fixedCost.max === 0` (nenhum custo fixo pra comparar) — as mesmas duas mentiras que `emergencyStatus` (`apps/financas/src/domain/reserve.ts`) já evita: nunca `Infinity`, nunca `0`.
- **`simulateFinancedPurchase(totalCents, monthsCount, fixedNetCents): FinancedPurchaseSimulation`** — parcela via `splitInstallments` desta mesma pasta (resto nas primeiras, nenhum centavo perdido ou inventado), quantos meses, e `pctOfFixedNet` arredondado com a mesma regra de `domain/reports.ts#commitments` do Worker (`Math.round((cents*100)/fixedNet)`). `fixedNetCents` é sempre parâmetro — a função não hardcoda R$3.600 nem tem opinião sobre qual renda usar; é o chamador (a tela) quem decide, e `apps/financas/CLAUDE.md` documenta por que isso importa (nunca medir contra o líquido com freela).
- **`FixedCostRange`/`MonthsRange`** espelham `FixedCostRange` de `domain/reserve.ts` (Worker) — duplicado aqui de propósito, mesmo motivo de `lib/dates.ts`/`lib/commitments.ts` (SPA) duplicarem tipo do domínio: este pacote não atravessa a fronteira Worker/bundle.
- Testado com os números REAIS do caso que motivou a fatia inteira: R$13.000 à vista, R$96.000 em 72x (`simulacao.test.ts`). A inversão min/max (dividir pelo custo MÁXIMO dá o número MENOR) é testada com faixa assimétrica, deixando explícito no comentário que trocar os divisores quebraria a asserção.

Exposto via `@piluvitu/tools/simulacao`.

## Módulo `regras` (motor de categorização automática, `apps/financas`)

`regras.ts` — o matcher declarativo por trás das regras de categorização do finanças (tabela `rules`, migration `0009`). `Regra` (espelha 1:1 a linha da tabela), `normalizarParaRegra`, `regraCasa`, `ordenarRegras`, `aplicarRegras`. Exposto via `@piluvitu/tools/regras`.

⚠️ **Mora AQUI, e não em `apps/financas/src/domain/`, por um motivo específico: é o único módulo deste pacote cujos dois consumidores estão dos DOIS lados da fronteira Worker/SPA.** O Worker precisa dele pra contar quantos lançamentos existentes cada regra casaria (`GET /api/rules/matches`); a SPA precisa dele pra sugerir na conferência do import (que roda 100% no navegador, porque o Worker nunca vê o arquivo). Não há import entre os dois bundles — a mesma fronteira que já obrigou `todayInTeresina`/`normalizeName` a existirem em duas cópias. **Uma segunda cópia de um MATCHER seria pior que as duas anteriores:** cópias de formatação divergem e alguém nota; cópias de matching divergem e a tela passa a sugerir categoria diferente da que o contador prometeu, em silêncio.

- **`aplicarRegras` devolve o que MUDARIA, nunca grava** — é essa forma (entrada → efeito descrito, mais a trilha de quais regras casaram) que permite mostrar ao dono o que vai acontecer antes de confirmar.
- ⚠️ **Conflito é o caso comum:** todas as regras que casam se aplicam, em `priority` ASC, e a última vence POR CAMPO. O desempate tem TRÊS partes (`priority`, `created_at`, `id`) — ordem parcial faria o mesmo conjunto de regras produzir resultados diferentes entre execuções.
- ⚠️ **A faixa de valor compara MAGNITUDE (`Math.abs`)**, porque `transactions.amount_cents` é negativo pra despesa; com sinal, a faixa seria invertida e vazia. O sinal tem condição própria.

O porquê de cada coluna, a precedência contra `payees.default_category_id` e a tela vivem em `apps/financas/CLAUDE.md` § _Regras de categorização_ — aqui fica só o que é do pacote.

## Módulo `import` (parsers de extrato/fatura, fatia ②)

`src/import/` — parsers puros para o import de CSV/OFX (`docs/superpowers/specs/2026-07-27-financas-import-design.md`). O arquivo é sempre lido no navegador (nunca sobe pro Worker); estas funções só transformam texto já em memória.

- **`index.ts`** — tipo compartilhado `LinhaImportada` (`imported_id`, `purchase_date` `'YYYY-MM-DD'`, `amount_cents` centavos inteiros, `description`). Datas são tomadas **como escritas na fonte**, nunca reconstruídas via `Date`/UTC (fuso já deslocou compra de 22h pro dia seguinte uma vez neste projeto — não de novo).
- **`ofx.ts`** — `parseOfx(texto)`. OFX real de banco brasileiro é SGML (tags de dado não fecham), não XML — o parser lida com os dois dialetos. `imported_id` vem do `FITID` (único por conta, garantido pelo banco). Descrição usa fallback `MEMO` → `NAME` → `'(sem descrição)'` (nunca lança por causa de descrição ausente — bancos reais deixam `MEMO` vazio em tarifa, ou só preenchem `NAME`).
- **`csv.ts`** — `parseCsv(texto, mapa: MapaColunas)`. **Sem autodetecção de layout de colunas** — o dono mapeia data/valor/descrição por índice de coluna uma vez por banco (UI da task 4), porque adivinhar layout erra em silêncio. O **delimitador** (`,` ou `;`) é a única coisa detectada automaticamente: conta ocorrências de `;` vs `,` na 1ª linha do arquivo e usa o que aparecer mais (critério burro de propósito, sem heurística de desempate — empate cai pro padrão `,`). Existe porque bancos brasileiros comumente usam `;` justamente pra não colidir com a vírgula decimal do BRL — com `;`, valores como `1.234,56` não precisam de aspas. Split de linha é consciente de aspas (RFC4180) **para os dois delimitadores**: campo entre aspas pode conter o próprio delimitador. Valor reusa `parseBRL` de `money.ts` (não reimplementa); aceita negativo com sinal e com parênteses (`(1.234,56)`). Retorna `LinhaCsv` (= `LinhaImportada` **sem** `imported_id` — CSV não tem id natural, quem preenche é `idEstavel`). O `imported_id`/hash depende só dos dados (data/valor/descrição), nunca da pontuação do arquivo — reexportar o mesmo extrato com `;` em vez de `,` continua gerando o mesmo id (testado).
- **`id.ts`** — `idEstavel(linha): Promise<string>`. Hash SHA-256 (WebCrypto, hex) de `data|valor_centavos|descrição normalizada` — é o `imported_id` sintético do CSV. Determinístico por construção (mesma entrada ⇒ mesmo hash, em qualquer processo/máquina). ⚠️ **Limitação aceita, não escondida**: duas compras genuinamente diferentes com mesma data/valor/descrição colidem no mesmo hash — a tela de conferência (task 5) mostra o que foi considerado duplicata e deixa o dono forçar. Note que a mesma colisão existe pra OFX (dois `FITID` iguais no mesmo extrato é defeito do banco, não deste parser) — a limitação é do CONCEITO de id-por-conteúdo, não exclusiva do hash de CSV.
  - **A disambiguação NÃO mora aqui — é responsabilidade do consumidor** (`apps/financas/web/src/pages/importar.tsx#prepararConferencia`/`idParaEnvio`, documentado em `apps/financas/CLAUDE.md` § _Tela de import_). `idEstavel` permanece puro (só a função hash, sem noção de posição no arquivo nem de "forçado"); é a SPA quem, ao montar a conferência, dá a cada colisão DENTRO do mesmo arquivo um sufixo `:occ:N` por posição de parse (1ª ocorrência mantém o id cru), e quem, ao forçar uma duplicata, envia o id com um sufixo **literal** `:forcado` — nunca `Date.now()`/contador em memória. O motivo do sufixo ser literal: se fosse variável, cada reimportação do mesmo arquivo geraria um id de força NOVO, criando uma linha fantasma a cada repetição — duplicação silenciosa no único fluxo cujo propósito é impedir exatamente isso. `idEstavel` continua sendo o único lugar de onde o id-base sai; os dois sufixos só existem depois, no consumidor.

Exposto via subpaths próprios no `exports` do `package.json` (`@piluvitu/tools/import`, `/import/ofx`, `/import/csv`, `/import/id`). `import`/`import/ofx` também passam pelo barrel `src/index.ts` (`export *`, mesmo padrão do resto do pacote); `csv.ts`/`id.ts` ficam **só** no subpath — decisão deliberada da task 2, pra manter o import granular por consumidor em vez de crescer o barrel indefinidamente.

## Pessoa de teste e classificador de campos (extensão de dados de teste)

Lógica pura da extensão `apps/extensao` (spec `docs/superpowers/specs/2026-10-01-extensao-dados-teste-design.md`; nomes e tipos fixados em `docs/superpowers/plans/2026-10-01-extensao-interfaces.md`), portada dos protótipos verificados em `docs/superpowers/research/2026-10-01-extensao-dados-teste/`. Cada módulo é exportado **só por subpath**, com o nome do arquivo (`@piluvitu/tools/rg` → `src/rg.ts`). Nada entra no barrel.

### Aleatoriedade injetável

- `aleatorio`: `type Rng = Pick<Prng, 'int'>` (o `Prng` de `prng.ts` serve direto) e `rngPadrao` (`Math.random`). Todo gerador recebe `rng: Rng = rngPadrao` como 1º argumento; a extensão sorteia com `seedFromBytes(cryptoRandomBytes(16))`.
- **`gerarCPF()` e `gerarCNPJ()` sem argumento continuam iguais** para o `apps/web` (`cpf-tool.tsx`, `cnpj-tool.tsx`, `tools.e2e.ts`). Não passe um gerador direto como handler (`onClick={gerarCPF}`): o evento viraria o `rng`.
- Os testes sorteiam com `src/rng-teste.ts` (`sementes(n)`, `sequencia([...])`, `minimo`, `maximo`), que não tem subpath e não é código de produção.

| Subpath          | O que tem                                                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aleatorio`      | `Rng`, `rngPadrao`, `escolher`, `embaralhar`, `digitosAleatorios`, `somenteDigitos`                                                                                                                                                                      |
| `uf`             | `UFS`, `UF`, `CODIGO_UF_TITULO` (tabela do TSE; exterior `ZZ` = `28`), `REGIAO_FISCAL_CPF` (folheto da Receita), `UF_NOME`                                                                                                                               |
| `cpf`            | `gerarCPF(rng?, uf?)`: com `uf`, o 9º dígito é a região fiscal; base com os 9 dígitos iguais é sorteada de novo                                                                                                                                          |
| `cnpj`           | `gerarCNPJ(rng?)`, filial `0001`, só dígitos. O CNPJ alfanumérico (jul/2026) fica fora: `validarCNPJ` ainda o recusa                                                                                                                                     |
| `rg`             | `gerarRG(rng?, {permitirX?})` no modelo da SSP-SP (`NN.NNN.NNN-D`, pesos 2..9, DV = 11 − resto, 10 → X, 11 → 0), porque o RG não tem padrão nacional. Por padrão não gera X. `validarRG`, `dvRGSP`                                                       |
| `pis`            | `gerarPIS`, `validarPIS`, `dvPIS` (`000.00000.00-0`)                                                                                                                                                                                                     |
| `titulo-eleitor` | `gerarTituloEleitor(rng, uf \| 'ZZ')`, `validarTituloEleitor(v, regra)`. Em SP e MG só sai número válido **com e sem** a exceção disputada (resto 0 → 1), porque os validadores populares divergem nela                                                  |
| `celular`        | `gerarCelular(rng, ddd)` → `{ddd, numero, formatado, digitos, e164}`, no formato `(DD) 9XXXX-XXXX`                                                                                                                                                       |
| `nascimento`     | `gerarNascimento(rng, hojeISO)`: idade de 18 a 65 no `hojeISO`, só calendário (`Date.UTC`, sem fuso). `lerDataISO` lança em data inexistente                                                                                                             |
| `senha`          | `gerarSenha(rng, tamanho = 12)`: maiúscula, minúscula, dígito e um de `!@#$%&*`, começa por letra, sem caractere ambíguo nem tecla morta do ABNT2                                                                                                        |
| `nome`           | `gerarNome` (prenome + 2 sobrenomes distintos, `sexo`, `noCartao` com até 26 caracteres) e `gerarEmail` (`usuario@tuamaeaquelaursa.com`, caixa **pública**)                                                                                              |
| `endereco`       | `LOGRADOUROS`: 34 CEPs reais conferidos no ViaCEP (as 27 UFs), cada um com a faixa de numeração e o lado. `gerarEndereco(rng, uf?)` só sorteia número dentro dela; complemento `Apto {andar}{unidade}`                                                   |
| `empresa`        | `gerarEmpresa(rng, sobrenomes)` → razão social `{S1} & {S2} {ramo} Ltda`, fantasia `{S2} {sufixo}` e CNPJ                                                                                                                                                |
| `cartao`         | **Só os números de teste da Stripe** (Visa `4242 4242 4242 4242`, Mastercard `5555 5555 5555 4444`); validade entre hoje + 12 e hoje + 59 meses, CVV de 3 dígitos. Número aleatório que passa no Luhn não aprova em sandbox e pode ser de um cartão real |

### `gerarPessoa(rng, hojeISO)` (`pessoa`)

- **Coerência:** a região do CPF e o código do título são os da UF do endereço; o DDD do celular é o do CEP; o e-mail sai do nome; a empresa, dos sobrenomes; o nome impresso no cartão, da pessoa. O RG é sempre `SSP/SP`, o modelo do gerador.
- **A ordem das chamadas a `rng` é contrato:** trocá-la muda a pessoa de toda semente.
- **Pessoa dourada** (`sfc32(1,2,3,4)`, `'2026-10-01'`) em `pessoa.test.ts`: é um snapshot de propósito. Quando um gerador muda, ela muda; a mudança é revista e o teste atualizado na mesma tarefa.
- Não tem campo `versao`: quem versiona a pessoa guardada é a extensão (`storage.defineItem(…, { version })`).

### Classificador (`campos`)

- `classificarFormulario(ds, hojeISO)` faz duas passadas. A 1ª pontua cada campo: token de `autocomplete` (gramática WHATWG) com confiança 1; regras regex pt-BR/en sobre label, aria-label, name, id e placeholder, com pesos 1 / 1 / 0,95 / 0,9 / 0,8 e bônus de 0,03 por fonte que concorda; formato do placeholder; e o `type` só como pista fraca (`type=tel` **não** quer dizer telefone: no Brasil ele abre o teclado numérico em CPF e CEP). A 2ª resolve os genéricos (`_nome`, `_numero`, `_documento`, dia/mês/ano, 2º e-mail, 2ª senha) pela seção, pelos vizinhos (±2), pelo `maxLength` e pelas opções do select. Devolve `{kind, confianca, via, dicas?}`, ou `null` abaixo de `LIMIAR = 0.5`.
- **Sem ano fixo:** os anos das opções de select são lidos contra o ano de `hojeISO`. `classificarCampo(d)` (um campo, sem formulário) roda sem ano, com essas pistas desligadas.
- **`FieldDescriptor`** é montado pela extensão: `label` junta `el.labels`, o `<label>` que envolve o campo (sem o texto das `<option>`) e `aria-labelledby`; `maxLength` vai `null` quando o atributo falta (o DOM dá `-1`); `section` é a `legend` do `fieldset` mais próximo.
- **Nunca dado errado.** O veto de telefone fixo, residencial ou comercial vale para **toda** fonte de celular: a regra, o formato `(00) 0000-0000`, o `type=tel`, o `autocomplete` com `home`, `work`, `fax` ou `pager`, e o `Número` resolvido pelo DDD (veto pela seção, pelo próprio campo ou pelo DDD). UF ou estado "emissor", "de expedição", "de emissão", "do RG" ou "da identidade" ficam de fora, e também um `UF` ou `Número` soltos numa seção "RG"/"Identidade" (senão o "Número" virava o número do endereço).
- **`Número` de telefone:** logo depois de um `ddd` ele vira `celular` com `semDdd`; solto numa seção de telefone ("Telefone", "Celular", "WhatsApp") fica não reconhecido. Sem isso, num formulário com endereço, o telefone recebia o número da casa. Custo aceito: numa seção mista ("Endereço e telefone") o número da casa também fica sem preencher.
- **Limites conhecidos (não bloqueiam):** fixo abreviado ("Tel. Res.", "Tel. Com.", `tel_res`) ainda vira celular, porque o veto só casa as palavras inteiras `fixo|residencial|comercial` ("Celular com DDD" impede tratar `com` sozinho como comercial); e um `UF` solto logo depois de "RG"/"Órgão emissor", fora de fieldset, ainda vira `uf`.
- Kind composto `cidadeUf`, para "Cidade / UF".

## Dependency policy

Adição de deps segue a política da raiz (pnpm ≥ 11, `allowBuilds`, `minimumReleaseAge`). Manter o pacote **sem React/DOM** — se precisar de browser API, isso é UI e mora no web.
