'use client'

import { useId, useState, type ReactNode, type RefObject } from 'react'
import { faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import { Textarea } from '@piluvitu/ui/textarea'
import {
  FAMILIAS_DE_FONTE,
  TAMANHO_MAXIMO_DO_TEXTO,
  TAMANHO_MINIMO_DO_TEXTO,
  caracteresForaDoWinAnsi,
  type FamiliaDaFonte,
} from '@piluvitu/tools/pdf-regras'
import type { ObjetoNaTela } from './motor'
import {
  CORES,
  ESPESSURA_MAXIMA,
  ESPESSURA_MINIMA,
  corDoNome,
  nomeDaCor,
  type Mudanca,
  type NomeDaCor,
} from './objetos'
import { TEXTOS } from './textos'

const T = TEXTOS.editar.painel

const CAMPO =
  'border-input bg-background focus-visible:ring-ring h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-hidden'

// Uma casa decimal no campo; o objeto guarda o valor sem arredondar.
const arredondado = (valor: number) => String(Math.round(valor * 10) / 10)

function CampoNumerico({
  rotulo,
  valor,
  minimo,
  maximo,
  aoMudar,
  testid,
}: {
  rotulo: string
  valor: number
  minimo?: number
  maximo?: number
  aoMudar: (valor: number) => void
  testid: string
}) {
  const id = useId()
  const [rascunho, setRascunho] = useState<string | null>(null)
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        min={minimo}
        max={maximo}
        value={rascunho ?? arredondado(valor)}
        onChange={(evento) => {
          const texto = evento.target.value
          setRascunho(texto)
          const numero = Number(texto)
          if (texto.trim() !== '' && Number.isFinite(numero)) aoMudar(numero)
        }}
        onBlur={() => setRascunho(null)}
        className="h-11 tabular-nums focus-visible:ring-2"
        data-testid={testid}
      />
    </div>
  )
}

function CampoDoTexto({
  conteudo,
  textoRef,
  aoMudar,
  aoVoltar,
}: {
  conteudo: string
  textoRef: RefObject<HTMLTextAreaElement | null>
  aoMudar: (conteudo: string) => void
  aoVoltar: () => void
}) {
  const id = useId()
  const [recusados, setRecusados] = useState<string[]>([])

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium">
        {T.texto}
      </label>
      <Textarea
        ref={textoRef}
        id={id}
        value={conteudo}
        rows={Math.min(6, Math.max(2, conteudo.split('\n').length))}
        aria-describedby={`${id}-dica${recusados.length ? ` ${id}-aviso` : ''}`}
        onChange={(evento) => {
          const valor = evento.target.value
          const fora = caracteresForaDoWinAnsi(valor)
          if (!fora.length) {
            setRecusados([])
            aoMudar(valor)
            return
          }
          // O caractere recusado nem entra no campo. Trocado aqui, antes de o React devolver o valor, o
          // cursor fica onde a pessoa estava escrevendo, e não no fim.
          const campo = evento.target
          const ate = campo.selectionStart ?? valor.length
          const tiradosAntes = [...valor.slice(0, ate)]
            .filter((c) => fora.includes(c))
            .join('').length
          const limpo = [...valor].filter((c) => !fora.includes(c)).join('')
          campo.value = limpo
          campo.setSelectionRange(ate - tiradosAntes, ate - tiradosAntes)
          setRecusados(fora)
          if (limpo !== conteudo) aoMudar(limpo)
        }}
        onKeyDown={(evento) => {
          if (evento.key === 'Escape') {
            evento.preventDefault()
            aoVoltar()
          }
        }}
        className="text-base focus-visible:ring-2 sm:text-sm"
        data-testid="editar-pdf-campo-texto"
      />
      {recusados.length > 0 && (
        <p
          id={`${id}-aviso`}
          role="alert"
          className="bg-card border-destructive rounded-md border px-3 py-2 text-sm"
          data-testid="editar-pdf-aviso-winansi"
        >
          {T.foraDoWinAnsi(recusados)}
        </p>
      )}
      <p id={`${id}-dica`} className="text-muted-foreground text-xs">
        {T.voltar}
      </p>
    </div>
  )
}

