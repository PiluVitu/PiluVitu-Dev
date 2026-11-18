import {
  cabeNoDocumento,
  inserirPaginas,
  nomeDoPdfDerivado,
  posicaoDeInsercao,
  tamanhoDaBranca,
  type AvisoDoPdf,
  type Cabimento,
  type Ocupacao,
  type OrigemDaPagina,
  type Tamanho,
} from '@piluvitu/tools/pdf-regras'
import {
  mudarPaginas,
  type PaginaDaBancada,
  type Paginas,
  type PaginasComDesfazer,
} from './bancada'
import { idDaPagina } from './montagem'
import type { MotivoDaRecusa, MotorDePdf, PaginaParaMontar } from './motor'
import {
  ehFalhaDaAbertura,
  type DocumentoAberto,
  type RenderizadorDePdf,
} from './renderizador'
import { TEXTOS } from './textos'

export type ArquivoDoEditor = {
  readonly arquivo: File
  /** A contagem do pdf-lib, igual à do pdf.js. */
  readonly paginas: number
  /** Os avisos do #124 (assinatura digital, XFA puro) valem para cada arquivo que entra. */
  readonly avisos: readonly AvisoDoPdf[]
  readonly aberto: DocumentoAberto
}

export type DocumentoDoEditor = {
  /** O mesmo objeto do primeiro arquivo aberto até a sessão acabar: a tela guarda o estado por ele. */
  readonly sessao: object
  /**
   * Pela posição na sessão, que é o `arquivo` da origem de cada página. O arquivo fechado vira `null`,
   * para os ids das páginas dos outros não mudarem.
   */
  readonly arquivos: readonly (ArquivoDoEditor | null)[]
}

export function documentoInicial(primeiro: ArquivoDoEditor): DocumentoDoEditor {
  return { sessao: {}, arquivos: [primeiro] }
}

export function comArquivo(
  documento: DocumentoDoEditor,
  novo: ArquivoDoEditor,
): { documento: DocumentoDoEditor; arquivo: number } {
  return {
    documento: { ...documento, arquivos: [...documento.arquivos, novo] },
    arquivo: documento.arquivos.length,
  }
}

export const ehBranca = (
  origem: OrigemDaPagina,
): origem is Extract<OrigemDaPagina, { branca: Tamanho }> => 'branca' in origem

/** A página em branco não tem arquivo: não passa pelo pdf.js. */
export function doArquivo(
  documento: DocumentoDoEditor,
  origem: OrigemDaPagina,
): { aberto: DocumentoAberto; indice: number } {
  if (ehBranca(origem))
    throw new RangeError('a página em branco não tem arquivo')
  const { arquivo, indice } = origem
  const doDocumento = documento.arquivos[arquivo]
  if (!doDocumento || indice < 0 || indice >= doDocumento.paginas) {
    throw new RangeError(`página fora do documento: ${arquivo}:${indice}`)
  }
  return { aberto: doDocumento.aberto, indice }
}

export function paginasDoArquivo(
  arquivo: number,
  total: number,
): PaginaDaBancada[] {
  return Array.from({ length: total }, (_, indice) => ({
    id: idDaPagina(arquivo, indice),
    origem: { arquivo, indice },
    giro: 0,
  }))
}

/** P3: depois da última marcada que ainda está na lista, ou no fim; as que entram viram a seleção (D3). */
export function adicionarPaginas(
  paginas: PaginasComDesfazer,
  novas: readonly PaginaDaBancada[],
): { paginas: PaginasComDesfazer; posicao: number } {
  const posicao = posicaoDeInsercao(paginas.lista, paginas.marcadas)
  return {
    paginas: mudarPaginas(paginas, {
      lista: inserirPaginas(paginas.lista, posicao, novas),
      marcadas: novas.map(({ id }) => id),
    }),
    posicao,
  }
}

/** `brancas`: as páginas em branco que existem (`brancasAlcancaveis`), que somam no teto de páginas. */
export function ocupacaoDe(
  documento: DocumentoDoEditor,
  brancas = 0,
): Ocupacao {
  let bytes = 0
  let paginas = brancas
  for (const aberto of documento.arquivos) {
    if (!aberto) continue
    bytes += aberto.arquivo.size
    paginas += aberto.paginas
  }
  return { bytes, paginas }
}

