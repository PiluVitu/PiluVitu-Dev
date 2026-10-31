import { ApiError } from '@/lib/votacao/api-client'
import type { JobTranscricao } from '@/lib/admin/atelier/types'
import {
  CHAVE_JOB,
  INTERVALO_MS,
  acompanharJob,
  assinarJobGuardado,
  guardarJob,
  jobTerminou,
  lerJobGuardado,
  limparJob,
  progressoDoJob,
  respostaDoPost,
} from './acompanhamento'

function job(over: Partial<JobTranscricao> = {}): JobTranscricao {
  return {
    id: '0123456789abcdef0123456789abcdef',
    status: 'na_fila',
    posicao: 1,
    parte_atual: 0,
    total_partes: 3,
    nome_atual: null,
    modelo: 'mlx-community/whisper-large-v3-mlx',
    criado_em: '2026-10-31T12:00:00Z',
    atualizado_em: '2026-10-31T12:00:00Z',
    resultado: null,
    erro: null,
    ...over,
  }
}

function naoEncontrado() {
  return new ApiError(404, [
    {
      type: 'error',
      code: 'job_not_found',
      message: 'Transcrição não encontrada — ela pode ter expirado.',
    },
  ])
}

const ID_A = 'a'.repeat(32)
const ID_B = 'b'.repeat(32)

describe('id guardado (sair e voltar)', () => {
  beforeEach(() => localStorage.clear())

  it('usa uma chave estável no localStorage', () => {
    expect(CHAVE_JOB).toBe('piluvitu:transcricao:job')
    guardarJob(localStorage, ID_A)
    expect(localStorage.getItem('piluvitu:transcricao:job')).toBe(ID_A)
  })

  it('lê o id guardado e devolve null quando não há', () => {
    expect(lerJobGuardado(localStorage)).toBeNull()
    guardarJob(localStorage, ID_A)
    expect(lerJobGuardado(localStorage)).toBe(ID_A)
    limparJob(localStorage)
    expect(lerJobGuardado(localStorage)).toBeNull()
  })

  it('avisa quem assina quando o id guardado muda (useSyncExternalStore)', () => {
    const aviso = jest.fn()
    const desassinar = assinarJobGuardado(aviso)
    guardarJob(localStorage, ID_A)
    limparJob(localStorage)
    expect(aviso).toHaveBeenCalledTimes(2)

    desassinar()
    guardarJob(localStorage, ID_B)
    expect(aviso).toHaveBeenCalledTimes(2)
  })

  it('outra aba mexendo no id também avisa (evento storage)', () => {
    const aviso = jest.fn()
    const desassinar = assinarJobGuardado(aviso)
    window.dispatchEvent(new StorageEvent('storage', { key: CHAVE_JOB }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'outra' }))
    expect(aviso).toHaveBeenCalledTimes(1)
    desassinar()
  })

  it('não quebra a tela se o storage recusar (modo privado, cota)', () => {
    const quebrado = {
      getItem: () => {
        throw new Error('negado')
      },
      setItem: () => {
        throw new Error('negado')
      },
      removeItem: () => {
        throw new Error('negado')
      },
    } as unknown as Storage
    expect(lerJobGuardado(quebrado)).toBeNull()
    expect(() => guardarJob(quebrado, ID_A)).not.toThrow()
    expect(() => limparJob(quebrado)).not.toThrow()
  })
})

describe('jobTerminou', () => {
  it.each([
    ['na_fila', false],
    ['transcrevendo', false],
    ['pronto', true],
    ['falhou', true],
  ] as const)('%s → %s', (status, esperado) => {
    expect(jobTerminou(job({ status }))).toBe(esperado)
  })
})

describe('progressoDoJob', () => {
  it('na fila mostra a posição e 0%', () => {
    expect(progressoDoJob(job({ posicao: 2 }))).toEqual({
      percentual: 0,
      rotulo: 'Na fila — posição 2',
    })
  })

  it('na fila sem posição não inventa número', () => {
    expect(progressoDoJob(job({ posicao: null })).rotulo).toBe('Na fila')
  })

  it('transcrevendo conta a parte em andamento (parte_atual = já terminadas)', () => {
    expect(
      progressoDoJob(
        job({
          status: 'transcrevendo',
          posicao: null,
          parte_atual: 1,
          nome_atual: 'b.ogg',
        }),
      ),
    ).toEqual({ percentual: 33, rotulo: 'Transcrevendo parte 2 de 3 — b.ogg' })
  })

  it('não passa de N de N nem divide por zero', () => {
    expect(
      progressoDoJob(
        job({ status: 'transcrevendo', parte_atual: 3, total_partes: 3 }),
      ).rotulo,
    ).toBe('Transcrevendo parte 3 de 3')
    expect(
      progressoDoJob(
        job({ status: 'transcrevendo', parte_atual: 0, total_partes: 0 }),
      ).percentual,
    ).toBe(0)
  })

  it('pronto é 100%', () => {
    expect(progressoDoJob(job({ status: 'pronto' })).percentual).toBe(100)
  })
})

