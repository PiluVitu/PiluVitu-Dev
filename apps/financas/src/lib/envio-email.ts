import { EmailMessage } from 'cloudflare:email'
import type { EnviarEmail } from '../domain/alertas'
import {
  DESTINO_NAO_VERIFICADO,
  destinoNaoVerificado,
  type ModoDeEnvio,
} from '../domain/alertas-envio'
import { montarMime } from './mime'

class DestinoNaoVerificado extends Error {
  readonly code = DESTINO_NAO_VERIFICADO
  constructor() {
    super('o destino dos alertas não é um endereço verificado no Email Routing')
    this.name = 'DestinoNaoVerificado'
  }
}

function dominio(endereco: string): string {
  return endereco.slice(endereco.lastIndexOf('@') + 1)
}

export function enviadorDeAlertas(
  envio: { email: SendEmail; modo: ModoDeEnvio },
  {
    agora = () => new Date(),
    novoId = () => crypto.randomUUID(),
  }: { agora?: () => Date; novoId?: () => string } = {},
): EnviarEmail {
  if (envio.modo === 'email_sending') {
    return { send: (msg) => envio.email.send(msg) }
  }
  return {
    async send(msg) {
      const messageId = `${novoId()}@${dominio(msg.from.email)}`
      const raw = montarMime(msg, { data: agora(), messageId })
      try {
        await envio.email.send(new EmailMessage(msg.from.email, msg.to, raw))
      } catch (err) {
        if (destinoNaoVerificado(err)) throw new DestinoNaoVerificado()
        throw err
      }
      return { messageId: `<${messageId}>` }
    },
  }
}
