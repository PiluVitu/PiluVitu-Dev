import type { PaginaDoPlano } from '@piluvitu/tools/pdf-regras'
import type {
  AndamentoDaMesclagem,
  FalhaDaOperacao,
  MotorDePdf,
  PedidoDeEdicao,
  ResultadoDaAnalise,
} from './motor'

/** `undefined` entrega o PDF; uma falha rejeita; `'nunca'` deixa a operação pendurada. */
type Desfecho = FalhaDaOperacao | 'nunca' | undefined

type Opcoes = {
  /** Milissegundos de cada leitura e de cada passo das operações. */
  atraso?: number
  mesclagem?: Desfecho
  organizacao?: Desfecho
  edicao?: Desfecho
  /** Tamanho que o PDF entregue diz ter, para testar os tetos sem alocar o arquivo. */
  tamanhoDoResultado?: number
}

// Para stories e testes: o nome do arquivo decide o resultado da leitura.
export function analiseDeExemplo(arquivo: File): ResultadoDaAnalise {
  if (/senha/i.test(arquivo.name)) return { ok: false, motivo: 'protegido' }
  if (/quebrado/i.test(arquivo.name)) return { ok: false, motivo: 'corrompido' }
  if (/pesado/i.test(arquivo.name))
    return { ok: false, motivo: 'falha_do_navegador' }
  if (!/\.pdf$/i.test(arquivo.name)) return { ok: false, motivo: 'nao_e_pdf' }
  const paginas = Number(/(\d+)p/.exec(arquivo.name)?.[1] ?? 1)
  return { ok: true, paginas }
}

export function criarMotorFalso({
  atraso = 0,
  mesclagem,
  organizacao,
  edicao,
  tamanhoDoResultado,
}: Opcoes = {}) {
  const espera = () => new Promise((r) => setTimeout(r, atraso))
  let cancelar: (() => void) | null = null
  const resultado = () => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
    if (tamanhoDoResultado !== undefined) {
      Object.defineProperty(pdf, 'size', { value: tamanhoDoResultado })
    }
    return pdf
  }

  function operar(desfecho: Desfecho, passos: (() => void)[]): Promise<Blob> {
    cancelar?.()
    return new Promise<Blob>((resolver, rejeitar) => {
      cancelar = () => rejeitar({ motivo: 'cancelado' })
      void (async () => {
        for (const passo of passos) {
          passo()
          await espera()
        }
        if (desfecho === 'nunca') return
        await espera()
        if (desfecho) rejeitar(desfecho)
        else resolver(resultado())
      })()
    })
  }

  const motor = {
    analisadas: [] as string[],
    mescladas: [] as string[][],
    organizadas: [] as { nome: string; plano: readonly PaginaDoPlano[] }[],
    editadas: [] as ({ nome: string } & PedidoDeEdicao)[],
    encerrado: false,
    async analisar(arquivo: Blob) {
      motor.analisadas.push((arquivo as File).name)
      await espera()
      return analiseDeExemplo(arquivo as File)
    },
    mesclar(
      arquivos: Blob[],
      aoAndar: (andamento: AndamentoDaMesclagem) => void,
    ) {
      motor.mescladas.push(arquivos.map((a) => (a as File).name))
      return operar(mesclagem, [
        ...arquivos.map(
          (_, i) => () =>
            aoAndar({ fracao: (0.9 * i) / arquivos.length, arquivo: i }),
        ),
        ...(mesclagem === 'nunca'
          ? []
          : [() => aoAndar({ fracao: 0.9, arquivo: null })]),
      ])
    },
    organizar(arquivo: Blob, plano: readonly PaginaDoPlano[]) {
      motor.organizadas.push({ nome: (arquivo as File).name, plano })
      return operar(organizacao, [])
    },
    editar(
      arquivo: Blob,
      objetosPorPagina: PedidoDeEdicao['objetosPorPagina'],
      imagens: PedidoDeEdicao['imagens'],
      paginasRasterizadas: PedidoDeEdicao['paginasRasterizadas'],
    ) {
      motor.editadas.push({
        nome: (arquivo as File).name,
        objetosPorPagina,
        imagens,
        paginasRasterizadas,
      })
      return operar(edicao, [])
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
