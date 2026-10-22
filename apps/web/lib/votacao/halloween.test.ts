import {
  categoriasDisponiveis,
  halloweenSessionBody,
  isHalloweenSession,
} from './halloween'

const base = { Title: 'Sexta 22/05', SortOptionsJSON: '{}' }

describe('isHalloweenSession', () => {
  it('reconhece o tema gravado nas opções do sorteio', () => {
    expect(
      isHalloweenSession({
        ...base,
        SortOptionsJSON: JSON.stringify({ theme: 'halloween' }),
      }),
    ).toBe(true)
  })

  it('o título sozinho não liga o tema: só a flag escolhida na criação', () => {
    for (const Title of ['Noite de HALLOWEEN', '🎃 Sessão de sexta']) {
      const sessao = { ...base, Title }
      expect(isHalloweenSession(sessao)).toBe(false)
    }
  })

  it('sessão comum não é de Halloween', () => {
    expect(isHalloweenSession(base)).toBe(false)
  })

  it('SortOptionsJSON inválido não quebra, só não é de Halloween', () => {
    expect(isHalloweenSession({ ...base, SortOptionsJSON: '{oops' })).toBe(
      false,
    )
    expect(isHalloweenSession({ ...base, SortOptionsJSON: 'null' })).toBe(false)
  })
})

describe('halloweenSessionBody', () => {
  it('por padrão sorteia só filmes da categoria terror, com o tema ligado', () => {
    expect(
      halloweenSessionBody({
        title: 'Noite de Halloween',
        includeWatched: false,
        perCategory: 4,
      }),
    ).toEqual({
      title: 'Noite de Halloween',
      types: ['filme'],
      include_watched: false,
      categories: ['terror'],
      per_category: 4,
      theme: 'halloween',
    })
  })

  it('usa as categorias escolhidas no formulário', () => {
    expect(
      halloweenSessionBody({
        title: 't',
        includeWatched: false,
        perCategory: 2,
        categories: ['terror', 'suspense'],
      }).categories,
    ).toEqual(['terror', 'suspense'])
  })

  it('prende per_category entre 1 e 10, o teto aceito pelo ramielle', () => {
    const corpo = (perCategory: number) =>
      halloweenSessionBody({ title: 't', includeWatched: false, perCategory })
        .per_category
    expect(corpo(0)).toBe(1)
    expect(corpo(15)).toBe(10)
  })
})

describe('categoriasDisponiveis', () => {
  it('junta terror às categorias da planilha, sem repetir', () => {
    expect(categoriasDisponiveis(['drama', 'terror'])).toEqual([
      'terror',
      'drama',
    ])
  })

  it('sem planilha (ou antes de carregar), oferece só terror', () => {
    expect(categoriasDisponiveis()).toEqual(['terror'])
  })
})
