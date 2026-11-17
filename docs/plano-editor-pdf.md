# Plano do editor de PDF (`/tools`)

Registro das decisões do editor de PDF do piluvitu.com.br. Pedido do Paulo em 2026-11-16: a ferramenta Mesclar PDF vira um editor, tudo no navegador. O editor inteiro está aprovado; cada fase entra num PR com revisão do Crivo no SHA exato e CI verde, sem esperar o Paulo. Quando uma fase mudar uma decisão daqui, o PR dela atualiza este arquivo.

## O que vale para todas as fases

- **Nada sai do aparelho.** Sem rota de API, sem upload, sem guardar o documento no navegador (nada de IndexedDB ou localStorage com PDF). A tela diz isso, e cada modo tem um E2E que confere que, no fluxo inteiro, nenhum pedido vai para outra origem e nenhum corpo de pedido leva o PDF (o `%PDF-` nem um trecho do meio de cada arquivo). Até a fase 2 a regra era "só GET na própria origem", que reprova em produção: a borda da Cloudflare injeta dois POST na mesma origem (`/cdn-cgi/rum` e `/cdn-cgi/challenge-platform`) e o script do Web Analytics (`static.cloudflareinsights.com/beacon.min.js`, um GET de outra origem), o único pedido de fora que a regra aceita.
- **Duas bibliotecas, cada uma no seu Worker e só quando o modo precisa:**
  - **pdf-lib 1.17.1** (já no PR 1) escreve o PDF: mesclar, girar, apagar, reordenar, extrair, desenhar por cima, preencher formulário. Fica no `pdf.worker.ts`.
  - **pdfjs-dist 6.3.289** (a partir da fase 2) só lê e desenha as páginas na tela. É a mesma versão exata que o `apps/financas` já usa (Apache-2.0, sem script de instalação), então não entra pacote novo no lock (no PR da fase 2, o lock ganhou só a linha do importer `apps/web`). Tem Worker próprio, o `pdf.worker.min.mjs` do pacote, um por documento aberto, ligado por `PDFWorker.create({ port })` e não pelo `GlobalWorkerOptions.workerPort`: o global seria um Worker só para a aba inteira, e fechar o documento não o derrubaria. Fechar espera a tarefa terminar (é ela que tira as fontes do pdf.js da página) e então derruba o Worker, que guarda a cópia do arquivo.
- **Peso medido (min / gzip):**
  - pdf-lib no chunk do Worker: 424 KB / 174 KB (PR 1, conferido no build);
  - pdf.js `pdf.min.mjs`: 458 KB / 131 KB;
  - worker do pdf.js `pdf.worker.min.mjs`: 1.265 KB / 373 KB.
  - no build da fase 2 (Turbopack, Next 16.4.5): chunk do pdf.js 433 KB / 128 KB, Worker do pdf.js 1.183 KB / 363 KB e Worker do pdf-lib 426 KB / 176 KB.

  Nenhum deles entra no bundle das outras páginas do site. Cada PR confere no `.next` do build e registra no `apps/web/CLAUDE.md`.

- **Teto:** 100 MB por documento (ou somando os arquivos, no mesclar), pelo motivo medido no PR 1. O pdf-lib usa umas 3,5 vezes a entrada e o Blob do resultado soma mais uma, por isso a tela fala em "umas 4 vezes esse tamanho". Essa medida vale só para o pdf-lib sozinho. Nos modos com miniatura (fase 2 em diante), o mesmo documento fica na memória em até três lugares ao mesmo tempo: o provider do layout, a cópia que o pdf.js recebe em `data` e o pico do pdf-lib ao salvar. Por isso o teto de bytes foi medido de novo na fase 2, com o pdf.js aberto: com 98 MB o pico passou de 7 vezes o arquivo (+690 a +740 MB), e **nos modos com miniatura o teto é de 50 MB** (`TETO_DE_BYTES_COM_MINIATURAS`), que fica perto de +300 MB, dentro do que o teto do mesclar aceita. O mesclar segue com 100 MB. As fases que desenham páginas também têm um teto de páginas e de canvas, descrito em cada uma.
- **pdf.js com a configuração segura:**
  - a versão 6 já não tem o caminho com `eval` do CVE-2024-4367: a opção `isEvalSupported` saiu da biblioteca, e o `pdf.mjs` e o worker do 6.3.289 não têm `new Function` (conferido em 2026-11-16);
  - `enableXfa: false`;
  - `disableAutoFetch: true`;
  - o arquivo entra como `data: Uint8Array`, nunca por URL.

  Sem `standard_fonts` nem `cmaps` na fase 2, porque miniatura não precisa (texto sem fonte embutida sai com a fonte do sistema). **Decidido na fase 3** (ver "Recursos do pdf.js" na fase 3): os decodificadores de JPEG 2000 e JBIG2 e as fontes Symbol e ZapfDingbats passam a vir da própria origem, para a página grande e para as miniaturas; os cmaps e o resto ficam de fora.

- **Acessibilidade (skill `padroes-produto-pilutech`):**
  - alvos de 44 px;
  - foco visível e que acompanha o que a pessoa moveu;
  - `role=status` para o que muda e `role=alert` para erro, com o que fazer;
  - toda ação de arrastar tem alternativa por botão e teclado (WCAG 2.5.7);
  - reduzir movimento;
  - contraste de 4,5:1 medido nos dois temas pelo E2E;
  - 320 px sem rolagem lateral.
- **Textos:** em `components/tools/pdf/textos.ts`, com chaves estáveis, até o site ter catálogo por idioma (WEB-17 da auditoria). Números, tamanhos e plural saem pelo `Intl`.
- **Testes de cada fase:**
  - Jest no `packages/tools`, com PDFs gerados no próprio teste;
  - Jest no web, com motor falso;
  - stories de todo componente visual novo;
  - E2E no `tools.e2e.ts` contra o build de produção, com o PDF baixado conferido pelo pdf-lib (e pelo pdf.js em Node quando for texto).
- **Segurança:** skill `security-audit` em modo guia, partes SUPPLY-CHAIN e CLIENT-SIDE, em cada PR. A linha "Segurança" do PR diz o que foi conferido.

## Rota

- No PR 1: `/tools/mesclar-pdf`.
- **Desde a fase 2**: `/tools/pdf` é o "Editor de PDF". A página escolhe o modo, e cada modo tem a sua rota: `/tools/pdf/mesclar`, `/tools/pdf/organizar` e, depois, `/tools/pdf/editar` e `/tools/pdf/assinar`.
  - Uma rota por modo dá metadata e canonical próprios e separa o código: o pdf.js só desce nos modos que mostram página.
  - `/tools/mesclar-pdf` passa a redirecionar com 308 para `/tools/pdf/mesclar` (`redirects()` do `next.config.mjs`, como o `/pilulabs/botai`).
  - No `TOOLS`, o slug `mesclar-pdf` vira `pdf` ("Editor de PDF"), com os modos no campo `modos` do registro (`slug`, título, descrição e ícone). Cada modo tem `metadataDoModo` e entra no sitemap e no `llms.txt` pelas rotas públicas, logo depois da ferramenta.
- O documento aberto passa de um modo para outro pela memória: o `DocumentoPdfProvider`, no `app/(site)/tools/pdf/layout.tsx`, guarda o `File` enquanto a pessoa navega entre os modos e solta tudo ao sair de `/tools/pdf` (o layout desmonta). O mesclar, com o PDF pronto, oferece "Organizar as páginas deste PDF": põe o resultado no provider com o nome final e navega para o organizar.

## Fase 2: miniaturas e organizar páginas

**O que entra:** abrir um PDF, ver as páginas em miniatura e organizar: girar (90° para cada lado), apagar, reordenar e extrair as páginas escolhidas num PDF novo. Baixar o resultado.

- **Mesmas regras de leitura do mesclar:** PDF protegido (senha ou contra cópia), corrompido ou que não é PDF é recusado com a mesma mensagem. Como o organizar também copia páginas para um documento novo, a tela leva o mesmo aviso de alcance do PR 1: os marcadores não passam, e os campos de formulário podem deixar de ser editáveis.
- **O pdf-lib e o pdf.js têm que contar as mesmas páginas.** A tela mostra as páginas do pdf.js e o PDF sai com as do pdf-lib. O pdf-lib percorre a árvore de páginas inteira, e o pdf.js confia no `/Count` de cada nó: com um `/Count` errado, os dois discordam, e o PDF gerado sairia com outra página no lugar da que a pessoa viu, ou sem as últimas, sem erro nenhum (achado da revisão da fase 2, medido em Node com as duas bibliotecas). Quando a contagem não bate, o pdf.js fecha e o arquivo é recusado como corrompido, com a mesma mensagem.
- **Lógica (packages/tools, pdf-lib):** `organizarPaginas(bytes, plano)` monta um documento novo a partir de uma lista `{ indice, giro }` na ordem final. O campo é `giro`, não `rotacao`, porque guarda o que a pessoa pediu (0, 90, 180 ou 270), e a rotação final é o `/Rotate` que a página já tem mais o giro. Uma função cobre reordenar, apagar (fora do plano), girar e extrair (um plano com só as escolhidas). Como no mesclar, faz um `copyPages` só, para não duplicar fonte e imagem.
  - **As páginas fora do plano são esvaziadas antes da cópia.** Um link de uma página que fica para uma que saiu levava o conteúdo da que saiu para o arquivo, solto e invisível, mas legível por quem abrir o PDF (medido no teste). Apagar página tem que apagar o conteúdo dela.
  - Link interno deixa de levar à página, mesmo quando ela fica, e o mesmo vale para o mesclar (conferido no PR da fase 2): o aviso de alcance das duas telas fala dos links, junto com os marcadores.
  - O estado da tela (girar, mover, apagar e extrair as escolhidas) são funções puras no `pdf-regras`, sobre posições no plano atual. Mover com seleção não contígua: a que encosta na ponta fica, e as outras andam até encostar nela, sem trocar de ordem.
- **Motor e renderizador (infraestrutura, primeira etapa da fase 2):**
  - o motor do pdf-lib ganhou `organizar(arquivo, plano)`, que devolve o `Blob` do PDF. `mesclar` e `organizar` viraram **operações**: uma por vez, e uma nova, de qualquer tipo, derruba o Worker da pendente. A falha virou `FalhaDaOperacao`, e a resposta do Worker com o PDF, `pronto`;
  - o pdf.js fica atrás da interface `RenderizadorDePdf` (`components/tools/pdf/renderizador.ts`): `abrir(arquivo)` devolve `{ paginas, miniatura(indice, larguraCss), fechar() }`, só com a contagem. A fila de uma miniatura por vez mora no renderizador, não na tela, e o canvas tem altura de no máximo 4 larguras, para uma página estreita e comprida não estourar o limite de canvas;
  - fechar o documento espera o `destroy` da tarefa antes de destruir o `PDFWorker` e encerrar o Worker: é esse `destroy` que manda o `Terminate` e, quando o Worker responde, tira da página as `FontFace` que o pdf.js pôs em `document.fonts` (e limpa o cache de objetos e os filtros). Com o Worker encerrado antes, a resposta não vinha, e as fontes de cada PDF aberto ficavam na aba até recarregar, mesmo depois de sair de `/tools/pdf` (achado da revisão da fase 2, medido no Chromium e coberto por um E2E). Um Worker que caiu ou travou não responde: depois de 2 s ele é encerrado assim mesmo;
  - **decidido na fase 2: os `.wasm` do pdf.js ficam para a fase 3**, junto com as fontes e os cmaps. Sem `wasmUrl`, o pdf.js 6.3.289 não decodifica imagem JPX (JPEG 2000) nem JBIG2, comuns em PDF escaneado, e a miniatura sai sem essa imagem (o resto da página aparece). Lido no código do worker: sem a URL, ele pede o `.wasm` à página, que recusa sem ir à rede, e cai num `import()` relativo (`nullopenjpeg_nowasm_fallback.js` ou `nulljbig2_nowasm_fallback.js`), um GET que dá 404 na própria origem. Esse pedido não leva o arquivo, então a regra "nada sai do aparelho" se mantém. Miniatura de 160 px sem a imagem escaneada é um defeito pequeno, e a tela do organizar avisa que essas imagens podem faltar na miniatura e vão inteiras para o PDF final; a página grande da fase 3 não pode sair sem ela, e por isso a fase 3 decide se serve os `.wasm` do pacote (`openjpeg.wasm` 246 KB, `jbig2.wasm` 102 KB, `qcms_bg.wasm` 94 KB) da própria origem. **Resolvido na fase 3:** o `openjpeg.wasm` e o `jbig2.wasm` são servidos da própria origem, e o aviso do organizar saiu (ver "Recursos do pdf.js" na fase 3).
