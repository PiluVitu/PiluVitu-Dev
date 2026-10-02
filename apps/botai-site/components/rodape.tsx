import { faEnvelope } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { EMAIL_DE_SUPORTE, URL_DA_PILUTECH } from '@/lib/conteudo'

export function Rodape() {
  return (
    <footer className="border-border mt-[72px] flex flex-wrap items-center justify-between gap-4 border-t pt-6">
      <a
        href={URL_DA_PILUTECH}
        className="text-muted-foreground font-mono text-xs hover:underline"
      >
        Powered by PiluTech
      </a>
      <Button asChild variant="outline" className="gap-2">
        <a href={`mailto:${EMAIL_DE_SUPORTE}`}>
          <FontAwesomeIcon icon={faEnvelope} className="size-[13px]" />
          Suporte
        </a>
      </Button>
    </footer>
  )
}
