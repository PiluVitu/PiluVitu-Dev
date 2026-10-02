import type { ReactNode } from 'react'
import { NOME } from '@/lib/conteudo'
import { Rodape } from './rodape'
import { Topo } from './topo'

// Data em texto pronto: formatar o ISO em BRT mostraria o dia anterior.
export type Vigencia = { iso: string; texto: string }

type DocumentoProps = {
  rotulo: string
  titulo: string
  vigencia: Vigencia
  resumo: ReactNode
  children: ReactNode
}

export function Documento({
  rotulo,
  titulo,
  vigencia,
  resumo,
  children,
}: DocumentoProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pt-8 pb-10">
      <Topo voltar={{ href: '/', rotulo: NOME }} />
      <main className="mt-12">
        <article>
          <header className="border-border flex flex-col gap-4 border-b pb-8">
            <p className="text-primary font-mono text-sm break-all">{rotulo}</p>
            <h1 className="text-4xl leading-tight font-bold tracking-tight">
              {titulo}
            </h1>
            <p className="text-muted-foreground font-mono text-xs">
              Em vigor desde{' '}
              <time dateTime={vigencia.iso}>{vigencia.texto}</time>
            </p>
            <p className="bg-accent-soft border-accent-line rounded-lg border p-4 text-pretty">
              <strong>Em resumo:</strong> {resumo}
            </p>
          </header>
          <div className="prose prose-neutral dark:prose-invert prose-a:text-primary prose-code:before:content-none prose-code:after:content-none mt-10 max-w-none">
            {children}
          </div>
        </article>
      </main>
      <Rodape />
    </div>
  )
}
