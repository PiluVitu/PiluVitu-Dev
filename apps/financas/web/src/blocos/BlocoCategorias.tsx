import { lazy, Suspense, useEffect, useState } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { competenciaAtual } from '../lib/dates'
import { NUMERO_GRID, ROTULO } from '../lib/tipografia'
import { rotuloCompetencia } from '../lib/commitments'
import type { ByCategoryReportView } from '../lib/categories'
import type { InsightNumbersView } from '../lib/insight'
import { Bloco } from './Bloco'

// Mesmo chunk lazy de `GraficoComprometido.tsx` (Task 6) — NÃO um segundo
// `import()` de `recharts`. `GraficoCategorias` é uma exportação NOMEADA
// desse mesmo arquivo (ver o comentário lá pro motivo completo); resolver
// este `import()` carrega o MESMO chunk físico que `BlocoComprometido.tsx`
// já carrega sob demanda, então o custo de ~104 KB gzip do `recharts` é
// pago uma vez só, não duas.
const GraficoCategorias = lazy(() =>
  import('./GraficoComprometido').then((m) => ({
    default: m.GraficoCategorias,
  })),
)

/**
 * "Para onde foi o dinheiro" — a pergunta que o dono deu quando perguntado
 * qual pergunta este módulo tinha que responder (ver brief da Task 8).
 * Quarto e último bloco da home. Autônomo como os outros três, mas com uma
 * diferença: tem um parâmetro que o USUÁRIO controla (o mês) — os outros
 * três não têm controle nenhum.
 *
 * Mês default = mês corrente via `competenciaAtual()` (`todayInTeresina()`
 * por baixo, NUNCA `new Date().toISOString()` cru — ver `lib/dates.ts` e o
 * bug real que motivou essa regra, documentado lá).
 *
 * ⚠️ Trocar de mês NÃO zera `report` — o card não volta pro skeleton de
 * carregamento a cada troca (ficaria piscando a cada clique no seletor).
 * O `report` antigo continua visível até o novo chegar; o `useEffect` com
 * a flag `vivo` (mesmo padrão dos outros blocos) já ignora uma resposta
 * antiga que resolva DEPOIS de o usuário já ter trocado de mês de novo —
 * sem isso, uma resposta lenta do mês anterior poderia sobrescrever o mês
 * mais recente que o usuário já está vendo.
 *
 * ⚠️ **Fix round 1 (Task 8, IMPORTANT do review): erro de REFETCH (mês
 * trocado depois de já ter carregado uma vez) não pode passar pelo `erro`
 * de `Bloco`.** `Bloco` trata `erro`/`carregando`/`vazio`/`children` como
 * mutuamente exclusivos — se o `erro` de uma troca de mês fosse repassado
 * do mesmo jeito que o erro do carregamento INICIAL, `children` inteiro
 * (seletor incluído) sumia atrás do card de alerta. Como o `<input
 * type="month">` só existe DENTRO de `children`, o dono ficava sem
 * `setMes` alcançável — a única saída seria navegar pra outra tela e
 * voltar. Cenário real: dono no Android com conexão instável, mês de
 * agosto carregado, troca pra julho, essa busca dá 503 — sem este fix, o
 * card vira só uma linha de erro, sem seletor, sem jeito de voltar pra
 * agosto de dentro do card. Resolvido igual à decisão de `vazio` acima
 * (mesmo raciocínio de `BlocoSaldos`, Task 7): `erroRefetch` é derivado do
 * MESMO estado `erro`, mas só entra em jogo quando `report !== null`
 * (então NÃO é passado pro `Bloco`) — mostrado inline, `role="alert"`,
 * ao lado do total, sem esconder nem o seletor nem o `report`/gráfico
 * antigos. `erroInicial` (report ainda `null`) continua indo pro `Bloco`
 * normalmente — mesmo comportamento dos outros três blocos, sem mudança.
 */
