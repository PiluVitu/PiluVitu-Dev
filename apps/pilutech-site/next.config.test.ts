/** @jest-environment node */
import { hasRemoteMatch } from 'next/dist/shared/lib/match-remote-pattern'
import { BOTAI, SOMBRAI } from '@/lib/conteudo'
import nextConfig from './next.config'

const padroes = nextConfig.images?.remotePatterns ?? []
const aceita = (url: string) => hasRemoteMatch([], padroes, new URL(url))

describe('next.config: imagens remotas', () => {
  it('aceita as duas imagens OG dos projetos, como estão no conteúdo', () => {
    expect(aceita(BOTAI.imagem.src)).toBe(true)
    expect(aceita(SOMBRAI.imagem.src)).toBe(true)
  })

  // Review Focus 3: o otimizador não pode virar proxy de outro caminho, host, porta ou query.
  it.each([
    'https://botai.pilutech.com.br/opengraph-image?c38af07e9157d6d9',
    'https://sombrai.pilutech.com.br/opengraph-image.png?x=1',
    'https://botai.pilutech.com.br/capturas/01-pagina-preenchida-escuro.png',
    'http://botai.pilutech.com.br/opengraph-image',
    'https://evil.pilutech.com.br/opengraph-image',
    'https://botai.pilutech.com.br:8443/opengraph-image',
  ])('recusa %s', (url) => {
    expect(aceita(url)).toBe(false)
  })

  it('mantém AVIF e WebP', () => {
    expect(nextConfig.images?.formats).toEqual(['image/avif', 'image/webp'])
  })
})
