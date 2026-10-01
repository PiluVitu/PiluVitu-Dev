export function tituloPreenchimento(x: number, y: number): string {
  return y === 1
    ? `${x} de 1 campo preenchido`
    : `${x} de ${y} campos preenchidos`
}

export function linhaNaoReconhecidos(k: number): string {
  return k === 1 ? '1 não reconhecido' : `${k} não reconhecidos`
}

export type MotivoFalhaInserir = 'sem-foco' | 'iframe' | 'recusado'

const MOTIVOS_DA_FALHA: Record<MotivoFalhaInserir, string> = {
  'sem-foco': 'nenhum campo em foco',
  iframe: 'iframe de outro domínio',
  recusado: 'o campo recusou o valor',
}

export const AVISO_SEM_CAMPOS = 'Nenhum campo nesta página'

export function avisoFalhaInserir(motivo: MotivoFalhaInserir): string {
  return `Não deu para inserir aqui: ${MOTIVOS_DA_FALHA[motivo]}`
}

export function encontreiCampos(y: number): string {
  return y === 1 ? 'Encontrei 1 campo' : `Encontrei ${y} campos`
}
