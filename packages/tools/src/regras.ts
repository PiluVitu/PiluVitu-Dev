/**
 * Categorização automática por REGRA — o motor puro (fase 1).
 *
 * ⚠️ **NÃO é machine learning, e isso é decisão registrada.** Um usuário só
 * não gera dado de treino: qualquer modelo aprenderia com dezenas de linhas
 * e erraria de um jeito que o dono não consegue nem inspecionar nem
 * desfazer. O modelo copiado é o **Actual Budget Rules**
 * (https://actualbudget.org/docs/budgeting/rules/) — declarativo e
 * auditável: o dono escreve a regra, vê quais regras casaram, e desfaz
 * trocando o campo antes de confirmar.
 *
 * ⚠️ **Por que este arquivo mora em `packages/tools` e não em
 * `apps/financas/src/domain/`:** os DOIS lados precisam do MESMO matcher —
 * o Worker (pra contar quantas transações existentes cada regra casaria,
 * `GET /api/rules/matches`) e a SPA (pra sugerir na tela de conferência do
 * import, que roda 100% no navegador porque o Worker nunca vê o arquivo).
 * Worker e SPA são bundles/runtimes diferentes, sem fronteira de import
 * entre si — foi exatamente essa fronteira que já obrigou `todayInTeresina`
 * e `normalizeName` a existirem em DUAS cópias. Uma segunda cópia de um
 * MATCHER seria pior que as duas anteriores: cópias de formatação divergem
 * e alguém nota; cópias de matching divergem e a tela passa a sugerir
 * categoria diferente da que o contador de "quantas casariam" prometeu —
 * em silêncio, que é a classe de defeito que este módulo caça em toda
 * fatia. `@piluvitu/tools` já é importado pelos dois (`money`/`import` no
 * Worker, `money`/`import`/`simulacao` na SPA), então é o único lugar que
 * existe hoje capaz de ser fonte ÚNICA.
 *
 * Sem React/DOM/D1 aqui — só TS puro (regra do pacote).
 */

/**
 * Espelha 1:1 a linha da tabela `rules` (migration 0009). Os nomes são os
 * das COLUNAS, não nomes "bonitos" de domínio, de propósito: este objeto
 * atravessa a rota HTTP sem tradução nenhuma, e um mapeamento no meio seria
 * mais um lugar pra errar sem que nada quebrasse alto.
 *
 * Prefixos `match_` (condição) e `set_` (ação) fazem a linha se ler como
 * "SE ... ENTÃO ..." da esquerda pra direita, tanto no SQL quanto aqui.
 */
export type Regra = {
  id: string
  name: string
  /** substring da descrição, comparada normalizada (caixa/acento). NULL = não restringe. */
  match_text: string | null
  /** conta específica. NULL = qualquer conta. */
  match_account_id: string | null
  /** faixa de valor em MAGNITUDE (centavos absolutos). NULL = sem piso/teto. */
  match_min_cents: number | null
  match_max_cents: number | null
  /** sinal: 'expense' = saída (amount < 0), 'income' = entrada. NULL = qualquer. */
  match_direction: 'expense' | 'income' | null
  set_category_id: string | null
  set_payee_id: string | null
  /** 0 | 1 | null — NULL significa "não mexe", nunca "marque como PF". */
  set_is_business: number | null
  priority: number
  active: number
  created_at: string
  updated_at: string
}

/** O mínimo que uma transação precisa expor pra ser testada contra uma regra. */
export type TransacaoParaRegras = {
  description: string
  amount_cents: number
  account_id?: string | null
}

export type CampoRegra = 'category_id' | 'payee_id' | 'is_business'

/** Uma entrada da trilha de auditoria: qual regra casou e o que ela setou. */
export type RegraAplicada = {
  id: string
  name: string
  campos: CampoRegra[]
}

export type ResultadoRegras = {
  /** `null` = nenhuma regra tocou este campo (≠ "nenhuma categoria"). */
  category_id: string | null
  payee_id: string | null
  is_business: 0 | 1 | null
  /**
   * TODAS as regras que casaram, na ordem em que foram aplicadas. Uma regra
   * cujo campo foi sobrescrito por outra mais adiante CONTINUA aqui — é a
   * trilha que responde "por quê", e omitir a sobrescrita esconderia
   * justamente o conflito que o dono precisa ver pra reordenar.
   */
  aplicadas: RegraAplicada[]
}

/**
 * Caixa alta, sem acento, espaços colapsados. Mesma técnica de
 * `normalizeName` (payees): NFD + remoção de `\p{M}` cobre qualquer
 * diacrítico combinante, sem caractere combinante literal no fonte.
 *
 * ⚠️ **Isto NÃO vira uma coluna derivada `match_text_norm` na tabela.**
 * `payees.norm_name` existe porque é CHAVE DE ÍNDICE (`idx_payees_norm`,
 * lookup sargable no SQL) — e por isso precisa ser recalculada junto com o
 * `name`, uma disciplina que já custou um bug quando foi esquecida. Aqui
 * não há índice nem matching em SQL: são algumas dezenas de regras casadas
 * em TS. Uma coluna derivada só criaria um jeito de a normalização gravada
 * discordar do texto gravado, sem comprar velocidade nenhuma.
 */
