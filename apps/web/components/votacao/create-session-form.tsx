'use client'
import { useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { Input } from '@piluvitu/ui/input'
import { Label } from '@piluvitu/ui/label'
import { toast } from 'sonner'
import { useCreateSession } from '@/hooks/votacao/use-create-session'
import { errorMessage } from '@/lib/votacao/api-client'
import { useRouter } from 'next/navigation'
import {
  HALLOWEEN_CATEGORIES,
  HALLOWEEN_PER_CATEGORY,
  MAX_PER_CATEGORY,
  categoriasDisponiveis,
  halloweenSessionBody,
} from '@/lib/votacao/halloween'
import { useCategories } from '@/hooks/votacao/use-categories'
import type { CreateSessionBody } from '@/lib/votacao/types'

export function CreateSessionForm() {
  const [title, setTitle] = useState('')
  const [includeFilme, setIncludeFilme] = useState(true)
  const [includeSerie, setIncludeSerie] = useState(true)
  const [includeWatched, setIncludeWatched] = useState(false)
  const [halloween, setHalloween] = useState(false)
  const [perCategory, setPerCategory] = useState(HALLOWEEN_PER_CATEGORY)
  const [categorias, setCategorias] = useState<string[]>(HALLOWEEN_CATEGORIES)
  const planilha = useCategories(halloween)
  const opcoes = categoriasDisponiveis(planilha.data?.categories)

  function alternarCategoria(categoria: string, marcada: boolean) {
    setCategorias((atual) =>
      marcada ? [...atual, categoria] : atual.filter((c) => c !== categoria),
    )
  }
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
        if (halloween && categorias.length === 0) {
          toast.error('Escolha ao menos uma categoria')
          return
        }
        const body: CreateSessionBody = halloween
          ? halloweenSessionBody({
              title: title.trim(),
              includeWatched,
              perCategory,
              categories: categorias,
            })
          : {
              title: title.trim(),
              types,
              include_watched: includeWatched,
              categories: [],
            }
        mutation.mutate(body, {
          onSuccess: (data) => {
            toast.success('Sessão criada')
            router.push(`/votacao/${data.session.ID}`)
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
          <span className="font-medium">🎃 Sessão de Halloween</span>
          <span className="text-muted-foreground block text-xs">
            Sorteia vários filmes das categorias escolhidas da planilha (terror
            por padrão), e a página da sessão ganha o tema de Halloween.
          </span>
        </span>
      </label>
      {halloween && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Categorias da planilha
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {opcoes.map((categoria) => (
              <label
                key={categoria}
                className="flex items-center gap-2 text-sm capitalize"
              >
                <input
                  type="checkbox"
                  checked={categorias.includes(categoria)}
                  onChange={(e) =>
                    alternarCategoria(categoria, e.target.checked)
                  }
                />
                {categoria}
              </label>
            ))}
          </div>
          {planilha.isError && (
            <p className="text-muted-foreground text-xs">
              Não deu pra ler as categorias da planilha; dá pra sortear com as
              marcadas.
            </p>
          )}
        </fieldset>
      )}
      {halloween && (
        <div className="space-y-2">
          <Label htmlFor="per-category">Filmes por categoria</Label>
          <Input
            id="per-category"
            type="number"
            min={1}
            max={MAX_PER_CATEGORY}
            value={perCategory}
            onChange={(e) => setPerCategory(Number(e.target.value) || 1)}
            className="w-24"
          />
        </div>
      )}
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
            ? '🎃 Sortear filmes de Halloween'
            : 'Criar sessão'}
      </Button>
    </form>
  )
}