function Linha({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

type Props = {
  objeto: ObjetoNaTela
  nomeDaImagem?: string
  textoRef: RefObject<HTMLTextAreaElement | null>
  aoMudar: (mudanca: Mudanca) => void
  aoApagar: () => void
  /** Esc no campo de texto: o foco volta para o objeto. */
  aoVoltar: () => void
}

/** O jeito exato de posicionar: X, Y, largura e altura em campos numéricos, mais fonte, tamanho e cor. */
export function PainelDoObjeto({
  objeto,
  nomeDaImagem,
  textoRef,
  aoMudar,
  aoApagar,
  aoVoltar,
}: Props) {
  const ids = useId()
  const cor = 'cor' in objeto ? objeto.cor : null
  const corComNome = cor ? nomeDaCor(cor) : null

  return (
    <div
      role="group"
      aria-labelledby={`${ids}-titulo`}
      className="bg-card border-border space-y-4 rounded-lg border p-4"
      data-testid="editar-pdf-painel"
    >
      <div className="space-y-0.5">
        <h3 id={`${ids}-titulo`} className="font-semibold">
          {T.titulo}
        </h3>
        <p
          className="text-muted-foreground text-sm [overflow-wrap:anywhere]"
          data-testid="editar-pdf-painel-nome"
        >
          {TEXTOS.editar.objetos.nome(objeto, nomeDaImagem)}
        </p>
      </div>

      {objeto.tipo === 'texto' && (
        <>
          <CampoDoTexto
            conteudo={objeto.conteudo}
            textoRef={textoRef}
            aoMudar={(valor) => aoMudar({ campo: 'conteudo', valor })}
            aoVoltar={aoVoltar}
          />
          <Linha>
            <div className="min-w-0 space-y-1">
              <label htmlFor={`${ids}-fonte`} className="text-sm font-medium">
                {T.fonte}
              </label>
              <select
                id={`${ids}-fonte`}
                value={objeto.fonte}
                onChange={(evento) =>
                  aoMudar({
                    campo: 'fonte',
                    valor: evento.target.value as FamiliaDaFonte,
                  })
                }
                className={CAMPO}
                data-testid="editar-pdf-campo-fonte"
              >
                {FAMILIAS_DE_FONTE.map((familia) => (
                  <option key={familia} value={familia}>
                    {T.fontes[familia]}
                  </option>
                ))}
              </select>
            </div>
            <CampoNumerico
              rotulo={T.tamanho}
              valor={objeto.tamanho}
              minimo={TAMANHO_MINIMO_DO_TEXTO}
              maximo={TAMANHO_MAXIMO_DO_TEXTO}
              aoMudar={(valor) => aoMudar({ campo: 'tamanho', valor })}
              testid="editar-pdf-campo-tamanho"
            />
          </Linha>
          <div className="flex flex-wrap gap-x-4">
            {(['negrito', 'italico'] as const).map((campo) => (
              <label
                key={campo}
                className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="accent-primary size-5"
                  checked={objeto[campo]}
                  onChange={(evento) =>
                    aoMudar({ campo, valor: evento.target.checked })
                  }
                  data-testid={`editar-pdf-campo-${campo}`}
                />
                {T[campo]}
              </label>
            ))}
          </div>
        </>
      )}

      {cor && (
        <div className="space-y-1">
          <label htmlFor={`${ids}-cor`} className="text-sm font-medium">
            {T.cor}
          </label>
          <div className="flex gap-2">
            <select
              id={`${ids}-cor`}
              value={corComNome ?? 'outra'}
              onChange={(evento) => {
                const escolhida = corDoNome(evento.target.value)
                if (escolhida) aoMudar({ campo: 'cor', valor: escolhida })
              }}
              className={cn(CAMPO, 'min-w-0 flex-1')}
              data-testid="editar-pdf-campo-cor"
            >
              {(Object.keys(CORES) as NomeDaCor[]).map((nome) => (
                <option key={nome} value={nome}>
                  {T.cores[nome]}
                </option>
              ))}
              {!corComNome && <option value="outra">{T.personalizada}</option>}
            </select>
            <input
              type="color"
              aria-label={T.outraCor}
              value={cor}
              onChange={(evento) =>
                aoMudar({ campo: 'cor', valor: evento.target.value })
              }
              className="border-input bg-background focus-visible:ring-ring h-11 w-14 shrink-0 cursor-pointer rounded-md border p-1 focus-visible:ring-2 focus-visible:outline-hidden"
              data-testid="editar-pdf-campo-outra-cor"
            />
          </div>
        </div>
      )}

      {'espessura' in objeto && (
        <CampoNumerico
          rotulo={T.espessura}
          valor={objeto.espessura}
          minimo={ESPESSURA_MINIMA}
          maximo={ESPESSURA_MAXIMA}
          aoMudar={(valor) => aoMudar({ campo: 'espessura', valor })}
          testid="editar-pdf-campo-espessura"
        />
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{T.posicao}</legend>
        <Linha>
          <CampoNumerico
            rotulo={T.x}
            valor={objeto.x}
            minimo={0}
            aoMudar={(valor) => aoMudar({ campo: 'x', valor })}
            testid="editar-pdf-campo-x"
          />
          <CampoNumerico
            rotulo={T.y}
            valor={objeto.y}
            minimo={0}
            aoMudar={(valor) => aoMudar({ campo: 'y', valor })}
            testid="editar-pdf-campo-y"
          />
          {objeto.tipo !== 'texto' && (
            <>
              <CampoNumerico
                rotulo={T.largura}
                valor={objeto.largura}
                minimo={0}
                aoMudar={(valor) => aoMudar({ campo: 'largura', valor })}
                testid="editar-pdf-campo-largura"
              />
              <CampoNumerico
                rotulo={T.altura}
                valor={objeto.altura}
                minimo={0}
                aoMudar={(valor) => aoMudar({ campo: 'altura', valor })}
                testid="editar-pdf-campo-altura"
              />
            </>
          )}
        </Linha>
      </fieldset>

      <Button
        type="button"
        variant="outline"
        className="h-11 gap-2"
        onClick={aoApagar}
        data-testid="editar-pdf-apagar-objeto"
      >
        <FontAwesomeIcon icon={faTrashCan} className="size-4" aria-hidden />
        {T.apagar}
      </Button>
    </div>
  )
}
