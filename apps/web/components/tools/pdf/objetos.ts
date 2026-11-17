import {
  LADO_MINIMO,
  TAMANHO_MAXIMO_DO_TEXTO,
  TAMANHO_MINIMO_DO_TEXTO,
  alturaDoTexto,
  comTamanhoDeFonte,
  corValida,
  limitarAPagina,
  linhaEntre,
  linhasDoTexto,
  moverObjeto,
  redimensionarObjeto,
  tracoDosPontos,
  type Caixa,
  type Cor,
  type Direcao,
  type FamiliaDaFonte,
  type ObjetoDaPagina,
  type ObjetoTexto,
  type Ponto,
  type PontoDoTraco,
  type Tamanho,
  type TipoDeObjeto,
} from '@piluvitu/tools/pdf-regras'
import type { ObjetoNaTela } from './motor'

export const FERRAMENTAS = [
  'selecionar',
  'texto',
  'imagem',
  'desenho',
  'retangulo',
  'elipse',
  'linha',
  'seta',
  'marca-texto',
  'cobrir',
] as const

export type Ferramenta = (typeof FERRAMENTAS)[number]

export type ModoDaTela = 'editar' | 'assinar'

export const FERRAMENTAS_DO_MODO: Record<ModoDaTela, readonly Ferramenta[]> = {
  editar: FERRAMENTAS,
  assinar: ['selecionar', 'texto'],
}

export const SUFIXO_DO_MODO: Record<ModoDaTela, string> = {
  editar: 'editado',
  assinar: 'assinado',
}

export type FerramentaDeForma = Exclude<
  Ferramenta,
  'selecionar' | 'desenho' | 'imagem' | 'texto'
>

export const CORES = {
  preto: '#000000',
  cinza: '#6b7280',
  branco: '#ffffff',
  vermelho: '#dc2626',
  laranja: '#ea580c',
  amarelo: '#facc15',
  verde: '#16a34a',
  azul: '#1d4ed8',
  roxo: '#7e22ce',
  rosa: '#db2777',
} as const satisfies Record<string, Cor>

export type NomeDaCor = keyof typeof CORES

/** A cor de um nome da lista; um nome de fora (até "constructor") não é cor. */
export function corDoNome(nome: string): Cor | null {
  return Object.hasOwn(CORES, nome) ? CORES[nome as NomeDaCor] : null
}

export function nomeDaCor(cor: Cor): NomeDaCor | null {
  const achada = Object.entries(CORES).find(
    ([, valor]) => valor === cor.toLowerCase(),
  )
  return achada ? (achada[0] as NomeDaCor) : null
}

export type EstiloDoTexto = {
  fonte: FamiliaDaFonte
  negrito: boolean
  italico: boolean
  tamanho: number
  cor: Cor
}

export type EstiloDoTraco = { cor: Cor; espessura: number }

/** O estilo de cada objeto novo: começa no padrão e segue o último que a pessoa escolheu no painel. */
export type Estilos = {
  texto: EstiloDoTexto
  traco: EstiloDoTraco
  forma: EstiloDoTraco
  marcaTexto: { cor: Cor }
}

export const ESTILOS_PADRAO: Estilos = {
  texto: {
    fonte: 'helvetica',
    negrito: false,
    italico: false,
    tamanho: 16,
    cor: CORES.preto,
  },
  traco: { cor: CORES.azul, espessura: 2 },
  forma: { cor: CORES.vermelho, espessura: 2 },
  marcaTexto: { cor: CORES.amarelo },
}

export const ESPESSURA_MINIMA = 0.5

export const ESPESSURA_MAXIMA = 50

export function lembrarEstilo(estilos: Estilos, objeto: ObjetoNaTela): Estilos {
  switch (objeto.tipo) {
    case 'texto': {
      const { fonte, negrito, italico, tamanho, cor } = objeto
      return { ...estilos, texto: { fonte, negrito, italico, tamanho, cor } }
    }
    case 'traco':
      return {
        ...estilos,
        traco: { cor: objeto.cor, espessura: objeto.espessura },
      }
    case 'retangulo':
    case 'elipse':
    case 'linha':
    case 'seta':
      return {
        ...estilos,
        forma: { cor: objeto.cor, espessura: objeto.espessura },
      }
    case 'marca-texto':
      return { ...estilos, marcaTexto: { cor: objeto.cor } }
    default:
      return estilos
  }
}

export const FAMILIAS_CSS: Record<FamiliaDaFonte, string> = {
  helvetica: 'Helvetica, Arial, "Liberation Sans", sans-serif',
  times: '"Times New Roman", Times, "Liberation Serif", serif',
  courier: '"Courier New", Courier, "Liberation Mono", monospace',
}

