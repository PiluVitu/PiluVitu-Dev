import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser'
import { apiBase } from '@/lib/votacao/api-client'
import {
  deletePasskey,
  listPasskeys,
  passkeySuportado,
  registerPasskey,
  signInWithPasskey,
} from './passkey'

jest.mock('@simplewebauthn/browser', () => {
  const real = jest.requireActual('@simplewebauthn/browser')
  return {
    WebAuthnError: real.WebAuthnError,
    browserSupportsWebAuthn: jest.fn(() => true),
    startAuthentication: jest.fn(),
    startRegistration: jest.fn(),
  }
})

const suporteMock = browserSupportsWebAuthn as jest.MockedFunction<
  typeof browserSupportsWebAuthn
>
const autenticarMock = startAuthentication as jest.MockedFunction<
  typeof startAuthentication
>
const registrarMock = startRegistration as jest.MockedFunction<
  typeof startRegistration
>

type Resposta = { status: number; body?: unknown }

function respostas(...lista: Resposta[]) {
  const fetchMock = jest.fn()
  for (const r of lista) {
    fetchMock.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: `HTTP ${r.status}`,
      json: async () => r.body ?? null,
    } as Response)
  }
  global.fetch = fetchMock
  return fetchMock
}

function chamada(fetchMock: jest.Mock, i: number) {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit]
  return {
    url,
    init,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  }
}

const opcoesLogin = { challenge: 'c1', rpId: 'piluvitu.com.br' }
const assercao = {
  id: 'cred-1',
  rawId: 'cred-1',
  type: 'public-key',
  response: { clientDataJSON: 'x', authenticatorData: 'y', signature: 'z' },
  clientExtensionResults: {},
}
const opcoesCadastro = { challenge: 'c2', rp: { id: 'piluvitu.com.br' } }
const atestado = {
  id: 'cred-2',
  rawId: 'cred-2',
  type: 'public-key',
  response: { clientDataJSON: 'x', attestationObject: 'y' },
  clientExtensionResults: { credProps: { rk: true } },
}

function abortoDoUsuario() {
  const causa = new Error('The operation either timed out or was not allowed.')
  causa.name = 'NotAllowedError'
  return new WebAuthnError({
    message: causa.message,
    code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
    cause: causa,
  })
}

beforeEach(() => {
  suporteMock.mockReturnValue(true)
  autenticarMock.mockReset()
  registrarMock.mockReset()
})

describe('passkeySuportado', () => {
  it('reflete o browserSupportsWebAuthn', () => {
    suporteMock.mockReturnValue(false)
    expect(passkeySuportado()).toBe(false)
    suporteMock.mockReturnValue(true)
    expect(passkeySuportado()).toBe(true)
  })
})

