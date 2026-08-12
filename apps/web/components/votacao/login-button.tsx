'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@piluvitu/ui/button'
import { errorMessage, startGoogleLogin } from '@/lib/votacao/api-client'

export function LoginButton() {
  const [carregando, setCarregando] = useState(false)

  async function handleClick() {
    setCarregando(true)
    try {
      await startGoogleLogin()
      // Sucesso navega pra fora da página (Google) — não há o que resetar aqui.
    } catch (err) {
      toast.error(errorMessage(err))
      setCarregando(false)
    }
  }

  return (
    <Button type="button" onClick={handleClick} disabled={carregando}>
      {carregando ? 'Entrando…' : 'Entrar com Google'}
    </Button>
  )
}