- **Miniaturas (pdf.js):**
  - desenhadas sob demanda, só as que aparecem na tela ou estão a até 400 px dela (`IntersectionObserver`, no `use-miniaturas.ts`), uma por vez e com um `setTimeout(0)` entre elas para o toque e a rolagem não esperarem, a 160 px de largura × `devicePixelRatio`. Página que sai da tela antes da vez sai da fila, e a apagada também: o cartão que desmonta tira a página da fila, porque o `unobserve` não chama o callback do observador;
  - cada miniatura vira um JPEG (`canvas.toBlob`), e o canvas é solto em seguida. Uma miniatura fica em torno de 10 a 20 KB, contra 130 KB do canvas;
  - a rotação aparece girando a imagem, sem redesenhar.
- **Teto:** **500 páginas e 50 MB**. Acima de qualquer um, a tela explica e sugere dividir; o arquivo grande demais nem é lido, e o de páginas demais é lido pelo pdf-lib, mas não chega ao pdf.js. Medido no PR (Chromium do Playwright no build de produção, `deviceScaleFactor` 2, soma do RSS de todos os processos do Chromium menos a linha de base; tabela e método em "Medições do organizar" no `apps/web/CLAUDE.md`):
  - 49 MB (20 páginas com imagem sem compressão): pico de +291 MB; 59 MB: +497 MB; 98 MB: +686 a +741 MB. O pico vem do PDF no Worker do pdf.js, do pdf-lib lendo e montando e do `Blob` do resultado ao mesmo tempo, e chega logo depois do "pronto";
  - 500 páginas de texto com imagem (790 KB): 500 miniaturas em 24,5 s rolando uma tela por vez (49 ms cada), pico de +373 MB (+333 MB com `deviceScaleFactor` 1, então quase nada é pixel de miniatura). As 500 páginas ficam.
- **Teclado e leitor de tela** (desenho do PR da fase 2: botões rápidos por página e o resto na barra):
  - as páginas são uma lista (`<ol>`); cada página mostra "Página N" (o número no arquivo original, que não muda ao mover) e "girada X°" quando há giro;
  - em cada página, só o que se usa a toda hora: a caixa "Selecionar página N" e dois botões, "Girar a página N à direita" e "Apagar a página N", todos com 44 px. Seis botões por página seriam 3.000 paradas de Tab num PDF de 500 páginas;
  - todo o resto age sobre a seleção, numa barra `role=toolbar` ("Ações nas páginas selecionadas") com um ponto só no Tab e setas entre os botões: Girar à esquerda, Girar à direita, Mover para antes, Mover para depois, Apagar, Extrair as selecionadas, Selecionar todas ou Limpar seleção, e Desfazer. Botão que não se aplica fica desabilitado com o motivo escrito perto (`aria-describedby`);
  - "Gerar PDF organizado", o aviso de alcance e o resultado (Cancelar, falha e link de download) ficam logo depois da barra, antes da lista. Com o Gerar depois das páginas, cada uma com 3 paradas de Tab, um PDF de 500 páginas pedia 1.500 Tabs até ele (achado da revisão da fase 2);
  - o foco acompanha a ação: mover deixa o foco no botão usado (na ponta, no do outro sentido); apagar leva à caixa da página seguinte, ou da anterior, ou ao "Escolher PDF"; cada ação é anunciada ("Página 3 girada para 180°.", "2 páginas apagadas.", "Desfeito.");
  - **Desfazer** (Ctrl/⌘+Z e botão) volta a última ação, porque apagar sem volta é ruim para todo mundo. O atalho não dispara dentro de campo de texto. Como o atalho escuta a janela inteira, o foco pode estar em qualquer lugar: ele fica onde estava se o elemento continua na tela e habilitado; se o desfazer o tirou da tela (o Limpar seleção, o link de download) ou o desabilitou (um botão da barra), vai ao Desfazer ou, sem mais nada para desfazer, ao primeiro botão habilitado da barra. Nunca cai no `body`.
- **Celular:** grade de 2 colunas até 640 px (3 no `sm`, 4 no `md`). Arrastar para reordenar usa o dnd-kit com `TouchSensor` de espera curta (250 ms, tolerância de 5 px), para a rolagem da página continuar livre, e um `PointerSensor` que recusa o toque (distância de 6 px, para mouse e caneta). A miniatura é a alça, fora do Tab; os botões são a alternativa.
- **Testes:**
  - Jest de `organizarPaginas`: ordem, rotação somada a uma página que já tinha `/Rotate` (própria e herdada), apagar, extrair, plano vazio recusado, índice fora do documento recusado, a página apagada que não vai junto por um link interno e a imagem compartilhada que não duplica;
  - motor e componente com renderizador falso;
  - E2E: girar a página 2, apagar a 3, mover a 1 para o fim, baixar, e conferir no PDF baixado a ordem (pelo lado de cada página) e o `/Rotate`;
  - E2E de extrair, de que miniatura aparece (`img` com `naturalWidth` > 0), de o Tab da barra cair no Gerar, de as fontes do pdf.js saírem de `document.fonts` ao trocar de PDF, de nada sair do aparelho nos dois modos, dos Workers só depois do arquivo, do redirecionamento 308, de 320 px e do contraste.

## Fase 3: inserir por cima da página

**O que entra:** abrir uma página grande e pôr por cima:

- texto, com fonte, tamanho e cor;
- imagem PNG ou JPEG, que dá para mover e redimensionar;
- desenho à mão livre;
- formas: retângulo, elipse, linha e seta;
- marca-texto;
- retângulo branco para cobrir.

Dá para mover, redimensionar, apagar e desfazer cada objeto. Salvar desenha tudo com o pdf-lib no Worker.

**Editar o texto que já existe no PDF não é confiável e não vai ser feito.** No PDF, o texto não é um parágrafo: são glifos posicionados um a um, com fontes cortadas só para as letras que o arquivo usa, sem quebra de linha nem reflow. Trocar uma palavra quebra o espaçamento, perde letras que a fonte cortada não tem e muda de PDF para PDF. O caminho é **cobrir com o retângulo branco e escrever por cima**. A tela diz isso quando a pessoa clica num texto da página.

