export type DiffSegment = { type: 'equal' | 'add' | 'remove'; value: string }

/** Tokeniza preservando os espaços como tokens próprios (p/ reconstrução fiel). */
function tokenize(s: string): string[] {
  return s.match(/\s+|\S+/g) ?? []
}

/**
 * wordDiff devolve segmentos para renderizar um diff inline:
 * - 'equal' aparece nos dois textos
 * - 'remove' só no original
 * - 'add' só no corrigido
 * Algoritmo: LCS clássico (matriz) sobre tokens.
 */
export function wordDiff(original: string, corrected: string): DiffSegment[] {
  const a = tokenize(original)
  const b = tokenize(corrected)
  const m = a.length
  const n = b.length

  // matriz LCS (m+1)x(n+1)
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  )
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffSegment[] = []
  const push = (type: DiffSegment['type'], value: string) => {
    const last = out[out.length - 1]
    if (last && last.type === type) last.value += value
    else out.push({ type, value })
  }

  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push('equal', a[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push('remove', a[i])
      i++
    } else {
      push('add', b[j])
      j++
    }
  }
  while (i < m) push('remove', a[i++])
  while (j < n) push('add', b[j++])
  return out
}

/** Uma correção pontual: o que a LLM trocou (`before` → `after`). */
export type Correction = { before: string; after: string }

/**
 * extractCorrections resume o diff numa lista de correções "antes → depois".
 * Agrupa runs consecutivos de remove/add (delimitados pelos `equal`) numa
 * correção. before vazio = adição pura; after vazio = remoção pura. Correções
 * que sobram só com espaço em branco (após trim) são descartadas (ruído).
 */
export function extractCorrections(segments: DiffSegment[]): Correction[] {
  const out: Correction[] = []
  let before = ''
  let after = ''
  const flush = () => {
    const b = before.trim()
    const a = after.trim()
    if (b !== '' || a !== '') out.push({ before: b, after: a })
    before = ''
    after = ''
  }
  for (const s of segments) {
    if (s.type === 'equal') flush()
    else if (s.type === 'remove') before += s.value
    else after += s.value
  }
  flush()
  return out
}
