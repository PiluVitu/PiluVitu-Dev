'use client'
import { Badge } from '@piluvitu/ui/badge'
import { Skeleton } from '@piluvitu/ui/skeleton'
import type { AdminUser } from '@/lib/votacao/types'

interface Props {
  users: AdminUser[]
  isLoading?: boolean
}

export function UsersTable({ users, isLoading }: Props) {
  if (isLoading) return <Skeleton className="h-32 w-full" />
  if (users.length === 0)
    return (
      <p className="text-muted-foreground text-sm">Nenhum usuário ainda.</p>
    )
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-left text-xs uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Nome</th>
            <th className="px-3 py-2 font-medium">E-mail</th>
            <th className="px-3 py-2 font-medium">Cadastro</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="px-3 py-2">
                <span className="flex items-center gap-2">
                  {u.name}
                  {u.is_admin && <Badge variant="secondary">admin</Badge>}
                </span>
              </td>
              <td className="text-muted-foreground px-3 py-2">{u.email}</td>
              <td className="text-muted-foreground px-3 py-2">
                {new Date(u.created_at).toLocaleDateString('pt-BR')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
