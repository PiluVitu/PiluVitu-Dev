import { faWhatsapp } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { ABRE_EM_ABA_NOVA, WHATSAPP } from '@/lib/contato'

export function WhatsappFlutuante() {
  return (
    <a
      href={WHATSAPP.geral}
      {...ABRE_EM_ABA_NOVA}
      aria-label="Falar no WhatsApp"
      className="dark bg-primary text-primary-foreground hover:bg-ciano-claro fixed right-5 bottom-5 z-30 flex size-14 items-center justify-center rounded-[18px] shadow-[0_8px_24px_rgb(0_0_0/0.35)]"
    >
      <FontAwesomeIcon icon={faWhatsapp} className="size-7" />
    </a>
  )
}
