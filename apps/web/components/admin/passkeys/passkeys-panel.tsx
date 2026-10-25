'use client'

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faKey, faTrash } from '@fortawesome/free-solid-svg-icons'
import { Skeleton } from '@piluvitu/ui/skeleton'
import type { Passkey } from '@/lib/admin/passkey'

export interface PasskeysPanelProps {
  suportado: boolean
  carregando: boolean
  erro: string | null
  passkeys: Passkey[]
  cadastrando: boolean
  removendoId: string | null
  onCadastrar: (nome: string) => Promise<boolean> | void
  onRemover: (id: string) => void
  onTentarDeNovo: () => void
}

const formatoData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'medium',
  timeZone: 'America/Sao_Paulo',
})

function criadaEm(iso: string): string {
  const data = new Date(iso)
  return Number.isNaN(data.getTime()) ? '—' : formatoData.format(data)
}

/**
 * Passkeys da conta logada: cadastrar a do aparelho atual, ver as que existem
 * e remover. Componente puro; o wiring (React Query) fica na page.
 */
export function PasskeysPanel({
  suportado,
  carregando,
  erro,
  passkeys,
  cadastrando,
  removendoId,
  onCadastrar,
  onRemover,
  onTentarDeNovo,
}: PasskeysPanelProps) {
  const [nome, setNome] = useState('')

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground max-w-2xl text-sm">
        A passkey é um segundo jeito de entrar no painel, além do Google: o
        aparelho confirma que é você (digital, rosto ou PIN). Só administradores
        cadastram, e para cadastrar uma passkey você precisa ter entrado pelo
        Google. Se perder o aparelho, entre pelo Google e remova a passkey dele
        aqui.
      </p>

      {suportado ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if ((await onCadastrar(nome)) === true) setNome('')
          }}
        >
          <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm sm:max-w-xs">
            <span className="text-muted-foreground text-xs">
              Nome do aparelho (opcional)
            </span>
            <input
              type="text"
              value={nome}
              maxLength={60}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: MacBook, iPhone"
              className="border-border bg-background focus-visible:ring-primary/50 rounded-lg border px-3 py-2 outline-none focus-visible:ring-2"
            />
          </label>
          <button
            type="submit"
            disabled={cadastrando}
            className="bg-primary text-primary-foreground rounded-pill inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium disabled:opacity-60"
          >
            <FontAwesomeIcon icon={faKey} className="size-4" />
            {cadastrando ? 'Cadastrando…' : 'Cadastrar passkey'}
          </button>
        </form>
      ) : (
        <p className="border-border text-muted-foreground rounded-lg border px-4 py-3 text-sm">
          Este navegador não suporta passkeys. Abra o painel num navegador
          atualizado para cadastrar uma.
        </p>
      )}

      {carregando ? (
        <div aria-busy="true" className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : erro !== null ? (
        <div
          role="alert"
          className="border-destructive/40 text-destructive flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm"
        >
          <span>{erro}</span>
          <button
            type="button"
            onClick={onTentarDeNovo}
            className="text-foreground text-xs underline underline-offset-2"
          >
            Tentar de novo
          </button>
        </div>
      ) : passkeys.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma passkey cadastrada nesta conta.
        </p>
      ) : (
        <ul className="border-border overflow-hidden rounded-[var(--radius)] border">
          {passkeys.map((p) => {
            const rotulo = p.name?.trim() || 'Passkey sem nome'
            return (
              <li
                key={p.id}
                className="border-border flex items-center justify-between gap-4 border-b px-5 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{rotulo}</p>
                  <p className="text-muted-foreground font-mono text-xs">
                    Criada em {criadaEm(p.createdAt)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remover a passkey ${rotulo}`}
                  disabled={removendoId === p.id}
                  onClick={() => onRemover(p.id)}
                  className="text-muted-foreground hover:text-destructive inline-flex shrink-0 items-center gap-2 text-sm disabled:opacity-60"
                >
                  <FontAwesomeIcon icon={faTrash} className="size-3.5" />
                  {removendoId === p.id ? 'Removendo…' : 'Remover'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
