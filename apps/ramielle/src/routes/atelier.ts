/**
 * As rotas do Atelier que dependem de inferência local: `POST
 * /admin/llm/proofread` e `POST /admin/llm/refine`.
 *
 * Porte de `apps/api/internal/handlers/llm/handlers.go`, com a inferência
 * movida pro promeia (§7.2 do spec). O ramielle aqui é ORQUESTRADOR: valida
 * o corpo, exige admin, chama o promeia com o token que só ele tem, e
 * traduz a resposta pro envelope que o `apps/web` consome.
 *
 * ⚠️ **Por que a tradução mora aqui e não no promeia.** O promeia responde
 * na forma dele (`{ok, code, message}`), que é o contrato dele com este
 * Worker. O `{ok, data, notifications}` é o contrato do Worker com o
 * navegador. Fazer o promeia falar o envelope o obrigaria a conhecer o
 * formato do frontend — camada trocada.
 *
 * ⚠️ **A mensagem do promeia é REPASSADA, não achatada.** O Go dizia
 * `"Falha ao corrigir o texto."` pra qualquer falha; o promeia distingue
 * "o Ollama está desligado" de "o modelo não está instalado, rode `ollama
 * pull X`" de "o Ollama respondeu e falhou". A §5 do spec pede exatamente
 * essa distinção, e o `apps/web` mostra `primary.message` direto em
 * `toast.error` — então o que o promeia escreve é o que o dono lê.
 */
import { Hono } from 'hono'
import type { AuthBindings } from '../lib/auth'
import { errJson, okJson } from '../lib/envelope'
import {
  chamarPromeia,
  PromeiaInalcancavel,
  PromeiaRecusou,
  promeiaConfigurado,
} from '../lib/promeia'
import { requireAdmin, type SessionVariables } from '../lib/session'

type Env = {
  Bindings: AuthBindings
  Variables: SessionVariables
}

const atelierRoutes = new Hono<Env>()

/** Mesma mensagem do Go pra corpo inválido — o admin já a mostra hoje. */
const MSG_CORPO_INVALIDO = "Corpo inválido: 'text' é obrigatório."

/** Feature desligada (sem `PROMEIA_URL`/`PROMEIA_TOKEN`), não quebrada. */
const MSG_DESLIGADO =
  'A revisão por IA está desligada — configure PROMEIA_URL e PROMEIA_TOKEN.'

function traduzirFalha(err: unknown) {
  if (err instanceof PromeiaInalcancavel) {
    // 503 e a frase da §5: o Mac está desligado, e a ação é ligá-lo.
    return errJson(503, 'promeia_unreachable', err.message)
  }
  if (err instanceof PromeiaRecusou) {
    // O promeia está de pé e recusou. Repassa o código E a mensagem dele —
    // é o que distingue "abra o Ollama" de "rode ollama pull X".
    // 4xx do promeia vira 502 pro navegador (foi o upstream que recusou,
    // não o cliente que errou), exceto o 400 de corpo, que já foi barrado
    // aqui em cima e não chega neste ponto.
    const status = err.status >= 500 || err.status === 503 ? err.status : 502
    return errJson(status as 502 | 503, err.code, err.message)
  }
  return errJson(502, 'promeia_failed', 'Falha ao falar com o promeia.')
}

atelierRoutes.post(
  '/llm/proofread',
  requireAdmin<AuthBindings>(),
  async (c) => {
    const cfg = promeiaConfigurado(c.env)
    if (cfg === null) return errJson(503, 'promeia_disabled', MSG_DESLIGADO)

    let corpo: { text?: unknown; careful?: unknown }
    try {
      corpo = await c.req.json()
    } catch {
      return errJson(400, 'invalid_json', MSG_CORPO_INVALIDO)
    }
    if (typeof corpo.text !== 'string' || corpo.text === '') {
      return errJson(400, 'invalid_json', MSG_CORPO_INVALIDO)
    }

    try {
      const data = await chamarPromeia<{ corrected: string }>(
        '/llm/proofread',
        { text: corpo.text, careful: corpo.careful === true },
        cfg,
      )
      return okJson({ corrected: data.corrected })
    } catch (err) {
      return traduzirFalha(err)
    }
  },
)

atelierRoutes.post('/llm/refine', requireAdmin<AuthBindings>(), async (c) => {
  const cfg = promeiaConfigurado(c.env)
  if (cfg === null) return errJson(503, 'promeia_disabled', MSG_DESLIGADO)

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
    const data = await chamarPromeia<{ refined: string }>(
      '/llm/refine',
      {
        platform: typeof corpo.platform === 'string' ? corpo.platform : '',
        text: corpo.text,
        instruction:
          typeof corpo.instruction === 'string' ? corpo.instruction : '',
      },
      cfg,
    )
    return okJson({ refined: data.refined })
  } catch (err) {
    return traduzirFalha(err)
  }
})

export default atelierRoutes
