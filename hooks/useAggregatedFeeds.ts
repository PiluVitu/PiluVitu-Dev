import { useQuery } from '@tanstack/react-query'
import type { AggregatedFeedsResponse } from '@/mocks/feeds'

async function fetchAggregatedFeeds(): Promise<AggregatedFeedsResponse> {
  const res = await fetch('/api/feeds')
  if (!res.ok) throw new Error('Failed to fetch feeds')
  return res.json() as Promise<AggregatedFeedsResponse>
}

export function useAggregatedFeeds() {
  return useQuery({
    queryKey: ['aggregated-feeds'],
    queryFn: fetchAggregatedFeeds,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