- **Cobrir não apaga.** O retângulo branco esconde o texto na tela e na impressão, mas o texto continua no arquivo: dá para selecionar, copiar e buscar. Para dado sensível (CPF, conta, endereço), entra a opção **"Apagar de verdade o que está embaixo"**:
  - o pdf.js desenha a página coberta num canvas (200 dpi);
  - **os retângulos de cobrir são pintados nesse canvas antes do `toBlob`**, queimados na imagem. Se ficassem como objeto vetorial por cima, o JPEG ainda teria o CPF em pixels, e bastaria extrair a imagem para ler;
  - o JPEG entra no lugar da página original, e só os outros objetos (texto, formas, imagens inseridas) são desenhados por cima, em vetor;
  - a página nova não leva as anotações da original (`/Annots`: links e campos), porque um link ou um campo pode carregar o mesmo dado. Os metadados do documento (título, autor) continuam, e a tela diz isso.

  O texto some do arquivo, ao custo de a página perder a seleção de texto e ficar maior. A tela explica a troca antes de a pessoa confirmar.

  **Decidido na lógica (primeira etapa da fase 3, `aplicarEdicoes` no `packages/tools`):**
  - o documento é editado no lugar, sem `copyPages`: marcadores, links, formulário e metadados continuam, ao contrário do organizar;
  - a página apagada fica só com `/Type` e `/Parent` e ganha `/MediaBox` e `/CropBox` do tamanho que a tela mostra, `/Rotate` 0 e recursos próprios (explícitos, para não herdar nada da árvore de páginas). O JPEG cobre a página inteira, e os `cobrir` não são desenhados de novo;
  - o pdf-lib salva todo objeto que leu, mesmo sem ninguém apontando para ele. Por isso, antes de salvar, sai do arquivo tudo o que não se alcança a partir do catálogo e do `/Info`, em toda edição (não só no apagar de verdade). Sem isso, o conteúdo antigo da página iria inteiro para o PDF novo;
  - as anotações da página são desligadas de todo o documento: o campo de formulário que fica sem widget sai também (ele guardaria o valor), e saem o `/OBJR` da estrutura e o `/CO`. O `/ActualText`, o `/Alt` e o `/E` dos elementos de estrutura da página também saem;
  - os XObjects que a página desenhava saem dos recursos que outras páginas herdam ou também listam, quando nenhuma página que fica os desenha. Na dúvida (imagem embutida no conteúdo de uma página que fica), nada sai daquele dicionário, para a página que fica não perder um desenho;
  - **mudou na revisão do #120 (o Crivo reproduziu os três no SHA da entrega):** saem também o `/XFA` do AcroForm (com o `/NeedsRendering` do catálogo), porque o XML do XFA guarda o que foi digitado e é alcançável pelo catálogo; o `/T` dos elementos da página; o `/Alt`, o `/T`, o `/ActualText` e o `/E` de todo elemento pai (sem `/Pg`) cujo conteúdo está só em páginas apagadas; e os marcadores que levam a uma página apagada (direto, por `GoTo` ou por nome), com os filhos subindo para o lugar deles;
  - ficam, de propósito, e a tela diz com todas as letras: os metadados do documento (título, autor, assunto, XMP), os anexos e o texto alternativo de elemento que também descreve uma página que fica;
  - **mudou na fase 4 (menores da revisão do Crivo no #120):** saem também os nomes de destino (o `/Dests` antigo do catálogo e a árvore `/Names /Dests`) que levam a uma página apagada, para um nome como `CPF_123` não ficar no arquivo, e quem usava o nome (link, marcador, `/OpenAction`, ação `GoTo` em qualquer lugar) passa ao destino explícito, que continua levando à página, agora imagem. O nome que leva a uma página que fica, fica. E o marcador cuja ação não leva a uma página do documento (URI, Launch, JavaScript, GoToR, GoToE, Named) fica, de propósito, com o título: ele não é o marcador da página apagada;
  - o fundo tem que ser JPEG, e `pixelsDoFundo` dá o canvas: 200 dpi, no máximo 16,7 milhões de pixels e 16.384 de lado.

- **Infraestrutura do modo editar (segunda etapa da fase 3):**
  - **Rota** `/tools/pdf/editar`, o modo "Editar PDF" ("Escreve, desenha, põe imagens e cobre trechos por cima das páginas"), terceiro do registro, com metadata, canonical, sitemap e `llms.txt` como os outros. A descrição do Editor de PDF passou a "Mesclar, organizar e editar páginas de PDF". "Editar PDF" é o termo que as pessoas buscam; o aviso de que o texto que já existe não se edita fica na tela.
  - **Abrir:** as mesmas regras e mensagens do organizar (50 MB, 500 páginas, o pdf-lib decide os erros, contagens diferentes recusadas como corrompido), num hook só para os dois modos, `useAbrirPdf`. As edições são salvas pelo pdf-lib no índice da página que a pessoa viu no pdf.js, então a recusa por contagem diferente vale aqui pelo mesmo motivo.
  - **Página grande:** `DocumentoAberto.pagina(indice, larguraCss)` desenha num canvas de `larguraCss × devicePixelRatio`, reduzido por `limitarAoCanvas` (`pdf-regras`) até caber em 16.777.216 pixels e 16.384 de lado, e devolve o canvas e o tamanho da página em pontos (a vista do pdf.js com escala 1, que é o espaço dos objetos). Uma por vez, na mesma fila das miniaturas (o pdf.js desenha na thread da página). Um pedido novo cancela o desenho em curso (`RenderTask.cancel`) e pula os que ainda esperam, que rejeitam com `PaginaSuperada`. O canvas da página anterior só é esvaziado quando o novo fica pronto, e a tela o troca na mesma volta, sem piscar; fechar o documento cancela e esvazia o da tela.
  - **Zoom:** botões − e + em 8 degraus da largura da área (50%, 75%, 100%, 125%, 150%, 200%, 300%, 400%), com o valor na tela e anunciado. A área é medida por `ResizeObserver`, e a página só é desenhada de novo 150 ms depois de a largura parar de mudar. Enquanto a página nova não chega, o canvas anterior fica esticado pelo CSS, com "Desenhando a página…" por cima.
  - **Faixa de miniaturas:** uma lista horizontal com um botão por página ("Página N", `aria-current="page"` na aberta), as miniaturas do `useMiniaturas` (agora com a largura como parâmetro: 64 px na faixa), um ponto só no Tab, setas, Home e End entre as páginas e Enter para abrir. Mais "Página anterior" e "Próxima página", com "Página N de M" ligado aos dois; na ponta, o foco passa para o outro botão.
  - **Motor:** `editar(arquivo, objetosPorPagina, imagens, paginasRasterizadas)`, uma operação como as outras (com id; uma nova derruba a pendente). Na tela, o objeto imagem guarda o id do arquivo em `imagens` (`ObjetoNaTela`), para o histórico do desfazer não copiar bytes; o Worker lê cada imagem uma vez (os objetos que a repetem levam os mesmos bytes, e o pdf-lib a embute uma vez) e monta as `EdicaoDaPagina`. O `ErroNaEdicao` vira falha com `pagina`, `objeto` (o id, traduzido da posição) e `caracteres`, que `TEXTOS.editar.falhaAoSalvar` escreve para a pessoa; sem objeto, o culpado é o fundo, que a própria tela gera, e a falha sai como inesperada. Para a tradução da posição funcionar, o `aplicarEdicoes` passou a contar a posição na lista recebida, com os `cobrir` que o fundo deixa de fora (antes contava na lista filtrada e apontava para o objeto errado; teste próprio).
- **Recursos do pdf.js (decidido na segunda etapa):** servidos da própria origem, de uma cópia em `apps/web/public/pdfjs/6.3.289/`, só os que a página grande precisa:
  - `wasm/openjpeg.wasm` (252 KB, 83 KB gzip) e `wasm/jbig2.wasm` (105 KB, 41 KB gzip): sem eles, imagem em JPEG 2000 ou JBIG2 (comum em PDF escaneado) some da página;
  - `standard_fonts/FoxitSymbol.pfb` (17 KB, 15 KB gzip) e `standard_fonts/FoxitDingbats.pfb` (30 KB, 27 KB gzip): com `useSystemFonts`, o pdf.js só pede estas duas (as outras fontes padrão saem das do sistema). Sem elas, as marcas de ZapfDingbats (o ✓ das caixas de formulário) saem com a fonte do sistema;
  - as licenças de cada um (BSD de 2 cláusulas do OpenJPEG, BSD do PDFium e Apache-2.0 do pdf.js), como no pacote.

  Cada arquivo só é baixado quando um PDF precisa dele: nenhum entra no bundle, e um PDF sem JPEG 2000, JBIG2, Symbol ou ZapfDingbats não pede nada.
  - **Quem busca é a página**, por uma fábrica própria (`recursos-pdfjs.ts`, passada como `BinaryDataFactory`, com `useWorkerFetch: false`), que só busca os quatro arquivos da lista, em `/pdfjs/<versão do pdf.js carregado>/`. Os cmaps, as Liberation e qualquer outro nome falham sem ir à rede. Sem `standardFontDataUrl`, o `@font-face` que o pdf.js monta para as fontes do sistema não ganha o `url()` de reserva das Liberation (que daria 404 num celular sem Arial), e sem `wasmUrl` a reserva em JavaScript só é tentada se o `.wasm` não instanciar, como na fase 2.
  - **Ficam de fora, de propósito:** `qcms_bg.wasm` (97 KB, perfil de cor ICC; com `useWorkerFetch: false` o pdf.js usa o espaço de cor alternativo do perfil), os cmaps (169 arquivos, 1,2 MB; só texto CJK com CMap pré-definido precisa deles), as Liberation (574 KB) e as reservas em JavaScript (`*_nowasm_fallback.js`, 597 KB).
  - **Conferido no navegador** (Chromium do Playwright contra o build de produção, `next start`), com um PDF gerado no momento com uma imagem em JPEG 2000 (convertida pelo `sips`) e um ✔ em ZapfDingbats: a página grande e a miniatura mostram a imagem (o pixel do centro sai vermelho), a página pede `openjpeg.wasm` e `FoxitDingbats.pfb` à própria origem (200), sem nenhum 404 e nada de outra origem. Com `/pdfjs/` bloqueado, a imagem some (pixel branco), como na fase 2. O JBIG2 usa o mesmo caminho (`WasmImage` do pdf.js) e não teve PDF de teste.
  - **Peso:** nenhum dos quatro entra em chunk; somam 404 KB (166 KB gzip), e só desce o que o PDF aberto usa.
  - **Sempre da mesma versão:** o `recursos-pdfjs.test.ts` compara o sha256 de cada arquivo servido com o do `pdfjs-dist` instalado, exige que a pasta seja só a da versão instalada e que tenha exatamente os arquivos da fábrica e as licenças. Quem subir o pdf.js vê o teste falhar até copiar os da versão nova.
  - **Por que cópia e não o bundler:** com `new URL('pdfjs-dist/wasm/…', import.meta.url)`, o arquivo passaria por três bundlers (o Turbopack no build, o webpack no `next dev --webpack` e o do Storybook), cada um com a sua regra para `.wasm`. A cópia é a mesma nos três, e o teste por hash garante a versão.

- **Ferramentas e objetos (terceira etapa, a tela):**
  - **Barra:** `role=toolbar` com as dez ferramentas (Selecionar e mover, Texto, Imagem, Desenhar, Retângulo, Elipse, Linha, Seta, Marca-texto, Cobrir), `aria-pressed`, um ponto só no Tab e setas que só passam o foco. Toda ferramenta de criar tem "Inserir no centro", que usa o centro da parte da página que aparece na área (com zoom, o centro da página pode estar fora da tela). O desenho não tem: é o gesto que o WCAG 2.5.1 isenta.
  - **Criar:** arraste cria na caixa do arraste; clique sem arrastar (até 4 px) põe o objeto no tamanho padrão, centrado no ponto. Depois de criar, a ferramenta volta para Selecionar e mover e o foco vai para o objeto, menos no desenho, que continua ligado para o próximo traço. O texto nasce com "Texto" e leva o foco ao campo Texto do painel, com tudo escolhido.
  - **Na tela:** cada objeto é desenhado num SVG do tamanho da página, em pontos, e tem por cima um botão focável com 4 px de folga, para linha reta e traço fino darem para pegar. O marca-texto usa `mix-blend-mode: multiply` sobre o canvas, como o PDF. Uma alça só, no canto de baixo à direita, a mesma do teclado (Alt+setas). A área da página passou a ter rolagem própria nos dois sentidos, com no máximo 75% da altura da janela, para a barra e o painel ficarem perto da página.
  - **Toque:** com outra ferramenta que não Selecionar, os objetos deixam o ponteiro passar (para desenhar e criar por cima) e continuam no Tab. Fora do desenho, o dedo que arrasta rola a página e o toque curto põe o objeto.
  - **Desfazer:** o histórico é da cena inteira (objetos de cada página e as páginas marcadas para apagar de verdade), com o limite de 100 do `pdf-regras`. Os passos seguidos do mesmo objeto pela mesma origem (setas, Alt+setas, um campo do painel) em menos de 1 s viram um passo só, senão segurar a seta encheria o histórico; arrastar com o ponteiro é um passo. Desfazer o que mudou em outra página leva até ela. Ctrl+Y também refaz, como no Windows.
  - **Anúncio:** a posição e o tamanho novos vão para o `role=status` 500 ms depois do último passo.
  - **Painel:** o texto não tem largura e altura (mudam pela letra e pelo conteúdo); largura e altura param na borda da página, sem mover o objeto. A cor é uma lista de dez cores com nome mais o seletor do navegador. O que a pessoa escolhe no painel vira o estilo do próximo objeto do mesmo grupo.
  - **Texto do próprio PDF:** a dica de cobrir e escrever por cima aparece quando, com Selecionar, o clique cai num texto do PDF, conferido pela camada de texto do pdf.js (`getTextContent`, com a caixa de cada trecho como a do `TextLayer`), e não em qualquer clique.
  - **Imagem:** a escolha do arquivo abre ao ligar a ferramenta; a imagem espera o clique, o arraste ou o centro. Além da redução acima de 2400 px, **o JPEG com o EXIF girando a foto (foto de celular) também é desenhado de novo, em pé**: o pdf-lib embute o JPEG como veio, e a foto sairia deitada no PDF enquanto a tela a mostra em pé. O teto de 50 MB soma as imagens que algum passo do histórico usa; a que nenhum usa sai da memória.
  - **Apagar de verdade:** é por página, marcado na cena (entra no desfazer), e só vira imagem a página marcada que tem cobrir. O fundo é desenhado pelo renderizador (`fundo(indice, cobrir)`), na mesma fila das miniaturas e sem mexer na página grande; os retângulos são pintados de branco **arredondados para fora** em pixels (a borda meio pintada deixaria um resto da letra), e o JPEG sai com qualidade 0,9, porque ele vira a página.
  - **Gerar:** enquanto monta, a área de edição fica `inert`; mudar a cena depois de pronto descarta o resultado. A falha de um objeto traz "Mostrar o objeto".

- **Fontes:** só as padrão do PDF (Helvetica, Times e Courier, com negrito e itálico), que o pdf-lib embute sem pacote extra e que cobrem os acentos do português e do espanhol (WinAnsi). O `@pdf-lib/fontkit` (fonte própria e qualquer caractere) custaria 326 KB gzip a mais e fica de fora. Caractere fora do WinAnsi (emoji, CJK) é recusado no campo, com aviso.
- **Desenho à mão livre:** `perfect-freehand` 1.2.3 (MIT, sem dependência, 2 KB gzip) suaviza os pontos do ponteiro, e o traço vira caminho SVG desenhado pelo `drawSvgPath` do pdf-lib. Marca-texto: retângulo com opacidade 0,35 e `blendMode: Multiply`. Decidido na lógica: o perfect-freehand fica num subpath próprio, `@piluvitu/tools/pdf-traco`, que a tela usa para mostrar o traço enquanto a pessoa risca e o Worker para o mesmo traço sair igual no PDF; os pontos do traço ficam em fração da caixa, para mover e redimensionar levarem o traço junto.
- **Coordenadas:** a tela usa o canto superior esquerdo; o PDF usa o inferior esquerdo, a página pode ter `/Rotate` (0, 90, 180, 270) e o `CropBox` pode não começar no zero. A conversão mora no `packages/tools` como função pura, com teste para as quatro rotações e para o `CropBox` deslocado. Errar aqui põe o texto no lugar errado sem dar erro. Decidido na lógica: os objetos guardam a posição em pontos da tela (a página como o pdf.js a mostra, vista com escala 1), e a conversão para o PDF só acontece ao salvar. A geometria é a do pdf.js (`view`, `rotate` e `userUnit`), conferida contra o pdf.js de verdade.
- **Texto, decidido na lógica:** sem quebra automática; as linhas são as quebras que a pessoa digita. A primeira linha de base fica um ascendente da fonte (dos AFM) abaixo do topo da caixa, e as outras descem 1,2 em. A tela desenha com a mesma regra (`linhasDeBase`), senão o texto sai um pouco deslocado de onde a pessoa viu.
- **Teclado e leitor de tela (mover e redimensionar):**
  - O quadro dos objetos de uma página é um `role=application` com nome ("Objetos da página 3"). Sem um papel assim, NVDA e JAWS no modo de navegação ficam com as setas, e mover e redimensionar pelo teclado falharia justo para quem usa leitor de tela.
  - Cada objeto é focável, com `role=button`, `aria-roledescription` "objeto do PDF", nome ("Texto 'Paulo Victor', em 120 por 340, 200 por 40 pontos") e `aria-describedby` apontando para as instruções de teclado.
  - **Setas movem** 1 ponto, e Shift+setas movem 10.
  - **Alt+setas redimensionam** 1 ponto (Alt+Shift+setas, 10), puxando o canto de baixo à direita. No texto, mudam o tamanho da fonte em 1 ou 10 pontos, e a caixa acompanha. As setas, e o Alt+← e o Alt+→ em especial (voltar e avançar do Chrome e do Firefox no Windows e no Linux), têm `preventDefault` quando um objeto está focado.
  - Delete apaga, Enter edita o texto, Esc solta a seleção.
  - A posição e o tamanho novos são anunciados depois de uma pausa curta (`role=status`), para não falar a cada passo.
  - Um painel de propriedades mostra X, Y, largura e altura em campos numéricos, mais fonte, tamanho e cor (lista de cores com nome, além do seletor). É o jeito exato e acessível de posicionar.
  - As ferramentas ficam numa `role=toolbar` com `aria-pressed` e setas entre os botões.
  - **Desfazer e refazer**: Ctrl/⌘+Z e Ctrl/⌘+Shift+Z, com botões.
  - O painel numérico é o caminho garantido. Mesmo assim, o PR da fase 3 traz o teste manual com VoiceOver (macOS e iOS) e NVDA (Windows): mover e redimensionar pelas setas, e o anúncio da posição. **Na entrega da fase 3**, o que a máquina confere entrou nos testes (os papéis e nomes pelo `toMatchAriaSnapshot`, o Tab até o objeto, as setas e Alt+setas com o anúncio, o `preventDefault` do Alt+← e o axe sem violação séria). O teste com leitor de tela de verdade ficou com o Paulo, com o roteiro no PR: o agente não liga o VoiceOver no Mac dele, e o NVDA só roda no Windows.
  - O desenho à mão livre é um gesto de caminho, que o WCAG 2.5.1 isenta por ser essencial. Quem não usa ponteiro tem as formas e o texto.
- **Celular (toque):**
  - Arrastar um objeto move só o objeto: `touch-action: none` nele e nas alças.
  - Fora dos objetos, a página rola normal. Só a ferramenta de desenho trava a rolagem enquanto está ativa, e a barra mostra que está ativa.
  - Alças de redimensionar com área de toque de 44 px em `pointer: coarse`.
  - Zoom pelos botões + e −, porque a pinça do navegador briga com o arrastar.
- **Memória:**
  - uma página grande por vez, no canvas, limitada a 16,7 milhões de pixels (o limite de canvas do Safari no iOS);
  - imagem inserida maior que 2400 px no lado maior é reduzida no navegador antes de entrar no PDF (JPEG 0,85, PNG mantém a transparência);
  - teto de 50 MB somando as imagens inseridas.

  A medida de pico de memória ao salvar um PDF de 100 MB com objetos fica registrada no PR. **Medido na quarta etapa**, no teto do modo (49 MB, porque o editar recusa acima de 50 MB): o pico é o da abertura, igual ao do organizar no mesmo PDF, e salvar fica abaixo dele, com ou sem apagar de verdade (até nas 20 páginas). Os números e o método estão em "Medições do editar" no `apps/web/CLAUDE.md`.

- **Imagem aceita:** só PNG e JPEG, conferidos pelos bytes iniciais, não pela extensão. SVG fica de fora (pode carregar script).
- **Testes:**
  - Jest da conversão de coordenadas, cobrindo as quatro rotações e o CropBox;
  - Jest de cada objeto desenhado pelo pdf-lib. O texto é conferido lendo o PDF de volta com o pdf.js em Node (`getTextContent`: texto e posição), como o `apps/financas` já faz. Feito na primeira etapa: como o Jest do `packages/tools` é CommonJS, o pdf.js roda num processo filho do Node, e as formas e imagens também são conferidas, pela caixa de cada desenho no `getOperatorList`;
  - "apagar de verdade" conferido de três jeitos: o texto deixou de existir na página (`getTextContent`), a página não tem mais `/Annots`, e os pixels da imagem embutida sob o retângulo são brancos. Esta última conferência decodifica o JPEG no navegador (E2E, `createImageBitmap`) e lê o canvas;
  - motor e componente: mover e redimensionar pelo teclado, anúncio e painel numérico;
  - E2E: inserir texto, mover pelo teclado, salvar e conferir texto e posição no PDF baixado; inserir imagem; marca-texto; cobrir com e sem apagar de verdade; 320 px, contraste e nada saindo do aparelho (a regra do E2E acima). Já entraram, com a infraestrutura: a imagem em JPEG 2000 na página grande e na miniatura (com o decodificador da própria origem e nenhuma resposta 4xx), os Workers só depois do arquivo, nada saindo ao abrir, passar de página e mudar o zoom, 320 px com zoom e o contraste nos dois temas. **Feito na quarta etapa:** todos os da lista, num PDF de três páginas iguais na tela e guardadas de três jeitos (normal, `/Rotate` 90 e `CropBox` deslocado), com o PDF baixado lido pelo pdf.js em Node (texto e posição, e a caixa, a cor, a opacidade e a mistura de cada desenho); o desenho com o ponteiro; o emoji recusado; o teclado e o leitor de tela pelo `toMatchAriaSnapshot`; e o **axe** (WCAG 2.0, 2.1 e 2.2 A e AA, sem violação séria nem crítica) a 1280 e a 320 px, com a tela cheia de estado. O `axe-core` 4.11.1 (o mesmo do `apps/pilutech-site`, já no lock) entrou exato nas devDependencies do web.

## Fase 4: assinatura e formulário

**O que entra:** pôr uma assinatura na página e preencher os campos de um formulário PDF (AcroForm).

- **Assinatura:** três jeitos.
  1. Desenhar num quadro, com o mesmo motor de traço da fase 3 (`perfect-freehand`). O `signature_pad` não entra, porque seria uma segunda biblioteca para a mesma coisa.
  2. Enviar uma imagem PNG ou JPEG, com a opção "tirar o fundo branco".
  3. Digitar o nome, escrito em Times Itálico.

  Depois disso a assinatura vira um objeto da fase 3: move e redimensiona pelo teclado e pelo toque. Não fica guardada no navegador.

- **Assinatura visual não é assinatura digital.** A tela diz que o desenho ou a imagem não substituem uma assinatura com certificado (ICP-Brasil, gov.br). Campo de assinatura digital (`/Sig`) não é preenchido.
- **Formulário (pdf-lib `getForm`):**
  - lista os campos (texto, caixa de marcar, opção, lista e lista suspensa) e monta um formulário HTML de verdade, com `<label>` vindo do nome alternativo do campo (`/TU`), que existe justamente para leitor de tela, e do nome técnico quando ele falta;
  - ao focar um campo, a página mostra onde ele fica;
  - salvar atualiza a aparência dos campos (`updateFieldAppearances`), com a opção "Achatar" (o campo deixa de ser editável);
  - formulário XFA (dinâmico) o pdf-lib não preenche: o arquivo é detectado e a tela explica.
- **Teclado e leitor de tela:** o formulário HTML é o caminho principal, então campo, rótulo, erro e ordem de Tab seguem as regras de formulário da skill. A assinatura usa os atalhos da fase 3.
- **Celular:** o quadro de assinatura ocupa a largura e trava a rolagem só enquanto o dedo está nele, com um botão "Limpar". O formulário é uma coluna só.
- **Teto:** o mesmo da fase 3. A assinatura desenhada é reduzida a 1200 px de largura.
- **Testes:**
  - Jest com formulário gerado no teste (`createTextField`, `createCheckBox`, `createRadioGroup`, `createDropdown`): preencher, conferir os valores lidos de volta, achatar (não sobra campo) e detectar XFA;
  - a assinatura desenhada vira imagem na posição certa;
  - E2E: preencher e baixar, conferir os valores no PDF baixado; assinar por desenho com o ponteiro do Playwright; 320 px, contraste e nada saindo do aparelho (a regra do E2E acima).

### Decidido no desenho

Desenho de 2026-11-17, antes do código. Detalha, até o arquivo e a função, o que já estava decidido: a rota, a tela, os três jeitos de assinar, o aviso, o formulário, o XFA, os dois menores da revisão do #120 e os testes. A fase sai num PR só, em quatro etapas, nesta ordem, cada uma num commit com os testes dela. Os tetos são os da fase 3: 50 MB e 500 páginas por PDF, e 50 MB somando as imagens, com a assinatura.

**Etapa 1: lógica no `packages/tools`, começando pelos menores do Crivo**

- **Nomes de destino das páginas apagadas (menor (a) do #120).** Teste vermelho antes. Função nova `tirarDestinosDasApagadas(documento, apagadas)` no `pdf.ts`, chamada pelo `aplicarEdicoes` depois do `tirarMarcadoresDasApagadas`, que ainda precisa dos nomes para achar a página de cada marcador.
  - No `/Dests` antigo do catálogo, sai o nome cujo destino (array, `<< /D [...] >>` ou referência a um deles) leva a uma página apagada. O dicionário que fica vazio sai do catálogo.
  - Na árvore `/Names /Dests`, sai o par da folha que leva a uma página apagada. A folha sem par sai dos `/Kids` do pai, e assim para cima. Os `/Limits` de cada nó que fica são refeitos com o primeiro e o último nome que sobraram, porque o nome que saiu ficaria no `/Limits`. A raiz vazia sai do `/Names`, e o `/Names` vazio sai do catálogo.
  - O nome que leva a uma página que fica, fica.
  - Quem usava um nome que saiu passa a usar o destino explícito que ele guardava: o `/Dest` de um link ou marcador e o `/D` de uma ação `GoTo` em qualquer lugar do documento (o `/OpenAction`, o `/A` e o `/AA` das anotações das páginas que ficam). A página apagada continua no documento, como imagem, então o link continua indo para ela, só sem o nome.
  - Sem apagar de verdade, nada disso muda.
- **Marcador que não leva a uma página do documento (menor (b)).** Não muda código. O marcador com ação que não é `GoTo` (URI, Launch, JavaScript, GoToR, GoToE, Named) não leva a página nenhuma do documento, então não é o marcador da página apagada e fica, com o título. Um teste trava isso (verde desde o começo, porque é o comportamento de hoje). A regra entra no `packages/tools/CLAUDE.md` e na lista do que fica, na fase 3 deste plano, que também perde "os nomes dos destinos nomeados".
- **Tipos do formulário**, no `pdf-regras`, porque a tela também usa:

  ```ts
  export type WidgetDoCampo = {
    readonly pagina: number
    readonly caixa: Caixa // em pontos da tela
    readonly opcao?: string // caixa de marcar e botão de opção: a opção que o widget liga
  }

  export type MotivoDeNaoPreencher =
    | 'assinatura_digital'
    | 'botao'
    | 'somente_leitura'
    | 'seletor_de_arquivo'
    | 'fora_do_winansi'

  type BaseDoCampo = {
    readonly id: number // a posição no form.getFields() do pdf-lib
    readonly nome: string // o nome completo (getName)
    readonly rotulo: string // o /TU; sem ele, o nome
    readonly obrigatorio: boolean
    readonly widgets: readonly WidgetDoCampo[] // só os visíveis, numa página
    readonly naoPreenchivel?: MotivoDeNaoPreencher
  }

  export type CampoDoFormulario = BaseDoCampo &
    (
      | {
          readonly tipo: 'texto'
          readonly valor: string
          readonly multilinha: boolean
          readonly tamanhoMaximo: number | null
        }
      | { readonly tipo: 'caixa'; readonly marcada: boolean }
      | {
          readonly tipo: 'opcoes' | 'suspensa'
          readonly valor: string | null
          readonly opcoes: readonly string[]
        }
      | {
          readonly tipo: 'lista'
          readonly valores: readonly string[]
          readonly opcoes: readonly string[]
          readonly multipla: boolean
        }
      | { readonly tipo: 'assinatura'; readonly assinada: boolean }
      | { readonly tipo: 'botao' }
    )

  export type Formulario =
    | { readonly tipo: 'nenhum' }
    | { readonly tipo: 'xfa' } // só XFA (dinâmico): o pdf-lib não preenche
    | { readonly tipo: 'ilegivel' } // tem /AcroForm, e o pdf-lib não o lê
    | {
        readonly tipo: 'acroform'
        readonly hibrido: boolean // também tem /XFA
        readonly assinadoDigitalmente: boolean // algum /Sig com /V
        readonly campos: readonly CampoDoFormulario[] // na ordem de Tab
      }

  export type ValorDoCampo = { readonly id: number; readonly nome: string } & (
    | { readonly tipo: 'texto'; readonly valor: string }
    | { readonly tipo: 'caixa'; readonly marcada: boolean }
    | { readonly tipo: 'opcoes' | 'suspensa'; readonly valor: string | null }
    | { readonly tipo: 'lista'; readonly valores: readonly string[] }
  )

  export type PreenchimentoDoFormulario = {
    readonly valores: readonly ValorDoCampo[]
    readonly achatar: boolean
  }

  export type MotivoDoErroNoCampo =
    | 'texto_fora_do_winansi'
    | 'acima_do_tamanho_maximo'
    | 'aparencia_do_campo'
  ```

- **Funções puras novas no `pdf-regras`:**
  - `caixaNaTela(geometria, retangulo)`: o retângulo de um widget (espaço do PDF) na tela, pelos dois cantos no `pdfParaTela`. É o que põe o destaque e o clique em cima do campo. Errar aqui destaca o lugar errado sem dar erro, então tem o teste das quatro rotações com CropBox deslocado, como a conversão da fase 3.
  - `matrizDaAparencia(retangulo, bbox, matriz)`: a matriz que leva a aparência do widget ao retângulo dele, como o PDF manda (ISO 32000, 12.5.5): a `/BBox` passa pela `/Matrix`, e a caixa resultante é esticada e levada até o `/Rect`. Devolve `null` com a `/BBox` vazia.
  - `compararPelaOrdemDeTab(ordem)`, com `ordem` `'linhas' | 'colunas' | 'anotacoes'`: o `/Tabs` da página (`/R`, `/C`); `/S` e sem `/Tabs` seguem a ordem do `/Annots`, como o Acrobat sem estrutura.
  - `tirarFundoBranco(pixels)`: muda no lugar um `Uint8ClampedArray` RGBA (o `ImageData.data` do canvas) e devolve quantos pixels mudaram. Pela luminância (Rec. 601), de 240 para cima (`LUMINANCIA_DO_BRANCO`) o pixel fica transparente, abaixo de 200 fica como está, e entre os dois o alfa cai em linha reta, para a borda do traço não ficar serrilhada nem com um halo branco. O alfa que já era menor fica.
  - `LARGURA_MAXIMA_DA_ASSINATURA` (1200) e `escalaDaAssinatura(recorte)`: a escala do PNG da assinatura desenhada, até 4 pixels por unidade do quadro e até 1200 px de largura, passando pelo `limitarAoCanvas`.
- **`pdf-traco`:** `caixaDosTracos(tracos, espessura)`, a caixa que contém os contornos do perfect-freehand de todos os traços (com a espessura), ou `null` sem traço. É o recorte da assinatura desenhada.
- **`pdf.ts`:**
  - `lerFormulario(bytes): Promise<{ paginas: number; formulario: Formulario }>`: abre com as regras do `contarPaginas` (os mesmos `ErroDePdf`) e lê páginas e campos de uma vez, para a abertura do assinar não ler o arquivo duas vezes.
    - Sem `/AcroForm`: `nenhum`. Com `/XFA` e nenhum campo: `xfa`. Com os dois: `acroform` com `hibrido`. O `getForm()` do pdf-lib 1.17.1 tira o `/XFA` e avisa no console, e cria um `/AcroForm` vazio quando falta (lido no código do pacote). Por isso a leitura confere o dicionário cru antes, só chama o `getForm()` quando há `/AcroForm` e tira o `/XFA` da cópia em memória, que não é salva. O `getFields()` que lança vira `ilegivel`, sem recusar o PDF.
    - Cada campo: o tipo pela classe do pdf-lib (`PDFTextField`, `PDFCheckBox`, `PDFRadioGroup`, `PDFDropdown`, `PDFOptionList`, `PDFSignature`, `PDFButton`); o valor (`getText`, que lança com texto formatado e aí vale vazio; `isChecked`; `getSelected`); as opções (`getOptions`); `isRequired`, `isMultiline`, `getMaxLength` e `isMultiselect`. O `/TU` vem do dicionário do campo, porque o pdf-lib não tem leitor para ele.
    - Não preenchível: `/Sig` (`assinatura_digital`, com `assinada` quando tem `/V`), botão (`botao`), `isReadOnly` (`somente_leitura`), `isFileSelector` (`seletor_de_arquivo`) e lista ou suspensa com opção fora do WinAnsi (`fora_do_winansi`: a aparência escreve as opções com a Helvetica).
    - Widgets: a página pela referência no `/Annots` de cada página (um mapa montado uma vez), a caixa por `caixaNaTela` com a `geometriaDaPagina` da fase 3, e a opção pelo `getOnValues()` na mesma posição. Widget escondido (`/F` com Hidden ou NoView) e widget fora de toda página não entram.
    - Ordem: pela página do primeiro widget e, dentro da página, por `compararPelaOrdemDeTab`. Campo sem widget visível vai para o fim, na ordem do `getFields()`.
  - `aplicarEdicoes(bytes, edicoes, formulario?: PreenchimentoDoFormulario)`: preencher e desenhar no mesmo carregar e salvar. A ordem:
    1. confere tudo antes de carregar (`RangeError` para valor malformado, como nos objetos);
    2. formulário com `fundo` em alguma página é `RangeError`: a tela nunca manda os dois (o assinar não tem Cobrir, e o editar não preenche), e o apagar de verdade tiraria os campos da página;
    3. com valor ou `achatar`, e com `/AcroForm`: tira o `/XFA` e o `/NeedsRendering` antes do `getForm()` (sem o aviso no console) e preenche. Cada valor confere o campo pelo `id` e pelo `nome` (outro nome no mesmo `id` é `RangeError`), o tipo, o somente leitura e a opção, que tem que existir. Texto fora do WinAnsi e acima do tamanho máximo são `ErroNoCampo`;
    4. a aparência nova só nos campos que mudaram, com a mesma Helvetica que o texto dos objetos usa (`Recursos.fonte`, uma vez no arquivo): `updateAppearances(fonte)` nos que escrevem texto e `updateAppearances()` na caixa e nos botões de opção, campo a campo. O erro de um vira `ErroNoCampo` com o motivo `aparencia_do_campo`. O `save` segue com `updateFieldAppearances: false`, para os campos que a pessoa não mudou guardarem a aparência deles;
    5. com `achatar`, o `achatarFormulario` (abaixo);
    6. os objetos de cada página, como na fase 3: a assinatura fica por cima do campo achatado. Sem achatar, o campo continua anotação, e o leitor de PDF o desenha por cima do conteúdo da página;
    7. o que nada alcança sai, e o documento é salvo.
  - `achatarFormulario` (interno) não usa o `flatten()` do pdf-lib. No 1.17.1, ele lança com widget sem aparência, ignora a `/BBox` e só translada até o canto do `/Rect` e, no `removeField`, procura no `/Annots` a referência da aparência e não a do widget, deixando o widget pendurado na página (lido no código; o teste confirma). Em vez disso:
    - o campo sem aparência ganha uma, como no `flatten`, e o que não dá para gerar vira `ErroNoCampo` (`aparencia_do_campo`), com a tela sugerindo gerar sem achatar;
    - cada widget visível desenha a aparência normal dele (na caixa de marcar e no botão de opção, a do `/AS`) como XObject, com `matrizDaAparencia`, entre `q` e `Q`;
    - os widgets saem por `desligar` e `camposSemWidget`, a mesma limpeza do apagar de verdade: somem do `/Annots`, dos `/Kids`, do `/Fields`, do `/CO` e da estrutura, e o campo sem widget sai em rodadas;
    - o `/Sig` não é achatado nem sai;
    - sem campo nenhum, o `/AcroForm` sai do catálogo; com campo, sai o `/NeedAppearances`.
  - `ErroNoCampo`, com `motivo` (`MotivoDoErroNoCampo`), `campo` (o `id`), `nome` e `caracteres`.
- **Testes.** No `pdf.test.ts`, com o formulário gerado no teste (`createTextField`, `createCheckBox`, `createRadioGroup`, `createDropdown` e `createOptionList`, com o `/TU` posto no dicionário):
  - destinos, vermelho antes: o `SEGREDOS` ganha um nome do `/Dests` antigo e um da árvore que levam à página apagada, e um nome que leva à página 2 fica; árvore com `/Kids` (a folha que esvazia sai, os `/Limits` refeitos sem o nome, a raiz vazia sai); o link da página que fica e o `/OpenAction` passam ao destino explícito; sem apagar de verdade, os nomes ficam;
  - o marcador com URI, Launch, JavaScript e GoToR fica, ao lado de um que sai;
  - `lerFormulario`: os sete tipos com nome, rótulo (com e sem `/TU`), valor, opções, obrigatório, multilinha e tamanho máximo; os não preenchíveis com o motivo; os widgets conferidos contra o pdf.js (`getAnnotations`, com o `rect` levado à vista) nos cinco formatos de página da fase 3; a ordem de Tab (`/Tabs /R`, `/C` e sem `/Tabs`); o widget escondido e o que está fora de página; XFA puro, híbrido, sem formulário e ilegível; nenhum `console.warn`;
  - preencher: os cinco tipos que têm valor, lidos de volta pelo `lerFormulario` e pelo pdf.js (`fieldValue`); só o campo mudado ganha aparência nova; WinAnsi, tamanho máximo, opção que não existe, `id` com outro nome, somente leitura e tipo errado; formulário com fundo; sem valor, o arquivo não ganha `/AcroForm` nem perde o `/XFA`;
  - achatar: não sobra campo (`getFields()` vazio, nenhum widget no `/Annots`, nenhuma referência para objeto que saiu); o texto do campo no conteúdo da página, na caixa do widget (`getTextContent`); a aparência com `/BBox` deslocada no lugar certo; o widget sem aparência não quebra; o `/Sig` fica;
  - o XFA híbrido preenchido sai sem `/XFA` e sem `/NeedsRendering`;
  - a assinatura desenhada (um PNG com transparência, como o que a tela gera) cai na caixa da tela nos cinco formatos de página, no mesmo `aplicarEdicoes` que preenche o formulário, e por cima do campo achatado (pela ordem dos operadores).

  No `pdf-regras.test.ts`: `caixaNaTela` nas quatro rotações com CropBox deslocado, `matrizDaAparencia` (identidade, `/BBox` deslocada, de outro tamanho, `/Matrix` girada, vazia), `compararPelaOrdemDeTab`, `tirarFundoBranco` (branco, tinta, o degradê, o alfa que já era menor) e `escalaDaAssinatura`. No `pdf-traco.test.ts`: `caixaDosTracos`. O `pdf.leitor-pdfjs.cjs` passa a devolver também os campos de cada página (`getAnnotations`: nome, valor e caixa na tela). Cada peça nova é verificada por mutação, como na fase 3.

- **Docs da etapa:** `packages/tools/CLAUDE.md` (formulário, achatar, destinos, as duas funções da assinatura) e a fase 3 deste plano (o que fica depois do apagar de verdade).
- **Feito na etapa 1**, com estes ajustes ao desenho:
  - a caixa de marcar e os botões de opção guardam a aparência do arquivo: o valor novo só troca o `/AS`, e o `updateAppearances()` só roda quando falta a aparência do estado. Regerar sempre trocaria o desenho do autor (um X, um círculo próprio) pelo do pdf-lib, e a página já tem a aparência de cada estado;
  - a Helvetica que escreve a aparência nova vai também para o `/DR /Font` do `/AcroForm` (se o nome ainda não está lá): o `/DA` novo do campo a pede pelo nome, e o leitor que refaz a aparência depois (o Acrobat, ao editar o campo) não a acharia;
  - os widgets de cada campo vêm na ordem de Tab (página e `/Tabs`), e a posição do campo na lista é a do primeiro deles;
  - `/AcroForm` sem campo nenhum e sem `/XFA` é `nenhum`; com valor para preencher num PDF sem `/AcroForm`, `RangeError`;
  - a armadilha do `getForm()` vale também para o `save()` do pdf-lib com `updateFieldAppearances` ligado (o padrão), que passa por ele: os testes geram o XFA híbrido num segundo `save`, com a opção desligada;
  - o pdf.js 6.3.289 lê o `/Opt` dos botões de opção (`buttonValue` e `fieldValue` saem com o valor de exportação, não com o nome do estado) e devolve no `getAnnotations` também os widgets escondidos. Os testes comparam a opção de cada widget com a do pdf.js e conferem o escondido só no `lerFormulario`.

**Etapa 2: infraestrutura do web**

- **Rota e registro:** o modo `assinar` ("Assinar PDF", "Põe sua assinatura e preenche formulários de PDF", ícone `faSignature`) é o quarto do `TOOLS`, e a descrição do Editor de PDF passa a "Mesclar, organizar, editar e assinar PDF". `app/(site)/tools/pdf/assinar/page.tsx` é igual ao do editar, com `<EditarPdf modo="assinar" />`. Metadata, canonical, sitemap, `llms.txt` e o cartão do hub saem do registro. Mudam junto o `app/(site)/tools/page.test.ts` (os quatro modos), o `lib/rotas-publicas.test.ts`, o `lib/llms.test.ts` e os cartões do hub no `tools.e2e.ts` (de 3 para 4; o E2E roda na etapa 4).
- **Motor (`motor.ts`):**
  - `analisar(arquivo, opcoes?: { formulario?: boolean })`: com `formulario`, o pedido leva a marca, e o `ResultadoDaAnalise` de sucesso traz `formulario: Formulario`. A leitura que o motor reenvia quando o Worker cai leva a mesma marca;
  - `editar(arquivo, pedido: PedidoDeEdicao)`: os quatro argumentos viram o objeto que o pedido ao Worker já usa, e o `PedidoDeEdicao` ganha `formulario?: PreenchimentoDoFormulario`. Os testes da fase 3 mudam junto;
  - `FalhaDaOperacao` ganha `campo?: number` (o `id`), e o motivo passa a aceitar `MotivoDoErroNoCampo`.
- **Worker (`pdf.worker.ts`):** o `analisar` chama o `lerFormulario` com a marca (sem ela, o `contarPaginas`); o `editar` passa o `formulario` ao `aplicarEdicoes`; o `ErroNoCampo` vira `falhou` com `motivo`, `campo` e `caracteres`; o `RangeError` continua `inesperado`.
- **Abrir (`use-abrir-pdf.ts`):** `Ferramentas` ganha `formulario?: boolean`, que o hook passa ao `analisar`, e o `aoAbrir(documento, arquivo, formulario?)` recebe a leitura. O editar não lê o formulário: o custo fica só no assinar.
- **O modo no `EditarPdf`:** prop `modo?: ModoDaTela` (`'editar' | 'assinar'`, padrão `'editar'`). O componente é um só, e o que muda por modo fica em dados, no `objetos.ts`: `FERRAMENTAS_DO_MODO` (a barra; nesta etapa o assinar tem Selecionar e mover e Texto, e a Assinatura chega na etapa 3) e `SUFIXO_DO_MODO` (`editado`, `assinado`). Os textos que mudam saem de `TEXTOS.editar` ou `TEXTOS.assinar` pelo tipo `TextosDoModo`, que os dois satisfazem: os dois tetos, o motivo do Gerar desabilitado (`gerar.semMudancas`, o `semObjetos` de hoje com outro nome), o botão, o pronto e o anúncio do pronto. O `EditarPdf` guarda o formulário lido, por documento, para a etapa 3. A `BarraDeFerramentas` ganha `ferramentas: readonly Ferramenta[]`, e as setas, o Home e o End andam só nelas.
- **Dublês:** no `motor-falso.ts`, o nome do arquivo decide o formulário: `formulario` dá um campo de cada tipo nas páginas 1 e 2 (`FORMULARIO_DE_TESTE`, exportado para os testes e as stories), `xfa` dá o XFA puro, `hibrido` o híbrido e `assinado` o assinado digitalmente. O `editar` falso guarda o pedido inteiro e falha num campo com `falhaNoCampo`.
- **Testes:** `motor.test.ts` (a marca, a leitura reenviada com ela, o pedido do editar com o formulário, a falha com `campo`); `pdf.worker.test.ts` (o pdf-lib de verdade: analisar com formulário, editar com o formulário lido de volta, `ErroNoCampo` como falha com campo, formulário com fundo como `inesperado`); `editar.test.tsx` (o assinar abre com a marca e o editar sem; a barra do assinar; "Gerar PDF assinado" e o nome `-assinado.pdf`; os casos da fase 3 com o `editar` em objeto); `textos.test.ts`; e os testes do registro.
- **Docs da etapa:** rota, motor e Worker no `apps/web/CLAUDE.md`.
- **Feito na etapa 2**, com estes ajustes ao desenho:
  - os dois modos satisfazem o `TextosDoModo` no `TEXTOS_DO_MODO` (`Record<ModoDaTela, TextosDoModo>`, no `textos.ts`), que a tela usa. Um `satisfies` no objeto do `TEXTOS.editar` recusaria as chaves que só o editar tem;
  - `analisar(arquivo, { formulario: false })` é o mesmo que sem a marca: o pedido ao Worker só leva `formulario: true`, e o resultado só traz o `formulario` quando a marca foi;
  - no assinar, sem Cobrir na barra, o clique num texto do PDF não pergunta ao `textoNoPonto` nem mostra a dica de cobrir e escrever por cima, que mandaria usar uma ferramenta que o modo não tem. Na etapa 3, o clique num widget leva ao controle dele, e no assinar não há dica do texto para vir depois;
  - o formulário lido fica no estado do `EditarPdf`, preso ao documento aberto: um PDF novo traz o dele, e um recusado não herda o do anterior (teste próprio). Até o painel da etapa 3, o tipo lido aparece só no `data-formulario` da raiz da tela, que o teste confere e a etapa 3 troca pelo painel;
  - no `motor-falso.ts`, os ids do `FORMULARIO_DE_TESTE` seguem a ordem de Tab (0 a 8), com um campo sem `/TU` (o rótulo é o nome) e um somente leitura, e o `falhaNoCampo` é `{ campo, motivo, caracteres? }`, que rejeita toda edição que leva formulário;
  - o `TEXTOS.assinar.gerar.semMudancas` já tem o texto final, que fala em preencher um campo, para a etapa 3 só mudar quando o Gerar habilita;
  - as stories ModoAssinar do `Tools/PDF/Editar` e do `Tools/PDF/BarraDeFerramentas` entraram já nesta etapa, com a prop e o modo novos; a etapa 3 completa a do Editar (aviso, formulário);
  - o E2E dos cartões do hub (quatro) rodou nesta etapa, contra o build de produção, porque o registro mudou aqui.

**Etapa 3: a tela, com Jest e stories**

- **Ferramenta Assinatura (`objetos.ts`):** `'assinatura'` entra em `FERRAMENTAS` depois de Imagem (o editar fica com onze) e no `FERRAMENTAS_DO_MODO.assinar` (`selecionar`, `assinatura`, `texto`), com o ícone `faSignature`. `criarObjeto('assinatura', lugar, pagina, estilos, { assinatura })`, com `assinatura` `{ tipo: 'imagem'; imagem: ImagemParaInserir } | { tipo: 'texto'; nome: string; cor: Cor }`:
  - a imagem nasce no centro com `LARGURA_DA_ASSINATURA_NA_PAGINA` (180 pontos, a altura pela proporção), ou na caixa do arraste com a proporção, como a imagem da fase 3;
  - o nome digitado vira um `texto` em Times itálico de `TAMANHO_DA_ASSINATURA_DIGITADA` (28) pontos.

  Depois de criada, a assinatura é um objeto da fase 3. A leitura do ponto e da pressão do ponteiro (`pontoDoEvento`) sai do `QuadroDeObjetos` para o `objetos.ts`, para os dois quadros lerem igual.

- **Assinatura desenhada (`assinatura-desenhada.ts`):** `desenharAssinatura(tracos, { cor, espessura }): Promise<ImagemPreparada>`. Recorta pela `caixaDosTracos`, escala pela `escalaDaAssinatura`, pinta cada contorno (`caminhoSvgDoContorno` num `Path2D`) num canvas transparente, sai PNG (`toBlob`) e solta o canvas. Rejeita sem traço.
- **Imagem enviada:** `prepararImagem(arquivo, { tirarFundoBranco })`, no `imagem-inserida.ts`. Com a opção, a imagem é sempre desenhada de novo, passa pelo `tirarFundoBranco` (`getImageData` e `putImageData`) e sai PNG, também a que veio JPEG. As recusas são as da fase 3.
- **Componentes novos:**
  - `quadro-de-assinatura.tsx` (`QuadroDeAssinatura`; props `tracos`, `aoTracar(traco)`, `cor`, `espessura`, `idDaDica`): um quadro de 600 × 200 unidades (o traço não depende da largura na tela), na largura do painel e até 600 px, com a altura pela proporção.
    - `role="img"`, com o nome "Quadro da assinatura" e a dica ligada ("Desenhe com o dedo, o mouse ou a caneta. Sem ponteiro, use Digitar o nome.").
    - Fora do Tab: é um gesto de caminho, que o WCAG 2.5.1 isenta, e Digitar o nome é a alternativa.
    - `touch-action: none` só nele, com captura do ponteiro, os `getCoalescedEvents` e a pressão só da caneta, como o desenho da fase 3. Uma linha tracejada decorativa marca onde assinar.
  - `criar-assinatura.tsx` (`CriarAssinatura`, com as props `aoCriar(assinatura: AssinaturaPronta)`, `aoAnunciar(texto)` e `aoCancelar?`; e `AvisoDeAssinaturaVisual`): o aviso no topo, um `fieldset` "Como assinar" com três botões de opção nativos (Desenhar, Enviar imagem, Digitar o nome; as setas trocam, sem tabindex à mão) e a área do jeito escolhido:
    - Desenhar: o quadro, "Cor da tinta" (Preto, Azul), "Limpar" e "Usar esta assinatura";
    - Enviar imagem: "Escolher imagem da assinatura", "Tirar o fundo branco" (marcada), a prévia sobre um xadrez decorativo e "Usar esta assinatura". As recusas vêm em `role=alert`, com as mensagens da imagem da fase 3;
    - Digitar o nome: "Seu nome" (`autocomplete="name"`), a prévia em Times itálico, a cor e "Usar esta assinatura". Caractere fora do WinAnsi nem entra, com o `role=alert` da fase 3.

    "Limpar" e "Usar esta assinatura" ficam com `aria-disabled` e o motivo escrito ("O quadro está vazio."), e não `disabled`: assim, limpar com o foco no botão não derruba o foco no `body`. Ao abrir, o foco vai à opção marcada, e "Quadro limpo." é anunciado.

  - `painel-do-formulario.tsx` (`PainelDoFormulario`; props `formulario`, `valores`, `erros`, `desabilitado`, `registrar(id, elemento)`, `aoMudar(valor)` e `aoFocar(foco)`, com `foco` `{ campo, widget } | null`): um `<form>` de verdade (`noValidate`, sem envio), titulado por "Formulário do PDF" (`h2`) e com o resumo ("12 campos em 3 páginas").
    - Um `fieldset` por página, com a `legend` "Página N", e os campos na ordem de Tab do PDF.
    - Cada campo tem `label` ligado, "obrigatório" escrito no rótulo e `aria-required`, e `aria-describedby` para "Na página N", o contador ("12 de 14 caracteres", com `maxLength`) e o erro.
    - Texto vira `input`, ou `textarea` quando é multilinha; caixa de marcar, `checkbox`; botões de opção, um `fieldset` com `legend` e um `radio` por opção (sem repetir, na ordem dos widgets), mais "Limpar a escolha" quando não é obrigatório; suspensa e lista de escolha única, `select` com "(nenhuma)"; lista múltipla, um `fieldset` de `checkbox`. O valor que o arquivo tem e que não está nas opções aparece como mais uma opção, para não se perder.
    - O não preenchível aparece no lugar dele, com o motivo, e o somente leitura como campo `readOnly` com o valor.
    - Focar um controle chama `aoFocar` com o widget dele (no botão de opção, o da opção), e o foco que sai do formulário chama `aoFocar(null)`.
    - No topo, conforme o caso: "não tem campos", o XFA puro explicado (sem formulário), o híbrido ("Ao gerar, a versão XFA sai…"), o ilegível, o assinado digitalmente ("O PDF gerado aqui é um arquivo novo, e essa assinatura deixa de valer nele.") e a frase de que a página mostra os campos como estão no arquivo.
  - `destaque-do-campo.tsx` (`DestaqueDoCampo`; props `caixas` e `tamanho`): o contorno por cima da folha, em porcentagem da página como os objetos, `aria-hidden` e sem ponteiro, com anel na cor primária e borda branca (aparece em página clara e escura), sem animação.

- **Lógica sem React (`formulario.ts`):** `valoresIniciais(campos)`, `valoresMudados(campos, valores)` (só o que difere do arquivo; a lista é comparada sem ordem), `obrigatoriosVazios(campos, valores)`, `campoNoPonto(campos, pagina, ponto)` (o widget de menor área que contém o ponto), `caixasDoFoco(campos, foco, pagina)` e `rolagemParaMostrar(caixa, vista, margem)`. O estado mora no hook `useFormularioDoPdf(formulario)` (`use-formulario-do-pdf.ts`): valores, erros, foco e achatar, recomeçando a cada documento. Fica fora do histórico do desfazer: cada controle já mostra o valor, e o campo de texto tem o desfazer do navegador.
- **No `EditarPdf`:**
  - no assinar, o `AvisoDeAssinaturaVisual` fica logo depois do aviso de privacidade, sempre (com e sem arquivo). A partir de `lg`, duas colunas: a página à esquerda, o painel do objeto e o formulário à direita; antes, uma coluna. A ordem no DOM é barra, página, painel do objeto, formulário e gerar;
  - ligar a Assinatura sem assinatura pronta abre o `CriarAssinatura` nas opções da ferramenta. Com ela pronta, as opções mostram a prévia ("Assinatura pronta" e a descrição em texto), "Inserir no centro" e "Criar outra assinatura";
  - "Usar esta assinatura" guarda a assinatura (o PNG entra no `imagens` como as imagens da fase 3, conta no teto e fica enquanto ela estiver pronta ou algum passo do histórico a usar), anuncia "Assinatura pronta. Clique na página…" e leva o foco ao "Inserir no centro". Pôr segue a imagem (clique, arraste ou centro) e depois volta para Selecionar e mover, com o foco no objeto. A assinatura continua pronta para a próxima página, até a tela sair. Nada vai para `localStorage`, `sessionStorage` ou IndexedDB;
  - focar um campo de outra página abre a página dele sem anúncio (o "Na página N" do campo já diz) e sem tirar o foco do campo. O destaque aparece quando a página fica pronta, e a área rola até ele (`rolagemParaMostrar`, sem suavizar com reduzir movimento);
  - com Selecionar, o clique num widget da página leva o foco ao controle dele, antes da dica do texto do PDF;
  - o anúncio do PDF aberto ganha, no assinar, o resumo do formulário (`TEXTOS.formulario.aoAbrir`);
  - gerar habilita com objeto, campo mudado ou achatar. "Achatar o formulário" (caixa, com a explicação ligada) fica na área de gerar, só com formulário. Campos obrigatórios vazios são avisados ali, sem travar, com "Ir para o campo". O `motor.editar` recebe `formulario: { valores: valoresMudados(...), achatar }` só quando há o que mandar. O resumo conta objetos e campos, e o PDF sai como `<nome>-assinado.pdf`. Mudar um valor descarta o resultado, como mudar a cena. A falha num campo vem em `role=alert` com "Mostrar o campo", que leva o foco ao controle.
- **Textos (`textos.ts`):**
  - `TEXTOS.editar.ferramentas`: `nomes.assinatura`, `dicas.assinatura` e `semAssinatura`;
  - `TEXTOS.assinatura` (os dois modos): `aviso`, `jeitos` (rotulo, desenhar, enviar, digitar), `quadro` (rotulo, dica, limpar, vazio, limpo), `cor` (rotulo, preto, azul), `enviar` (escolher, outra, tirarFundo, dicaDoFundo, pronta), `digitar` (rotulo, dica), `usar`, `semImagem`, `semNome`, `pronta` (titulo, descricao, criarOutra), `nomes` (desenhada, enviada, digitada: o nome da imagem no nome do objeto para o leitor de tela) e `anuncios.pronta`;
  - `TEXTOS.assinar`: o `TextosDoModo` e mais `gerar` (resumo, achatar, dicaDoAchatar, obrigatoriosVazios, irParaOCampo, mostrarCampo) e `falhaNoCampo(falha, rotulo)`;
  - `TEXTOS.formulario`: `titulo`, `resumo`, `aoAbrir`, `pagina`, `naPagina`, `obrigatorio`, `caracteres`, `nenhuma`, `limparEscolha`, `semFormulario`, `xfa`, `hibrido`, `ilegivel`, `assinadoDigitalmente`, `paginaMostraOriginal` e `naoPreenchivel[motivo]`.

  Números, listas e plural pelo `Intl`, como os outros.

- **Testes:**
  - `objetos.test.ts`: as ferramentas de cada modo; `criarObjeto('assinatura')` com a imagem no centro e no arraste, e o texto em Times itálico;
  - `formulario.test.ts`: cada função;
  - `assinatura-desenhada.test.ts` (canvas dublado): o recorte, até 1200 px, um `fill` por traço, PNG, o canvas solto, sem traço;
  - `imagem-inserida.test.ts`: o fundo tirado redesenha sempre, sai PNG mesmo do JPEG, e o `putImageData` leva o alfa novo;
  - `criar-assinatura.test.tsx`: os três jeitos, o aviso, o traço pelo ponteiro, o `touch-none` só no quadro, Limpar e Usar com o motivo e o foco, a recusa da imagem, o WinAnsi do nome e o que o `aoCriar` recebe;
  - `painel-do-formulario.test.tsx`: cada tipo pelo rótulo, `fieldset` e `legend` por página, obrigatório, somente leitura, contador, os não preenchíveis com o motivo, o widget de cada opção no `aoFocar` e os avisos do topo;
  - `editar.test.tsx`: a barra de 3 e a de 11; o aviso sempre no assinar; criar e pôr cada jeito; a assinatura reusada noutra página; o formulário do `motor-falso`; o campo da página 2, que abre a página sem anúncio e põe o destaque; o clique no widget; o pedido ao motor só com os mudados e o achatar; a falha com "Mostrar o campo"; o XFA e o híbrido; o resultado descartado ao mudar um valor; nada no `Storage` nem no IndexedDB.

  Verificado por mutação, como na fase 3.

- **Stories:** `Tools/PDF/QuadroDeAssinatura` (Vazio, ComTracos), `Tools/PDF/CriarAssinatura` (Desenhar, EnviarImagem, DigitarONome, ImagemRecusada), `Tools/PDF/PainelDoFormulario` (TodosOsTipos, Hibrido, Xfa, AssinadoDigitalmente, SemFormulario, ComErro), `Tools/PDF/DestaqueDoCampo` e, no `Tools/PDF/Editar`, ModoAssinar, AssinarComFormulario e AssinaturaPronta. A `Tools/PDF/BarraDeFerramentas` ganha ModoAssinar. Nenhuma usa `appDirectory`: o `useRouter` quebra no Storybook com o Next 16.4.5 (ver "Testes" no `apps/web/CLAUDE.md`).
- **Docs da etapa:** a seção do assinar no `apps/web/CLAUDE.md`.
- **Feito na etapa 3**, com estes ajustes ao desenho:
  - **a página do assinar ficou mais larga:** o `ToolPageShell` ganhou `larga` (`max-w-6xl` a partir de `lg`; antes disso, a largura de leitura de sempre, `max-w-3xl`). Com 3xl, a coluna da página ficaria com uns 330 px ao lado do formulário. A coluna da página fica presa no topo ao rolar (`lg:sticky`), para o destaque continuar à vista enquanto a pessoa desce pelo formulário. O editar continua com uma coluna e a largura de leitura;
  - `pontoDoEvento(evento, caixa, area)` devolve o `PontoDoTraco` (com a pressão só da caneta) já dentro da área, e o `QuadroDeObjetos` tira dele também o ponto sem pressão;
  - o foco no formulário é `FocoNoCampo` (`{ campo, widget }`, o id do campo e a posição do widget em `widgets`). O `formulario.ts` ganhou `ehPreenchivel`, `temControle` (os preenchíveis e o texto somente leitura, o que o clique no widget pode focar), `opcoesNaOrdem` e `paginaDoFoco`, e o hook exporta `camposDo`;
  - `registrar(id, elemento, opcao?)`: o radio é registrado também pela opção, para o clique no widget de uma opção focar aquela opção; sem opção, o registrado é o controle do campo (no grupo de opções, a marcada ou a primeira);
  - `aoMudar(valor, recusados?)`: o painel tira o caractere fora do WinAnsi na hora (com o cursor onde a pessoa escrevia, como no texto da fase 3) e manda os recusados; o hook guarda a mensagem nos `erros` do campo, que o painel mostra em `role=alert` ligada ao controle (`aria-invalid` e `aria-describedby`);
  - o `aoCriar` do `CriarAssinatura` devolve a mensagem quando a tela não aceita a assinatura (o teto de 50 MB das imagens), e ela aparece em `role=alert` no próprio criar. A `AssinaturaPronta` leva o jeito (`desenhada`, `enviada` com o nome do arquivo, `digitada`), que dá a descrição em texto da assinatura pronta (`TEXTOS.assinatura.pronta.descricao`). Os `nomes` ficaram só com `desenhada` e `enviada(arquivo)`: a digitada vira texto, e o nome do objeto já diz o conteúdo;
  - a assinatura pronta vale até a tela sair, também para o próximo PDF aberto ali: o `aoAbrir` solta as imagens do documento anterior, menos a dela;
  - a espessura do traço no quadro é `ESPESSURA_DA_ASSINATURA` (4 unidades do quadro de 600);
  - o painel do formulário aparece no assinar com todo PDF aberto: sem formulário, diz que não tem campos (a pessoa entende por que não há o que preencher). O campo sem widget visível vai para um último `fieldset`, "Fora das páginas". A suspensa e a lista de escolha única usam o índice da opção no `value` do `select`, para uma opção com qualquer texto (até vazio) não se confundir com "(nenhuma)". "Limpar a escolha" só aparece com uma opção marcada, e o foco vai para a primeira opção quando ele some;
  - "Achatar o formulário" e o aviso dos obrigatórios vazios só aparecem com AcroForm. O XFA puro não tem achatar;
  - o atributo provisório `data-formulario` da etapa 2 saiu, trocado pelo painel;
  - o hook não tem teste à parte: o `painel-do-formulario.test.tsx` usa o hook de verdade, e o `editar.test.tsx` passa por ele;
  - a story `Tools/PDF/DestaqueDoCampo` tem CampoDeTexto e CaixaDeMarcar, numa folha com os campos do `FORMULARIO_DE_TESTE` desenhados em cinza. As do assinar no `Tools/PDF/Editar` levam `parameters.larga`, como a página;
  - verificado por mutação (24 mutantes, todos derrubados): a pressão só da caneta, o `touch-none` do quadro, o `aria-disabled` do Limpar, o foco na opção marcada, a lista comparada sem ordem, o widget de menor área (o teste ganhou a ordem invertida, porque o mutante sobreviveu no primeiro), o destaque só da opção, o texto só com espaços, o PNG e o redesenho do fundo tirado, o recorte e o canvas solto da assinatura desenhada, o WinAnsi no formulário, o `aoFocar(null)`, o foco depois de "Limpar a escolha", a página do campo sem anúncio, o clique no widget, o formulário só quando há o que mandar, a assinatura pronta fora do soltar (com teste novo, porque sobreviveu no primeiro) e no `aoAbrir`, o Gerar com campo mudado, o foco no "Inserir no centro" (e em "Criar outra assinatura" com a página sem desenho) e o foco no objeto da assinatura digitada.

**Etapa 4: E2E, axe, peso, memória e docs**

- **E2E** no `tools.e2e.ts` (`describe('Assinar PDF')`), contra o build de produção, com o PDF baixado lido pelo pdf-lib e pelo pdf.js em Node. Os PDFs são gerados no teste: um formulário de duas páginas com um campo de cada tipo, `/TU`, obrigatório, tamanho máximo, um `/Sig` e um somente leitura; o XFA puro; o híbrido; e o PNG de assinatura com fundo branco (`pngDeTeste`). Casos:
  - preencher pelo teclado (o Tab na ordem do PDF) e baixar: os valores no `getForm()` do PDF baixado, e o híbrido sem `/XFA`;
  - achatar: nenhum campo, e o texto preenchido na caixa do widget;
  - focar um campo da página 2 abre a página, e o destaque cobre a caixa do widget na tela;
  - desenhar com o ponteiro do Playwright, usar, inserir no centro e mover pelas setas: a imagem no PDF na caixa do painel, com `/SMask`;
  - o nome digitado sai em `Times-Italic` (nas fontes da página) e na posição da tela;
  - a imagem com o fundo tirado sai com a `/SMask` em 0 no canto e 255 no traço;
  - o XFA puro explicado, sem formulário; o `/Sig` listado como não preenchível; o aviso de assinatura visual sem arquivo, com arquivo e no painel;
  - 320 px sem rolagem lateral, com o quadro na largura, o formulário numa coluna e os alvos de 44 px;
  - contraste nos dois temas (os avisos, o formulário, o painel da assinatura, o PDF pronto);
  - axe (WCAG 2.0, 2.1 e 2.2 A e AA, sem violação séria nem crítica) a 1280 e a 320 px, com o formulário, o painel da assinatura aberto e o PDF pronto; e o `toMatchAriaSnapshot` do formulário e da escolha do jeito;
  - nada sai do aparelho no fluxo inteiro (`vigiarPedidos` e `conferirQueNadaSaiu`, com o PDF e a imagem), e nada no `localStorage`, no `sessionStorage` e no `indexedDB.databases()` depois de criar a assinatura; nenhum Worker antes do arquivo e dois depois;
  - no editar, a Assinatura na barra e o nome digitado no PDF.
- **Peso:** o chunk do `/tools/pdf/assinar` (o mesmo `EditarPdf`), o Worker do pdf-lib (que já leva o código de formulário do pdf-lib) e nenhum dos três pesados no HTML de nenhuma página, comparados com os números da fase 3.
- **Memória:** no teto do modo (49 MB, 20 páginas), com um campo de texto por página: abrir, preencher os 20, pôr a assinatura em 3 páginas e gerar, com e sem achatar. Método de "Medições do editar", no headless shell 1234 enquanto o Chromium 1217 não voltar ao cache.
- **Docs:** "Feito na quarta etapa" aqui; "Medições do assinar" e os testes no `apps/web/CLAUDE.md`; o `packages/tools/CLAUDE.md`. No PR, o roteiro de leitor de tela (VoiceOver no macOS e no iOS, NVDA no Windows: o formulário pelo Tab, os rótulos, o destaque calado, os três jeitos de assinar) e a linha de segurança (sem dependência nova, nada guardado no navegador, imagem conferida pelos bytes).
- **Feito na etapa 4**, com estes ajustes ao desenho:
  - **E2E:** 17 casos no `describe('Assinar PDF')`, contra o build de produção, todos os da lista acima. Os PDFs saem do teste: `pdfDoFormulario` (páginas de 400 × 500, oito campos na ordem de Tab, com as opções `hibrido` e `assinado`), `pdfSoComXfa` e a foto de uma rubrica em papel, pelo `pngDeTeste`, que agora aceita a cor de cada pixel. O `tools.e2e.ts` inteiro passa com 78 casos.
  - **A área da página entrou no Tab.** O axe a 1280 px acusou `scrollable-region-focusable`: na coluna do assinar, a página fica mais alta que a área, e, sem objeto na página, nada dentro dela recebia o foco, então quem usa o teclado não rolava até o resto da página. A área virou `role=group` "Área da página N", com `tabindex=0`, e as setas a rolam. Vale nos dois modos: no editar, o Tab passa por ela antes dos objetos (o E2E do teclado do editar mudou junto, e o `editar.test.tsx` ganhou o caso).
  - **Três caixas de marcar tinham o rótulo com 36 px de altura:** "Aceito os termos" (a caixa do formulário), "Achatar o formulário" e "Tirar o fundo branco". O teste dos alvos de 44 px a 320 px as achou. O rótulo, que também liga a caixa, passou a ter 44 px.
  - Com um `/Sig` no formulário, achatar deixa o `/Sig`, como o desenho manda. O E2E confere que só ele sobra, e não que nenhum campo sobra.
  - No E2E do Tab, a suspensa é escolhida pelo `selectOption`, porque no Chromium do macOS as setas abrem a lista nativa em vez de trocar a opção. O resto é pelo teclado: Tab, Espaço e setas.
  - **Peso** (build de 2026-11-17, KB de 1.000 bytes e gzip no nível 9, os números da fase 3):
    - o Worker do pdf-lib foi de 442 KB (182 KB gzip) para 450 KB (184 KB gzip), com a leitura do formulário e o achatar;
    - a tela do editar e do assinar, um chunk só (o mesmo `EditarPdf`), foi de 50 KB (15 KB gzip) para 79 KB (23 KB gzip), e só está no HTML desses dois modos;
    - o chunk do pdf.js segue com 433 KB (128 KB gzip), e o Worker dele é o arquivo do pacote (mesmo sha256).

    Nenhum dos três pesados está no HTML de nenhuma das 36 páginas. Os números de cada página estão em "Peso" no `apps/web/CLAUDE.md`.

  - **Memória:** o pico do assinar é o da abertura, igual ao do organizar no mesmo PDF. Preencher os 20 campos, pôr a assinatura em 3 páginas e gerar (com e sem achatar) ficam abaixo dele. A tabela está em "Medições do assinar" no `apps/web/CLAUDE.md`.
  - **Segurança** (skill `security-audit` em modo guia, partes CLIENT-SIDE e SUPPLY-CHAIN, sobre o diff da fase):
    - nenhuma dependência, lock, workflow ou configuração mudou desde a fase 3;
    - o código de produção da fase não tem sink de DOM (`innerHTML`, `dangerouslySetInnerHTML`, `eval`, URL montada com dado do PDF);
    - o que vem do PDF (nome, rótulo, opções e caixas dos campos) chega à tela só como texto do React e como número;
    - o Worker é dedicado, e só a página que o criou fala com ele;
    - a imagem da assinatura é conferida pelos bytes (PNG ou JPEG, sem SVG);
    - nada vai para `localStorage`, `sessionStorage` ou IndexedDB, conferido também no E2E.

    Nenhum achado confirmado.

**Fica de fora, de propósito:**

- Os valores na página grande antes de gerar. O pdf.js desenha os campos com a aparência do arquivo; mostrar o que a pessoa digitou pediria o `annotationStorage` dele e um desenho novo a cada tecla, e a aparência sairia diferente da que o pdf-lib grava. A tela diz que os valores entram no PDF ao gerar.
- Assinatura digital com certificado, e preencher o `/Sig`.
- Preencher XFA dinâmico.
- Texto livre na suspensa editável: só as opções do arquivo.
- Guardar a assinatura entre visitas.

## Ordem e entrega

1. **PR 1, mesclar** (#112): Worker, pdf-lib só na página, teto medido.
2. **PR de docs**: este plano.
3. **Fase 2**: rota `/tools/pdf`, redirecionamento do `/tools/mesclar-pdf`, miniaturas (pdf.js) e organizar.
4. **Fase 3**: inserir por cima, com cobrir e apagar de verdade.
5. **Fase 4**: assinatura e formulário.

Cada PR: revisão do Crivo no SHA exato, CI verde, merge com `--match-head-commit`, deploy da Vercel conferido, a página aberta em produção e o resultado mandado ao Pilutech Maestro. Depois do merge, a worktree sai, e o `apps/web/CLAUDE.md` e o `packages/tools/CLAUDE.md` ficam com o que a fase mudou.

## Decisões tomadas sem o Paulo (aprovação geral de 2026-11-16)

- pdf-lib 1.17.1 (parado desde 2021, mas maduro) em vez do fork `@cantoo/pdf-lib`, que pede faixas abertas de versão.
- pdfjs-dist 6.3.289, a mesma versão do `apps/financas`, em vez da 6.5. A troca para uma mais nova vale para os dois apps juntos, num PR próprio.
- Teto de 100 MB por documento no mesclar (medido) e, nos modos com miniatura, de 50 MB e 500 páginas (medidos na fase 2).
- Só as fontes padrão do PDF; sem fontkit.
- perfect-freehand para traço e assinatura; sem signature_pad.
- Editar o texto existente fica fora; o caminho é cobrir e escrever. Cobrir avisa que não apaga, e "apagar de verdade" transforma a página em imagem com os retângulos queimados nela e sem as anotações da página.
- Teto de bytes medido de novo na fase 2, com o pdf.js aberto: 50 MB nos modos com miniatura.
- O quadro de objetos é `role=application`, com teste manual em VoiceOver e NVDA.
- Assinatura sem guardar no navegador e com o aviso de que não é assinatura digital.
- Rotas por modo debaixo de `/tools/pdf`, com 308 do `/tools/mesclar-pdf`.
- Um Worker do pdf.js por documento aberto (`PDFWorker.create({ port })`), não o `GlobalWorkerOptions.workerPort` global, para fechar o documento soltar a memória dele.
- No organizar, as páginas que saem do plano são esvaziadas antes da cópia, para o conteúdo delas não ir junto por um link interno; e mover com seleção não contígua deixa a que encostou na ponta parada e leva as outras até ela.
- No organizar, o pdf-lib lê o arquivo antes do pdf.js abrir: os erros têm as mesmas mensagens do mesclar, e um PDF recusado ou com páginas demais não chega ao pdf.js. Se os dois contam um número diferente de páginas, o arquivo é recusado como corrompido.
- Fechar um documento do pdf.js espera o `destroy` da tarefa (no máximo 2 s) antes de encerrar o Worker, para as fontes saírem de `document.fonts`.
- Os `.wasm` do pdf.js (JPX, JBIG2, cor ICC) ficam para a fase 3: na fase 2, a miniatura de um PDF com essas imagens sai sem elas, e a tentativa do pdf.js gera um GET de 404 na própria origem, sem o arquivo.
- No organizar, o "Gerar PDF organizado" e o resultado ficam antes da lista de páginas, logo depois da barra.
- Botões rápidos por página (selecionar, girar à direita, apagar) e o resto na barra da seleção, com o número original da página no rótulo.
- O E2E de privacidade passou de "só GET na própria origem" para "nada vai a outra origem e nenhum corpo leva o PDF".
- Na fase 3, os objetos guardam a posição em pontos da tela, e o texto não quebra sozinho. Redimensionar texto pelo teclado muda a fonte.
- Na fase 3, o apagar de verdade edita o documento no lugar (marcadores, links e formulário ficam) e, em toda edição, o que nada alcança sai do arquivo antes de salvar. Depois da revisão do #120, saem também o XFA, os textos dos elementos de estrutura pais que só descrevem páginas apagadas e os marcadores que levam a elas.
- Na fase 3, o modo se chama "Editar PDF" (`/tools/pdf/editar`), abre com as mesmas regras do organizar (um hook para os dois) e tem zoom por botões, de 50% a 400% da largura da área.
- Os recursos do pdf.js vêm de uma cópia em `public/pdfjs/<versão>/`, conferida por hash contra o pacote: só os decodificadores de JPEG 2000 e JBIG2 e as fontes Symbol e ZapfDingbats, buscados pela página por uma fábrica com lista fechada. Sem perfil de cor ICC, cmaps nem Liberation.
- Na fase 3, a foto JPEG com o EXIF girando é desenhada de novo em pé antes de entrar, e o apagar de verdade é marcado por página.
- Na fase 3, passos seguidos do mesmo objeto pelo teclado ou pelo painel viram um passo só do desfazer, e a dica de cobrir e escrever por cima só aparece quando o clique cai num texto do PDF.
- Na fase 4, o apagar de verdade tira também os nomes de destino que levam às páginas apagadas (revisão do #120), e quem usava o nome passa ao destino explícito. O marcador cuja ação não leva a uma página do documento fica.
- Na fase 4, o assinar é o `EditarPdf` com `modo="assinar"`: a barra só com Selecionar e mover, Assinatura e Texto, e o formulário só nesse modo. Preencher e assinar saem num carregar e salvar só.
- Na fase 4, achatar é uma função própria, e não o `flatten()` do pdf-lib 1.17.1, que quebra com widget sem aparência, ignora a `/BBox` e deixa o widget no `/Annots`.
- Na fase 4, a página grande mostra os campos como estão no arquivo, e os valores entram no PDF ao gerar.
- Na fase 4, a área da página entra no Tab (`role=group`, "Área da página N"), nos dois modos, para o teclado rolar a página que não cabe nela (achado do axe).
