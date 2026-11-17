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
  - ficam, de propósito: os metadados do documento (título, autor, XMP), os marcadores e o texto alternativo de elemento de estrutura sem `/Pg`;
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
  - O painel numérico é o caminho garantido. Mesmo assim, o PR da fase 3 traz o teste manual com VoiceOver (macOS e iOS) e NVDA (Windows): mover e redimensionar pelas setas, e o anúncio da posição.
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

  A medida de pico de memória ao salvar um PDF de 100 MB com objetos fica registrada no PR.

- **Imagem aceita:** só PNG e JPEG, conferidos pelos bytes iniciais, não pela extensão. SVG fica de fora (pode carregar script).
- **Testes:**
  - Jest da conversão de coordenadas, cobrindo as quatro rotações e o CropBox;
  - Jest de cada objeto desenhado pelo pdf-lib. O texto é conferido lendo o PDF de volta com o pdf.js em Node (`getTextContent`: texto e posição), como o `apps/financas` já faz. Feito na primeira etapa: como o Jest do `packages/tools` é CommonJS, o pdf.js roda num processo filho do Node, e as formas e imagens também são conferidas, pela caixa de cada desenho no `getOperatorList`;
  - "apagar de verdade" conferido de três jeitos: o texto deixou de existir na página (`getTextContent`), a página não tem mais `/Annots`, e os pixels da imagem embutida sob o retângulo são brancos. Esta última conferência decodifica o JPEG no navegador (E2E, `createImageBitmap`) e lê o canvas;
  - motor e componente: mover e redimensionar pelo teclado, anúncio e painel numérico;
  - E2E: inserir texto, mover pelo teclado, salvar e conferir texto e posição no PDF baixado; inserir imagem; marca-texto; cobrir com e sem apagar de verdade; 320 px, contraste e nada saindo do aparelho (a regra do E2E acima). Já entraram, com a infraestrutura: a imagem em JPEG 2000 na página grande e na miniatura (com o decodificador da própria origem e nenhuma resposta 4xx), os Workers só depois do arquivo, nada saindo ao abrir, passar de página e mudar o zoom, 320 px com zoom e o contraste nos dois temas.

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
- Na fase 3, o apagar de verdade edita o documento no lugar (marcadores, links e formulário ficam) e, em toda edição, o que nada alcança sai do arquivo antes de salvar.
- Na fase 3, o modo se chama "Editar PDF" (`/tools/pdf/editar`), abre com as mesmas regras do organizar (um hook para os dois) e tem zoom por botões, de 50% a 400% da largura da área.
- Os recursos do pdf.js vêm de uma cópia em `public/pdfjs/<versão>/`, conferida por hash contra o pacote: só os decodificadores de JPEG 2000 e JBIG2 e as fontes Symbol e ZapfDingbats, buscados pela página por uma fábrica com lista fechada. Sem perfil de cor ICC, cmaps nem Liberation.
