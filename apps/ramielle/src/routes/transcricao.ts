/**
 * `POST /admin/transcrever` — repassa N áudios ao Whisper do promeia e
 * devolve o texto no envelope. Só admin: é a GPU do dono.
 */
import { Hono } from 'hono'
import type { AuthBindings } from '../lib/auth'
import { errJson, okJson } from '../lib/envelope'
import {
  chamarPromeia,
  promeiaConfigurado,
  traduzirFalhaPromeia,
} from '../lib/promeia'
import { requireAdmin, type SessionVariables } from '../lib/session'

type Env = {
  Bindings: AuthBindings
  Variables: SessionVariables
}

export type Transcricao = {
  partes: { nome: string; texto: string }[]
  texto: string
  modelo: string
}

// Espelham `MAX_AUDIOS`/`MAX_BYTES_TOTAL` de `apps/promeia/.../transcricao.py`.
export const MAX_AUDIOS = 10
export const MAX_BYTES_TOTAL = 40 * 1024 * 1024

const CAMPOS_REPASSADOS = ['termos', 'idioma', 'modo'] as const

const MSG_DESLIGADO =
  'A transcrição está desligada — configure PROMEIA_URL e PROMEIA_TOKEN.'
const MSG_SEM_AUDIO = "Envie ao menos um áudio em 'audios'."

const transcricaoRoutes = new Hono<Env>()

transcricaoRoutes.post(
  '/transcrever',
  requireAdmin<AuthBindings>(),
  async (c) => {
    const cfg = promeiaConfigurado(c.env)
    if (cfg === null) return errJson(503, 'promeia_disabled', MSG_DESLIGADO)

    let entrada: FormData
    try {
      entrada = await c.req.formData()
    } catch {
      return errJson(400, 'invalid_body', MSG_SEM_AUDIO)
    }

    const audios = entrada
      .getAll('audios')
      .filter((v): v is File => v instanceof File)
    if (audios.length === 0) {
      return errJson(400, 'invalid_body', MSG_SEM_AUDIO)
    }
    if (audios.length > MAX_AUDIOS) {
      return errJson(
        400,
        'too_many_files',
        `No máximo ${MAX_AUDIOS} áudios por vez — vieram ${audios.length}.`,
      )
    }
    const total = audios.reduce((soma, a) => soma + a.size, 0)
    if (total > MAX_BYTES_TOTAL) {
      const limiteMb = MAX_BYTES_TOTAL / (1024 * 1024)
      return errJson(
        413,
        'audio_too_large',
        `Os áudios somam mais que o limite de ${limiteMb} MB.`,
      )
    }

    const saida = new FormData()
    for (const a of audios) saida.append('audios', a, a.name)
    for (const campo of CAMPOS_REPASSADOS) {
      const valor = entrada.get(campo)
      if (typeof valor === 'string') saida.append(campo, valor)
    }

    try {
      const data = await chamarPromeia<Transcricao>('/transcrever', saida, cfg)
      return okJson(data)
    } catch (err) {
      return traduzirFalhaPromeia(err)
    }
  },
)

export default transcricaoRoutes