export function fonteCss(
  fonte: FamiliaDaFonte,
  negrito: boolean,
  italico: boolean,
  tamanho: number,
): string {
  return `${italico ? 'italic ' : ''}${negrito ? 'bold ' : ''}${tamanho}px ${FAMILIAS_CSS[fonte]}`
}

/** Largura do texto, em px, na fonte CSS dada; `null` quando o navegador não mede. */
export type MedirTexto = (texto: string, fonte: string) => number | null

let contextoDeMedida: CanvasRenderingContext2D | null | undefined

const medirNoCanvas: MedirTexto = (texto, fonte) => {
  if (contextoDeMedida === undefined) {
    try {
      contextoDeMedida = document.createElement('canvas').getContext('2d')
    } catch {
      contextoDeMedida = null
    }
  }
  if (!contextoDeMedida) return null
  contextoDeMedida.font = fonte
  return contextoDeMedida.measureText(texto).width
}

const TAMANHO_DA_MEDIDA = 100

// Em em, quando não dá para medir.
const LARGURA_MEDIA: Record<FamiliaDaFonte, number> = {
  helvetica: 0.55,
  times: 0.5,
  courier: 0.6,
}

// O texto vazio ainda precisa de uma caixa para dar para clicar nele.
const LARGURA_MINIMA_DO_TEXTO = 0.5

type FormaDoTexto = Pick<
  ObjetoTexto,
  'conteudo' | 'fonte' | 'negrito' | 'italico' | 'tamanho'
>

/** A caixa do texto na tela; o PDF não usa a largura (ver "Texto, decidido na lógica" no plano). */
export function caixaDoTexto(
  texto: FormaDoTexto,
  medir: MedirTexto = medirNoCanvas,
): Tamanho {
  const linhas = linhasDoTexto(texto.conteudo)
  const fonte = fonteCss(
    texto.fonte,
    texto.negrito,
    texto.italico,
    TAMANHO_DA_MEDIDA,
  )
  let maior = LARGURA_MINIMA_DO_TEXTO
  for (const linha of linhas) {
    const medida = medir(linha, fonte)
    maior = Math.max(
      maior,
      medida === null
        ? linha.length * LARGURA_MEDIA[texto.fonte]
        : medida / TAMANHO_DA_MEDIDA,
    )
  }
  return {
    largura: maior * texto.tamanho,
    altura: alturaDoTexto(texto.fonte, texto.tamanho, linhas.length),
  }
}

let ultimoId = 0

export const novoId = () => `objeto-${++ultimoId}`

const TAMANHO_PADRAO: Record<FerramentaDeForma, Tamanho> = {
  retangulo: { largura: 120, altura: 80 },
  elipse: { largura: 120, altura: 80 },
  linha: { largura: 120, altura: 0 },
  seta: { largura: 120, altura: 0 },
  'marca-texto': { largura: 160, altura: 18 },
  cobrir: { largura: 160, altura: 32 },
}

// Pixel CSS em ponto: a imagem entra no tamanho em que apareceria numa página da web.
const PONTOS_POR_PIXEL = 72 / 96

const FRACAO_DA_IMAGEM_NO_CENTRO = 0.6

/** Onde o objeto novo nasce: centrado num ponto (clique, "Inserir no centro") ou na caixa de um arraste. */
export type Lugar = { centro: Ponto } | { de: Ponto; ate: Ponto }

export type ImagemParaInserir = {
  id: string
  /** Em pixels. */
  largura: number
  altura: number
}

const comoDaPagina = (objeto: ObjetoNaTela) =>
  objeto as unknown as ObjetoDaPagina

const daTela = <T extends ObjetoNaTela>(objeto: ObjetoDaPagina) =>
  objeto as unknown as T

export function limitar<T extends ObjetoNaTela>(objeto: T, pagina: Tamanho): T {
  return daTela<T>(limitarAPagina(comoDaPagina(objeto), pagina))
}

export function mover<T extends ObjetoNaTela>(
  objeto: T,
  direcao: Direcao,
  passo: number,
  pagina: Tamanho,
): T {
  return daTela<T>(moverObjeto(comoDaPagina(objeto), direcao, passo, pagina))
}

export function redimensionar<T extends ObjetoNaTela>(
  objeto: T,
  direcao: Direcao,
  passo: number,
  pagina: Tamanho,
): T {
  return daTela<T>(
    redimensionarObjeto(comoDaPagina(objeto), direcao, passo, pagina),
  )
}

export function moverPara<T extends ObjetoNaTela>(
  objeto: T,
  x: number,
  y: number,
  pagina: Tamanho,
): T {
  return limitar({ ...objeto, x, y }, pagina)
}

