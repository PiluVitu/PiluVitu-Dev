'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@piluvitu/ui/button'
import { errorMessage, startGoogleLogin } from '@/lib/votacao/api-client'

interface LoginButtonProps {
  /**
   * Dispara o login (default = fluxo real do Google via Better Auth).
   * Override em stories/testes — mesma costura injetável do `onLogin` de
   * `AdminLoginScreen` (M4, fix round 1: os dois componentes ficam
   * simétricos, e os estados de carregando/erro passam a ser exercitáveis
   * sem depender de rede).
   */
  onLogin?: () => void | Promise<void>
}

export function LoginButton({ onLogin }: LoginButtonProps) {
  const [carregando, setCarregando] = useState(false)

  async function handleClick() {
    setCarregando(true)
    try {
      await (onLogin ?? startGoogleLogin)()
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
