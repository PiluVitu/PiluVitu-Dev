import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { cn } from '@piluvitu/ui/cn'
import { SERVICOS } from '@/lib/conteudo'
import { CabecalhoSecao } from './cabecalho-secao'
import { CONTEUDO, ESPACO_DA_SECAO } from './classes'

export function Servicos() {
  return (
    <section
      id="servicos"
      aria-labelledby="servicos-titulo"
      className="bg-background text-foreground"
    >
      <div className={cn(CONTEUDO, ESPACO_DA_SECAO, 'flex flex-col gap-12')}>
        <CabecalhoSecao
          id="servicos-titulo"
          rotulo="Serviços"
          contagem={SERVICOS.length}
          titulo="Do primeiro protótipo ao servidor em produção."
        />
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5">
          {SERVICOS.map((servico, indice) => (
            <li
              key={servico.area}
              className="bg-card border-border flex min-w-0 flex-col gap-[18px] rounded-3xl border p-8"
            >
              <div className="border-border text-primary flex size-12 items-center justify-center rounded-2xl border">
                <FontAwesomeIcon icon={servico.icone} className="size-[19px]" />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground font-mono text-xs tracking-[0.2em] uppercase">
                  {String(indice + 1).padStart(2, '0')} · {servico.area}
                </p>
                <h3 className="text-[23px] font-bold tracking-[-0.02em]">
                  {servico.titulo}
                </h3>
              </div>
              <p className="text-muted-foreground text-base leading-[1.6] text-pretty">
                {servico.texto}
              </p>
              <ul className="border-border flex flex-col gap-2.5 border-t pt-4 text-[15px]">
                {servico.itens.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden className="text-primary font-mono">
                      →
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