function centrar(tamanho: Tamanho, centro: Ponto): Caixa {
  return {
    x: centro.x - tamanho.largura / 2,
    y: centro.y - tamanho.altura / 2,
    ...tamanho,
  }
}

function caixaEntre(de: Ponto, ate: Ponto, minimo: number): Caixa {
  return {
    x: Math.min(de.x, ate.x),
    y: Math.min(de.y, ate.y),
    largura: Math.max(minimo, Math.abs(ate.x - de.x)),
    altura: Math.max(minimo, Math.abs(ate.y - de.y)),
  }
}

function caixaDaImagem(
  imagem: ImagemParaInserir,
  lugar: Lugar,
  pagina: Tamanho,
): Caixa {
  const natural = {
    largura: imagem.largura * PONTOS_POR_PIXEL,
    altura: imagem.altura * PONTOS_POR_PIXEL,
  }
  if ('centro' in lugar) {
    const escala = Math.min(
      1,
      (pagina.largura * FRACAO_DA_IMAGEM_NO_CENTRO) / natural.largura,
      (pagina.altura * FRACAO_DA_IMAGEM_NO_CENTRO) / natural.altura,
    )
    return centrar(
      {
        largura: natural.largura * escala,
        altura: natural.altura * escala,
      },
      lugar.centro,
    )
  }
  const caixa = caixaEntre(lugar.de, lugar.ate, 0)
  const porLargura = caixa.largura / natural.largura
  const porAltura = caixa.altura / natural.altura
  // Um arraste quase reto (só na horizontal ou só na vertical) vale pelo lado que andou.
  const pedida =
    caixa.largura < LADO_MINIMO
      ? porAltura
      : caixa.altura < LADO_MINIMO
        ? porLargura
        : Math.min(porLargura, porAltura)
  const escala = Math.max(
    LADO_MINIMO / Math.min(natural.largura, natural.altura),
    pedida,
  )
  return {
    x: caixa.x,
    y: caixa.y,
    largura: natural.largura * escala,
    altura: natural.altura * escala,
  }
}

/** O objeto novo de uma ferramenta (menos o desenho, que nasce dos pontos do traço), já dentro da página. */
export function criarObjeto(
  ferramenta: Exclude<Ferramenta, 'selecionar' | 'desenho'>,
  lugar: Lugar,
  pagina: Tamanho,
  estilos: Estilos,
  extras: {
    conteudo?: string
    imagem?: ImagemParaInserir
    medir?: MedirTexto
  } = {},
  id = novoId(),
): ObjetoNaTela {
  switch (ferramenta) {
    case 'texto': {
      const forma = { ...estilos.texto, conteudo: extras.conteudo ?? '' }
      const tamanho = caixaDoTexto(forma, extras.medir)
      const caixa =
        'centro' in lugar
          ? centrar(tamanho, lugar.centro)
          : { ...lugar.de, ...tamanho }
      return limitar({ id, tipo: 'texto', ...forma, ...caixa }, pagina)
    }
    case 'imagem': {
      if (!extras.imagem) throw new RangeError('imagem sem arquivo')
      return limitar(
        {
          id,
          tipo: 'imagem',
          imagem: extras.imagem.id,
          ...caixaDaImagem(extras.imagem, lugar, pagina),
        },
        pagina,
      )
    }
    case 'linha':
    case 'seta': {
      const { inicio, ...caixa } =
        'centro' in lugar
          ? {
              ...centrar(TAMANHO_PADRAO[ferramenta], lugar.centro),
              inicio: 'superior-esquerdo' as const,
            }
          : linhaEntre(lugar.de, lugar.ate)
      return limitar(
        { id, tipo: ferramenta, inicio, ...estilos.forma, ...caixa },
        pagina,
      )
    }
    default: {
      const caixa =
        'centro' in lugar
          ? centrar(TAMANHO_PADRAO[ferramenta], lugar.centro)
          : caixaEntre(lugar.de, lugar.ate, LADO_MINIMO)
      const estilo =
        ferramenta === 'cobrir'
          ? {}
          : ferramenta === 'marca-texto'
            ? estilos.marcaTexto
            : estilos.forma
      return limitar(
        { id, tipo: ferramenta, ...estilo, ...caixa } as ObjetoNaTela,
        pagina,
      )
    }
  }
}

export function criarTraco(
  pontos: readonly PontoDoTraco[],
  estilo: EstiloDoTraco,
  id = novoId(),
): ObjetoNaTela {
  return { id, tipo: 'traco', ...estilo, ...tracoDosPontos(pontos) }
}

