'use client'

import {
  useId,
  useRef,
  type ChangeEvent,
  type FocusEvent as EventoDeFoco,
  type ReactNode,
} from 'react'
import {
  faCircleInfo,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import { Textarea } from '@piluvitu/ui/textarea'
import {
  caracteresForaDoWinAnsi,
  type CampoDoFormulario,
  type Formulario,
  type ValorDoCampo,
} from '@piluvitu/tools/pdf-regras'
import {
  ehPreenchivel,
  opcoesNaOrdem,
  type CampoPreenchivel,
  type FocoNoCampo,
  type ValoresDoFormulario,
} from './formulario'
import { TEXTOS } from './textos'

const T = TEXTOS.formulario

const CAMPO =
  'border-input bg-background focus-visible:ring-ring h-11 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-hidden'

const OPCAO = 'flex min-h-11 cursor-pointer items-center gap-3 text-sm'

const MARCA = 'accent-primary size-5 shrink-0'

export type Registrar = (
  id: number,
  elemento: HTMLElement | null,
  opcao?: string,
) => void

type Props = {
  formulario: Formulario
  valores: ValoresDoFormulario
  erros: ReadonlyMap<number, string>
  /** Enquanto o PDF é montado. */
  desabilitado?: boolean
  /** Cada controle pelo id do campo (o radio também pela opção), para a tela levar o foco até ele. */
  registrar: Registrar
  aoMudar: (valor: ValorDoCampo, recusados?: readonly string[]) => void
  aoFocar: (foco: FocoNoCampo | null) => void
}

function Aviso({
  children,
  alerta = false,
  testid,
}: {
  children: ReactNode
  alerta?: boolean
  testid: string
}) {
  return (
    <div
      className={cn(
        'bg-card flex gap-2 rounded-md border px-3 py-3 text-sm',
        alerta ? 'border-destructive' : 'border-border',
      )}
    >
      <FontAwesomeIcon
        icon={alerta ? faTriangleExclamation : faCircleInfo}
        className={cn(
          'mt-0.5 size-4 shrink-0',
          alerta ? 'text-destructive' : 'text-primary',
        )}
        aria-hidden
      />
      <p data-testid={testid}>{children}</p>
    </div>
  )
}

function agruparPorPagina(campos: readonly CampoDoFormulario[]) {
  const grupos = new Map<number | null, CampoDoFormulario[]>()
  for (const campo of campos) {
    const pagina = campo.widgets[0]?.pagina ?? null
    grupos.set(pagina, [...(grupos.get(pagina) ?? []), campo])
  }
  return [...grupos].sort(([a], [b]) => Number(a === null) - Number(b === null))
}

// O caractere recusado nem entra; trocado antes de o React devolver o valor, o cursor fica onde a pessoa escrevia.
function semForaDoWinAnsi(
  evento: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
): { valor: string; recusados: string[] } {
  const campo = evento.target
  const valor = campo.value
  const recusados = caracteresForaDoWinAnsi(valor)
  if (!recusados.length) return { valor, recusados }
  const ate = campo.selectionStart ?? valor.length
  const tiradosAntes = [...valor.slice(0, ate)]
    .filter((c) => recusados.includes(c))
    .join('').length
  const limpo = [...valor].filter((c) => !recusados.includes(c)).join('')
  campo.value = limpo
  campo.setSelectionRange(ate - tiradosAntes, ate - tiradosAntes)
  return { valor: limpo, recusados }
}

/** O formulário do PDF como um formulário HTML de verdade: um fieldset por página, na ordem de Tab do PDF. */
export function PainelDoFormulario({
  formulario,
  valores,
  erros,
  desabilitado = false,
  registrar,
  aoMudar,
  aoFocar,
}: Props) {
  const ids = useId()
  const idDoTitulo = `${ids}-titulo`
  const campos = formulario.tipo === 'acroform' ? formulario.campos : []
  const grupos = agruparPorPagina(campos)
  const paginasComCampos = grupos.filter(([pagina]) => pagina !== null).length

  function aoSair(evento: EventoDeFoco<HTMLFormElement>) {
    if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) {
      aoFocar(null)
    }
  }

  return (
    <section
      aria-labelledby={idDoTitulo}
      className="bg-card border-border space-y-4 rounded-lg border p-4"
      data-testid="editar-pdf-formulario"
    >
      <div className="space-y-0.5">
        <h2 id={idDoTitulo} className="font-semibold">
          {T.titulo}
        </h2>
        {campos.length > 0 && (
          <p
            className="text-muted-foreground text-sm"
            data-testid="formulario-resumo"
          >
            {T.resumo(campos.length, paginasComCampos)}
          </p>
        )}
      </div>

      {formulario.tipo === 'nenhum' && (
        <p className="text-muted-foreground text-sm">{T.semFormulario}</p>
      )}
      {formulario.tipo === 'xfa' && (
        <Aviso testid="formulario-aviso-xfa">{T.xfa}</Aviso>
      )}
      {formulario.tipo === 'ilegivel' && (
        <Aviso testid="formulario-aviso-ilegivel">{T.ilegivel}</Aviso>
      )}
      {formulario.tipo === 'acroform' && (
        <>
          {formulario.assinadoDigitalmente && (
            <Aviso alerta testid="formulario-aviso-assinado">
              {T.assinadoDigitalmente}
            </Aviso>
          )}
          {formulario.hibrido && (
            <Aviso testid="formulario-aviso-hibrido">{T.hibrido}</Aviso>
          )}
          <p className="text-muted-foreground text-sm">
            {T.paginaMostraOriginal}
          </p>
          <form
            noValidate
            aria-labelledby={idDoTitulo}
            inert={desabilitado || undefined}
            onSubmit={(evento) => evento.preventDefault()}
            onBlur={aoSair}
            className="space-y-4"
          >
            {grupos.map(([pagina, doGrupo]) => (
              <fieldset
                key={pagina ?? 'fora'}
                className="border-border min-w-0 space-y-4 border-t pt-3"
                data-testid="formulario-pagina"
              >
                <legend className="pr-2 text-sm font-semibold">
                  {pagina === null ? T.semPagina : T.pagina(pagina + 1)}
                </legend>
                {doGrupo.map((campo) => (
                  <CampoNaTela
                    key={campo.id}
                    prefixo={ids}
                    campo={campo}
                    valor={valores.get(campo.id)}
                    erro={erros.get(campo.id)}
                    registrar={registrar}
                    aoMudar={aoMudar}
                    aoFocar={aoFocar}
                  />
                ))}
              </fieldset>
            ))}
          </form>
        </>
      )}
    </section>
  )
}

