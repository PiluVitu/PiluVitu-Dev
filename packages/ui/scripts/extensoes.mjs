import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ESPECIFICADOR_RELATIVO =
  /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g
const JA_TEM_EXTENSAO = /\.(m?js|cjs|json|css)$/

export function comExtensao(codigo) {
  return codigo.replace(
    ESPECIFICADOR_RELATIVO,
    (trecho, antes, aspas, caminho) =>
      JA_TEM_EXTENSAO.test(caminho)
        ? trecho
        : `${antes}${aspas}${caminho}.js${aspas}`,
  )
}

export function especificadoresRelativos(codigo) {
  return [...codigo.matchAll(ESPECIFICADOR_RELATIVO)].map((m) => m[3])
}

function arquivosDoBuild(pasta) {
  return readdirSync(pasta, { recursive: true, encoding: 'utf8' })
    .filter((arquivo) => arquivo.endsWith('.js') || arquivo.endsWith('.d.ts'))
    .map((arquivo) => join(pasta, arquivo))
}

export function reescreverPasta(pasta) {
  for (const arquivo of arquivosDoBuild(pasta))
    writeFileSync(arquivo, comExtensao(readFileSync(arquivo, 'utf8')))
}

export function importsQueNaoResolvem(pasta) {
  return arquivosDoBuild(pasta).flatMap((arquivo) =>
    especificadoresRelativos(readFileSync(arquivo, 'utf8'))
      .filter((caminho) => !existsSync(resolve(dirname(arquivo), caminho)))
      .map((caminho) => `${arquivo}: ${caminho}`),
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pasta = resolve(process.argv[2] ?? 'dist')
  reescreverPasta(pasta)
  const quebrados = importsQueNaoResolvem(pasta)
  if (quebrados.length > 0) {
    console.error(
      `[extensoes] import relativo sem arquivo no build:\n${quebrados.join('\n')}`,
    )
    process.exit(1)
  }
}