const limitarNumero = (valor: number, minimo: number, maximo: number) =>
  Math.min(Math.max(valor, minimo), maximo)

/** Arrastar a alça do canto de baixo à direita até o ponto. Texto muda a fonte; imagem guarda a proporção. */
export function redimensionarAte<T extends ObjetoNaTela>(
  objeto: T,
  ponto: Ponto,
  pagina: Tamanho,
): T {
  const largura = Math.max(0, ponto.x - objeto.x)
  const altura = Math.max(0, ponto.y - objeto.y)
  if (objeto.tipo === 'texto' || objeto.tipo === 'imagem') {
    const cabe = Math.min(
      objeto.largura > 0
        ? (pagina.largura - objeto.x) / objeto.largura
        : Infinity,
      objeto.altura > 0 ? (pagina.altura - objeto.y) / objeto.altura : Infinity,
    )
    const pedida = Math.max(
      objeto.largura > 0 ? largura / objeto.largura : 0,
      objeto.altura > 0 ? altura / objeto.altura : 0,
    )
    if (objeto.tipo === 'texto') {
      const tamanho = limitarNumero(
        objeto.tamanho * Math.min(pedida, cabe),
        TAMANHO_MINIMO_DO_TEXTO,
        TAMANHO_MAXIMO_DO_TEXTO,
      )
      return limitar(comTamanhoDeFonte(objeto, tamanho) as T, pagina)
    }
    const minima = LADO_MINIMO / Math.min(objeto.largura, objeto.altura)
    const escala = Math.max(minima, Math.min(pedida, cabe))
    return limitar(
      {
        ...objeto,
        largura: objeto.largura * escala,
        altura: objeto.altura * escala,
      },
      pagina,
    )
  }
  const minimo =
    objeto.tipo === 'linha' || objeto.tipo === 'seta' || objeto.tipo === 'traco'
      ? 0
      : LADO_MINIMO
  return limitar(
    {
      ...objeto,
      largura: Math.min(Math.max(minimo, largura), pagina.largura - objeto.x),
      altura: Math.min(Math.max(minimo, altura), pagina.altura - objeto.y),
    },
    pagina,
  )
}

export type Mudanca =
  | { campo: 'x' | 'y' | 'largura' | 'altura'; valor: number }
  | { campo: 'tamanho' | 'espessura'; valor: number }
  | { campo: 'cor'; valor: Cor }
  | { campo: 'fonte'; valor: FamiliaDaFonte }
  | { campo: 'negrito' | 'italico'; valor: boolean }
  | { campo: 'conteudo'; valor: string }

/** O que o painel de propriedades muda num objeto, sempre dentro da página. */
export function comMudanca(
  objeto: ObjetoNaTela,
  mudanca: Mudanca,
  pagina: Tamanho,
  medir?: MedirTexto,
): ObjetoNaTela {
  switch (mudanca.campo) {
    case 'x':
    case 'y':
      return limitar({ ...objeto, [mudanca.campo]: mudanca.valor }, pagina)
    case 'largura':
    case 'altura': {
      if (objeto.tipo === 'texto') return objeto
      const minimo =
        objeto.tipo === 'linha' ||
        objeto.tipo === 'seta' ||
        objeto.tipo === 'traco'
          ? 0
          : LADO_MINIMO
      const disponivel =
        mudanca.campo === 'largura'
          ? pagina.largura - objeto.x
          : pagina.altura - objeto.y
      return limitar(
        {
          ...objeto,
          [mudanca.campo]: limitarNumero(mudanca.valor, minimo, disponivel),
        },
        pagina,
      )
    }
    case 'tamanho':
      if (objeto.tipo !== 'texto') return objeto
      return limitar(
        comTamanhoDeFonte(
          objeto,
          limitarNumero(
            mudanca.valor,
            TAMANHO_MINIMO_DO_TEXTO,
            TAMANHO_MAXIMO_DO_TEXTO,
          ),
        ),
        pagina,
      )
    case 'espessura':
      if (!('espessura' in objeto)) return objeto
      return {
        ...objeto,
        espessura: limitarNumero(
          mudanca.valor,
          ESPESSURA_MINIMA,
          ESPESSURA_MAXIMA,
        ),
      }
    case 'cor':
      if (!('cor' in objeto) || !corValida(mudanca.valor)) return objeto
      return { ...objeto, cor: mudanca.valor.toLowerCase() }
    default: {
      if (objeto.tipo !== 'texto') return objeto
      const novo = { ...objeto, [mudanca.campo]: mudanca.valor }
      return limitar({ ...novo, ...caixaDoTexto(novo, medir) }, pagina)
    }
  }
}

