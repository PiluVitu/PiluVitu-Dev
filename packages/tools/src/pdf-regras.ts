export const TETO_TOTAL_EM_BYTES = 100_000_000

export const NOME_PADRAO_DO_PDF_FINAL = 'mesclado.pdf'

export type MotivoDoErroDePdf =
  | 'nao_e_pdf'
  | 'protegido'
  | 'corrompido'
  | 'sem_paginas'

/** O que o editar avisa ao abrir, sem bloquear: `assinatura_digital` vale também para o certificado. */
export type AvisoDoPdf = 'assinatura_digital' | 'xfa_puro'

const PESO_DA_LEITURA = 0.9

export function fracaoDaMesclagem(
  tamanhos: readonly number[],
  concluidos: number,
  salvando = false,
): number {
  if (salvando) return PESO_DA_LEITURA
  const total = tamanhos.reduce((soma, t) => soma + t, 0)
  if (total === 0) return 0
  const feito = tamanhos
    .slice(0, Math.max(0, concluidos))
    .reduce((soma, t) => soma + t, 0)
  return (PESO_DA_LEITURA * feito) / total
}

export function cabemNoTeto(
  jaUsados: number,
  novos: readonly number[],
  teto = TETO_TOTAL_EM_BYTES,
): boolean[] {
  let usados = jaUsados
  return novos.map((tamanho) => {
    if (usados + tamanho > teto) return false
    usados += tamanho
    return true
  })
}

