'use client'
import { Button } from '@piluvitu/ui/button'
import { loginHref } from '@/lib/votacao/api-client'

export function LoginButton() {
  return (
    <Button asChild>
      <a href={loginHref}>Entrar com Google</a>
    </Button>
  )
}
