'use client'

import { toast } from 'sonner'
import { SectionHeader } from '@/components/section-header'
import { PasskeysPanel } from '@/components/admin/passkeys/passkeys-panel'
import { usePasskeyMutations, usePasskeys } from '@/hooks/admin/use-passkeys'
import { usePasskeySuportado } from '@/hooks/admin/use-passkey-suportado'
import { errorMessage } from '@/lib/votacao/api-client'

export default function PasskeysPage() {
  const suportado = usePasskeySuportado()
  const lista = usePasskeys()
  const { cadastrar, remover } = usePasskeyMutations()

  return (
    <div className="space-y-6">
      <SectionHeader label="Passkeys" count={lista.data?.length} />
      <PasskeysPanel
        suportado={suportado}
        carregando={lista.isLoading}
        erro={lista.isError ? errorMessage(lista.error) : null}
        passkeys={lista.data ?? []}
        cadastrando={cadastrar.isPending}
        removendoId={remover.isPending ? (remover.variables ?? null) : null}
        onCadastrar={async (nome) => {
          try {
            await cadastrar.mutateAsync(nome)
            toast.success('Passkey cadastrada')
            return true
          } catch (e) {
            toast.error(errorMessage(e))
            return false
          }
        }}
        onRemover={(id) =>
          remover.mutate(id, {
            onSuccess: () => toast.success('Passkey removida'),
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
        onTentarDeNovo={() => lista.refetch()}
      />
    </div>
  )
}
