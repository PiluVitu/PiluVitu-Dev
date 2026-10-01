import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Image from 'next/image'
import Link from 'next/link'
import type { Fase, Loja, Produto } from '@/lib/pilulabs'
import { LOJA_UI } from './lojas-ui'
import { StatusProduto } from './status-produto'

type ProdutoCardProps = {
  produto: Pick<Produto, 'slug' | 'nome' | 'resumo' | 'icone' | 'tags'>
  fase: Fase
  lojas: Loja[]
}

export function ProdutoCard({ produto, fase, lojas }: ProdutoCardProps) {
  return (
    <Link
      href={`/pilulabs/${produto.slug}`}
      className="group bg-card border-border hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background flex h-full flex-col gap-4 rounded-lg border p-6 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {produto.icone ? (
            <Image
              src={produto.icone}
              alt=""
              width={44}
              height={44}
              className="rounded-xl"
            />
          ) : null}
          <h3 className="text-lg font-semibold">{produto.nome}</h3>
        </div>
        <StatusProduto fase={fase} />
      </div>
      <p className="text-muted-foreground text-sm">{produto.resumo}</p>
      {produto.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {produto.tags.map((tag) => (
            <li
              key={tag}
              className="border-border rounded-full border px-2.5 py-0.5 font-mono text-xs"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      {lojas.length > 0 ? (
        <ul
          className="text-muted-foreground mt-auto flex gap-3"
          aria-label="Lojas"
        >
          {lojas.map((loja) => (
            <li key={loja}>
              <FontAwesomeIcon icon={LOJA_UI[loja].icone} className="size-4" />
              <span className="sr-only">{LOJA_UI[loja].rotulo}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Link>
  )
}
