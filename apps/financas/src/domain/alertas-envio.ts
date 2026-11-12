import { ENDERECO_INVALIDO } from '../lib/mime'
import { setSetting } from './settings'

/** Ver "Alertas por e-mail" no CLAUDE.md. */

export type ModoDeEnvio = 'email_routing' | 'email_sending'

export type ConfigDeEnvio = {
  EMAIL?: SendEmail
  ALLOWED_EMAIL?: string
  ALERTAS_REMETENTE?: string
  ALERTAS_ENVIO?: string
}

export type FaltaNaConfiguracao =
  | 'alertas_sem_binding'
  | 'alertas_sem_destinatario'
  | 'alertas_sem_remetente'
  | 'alertas_sem_modo'

export type EnvioConfigurado = {
  email: SendEmail
  para: string
  de: string
  modo: ModoDeEnvio
}

export const DESTINO_NAO_VERIFICADO = 'destino_nao_verificado'

export const CODIGOS_PROPRIOS_DO_ENVIO: ReadonlySet<string> = new Set([
  ENDERECO_INVALIDO,
  DESTINO_NAO_VERIFICADO,
])

export const CODIGOS_DE_CONFIGURACAO: ReadonlySet<string> = new Set([
  'E_SENDER_NOT_VERIFIED',
  'E_SENDER_DOMAIN_NOT_AVAILABLE',
  'E_RECIPIENT_NOT_ALLOWED',
  'E_RECIPIENT_SUPPRESSED',
  'E_ACCOUNT_SUSPENDED',
  ...CODIGOS_PROPRIOS_DO_ENVIO,
])

export const ALERTAS_EMAIL_ENVIO_KEY = 'alertas_email_envio'

export type TentativaDeEnvio = {
  resultado: 'enviado' | 'falhou'
  codigo?: string
  em: string
}

type RegistroDoEnvio = TentativaDeEnvio & {
  modo: ModoDeEnvio
  impressao: string
}

type EnderecosDoEnvio = Pick<EnvioConfigurado, 'modo' | 'de' | 'para'>

export type EstadoDoEnvio = {
  estado: 'pronto' | 'aguardando' | 'nao_configurado' | 'falhou'
  modo: ModoDeEnvio | null
  codigo?: string
  em?: string
}

function modoDeEnvio(valor: unknown): ModoDeEnvio | null {
  return valor === 'email_routing' || valor === 'email_sending' ? valor : null
}

export function configuracaoDoEnvio(
  env: ConfigDeEnvio,
): { falta: FaltaNaConfiguracao } | ({ falta: null } & EnvioConfigurado) {
  const { EMAIL, ALLOWED_EMAIL, ALERTAS_REMETENTE } = env
  if (!EMAIL) return { falta: 'alertas_sem_binding' }
  if (!ALLOWED_EMAIL) return { falta: 'alertas_sem_destinatario' }
  if (!ALERTAS_REMETENTE) return { falta: 'alertas_sem_remetente' }
  const modo = modoDeEnvio(env.ALERTAS_ENVIO)
  if (!modo) return { falta: 'alertas_sem_modo' }
  return {
    falta: null,
    email: EMAIL,
    para: ALLOWED_EMAIL,
    de: ALERTAS_REMETENTE,
    modo,
  }
}

export function faltaNaConfiguracao(
  env: ConfigDeEnvio,
): FaltaNaConfiguracao | null {
  return configuracaoDoEnvio(env).falta
}

const DESTINO_RECUSADO = [
  /^email to \S+ not allowed$/,
  /\bdestination address\b.*\bnot (?:a )?verified\b/i,
]

export function destinoNaoVerificado(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const { code, message } = err as { code?: unknown; message?: unknown }
  if (typeof code === 'string' && code.startsWith('E_')) return false
  return (
    typeof message === 'string' && DESTINO_RECUSADO.some((r) => r.test(message))
  )
}

export async function impressaoDoEnvio({
  modo,
  de,
  para,
}: EnderecosDoEnvio): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([modo, de, para]))
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function registrarEnvio(
  db: D1Database,
  envio: EnderecosDoEnvio,
  { resultado, codigo, em }: TentativaDeEnvio,
): Promise<void> {
  const registro = {
    resultado,
    modo: envio.modo,
    impressao: await impressaoDoEnvio(envio),
    ...(codigo ? { codigo } : {}),
    em,
  }
  await setSetting(db, ALERTAS_EMAIL_ENVIO_KEY, JSON.stringify(registro))
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const CODIGO = /^[A-Za-z0-9_]{1,64}$/
const SHA256_HEX = /^[0-9a-f]{64}$/

function lerRegistro(valor: string): RegistroDoEnvio | null {
  let dado: unknown
  try {
    dado = JSON.parse(valor)
  } catch {
    return null
  }
  if (typeof dado !== 'object' || dado === null || Array.isArray(dado)) {
    return null
  }
  const { resultado, modo, impressao, codigo, em } = dado as Record<
    string,
    unknown
  >
  const modoLido = modoDeEnvio(modo)
  if (resultado !== 'enviado' && resultado !== 'falhou') return null
  if (!modoLido || typeof em !== 'string' || !ISO_UTC.test(em)) return null
  if (typeof impressao !== 'string' || !SHA256_HEX.test(impressao)) return null
  const base: RegistroDoEnvio = { resultado, modo: modoLido, impressao, em }
  if (codigo === undefined) return base
  if (typeof codigo !== 'string' || !CODIGO.test(codigo)) return null
  return { ...base, codigo }
}

export async function estadoDoEnvio(
  db: D1Database,
  env: ConfigDeEnvio,
): Promise<EstadoDoEnvio> {
  const config = configuracaoDoEnvio(env)
  if (config.falta) {
    return {
      estado: 'nao_configurado',
      modo: modoDeEnvio(env.ALERTAS_ENVIO),
      codigo: config.falta,
    }
  }
  const { modo } = config

  const linha = await db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .bind(ALERTAS_EMAIL_ENVIO_KEY)
    .first<{ value: string }>()
  const registro = linha === null ? null : lerRegistro(linha.value)
  if (
    !registro ||
    registro.modo !== modo ||
    registro.impressao !== (await impressaoDoEnvio(config))
  ) {
    return { estado: 'aguardando', modo }
  }
  if (registro.resultado === 'enviado') {
    return { estado: 'pronto', modo, em: registro.em }
  }
  const estado =
    registro.codigo !== undefined &&
    CODIGOS_DE_CONFIGURACAO.has(registro.codigo)
      ? 'nao_configurado'
      : 'falhou'
  return {
    estado,
    modo,
    ...(registro.codigo === undefined ? {} : { codigo: registro.codigo }),
    em: registro.em,
  }
}
