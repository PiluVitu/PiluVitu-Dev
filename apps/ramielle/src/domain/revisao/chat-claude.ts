import { comOrcamento, type BancoD1 } from '@piluvitu/ia/uso'
import { TETOS_RAMIELLE } from '../../lib/ia'
import type { Chat } from './revisao'

export type AmbienteChat = { DB: BancoD1; ANTHROPIC_API_KEY?: string }

export function chatComOrcamento(
  env: AmbienteChat,
  feature: keyof typeof TETOS_RAMIELLE,
): Chat {
  return async (pedido) => {
    const resposta = await comOrcamento(
      env.DB,
      {
        feature,
        tetoMicro: TETOS_RAMIELLE[feature],
        apiKey: env.ANTHROPIC_API_KEY,
      },
      pedido,
    )
    return resposta.texto
  }
}
