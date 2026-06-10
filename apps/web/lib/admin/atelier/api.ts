import { apiBase, ApiError, type ApiEnvelope } from '@/lib/votacao/api-client'
import type { DistributionTarget, ProposalsBody, SelectedTarget } from './types'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
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
  proofread: (text: string) =>
    call<{ corrected: string }>('/admin/llm/proofread', {
      method: 'POST',
      body: JSON.stringify({ text }),
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
