import {
  criarMotorComWorker,
  type PedidoAoWorker,
  type RespostaDoWorker,
} from './motor'

// Um Worker de mentira: guarda o que recebeu e deixa o teste responder como o pdf.worker.ts.
class WorkerFalso extends EventTarget {
  static criados: WorkerFalso[] = []
  recebidos: PedidoAoWorker[] = []
  encerrado = false

  constructor() {
    super()
    WorkerFalso.criados.push(this)
  }

  postMessage(pedido: PedidoAoWorker) {
    this.recebidos.push(pedido)
  }

  terminate() {
    this.encerrado = true
  }

  responder(resposta: RespostaDoWorker) {
    this.dispatchEvent(new MessageEvent('message', { data: resposta }))
  }

  quebrar() {
    this.dispatchEvent(new Event('error'))
  }
}

function novoMotor() {
  return criarMotorComWorker(() => new WorkerFalso() as unknown as Worker)
}

const ultimo = () => WorkerFalso.criados.at(-1)!
const arquivo = (nome: string) => new File(['x'], nome)

beforeEach(() => {
  WorkerFalso.criados = []
})

it('só cria o Worker no primeiro pedido, e um só para vários pedidos', () => {
  const motor = novoMotor()
  expect(WorkerFalso.criados).toHaveLength(0)

  void motor.analisar(arquivo('a.pdf'))
  void motor.analisar(arquivo('b.pdf'))

  expect(WorkerFalso.criados).toHaveLength(1)
  expect(ultimo().recebidos.map((p) => p.tipo)).toEqual([
    'analisar',
    'analisar',
  ])
})

it('analisar resolve cada pedido pelo seu id, aceito (com os avisos do arquivo) ou recusado', async () => {
  const motor = novoMotor()
  const a = motor.analisar(arquivo('a.pdf'))
  const b = motor.analisar(arquivo('b.pdf'))
  const [pedidoA, pedidoB] = ultimo().recebidos as Extract<
    PedidoAoWorker,
    { tipo: 'analisar' }
  >[]

  ultimo().responder({ tipo: 'recusado', id: pedidoB.id, motivo: 'protegido' })
  ultimo().responder({
    tipo: 'analisado',
    id: pedidoA.id,
    paginas: 3,
    avisos: ['assinatura_digital', 'xfa_puro'],
  })

  await expect(a).resolves.toEqual({
    ok: true,
    paginas: 3,
    avisos: ['assinatura_digital', 'xfa_puro'],
  })
  await expect(b).resolves.toEqual({ ok: false, motivo: 'protegido' })
})

it('cancelar sem montagem em curso não derruba nada', () => {
  const motor = novoMotor()
  void motor.analisar(arquivo('a.pdf'))

  motor.cancelar()

  expect(ultimo().encerrado).toBe(false)
  expect(WorkerFalso.criados).toHaveLength(1)
})

it('se o Worker quebra, as leituras pendentes vão uma vez para um Worker novo e a montagem falha como inesperada', async () => {
  const motor = novoMotor()
  const leitura = motor.analisar(arquivo('a.pdf'))
  const montagem = motor.montar([arquivo('b.pdf')], {
    paginas: [
      { id: 'a0p0', origem: { arquivo: 0, indice: 0 }, giro: 0, moldura: 0 },
    ],
    objetosPorPagina: new Map(),
    imagens: new Map(),
    paginasRasterizadas: new Map(),
    apagadasForaDoPlano: [],
  })
  const primeiro = ultimo()

  primeiro.quebrar()

  await expect(montagem).rejects.toEqual({ motivo: 'inesperado' })
  expect(primeiro.encerrado).toBe(true)
  expect(WorkerFalso.criados).toHaveLength(2)
  const reenviado = ultimo().recebidos[0] as Extract<
    PedidoAoWorker,
    { tipo: 'analisar' }
  >
  ultimo().responder({
    tipo: 'analisado',
    id: reenviado.id,
    paginas: 4,
    avisos: [],
  })
  await expect(leitura).resolves.toEqual({ ok: true, paginas: 4, avisos: [] })
})

