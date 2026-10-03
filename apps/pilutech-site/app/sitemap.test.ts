import sitemap from './sitemap'

const SITE_URL_ORIGINAL = process.env.SITE_URL
beforeEach(() => {
  delete process.env.SITE_URL
})
afterAll(() => {
  if (SITE_URL_ORIGINAL !== undefined) process.env.SITE_URL = SITE_URL_ORIGINAL
})

it('lista a página única, no domínio de produção', () => {
  expect(sitemap()).toEqual([{ url: 'https://pilutech.com.br/' }])
})
