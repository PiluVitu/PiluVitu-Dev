import { ApiError } from '@/lib/votacao/api-client'
import type { JobTranscricao, Transcricao } from '@/lib/admin/atelier/types'

export const CHAVE_JOB = 'piluvitu:transcricao:job'
export const INTERVALO_MS = 2500
const ID_JOB = /^[0-9a-f]{32}$/

function idValido(id: unknown): id is string {
  return typeof id === 'string' && ID_JOB.test(id)
}

const assinantes = new Set<() => void>()

function avisarAssinantes() {
  for (const fn of assinantes) fn()
}

export function assinarJobGuardado(aoMudar: () => void): () => void {
  const deOutraAba = (e: StorageEvent) => {
    if (e.key === CHAVE_JOB || e.key === null) aoMudar()
  }
  assinantes.add(aoMudar)
  window.addEventListener('storage', deOutraAba)
  return () => {
    assinantes.delete(aoMudar)
    window.removeEventListener('storage', deOutraAba)
  }
}

export function lerJobGuardado(storage: Storage): string | null {
  try {
    const id = storage.getItem(CHAVE_JOB)
    return idValido(id) ? id : null
  } catch {
    return null
  }
}

export function guardarJob(storage: Storage, id: string): void {
  if (!idValido(id)) return
  try {
    storage.setItem(CHAVE_JOB, id)
  } catch {}
  avisarAssinantes()
}

export function limparJob(storage: Storage): void {
  try {
    storage.removeItem(CHAVE_JOB)
  } catch {}
  avisarAssinantes()
}

export const ERRO_RESPOSTA_SEM_ID =
  'O servidor respondeu sem o id da transcrição (deploy em andamento?). Tente de novo em alguns minutos.'

export function respostaDoPost(
  resposta: unknown,
): { job: JobTranscricao } | { erro: string } {
  const r = (resposta ?? {}) as Partial<JobTranscricao> & Partial<Transcricao>
  if (idValido(r.id)) return { job: r as JobTranscricao }
  if (typeof r.texto === 'string') {
    const resultado = resposta as Transcricao
    const agora = new Date().toISOString()
    return {
      job: {
        id: '',
        status: 'pronto',
        posicao: null,
        parte_atual: resultado.partes?.length ?? 0,
        total_partes: resultado.partes?.length ?? 0,
        nome_atual: null,
        modelo: resultado.modelo ?? '',
        criado_em: agora,
        atualizado_em: agora,
        resultado,
        erro: null,
      },
    }
  }
  return { erro: ERRO_RESPOSTA_SEM_ID }
}

export function jobTerminou(job: JobTranscricao): boolean {
  return job.status === 'pronto' || job.status === 'falhou'
}

export function progressoDoJob(job: JobTranscricao): {
  percentual: number
  rotulo: string
} {
  const total = job.total_partes
  const percentual =
    job.status === 'pronto'
      ? 100
      : total > 0
        ? Math.floor((Math.min(job.parte_atual, total) / total) * 100)
        : 0

  if (job.status === 'na_fila') {
    return {
      percentual,
      rotulo: job.posicao ? `Na fila — posição ${job.posicao}` : 'Na fila',
    }
  }
  if (job.status === 'transcrevendo') {
    const parte = Math.max(1, Math.min(job.parte_atual + 1, total))
    const nome = job.nome_atual ? ` — ${job.nome_atual}` : ''
    return {
      percentual,
      rotulo: `Transcrevendo parte ${parte} de ${total}${nome}`,
    }
  }
  if (job.status === 'pronto') return { percentual, rotulo: 'Pronto' }
  return { percentual, rotulo: 'Falhou' }
}

export interface PerdaDoJob {
  code?: string
  message: string
}

// 4xx do GET é definitivo (job sumiu, sessão caiu); rede e 5xx são
// passageiros e não podem fazer a tela esquecer um job que segue rodando.
function definitivo(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status >= 400 && e.status < 500
}

export function acompanharJob(opts: {
  id: string
  buscar: (id: string) => Promise<JobTranscricao>
  aoAtualizar: (job: JobTranscricao) => void
  aoAvisar: (aviso: string | null) => void
  aoPerder: (perda: PerdaDoJob) => void
  intervaloMs?: number
}): () => void {
  const intervalo = opts.intervaloMs ?? INTERVALO_MS
  let ativo = true
  let timer: ReturnType<typeof setTimeout> | undefined

  const proxima = () => {
    if (ativo) timer = setTimeout(consultar, intervalo)
  }

  async function consultar() {
    try {
      const job = await opts.buscar(opts.id)
      if (!ativo) return
      opts.aoAvisar(null)
      opts.aoAtualizar(job)
      if (!jobTerminou(job)) proxima()
    } catch (e) {
      if (!ativo) return
      if (definitivo(e)) {
        opts.aoPerder({ code: e.code, message: e.message })
        return
      }
      opts.aoAvisar('Sem resposta do servidor — tentando de novo…')
      proxima()
    }
  }

  timer = setTimeout(consultar, 0)
  return () => {
    ativo = false
    clearTimeout(timer)
  }
}
