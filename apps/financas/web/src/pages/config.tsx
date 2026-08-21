import { useEffect, useState } from 'react'
import { formatBRL, parseBRL } from '@piluvitu/tools/money'
import { Ajuda } from '@piluvitu/ui/ajuda'
import { Button } from '@piluvitu/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@piluvitu/ui/card'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { api, ApiError } from '../api'
import { signOut, useSession } from '../auth-client'
import { aplicarTema, temaSalvo, type Tema } from '../lib/theme'

type SettingsView = { fixed_net_cents: number }

const OPCOES_TEMA: Array<{ valor: Tema; rotulo: string }> = [
  { valor: 'claro', rotulo: 'Claro' },
  { valor: 'escuro', rotulo: 'Escuro' },
  { valor: 'sistema', rotulo: 'Sistema' },
]

// Sem prefixo 'R$ ' — o Input já mostra só o número, mesmo padrão do
// placeholder '1.360,00' de new-entry.tsx.
function paraCampo(cents: number): string {
  return formatBRL(cents).replace('R$ ', '')
}

/**
 * Configurações (Task 10). Quatro seções reais + um espaço reservado
 * honesto: Renda fixa de referência (o denominador editável de
 * Comprometido, `PUT /api/settings`), Tema (motor de `lib/theme.ts`,
 * Task 4 — esta é a PRIMEIRA tela a expor um controle de UI pra ele),
 * Conta (e-mail da sessão + Sair) e Backup (comando + o que cobre).
 * "Conectar contas" NÃO tem controle nenhum de propósito — Open Finance é
 * fatia ④, não construída, bloqueada por restrições reais (ver
 * apps/financas/CLAUDE.md); um botão que não faz nada é pior que a
 * ausência honesta dele.
 */
export function ConfigPage() {
  const { data: sessao } = useSession()

  const [rendaAtual, setRendaAtual] = useState<number | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const [tema, setTema] = useState<Tema>(() => temaSalvo())

  useEffect(() => {
    let vivo = true
    api<SettingsView>('/api/settings')
      .then((data) => {
        if (!vivo) return
        setRendaAtual(data.fixed_net_cents)
        setValor(paraCampo(data.fixed_net_cents))
      })
      .catch((e: unknown) => {
        if (vivo) setLoadError(e instanceof ApiError ? e.message : String(e))
      })
    return () => {
      vivo = false
    }
  }, [])

  async function salvarRenda(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setOkMsg(null)

    let cents: number
    try {
      cents = parseBRL(valor)
    } catch {
      setFormError('Valor inválido. Use o formato 3.600,00.')
      return
    }
    if (cents <= 0) {
      setFormError('Valor inválido. Use o formato 3.600,00.')
      return
    }

    setSalvando(true)
    try {
      const data = await api<SettingsView>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ fixed_net_cents: cents }),
      })
      setRendaAtual(data.fixed_net_cents)
      setValor(paraCampo(data.fixed_net_cents))
      setOkMsg('Renda de referência salva.')
    } catch (err: unknown) {
      setFormError(err instanceof ApiError ? err.message : String(err))
    } finally {
      setSalvando(false)
    }
  }

  function trocarTema(t: Tema) {
    aplicarTema(t)
    setTema(t)
  }

  return (
    <section className="space-y-6" data-testid="pagina-configuracoes">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Renda fixa de referência
            <Ajuda rotulo="Renda de referência">
              Por que o denominador é R$ 3.600 e não R$ 5.300 — o freela é
              volátil, e medir contra o mês bom esconde o risco.
            </Ajuda>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Denominador do % em Comprometido — o líquido fixo{' '}
            <strong className="text-foreground">sem freela</strong>. Medir
            contra o mês bom esconderia o risco que aquela tela existe pra
            mostrar.
          </p>
          {loadError ? <p role="alert">{loadError}</p> : null}
          <form
            onSubmit={salvarRenda}
            data-testid="form-renda"
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="config-renda">Novo valor</Label>
              <Input
                id="config-renda"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="3.600,00"
              />
              {rendaAtual !== null ? (
                <p className="text-muted-foreground text-xs">
                  Valor salvo hoje: {formatBRL(rendaAtual)}
                </p>
              ) : null}
            </div>
            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}
            {okMsg ? (
              <p role="status" className="text-success text-sm">
                {okMsg}
              </p>
            ) : null}
            <Button type="submit" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tema</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          {OPCOES_TEMA.map((o) => (
            <Button
              key={o.valor}
              type="button"
              variant={tema === o.valor ? 'default' : 'outline'}
              aria-pressed={tema === o.valor}
              onClick={() => trocarTema(o.valor)}
            >
              {o.rotulo}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conta</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">
            {sessao?.user.email}
          </span>
          <Button variant="outline" size="sm" onClick={() => signOut()}>
            Sair
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Backup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            <code className="text-foreground">make backup-financas</code>{' '}
            exporta o banco de produção, comprime e mantém as últimas cópias em
            disco local — não substitui o Time Travel nativo do D1 (janela
            curta, restaura o banco inteiro de uma vez), e restaurar é sempre um
            passo manual (reimportar o dump num banco vazio).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conectar contas</CardTitle>
        </CardHeader>
        <CardContent data-testid="conectar-contas">
          <p className="text-muted-foreground text-sm">
            Conectar contas bancárias (Open Finance) ainda não existe. Antes
            dela vem a importação de fatura (fatia ②).
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
