import { faWhatsapp } from '@fortawesome/free-brands-svg-icons'
import { faEnvelope } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import {
  ABRE_EM_ABA_NOVA,
  EMAIL_DA_PILUTECH,
  MAILTO_DO_SITE,
  TELEFONE_VISIVEL,
  WHATSAPP,
} from '@/lib/contato'
import { BOTAO_GRANDE, CONTEUDO } from './classes'

export function Contato() {
  return (
    <section
      id="contato"
      aria-labelledby="contato-titulo"
      className="dark bg-background text-foreground bg-[radial-gradient(60%_70%_at_50%_100%,rgb(56_189_248/0.12),transparent)]"
    >
      <div
        className={cn(
          CONTEUDO,
          'flex flex-col items-center gap-7 py-[clamp(80px,10vw,128px)] text-center',
        )}
      >
        <p className="text-primary font-mono text-[13px] tracking-[0.2em] uppercase">
          contato
        </p>
        <h2
          id="contato-titulo"
          className="max-w-[760px] text-[clamp(34px,4.6vw,56px)] leading-[1.06] font-extrabold tracking-[-0.035em] text-balance wrap-break-word"
        >
          Conte o que você precisa.
        </h2>
        <p className="text-muted-foreground max-w-[560px] text-lg leading-[1.6]">
          A conversa é direta com quem vai desenvolver. Pelo WhatsApp ou por
          e-mail.
        </p>
        <div className="flex max-w-full flex-wrap justify-center gap-3">
          <Button asChild className={BOTAO_GRANDE}>
            <a href={WHATSAPP.geral} {...ABRE_EM_ABA_NOVA}>
              <FontAwesomeIcon icon={faWhatsapp} className="size-[18px]" />
              <span className="sr-only">WhatsApp </span>
              {TELEFONE_VISIVEL}
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            className={cn(
              BOTAO_GRANDE,
              'text-foreground h-auto min-h-[50px] max-w-full bg-transparent py-3 wrap-anywhere whitespace-normal',
            )}
          >
            <a href={MAILTO_DO_SITE}>
              <FontAwesomeIcon
                icon={faEnvelope}
                className="size-[18px] flex-none"
              />
              <span className="sr-only">E-mail </span>
              {EMAIL_DA_PILUTECH}
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
