import { faWhatsapp } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { ABRE_EM_ABA_NOVA, WHATSAPP } from '@/lib/contato'
import { SECOES_DA_BARRA } from '@/lib/conteudo'
import { ANEL_DE_FOCO, CONTEUDO } from './classes'
import { PiluTechMark } from './pilutech-mark'

export function Barra() {
  return (
    <nav
      aria-label="Principal"
      className="dark bg-background/94 text-foreground border-border sticky top-0 z-20 border-b"
    >
      <div
        className={cn(
          CONTEUDO,
          'flex h-[68px] items-center justify-between gap-6',
        )}
      >
        <a href="#inicio" className="flex">
          <PiluTechMark tamanho={30} lockup />
        </a>
        <div className="flex items-center gap-7">
          <ul className="hidden gap-6 text-[15px] min-[900px]:flex">
            {SECOES_DA_BARRA.map((secao) => (
              <li key={secao.id}>
                <a
                  href={`#${secao.id}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {secao.rotulo}
                </a>
              </li>
            ))}
          </ul>
          <Button
            asChild
            className={cn(
              'h-[38px] gap-2 rounded-xl px-3.5 text-sm font-semibold',
              ANEL_DE_FOCO,
            )}
          >
            <a href={WHATSAPP.geral} {...ABRE_EM_ABA_NOVA}>
              <FontAwesomeIcon icon={faWhatsapp} className="size-4" />
              WhatsApp
            </a>
          </Button>
        </div>
      </div>
    </nav>
  )
}