export const DIRECAO_DA_TECLA: Readonly<Record<string, Direcao>> = {
  ArrowLeft: 'esquerda',
  ArrowRight: 'direita',
  ArrowUp: 'cima',
  ArrowDown: 'baixo',
}

/** As edições de um documento: os objetos de cada página e as páginas marcadas para apagar de verdade. */
export type Cena = {
  readonly objetos: ReadonlyMap<number, readonly ObjetoNaTela[]>
  readonly apagar: ReadonlySet<number>
}

export const CENA_VAZIA: Cena = { objetos: new Map(), apagar: new Set() }

const NENHUM: readonly ObjetoNaTela[] = []

export function objetosDa(cena: Cena, pagina: number): readonly ObjetoNaTela[] {
  return cena.objetos.get(pagina) ?? NENHUM
}

function comObjetos(
  cena: Cena,
  pagina: number,
  objetos: readonly ObjetoNaTela[],
): Cena {
  const novos = new Map(cena.objetos)
  if (objetos.length) novos.set(pagina, objetos)
  else novos.delete(pagina)
  return { ...cena, objetos: novos }
}

export function incluirObjeto(
  cena: Cena,
  pagina: number,
  objeto: ObjetoNaTela,
): Cena {
  return comObjetos(cena, pagina, [...objetosDa(cena, pagina), objeto])
}

export function trocarObjeto(
  cena: Cena,
  pagina: number,
  objeto: ObjetoNaTela,
): Cena {
  const objetos = objetosDa(cena, pagina)
  const posicao = objetos.findIndex((o) => o.id === objeto.id)
  if (posicao < 0 || objetos[posicao] === objeto) return cena
  return comObjetos(
    cena,
    pagina,
    objetos.map((o, i) => (i === posicao ? objeto : o)),
  )
}

export function tirarObjeto(cena: Cena, pagina: number, id: string): Cena {
  const objetos = objetosDa(cena, pagina)
  if (!objetos.some((o) => o.id === id)) return cena
  return comObjetos(
    cena,
    pagina,
    objetos.filter((o) => o.id !== id),
  )
}

export function comApagarDeVerdade(
  cena: Cena,
  pagina: number,
  ligado: boolean,
): Cena {
  if (cena.apagar.has(pagina) === ligado) return cena
  const apagar = new Set(cena.apagar)
  if (ligado) apagar.add(pagina)
  else apagar.delete(pagina)
  return { ...cena, apagar }
}

export const temCobrir = (cena: Cena, pagina: number) =>
  objetosDa(cena, pagina).some((o) => o.tipo === 'cobrir')

/** As páginas em que a cena mudou de uma para a outra (para o desfazer levar até a mudança). */
export function paginasMudadas(antes: Cena, depois: Cena): number[] {
  const paginas = new Set([
    ...antes.objetos.keys(),
    ...depois.objetos.keys(),
    ...antes.apagar,
    ...depois.apagar,
  ])
  return [...paginas]
    .filter(
      (pagina) =>
        antes.objetos.get(pagina) !== depois.objetos.get(pagina) ||
        antes.apagar.has(pagina) !== depois.apagar.has(pagina),
    )
    .sort((a, b) => a - b)
}

export function imagensDa(cena: Cena): Set<string> {
  const ids = new Set<string>()
  for (const objetos of cena.objetos.values()) {
    for (const objeto of objetos) {
      if (objeto.tipo === 'imagem') ids.add(objeto.imagem)
    }
  }
  return ids
}

export function totalDeObjetos(cena: Cena): number {
  let total = 0
  for (const objetos of cena.objetos.values()) total += objetos.length
  return total
}

/** As páginas que viram imagem ao salvar: marcadas e com algum retângulo de cobrir. */
export function paginasParaApagar(cena: Cena): number[] {
  return [...cena.apagar]
    .filter((pagina) => temCobrir(cena, pagina))
    .sort((a, b) => a - b)
}

export function cobrirDa(cena: Cena, pagina: number): Caixa[] {
  return objetosDa(cena, pagina)
    .filter((o) => o.tipo === 'cobrir')
    .map(({ x, y, largura, altura }) => ({ x, y, largura, altura }))
}

export const TIPO_DA_FERRAMENTA: Record<
  Exclude<Ferramenta, 'selecionar'>,
  TipoDeObjeto
> = {
  texto: 'texto',
  imagem: 'imagem',
  desenho: 'traco',
  retangulo: 'retangulo',
  elipse: 'elipse',
  linha: 'linha',
  seta: 'seta',
  'marca-texto': 'marca-texto',
  cobrir: 'cobrir',
}
