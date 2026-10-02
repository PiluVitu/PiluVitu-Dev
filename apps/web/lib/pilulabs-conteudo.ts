import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { normalizarItem, type EntradaItem, type ItemPiluLabs } from './pilulabs'
import { ehDataValida, TIPOS } from '@piluvitu/tools/pilulabs'

const PASTA_DO_CONTEUDO = join('content', 'pilulabs')
const PASTA_DAS_ROTAS = join('app', '(site)', 'pilulabs')

const ehTexto = (valor: unknown) => typeof valor === 'string'
const ehBooleano = (valor: unknown) => typeof valor === 'boolean'

// O parse de cada campo do keystatic.config.ts (chave sem valor ele lê como
// ausente): o reader lança erro onde o normalizarItem só trocaria o valor.
const REGRAS_DO_READER = new Map<string, (valor: unknown) => boolean>([
  ['slug', ehTexto],
  ['order', Number.isInteger],
  ['nome', ehTexto],
  ['subtitulo', ehTexto],
  ['descricao', ehTexto],
  ['tipo', (valor) => TIPOS.some((tipo) => tipo === valor)],
  ['tags', (valor) => Array.isArray(valor) && valor.every(ehTexto)],
  ['logo', ehTexto],
  ['sigla', ehTexto],
  ['site', ehTexto],
  ['repo', ehTexto],
  ['chromeUrl', ehTexto],
  ['firefoxUrl', ehTexto],
  ['edgeUrl', ehTexto],
  ['operaUrl', ehTexto],
  ['destaque', ehBooleano],
  ['data', (valor) => typeof valor === 'string' && ehDataValida(valor)],
  ['listado', ehBooleano],
  ['paginaPropria', ehBooleano],
])

export function lerYamlsDoConteudo(raizWeb: string): Map<string, unknown> {
  const pasta = join(raizWeb, PASTA_DO_CONTEUDO)
  if (!existsSync(pasta)) return new Map()
  return new Map(
    readdirSync(pasta, { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory())
      .map((entrada) => [
        entrada.name,
        parse(readFileSync(join(pasta, entrada.name, 'index.yaml'), 'utf8')) ??
          {},
      ]),
  )
}

// Lê o YAML sem o Keystatic, cujo reader exige `server-only` e `draftMode`.
// É assim que o Jest e o Playwright derivam o esperado do mesmo catálogo.
export function lerItensDoConteudo(raizWeb: string): ItemPiluLabs[] {
  return [...lerYamlsDoConteudo(raizWeb)]
    .map(([slug, bruto]) => normalizarItem(slug, bruto as EntradaItem))
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
}

export function camposInvalidosNoYaml(bruto: unknown): string[] {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto))
    return ['(o arquivo inteiro)']
  return Object.entries(bruto)
    .filter(
      ([campo, valor]) =>
        valor !== null && REGRAS_DO_READER.get(campo)?.(valor) === false,
    )
    .map(([campo]) => campo)
}

export function rotasObrigatorias(
  item: Pick<ItemPiluLabs, 'slug' | 'tipo' | 'paginaPropria'>,
): string[] {
  if (!item.paginaPropria) return []
  const pasta = `app/(site)/pilulabs/${item.slug}`
  return item.tipo === 'extensao'
    ? [`${pasta}/page.tsx`, `${pasta}/privacidade/page.tsx`]
    : [`${pasta}/page.tsx`]
}

export function rotasFaltando(
  itens: Pick<ItemPiluLabs, 'slug' | 'tipo' | 'paginaPropria'>[],
  existe: (caminhoNaRaizWeb: string) => boolean,
): string[] {
  return itens.flatMap(rotasObrigatorias).filter((caminho) => !existe(caminho))
}

export function slugsComPaginaPropria(raizWeb: string): string[] {
  const pasta = join(raizWeb, PASTA_DAS_ROTAS)
  return readdirSync(pasta, { withFileTypes: true })
    .filter(
      (entrada) =>
        entrada.isDirectory() &&
        existsSync(join(pasta, entrada.name, 'page.tsx')),
    )
    .map((entrada) => entrada.name)
    .sort()
}

export function paginasSemItem(
  slugsDasPaginas: string[],
  itens: Pick<ItemPiluLabs, 'slug' | 'paginaPropria'>[],
): string[] {
  const comPagina = new Set(
    itens.filter((item) => item.paginaPropria).map((item) => item.slug),
  )
  return slugsDasPaginas.filter((slug) => !comPagina.has(slug))
}
