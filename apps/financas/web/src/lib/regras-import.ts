import {
  aplicarRegras,
  type Regra,
  type RegraAplicada,
} from '@piluvitu/tools/regras'
import { sugerirPayee, type PayeeParaSugestao } from './payee-suggest'

/**
 * O ÚNICO lugar que decide o que uma linha importada vem sugerindo — e,
 * por isso, o único lugar que precisa acertar as duas coisas difíceis:
 * quem ganha quando regra e `default_category_id` discordam, e o que fazer
 * quando a categoria sugerida não existe mais na lista.
 *
 * `aplicarRegras` (o motor) vem de `@piluvitu/tools/regras` — o MESMO
 * módulo que o Worker usa pra contar quantos lançamentos cada regra
 * casaria. Aqui só mora a POLÍTICA (precedência + validação); o matching
 * não é reimplementado.
 */

export type CategoriaCarregada = { id: string }

export type SugestaoLinha = {
  payee_id: string
  category_id: string
  is_business: 0 | 1
  /** Trilha pra tela responder "por quê" — vazia quando nenhuma regra casou. */
  regras: RegraAplicada[]
  /**
   * `true` quando alguma sugestão foi DESCARTADA por apontar pra uma
   * categoria/favorecido fora da lista carregada. A tela avisa em vez de
   * simplesmente mostrar o campo vazio — "a regra não casou" e "a regra
   * casou e a categoria dela sumiu" são coisas diferentes.
   */
  sugestaoDescartada: boolean
}

/**
 * ⚠️ **QUEM GANHA QUANDO REGRA E `default_category_id` DISCORDAM: A REGRA.**
 *
 * `payees.default_category_id` é um *default* pendurado num favorecido —
 * um palpite permanente ("o que eu gasto aqui costuma ser X"), gravado uma
 * vez, sem nome, sem tela própria, e que o dono nem lembra que existe. A
 * regra é uma frase explícita que ELE escreveu, com nome, prioridade
 * visível e uma tela onde dá pra editar e apagar.
 *
 * Entre uma afirmação explícita e um atributo implícito de outro registro,
 * ganha a explícita — e o motivo prático fecha o argumento: se o default
 * vencesse, uma regra JAMAIS conseguiria corrigir um favorecido já
 * cadastrado, que é exatamente onde o dono mais precisa corrigir. As
 * regras seriam inúteis justo nas linhas que ele mais importa.
 *
 * O default continua valendo em tudo que a regra não disser: linha sem
 * regra que case cai nele igual a antes desta fatia, e uma regra que só
 * mexe em `is_business` não apaga a categoria que veio do favorecido.
 *
 * ⚠️ **Sem encadeamento:** quando uma regra troca o FAVORECIDO, o
 * `default_category_id` do favorecido NOVO não é puxado. Seria uma
 * terceira camada, com uma ordem que ninguém consegue prever de cabeça
 * ("a regra venceu o default, mas o default do payee que a regra escolheu
 * venceu a regra?"). O que a regra diz, vale; o que ela não diz, fica como
 * estava.
 *
 * ⚠️ **A categoria é validada contra a lista CARREGADA, pelos dois
 * caminhos.** Categoria neste app se ARQUIVA (`archived_at`), e
 * `GET /api/categories` esconde arquivada — mas nem o
 * `payees.default_category_id` nem `rules.set_category_id` são atualizados
 * quando isso acontece (a FK só dispara em DELETE, que não é o caminho de
 * arquivamento). Sem a checagem, o `<select>` mostraria "Sem categoria"
 * (nenhum `<option>` casa) enquanto o ESTADO carregaria o id arquivado, e
 * o envio o mandaria assim mesmo: o lançamento nasceria numa categoria que
 * nenhuma tela lista — invisível no relatório, sem erro nenhum. É o
 * defeito corrigido em `6ba822c`, e o caminho NOVO (regras) não pode
 * reintroduzi-lo. Mesma checagem pro favorecido, pelo mesmo motivo.
 */
export function sugerirParaLinha(
  linha: { description: string; amount_cents: number },
  ctx: {
    accountId: string
    payees: PayeeParaSugestao[]
    categories: CategoriaCarregada[]
    regras: Regra[]
  },
): SugestaoLinha {
  const doPayee = sugerirPayee(linha.description, ctx.payees)

  const daRegra = aplicarRegras(
    {
      description: linha.description,
      amount_cents: linha.amount_cents,
      account_id: ctx.accountId,
    },
    ctx.regras,
  )

  // A regra vence; o default do favorecido preenche o que ela não disse.
  const categoriaBruta =
    daRegra.category_id ?? doPayee?.default_category_id ?? null
  const payeeBruto = daRegra.payee_id ?? doPayee?.id ?? null

  const categoriaValida =
    categoriaBruta !== null &&
    ctx.categories.some((c) => c.id === categoriaBruta)
  const payeeValido =
    payeeBruto !== null && ctx.payees.some((p) => p.id === payeeBruto)

  return {
    category_id: categoriaValida ? (categoriaBruta as string) : '',
    payee_id: payeeValido ? (payeeBruto as string) : '',
    // Sem regra que diga o contrário, o default é PF (0) — o mesmo default
    // da coluna `transactions.is_business`, e o mesmo valor que TODA linha
    // importada recebia antes desta fatia.
    is_business: daRegra.is_business ?? 0,
    regras: daRegra.aplicadas,
    sugestaoDescartada:
      (categoriaBruta !== null && !categoriaValida) ||
      (payeeBruto !== null && !payeeValido),
  }
}

/** Texto curto do "por quê" da linha, pra tela não montar isso inline. */
export function explicarRegras(regras: RegraAplicada[]): string {
  if (regras.length === 0) return ''
  const nomes = regras.map((r) => r.name)
  return regras.length === 1
    ? `Sugerido pela regra "${nomes[0]}".`
    : `Sugerido por ${regras.length} regras, nesta ordem: ${nomes.join(' → ')}. A última vence quando duas mexem no mesmo campo.`
}
