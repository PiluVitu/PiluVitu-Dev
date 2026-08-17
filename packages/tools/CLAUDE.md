# CLAUDE.md — `packages/tools` (`@piluvitu/tools`)

Guidance for the **pure-logic package**. O Claude Code carrega este arquivo **junto** com o `CLAUDE.md` da raiz. Os **consumidores React** (UI das ferramentas) vivem em `apps/web` — ver `apps/web/CLAUDE.md`, seção "Tools dashboard".

## Propósito

`@piluvitu/tools` é **TypeScript puro, sem React/Next/DOM** — funções determinísticas testáveis em Jest e portáveis (CLI futura). É a camada de lógica por trás do dashboard `/tools` do web.

- **Fonte:** `packages/tools/src/*` — `cpf`, `cnpj`, `base64`, `json-format`, `jwt-decode`, `uuid`, `qr-encode`, `qr-decode`, e o módulo de entropia/roleta (`prng`, `entropy`, `roleta`). Barrel em `index.ts`; alguns expostos por subpaths.
- **Testes colocated:** `*.test.ts` ao lado do fonte (lei de colocation na raiz). `jest.config.ts` + `jest.setup.ts` (jsdom; `jest.setup.ts` injeta `webcrypto` pra `crypto.subtle`).
- **Rodar:** `pnpm --filter @piluvitu/tools test` ou `pnpm -r test` / `make test` na raiz.

## Módulo de entropia + roleta (lógica pura)

- **`prng`** — PRNG determinístico sfc32 + `seedFromBytes`.
- **`entropy`** — `toHex`/`fromHex`, `cryptoRandomBytes`, `mixEntropy`/`mixEntropyHex` — digest SHA-256 que **sempre** dobra um sample fresco de CSPRNG, então nunca fica mais fraco que `crypto.getRandomValues` mesmo com fonte de baixa entropia.
- **`roleta`** — `normalizeOptions`, `drawWinnerIndex` — sorteio puro determinístico a partir de um digest hex.

Exportados via subpaths (`@piluvitu/tools/prng|entropy|roleta`). Testados em Jest/jsdom.

> A captura de câmera, a roda visual e o logger client (`hooks/use-camera-entropy.ts`, `components/entropy/*`, `lib/log.ts`) são **UI** e ficam em `apps/web` — a imagem nunca sai do browser; só o hash de 32 bytes chega aqui/no backend.

## Módulo `money` (dinheiro)

`money.ts` — `parseBRL` (string BRL → centavos inteiros, aceita `'1.360,00'`/`'R$ 1.360,00'`/sinal negativo, nunca passa por float), `formatBRL` (formatação manual, byte-a-byte estável entre runtimes — não usa `Intl.NumberFormat`), `splitInstallments` (parcelamento com resto nas primeiras parcelas) e `sumCents`. Exposto via `@piluvitu/tools/money`.

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

## Dependency policy

Adição de deps segue a política da raiz (pnpm ≥ 11, `allowBuilds`, `minimumReleaseAge`). Manter o pacote **sem React/DOM** — se precisar de browser API, isso é UI e mora no web.
