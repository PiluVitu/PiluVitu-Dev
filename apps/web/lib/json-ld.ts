export function serializarJsonLd(dados: unknown): string {
  return JSON.stringify(dados).replace(/</g, '\\u003c')
}