type PropsDoCampo = {
  prefixo: string
  campo: CampoDoFormulario
  valor: ValorDoCampo | undefined
  erro: string | undefined
  registrar: Registrar
  aoMudar: Props['aoMudar']
  aoFocar: Props['aoFocar']
}

const comObrigatorio = (campo: CampoDoFormulario) =>
  campo.obrigatorio ? `${campo.rotulo} (${T.obrigatorio})` : campo.rotulo

function CampoNaTela(props: PropsDoCampo) {
  const { prefixo, campo, erro } = props
  const id = `${prefixo}-campo-${campo.id}`
  const idDaPagina = `${id}-pagina`
  const idDoErro = `${id}-erro`
  const widget = campo.widgets[0]
  const descritores = [idDaPagina, erro ? idDoErro : null]

  const pagina = (
    <p id={idDaPagina} className="text-muted-foreground text-xs">
      {widget ? T.naPagina(widget.pagina + 1) : T.semLugar}
    </p>
  )
  const mensagemDeErro = erro ? (
    <p
      id={idDoErro}
      role="alert"
      className="bg-card border-destructive rounded-md border px-3 py-2 text-sm"
      data-testid="formulario-erro"
    >
      {erro}
    </p>
  ) : null

  return (
    <div
      className="min-w-0 space-y-1"
      data-testid="formulario-campo"
      data-id={campo.id}
    >
      {campo.tipo === 'texto' && campo.naoPreenchivel === 'somente_leitura' ? (
        <>
          <label htmlFor={id} className="text-sm font-medium">
            {campo.rotulo}
          </label>
          <Input
            ref={(elemento) => props.registrar(campo.id, elemento)}
            id={id}
            readOnly
            value={campo.valor}
            aria-describedby={`${id}-motivo ${idDaPagina}`}
            onFocus={() => props.aoFocar({ campo: campo.id, widget: 0 })}
            className="bg-muted h-11 focus-visible:ring-2"
          />
          <p id={`${id}-motivo`} className="text-muted-foreground text-xs">
            {T.naoPreenchivel.somente_leitura}
          </p>
          {pagina}
        </>
      ) : ehPreenchivel(campo) ? (
        <ControleDoCampo
          {...props}
          campo={campo}
          id={id}
          descritores={descritores}
          pagina={pagina}
        />
      ) : (
        <>
          <p className="text-sm font-medium">{campo.rotulo}</p>
          <p className="text-muted-foreground text-sm">
            {T.naoPreenchivel[campo.naoPreenchivel ?? 'botao']}
          </p>
          {pagina}
        </>
      )}
      {mensagemDeErro}
    </div>
  )
}

