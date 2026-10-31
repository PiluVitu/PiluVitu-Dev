import { formatBRL } from '@piluvitu/tools/money'
import type { CategoryRow } from './reports'
import type { InsightNumbers } from './insights'

// Porte byte a byte do `build_prompt` de apps/promeia/src/promeia/insight.py,
// travado pelas fixtures de insight-prompt.test.ts. As REGRAS OBRIGATÓRIAS do
// fim impedem o modelo de inventar número: não as enfraqueça.

function linhaCategoria(row: CategoryRow, index: number): string {
  return `${index + 1}. ${row.category_name}: ${formatBRL(Math.abs(row.total_cents))}`
}

function linhaVariacao(numbers: InsightNumbers): string {
  const pct = numbers.variation_pct
  const cents = numbers.variation_cents
  const anterior = numbers.previous_competence
  if (pct === null) {
    return `Sem base de comparação: não houve gasto registrado em ${anterior}.`
  }
  if (cents === 0) return `Sem variação em relação a ${anterior}.`
  const direcao = cents > 0 ? 'Aumento' : 'Redução'
  return `${direcao} de ${formatBRL(Math.abs(cents))} (${Math.abs(pct)}%) em relação a ${anterior}.`
}

function linhaMaiorCrescimento(numbers: InsightNumbers): string {
  const b = numbers.biggest_increase
  if (b === null) return '(sem dado suficiente para apontar)'
  const direcao = b.delta_cents >= 0 ? 'aumento' : 'redução'
  return (
    `${b.category_name}: foi de ${formatBRL(Math.abs(b.previous_cents))} ` +
    `para ${formatBRL(Math.abs(b.current_cents))} (${direcao} de ` +
    `${formatBRL(Math.abs(b.delta_cents))}).`
  )
}

export function montarPromptInsight(numbers: InsightNumbers): string {
  const competence = numbers.competence
  const anterior = numbers.previous_competence
  const top = numbers.top_categories

  const linhasCategorias =
    top.length > 0
      ? top.map(linhaCategoria).join('\n')
      : '(nenhum gasto registrado nesta competência)'

  return `Você escreve um resumo financeiro curto, em português do Brasil, para o dono de um controle financeiro pessoal/PJ.

Abaixo estão os ÚNICOS fatos que você pode usar. Eles já foram calculados por consulta exata ao banco de dados — você NÃO tem acesso a nenhum lançamento individual, só a estes totais já agregados.

Competência: ${competence} (mês anterior de comparação: ${anterior})
Total gasto em ${competence}: ${formatBRL(Math.abs(numbers.total_cents))}
Total gasto em ${anterior}: ${formatBRL(Math.abs(numbers.previous_total_cents))}
Variação: ${linhaVariacao(numbers)}

Maiores categorias de gasto em ${competence} (da maior para a menor):
${linhasCategorias}

Categoria com a maior variação de gasto em relação a ${anterior}:
${linhaMaiorCrescimento(numbers)}

Escreva um parágrafo de 3 a 5 frases resumindo esses fatos para o dono, em tom direto, sem saudação, sem "espero que ajude", sem markdown, sem lista — só o parágrafo corrido.

REGRAS OBRIGATÓRIAS, sem exceção:
- Use SOMENTE os números e nomes de categoria que aparecem acima. Não calcule nada novo, não arredonde diferente do que já está escrito, não converta nem estime.
- NUNCA invente um valor, uma categoria ou uma porcentagem que não esteja listada acima.
- Se um fato não tem dado suficiente (ex.: "sem base de comparação" ou "nenhum gasto registrado"), diga isso em vez de inventar um número.
- Não é preciso citar todos os números — escolha o que mais importa para contar a história do mês, mas nunca cite um número que não veio da lista acima.`
}
