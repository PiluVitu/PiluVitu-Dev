/**
 * Espelho de `normalizeName` (`apps/financas/src/domain/payees.ts`, Worker)
 * — a SPA não importa através da fronteira Worker/bundle (mesmo motivo de
 * `lib/dates.ts` duplicar `todayInTeresina`). Usado só para SUGERIR um
 * payee já cadastrado a partir da descrição de uma linha importada — nunca
 * cria payee novo, nunca grava sozinho (spec §7: payee é sugestão
 * confirmável, nunca gravação automática).
 *
 * ⚠️ Mesma limitação conhecida e aceita do original: corta o último token
 * quando parece sigla de estado, então `'Comercial SP'` vira `'COMERCIAL'`
 * — pode fazer a sugestão casar (ou deixar de casar) o payee errado. É
 * exatamente por isso que a tela de conferência deixa o dono trocar a
 * sugestão antes de confirmar, nunca grava por adivinhação.
 */
const UF = new Set([
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
])

const MAQUININHAS = new Set([
  'PAGSEGURO',
  'PAGBANK',
  'MERCADOPAGO',
  'CIELO',
  'REDE',
  'STONE',
  'GETNET',
  'SUMUP',
  'PAGARME',
  'PICPAY',
  'INFINITEPAY',
])

export function normalizeName(name: string): string {
  const tokens = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  while (tokens.length > 1 && MAQUININHAS.has(tokens[tokens.length - 1]))
    tokens.pop()

  if (tokens.length > 1 && UF.has(tokens[tokens.length - 1])) {
    tokens.pop()
    if (tokens.length > 1) tokens.pop()
  }

  return tokens.join(' ')
}

export type PayeeParaSugestao = {
  id: string
  name: string
  norm_name: string
  default_category_id: string | null
}

/**
 * Casa a descrição importada contra a lista de payees já cadastrados, pelo
 * `norm_name`. Sem match, devolve `null` — a tela mostra a linha sem payee
 * pré-selecionado em vez de inventar um.
 */
export function sugerirPayee<T extends PayeeParaSugestao>(
  descricao: string,
  payees: T[],
): T | null {
  const alvo = normalizeName(descricao)
  if (alvo === '') return null
  return payees.find((p) => p.norm_name === alvo) ?? null
}
