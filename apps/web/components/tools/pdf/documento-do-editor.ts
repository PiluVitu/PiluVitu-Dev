import {
  cabeNoDocumento,
  inserirPaginas,
  posicaoDeInsercao,
  type AvisoDoPdf,
  type Cabimento,
  type Ocupacao,
} from '@piluvitu/tools/pdf-regras'
import {
  mudarPaginas,
  type PaginaDaBancada,
  type PaginasComDesfazer,
} from './bancada'
import { idDaPagina } from './montagem'
import type { MotivoDaRecusa, MotorDePdf, PaginaParaMontar } from './motor'
import {
  ehFalhaDaAbertura,
  type DocumentoAberto,
  type RenderizadorDePdf,
} from './renderizador'

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

export function doArquivo(
  documento: DocumentoDoEditor,
  { arquivo, indice }: PaginaDaBancada['origem'],
): { aberto: DocumentoAberto; indice: number } {
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

export function ocupacaoDe(documento: DocumentoDoEditor): Ocupacao {
  let bytes = 0
  let paginas = 0
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
): Cabimento {
  return cabeNoDocumento(ocupacaoDe(documento), novo)
}

/** Os arquivos que alguma página alcança, na lista ou num passo do desfazer das páginas (não há refazer). */
export function arquivosAlcancaveis(paginas: PaginasComDesfazer): Set<number> {
  const alcancados = new Set<number>()
  for (const { lista } of [paginas, ...paginas.passado]) {
    for (const { origem } of lista) alcancados.add(origem.arquivo)
  }
  return alcancados
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
        'branca' in origem ? [] : [origem.arquivo],
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
      'branca' in pagina.origem
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