describe('signInWithPasskey', () => {
  it('pede as opções, assina no navegador e manda a asserção sem clientExtensionResults, com cookie', async () => {
    const fetchMock = respostas(
      { status: 200, body: opcoesLogin },
      { status: 200, body: { session: {}, user: {} } },
    )
    autenticarMock.mockResolvedValue(assercao as never)

    await signInWithPasskey()

    const opcoes = chamada(fetchMock, 0)
    expect(opcoes.url).toBe(
      `${apiBase}/api/auth/passkey/generate-authenticate-options`,
    )
    expect(opcoes.init.method).toBe('GET')
    expect(opcoes.init.credentials).toBe('include')
    expect(autenticarMock).toHaveBeenCalledWith({ optionsJSON: opcoesLogin })

    const verificar = chamada(fetchMock, 1)
    expect(verificar.url).toBe(
      `${apiBase}/api/auth/passkey/verify-authentication`,
    )
    expect(verificar.init.method).toBe('POST')
    expect(verificar.init.credentials).toBe('include')
    expect(verificar.body.response).not.toHaveProperty('clientExtensionResults')
    expect(verificar.body).toEqual({
      response: { ...assercao, clientExtensionResults: undefined },
    })
  })

  it('sem suporte a WebAuthn, falha antes de qualquer pedido', async () => {
    suporteMock.mockReturnValue(false)
    const fetchMock = respostas()
    await expect(signInWithPasskey()).rejects.toThrow(
      /navegador não suporta passkeys/i,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('usuário cancelou a janela do navegador: mensagem de cancelado e nada é verificado', async () => {
    const fetchMock = respostas({ status: 200, body: opcoesLogin })
    autenticarMock.mockRejectedValue(abortoDoUsuario())
    await expect(signInWithPasskey()).rejects.toThrow(/cancelad/i)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('passkey desconhecida (401 do Better Auth) pede o Google', async () => {
    respostas(
      { status: 200, body: opcoesLogin },
      {
        status: 401,
        body: { code: 'PASSKEY_NOT_FOUND', message: 'Passkey not found' },
      },
    )
    autenticarMock.mockResolvedValue(assercao as never)
    await expect(signInWithPasskey()).rejects.toThrow(/não reconhecida/i)
  })

  it('aparelho sem biometria/PIN (401 USER_VERIFICATION_REQUIRED) pede a confirmação, não o Google', async () => {
    respostas(
      { status: 200, body: opcoesLogin },
      {
        status: 401,
        body: {
          code: 'USER_VERIFICATION_REQUIRED',
          message:
            'Confirme com biometria ou PIN do aparelho para usar a passkey.',
        },
      },
    )
    autenticarMock.mockResolvedValue(assercao as never)
    const erro = signInWithPasskey()
    await expect(erro).rejects.toThrow(/biometria ou o PIN/i)
    await expect(erro).rejects.not.toThrow(/não reconhecida/i)
  })

  it('conta fora da lista de admin (403) não entra', async () => {
    respostas(
      { status: 200, body: opcoesLogin },
      {
        status: 403,
        body: {
          ok: false,
          data: null,
          notifications: [
            {
              type: 'error',
              code: 'admin_only',
              message: 'Acesso restrito a administradores.',
            },
          ],
        },
      },
    )
    autenticarMock.mockResolvedValue(assercao as never)
    await expect(signInWithPasskey()).rejects.toThrow(
      /restrito a administradores/i,
    )
  })

  it('servidor sem passkey (404 nas opções) diz que está indisponível', async () => {
    respostas({ status: 404, body: null })
    await expect(signInWithPasskey()).rejects.toThrow(/indisponível/i)
    expect(autenticarMock).not.toHaveBeenCalled()
  })

  it('falha de rede vira mensagem de conexão', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(signInWithPasskey()).rejects.toThrow(/conexão/i)
  })
})

describe('registerPasskey', () => {
  it('manda o nome nas opções e no corpo da verificação', async () => {
    const fetchMock = respostas(
      { status: 200, body: opcoesCadastro },
      { status: 200, body: { id: 'pk-1', name: 'MacBook' } },
    )
    registrarMock.mockResolvedValue(atestado as never)

    await registerPasskey('  MacBook  ')

    const opcoes = chamada(fetchMock, 0)
    expect(opcoes.url).toBe(
      `${apiBase}/api/auth/passkey/generate-register-options?name=MacBook`,
    )
    expect(opcoes.init.credentials).toBe('include')
    expect(registrarMock).toHaveBeenCalledWith({ optionsJSON: opcoesCadastro })

    const verificar = chamada(fetchMock, 1)
    expect(verificar.url).toBe(
      `${apiBase}/api/auth/passkey/verify-registration`,
    )
    expect(verificar.init.method).toBe('POST')
    expect(verificar.body.response).not.toHaveProperty('clientExtensionResults')
    expect(verificar.body).toEqual({
      response: { ...atestado, clientExtensionResults: undefined },
      name: 'MacBook',
    })
  })

  it('sem nome, não manda query nem name', async () => {
    const fetchMock = respostas(
      { status: 200, body: opcoesCadastro },
      { status: 200, body: { id: 'pk-1' } },
    )
    registrarMock.mockResolvedValue(atestado as never)

    await registerPasskey('   ')

    expect(chamada(fetchMock, 0).url).toBe(
      `${apiBase}/api/auth/passkey/generate-register-options`,
    )
    expect(chamada(fetchMock, 1).body).not.toHaveProperty('name')
  })

  it('não-admin (403) não cadastra', async () => {
    respostas({
      status: 403,
      body: {
        ok: false,
        data: null,
        notifications: [
          {
            type: 'error',
            code: 'admin_only',
            message: 'Acesso restrito a administradores.',
          },
        ],
      },
    })
    await expect(registerPasskey()).rejects.toThrow(
      /só administradores podem cadastrar/i,
    )
    expect(registrarMock).not.toHaveBeenCalled()
  })

  it('sessão antiga (SESSION_NOT_FRESH) pede para entrar com o Google de novo', async () => {
    respostas({
      status: 403,
      body: { code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' },
    })
    await expect(registerPasskey()).rejects.toThrow(
      /entre com o google de novo/i,
    )
  })

  // Sessão aberta pela passkey não cadastra outra: o ramielle recusa com
  // este código, tanto nas opções quanto na verificação do cadastro.
  it.each([
    ['nas opções', [] as Resposta[]],
    ['na verificação', [{ status: 200, body: opcoesCadastro }] as Resposta[]],
  ])(
    'sessão aberta pela passkey (403 PASSKEY_EXIGE_LOGIN_GOOGLE %s) pede para sair e entrar pelo Google',
    async (_onde, antes) => {
      respostas(...antes, {
        status: 403,
        body: {
          ok: false,
          data: null,
          notifications: [
            {
              type: 'error',
              code: 'PASSKEY_EXIGE_LOGIN_GOOGLE',
              message: 'Para cadastrar uma passkey, entre pelo Google',
            },
          ],
        },
      })
      registrarMock.mockResolvedValue(atestado as never)
      await expect(registerPasskey()).rejects.toThrow(
        'Para cadastrar uma passkey, saia e entre pelo Google.',
      )
    },
  )

  it('sem sessão (401) pede login', async () => {
    respostas({ status: 401, body: { code: 'UNAUTHORIZED' } })
    await expect(registerPasskey()).rejects.toThrow(/sessão expirou/i)
  })

  it('aparelho sem biometria/PIN no cadastro (401 USER_VERIFICATION_REQUIRED) não fala em sessão expirada', async () => {
    respostas(
      { status: 200, body: opcoesCadastro },
      {
        status: 401,
        body: {
          code: 'USER_VERIFICATION_REQUIRED',
          message:
            'Confirme com biometria ou PIN do aparelho para usar a passkey.',
        },
      },
    )
    registrarMock.mockResolvedValue(atestado as never)
    const erro = registerPasskey()
    await expect(erro).rejects.toThrow(/biometria ou o PIN/i)
    await expect(erro).rejects.not.toThrow(/sessão expirou/i)
  })

  it('aparelho já cadastrado tem mensagem própria', async () => {
    respostas({ status: 200, body: opcoesCadastro })
    registrarMock.mockRejectedValue(
      new WebAuthnError({
        message: 'already registered',
        code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
        cause: Object.assign(new Error('x'), { name: 'InvalidStateError' }),
      }),
    )
    await expect(registerPasskey()).rejects.toThrow(/já está cadastrad/i)
  })

  it('cancelado pelo usuário', async () => {
    respostas({ status: 200, body: opcoesCadastro })
    registrarMock.mockRejectedValue(abortoDoUsuario())
    await expect(registerPasskey()).rejects.toThrow(/cancelad/i)
  })

  it('sem suporte a WebAuthn, falha antes de qualquer pedido', async () => {
    suporteMock.mockReturnValue(false)
    const fetchMock = respostas()
    await expect(registerPasskey()).rejects.toThrow(/não suporta passkeys/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('verificação recusada pelo servidor (400) não fica em silêncio', async () => {
    respostas(
      { status: 200, body: opcoesCadastro },
      {
        status: 400,
        body: {
          code: 'FAILED_TO_VERIFY_REGISTRATION',
          message: 'Failed to verify registration',
        },
      },
    )
    registrarMock.mockResolvedValue(atestado as never)
    await expect(registerPasskey()).rejects.toThrow(
      /não foi possível cadastrar/i,
    )
  })
})

describe('listPasskeys', () => {
  it('devolve a lista do servidor, com cookie', async () => {
    const lista = [
      {
        id: 'pk-1',
        name: 'MacBook',
        createdAt: '2026-10-20T12:00:00.000Z',
        deviceType: 'multiDevice',
        backedUp: true,
      },
    ]
    const fetchMock = respostas({ status: 200, body: lista })
    await expect(listPasskeys()).resolves.toEqual(lista)
    const c = chamada(fetchMock, 0)
    expect(c.url).toBe(`${apiBase}/api/auth/passkey/list-user-passkeys`)
    expect(c.init.credentials).toBe('include')
  })

  it('resposta que não é lista vira erro', async () => {
    respostas({ status: 200, body: { nada: true } })
    await expect(listPasskeys()).rejects.toThrow(/não foi possível carregar/i)
  })

  it('401 pede login', async () => {
    respostas({ status: 401, body: null })
    await expect(listPasskeys()).rejects.toThrow(/sessão expirou/i)
  })
})

describe('deletePasskey', () => {
  it('manda o id no corpo', async () => {
    const fetchMock = respostas({ status: 200, body: { status: true } })
    await deletePasskey('pk-1')
    const c = chamada(fetchMock, 0)
    expect(c.url).toBe(`${apiBase}/api/auth/passkey/delete-passkey`)
    expect(c.init.method).toBe('POST')
    expect(c.init.credentials).toBe('include')
    expect(c.body).toEqual({ id: 'pk-1' })
  })

  it('passkey de outra conta ou inexistente vira erro legível', async () => {
    respostas({
      status: 404,
      body: { code: 'PASSKEY_NOT_FOUND', message: 'Passkey not found' },
    })
    await expect(deletePasskey('pk-x')).rejects.toThrow(
      /não foi possível remover/i,
    )
  })
})
