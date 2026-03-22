import 'server-only'

import { createReader } from '@keystatic/core/reader'
import { createGitHubReader } from '@keystatic/core/reader/github'
import { cache } from 'react'
import keystaticConfig, { getGithubRepoSlash } from '../keystatic.config'
import { cookies, draftMode } from 'next/headers'

/**
 * Em draft mode com cookie `ks-branch`, lê conteúdo direto do GitHub (ramo de
 * trabalho do Keystatic). Caso contrário usa ficheiros do deploy — ver:
 * https://keystatic.com/docs/recipes/real-time-previews
 */
export const getKeystaticReader = cache(async () => {
  const { isEnabled } = await draftMode()
  if (!isEnabled) {
    return createReader(process.cwd(), keystaticConfig)
  }

  const cookieStore = await cookies()
  const branch = cookieStore.get('ks-branch')?.value
  if (!branch) {
    return createReader(process.cwd(), keystaticConfig)
  }

  const token = cookieStore.get('keystatic-gh-access-token')?.value

  return createGitHubReader(keystaticConfig, {
    repo: getGithubRepoSlash(),
    ref: branch,
    token,
  })
})
