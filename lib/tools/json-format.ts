export type JsonFormatError = {
  message: string
  line?: number
  column?: number
}
export type JsonFormatResult =
  | { ok: true; value: string }
  | { ok: false; error: JsonFormatError }

export function formatJSON(input: string, indent = 2): JsonFormatResult {
  try {
    const parsed = JSON.parse(input)
    return { ok: true, value: JSON.stringify(parsed, null, indent) }
  } catch (e) {
    return { ok: false, error: parseJsonError(e, input) }
  }
}

export function minifyJSON(input: string): JsonFormatResult {
  try {
    const parsed = JSON.parse(input)
    return { ok: true, value: JSON.stringify(parsed) }
  } catch (e) {
    return { ok: false, error: parseJsonError(e, input) }
  }
}

export function validateJSON(input: string): {
  valid: boolean
  error?: JsonFormatError
} {
  try {
    JSON.parse(input)
    return { valid: true }
  } catch (e) {
    return { valid: false, error: parseJsonError(e, input) }
  }
}

function parseJsonError(e: unknown, input: string): JsonFormatError {
  const message = e instanceof Error ? e.message : 'JSON inválido'
  const posMatch = message.match(/position (\d+)/i)
  if (!posMatch) return { message }
  const pos = parseInt(posMatch[1], 10)
  const before = input.slice(0, pos)
  const line = (before.match(/\n/g) ?? []).length + 1
  const lastNewline = before.lastIndexOf('\n')
  const column = pos - (lastNewline === -1 ? 0 : lastNewline)
  return { message, line, column }
}
