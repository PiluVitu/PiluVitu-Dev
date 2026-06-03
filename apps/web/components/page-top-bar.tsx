import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { ModeToggle } from '@/components/mode-toggle'

type PageTopBarProps = {
  backHref: string
  backLabel: string
}

/**
 * Barra superior das sub-páginas (Tools, Posts, Votação): link de voltar à
 * esquerda + toggle de tema à direita. Padrão visual do DS V2.
 */
export function PageTopBar({ backHref, backLabel }: PageTopBarProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Link
        href={backHref}
        className="group text-foreground inline-flex items-center gap-2 font-mono text-sm transition-colors"
      >
        <FontAwesomeIcon
          icon={faArrowLeft}
          className="text-primary size-3.5 transition-transform group-hover:-translate-x-0.5"
        />
        {backLabel}
      </Link>
      <ModeToggle />
    </div>
  )
}
