import { SITE_PATH_PREFIX, sitePath } from './site-paths'

describe('site-paths', () => {
  it('prefixes web-app paths with the monorepo root', () => {
    expect(SITE_PATH_PREFIX).toBe('apps/web')
    expect(sitePath('content/pilulabs')).toBe('apps/web/content/pilulabs')
    expect(sitePath('content/site/profile/index.yaml')).toBe(
      'apps/web/content/site/profile/index.yaml',
    )
    expect(sitePath('public/media')).toBe('apps/web/public/media')
  })
})
