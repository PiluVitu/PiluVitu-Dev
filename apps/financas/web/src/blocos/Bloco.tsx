import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { Skeleton } from '@piluvitu/ui/skeleton'

export type BlocoProps = {
  titulo: string
  /**
   * Ícone de ajuda (`@piluvitu/ui/ajuda`) ao lado do título — só quando um
   * dos 7 pontos do §3.2 do spec de ajuda contextual pede (Task 5,
   * `docs/superpowers/specs/2026-07-27-financas-excluir-e-ajuda-design.md`).
   * Hoje só `BlocoComprometido` passa isto; os outros blocos (Saldos,
   * Dívidas, Categorias) continuam sem — `undefined` não renderiza nada.
   */
  ajuda?: ReactNode
  /** `true` enquanto o bloco busca seus próprios dados. */
  carregando?: boolean
  /**
   * Mensagem de erro do bloco. Renderiza DENTRO deste card (`role="alert"`)
   * e NÃO propaga — um bloco em erro não pode derrubar os outros blocos da
   * home (ver Bloco.test.tsx e a Task 7, que prova isso no nível da home).
   */
  erro?: string | null
  /** `true` quando a busca teve sucesso mas não há nada pra mostrar. */
  vazio?: boolean
  vazioMensagem?: string
  children?: ReactNode
}

/**
 * Casca compartilhada pelos blocos da home (`BlocoComprometido` aqui,
 * Tasks 7/8 os outros três): card do design system + título + os quatro
 * estados — carregando / erro / vazio / conteúdo, nessa ordem de
 * prioridade (erro vence mesmo que `carregando`/`vazio` também estejam
 * `true` — não deveria acontecer na prática, mas erro é o estado mais
 * informativo dos quatro).
 */
export function Bloco({
  titulo,
  ajuda,
  carregando = false,
  erro = null,
  vazio = false,
  vazioMensagem = 'Nada por aqui ainda.',
  children,
}: BlocoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {titulo}
          {ajuda}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {erro ? (
          <p role="alert">{erro}</p>
        ) : carregando ? (
          <div aria-busy="true" className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : vazio ? (
          <p className="text-muted-foreground text-sm">{vazioMensagem}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}
