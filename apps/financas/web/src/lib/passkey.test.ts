import { afterEach, describe, expect, test, vi } from 'vitest'
import { mensagemDeErroPasskey, suportaPasskey } from './passkey'

describe('suportaPasskey', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('jsdom (sem WebAuthn) não suporta', () => {
    expect(suportaPasskey()).toBe(false)
  })

  test('com PublicKeyCredential no window, suporta', () => {
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
    expect(suportaPasskey()).toBe(true)
  })
})

describe('mensagemDeErroPasskey', () => {
  test.each([
    ['AUTH_CANCELLED', 'Operação cancelada.'],
    ['ERROR_CEREMONY_ABORTED', 'Operação cancelada.'],
    ['REGISTRATION_CANCELLED', 'Operação cancelada.'],
    [
      'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
      'Esta passkey já está cadastrada.',
    ],
    ['email_not_allowed', 'Este e-mail não tem acesso a este aplicativo.'],
    [
      'USER_VERIFICATION_REQUIRED',
      'A passkey precisa confirmar quem é você (biometria ou PIN).',
    ],
    [
      'PASSKEY_NOT_FOUND',
      'Esta passkey não está cadastrada aqui. Entre com o Google e cadastre de novo.',
    ],
    [
      'SESSION_NOT_FRESH',
      'Por segurança, saia e entre de novo com o Google antes de cadastrar uma passkey.',
    ],
    [
      'PASSKEY_EXIGE_LOGIN_GOOGLE',
      'Para cadastrar uma passkey, saia e entre pelo Google.',
    ],
  ])('%s', (code, esperado) => {
    expect(mensagemDeErroPasskey({ code })).toBe(esperado)
  })

  test.each([
    ['CHALLENGE_NOT_FOUND', 'O pedido expirou, tente de novo.'],
    ['AUTHENTICATION_FAILED', 'Não foi possível confirmar a passkey.'],
    ['FAILED_TO_VERIFY_REGISTRATION', 'Não foi possível confirmar a passkey.'],
  ])('%s (código do plugin)', (code, esperado) => {
    expect(mensagemDeErroPasskey({ code })).toBe(esperado)
  })

  test('429 do rate limit (sem code, mensagem em inglês) sai em português', () => {
    expect(
      mensagemDeErroPasskey({
        status: 429,
        message: 'Too many requests. Please try again later.',
      }),
    ).toBe('Muitas tentativas. Espere alguns segundos e tente de novo.')
  })

  test('429 vence qualquer code que venha junto', () => {
    expect(mensagemDeErroPasskey({ status: 429, code: 'X_Y' })).toBe(
      'Muitas tentativas. Espere alguns segundos e tente de novo.',
    )
  })

  test('código desconhecido mostra o código', () => {
    expect(mensagemDeErroPasskey({ code: 'X_Y' })).toBe(
      'Não foi possível concluir (X_Y).',
    )
  })

  test('sem código cai na mensagem, e sem nada num texto genérico', () => {
    expect(mensagemDeErroPasskey({ message: 'falhou' })).toBe(
      'Não foi possível concluir (falhou).',
    )
    expect(mensagemDeErroPasskey({})).toBe(
      'Não foi possível concluir (erro desconhecido).',
    )
  })
})
