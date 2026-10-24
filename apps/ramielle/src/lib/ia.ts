import { codigoDoErro } from '@piluvitu/ia/erros'
import { errJson } from './envelope'

export const TETOS_RAMIELLE = {
  revisao: 10_000_000,
  hooks: 2_000_000,
  resumo: 2_000_000,
} as const

export function respostaDeErroIa(err: unknown): Response {
  const erro = codigoDoErro(err)
  if (erro === null) throw err
  return errJson(erro.status, erro.code, erro.message)
}
