import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Link from 'next/link'
import { BotaoTema } from './botao-tema'

export type LinkDoTopo = { href: string; rotulo: string }

type TopoProps = { voltar: LinkDoTopo; ancoras?: LinkDoTopo[] }

export function Topo({ voltar, ancoras = [] }: TopoProps) {
  return (
    <nav
      aria-label="Topo"
      className="flex flex-wrap items-center justify-between gap-4"
    >
      <Link
        href={voltar.href}
        className="text-foreground inline-flex items-center gap-2 font-mono text-sm hover:underline"
      >
        <FontAwesomeIcon
          icon={faArrowLeft}
          className="text-primary size-[13px]"
        />
        {voltar.rotulo}
      </Link>
      <div className="flex items-center gap-2">
        {ancoras.map((ancora) => (
          <a
            key={ancora.href}
            href={ancora.href}
            className="text-muted-foreground px-2.5 py-2 font-mono text-[13px] hover:underline"
          >
            {ancora.rotulo}
          </a>
        ))}
        <BotaoTema />
      </div>
    </nav>
  )
}
