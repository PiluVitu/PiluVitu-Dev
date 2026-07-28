import type { ReactNode } from 'react'
import { Button } from '@piluvitu/ui/button'
import { signIn, useSession } from './auth-client'

export function mensagemDeErro(codigo: string | null): string | null {
  if (codigo === null) return null
  if (codigo === 'nao_autorizado')
    return 'Esta conta do Google não tem acesso a este aplicativo.'
  return `Não foi possível entrar (${codigo}).`
}

export function Gate({ children }: { children: ReactNode }) {
  const { data: sessao, isPending, error } = useSession()

  // A ORDEM É A GUARDA. isPending PRIMEIRO: o primeiro render é sempre
  // pending. Testar !sessao antes pisca a tela de login pra quem já está
  // logado.
  if (isPending)
    return (
      <p aria-busy="true" className="p-4">
        carregando…
      </p>
    )

  // Gate por !sessao, NUNCA por error: um blip de rede (erro que não é
  // 401) preserva o data anterior no átomo — derrubar por error
  // deslogaria o dono à toa. `error` só é usado ABAIXO, pra distinguir a
  // MENSAGEM mostrada quando já não há sessão — nunca pra decidir SE
  // mostra a tela de login.
  if (!sessao) {
    const erro = mensagemDeErro(
      new URLSearchParams(window.location.search).get('error'),
    )
    return (
      <main className="mx-auto max-w-sm space-y-4 p-4">
        <h1 className="text-2xl font-semibold tracking-tight">Finanças</h1>
        {erro !== null && (
          <p role="alert" className="text-destructive text-sm">
            {erro}
          </p>
        )}
        {/* Aditivo, não substitui o gate: sem sessão + error presente é
            "não consegui checar" (503, rede fora) — visualmente idêntico
            a "você não está logado" sem isto, o que confunde o dono numa
            falha real de verificação com o estado normal de deslogado. */}
        {error !== null && (
          <p role="alert" className="text-destructive text-sm">
            Não consegui verificar sua sessão. Tente novamente.
          </p>
        )}
        <Button
          onClick={() =>
            signIn.social({
              provider: 'google',
              // Preserva a rota atual (hash) no round trip: sem isso, um
              // login feito em qualquer tela que não seja a inicial volta
              // pra #/contas (default de useHash()) depois do callback do
              // Google, porque o Better Auth navega pra callbackURL SEM
              // hash nenhum — Gate nunca toca o hash, então a URL ainda
              // lia a tela certa até este clique.
              callbackURL: `/${window.location.hash}`,
              // PATH, não hash: o redirect de erro monta
              // `${errorURL}?error=…` — com '/#/login' a query cairia
              // dentro do hash e location.search ficaria vazio.
              errorCallbackURL: '/login',
            })
          }
        >
          Entrar com Google
        </Button>
      </main>
    )
  }

  return <>{children}</>
}
