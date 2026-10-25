import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'
import { apiBase } from '@/lib/votacao/api-client'

export interface Passkey {
  id: string
  name?: string | null
  createdAt: string
  deviceType?: string
  backedUp?: boolean
}

type Contexto = 'login' | 'cadastro' | 'lista' | 'remocao'

const SEM_SUPORTE = 'Este navegador não suporta passkeys.'
const CANCELADO = 'Operação cancelada.'
const SEM_CONEXAO =
  'Não foi possível falar com o servidor. Verifique sua conexão e tente novamente.'
const SESSAO_EXPIRADA = 'Sua sessão expirou. Entre com o Google de novo.'

const FALHA_GENERICA: Record<Contexto, string> = {
  login: 'Não foi possível entrar com a passkey. Tente novamente.',
  cadastro: 'Não foi possível cadastrar a passkey. Tente novamente.',
  lista: 'Não foi possível carregar as passkeys. Tente novamente.',
  remocao: 'Não foi possível remover a passkey. Tente novamente.',
}

export function passkeySuportado(): boolean {
  return browserSupportsWebAuthn()
}

function codigoDoCorpo(corpo: unknown): string | undefined {
  if (!corpo || typeof corpo !== 'object') return undefined
  const c = corpo as {
    code?: unknown
    notifications?: { type?: string; code?: string }[]
  }
  if (typeof c.code === 'string') return c.code
  const n =
    c.notifications?.find((x) => x.type === 'error') ?? c.notifications?.[0]
  return n?.code
}

function mensagemDeStatus(
  status: number,
  codigo: string | undefined,
  contexto: Contexto,
): string {
  if (codigo === 'USER_VERIFICATION_REQUIRED') {
    return 'Confirme com a biometria ou o PIN do aparelho e tente de novo.'
  }
  if (status === 404 && codigo === undefined) {
    return 'Login por passkey indisponível no momento. Use o Google.'
  }
  if (contexto === 'login') {
    if (status === 401) {
      return 'Passkey não reconhecida. Entre com o Google e cadastre uma nova.'
    }
    if (status === 403) return 'Acesso restrito a administradores.'
    return FALHA_GENERICA.login
  }
  if (status === 401) return SESSAO_EXPIRADA
  if (status === 403) {
    if (codigo === 'PASSKEY_EXIGE_LOGIN_GOOGLE') {
      return 'Para cadastrar uma passkey, saia e entre pelo Google.'
    }
    if (codigo === 'SESSION_NOT_FRESH') {
      return 'Por segurança, entre com o Google de novo para cadastrar uma passkey.'
    }
    return contexto === 'cadastro'
      ? 'Só administradores podem cadastrar passkeys.'
      : 'Acesso restrito a administradores.'
  }
  return FALHA_GENERICA[contexto]
}

async function pedir<T>(
  caminho: string,
  contexto: Contexto,
  init: RequestInit = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${apiBase}/api/auth${caminho}`, {
      method: 'GET',
      credentials: 'include',
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    })
  } catch {
    throw new Error(SEM_CONEXAO)
  }
  const corpo: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(
      mensagemDeStatus(res.status, codigoDoCorpo(corpo), contexto),
    )
  }
  return corpo as T
}

function erroDoNavegador(err: unknown, contexto: Contexto): Error {
  const e = err as { name?: string; code?: string } | null
  if (
    e?.name === 'NotAllowedError' ||
    e?.name === 'AbortError' ||
    e?.code === 'ERROR_CEREMONY_ABORTED'
  ) {
    return new Error(CANCELADO)
  }
  if (e?.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED') {
    return new Error('Esta passkey já está cadastrada neste aparelho.')
  }
  return new Error(FALHA_GENERICA[contexto])
}

function semExtensoes<T extends object>(resposta: T) {
  return Object.fromEntries(
    Object.entries(resposta).filter(([k]) => k !== 'clientExtensionResults'),
  )
}

function exigirSuporte() {
  if (!passkeySuportado()) throw new Error(SEM_SUPORTE)
}

export async function signInWithPasskey(): Promise<void> {
  exigirSuporte()
  const optionsJSON = await pedir<
    Parameters<typeof startAuthentication>[0]['optionsJSON']
  >('/passkey/generate-authenticate-options', 'login')

  let assinatura: Awaited<ReturnType<typeof startAuthentication>>
  try {
    assinatura = await startAuthentication({ optionsJSON })
  } catch (err) {
    throw erroDoNavegador(err, 'login')
  }

  await pedir('/passkey/verify-authentication', 'login', {
    method: 'POST',
    body: JSON.stringify({ response: semExtensoes(assinatura) }),
  })
}

export async function registerPasskey(nome?: string): Promise<Passkey> {
  exigirSuporte()
  const name = nome?.trim() || undefined
  const query = name ? `?${new URLSearchParams({ name })}` : ''
  const optionsJSON = await pedir<
    Parameters<typeof startRegistration>[0]['optionsJSON']
  >(`/passkey/generate-register-options${query}`, 'cadastro')

  let atestado: Awaited<ReturnType<typeof startRegistration>>
  try {
    atestado = await startRegistration({ optionsJSON })
  } catch (err) {
    throw erroDoNavegador(err, 'cadastro')
  }

  const response = semExtensoes(atestado)
  return pedir<Passkey>('/passkey/verify-registration', 'cadastro', {
    method: 'POST',
    body: JSON.stringify(name ? { response, name } : { response }),
  })
}

export async function listPasskeys(): Promise<Passkey[]> {
  const lista = await pedir<unknown>('/passkey/list-user-passkeys', 'lista')
  if (!Array.isArray(lista)) throw new Error(FALHA_GENERICA.lista)
  return lista as Passkey[]
}

export async function deletePasskey(id: string): Promise<void> {
  await pedir('/passkey/delete-passkey', 'remocao', {
    method: 'POST',
    body: JSON.stringify({ id }),
  })
}
