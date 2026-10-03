import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { Landing } from '@/components/landing'
import { lerFaseDoBotai } from '@/lib/cms'
import { jsonLdDaHome } from '@/lib/json-ld'
import { DESCRICAO_DA_HOME, metadataDaPagina, TITULO_DA_HOME } from '@/lib/seo'
import { urlDoSite } from '@/lib/site'

export const metadata: Metadata = metadataDaPagina({
  caminho: '/',
  titulo: TITULO_DA_HOME,
  descricao: DESCRICAO_DA_HOME,
})

export default function Home() {
  return (
    <>
      <JsonLd dados={jsonLdDaHome(urlDoSite())} />
      <Landing faseDoBotai={lerFaseDoBotai()} ano={new Date().getFullYear()} />
    </>
  )
}
