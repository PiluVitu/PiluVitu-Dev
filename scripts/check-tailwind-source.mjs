#!/usr/bin/env node
/**
 * Gate: confirma que o CSS emitido por um app contém a classe sentinela
 * definida em `packages/ui/src/styles.css` (`@utility ui-sentinela-nao-remover`).
 *
 * Por que isso importa: a sentinela só é emitida no CSS final se o scanner
 * de conteúdo do Tailwind v4 enxergar o literal `ui-sentinela-nao-remover`
 * em algum arquivo varrido — hoje esse literal mora num comentário em
 * `packages/ui/src/cn.ts`. O scanner só varre esse arquivo se o CSS de
 * entrada do app declarar `@source '<caminho para packages/ui/src>'`. Se
 * esse `@source` estiver ausente ou apontando pro lugar errado, o Tailwind
 * não quebra o build — ele silenciosamente descarta TODA classe que só
 * existe em `packages/ui` (não só a sentinela). Em produção isso significa
 * componentes do design system compartilhado renderizando sem estilo.
 *
 * Uso:
 *   node scripts/check-tailwind-source.mjs <diretório-ou-glob-de-css>
 *
 * Exemplos:
 *   node scripts/check-tailwind-source.mjs apps/web/.next
 *   node scripts/check-tailwind-source.mjs "apps/financas/web/dist/assets/*.css"
 *
 * Saída: silêncio + exit 0 se a sentinela foi encontrada.
 *        Mensagem de diagnóstico + exit 1 caso contrário (sentinela ausente,
 *        nenhum CSS encontrado, ou diretório/arquivo inexistente).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

const SENTINEL_SELECTOR = '.ui-sentinela-nao-remover'
const SENTINEL_SOURCE = 'packages/ui/src'

function usageAndExit() {
  console.error(
    [
      'Uso: node scripts/check-tailwind-source.mjs <diretório-ou-glob-de-css>',
      '',
      'Exemplos:',
      '  node scripts/check-tailwind-source.mjs apps/web/.next',
      '  node scripts/check-tailwind-source.mjs "apps/financas/web/dist/assets/*.css"',
    ].join('\n'),
  )
  process.exit(1)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function isGlobPattern(pathArg) {
  return /[*?[\]]/.test(pathArg)
}

function globSegmentToRegExp(segment) {
  const escaped = segment
    .replace(/[.+^${}()|\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

function missingDirMessage(dir) {
  return [
    `[check-tailwind-source] Diretório não existe: ${dir}`,
    '',
    'O build do app rodou antes deste gate? Este script espera o output já',
    'gerado (ex.: `next build`, `vite build`) — rode o build primeiro.',
  ].join('\n')
}

/** Resolve o argumento (diretório ou glob simples de um nível) numa lista de arquivos .css */
function resolveCssFiles(pathArg) {
  const absPathArg = resolve(process.cwd(), pathArg)

  if (isGlobPattern(pathArg)) {
    const dir = dirname(absPathArg)
    const filePattern = absPathArg.slice(dir.length + 1)
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (err) {
      if (err.code === 'ENOENT') fail(missingDirMessage(dir))
      throw err
    }
    const regex = globSegmentToRegExp(filePattern)
    return entries
      .filter(
        (e) => e.isFile() && e.name.endsWith('.css') && regex.test(e.name),
      )
      .map((e) => join(dir, e.name))
  }

  let stat
  try {
    stat = statSync(absPathArg)
  } catch (err) {
    if (err.code === 'ENOENT') fail(missingDirMessage(absPathArg))
    throw err
  }

  if (stat.isFile()) {
    return absPathArg.endsWith('.css') ? [absPathArg] : []
  }

  // Diretório: busca recursiva por *.css, ignorando node_modules/cache/dev
  // (não são output real — ruído de dependências/cache de build/chunks de
  // `next dev`, ver M4 abaixo).
  let entries
  try {
    entries = readdirSync(absPathArg, { withFileTypes: true, recursive: true })
  } catch (err) {
    if (err.code === 'ENOENT') fail(missingDirMessage(absPathArg))
    throw err
  }

  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.css'))
    .map((e) => join(e.parentPath ?? e.path ?? absPathArg, e.name))
    .filter((p) => !p.split(sep).includes('node_modules'))
    .filter((p) => !p.split(sep).includes('cache'))
    .filter((p) => !p.split(sep).includes('dev')) // M4, ver nota abaixo
}