describe('acompanharJob', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  function ganchos() {
    return {
      aoAtualizar: jest.fn(),
      aoAvisar: jest.fn(),
      aoPerder: jest.fn(),
    }
  }

  it('consulta já na largada e a cada INTERVALO_MS até terminar', async () => {
    const buscar = jest
      .fn()
      .mockResolvedValueOnce(job())
      .mockResolvedValueOnce(job({ status: 'transcrevendo', posicao: null }))
      .mockResolvedValueOnce(job({ status: 'pronto', posicao: null }))
    const g = ganchos()

    acompanharJob({ id: 'x', buscar, ...g })
    await jest.advanceTimersByTimeAsync(0)
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(buscar).toHaveBeenCalledWith('x')

    await jest.advanceTimersByTimeAsync(INTERVALO_MS)
    expect(buscar).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(INTERVALO_MS)
    expect(buscar).toHaveBeenCalledTimes(3)

    await jest.advanceTimersByTimeAsync(INTERVALO_MS * 5)
    expect(buscar).toHaveBeenCalledTimes(3)
    expect(g.aoAtualizar.mock.calls.map(([j]) => j.status)).toEqual([
      'na_fila',
      'transcrevendo',
      'pronto',
    ])
  })

  it('para no falhou e entrega o erro do job', async () => {
    const falhou = job({
      status: 'falhou',
      erro: { code: 'promeia_reiniciado', message: 'Envie de novo.' },
    })
    const buscar = jest.fn().mockResolvedValue(falhou)
    const g = ganchos()

    acompanharJob({ id: 'x', buscar, ...g })
    await jest.advanceTimersByTimeAsync(INTERVALO_MS * 3)
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(g.aoAtualizar).toHaveBeenCalledWith(falhou)
  })

  it('erro de rede pontual não perde o job: avisa e tenta de novo', async () => {
    const buscar = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(job({ status: 'pronto' }))
    const g = ganchos()

    acompanharJob({ id: 'x', buscar, ...g })
    await jest.advanceTimersByTimeAsync(0)
    expect(g.aoAvisar).toHaveBeenLastCalledWith(
      expect.stringMatching(/tentando de novo/i),
    )
    expect(g.aoPerder).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(INTERVALO_MS)
    expect(buscar).toHaveBeenCalledTimes(2)
    expect(g.aoAvisar).toHaveBeenLastCalledWith(null)
    expect(g.aoAtualizar).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pronto' }),
    )
  })

  it('503 promeia_unreachable no polling também é passageiro', async () => {
    const buscar = jest
      .fn()
      .mockRejectedValueOnce(
        new ApiError(503, [
          { type: 'error', code: 'promeia_unreachable', message: 'Suba' },
        ]),
      )
      .mockResolvedValueOnce(job())
    const g = ganchos()

    acompanharJob({ id: 'x', buscar, ...g })
    await jest.advanceTimersByTimeAsync(INTERVALO_MS)
    expect(buscar).toHaveBeenCalledTimes(2)
    expect(g.aoPerder).not.toHaveBeenCalled()
  })

  it('404 job_not_found encerra com a mensagem do servidor', async () => {
    const buscar = jest.fn().mockRejectedValue(naoEncontrado())
    const g = ganchos()

    acompanharJob({ id: 'x', buscar, ...g })
    await jest.advanceTimersByTimeAsync(INTERVALO_MS * 3)
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(g.aoPerder).toHaveBeenCalledWith({
      code: 'job_not_found',
      message: 'Transcrição não encontrada — ela pode ter expirado.',
    })
  })

  it('401/403 encerra sem insistir (sessão caiu)', async () => {
    const buscar = jest
      .fn()
      .mockRejectedValue(
        new ApiError(401, [
          { type: 'error', code: 'unauthorized', message: 'Entre de novo.' },
        ]),
      )
    const g = ganchos()

    acompanharJob({ id: 'x', buscar, ...g })
    await jest.advanceTimersByTimeAsync(INTERVALO_MS * 3)
    expect(buscar).toHaveBeenCalledTimes(1)
    expect(g.aoPerder).toHaveBeenCalledWith({
      code: 'unauthorized',
      message: 'Entre de novo.',
    })
  })

  it('cancelar (sair da tela) para o polling e ignora a resposta em voo', async () => {
    let resolver: (j: JobTranscricao) => void = () => {}
    const buscar = jest.fn(
      () => new Promise<JobTranscricao>((r) => (resolver = r)),
    )
    const g = ganchos()

    const cancelar = acompanharJob({ id: 'x', buscar, ...g })
    await jest.advanceTimersByTimeAsync(0)
    cancelar()
    resolver(job())
    await jest.advanceTimersByTimeAsync(INTERVALO_MS * 3)

    expect(buscar).toHaveBeenCalledTimes(1)
    expect(g.aoAtualizar).not.toHaveBeenCalled()
  })
})

// Na janela de deploy (web novo no ar, ramielle ou promeia ainda antigos) o
// POST devolve a transcrição pronta, sem `id`. Guardar `undefined` deixava a
// string 'undefined' no localStorage e a tela presa num polling que não acaba.
describe('resposta do POST sem id (deploy fora de ordem)', () => {
  beforeEach(() => localStorage.clear())

  it('guardarJob ignora id fora do formato', () => {
    guardarJob(localStorage, undefined as unknown as string)
    guardarJob(localStorage, '../etc')
    expect(localStorage.getItem(CHAVE_JOB)).toBeNull()
  })

  it('lerJobGuardado descarta lixo já gravado por versão anterior', () => {
    localStorage.setItem(CHAVE_JOB, 'undefined')
    expect(lerJobGuardado(localStorage)).toBeNull()
  })

  it('job com id válido segue como job', () => {
    const j = job()
    expect(respostaDoPost(j)).toEqual({ job: j })
  })

  it('transcrição síncrona antiga vira um job pronto, sem id, com o texto', () => {
    const antigo = {
      partes: [{ nome: 'a.ogg', texto: 'oi' }],
      texto: 'oi',
      modelo: 'm',
    }
    const r = respostaDoPost(antigo)
    expect('job' in r && r.job).toMatchObject({
      id: '',
      status: 'pronto',
      resultado: antigo,
      erro: null,
    })
  })

  it('202 antigo sem id nem texto vira erro claro', () => {
    const r = respostaDoPost({ ok: true })
    expect('erro' in r && r.erro).toMatch(/id da transcrição/)
  })
})
