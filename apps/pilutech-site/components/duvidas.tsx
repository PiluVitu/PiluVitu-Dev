import { cn } from '@piluvitu/ui/cn'
import { DUVIDAS } from '@/lib/conteudo'
import { Acordeao } from './acordeao'
import { CabecalhoSecao } from './cabecalho-secao'
import { ESPACO_DA_SECAO } from './classes'

export function Duvidas() {
  return (
    <section
      id="duvidas"
      aria-labelledby="duvidas-titulo"
      className="bg-background text-foreground"
    >
      <div
        className={cn(
          'mx-auto box-content flex max-w-[860px] flex-col gap-10 px-[clamp(20px,5vw,48px)]',
          ESPACO_DA_SECAO,
        )}
      >
        <CabecalhoSecao
          id="duvidas-titulo"
          rotulo="Perguntas frequentes"
          contagem={DUVIDAS.length}
          titulo="Dúvidas comuns"
        />
        <Acordeao itens={DUVIDAS} />
      </div>
    </section>
  )
}
