import { ATALHOS, type Sistema } from '@piluvitu/tools/pilulabs'

export type NavegadorDoVisitante = {
  userAgent: string
  platform?: string
  userAgentData?: { platform?: string }
}
export type AtalhoDoVisitante = { tecla: string; nomeDoSistema: string }

const NOME_DO_SISTEMA: Record<Sistema, string> = {
  windows: 'Windows',
  mac: 'macOS',
  linux: 'Linux',
}

export const VISITANTE_DO_SERVIDOR: { sistema: Sistema; firefox: boolean } = {
  sistema: 'windows',
  firefox: false,
}

export function sistemaDoVisitante(nav: NavegadorDoVisitante): Sistema {
  const plataforma = (
    nav.userAgentData?.platform ||
    nav.platform ||
    nav.userAgent
  ).toLowerCase()
  if (plataforma.includes('mac')) return 'mac'
  if (plataforma.includes('linux') && !/android/i.test(nav.userAgent))
    return 'linux'
  return 'windows'
}

export function ehFirefox(
  nav: Pick<NavegadorDoVisitante, 'userAgent'>,
): boolean {
  return /firefox\//i.test(nav.userAgent)
}

export function atalhoDoVisitante(
  sistema: Sistema,
  firefox: boolean,
): AtalhoDoVisitante {
  return {
    tecla: ATALHOS[firefox ? 'firefox' : 'chrome'][sistema],
    nomeDoSistema: NOME_DO_SISTEMA[sistema],
  }
}
