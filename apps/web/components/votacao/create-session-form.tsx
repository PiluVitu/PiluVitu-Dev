'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useCreateSession } from '@/hooks/votacao/use-create-session'
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
      className="space-y-4 max-w-md"
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
            onError: (err) => toast.error(String(err)),
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