export function normalizarParaRegra(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Todas as condições preenchidas precisam casar (AND). Condição `null` é
 * ignorada — nunca tratada como "casa com nada", o que faria toda regra
 * parcialmente preenchida virar letra morta.
 *
 * A faixa de valor compara MAGNITUDE (`Math.abs`), não o valor com sinal:
 * `transactions.amount_cents` é negativo pra despesa, então "entre R$ 50 e
 * R$ 200" escrito com sinal significaria uma faixa invertida e vazia
 * (`-5000 >= 5000`). O sinal é outra pergunta, e tem coluna própria
 * (`match_direction`) exatamente pra não se misturar com a faixa.
 */
export function regraCasa(regra: Regra, tx: TransacaoParaRegras): boolean {
  if (regra.match_text !== null) {
    const alvo = normalizarParaRegra(regra.match_text)
    // Regra com texto só de espaço casaria com tudo — o CHECK do schema já
    // barra texto vazio, mas a normalização pode esvaziar o que passou.
    if (alvo === '') return false
    if (!normalizarParaRegra(tx.description).includes(alvo)) return false
  }

  if (regra.match_account_id !== null) {
    if ((tx.account_id ?? null) !== regra.match_account_id) return false
  }

  const magnitude = Math.abs(tx.amount_cents)
  if (regra.match_min_cents !== null && magnitude < regra.match_min_cents)
    return false
  if (regra.match_max_cents !== null && magnitude > regra.match_max_cents)
    return false

  if (regra.match_direction !== null) {
    const direcao = tx.amount_cents < 0 ? 'expense' : 'income'
    if (direcao !== regra.match_direction) return false
  }

  return true
}

/**
 * Ordem de aplicação: `priority` ASC, desempatado por `created_at` e por
 * `id`.
 *
 * ⚠️ **As TRÊS partes são necessárias, e a lição é medida neste mesmo
 * módulo:** o cursor do extrato (`migrations/0008`) precisou de três
 * colunas porque `(purchase_date, created_at)` NÃO é único e paginar de 2
 * em 2 devolveu 4 de 6 parcelas. Aqui o sintoma seria pior por ser
 * intermitente: duas regras com a MESMA `priority` aplicadas em ordem
 * arbitrária do SQLite fariam o MESMO conjunto de regras produzir
 * categorias diferentes entre execuções, e o dono não teria como
 * reproduzir. `id` (PK) fecha a ordem TOTAL.
 */
export function ordenarRegras<T extends Regra>(regras: T[]): T[] {
  return [...regras].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    if (a.created_at !== b.created_at)
      return a.created_at < b.created_at ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

/**
 * Aplica as regras ativas e devolve **o que mudaria** — nunca grava nada.
 * É essa forma (entrada → efeito descrito) que permite mostrar ao dono o
 * que vai acontecer ANTES de confirmar, que é o requisito central da fatia:
 * ele precisa poder ver POR QUE uma transação foi categorizada, e desfazer.
 *
 * ⚠️ **CONFLITO É O CASO COMUM, NÃO A BORDA — e a decisão é: TODAS as
 * regras que casam se aplicam, em ordem, com o ÚLTIMO vencendo POR CAMPO.**
 * As alternativas foram descartadas com motivo:
 *
 *  - **"primeira que casa vence, e para"** — mata composição, que é o uso
 *    real. "Tudo no cartão da PJ é `is_business=1`" (regra ampla) e "Uber →
 *    Transporte" (regra estreita) precisam valer JUNTAS; com a primeira
 *    vencendo, o dono perderia uma das duas e teria que repetir o
 *    `is_business` dentro de cada regra de estabelecimento — dezenas de
 *    cópias da mesma decisão, que é como uma regra deixa de ser auditável.
 *  - **"a mais específica vence"** — exige uma métrica de especificidade
 *    que o dono NÃO VÊ. Texto mais longo? Mais condições preenchidas? As
 *    duas empatam o tempo todo (texto longo × conta + faixa), e qualquer
 *    critério que eu invente aqui vira uma regra secreta que ele teria que
 *    adivinhar pra prever o resultado. Uma regra que ele não consegue
 *    prever é uma regra que ele não vai confiar.
 *  - **ordem explícita (escolhida)** — é o modelo do Actual Budget, e é o
 *    único em que a UI pode mostrar a cadeia inteira ("3 regras casaram,
 *    nesta ordem, e o resultado final foi este"). Conflito deixa de ser
 *    algo que o motor resolve escondido e vira algo que o dono resolve
 *    arrastando a prioridade — visível, editável, reproduzível.
 *
 * `active = 0` nunca entra (filtrado aqui, não no chamador — pausar uma
 * regra tem que valer pra todo consumidor de uma vez).
 */
export function aplicarRegras(
  tx: TransacaoParaRegras,
  regras: Regra[],
): ResultadoRegras {
  const resultado: ResultadoRegras = {
    category_id: null,
    payee_id: null,
    is_business: null,
    aplicadas: [],
  }

  for (const regra of ordenarRegras(regras.filter((r) => r.active === 1))) {
    if (!regraCasa(regra, tx)) continue

    const campos: CampoRegra[] = []
    if (regra.set_category_id !== null) {
      resultado.category_id = regra.set_category_id
      campos.push('category_id')
    }
    if (regra.set_payee_id !== null) {
      resultado.payee_id = regra.set_payee_id
      campos.push('payee_id')
    }
    if (regra.set_is_business !== null) {
      resultado.is_business = regra.set_is_business === 1 ? 1 : 0
      campos.push('is_business')
    }

    // Uma regra sem nenhuma ação é barrada pelo CHECK do schema; se ainda
    // assim chegar aqui (linha escrita por fora, `wrangler d1 execute`),
    // não entra na trilha — listar uma regra que não fez nada como se
    // tivesse feito é exatamente a mentira que a trilha existe pra evitar.
    if (campos.length > 0)
      resultado.aplicadas.push({ id: regra.id, name: regra.name, campos })
  }

  return resultado
}
