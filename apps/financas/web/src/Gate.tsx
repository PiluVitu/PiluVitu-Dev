import type { ReactNode } from 'react'
import { signIn, useSession } from './auth-client'

export function mensagemDeErro(codigo: string | null): string | null {
  if (codigo === null) return null
  if (codigo === 'nao_autorizado')
    return 'Esta conta do Google não tem acesso a este aplicativo.'
  return `Não foi possível entrar (${codigo}).`
}

export function Gate({ children }: { children: ReactNode }) {
  const { data: sessao, isPending } = useSession()

  // A ORDEM É A GUARDA. isPending PRIMEIRO: o primeiro render é sempre
  // pending. Testar !sessao antes pisca a tela de login pra quem já está
  // logado.
  if (isPending) return <p aria-busy="true">carregando…</p>

  // Gate por !sessao, NUNCA por error: um blip de rede (erro que não é
  // 401) preserva o data anterior no átomo — derrubar por error
  // deslogaria o dono à toa.
  if (!sessao) {
    const erro = mensagemDeErro(
      new URLSearchParams(window.location.search).get('error'),
    )
    return (
      <main>
        <h1>Finanças</h1>
        {erro !== null && <p role="alert">{erro}</p>}
        <button
          onClick={() =>
            signIn.social({
              provider: 'google',
              callbackURL: '/',
              // PATH, não hash: o redirect de erro monta
              // `${errorURL}?error=…` — com '/#/login' a query cairia
              // dentro do hash e location.search ficaria vazio.
              errorCallbackURL: '/login',
            })
          }
        >
          Entrar com Google
        </button>
      </main>
    )
  }

  return <>{children}</>
}
