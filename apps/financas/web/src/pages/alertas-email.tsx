import { useCallback, useEffect, useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { CHECKBOX_CLASSNAME } from '../lib/form-classes'
import { CARTAO_SECAO, CHIP_MONO, FAIXA_ALERTA } from '../lib/superficie'
import { ROTULO } from '../lib/tipografia'
import { ALVO_LINHA } from '../lib/touch'

type AlertasView = { ligado: boolean }

const ROTA = '/api/settings/alertas'
const ID_ESTADO = 'alertas-email-estado'

function mensagem(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : 'Não foi possível falar com o servidor. Tente de novo.'
}

export type CartaoAlertasEmailProps = {
  /** null enquanto a primeira leitura não voltou. */
  ligado: boolean | null
  erroCarga: string | null
  salvando: boolean
  recusa: string | null
  onAlternar: (ligado: boolean) => void
  onTentarDeNovo: () => void
}

export function CartaoAlertasEmail({
  ligado,
  erroCarga,
  salvando,
  recusa,
  onAlternar,
  onTentarDeNovo,
}: CartaoAlertasEmailProps) {
  return (
    <Card className={CARTAO_SECAO} data-testid="cartao-alertas-email">
      <CardHeader>
        <CardTitle className={cn(ROTULO, 'leading-none')}>
          Alertas por e-mail
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Avisa quando uma categoria chega a 80% do orçamento do mês e quando
          estoura, e 3 dias antes do vencimento de cada fatura de cartão em
          aberto. No máximo um e-mail por alerta, enviado para o e-mail da sua
          conta Google.
        </p>

        {erroCarga !== null ? (
          <div
            role="alert"
            className={cn(
              FAIXA_ALERTA,
              'flex flex-wrap items-center gap-x-3 gap-y-2',
            )}
          >
            <p className="min-w-40 flex-1">
              Não foi possível carregar a preferência de alertas. {erroCarga}
            </p>
            <Button
              variant="outline"
              className="min-h-11"
              onClick={onTentarDeNovo}
            >
              Tentar de novo
            </Button>
          </div>
        ) : ligado === null ? (
          <p aria-busy="true" className="text-muted-foreground text-sm">
            Carregando a preferência…
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <label className={cn(ALVO_LINHA, 'gap-3 text-sm')}>
                <input
                  type="checkbox"
                  role="switch"
                  className={CHECKBOX_CLASSNAME}
                  checked={ligado}
                  disabled={salvando}
                  aria-describedby={ID_ESTADO}
                  onChange={(e) => onAlternar(e.target.checked)}
                />
                Receber alertas por e-mail
              </label>
              <span
                id={ID_ESTADO}
                className={cn(
                  CHIP_MONO,
                  ligado && !salvando
                    ? 'text-success'
                    : 'text-muted-foreground',
                )}
              >
                {salvando ? 'Salvando…' : ligado ? 'Ligado' : 'Desligado'}
              </span>
            </div>
            {recusa !== null ? (
              <p role="alert" className="text-destructive text-sm">
                {recusa}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function AlertasEmailCard() {
  const [ligado, setLigado] = useState<boolean | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [recusa, setRecusa] = useState<string | null>(null)

  const carregar = useCallback(() => {
    setErroCarga(null)
    api<AlertasView>(ROTA)
      .then((d) => setLigado(d.ligado))
      .catch((e: unknown) => setErroCarga(mensagem(e)))
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function alternar(novo: boolean) {
    setSalvando(true)
    setRecusa(null)
    try {
      const d = await api<AlertasView>(ROTA, {
        method: 'PUT',
        body: JSON.stringify({ ligado: novo }),
      })
      setLigado(d.ligado)
    } catch (e: unknown) {
      setRecusa(mensagem(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <CartaoAlertasEmail
      ligado={ligado}
      erroCarga={erroCarga}
      salvando={salvando}
      recusa={recusa}
      onAlternar={alternar}
      onTentarDeNovo={carregar}
    />
  )
}
