export type Modelo = 'claude-sonnet-5-5' | 'claude-haiku-5-5'

export type Preco = { entradaMicroPorMTok: number; saidaMicroPorMTok: number }

export const PRECOS: Record<Modelo, Preco> = {
  'claude-sonnet-5-5': {
    entradaMicroPorMTok: 2_000_000,
    saidaMicroPorMTok: 10_000_000,
  },
  'claude-haiku-5-5': {
    entradaMicroPorMTok: 100_000,
    saidaMicroPorMTok: 500_000,
  },
}

export type UsoTokens = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

const UM_MILHAO = 1_000_000

// Tudo multiplicado por 40 (mmc de 10 e 4) para que 0,1× e 1,25× fiquem inteiros
// e o Math.ceil não erre por resíduo de float.
const ESCALA = 40
const LEITURA_CACHE = 4 // 0,1 × 40
const ESCRITA_CACHE = 50 // 1,25 × 40

export function custoMicroUsd(modelo: Modelo, uso: UsoTokens): number {
  const { entradaMicroPorMTok: entrada, saidaMicroPorMTok: saida } =
    PRECOS[modelo]
  const escalado =
    ESCALA * uso.input_tokens * entrada +
    LEITURA_CACHE * (uso.cache_read_input_tokens ?? 0) * entrada +
    ESCRITA_CACHE * (uso.cache_creation_input_tokens ?? 0) * entrada +
    ESCALA * uso.output_tokens * saida
  return Math.ceil(escalado / (ESCALA * UM_MILHAO))
}

export function estimativaMicroUsd(
  modelo: Modelo,
  caracteresEntrada: number,
  maxTokens: number,
): number {
  return custoMicroUsd(modelo, {
    input_tokens: Math.ceil(caracteresEntrada / 2),
    output_tokens: maxTokens,
  })
}
