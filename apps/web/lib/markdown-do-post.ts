import { srcDaImagem } from './mdx/src-da-imagem'

export type OpcoesDoMarkdown = {
  urlDoPost: string
  primeiroNivel: number
}

type Meta = { codigo: boolean; removida: boolean; dentro: boolean }
type Linha = Meta & { texto: string }
type Colchete = { posicao: number; imagem: boolean; inicioDeLinha: boolean }
type Aberta = { nome: string; fechar: string }
type Tag = {
  fim: number
  fechamento: boolean
  nome: string
  atributos: Map<string, string>
  autoFechada: boolean
}

const CERCA = /^[ \t]*(`{3,}|~{3,})(.*)$/
const ESM = /^(import|export)[\s{*]/
const NOME_DA_TAG = /[A-Za-z][\w.:-]*/y
const NOME_DO_ATRIBUTO = /[A-Za-z_:][\w.:-]*/y
const ATX = /^( {0,3})(#{1,6})(?=[ \t]|$)/
const SUBLINHADO = /^ {0,3}(=+|-{2,})[ \t]*$/
const NAO_E_PARAGRAFO = /^\s*([#>|]|[-*+][ \t]|\d+[.)][ \t]|```|~~~)/
const PONTUACAO = /[!-/:-@[-`{-~]/
const PREFIXO_DE_BLOCO =
  /^(?:[ \t]*(?:>|[-*+](?=[ \t])|\d{1,9}[.)](?=[ \t])))*[ \t]*$/
const ROTULO = /\[((?:[^[\]\\]|\\.)*)\]/y

const ehHttp = ({ protocol }: URL) =>
  protocol === 'https:' || protocol === 'http:'

function urlSegura(destino: string, base: string): string | null {
  const limpo = destino.trim()
  let absoluta: URL
  try {
    absoluta = new URL(limpo)
  } catch {
    try {
      const relativa = new URL(limpo, base)
      return ehHttp(relativa) ? relativa.href : null
    } catch {
      return null
    }
  }
  if (!ehHttp(absoluta)) return null
  return /\s/.test(limpo) ? absoluta.href : limpo
}

function umaLinha(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim()
}

function normalizarRotulo(rotulo: string): string {
  return umaLinha(rotulo).toLowerCase()
}

function fimDaString(
  fonte: string,
  inicio: number,
  fecha = fonte[inicio],
): number {
  for (let j = inicio + 1; j < fonte.length; j++) {
    if (fonte[j] === '\\') j++
    else if (fonte[j] === fecha) return j + 1
  }
  return -1
}

function codigoAberto(codigo: string): boolean {
  let profundidade = 0
  for (let j = 0; j < codigo.length; j++) {
    const c = codigo[j]
    if (c === '"' || c === "'" || c === '`') {
      const fim = fimDaString(codigo, j)
      if (fim < 0) return true
      j = fim - 1
    } else if (c === '/' && codigo[j + 1] === '*') {
      const fim = codigo.indexOf('*/', j + 2)
      if (fim < 0) return true
      j = fim + 1
    } else if (c === '/' && codigo[j + 1] === '/') {
      const fim = codigo.indexOf('\n', j)
      if (fim < 0) break
      j = fim
    } else if ('{(['.includes(c)) profundidade++
    else if ('})]'.includes(c)) profundidade--
  }
  return profundidade > 0
}

function fimDaExpressao(fonte: string, inicio: number): number {
  let profundidade = 0
  for (let j = inicio; j < fonte.length; j++) {
    const c = fonte[j]
    if (c === '"' || c === "'" || c === '`') {
      const fim = fimDaString(fonte, j)
      if (fim < 0) return -1
      j = fim - 1
    } else if (c === '/' && fonte[j + 1] === '*') {
      const fim = fonte.indexOf('*/', j + 2)
      if (fim < 0) return -1
      j = fim + 1
    } else if (c === '{') profundidade++
    else if (c === '}' && --profundidade === 0) return j + 1
  }
  return -1
}

function pularEspacos(fonte: string, j: number): number {
  while (j < fonte.length && /\s/.test(fonte[j])) j++
  return j
}

