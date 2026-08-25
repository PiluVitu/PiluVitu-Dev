import { useEffect, useState } from 'react'
import { formatBRL, sumCents } from '@piluvitu/tools/money'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { NUMERO_GRID, ROTULO } from '../lib/tipografia'
import {
  custoFixoMensal,
  formatMeses,
  mesesDeSobrevivencia,
} from '../lib/reserve'
import type { EmergencyStatusView, FixedCostRangeView } from '../lib/reserve'
import { Bloco } from './Bloco'

export type AccountBalanceView = {
  id: string
  name: string
  scope: 'PJ' | 'PF'
  balance_cents: number
}

const SCOPES = ['PJ', 'PF'] as const

/**
 * Saldo por conta, com PJ e PF SEPARADOS — misturar os dois faz a tela
 * mentir sobre qual dinheiro é realmente do dono (renda fixa PJ vs. o resto).
 *
 * ⚠️ A separação AQUI é por `accounts.scope`, NÃO por
 * `transactions.is_business`. São coisas distintas de propósito: o schema
 * (0001, comentário das colunas) trata `accounts.scope` como *default* da
 * conta e `transactions.is_business` como a verdade final do lançamento —
 * dá para pagar algo PF pelo cartão PJ. Para um bloco de SALDO por conta, o
 * recorte certo é o da conta; quem quiser somar por natureza do gasto tem
 * que ir em `transactions.is_business`, que é outra pergunta. Autônomo,
 * mesmo padrão de BlocoComprometido: busca `GET /api/accounts` sozinho no
 * mount — a rota já esconde conta arquivada por padrão (`?archived=1` só
 * entraria se quiséssemos VER arquivada, o que este bloco não quer).
 */
