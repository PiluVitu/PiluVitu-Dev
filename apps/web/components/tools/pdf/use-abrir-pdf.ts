'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
  type Formulario,
} from '@piluvitu/tools/pdf-regras'
import type { MotivoDaRecusa, MotorDePdf } from './motor'
import {
  ehFalhaDaAbertura,
  type DocumentoAberto,
  type RenderizadorDePdf,
} from './renderizador'

export type RecusaDaAbertura =
  | { motivo: MotivoDaRecusa }
  | { paginasDemais: number }

export type Abertura = { arquivo: File } & (
  | { ok: true; documento: DocumentoAberto }
  | { ok: false; recusa: RecusaDaAbertura }
)

type Ferramentas = {
  /** Chamados só quando chega um arquivo: o motor e o renderizador criam os Workers deles sob demanda. */
  motor: () => MotorDePdf
  renderizador: () => RenderizadorDePdf
  /** O pdf-lib lê também o formulário, na mesma leitura, e o `aoAbrir` o recebe. */
  formulario?: boolean
  aoAbrir?: (
    documento: DocumentoAberto,
    arquivo: File,
    formulario?: Formulario,
  ) => void
  aoRecusar?: () => void
}

// A abertura dos modos que mostram página. O arquivo grande demais nem é lido; o pdf-lib lê primeiro e
// decide os erros, com as mensagens do mesclar, e o de páginas demais não chega ao pdf.js. Se os dois
// contam páginas diferentes (/Count errado na árvore), o PDF salvo teria outra página no lugar da que a
// pessoa viu: o arquivo é recusado como corrompido.
export function useAbrirPdf(arquivo: File | null, ferramentas: Ferramentas) {
  const [abertura, setAbertura] = useState<Abertura | null>(null)
  const ferramentasRef = useRef(ferramentas)
  useLayoutEffect(() => {
    ferramentasRef.current = ferramentas
  })

  useEffect(() => {
    if (!arquivo || arquivo.size > TETO_DE_BYTES_COM_MINIATURAS) return
    const motor = ferramentasRef.current.motor()
    const renderizador = ferramentasRef.current.renderizador()
    let ativo = true
    let aberto: DocumentoAberto | null = null

    function recusar(recusa: RecusaDaAbertura) {
      if (!ativo || !arquivo) return
      setAbertura({ arquivo, ok: false, recusa })
      ferramentasRef.current.aoRecusar?.()
    }

    void (async () => {
      const analise = await motor.analisar(arquivo, {
        formulario: ferramentasRef.current.formulario === true,
      })
      if (!ativo) return
      if (!analise.ok) return recusar({ motivo: analise.motivo })
      if (analise.paginas > TETO_DE_PAGINAS) {
        return recusar({ paginasDemais: analise.paginas })
      }
      try {
        const doPdfjs = await renderizador.abrir(arquivo)
        if (!ativo) return doPdfjs.fechar()
        if (doPdfjs.paginas !== analise.paginas) {
          doPdfjs.fechar()
          return recusar({ motivo: 'corrompido' })
        }
        aberto = doPdfjs
        setAbertura({ arquivo, ok: true, documento: doPdfjs })
        ferramentasRef.current.aoAbrir?.(doPdfjs, arquivo, analise.formulario)
      } catch (erro) {
        recusar({
          motivo: ehFalhaDaAbertura(erro) ? erro.motivo : 'falha_do_navegador',
        })
      }
    })()

    return () => {
      ativo = false
      aberto?.fechar()
    }
  }, [arquivo])

  const atual = arquivo && abertura?.arquivo === arquivo ? abertura : null
  return {
    /** A abertura do arquivo de agora; `null` enquanto abre, sem arquivo ou grande demais. */
    atual,
    documento: atual?.ok ? atual.documento : null,
    grandeDemais:
      arquivo !== null && arquivo.size > TETO_DE_BYTES_COM_MINIATURAS,
  }
}
