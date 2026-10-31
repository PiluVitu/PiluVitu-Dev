/**
 * Transcrição como job assíncrono no promeia. `POST /admin/transcrever`
 * repassa os áudios e devolve 202 com o JOB; `GET /admin/transcrever/:id`
 * devolve o andamento. Só admin: é a GPU do dono.
 */
import { Hono } from 'hono'
import type { AuthBindings } from '../lib/auth'
import { errJson, okJson } from '../lib/envelope'
import {
  chamarPromeia,
  PromeiaRecusou,
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

export type StatusJob = 'na_fila' | 'transcrevendo' | 'pronto' | 'falhou'

export type JobTranscricao = {
  id: string
  status: StatusJob
  posicao: number | null
  parte_atual: number
  total_partes: number
  nome_atual: string | null
  modelo: string
  criado_em: string
  atualizado_em: string
  resultado: Transcricao | null
  erro: { code: string; message: string } | null
}

// Mesmo formato que o promeia valida antes de tocar no disco.
export const ID_JOB = /^[0-9a-f]{32}$/

// Os dois abaixo do corte de ~100 s da Cloudflare: passar dele faz o túnel
// derrubar o request e o dono ler "Suba o promeia" com o promeia de pé.
export const TIMEOUT_ENVIO_MS = 60_000
export const TIMEOUT_STATUS_MS = 15_000

// Espelham `MAX_AUDIOS`/`MAX_BYTES_TOTAL` de `apps/promeia/.../transcricao.py`.
export const MAX_AUDIOS = 10
export const MAX_BYTES_TOTAL = 40 * 1024 * 1024

const CAMPOS_REPASSADOS = ['termos', 'idioma', 'modo'] as const

const MSG_DESLIGADO =
  'A transcrição está desligada — configure PROMEIA_URL e PROMEIA_TOKEN.'
const MSG_SEM_AUDIO = "Envie ao menos um áudio em 'audios'."
const MSG_JOB_NAO_ENCONTRADO =
  'Transcrição não encontrada — ela pode ter expirado.'

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
      const job = await chamarPromeia<JobTranscricao>(
        '/transcrever',
        saida,
        cfg,
        { timeoutMs: TIMEOUT_ENVIO_MS },
      )
      return okJson(job, 202)
    } catch (err) {
      return traduzirFalhaPromeia(err)
    }
  },
)

transcricaoRoutes.get(
  '/transcrever/:id',
  requireAdmin<AuthBindings>(),
  async (c) => {
    const cfg = promeiaConfigurado(c.env)
    if (cfg === null) return errJson(503, 'promeia_disabled', MSG_DESLIGADO)

    const id = c.req.param('id')
    if (!ID_JOB.test(id)) {
      return errJson(404, 'job_not_found', MSG_JOB_NAO_ENCONTRADO)
    }

    try {
      const job = await chamarPromeia<JobTranscricao>(
        `/transcrever/${id}`,
        undefined,
        cfg,
        { method: 'GET', timeoutMs: TIMEOUT_STATUS_MS },
      )
      return okJson(job)
    } catch (err) {
      if (
        err instanceof PromeiaRecusou &&
        err.status === 404 &&
        err.code === 'job_not_found'
      ) {
        return errJson(404, err.code, err.message)
      }
      return traduzirFalhaPromeia(err)
    }
  },
)

export default transcricaoRoutes
