import {
  ERROS_DO_ARQUIVO,
  TEXTOS,
  formatarGraus,
  formatarPorcentagem,
  formatarTamanho,
  paginas,
} from './textos'

describe('formatarTamanho', () => {
  it.each([
    [512, '512 bytes'],
    [120_400, '120,4 kB'],
    [3_450_000, '3,5 MB'],
    [100_000_000, '100 MB'],
    [1_200_000_000, '1,2 GB'],
  ])(
    '%d bytes viram %s, com vírgula decimal e unidade do Intl',
    (bytes, texto) => {
      expect(formatarTamanho(bytes)).toBe(texto)
    },
  )
})

it('plural pelo Intl.PluralRules do pt-BR', () => {
  expect(paginas(1)).toBe('1 página')
  expect(paginas(12)).toBe('12 páginas')
  expect(paginas(1500)).toBe('1.500 páginas')
})

it('porcentagem pelo Intl', () => {
  expect(formatarPorcentagem(0.456)).toBe('46%')
})

it('o aviso de privacidade diz que nada sai do aparelho', () => {
  expect(TEXTOS.privacidade.titulo).toBe('Seus arquivos não saem do aparelho')
  expect(TEXTOS.privacidade.texto).toContain('Nenhum PDF é enviado')
})

it('todo erro de arquivo diz o que houve e, quando dá, o que fazer', () => {
  expect(Object.keys(ERROS_DO_ARQUIVO).sort()).toEqual([
    'corrompido',
    'falha_do_navegador',
    'nao_e_pdf',
    'protegido',
    'sem_paginas',
  ])
  expect(ERROS_DO_ARQUIVO.falha_do_navegador).not.toMatch(/corrompido/)
  expect(ERROS_DO_ARQUIVO.protegido).toMatch(/senha.*Tire a proteção/)
  expect(ERROS_DO_ARQUIVO.nao_e_pdf).toMatch(/Escolha um arquivo \.pdf/)
})

it('graus sem o espaço que o Intl põe em pt-BR', () => {
  expect(formatarGraus(90)).toBe('90°')
  expect(formatarGraus(270)).toBe('270°')
})

it('organizar: plural e concordância das páginas pelo Intl', () => {
  const { anuncios, selecionadas } = TEXTOS.organizar
  expect(selecionadas(0)).toBe('Nenhuma página selecionada')
  expect(selecionadas(1)).toBe('1 página selecionada')
  expect(selecionadas(1200)).toBe('1.200 páginas selecionadas')
  expect(anuncios.girada(3, 180)).toBe('Página 3 girada para 180°.')
  expect(anuncios.giradas(2, 'esquerda')).toBe(
    '2 páginas giradas para a esquerda.',
  )
  expect(anuncios.apagadas(1)).toBe('1 página apagada.')
  expect(anuncios.apagadas(2)).toBe('2 páginas apagadas.')
  expect(anuncios.movidas(3, 'depois')).toBe('3 páginas movidas para depois.')
})

it('o aviso de alcance diz que marcadores e links internos não passam', () => {
  expect(TEXTOS.alcance).toMatch(/marcadores/)
  expect(TEXTOS.alcance).toMatch(/links para outra página do mesmo PDF/)
})

