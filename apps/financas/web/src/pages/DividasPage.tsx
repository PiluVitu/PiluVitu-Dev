import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatBRL } from '@piluvitu/tools/money'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { todayInTeresina } from '../lib/dates'
import { SELECT_CLASSNAME } from '../lib/form-classes'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'

export type DebtListRow = {
  id: string
  title: string
  payee_name: string
  direction: 'i_owe' | 'owed_to_me'
  total_cents: number
  paid_cents: number
  remaining_cents: number
}

export type PayeeOption = { id: string; name: string; kind: string }

const NOVO = '__novo__'

// Mesmo valor do breakpoint `sm` padrão do Tailwind v4 (nenhum breakpoint
// customizado em packages/ui/src/styles.css) — abaixo disso a tabela de 5
// colunas (Dívida/Pessoa/Total/Pago/Falta) não cabe sem cortar texto.
const BREAKPOINT_SM = 640

function larguraAbaixoDeSm(): boolean {
  return window.innerWidth < BREAKPOINT_SM
}

/**
 * ⚠️ **Important 3 (fix final): em ~390px (Android, o dispositivo
 * PRIMÁRIO do dono pra registrar gasto), a tabela de 5 colunas cortava
 * `Pago` E `Falta` — as DUAS colunas de dinheiro — atrás de um drag
 * horizontal sem indicação nenhuma, e um título comprido quebrava em até
 * 4 linhas.** O ledger original só citava `Falta`; medindo com dívidas
 * reais, o corte cai no meio de `Pa|go`, então as duas somem juntas.
 *
 * Abaixo de `sm`: um card por dívida (título, pessoa, `Falta` em
 * destaque — a pergunta que essa tela responde primeiro, "quanto ainda
 * falta"). De `sm` pra cima: a tabela de sempre, intocada.
 *
 * `window.innerWidth` (não `ResizeObserver`/medição de container, ao
 * contrário do fix do Important 1 em `GraficoComprometido.tsx`) porque o
 * problema aqui É de viewport: `DividasPage` não vive dentro de um grid
 * multi-coluna que aperta o card (`AppShell` é `max-w-2xl`, coluna
 * única) — é uma decisão de layout de PÁGINA (tabela vs. cards), o
 * mesmo tipo de breakpoint que o `sm:` do Tailwind já resolve em CSS.
 * jsdom suporta `innerWidth`/evento `resize` nativamente (mesma
 * constatação da Task 6, ver CLAUDE.md), então dá pra testar sem stub
 * nenhum. Só UM dos dois markups (card OU tabela) é renderizado por vez
 * — nunca os dois ao mesmo tempo — porque jsdom não computa CSS
 * (`hidden`/`sm:block` não teriam efeito nos testes), então duplicar o
 * DOM duplicaria todo texto que os testes existentes buscam por
 * `getByText`/`getByRole`, quebrando-os.
 */