const PROIBIDOS_NO_NOME = /[\u0000-\u001f\u007f<>:"/\\|?*]/g
const LIMITE_DO_NOME = 120

export function nomeDoPdfFinal(entrada: string): string {
  const base = entrada
    .replace(PROIBIDOS_NO_NOME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, LIMITE_DO_NOME)
    .trim()
  return base ? `${base}.pdf` : NOME_PADRAO_DO_PDF_FINAL
}

export function nomeDoPdfDerivado(original: string, sufixo: string): string {
  const base = nomeDoPdfFinal(original)
    .replace(/\.pdf$/, '')
    .slice(0, LIMITE_DO_NOME - sufixo.length - 1)
    .replace(/[.\s]+$/, '')
  return nomeDoPdfFinal(`${base}-${sufixo}`)
}

export const TETO_DE_PAGINAS = 500

// Com miniaturas o PDF fica no pdf.js e no pdf-lib ao mesmo tempo: ver "Medições do organizar" no apps/web/CLAUDE.md.
export const TETO_DE_BYTES_COM_MINIATURAS = 50_000_000

export type Giro = 0 | 90 | 180 | 270

export const GIROS: readonly Giro[] = [0, 90, 180, 270]

export type PaginaDoPlano = { readonly indice: number; readonly giro: Giro }

export type SentidoDoGiro = 'esquerda' | 'direita'

export type LadoDoMovimento = 'antes' | 'depois'

export function giroNormalizado(graus: number): Giro {
  return (((graus % 360) + 360) % 360) as Giro
}

export function planoInicial(totalDePaginas: number): PaginaDoPlano[] {
  if (!Number.isInteger(totalDePaginas) || totalDePaginas < 0) {
    throw new RangeError(`total de páginas inválido: ${totalDePaginas}`)
  }
  return Array.from({ length: totalDePaginas }, (_, indice) => ({
    indice,
    giro: 0,
  }))
}

function selecao(
  plano: readonly unknown[],
  posicoes: Iterable<number>,
): Set<number> {
  const escolhidas = new Set(posicoes)
  for (const posicao of escolhidas) {
    if (!Number.isInteger(posicao) || posicao < 0 || posicao >= plano.length) {
      throw new RangeError(`posição fora do plano: ${posicao}`)
    }
  }
  return escolhidas
}

export function girar<P extends { readonly giro: Giro }>(
  plano: readonly P[],
  posicoesSelecionadas: Iterable<number>,
  sentido: SentidoDoGiro,
): P[] {
  const escolhidas = selecao(plano, posicoesSelecionadas)
  const passo = sentido === 'direita' ? 90 : -90
  return plano.map((pagina, posicao) =>
    escolhidas.has(posicao)
      ? { ...pagina, giro: giroNormalizado(pagina.giro + passo) }
      : pagina,
  )
}

export function moverSelecionadas<P>(
  plano: readonly P[],
  posicoes: Iterable<number>,
  lado: LadoDoMovimento,
): P[] {
  const escolhidas = selecao(plano, posicoes)
  if (lado === 'depois') {
    const ultima = plano.length - 1
    return moverSelecionadas(
      [...plano].reverse(),
      [...escolhidas].map((posicao) => ultima - posicao),
      'antes',
    ).reverse()
  }
  const novo = [...plano]
  let primeiraLivre = 0
  for (const posicao of [...escolhidas].sort((a, b) => a - b)) {
    if (posicao > primeiraLivre) {
      ;[novo[posicao - 1], novo[posicao]] = [novo[posicao], novo[posicao - 1]]
      primeiraLivre = posicao
    } else {
      primeiraLivre = posicao + 1
    }
  }
  return novo
}

export function apagar<P>(
  plano: readonly P[],
  posicoes: Iterable<number>,
): P[] {
  const escolhidas = selecao(plano, posicoes)
  return plano.filter((_, posicao) => !escolhidas.has(posicao))
}

export function extrair<P>(
  plano: readonly P[],
  posicoes: Iterable<number>,
): P[] {
  const escolhidas = selecao(plano, posicoes)
  return plano.filter((_, posicao) => escolhidas.has(posicao))
}

export type OrigemDaPagina =
  | { readonly arquivo: number; readonly indice: number }
  | { readonly branca: Tamanho }

export type PaginaDaMontagem = {
  readonly origem: OrigemDaPagina
  readonly giro: Giro
  readonly moldura: Giro
}

export const TAMANHO_A4: Tamanho = { largura: 595.28, altura: 841.89 }

export function posicaoDeInsercao(
  paginas: readonly { readonly id: string }[],
  marcadasNaOrdem: readonly string[],
): number {
  for (let i = marcadasNaOrdem.length - 1; i >= 0; i--) {
    const posicao = paginas.findIndex(({ id }) => id === marcadasNaOrdem[i])
    if (posicao >= 0) return posicao + 1
  }
  return paginas.length
}

// O limite dos leitores de PDF (200 polegadas); acima disso o Acrobat recusa a página.
export const LADO_MAXIMO_DA_PAGINA = 14_400

export function tamanhoValido(tamanho: Tamanho): boolean {
  return [tamanho.largura, tamanho.altura].every(
    (lado) =>
      Number.isFinite(lado) && lado > 0 && lado <= LADO_MAXIMO_DA_PAGINA,
  )
}

// `tamanho` é o da página como o pdf.js a mostra (com o /Rotate dela); o giro do documento vem à parte.
export function tamanhoDaBranca(
  ultimaMarcada: { readonly tamanho: Tamanho; readonly giro: Giro } | null,
): Tamanho {
  if (ultimaMarcada === null) return TAMANHO_A4
  const { tamanho, giro } = ultimaMarcada
  if (!tamanhoValido(tamanho)) {
    const lados = [tamanho.largura, tamanho.altura]
    if (lados.every((lado) => Number.isFinite(lado) && lado > 0)) {
      return TAMANHO_A4
    }
    throw new RangeError(
      `tamanho inválido: ${tamanho.largura} × ${tamanho.altura}`,
    )
  }
  return giro === 90 || giro === 270
    ? { largura: tamanho.altura, altura: tamanho.largura }
    : { largura: tamanho.largura, altura: tamanho.altura }
}

export function inserirPaginas<P>(
  paginas: readonly P[],
  posicao: number,
  novas: readonly P[],
): P[] {
  if (!Number.isInteger(posicao) || posicao < 0 || posicao > paginas.length) {
    throw new RangeError(`posição de inserção inválida: ${posicao}`)
  }
  return [...paginas.slice(0, posicao), ...novas, ...paginas.slice(posicao)]
}

// No lugar só quando o plano é o primeiro arquivo inteiro, na ordem: é o que guarda marcadores, links,
// formulário e metadados. Giro e moldura não contam.
export function saiPorCopia(
  plano: readonly { readonly origem: OrigemDaPagina }[],
  paginasDoPrimeiro: number,
): boolean {
  return !(
    plano.length === paginasDoPrimeiro &&
    plano.every(
      ({ origem }, posicao) =>
        !('branca' in origem) &&
        origem.arquivo === 0 &&
        origem.indice === posicao,
    )
  )
}

export type Ocupacao = { readonly bytes: number; readonly paginas: number }

export type Cabimento =
  | { readonly cabe: true; readonly restam: Ocupacao }
  | {
      readonly cabe: false
      readonly passou: 'bytes' | 'paginas'
      readonly restam: Ocupacao
    }

const contagemValida = (valor: unknown) =>
  typeof valor === 'number' && Number.isInteger(valor) && valor >= 0

// `restam` é o que ainda cabia antes do novo. O arquivo ainda não lido vem sem `paginas`.
export function cabeNoDocumento(
  abertos: Ocupacao,
  novo: { readonly bytes: number; readonly paginas?: number },
): Cabimento {
  if (
    ![abertos.bytes, abertos.paginas, novo.bytes].every(contagemValida) ||
    (novo.paginas !== undefined && !contagemValida(novo.paginas))
  ) {
    throw new RangeError('ocupação inválida')
  }
  const restam = {
    bytes: Math.max(0, TETO_DE_BYTES_COM_MINIATURAS - abertos.bytes),
    paginas: Math.max(0, TETO_DE_PAGINAS - abertos.paginas),
  }
  if (novo.bytes > restam.bytes) return { cabe: false, passou: 'bytes', restam }
  if ((novo.paginas ?? 0) > restam.paginas) {
    return { cabe: false, passou: 'paginas', restam }
  }
  return { cabe: true, restam }
}

// Fase 3: objetos por cima da página. Tudo em coordenadas da tela: pontos, origem no canto superior
// esquerdo da página como o pdf.js a mostra (já girada e recortada), x para a direita e y para baixo.

export type Ponto = { readonly x: number; readonly y: number }

export type Tamanho = { readonly largura: number; readonly altura: number }

export type Caixa = Ponto & Tamanho

export type Matriz = readonly [number, number, number, number, number, number]

// A área visível no espaço do PDF (origem embaixo à esquerda): o CropBox recortado pela MediaBox, como o pdf.js.
export type GeometriaDaPagina = {
  readonly caixa: Caixa
  readonly rotacao: Giro
  readonly unidade: number
}

export function geometriaDaVista(
  vista: readonly number[],
  rotacao: number,
  unidade = 1,
): GeometriaDaPagina {
  const [x1, y1, x2, y2] = vista
  if (
    vista.length !== 4 ||
    ![x1, y1, x2, y2].every(Number.isFinite) ||
    x2 <= x1 ||
    y2 <= y1
  ) {
    throw new RangeError(`vista inválida: ${vista.join(' ')}`)
  }
  if (!Number.isInteger(rotacao) || rotacao % 90 !== 0) {
    throw new RangeError(`rotação inválida: ${rotacao}`)
  }
  if (!Number.isFinite(unidade) || unidade <= 0) {
    throw new RangeError(`unidade inválida: ${unidade}`)
  }
  return {
    caixa: { x: x1, y: y1, largura: x2 - x1, altura: y2 - y1 },
    rotacao: giroNormalizado(rotacao),
    unidade,
  }
}

export function tamanhoNaTela({
  caixa,
  rotacao,
  unidade,
}: GeometriaDaPagina): Tamanho {
  const deitada = rotacao === 90 || rotacao === 270
  return {
    largura: (deitada ? caixa.altura : caixa.largura) * unidade,
    altura: (deitada ? caixa.largura : caixa.altura) * unidade,
  }
}

// O inverso da transformação da vista do pdf.js (PageViewport) com escala 1.
export function matrizDaTelaParaPdf({
  caixa,
  rotacao,
  unidade,
}: GeometriaDaPagina): Matriz {
  const k = 1 / unidade
  const x1 = caixa.x
  const y1 = caixa.y
  const x2 = caixa.x + caixa.largura
  const y2 = caixa.y + caixa.altura
  switch (rotacao) {
    case 0:
      return [k, 0, 0, -k, x1, y2]
    case 90:
      return [0, k, k, 0, x1, y1]
    case 180:
      return [-k, 0, 0, k, x2, y1]
    case 270:
      return [0, -k, -k, 0, x2, y2]
  }
}

export function aplicarMatriz(
  [a, b, c, d, e, f]: Matriz,
  { x, y }: Ponto,
): Ponto {
  return { x: a * x + c * y + e, y: b * x + d * y + f }
}

function inverterMatriz([a, b, c, d, e, f]: Matriz): Matriz {
  const det = a * d - b * c
  return [
    d / det,
    -b / det,
    -c / det,
    a / det,
    (c * f - d * e) / det,
    (b * e - a * f) / det,
  ]
}

export function telaParaPdf(geometria: GeometriaDaPagina, ponto: Ponto): Ponto {
  return aplicarMatriz(matrizDaTelaParaPdf(geometria), ponto)
}

export function pdfParaTela(geometria: GeometriaDaPagina, ponto: Ponto): Ponto {
  return aplicarMatriz(inverterMatriz(matrizDaTelaParaPdf(geometria)), ponto)
}

export const FAMILIAS_DE_FONTE = ['helvetica', 'times', 'courier'] as const

export type FamiliaDaFonte = (typeof FAMILIAS_DE_FONTE)[number]

// Ascender e Descender dos AFM das 14 fontes padrão, em em (iguais nas quatro variantes de cada família).
export const METRICAS_DAS_FONTES: Record<
  FamiliaDaFonte,
  { readonly ascendente: number; readonly descendente: number }
> = {
  helvetica: { ascendente: 0.718, descendente: 0.207 },
  times: { ascendente: 0.683, descendente: 0.217 },
  courier: { ascendente: 0.629, descendente: 0.157 },
}

export const ALTURA_DA_LINHA = 1.2

export const TAMANHO_MINIMO_DO_TEXTO = 4

export const TAMANHO_MAXIMO_DO_TEXTO = 300

// Cor em hexadecimal, '#rrggbb'.
export type Cor = string

export const CANTOS = [
  'superior-esquerdo',
  'superior-direito',
  'inferior-esquerdo',
  'inferior-direito',
] as const

export type Canto = (typeof CANTOS)[number]

// x e y em fração da caixa do traço (0 a 1); a pressão, de 0 a 1, só quando o ponteiro a mede.
export type PontoDoTraco = readonly [x: number, y: number, pressao?: number]

type BaseDoObjeto = Caixa & { readonly id: string }

export type ObjetoTexto = BaseDoObjeto & {
  readonly tipo: 'texto'
  readonly conteudo: string
  readonly fonte: FamiliaDaFonte
  readonly negrito: boolean
  readonly italico: boolean
  readonly tamanho: number
  readonly cor: Cor
}

export type ObjetoImagem = BaseDoObjeto & {
  readonly tipo: 'imagem'
  readonly bytes: Uint8Array
}

export type ObjetoTraco = BaseDoObjeto & {
  readonly tipo: 'traco'
  readonly pontos: readonly PontoDoTraco[]
  readonly espessura: number
  readonly cor: Cor
}

export type ObjetoForma = BaseDoObjeto & {
  readonly tipo: 'retangulo' | 'elipse'
  readonly espessura: number
  readonly cor: Cor
}

export type ObjetoLinha = BaseDoObjeto & {
  readonly tipo: 'linha' | 'seta'
  readonly inicio: Canto
  readonly espessura: number
  readonly cor: Cor
}

export type ObjetoMarcaTexto = BaseDoObjeto & {
  readonly tipo: 'marca-texto'
  readonly cor: Cor
}

export type ObjetoCobrir = BaseDoObjeto & { readonly tipo: 'cobrir' }

export type ObjetoDaPagina =
  | ObjetoTexto
  | ObjetoImagem
  | ObjetoTraco
  | ObjetoForma
  | ObjetoLinha
  | ObjetoMarcaTexto
  | ObjetoCobrir

export type TipoDeObjeto = ObjetoDaPagina['tipo']

export const TIPOS_DE_OBJETO: readonly TipoDeObjeto[] = [
  'texto',
  'imagem',
  'traco',
  'retangulo',
  'elipse',
  'linha',
  'seta',
  'marca-texto',
  'cobrir',
]

export const OPACIDADE_DO_MARCA_TEXTO = 0.35

export type MotivoDoErroNaEdicao =
  | 'imagem_nao_aceita'
  | 'imagem_corrompida'
  | 'texto_fora_do_winansi'
  | 'apagar_na_pagina_repetida'

const COR = /^#[0-9a-f]{6}$/i

export function corValida(cor: unknown): cor is Cor {
  return typeof cor === 'string' && COR.test(cor)
}

export function componentesDaCor(cor: Cor): [number, number, number] {
  if (!corValida(cor)) throw new RangeError(`cor inválida: ${cor}`)
  return [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
}

const QUEBRA_DE_LINHA = /\r\n|[\n\r\u0085\u2028\u2029]/

export function linhasDoTexto(conteudo: string): string[] {
  return conteudo.replace(/\t/g, '    ').split(QUEBRA_DE_LINHA)
}

export function alturaDoTexto(
  fonte: FamiliaDaFonte,
  tamanho: number,
  quantasLinhas: number,
): number {
  const { ascendente, descendente } = METRICAS_DAS_FONTES[fonte]
  return (
    tamanho *
    (ALTURA_DA_LINHA * Math.max(0, quantasLinhas - 1) +
      ascendente +
      descendente)
  )
}

// A caixa do texto começa na linha do ascendente da primeira linha, e as linhas descem de 1,2 em 1,2 em.
export function linhasDeBase(
  objeto: ObjetoTexto,
): { conteudo: string; x: number; y: number }[] {
  const { ascendente } = METRICAS_DAS_FONTES[objeto.fonte]
  return linhasDoTexto(objeto.conteudo).map((conteudo, i) => ({
    conteudo,
    x: objeto.x,
    y: objeto.y + objeto.tamanho * (ascendente + ALTURA_DA_LINHA * i),
  }))
}

// As fontes padrão do pdf-lib só escrevem o WinAnsi (CP1252): ASCII, Latin-1 e estes 27 de 0x80 a 0x9F.
const EXTRAS_DO_WINANSI = new Set([
  0x152, 0x153, 0x160, 0x161, 0x178, 0x17d, 0x17e, 0x192, 0x2c6, 0x2dc, 0x2013,
  0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021,
  0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
])

const SEPARADORES = new Set(['\t', '\n', '\r', '\u0085', '\u2028', '\u2029'])

function cabeNoWinAnsiOCaractere(codigo: number): boolean {
  return (
    (codigo >= 0x20 && codigo <= 0x7e) ||
    (codigo >= 0xa0 && codigo <= 0xff) ||
    EXTRAS_DO_WINANSI.has(codigo)
  )
}

export function caracteresForaDoWinAnsi(texto: string): string[] {
  const fora = new Set<string>()
  for (const caractere of texto) {
    if (SEPARADORES.has(caractere)) continue
    if (!cabeNoWinAnsiOCaractere(caractere.codePointAt(0)!)) fora.add(caractere)
  }
  return [...fora]
}

export function cabeNoWinAnsi(texto: string): boolean {
  return caracteresForaDoWinAnsi(texto).length === 0
}

export type TipoDeImagem = 'png' | 'jpeg'

const ASSINATURA_DO_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const ASSINATURA_DO_JPEG = [0xff, 0xd8, 0xff]

const comecaCom = (bytes: Uint8Array, assinatura: readonly number[]) =>
  bytes.length >= assinatura.length &&
  assinatura.every((byte, i) => bytes[i] === byte)

export function tipoDaImagem(bytes: Uint8Array): TipoDeImagem | null {
  if (comecaCom(bytes, ASSINATURA_DO_PNG)) return 'png'
  if (comecaCom(bytes, ASSINATURA_DO_JPEG)) return 'jpeg'
  return null
}

export const LADO_MAXIMO_DA_IMAGEM = 2400

export const TETO_DAS_IMAGENS_EM_BYTES = 50_000_000

const OPOSTO: Record<Canto, Canto> = {
  'superior-esquerdo': 'inferior-direito',
  'inferior-direito': 'superior-esquerdo',
  'superior-direito': 'inferior-esquerdo',
  'inferior-esquerdo': 'superior-direito',
}

function pontoDoCanto(caixa: Caixa, canto: Canto): Ponto {
  return {
    x: canto.endsWith('direito') ? caixa.x + caixa.largura : caixa.x,
    y: canto.startsWith('inferior') ? caixa.y + caixa.altura : caixa.y,
  }
}

export function extremosDaLinha(objeto: ObjetoLinha): {
  de: Ponto
  ate: Ponto
} {
  return {
    de: pontoDoCanto(objeto, objeto.inicio),
    ate: pontoDoCanto(objeto, OPOSTO[objeto.inicio]),
  }
}

export function linhaEntre(de: Ponto, ate: Ponto): Caixa & { inicio: Canto } {
  const vertical = de.y <= ate.y ? 'superior' : 'inferior'
  const horizontal = de.x <= ate.x ? 'esquerdo' : 'direito'
  return {
    x: Math.min(de.x, ate.x),
    y: Math.min(de.y, ate.y),
    largura: Math.abs(ate.x - de.x),
    altura: Math.abs(ate.y - de.y),
    inicio: `${vertical}-${horizontal}`,
  }
}

const PONTA_MINIMA_DA_SETA = 8

// A haste para na base da ponta: com a ponta por cima, o fim da linha apareceria além dela.
export function geometriaDaSeta(
  de: Ponto,
  ate: Ponto,
  espessura: number,
): { haste: { de: Ponto; ate: Ponto }; ponta: [Ponto, Ponto, Ponto] | null } {
  const dx = ate.x - de.x
  const dy = ate.y - de.y
  const comprimento = Math.hypot(dx, dy)
  if (comprimento === 0) return { haste: { de, ate }, ponta: null }
  const ux = dx / comprimento
  const uy = dy / comprimento
  const ponta = Math.min(
    comprimento,
    Math.max(PONTA_MINIMA_DA_SETA, espessura * 3),
  )
  const base = { x: ate.x - ux * ponta, y: ate.y - uy * ponta }
  const meia = ponta / 2
  return {
    haste: { de, ate: base },
    ponta: [
      ate,
      { x: base.x - uy * meia, y: base.y + ux * meia },
      { x: base.x + uy * meia, y: base.y - ux * meia },
    ],
  }
}

export function tracoDosPontos(
  pontosNaTela: readonly PontoDoTraco[],
): Caixa & { pontos: PontoDoTraco[] } {
  if (pontosNaTela.length === 0) throw new RangeError('traço sem ponto')
  // Sem Math.min(...pontos): um traço longo passa do limite de argumentos de uma chamada no Safari.
  let [x, y] = pontosNaTela[0]
  let [direita, baixo] = pontosNaTela[0]
  for (const [px, py] of pontosNaTela) {
    x = Math.min(x, px)
    y = Math.min(y, py)
    direita = Math.max(direita, px)
    baixo = Math.max(baixo, py)
  }
  const largura = direita - x
  const altura = baixo - y
  const fracao = (valor: number, inicio: number, lado: number) =>
    lado === 0 ? 0 : (valor - inicio) / lado
  return {
    x,
    y,
    largura,
    altura,
    pontos: pontosNaTela.map(([px, py, pressao]) =>
      pressao === undefined
        ? [fracao(px, x, largura), fracao(py, y, altura)]
        : [fracao(px, x, largura), fracao(py, y, altura), pressao],
    ),
  }
}

export function pontosDoTracoNaTela(objeto: ObjetoTraco): PontoDoTraco[] {
  return objeto.pontos.map(([px, py, pressao]) => {
    const x = objeto.x + px * objeto.largura
    const y = objeto.y + py * objeto.altura
    return pressao === undefined ? [x, y] : [x, y, pressao]
  })
}

export type Direcao = 'esquerda' | 'direita' | 'cima' | 'baixo'

export const PASSO_CURTO = 1

export const PASSO_LONGO = 10

export const LADO_MINIMO = 1

const DESLOCAMENTO: Record<Direcao, readonly [number, number]> = {
  esquerda: [-1, 0],
  direita: [1, 0],
  cima: [0, -1],
  baixo: [0, 1],
}

// Linha, seta e traço podem ser retos na horizontal ou na vertical: um dos lados da caixa é zero.
const ladoMinimo = (objeto: ObjetoDaPagina) =>
  objeto.tipo === 'linha' || objeto.tipo === 'seta' || objeto.tipo === 'traco'
    ? 0
    : LADO_MINIMO

const limitar = (valor: number, minimo: number, maximo: number) =>
  Math.min(Math.max(valor, minimo), maximo)

function conferirPasso(passo: number): void {
  if (!Number.isFinite(passo) || passo <= 0) {
    throw new RangeError(`passo inválido: ${passo}`)
  }
}

function posicionar<T extends ObjetoDaPagina>(
  objeto: T,
  x: number,
  y: number,
  pagina: Tamanho,
): T {
  const novoX = limitar(x, 0, Math.max(0, pagina.largura - objeto.largura))
  const novoY = limitar(y, 0, Math.max(0, pagina.altura - objeto.altura))
  return novoX === objeto.x && novoY === objeto.y
    ? objeto
    : { ...objeto, x: novoX, y: novoY }
}

export function moverObjeto<T extends ObjetoDaPagina>(
  objeto: T,
  direcao: Direcao,
  passo: number,
  pagina: Tamanho,
): T {
  conferirPasso(passo)
  const [dx, dy] = DESLOCAMENTO[direcao]
  return posicionar(
    objeto,
    objeto.x + dx * passo,
    objeto.y + dy * passo,
    pagina,
  )
}

export function comTamanhoDeFonte(
  objeto: ObjetoTexto,
  tamanho: number,
): ObjetoTexto {
  const escala = tamanho / objeto.tamanho
  return {
    ...objeto,
    tamanho,
    largura: objeto.largura * escala,
    altura: objeto.altura * escala,
  }
}

function escalaQueCabe(objeto: ObjetoTexto, pagina: Tamanho): number {
  return Math.min(
    objeto.largura > 0
      ? (pagina.largura - objeto.x) / objeto.largura
      : Infinity,
    objeto.altura > 0 ? (pagina.altura - objeto.y) / objeto.altura : Infinity,
  )
}

function redimensionarTexto(
  objeto: ObjetoTexto,
  delta: number,
  pagina: Tamanho,
): ObjetoTexto {
  const { tamanho } = objeto
  const pedido = tamanho + delta
  const novo =
    delta > 0
      ? Math.min(
          pedido,
          Math.max(
            tamanho,
            Math.min(
              TAMANHO_MAXIMO_DO_TEXTO,
              tamanho * escalaQueCabe(objeto, pagina),
            ),
          ),
        )
      : Math.max(pedido, Math.min(tamanho, TAMANHO_MINIMO_DO_TEXTO))
  return novo === tamanho ? objeto : comTamanhoDeFonte(objeto, novo)
}

function novoLado(
  atual: number,
  delta: number,
  minimo: number,
  disponivel: number,
): number {
  if (delta > 0) return Math.min(atual + delta, Math.max(atual, disponivel))
  if (delta < 0) return Math.max(atual + delta, Math.min(atual, minimo))
  return atual
}

// Puxa o canto de baixo à direita: → e ↓ aumentam, ← e ↑ diminuem. No texto, muda o tamanho da fonte.
export function redimensionarObjeto<T extends ObjetoDaPagina>(
  objeto: T,
  direcao: Direcao,
  passo: number,
  pagina: Tamanho,
): T {
  conferirPasso(passo)
  const [dx, dy] = DESLOCAMENTO[direcao]
  if (objeto.tipo === 'texto') {
    return redimensionarTexto(objeto, (dx + dy) * passo, pagina) as T
  }
  const minimo = ladoMinimo(objeto)
  const largura = novoLado(
    objeto.largura,
    dx * passo,
    minimo,
    pagina.largura - objeto.x,
  )
  const altura = novoLado(
    objeto.altura,
    dy * passo,
    minimo,
    pagina.altura - objeto.y,
  )
  return largura === objeto.largura && altura === objeto.altura
    ? objeto
    : { ...objeto, largura, altura }
}

// Para o arrastar e o painel numérico: o tamanho cabe na página (o texto encolhe a fonte) e depois a posição.
export function limitarAPagina<T extends ObjetoDaPagina>(
  objeto: T,
  pagina: Tamanho,
): T {
  let ajustado: ObjetoDaPagina = objeto
  if (objeto.tipo === 'texto') {
    const escala = Math.min(
      objeto.largura > 0 ? pagina.largura / objeto.largura : Infinity,
      objeto.altura > 0 ? pagina.altura / objeto.altura : Infinity,
    )
    if (escala < 1)
      ajustado = comTamanhoDeFonte(objeto, objeto.tamanho * escala)
  } else if (objeto.largura > pagina.largura || objeto.altura > pagina.altura) {
    ajustado = {
      ...objeto,
      largura: Math.min(objeto.largura, pagina.largura),
      altura: Math.min(objeto.altura, pagina.altura),
    }
  }
  return posicionar(ajustado as T, ajustado.x, ajustado.y, pagina)
}

export const LIMITE_DO_HISTORICO = 100

export type Historico<T> = {
  readonly passado: readonly T[]
  readonly presente: T
  readonly futuro: readonly T[]
}

export function historicoInicial<T>(presente: T): Historico<T> {
  return { passado: [], presente, futuro: [] }
}

export function registrarNoHistorico<T>(
  historico: Historico<T>,
  novo: T,
  limite = LIMITE_DO_HISTORICO,
): Historico<T> {
  if (!Number.isInteger(limite) || limite < 1) {
    throw new RangeError(`limite inválido: ${limite}`)
  }
  if (Object.is(novo, historico.presente)) return historico
  const passado = [...historico.passado, historico.presente]
  return {
    passado: passado.slice(Math.max(0, passado.length - limite)),
    presente: novo,
    futuro: [],
  }
}

export function podeDesfazer(historico: Historico<unknown>): boolean {
  return historico.passado.length > 0
}

export function podeRefazer(historico: Historico<unknown>): boolean {
  return historico.futuro.length > 0
}

export function desfazer<T>(historico: Historico<T>): Historico<T> {
  if (!podeDesfazer(historico)) return historico
  const ultimo = historico.passado.length - 1
  return {
    passado: historico.passado.slice(0, ultimo),
    presente: historico.passado[ultimo],
    futuro: [historico.presente, ...historico.futuro],
  }
}

export function refazer<T>(historico: Historico<T>): Historico<T> {
  if (!podeRefazer(historico)) return historico
  const [proximo, ...resto] = historico.futuro
  return {
    passado: [...historico.passado, historico.presente],
    presente: proximo,
    futuro: resto,
  }
}

export const DPI_DO_FUNDO = 200

// O limite de área de canvas do Safari no iOS; cada lado também tem limite nos navegadores.
export const PIXELS_MAXIMOS_DO_CANVAS = 16_777_216

export const LADO_MAXIMO_DO_CANVAS = 16_384

// O tamanho, em pixels, do canvas em que a tela desenha a página que vai ser apagada de verdade.
export function pixelsDoFundo(
  pagina: Tamanho,
  dpi = DPI_DO_FUNDO,
): Tamanho & { escala: number } {
  return limitarAoCanvas(pagina, dpi / 72)
}

// A página (em pontos) vezes a escala, reduzida até caber nos limites de canvas dos navegadores.
export function limitarAoCanvas(
  pagina: Tamanho,
  escalaPedida: number,
): Tamanho & { escala: number } {
  if (!(Number.isFinite(escalaPedida) && escalaPedida > 0)) {
    throw new RangeError(`escala inválida: ${escalaPedida}`)
  }
  let escala = escalaPedida
  const area = pagina.largura * pagina.altura * escala * escala
  if (area > PIXELS_MAXIMOS_DO_CANVAS) {
    escala *= Math.sqrt(PIXELS_MAXIMOS_DO_CANVAS / area)
  }
  escala = Math.min(
    escala,
    LADO_MAXIMO_DO_CANVAS / Math.max(pagina.largura, pagina.altura),
  )
  return {
    largura: Math.max(1, Math.floor(pagina.largura * escala)),
    altura: Math.max(1, Math.floor(pagina.altura * escala)),
    escala,
  }
}
