'use client'

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faGoogle } from '@fortawesome/free-brands-svg-icons'
import { faKey } from '@fortawesome/free-solid-svg-icons'
import { errorMessage, startGoogleLogin } from '@/lib/votacao/api-client'

interface AdminLoginScreenProps {
  /** Dispara o login (default = fluxo real do Google via Better Auth). Override em stories/testes. */
  onLogin?: () => void | Promise<void>
  /** Entra com uma passkey já cadastrada. Sem ele, a tela mostra só o Google. */
  onPasskeyLogin?: () => Promise<void>
  passkeySuportado?: boolean
}

type Metodo = 'google' | 'passkey'

/**
 * Tela mostrada pelo gate do /admin quando o usuário NÃO está autenticado
 * (sessão ausente → /auth/me 401). Oferece o login com Google e, como segundo
 * caminho, a passkey. Componente puro (ações por prop).
 */
export function AdminLoginScreen({
  onLogin,
  onPasskeyLogin,
  passkeySuportado = false,
}: AdminLoginScreenProps) {
  const [carregando, setCarregando] = useState<Metodo | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function entrar(metodo: Metodo, acao: () => void | Promise<void>) {
    setErro(null)
    setCarregando(metodo)
    try {
      await acao()
      if (metodo === 'passkey') setCarregando(null)
    } catch (err) {
      setErro(errorMessage(err))
      setCarregando(null)
    }
  }

  const ocupado = carregando !== null

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
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => entrar('google', onLogin ?? startGoogleLogin)}
            disabled={ocupado}
            className="bg-primary text-primary-foreground rounded-pill inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium disabled:opacity-60"
          >
            <FontAwesomeIcon icon={faGoogle} className="size-4" />
            {carregando === 'google' ? 'Entrando…' : 'Entrar com Google'}
          </button>
          {onPasskeyLogin && passkeySuportado ? (
            <button
              type="button"
              onClick={() => entrar('passkey', onPasskeyLogin)}
              disabled={ocupado}
              className="border-border text-foreground hover:bg-muted/40 rounded-pill inline-flex items-center gap-2 border px-5 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faKey} className="size-4" />
              {carregando === 'passkey' ? 'Entrando…' : 'Entrar com passkey'}
            </button>
          ) : null}
        </div>
        {onPasskeyLogin && !passkeySuportado ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Este navegador não suporta passkeys. Use o Google.
          </p>
        ) : null}
        {erro !== null && (
          <p role="alert" className="text-destructive mt-4 text-sm">
            {erro}
          </p>
        )}
        <p className="text-muted-foreground mt-4 text-xs">
          Acesso restrito a administradores.
        </p>
      </div>
    </main>
  )
}
