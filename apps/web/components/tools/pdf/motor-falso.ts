import type {
  AndamentoDaMesclagem,
  FalhaDaMesclagem,
  MotorDePdf,
  ResultadoDaAnalise,
} from './motor'

type Opcoes = {
  /** Milissegundos de cada leitura e de cada passo da mesclagem. */
  atraso?: number
  /** `undefined` mescla; uma falha rejeita; `'nunca'` deixa a mesclagem pendurada. */
  mesclagem?: FalhaDaMesclagem | 'nunca'
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

export function criarMotorFalso({ atraso = 0, mesclagem }: Opcoes = {}) {
  const espera = () => new Promise((r) => setTimeout(r, atraso))
  let cancelar: (() => void) | null = null
  const motor = {
    analisadas: [] as string[],
    mescladas: [] as string[][],
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
      return new Promise<Blob>((resolver, rejeitar) => {
        cancelar = () => rejeitar({ motivo: 'cancelado' })
        void (async () => {
          for (const [i] of arquivos.entries()) {
            aoAndar({ fracao: (0.9 * i) / arquivos.length, arquivo: i })
            await espera()
          }
          if (mesclagem === 'nunca') return
          aoAndar({ fracao: 0.9, arquivo: null })
          await espera()
          if (mesclagem) rejeitar(mesclagem)
          else resolver(new Blob(['%PDF-1.7'], { type: 'application/pdf' }))
        })()
      })
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
