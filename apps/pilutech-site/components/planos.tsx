import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { ABRE_EM_ABA_NOVA } from '@/lib/contato'
import { PLANOS } from '@/lib/conteudo'
import { CabecalhoSecao } from './cabecalho-secao'
import { BOTAO_GRANDE, CONTEUDO, ESPACO_DA_SECAO } from './classes'

export function Planos() {
  return (
    <section
      id="planos"
      aria-labelledby="planos-titulo"
      className="bg-primary text-primary-foreground"
    >
      <div className={cn(CONTEUDO, ESPACO_DA_SECAO, 'flex flex-col gap-12')}>
        <CabecalhoSecao
          id="planos-titulo"
          rotulo="Planos de manutenção"
          contagem={PLANOS.length}
          titulo="Seu aplicativo atualizado, monitorado e no ar."
          tom="petroleo"
        >
          <p className="max-w-[640px] text-[17px] leading-[1.6]">
            Planos mensais. O valor depende do tamanho do aplicativo e da
            infraestrutura, e vem na proposta.
          </p>
        </CabecalhoSecao>
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-5">
          {PLANOS.map((plano) => (
            <li
              key={plano.nome}
              className="bg-petroleo-cartao border-petroleo-borda flex min-w-0 flex-col gap-[22px] rounded-3xl border p-8"
            >
              <div className="flex flex-col gap-2">
                <h3 className="text-[24px] font-extrabold tracking-[-0.02em]">
                  {plano.nome}
                </h3>
                <p className="text-[15px] leading-[1.5]">{plano.para}</p>
              </div>
              <ul className="flex flex-1 flex-col gap-3 text-[15px]">
                {plano.itens.map((item) => (
                  <li key={item} className="flex gap-2.5">
                    <span aria-hidden className="text-ciano font-mono">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className={cn(
                  BOTAO_GRANDE,
                  'text-petroleo-cartao focus-visible:ring-offset-petroleo-cartao h-[46px] w-full bg-white hover:bg-white/90 focus-visible:ring-white',
                )}
              >
                <a href={plano.whatsapp} {...ABRE_EM_ABA_NOVA}>
                  Pedir proposta
                  <span className="sr-only"> do plano {plano.nome}</span>
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
