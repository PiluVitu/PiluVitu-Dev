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

it('mesclar repassa o andamento e entrega um Blob de PDF', async () => {
  const motor = novoMotor()
  const andamentos: unknown[] = []
  const pronto = motor.mesclar([arquivo('a.pdf')], (a) => andamentos.push(a))

  const { id } = ultimo().recebidos[0] as Extract<
    PedidoAoWorker,
    { tipo: 'mesclar' }
  >
  ultimo().responder({ tipo: 'andamento', id, fracao: 0, arquivo: 0 })
  ultimo().responder({ tipo: 'andamento', id, fracao: 0.9, arquivo: null })
  ultimo().responder({ tipo: 'pronto', id, bytes: new ArrayBuffer(8) })

  const pdf = await pronto
  expect(andamentos).toEqual([
    { fracao: 0, arquivo: 0 },
    { fracao: 0.9, arquivo: null },
  ])
  expect(pdf.type).toBe('application/pdf')
  expect(pdf.size).toBe(8)
})

it('mesclar rejeita com o motivo e o índice do arquivo que falhou', async () => {
  const motor = novoMotor()
  const pronto = motor.mesclar([arquivo('a.pdf')], () => {})
  const { id } = ultimo().recebidos[0] as Extract<
    PedidoAoWorker,
    { tipo: 'mesclar' }
  >

  ultimo().responder({ tipo: 'falhou', id, motivo: 'corrompido', indice: 1 })

  await expect(pronto).rejects.toEqual({ motivo: 'corrompido', indice: 1 })
})

it('cancelar derruba o Worker, rejeita a mesclagem e manda as leituras pendentes para um novo', async () => {
  const motor = novoMotor()
  const leitura = motor.analisar(arquivo('a.pdf'))
  const mesclagem = motor.mesclar([arquivo('b.pdf')], () => {})
  const primeiro = ultimo()

  motor.cancelar()

  await expect(mesclagem).rejects.toEqual({ motivo: 'cancelado' })
  expect(primeiro.encerrado).toBe(true)
  expect(WorkerFalso.criados).toHaveLength(2)
  const reenviado = ultimo().recebidos[0] as Extract<
    PedidoAoWorker,
    { tipo: 'analisar' }
  >
  expect(reenviado.tipo).toBe('analisar')

  ultimo().responder({
    tipo: 'analisado',
    id: reenviado.id,
    paginas: 2,
    avisos: [],
  })
  await expect(leitura).resolves.toEqual({ ok: true, paginas: 2, avisos: [] })
})

it('cancelar sem mesclagem em curso não derruba nada', () => {
  const motor = novoMotor()
  void motor.analisar(arquivo('a.pdf'))

  motor.cancelar()

  expect(ultimo().encerrado).toBe(false)
  expect(WorkerFalso.criados).toHaveLength(1)
})

