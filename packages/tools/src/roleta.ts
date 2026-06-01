import { seedFromBytes } from './prng'
import { fromHex } from './entropy'

export interface RoletaOption {
  id: string
  label: string
}

/** Splits a textarea blob into trimmed, non-empty options with stable ids. */
export function normalizeOptions(raw: string): RoletaOption[] {
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((label, i) => ({ id: String(i), label }))
}

/**
 * Deterministically picks a winning index in [0, count) from an entropy digest
 * (hex). Same digest → same winner, so a client animation can land honestly.
 */
export function drawWinnerIndex(count: number, digestHex: string): number {
  if (count <= 0) throw new Error('drawWinnerIndex: no options')
  return seedFromBytes(fromHex(digestHex)).int(count)
}
