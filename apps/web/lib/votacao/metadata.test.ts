import { metadata as daLista } from '@/app/(site)/votacao/layout'
import { metadata as doHistorico } from '@/app/(site)/votacao/anteriores/layout'
import { generateMetadata } from '@/app/(site)/votacao/anteriores/[id]/layout'
import { generateMetadata as daSessao } from '@/app/(site)/votacao/[id]/layout'
import { metadataDoVotai } from './metadata'

describe('metadata do Votaí', () => {
  it('a lista e as sessões (área logada, sessões abertas) não são indexadas', () => {
    expect(daLista.robots).toEqual({ index: false, follow: true })
    expect(daLista.title).toEqual({ absolute: 'Votaí' })
    expect(daLista.openGraph).toMatchObject({ siteName: 'Votaí' })
  })

  it('o histórico é indexável, com canonical no host de produção do Votaí', () => {
    expect(doHistorico.robots).toEqual({ index: true, follow: true })
    expect(doHistorico.alternates?.canonical).toBe(
      'https://votai.piluvitu.com.br/anteriores',
    )
    expect(doHistorico.openGraph).toMatchObject({
      siteName: 'Votaí',
      url: 'https://votai.piluvitu.com.br/anteriores',
      title: 'Votações anteriores | Votaí',
    })
  })

  it('a votação encerrada tem canonical próprio; id inválido não é indexado', async () => {
    const boa = await generateMetadata({
      params: Promise.resolve({ id: '12' }),
    })
    expect(boa.alternates?.canonical).toBe(
      'https://votai.piluvitu.com.br/anteriores/12',
    )
    expect(boa.robots).toEqual({ index: true, follow: true })
    const ruim = await generateMetadata({
      params: Promise.resolve({ id: 'x' }),
    })
    expect(ruim.robots).toEqual({ index: false, follow: true })
  })

  it('a sessão tem canonical e og:url próprios, sem indexar', async () => {
    const m = await daSessao({ params: Promise.resolve({ id: '12' }) })
    expect(m.alternates?.canonical).toBe('https://votai.piluvitu.com.br/12')
    expect(m.openGraph).toMatchObject({
      siteName: 'Votaí',
      url: 'https://votai.piluvitu.com.br/12',
    })
    expect(m.robots).toEqual({ index: false, follow: true })
    expect(m.title).toEqual({ absolute: 'Votação | Votaí' })
  })

  it('a descrição cabe no snippet', () => {
    const m = metadataDoVotai({
      titulo: 'Votaí',
      caminho: '/',
      indexavel: false,
    })
    expect(m.description).toMatch(/^.{50,160}$/)
    expect(doHistorico.description).toMatch(/^.{50,160}$/)
  })
})
