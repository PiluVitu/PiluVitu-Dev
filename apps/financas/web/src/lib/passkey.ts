export function suportaPasskey(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential === 'function'
  )
}

const MENSAGENS: Record<string, string> = {
  AUTH_CANCELLED: 'Operação cancelada.',
  ERROR_CEREMONY_ABORTED: 'Operação cancelada.',
  REGISTRATION_CANCELLED: 'Operação cancelada.',
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: 'Esta passkey já está cadastrada.',
  email_not_allowed: 'Este e-mail não tem acesso a este aplicativo.',
  USER_VERIFICATION_REQUIRED:
    'A passkey precisa confirmar quem é você (biometria ou PIN).',
  PASSKEY_NOT_FOUND:
    'Esta passkey não está cadastrada aqui. Entre com o Google e cadastre de novo.',
  SESSION_NOT_FRESH:
    'Por segurança, saia e entre de novo com o Google antes de cadastrar uma passkey.',
  PASSKEY_EXIGE_LOGIN_GOOGLE:
    'Para cadastrar uma passkey, saia e entre pelo Google.',
  CHALLENGE_NOT_FOUND: 'O pedido expirou, tente de novo.',
  AUTHENTICATION_FAILED: 'Não foi possível confirmar a passkey.',
  FAILED_TO_VERIFY_REGISTRATION: 'Não foi possível confirmar a passkey.',
}

const MUITAS_TENTATIVAS =
  'Muitas tentativas. Espere alguns segundos e tente de novo.'

export function mensagemDeErroPasskey(erro: {
  status?: number
  code?: string
  message?: string
}): string {
  if (erro.status === 429) return MUITAS_TENTATIVAS
  if (erro.code && Object.hasOwn(MENSAGENS, erro.code)) {
    return MENSAGENS[erro.code]!
  }
  return `Não foi possível concluir (${erro.code ?? erro.message ?? 'erro desconhecido'}).`
}

export function mensagemDeExcecao(err: unknown): string {
  return mensagemDeErroPasskey({
    message: err instanceof Error ? err.message : undefined,
  })
}
