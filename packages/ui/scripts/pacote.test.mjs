import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { importsQueNaoResolvem } from './extensoes.mjs'

const PACOTE = join(dirname(fileURLToPath(import.meta.url)), '..')
const FONTE = JSON.parse(readFileSync(join(PACOTE, 'package.json'), 'utf8'))
const MODULOS = Object.keys(FONTE.exports)
  .filter((subpath) => subpath !== './styles.css')
  .map((subpath) => subpath.slice(2))
const ESPERADOS = [
  'LICENSE',
  'README.md',
  'package.json',
  'dist/styles.css',
  ...MODULOS.flatMap((m) => [`dist/${m}.d.ts`, `dist/${m}.js`]),
].sort()

// O pnpm pack aplica o publishConfig.exports (o npm pack não aplicaria) e roda o prepack (o build).
const pnpm = (...args) =>
  JSON.parse(execFileSync('pnpm', args, { cwd: PACOTE, encoding: 'utf8' }))

let pasta
let publicado

before(() => {
  pasta = mkdtempSync(join(tmpdir(), 'ui-pacote-'))
  const { filename } = pnpm('pack', '--json', '--pack-destination', pasta)
  execFileSync('tar', ['-xzf', filename, '-C', pasta])
  publicado = JSON.parse(
    readFileSync(join(pasta, 'package', 'package.json'), 'utf8'),
  )
})

after(() => rmSync(pasta, { recursive: true, force: true }))

test('o pnpm pack --dry-run leva só o build, a licença e o README', () => {
  const { files } = pnpm('pack', '--dry-run', '--json')
  assert.deepEqual(files.map((arquivo) => arquivo.path).sort(), ESPERADOS)
})

test('o manifesto publicado aponta cada subpath para o build', () => {
  assert.equal(publicado.private, undefined)
  assert.equal(publicado.license, 'MIT')
  assert.deepEqual(publicado.publishConfig, { access: 'public' })
  assert.equal(
    publicado.repository.url,
    'git+https://github.com/PiluVitu/PiluVitu-Dev.git',
  )
  assert.equal(publicado.exports['./styles.css'], './dist/styles.css')
  for (const m of MODULOS)
    assert.deepEqual(publicado.exports[`./${m}`], {
      types: `./dist/${m}.d.ts`,
      default: `./dist/${m}.js`,
    })
})

// Sem o literal no dist, um app que consome o pacote do npm reprova no gate do @source.
test('o build publicado carrega a sentinela do gate', () => {
  const [, nome] = /@utility\s+([\w-]*sentinela[\w-]*)/.exec(
    readFileSync(join(PACOTE, 'src', 'styles.css'), 'utf8'),
  )
  const dist = join(pasta, 'package', 'dist')
  assert.ok(readFileSync(join(dist, 'cn.js'), 'utf8').includes(nome))
  assert.ok(
    readFileSync(join(dist, 'styles.css'), 'utf8').includes(`@utility ${nome}`),
  )
})

test('todo import relativo do build aponta para um arquivo do pacote', () => {
  assert.deepEqual(importsQueNaoResolvem(join(pasta, 'package', 'dist')), [])
})

test('cada subpath carrega no Node como ESM', async () => {
  for (const m of MODULOS)
    await import(pathToFileURL(join(PACOTE, 'dist', `${m}.js`)).href)
})
