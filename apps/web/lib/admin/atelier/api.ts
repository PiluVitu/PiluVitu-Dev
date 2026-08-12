import { ApiError, type ApiEnvelope } from '@/lib/votacao/api-client'
import type { DistributionTarget, ProposalsBody, SelectedTarget } from './types'

/**
 * Base do Atelier — DELIBERADAMENTE separada do `apiBase` da votação.
 *
 * A votação foi repontada pro ramielle (fatia ④); o Atelier NÃO, porque as 5
 * rotas dele (`/admin/llm/*`, `/admin/distribution/*`) só existem na Go e
 * estão previstas pro promeia (spec §7.2), que ainda não existe.
 *
 * ⚠️ Se um dia isto voltar a apontar pro mesmo host da votação, o card
 * "Distribuição" volta a renderizar VAZIO SEM ERRO em todo post existente
 * (`useDistribution` dispara no mount, `retry` default = 3 ⇒ 4 requisições
 * falhas por post, e nada lê `isError`) — um post com distribuição salva
 * passa a parecer que nunca teve. Medido em 2026-08-12.
 */
export const atelierBase =
  process.env.NEXT_PUBLIC_ATELIER_URL ?? 'http://localhost:8080'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${atelierBase}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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
}
