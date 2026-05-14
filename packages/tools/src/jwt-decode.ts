export type JwtParts = {
  header: Record<string, unknown>
  payload: Record<string, unknown>
  signature: string
  raw: { header: string; payload: string; signature: string }
}

function b64urlDecode(input: string): string {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function decodeJWT(token: string): JwtParts {
  const parts = token.trim().split('.')
  if (parts.length !== 3)
    throw new Error('Token inválido: esperado 3 partes separadas por "."')
  const [rawHeader, rawPayload, rawSignature] = parts
  try {
    const header = JSON.parse(b64urlDecode(rawHeader)) as Record<
      string,
      unknown
    >
    const payload = JSON.parse(b64urlDecode(rawPayload)) as Record<
      string,
      unknown
    >
    return {
      header,
      payload,
      signature: rawSignature,
      raw: { header: rawHeader, payload: rawPayload, signature: rawSignature },
    }
  } catch {
    throw new Error(
      'Token inválido: não foi possível decodificar header ou payload',
    )
  }
}
