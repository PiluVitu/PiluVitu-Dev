import { toHex } from '../entropy'
import type { LinhaImportada } from './index'

// OFX tem FITID, garantido único pelo banco. CSV não tem nada — este módulo
// sintetiza um id determinístico a partir dos únicos três campos que o CSV
// sempre traz. Aceita qualquer objeto com esses três campos (não exige o
// `imported_id`, que é justamente o que ainda não existe) — cobre tanto uma
// `LinhaImportada` completa quanto o retorno de `parseCsv` (que não tem id).
export type LinhaParaId = Pick<
  LinhaImportada,
  'purchase_date' | 'amount_cents' | 'description'
>

// Normaliza só o suficiente pra não gerar hashes diferentes por causa de
// diferença cosmética de formatação (espaço duplicado, maiúsculo/minúsculo)
// entre exportações do mesmo lançamento — NÃO é o `normalizeName` de payee
// (apps/financas/src/domain/payees.ts), que resolve um problema diferente
// (casar estabelecimento) e tem sua própria limitação documentada lá. Aqui
// o único objetivo é estabilidade do hash.
function normalizarDescricao(descricao: string): string {
  return descricao.trim().replace(/\s+/g, ' ').toUpperCase()
}

// Hash estável = SHA-256 hex de 'data|valor_em_centavos|descrição
// normalizada'. Determinístico por construção: a entrada é só texto vindo
// da própria linha, sem timestamp, sem random, sem ordem de iteração de
// objeto (os três campos são lidos por nome, não via `Object.keys`/
// `JSON.stringify`, que não garantem ordem estável entre engines) — o
// mesmo `chave` sempre passa pelo mesmo SHA-256 e sai o mesmo hex, em
// qualquer processo, máquina ou sessão.
//
// ⚠️ Limitação conhecida e aceita (spec §5): duas compras GENUINAMENTE
// diferentes com mesma data, mesmo valor e mesma descrição (dois cafés de
// R$ 8 na mesma padaria no mesmo dia) produzem o MESMO id — a segunda
// parece duplicata. Ver id.test.ts. A tela de conferência (task 5) mostra
// o que foi considerado duplicado e deixa o dono forçar a importação.
export async function idEstavel(linha: LinhaParaId): Promise<string> {
  const chave = `${linha.purchase_date}|${linha.amount_cents}|${normalizarDescricao(linha.description)}`
  const bytes = new TextEncoder().encode(chave)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return toHex(new Uint8Array(digest))
}