export function cabeNoEditor(
  documento: DocumentoDoEditor,
  novo: { readonly bytes: number; readonly paginas?: number },
  brancas = 0,
): Cabimento {
  return cabeNoDocumento(ocupacaoDe(documento, brancas), novo)
}

const listasDe = (paginas: PaginasComDesfazer) =>
  [paginas, ...paginas.passado].map(({ lista }) => lista)

/** Os arquivos que alguma página alcança, na lista ou num passo do desfazer das páginas (não há refazer). */
export function arquivosAlcancaveis(paginas: PaginasComDesfazer): Set<number> {
  const alcancados = new Set<number>()
  for (const lista of listasDe(paginas)) {
    for (const { origem } of lista) {
      if (!ehBranca(origem)) alcancados.add(origem.arquivo)
    }
  }
  return alcancados
}

/** As páginas em branco na lista ou num passo do desfazer, uma vez cada: contam no teto como o arquivo aberto. */
export function brancasAlcancaveis(paginas: PaginasComDesfazer): number {
  const brancas = new Set<string>()
  for (const lista of listasDe(paginas)) {
    for (const { id, origem } of lista) if (ehBranca(origem)) brancas.add(id)
  }
  return brancas.size
}

/** D4: a última que a pessoa marcou e que ainda está na lista. */
export function ultimaMarcada({
  lista,
  marcadas,
}: Paginas): PaginaDaBancada | null {
  for (let i = marcadas.length - 1; i >= 0; i--) {
    const pagina = lista.find(({ id }) => id === marcadas[i])
    if (pagina) return pagina
  }
  return null
}

/**
 * P2: o tamanho da última marcada como ela aparece no cartão e no PDF, com o giro (a moldura só enquadra os
 * objetos na página grande); sem marcada, A4. O de uma página de arquivo vem do pdf.js, com o /Rotate dela.
 */
export async function tamanhoDaNovaBranca(
  documento: DocumentoDoEditor,
  paginas: Paginas,
): Promise<Tamanho> {
  const marcada = ultimaMarcada(paginas)
  if (!marcada) return tamanhoDaBranca(null)
  const { origem, giro } = marcada
  if (ehBranca(origem)) return tamanhoDaBranca({ tamanho: origem.branca, giro })
  const { aberto, indice } = doArquivo(documento, origem)
  return tamanhoDaBranca({ tamanho: await aberto.tamanho(indice), giro })
}

export type BrancaAdicionada =
  | {
      ok: true
      paginas: PaginasComDesfazer
      posicao: number
      id: string
    }
  | { ok: false; restam: Ocupacao }

/** P3 e D3, num passo do desfazer das páginas; acima do teto somado, recusada sem mexer nas páginas. */
export function adicionarBranca(
  documento: DocumentoDoEditor,
  paginas: PaginasComDesfazer,
  tamanho: Tamanho,
): BrancaAdicionada {
  const cabe = cabeNoEditor(
    documento,
    { bytes: 0, paginas: 1 },
    brancasAlcancaveis(paginas),
  )
  if (!cabe.cabe) return { ok: false, restam: cabe.restam }
  const id = `b${paginas.brancasCriadas}`
  const posicao = posicaoDeInsercao(paginas.lista, paginas.marcadas)
  return {
    ok: true,
    paginas: {
      ...mudarPaginas(paginas, {
        lista: inserirPaginas(paginas.lista, posicao, [
          { id, origem: { branca: tamanho }, giro: 0 },
        ]),
        marcadas: [id],
      }),
      brancasCriadas: paginas.brancasCriadas + 1,
    },
    posicao,
    id,
  }
}

