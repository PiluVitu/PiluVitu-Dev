import type { StatusHost } from '../components/pilula-host'
import type { RespostaPreencher } from './mensagens'
import type { SituacaoPagina } from './paginas'
import { contarRecusados, type ResumoPreenchimento } from './resultado'

export type Tela = 'dados' | 'resultado' | 'nenhum-campo' | 'proibida'

export interface EstadoPopup {
  tela: Tela
  situacao: SituacaoPagina
  resumo: ResumoPreenchimento | null
}

export interface TextoRodape {
  texto: string
  comAlterar: boolean
}

export function estadoAoAbrir(situacao: SituacaoPagina): EstadoPopup {
  return {
    tela: situacao === 'ok' ? 'dados' : 'proibida',
    situacao,
    resumo: null,
  }
}

export function aposPreencher(resposta: RespostaPreencher): EstadoPopup {
  if (!resposta.ok)
    return { tela: 'proibida', situacao: resposta.motivo, resumo: null }
  const { resumo } = resposta
  const tela =
    resumo.x + contarRecusados(resumo) >= 1 ? 'resultado' : 'nenhum-campo'
  return { tela, situacao: 'ok', resumo }
}

export function verDados(estado: EstadoPopup): EstadoPopup {
  return { ...estado, tela: 'dados' }
}

export function statusDoHost(estado: EstadoPopup): StatusHost {
  if (estado.situacao !== 'ok') return 'lock'
  return estado.resumo !== null && estado.resumo.x === 0 ? 'warn' : 'ok'
}

export function rodapeDaTela(
  tela: Tela,
  temPessoa: boolean,
): TextoRodape | null {
  switch (tela) {
    case 'proibida':
      return null
    case 'resultado':
      return { texto: 'preenche de novo', comAlterar: false }
    case 'nenhum-campo':
      return { texto: 'preenche sem abrir', comAlterar: false }
    case 'dados':
      return temPessoa
        ? { texto: 'preenche sem abrir', comAlterar: true }
        : { texto: 'preenche sem abrir o popup', comAlterar: false }
  }
}
