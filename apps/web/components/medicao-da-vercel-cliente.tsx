'use client'

import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { foraDaVotacao } from '@/lib/medicao'

export function MedicaoForaDaVotacao() {
  return (
    <>
      <Analytics beforeSend={foraDaVotacao} />
      <SpeedInsights beforeSend={foraDaVotacao} />
    </>
  )
}
