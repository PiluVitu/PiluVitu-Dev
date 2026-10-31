import { useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { authClient } from './auth-client'
import {
  mensagemDeErroPasskey,
  mensagemDeExcecao,
  suportaPasskey,
} from './lib/passkey'
import { CARTAO_SECAO } from './lib/superficie'
import { ROTULO } from './lib/tipografia'

type Resultado = { error?: { code?: string; message?: string } | null } | void

const DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza' })

export function PasskeysCard() {
  const { data: passkeys, error, isPending } = authClient.useListPasskeys()
  const [nome, setNome] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function executar(acao: () => Promise<Resultado>): Promise<boolean> {
    setOcupado(true)
    setErro(null)
    try {
      const r = await acao()
      if (r?.error) {
        setErro(mensagemDeErroPasskey(r.error))
        return false
      }
      return true
    } catch (err) {
      setErro(mensagemDeExcecao(err))
      return false
    } finally {
      setOcupado(false)
    }
  }

  async function cadastrar() {
    const limpo = nome.trim()
    const ok = await executar(() =>
      authClient.passkey.addPasskey(limpo ? { name: limpo } : {}),
    )
    if (ok) setNome('')
  }

  return (
    <Card className={cn(CARTAO_SECAO, 'col-span-full')}>
      <CardHeader>
        <CardTitle className={cn(ROTULO, 'leading-none')}>Passkeys</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Entre com a biometria ou o PIN deste aparelho, sem passar pelo Google.
          Se perder o aparelho, entre pelo Google e remova a passkey aqui.
        </p>

        {erro !== null && (
          <p role="alert" className="text-destructive text-sm">
            {erro}
          </p>
        )}

        {suportaPasskey() ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="passkey-nome">Nome (opcional)</Label>
              <Input
                id="passkey-nome"
                value={nome}
                placeholder="iPhone, notebook…"
                maxLength={60}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <Button onClick={cadastrar} disabled={ocupado}>
              Cadastrar passkey
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Este navegador não suporta passkey.
          </p>
        )}

        {isPending ? (
          <p aria-busy="true" className="text-muted-foreground text-sm">
            Carregando passkeys…
          </p>
        ) : error ? (
          <p role="alert" className="text-destructive text-sm">
            Não consegui carregar suas passkeys.
          </p>
        ) : !passkeys || passkeys.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma passkey cadastrada.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {passkeys.map((p) => {
              const rotulo = p.name || 'Passkey'
              return (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <span className="text-sm">
                    {rotulo}
                    {p.createdAt && (
                      <span className="text-muted-foreground">
                        {' '}
                        · criada em {DATA.format(new Date(p.createdAt))}
                      </span>
                    )}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={ocupado}
                    aria-label={`Remover passkey ${rotulo}`}
                    onClick={() =>
                      executar(() =>
                        authClient.passkey.deletePasskey({ id: p.id }),
                      )
                    }
                  >
                    Remover
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
