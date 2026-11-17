import type {
  Formulario,
  MotivoDoErroNoCampo,
  PaginaDoPlano,
} from '@piluvitu/tools/pdf-regras'
import type {
  AndamentoDaMesclagem,
  FalhaDaOperacao,
  MotorDePdf,
  OpcoesDaAnalise,
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
  /** A edição que leva o formulário falha neste campo. */
  falhaNoCampo?: {
    campo: number
    motivo: MotivoDoErroNoCampo
    caracteres?: readonly string[]
  }
}

type FormularioComCampos = Extract<Formulario, { tipo: 'acroform' }>

// Páginas A4 (595 × 842 pontos), como as do renderizador falso; os ids seguem a ordem de Tab.
export const FORMULARIO_DE_TESTE: FormularioComCampos = {
  tipo: 'acroform',
  hibrido: false,
  assinadoDigitalmente: false,
  campos: [
    {
      id: 0,
      nome: 'pessoa.nome',
      rotulo: 'Nome completo',
      obrigatorio: true,
      tipo: 'texto',
      valor: '',
      multilinha: false,
      tamanhoMaximo: 40,
      widgets: [
        { pagina: 0, caixa: { x: 72, y: 120, largura: 260, altura: 22 } },
      ],
    },
    {
      id: 1,
      nome: 'endereco',
      rotulo: 'Endereço',
      obrigatorio: false,
      tipo: 'texto',
      valor: '',
      multilinha: true,
      tamanhoMaximo: null,
      widgets: [
        { pagina: 0, caixa: { x: 72, y: 170, largura: 360, altura: 60 } },
      ],
    },
    {
      id: 2,
      nome: 'aceito',
      rotulo: 'Aceito os termos',
      obrigatorio: true,
      tipo: 'caixa',
      marcada: false,
      widgets: [
        {
          pagina: 0,
          caixa: { x: 72, y: 250, largura: 14, altura: 14 },
          opcao: 'Sim',
        },
      ],
    },
    {
      id: 3,
      nome: 'plano',
      rotulo: 'plano',
      obrigatorio: false,
      tipo: 'opcoes',
      valor: null,
      opcoes: ['Básico', 'Completo'],
      widgets: [
        {
          pagina: 0,
          caixa: { x: 72, y: 290, largura: 14, altura: 14 },
          opcao: 'Básico',
        },
        {
          pagina: 0,
          caixa: { x: 200, y: 290, largura: 14, altura: 14 },
          opcao: 'Completo',
        },
      ],
    },
    {
      id: 4,
      nome: 'protocolo',
      rotulo: 'Protocolo',
      obrigatorio: false,
      tipo: 'texto',
      valor: '2026-0042',
      multilinha: false,
      tamanhoMaximo: null,
      naoPreenchivel: 'somente_leitura',
      widgets: [
        { pagina: 0, caixa: { x: 72, y: 330, largura: 160, altura: 22 } },
      ],
    },
    {
      id: 5,
      nome: 'uf',
      rotulo: 'Estado',
      obrigatorio: false,
      tipo: 'suspensa',
      valor: 'SP',
      opcoes: ['SP', 'RJ', 'MG'],
      widgets: [
        { pagina: 1, caixa: { x: 72, y: 100, largura: 120, altura: 22 } },
      ],
    },
    {
      id: 6,
      nome: 'interesses',
      rotulo: 'Interesses',
      obrigatorio: false,
      tipo: 'lista',
      valores: ['Azul'],
      opcoes: ['Azul', 'Verde', 'Vermelho'],
      multipla: true,
      widgets: [
        { pagina: 1, caixa: { x: 72, y: 150, largura: 160, altura: 60 } },
      ],
    },
    {
      id: 7,
      nome: 'assinatura',
      rotulo: 'Assinatura digital',
      obrigatorio: false,
      tipo: 'assinatura',
      assinada: false,
      naoPreenchivel: 'assinatura_digital',
      widgets: [
        { pagina: 1, caixa: { x: 72, y: 600, largura: 220, altura: 60 } },
      ],
    },
    {
      id: 8,
      nome: 'enviar',
      rotulo: 'Enviar',
      obrigatorio: false,
      tipo: 'botao',
      naoPreenchivel: 'botao',
      widgets: [
        { pagina: 1, caixa: { x: 72, y: 700, largura: 100, altura: 24 } },
      ],
    },
  ],
}

// O nome decide: "xfa" é o XFA puro, "hibrido" e "assinado" são o formulário de teste com o XFA ou com
// a assinatura digital, "formulario" é ele puro, e o resto não tem formulário.
export function formularioDeExemplo(nome: string): Formulario {
  if (/xfa/i.test(nome)) return { tipo: 'xfa' }
  if (/hibrido/i.test(nome)) return { ...FORMULARIO_DE_TESTE, hibrido: true }
  if (/assinado/i.test(nome)) {
    return {
      ...FORMULARIO_DE_TESTE,
      assinadoDigitalmente: true,
      campos: FORMULARIO_DE_TESTE.campos.map((campo) =>
        campo.tipo === 'assinatura' ? { ...campo, assinada: true } : campo,
      ),
    }
  }
  if (/formulario/i.test(nome)) return FORMULARIO_DE_TESTE
  return { tipo: 'nenhum' }
}

// Para stories e testes: o nome do arquivo decide o resultado da leitura.
export function analiseDeExemplo(
  arquivo: File,
  opcoes?: OpcoesDaAnalise,
): ResultadoDaAnalise {
  if (/senha/i.test(arquivo.name)) return { ok: false, motivo: 'protegido' }
  if (/quebrado/i.test(arquivo.name)) return { ok: false, motivo: 'corrompido' }
  if (/pesado/i.test(arquivo.name))
    return { ok: false, motivo: 'falha_do_navegador' }
  if (!/\.pdf$/i.test(arquivo.name)) return { ok: false, motivo: 'nao_e_pdf' }
  const paginas = Number(/(\d+)p/.exec(arquivo.name)?.[1] ?? 1)
  return opcoes?.formulario
    ? { ok: true, paginas, formulario: formularioDeExemplo(arquivo.name) }
    : { ok: true, paginas }
}

export function criarMotorFalso({
  atraso = 0,
  mesclagem,
  organizacao,
  edicao,
  tamanhoDoResultado,
  falhaNoCampo,
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
    analisadasComFormulario: [] as string[],
    mescladas: [] as string[][],
    organizadas: [] as { nome: string; plano: readonly PaginaDoPlano[] }[],
    editadas: [] as ({ nome: string } & PedidoDeEdicao)[],
    encerrado: false,
    async analisar(arquivo: Blob, opcoes?: OpcoesDaAnalise) {
      motor.analisadas.push((arquivo as File).name)
      if (opcoes?.formulario) {
        motor.analisadasComFormulario.push((arquivo as File).name)
      }
      await espera()
      return analiseDeExemplo(arquivo as File, opcoes)
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
    editar(arquivo: Blob, pedido: PedidoDeEdicao) {
      motor.editadas.push({ nome: (arquivo as File).name, ...pedido })
      return operar(
        pedido.formulario && falhaNoCampo ? falhaNoCampo : edicao,
        [],
      )
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
