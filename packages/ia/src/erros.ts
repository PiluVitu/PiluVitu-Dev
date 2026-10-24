export class ClaudeDesligado extends Error {
  constructor() {
    super(
      'A IA está desligada: falta a ANTHROPIC_API_KEY neste Worker (wrangler secret put ANTHROPIC_API_KEY).',
    )
    this.name = 'ClaudeDesligado'
  }
}

export class ClaudeIndisponivel extends Error {
  readonly status?: number

  constructor(status?: number) {
    super('A Claude não respondeu agora. Tente de novo em alguns instantes.')
    this.name = 'ClaudeIndisponivel'
    this.status = status
  }
}

export type MotivoRecusa =
  | 'chave_invalida'
  | 'requisicao_invalida'
  | 'recusa'
  | 'formato'

const MENSAGEM_RECUSA: Record<MotivoRecusa, string> = {
  chave_invalida:
    'A Claude recusou a ANTHROPIC_API_KEY: chave inválida, confira o `wrangler secret`.',
  requisicao_invalida:
    'A Claude recusou a requisição como inválida. Confira o texto enviado e tente de novo.',
  recusa: 'A Claude se recusou a responder a este conteúdo.',
  formato:
    'A resposta da Claude veio fora do formato esperado (vazia, cortada ou inválida). Tente de novo.',
}

export class ClaudeRecusou extends Error {
  readonly motivo: MotivoRecusa
  readonly status?: number

  constructor(motivo: MotivoRecusa, status?: number) {
    super(MENSAGEM_RECUSA[motivo])
    this.name = 'ClaudeRecusou'
    this.motivo = motivo
    this.status = status
  }
}

function formatarUsd(micro: number): string {
  return `US$ ${(micro / 1_000_000).toFixed(2).replace('.', ',')}`
}

export class TetoAtingido extends Error {
  readonly feature: string
  readonly mes: string
  readonly tetoMicro: number
  readonly gastoMicro: number

  constructor(
    feature: string,
    mes: string,
    tetoMicro: number,
    gastoMicro: number,
  ) {
    super(
      `O teto de IA de ${formatarUsd(tetoMicro)} para "${feature}" em ${mes} foi atingido (gasto até agora: ${formatarUsd(gastoMicro)}). Volta no mês que vem.`,
    )
    this.name = 'TetoAtingido'
    this.feature = feature
    this.mes = mes
    this.tetoMicro = tetoMicro
    this.gastoMicro = gastoMicro
  }
}

export type CodigoErroIa = {
  status: 503 | 502 | 429
  code: string
  message: string
}

export function codigoDoErro(err: unknown): CodigoErroIa | null {
  if (err instanceof ClaudeDesligado) {
    return { status: 503, code: 'claude_desligado', message: err.message }
  }
  if (err instanceof ClaudeIndisponivel) {
    return { status: 503, code: 'claude_indisponivel', message: err.message }
  }
  if (err instanceof ClaudeRecusou) {
    return { status: 502, code: 'claude_recusou', message: err.message }
  }
  if (err instanceof TetoAtingido) {
    return { status: 429, code: 'teto_atingido', message: err.message }
  }
  return null
}