function lerTag(fonte: string, inicio: number): Tag | null {
  let j = inicio + 1
  const fechamento = fonte[j] === '/'
  if (fechamento) j++
  NOME_DA_TAG.lastIndex = j
  const nome = NOME_DA_TAG.exec(fonte)?.[0] ?? ''
  if (!nome && fonte[j] !== '>') return null
  j += nome.length
  const atributos = new Map<string, string>()
  while (j < fonte.length) {
    j = pularEspacos(fonte, j)
    if (fonte[j] === '>')
      return { fim: j + 1, fechamento, nome, atributos, autoFechada: false }
    if (fonte[j] === '/' && fonte[j + 1] === '>')
      return { fim: j + 2, fechamento, nome, atributos, autoFechada: true }
    if (fonte[j] === '{') {
      j = fimDaExpressao(fonte, j)
      if (j < 0) return null
      continue
    }
    NOME_DO_ATRIBUTO.lastIndex = j
    const atributo = NOME_DO_ATRIBUTO.exec(fonte)?.[0]
    if (!atributo) return null
    j = pularEspacos(fonte, j + atributo.length)
    if (fonte[j] !== '=') {
      atributos.set(atributo, '')
      continue
    }
    j = pularEspacos(fonte, j + 1)
    const fim =
      fonte[j] === '"' || fonte[j] === "'"
        ? fimDaString(fonte, j)
        : fonte[j] === '{'
          ? fimDaExpressao(fonte, j)
          : -1
    if (fim < 0) return null
    if (fonte[j] !== '{') atributos.set(atributo, fonte.slice(j + 1, fim - 1))
    j = fim
  }
  return null
}

function fimDoCodigoInline(fonte: string, inicio: number): number {
  let tamanho = 0
  while (fonte[inicio + tamanho] === '`') tamanho++
  const fimDoParagrafo = fonte.slice(inicio).search(/\n[ \t]*\n/)
  const limite = fimDoParagrafo < 0 ? fonte.length : inicio + fimDoParagrafo
  let j = inicio + tamanho
  while (j < limite) {
    const achado = fonte.indexOf('`', j)
    if (achado < 0 || achado >= limite) return -1
    let fim = achado
    while (fonte[fim] === '`') fim++
    if (fim - achado === tamanho) return fim
    j = fim
  }
  return -1
}

function fimDoDestino(fonte: string, inicio: number): number {
  if (fonte[inicio] === '<') {
    const fim = fonte.indexOf('>', inicio)
    return fim < 0 ? -1 : fim + 1
  }
  let parenteses = 0
  let j = inicio
  for (; j < fonte.length; j++) {
    const c = fonte[j]
    if (c === '\\') j++
    else if (/\s/.test(c)) break
    else if (c === '(') parenteses++
    else if (c === ')' && parenteses-- === 0) break
  }
  return j
}

function fimDoRecurso(fonte: string, inicio: number): number {
  let j = pularEspacos(fonte, inicio)
  const abre = fonte[j]
  if (abre === '"' || abre === "'" || abre === '(') {
    const fecha = fonte.indexOf(abre === '(' ? ')' : abre, j + 1)
    if (fecha < 0) return -1
    j = pularEspacos(fonte, fecha + 1)
  }
  return fonte[j] === ')' ? j + 1 : -1
}

function pularEspacosDaLinha(fonte: string, j: number): number {
  while (fonte[j] === ' ' || fonte[j] === '\t') j++
  return j
}

const fimDaLinha = (fonte: string, j: number) =>
  j >= fonte.length || fonte[j] === '\n'

/** O destino e o fim de `[rótulo]: destino "título"` pelo CommonMark: depois
 * do destino ou do título só pode vir o fim da linha. */
function lerPartesDaDefinicao(
  fonte: string,
  depoisDosDoisPontos: number,
): { destino: [number, number]; fim: number } | null {
  let j = pularEspacosDaLinha(fonte, depoisDosDoisPontos)
  if (fonte[j] === '\n') j = pularEspacosDaLinha(fonte, j + 1)
  const inicio = j
  const fim = fimDoDestino(fonte, inicio)
  if (fim <= inicio) return null
  j = pularEspacosDaLinha(fonte, fim)
  if (fimDaLinha(fonte, j)) return { destino: [inicio, fim], fim: j }
  const abre = fonte[j]
  if (j === fim || (abre !== '"' && abre !== "'" && abre !== '(')) return null
  const fimDoTitulo = fimDaString(fonte, j, abre === '(' ? ')' : abre)
  if (fimDoTitulo < 0) return null
  j = pularEspacosDaLinha(fonte, fimDoTitulo)
  return fimDaLinha(fonte, j) ? { destino: [inicio, fim], fim: j } : null
}

