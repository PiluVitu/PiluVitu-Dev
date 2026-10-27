import { foraDaVotacao } from './medicao'

const evento = (url: string) => ({ type: 'pageview' as const, url })

// A votação é área logada (login com Google pelo ramielle): decidido pelo dono em 2026-10-11 que
// ela fica fora da medição, inteira, com o painel /votacao/admin. O /admin já é outro grupo de rotas.
// Desde o Votaí (2026-10-26) ela mora em votai.piluvitu.com.br, que também fica fora, histórico incluso.
describe('foraDaVotacao', () => {
  it.each([
    'https://piluvitu.com.br/votacao',
    'https://piluvitu.com.br/votacao/',
    'https://piluvitu.com.br/votacao/3f2c',
    'https://piluvitu.com.br/votacao/admin',
    'https://piluvitu.com.br/votacao?sessao=1',
    'https://votai.piluvitu.com.br/',
    'https://votai.piluvitu.com.br/12',
    'https://votai.piluvitu.com.br/anteriores',
    'https://votai.piluvitu.com.br/anteriores/3',
    'http://votai.localhost:3333/',
  ])('descarta %s', (url) => {
    expect(foraDaVotacao(evento(url))).toBeNull()
  })

  it.each([
    'https://piluvitu.com.br/',
    'https://piluvitu.com.br/posts/um-post',
    'https://piluvitu.com.br/tools/roleta',
    'https://piluvitu.com.br/votacao-velha',
    'https://piluvitu.com.br/pilulabs?votacao=1',
    'https://piluvitu.com.br/anteriores',
    'https://botai.pilutech.com.br/votai.html',
  ])('mantém %s, sem mudar o evento', (url) => {
    const original = evento(url)
    expect(foraDaVotacao(original)).toBe(original)
  })

  it('serve ao evento do Speed Insights, que também tem url', () => {
    const vital = {
      type: 'vital',
      url: 'https://piluvitu.com.br/votacao/admin',
    }
    expect(foraDaVotacao(vital)).toBeNull()
  })
})
