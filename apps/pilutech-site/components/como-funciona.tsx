import { cn } from '@piluvitu/ui/cn'
import { ETAPAS } from '@/lib/conteudo'
import { CabecalhoSecao } from './cabecalho-secao'
import { CONTEUDO, ESPACO_DA_SECAO } from './classes'

export function ComoFunciona() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="como-funciona-titulo"
      className="dark bg-background text-foreground"
    >
      <div className={cn(CONTEUDO, ESPACO_DA_SECAO, 'flex flex-col gap-12')}>
        <CabecalhoSecao
          id="como-funciona-titulo"
          rotulo="Como funciona"
          contagem={ETAPAS.length}
          titulo="Quatro etapas, com escopo e valor por escrito."
        />
        <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-5">
          {ETAPAS.map((etapa, indice) => (
            <li
              key={etapa.titulo}
              className="bg-card border-border flex min-w-0 flex-col gap-3.5 rounded-3xl border p-7"
            >
              <span
                aria-hidden
                className="text-primary font-mono text-[28px] font-semibold"
              >
                {String(indice + 1).padStart(2, '0')}
              </span>
              <h3 className="text-[20px] font-bold tracking-[-0.02em]">
                {etapa.titulo}
              </h3>
              <p className="text-muted-foreground text-[15px] leading-[1.6]">
                {etapa.texto}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