it('se o Worker quebra de novo, só a leitura em curso desiste, sem acusar o arquivo, e as outras seguem', async () => {
  const motor = novoMotor()
  const emCurso = motor.analisar(arquivo('pesado.pdf'))
  const depois = motor.analisar(arquivo('leve.pdf'))

  ultimo().quebrar()
  ultimo().quebrar()

  await expect(emCurso).resolves.toEqual({
    ok: false,
    motivo: 'falha_do_navegador',
  })
  const pedidos = ultimo().recebidos as Extract<
    PedidoAoWorker,
    { tipo: 'analisar' }
  >[]
  expect(pedidos).toHaveLength(1)
  expect((pedidos[0].arquivo as File).name).toBe('leve.pdf')
  ultimo().responder({
    tipo: 'analisado',
    id: pedidos[0].id,
    paginas: 1,
    avisos: [],
  })
  await expect(depois).resolves.toEqual({ ok: true, paginas: 1, avisos: [] })
})

it('encerrar derruba o Worker', () => {
  const motor = novoMotor()
  void motor.analisar(arquivo('a.pdf'))

  motor.encerrar()

  expect(ultimo().encerrado).toBe(true)
})

describe('montar', () => {
  type PedidoDeMontar = Extract<PedidoAoWorker, { tipo: 'montar' }>
  const paginas = [
    {
      id: 'a1p0',
      origem: { arquivo: 1, indice: 0 },
      giro: 90 as const,
      moldura: 0 as const,
    },
    {
      id: 'a0p2',
      origem: { arquivo: 0, indice: 2 },
      giro: 0 as const,
      moldura: 0 as const,
    },
  ]
  const objetosPorPagina = new Map([
    [
      'a0p2',
      [
        {
          id: 'o1',
          tipo: 'imagem' as const,
          imagem: 'logo',
          x: 1,
          y: 2,
          largura: 3,
          altura: 4,
        },
      ],
    ],
  ])
  const imagens = new Map([['logo', new Blob(['png'])]])
  const paginasRasterizadas = new Map([['a0p2', new Blob(['jpeg'])]])
  const apagadasForaDoPlano = [
    {
      origem: { arquivo: 0, indice: 0 },
      moldura: 90 as const,
      fundo: new Blob(['jpeg']),
    },
  ]
  const pedido = {
    paginas,
    objetosPorPagina,
    imagens,
    paginasRasterizadas,
    apagadasForaDoPlano,
  }

  it('manda os arquivos, as páginas por id, os objetos, as imagens, os fundos com id e as apagadas fora do plano, e entrega um Blob de PDF com as páginas que repetem uma apagada', async () => {
    const motor = novoMotor()
    const arquivos = [arquivo('contrato.pdf'), arquivo('anexo.pdf')]
    const pronto = motor.montar(arquivos, pedido)

    const recebido = ultimo().recebidos[0] as PedidoDeMontar
    expect(recebido).toEqual({
      tipo: 'montar',
      id: expect.any(Number),
      arquivos,
      paginas,
      objetosPorPagina,
      imagens,
      paginasRasterizadas,
      apagadasForaDoPlano,
    })
    ultimo().responder({
      tipo: 'pronto',
      id: recebido.id,
      bytes: new ArrayBuffer(6),
      repetemApagada: ['a1p0'],
    })

    const { pdf, repetemApagada } = await pronto
    expect(pdf.type).toBe('application/pdf')
    expect(pdf.size).toBe(6)
    expect(repetemApagada).toEqual(['a1p0'])
  })

  it('rejeita com o motivo, o id da página, o id do objeto e os caracteres da falha', async () => {
    const motor = novoMotor()
    const pronto = motor.montar([arquivo('a.pdf')], pedido)
    const { id } = ultimo().recebidos[0] as PedidoDeMontar

    ultimo().responder({
      tipo: 'falhou',
      id,
      motivo: 'texto_fora_do_winansi',
      pagina: 'a0p2',
      objeto: 'o1',
      caracteres: ['😀'],
    })

    await expect(pronto).rejects.toEqual({
      motivo: 'texto_fora_do_winansi',
      pagina: 'a0p2',
      objeto: 'o1',
      caracteres: ['😀'],
    })
  })

  it('rejeita com o motivo e o índice do arquivo que falhou', async () => {
    const motor = novoMotor()
    const pronto = motor.montar([arquivo('a.pdf'), arquivo('b.pdf')], pedido)
    const { id } = ultimo().recebidos[0] as PedidoDeMontar

    ultimo().responder({ tipo: 'falhou', id, motivo: 'protegido', indice: 1 })

    await expect(pronto).rejects.toEqual({ motivo: 'protegido', indice: 1 })
  })

  it('uma montagem nova cancela a pendente, derruba o Worker e ignora a resposta velha', async () => {
    const motor = novoMotor()
    const primeira = motor.montar([arquivo('a.pdf')], pedido)
    const antigo = ultimo()
    const { id: idAntigo } = antigo.recebidos[0] as PedidoDeMontar

    const segunda = motor.montar([arquivo('a.pdf')], {
      ...pedido,
      paginas: [paginas[1]],
    })

    await expect(primeira).rejects.toEqual({ motivo: 'cancelado' })
    expect(antigo.encerrado).toBe(true)
    const novo = ultimo()
    expect(novo).not.toBe(antigo)
    const { id: idNovo } = novo.recebidos[0] as PedidoDeMontar
    novo.responder({
      tipo: 'pronto',
      id: idAntigo,
      bytes: new ArrayBuffer(1),
      repetemApagada: [],
    })
    novo.responder({
      tipo: 'pronto',
      id: idNovo,
      bytes: new ArrayBuffer(7),
      repetemApagada: [],
    })

    expect((await segunda).pdf.size).toBe(7)
  })

  it('falha de outro id não rejeita a montagem em curso', async () => {
    const motor = novoMotor()
    const pronto = motor.montar([arquivo('a.pdf')], pedido)
    const { id } = ultimo().recebidos[0] as PedidoDeMontar

    ultimo().responder({ tipo: 'falhou', id: id + 7, motivo: 'corrompido' })
    ultimo().responder({
      tipo: 'pronto',
      id,
      bytes: new ArrayBuffer(3),
      repetemApagada: [],
    })

    expect((await pronto).pdf.size).toBe(3)
  })

  it('cancelar rejeita a montagem e manda as leituras pendentes para um Worker novo', async () => {
    const motor = novoMotor()
    const leitura = motor.analisar(arquivo('b.pdf'))
    const montagem = motor.montar([arquivo('a.pdf')], pedido)
    const primeiro = ultimo()

    motor.cancelar()

    await expect(montagem).rejects.toEqual({ motivo: 'cancelado' })
    expect(primeiro.encerrado).toBe(true)
    const reenviado = ultimo().recebidos[0] as Extract<
      PedidoAoWorker,
      { tipo: 'analisar' }
    >
    expect(reenviado.tipo).toBe('analisar')
    ultimo().responder({
      tipo: 'analisado',
      id: reenviado.id,
      paginas: 6,
      avisos: [],
    })
    await expect(leitura).resolves.toEqual({ ok: true, paginas: 6, avisos: [] })
  })

  it('se o Worker quebra no meio, a montagem falha como inesperada', async () => {
    const motor = novoMotor()
    const montagem = motor.montar([arquivo('a.pdf')], pedido)

    ultimo().quebrar()

    await expect(montagem).rejects.toEqual({ motivo: 'inesperado' })
  })
})
