import { codigoDoErro } from '@piluvitu/ia/erros'
import { errJson } from './envelope'

export type IaBindings = {
  ANTHROPIC_API_KEY?: string
}

export const TETOS_FINANCAS = {
  insight: 2_000_000,
} as const

export function respostaDeErroIa(err: unknown): Response {
  const erro = codigoDoErro(err)
  if (erro === null) throw err
  return errJson(erro.status, erro.code, erro.message)
}
