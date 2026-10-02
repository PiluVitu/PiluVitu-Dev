import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import Image from 'next/image'
import Link from 'next/link'
import type { Fase, ItemPiluLabs, Loja } from '@/lib/pilulabs'
import { cn } from '@/lib/utils'
import { LOJA_UI } from './lojas-ui'
import { StatusProduto } from './status-produto'

export type ItemDoCard = Pick<
  ItemPiluLabs,
  | 'slug'
  | 'nome'
  | 'subtitulo'
  | 'descricao'
  | 'logo'
  | 'sigla'
  | 'tags'
  | 'tipo'
>

type ProdutoCardProps = {
  item: ItemDoCard
  href: string | null
  fase: Fase
  lojas: Loja[]
}

const CARTAO =
  'bg-card border-border flex h-full flex-col gap-4 rounded-lg border p-6'
const CARTAO_LINK =
  'group hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2'

export function ProdutoCard({ item, href, fase, lojas }: ProdutoCardProps) {
  const extensao = item.tipo === 'extensao'
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {item.logo ? (
            <Image
              src={item.logo}
              alt=""
              width={44}
              height={44}
              unoptimized={!item.logo.startsWith('/')}
              className="rounded-xl"
            />
          ) : (
            <span
              aria-hidden
              data-sigla
              className="bg-accent-soft text-primary grid size-11 shrink-0 place-items-center rounded-xl text-sm font-bold"
            >
              {item.sigla}
            </span>
          )}
          <div className="flex flex-col">
            <h3 className="text-lg font-semibold">{item.nome}</h3>
            {item.subtitulo ? (
              <p className="text-muted-foreground text-sm">{item.subtitulo}</p>
            ) : null}
          </div>
        </div>
        {extensao ? <StatusProduto fase={fase} /> : null}
      </div>
      {item.descricao ? (
        <p className="text-muted-foreground text-sm">{item.descricao}</p>
      ) : null}
      {item.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <li
              key={tag}
              className="border-border rounded-full border px-2.5 py-0.5 font-mono text-xs"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      {extensao && lojas.length > 0 ? (
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
    </>
  )

  if (!href) return <article className={CARTAO}>{conteudo}</article>
  const externo = !href.startsWith('/')
  return (
    <Link
      href={href}
      className={cn(CARTAO, CARTAO_LINK)}
      {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {conteudo}
    </Link>
  )
}
