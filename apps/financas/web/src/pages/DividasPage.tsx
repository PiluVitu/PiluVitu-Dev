import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { formatBRL, sumCents } from '@piluvitu/tools/money'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { NumeroCard } from '../blocos/NumeroCard'
import { useMenorQueSm } from '../lib/breakpoint'
import { todayInTeresina } from '../lib/dates'
import { SELECT_CLASSNAME } from '../lib/form-classes'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import { ROTULO } from '../lib/tipografia'
import { ALVO_LINK } from '../lib/touch'

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

// ⚠️ Abaixo de `sm` a tabela de 5 colunas (Dívida/Pessoa/Total/Pago/Falta)
// cortava as DUAS colunas de dinheiro em ~390px (Important 3 do fix final) —
// vira um card por dívida, com `Falta` em destaque (a pergunta que a tela
// responde primeiro). O hook mora em `lib/breakpoint.ts` desde a segunda
// cópia (o extrato precisa da mesma regra); o porquê completo — inclusive
// por que só UM dos dois markups existe por vez — está lá.

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

  // Só o que EU devo — ver o comentário do card de total logo abaixo.
  const euDevo = dividas.filter((d) => d.direction === 'i_owe')

  return (
    <section className="space-y-6" data-testid="pagina-dividas">
      {erro !== null && (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      )}

      {/*
        ⚠️ O total devido NÃO EXISTIA em lugar nenhum desta tela — só o
        `Falta` de CADA dívida, linha a linha. "Quanto eu devo, no total?" era
        uma soma de cabeça, na tela cujo nome é Dívidas.

        ⚠️ Só `i_owe` entra na soma. `GET /api/debts?status=open` devolve as
        DUAS direções, e somar `owed_to_me` junto responderia a pergunta
        errada com um número que parece certo — o que me devem não é dívida
        minha (é a MESMA regra que `commitments()` já aplica no servidor).

        ⚠️ Escala HERÓI (30px COM centavos): card de largura total. Sem
        nenhuma dívida minha em aberto, o card não aparece — "R$ 0" ocupando
        o topo da tela seria destaque pra ausência de assunto.
      */}
      {euDevo.length > 0 ? (
        <NumeroCard
          rotulo="Total que devo"
          valorCents={sumCents(euDevo.map((d) => d.remaining_cents))}
          escala="heroi"
          data-testid="total-devido"
          contexto={`${euDevo.length} dívida(s) em aberto${
            dividas.length > euDevo.length
              ? ' — o que me devem não entra nesta soma'
              : ''
          }`}
        />
      ) : null}

      <Card>
        <CardContent className="pt-6">
          {menorQueSm ? (
            <ul className="space-y-3" data-testid="dividas-cards">
              {dividas.map((d) => (
                <li key={d.id} className="rounded-md border p-3">
                  {/*
                    ⚠️ MEDIDO em Chrome real a 390×844, com um título curto
                    ("Tio", formato real de uma dívida de pessoa): **23×18 px**
                    — abaixo do mínimo de 24×24 do WCAG 2.5.8 (AA), e a
                    largura acompanha o título, então quanto MAIS curto o
                    nome, menor o alvo.

                    ⚠️ E este link é o ÚNICO caminho pro detalhe da dívida:
                    não há botão, não há linha clicável, não há rota
                    alcançável de outro lugar. Errar o toque aqui é ficar sem
                    como abrir a dívida.
                  */}
                  <a
                    href={`#/dividas/${d.id}`}
                    className={cn(
                      'text-primary font-medium underline underline-offset-4',
                      ALVO_LINK,
                    )}
                  >
                    {d.title}
                  </a>
                  <p className="text-muted-foreground text-sm">
                    {d.payee_name}
                  </p>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <span className={ROTULO}>Falta</span>
                    <span className="text-lg font-semibold tabular-nums">
                      {formatBRL(d.remaining_cents)}
                    </span>
                  </div>
                  <div className="text-muted-foreground mt-1 flex justify-between gap-2 text-xs tabular-nums">
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
                    <th
                      className={cn(ROTULO, 'border-b py-1.5 pr-2 text-left')}
                    >
                      Dívida
                    </th>
                    <th
                      className={cn(ROTULO, 'border-b px-2 py-1.5 text-right')}
                    >
                      Pessoa
                    </th>
                    <th
                      className={cn(ROTULO, 'border-b px-2 py-1.5 text-right')}
                    >
                      Total
                    </th>
                    <th
                      className={cn(ROTULO, 'border-b px-2 py-1.5 text-right')}
                    >
                      Pago
                    </th>
                    <th
                      className={cn(ROTULO, 'border-b py-1.5 pl-2 text-right')}
                    >
                      Falta
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dividas.map((d) => (
                    <tr key={d.id}>
                      <td className="border-b py-1.5 pr-2 text-left">
                        {/* Mesmo alvo do markup de card acima: só um dos dois
                            existe por vez, e os 18 px de altura eram do link,
                            não do breakpoint. */}
                        <a
                          href={`#/dividas/${d.id}`}
                          className={cn(
                            'text-primary underline underline-offset-4',
                            ALVO_LINK,
                          )}
                        >
                          {d.title}
                        </a>
                      </td>
                      <td className="border-b px-2 py-1.5 text-right">
                        {d.payee_name}
                      </td>
                      <td className="border-b px-2 py-1.5 text-right tabular-nums">
                        {formatBRL(d.total_cents)}
                      </td>
                      <td className="border-b px-2 py-1.5 text-right tabular-nums">
                        {formatBRL(d.paid_cents)}
                      </td>
                      <td className="border-b py-1.5 pl-2 text-right font-medium tabular-nums">
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
