#!/usr/bin/env node
/**
 * Gate: confirma que `recharts` (o gráfico do bloco Comprometido da home,
 * `apps/financas/web/src/blocos/GraficoComprometido.tsx`) está de fato
 * isolado num chunk carregado sob demanda — ausente do chunk de entrada
 * (o que roda na primeira pintura de QUALQUER tela da SPA) e presente em
 * pelo menos um chunk que só o entry point referencia via `import()`.
 *
 * Por que isso importa: `GraficoComprometido.tsx` só é importado via
 * `lazy(() => import('./GraficoComprometido'))` dentro de
 * `BlocoComprometido.tsx` — de propósito, porque `recharts` pesa
 * ~104 KB gzip medidos. Um refactor que trocar esse `lazy()` por um
 * `import` estático (ex.: alguém "simplificando" o código nas Tasks 7/8,
 * que mexem na mesma pasta) faz esse peso inteiro entrar no bundle
 * principal, carregado em TODA tela — inclusive `#/contas`, que nunca
 * mostra gráfico nenhum — sem quebrar nenhum teste unitário: o Suspense
 * dentro de `BlocoComprometido` continua se comportando do mesmo jeito
 * do ponto de vista de quem só olha o DOM (o `report` ainda gate a
 * montagem, `queryByTestId('grafico-comprometido')` some/aparece na
 * mesma ordem), porque o teste de unidade não tem visibilidade sobre
 * fronteira de bundle nenhuma — só o `vite build` real tem.
 *
 * Marcador usado: a string `recharts-wrapper` — className hardcoded que
 * o próprio `recharts` aplica na `<div>` raiz de todo `BarChart`/gráfico
 * (`node_modules/recharts/.../Surface.js` e afins). É um literal de
 * código-fonte da lib, não algo que minificação remove ou renomeia
 * (minificadores não tocam em strings), e é específico o bastante para
 * não aparecer por acaso em outro código deste projeto — MEDIDO: 0
 * ocorrências no chunk de entrada e ≥1 no chunk isolado do gráfico, num
 * build limpo desta task.
 *
 * Uso:
 *   node scripts/check-financas-lazy-chart.mjs <diretório-de-dist>
 *
 * Exemplo:
 *   node scripts/check-financas-lazy-chart.mjs apps/financas/web/dist
 *
 * Saída: silêncio + exit 0 se o isolamento está correto.
 *        Mensagem de diagnóstico + exit 1 caso contrário (marcador no
 *        chunk de entrada, marcador ausente de todo chunk lazy, dist
 *        ausente, ou `index.html`/chunk de entrada não encontrado).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const MARKER = 'recharts-wrapper'

function usageAndExit() {
  console.error(
    [
      'Uso: node scripts/check-financas-lazy-chart.mjs <diretório-de-dist>',
      '',
      'Exemplo:',
      '  node scripts/check-financas-lazy-chart.mjs apps/financas/web/dist',
    ].join('\n'),
  )
  process.exit(1)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function missingDirMessage(dir) {
  return [
    `[check-financas-lazy-chart] Diretório não existe: ${dir}`,
    '',
    'O build da SPA rodou antes deste gate? Este script espera o output já',
    'gerado (`vite build`) — rode o build primeiro.',
  ].join('\n')
}

/** Extrai os `src` de todo `<script type="module" ... src="...">` do index.html. */
function entryScriptSrcs(html) {
  const srcs = []
  const scriptTagRe = /<script\b[^>]*>/gi
  for (const [tag] of html.matchAll(scriptTagRe)) {
    if (!/type=["']module["']/i.test(tag)) continue
    const srcMatch = /\bsrc=["']([^"']+)["']/i.exec(tag)
    if (srcMatch) srcs.push(srcMatch[1])
  }
  return srcs
}

/** Lista recursiva de `.js` sob `dir`, ignorando node_modules/cache (ruído, não output real). */
function listJsFiles(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true, recursive: true })
  } catch (err) {
    if (err.code === 'ENOENT') fail(missingDirMessage(dir))
    throw err
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => join(e.parentPath ?? e.path ?? dir, e.name))
    .filter((p) => !p.includes('node_modules') && !p.includes('/cache/'))
}