export function BlocoSaldos() {
  const [accounts, setAccounts] = useState<AccountBalanceView[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [custo, setCusto] = useState<FixedCostRangeView | null>(null)

  useEffect(() => {
    let vivo = true
    api<AccountBalanceView[]>('/api/accounts')
      .then((data) => {
        if (vivo) setAccounts(data)
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  // ⑥ A REFERÊNCIA: "R$ 6.778,40 é muito ou pouco?" só tem resposta contra
  // alguma coisa, e a coisa é o custo fixo mensal — o mesmo número que a
  // Reserva já usa, derivado de `GET /api/reserve` (ver `custoFixoMensal`
  // em `lib/reserve.ts` pro porquê da derivação e de por que ela é exata).
  //
  // ⚠️ EFEITO SEPARADO, nunca um `Promise.all` com o de cima. Um
  // `Promise.all` amarraria o destino dos dois: uma falha em `/api/reserve`
  // (rota que este bloco NÃO existe pra mostrar) apagaria a lista de
  // saldos inteira. Precedente do módulo: os dois efeitos independentes de
  // `pages/insight.tsx` e o `erroInicial`/`erroRefetch` de
  // `BlocoCategorias.tsx`. Aqui a degradação é ainda mais simples: falhou,
  // `custo` fica `null` e a referência some — os saldos, que são o assunto
  // do card, continuam de pé sem nenhuma menção a um erro que o dono não
  // pode resolver a partir DESTE card.
  useEffect(() => {
    let vivo = true
    api<EmergencyStatusView>('/api/reserve')
      .then((status) => {
        if (vivo) setCusto(custoFixoMensal(status))
      })
      .catch(() => {
        if (vivo) setCusto(null)
      })
    return () => {
      vivo = false
    }
  }, [])

  const carregando = accounts === null && erro === null
  const semContas = accounts !== null && accounts.length === 0

  // O estado "sem conta" NÃO usa o `vazio`/`vazioMensagem` de `Bloco` (que só
  // renderiza texto) de propósito: produção hoje tem ZERO contas, e sem
  // conta nenhuma o dono não consegue lançar NADA — nem gasto, nem
  // pagamento de dívida. Isto não é decoração, precisa de um link real pra
  // sair do buraco, então é tratado como conteúdo normal (children), não
  // como o "vazio" genérico do card.
  return (
    <Bloco titulo="Saldos" carregando={carregando} erro={erro}>
      {semContas ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            Nenhuma conta cadastrada ainda — sem conta, não dá para lançar nada.
          </p>
          <a
            href="#/contas"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium shadow-sm transition-colors"
          >
            Criar conta
          </a>
        </div>
      ) : accounts ? (
        <div className="space-y-4">
          {SCOPES.map((scope) => {
            const list = accounts.filter((a) => a.scope === scope)
            if (list.length === 0) return null
            const total = sumCents(list.map((a) => a.balance_cents))
            // ⑥ A referência é POR ESCOPO, nunca sobre um PJ+PF somado —
            // somar os dois é justamente o que o card se recusa a fazer
            // (ver o ⚠️ do topo deste arquivo: um total único mente sobre
            // qual dinheiro é de fato do dono). Cada pilha responde
            // sozinha "quanto tempo isto aguenta", contra o MESMO custo
            // fixo mensal — que não é dividido por escopo porque a conta
            // do mês também não é.
            const meses = mesesDeSobrevivencia(total, custo)
            return (
              <div key={scope}>
                {/*
                  ⚠️ **O defeito que esta manchete conserta, medido no
                  markup anterior: "Total PJ" saía em `text-sm
                  font-semibold` — EXATAMENTE o mesmo tamanho de fonte de
                  cada conta listada logo abaixo dele** (`text-sm`, na
                  `<ul>`). O agregado lia igual às suas próprias parcelas;
                  o único sinal que os separava era `font-weight` 600 × 400,
                  nenhuma diferença de ESCALA. Confirmado em Chrome real:
                  `total-PJ` 14px/600 contra `saldo-a1` 14px/400.

                  ⚠️ **`NUMERO_GRID` (24px), nunca `NUMERO_HEROI` (30px) —
                  a escolha é por MEDIÇÃO, e o viewport que decide não é o
                  celular.** O grid da home é `grid-cols-1 md:grid-cols-2`,
                  então a caixa útil mais APERTADA é a de **768px** (o
                  próprio `md`: iPad retrato, janela estreita de desktop),
                  onde a sidebar de 256px + `max-w-3xl px-6` + `gap-4` +
                  `sm:p-6` deixam **174px** por card — menos que os 324
                  de 390px (coluna única) e que os 302 de 1280. Medido a
                  30px, `R$ 8.000,00` (o saldo real do dono) pede **176px**
                  e QUEBRA EM DUAS LINHAS ali; a 24px pede 140,2px e cabe,
                  com `-R$ 21.122,50` (166,3px) ainda dentro.

                  ⚠️ **COM centavos (`formatBRL`), nunca
                  `formatBRLSemCentavos`.** O pareamento "grid ⇒ sem
                  centavos" é interno do componente `NumeroCard` e vale
                  pra caixa de 137px que ESTA home não tem (ver
                  `blocos/NumeroCard.tsx`); aqui reusa-se só a
                  TIPOGRAFIA, e o formatador é escolha deste call site —
                  mesmo precedente de `BlocoComprometido`. E num SALDO de
                  conta arredondar seria MENTIR: `formatBRLSemCentavos`
                  faz `Math.round` (`money.ts`), então R$ 189,50 viraria
                  "R$ 190" — uma afirmação falsa, pra mais, sobre dinheiro
                  que existe.

                  ⚠️ **`NumeroCard` NÃO é usado aqui: seria Card dentro de
                  Card** — este bloco já é renderizado dentro de
                  `blocos/Bloco.tsx`, que É um `<Card>`. Mesmo precedente
                  registrado em `pages/accounts.tsx` e `pages/insight.tsx`:
                  reusa-se `ROTULO` + a escala de `lib/tipografia.ts`,
                  nunca o componente.

                  ⚠️ **O rótulo entra ACIMA do número, não ao lado.**
                  Medido a 768 (174px úteis): `[PJ] … [24px valor]` na
                  mesma linha de baseline dá 2 caixas de linha; empilhado
                  dá 1. É a anatomia que `NumeroCard`/`insight.tsx` já
                  usam.
                */}
                <h4 className={ROTULO}>{scope}</h4>
                <p
                  data-testid={`total-${scope}`}
                  className={cn('mt-1', NUMERO_GRID)}
                >
                  {formatBRL(total)}
                </p>
                {/*
                  `text-right` SAIU: com o número alinhado à esquerda, uma
                  referência à direita quebraria a coluna óptica
                  rótulo → número → régua. O texto é o mesmo de antes.
                */}
                {meses ? (
                  <p
                    data-testid={`meses-${scope}`}
                    className="text-muted-foreground text-xs"
                  >
                    ≈ {formatMeses(meses)} de custo fixo
                  </p>
                ) : null}
                <ul className="mt-2 space-y-1">
                  {list.map((a) => (
                    <li
                      key={a.id}
                      className="text-muted-foreground flex justify-between text-sm"
                    >
                      <span>{a.name}</span>
                      <span
                        data-testid={`saldo-${a.id}`}
                        className="tabular-nums"
                      >
                        {formatBRL(a.balance_cents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ) : null}
    </Bloco>
  )
}
