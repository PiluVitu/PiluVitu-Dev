import { normalizeName } from './payee-suggest'

/**
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE: a dedupe exata NÃO CRUZA ORIGENS, e a
 * tela afirmava o contrário.
 *
 * `uq_tx_imported` é `(account_id, imported_id)`, e cada origem carimba um
 * esquema de id DIFERENTE por natureza: OFX usa o FITID do banco, o CSV usa
 * o hash `idEstavel` (`@piluvitu/tools/import`), o Pluggy usa um UUID
 * próprio, e lançamento manual não tem `imported_id` nenhum. A MESMA compra
 * vinda por duas portas nunca colide — não existe colisão pro índice ver.
 *
 * MEDIDO no D1 real: a mesma compra (`2026-07-10`, `-18990`,
 * `SUPERMERCADO XPTO`) importada por OFX (`imported_id` = FITID
 * `20260710001234`) e depois por Pluggy (`imported_id` = UUID) resultou em
 * `skipped: 0`, DUAS linhas, `SUM(amount_cents) = -37980` — o dobro. E a
 * tela dizia, literalmente, "0 já parecem importadas — desmarcadas por
 * padrão", com o checkbox PRÉ-MARCADO.
 *
 * A fatia do Pluggy não criou o buraco (ele existe desde que há mais de uma
 * origem), mas o tornou provável: o cenário real é o dono importar 12 meses
 * por OFX hoje, ligar o Pluggy amanhã e sincronizar a mesma janela —
 * `accountBalances`, `cashflow` e `byCategory` erram por 2x, sem nenhum
 * erro na tela.
 *
 * ⚠️ DEDUPE EXATA ENTRE ORIGENS É IMPOSSÍVEL — não é uma lacuna a fechar.
 * O que dá pra fazer é (a) parar de afirmar o que não se sabe (a frase do
 * resumo, em `pages/importar.tsx`) e (b) SINALIZAR O PROVÁVEL, que é o que
 * este módulo faz. O resultado é sempre um PALPITE apresentado como
 * palpite: a linha nasce desmarcada, com o motivo e a linha com que ela
 * colide à vista, e o dono pode marcá-la de volta — a tela nunca pode ser
 * mais confiante que o método.
 */

/**
 * O que a checagem precisa de cada lançamento JÁ GRAVADO. É um subconjunto
 * do que `GET /api/transactions` já devolve (`listTransactions` faz
 * `SELECT` das 20 colunas) — ver o ⚠️ de custo em `detectarProvaveis`.
 */
export type TxExistente = {
  purchase_date: string
  amount_cents: number
  description: string
  import_source: string | null
}

export type LinhaCandidata = {
  purchase_date: string
  amount_cents: number
  description: string
}

/** A linha já gravada com a qual a candidata provavelmente colide. */
export type ColisaoProvavel = {
  purchase_date: string
  amount_cents: number
  description: string
  /** Origem já normalizada (`null`/vazio de lançamento manual vira 'manual'). */
  origem: string
  /** Diferença de dias (0 ou 1) — entra no texto do aviso. */
  diasDeDiferenca: number
  /**
   * A descrição normalizada bate. NÃO é condição pra casar (ver ⚠️ do
   * critério abaixo) — só deixa o aviso mais forte pro dono decidir.
   */
  descricaoBate: boolean
}

/**
 * ⚠️ A JANELA É ±1 DIA, e o motivo é medido nesta mesma fatia: a conversão
 * de fuso. O app é `purchase_date`-cêntrico em GMT−3 e o Pluggy entrega
 * `date` em UTC — uma compra às 22h local é 01h UTC do dia SEGUINTE. O
 * adaptador (`src/domain/pluggy-map.ts`) converte, mas o OFX carimba a data
 * que o BANCO decidiu, que pode ser a de processamento: as duas origens
 * legitimamente discordam em um dia sobre a mesma compra. Exigir data
 * exata deixaria passar justamente a compra noturna.
 */
export const JANELA_DIAS = 1

const MS_POR_DIA = 86_400_000

