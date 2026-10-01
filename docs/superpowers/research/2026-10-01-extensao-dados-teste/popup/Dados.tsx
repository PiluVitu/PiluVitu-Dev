import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowUpRightFromSquare,
  faBolt,
  faCheck,
  faCopy,
  faEye,
  faInbox,
  faShuffle,
} from '@fortawesome/free-solid-svg-icons'
import { Avatar, AvatarFallback } from '@piluvitu/ui/avatar'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { META_MONO, OVERLINE } from './tipografia'

export type Grupo = { id: string; rotulo: string; linhas: [string, string][] }

export function PersonHeader({
  nome,
  idade,
  cidade,
  uf,
}: {
  nome: string
  idade: number
  cidade: string
  uf: string
}) {
  const partes = nome.split(' ')
  const iniciais = (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  return (
    <div className="flex items-center gap-3 px-4 pt-4 pb-3.5">
      <Avatar>
        <AvatarFallback className="bg-accent-soft text-primary font-sans text-[13px] font-bold">
          {iniciais}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <div className="text-base font-bold tracking-[-0.01em]">{nome}</div>
        <div className={META_MONO}>
          {idade} anos · {cidade}, {uf}
        </div>
      </div>
    </div>
  )
}

export function ActionBar({ atalho }: { atalho: string }) {
  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      <Button size="lg" className="w-full gap-2">
        <FontAwesomeIcon icon={faBolt} className="text-[13px]" />
        Preencher esta página
        <kbd className="bg-primary-foreground/[0.14] ml-1 rounded-[6px] px-1.5 py-0.5 font-mono text-[10.5px] font-medium">
          {atalho}
        </kbd>
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 rounded-[14px] text-[13px]"
        >
          <FontAwesomeIcon icon={faShuffle} className="text-xs" />
          Nova pessoa
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 rounded-[14px] text-[13px]"
        >
          <FontAwesomeIcon icon={faInbox} className="text-xs" />
          Caixa de entrada
          <FontAwesomeIcon
            icon={faArrowUpRightFromSquare}
            className="text-muted-foreground text-[10px]"
          />
        </Button>
      </div>
    </div>
  )
}

export function FilterChips({
  opcoes,
  ativo,
  onChange,
}: {
  opcoes: [string, string][]
  ativo: string
  onChange: (id: string) => void
}) {
  return (
    <div className="bg-background sticky top-0 z-10 flex flex-wrap gap-1.5 border-t px-4 pt-3 pb-2.5">
      {opcoes.map(([id, rotulo]) => (
        <button
          key={id}
          type="button"
          aria-pressed={ativo === id}
          onClick={() => onChange(id)}
          className={cn(
            'cursor-pointer rounded-full border px-2.5 py-1.5 font-mono text-[11px] leading-none font-medium transition-colors duration-200',
            ativo === id
              ? 'bg-accent-soft text-primary border-accent-line'
              : 'text-muted-foreground border-border bg-transparent',
          )}
        >
          {rotulo}
        </button>
      ))}
    </div>
  )
}

export function GroupHeader({
  rotulo,
  total,
}: {
  rotulo: string
  total: number
}) {
  return (
    <div className="flex items-center gap-2.5 px-2 pt-3.5 pb-1.5">
      <span className={cn(OVERLINE, 'text-muted-foreground')}>{rotulo}</span>
      <span className="text-primary font-mono text-[10.5px] font-medium">
        {String(total).padStart(2, '0')}
      </span>
      <span className="bg-border h-px flex-1" />
    </div>
  )
}

export function CopyRow({
  rotulo,
  valor,
  copiado,
  onCopiar,
}: {
  rotulo: string
  valor: string
  copiado: boolean
  onCopiar: () => void
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[92px_minmax(0,1fr)_28px] items-center gap-2.5 rounded-[10px] py-[5px] pr-1 pl-2 transition-colors duration-200',
        copiado && 'bg-ok/10',
      )}
    >
      <span className="text-muted-foreground text-xs" aria-live="polite">
        {copiado ? (
          <span className="text-ok font-mono text-[11px] font-semibold">
            copiado
          </span>
        ) : (
          rotulo
        )}
      </span>
      <span className="font-mono text-[12.5px] leading-[1.4] font-medium [overflow-wrap:anywhere]">
        {valor}
      </span>
      <button
        type="button"
        aria-label={`Copiar ${rotulo}`}
        title="Copiar"
        onClick={onCopiar}
        className={cn(
          'hover:bg-accent flex size-7 cursor-pointer items-center justify-center rounded-[8px] transition-colors duration-200',
          copiado ? 'text-ok' : 'text-muted-foreground',
        )}
      >
        <FontAwesomeIcon
          icon={copiado ? faCheck : faCopy}
          className="text-xs"
        />
      </button>
    </div>
  )
}

export function PublicInboxNotice({ onAbrir }: { onAbrir: () => void }) {
  return (
    <div className="border-warn/35 bg-warn/[0.08] mx-2 mt-1.5 mb-0.5 flex gap-2.5 rounded-xl border px-3 py-2.5 text-xs leading-normal">
      <FontAwesomeIcon icon={faEye} className="text-warn mt-1 text-[11px]" />
      <span className="text-pretty">
        <strong className="text-warn font-semibold">Caixa pública.</strong> Quem
        souber o endereço lê os e-mails. Só para teste, nunca para conta real.{' '}
        <button
          type="button"
          onClick={onAbrir}
          className="text-primary cursor-pointer underline-offset-[3px] hover:underline"
        >
          abrir caixa →
        </button>
      </span>
    </div>
  )
}

export function CardSandboxNote() {
  return (
    <p className="text-muted-foreground mx-2 mt-1.5 mb-0.5 text-xs leading-normal text-pretty">
      Número de sandbox: passa no Luhn e é recusado por qualquer adquirente
      real.
    </p>
  )
}

export function useCopiado(ms = 1400) {
  const [chave, setChave] = useState<string | null>(null)
  const t = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(t.current), [])
  return {
    chave,
    marcar(k: string) {
      clearTimeout(t.current)
      setChave(k)
      t.current = setTimeout(() => setChave(null), ms)
    },
    limpar() {
      clearTimeout(t.current)
      setChave(null)
    },
  }
}
