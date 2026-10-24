/**
 * As rotas do Atelier que revisam texto pela Claude: `POST
 * /admin/llm/proofread` (Sonnet, teto `revisao`, em lotes; acima de
 * `MAX_LOTES_PROOFREAD` responde `413 text_too_large`) e `POST
 * /admin/llm/refine` (Haiku, teto `hooks`). Os erros da IA saem pelo `respostaDeErroIa`, e o
 * `apps/web` mostra a mensagem dele direto no toast.
 */
import { ClaudeDesligado } from '@piluvitu/ia/erros'
import { Hono } from 'hono'
import { chatComOrcamento } from '../domain/revisao/chat-claude'
import { proofread, refine, TextoGrandeDemais } from '../domain/revisao/revisao'
import type { AuthBindings } from '../lib/auth'
import { errJson, okJson } from '../lib/envelope'
import { respostaDeErroIa } from '../lib/ia'
import { requireAdmin, type SessionVariables } from '../lib/session'

type Env = {
  Bindings: AuthBindings
  Variables: SessionVariables
}

const atelierRoutes = new Hono<Env>()

const MSG_CORPO_INVALIDO = "Corpo inválido: 'text' é obrigatório."

atelierRoutes.post(
  '/llm/proofread',
  requireAdmin<AuthBindings>(),
  async (c) => {
    if (!c.env.ANTHROPIC_API_KEY) {
      return respostaDeErroIa(new ClaudeDesligado())
    }

    let corpo: { text?: unknown }
    try {
      corpo = await c.req.json()
    } catch {
      return errJson(400, 'invalid_json', MSG_CORPO_INVALIDO)
    }
    if (typeof corpo.text !== 'string' || corpo.text === '') {
      return errJson(400, 'invalid_json', MSG_CORPO_INVALIDO)
    }

    try {
      const corrected = await proofread(
        corpo.text,
        chatComOrcamento(c.env, 'revisao'),
      )
      return okJson({ corrected })
    } catch (err) {
      if (err instanceof TextoGrandeDemais) {
        return errJson(413, 'text_too_large', err.message)
      }
      return respostaDeErroIa(err)
    }
  },
)

atelierRoutes.post('/llm/refine', requireAdmin<AuthBindings>(), async (c) => {
  if (!c.env.ANTHROPIC_API_KEY) {
    return respostaDeErroIa(new ClaudeDesligado())
  }

  let corpo: { platform?: unknown; text?: unknown; instruction?: unknown }
  try {
    corpo = await c.req.json()
  } catch {
    return errJson(400, 'invalid_json', MSG_CORPO_INVALIDO)
  }
  if (typeof corpo.text !== 'string' || corpo.text === '') {
    return errJson(400, 'invalid_json', MSG_CORPO_INVALIDO)
  }

  try {
    const refined = await refine(
      typeof corpo.platform === 'string' ? corpo.platform : '',
      corpo.text,
      typeof corpo.instruction === 'string' ? corpo.instruction : '',
      chatComOrcamento(c.env, 'hooks'),
    )
    return okJson({ refined })
  } catch (err) {
    return respostaDeErroIa(err)
  }
})

export default atelierRoutes
