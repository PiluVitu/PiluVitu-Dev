import type { MotivoDoErroDePdf } from '@piluvitu/tools/pdf-regras'

// O site ainda não tem catálogo por idioma (WEB-17 em docs/auditoria-a11y-l10n.md): os textos das
// ferramentas de PDF ficam juntos aqui, com chaves estáveis, para migrarem inteiros quando ele existir.
export const IDIOMA = 'pt-BR'

const plural = new Intl.PluralRules(IDIOMA)

function contagem(n: number, um: string, varios: string): string {
  const numero = new Intl.NumberFormat(IDIOMA).format(n)
  return `${numero} ${plural.select(n) === 'one' ? um : varios}`
}

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

export function paginas(n: number): string {
  return contagem(n, 'página', 'páginas')
}

export function arquivos(n: number): string {
  return contagem(n, 'arquivo', 'arquivos')
}

export const ERROS_DO_ARQUIVO: Record<MotivoDoErroDePdf, string> = {
  nao_e_pdf: 'Não é um PDF. Escolha um arquivo .pdf.',
  protegido:
    'Está protegido por senha ou contra cópia. Tire a proteção no programa que criou o PDF e adicione de novo.',
  corrompido:
    'Está corrompido ou incompleto. Baixe o arquivo de novo e tente outra vez.',
  sem_paginas: 'Não tem nenhuma página.',
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
    'O conteúdo das páginas vai inteiro. Os marcadores (o índice lateral) não passam para o PDF final, e campos de formulário podem deixar de ser editáveis.',
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
    recusado: (nome: string, motivo: MotivoDoErroDePdf) =>
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