/** O nome vem do primeiro arquivo da sessão que tem página no PDF; só com brancas, um nome que diz isso. */
export function nomeDoPdfBaixado(
  documento: DocumentoDoEditor,
  paginasDoPdf: readonly PaginaDaBancada[],
  sufixo: string,
): string {
  const arquivos = paginasDoPdf.flatMap(({ origem }) =>
    ehBranca(origem) ? [] : [origem.arquivo],
  )
  const primeiro = arquivos.length
    ? documento.arquivos[Math.min(...arquivos)]
    : null
  return nomeDoPdfDerivado(
    primeiro?.arquivo.name ?? TEXTOS.editar.branca.nomeDoPdf,
    sufixo,
  )
}

export function semInalcancaveis(
  documento: DocumentoDoEditor,
  alcancaveis: ReadonlySet<number>,
): { documento: DocumentoDoEditor; fechados: ArquivoDoEditor[] } {
  const fechados = documento.arquivos.filter(
    (aberto, arquivo): aberto is ArquivoDoEditor =>
      aberto !== null && !alcancaveis.has(arquivo),
  )
  if (!fechados.length) return { documento, fechados }
  for (const { aberto } of fechados) aberto.fechar()
  return {
    documento: {
      ...documento,
      arquivos: documento.arquivos.map((aberto) =>
        aberto && fechados.includes(aberto) ? null : aberto,
      ),
    },
    fechados,
  }
}

/**
 * Os arquivos que o plano usa, renumerados na ordem da sessão (os ids das páginas ficam). Sem o primeiro
 * arquivo, sai por cópia: renumerado, outro arquivo viraria o 0 e poderia sair no lugar.
 */
export function pedidoDeArquivos(
  documento: DocumentoDoEditor,
  paginas: readonly PaginaParaMontar[],
): { arquivos: File[]; paginas: PaginaParaMontar[]; porCopia: boolean } {
  const usados = [
    ...new Set(
      paginas.flatMap(({ origem }) =>
        ehBranca(origem) ? [] : [origem.arquivo],
      ),
    ),
  ].sort((a, b) => a - b)
  const novoNumero = new Map(usados.map((arquivo, i) => [arquivo, i]))
  return {
    arquivos: usados.map((arquivo) => {
      const aberto = documento.arquivos[arquivo]
      if (!aberto) throw new RangeError(`arquivo fechado no plano: ${arquivo}`)
      return aberto.arquivo
    }),
    paginas: paginas.map((pagina) =>
      ehBranca(pagina.origem)
        ? pagina
        : {
            ...pagina,
            origem: {
              ...pagina.origem,
              arquivo: novoNumero.get(pagina.origem.arquivo)!,
            },
          },
    ),
    porCopia: usados[0] !== 0,
  }
}

export type AberturaDoArquivo<Recusa> =
  | { ok: true; arquivo: ArquivoDoEditor }
  | { ok: false; recusa: { motivo: MotivoDaRecusa } | Recusa }

// O pdf-lib lê primeiro e decide os erros, com as mensagens do mesclar; o recusado (inclusive pelo teto
// de páginas, que só a contagem dele diz) não chega ao pdf.js. Se os dois contam páginas diferentes
// (/Count errado na árvore), o PDF salvo teria outra página no lugar da que a pessoa viu: corrompido.
export async function abrirArquivo<Recusa>(
  arquivo: File,
  {
    motor,
    renderizador,
  }: { motor: MotorDePdf; renderizador: RenderizadorDePdf },
  conferirPaginas: (paginas: number) => Recusa | null,
): Promise<AberturaDoArquivo<Recusa>> {
  const analise = await motor.analisar(arquivo)
  if (!analise.ok) return { ok: false, recusa: { motivo: analise.motivo } }
  const passou = conferirPaginas(analise.paginas)
  if (passou !== null) return { ok: false, recusa: passou }
  let aberto: DocumentoAberto
  try {
    aberto = await renderizador.abrir(arquivo)
  } catch (erro) {
    return {
      ok: false,
      recusa: {
        motivo: ehFalhaDaAbertura(erro) ? erro.motivo : 'falha_do_navegador',
      },
    }
  }
  if (aberto.paginas !== analise.paginas) {
    aberto.fechar()
    return { ok: false, recusa: { motivo: 'corrompido' } }
  }
  return {
    ok: true,
    arquivo: {
      arquivo,
      paginas: analise.paginas,
      avisos: analise.avisos,
      aberto,
    },
  }
}
