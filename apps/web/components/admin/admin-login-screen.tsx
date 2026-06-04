'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGoogle } from '@fortawesome/free-brands-svg-icons'
import { loginHref } from '@/lib/votacao/api-client'

interface AdminLoginScreenProps {
  /** Destino do login (default = endpoint Google da API). Override em stories. */
  href?: string
}

/**
 * Tela mostrada pelo gate do /admin quando o usuário NÃO está autenticado
 * (sessão Google ausente → /auth/me 401). Oferece o login com Google em vez de
 * deixar a área num beco sem saída. Componente puro (href por prop).
 */
export function AdminLoginScreen({ href = loginHref }: AdminLoginScreenProps) {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="border-border bg-card shadow-ds w-full max-w-sm rounded-[var(--radius)] border p-8 text-center">
        <div className="bg-primary text-primary-foreground mx-auto grid size-12 place-items-center rounded-full text-lg font-bold">
          P
        </div>
        <h1 className="mt-4 text-xl font-bold">Painel admin</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Entre com sua conta Google para gerenciar o conteúdo do
          piluvitu.com.br.
        </p>
        <a
          href={href}
          className="bg-primary text-primary-foreground rounded-pill mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
        >
          <FontAwesomeIcon icon={faGoogle} className="size-4" />
          Entrar com Google
        </a>
        <p className="text-muted-foreground mt-4 text-xs">
          Acesso restrito a administradores.
        </p>
      </div>
    </main>
  )
}
