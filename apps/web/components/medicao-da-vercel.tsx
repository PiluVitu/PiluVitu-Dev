import { MedicaoForaDaVotacao } from './medicao-da-vercel-cliente'

export function MedicaoDaVercel({
  ambiente = process.env.VERCEL_ENV,
  rascunho = false,
}: {
  ambiente?: string
  rascunho?: boolean
}) {
  if (ambiente !== 'production' || rascunho) return null
  return <MedicaoForaDaVotacao />
}
