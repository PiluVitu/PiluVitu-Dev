import { redirect } from 'next/navigation'

// O painel admin migrou pro shell unificado /admin/sessoes (slice ⑤).
// Mantemos esta rota viva como redirect pra bookmarks/links antigos.
export default function VotacaoAdminRedirect() {
  redirect('/admin/sessoes')
}
