import { readFileSync } from 'node:fs'
import path from 'node:path'

// O editor de documento da Keystatic (admin) roda sobre o ProseMirror, que vem só
// como dependência transitiva do @keystatic/core. Duas travas:
// - a versão do prosemirror-view tem a correção do XSS no colar (CVE-2026-104847,
//   high, corrigido na 1.42.3; alerta do Trivy em 2026-10-07);
// - uma única cópia no lockfile: o ProseMirror quebra em runtime com duas instâncias,
//   como o CodeMirror quebrou no PR #46 (ver mdx-editor.codemirror.test.ts).
const LOCKFILE = path.resolve(__dirname, '../../pnpm-lock.yaml')

function versoes(pacote: string): string[] {
  const escapado = pacote.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')
  const chave = new RegExp(`^  '?${escapado}@([^'(:]+)`, 'gm')
  const lock = readFileSync(LOCKFILE, 'utf8')
  return [...new Set([...lock.matchAll(chave)].map((m) => m[1]))].sort()
}

function peloMenos(versao: string, minima: string): boolean {
  const a = versao.split('.').map(Number)
  const b = minima.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return true
}

describe('ProseMirror do editor da Keystatic', () => {
  test('prosemirror-view tem uma única versão no lockfile', () => {
    expect(versoes('prosemirror-view')).toHaveLength(1)
  })

  test('prosemirror-view tem a correção do CVE-2026-104847 (1.42.3 ou mais nova)', () => {
    const [versao] = versoes('prosemirror-view')
    expect(peloMenos(versao, '1.42.3')).toBe(true)
  })
})
