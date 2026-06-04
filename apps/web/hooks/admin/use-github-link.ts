'use client'

import { useQuery } from '@tanstack/react-query'

export interface GithubLinkStatus {
  linked: boolean
  login: string | null
}

export function useGithubLink() {
  return useQuery({
    queryKey: ['admin', 'github-status'],
    queryFn: async (): Promise<GithubLinkStatus> => {
      const res = await fetch('/api/admin/github/status')
      if (!res.ok) throw new Error('github status failed')
      return res.json()
    },
    staleTime: 30_000,
  })
}