function useMenorQueSm(): boolean {
  const [menor, setMenor] = useState(larguraAbaixoDeSm)
  useEffect(() => {
    const onResize = () => setMenor(larguraAbaixoDeSm())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return menor
}

export function DividasPage() {
  const [dividas, setDividas] = useState<DebtListRow[]>([])
  const [payees, setPayees] = useState<PayeeOption[]>([])
  const [payeeId, setPayeeId] = useState(NOVO)
  const [nomeNovo, setNomeNovo] = useState('')
  const [titulo, setTitulo] = useState('')
  const [abertura, setAbertura] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // `vivo` no mesmo formato de debt-detail.tsx:94 (vários setState em
  // sequência): sem a guarda, uma resposta atrasada podia sobrescrever a
  // tela depois que o componente desmontou ou trocou de rota.
  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    const [d, p] = await Promise.all([
      api<DebtListRow[]>('/api/debts?status=open'),
      api<PayeeOption[]>('/api/payees?kind=person'),
    ])
    if (!vivo()) return
    setDividas(d)
    setPayees(p)
  }, [])

  useEffect(() => {
    let vivo = true
    carregar(() => vivo).catch((e: unknown) => {
      if (vivo) setErro(e instanceof ApiError ? e.message : String(e))
    })
    return () => {
      vivo = false
    }
  }, [carregar])

  async function enviar(ev: FormEvent) {
    ev.preventDefault()
    setErro(null)

    if (titulo.trim() === '') {
      setErro('Dê um título para a dívida.')
      return
    }
    if (payeeId === NOVO && nomeNovo.trim() === '') {
      setErro('Informe o nome da pessoa.')
      return
    }

    setSalvando(true)
    // Criar e recarregar são sucessos INDEPENDENTES (ver
    // lib/mutar-e-recarregar.ts): com os dois no mesmo `try`, um 201
    // seguido de um GET que cai mostrava o erro do GET como se a dívida
    // não tivesse sido criada — o dono reenviava e ficava com uma dívida
    // duplicada (e um payee duplicado junto, quando cadastrou pessoa nova:
    // `POST /api/payees` não deduplica por `norm_name`).
    const resultado = await mutarERecarregar(
      async () => {
        let id = payeeId
        if (id === NOVO) {
          const criado = await api<PayeeOption>('/api/payees', {
            method: 'POST',
            body: JSON.stringify({ name: nomeNovo, kind: 'person' }),
          })
          id = criado.id
        }
        await api<{ id: string }>('/api/debts', {
          method: 'POST',
          body: JSON.stringify({
            payee_id: id,
            direction: 'i_owe',
            title: titulo,
            opened_at: abertura || todayInTeresina(),
          }),
        })
        // Limpar só depois do 201, ainda dentro da mutação — mesma decisão
        // de accounts.tsx: com a dívida já criada, um formulário ainda
        // preenchido convida ao reenvio, e reenviar duplica. O título vai
        // nomeado na mensagem de recarga, então nada some em silêncio.
        setTitulo('')
        setNomeNovo('')
      },
      carregar,
      `A dívida "${titulo}" foi criada, mas não consegui recarregar a lista — atualize a página pra vê-la. Não envie de novo: criaria uma dívida duplicada${payeeId === NOVO ? ` e uma segunda pessoa "${nomeNovo}"` : ''}.`,
    )
    if (!resultado.ok) setErro(resultado.mensagem)
    setSalvando(false)
  }

  const menorQueSm = useMenorQueSm()

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dívidas</h1>
      {erro !== null && (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      )}

      <Card>
        <CardContent className="pt-6">
          {menorQueSm ? (
            <ul className="space-y-3" data-testid="dividas-cards">
              {dividas.map((d) => (
                <li key={d.id} className="rounded-md border p-3">
                  <a
                    href={`#/dividas/${d.id}`}
                    className="text-primary font-medium underline underline-offset-4"
                  >
                    {d.title}
                  </a>
                  <p className="text-muted-foreground text-sm">
                    {d.payee_name}
                  </p>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <span className="text-muted-foreground text-xs">Falta</span>
                    <span className="text-lg font-semibold">
                      {formatBRL(d.remaining_cents)}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-1 flex justify-between gap-2 text-xs">
                    <span>Total {formatBRL(d.total_cents)}</span>
                    <span>Pago {formatBRL(d.paid_cents)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b py-1.5 pr-2 text-left font-medium">
                      Dívida
                    </th>
                    <th className="border-b px-2 py-1.5 text-right font-medium">
                      Pessoa
                    </th>
                    <th className="border-b px-2 py-1.5 text-right font-medium">
                      Total
                    </th>
                    <th className="border-b px-2 py-1.5 text-right font-medium">
                      Pago
                    </th>
                    <th className="border-b py-1.5 pl-2 text-right font-medium">
                      Falta
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dividas.map((d) => (
                    <tr key={d.id}>
                      <td className="border-b py-1.5 pr-2 text-left">
                        <a
                          href={`#/dividas/${d.id}`}
                          className="text-primary underline underline-offset-4"
                        >
                          {d.title}
                        </a>
                      </td>
                      <td className="border-b px-2 py-1.5 text-right">
                        {d.payee_name}
                      </td>
                      <td className="border-b px-2 py-1.5 text-right">
                        {formatBRL(d.total_cents)}
                      </td>
                      <td className="border-b px-2 py-1.5 text-right">
                        {formatBRL(d.paid_cents)}
                      </td>
                      <td className="border-b py-1.5 pl-2 text-right font-medium">
                        {formatBRL(d.remaining_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova dívida</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={enviar} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input
                id="titulo"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pessoa">Pessoa</Label>
              <select
                id="pessoa"
                className={SELECT_CLASSNAME}
                value={payeeId}
                onChange={(e) => setPayeeId(e.target.value)}
              >
                <option value={NOVO}>— nova pessoa —</option>
                {payees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {payeeId === NOVO && (
              <div className="space-y-1.5">
                <Label htmlFor="nome-novo">Nome da pessoa</Label>
                <Input
                  id="nome-novo"
                  value={nomeNovo}
                  onChange={(e) => setNomeNovo(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="abertura">Aberta em</Label>
              <Input
                id="abertura"
                type="date"
                value={abertura}
                onChange={(e) => setAbertura(e.target.value)}
              />
            </div>

            <Button type="submit" disabled={salvando}>
              Criar dívida
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  )
}
