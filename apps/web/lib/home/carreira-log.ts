const MESES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]

type Mes = { ano: string; mes: number }

function lerMes(texto: string): Mes | null {
  const m = texto.trim().match(/^([A-Za-zçÇ]{3})[a-zç]*\.?,?\s*(\d{4})$/)
  if (!m) return null
  const mes = MESES.indexOf(m[1].toLowerCase())
  return mes === -1 ? null : { ano: m[2], mes }
}

const curto = ({ ano, mes }: Mes) => `${MESES[mes]}. ${ano}`

/** "Mar, 2024 - Atualmente" → { data: "2024-03", periodo: "mar. 2024 – atualmente" }. */
export function logDaCarreira(date: string): { data: string; periodo: string } {
  const [inicioTxt, fimTxt] = date.split(/\s+-\s+/)
  const inicio = lerMes(inicioTxt ?? '')
  if (!inicio) return { data: '', periodo: date.trim() }
  const data = `${inicio.ano}-${String(inicio.mes + 1).padStart(2, '0')}`
  if (!fimTxt) return { data, periodo: curto(inicio) }
  if (/^atual/i.test(fimTxt.trim()))
    return { data, periodo: `${curto(inicio)} – atualmente` }
  const fim = lerMes(fimTxt)
  if (!fim || (fim.ano === inicio.ano && fim.mes === inicio.mes))
    return { data, periodo: curto(inicio) }
  return { data, periodo: `${curto(inicio)} – ${curto(fim)}` }
}
