# CLAUDE.md — `packages/tools` (`@piluvitu/tools`)

Guidance for the **pure-logic package**. O Claude Code carrega este arquivo **junto** com o `CLAUDE.md` da raiz. Os **consumidores React** (UI das ferramentas) vivem em `apps/web` — ver `apps/web/CLAUDE.md`, seção "Tools dashboard".

## Propósito

`@piluvitu/tools` é **TypeScript puro, sem React/Next/DOM** — funções determinísticas testáveis em Jest e portáveis (CLI futura). É a camada de lógica por trás do dashboard `/tools` do web.

- **Fonte:** `packages/tools/src/*` — `base64`, `json-format`, `jwt-decode`, `uuid`, `qr-encode`, `qr-decode`, o módulo de entropia/roleta (`prng`, `entropy`, `roleta`) e o de PDF (`pdf`, `pdf-regras`). Barrel em `index.ts`; alguns expostos por subpaths. CPF e CNPJ saíram para o `@pilutech/botai-core` (npm, repo `PiluVitu/Botai`), que o `/tools` usa com versão exata.
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

## Módulo `pilulabs` (regras do catálogo PiluLabs e do Botaí)

`pilulabs.ts`, exposto só por `@piluvitu/tools/pilulabs`, sem `node:fs` e importável no cliente. Saiu do `apps/web/lib` (era o `pilulabs-regras.ts` mais `lojasPublicadas` e `fase`) porque mais de um app decide a mesma coisa: o `apps/web` (card da PiluLabs, formulário do admin) e o `apps/pilutech-site` (o selo do Botaí no cartão de projeto). A landing do Botaí (repo `PiluVitu/Botai`) tem uma cópia das regras de loja (`site/lib/pilulabs.ts`): mudou aqui, mude lá. O atalho da extensão (`TECLAS_DO_MANIFESTO`, `ATALHOS`) saiu para o `@pilutech/botai-core/atalhos`.

- `Loja`, `LOJAS` (ordem fixa) e `ehUrlDaLoja`: só `https:` no host exato da loja; `lojasPublicadas(urls)` e `fase(urls)` recebem as 4 URLs (`UrlsDasLojas`), e só URL válida conta.
- `TipoItem`, `TIPOS` (ordem da vitrine), `TIPO_PADRAO`, `ehHttps` e `ehDataValida`.
- `urlsDasLojas(item)`: as 4 URLs de loja de um item do CMS já lido pelo `yaml` (texto aparado; ausente, nulo ou não-texto vira vazio; YAML que não é objeto dá as 4 vazias). O `apps/pilutech-site` lê o `apps/web/content/pilulabs/botai/index.yaml` com ela, sem o reader do Keystatic.

## Módulo `contato` (e-mail dos projetos PiluTech)

`contato.ts`, exposto só por `@piluvitu/tools/contato`. Todo contato de projeto vai para `EMAIL_DA_PILUTECH` (`help@pilutech.com.br`), e `mailtoDaPilutech(projeto, assunto)` monta o `mailto:` com o assunto `[Projeto] Assunto`, para o dono filtrar no Gmail com `subject:Botaí`, `subject:Sombraí` ou `subject:PiluTech` (spec `docs/superpowers/specs/2026-10-02-pilutech-site-design.md` §6).

- O assunto vai por `encodeURIComponent`: UTF-8 em percent-encoding, espaço como `%20` (RFC 6068). Em `mailto:` o `+` é literal, e o `URLSearchParams` codificaria o espaço como `+`: não troque.
- Usado pelo `apps/pilutech-site` (`[PiluTech] Contato pelo site`) e, numa cópia, pela landing do Botaí (repo `PiluVitu/Botai`). Texto que só cita o endereço (a política, os termos e os textos das lojas, no repo do Botaí) continua com o e-mail puro.

## Módulo `ico` (favicon dos sites)

`ico.ts`, exposto só por `@piluvitu/tools/ico`, sem `node:fs`. `icoDePngs(pngs)` empacota PNGs num `.ico` (tipo 1, uma entrada de 32 bits por PNG, o PNG inteiro dentro, lado lido do IHDR; 256 px vira 0 no byte do lado) e `imagensDoIco(ico)` faz o caminho de volta, para os testes. Recusa lista vazia, arquivo que não é PNG e lado fora de 1 a 256 px. Usado pelo `/favicon.ico` do `apps/pilutech-site` (os PNGs do `ImageResponse`); a landing do Botaí (repo `PiluVitu/Botai`) tem uma cópia.

- Devolve `Uint8Array<ArrayBuffer>`: com o `Uint8Array` genérico do TypeScript 5.7, um `Uint8Array<ArrayBufferLike>` não entra no `new Response(...)`.

## Módulo `pdf` (ferramentas de PDF do `/tools`, base do editor)

Dois subpaths, separados de propósito pelo peso:

- **`@piluvitu/tools/pdf`** (`pdf.ts`), o único que importa o **pdf-lib** (1.17.1, versão exata): `contarPaginas(bytes)`, `mesclarPdfs(fontes, aoAvancar)`, `organizarPaginas(bytes, plano)`, `temCabecalhoDePdf(bytes)` e `ErroDePdf` (`motivo` + `indice` do arquivo). No `apps/web` só o Web Worker (`components/tools/pdf/pdf.worker.ts`) importa este subpath; um teste do web reprova qualquer outro import, porque ele poria o pdf-lib no bundle da página.
- **`@piluvitu/tools/pdf-regras`** (`pdf-regras.ts`), sem dependência: `TETO_TOTAL_EM_BYTES` (100 MB), `NOME_PADRAO_DO_PDF_FINAL`, o tipo `MotivoDoErroDePdf`, `cabemNoTeto` (aceita em ordem até o teto e segue tentando os menores), `fracaoDaMesclagem` (90% pela soma dos bytes já lidos, 10% para salvar) e `nomeDoPdfFinal` (tira barra, controle e os proibidos no Windows, põe `.pdf`, corta em 120). Do organizar: `TETO_DE_PAGINAS` (500), os tipos `Giro`, `PaginaDoPlano`, `SentidoDoGiro` e `LadoDoMovimento`, `GIROS`, `giroNormalizado` e as funções do estado (`planoInicial`, `girar`, `moverSelecionadas`, `apagar`, `extrair`, ver abaixo). É o que a UI importa.

**Como o arquivo é lido:**

- `nao_e_pdf` quando o `%PDF-` não aparece nos primeiros 1024 bytes (ISO 32000, anexo H). A extensão e o MIME não contam.
- `protegido` por `isEncrypted` depois do `load` com `ignoreEncryption: true`. A classe `EncryptedPDFError` do pdf-lib perde o nome na transpilação (sai `Error`), então não serve para `instanceof`. Se o parser quebra antes (object streams cifrados), o `/Encrypt` cru no arquivo decide entre `protegido` e `corrompido`. Conferido em 2026-11-16 com PDFs reais do PDFKit da Apple: com senha de abrir e só com senha de dono, os dois saem `protegido`.
- `corrompido` para qualquer outra falha do parser, do catálogo ou do `copyPages`; `sem_paginas` para PDF válido sem página. Ao salvar um documento vazio, o pdf-lib põe uma página em branco: o teste usa `addDefaultPage: false` para gerar o caso.
- `parseSpeed: Fastest` e `objectsPerTick: Infinity`: dentro do Worker não há tela para liberar, e o padrão do pdf-lib cede a vez a cada 100 objetos com `setTimeout`.
- **Um `copyPages` por arquivo**, nunca página a página: cada chamada tem o próprio cache de objetos, e copiar uma página por vez duplicaria fontes e imagens compartilhadas. O teste "não duplica a imagem…" pega a regressão (verificado por mutação).

**O teto de 100 MB vem de medida:** mesclar 4 PDFs de 25 MB (imagens sem compressão) no Node 22 deu 353 MB de pico (`/usr/bin/time -l`, peak memory footprint), cerca de 3,5 vezes a entrada; no navegador ainda entra o Blob do resultado. Com 100 MB o pico fica perto de 400–500 MB, que celular aguenta; acima disso a aba costuma ser fechada pelo sistema. O número aparece na tela com esse porquê.

### Organizar páginas (fase 2 do editor)

`organizarPaginas(bytes, plano)` monta um documento novo (`updateMetadata: false`, sem `Producer`/`Creator`/datas do pdf-lib) a partir de um **plano**: a lista `{ indice, giro }` na ordem final, com `indice` sendo a página no arquivo (a partir de 0) e `giro` em 0, 90, 180 ou 270. Uma função cobre as quatro ações: reordenar (a ordem do plano), apagar (a página fica fora do plano), girar e extrair (um plano só com as escolhidas).

