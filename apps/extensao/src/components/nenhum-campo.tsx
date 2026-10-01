import {
  faMagnifyingGlass,
  faRotateRight,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { Card } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { encontreiCampos } from '../lib/textos'
import { IconeTile } from './icone-tile'
import { BOTAO_SM, CODIGO, CORPO, H1_ESTADO, PAINEL } from './tipografia'

const CAMINHO_DO_INSERIR = ['botão direito', 'piluvitu', 'Inserir'] as const

export interface NenhumCampoProps {
  y: number
  onTentarDeNovo: () => void
  onVerDados: () => void
}

export function NenhumCampo({
  y,
  onTentarDeNovo,
  onVerDados,
}: NenhumCampoProps) {
  return (
    <div className="flex flex-col gap-3.5 px-4 pt-5 pb-4">
      <IconeTile>
        <FontAwesomeIcon icon={faMagnifyingGlass} />
      </IconeTile>
      {y === 0 ? (
        <>
          <h1 className={H1_ESTADO}>Nenhum formulário nesta página</h1>
          <p className={CORPO}>
            Não achei campos de formulário visíveis. Formulários dentro de
            iframe de outro domínio ficam de fora.
          </p>
        </>
      ) : (
        <>
          <h1 className={H1_ESTADO}>Nenhum campo reconhecido nesta página</h1>
          <p className={CORPO}>
            {encontreiCampos(y)}, mas nenhum com{' '}
            <span className={CODIGO}>name</span>,{' '}
            <span className={CODIGO}>id</span>, label ou{' '}
            <span className={CODIGO}>autocomplete</span> que eu conheça.
            Formulários dentro de iframe de outro domínio também ficam de fora.
          </p>
        </>
      )}
      <Card className={cn(PAINEL, 'flex flex-col gap-2.5')}>
        <span className="text-muted-foreground text-[12px]">
          Dá para inserir campo a campo:
        </span>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] font-medium">
          {CAMINHO_DO_INSERIR.map((passo) => (
            <span key={passo} className="contents">
              <span className="rounded-full border px-2 py-[3px]">{passo}</span>
              <span className="text-muted-foreground">›</span>
            </span>
          ))}
          <span className="border-accent-line bg-accent-soft text-primary rounded-full border px-2 py-[3px]">
            CPF
          </span>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className={BOTAO_SM}
          onClick={onTentarDeNovo}
        >
          <FontAwesomeIcon icon={faRotateRight} className="text-xs" />
          Tentar de novo
        </Button>
        <Button
          variant="ghost"
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
