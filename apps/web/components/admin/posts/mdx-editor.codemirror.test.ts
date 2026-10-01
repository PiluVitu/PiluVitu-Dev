import { readFileSync } from 'node:fs'
import path from 'node:path'

// O CodeMirror 6 exige UMA instância de @codemirror/state (e de @codemirror/view):
// com duas cópias no lockfile, as extensões de uma não são reconhecidas pela outra
// e o editor de posts quebra em runtime com "Unrecognized extension value in
// extension set". Foi o que aconteceu depois do `pnpm update -r` do PR #46, que
// subiu as cópias transitivas e deixou a direta para trás. O CI não roda o E2E do
// admin, então esta trava no Jest é o que pega a regressão.
const LOCKFILE = path.resolve(__dirname, '../../../../../pnpm-lock.yaml')

function versoes(pacote: string): string[] {
  const escapado = pacote.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')
  const chave = new RegExp(`^  '${escapado}@([^'(]+)`, 'gm')
  const lock = readFileSync(LOCKFILE, 'utf8')
  return [...new Set([...lock.matchAll(chave)].map((m) => m[1]))].sort()
}

describe('CodeMirror do editor de posts: uma só instância no lockfile', () => {
  test.each(['@codemirror/state', '@codemirror/view'])(
    '%s tem uma única versão',
    (pacote) => {
      expect(versoes(pacote)).toHaveLength(1)
    },
  )
})
