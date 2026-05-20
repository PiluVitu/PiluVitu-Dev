'use client'
import { Button } from '@/components/ui/button'
import { useQueryClient } from '@tanstack/react-query'
import { votacaoApi } from '@/lib/votacao/api-client'

export function LogoutButton() {
  const qc = useQueryClient()
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await votacaoApi.logout().catch(() => null)
        qc.clear()
        window.location.reload()
      }}
    >
      Sair
    </Button>
  )
}
