import { cn } from '@piluvitu/ui/cn'
import { TECNOLOGIAS } from '@/lib/conteudo'
import { CabecalhoSecao } from './cabecalho-secao'
import { CONTEUDO, ESPACO_DA_SECAO } from './classes'

export function Tecnologias() {
  return (
    <section
      id="tecnologias"
      aria-labelledby="tecnologias-titulo"
      className="dark bg-background text-foreground"
    >
      <div className={cn(CONTEUDO, ESPACO_DA_SECAO, 'flex flex-col gap-12')}>
        <CabecalhoSecao
          id="tecnologias-titulo"
          rotulo="Tecnologias"
          contagem={TECNOLOGIAS.length}
          titulo="Ferramentas usadas no dia a dia."
        />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-5">
          {TECNOLOGIAS.map((grupo, indice) => {
            const id = `tecnologias-grupo-${indice + 1}`
            return (
              <div
                key={grupo.grupo}
                className="border-border flex min-w-0 flex-col gap-4 border-t pt-5"
              >
                <h3
                  id={id}
                  className="text-muted-foreground font-mono text-xs font-normal tracking-[0.2em] uppercase"
                >
                  {grupo.grupo}
                </h3>
                <ul
                  aria-labelledby={id}
                  className="flex flex-wrap gap-2 font-mono text-[15px]"
                >
                  {grupo.itens.map((item) => (
                    <li
                      key={item}
                      className="border-border rounded-xl border px-3.5 py-2"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
