export function tituloPreenchimento(x: number, y: number): string {
  return y === 1
    ? `${x} de 1 campo preenchido`
    : `${x} de ${y} campos preenchidos`
}

export function linhaNaoReconhecidos(k: number): string {
  return k === 1 ? '1 não reconhecido' : `${k} não reconhecidos`
}
