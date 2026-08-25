import { useEffect, useState } from 'react'
import { formatBRL, sumCents } from '@piluvitu/tools/money'
import { cn } from '@piluvitu/ui/cn'
import { api, ApiError } from '../api'
import { NUMERO_GRID, ROTULO } from '../lib/tipografia'
import { Bloco } from './Bloco'

export type DebtProgressView = {
  id: string
  title: string
  payee_name: string
  total_cents: number
  paid_cents: number
  remaining_cents: number
}

/**
 * Barra de progresso por dívida ABERTA que EU devo. Só `status=open` +
 * `direction=i_owe` — o que me devem não é compromisso meu, incluir
 * infla a tela na direção errada (ver CLAUDE.md § Dívidas). Autônomo,
 * mesmo padrão de BlocoComprometido/BlocoSaldos: busca sozinho no mount.
 */
export function BlocoDividas() {
  const [dividas, setDividas] = useState<DebtProgressView[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    api<DebtProgressView[]>('/api/debts?status=open&direction=i_owe')
      .then((data) => {
        if (vivo) setDividas(data)
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  const carregando = dividas === null && erro === null
  const vazio = dividas !== null && dividas.length === 0

  // ⚠️ **A manchete deste bloco NÃO é uma das linhas — é a SOMA.** O card
  // listava dívida a dívida e nunca respondia "quanto eu devo no total?":
  // era conta de cabeça. Promover `divida-<id>-falta` seria N manchetes, e
  // N manchetes não são manchete nenhuma (mesma recusa aplicada às contas
  // em `BlocoSaldos` e às categorias do gráfico).
  //
  // ⚠️ **`owed_to_me` não entra, e aqui isso é de graça:** a rota já é
  // `?status=open&direction=i_owe` (o que me devem não é compromisso meu —
  // CLAUDE.md § Dívidas), então a soma abaixo é só do que EU devo. Se um
  // dia alguém afrouxar essa query string, esta soma passa a mentir — o
  // filtro por direção teria que vir pra cá, como `DividasPage.tsx` faz à
  // mão.
  const totalDevido = dividas
    ? sumCents(dividas.map((d) => d.remaining_cents))
    : 0

  return (
    <Bloco
      titulo="Dívidas"
      carregando={carregando}
      erro={erro}
      vazio={vazio}
      vazioMensagem="Nenhuma dívida em aberto."
    >
      {dividas ? (
        <div className="space-y-4">
          {/*
            ⚠️ **Só aparece quando a soma é > 0.** Uma dívida recém-criada
            ainda não tem item (`remaining_cents: 0`), e "R$ 0,00" em 24px
            no topo seria destaque pra AUSÊNCIA de assunto — cada linha já
            diz "Sem itens lançados ainda". Mesmo espírito do
            `euDevo.length > 0` que guarda o `NumeroCard` de
            `pages/DividasPage.tsx`.

            ⚠️ `NUMERO_GRID` (24px) COM centavos: a escala pela caixa de
            174px a 768 (ver `BlocoSaldos.tsx`), e os centavos porque este
            é o MESMO número que `#/dividas` já mostra com centavos
            (`NumeroCard escala="heroi"`) — duas grafias do mesmo valor em
            duas telas é pior que qualquer economia de pixel.

            ⚠️ `NumeroCard` NÃO é usado: `Bloco` já é um `<Card>`. O
            `data-testid` é `total-devido-home` pra não colidir de NOME
            com o `total-devido` de `pages/DividasPage.tsx` — as duas
            telas nunca montam juntas, mas um testid repetido faria um
            `getByTestId` achar o elemento errado num teste futuro que
            renderizasse as duas.

            ⚠️ **NÃO alegue que isso faz um grep apontar pra um lugar só —
            é FALSO, e a alegação já esteve escrita aqui.** `total-devido`
            é PREFIXO de `total-devido-home`, então
            `grep -rn "total-devido" web/src` devolve os DOIS (medido: 14
            linhas, nas duas telas). O ganho é desambiguação de query em
            teste, não de busca textual.
          */}
          {totalDevido > 0 ? (
            <div>
              <p className={ROTULO}>Total que devo</p>
              <p
                data-testid="total-devido-home"
                className={cn('mt-1', NUMERO_GRID)}
              >
                {formatBRL(totalDevido)}
              </p>
              {/*
                ⚠️ **A contagem é a das dívidas que a SOMA cobre, nunca
                `dividas.length`.** Uma dívida recém-criada tem
                `remaining_cents: 0` (o caso "Sem itens lançados ainda"
                que este mesmo bloco trata algumas linhas abaixo) e não
                entra no total. Com `dividas.length`, 3 dívidas abertas
                das quais 1 sem item liam "3 dívida(s) em aberto" sob um
                número que cobre 2 — o dono dividiria 2 valores por 3 e
                concluiria errado sobre o tamanho médio do que deve.
              */}
              <p className="text-muted-foreground text-xs">
                {dividas.filter((d) => d.remaining_cents > 0).length} dívida(s)
                em aberto
              </p>
            </div>
          ) : null}

          {/*
            A LISTA continua em `text-sm`: título · pessoa é o texto
            PRIMÁRIO da linha (identifica o item, não rotula o número), e o
            `falta` de cada dívida é comparativo — a barra de progresso já
            é o comparativo visual da linha. Precedente literal:
            `pages/DividasPage.tsx` mantém "Falta" por linha, com a
            manchete separada acima.
          */}
          <ul className="space-y-3">
            {dividas.map((d) => {
              // Dívida sem item ainda: total_cents = 0. Dividir por zero daria
              // NaN — em vez de uma barra quebrada, mostra um aviso.
              const temItens = d.total_cents > 0
              const pct = temItens
                ? Math.round((d.paid_cents / d.total_cents) * 100)
                : 0
              return (
                <li key={d.id} data-testid={`divida-${d.id}`}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>
                      {d.title} · {d.payee_name}
                    </span>
                    <span
                      data-testid={`divida-${d.id}-falta`}
                      className="font-semibold tabular-nums"
                    >
                      {formatBRL(d.remaining_cents)}
                    </span>
                  </div>
                  {temItens ? (
                    <div
                      role="progressbar"
                      aria-label={d.title}
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="bg-secondary mt-1 h-2 w-full overflow-hidden rounded-full"
                    >
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Sem itens lançados ainda.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </Bloco>
  )
}
