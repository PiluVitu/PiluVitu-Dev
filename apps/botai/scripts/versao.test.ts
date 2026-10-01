// @vitest-environment node
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { criarRepoDeTeste, type RepoDeTeste } from './repo-de-teste'

const SCRIPT = path.resolve(import.meta.dirname, 'versao.sh')
let repo: RepoDeTeste

beforeEach(() => {
  repo = criarRepoDeTeste('1.0.0')
})
afterEach(() => repo.fechar())

it('abre o PR de versão: branch da origin/main, só o package.json, sem tag', () => {
  const { status, saida } = repo.rodar(SCRIPT, ['1.1.0'])
  expect(saida).not.toContain('::error')
  expect(status).toBe(0)
  const ramo = 'chore/botai-v1.1.0'
  expect(repo.gitDaOrigem('log', '-1', '--format=%s', ramo)).toBe(
    'chore(botai): versão 1.1.0',
  )
  expect(
    repo.gitDaOrigem('diff', '--name-only', 'main', ramo).split('\n'),
  ).toEqual(['apps/botai/package.json'])
  expect(
    JSON.parse(repo.gitDaOrigem('show', `${ramo}:apps/botai/package.json`))
      .version,
  ).toBe('1.1.0')
  expect(repo.gitDaOrigem('tag', '--list')).toBe('')
  expect(repo.argsDoGh()).toEqual([
    'pr',
    'create',
    '--base',
    'main',
    '--head',
    ramo,
    '--title',
    'chore(botai): versão 1.1.0',
    '--body',
    'Sobe o Botaí para 1.1.0. Depois do merge, na main: make release-botai.',
  ])
})

it.each([['1.1'], ['v1.1.0'], ['1.1.0-beta.1']])(
  'recusa V=%s, que não é x.y.z',
  (v) => {
    const { status, saida } = repo.rodar(SCRIPT, [v])
    expect(status).toBe(1)
    expect(saida).toContain('não é x.y.z')
    expect(repo.argsDoGh()).toBeNull()
  },
)

it.each([['1.0.0'], ['0.9.9']])(
  'recusa V=%s, que não sobe a versão da main',
  (v) => {
    const { status, saida } = repo.rodar(SCRIPT, [v])
    expect(status).toBe(1)
    expect(saida).toContain('precisa ser maior que a versão da main (1.0.0)')
  },
)

it('compara pela origin/main, não pela branch local', () => {
  repo.git('switch', '--quiet', '-c', 'feat/x')
  repo.escreverVersao('3.0.0')
  repo.git('commit', '--quiet', '-am', 'versão local')
  expect(repo.rodar(SCRIPT, ['1.0.1']).status).toBe(0)
})

it('recusa árvore suja', () => {
  writeFileSync(path.join(repo.trabalho, 'rascunho.txt'), 'x')
  const { status, saida } = repo.rodar(SCRIPT, ['1.1.0'])
  expect(status).toBe(1)
  expect(saida).toContain('mudanças não commitadas')
})
