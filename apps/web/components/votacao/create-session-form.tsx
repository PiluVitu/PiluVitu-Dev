'use client'
import { useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { toast } from 'sonner'
import { useCreateSession } from '@/hooks/votacao/use-create-session'
import { errorMessage } from '@/lib/votacao/api-client'
import { useRouter } from 'next/navigation'

export function CreateSessionForm() {
  const [title, setTitle] = useState('')
  const [includeFilme, setIncludeFilme] = useState(true)
  const [includeSerie, setIncludeSerie] = useState(true)
  const [includeWatched, setIncludeWatched] = useState(false)
  const router = useRouter()
  const mutation = useCreateSession()

  const types: string[] = []
  if (includeFilme) types.push('filme')
  if (includeSerie) types.push('serie')

  return (
    <form
      className="max-w-md space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!title.trim()) {
          toast.error('Título obrigatório')
          return
        }
        mutation.mutate(
          {
            title: title.trim(),
            types,
            include_watched: includeWatched,
            categories: [],
          },
          {
            onSuccess: (data) => {
              toast.success('Sessão criada')
              router.push(`/votacao/${data.session.ID}`)
            },
            onError: (err) => toast.error(errorMessage(err)),
          },
        )
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sexta 22/05"
          required
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tipos</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeFilme}
            onChange={(e) => setIncludeFilme(e.target.checked)}
          />
          Filme
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeSerie}
            onChange={(e) => setIncludeSerie(e.target.checked)}
          />
          Série
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeWatched}
            onChange={(e) => setIncludeWatched(e.target.checked)}
          />
          Incluir já assistidos
        </label>
      </fieldset>
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Sorteando…' : 'Criar sessão'}
      </Button>
    </form>
  )
}