export function BlocoCategorias() {
  const [mes, setMes] = useState(() => competenciaAtual())
  const [report, setReport] = useState<ByCategoryReportView | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [numeros, setNumeros] = useState<InsightNumbersView | null>(null)

  useEffect(() => {
    let vivo = true
    api<ByCategoryReportView>(`/api/reports/by-category?competence=${mes}`)
      .then((data) => {
        if (vivo) {
          setReport(data)
          setErro(null)
        }
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [mes])

  // ⑥ A REFERÊNCIA: "R$ 900,00 é muito ou pouco?" — a resposta é contra o
  // mês anterior. `GET /api/insights/numbers` já devolve `variation_cents`/
  // `variation_pct` prontos.
  //
  // ⚠️ **Por que consumir a rota em vez de buscar o mês anterior e subtrair
  // aqui:** a variação NÃO é `atual - anterior` dos totais crus.
  // `byCategory` devolve despesa com sinal NEGATIVO, e o Worker compara
  // MAGNITUDES (`Math.abs`) de propósito — usar os totais crus inverteria
  // o sinal, e "gastei mais" apareceria como variação negativa
  // (`src/domain/insights.ts`, comentário do `variation_cents`). Reproduzir
  // essa regra no cliente seria uma segunda cópia de uma conta cuja versão
  // errada PARECE certa. Custo aceito: `/api/insights/numbers` roda
  // `byCategory` duas vezes (atual + anterior), então a home passa a
  // executá-la 3× no mesmo mês — dado de um usuário só, tabela minúscula.
  //
  // ⚠️ Efeito SEPARADO e falha SILENCIOSA, mesmo desenho de `BlocoSaldos`:
  // esta rota é a referência, não o assunto do card. Se ela cair, o total
  // e o gráfico continuam — nunca um `role="alert"` sobre uma rota que o
  // dono não pediu.
  useEffect(() => {
    let vivo = true
    setNumeros(null)
    api<InsightNumbersView>(`/api/insights/numbers?competence=${mes}`)
      .then((data) => {
        if (vivo) setNumeros(data)
      })
      .catch(() => {
        if (vivo) setNumeros(null)
      })
    return () => {
      vivo = false
    }
  }, [mes])

  // `report === null` só antes do PRIMEIRO carregamento — ver o comentário
  // acima sobre por que trocar de mês não zera `report`.
  const carregando = report === null && erro === null
  const vazio = report !== null && report.rows.length === 0
  // Ver o ⚠️ acima: mesmo `erro`, duas rotas de exibição diferentes
  // dependendo se já existe (ou nunca existiu) um `report` de sucesso.
  const erroInicial = report === null ? erro : null
  const erroRefetch = report !== null ? erro : null

  return (
    <Bloco
      titulo="Para onde foi o dinheiro"
      carregando={carregando}
      erro={erroInicial}
    >
      {report ? (
        <div className="space-y-3">
          {/*
            ⚠️ **A estrutura MUDOU, e não foi por gosto: a faixa antiga já
            estava quebrada antes de qualquer promoção.** Seletor e total
            dividiam um `flex … justify-between gap-3`; medido a 768px (o
            `md`, onde a caixa útil do card é de **174px** — ver o ⚠️ de
            escala em `BlocoSaldos.tsx`), o `<input type="month">` sozinho
            é `max-w-40` (160px) + `gap-3` (12) = 172 dos 174, e o total de
            14px já saía em DUAS caixas de linha. Promover a fonte sem
            mexer na estrutura pioraria um defeito existente.

            Agora o seletor tem a própria linha e o número tem a caixa
            inteira — que é também a anatomia do rótulo ACIMA do valor
            (`NumeroCard`, `pages/insight.tsx`).
          */}
          <div>
            {/* `<label>` nativo (nesting, sem `htmlFor`/`id`) — mesmo padrão
                de `new-entry.tsx`/`NovoItemForm.tsx`/`DividasPage.tsx` pros
                campos de data. O `<input>` recebe as classes do componente
                `Input` de `@piluvitu/ui` (Tailwind, tokens do design
                system) copiadas à mão em vez de importar o componente:
                `Input`/`Label` reais puxariam `@radix-ui/react-label` pro
                bundle PRINCIPAL (este bloco não é lazy, só o gráfico é) por
                um wrapper decorativo — peso novo sem ganho real, quando um
                `<label>` nativo já é o padrão usado pelos OUTROS blocos e
                telas deste app (ver BlocoSaldos.tsx, que fez a mesma
                escolha pro link "Criar conta": Tailwind direto, não um
                componente novo de `@piluvitu/ui`). */}
            <label className="text-sm font-medium">
              Mês
              <input
                type="month"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className="border-input focus-visible:ring-ring mt-1 flex h-9 w-full max-w-40 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-hidden"
              />
            </label>
          </div>

          {/*
            ⚠️ **A manchete é o TOTAL GASTO DO MÊS — a resposta da pergunta
            que dá título ao card.** Antes saía em `text-sm font-semibold`
            (14px), o mesmo peso do rótulo do campo ao lado.

            ⚠️ `NUMERO_GRID` (24px) COM centavos, pelo mesmo par de razões
            de `BlocoSaldos` (a caixa de 174px a 768 decide a escala; e a
            linha imediatamente abaixo — a `Variacao` — mostra o delta COM
            centavos, então um total arredondado em cima dela não
            reconciliaria: "R$ 900" − "R$ 350,00").

            ⚠️ **`whitespace-nowrap` SAIU.** Ele existia porque o número
            dividia a linha com o seletor; com a caixa inteira o valor
            cabe, e mantê-lo transformaria uma quebra de linha inofensiva
            em overflow de PÁGINA — exatamente o defeito já pago (e
            registrado) na `Variacao` logo abaixo.

            ⚠️ Nada de `NumeroCard`: seria Card dentro de Card (`Bloco` já
            é um `<Card>`). Reusa-se a tipografia, nunca o componente.
          */}
          <div>
            <p className={ROTULO}>Total gasto</p>
            <p data-testid="total-gasto" className={cn('mt-1', NUMERO_GRID)}>
              {formatBRL(Math.abs(report.total_cents))}
            </p>
            <Variacao numeros={numeros} />
          </div>
          {erroRefetch ? (
            <p role="alert" className="text-destructive text-sm">
              {erroRefetch}
            </p>
          ) : null}
          {vazio ? (
            <p className="text-muted-foreground text-sm">
              Nenhum gasto em {rotuloCompetencia(mes)}.
            </p>
          ) : (
            <Suspense fallback={<div aria-busy="true" />}>
              <GraficoCategorias report={report} />
            </Suspense>
          )}
        </div>
      ) : null}
    </Bloco>
  )
}

/**
 * "Gastou R$ 340,00 (+61%) a mais que jun/26" — a referência que faltava
 * pro total absoluto (⑥). Todos os números vêm de
 * `GET /api/insights/numbers`; nada é recalculado aqui (ver o ⚠️ do efeito
 * que os busca).
 *
 * ⚠️ **Nenhum VERDE.** Gastar menos é uma boa notícia, e o impulso óbvio é
 * pintá-la de verde — mas o par verde/vermelho é exatamente a regressão de
 * acessibilidade que este app já recusou (protanopia/deuteranopia
 * preservam o azul, não o verde; `--success` fica reservado pra confirmação
 * de salvamento). Gastou MAIS usa `--destructive`, coerente com "vermelho =
 * dinheiro saindo" no resto do app; gastou menos fica no cinza neutro de
 * `--muted-foreground`.
 *
 * ⚠️ **E a cor não é o sinal de qualquer jeito**: o sinal é o `+`/`−`
 * explícito na frente do valor, mais as palavras "a mais"/"a menos". Cinza
 * e vermelho a 1,80:1 teriam o mesmo problema medido de ⑤ — aqui o texto
 * carrega tudo sozinho.
 */
function Variacao({ numeros }: { numeros: InsightNumbersView | null }) {
  // Rota falhou, ainda carregando, ou nada a comparar — a ausência é
  // silenciosa (o total continua lá).
  if (numeros === null || numeros.variation_cents === 0) return null

  const gastouMais = numeros.variation_cents > 0
  const sinal = gastouMais ? '+' : '−'
  const valor = formatBRL(Math.abs(numeros.variation_cents))
  // `variation_pct` é null quando o mês anterior não teve gasto nenhum
  // (divisão por zero evitada no Worker) — aí só o valor absoluto aparece,
  // nunca um "Infinity%" nem um 0% inventado.
  const pct =
    numeros.variation_pct === null
      ? ''
      : ` (${sinal}${Math.abs(numeros.variation_pct)}%)`

  return (
    <p
      data-testid="variacao"
      // ⚠️ SEM `whitespace-nowrap`, e isso é conserto de regressão medida,
      // não preferência. Com ele, esta frase media **213 px** dentro de um
      // `div.text-right` que divide 308 px com o `<input type="month">`
      // (`max-w-40`) + `gap-3` — sobram **136 px**. Resultado, medido no
      // Chrome real a 390×844 variando só o mock: sem variação → 390/390;
      // `+R$ 1,00 (+1%)…` → 405/390; `+R$ 326,90 (+21%)…` → **426/390**.
      // Ou seja, QUALQUER variação com `%` fazia a HOME — a primeira tela
      // do celular — rolar na horizontal e cortar o fim da frase.
      //
      // `variation_pct` só é `null` quando o mês anterior não teve gasto
      // nenhum, então o caso que estourava era o comum, não a borda.
      // Deixar a frase quebrar em duas linhas custa altura; `nowrap` custava
      // a página inteira.
      className={cn(
        'text-xs tabular-nums',
        gastouMais ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {sinal}
      {valor}
      {pct} {gastouMais ? 'a mais' : 'a menos'} que{' '}
      {rotuloCompetencia(numeros.previous_competence)}
    </p>
  )
}
