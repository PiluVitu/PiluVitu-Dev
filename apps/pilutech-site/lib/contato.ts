import { mailtoDaPilutech } from '@piluvitu/tools/contato'

export { EMAIL_DA_PILUTECH } from '@piluvitu/tools/contato'

export const WHATSAPP_NUMERO = '5586981737625'
export const TELEFONE_VISIVEL = '(86) 98173-7625'
export const TELEFONE_INTERNACIONAL = '+55 86 98173-7625'

export function linkDoWhatsApp(mensagem: string): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`
}

export const MENSAGENS_DO_WHATSAPP = {
  geral: 'Olá! Vim pelo site da PiluTech e quero falar sobre um projeto.',
  essencial: 'Olá! Quero uma proposta do plano Essencial de manutenção.',
  evolucao: 'Olá! Quero uma proposta do plano Evolução de manutenção.',
  infraestrutura: 'Olá! Quero uma proposta do plano de Infraestrutura.',
  ia: 'Olá! Quero uma proposta do plano de IA.',
} as const

export const WHATSAPP: Record<keyof typeof MENSAGENS_DO_WHATSAPP, string> = {
  geral: linkDoWhatsApp(MENSAGENS_DO_WHATSAPP.geral),
  essencial: linkDoWhatsApp(MENSAGENS_DO_WHATSAPP.essencial),
  evolucao: linkDoWhatsApp(MENSAGENS_DO_WHATSAPP.evolucao),
  infraestrutura: linkDoWhatsApp(MENSAGENS_DO_WHATSAPP.infraestrutura),
  ia: linkDoWhatsApp(MENSAGENS_DO_WHATSAPP.ia),
}

export const MAILTO_DO_SITE = mailtoDaPilutech('PiluTech', 'Contato pelo site')

export const ABRE_EM_ABA_NOVA = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const
