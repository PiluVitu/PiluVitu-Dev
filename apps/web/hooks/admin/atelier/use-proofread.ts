'use client'

import { useMutation } from '@tanstack/react-query'
import { atelierApi } from '@/lib/admin/atelier/api'

export function useProofread() {
  return useMutation({
    mutationFn: (v: { text: string }) => atelierApi.proofread(v.text),
  })
}
