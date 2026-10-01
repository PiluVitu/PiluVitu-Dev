import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { PageTopBar } from '@/components/page-top-bar'
import { Vitrine, type ItemVitrine } from '@/components/pilulabs/vitrine'
import {
  fase,
  lojasPublicadas,
  metadataDaPagina,
  produtosListados,
} from '@/lib/pilulabs'
import { jsonLdVitrine } from '@/lib/pilulabs-json-ld'
import { getProdutos } from '@/lib/site-content'
import { getCanonicalSiteUrl } from '@/lib/site-url'

export const metadata: Metadata = metadataDaPagina({
  caminho: '/pilulabs',
  titulo: 'PiluLabs | produtos da PiluTech',
  descricao:
    'Produtos e apps que o Paulo Victor faz e mantém. Powered by PiluTech.',
})

export default async function PiluLabsPage() {
  const listados = produtosListados(await getProdutos())
  const itens: ItemVitrine[] = listados.map((produto) => ({
    produto,
    fase: fase(produto),
    lojas: lojasPublicadas(produto).map(({ loja }) => loja),
  }))

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 py-8 sm:px-8 xl:py-10">
      <JsonLd dados={jsonLdVitrine(getCanonicalSiteUrl(), listados)} />
      <PageTopBar backHref="/" backLabel="Paulo Victor" />

      <header className="mt-10 mb-12">
        <h1 className="text-4xl font-bold tracking-tight">PiluLabs</h1>
        <p className="text-muted-foreground mt-2">
          Produtos e apps que eu faço e mantenho. Powered by PiluTech.
        </p>
        <p className="mt-4 font-mono text-sm">
          <span className="text-primary">$ ~/pilulabs</span>{' '}
          <span
            className="bg-primary ml-0.5 inline-block h-4 w-2 animate-pulse align-text-bottom"
            aria-hidden
          />
        </p>
      </header>

      <Vitrine itens={itens} />
    </div>
  )
}
