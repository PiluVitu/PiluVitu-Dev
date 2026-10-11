import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

export function MedicaoDaVercel({
  ambiente = process.env.VERCEL_ENV,
}: {
  ambiente?: string
}) {
  if (ambiente !== 'production') return null
  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  )
}