- **Erros:** o arquivo segue as regras do `contarPaginas` (`ErroDePdf` com `nao_e_pdf`, `protegido`, `corrompido`, `sem_paginas`, sem `indice`). O plano errado é erro de programação, não do arquivo, e sai como `RangeError`: plano vazio, índice negativo, não inteiro, repetido ou depois da última página, e giro fora de 0/90/180/270. O plano chega ao Worker por `postMessage`, por isso a conferência é em tempo de execução, não só no tipo.
- **Rotação final** = `/Rotate` que a página já tem + `giro`, normalizada em 0..359. O `/Rotate` herdado da árvore de páginas conta (o `copyPages` já o põe na página copiada). O valor negativo ou acima de 360 normaliza, e o que não é múltiplo de 90 (ou nem é número) vale 0, a mesma regra do `get rotate()` do pdf.js 6.3.289: o PDF sai girado como a miniatura mostrou.
- **Um `copyPages` só, na ordem do plano**, pelo mesmo motivo do mesclar. Verificado por mutação: copiando página a página, o PDF do teste da imagem compartilhada vai a 2,4 MB, contra o limite de 1,5 vez a origem (451 KB), e o teste reprova.
- ⚠️ **As páginas fora do plano são esvaziadas antes da cópia** (fica só o `/Type`). Um link de uma página que fica (`/Dest` ou `/A` com a referência da página) leva o `PDFObjectCopier` até a página apagada, e ele copia o dicionário dela com `/Contents` e `/Resources`, solto no arquivo e fora da árvore de páginas. Sem esvaziar, o texto da página apagada continuava no PDF baixado (o teste `SEGREDO-DA-PAGINA-3` reprova sem a correção). A comparação é pelo objeto da página, não pelo índice, porque um `/Kids` malformado pode repetir a mesma página, e esvaziar a repetida esvaziaria a que fica (teste próprio, verificado por mutação).
- **Link interno não leva mais à página**, nem quando ela fica. Medido em 2026-11-16: o link aponta para uma cópia solta da página, fora da árvore, porque o `copyPages` copia a página pelo objeto e o link chega a ela pela referência, e o copiador faz uma cópia para cada caminho; se a página saiu, aponta para um `<< /Type /Page >>` vazio. Vale junto com o aviso de alcance do mesclar (marcadores não passam).

**Estado do organizar (`pdf-regras`, sem dependência):** `planoInicial(total)` dá `{ indice: i, giro: 0 }` para cada página (total negativo ou não inteiro: `RangeError`). `girar`, `moverSelecionadas`, `apagar` e `extrair` recebem **posições no plano atual** (não o índice do arquivo), em qualquer `Iterable` (array ou `Set`). Posição repetida conta uma vez, e posição fora do plano ou não inteira lança `RangeError`. Todas devolvem um plano novo, sem mudar o recebido (teste com `Object.freeze`).

- `girar(plano, posicoes, 'direita' | 'esquerda')`: direita soma 90 (horário, o sentido do `/Rotate`), esquerda tira 90; de 0 para a esquerda dá 270.
- `moverSelecionadas(plano, posicoes, 'antes' | 'depois')`: cada escolhida anda uma posição, sem trocar de ordem com as outras escolhidas. A que já está na ponta fica, e as outras andam até encostar nela, então apertar de novo junta as escolhidas na ponta, na ordem em que estavam. Um bloco contíguo anda junto. `depois` é o espelho de `antes`.
- `apagar` tira as posições; `extrair` devolve só elas, na ordem atual e com o giro. Os dois podem dar plano vazio, que o `organizarPaginas` recusa: a tela não oferece baixar sem página.
- O `indice` é único dentro de um plano (nenhuma função duplica página, e o `organizarPaginas` recusa repetida), então serve de chave estável para a seleção, o foco e a `key` do React depois de mover.
- `TETO_DE_PAGINAS` (500) é da tela das miniaturas: o `organizarPaginas` não limita páginas. O número final sai da medida da etapa de interface.

**Testes:** `pdf.test.ts` gera os PDFs com o próprio pdf-lib (lado da página diferente por página, para conferir a ordem). No mesclar e na leitura: ordem, contagem, criptografado (tabela de xref e object streams), inválido, cortado, sem página, fontes preguiçosas e a imagem compartilhada. No organizar: ordem, rotação somada a `/Rotate` próprio e herdado, `/Rotate` fora do padrão, girar à esquerda até 270, apagar, extrair, metadados, o link interno para página apagada, o `/Kids` repetido, a imagem compartilhada, plano vazio, índice fora, não inteiro e repetido, giro inválido e PDF protegido. `pdf-regras.test.ts` cobre teto, fração e nome, e cada função do estado do organizar, com pontas e seleção não contígua.

## Dependency policy

Adição de deps segue a política da raiz (pnpm ≥ 11, `allowBuilds`, `minimumReleaseAge`). Manter o pacote **sem React/DOM** — se precisar de browser API, isso é UI e mora no web.

- **`pdf-lib` 1.17.1** (MIT; deps `@pdf-lib/standard-fonts`, `@pdf-lib/upng`, `pako` 1.0.11 e `tslib` 1.14.1, todos MIT/Zlib/0BSD e sem script de instalação). A última versão é de 2021-11 e o projeto está parado, mas é a base madura para montar PDF no navegador. O fork `@cantoo/pdf-lib` (ativo) foi descartado por pedir faixas abertas (`tslib >=2`, `culori >=4`, `node-html-better-parser >=1.5.9`), que aceitariam qualquer major futura. Como o pdf-lib lê arquivo que o usuário escolheu, só no aparelho dele e dentro de um Worker com botão de cancelar (que derruba o Worker), o pior caso de um PDF malicioso é travar ou estourar a memória da própria aba.
