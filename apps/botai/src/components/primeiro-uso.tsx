import { faUserPlus } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { Card } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { CORPO, OVERLINE, PAINEL } from './tipografia'

const GARANTIAS: readonly [string, string][] = [
  ['CPF/CNPJ', 'dígito verificador correto'],
  ['CEP', 'existe, e rua, bairro e cidade batem'],
  ['cartão', 'número de teste documentado, Luhn válido'],
]

export function PrimeiroUso({ onGerar }: { onGerar: () => void }) {
  return (
    <div className="flex flex-col gap-3.5 px-5 pt-7 pb-5">
      <span className={cn(OVERLINE, 'text-primary')}>Primeiro uso</span>
      <h1 className="m-0 text-[20px] leading-[1.2] font-bold tracking-[-0.02em]">
        Ainda não há pessoa de teste
      </h1>
      <p className={CORPO}>
        Gere uma pessoa brasileira falsa e coerente. CPF, CNPJ, CEP e cartão
        passam na validação. Ela fica guardada até você pedir outra.
      </p>
      <Card className={cn(PAINEL, 'flex flex-col gap-2')}>
        {GARANTIAS.map(([chave, texto]) => (
          <div
            key={chave}
            className="grid grid-cols-[72px_1fr] gap-2.5 text-[12px] leading-[1.4]"
          >
            <span className="text-primary font-mono">{chave}</span>
            <span className="text-muted-foreground">{texto}</span>
          </div>
        ))}
      </Card>
      <Button size="lg" className="w-full gap-2" onClick={onGerar}>
        <FontAwesomeIcon icon={faUserPlus} className="text-[13px]" />
        Gerar pessoa
      </Button>
    </div>
  )
}
