/**
 * Tiny client-side logger. Wraps console with a level + prefix so entropy/roulette
 * steps and errors are traceable in the browser console. NEVER pass raw image data
 * here — only hashes/metadata. Integration point for a future error reporter is
 * marked below.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'

function emit(level: Level, scope: string, msg: string, data?: unknown) {
  const line = `[${scope}] ${msg}`

  const fn = console[level] ?? console.log
  if (data !== undefined) fn(line, data)
  else fn(line)
  // FUTURE: forward level==='error' to an error reporter (e.g. Sentry) here.
}

export const log = {
  debug: (scope: string, msg: string, data?: unknown) =>
    emit('debug', scope, msg, data),
  info: (scope: string, msg: string, data?: unknown) =>
    emit('info', scope, msg, data),
  warn: (scope: string, msg: string, data?: unknown) =>
    emit('warn', scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) =>
    emit('error', scope, msg, data),
}
