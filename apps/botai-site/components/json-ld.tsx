import { serializarJsonLd } from '@/lib/json-ld'

export function JsonLd({ dados }: { dados: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializarJsonLd(dados) }}
    />
  )
}
