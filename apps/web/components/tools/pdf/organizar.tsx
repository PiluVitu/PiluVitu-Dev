'use client'

import { useEffect, useRef, useState } from 'react'
import { faCircleExclamation } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useDocumentoPdf } from './documento-pdf'
import type { MotivoDaRecusa } from './motor'
import {
  criarRenderizadorComPdfjs,
  ehFalhaDaAbertura,
  type DocumentoAberto,
  type RenderizadorDePdf,
} from './renderizador'
import { TEXTOS } from './textos'
import { AvisoDePrivacidade, ZonaDeArquivos } from './zona-de-arquivos'

type Leitura = { arquivo: File } & (
  | { ok: true; paginas: number }
  | { ok: false; motivo: MotivoDaRecusa }
)

type Props = {
  /** Injetável para story e teste; sem ele, o pdf.js é baixado quando o primeiro PDF chega. */
  renderizador?: RenderizadorDePdf
}

export function OrganizarPdf({ renderizador: injetado }: Props) {
  const { arquivo, guardar } = useDocumentoPdf()
  const renderizadorRef = useRef<RenderizadorDePdf | null>(injetado ?? null)
  const [leitura, setLeitura] = useState<Leitura | null>(null)

  useEffect(() => {
    if (!arquivo) return
    renderizadorRef.current ??= criarRenderizadorComPdfjs()
    let ativo = true
    let aberto: DocumentoAberto | null = null
    renderizadorRef.current.abrir(arquivo).then(
      (documento) => {
        if (!ativo) return documento.fechar()
        aberto = documento
        setLeitura({ arquivo, ok: true, paginas: documento.paginas })
      },
      (erro: unknown) => {
        if (!ativo) return
        setLeitura({
          arquivo,
          ok: false,
          motivo: ehFalhaDaAbertura(erro) ? erro.motivo : 'falha_do_navegador',
        })
      },
    )
    return () => {
      ativo = false
      aberto?.fechar()
    }
  }, [arquivo])

  const atual = arquivo && leitura?.arquivo === arquivo ? leitura : null
  const anuncio = !arquivo
    ? ''
    : !atual
      ? TEXTOS.organizar.abrindo(arquivo.name)
      : atual.ok
        ? TEXTOS.organizar.aberto(arquivo.name, atual.paginas)
        : ''

  return (
    <div className="space-y-8" data-testid="organizar-pdf">
      <AvisoDePrivacidade />

      <section aria-label={TEXTOS.organizar.rotulo} className="space-y-3">
        <ZonaDeArquivos
          multiplos={false}
          aoEscolher={(lista) => {
            if (lista[0]) guardar(lista[0])
          }}
        />
        {atual?.ok && (
          <p
            className="text-sm font-medium [overflow-wrap:anywhere]"
            data-testid="organizar-pdf-documento"
          >
            {TEXTOS.organizar.aberto(atual.arquivo.name, atual.paginas)}
          </p>
        )}
        {atual && !atual.ok && (
          <div
            role="alert"
            data-testid="organizar-pdf-erro"
            className="bg-card border-destructive flex gap-2 rounded-md border px-3 py-3 text-sm"
          >
            <FontAwesomeIcon
              icon={faCircleExclamation}
              className="text-destructive mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <p className="[overflow-wrap:anywhere]">
              {TEXTOS.organizar.recusado(atual.arquivo.name, atual.motivo)}
            </p>
          </div>
        )}
      </section>

      <p role="status" className="sr-only" data-testid="organizar-pdf-anuncio">
        {anuncio}
      </p>
    </div>
  )
}