describe('editar', () => {
  const { falhaAoSalvar, anuncios, paginaAtual, zoom } = TEXTOS.editar

  describe('adicionar outro PDF: a recusa não mexe no documento e diz o que ainda cabe', () => {
    const { recusado, passouDoTeto } = TEXTOS.editar.adicionar
    const tetos = { bytes: 50_000_000, paginas: 500 }

    it('o motivo do arquivo, com as mensagens de sempre', () => {
      expect(recusado('b.pdf', 'protegido')).toBe(
        `Não deu para adicionar b.pdf. ${ERROS_DO_ARQUIVO.protegido}`,
      )
    })

    it('os bytes somados: o tamanho dele, o que ainda cabe e o teto', () => {
      expect(
        passouDoTeto(
          'b.pdf',
          {
            passou: 'bytes',
            bytes: 30_000_000,
            restam: { bytes: 12_400_000, paginas: 300 },
          },
          tetos,
        ),
      ).toBe(
        'Não deu para adicionar b.pdf: ele tem 30 MB, e só cabem mais 12,4 MB (até 50 MB somando os PDFs abertos). Divida o PDF em partes menores no programa que o criou e adicione uma de cada vez.',
      )
    })

    it('as páginas somadas, inclusive quando não cabe mais nenhuma', () => {
      expect(
        passouDoTeto(
          'b.pdf',
          {
            passou: 'paginas',
            bytes: 1,
            paginas: 120,
            restam: { bytes: 1, paginas: 40 },
          },
          tetos,
        ),
      ).toBe(
        'Não deu para adicionar b.pdf: ele tem 120 páginas, e só cabem mais 40 páginas (até 500 somando os PDFs abertos). Divida o PDF em partes menores no programa que o criou e adicione uma de cada vez.',
      )
      expect(
        passouDoTeto(
          'b.pdf',
          {
            passou: 'paginas',
            bytes: 1,
            paginas: 1,
            restam: { bytes: 1, paginas: 0 },
          },
          tetos,
        ),
      ).toBe(
        'Não deu para adicionar b.pdf: ele tem 1 página, e não cabe mais nenhuma (até 500 somando os PDFs abertos).',
      )
      expect(
        passouDoTeto(
          'b.pdf',
          {
            passou: 'bytes',
            bytes: 2_000_000,
            restam: { bytes: 0, paginas: 3 },
          },
          tetos,
        ),
      ).toBe(
        'Não deu para adicionar b.pdf: ele tem 2 MB, e não cabe mais nada (até 50 MB somando os PDFs abertos).',
      )
    })
  })

  describe('a página em branco: a recusa pelo teto diz o que ainda cabe', () => {
    const { passouDoTeto } = TEXTOS.editar.branca

    it('com o documento cheio, não cabe mais nenhuma', () => {
      expect(passouDoTeto(500)).toBe(
        'Não deu para criar a página em branco: não cabe mais nenhuma página (até 500 somando os PDFs abertos e as páginas em branco).',
      )
    })
  })

  describe('a página em branco: o botão, o anúncio, a origem e o cabeçalho', () => {
    const B = TEXTOS.editar.branca
    const P = TEXTOS.editar.paginasDoDocumento

    it('o botão tem o nome do desenho, e o curto do celular cabe no nome', () => {
      expect(B.botao).toBe('Página em branco')
      expect(B.curto).toBe('Em branco')
      expect(B.botao.toLowerCase().endsWith(B.curto.toLowerCase())).toBe(true)
    })

    it('o anúncio diz depois de qual página ela entrou e que fica marcada (D3)', () => {
      expect(B.adicionada(3)).toBe(
        'Página em branco adicionada depois da página 3, já selecionada.',
      )
      expect(B.adicionada(1_000)).toBe(
        'Página em branco adicionada depois da página 1.000, já selecionada.',
      )
    })

    it('a origem no cartão diz o tamanho: A4 de pé ou deitada pelo nome, os outros em centímetros', () => {
      expect(P.origemDaBranca({ largura: 595.28, altura: 841.89 })).toBe(
        'Página em branco, A4',
      )
      expect(P.origemDaBranca({ largura: 841.89, altura: 595.28 })).toBe(
        'Página em branco, A4 deitada',
      )
      // O A4 que o pdf.js mede numa página de arquivo (595 × 842) também é A4.
      expect(P.origemDaBranca({ largura: 842, altura: 595 })).toBe(
        'Página em branco, A4 deitada',
      )
      expect(P.origemDaBranca({ largura: 612, altura: 792 })).toBe(
        'Página em branco, 21,6 × 27,9 cm',
      )
      expect(P.origemDaBranca({ largura: 300, altura: 300 })).toBe(
        'Página em branco, 10,6 × 10,6 cm',
      )
    })

    it('a folha da página grande diz que ela é em branco', () => {
      expect(TEXTOS.editar.paginaEmBranco(4)).toBe('Página 4, em branco')
    })

    it('o tamanho que não deu para ler diz qual página e o que fazer', () => {
      expect(B.semTamanho(4)).toBe(
        'Não deu para criar a página em branco: não deu para ler o tamanho da página 4, talvez por falta de memória. Feche outras abas e tente de novo.',
      )
    })

    it('enquanto a branca espera o tamanho, o Gerar e o Extrair dizem por que esperam', () => {
      expect(TEXTOS.editar.gerar.criandoBranca).toBe(
        'Espere a página em branco entrar para gerar o PDF.',
      )
      expect(TEXTOS.organizar.dicas.criandoBranca).toBe(
        'Espere a página em branco entrar para extrair.',
      )
    })

    it('o cobrir numa página em branco diz que não há nada embaixo para apagar', () => {
      expect(TEXTOS.editar.cobrir.naBranca).toBe(
        'Esta página é em branco: não há nada embaixo do cobrir para apagar, ele só pinta por cima.',
      )
    })

    it('o cabeçalho conta as páginas em branco depois dos nomes dos arquivos', () => {
      expect(TEXTOS.editar.abertos(['a.pdf'], 4, 1)).toBe(
        'a.pdf + 1 página em branco · 4 páginas',
      )
      expect(TEXTOS.editar.abertos(['a.pdf', 'b.pdf'], 9, 2)).toBe(
        'a.pdf + b.pdf + 2 páginas em branco · 9 páginas',
      )
      expect(TEXTOS.editar.abertos([], 2, 2)).toBe(
        '2 páginas em branco · 2 páginas',
      )
      expect(TEXTOS.editar.abertos(['a.pdf'], 3, 0)).toBe('a.pdf · 3 páginas')
    })

    it('a recusa do PDF adicionado pelo teto de páginas diz que as brancas também somam, quando há alguma', () => {
      const A = TEXTOS.editar.adicionar
      const tetos = { bytes: 50_000_000, paginas: 500 }
      const recusa = {
        passou: 'paginas' as const,
        bytes: 1_000,
        paginas: 4,
        restam: { bytes: 49_000_000, paginas: 2 },
      }
      expect(A.passouDoTeto('b.pdf', recusa, tetos, true)).toBe(
        'Não deu para adicionar b.pdf: ele tem 4 páginas, e só cabem mais 2 páginas (até 500 somando os PDFs abertos e as páginas em branco). Divida o PDF em partes menores no programa que o criou e adicione uma de cada vez.',
      )
      expect(A.passouDoTeto('b.pdf', recusa, tetos)).toContain(
        '(até 500 somando os PDFs abertos).',
      )
      // O teto de bytes é só dos arquivos: as brancas não pesam nele.
      expect(
        A.passouDoTeto(
          'b.pdf',
          {
            passou: 'bytes',
            bytes: 2_000_000,
            restam: { bytes: 0, paginas: 3 },
          },
          tetos,
          true,
        ),
      ).toBe(
        'Não deu para adicionar b.pdf: ele tem 2 MB, e não cabe mais nada (até 50 MB somando os PDFs abertos).',
      )
    })
  })

  describe('adicionar outro PDF: o botão, onde entra e o anúncio', () => {
    const A = TEXTOS.editar.adicionar

    it('o botão tem o nome do desenho, e o curto do celular cabe nele', () => {
      expect(A.botao).toBe('Adicionar PDF')
      expect(A.curto).toBe('PDF')
      expect(A.botao.endsWith(A.curto)).toBe(true)
      expect(A.adicionando('b.pdf')).toBe('Adicionando b.pdf…')
    })

    it('onde entra (P3 e D4): sem marcada, no fim; com marcadas, depois da última marcada, nomeada; e o tamanho da branca (P2)', () => {
      expect(A.onde(7, null)).toBe(
        'Entra no fim, depois da página 7. A página em branco sai em A4.',
      )
      expect(A.onde(7, { pagina: 2, marcadas: 1 })).toBe(
        'Entra depois da página 2, a que você marcou. A página em branco sai do tamanho dela.',
      )
      expect(A.onde(7, { pagina: 4, marcadas: 3 })).toBe(
        'Entra depois da página 4, a última que você marcou. A página em branco sai do tamanho dela.',
      )
    })

    it('o anúncio diz quantas, de qual arquivo, depois de qual página, que ficam marcadas, e os avisos do arquivo com o nome', () => {
      expect(A.adicionadas('b.pdf', 3, 2, [])).toBe(
        '3 páginas de b.pdf adicionadas depois da página 2, já selecionadas.',
      )
      expect(A.adicionadas('b.pdf', 1, 1_000, ['assinatura_digital'])).toBe(
        `1 página de b.pdf adicionada depois da página 1.000, já selecionada. b.pdf: ${TEXTOS.editar.avisos.assinatura_digital}`,
      )
    })
  })

  it('com mais de um arquivo: o cabeçalho junta os nomes, e cada aviso diz de qual arquivo é', () => {
    expect(TEXTOS.editar.abertos(['a.pdf', 'b.pdf'], 7)).toBe(
      'a.pdf + b.pdf · 7 páginas',
    )
    expect(TEXTOS.editar.abertos(['a.pdf'], 1)).toBe('a.pdf · 1 página')
    expect(TEXTOS.editar.avisoDoArquivo('b.pdf', 'xfa_puro')).toBe(
      `b.pdf: ${TEXTOS.editar.avisos.xfa_puro}`,
    )
  })

  it('os limites do editar são somados: valem para os PDFs abertos juntos', () => {
    expect(TEXTOS.editar.limites(50_000_000, 500)).toMatch(
      /^Até 50 MB e 500 páginas, somando os PDFs que você abrir e adicionar\. /,
    )
  })

  it('posição, zoom e anúncios pelo Intl', () => {
    expect(paginaAtual(3, 1200)).toBe('Página 3 de 1.200')
    expect(zoom.valor(1.25)).toBe('125%')
    expect(anuncios.zoom(0.5)).toBe('Zoom em 50%.')
    expect(anuncios.pagina(2, 5)).toBe('Página 2 de 5.')
  })

  it('texto fora das fontes do PDF: a página (contada de 1), os caracteres pelo Intl e o que fazer', () => {
    expect(
      falhaAoSalvar({
        motivo: 'texto_fora_do_winansi',
        pagina: 2,
        objeto: 't1',
        caracteres: ['😀'],
      }),
    ).toBe(
      'Um texto da página 3 tem um caractere que as fontes do PDF não escrevem: 😀. Apague esse caractere e salve de novo.',
    )
    expect(
      falhaAoSalvar({
        motivo: 'texto_fora_do_winansi',
        pagina: 0,
        objeto: 't1',
        caracteres: ['😀', '✓', '中'],
      }),
    ).toBe(
      'Um texto da página 1 tem caracteres que as fontes do PDF não escrevem: 😀, ✓ e 中. Apague esses caracteres e salve de novo.',
    )
  })

  it('imagem que não é PNG nem JPEG e imagem que não se deixa ler: a página e o que fazer', () => {
    expect(
      falhaAoSalvar({ motivo: 'imagem_nao_aceita', pagina: 0, objeto: 'i1' }),
    ).toBe(
      'Uma imagem da página 1 não é PNG nem JPEG. Troque por uma imagem PNG ou JPEG e salve de novo.',
    )
    expect(
      falhaAoSalvar({ motivo: 'imagem_corrompida', pagina: 4, objeto: 'i1' }),
    ).toMatch(/^Uma imagem da página 5 não pôde ser lida\. Ponha a imagem/)
  })

  it('apagar de verdade em duas posições da mesma página do arquivo: diz qual e o que fazer', () => {
    expect(
      falhaAoSalvar({ motivo: 'apagar_na_pagina_repetida', pagina: 2 }),
    ).toBe(
      'A página 3 é a mesma página do arquivo que outra página deste PDF, e as duas estão para apagar de verdade. Tire o apagar de verdade de uma delas e salve de novo.',
    )
  })

  // Decisão do Paulo em 2026-11-20: a recusa diz quando a outra apagada ficou fora do PDF (o Extrair de
  // outra página, ou a apagada tirada da lista).
  it('apagar de verdade numa página do PDF e na mesma página do arquivo fora dele: diz que a outra ficou fora', () => {
    expect(
      falhaAoSalvar({
        motivo: 'apagar_na_pagina_repetida_fora_do_pdf',
        pagina: 2,
      }),
    ).toBe(
      'A página 3 e uma página que ficou fora deste PDF vêm da mesma página do arquivo, e as duas estão marcadas para apagar de verdade. Tire o apagar de verdade de uma delas e salve de novo.',
    )
  })

  it('duas páginas fora do PDF apagadas de verdade, e a página do PDF é a mesma do arquivo: diz como trazer uma de volta', () => {
    expect(
      falhaAoSalvar({ motivo: 'apagar_duas_vezes_fora_do_pdf', pagina: 0 }),
    ).toBe(
      'A página 1 vem da mesma página do arquivo que duas páginas que ficaram fora deste PDF, e essas duas estão marcadas para apagar de verdade. Tire o apagar de verdade de uma delas e salve de novo. Se você tirou as duas da lista, use Desfazer nas páginas para trazer uma de volta.',
    )
  })

  // Decisão do Paulo em 2026-11-20: a outra posição da página repetida sai como a imagem apagada, e a tela
  // diz isso numa linha, junto do PDF pronto.
  it('as páginas que saíram como a imagem de outra apagada: uma linha, no singular e no plural', () => {
    expect(TEXTOS.editar.gerar.repetemApagada([3])).toBe(
      'A página 3 saiu como imagem, apagada, porque vem da mesma página do arquivo que outra marcada para apagar de verdade.',
    )
    expect(TEXTOS.editar.gerar.repetemApagada([2, 4, 7])).toBe(
      'As páginas 2, 4 e 7 saíram como imagem, apagadas, porque cada uma vem da mesma página do arquivo que outra marcada para apagar de verdade.',
    )
  })

  it('erro do arquivo usa a mensagem de ERROS_DO_ARQUIVO; o resto não acusa o arquivo', () => {
    expect(falhaAoSalvar({ motivo: 'protegido' })).toBe(
      `Não deu para salvar o PDF. ${ERROS_DO_ARQUIVO.protegido}`,
    )
    for (const motivo of ['inesperado', 'cancelado'] as const) {
      expect(falhaAoSalvar({ motivo })).toMatch(
        /^O navegador não conseguiu salvar o PDF/,
      )
    }
  })

  it('acima do teto, diz editar', () => {
    expect(
      TEXTOS.editar.grandeDemais('scan.pdf', 80_000_000, 50_000_000),
    ).toContain('que dá para editar no navegador')
  })

  it('os avisos do PDF aberto: as frases do Paulo, e o anúncio do aberto leva os avisos depois do nome', () => {
    expect(TEXTOS.editar.avisos.assinatura_digital).toBe(
      'Este PDF tem assinatura digital. Editar invalida a assinatura.',
    )
    expect(TEXTOS.editar.avisos.xfa_puro).toBe(
      'Este PDF é um formulário XFA: o que você escrever por cima pode não aparecer no Adobe Acrobat e no Reader.',
    )
    expect(TEXTOS.editar.anuncios.aberto('a.pdf', 2, [])).toBe(
      'a.pdf · 2 páginas',
    )
    expect(
      TEXTOS.editar.anuncios.aberto('a.pdf', 1, [
        'assinatura_digital',
        'xfa_puro',
      ]),
    ).toBe(
      `a.pdf · 1 página. ${TEXTOS.editar.avisos.assinatura_digital} ${TEXTOS.editar.avisos.xfa_puro}`,
    )
  })

  it('o Gerar tem o botão, o motivo de ficar parado (semMudancas) e o anúncio do pronto', () => {
    expect(TEXTOS.editar.gerar.botao).toBe('Gerar PDF')
    expect(TEXTOS.editar.gerar.semMudancas).toBe(
      'Mude alguma página ou ponha um objeto numa página para gerar o PDF.',
    )
    expect(TEXTOS.editar.anuncios.pronto(1, 500)).toBe(
      'PDF editado pronto: 1 página, 500 bytes.',
    )
  })

  it('as páginas da Bancada: o rótulo é a posição, com a origem embaixo, e o desfazer delas tem nome próprio', () => {
    const P = TEXTOS.editar.paginasDoDocumento
    expect(P.rotulo(3)).toBe('Página 3')
    expect(P.origem('contrato.pdf', 2)).toBe('contrato.pdf, pág. 2')
    expect(P.abrir(12)).toBe('Abrir a página 12')
    expect(P.aberta).toBe('aberta')
    expect(P.desfazer).toBe('Desfazer nas páginas')
    expect(P.desfeito).toBe('Desfeito nas páginas.')
    expect(P.naSelecao).toBe('Na seleção')
  })

  it('no celular, a folha Páginas; o pular; e o Ctrl+Z das páginas, que não tem refazer', () => {
    const P = TEXTOS.editar.paginasDoDocumento
    expect(P.abrirFolha).toBe('Páginas')
    expect(P.titulo).toBe('Páginas')
    expect(P.contagem(1)).toBe('1 página')
    expect(P.contagem(7)).toBe('7 páginas')
    expect(P.dicaDaFolha).toBe('Toque numa miniatura para abrir a página.')
    expect(P.pular).toBe('Pular para a página aberta')
    expect(P.atalho).toBe(
      'Com o foco nas páginas, Ctrl+Z (⌘+Z no Mac) desfaz a última mudança nelas.',
    )
    expect(P.semRefazer).toBe('Nas páginas não há refazer.')
  })

  it('a nota da moldura diz como a página sai no PDF', () => {
    const { notaDoGiro } = TEXTOS.editar
    expect(notaDoGiro(90)).toBe(
      'No PDF, esta página sai girada 90° à direita, com os objetos.',
    )
    expect(notaDoGiro(270)).toBe(
      'No PDF, esta página sai girada 90° à esquerda, com os objetos.',
    )
    expect(notaDoGiro(180)).toBe(
      'No PDF, esta página sai girada 180°, com os objetos.',
    )
  })

  it('o desfazer dos objetos numa página apagada não navega e diz onde a mudança ficou', () => {
    expect(TEXTOS.editar.anuncios.desfeitoNaApagada).toBe(
      'Desfeito numa página que você apagou. Para ela voltar, use Desfazer nas páginas.',
    )
    expect(TEXTOS.editar.anuncios.refeitoNaApagada).toBe(
      'Refeito numa página que você apagou. Para ela voltar, use Desfazer nas páginas.',
    )
  })
})
