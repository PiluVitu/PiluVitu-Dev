import { apiBase, ApiError, type ApiEnvelope } from '@/lib/votacao/api-client'
import type {
  DistributionTarget,
  ModoTranscricao,
  ProposalsBody,
  SelectedTarget,
  Transcricao,
} from './types'

/**
 * Base do Atelier — DELIBERADAMENTE separada do `apiBase` da votação.
 *
 * A votação vai ser repontada pro ramielle na Task 2 desta fatia ④; o
 * Atelier NÃO — é desacoplado agora, antes disso, exatamente pra essa troca
 * não arrastá-lo junto. As 5 rotas dele (`/admin/llm/*`,
 * `/admin/distribution/*`) só existem na Go e estão previstas pro promeia
 * (spec §7.2), que ainda não existe.
 *
 * ⚠️ Se um dia isto voltar a apontar pro mesmo host da votação, o card
 * "Distribuição" volta a renderizar VAZIO SEM ERRO em todo post existente
 * (`useDistribution` dispara no mount, `retry` default = 3 ⇒ 4 requisições
 * falhas por post, e nada lê `isError`) — um post com distribuição salva
 * passa a parecer que nunca teve. Medido em 2026-08-12.
 */
export const atelierBase =
  process.env.NEXT_PUBLIC_ATELIER_URL ?? 'http://localhost:8080'

async function call<T>(
  path: string,
  init?: RequestInit,
  base = atelierBase,
): Promise<T> {
  // Com FormData o navegador gera o Content-Type com o boundary; forçar JSON
  // faria o servidor não achar arquivo nenhum.
  const multipart = init?.body instanceof FormData
  const res = await fetch(`${base}${path}`, {
    credentials: 'include',
    headers: multipart
      ? init?.headers
      : { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  let env: ApiEnvelope<T> | null = null
  if (res.status !== 204) {
    env = (await res.json().catch(() => null)) as ApiEnvelope<T> | null
  }
  if (!res.ok) {
    const notifications = env?.notifications ?? [
      { type: 'error' as const, message: `${res.status} ${res.statusText}` },
    ]
    throw new ApiError(res.status, notifications)
  }
  return (env?.data ?? undefined) as T
}

export const atelierApi = {
  proofread: (text: string, careful = false) =>
    call<{ corrected: string }>('/admin/llm/proofread', {
      method: 'POST',
      body: JSON.stringify({ text, careful }),
    }),
  refine: (platform: string, text: string, instruction: string) =>
    call<{ refined: string }>('/admin/llm/refine', {
      method: 'POST',
      body: JSON.stringify({ platform, text, instruction }),
    }),
  proposals: (body: ProposalsBody) =>
    call<{ targets: DistributionTarget[] }>('/admin/distribution/proposals', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getDistribution: (slug: string) =>
    call<{ targets: DistributionTarget[] }>(
      `/admin/distribution/${encodeURIComponent(slug)}`,
    ),
  publish: (slug: string, targets: SelectedTarget[]) =>
    call<{ targets: DistributionTarget[] }>(
      `/admin/distribution/${encodeURIComponent(slug)}/publish`,
      { method: 'POST', body: JSON.stringify({ targets }) },
    ),
  transcrever: (
    audios: File[],
    opts: { termos: string; modo: ModoTranscricao },
  ) => {
    const form = new FormData()
    for (const a of audios) form.append('audios', a, a.name)
    if (opts.termos.trim()) form.append('termos', opts.termos.trim())
    form.append('modo', opts.modo)
    // Só existe no ramielle; `atelierBase` segue na Go até o cutover do Atelier.
    return call<Transcricao>(
      '/admin/transcrever',
      { method: 'POST', body: form },
      apiBase,
    )
  },
}
