'use client'

import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionHeader } from '@/components/section-header'
import { useProfile, useUpdateProfile } from '@/hooks/admin/content/use-profile'
import { ProfileForm } from '@/components/admin/content/profile-form'

export default function PerfilPage() {
  const profile = useProfile()
  const update = useUpdateProfile()

  return (
    <div className="space-y-6">
      <SectionHeader label="Perfil & bio" />
      {profile.isLoading ? (
        <Skeleton className="h-96 w-full rounded-[var(--radius)]" />
      ) : profile.isError ? (
        <p className="text-warn text-sm">{(profile.error as Error).message}</p>
      ) : profile.data ? (
        <ProfileForm
          initial={profile.data}
          pending={update.isPending}
          onSubmit={(data) =>
            update.mutate(data, {
              onSuccess: () => toast.success('Perfil salvo'),
              onError: (e) => toast.error((e as Error).message),
            })
          }
        />
      ) : null}
    </div>
  )
}
