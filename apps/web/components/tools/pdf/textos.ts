import type {
  AvisoDoPdf,
  Caixa,
  FamiliaDaFonte,
  LadoDoMovimento,
  MotivoDoErroDePdf,
  SentidoDoGiro,
  TipoDeObjeto,
} from '@piluvitu/tools/pdf-regras'
import type { FalhaDaOperacao, MotivoDaRecusa, ObjetoNaTela } from './motor'
import type { Ferramenta, NomeDaCor } from './objetos'

// O site ainda não tem catálogo por idioma (WEB-17 em docs/auditoria-a11y-l10n.md): os textos das
// ferramentas de PDF ficam juntos aqui, com chaves estáveis, para migrarem inteiros quando ele existir.
export const IDIOMA = 'pt-BR'

const plural = new Intl.PluralRules(IDIOMA)

function numero(n: number): string {
  return new Intl.NumberFormat(IDIOMA).format(n)
}

function contagem(n: number, um: string, varios: string): string {
  return `${numero(n)} ${plural.select(n) === 'one' ? um : varios}`
}

function concordar(n: number, um: string, varios: string): string {
  return plural.select(n) === 'one' ? um : varios
}

const lista = new Intl.ListFormat(IDIOMA, {
  style: 'long',
  type: 'conjunction',
})

const UNIDADES = [
  [1_000_000_000, 'gigabyte'],
  [1_000_000, 'megabyte'],
  [1_000, 'kilobyte'],
] as const

export function formatarTamanho(bytes: number): string {
  const [divisor, unidade] = UNIDADES.find(([limite]) => bytes >= limite) ?? [
    1,
    'byte',
  ]
  return new Intl.NumberFormat(IDIOMA, {
    style: 'unit',
    unit: unidade,
    unitDisplay: 'short',
    maximumFractionDigits: divisor === 1 ? 0 : 1,
  }).format(bytes / divisor)
}

export function formatarPorcentagem(fracao: number): string {
  return new Intl.NumberFormat(IDIOMA, { style: 'percent' }).format(fracao)
}

// O Intl põe espaço entre o número e o "°" em pt-BR ("90 °"); a escrita comum é "90°".
export function formatarGraus(giro: number): string {
  return `${numero(giro)}°`
}

export function paginas(n: number): string {
  return contagem(n, 'página', 'páginas')
}

export function arquivos(n: number): string {
  return contagem(n, 'arquivo', 'arquivos')
}

export const ERROS_DO_ARQUIVO: Record<MotivoDaRecusa, string> = {
  nao_e_pdf: 'Não é um PDF. Escolha um arquivo .pdf.',
  protegido:
    'Está protegido por senha ou contra cópia. Tire a proteção no programa que criou o PDF e adicione de novo.',
  corrompido:
    'Está corrompido ou incompleto. Baixe o arquivo de novo e tente outra vez.',
  sem_paginas: 'Não tem nenhuma página.',
  falha_do_navegador:
    'O navegador não conseguiu ler este arquivo, talvez por falta de memória. Feche outras abas ou tente com menos arquivos.',
}

// Erros da edição que a pessoa resolve na tela; o resto é do arquivo ou do navegador.
function falhaAoSalvar(falha: FalhaDaOperacao): string {
  const pagina = falha.pagina === undefined ? 0 : falha.pagina + 1
  const caracteres = falha.caracteres ?? []
  switch (falha.motivo) {
    case 'texto_fora_do_winansi':
      return `Um texto da página ${numero(pagina)} tem ${concordar(caracteres.length, 'um caractere', 'caracteres')} que as fontes do PDF não escrevem: ${lista.format(caracteres)}. Apague ${concordar(caracteres.length, 'esse caractere', 'esses caracteres')} e salve de novo.`
    case 'imagem_nao_aceita':
      return `Uma imagem da página ${numero(pagina)} não é PNG nem JPEG. Troque por uma imagem PNG ou JPEG e salve de novo.`
    case 'imagem_corrompida':
      return `Uma imagem da página ${numero(pagina)} não pôde ser lida. Ponha a imagem de novo e salve outra vez.`
    case 'nao_e_pdf':
    case 'protegido':
    case 'corrompido':
    case 'sem_paginas':
      return `Não deu para salvar o PDF. ${ERROS_DO_ARQUIVO[falha.motivo]}`
    default:
      return 'O navegador não conseguiu salvar o PDF, talvez por falta de memória. Feche outras abas ou recarregue a página e tente de novo.'
  }
}

