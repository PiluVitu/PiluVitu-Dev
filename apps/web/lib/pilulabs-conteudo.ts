import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import {
  normalizarProduto,
  type EntradaProduto,
  type Produto,
} from './pilulabs'

// Lê o YAML sem o Keystatic, cujo reader exige `server-only` e `draftMode`.
// É assim que o Jest e o Playwright derivam o esperado do mesmo catálogo.
export function lerProdutosDoConteudo(raizWeb: string): Produto[] {
  const pasta = join(raizWeb, 'content', 'produtos')
  if (!existsSync(pasta)) return []
  return readdirSync(pasta, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => {
      const bruto = readFileSync(
        join(pasta, entrada.name, 'index.yaml'),
        'utf8',
      )
      return normalizarProduto(
        entrada.name,
        (parse(bruto) ?? {}) as EntradaProduto,
      )
    })
    .sort((a, b) => a.order - b.order)
}

export function rotasObrigatorias(slug: string): string[] {
  return [
    `app/(site)/pilulabs/${slug}/page.tsx`,
    `app/(site)/pilulabs/${slug}/privacidade/page.tsx`,
  ]
}

export function rotasFaltando(
  produtos: Pick<Produto, 'slug' | 'listado'>[],
  existe: (caminhoNaRaizWeb: string) => boolean,
): string[] {
  return produtos
    .filter((p) => p.listado)
    .flatMap((p) => rotasObrigatorias(p.slug))
    .filter((caminho) => !existe(caminho))
}