// M4 (fix final): a varredura recursiva ignorava `node_modules`/`cache`
// mas NÃO `dev` — `.next/dev/static/css/app/...` é onde o Next guarda o
// CSS de uma sessão de `next dev` ANTERIOR (persiste entre execuções,
// não é limpo por `next build`). PROVADO: um `.next/dev/.../layout.css`
// remanescente, contendo a sentinela (de um `next dev` rodado com
// `@source` correto), somado a um `.next/static/.../layout.css` real
// SEM a sentinela (simulando `@source` quebrado no build atual) dava
// exit 0 — porque `cssFiles.some(...)` bastava UM arquivo bater, e o
// arquivo velho de `dev/` sempre batia. CI e Vercel não são afetados
// (checkout limpo, sem `.next/dev` de sessão anterior nenhuma) — o alvo
// era o run LOCAL, exatamente o que um dev roda logo depois de mexer em
// `@source`, achando que está confirmando o build atual quando na
// verdade está lendo lixo de uma sessão de dev antiga. Filtro por
// SEGMENTO de path (`dev`, não substring) — mais genérico que apontar
// só pra `.next/static`, cobre qualquer chamada futura do gate contra um
// diretório `.next` inteiro.

function sentinelMissingMessage(pathArg, cssFiles) {
  const checkedList =
    cssFiles.length > 0
      ? cssFiles.map((f) => `    - ${f}`).join('\n')
      : '    (nenhum arquivo .css encontrado)'

  return [
    `[check-tailwind-source] Classe sentinela ausente no CSS emitido de "${pathArg}".`,
    '',
    `O que está errado: o \`@source\` do app não está alcançando \`${SENTINEL_SOURCE}\`.`,
    'O scanner de conteúdo do Tailwind v4 não varreu esse diretório, então TODA',
    'classe que só existe em packages/ui (não só a sentinela) foi descartada',
    'silenciosamente do CSS final. Em produção, qualquer componente do design',
    'system compartilhado (@piluvitu/ui) vai renderizar sem estilo.',
    '',
    'Como conferir:',
    '  1. No CSS de entrada do app, confirme as linhas (nesta ordem):',
    "       @import 'tailwindcss';",
    "       @import '@piluvitu/ui/styles.css';",
    `       @source '<caminho relativo para>/${SENTINEL_SOURCE}';`,
    '  2. Conte os `../` do `@source` a partir do diretório onde o CSS de',
    '     entrada mora até a raiz do monorepo — um nível a mais ou a menos',
    '     aponta pro lugar errado sem erro nenhum de build.',
    '  3. Rode o build de novo e re-rode este gate:',
    `       node scripts/check-tailwind-source.mjs ${pathArg}`,
    '',
    `Classe procurada: ${SENTINEL_SELECTOR} (definida em ${SENTINEL_SOURCE}/styles.css)`,
    'Arquivos .css verificados:',
    checkedList,
  ].join('\n')
}

function main() {
  const pathArg = process.argv[2]
  if (!pathArg) usageAndExit()

  const cssFiles = resolveCssFiles(pathArg)

  if (cssFiles.length === 0) {
    fail(sentinelMissingMessage(pathArg, cssFiles))
  }

  const found = cssFiles.some((file) =>
    readFileSync(file, 'utf8').includes(SENTINEL_SELECTOR),
  )

  if (!found) {
    fail(sentinelMissingMessage(pathArg, cssFiles))
  }

  // Sucesso: silêncio, exit 0.
}

main()