const TIPOS_DE_OBJETO: Record<TipoDeObjeto, string> = {
  texto: 'Texto',
  imagem: 'Imagem',
  traco: 'Desenho',
  retangulo: 'Retângulo',
  elipse: 'Elipse',
  linha: 'Linha',
  seta: 'Seta',
  'marca-texto': 'Marca-texto',
  cobrir: 'Retângulo de cobrir',
}

const pontos = (n: number) => numero(Math.round(n))

function posicaoDoObjeto({ x, y, largura, altura }: Caixa): string {
  return `em ${pontos(x)} por ${pontos(y)}, ${pontos(largura)} por ${pontos(altura)} pontos`
}

const LIMITE_DO_RESUMO = 40

function resumoDoTexto(conteudo: string): string {
  const linha = conteudo.replace(/\s+/g, ' ').trim()
  if (!linha) return 'vazio'
  const resumo =
    linha.length > LIMITE_DO_RESUMO
      ? `${linha.slice(0, LIMITE_DO_RESUMO - 1)}…`
      : linha
  return `'${resumo}'`
}

// "Texto 'Paulo Victor', em 120 por 340, 200 por 40 pontos": o tipo, o que é e onde está.
function nomeDoObjeto(objeto: ObjetoNaTela, nomeDaImagem?: string): string {
  const detalhe =
    objeto.tipo === 'texto'
      ? ` ${resumoDoTexto(objeto.conteudo)}`
      : objeto.tipo === 'imagem' && nomeDaImagem
        ? ` ${nomeDaImagem}`
        : ''
  return `${TIPOS_DE_OBJETO[objeto.tipo]}${detalhe}, ${posicaoDoObjeto(objeto)}`
}

function posicaoAnunciada(objeto: ObjetoNaTela): string {
  const posicao = posicaoDoObjeto(objeto)
  const letra =
    objeto.tipo === 'texto' ? `, letra de ${pontos(objeto.tamanho)} pontos` : ''
  return `${posicao.charAt(0).toUpperCase()}${posicao.slice(1)}${letra}.`
}

function foraDoWinAnsi(caracteres: readonly string[]): string {
  const n = caracteres.length
  return `${concordar(n, 'Este caractere não entra', 'Estes caracteres não entram')}, porque as fontes do PDF não ${concordar(n, 'o', 'os')} escrevem: ${lista.format(caracteres)}. Use letras, números e sinais comuns.`
}

const NOMES_DAS_FERRAMENTAS: Record<Ferramenta, string> = {
  selecionar: 'Selecionar e mover',
  texto: 'Texto',
  imagem: 'Imagem',
  desenho: 'Desenhar',
  retangulo: 'Retângulo',
  elipse: 'Elipse',
  linha: 'Linha',
  seta: 'Seta',
  'marca-texto': 'Marca-texto',
  cobrir: 'Cobrir',
}

const NOMES_DAS_CORES: Record<NomeDaCor, string> = {
  preto: 'Preto',
  cinza: 'Cinza',
  branco: 'Branco',
  vermelho: 'Vermelho',
  laranja: 'Laranja',
  amarelo: 'Amarelo',
  verde: 'Verde',
  azul: 'Azul',
  roxo: 'Roxo',
  rosa: 'Rosa',
}

const NOMES_DAS_FONTES: Record<FamiliaDaFonte, string> = {
  helvetica: 'Helvetica',
  times: 'Times',
  courier: 'Courier',
}

const AVISO_DO_COBRIR =
  'Cobrir esconde o trecho na tela e na impressão, mas o texto continua no arquivo: dá para selecionar, copiar e buscar. Para dado sensível (CPF, conta, endereço), apague de verdade o que está embaixo.'

