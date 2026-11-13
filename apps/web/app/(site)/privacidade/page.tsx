import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { EMAIL_DA_PILUTECH } from '@piluvitu/tools/contato'
import { PageTopBar } from '@/components/page-top-bar'
import { metadataDaPagina } from '@/lib/pilulabs'
import {
  MAILTO_DA_PRIVACIDADE,
  POLITICA_DE_PRIVACIDADE,
  type Paragrafo,
  type Trecho,
} from '@/lib/politica-de-privacidade'
import { PAGINA_PRIVACIDADE } from '@/lib/rotas-publicas'

const ABRE_EM_ABA_NOVA = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const
const LINK = 'text-primary font-medium underline underline-offset-4'

export const metadata: Metadata = metadataDaPagina({
  caminho: PAGINA_PRIVACIDADE.caminho,
  titulo: 'Política de privacidade | Paulo Victor Torres Silva',
  descricao: PAGINA_PRIVACIDADE.descricao,
})

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-bold tracking-tight">{titulo}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}

function Email() {
  return (
    <a href={MAILTO_DA_PRIVACIDADE} className={`${LINK} wrap-anywhere`}>
      {EMAIL_DA_PILUTECH}
    </a>
  )
}

function Codigo({ children }: { children: ReactNode }) {
  return (
    <code className="bg-muted rounded px-1 font-mono text-[0.9em] wrap-anywhere">
      {children}
    </code>
  )
}

function TrechoDaPolitica({ trecho }: { trecho: Trecho }) {
  if (typeof trecho === 'string') return trecho
  switch (trecho.tipo) {
    case 'email':
      return <Email />
    case 'codigo':
      return <Codigo>{trecho.texto}</Codigo>
    case 'link':
      return (
        <a href={trecho.href} className={LINK} {...ABRE_EM_ABA_NOVA}>
          {trecho.texto}
        </a>
      )
  }
}

function ParagrafoDaPolitica({
  paragrafo,
  className,
}: {
  paragrafo: Paragrafo
  className?: string
}) {
  return (
    <p className={className}>
      {paragrafo.map((trecho, indice) => (
        <TrechoDaPolitica key={indice} trecho={trecho} />
      ))}
    </p>
  )
}

export default function PrivacidadePage() {
  const { titulo, vigencia, resumo, secoes } = POLITICA_DE_PRIVACIDADE
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-8 sm:px-8 xl:py-10">
      <PageTopBar backHref="/" backLabel="Paulo Victor" />

      <article className="mt-10 max-w-3xl leading-relaxed">
        <h1 className="text-4xl font-bold tracking-tight">{titulo}</h1>
        <p className="text-muted-foreground mt-3 font-mono text-sm">
          Em vigor desde <time dateTime={vigencia.iso}>{vigencia.texto}</time>
        </p>
        <ParagrafoDaPolitica paragrafo={resumo} className="mt-8" />

        {secoes.map((secao) => (
          <Secao key={secao.titulo} titulo={secao.titulo}>
            {secao.paragrafos.map((paragrafo, indice) => (
              <ParagrafoDaPolitica key={indice} paragrafo={paragrafo} />
            ))}
          </Secao>
        ))}
      </article>
    </main>
  )
}
