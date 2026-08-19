import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { badgeVariants } from '@piluvitu/ui/badge'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@piluvitu/ui/dialog'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import {
  ordenarPorHierarquia,
  type CategoryKindView,
  type CategoryView,
} from '../lib/categories'
import { SELECT_CLASSNAME } from '../lib/form-classes'
import { mutarERecarregar } from '../lib/mutar-e-recarregar'
import { ALVO_LINK, ALVO_LINK_FIM } from '../lib/touch'

/**
 * ⚠️ O PROBLEMA, medido na produção real: o dono tinha as **7** categorias
 * semeadas pela migration e NENHUMA forma de criar a oitava — não conseguia
 * registrar "Mercado", "Gasolina", "Almoço". A fatia anterior entregou as
 * rotas (`POST`/`PUT`/`POST :id/archive`) e deixou registrado que nenhuma
 * TELA as consumia. Esta é a tela.
 *
 * Molde: `pages/recorrentes.tsx` — lista + um formulário só, reusado pra
 * criar e editar via `editandoId`, e `Dialog` do design system pra confirmar
 * o arquivamento (nunca `window.confirm()`: o Chrome Android passa a
 * devolver `false` em silêncio depois de "impedir caixas de diálogo
 * adicionais", e o botão fica inerte até um F5, sem nada explicando por quê).
 */

const NENHUMA = ''

/**
 * ⚠️ Só `expense` e `income` podem ser CRIADOS por aqui, de propósito.
 * `transfer` e `debt_settlement` são estruturais: são exatamente as duas
 * classes que todo relatório de resultado exclui, e as linhas semeadas
 * (`transferencia-entre-contas`, `quitacao-divida`) são achadas pelo próprio
 * CÓDIGO por slug — `payDebt()` procura `slug='quitacao-divida'`. Uma
 * categoria nova desse tipo, criada à mão, não teria slug nenhum e só
 * serviria pra alguém classificar um gasto real numa classe que os
 * relatórios ignoram. As seedadas continuam aparecendo na lista (existem, e
 * o nome/mãe delas é editável) — o que não existe é a porta pra criar mais.
 */
const KINDS_CRIAVEIS = [
  { valor: 'expense', rotulo: 'Despesa' },
  { valor: 'income', rotulo: 'Entrada' },
] as const

const ROTULO_KIND: Record<CategoryKindView, string> = {
  expense: 'Despesa',
  income: 'Entrada',
  transfer: 'Transferência',
  debt_settlement: 'Quitação de dívida',
}

type ConfirmacaoPendente = {
  titulo: string
  mensagem: string
  onConfirm: () => void | Promise<void>
}

