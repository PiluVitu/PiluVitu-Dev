'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { atelierApi } from '@/lib/admin/atelier/api'
import type { ProposalsBody, SelectedTarget } from '@/lib/admin/atelier/types'

export function useDistribution(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: ['distribution', slug],
    queryFn: () => atelierApi.getDistribution(slug),
    enabled,
  })
}

export function useBuildProposals() {
  return useMutation({
    mutationFn: (body: ProposalsBody) => atelierApi.proposals(body),
  })
}

export function useRefineHook() {
  return useMutation({
    mutationFn: (v: { platform: string; text: string; instruction: string }) =>
      atelierApi.refine(v.platform, v.text, v.instruction),
  })
}

export function usePublishDistribution(slug: string) {
  return useMutation({
    mutationFn: (targets: SelectedTarget[]) =>
      atelierApi.publish(slug, targets),
  })
}
