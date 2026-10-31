import {
  halloweenSessionBody,
  isHalloweenSession,
  isRoletaSession,
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

describe('isRoletaSession', () => {
  it('sessão de Halloween nova (mode roleta) é roleta', () => {
    expect(
      isRoletaSession({
        SortOptionsJSON: JSON.stringify({ theme: 'halloween', mode: 'roleta' }),
      }),
    ).toBe(true)
  })

  it('sessão de Halloween antiga, sem mode, continua sendo votação', () => {
    expect(
      isRoletaSession({
        SortOptionsJSON: JSON.stringify({
          theme: 'halloween',
          categories: ['terror'],
          per_category: 8,
        }),
      }),
    ).toBe(false)
  })

  it('sessão comum ou JSON inválido não é roleta', () => {
    expect(isRoletaSession(base)).toBe(false)
    expect(isRoletaSession({ SortOptionsJSON: '{oops' })).toBe(false)
    expect(isRoletaSession({ SortOptionsJSON: 'null' })).toBe(false)
  })
})

describe('halloweenSessionBody', () => {
  it('só filmes, sem categoria (o ramielle usa a coluna Halloween), com o tema ligado', () => {
    expect(
      halloweenSessionBody({
        title: 'Noite de Halloween',
        includeWatched: false,
      }),
    ).toEqual({
      title: 'Noite de Halloween',
      types: ['filme'],
      include_watched: false,
      categories: [],
      theme: 'halloween',
    })
  })

  it('repassa "incluir já assistidos"', () => {
    expect(
      halloweenSessionBody({ title: 't', includeWatched: true })
        .include_watched,
    ).toBe(true)
  })
})
