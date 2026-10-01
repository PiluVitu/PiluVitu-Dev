// @vitest-environment node
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { criarRepoDeTeste, type RepoDeTeste } from './repo-de-teste'

const SCRIPT = path.resolve(import.meta.dirname, 'release.sh')
let repo: RepoDeTeste

beforeEach(() => {
  repo = criarRepoDeTeste('1.0.0')
})
afterEach(() => repo.fechar())

it('cria a tag anotada botai-v<versão> no HEAD da main e a envia à origem', () => {
  const { status, saida } = repo.rodar(SCRIPT)
  expect(saida).toContain('Tag botai-v1.0.0 enviada')
  expect(status).toBe(0)
  expect(repo.gitDaOrigem('cat-file', '-t', 'botai-v1.0.0')).toBe('tag')
  expect(repo.gitDaOrigem('rev-parse', 'botai-v1.0.0^{commit}')).toBe(
    repo.git('rev-parse', 'origin/main'),
  )
  expect(
    repo.gitDaOrigem(
      'for-each-ref',
      '--format=%(contents:subject)',
      'refs/tags/botai-v1.0.0',
    ),
  ).toBe('Botaí 1.0.0')
})

it('recusa quando o HEAD não é a origin/main', () => {
  repo.git('commit', '--quiet', '--allow-empty', '-m', 'só local')
  const { status, saida } = repo.rodar(SCRIPT)
  expect(status).toBe(1)
  expect(saida).toContain('HEAD não é a origin/main')
  expect(repo.gitDaOrigem('tag', '--list')).toBe('')
})

it('recusa quando a tag já existe na origem', () => {
  expect(repo.rodar(SCRIPT).status).toBe(0)
  repo.git('tag', '-d', 'botai-v1.0.0')
  const { status, saida } = repo.rodar(SCRIPT)
  expect(status).toBe(1)
  expect(saida).toContain('A tag botai-v1.0.0 já existe')
})

it('recusa árvore suja', () => {
  writeFileSync(path.join(repo.trabalho, 'rascunho.txt'), 'x')
  const { status, saida } = repo.rodar(SCRIPT)
  expect(status).toBe(1)
  expect(saida).toContain('mudanças não commitadas')
})
