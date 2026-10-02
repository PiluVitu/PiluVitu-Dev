import type { Fase } from '@piluvitu/tools/pilulabs'
import { cn } from '@piluvitu/ui/cn'
import Image from 'next/image'
import { ABRE_EM_ABA_NOVA } from '@/lib/contato'
import { cartoesDosProjetos } from '@/lib/conteudo'
import { CabecalhoSecao } from './cabecalho-secao'
import { CONTEUDO, ESPACO_DA_SECAO } from './classes'

export function Projetos({ faseDoBotai }: { faseDoBotai: Fase }) {
  const cartoes = cartoesDosProjetos(faseDoBotai)
  return (
    <section
      id="projetos"
      aria-labelledby="projetos-titulo"
      className="bg-background text-foreground"
    >
      <div className={cn(CONTEUDO, ESPACO_DA_SECAO, 'flex flex-col gap-12')}>
        <CabecalhoSecao
          id="projetos-titulo"
          rotulo="Projetos"
          contagem={cartoes.length}
          titulo="Produtos próprios da PiluTech."
        />
        <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-6">
          {cartoes.map((projeto) => (
            <li key={projeto.nome} className="min-w-0">
              <a
                href={projeto.url}
                {...ABRE_EM_ABA_NOVA}
                className="bg-card border-border hover:border-primary text-foreground flex h-full flex-col overflow-hidden rounded-[28px] border transition-colors"
              >
                <Image
                  src={projeto.imagem.src}
                  alt={projeto.imagem.alt}
                  width={1200}
                  height={630}
                  sizes="(min-width: 1180px) 530px, (min-width: 960px) 45vw, calc(100vw - 40px)"
                  className="bg-grafite border-border block aspect-[1200/630] h-auto w-full border-b object-cover"
                />
                <div className="flex flex-col gap-3.5 p-7">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-[26px] font-extrabold tracking-[-0.03em]">
                      {projeto.nome}
                    </h3>
                    <span className="border-border text-muted-foreground rounded-[10px] border px-2.5 py-[5px] font-mono text-xs tracking-[0.12em] uppercase">
                      {projeto.selo}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-base leading-[1.6] text-pretty">
                    {projeto.texto}
                  </p>
                  <span className="text-primary font-mono text-sm">
                    {projeto.endereco} <span aria-hidden>→</span>
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