it('se o Worker quebra, as leituras pendentes vão uma vez para um Worker novo e a mesclagem falha como inesperada', async () => {
  const motor = novoMotor()
  const leitura = motor.analisar(arquivo('a.pdf'))
  const mesclagem = motor.mesclar([arquivo('b.pdf')], () => {})
  const primeiro = ultimo()

  primeiro.quebrar()

  await expect(mesclagem).rejects.toEqual({ motivo: 'inesperado' })
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

it('dois mesclar seguidos: o primeiro é cancelado, o Worker antigo cai e resposta velha não resolve o novo', async () => {
  const motor = novoMotor()
  const primeira = motor.mesclar([arquivo('a.pdf')], () => {})
  const antigo = ultimo()
  const pedidoAntigo = antigo.recebidos[0] as Extract<
    PedidoAoWorker,
    { tipo: 'mesclar' }
  >

  const segunda = motor.mesclar([arquivo('b.pdf')], () => {})

  await expect(primeira).rejects.toEqual({ motivo: 'cancelado' })
  expect(antigo.encerrado).toBe(true)
  const novo = ultimo()
  expect(novo).not.toBe(antigo)
  const pedidoNovo = novo.recebidos[0] as Extract<
    PedidoAoWorker,
    { tipo: 'mesclar' }
  >
  expect(pedidoNovo.id).not.toBe(pedidoAntigo.id)

  novo.responder({
    tipo: 'pronto',
    id: pedidoAntigo.id,
    bytes: new ArrayBuffer(1),
  })
  novo.responder({
    tipo: 'pronto',
    id: pedidoNovo.id,
    bytes: new ArrayBuffer(3),
  })

  expect((await segunda).size).toBe(3)
})

it('encerrar derruba o Worker', () => {
  const motor = novoMotor()
  void motor.analisar(arquivo('a.pdf'))

  motor.encerrar()

  expect(ultimo().encerrado).toBe(true)
})

describe('organizar', () => {
  type PedidoDeOrganizar = Extract<PedidoAoWorker, { tipo: 'organizar' }>
  const plano = [
    { indice: 2, giro: 90 },
    { indice: 0, giro: 0 },
  ] as const

  it('manda o arquivo e o plano com id e entrega um Blob de PDF', async () => {
    const motor = novoMotor()
    const doc = arquivo('contrato.pdf')
    const pronto = motor.organizar(doc, plano)

    const pedido = ultimo().recebidos[0] as PedidoDeOrganizar
    expect(pedido).toEqual({
      tipo: 'organizar',
      id: expect.any(Number),
      arquivo: doc,
      plano,
    })
    ultimo().responder({
      tipo: 'pronto',
      id: pedido.id,
      bytes: new ArrayBuffer(5),
    })

    const pdf = await pronto
    expect(pdf.type).toBe('application/pdf')
    expect(pdf.size).toBe(5)
  })

  it('rejeita com o motivo do arquivo, sem índice', async () => {
    const motor = novoMotor()
    const pronto = motor.organizar(arquivo('a.pdf'), plano)
    const { id } = ultimo().recebidos[0] as PedidoDeOrganizar

    ultimo().responder({ tipo: 'falhou', id, motivo: 'protegido' })

    await expect(pronto).rejects.toEqual({ motivo: 'protegido' })
  })

  it('uma organização nova cancela a pendente, derruba o Worker e ignora a resposta velha', async () => {
    const motor = novoMotor()
    const primeira = motor.organizar(arquivo('a.pdf'), plano)
    const antigo = ultimo()
    const { id: idAntigo } = antigo.recebidos[0] as PedidoDeOrganizar

    const segunda = motor.organizar(arquivo('a.pdf'), [plano[1]])

    await expect(primeira).rejects.toEqual({ motivo: 'cancelado' })
    expect(antigo.encerrado).toBe(true)
    const novo = ultimo()
    expect(novo).not.toBe(antigo)
    const { id: idNovo } = novo.recebidos[0] as PedidoDeOrganizar
    novo.responder({ tipo: 'pronto', id: idAntigo, bytes: new ArrayBuffer(1) })
    novo.responder({ tipo: 'pronto', id: idNovo, bytes: new ArrayBuffer(4) })

    expect((await segunda).size).toBe(4)
  })

  it('mesclar com uma organização pendente cancela a organização, e o contrário também', async () => {
    const motor = novoMotor()
    const organizacao = motor.organizar(arquivo('a.pdf'), plano)
    const mesclagem = motor.mesclar([arquivo('b.pdf')], () => {})

    await expect(organizacao).rejects.toEqual({ motivo: 'cancelado' })
    expect(WorkerFalso.criados).toHaveLength(2)

    const outra = motor.organizar(arquivo('a.pdf'), plano)

    await expect(mesclagem).rejects.toEqual({ motivo: 'cancelado' })
    expect(WorkerFalso.criados).toHaveLength(3)
    const { id } = ultimo().recebidos[0] as PedidoDeOrganizar
    ultimo().responder({ tipo: 'pronto', id, bytes: new ArrayBuffer(2) })
    expect((await outra).size).toBe(2)
  })

  it('falha de outro id não rejeita a organização em curso', async () => {
    const motor = novoMotor()
    const pronto = motor.organizar(arquivo('a.pdf'), plano)
    const { id } = ultimo().recebidos[0] as PedidoDeOrganizar

    ultimo().responder({ tipo: 'falhou', id: id + 7, motivo: 'corrompido' })
    ultimo().responder({ tipo: 'pronto', id, bytes: new ArrayBuffer(3) })

    expect((await pronto).size).toBe(3)
  })

  it('cancelar rejeita a organização e manda as leituras pendentes para um Worker novo', async () => {
    const motor = novoMotor()
    const leitura = motor.analisar(arquivo('b.pdf'))
    const organizacao = motor.organizar(arquivo('a.pdf'), plano)
    const primeiro = ultimo()

    motor.cancelar()

    await expect(organizacao).rejects.toEqual({ motivo: 'cancelado' })
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

  it('se o Worker quebra no meio, a organização falha como inesperada', async () => {
    const motor = novoMotor()
    const organizacao = motor.organizar(arquivo('a.pdf'), plano)

    ultimo().quebrar()

    await expect(organizacao).rejects.toEqual({ motivo: 'inesperado' })
  })
})

describe('editar', () => {
  type PedidoDeEditar = Extract<PedidoAoWorker, { tipo: 'editar' }>
  const objetosPorPagina = new Map([
    [
      2,
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
  const paginasRasterizadas = new Map([[2, new Blob(['jpeg'])]])
  const vazio = {
    objetosPorPagina: new Map(),
    imagens: new Map(),
    paginasRasterizadas: new Map(),
  }

  it('manda o arquivo, os objetos, as imagens e as páginas rasterizadas com id e entrega um Blob de PDF', async () => {
    const motor = novoMotor()
    const doc = arquivo('contrato.pdf')
    const pronto = motor.editar(doc, {
      objetosPorPagina,
      imagens,
      paginasRasterizadas,
    })

    const pedido = ultimo().recebidos[0] as PedidoDeEditar
    expect(pedido).toEqual({
      tipo: 'editar',
      id: expect.any(Number),
      arquivo: doc,
      objetosPorPagina,
      imagens,
      paginasRasterizadas,
    })
    ultimo().responder({
      tipo: 'pronto',
      id: pedido.id,
      bytes: new ArrayBuffer(6),
    })

    const pdf = await pronto
    expect(pdf.type).toBe('application/pdf')
    expect(pdf.size).toBe(6)
  })

  it('rejeita com o motivo, a página, o objeto e os caracteres da falha da edição', async () => {
    const motor = novoMotor()
    const pronto = motor.editar(arquivo('a.pdf'), {
      objetosPorPagina,
      imagens: new Map(),
      paginasRasterizadas: new Map(),
    })
    const { id } = ultimo().recebidos[0] as PedidoDeEditar

    ultimo().responder({
      tipo: 'falhou',
      id,
      motivo: 'texto_fora_do_winansi',
      pagina: 2,
      objeto: 'o1',
      caracteres: ['😀'],
    })

    await expect(pronto).rejects.toEqual({
      motivo: 'texto_fora_do_winansi',
      pagina: 2,
      objeto: 'o1',
      caracteres: ['😀'],
    })
  })

  it('uma edição nova cancela a pendente, derruba o Worker e ignora a resposta velha', async () => {
    const motor = novoMotor()
    const primeira = motor.editar(arquivo('a.pdf'), {
      objetosPorPagina,
      imagens,
      paginasRasterizadas: new Map(),
    })
    const antigo = ultimo()
    const { id: idAntigo } = antigo.recebidos[0] as PedidoDeEditar

    const segunda = motor.editar(arquivo('a.pdf'), {
      objetosPorPagina: new Map(),
      imagens: new Map(),
      paginasRasterizadas,
    })

    await expect(primeira).rejects.toEqual({ motivo: 'cancelado' })
    expect(antigo.encerrado).toBe(true)
    const novo = ultimo()
    const { id: idNovo } = novo.recebidos[0] as PedidoDeEditar
    novo.responder({ tipo: 'pronto', id: idAntigo, bytes: new ArrayBuffer(1) })
    novo.responder({ tipo: 'pronto', id: idNovo, bytes: new ArrayBuffer(7) })

    expect((await segunda).size).toBe(7)
  })

  it('organizar com uma edição pendente cancela a edição', async () => {
    const motor = novoMotor()
    const edicao = motor.editar(arquivo('a.pdf'), {
      objetosPorPagina,
      imagens,
      paginasRasterizadas: new Map(),
    })

    void motor.organizar(arquivo('a.pdf'), [{ indice: 0, giro: 0 }])

    await expect(edicao).rejects.toEqual({ motivo: 'cancelado' })
  })

  it('cancelar e Worker que quebra: a edição falha como cancelada e como inesperada', async () => {
    const motor = novoMotor()
    const cancelada = motor.editar(arquivo('a.pdf'), vazio)
    motor.cancelar()
    await expect(cancelada).rejects.toEqual({ motivo: 'cancelado' })

    const quebrada = motor.editar(arquivo('a.pdf'), vazio)
    ultimo().quebrar()
    await expect(quebrada).rejects.toEqual({ motivo: 'inesperado' })
  })
})
