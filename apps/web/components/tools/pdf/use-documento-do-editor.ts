'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
  type AvisoDoPdf,
  type Ocupacao,
} from '@piluvitu/tools/pdf-regras'
import {
  abrirArquivo,
  cabeNoEditor,
  comArquivo,
  documentoInicial,
  semInalcancaveis,
  type DocumentoDoEditor,
} from './documento-do-editor'
import type { MotivoDaRecusa, MotorDePdf } from './motor'
import type { RenderizadorDePdf } from './renderizador'

export type RecusaDaAbertura =
  | { motivo: MotivoDaRecusa }
  | { paginasDemais: number }

export type AberturaDoEditor = { arquivo: File } & (
  | { ok: true; documento: DocumentoDoEditor }
  | { ok: false; recusa: RecusaDaAbertura }
)

/** O teto passado é o somado: `restam` é o que ainda cabia antes do novo. */
export type RecusaDaAdicao =
  | { motivo: MotivoDaRecusa }
  | {
      passou: 'bytes' | 'paginas'
      restam: Ocupacao
      bytes: number
      paginas?: number
    }

export type Adicao =
  | { ok: true; documento: DocumentoDoEditor; arquivo: number }
  | { ok: false; recusa: RecusaDaAdicao }

type Ferramentas = {
  /** Chamados só quando chega um arquivo: o motor e o renderizador criam os Workers deles sob demanda. */
  motor: () => MotorDePdf
  renderizador: () => RenderizadorDePdf
  aoAbrir?: (
    documento: DocumentoDoEditor,
    arquivo: File,
    avisos: readonly AvisoDoPdf[],
  ) => void
  aoRecusar?: () => void
}

// O documento do editor: o primeiro arquivo (o do DocumentoPdfProvider) abre a sessão, e os adicionados
// entram nela sem trocá-la. Os documentos do pdf.js dividem o Worker do renderizador (M2).
export function useDocumentoDoEditor(
  arquivo: File | null,
  ferramentas: Ferramentas,
) {
  const [abertura, setAbertura] = useState<AberturaDoEditor | null>(null)
  const [adicionando, setAdicionando] = useState<File | null>(null)
  const ferramentasRef = useRef(ferramentas)
  useLayoutEffect(() => {
    ferramentasRef.current = ferramentas
  })
  // O documento de agora, fora do ciclo do React: a adição que termina compara e emenda nele.
  const documentoRef = useRef<DocumentoDoEditor | null>(null)
  const adicionandoRef = useRef(false)

  const mudarDocumento = useCallback((documento: DocumentoDoEditor) => {
    documentoRef.current = documento
    setAbertura((atual) =>
      atual?.ok && atual.documento.sessao === documento.sessao
        ? { ...atual, documento }
        : atual,
    )
  }, [])

  useEffect(() => {
    if (!arquivo || arquivo.size > TETO_DE_BYTES_COM_MINIATURAS) return
    const motor = ferramentasRef.current.motor()
    const renderizador = ferramentasRef.current.renderizador()
    let ativo = true

    void (async () => {
      const aberto = await abrirArquivo(
        arquivo,
        { motor, renderizador },
        (paginas): RecusaDaAbertura | null =>
          paginas > TETO_DE_PAGINAS ? { paginasDemais: paginas } : null,
      )
      if (!ativo) {
        if (aberto.ok) aberto.arquivo.aberto.fechar()
        return
      }
      if (!aberto.ok) {
        setAbertura({ arquivo, ok: false, recusa: aberto.recusa })
        ferramentasRef.current.aoRecusar?.()
        return
      }
      const documento = documentoInicial(aberto.arquivo)
      documentoRef.current = documento
      setAbertura({ arquivo, ok: true, documento })
      ferramentasRef.current.aoAbrir?.(
        documento,
        arquivo,
        aberto.arquivo.avisos,
      )
    })()

    return () => {
      ativo = false
      documentoRef.current = null
      adicionandoRef.current = false
      setAdicionando(null)
      renderizador.encerrar()
    }
  }, [arquivo])

  // Um por vez (D5): o pedido que chega enquanto outro abre devolve null, como o da sessão que acabou.
  // O `aoEntrar` roda junto da emenda, no mesmo lote do React: a tela põe as páginas novas sem renderizar
  // antes um documento com o arquivo e sem as páginas dele (que o fechar dos inalcançáveis fecharia).
  const adicionar = useCallback(
    async (
      novo: File,
      aoEntrar?: (documento: DocumentoDoEditor, arquivo: number) => void,
    ): Promise<Adicao | null> => {
      const documento = documentoRef.current
      if (!documento || adicionandoRef.current) return null
      const peloTamanho = cabeNoEditor(documento, { bytes: novo.size })
      if (!peloTamanho.cabe) {
        return {
          ok: false,
          recusa: {
            passou: peloTamanho.passou,
            restam: peloTamanho.restam,
            bytes: novo.size,
          },
        }
      }
      adicionandoRef.current = true
      setAdicionando(novo)
      const { sessao } = documento
      const aindaNaSessao = () => documentoRef.current?.sessao === sessao
      const aberto = await abrirArquivo(
        novo,
        {
          motor: ferramentasRef.current.motor(),
          renderizador: ferramentasRef.current.renderizador(),
        },
        (paginas): RecusaDaAdicao | null => {
          const cabe = cabeNoEditor(documentoRef.current ?? documento, {
            bytes: novo.size,
            paginas,
          })
          return cabe.cabe
            ? null
            : {
                passou: cabe.passou,
                restam: cabe.restam,
                bytes: novo.size,
                paginas,
              }
        },
      )
      if (!aindaNaSessao()) {
        if (aberto.ok) aberto.arquivo.aberto.fechar()
        return null
      }
      adicionandoRef.current = false
      setAdicionando(null)
      if (!aberto.ok) return aberto
      const emendado = comArquivo(documentoRef.current!, aberto.arquivo)
      mudarDocumento(emendado.documento)
      aoEntrar?.(emendado.documento, emendado.arquivo)
      return { ok: true, ...emendado }
    },
    [mudarDocumento],
  )

  const fecharInalcancaveis = useCallback(
    (alcancaveis: ReadonlySet<number>) => {
      const documento = documentoRef.current
      if (!documento || alcancaveis.size === 0) return
      const depois = semInalcancaveis(documento, alcancaveis)
      if (depois.fechados.length) mudarDocumento(depois.documento)
    },
    [mudarDocumento],
  )

  const atual = arquivo && abertura?.arquivo === arquivo ? abertura : null
  return {
    /** A abertura do primeiro arquivo; `null` enquanto abre, sem arquivo ou grande demais. */
    atual,
    documento: atual?.ok ? atual.documento : null,
    /** Os avisos do primeiro arquivo; os de cada adicionado ficam no arquivo dele. */
    avisos: atual?.ok ? (atual.documento.arquivos[0]?.avisos ?? []) : [],
    grandeDemais:
      arquivo !== null && arquivo.size > TETO_DE_BYTES_COM_MINIATURAS,
    /** O PDF que está sendo adicionado agora. */
    adicionando,
    adicionar,
    fecharInalcancaveis,
  }
}