const AVISOS_DO_PDF: Record<AvisoDoPdf, string> = {
  assinatura_digital:
    'Este PDF tem assinatura digital. Editar invalida a assinatura.',
  xfa_puro:
    'Este PDF é um formulário XFA: o que você escrever por cima pode não aparecer no Adobe Acrobat e no Reader.',
}

const documentoAberto = (nome: string, totalDePaginas: number) =>
  `${nome} · ${paginas(totalDePaginas)}`

const listaDePaginas = (numeros: readonly number[]) =>
  `${concordar(numeros.length, 'a página', 'as páginas')} ${lista.format(numeros.map(numero))}`

const SENTIDOS: Record<SentidoDoGiro, string> = {
  esquerda: 'para a esquerda',
  direita: 'para a direita',
}

const LADOS: Record<LadoDoMovimento, string> = {
  antes: 'para antes',
  depois: 'para depois',
}

export const TEXTOS = {
  privacidade: {
    titulo: 'Seus arquivos não saem do aparelho',
    texto:
      'Tudo roda no seu navegador. Nenhum PDF é enviado para servidor nenhum, nem para o piluvitu.com.br.',
  },
  zona: {
    rotulo: 'Adicionar PDFs',
    titulo: (multiplos: boolean) =>
      multiplos ? 'Arraste os PDFs para cá' : 'Arraste o PDF para cá',
    soltar: 'Solte para adicionar',
    ou: 'ou',
    escolher: (multiplos: boolean) =>
      multiplos ? 'Escolher PDFs' : 'Escolher PDF',
  },
  limites: (teto: number) =>
    `Até ${formatarTamanho(teto)} somando todos os arquivos. O PDF é montado na memória do seu aparelho, que usa umas 4 vezes esse tamanho enquanto trabalha; acima disso, celulares costumam fechar a aba.`,
  alcance:
    'O conteúdo das páginas vai inteiro. Os marcadores (o índice lateral) não passam para o PDF final, os links para outra página do mesmo PDF deixam de funcionar, e campos de formulário podem deixar de ser editáveis.',
  lista: {
    titulo: 'Ordem dos arquivos',
    resumo: (qtd: number, totalDePaginas: number, bytes: number) =>
      `${arquivos(qtd)} · ${paginas(totalDePaginas)} · ${formatarTamanho(bytes)}`,
    lendo: 'Lendo…',
    posicao: (n: number) => `${n}.`,
  },
  acoes: {
    subir: (nome: string) => `Subir ${nome}`,
    descer: (nome: string) => `Descer ${nome}`,
    remover: (nome: string) => `Remover ${nome}`,
    limpar: 'Limpar lista',
    mesclar: 'Mesclar PDFs',
    mesclando: 'Mesclando…',
    cancelar: 'Cancelar',
    baixar: (nome: string) => `Baixar ${nome}`,
    organizarResultado: 'Organizar as páginas deste PDF',
    organizarForaDoTeto: (tetoDeBytes: number, tetoDePaginas: number) =>
      `Para organizar as páginas, o PDF precisa ter até ${formatarTamanho(tetoDeBytes)} e ${paginas(tetoDePaginas)}, e este passou disso.`,
  },
  nome: {
    rotulo: 'Nome do arquivo final',
  },
  dicas: {
    minimo: 'Adicione pelo menos 2 PDFs para mesclar.',
    aguarde: 'Espere terminar a leitura dos arquivos.',
    remova: 'Remova os arquivos com erro para mesclar.',
  },
  teto: (nome: string, bytes: number, teto: number) =>
    `${nome} (${formatarTamanho(bytes)}) não entrou: passaria de ${formatarTamanho(teto)} no total. Remova algum arquivo ou escolha um menor.`,
  progresso: {
    rotulo: 'Progresso da mesclagem',
    lendo: (atual: number, total: number, nome: string) =>
      `Lendo ${atual} de ${total}: ${nome}`,
    salvando: 'Montando o PDF final…',
  },
  falha: {
    arquivo: (nome: string, motivo: MotivoDoErroDePdf) =>
      `Não deu para mesclar: ${nome}. ${ERROS_DO_ARQUIVO[motivo]}`,
    inesperada:
      'O navegador não conseguiu terminar a mesclagem, talvez por falta de memória. Tente com menos arquivos ou recarregue a página.',
  },
  resultado: {
    titulo: 'PDF pronto',
    resumo: (totalDePaginas: number, bytes: number) =>
      `${paginas(totalDePaginas)} · ${formatarTamanho(bytes)}`,
  },
  anuncios: {
    adicionados: (qtd: number) =>
      qtd === 1 ? '1 arquivo adicionado.' : `${arquivos(qtd)} adicionados.`,
    recusado: (nome: string, motivo: MotivoDaRecusa) =>
      `${nome}: ${ERROS_DO_ARQUIVO[motivo]}`,
    movido: (nome: string, posicao: number, total: number) =>
      `${nome} agora está na posição ${posicao} de ${total}.`,
    removido: (nome: string) => `${nome} removido.`,
    limpo: 'Lista limpa.',
    comecou: 'Mesclagem começou.',
    cancelado: 'Mesclagem cancelada.',
    pronto: (totalDePaginas: number, bytes: number) =>
      `PDF pronto: ${paginas(totalDePaginas)}, ${formatarTamanho(bytes)}.`,
  },
  editor: {
    modos: 'O que você quer fazer?',
  },
  organizar: {
    rotulo: 'Abrir PDF',
    limites: (tetoDeBytes: number, tetoDePaginas: number) =>
      `Até ${formatarTamanho(tetoDeBytes)} e ${paginas(tetoDePaginas)} por PDF. Para desenhar as páginas e montar o PDF final, o seu aparelho chega a usar umas 6 a 8 vezes o tamanho do arquivo na memória; acima disso, celulares costumam fechar a aba.`,
    abrindo: (nome: string) => `Abrindo ${nome}…`,
    aberto: (nome: string, totalDePaginas: number) =>
      `${nome} · ${paginas(totalDePaginas)}`,
    recusado: (nome: string, motivo: MotivoDaRecusa) =>
      `Não deu para abrir ${nome}. ${ERROS_DO_ARQUIVO[motivo]}`,
    grandeDemais: (nome: string, bytes: number, teto: number) =>
      `${nome} tem ${formatarTamanho(bytes)}, mais que os ${formatarTamanho(teto)} que dá para organizar no navegador. Divida o PDF em partes menores no programa que o criou e abra uma de cada vez.`,
    paginasDemais: (nome: string, totalDePaginas: number, teto: number) =>
      `${nome} tem ${paginas(totalDePaginas)}, mais que as ${numero(teto)} que dá para organizar de uma vez. Divida o PDF em partes de até ${paginas(teto)} no programa que o criou e abra uma de cada vez.`,
    titulo: 'Páginas',
    pagina: (numeroDaPagina: number) => `Página ${numero(numeroDaPagina)}`,
    girada: (giro: number) => `girada ${formatarGraus(giro)}`,
    selecionar: (numeroDaPagina: number) =>
      `Selecionar página ${numero(numeroDaPagina)}`,
    girarPagina: (numeroDaPagina: number) =>
      `Girar a página ${numero(numeroDaPagina)} à direita`,
    apagarPagina: (numeroDaPagina: number) =>
      `Apagar a página ${numero(numeroDaPagina)}`,
    semMiniatura: 'Sem prévia',
    barra: 'Ações nas páginas selecionadas',
    selecionadas: (qtd: number) =>
      qtd === 0
        ? 'Nenhuma página selecionada'
        : `${paginas(qtd)} ${concordar(qtd, 'selecionada', 'selecionadas')}`,
    acoes: {
      girarEsquerda: 'Girar à esquerda',
      girarDireita: 'Girar à direita',
      moverAntes: 'Mover para antes',
      moverDepois: 'Mover para depois',
      apagar: 'Apagar',
      extrair: 'Extrair as selecionadas',
      selecionarTodas: 'Selecionar todas',
      limparSelecao: 'Limpar seleção',
      desfazer: 'Desfazer',
      gerar: 'Gerar PDF organizado',
      cancelar: 'Cancelar',
      baixar: (nome: string) => `Baixar ${nome}`,
    },
    atalho: 'Ctrl+Z (⌘+Z no Mac) desfaz a última mudança.',
    dicas: {
      semSelecao:
        'Selecione uma ou mais páginas para girar, mover, apagar ou extrair.',
      todasSelecionadas:
        'Para apagar, deixe pelo menos uma página sem selecionar: o PDF precisa de uma página.',
      noComeco: 'As páginas selecionadas já estão no começo.',
      noFim: 'As páginas selecionadas já estão no fim.',
      nadaParaDesfazer: 'Ainda não há nada para desfazer.',
      ultimaPagina: 'O PDF precisa de pelo menos uma página.',
      montando: 'Espere o PDF ficar pronto.',
    },
    montando: 'Montando o PDF…',
    resultado: {
      organizado: 'PDF organizado pronto',
      extraido: 'PDF com as páginas extraídas pronto',
    },
    falha: {
      arquivo: (motivo: MotivoDoErroDePdf) =>
        `Não deu para montar o PDF. ${ERROS_DO_ARQUIVO[motivo]}`,
      inesperada:
        'O navegador não conseguiu montar o PDF, talvez por falta de memória. Feche outras abas ou recarregue a página e tente de novo.',
    },
    anuncios: {
      girada: (numeroDaPagina: number, giro: number) =>
        `Página ${numero(numeroDaPagina)} girada para ${formatarGraus(giro)}.`,
      giradas: (qtd: number, sentido: SentidoDoGiro) =>
        `${paginas(qtd)} ${concordar(qtd, 'girada', 'giradas')} ${SENTIDOS[sentido]}.`,
      movida: (numeroDaPagina: number, posicao: number, total: number) =>
        `Página ${numero(numeroDaPagina)} agora está na posição ${numero(posicao)} de ${numero(total)}.`,
      movidas: (qtd: number, lado: LadoDoMovimento) =>
        `${paginas(qtd)} ${concordar(qtd, 'movida', 'movidas')} ${LADOS[lado]}.`,
      apagada: (numeroDaPagina: number) =>
        `Página ${numero(numeroDaPagina)} apagada.`,
      apagadas: (qtd: number) =>
        `${paginas(qtd)} ${concordar(qtd, 'apagada', 'apagadas')}.`,
      todasSelecionadas: (qtd: number) =>
        `${paginas(qtd)} ${concordar(qtd, 'selecionada', 'selecionadas')}.`,
      selecaoLimpa: 'Seleção limpa.',
      desfeito: 'Desfeito.',
      montando: 'Montando o PDF…',
      cancelado: 'Cancelado.',
      pronto: (totalDePaginas: number, bytes: number) =>
        `PDF pronto: ${paginas(totalDePaginas)}, ${formatarTamanho(bytes)}.`,
    },
    arrastar: {
      instrucoes:
        'Para mudar a ordem pelo teclado, selecione as páginas e use Mover para antes e Mover para depois.',
      pegou: (numeroDaPagina: number) =>
        `Pegou a página ${numero(numeroDaPagina)}.`,
      sobre: (numeroDaPagina: number, posicao: number) =>
        `Página ${numero(numeroDaPagina)} sobre a posição ${numero(posicao)}.`,
      soltou: (numeroDaPagina: number, posicao: number) =>
        `Página ${numero(numeroDaPagina)} solta na posição ${numero(posicao)}.`,
      cancelou: (numeroDaPagina: number) =>
        `A página ${numero(numeroDaPagina)} voltou para o lugar.`,
    },
  },
  editar: {
    rotulo: 'Abrir PDF',
    limites: (tetoDeBytes: number, tetoDePaginas: number) =>
      `Até ${formatarTamanho(tetoDeBytes)} e ${paginas(tetoDePaginas)} por PDF. Para desenhar as páginas e montar o PDF final, o seu aparelho chega a usar umas 6 a 8 vezes o tamanho do arquivo na memória; acima disso, celulares costumam fechar a aba.`,
    abrindo: (nome: string) => `Abrindo ${nome}…`,
    aberto: documentoAberto,
    recusado: (nome: string, motivo: MotivoDaRecusa) =>
      `Não deu para abrir ${nome}. ${ERROS_DO_ARQUIVO[motivo]}`,
    grandeDemais: (nome: string, bytes: number, teto: number) =>
      `${nome} tem ${formatarTamanho(bytes)}, mais que os ${formatarTamanho(teto)} que dá para editar no navegador. Divida o PDF em partes menores no programa que o criou e abra uma de cada vez.`,
    paginasDemais: (nome: string, totalDePaginas: number, teto: number) =>
      `${nome} tem ${paginas(totalDePaginas)}, mais que as ${numero(teto)} que dá para editar de uma vez. Divida o PDF em partes de até ${paginas(teto)} no programa que o criou e abra uma de cada vez.`,
    avisos: AVISOS_DO_PDF,
    paginas: 'Páginas',
    escolherPagina: (numeroDaPagina: number) =>
      `Página ${numero(numeroDaPagina)}`,
    numeroDaMiniatura: (numeroDaPagina: number) => numero(numeroDaPagina),
    semMiniatura: 'Sem prévia',
    atalhoDasPaginas:
      'Nas miniaturas, as setas passam de uma página para outra, e Enter abre a página.',
    paginaAtual: (numeroDaPagina: number, total: number) =>
      `Página ${numero(numeroDaPagina)} de ${numero(total)}`,
    anterior: 'Página anterior',
    proxima: 'Próxima página',
    zoom: {
      rotulo: 'Zoom',
      diminuir: 'Diminuir o zoom',
      aumentar: 'Aumentar o zoom',
      valor: (fracao: number) => formatarPorcentagem(fracao),
      noMinimo: 'O zoom já está no mínimo.',
      noMaximo: 'O zoom já está no máximo.',
    },
    pagina: (numeroDaPagina: number) => `Página ${numero(numeroDaPagina)}`,
    areaDaPagina: (numeroDaPagina: number) =>
      `Área da página ${numero(numeroDaPagina)}`,
    desenhando: 'Desenhando a página…',
    naoDesenhou: (numeroDaPagina: number) =>
      `Não deu para desenhar a página ${numero(numeroDaPagina)}, talvez por falta de memória. Feche outras abas e tente de novo.`,
    tentarDeNovo: 'Tentar de novo',
    falhaAoSalvar,
    ferramentas: {
      rotulo: 'Ferramentas',
      nomes: NOMES_DAS_FERRAMENTAS,
      inserirNoCentro: 'Inserir no centro',
      dicas: {
        selecionar:
          'Clique num objeto para escolher, arraste para mover e puxe a alça do canto para mudar o tamanho. Pelo teclado, chegue no objeto pelo Tab.',
        texto:
          'Clique na página onde o texto vai ficar, ou use Inserir no centro. Depois, escreva no campo Texto.',
        imagem:
          'Escolha uma imagem PNG ou JPEG. Depois, clique ou arraste na página para pôr, ou use Inserir no centro.',
        desenho: 'Desenhe na página com o dedo, o mouse ou a caneta.',
        forma:
          'Clique ou arraste na página para pôr, ou use Inserir no centro.',
      },
      desenhoAtivo:
        'Desenho ligado: a página não rola enquanto ele estiver ativo. Para rolar, escolha Selecionar e mover.',
      corDoDesenho: 'Cor do desenho',
      espessuraDoDesenho: 'Espessura do desenho (pontos)',
      semImagem: 'Escolha a imagem primeiro.',
    },
    historico: {
      rotulo: 'Desfazer e refazer',
      desfazer: 'Desfazer',
      refazer: 'Refazer',
      nadaParaDesfazer: 'Ainda não há nada para desfazer.',
      nadaParaRefazer: 'Não há nada para refazer.',
      atalho: 'Ctrl+Z (⌘+Z no Mac) desfaz, e Ctrl+Shift+Z (⌘+Shift+Z) refaz.',
    },
    imagem: {
      escolher: 'Escolher imagem',
      outra: 'Escolher outra imagem',
      preparando: (nome: string) => `Preparando ${nome}…`,
      pronta: (nome: string, largura: number, altura: number) =>
        `${nome}, ${numero(largura)} por ${numero(altura)} pixels.`,
      reduzida: (nome: string, largura: number, altura: number) =>
        `${nome} foi reduzida para ${numero(largura)} por ${numero(altura)} pixels, para o PDF não ficar pesado.`,
      naoAceita: (nome: string) =>
        `${nome} não é PNG nem JPEG. Escolha uma imagem PNG ou JPEG.`,
      corrompida: (nome: string) =>
        `Não deu para ler ${nome}: a imagem pode estar corrompida. Escolha outra.`,
      falhaDoNavegador: (nome: string) =>
        `O navegador não conseguiu preparar ${nome}, talvez por falta de memória. Feche outras abas ou escolha uma imagem menor.`,
      teto: (nome: string, bytes: number, teto: number) =>
        `${nome} (${formatarTamanho(bytes)}) não entrou: as imagens passariam de ${formatarTamanho(teto)} somando todas. Apague alguma imagem ou escolha uma menor.`,
    },
    objetos: {
      quadro: (numeroDaPagina: number) =>
        `Objetos da página ${numero(numeroDaPagina)}`,
      papel: 'objeto do PDF',
      nome: nomeDoObjeto,
      instrucoes:
        'Num objeto escolhido, as setas movem 1 ponto, e com Shift, 10. Alt com as setas muda o tamanho pelo canto de baixo à direita (no texto, a letra). Delete apaga, Enter edita o texto e Esc solta o objeto.',
      textoInicial: 'Texto',
    },
    painel: {
      titulo: 'Objeto escolhido',
      tipo: (tipo: TipoDeObjeto) => TIPOS_DE_OBJETO[tipo],
      nenhum:
        'Nenhum objeto escolhido. Clique num objeto da página, ou chegue nele pelo Tab, para ver e mudar a posição, o tamanho e a cor.',
      posicao: 'Em pontos, a partir do canto de cima à esquerda da página.',
      x: 'X',
      y: 'Y',
      largura: 'Largura',
      altura: 'Altura',
      texto: 'Texto',
      voltar: 'Esc volta para o objeto.',
      foraDoWinAnsi,
      fonte: 'Fonte',
      fontes: NOMES_DAS_FONTES,
      negrito: 'Negrito',
      italico: 'Itálico',
      tamanho: 'Tamanho da letra (pontos)',
      cor: 'Cor',
      cores: NOMES_DAS_CORES,
      personalizada: 'Outra (a do seletor)',
      outraCor: 'Escolher outra cor',
      espessura: 'Espessura (pontos)',
      apagar: 'Apagar objeto',
    },
    textoExistente:
      'Esse texto já faz parte do PDF, e editar o texto que já existe não é confiável: as letras se desalinham ou somem. Cubra o trecho com a ferramenta Cobrir e escreva por cima com a ferramenta Texto.',
    usarCobrir: 'Usar Cobrir',
    cobrir: {
      titulo: 'Cobrir nesta página',
      aviso: AVISO_DO_COBRIR,
      apagarDeVerdade: 'Apagar de verdade o que está embaixo',
      antes: 'Antes de confirmar, o que muda nesta página:',
      consequencias: [
        'A página vira uma imagem, com os retângulos de cobrir pintados nela: o que estava embaixo some do arquivo.',
        'O texto da página deixa de ser selecionável e de aparecer na busca.',
        'O PDF fica maior.',
        'Os links e os campos de formulário desta página saem, e também os marcadores que levam a ela.',
        'Se o PDF tiver um formulário XFA (comum em formulários de governo e de banco), ele sai do documento inteiro, porque guarda o que foi digitado. Os campos comuns continuam.',
        'Continuam no arquivo, sem mudança: o título, o autor e as outras informações do documento, e os anexos. Se o dado estiver num deles, o apagar de verdade não o tira.',
      ],
      confirmar: 'Apagar de verdade nesta página',
      cancelar: 'Cancelar',
      ligado: (numeroDaPagina: number) =>
        `Na página ${numero(numeroDaPagina)}, o que está embaixo dos retângulos de cobrir vai ser apagado de verdade quando você gerar o PDF.`,
      desligar: 'Só cobrir, sem apagar',
    },
    gerar: {
      botao: 'Gerar PDF editado',
      semObjetos:
        'Ponha pelo menos um objeto numa página para gerar o PDF editado.',
      resumo: (objetos: number, paginasComObjetos: number) =>
        `${contagem(objetos, 'objeto', 'objetos')} em ${paginas(paginasComObjetos)}.`,
      apagando: (numeros: readonly number[]) =>
        `Para apagar de verdade, ${listaDePaginas(numeros)} ${concordar(numeros.length, 'vai virar imagem', 'vão virar imagem')}.`,
      montando: 'Montando o PDF…',
      cancelar: 'Cancelar',
      pronto: 'PDF editado pronto',
      resumoDoPronto: (totalDePaginas: number, bytes: number) =>
        `${paginas(totalDePaginas)} · ${formatarTamanho(bytes)}`,
      baixar: (nome: string) => `Baixar ${nome}`,
      mostrarObjeto: 'Mostrar o objeto',
    },
    anuncios: {
      aberto: (
        nome: string,
        totalDePaginas: number,
        avisos: readonly AvisoDoPdf[],
      ) =>
        [
          `${documentoAberto(nome, totalDePaginas)}${avisos.length ? '.' : ''}`,
          ...avisos.map((aviso) => AVISOS_DO_PDF[aviso]),
        ].join(' '),
      pagina: (numeroDaPagina: number, total: number) =>
        `Página ${numero(numeroDaPagina)} de ${numero(total)}.`,
      zoom: (fracao: number) => `Zoom em ${formatarPorcentagem(fracao)}.`,
      inserido: (objeto: ObjetoNaTela, nomeDaImagem?: string) =>
        `Inserido: ${nomeDoObjeto(objeto, nomeDaImagem)}.`,
      apagado: (tipo: TipoDeObjeto) => `Apagado: ${TIPOS_DE_OBJETO[tipo]}.`,
      posicao: posicaoAnunciada,
      solto: 'Nenhum objeto escolhido.',
      desfeito: 'Desfeito.',
      refeito: 'Refeito.',
      desfeitoNaPagina: (numeroDaPagina: number) =>
        `Desfeito na página ${numero(numeroDaPagina)}.`,
      refeitoNaPagina: (numeroDaPagina: number) =>
        `Refeito na página ${numero(numeroDaPagina)}.`,
      apagarLigado: (numeroDaPagina: number) =>
        `A página ${numero(numeroDaPagina)} vai ser apagada de verdade embaixo dos retângulos de cobrir.`,
      apagarDesligado: (numeroDaPagina: number) =>
        `A página ${numero(numeroDaPagina)} volta a só cobrir.`,
      montando: 'Montando o PDF…',
      cancelado: 'Cancelado.',
      pronto: (totalDePaginas: number, bytes: number) =>
        `PDF editado pronto: ${paginas(totalDePaginas)}, ${formatarTamanho(bytes)}.`,
    },
  },
  arrastar: {
    alca: (nome: string) => `Arrastar ${nome}`,
    instrucoes:
      'Para mudar a ordem pelo teclado, use os botões Subir e Descer de cada arquivo.',
    pegou: (nome: string) => `Pegou ${nome}.`,
    sobre: (nome: string, posicao: number) =>
      `${nome} sobre a posição ${posicao}.`,
    soltou: (nome: string, posicao: number) =>
      `${nome} solto na posição ${posicao}.`,
    cancelou: (nome: string) => `${nome} voltou para o lugar.`,
  },
} as const