export function CategoriasPage() {
  const [categorias, setCategorias] = useState<CategoryView[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [kind, setKind] = useState<CategoryKindView>('expense')
  const [maeId, setMaeId] = useState(NENHUMA)
  const [escopo, setEscopo] = useState<'' | 'PJ' | 'PF'>(NENHUMA)
  const [formError, setFormError] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // `processando` guarda o id da linha em voo (mesmo padrão de
  // recorrentes.tsx/debt-detail.tsx): desabilita só o botão daquela linha.
  const [acaoErro, setAcaoErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoPendente | null>(
    null,
  )

  const carregar = useCallback(async (vivo: () => boolean = () => true) => {
    // Sem `?kind=`: esta é a tela de GESTÃO, mostra tudo que existe. A rota
    // já esconde arquivada (não há parâmetro pra incluí-las, nem rota de
    // desarquivar — ver a mensagem do diálogo).
    const cats = await api<CategoryView[]>('/api/categories')
    if (!vivo()) return
    setCategorias(cats)
  }, [])

  useEffect(() => {
    let vivo = true
    carregar(() => vivo).catch((e: unknown) => {
      if (vivo) setLoadError(e instanceof ApiError ? e.message : String(e))
    })
    return () => {
      vivo = false
    }
  }, [carregar])

  function limparFormulario() {
    setEditandoId(null)
    setNome('')
    setKind('expense')
    setMaeId(NENHUMA)
    setEscopo(NENHUMA)
    setFormError(null)
  }

  function editar(c: CategoryView) {
    setEditandoId(c.id)
    setNome(c.name)
    setKind(c.kind)
    setMaeId(c.parent_id ?? NENHUMA)
    setEscopo(c.default_scope ?? NENHUMA)
    setFormError(null)
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (nome.trim() === '') {
      setFormError('Dê um nome para a categoria.')
      return
    }

    setSalvando(true)
    const editando = editandoId !== null
    // Salvar e recarregar são sucessos INDEPENDENTES (ver
    // lib/mutar-e-recarregar.ts): com os dois no mesmo `try`, um 201 seguido
    // de um GET que cai mostrava o erro do GET como se a categoria não
    // tivesse sido criada — e o dono criaria "Mercado" duas vezes, deixando
    // o relatório por categoria com o mesmo gasto partido em duas linhas.
    const resultado = await mutarERecarregar(
      async () => {
        const comum = {
          name: nome.trim(),
          parent_id: maeId || null,
          default_scope: escopo || null,
        }
        if (editandoId) {
          // ⚠️ `kind` NUNCA vai no corpo do PUT: a rota o recusa com 422
          // `protected_field` — e a recusa vale pro CORPO INTEIRO, então
          // mandá-lo "só por mandar" faria a renomeação inteira falhar.
          await api(`/api/categories/${editandoId}`, {
            method: 'PUT',
            body: JSON.stringify(comum),
          })
        } else {
          await api('/api/categories', {
            method: 'POST',
            body: JSON.stringify({ ...comum, kind }),
          })
        }
        limparFormulario()
      },
      carregar,
      editando
        ? `A categoria "${nome}" foi salva, mas não consegui recarregar a lista — atualize a página pra ver a alteração.`
        : `A categoria "${nome}" foi criada, mas não consegui recarregar a lista — atualize a página pra vê-la. Não envie de novo: criaria uma segunda categoria com o mesmo nome, e o relatório por categoria mostraria o mesmo gasto partido em duas linhas.`,
    )
    if (!resultado.ok) setFormError(resultado.mensagem)
    setSalvando(false)
  }

  function arquivar(c: CategoryView) {
    setConfirmacao({
      titulo: 'Arquivar categoria',
      mensagem: `Arquivar "${c.name}"? Ela some das listas e dos seletores, mas NADA é apagado: os lançamentos já categorizados continuam apontando pra ela. Não há como desarquivar pela interface.`,
      onConfirm: async () => {
        setAcaoErro(null)
        setProcessando(c.id)
        const resultado = await mutarERecarregar(
          async () => {
            await api(`/api/categories/${c.id}/archive`, { method: 'POST' })
            if (editandoId === c.id) limparFormulario()
          },
          carregar,
          `A categoria "${c.name}" foi arquivada, mas não consegui recarregar a lista — atualize a página pra confirmar. Nenhum lançamento foi apagado.`,
        )
        if (!resultado.ok) setAcaoErro(resultado.mensagem)
        setProcessando(null)
      },
    })
  }

  if (loadError) return <p role="alert">{loadError}</p>
  if (!categorias) return <p>Carregando…</p>

  const nos = ordenarPorHierarquia(categorias)
  // Só raiz pode ser mãe (a árvore tem 2 níveis, e quem impõe isso é o
  // servidor). Uma categoria que JÁ é mãe não pode virar filha — em vez de
  // oferecer a opção e colher o 422, a tela troca o campo por um aviso,
  // mesma disciplina do <select> de conta em debt-detail.tsx (que esconde
  // credit_card porque payDebt sempre recusaria).
  const maesPossiveis = categorias.filter(
    (c) => c.parent_id === null && c.id !== editandoId,
  )
  const editandoEhMae =
    editandoId !== null && categorias.some((c) => c.parent_id === editandoId)

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Categorias</h1>

      {acaoErro ? (
        <p role="alert" className="text-destructive text-sm">
          {acaoErro}
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          {nos.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma categoria cadastrada.
            </p>
          ) : (
            <ul className="space-y-2" data-testid="lista-categorias">
              {nos.map(({ categoria: c, nivel }) => (
                <li
                  key={c.id}
                  data-testid={`categoria-${c.id}`}
                  data-nivel={nivel}
                  // Filha indentada com barra à esquerda — a hierarquia
                  // aparece sem tabela e sem coluna extra, então cabe nos
                  // ~390px do Android sem nada cortado.
                  className={
                    nivel === 1
                      ? 'border-muted-foreground/30 ml-4 border-l pl-3'
                      : ''
                  }
                >
                  <div className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{c.name}</p>
                      {/*
                        Status/classificação como CHIP — `regras.tsx` é a
                        referência (`<Badge>Pausada</Badge>`), e outras 5 telas
                        já usavam badge. `badgeVariants` num `<span>`, nunca o
                        componente `Badge`: ele renderiza um `<div>`, e o pai
                        aqui é um flex com `<p>` ao lado — manter o elemento em
                        phrasing content evita a mesma quebra de layout já paga
                        em `recorrentes.tsx` (div dentro de p faz o navegador
                        fechar o parágrafo sozinho).
                      */}
                      <span
                        data-testid={`tipo-${c.id}`}
                        className={cn(
                          badgeVariants({ variant: 'secondary' }),
                          'shrink-0 whitespace-nowrap',
                        )}
                      >
                        {ROTULO_KIND[c.kind]}
                        {c.default_scope ? ` · ${c.default_scope}` : ''}
                      </span>
                    </div>
                    {/* Mesma regra do extrato: alvo de 44 px e o destrutivo
                        empurrado pra outra ponta (`ml-auto`), em vez de colado
                        no botão de uso rotineiro. */}
                    <div className="mt-2 flex gap-3">
                      <Button
                        type="button"
                        variant="link"
                        className={cn('h-auto p-0 text-xs', ALVO_LINK)}
                        onClick={() => editar(c)}
                      >
                        Editar
                      </Button>
                      <Button
                        type="button"
                        variant="link"
                        className={cn(
                          'text-destructive h-auto p-0 text-xs',
                          ALVO_LINK_FIM,
                        )}
                        disabled={processando === c.id}
                        onClick={() => arquivar(c)}
                      >
                        {processando === c.id ? 'Arquivando…' : 'Arquivar'}
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {editandoId ? 'Editar categoria' : 'Nova categoria'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={enviar}
            data-testid="form-categoria"
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="categoria-nome">Nome</Label>
              <Input
                id="categoria-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Mercado"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="categoria-tipo">Tipo</Label>
                <Ajuda rotulo="Tipo">
                  Despesa é dinheiro que sai; Entrada é dinheiro que entra. O
                  tipo não muda depois — trocá-lo reclassificaria todo o
                  histórico em silêncio, então o servidor recusa. Transferência
                  e quitação de dívida não se criam à mão: são as duas classes
                  que todo relatório de resultado exclui, e as que existem já
                  vêm prontas.
                </Ajuda>
              </div>
              {editandoId ? (
                <p data-testid="tipo-fixo" className="text-sm">
                  {ROTULO_KIND[kind]}{' '}
                  <span className="text-muted-foreground">
                    — o tipo não é editável.
                  </span>
                </p>
              ) : (
                <select
                  id="categoria-tipo"
                  className={SELECT_CLASSNAME}
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as 'expense' | 'income')
                  }
                >
                  {KINDS_CRIAVEIS.map((k) => (
                    <option key={k.valor} value={k.valor}>
                      {k.rotulo}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="categoria-mae">Categoria mãe</Label>
              {editandoEhMae ? (
                <p
                  data-testid="mae-fixa"
                  className="text-muted-foreground text-sm"
                >
                  Esta categoria já é mãe de outras — por isso ela não pode
                  virar filha de uma terceira (a hierarquia tem 2 níveis).
                </p>
              ) : (
                <select
                  id="categoria-mae"
                  className={SELECT_CLASSNAME}
                  value={maeId}
                  onChange={(e) => setMaeId(e.target.value)}
                >
                  <option value={NENHUMA}>— nenhuma (categoria raiz) —</option>
                  {maesPossiveis.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="categoria-escopo">Escopo padrão</Label>
              <select
                id="categoria-escopo"
                className={SELECT_CLASSNAME}
                value={escopo}
                onChange={(e) => setEscopo(e.target.value as '' | 'PJ' | 'PF')}
              >
                <option value={NENHUMA}>— nenhum —</option>
                <option value="PJ">PJ</option>
                <option value="PF">PF</option>
              </select>
            </div>

            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={salvando}>
                {salvando
                  ? 'Salvando…'
                  : editandoId
                    ? 'Salvar alterações'
                    : 'Criar categoria'}
              </Button>
              {editandoId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={limparFormulario}
                >
                  Cancelar edição
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Dialog
        open={confirmacao !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmacao(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmacao?.titulo}</DialogTitle>
            <DialogDescription>{confirmacao?.mensagem}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const pedido = confirmacao
                setConfirmacao(null)
                void pedido?.onConfirm()
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
