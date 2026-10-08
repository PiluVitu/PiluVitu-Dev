import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  comExtensao,
  importsQueNaoResolvem,
  reescreverPasta,
} from './extensoes.mjs'

// O Node recusa import relativo sem extensão em ESM, e o webpack trata .js de
// pacote "type": "module" como fully specified: o dist publicado precisa do .js.
test('acrescenta .js aos imports relativos sem extensão', () => {
  assert.equal(
    comExtensao("import { cn } from './cn'"),
    "import { cn } from './cn.js'",
  )
  assert.equal(
    comExtensao('export * from "../base/tipos"'),
    'export * from "../base/tipos.js"',
  )
  assert.equal(comExtensao("import './efeito'"), "import './efeito.js'")
  assert.equal(
    comExtensao("const m = import('./tardio')"),
    "const m = import('./tardio.js')",
  )
  // O tsc escreve import("./x") nas posições de tipo dos .d.ts.
  assert.equal(
    comExtensao('type T = import("./cn").Tipo'),
    'type T = import("./cn.js").Tipo',
  )
})

test('não mexe em pacote nem em import que já tem extensão', () => {
  for (const codigo of [
    "import { clsx } from 'clsx'",
    "import { jsx } from 'react/jsx-runtime'",
    "import { cn } from './cn.js'",
    "import dados from './dados.json'",
    "import './estilo.css'",
  ])
    assert.equal(comExtensao(codigo), codigo)
})

test('reescreve .js e .d.ts da pasta e acusa o import que não tem arquivo', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'extensoes-'))
  try {
    writeFileSync(join(pasta, 'cn.js'), 'export const cn = 1\n')
    writeFileSync(
      join(pasta, 'botao.js'),
      "import { cn } from './cn'\nimport { x } from './sumiu'\n",
    )
    writeFileSync(join(pasta, 'botao.d.ts'), "export { cn } from './cn'\n")
    reescreverPasta(pasta)
    assert.equal(
      readFileSync(join(pasta, 'botao.d.ts'), 'utf8'),
      "export { cn } from './cn.js'\n",
    )
    assert.deepEqual(importsQueNaoResolvem(pasta), [
      `${join(pasta, 'botao.js')}: ./sumiu.js`,
    ])
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})
