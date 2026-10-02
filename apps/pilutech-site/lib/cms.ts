import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fase, urlsDasLojas, type Fase } from '@piluvitu/tools/pilulabs'
import { parse } from 'yaml'

// Lido no build (a página é estática): o dono publica as lojas do Botaí pelo /admin/pilulabs do apps/web.
export const ITEM_DO_BOTAI = join(
  process.cwd(),
  '..',
  'web',
  'content',
  'pilulabs',
  'botai',
  'index.yaml',
)

export function lerFaseDoBotai(
  caminho: string = process.env.BOTAI_CMS_ITEM || ITEM_DO_BOTAI,
): Fase {
  return fase(urlsDasLojas(parse(readFileSync(caminho, 'utf8'))))
}
