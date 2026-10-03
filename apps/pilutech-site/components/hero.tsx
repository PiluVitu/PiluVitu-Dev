import { faWhatsapp } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { ABRE_EM_ABA_NOVA, WHATSAPP } from '@/lib/contato'
import { BOTAO_GRANDE, CONTEUDO } from './classes'
import { Terminal } from './terminal'

export function Hero() {
  return (
    <header
      id="inicio"
      className="dark bg-background text-foreground bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-accent-soft),transparent)]"
    >
      <div
        className={cn(
          CONTEUDO,
          'grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-14 py-[clamp(64px,10vw,128px)]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-7">
          <p className="text-primary font-mono text-[13px] tracking-[0.2em] uppercase">
            ~/pilutech · Teresina, PI · atendimento remoto
          </p>
          <h1 className="text-[clamp(40px,5.6vw,68px)] leading-[1.04] font-extrabold tracking-[-0.035em] text-balance wrap-break-word">
            Aplicativos, infraestrutura e desenvolvimento fullstack.
          </h1>
          <p className="text-muted-foreground max-w-[560px] text-[clamp(17px,1.6vw,20px)] leading-[1.6] text-pretty">
            A PiluTech cria e mantém aplicativos, provisiona infraestrutura em
            nuvem e entrega o orçamento de cada item antes de você contratar.
            Você fala direto com quem desenvolve.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className={BOTAO_GRANDE}>
              <a href={WHATSAPP.geral} {...ABRE_EM_ABA_NOVA}>
                <FontAwesomeIcon icon={faWhatsapp} className="size-[18px]" />
                Falar no WhatsApp
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className={cn(BOTAO_GRANDE, 'text-foreground bg-transparent')}
            >
              <a href="#servicos">Ver serviços</a>
            </Button>
          </div>
        </div>
        <Terminal />
      </div>
    </header>
  )
}
