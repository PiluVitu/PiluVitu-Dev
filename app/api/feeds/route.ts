import { aggregateFeeds } from '@/lib/feed-aggregator'
import { NextResponse } from 'next/server'

export const revalidate = 1800

export async function GET() {
  const data = await aggregateFeeds()
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 's-maxage=1800, stale-while-revalidate=600',
    },
  })
}
