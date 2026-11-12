export const EMAIL_DA_PILUTECH = 'help@pilutech.com.br'

export function mailtoDaPilutech(projeto: string, assunto: string): string {
  return `mailto:${EMAIL_DA_PILUTECH}?subject=${encodeURIComponent(`[${projeto}] ${assunto}`)}`
}
