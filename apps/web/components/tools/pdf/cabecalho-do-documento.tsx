import type { ReactNode } from 'react'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { AvisoDoPdf } from '@piluvitu/tools/pdf-regras'
import { TEXTOS } from './textos'

export type AvisoNoCabecalho = {
  readonly aviso: AvisoDoPdf
  /** Com mais de um arquivo no documento, o nome do arquivo que tem o aviso. */
  readonly arquivo?: string
}

/** O nome e as páginas do documento, os avisos dele e, ao lado, o Gerar (antes da lista, para o Tab chegar logo nele). */
export function CabecalhoDoDocumento({
  idDoTitulo,
  titulo,
  avisos,
  children,
}: {
  idDoTitulo: string
  titulo: string
  avisos: readonly AvisoNoCabecalho[]
  children: ReactNode
}) {
  return (
    <div
      className="bg-card border-border flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-start lg:justify-between"
      data-testid="editar-pdf-cabecalho"
    >
      <div className="min-w-0 space-y-3">
        <h2
          id={idDoTitulo}
          className="font-semibold [overflow-wrap:anywhere]"
          data-testid="editar-pdf-documento"
        >
          {titulo}
        </h2>
        {avisos.length > 0 && (
          <ul className="space-y-2" data-testid="editar-pdf-avisos">
            {avisos.map(({ aviso, arquivo }, i) => (
              <li
                key={`${i}-${aviso}`}
                className="bg-background border-border flex gap-2 rounded-md border px-3 py-3 text-sm"
                data-testid="editar-pdf-aviso"
              >
                <FontAwesomeIcon
                  icon={faTriangleExclamation}
                  className="text-primary mt-0.5 size-4 shrink-0"
                  aria-hidden
                />
                <p className="min-w-0 [overflow-wrap:anywhere]">
                  {arquivo === undefined
                    ? TEXTOS.editar.avisos[aviso]
                    : TEXTOS.editar.avisoDoArquivo(arquivo, aviso)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className="min-w-0 space-y-3 lg:max-w-md lg:shrink-0"
        data-testid="editar-pdf-gerar-area"
      >
        {children}
      </div>
    </div>
  )
}
