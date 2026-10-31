'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@piluvitu/ui/button'
import { useResumo } from '@/hooks/admin/atelier/use-resumo'
import { errorMessage } from '@/lib/votacao/api-client'
import type { Resumo } from '@/lib/admin/atelier/types'

export type EstadoResumo =
  | { tipo: 'ocioso' }
  | { tipo: 'gerando' }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'confirmarTags'; sugestao: Resumo }
  | { tipo: 'preenchido' }

function mesmasTags(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const ordenadas = (x: string[]) => [...x].sort().join('\n')
  return ordenadas(a) === ordenadas(b)
}

function ListaDeTags({ rotulo, tags }: { rotulo: string; tags: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground w-20 text-xs">{rotulo}</span>
      {tags.map((t) => (
        <span
          key={t}
          className="border-border text-muted-foreground rounded-full border px-2 py-0.5 font-mono text-xs"
        >
          {t}
        </span>
      ))}
    </div>
  )
}

export function ResumoButtonView(props: {
  estado: EstadoResumo
  desabilitado: boolean
  tagsAtuais: string[]
  onGerar: () => void
  onUsarSugeridas: () => void
  onManterAtuais: () => void
}) {
  const { estado } = props
  const gerando = estado.tipo === 'gerando'
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={props.desabilitado || gerando}
        onClick={props.onGerar}
      >
        {gerando ? 'Gerando resumo…' : 'Gerar resumo'}
      </Button>

      {estado.tipo === 'erro' ? (
        <p role="alert" className="text-warn text-xs">
          {estado.mensagem}
        </p>
      ) : null}

      {estado.tipo === 'preenchido' ? (
        <p role="status" className="text-muted-foreground text-xs">
          Resumo preenchido. Revise e salve.
        </p>
      ) : null}

      {estado.tipo === 'confirmarTags' ? (
        <div
          role="group"
          aria-label="Trocar as tags"
          className="border-border bg-muted/30 flex flex-col gap-2 rounded-lg border p-3"
        >
          <p className="text-foreground text-xs font-medium">
            Trocar as tags pelas sugeridas?
          </p>
          <ListaDeTags rotulo="Atuais" tags={props.tagsAtuais} />
          <ListaDeTags rotulo="Sugeridas" tags={estado.sugestao.tags} />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={props.onUsarSugeridas}>
              Usar as sugeridas
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={props.onManterAtuais}
            >
              Manter as atuais
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function ResumoButton(props: {
  title: string
  body: string
  tags: string[]
  onAplicar: (r: Resumo) => void
}) {
  const [estado, setEstado] = useState<EstadoResumo>({ tipo: 'ocioso' })
  const resumo = useResumo()
  const atuais = useRef(props)
  useLayoutEffect(() => {
    atuais.current = props
  })

  function aplicar(r: Resumo) {
    atuais.current.onAplicar(r)
    setEstado({ tipo: 'preenchido' })
  }

  async function gerar() {
    setEstado({ tipo: 'gerando' })
    try {
      const sugestao = await resumo.mutateAsync({
        title: props.title,
        body: props.body,
      })
      const { tags } = atuais.current
      if (tags.length === 0 || mesmasTags(tags, sugestao.tags)) {
        aplicar(sugestao)
      } else {
        setEstado({ tipo: 'confirmarTags', sugestao })
      }
    } catch (err) {
      setEstado({ tipo: 'erro', mensagem: errorMessage(err) })
    }
  }

  return (
    <ResumoButtonView
      estado={estado}
      desabilitado={!props.body.trim()}
      tagsAtuais={props.tags}
      onGerar={gerar}
      onUsarSugeridas={() => {
        if (estado.tipo === 'confirmarTags') aplicar(estado.sugestao)
      }}
      onManterAtuais={() => {
        if (estado.tipo === 'confirmarTags') {
          aplicar({ ...estado.sugestao, tags: props.tags })
        }
      }}
    />
  )
}
