import {
  fase,
  LOJAS,
  lojasPublicadas,
  type Fase,
  type Loja,
  type UrlsDasLojas,
} from '@piluvitu/tools/pilulabs'

export type BotaoDeLoja = { loja: Loja; url: string | null }
export type ModeloDaLanding = {
  fase: Fase
  lojas: BotaoDeLoja[]
  notaDasLojas: string
}

const NOME_CURTO: Record<Loja, string> = {
  chrome: 'Chrome',
  firefox: 'Firefox',
  edge: 'Edge',
  opera: 'Opera',
}

const SO_COM_LINK: readonly Loja[] = ['edge']

export function botoesDasLojas(urls: UrlsDasLojas): BotaoDeLoja[] {
  const publicadas = new Map(
    lojasPublicadas(urls).map(({ loja, url }) => [loja, url]),
  )
  return LOJAS.filter(
    (loja) => publicadas.has(loja) || !SO_COM_LINK.includes(loja),
  ).map((loja) => ({ loja, url: publicadas.get(loja) ?? null }))
}

function emLista(nomes: string[]): string {
  if (nomes.length < 2) return nomes.join('')
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
}

export function notaDasLojas(publicadas: readonly Loja[]): string {
  if (publicadas.length === 0)
    return 'Chegando às lojas do Chrome, do Firefox, do Edge e do Opera'
  return `${emLista(publicadas.map((loja) => NOME_CURTO[loja]))} · grátis e de código aberto`
}

export function modeloDaLanding(urls: UrlsDasLojas): ModeloDaLanding {
  const lojas = botoesDasLojas(urls)
  return {
    fase: fase(urls),
    lojas,
    notaDasLojas: notaDasLojas(
      lojas.filter((botao) => botao.url !== null).map((botao) => botao.loja),
    ),
  }
}
