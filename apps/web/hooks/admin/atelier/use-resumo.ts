'use client'

import { useMutation } from '@tanstack/react-query'
import { atelierApi } from '@/lib/admin/atelier/api'

export function useResumo() {
  return useMutation({
    mutationFn: (v: { title: string; body: string }) =>
      atelierApi.resumo(v.title, v.body),
  })
}
