'use client'
import { useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { toast } from 'sonner'
import { useCreateSession } from '@/hooks/votacao/use-create-session'
import { errorMessage } from '@/lib/votacao/api-client'
import { urlDaSessao } from '@/lib/votai'
import { halloweenSessionBody } from '@/lib/votacao/halloween'
import type { CreateSessionBody } from '@/lib/votacao/types'

export function CreateSessionForm() {
  const [title, setTitle] = useState('')
  const [includeFilme, setIncludeFilme] = useState(true)
  const [includeSerie, setIncludeSerie] = useState(true)
  const [includeWatched, setIncludeWatched] = useState(false)
  const [halloween, setHalloween] = useState(false)
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
        const body: CreateSessionBody = halloween
          ? halloweenSessionBody({ title: title.trim(), includeWatched })
          : {
              title: title.trim(),
              types,
              include_watched: includeWatched,
              categories: [],
            }
        mutation.mutate(body, {
          onSuccess: (data) => {
            toast.success('Sessão criada')
            window.location.assign(urlDaSessao(data.session.ID))
          },
          onError: (err) => toast.error(errorMessage(err)),
        })
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={halloween ? 'Noite de Halloween' : 'Sexta 22/05'}
          required
        />
      </div>
      <label className="flex items-start gap-3 rounded-lg border border-orange-500/40 bg-orange-500/10 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={halloween}
          onChange={(e) => setHalloween(e.target.checked)}
        />
        <span>
          <span className="font-medium">🎃 Votação especial de Halloween</span>
          <span className="text-muted-foreground block text-xs">
            Em vez de votação, uma roleta sorteia um filme entre os marcados na
            coluna Halloween da planilha, com a entropia da câmera. A página da
            sessão ganha o tema de Halloween.
          </span>
        </span>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">
          {halloween ? 'Filtros' : 'Tipos'}
        </legend>
        {!halloween && (
          <>
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
          </>
        )}
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
        {mutation.isPending
          ? 'Sorteando…'
          : halloween
            ? '🎃 Criar roleta de Halloween'
            : 'Criar sessão'}
      </Button>
    </form>
  )
}
