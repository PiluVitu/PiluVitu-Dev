import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import type { BotaoDeLoja } from '@/lib/modelo'
import { LOJA_UI } from './lojas-ui'

type BotoesLojaProps = {
  lojas: BotaoDeLoja[]
  variante?: 'default' | 'outline'
  className?: string
}

const BOTAO = 'h-auto min-h-10 max-w-full gap-2 px-5 py-2 whitespace-normal'

export function BotoesLoja({
  lojas,
  variante = 'default',
  className,
}: BotoesLojaProps) {
  return (
    <ul
      aria-label="Instalar pela loja"
      className={cn('flex flex-wrap gap-3', className)}
    >
      {lojas.map(({ loja, url }) => {
        const { rotulo, icone } = LOJA_UI[loja]
        return (
          <li key={loja} className="max-w-full">
            {url ? (
              <Button asChild variant={variante} size="lg" className={BOTAO}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <FontAwesomeIcon icon={icone} className="size-4" />
                  {rotulo}
                </a>
              </Button>
            ) : (
              <Button variant={variante} size="lg" className={BOTAO} disabled>
                <FontAwesomeIcon icon={icone} className="size-4" />
                {rotulo} <span className="font-mono text-xs">Em breve</span>
              </Button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
