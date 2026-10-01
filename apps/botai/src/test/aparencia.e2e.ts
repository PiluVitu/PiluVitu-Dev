import { expect, test } from './extensao.fixture'

const lerAparencia = () => ({
  escuro: matchMedia('(prefers-color-scheme: dark)').matches,
  escala: devicePixelRatio,
})

test('sem test.use, o contexto da extensão abre claro e a 1x', async ({
  context,
}) => {
  const pagina = await context.newPage()
  expect(await pagina.evaluate(lerAparencia)).toEqual({
    escuro: false,
    escala: 1,
  })
})

test.describe('com aparencia escura a 2x', () => {
  test.use({ aparencia: { tema: 'escuro', escala: 2 } })

  test('o contexto persistente recebe o tema e a escala', async ({
    context,
  }) => {
    const pagina = await context.newPage()
    expect(await pagina.evaluate(lerAparencia)).toEqual({
      escuro: true,
      escala: 2,
    })
  })
})