function main() {
  const distArg = process.argv[2]
  if (!distArg) usageAndExit()

  const distDir = resolve(process.cwd(), distArg)

  let stat
  try {
    stat = statSync(distDir)
  } catch (err) {
    if (err.code === 'ENOENT') fail(missingDirMessage(distDir))
    throw err
  }
  if (!stat.isDirectory()) fail(missingDirMessage(distDir))

  const indexPath = join(distDir, 'index.html')
  let html
  try {
    html = readFileSync(indexPath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      fail(
        [
          `[check-financas-lazy-chart] ${indexPath} não encontrado.`,
          'O `vite build` gerou o `index.html`? Sem ele não dá para saber',
          'qual chunk é o de ENTRADA (o que carrega em toda tela).',
        ].join('\n'),
      )
    }
    throw err
  }

  const entrySrcs = entryScriptSrcs(html)
  if (entrySrcs.length === 0) {
    fail(
      [
        `[check-financas-lazy-chart] Nenhum <script type="module" src="..."> encontrado em ${indexPath}.`,
        'Sem isso não dá para identificar o chunk de entrada da SPA.',
      ].join('\n'),
    )
  }

  // `src` no HTML é absoluto a partir da raiz do site (ex.: "/assets/index-X.js")
  // — resolve relativo à raiz do dist, não ao diretório do index.html (são o
  // mesmo diretório aqui, mas o strip do "/" inicial é o que importa).
  const entryFiles = entrySrcs
    .filter((src) => src.endsWith('.js'))
    .map((src) => join(distDir, src.replace(/^\//, '')))

  const allJsFiles = listJsFiles(distDir)
  const entrySet = new Set(entryFiles)
  const lazyFiles = allJsFiles.filter((f) => !entrySet.has(f))

  const entryHits = entryFiles.filter((f) => {
    let content
    try {
      content = readFileSync(f, 'utf8')
    } catch {
      return false
    }
    return content.includes(MARKER)
  })

  if (entryHits.length > 0) {
    fail(
      [
        `[check-financas-lazy-chart] "${MARKER}" (recharts) apareceu no chunk de ENTRADA:`,
        ...entryHits.map((f) => `    - ${f}`),
        '',
        'Isso significa que `recharts` está sendo carregado na primeira pintura',
        'de TODA tela da SPA, não só quando o bloco Comprometido monta o',
        'gráfico. O import precisa continuar dinâmico — confirme que',
        '`GraficoComprometido` só é referenciado via',
        "`lazy(() => import('./GraficoComprometido'))` em BlocoComprometido.tsx,",
        'nunca por um `import` estático no topo do arquivo.',
      ].join('\n'),
    )
  }

  const lazyHit = lazyFiles.some((f) => {
    let content
    try {
      content = readFileSync(f, 'utf8')
    } catch {
      return false
    }
    return content.includes(MARKER)
  })

  if (!lazyHit) {
    fail(
      [
        `[check-financas-lazy-chart] "${MARKER}" (recharts) não apareceu em NENHUM chunk lazy.`,
        '',
        'Chunks de entrada verificados:',
        ...entryFiles.map((f) => `    - ${f}`),
        'Chunks lazy verificados:',
        ...(lazyFiles.length > 0
          ? lazyFiles.map((f) => `    - ${f}`)
          : ['    (nenhum encontrado)']),
        '',
        'Isso pode significar que `recharts` sumiu do bundle (import removido',
        'sem querer) ou que o code-splitting parou de gerar um chunk separado',
        '— os dois quebram a garantia que este gate existe pra proteger.',
      ].join('\n'),
    )
  }

  // Sucesso: silêncio, exit 0.
}

main()
