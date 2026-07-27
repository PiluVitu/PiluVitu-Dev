import { lazy, Suspense, useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { api, ApiError } from '../api'
import { competenciaAtual } from '../lib/dates'
import { rotuloCompetencia } from '../lib/commitments'
import type { ByCategoryReportView } from '../lib/categories'
import { Bloco } from './Bloco'

// Mesmo chunk lazy de `GraficoComprometido.tsx` (Task 6) — NÃO um segundo
// `import()` de `recharts`. `GraficoCategorias` é uma exportação NOMEADA
// desse mesmo arquivo (ver o comentário lá pro motivo completo); resolver
// este `import()` carrega o MESMO chunk físico que `BlocoComprometido.tsx`
// já carrega sob demanda, então o custo de ~104 KB gzip do `recharts` é
// pago uma vez só, não duas.
const GraficoCategorias = lazy(() =>
  import('./GraficoComprometido').then((m) => ({
    default: m.GraficoCategorias,
  })),
)

/**
 * "Para onde foi o dinheiro" — a pergunta que o dono deu quando perguntado
 * qual pergunta este módulo tinha que responder (ver brief da Task 8).
 * Quarto e último bloco da home. Autônomo como os outros três, mas com uma
 * diferença: tem um parâmetro que o USUÁRIO controla (o mês) — os outros
 * três não têm controle nenhum.
 *
 * Mês default = mês corrente via `competenciaAtual()` (`todayInTeresina()`
 * por baixo, NUNCA `new Date().toISOString()` cru — ver `lib/dates.ts` e o
 * bug real que motivou essa regra, documentado lá).
 *
 * ⚠️ Trocar de mês NÃO zera `report` — o card não volta pro skeleton de
 * carregamento a cada troca (ficaria piscando a cada clique no seletor).
 * O `report` antigo continua visível até o novo chegar; o `useEffect` com
 * a flag `vivo` (mesmo padrão dos outros blocos) já ignora uma resposta
 * antiga que resolva DEPOIS de o usuário já ter trocado de mês de novo —
 * sem isso, uma resposta lenta do mês anterior poderia sobrescrever o mês
 * mais recente que o usuário já está vendo.
 */
export function BlocoCategorias() {
  const [mes, setMes] = useState(() => competenciaAtual())
  const [report, setReport] = useState<ByCategoryReportView | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api<ByCategoryReportView>(`/api/reports/by-category?competence=${mes}`)
      .then((data) => {
        if (vivo) {
          setReport(data)
          setErro(null)
        }
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [mes])

  // `report === null` só antes do PRIMEIRO carregamento — ver o comentário
  // acima sobre por que trocar de mês não zera `report`.
  const carregando = report === null && erro === null
  const vazio = report !== null && report.rows.length === 0

  return (
    <Bloco
      titulo="Para onde foi o dinheiro"
      carregando={carregando}
      erro={erro}
    >
      {report ? (
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            {/* `<label>` nativo (nesting, sem `htmlFor`/`id`) — mesmo padrão
                de `new-entry.tsx`/`NovoItemForm.tsx`/`DividasPage.tsx` pros
                campos de data. O `<input>` recebe as classes do componente
                `Input` de `@piluvitu/ui` (Tailwind, tokens do design
                system) copiadas à mão em vez de importar o componente:
                `Input`/`Label` reais puxariam `@radix-ui/react-label` pro
                bundle PRINCIPAL (este bloco não é lazy, só o gráfico é) por
                um wrapper decorativo — peso novo sem ganho real, quando um
                `<label>` nativo já é o padrão usado pelos OUTROS blocos e
                telas deste app (ver BlocoSaldos.tsx, que fez a mesma
                escolha pro link "Criar conta": Tailwind direto, não um
                componente novo de `@piluvitu/ui`). */}
            <label className="text-sm font-medium">
              Mês
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="border-input focus-visible:ring-ring mt-1 flex h-9 w-full max-w-40 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-hidden"
              />
            </label>
            <span
              data-testid="total-gasto"
              className="text-sm font-semibold whitespace-nowrap"
            >
              {formatBRL(Math.abs(report.total_cents))}
            </span>
          </div>
          {vazio ? (
            <p className="text-muted-foreground text-sm">
              Nenhum gasto em {rotuloCompetencia(mes)}.
            </p>
          ) : (
            <Suspense fallback={<div aria-busy="true" />}>
              <GraficoCategorias report={report} />
            </Suspense>
          )}
        </div>
      ) : null}
    </Bloco>
  )
}