function ControleDoCampo({
  campo,
  valor: guardado,
  erro,
  id,
  descritores,
  pagina,
  registrar,
  aoMudar,
  aoFocar,
}: PropsDoCampo & {
  campo: CampoPreenchivel
  id: string
  descritores: (string | null)[]
  pagina: ReactNode
}) {
  const primeiraRef = useRef<HTMLInputElement | null>(null)
  const { id: idDoCampo, nome } = campo
  const focar = (widget = 0) => aoFocar({ campo: idDoCampo, widget })
  const rotulo = comObrigatorio(campo)
  const obrigatorio = campo.obrigatorio || undefined
  const invalido = erro ? true : undefined
  const descrito = (extras: (string | null)[] = []) =>
    [...descritores, ...extras].filter(Boolean).join(' ')

  switch (campo.tipo) {
    case 'texto': {
      const texto = guardado?.tipo === 'texto' ? guardado.valor : campo.valor
      const idDoContador = `${id}-contador`
      const Controle = campo.multilinha ? Textarea : Input
      return (
        <>
          <label htmlFor={id} className="text-sm font-medium">
            {rotulo}
          </label>
          <Controle
            ref={(elemento: HTMLInputElement | HTMLTextAreaElement | null) =>
              registrar(idDoCampo, elemento)
            }
            id={id}
            value={texto}
            maxLength={campo.tamanhoMaximo ?? undefined}
            aria-required={obrigatorio}
            aria-invalid={invalido}
            aria-describedby={descrito([
              campo.tamanhoMaximo !== null ? idDoContador : null,
            ])}
            onChange={(
              evento: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
            ) => {
              const { valor, recusados } = semForaDoWinAnsi(evento)
              aoMudar({ id: idDoCampo, nome, tipo: 'texto', valor }, recusados)
            }}
            onFocus={() => focar()}
            className={cn(
              'text-base focus-visible:ring-2 sm:text-sm',
              !campo.multilinha && 'h-11',
            )}
          />
          {pagina}
          {campo.tamanhoMaximo !== null && (
            <p
              id={idDoContador}
              className="text-muted-foreground text-xs tabular-nums"
            >
              {T.caracteres(texto.length, campo.tamanhoMaximo)}
            </p>
          )}
        </>
      )
    }
    case 'caixa': {
      const marcada =
        guardado?.tipo === 'caixa' ? guardado.marcada : campo.marcada
      return (
        <>
          <div className="flex min-h-11 items-center gap-3">
            <input
              ref={(elemento) => registrar(idDoCampo, elemento)}
              id={id}
              type="checkbox"
              checked={marcada}
              aria-required={obrigatorio}
              aria-invalid={invalido}
              aria-describedby={descrito()}
              onChange={(evento) =>
                aoMudar({
                  id: idDoCampo,
                  nome,
                  tipo: 'caixa',
                  marcada: evento.target.checked,
                })
              }
              onFocus={() => focar()}
              className={MARCA}
            />
            <label htmlFor={id} className="py-2 text-sm font-medium">
              {rotulo}
            </label>
          </div>
          {pagina}
        </>
      )
    }
    case 'opcoes': {
      const escolhida =
        guardado?.tipo === 'opcoes' ? guardado.valor : campo.valor
      const opcoes = opcoesNaOrdem(campo)
      const principal = opcoes.includes(escolhida ?? '') ? escolhida : opcoes[0]
      const widgetDa = (opcao: string) =>
        Math.max(
          0,
          campo.widgets.findIndex((w) => w.opcao === opcao),
        )
      return (
        <fieldset
          role="radiogroup"
          aria-labelledby={`${id}-legenda`}
          aria-required={obrigatorio}
          aria-describedby={descrito()}
          className="min-w-0 space-y-1"
        >
          <legend id={`${id}-legenda`} className="text-sm font-medium">
            {rotulo}
          </legend>
          {opcoes.map((opcao, indice) => (
            <label key={opcao} className={OPCAO}>
              <input
                ref={(elemento) => {
                  if (indice === 0) primeiraRef.current = elemento
                  registrar(idDoCampo, elemento, opcao)
                  if (opcao === principal) registrar(idDoCampo, elemento)
                }}
                type="radio"
                name={id}
                checked={escolhida === opcao}
                onChange={() =>
                  aoMudar({ id: idDoCampo, nome, tipo: 'opcoes', valor: opcao })
                }
                onFocus={() => focar(widgetDa(opcao))}
                className={MARCA}
              />
              <span className="[overflow-wrap:anywhere]">{opcao}</span>
            </label>
          ))}
          {!campo.obrigatorio && escolhida !== null && (
            <Button
              type="button"
              variant="outline"
              className="h-11 px-3"
              onClick={() => {
                aoMudar({ id: idDoCampo, nome, tipo: 'opcoes', valor: null })
                primeiraRef.current?.focus()
              }}
              onFocus={() => focar(widgetDa(escolhida))}
              data-testid="formulario-limpar-escolha"
            >
              {T.limparEscolha}
            </Button>
          )}
          {pagina}
        </fieldset>
      )
    }
    case 'suspensa':
    case 'lista': {
      if (campo.tipo === 'lista' && campo.multipla) {
        const escolhidas =
          guardado?.tipo === 'lista' ? guardado.valores : campo.valores
        const opcoes = [
          ...campo.opcoes,
          ...campo.valores.filter((v) => !campo.opcoes.includes(v)),
        ]
        return (
          <fieldset aria-describedby={descrito()} className="min-w-0 space-y-1">
            <legend className="text-sm font-medium">{rotulo}</legend>
            {opcoes.map((opcao, indice) => (
              <label key={opcao} className={OPCAO}>
                <input
                  ref={
                    indice === 0
                      ? (elemento) => registrar(idDoCampo, elemento)
                      : undefined
                  }
                  type="checkbox"
                  checked={escolhidas.includes(opcao)}
                  onChange={(evento) =>
                    aoMudar({
                      id: idDoCampo,
                      nome,
                      tipo: 'lista',
                      valores: evento.target.checked
                        ? opcoes.filter(
                            (o) => o === opcao || escolhidas.includes(o),
                          )
                        : escolhidas.filter((o) => o !== opcao),
                    })
                  }
                  onFocus={() => focar()}
                  className={MARCA}
                />
                <span className="[overflow-wrap:anywhere]">{opcao}</span>
              </label>
            ))}
            {pagina}
          </fieldset>
        )
      }
      const escolhida =
        campo.tipo === 'lista'
          ? ((guardado?.tipo === 'lista'
              ? guardado.valores
              : campo.valores)[0] ?? null)
          : guardado?.tipo === 'suspensa'
            ? guardado.valor
            : campo.valor
      const doArquivo =
        campo.tipo === 'lista' ? (campo.valores[0] ?? null) : campo.valor
      const opcoes = [
        ...campo.opcoes,
        ...(doArquivo !== null && !campo.opcoes.includes(doArquivo)
          ? [doArquivo]
          : []),
      ]
      return (
        <>
          <label htmlFor={id} className="text-sm font-medium">
            {rotulo}
          </label>
          <select
            ref={(elemento) => registrar(idDoCampo, elemento)}
            id={id}
            value={
              escolhida === null ? '-1' : String(opcoes.indexOf(escolhida))
            }
            aria-required={obrigatorio}
            aria-invalid={invalido}
            aria-describedby={descrito()}
            onChange={(evento) => {
              const nova = opcoes[Number(evento.target.value)] ?? null
              aoMudar(
                campo.tipo === 'lista'
                  ? {
                      id: idDoCampo,
                      nome,
                      tipo: 'lista',
                      valores: nova === null ? [] : [nova],
                    }
                  : { id: idDoCampo, nome, tipo: 'suspensa', valor: nova },
              )
            }}
            onFocus={() => focar()}
            className={CAMPO}
          >
            <option value="-1">{T.nenhuma}</option>
            {opcoes.map((opcao, indice) => (
              <option key={opcao} value={indice}>
                {opcao}
              </option>
            ))}
          </select>
          {pagina}
        </>
      )
    }
  }
}
