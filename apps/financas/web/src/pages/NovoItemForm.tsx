import { useState, type FormEvent } from 'react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import { Button } from '@piluvitu/ui/button'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api } from '../api'
import { todayInTeresina } from '../lib/dates'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'

export function NovoItemForm({
  debtId,
  onCreated,
}: {
  debtId: string
  onCreated: () => void | Promise<void>
}) {
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    let centavos: number
    try {
      centavos = parseBRL(valor)
    } catch {
      setErro('valor inválido')
      return
    }
    if (centavos <= 0) {
      setErro('valor inválido')
      return
    }

    // Nomeados ANTES da mutação porque o formulário é limpo lá dentro (ver
    // comentário abaixo) — a mensagem de recarga precisa dizer o que o dono
    // digitou, não o campo já vazio.
    const descricaoDigitada = descricao
    const valorDigitado = formatBRL(centavos)

    setSalvando(true)
    // Criar o item e recarregar a dívida são sucessos INDEPENDENTES (ver
    // lib/mutar-e-recarregar.ts). Aqui `onCreated` é o `carregar` de
    // debt-detail.tsx — um Promise.all de dois GETs que LANÇAM. Com os dois
    // no mesmo `try`, um POST 201 seguido de um GET que cai escrevia a
    // mensagem do GET neste `role="alert"`: o dono lia "falhou" com o item
    // já gravado. E reenviar aqui custa dado real — o total da dívida é a
    // SOMA dos itens, então o item duplicado infla o Comprometido; pior,
    // `addDebtItem` (src/domain/debts.ts:170-171) ainda REABRE uma dívida
    // `settled` a cada item novo, no mesmo batch do INSERT.
    const resultado = await mutarERecarregar(
      async () => {
        await api(`/api/debts/${debtId}/items`, {
          method: 'POST',
          body: JSON.stringify({
            description: descricao,
            amount_cents: centavos,
            incurred_on: data || todayInTeresina(),
          }),
        })
        // Limpar SÓ depois do 201, ainda dentro da mutação — mesma decisão
        // já tomada em accounts.tsx/DividasPage.tsx/recorrentes.tsx e no
        // formulário de pagamento de debt-detail.tsx, e ela serve aqui pelo
        // mesmo motivo: com o item já gravado, um formulário ainda
        // preenchido convida ao reenvio, e reenviar duplica. O que o dono
        // digitou não some em silêncio — vai nomeado na mensagem de recarga.
        setDescricao('')
        setValor('')
      },
      async () => {
        await onCreated()
      },
      `O item "${descricaoDigitada}" de ${valorDigitado} foi criado, mas não consegui recarregar a dívida — atualize a página pra vê-lo na lista. Não envie de novo: criaria um item duplicado, e o total da dívida (que é a soma dos itens) ficaria inflado.`,
    )
    if (!resultado.ok) setErro(resultado.mensagem)
    setSalvando(false)
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <h3 className="text-sm font-semibold">Novo item</h3>
      {erro !== null && (
        <p role="alert" className="text-destructive text-sm">
          {erro}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="item-descricao">Descrição</Label>
        <Input
          id="item-descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-valor">Valor</Label>
        <Input
          id="item-valor"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="1.360,00"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="item-data">Data</Label>
        <Input
          id="item-data"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={salvando} size="sm">
        Adicionar item
      </Button>
    </form>
  )
}
