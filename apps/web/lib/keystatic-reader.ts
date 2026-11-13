import 'server-only'

import { createReader } from '@keystatic/core/reader'
import { createGitHubReader } from '@keystatic/core/reader/github'
import { cache } from 'react'
import keystaticConfig, { getGithubRepoSlash } from '../keystatic.config'
import { cookies } from 'next/headers'
import { previewAtivo } from '@/lib/preview'

/**
 * Com o preview de um admin ativo (ver lib/preview.ts), lê o conteúdo do GitHub no ramo selado.
 * Fora dele, os arquivos do deploy.
 */
export const getKeystaticReader = cache(async () => {
  const preview = await previewAtivo()
  if (!preview) {
    return createReader(process.cwd(), keystaticConfig)
  }

  const token = (await cookies()).get('keystatic-gh-access-token')?.value

  return createGitHubReader(keystaticConfig, {
    repo: getGithubRepoSlash(),
    ref: preview.branch,
    token,
  })
})
