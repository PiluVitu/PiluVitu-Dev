import { cn } from '@piluvitu/ui/cn'
import Image from 'next/image'
import {
  ALTURA_DA_CAPTURA,
  LARGURA_DA_CAPTURA,
  type Tema,
  type VarianteDaCaptura,
} from '@/lib/capturas'

type ImagemPorTemaProps = {
  variantes: Record<Tema, VarianteDaCaptura>
  sizes: string
  destaque?: boolean
}

const VISIVEL_NO: Record<Tema, string> = {
  claro: 'block dark:hidden',
  escuro: 'hidden dark:block',
}

export function ImagemPorTema({
  variantes,
  sizes,
  destaque = false,
}: ImagemPorTemaProps) {
  return (
    <>
      {(['claro', 'escuro'] as const).map((tema) => (
        <Image
          key={tema}
          src={variantes[tema].src}
          alt={variantes[tema].alt}
          width={LARGURA_DA_CAPTURA}
          height={ALTURA_DA_CAPTURA}
          sizes={sizes}
          className={cn('h-auto w-full', VISIVEL_NO[tema])}
          {...(destaque ? { fetchPriority: 'high' as const } : {})}
        />
      ))}
    </>
  )
}
