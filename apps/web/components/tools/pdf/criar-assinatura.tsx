'use client'

import { useEffect, useId, useRef, useState } from 'react'
import {
  faCircleExclamation,
  faCircleInfo,
  faEraser,
  faFileImage,
  faSignature,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@piluvitu/ui/button'
import { cn } from '@piluvitu/ui/cn'
import { Input } from '@piluvitu/ui/input'
import {
  caracteresForaDoWinAnsi,
  type Cor,
  type PontoDoTraco,
} from '@piluvitu/tools/pdf-regras'
import { desenharAssinatura } from './assinatura-desenhada'
import {
  ehFalhaDaImagem,
  prepararImagem,
  type ImagemPreparada,
} from './imagem-inserida'
import { CORES, FAMILIAS_CSS } from './objetos'
import { QuadroDeAssinatura } from './quadro-de-assinatura'
import { TEXTOS } from './textos'

const T = TEXTOS.assinatura

export type JeitoDeAssinar = 'desenhar' | 'enviar' | 'digitar'

const JEITOS: readonly JeitoDeAssinar[] = ['desenhar', 'enviar', 'digitar']

type ImagemDaAssinatura = Pick<ImagemPreparada, 'blob' | 'largura' | 'altura'>

/** O que sai daqui: o PNG (desenhada ou enviada) ou o nome digitado, que a tela põe na página. */
export type AssinaturaPronta =
  | ({ tipo: 'imagem'; jeito: 'desenhada' } & ImagemDaAssinatura)
  | ({ tipo: 'imagem'; jeito: 'enviada'; arquivo: string } & ImagemDaAssinatura)
  | { tipo: 'texto'; jeito: 'digitada'; nome: string; cor: Cor }

/** Em unidades do quadro (600 de largura): a ponta de uma caneta comum. */
export const ESPESSURA_DA_ASSINATURA = 4

const TINTAS = { preto: CORES.preto, azul: CORES.azul } as const

type Tinta = keyof typeof TINTAS

const TAMANHO_MAXIMO_DO_NOME = 80

type Enviada = { arquivo: File } & (
  | { estado: 'preparando' }
  | { estado: 'pronta'; imagem: ImagemPreparada; url: string }
  | { estado: 'recusada'; mensagem: string }
)

const RECUSAS = {
  nao_aceita: TEXTOS.editar.imagem.naoAceita,
  corrompida: TEXTOS.editar.imagem.corrompida,
  falha_do_navegador: TEXTOS.editar.imagem.falhaDoNavegador,
}

export function AvisoDeAssinaturaVisual() {
  return (
    <div
      className="bg-card border-border flex gap-3 rounded-lg border p-4"
      data-testid="aviso-assinatura-visual"
    >
      <FontAwesomeIcon
        icon={faCircleInfo}
        className="text-primary mt-0.5 size-4 shrink-0"
        aria-hidden
      />
      <div className="space-y-1 text-sm">
        <p className="font-semibold">{T.aviso.titulo}</p>
        <p className="text-muted-foreground">{T.aviso.texto}</p>
      </div>
    </div>
  )
}

type Props = {
  /** Devolve a mensagem quando não aceita a assinatura (o teto das imagens, por exemplo). */
  aoCriar: (assinatura: AssinaturaPronta) => string | void
  aoAnunciar: (texto: string) => void
  aoCancelar?: () => void
  jeitoInicial?: JeitoDeAssinar
}

/** Os três jeitos de criar a assinatura: desenhar no quadro, enviar uma imagem ou digitar o nome. */
export function CriarAssinatura({
  aoCriar,
  aoAnunciar,
  aoCancelar,
  jeitoInicial = 'desenhar',
}: Props) {
  const ids = useId()
  const marcadaRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const vezDaImagem = useRef(0)
  const [jeito, setJeito] = useState<JeitoDeAssinar>(jeitoInicial)
  const [tracos, setTracos] = useState<readonly PontoDoTraco[][]>([])
  const [tinta, setTinta] = useState<Tinta>('preto')
  const [nome, setNome] = useState('')
  const [recusados, setRecusados] = useState<string[]>([])
  const [tirarFundo, setTirarFundo] = useState(true)
  const [enviada, setEnviada] = useState<Enviada | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    marcadaRef.current?.focus()
  }, [])

  useEffect(
    () => () => {
      vezDaImagem.current += 1
    },
    [],
  )

  const urlDaPrevia = enviada?.estado === 'pronta' ? enviada.url : null
  useEffect(() => {
    if (!urlDaPrevia) return
    return () => URL.revokeObjectURL(urlDaPrevia)
  }, [urlDaPrevia])

  const motivo =
    jeito === 'desenhar'
      ? tracos.length
        ? null
        : T.quadro.vazio
      : jeito === 'enviar'
        ? enviada?.estado === 'pronta'
          ? null
          : T.semImagem
        : nome.trim()
          ? null
          : T.semNome
  const idDoMotivo = `${ids}-motivo`
  const idDaDica = `${ids}-dica-quadro`
  const idDaDicaDoFundo = `${ids}-dica-fundo`
  const idDaDicaDoNome = `${ids}-dica-nome`
  const idDoAvisoDoNome = `${ids}-aviso-nome`

  async function preparar(arquivo: File, semFundo: boolean) {
    const vez = ++vezDaImagem.current
    setErro(null)
    setEnviada({ arquivo, estado: 'preparando' })
    aoAnunciar(T.enviar.preparando(arquivo.name))
    try {
      const imagem = await prepararImagem(arquivo, {
        tirarFundoBranco: semFundo,
      })
      if (vez !== vezDaImagem.current) return
      setEnviada({
        arquivo,
        estado: 'pronta',
        imagem,
        url: URL.createObjectURL(imagem.blob),
      })
      aoAnunciar(T.enviar.pronta(arquivo.name, imagem.largura, imagem.altura))
    } catch (falha) {
      if (vez !== vezDaImagem.current) return
      const motivoDaRecusa = ehFalhaDaImagem(falha)
        ? falha.motivo
        : 'falha_do_navegador'
      setEnviada({
        arquivo,
        estado: 'recusada',
        mensagem: RECUSAS[motivoDaRecusa](arquivo.name),
      })
      aoAnunciar('')
    }
  }

  function limpar() {
    if (!tracos.length) return
    setTracos([])
    setErro(null)
    aoAnunciar(T.quadro.limpo)
  }

  async function usar() {
    if (motivo || ocupado) return
    setErro(null)
    let pronta: AssinaturaPronta
    if (jeito === 'desenhar') {
      setOcupado(true)
      try {
        const { blob, largura, altura } = await desenharAssinatura(tracos, {
          cor: TINTAS[tinta],
          espessura: ESPESSURA_DA_ASSINATURA,
        })
        pronta = { tipo: 'imagem', jeito: 'desenhada', blob, largura, altura }
      } catch {
        setErro(T.falha)
        return
      } finally {
        setOcupado(false)
      }
    } else if (jeito === 'enviar' && enviada?.estado === 'pronta') {
      const { blob, largura, altura } = enviada.imagem
      pronta = {
        tipo: 'imagem',
        jeito: 'enviada',
        arquivo: enviada.arquivo.name,
        blob,
        largura,
        altura,
      }
    } else {
      pronta = {
        tipo: 'texto',
        jeito: 'digitada',
        nome: nome.trim(),
        cor: TINTAS[tinta],
      }
    }
    const recusa = aoCriar(pronta)
    if (recusa) setErro(recusa)
  }

  const corDaTinta = (
    <div className="min-w-0 space-y-1">
      <label htmlFor={`${ids}-tinta`} className="text-sm font-medium">
        {T.cor.rotulo}
      </label>
      <select
        id={`${ids}-tinta`}
        value={tinta}
        onChange={(evento) => {
          const escolhida = evento.target.value
          if (escolhida === 'preto' || escolhida === 'azul') {
            setTinta(escolhida)
          }
        }}
        className="border-input bg-background focus-visible:ring-ring h-11 w-full min-w-32 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-hidden"
      >
        <option value="preto">{T.cor.preto}</option>
        <option value="azul">{T.cor.azul}</option>
      </select>
    </div>
  )

  return (
    <div className="space-y-4" data-testid="criar-assinatura">
      <AvisoDeAssinaturaVisual />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">
          {T.jeitos.rotulo}
        </legend>
        <div className="flex flex-wrap gap-2">
          {JEITOS.map((cada) => (
            <label
              key={cada}
              className={cn(
                'border-input has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-background flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2',
                cada === jeito && 'border-primary bg-accent-soft',
              )}
            >
              <input
                ref={cada === jeito ? marcadaRef : undefined}
                type="radio"
                name={`${ids}-jeito`}
                value={cada}
                checked={cada === jeito}
                onChange={() => {
                  setJeito(cada)
                  setErro(null)
                }}
                className="accent-primary size-4 focus-visible:outline-hidden"
              />
              {T.jeitos[cada]}
            </label>
          ))}
        </div>
      </fieldset>

      {jeito === 'desenhar' && (
        <div className="space-y-2">
          <QuadroDeAssinatura
            tracos={tracos}
            aoTracar={(traco) => {
              setTracos((anteriores) => [...anteriores, traco])
              setErro(null)
            }}
            cor={TINTAS[tinta]}
            espessura={ESPESSURA_DA_ASSINATURA}
            idDaDica={idDaDica}
          />
          <p id={idDaDica} className="text-muted-foreground text-xs">
            {T.quadro.dica}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {corDaTinta}
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 px-4"
              aria-disabled={tracos.length ? undefined : true}
              aria-describedby={tracos.length ? undefined : idDoMotivo}
              onClick={limpar}
            >
              <FontAwesomeIcon icon={faEraser} className="size-4" aria-hidden />
              {T.quadro.limpar}
            </Button>
          </div>
        </div>
      )}

      {jeito === 'enviar' && (
        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-2 px-4"
            onClick={() => inputRef.current?.click()}
          >
            <FontAwesomeIcon
              icon={faFileImage}
              className="size-4"
              aria-hidden
            />
            {enviada ? T.enviar.outra : T.enviar.escolher}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(evento) => {
              const escolhido = evento.target.files?.[0]
              evento.target.value = ''
              if (escolhido) void preparar(escolhido, tirarFundo)
            }}
            data-testid="criar-assinatura-input"
          />
          <div className="space-y-1">
            <div className="flex min-h-11 items-center gap-3">
              <input
                id={`${ids}-fundo`}
                type="checkbox"
                checked={tirarFundo}
                aria-describedby={idDaDicaDoFundo}
                onChange={(evento) => {
                  const marcada = evento.target.checked
                  setTirarFundo(marcada)
                  if (enviada) void preparar(enviada.arquivo, marcada)
                }}
                className="accent-primary size-5"
              />
              <label
                htmlFor={`${ids}-fundo`}
                className="flex min-h-11 items-center text-sm font-medium"
              >
                {T.enviar.tirarFundo}
              </label>
            </div>
            <p id={idDaDicaDoFundo} className="text-muted-foreground text-xs">
              {T.enviar.dicaDoFundo}
            </p>
          </div>
          {enviada?.estado === 'preparando' && (
            <p className="text-sm">
              {T.enviar.preparando(enviada.arquivo.name)}
            </p>
          )}
          {enviada?.estado === 'recusada' && (
            <p
              role="alert"
              className="bg-card border-destructive rounded-md border px-3 py-2 text-sm [overflow-wrap:anywhere]"
              data-testid="criar-assinatura-recusa"
            >
              {enviada.mensagem}
            </p>
          )}
          {enviada?.estado === 'pronta' && (
            <div className="space-y-1">
              <div
                className="border-border flex max-w-[600px] justify-center rounded-md border p-2 [background:repeating-conic-gradient(#e5e7eb_0%_25%,#ffffff_0%_50%)_50%/16px_16px]"
                data-testid="criar-assinatura-previa"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- prévia num Blob gerado no aparelho, sem otimizador */}
                <img
                  src={enviada.url}
                  alt=""
                  className="max-h-40 max-w-full object-contain"
                />
              </div>
              <p className="text-sm [overflow-wrap:anywhere]">
                {T.enviar.pronta(
                  enviada.arquivo.name,
                  enviada.imagem.largura,
                  enviada.imagem.altura,
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {jeito === 'digitar' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor={`${ids}-nome`} className="text-sm font-medium">
              {T.digitar.rotulo}
            </label>
            <Input
              id={`${ids}-nome`}
              autoComplete="name"
              maxLength={TAMANHO_MAXIMO_DO_NOME}
              value={nome}
              aria-describedby={`${idDaDicaDoNome}${recusados.length ? ` ${idDoAvisoDoNome}` : ''}`}
              onChange={(evento) => {
                const valor = evento.target.value
                const fora = caracteresForaDoWinAnsi(valor)
                setRecusados(fora)
                setErro(null)
                setNome(
                  fora.length
                    ? [...valor].filter((c) => !fora.includes(c)).join('')
                    : valor,
                )
              }}
              className="h-11 text-base focus-visible:ring-2 sm:text-sm"
            />
            {recusados.length > 0 && (
              <p
                id={idDoAvisoDoNome}
                role="alert"
                className="bg-card border-destructive rounded-md border px-3 py-2 text-sm"
                data-testid="criar-assinatura-winansi"
              >
                {TEXTOS.editar.painel.foraDoWinAnsi(recusados)}
              </p>
            )}
            <p id={idDaDicaDoNome} className="text-muted-foreground text-xs">
              {T.digitar.dica}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">{corDaTinta}</div>
          <div
            aria-hidden
            className="border-border flex min-h-16 max-w-[600px] items-center overflow-hidden rounded-md border bg-white px-4 py-2 text-[1.75rem] leading-tight whitespace-pre"
            style={{
              fontFamily: FAMILIAS_CSS.times,
              fontStyle: 'italic',
              color: TINTAS[tinta],
            }}
            data-testid="criar-assinatura-nome"
          >
            {nome}
          </div>
        </div>
      )}

      {erro && (
        <p
          role="alert"
          className="bg-card border-destructive flex gap-2 rounded-md border px-3 py-2 text-sm"
          data-testid="criar-assinatura-erro"
        >
          <FontAwesomeIcon
            icon={faCircleExclamation}
            className="text-destructive mt-0.5 size-4 shrink-0"
            aria-hidden
          />
          <span>{erro}</span>
        </p>
      )}

      <div className="space-y-1">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="h-11 gap-2 px-4"
            aria-disabled={motivo || ocupado ? true : undefined}
            aria-describedby={motivo ? idDoMotivo : undefined}
            onClick={() => void usar()}
          >
            <FontAwesomeIcon
              icon={faSignature}
              className="size-4"
              aria-hidden
            />
            {T.usar}
          </Button>
          {aoCancelar && (
            <Button
              type="button"
              variant="outline"
              className="h-11 px-4"
              onClick={aoCancelar}
            >
              {T.cancelar}
            </Button>
          )}
        </div>
        {motivo && (
          <p id={idDoMotivo} className="text-muted-foreground text-xs">
            {motivo}
          </p>
        )}
      </div>
    </div>
  )
}
