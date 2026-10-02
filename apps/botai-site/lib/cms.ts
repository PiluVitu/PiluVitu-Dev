import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UrlsDasLojas } from '@piluvitu/tools/pilulabs'
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

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : ''
}

export function lerUrlsDasLojas(
  caminho: string = process.env.BOTAI_CMS_ITEM || ITEM_NO_CMS,
): UrlsDasLojas {
  const bruto: unknown = parse(readFileSync(caminho, 'utf8'))
  const item =
    typeof bruto === 'object' && bruto !== null
      ? (bruto as Record<string, unknown>)
      : {}
  return {
    chromeUrl: texto(item.chromeUrl),
    firefoxUrl: texto(item.firefoxUrl),
    edgeUrl: texto(item.edgeUrl),
    operaUrl: texto(item.operaUrl),
  }
}
