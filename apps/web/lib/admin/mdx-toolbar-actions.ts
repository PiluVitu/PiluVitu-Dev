export interface EditResult {
  text: string
  selFrom: number
  selTo: number
}

/** Envolve [from,to) com `before`/`after`. Seleção vazia → insere o par com cursor no meio. */
export function wrapSelection(
  doc: string,
  from: number,
  to: number,
  before: string,
  after: string,
): EditResult {
  const sel = doc.slice(from, to)
  const text = doc.slice(0, from) + before + sel + after + doc.slice(to)
  const selFrom = from + before.length
  return { text, selFrom, selTo: selFrom + sel.length }
}

/** Prefixa cada linha tocada por [from,to) com `prefix`. */
export function prefixLines(
  doc: string,
  from: number,
  to: number,
  prefix: string,
): EditResult {
  const lineStart = doc.lastIndexOf('\n', from - 1) + 1
  const nextNl = doc.indexOf('\n', to)
  const lineEnd = nextNl === -1 ? doc.length : nextNl
  const block = doc.slice(lineStart, lineEnd)
  const prefixed = block
    .split('\n')
    .map((l) => prefix + l)
    .join('\n')
  const text = doc.slice(0, lineStart) + prefixed + doc.slice(lineEnd)
  return { text, selFrom: lineStart, selTo: lineStart + prefixed.length }
}

/** Vira `[seleção](url)`; cursor pousa em "url". */
export function linkSelection(
  doc: string,
  from: number,
  to: number,
): EditResult {
  const sel = doc.slice(from, to) || 'texto'
  const inserted = `[${sel}](url)`
  const text = doc.slice(0, from) + inserted + doc.slice(to)
  const urlStart = from + 1 + sel.length + 2 // `[` + sel + `](`
  return { text, selFrom: urlStart, selTo: urlStart + 3 }
}