/**
 * Lançamento manual não tem `import_source` (ou tem `'manual'`) — os dois
 * são a MESMA origem pra esta checagem, e a mais importante delas: uma
 * linha digitada à mão nunca teve `imported_id`, então a dedupe exata é
 * estruturalmente cega pra ela. Lançar o aluguel à mão e depois importar o
 * extrato é dupla contagem que nenhum índice deste banco consegue ver.
 */
export function origemDe(importSource: string | null | undefined): string {
  const s = (importSource ?? '').trim()
  return s === '' ? 'manual' : s
}

const ROTULOS: Record<string, string> = {
  manual: 'lançamento manual',
  ofx: 'arquivo OFX',
  csv: 'arquivo CSV',
  pdf: 'fatura em PDF',
  pluggy: 'sincronização com o banco',
  'share-target': 'compartilhamento',
}

/** Nome legível da origem — a tela nomeia de onde veio a linha que colide. */
export function rotuloOrigem(origem: string): string {
  return ROTULOS[origem] ?? origem
}

/**
 * Diferença em dias inteiros entre duas datas `YYYY-MM-DD`. As duas são
 * datas PURAS (sem hora), parseadas como UTC pelos dois lados — não há fuso
 * no meio, então a subtração é exata e não pode escorregar de dia (o bug
 * que este módulo já pagou cinco vezes vem de misturar data pura com
 * timestamp, nunca de comparar duas datas puras entre si).
 */
function diffDias(a: string, b: string): number | null {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  if ([ay, am, ad, by, bm, bd].some((n) => !Number.isFinite(n))) return null
  const ta = Date.UTC(ay, am - 1, ad)
  const tb = Date.UTC(by, bm - 1, bd)
  return Math.abs(ta - tb) / MS_POR_DIA
}

/**
 * ⚠️ O CRITÉRIO, e o lado pro qual ele erra DE PROPÓSITO.
 *
 * Uma linha é PROVÁVEL duplicata quando existe, na MESMA conta, um
 * lançamento já gravado de ORIGEM DIFERENTE com o MESMO `amount_cents`
 * (exato, ao centavo) e `purchase_date` dentro de ±1 dia.
 *
 * Três decisões, cada uma pesada contra o caso real que ela cria:
 *
 * 1. **Só cruza ORIGENS DIFERENTES.** Dentro da mesma origem os ids SÃO
 *    comparáveis, e a dedupe exata (`imported_id`) já é autoritativa — a
 *    heurística ali só somaria falso positivo. É essa restrição que
 *    desarma o contra-exemplo do brief: dois cafés de R$ 12 no mesmo dia,
 *    os dois no MESMO extrato OFX, não se marcam. E é o mesmo raciocínio
 *    que faz a checagem valer exatamente onde o índice não alcança.
 *
 * 2. **Cada lançamento gravado é consumido por, no máximo, UMA linha
 *    nova.** Se já existe UM café de R$ 12 no dia e o Pluggy traz DOIS, só
 *    o primeiro é marcado — o segundo é genuinamente novo e nasce marcado,
 *    como deve. Sem o consumo, um único lançamento antigo contaminaria
 *    todas as linhas de mesmo valor no dia.
 *
 * 3. **A DESCRIÇÃO NÃO É CONDIÇÃO — só reforço.** É a decisão mais
 *    contraintuitiva e a mais importante. Origens diferentes descrevem a
 *    MESMA compra com strings diferentes por construção: o OFX carrega o
 *    `MEMO` do banco (`COMPRA CARTAO 10/07 SUPERMERCADO XPTO`), o Pluggy
 *    devolve `description` já limpa (`Supermercado Xpto`), o CSV traz a
 *    coluna que o dono mapeou, e o lançamento manual traz o que o dono
 *    digitou ("mercado"). Exigir que batam faria a checagem falhar
 *    justamente no cenário que ela existe pra pegar. `normalizeName`
 *    (o mesmo de `payee-suggest.ts`, nunca uma segunda normalização) é
 *    aplicado só pra dizer, no aviso, se as descrições coincidem — o que
 *    ajuda o dono a decidir sem mudar o que casa.
 *
 * ⚠️ **ERRA PRO LADO DO FALSO POSITIVO, e isso é escolha, não descuido.**
 * Os dois erros não custam o mesmo: um falso positivo custa ao dono um
 * clique para remarcar a linha (com a linha colidente à vista, o
 * julgamento é imediato); um falso negativo custa dinheiro contado duas
 * vezes, e esse é irreversível pelo caminho normal — `uq_tx_imported`
 * impede reimportar por cima pra corrigir, então desfazer seria `DELETE`
 * manual ou Time Travel (que restaura o banco INTEIRO). Entre marcar demais
 * e deixar passar, marcar demais.
 *
 * ⚠️ **O que ISSO NÃO PODE VIRAR: ruído.** Marcar como duplicata o que é
 * obviamente legítimo ensina o dono a ignorar o aviso — e aí ele ignora o
 * verdadeiro, que é o único que custa dinheiro. As decisões 1 e 2 acima
 * existem exatamente pra manter o falso positivo raro em vez de aceitá-lo
 * de braços cruzados.
 *
 * ⚠️ **CUSTO NO D1: ZERO linha lida a mais.** A tela já buscava
 * `GET /api/transactions?account_id=…&limit=500` pra dedupe exata, e
 * `listTransactions` faz `SELECT` das 20 colunas — `purchase_date`,
 * `amount_cents`, `description` e `import_source` JÁ vinham no payload e
 * eram descartados. MEDIDO contra o D1 (Miniflare) com 300 lançamentos na
 * conta: `meta.rows_read = 600` (2 por linha: índice
 * `idx_tx_account_date` + tabela), com plano
 * `SEARCH transactions USING INDEX idx_tx_account_date (account_id=?)` —
 * o MESMO número antes e depois desta checagem, porque nenhuma query nova
 * foi acrescentada. Herda também o teto de 500 já documentado: numa conta
 * com mais de 500 lançamentos mais novos, uma colisão antiga não é vista —
 * mesma limitação (e mesma honestidade) da dedupe exata.
 */
