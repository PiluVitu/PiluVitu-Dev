import { cn } from '@piluvitu/ui/cn'
import {
  BLOCOS_DA_MARCA,
  LADO_DO_BLOCO,
  NOME_DA_MARCA,
  proporcoesDoLockup,
  RAIO_DO_BLOCO,
} from '@/lib/marca'

type SvgDaMarcaProps = {
  tamanho: number
  cores?: { base: string; destaque: string }
  rotulo?: string
}

export function SvgDaMarca({ tamanho, cores, rotulo }: SvgDaMarcaProps) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 48 48"
      className={cores ? undefined : 'block flex-none'}
      {...(rotulo
        ? { role: 'img', 'aria-label': rotulo }
        : { 'aria-hidden': true })}
    >
      {BLOCOS_DA_MARCA.map((bloco) => (
        <rect
          key={`${bloco.x}-${bloco.y}`}
          x={bloco.x}
          y={bloco.y}
          width={LADO_DO_BLOCO}
          height={LADO_DO_BLOCO}
          rx={RAIO_DO_BLOCO}
          {...(cores
            ? { fill: bloco.destaque ? cores.destaque : cores.base }
            : {
                className: bloco.destaque ? 'fill-primary' : 'fill-foreground',
              })}
        />
      ))}
    </svg>
  )
}

type PiluTechMarkProps = {
  tamanho?: number
  lockup?: boolean
  className?: string
}

export function PiluTechMark({
  tamanho = 48,
  lockup = false,
  className,
}: PiluTechMarkProps) {
  const { espaco, palavra } = proporcoesDoLockup(tamanho)
  return (
    <span
      className={cn('inline-flex items-center leading-none', className)}
      style={lockup ? { gap: espaco } : undefined}
    >
      <SvgDaMarca
        tamanho={tamanho}
        rotulo={lockup ? undefined : NOME_DA_MARCA}
      />
      {lockup ? (
        <span
          className="text-foreground font-extrabold tracking-[-0.035em] whitespace-nowrap"
          style={{ fontSize: palavra }}
        >
          {NOME_DA_MARCA}
        </span>
      ) : null}
    </span>
  )
}
