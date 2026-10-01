import {
  faCheck,
  faCrosshairs,
  faInbox,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import type { LinhaCampo, ResumoPreenchimento } from '../lib/resultado'
import { tituloPreenchimento } from '../lib/textos'
import { IconeTile } from './icone-tile'
import { BOTAO_SM, META_MONO, OVERLINE } from './tipografia'

const MAX_SEGMENTOS = 40
const SEGMENTO = 'h-1.5 rounded-[3px]'
const PREENCHIDO = 'bg-ok'
const FALTANDO = 'border-warn border border-dashed'

export interface ResultadoPreenchimentoProps {
  resumo: ResumoPreenchimento
  caminho: string
  nome: string
  onMostrar: (linha: LinhaCampo) => void
  onAbrirCaixa: () => void
  onVerDados: () => void
}

function Segmentos({ x, y, titulo }: { x: number; y: number; titulo: string }) {
  if (y > MAX_SEGMENTOS) {
    return (
      <div className="flex gap-[3px]" role="img" aria-label={titulo}>
        {x > 0 && (
          <span
            className={cn(SEGMENTO, PREENCHIDO)}
            style={{ flexGrow: x, flexBasis: 0 }}
          />
        )}
        {y > x && (
          <span
            className={cn(SEGMENTO, FALTANDO)}
            style={{ flexGrow: y - x, flexBasis: 0 }}
          />
        )}
      </div>
    )
  }
  return (
    <div className="flex gap-[3px]" role="img" aria-label={titulo}>
      {Array.from({ length: y }, (_, i) => (
        <span
          key={i}
          className={cn(SEGMENTO, 'flex-1', i < x ? PREENCHIDO : FALTANDO)}
        />
      ))}
    </div>
  )
}

function LinhaNaoReconhecida({
  linha,
  onMostrar,
}: {
  linha: LinhaCampo
  onMostrar: (linha: LinhaCampo) => void
}) {
  return (
    <li className="border-warn/50 flex items-center gap-2.5 rounded-xl border border-dashed px-3 py-[9px]">
      <div className="flex min-w-0 flex-col gap-0.5">
        {linha.rotulo && (
          <span className="text-[13px] font-semibold">{linha.rotulo}</span>
        )}
        <span className="text-muted-foreground font-mono text-[11px] font-medium [overflow-wrap:anywhere]">
          {linha.seletor}
        </span>
      </div>
      <button
        type="button"
        title="Mostrar na página"
        aria-label={`Mostrar na página: ${linha.rotulo || linha.seletor}`}
        onClick={() => onMostrar(linha)}
        className="text-muted-foreground hover:bg-accent focus-visible:ring-ring -my-1 ml-auto flex size-7 flex-none cursor-pointer items-center justify-center rounded-[8px] focus-visible:ring-1 focus-visible:outline-none"
      >
        <FontAwesomeIcon icon={faCrosshairs} className="text-xs" />
      </button>
    </li>
  )
}

export function ResultadoPreenchimento({
  resumo,
  caminho,
  nome,
  onMostrar,
  onAbrirCaixa,
  onVerDados,
}: ResultadoPreenchimentoProps) {
  const titulo = tituloPreenchimento(resumo.x, resumo.y)
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-[18px] pb-4">
      <div className="flex items-center gap-3">
        <IconeTile tom="ok">
          <FontAwesomeIcon icon={faCheck} />
        </IconeTile>
        <div className="flex min-w-0 flex-col gap-[3px]">
          <h1 className="m-0 text-[16px] font-bold tracking-[-0.01em]">
            {titulo}
          </h1>
          <div className={META_MONO}>
            {caminho} · com {nome}
          </div>
        </div>
      </div>
      <Segmentos x={resumo.x} y={resumo.y} titulo={titulo} />
      {resumo.naoReconhecidos.length > 0 && (
        <>
          <div className="mt-1 flex items-center gap-2.5">
            <h2 className={cn(OVERLINE, 'text-muted-foreground m-0')}>
              Não reconhecidos
            </h2>
            <span className="text-warn font-mono text-[10.5px] font-medium">
              {String(resumo.naoReconhecidos.length).padStart(2, '0')}
            </span>
            <span className="bg-border h-px flex-1" />
          </div>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {resumo.naoReconhecidos.map((linha) => (
              <LinhaNaoReconhecida
                key={`${linha.documentId}:${linha.idx}`}
                linha={linha}
                onMostrar={onMostrar}
              />
            ))}
          </ul>
          <p className="text-muted-foreground m-0 text-xs leading-normal text-pretty">
            Para esses, clique com o botão direito no campo e use{' '}
            <span className="text-foreground font-mono">
              piluvitu › Inserir
            </span>
            .
          </p>
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" className={BOTAO_SM} onClick={onAbrirCaixa}>
          <FontAwesomeIcon icon={faInbox} className="text-xs" />
          Caixa de entrada
        </Button>
        <Button
          variant="outline"
          size="sm"
          className={BOTAO_SM}
          onClick={onVerDados}
        >
          Ver os dados
        </Button>
      </div>
    </div>
  )
}
