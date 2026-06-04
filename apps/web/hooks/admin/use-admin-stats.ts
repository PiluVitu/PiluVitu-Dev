'use client'

import { useQuery } from '@tanstack/react-query'
import type { AdminStats } from '@/app/api/admin/stats/route'

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async (): Promise<AdminStats> => {
      const res = await fetch('/api/admin/stats')
      if (!res.ok) throw new Error('admin stats failed')
      return res.json()
    },
    staleTime: 30_000,
  })
}