function analisar(
  fonte: string,
  urlDoPost: string,
  rotulosSemUrl: ReadonlySet<string>,
): { linhas: Linha[]; cercaAberta: string | null; semUrl: Set<string> } {
  const linhasDaFonte = fonte.split('\n')
  const semUrl = new Set<string>()
  const meta: Meta[] = [{ codigo: false, removida: false, dentro: false }]
  const abertas: Aberta[] = []
  let colchetes: Colchete[] = []
  let cercaAberta: string | null = null
  let saida = ''
  let i = 0

  const linhaAtual = () => meta.length - 1
  const marcarRemovida = () => (meta[linhaAtual()].removida = true)
  const quebra = () => {
    saida += '\n'
    if (linhasDaFonte[linhaAtual()].trim() === '') colchetes = []
    meta.push({ codigo: false, removida: false, dentro: abertas.length > 0 })
  }
  const escrever = (trecho: string) => {
    for (const parte of trecho.split(/(\n)/))
      if (parte === '\n') quebra()
      else saida += parte
  }
  const descartar = (trecho: string) => {
    marcarRemovida()
    for (const c of trecho)
      if (c === '\n') {
        quebra()
        marcarRemovida()
      }
  }
  const apagarDesde = (posicao: number) => {
    saida = saida.slice(0, posicao) + saida.slice(posicao).replace(/[^\n]/g, '')
  }
  const fecharAte = (nome: string) => {
    const k = abertas.map((a) => a.nome).lastIndexOf(nome)
    if (k < 0) return
    saida += abertas[k].fechar
    abertas.length = k
  }

  const noInicioDoBloco = () => {
    const anterior = linhaAtual() - 1
    return (
      anterior < 0 ||
      linhasDaFonte[anterior].trim() === '' ||
      meta[anterior].codigo
    )
  }

  const lerCerca = (): boolean => {
    const linha = linhasDaFonte[linhaAtual()]
    const abertura = CERCA.exec(linha)
    if (!abertura) return false
    const [, marca, info] = abertura
    if (marca[0] === '`' && info.includes('`')) return false
    meta[linhaAtual()].codigo = true
    escrever(linha)
    i += linha.length
    cercaAberta = marca
    const fechamento = new RegExp(
      `^[ \\t]*${marca[0]}{${marca.length},}[ \\t]*$`,
    )
    while (i < fonte.length) {
      i++
      quebra()
      const proxima = linhasDaFonte[linhaAtual()]
      meta[linhaAtual()].codigo = true
      escrever(proxima)
      i += proxima.length
      if (fechamento.test(proxima)) {
        cercaAberta = null
        break
      }
    }
    return true
  }

  const lerEsm = (): boolean => {
    if (abertas.length > 0 || !noInicioDoBloco()) return false
    if (!ESM.test(linhasDaFonte[linhaAtual()])) return false
    const inicio = i
    for (;;) {
      const linha = linhasDaFonte[linhaAtual()]
      marcarRemovida()
      i += linha.length
      const proxima = linhasDaFonte[linhaAtual() + 1]
      if (proxima === undefined) return true
      if (proxima.trim() === '' && !codigoAberto(fonte.slice(inicio, i)))
        return true
      i++
      quebra()
    }
  }

  const lerTagJsx = (): boolean => {
    const tag = lerTag(fonte, i)
    if (!tag) return false
    const bruto = fonte.slice(i, tag.fim)
    i = tag.fim
    if (tag.nome === 'img' || tag.nome === 'Image') {
      const alt = umaLinha(tag.atributos.get('alt') ?? '')
      const src = srcDaImagem(tag.atributos.get('src'))
      const url = alt && src ? urlSegura(src, urlDoPost) : null
      descartar(bruto)
      if (url) saida += `![${alt.replace(/[[\]]/g, '\\$&')}](${url})`
    } else if (tag.nome === 'br') {
      descartar(bruto)
      saida += ' '
    } else {
      descartar(bruto)
      if (tag.fechamento) fecharAte(tag.nome)
      else if (!tag.autoFechada) {
        const href = tag.nome === 'a' ? tag.atributos.get('href') : undefined
        const url = href ? urlSegura(href, urlDoPost) : null
        if (url) saida += '['
        abertas.push({ nome: tag.nome, fechar: url ? `](${url})` : '' })
      }
    }
    return true
  }

  const ficarSoComOTexto = (colchete: Colchete) => {
    if (colchete.imagem) apagarDesde(colchete.posicao)
    else
      saida =
        saida.slice(0, colchete.posicao) + saida.slice(colchete.posicao + 1, -1)
  }

  const lerDestino = (colchete: Colchete) => {
    const inicioDoDestino = pularEspacos(fonte, i + 1)
    const fimDestino = fimDoDestino(fonte, inicioDoDestino)
    const fim = fimDestino < 0 ? -1 : fimDoRecurso(fonte, fimDestino)
    if (fim < 0) return
    const destino = fonte
      .slice(inicioDoDestino, fimDestino)
      .replace(/^<|>$/g, '')
    const alt = saida.slice(colchete.posicao + 2, -1).trim()
    const src = colchete.imagem ? srcDaImagem(destino) : undefined
    const url = colchete.imagem
      ? alt && src
        ? urlSegura(src, urlDoPost)
        : null
      : urlSegura(destino, urlDoPost)
    const recurso = fonte.slice(i, fim)
    if (url) {
      escrever(
        `${fonte.slice(i, inicioDoDestino)}${url}${fonte.slice(fimDestino, fim)}`,
      )
      i = fim
      return
    }
    i = fim
    ficarSoComOTexto(colchete)
    descartar(recurso)
  }

  const lerDefinicao = (colchete: Colchete): boolean => {
    const rotulo = saida.slice(colchete.posicao + 1, -1)
    if (!rotulo.trim() || rotulo.startsWith('^')) return false
    const partes = lerPartesDaDefinicao(fonte, i + 1)
    if (!partes) return false
    const [inicioDoDestino, fimDestino] = partes.destino
    const destino = fonte
      .slice(inicioDoDestino, fimDestino)
      .replace(/^<|>$/g, '')
    const url = urlSegura(destino, urlDoPost)
    if (url) {
      escrever(`${fonte.slice(i, inicioDoDestino)}${url}`)
      i = fimDestino
      return true
    }
    semUrl.add(normalizarRotulo(rotulo))
    apagarDesde(saida.lastIndexOf('\n') + 1)
    descartar(fonte.slice(i, partes.fim))
    i = partes.fim
    return true
  }

  const lerReferencia = (colchete: Colchete) => {
    ROTULO.lastIndex = i
    const seguinte = ROTULO.exec(fonte)
    const rotulo = seguinte?.[1].trim()
      ? seguinte[1]
      : saida.slice(colchete.posicao + (colchete.imagem ? 2 : 1), -1)
    if (!rotulosSemUrl.has(normalizarRotulo(rotulo))) return
    if (seguinte) {
      descartar(seguinte[0])
      i += seguinte[0].length
    }
    ficarSoComOTexto(colchete)
  }

  const fecharColchete = (colchete: Colchete) => {
    if (fonte[i] === '(') return lerDestino(colchete)
    if (colchete.inicioDeLinha && fonte[i] === ':' && lerDefinicao(colchete))
      return
    if (rotulosSemUrl.size > 0) lerReferencia(colchete)
  }

  while (i < fonte.length) {
    const noInicioDaLinha = i === 0 || fonte[i - 1] === '\n'
    if (noInicioDaLinha && (lerCerca() || lerEsm())) continue
    const c = fonte[i]
    if (c === '\n') {
      quebra()
      i++
    } else if (c === '\\' && PONTUACAO.test(fonte[i + 1] ?? '')) {
      saida += fonte.slice(i, i + 2)
      i += 2
    } else if (c === '`') {
      const fim = fimDoCodigoInline(fonte, i)
      const ate =
        fim < 0 ? i + (/^`+/.exec(fonte.slice(i))?.[0].length ?? 1) : fim
      escrever(fonte.slice(i, ate))
      i = ate
    } else if (c === '{') {
      const fim = fimDaExpressao(fonte, i)
      if (fim < 0) {
        saida += c
        i++
      } else {
        descartar(fonte.slice(i, fim))
        i = fim
      }
    } else if (c === '<' && /[A-Za-z/>]/.test(fonte[i + 1] ?? '')) {
      if (!lerTagJsx()) {
        saida += c
        i++
      }
    } else if (c === '!' && fonte[i + 1] === '[') {
      colchetes.push({
        posicao: saida.length,
        imagem: true,
        inicioDeLinha: false,
      })
      saida += '!['
      i += 2
    } else if (c === '[') {
      const inicioDeLinha = PREFIXO_DE_BLOCO.test(
        saida.slice(saida.lastIndexOf('\n') + 1),
      )
      colchetes.push({ posicao: saida.length, imagem: false, inicioDeLinha })
      saida += c
      i++
    } else if (c === ']') {
      const colchete = colchetes.pop()
      saida += c
      i++
      if (colchete) fecharColchete(colchete)
    } else {
      saida += c
      i++
    }
  }

  return {
    linhas: saida.split('\n').map((texto, k) => ({ texto, ...meta[k] })),
    cercaAberta,
    semUrl,
  }
}

function semRecuoDentroDosComponentes(linhas: Linha[]): Linha[] {
  const resultado: Linha[] = []
  for (let k = 0; k < linhas.length; ) {
    if (!linhas[k].dentro) {
      resultado.push(linhas[k++])
      continue
    }
    let fim = k
    while (fim < linhas.length && linhas[fim].dentro) fim++
    const trecho = linhas.slice(k, fim)
    const recuo = Math.min(
      ...trecho
        .filter(({ texto }) => texto.trim() !== '')
        .map(({ texto }) => /^[ \t]*/.exec(texto)![0].length),
    )
    for (const linha of trecho)
      resultado.push({
        ...linha,
        texto: Number.isFinite(recuo) ? linha.texto.slice(recuo) : linha.texto,
      })
    k = fim
  }
  return resultado
}

function tituloComCerquilha(linhas: Linha[]): Linha[] {
  const resultado: Linha[] = []
  for (const linha of linhas) {
    const sublinhado = linha.codigo ? null : SUBLINHADO.exec(linha.texto)
    const anterior = resultado.at(-1)
    if (
      sublinhado &&
      anterior &&
      !anterior.codigo &&
      anterior.texto.trim() !== '' &&
      !NAO_E_PARAGRAFO.test(anterior.texto)
    ) {
      const paragrafo: string[] = []
      while (
        resultado.length > 0 &&
        !resultado.at(-1)!.codigo &&
        resultado.at(-1)!.texto.trim() !== ''
      )
        paragrafo.unshift(resultado.pop()!.texto)
      const nivel = sublinhado[1][0] === '=' ? '#' : '##'
      resultado.push({
        ...linha,
        texto: `${nivel} ${umaLinha(paragrafo.join(' '))}`,
      })
    } else resultado.push(linha)
  }
  return resultado
}

function titulosNoNivel(linhas: Linha[], primeiroNivel: number): Linha[] {
  const niveis = linhas
    .filter(({ codigo }) => !codigo)
    .map(({ texto }) => ATX.exec(texto)?.[2].length ?? 7)
  const maior = Math.min(...niveis)
  if (maior > 6) return linhas
  return linhas.map((linha) => {
    const titulo = linha.codigo ? null : ATX.exec(linha.texto)
    if (!titulo) return linha
    const nivel = Math.min(6, titulo[2].length - maior + primeiroNivel)
    return {
      ...linha,
      texto: `${'#'.repeat(nivel)}${linha.texto.slice(titulo[0].length)}`,
    }
  })
}

function semBrancoRepetido(linhas: Linha[]): string[] {
  const resultado: string[] = []
  for (const { texto, codigo } of linhas) {
    const emBranco = !codigo && texto.trim() === ''
    if (emBranco && (resultado.length === 0 || resultado.at(-1) === ''))
      continue
    resultado.push(emBranco ? '' : texto)
  }
  while (resultado.at(-1) === '') resultado.pop()
  return resultado
}

/** O corpo MDX do post em Markdown para o llms-full.txt: sem import/export,
 * expressões nem componentes (fica o texto de dentro), com os links absolutos. */
export function markdownDoPost(
  mdx: string,
  { urlDoPost, primeiroNivel }: OpcoesDoMarkdown,
): string {
  const fonte = mdx.replace(/\r\n?/g, '\n')
  // A referência costuma vir antes da definição; a 1ª passada acha as sem URL.
  const primeira = analisar(fonte, urlDoPost, new Set())
  const { linhas, cercaAberta } =
    primeira.semUrl.size > 0
      ? analisar(fonte, urlDoPost, primeira.semUrl)
      : primeira
  const markdown = semBrancoRepetido(
    titulosNoNivel(
      tituloComCerquilha(
        semRecuoDentroDosComponentes(
          linhas.filter(
            ({ texto, removida, codigo }) =>
              codigo || !removida || texto.trim() !== '',
          ),
        ),
      ),
      primeiroNivel,
    ),
  )
  return [...markdown, ...(cercaAberta ? [cercaAberta] : [])].join('\n')
}
