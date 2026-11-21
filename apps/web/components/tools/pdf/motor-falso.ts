import type { AvisoDoPdf } from '@piluvitu/tools/pdf-regras'
import type {
  FalhaDaOperacao,
  MotorDePdf,
  PdfMontado,
  PedidoDeMontagem,
  ResultadoDaAnalise,
} from './motor'

/** `undefined` entrega o PDF; uma falha rejeita; `'nunca'` deixa a operação pendurada. */
type Desfecho = FalhaDaOperacao | 'nunca' | undefined

type Opcoes = {
  /** Milissegundos de cada leitura e da montagem. */
  atraso?: number
  montagem?: Desfecho
  /** Tamanho que o PDF entregue diz ter, para testar os tetos sem alocar o arquivo. */
  tamanhoDoResultado?: number
  /** Os ids das páginas que o motor diz terem saído como a imagem de outra apagada. */
  repetemApagada?: readonly string[]
}

// Para stories e testes: o nome do arquivo decide o resultado da leitura. "assinado" e "certificado"
// dão o aviso da assinatura digital, e "xfa", o do XFA puro.
export function analiseDeExemplo(arquivo: File): ResultadoDaAnalise {
  if (/senha/i.test(arquivo.name)) return { ok: false, motivo: 'protegido' }
  if (/quebrado/i.test(arquivo.name)) return { ok: false, motivo: 'corrompido' }
  if (/pesado/i.test(arquivo.name))
    return { ok: false, motivo: 'falha_do_navegador' }
  if (!/\.pdf$/i.test(arquivo.name)) return { ok: false, motivo: 'nao_e_pdf' }
  const paginas = Number(/(\d+)p/.exec(arquivo.name)?.[1] ?? 1)
  const avisos: AvisoDoPdf[] = []
  if (/assinado|certificado/i.test(arquivo.name)) {
    avisos.push('assinatura_digital')
  }
  if (/xfa/i.test(arquivo.name)) avisos.push('xfa_puro')
  return { ok: true, paginas, avisos }
}

export function criarMotorFalso({
  atraso = 0,
  montagem,
  tamanhoDoResultado,
  repetemApagada = [],
}: Opcoes = {}) {
  const espera = () => new Promise((r) => setTimeout(r, atraso))
  let cancelar: (() => void) | null = null
  let portaoDasAnalises: Promise<void> | null = null
  let abrirOPortao = () => {}
  const resultado = (): PdfMontado => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
    if (tamanhoDoResultado !== undefined) {
      Object.defineProperty(pdf, 'size', { value: tamanhoDoResultado })
    }
    return { pdf, repetemApagada }
  }

  function operar(desfecho: Desfecho): Promise<PdfMontado> {
    cancelar?.()
    return new Promise<PdfMontado>((resolver, rejeitar) => {
      cancelar = () => rejeitar({ motivo: 'cancelado' })
      void (async () => {
        if (desfecho === 'nunca') return
        await espera()
        if (desfecho) rejeitar(desfecho)
        else resolver(resultado())
      })()
    })
  }

  const motor = {
    /** Daqui em diante, cada leitura espera o `soltarAnalises()`, sem depender de relógio. */
    prenderAnalises() {
      portaoDasAnalises = new Promise<void>((soltar) => {
        abrirOPortao = soltar
      })
    },
    soltarAnalises() {
      abrirOPortao()
      portaoDasAnalises = null
    },
    analisadas: [] as string[],
    montadas: [] as ({ nomes: string[] } & PedidoDeMontagem)[],
    encerrado: false,
    async analisar(arquivo: Blob) {
      motor.analisadas.push((arquivo as File).name)
      await portaoDasAnalises
      await espera()
      return analiseDeExemplo(arquivo as File)
    },
    montar(arquivos: readonly Blob[], pedido: PedidoDeMontagem) {
      motor.montadas.push({
        nomes: arquivos.map((a) => (a as File).name),
        ...pedido,
      })
      return operar(montagem)
    },
    cancelar() {
      cancelar?.()
      cancelar = null
    },
    encerrar() {
      motor.encerrado = true
    },
  } satisfies MotorDePdf & Record<string, unknown>
  return motor
}