export function detectarProvaveis(
  linhas: LinhaCandidata[],
  existentes: TxExistente[],
  origemDaImportacao: string,
  /**
   * ⚠️ Linhas que JÁ colidiram por `imported_id` exato — elas não competem
   * por candidato. Sem isso, uma linha que o dono nem vai considerar CONSOME
   * (`usado = true`) o único lançamento de outra origem, e a linha
   * genuinamente nova sai marcada e SEM aviso. Falso negativo: o lado caro,
   * segundo o critério declarado acima (dinheiro contado 2x, sem desfazer
   * barato). Omitir o array preserva o comportamento antigo.
   */
  ignorar?: readonly boolean[],
): (ColisaoProvavel | null)[] {
  const alvo = origemDe(origemDaImportacao)
  const candidatos = existentes
    .filter((t) => origemDe(t.import_source) !== alvo)
    .map((t) => ({ tx: t, usado: false }))

  return linhas.map((linha, i) => {
    if (ignorar?.[i]) return null
    let melhor: (typeof candidatos)[number] | null = null
    let melhorDias = Number.POSITIVE_INFINITY
    let melhorBate = false

    for (const c of candidatos) {
      if (c.usado) continue
      if (c.tx.amount_cents !== linha.amount_cents) continue
      const dias = diffDias(c.tx.purchase_date, linha.purchase_date)
      if (dias === null || dias > JANELA_DIAS) continue
      const bate =
        normalizeName(c.tx.description) === normalizeName(linha.description) &&
        normalizeName(linha.description) !== ''
      // Melhor candidato = data mais próxima; empatou, o que também casa a
      // descrição. Nunca o inverso: descrição é reforço, nunca condição.
      if (dias < melhorDias || (dias === melhorDias && bate && !melhorBate)) {
        melhor = c
        melhorDias = dias
        melhorBate = bate
      }
    }

    if (!melhor) return null
    melhor.usado = true
    return {
      purchase_date: melhor.tx.purchase_date,
      amount_cents: melhor.tx.amount_cents,
      description: melhor.tx.description,
      origem: origemDe(melhor.tx.import_source),
      diasDeDiferenca: melhorDias,
      descricaoBate: melhorBate,
    }
  })
}
