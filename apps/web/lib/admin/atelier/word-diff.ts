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

/**
 * DiffPart é um trecho ordenado que cobre o texto inteiro: `equal` (inalterado)
 * ou `change` (a LLM trocou `before` por `after`). Permite aceitar/rejeitar cada
 * mudança individualmente e reconstruir o texto exato (ver applyParts).
 */
export type DiffPart =
  | { kind: 'equal'; text: string }
  | { kind: 'change'; before: string; after: string }

/**
 * diffParts converte os segmentos do wordDiff em DiffParts. Runs consecutivos de
 * remove/add (delimitados pelos `equal`) viram uma única `change`. A concatenação
 * de `equal.text` + (`before` ou `after` de cada `change`) reproduz o texto.
 */
export function diffParts(segments: DiffSegment[]): DiffPart[] {
  const out: DiffPart[] = []
  let before = ''
  let after = ''
  const flush = () => {
    if (before !== '' || after !== '') {
      out.push({ kind: 'change', before, after })
      before = ''
      after = ''
    }
  }
  for (const s of segments) {
    if (s.type === 'equal') {
      flush()
      const last = out[out.length - 1]
      if (last && last.kind === 'equal') last.text += s.value
      else out.push({ kind: 'equal', text: s.value })
    } else if (s.type === 'remove') {
      before += s.value
    } else {
      after += s.value
    }
  }
  flush()
  return out
}

/**
 * applyParts reconstrói o texto: `equal` intacto; cada `change` usa `after` se
 * aceito ou `before` se rejeitado. `accepted` recebe o índice 0-based da mudança
 * (contando só as `change`). all-accept ⇒ texto corrigido; all-reject ⇒ original.
 */
export function applyParts(
  parts: DiffPart[],
  accepted: (changeIndex: number) => boolean,
): string {
  let ci = 0
  let out = ''
  for (const p of parts) {
    if (p.kind === 'equal') {
      out += p.text
    } else {
      out += accepted(ci) ? p.after : p.before
      ci++
    }
  }
  return out
}
