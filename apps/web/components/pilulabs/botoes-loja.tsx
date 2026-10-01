import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import type { LojaPublicada } from '@/lib/pilulabs'
import { LOJA_UI } from './lojas-ui'

export function BotoesLoja({ lojas }: { lojas: LojaPublicada[] }) {
  if (lojas.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-3" aria-label="Instalar pela loja">
      {lojas.map(({ loja, url }) => (
        <li key={loja}>
          <Button asChild className="gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <FontAwesomeIcon icon={LOJA_UI[loja].icone} className="size-4" />
              {LOJA_UI[loja].rotulo}
            </a>
          </Button>
        </li>
      ))}
    </ul>
  )
}
