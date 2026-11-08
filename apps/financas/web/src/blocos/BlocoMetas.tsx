import { useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { cn } from '@piluvitu/ui/cn'
import { ApiError } from '../api'
import {
  larguraDaBarra,
  notaNoInicio,
  plural,
  resumoDasMetas,
  type MetaView,
} from '../lib/metas'
import { buscarUmaVez } from '../lib/requisicao-unica'
import { TRILHO_BARRA } from '../lib/superficie'
import { ALVO_LINK } from '../lib/touch'
import { Bloco } from './Bloco'

const LINHAS_NO_BLOCO = 3

/** O corpo do bloco, sem busca nem moldura: as stories e o teste usam direto. */
export function ConteudoMetas({ metas }: { metas: MetaView[] }) {
  // As atrasadas sobem: é o que pede atenção.
  const abertas = metas
    .filter((m) => m.status !== 'concluida')
    .sort(
      (a, b) =>
        Number(b.status === 'atrasada') - Number(a.status === 'atrasada'),
    )
    .slice(0, LINHAS_NO_BLOCO)
  return (
    <div className="flex flex-col gap-3.5">
      {abertas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Todas as metas estão concluídas.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {abertas.map((m) => {
            const atrasada = m.status === 'atrasada'
            return (
              <li key={m.id} className="flex flex-col gap-1.5">
                <span className="flex items-baseline gap-2 text-[13px]">
                  <span className="font-semibold">{m.name}</span>
                  <span className="ml-auto whitespace-nowrap tabular-nums">
                    {formatBRL(m.balance_cents)}{' '}
                    <span className="text-muted-foreground">
                      de {formatBRL(m.target_cents)}
                    </span>
                  </span>
                </span>
                <span aria-hidden className={cn(TRILHO_BARRA, 'block h-1.5')}>
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      atrasada ? 'bg-destructive' : 'bg-primary',
                    )}
                    style={{ width: `${larguraDaBarra(m.pct)}%` }}
                  />
                </span>
                <span
                  className={cn(
                    'text-xs',
                    atrasada ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {notaNoInicio(m)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <a
        href="#/metas"
        className={cn(ALVO_LINK, 'text-primary text-[13px] font-semibold')}
      >
        Ver as metas →
      </a>
    </div>
  )
}

export function BlocoMetas() {
  const [metas, setMetas] = useState<MetaView[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    buscarUmaVez<MetaView[]>('/api/goals')
      .then((data) => {
        if (vivo) setMetas(data)
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  const vazio = metas !== null && metas.length === 0

  return (
    <Bloco
      titulo="Metas"
      descricao={
        metas && !vazio
          ? `${formatBRL(resumoDasMetas(metas).guardado_cents)} guardados em ${plural(metas.length, 'meta', 'metas')}`
          : 'o que estou guardando'
      }
      acao={
        vazio ? (
          <a
            href="#/metas"
            className={cn(ALVO_LINK, 'text-primary text-[13px] font-semibold')}
          >
            Criar uma meta
          </a>
        ) : undefined
      }
      carregando={metas === null && erro === null}
      erro={erro}
      vazio={vazio}
      vazioMensagem="Nenhuma meta ainda."
    >
      {metas ? <ConteudoMetas metas={metas} /> : null}
    </Bloco>
  )
}
