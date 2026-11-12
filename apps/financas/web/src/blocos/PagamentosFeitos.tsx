import { useId } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Button } from '@piluvitu/ui/button'
import { rotuloCompetencia } from '../lib/commitments'
import { ROTULO, TITULO_LINHA, VALOR_LINHA } from '../lib/tipografia'
import { ALVO_LINHA } from '../lib/touch'

/** Shape de `GET /api/bills/payments` (Worker: pagamentos registrados). */
export type BillPaymentView = {
  transfer_id: string
  competence: string
  paid_on: string
  amount_cents: number
  line_count: number
  from_account_id: string
  from_account_name: string
}

export type PagamentosFeitosProps = {
  /** `null` enquanto carrega. */
  pagamentos: BillPaymentView[] | null
  erro: string | null
  desabilitado: boolean
  onDesfazer: (pagamento: BillPaymentView) => void
}

export function lancamentos(n: number): string {
  return n === 1 ? '1 lançamento' : `${n} lançamentos`
}

function dataBR(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function PagamentosFeitos({
  pagamentos,
  erro,
  desabilitado,
  onDesfazer,
}: PagamentosFeitosProps) {
  const tituloId = useId()

  if (erro === null && (pagamentos === null || pagamentos.length === 0)) {
    return null
  }

  return (
    <section
      aria-labelledby={tituloId}
      className="space-y-2 border-t pt-4"
      data-testid="pagamentos-feitos"
    >
      <h3 id={tituloId} className={ROTULO}>
        Pagamentos feitos
      </h3>

      {erro !== null ? (
        <p className="text-destructive text-sm" data-testid="pagamentos-erro">
          Não consegui carregar os pagamentos feitos: {erro}
        </p>
      ) : (
        <ul className="divide-y">
          {(pagamentos ?? []).map((p) => {
            const quando = rotuloCompetencia(p.competence)
            const quanto = formatBRL(p.amount_cents)
            return (
              <li
                key={p.transfer_id}
                className="space-y-1 py-3"
                data-testid={`pagamento-${p.transfer_id}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className={TITULO_LINHA}>Fatura de {quando}</span>
                  <span className={VALOR_LINHA}>{quanto}</span>
                </div>
                <p
                  className="text-muted-foreground text-xs"
                  data-testid={`pagamento-${p.transfer_id}-detalhe`}
                >
                  {`Pago em ${dataBR(p.paid_on)} · de "${p.from_account_name}" · ${lancamentos(p.line_count)}`}
                </p>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={ALVO_LINHA}
                    aria-label={`Desfazer pagamento da fatura de ${quando} (${quanto})`}
                    data-testid={`desfazer-${p.transfer_id}`}
                    disabled={desabilitado}
                    onClick={() => onDesfazer(p)}
                  >
                    Desfazer pagamento
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
