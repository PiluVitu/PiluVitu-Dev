import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { urlsDasLojas, type UrlsDasLojas } from '@piluvitu/tools/pilulabs'
import { parse } from 'yaml'

// Lido no build (a rota é estática): o dono edita este item do apps/web em /admin/pilulabs.
export const ITEM_NO_CMS = join(
  process.cwd(),
  '..',
  'web',
  'content',
  'pilulabs',
  'botai',
  'index.yaml',
)

export function lerUrlsDasLojas(
  caminho: string = process.env.BOTAI_CMS_ITEM || ITEM_NO_CMS,
): UrlsDasLojas {
  return urlsDasLojas(parse(readFileSync(caminho, 'utf8')))
}
