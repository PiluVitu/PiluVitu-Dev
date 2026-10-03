import { faEnvelope } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import Link from 'next/link'
import { DOCUMENTOS, MAILTO, URL_DA_PILUTECH } from '@/lib/conteudo'

const LINK =
  'text-muted-foreground inline-block py-1.5 font-mono text-xs hover:underline'

export function Rodape() {
  return (
    <footer className="border-border mt-[72px] flex flex-wrap items-center justify-between gap-4 border-t pt-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <a href={URL_DA_PILUTECH} className={LINK}>
          Powered by PiluTech
        </a>
        <nav aria-label="Documentos">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {DOCUMENTOS.map((documento) => (
              <li key={documento.href}>
                <Link href={documento.href} className={LINK}>
                  {documento.rotulo}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <Button asChild variant="outline" className="gap-2">
        <a href={MAILTO.suporte}>
          <FontAwesomeIcon icon={faEnvelope} className="size-[13px]" />
          Suporte
        </a>
      </Button>
    </footer>
  )
}
