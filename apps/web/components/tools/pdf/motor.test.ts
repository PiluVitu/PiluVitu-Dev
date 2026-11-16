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

it('analisar resolve cada pedido pelo seu id, aceito ou recusado', async () => {
  const motor = novoMotor()
  const a = motor.analisar(arquivo('a.pdf'))
  const b = motor.analisar(arquivo('b.pdf'))
  const [pedidoA, pedidoB] = ultimo().recebidos as Extract<
    PedidoAoWorker,
    { tipo: 'analisar' }
  >[]

  ultimo().responder({ tipo: 'recusado', id: pedidoB.id, motivo: 'protegido' })
  ultimo().responder({ tipo: 'analisado', id: pedidoA.id, paginas: 3 })

  await expect(a).resolves.toEqual({ ok: true, paginas: 3 })
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
  ultimo().responder({ tipo: 'mesclado', id, bytes: new ArrayBuffer(8) })

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

  ultimo().responder({ tipo: 'analisado', id: reenviado.id, paginas: 2 })
  await expect(leitura).resolves.toEqual({ ok: true, paginas: 2 })
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
  ultimo().responder({ tipo: 'analisado', id: reenviado.id, paginas: 4 })
  await expect(leitura).resolves.toEqual({ ok: true, paginas: 4 })
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
  ultimo().responder({ tipo: 'analisado', id: pedidos[0].id, paginas: 1 })
  await expect(depois).resolves.toEqual({ ok: true, paginas: 1 })
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
    tipo: 'mesclado',
    id: pedidoAntigo.id,
    bytes: new ArrayBuffer(1),
  })
  novo.responder({
    tipo: 'mesclado',
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
