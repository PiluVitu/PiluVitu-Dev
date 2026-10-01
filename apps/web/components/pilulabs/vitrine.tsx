import Link from 'next/link'
import { SectionHeader } from '@/components/section-header'
import type { Fase, Loja, Produto, TipoProduto } from '@/lib/pilulabs'
import { ProdutoCard } from './produto-card'

export type ItemVitrine = {
  produto: Pick<Produto, 'slug' | 'nome' | 'resumo' | 'icone' | 'tags' | 'tipo'>
  fase: Fase
  lojas: Loja[]
}

const GRUPOS: { tipo: TipoProduto; rotulo: string }[] = [
  { tipo: 'extensao', rotulo: 'Extensões' },
  { tipo: 'web', rotulo: 'Apps web' },
  { tipo: 'cli', rotulo: 'CLIs' },
]

export function Vitrine({ itens }: { itens: ItemVitrine[] }) {
  if (itens.length === 0) {
    return (
      <div
        data-testid="pilulabs-vazio"
        className="border-border flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center"
      >
        <p className="font-semibold">
          PiluLabs: produtos da PiluTech. Em breve.
        </p>
        <p className="text-muted-foreground text-sm">
          Enquanto isso, conheça{' '}
          <Link href="/" className="text-primary hover:underline">
            o autor
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-12">
      {GRUPOS.map(({ tipo, rotulo }) => {
        const doGrupo = itens.filter((item) => item.produto.tipo === tipo)
        if (doGrupo.length === 0) return null
        return (
          <section key={tipo} className="flex flex-col gap-5">
            <SectionHeader label={rotulo} count={doGrupo.length} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {doGrupo.map((item) => (
                <ProdutoCard
                  key={item.produto.slug}
                  produto={item.produto}
                  fase={item.fase}
                  lojas={item.lojas}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
