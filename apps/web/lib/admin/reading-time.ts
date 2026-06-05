/** Estima o tempo de leitura em minutos (~200 palavras/min, mínimo 1). */
export function estimateReadingTime(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}
