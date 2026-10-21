import { halloweenSessionBody, isHalloweenSession } from './halloween'

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

  it('reconhece pelo título (sessões criadas antes do tema existir)', () => {
    expect(isHalloweenSession({ ...base, Title: 'Noite de HALLOWEEN' })).toBe(
      true,
    )
    expect(isHalloweenSession({ ...base, Title: '🎃 Sessão de sexta' })).toBe(true)
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
  it('sorteia só filmes de terror e suspense, com o tema ligado', () => {
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
      categories: ['terror', 'suspense'],
      per_category: 4,
      theme: 'halloween',
    })
  })

  it('prende per_category entre 1 e 5, o teto aceito pelo ramielle', () => {
    const corpo = (perCategory: number) =>
      halloweenSessionBody({ title: 't', includeWatched: false, perCategory })
        .per_category
    expect(corpo(0)).toBe(1)
    expect(corpo(9)).toBe(5)
  })
})
