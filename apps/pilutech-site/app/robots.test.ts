import robots from './robots'

const SITE_URL_ORIGINAL = process.env.SITE_URL
beforeEach(() => {
  delete process.env.SITE_URL
})
afterAll(() => {
  if (SITE_URL_ORIGINAL !== undefined) process.env.SITE_URL = SITE_URL_ORIGINAL
})

it('libera tudo e aponta o sitemap', () => {
  expect(robots()).toEqual({
    rules: { userAgent: '*', allow: '/' },
    sitemap: 'https://pilutech.com.br/sitemap.xml',
  })
})
