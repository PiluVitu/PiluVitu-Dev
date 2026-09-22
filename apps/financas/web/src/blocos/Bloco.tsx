import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { Skeleton } from '@piluvitu/ui/skeleton'
import { CARTAO_SECAO } from '../lib/superficie'
import { ROTULO } from '../lib/tipografia'

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
  /**
   * A segunda linha do cabeçalho (15px/600) — o recorte que o título não
   * diz: a competência olhada, o escopo somado. O título nomeia o bloco, esta
   * linha diz DE QUE ele está falando.
   */
  descricao?: ReactNode
  /**
   * Controle no canto superior direito do cartão (o seletor de mês de
   * `BlocoCategorias`). Fica ao lado da `ajuda`, nunca no lugar dela.
   */
  acao?: ReactNode
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
  descricao,
  acao,
  carregando = false,
  erro = null,
  vazio = false,
  vazioMensagem = 'Nada por aqui ainda.',
  children,
}: BlocoProps) {
  return (
    <Card className={CARTAO_SECAO}>
      {/*
       * ⚠️ `p-4 sm:p-6`, não o `p-6` que o design system traz por default.
       * MEDIDO em Chrome real a 390×844: o shell já tira 32px, então `p-6`
       * (24 de cada lado) deixa **308px** de caixa útil por card; `p-4` (16)
       * deixa **324px** — **+16px por card**, exatamente onde o número
       * aperta. De `sm` pra cima volta a 24, o respiro certo quando há espaço.
       *
       * Aplicado AQUI e não tela a tela: este é o wrapper dos quatro blocos da
       * home, o único lugar do app com grid de cards. Tela a tela seriam ~16
       * cópias do mesmo literal (a classe de cópia que diverge) por um ganho
       * muito menor: uma tela de coluna única já cabe (`R$ 21.122,50` a 30px
       * mede 195,3px contra 308 úteis). O `NumeroCard` carrega a mesma regra
       * por conta própria, pelo mesmo motivo — um lugar por primitivo.
       */}
      <CardHeader className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-0 space-y-1.5">
            <CardTitle className={cn(ROTULO, 'leading-none')}>
              {titulo}
            </CardTitle>
            {descricao ? (
              <p className="text-[15px] leading-tight font-semibold">
                {descricao}
              </p>
            ) : null}
          </div>
          {ajuda || acao ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {acao}
              {ajuda}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
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
