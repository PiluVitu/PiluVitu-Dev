import { useCallback, useEffect, useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { formatDateTimeTeresina } from '../lib/dates'
import { CHECKBOX_CLASSNAME } from '../lib/form-classes'
import { CARTAO_SECAO, CHIP_MONO, FAIXA_ALERTA } from '../lib/superficie'
import { ROTULO } from '../lib/tipografia'
import { ALVO_LINHA } from '../lib/touch'

export type EstadoDoEnvio =
  | 'pronto'
  | 'aguardando'
  | 'nao_configurado'
  | 'falhou'

export type EnvioView = {
  estado: EstadoDoEnvio
  modo: string | null
  codigo?: string
  /** ISO UTC da última tentativa registrada. */
  em?: string
}

type AlertasView = { ligado: boolean; envio: EnvioView }

const ROTA = '/api/settings/alertas'
const ID_ESTADO = 'alertas-email-estado'

function mensagem(err: unknown): string {
  return err instanceof ApiError
    ? err.message
    : 'Não foi possível falar com o servidor. Tente de novo.'
}

function diaEmTeresina(iso: string | undefined): string | null {
  if (iso === undefined || Number.isNaN(Date.parse(iso))) return null
  return formatDateTimeTeresina(iso).slice(0, 10)
}

type Tom = 'ok' | 'neutro' | 'erro'

type Estado = {
  selo: string
  tom: Tom
  frase: string | null
  codigo: string | null
  dia: string | null
}

const COR_DO_TOM: Record<Tom, string> = {
  ok: 'text-success',
  neutro: 'text-muted-foreground',
  erro: 'text-destructive',
}

function estadoVisivel(ligado: boolean, envio: EnvioView | null): Estado {
  const vazio = { frase: null, codigo: null, dia: null }
  if (!ligado) return { selo: 'Desligado', tom: 'neutro', ...vazio }
  const codigo = envio?.codigo ?? null
  const dia = diaEmTeresina(envio?.em)
  switch (envio?.estado) {
    case 'pronto':
      return { selo: 'Ligado', tom: 'ok', ...vazio, dia }
    case 'nao_configurado':
      return {
        selo: 'Envio de e-mail não configurado',
        tom: 'erro',
        frase:
          'O Finanças ainda não consegue mandar e-mail: falta configurar o envio na Cloudflare.',
        codigo,
        dia,
      }
    case 'falhou':
      return {
        selo: 'A última tentativa falhou',
        tom: 'erro',
        frase: 'Tenta de novo no próximo dia com alerta.',
        codigo,
        dia,
      }
    default:
      return {
        selo: 'Aguardando o primeiro envio',
        tom: 'neutro',
        frase:
          'Nenhum e-mail saiu ainda. O estado se confirma no primeiro alerta.',
        codigo: null,
        dia: null,
      }
  }
}

function DetalheDoEnvio({ estado }: { estado: Estado }) {
  if (estado.frase === null) {
    return estado.dia === null ? null : (
      <p className="text-muted-foreground text-sm">
        Último e-mail em {estado.dia}
      </p>
    )
  }
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-sm">{estado.frase}</p>
      {estado.codigo !== null ? (
        <p className="text-muted-foreground font-mono text-xs break-words">
          código: {estado.codigo}
          {estado.dia !== null ? ` · tentativa em ${estado.dia}` : null}
        </p>
      ) : null}
    </div>
  )
}

export type CartaoAlertasEmailProps = {
  /** null enquanto a primeira leitura não voltou. */
  ligado: boolean | null
  envio: EnvioView | null
  erroCarga: string | null
  salvando: boolean
  recusa: string | null
  onAlternar: (ligado: boolean) => void
  onTentarDeNovo: () => void
}

export function CartaoAlertasEmail({
  ligado,
  envio,
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
          <Preferencia
            ligado={ligado}
            estado={estadoVisivel(ligado, envio)}
            salvando={salvando}
            recusa={recusa}
            onAlternar={onAlternar}
          />
        )}
      </CardContent>
    </Card>
  )
}

function Preferencia({
  ligado,
  estado,
  salvando,
  recusa,
  onAlternar,
}: {
  ligado: boolean
  estado: Estado
  salvando: boolean
  recusa: string | null
  onAlternar: (ligado: boolean) => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
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
            COR_DO_TOM[salvando ? 'neutro' : estado.tom],
          )}
        >
          {salvando ? 'Salvando…' : estado.selo}
        </span>
      </div>
      <DetalheDoEnvio estado={estado} />
      {recusa !== null ? (
        <p role="alert" className="text-destructive text-sm">
          {recusa}
        </p>
      ) : null}
    </>
  )
}

export function AlertasEmailCard() {
  const [view, setView] = useState<AlertasView | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [recusa, setRecusa] = useState<string | null>(null)

  const carregar = useCallback(() => {
    setErroCarga(null)
    api<AlertasView>(ROTA)
      .then(setView)
      .catch((e: unknown) => setErroCarga(mensagem(e)))
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function alternar(novo: boolean) {
    setSalvando(true)
    setRecusa(null)
    try {
      setView(
        await api<AlertasView>(ROTA, {
          method: 'PUT',
          body: JSON.stringify({ ligado: novo }),
        }),
      )
    } catch (e: unknown) {
      setRecusa(mensagem(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <CartaoAlertasEmail
      ligado={view?.ligado ?? null}
      envio={view?.envio ?? null}
      erroCarga={erroCarga}
      salvando={salvando}
      recusa={recusa}
      onAlternar={alternar}
      onTentarDeNovo={carregar}
    />
  )
}
