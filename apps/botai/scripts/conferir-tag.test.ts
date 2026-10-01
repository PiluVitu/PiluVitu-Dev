// @vitest-environment node
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { criarRepoDeTeste, type RepoDeTeste } from './repo-de-teste'

const SCRIPT = path.resolve(import.meta.dirname, 'conferir-tag.sh')
let repo: RepoDeTeste

beforeEach(() => {
  repo = criarRepoDeTeste('1.0.0')
})
afterEach(() => repo.fechar())

it('aceita botai-v<versão do package.json> num commit da main', () => {
  const { status, saida } = repo.rodar(SCRIPT, [
    'botai-v1.0.0',
    repo.git('rev-parse', 'HEAD'),
  ])
  expect(saida).toContain('Tag botai-v1.0.0 confere')
  expect(status).toBe(0)
})

it('recusa a tag que não bate com a versão do package.json', () => {
  const { status, saida } = repo.rodar(SCRIPT, [
    'botai-v1.0.1',
    repo.git('rev-parse', 'HEAD'),
  ])
  expect(status).toBe(1)
  expect(saida).toContain(
    '::error::A tag botai-v1.0.1 não bate com a versão de apps/botai/package.json (esperado botai-v1.0.0)',
  )
})

it('recusa a tag num commit que não está na main', () => {
  repo.git('switch', '--quiet', '-c', 'feat/x')
  repo.git('commit', '--quiet', '--allow-empty', '-m', 'fora da main')
  const { status, saida } = repo.rodar(SCRIPT, [
    'botai-v1.0.0',
    repo.git('rev-parse', 'HEAD'),
  ])
  expect(status).toBe(1)
  expect(saida).toContain('não está na main')
})

it('aceita o objeto de uma tag anotada no lugar do commit', () => {
  repo.git('tag', '-a', 'botai-v1.0.0', '-m', 'Botaí 1.0.0')
  const { status } = repo.rodar(SCRIPT, [
    'botai-v1.0.0',
    repo.git('rev-parse', 'botai-v1.0.0'),
  ])
  expect(status).toBe(0)
})
