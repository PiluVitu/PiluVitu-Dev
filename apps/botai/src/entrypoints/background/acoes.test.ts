import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { pessoaItem } from '../../lib/armazenamento'
import type { ResultadoFrame } from '../../lib/resultado'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import {
  ARQUIVO_CONTENT,
  inserirNoCampo,
  mostrarCampo,
  preencherPagina,
} from './acoes'

// O fakeBrowser não implementa scripting: o stub responde como a página responderia.
interface Injecao {
  target: Record<string, unknown>
  files?: string[]
  func?: (...args: unknown[]) => unknown
  args?: unknown[]
}
const executar = vi.fn<(injecao: Injecao) => Promise<unknown>>()

const RESULTADO: ResultadoFrame = {
  preenchidos: [
    { idx: 1, rotulo: 'Nome completo', seletor: 'input[name="nome"]' },
  ],
  naoReconhecidos: [
    {
      idx: 2,
      rotulo: 'Código de indicação',
      seletor: 'input[name="ref_code"]',
    },
  ],
  recusados: [],
  contentType: 'text/html',
  iframesDeFora: 0,
}

function simularPagina(resultado: ResultadoFrame | null) {
  executar.mockImplementation(async (injecao) =>
    injecao.files
      ? [{ documentId: 'doc-0', frameId: 0 }]
      : [{ documentId: 'doc-0', frameId: 0, result: resultado }],
  )
}

const chamada = (n: number) => executar.mock.calls[n][0]

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-01T15:00:00Z') })
  executar.mockReset()
  Object.assign(fakeBrowser.scripting, { executeScript: executar })
  await pessoaItem.setValue(P)
})

afterEach(() => vi.useRealTimers())

describe('preencherPagina', () => {
  it('injeta em todos os frames, chama __botai.preencher com a pessoa e hoje, avisa no frame 0 e devolve a soma', async () => {
    simularPagina(RESULTADO)
    const resposta = await preencherPagina(7)
    expect(executar).toHaveBeenCalledTimes(3)
    expect(chamada(0)).toEqual({
      target: { tabId: 7, allFrames: true },
      files: [ARQUIVO_CONTENT],
    })
    expect(chamada(1)).toMatchObject({
      target: { tabId: 7, allFrames: true },
      args: [P, '2026-10-01'],
    })
    expect(chamada(2)).toMatchObject({
      target: { tabId: 7, frameIds: [0] },
      args: [
        { titulo: '1 de 2 campos preenchidos', linha2: '1 não reconhecido' },
      ],
    })
    expect(resposta).toEqual({
      ok: true,
      resumo: {
        x: 1,
        y: 2,
        k: 1,
        contentType: 'text/html',
        iframesDeFora: 0,
        naoReconhecidos: [
          {
            documentId: 'doc-0',
            idx: 2,
            rotulo: 'Código de indicação',
            seletor: 'input[name="ref_code"]',
          },
        ],
      },
    })
  })

  it('a função injetada só chama a API do content script, e devolve null se ela não existir', async () => {
    simularPagina(RESULTADO)
    await preencherPagina(7)
    const { func, args = [] } = chamada(1)
    const preencher = vi.fn(() => RESULTADO)
    Object.assign(globalThis, { __botai: { preencher } })
    expect(func?.(...args)).toBe(RESULTADO)
    expect(preencher).toHaveBeenCalledWith(P, '2026-10-01')
    Reflect.deleteProperty(globalThis, '__botai')
    expect(func?.(...args)).toBeNull()
  })

  it('tudo reconhecido: o aviso vai sem a 2ª linha', async () => {
    simularPagina({ ...RESULTADO, naoReconhecidos: [] })
    await preencherPagina(7)
    expect(chamada(2).args).toEqual([{ titulo: '1 de 1 campo preenchido' }])
  })

  it('com Y = 0 avisa "Nenhum campo nesta página" numa linha só, no frame 0', async () => {
    simularPagina({ ...RESULTADO, preenchidos: [], naoReconhecidos: [] })
    const resposta = await preencherPagina(7)
    expect(executar).toHaveBeenCalledTimes(3)
    expect(chamada(2)).toMatchObject({
      target: { tabId: 7, frameIds: [0] },
      args: [{ titulo: 'Nenhum campo nesta página', erro: true }],
    })
    expect(resposta).toMatchObject({ ok: true, resumo: { x: 0, y: 0, k: 0 } })
  })

  it('PDF aberto no leitor do Chrome vira página proibida', async () => {
    simularPagina({
      ...RESULTADO,
      preenchidos: [],
      naoReconhecidos: [],
      contentType: 'application/pdf',
    })
    await expect(preencherPagina(7)).resolves.toEqual({
      ok: false,
      motivo: 'proibida',
    })
  })

  it('recusa do Chrome vira página proibida', async () => {
    const aba = await fakeBrowser.tabs.create({
      url: 'https://chromewebstore.google.com/',
    })
    executar.mockRejectedValue(
      new Error('The extensions gallery cannot be scripted.'),
    )
    await expect(preencherPagina(aba.id as number)).resolves.toEqual({
      ok: false,
      motivo: 'proibida',
    })
  })

  it('file: sem acesso liberado vira arquivo-sem-acesso', async () => {
    const aba = await fakeBrowser.tabs.create({ url: 'file:///tmp/form.html' })
    executar.mockRejectedValue(
      new Error(
        'Cannot access contents of url "file:///tmp/form.html". Extension manifest must request permission to access this host.',
      ),
    )
    await expect(preencherPagina(aba.id as number)).resolves.toEqual({
      ok: false,
      motivo: 'arquivo-sem-acesso',
    })
  })

  it('outros erros sobem', async () => {
    executar.mockRejectedValue(new Error('No tab with id: 7.'))
    await expect(preencherPagina(7)).rejects.toThrow('No tab with id: 7.')
  })

  it('sem pessoa guardada, gera e guarda uma antes de preencher', async () => {
    await pessoaItem.setValue(null)
    simularPagina(RESULTADO)
    await preencherPagina(7)
    const guardada = await pessoaItem.getValue()
    expect(guardada).not.toBeNull()
    expect(chamada(1).args?.[0]).toEqual(guardada)
  })
})

describe('inserirNoCampo', () => {
  it('injeta só no frame do clique e chama __botai.inserir com a pessoa e o kind', async () => {
    simularPagina(null)
    await inserirNoCampo(7, 3, 'cpf')
    expect(chamada(0)).toEqual({
      target: { tabId: 7, frameIds: [3] },
      files: [ARQUIVO_CONTENT],
    })
    expect(chamada(1)).toMatchObject({
      target: { tabId: 7, frameIds: [3] },
      args: [P, 'cpf'],
    })
  })
})

describe('mostrarCampo', () => {
  it('chama __botai.mostrar no documento da linha, sem reinjetar', async () => {
    executar.mockResolvedValue([
      { documentId: 'doc-9', frameId: 4, result: true },
    ])
    await expect(mostrarCampo(7, 'doc-9', 12)).resolves.toBe(true)
    expect(executar).toHaveBeenCalledTimes(1)
    expect(chamada(0)).toMatchObject({
      target: { tabId: 7, documentIds: ['doc-9'] },
      args: [12],
    })
  })

  it('devolve false quando o campo sumiu', async () => {
    executar.mockResolvedValue([
      { documentId: 'doc-9', frameId: 4, result: false },
    ])
    await expect(mostrarCampo(7, 'doc-9', 12)).resolves.toBe(false)
  })

  it('documento que já não existe (a página navegou) devolve false sem lançar', async () => {
    executar.mockRejectedValue(
      new Error('No document with id doc-9 in tab with id 7'),
    )
    await expect(mostrarCampo(7, 'doc-9', 12)).resolves.toBe(false)
  })
})

describe('inserirNoCampo: avisos de falha', () => {
  const RECUSA_DO_CHROME =
    'Cannot access contents of url "http://outro.local/quadro". Extension manifest must request permission to access this host.'

  // frames recusados lançam como o Chrome; a chamada do Inserir (args [pessoa, kind]) devolve `resultado`.
  function simularInsercao({
    resultado,
    recusados = [],
  }: {
    resultado?: unknown
    recusados?: number[]
  }) {
    executar.mockImplementation(async (injecao) => {
      const frames = (injecao.target.frameIds as number[] | undefined) ?? []
      if (frames.some((frame) => recusados.includes(frame)))
        throw new Error(RECUSA_DO_CHROME)
      const resposta = injecao.args?.length === 2 ? resultado : undefined
      return [{ documentId: 'doc', frameId: frames[0], result: resposta }]
    })
  }

  const injecoes = () =>
    executar.mock.calls.map(([i]) => i).filter((i) => i.files)
  const avisos = () =>
    executar.mock.calls
      .map(([i]) => i)
      .filter((i) => !i.files && i.args?.length === 1)

  it('campo que aceitou o valor: nenhum aviso', async () => {
    simularInsercao({ resultado: { ok: true } })
    await inserirNoCampo(7, 0, 'cpf')
    expect(avisos()).toEqual([])
  })

  it('sem campo em foco no topo: avisa no frame 0, sem injetar de novo', async () => {
    simularInsercao({ resultado: { ok: false, motivo: 'sem-foco' } })
    await inserirNoCampo(7, 0, 'cpf')
    expect(injecoes().map((i) => i.target)).toEqual([
      { tabId: 7, frameIds: [0] },
    ])
    expect(avisos()).toEqual([
      expect.objectContaining({
        target: { tabId: 7, frameIds: [0] },
        args: [
          {
            titulo: 'Não deu para inserir aqui: nenhum campo em foco',
            erro: true,
          },
        ],
      }),
    ])
  })

  it('campo de um iframe da mesma origem recusou o valor: injeta no frame 0 e avisa lá', async () => {
    simularInsercao({ resultado: { ok: false, motivo: 'recusado' } })
    await inserirNoCampo(7, 3, 'senha')
    expect(injecoes().map((i) => i.target)).toEqual([
      { tabId: 7, frameIds: [3] },
      { tabId: 7, frameIds: [0] },
    ])
    expect(avisos()[0]).toMatchObject({
      target: { tabId: 7, frameIds: [0] },
      args: [
        {
          titulo: 'Não deu para inserir aqui: o campo recusou o valor',
          erro: true,
        },
      ],
    })
  })

  it('iframe de outro domínio: o Chrome recusa o frame, e o aviso sai no topo', async () => {
    simularInsercao({ recusados: [3] })
    await inserirNoCampo(7, 3, 'cpf')
    expect(avisos()[0]).toMatchObject({
      target: { tabId: 7, frameIds: [0] },
      args: [
        {
          titulo: 'Não deu para inserir aqui: iframe de outro domínio',
          erro: true,
        },
      ],
    })
  })

  it('página proibida (o topo também recusa): não avisa nada e não lança', async () => {
    simularInsercao({ recusados: [0, 3] })
    await expect(inserirNoCampo(7, 3, 'cpf')).resolves.toBeUndefined()
    await expect(inserirNoCampo(7, 0, 'cpf')).resolves.toBeUndefined()
    expect(avisos()).toEqual([])
  })

  it('erro que não é recusa do Chrome sobe, como antes', async () => {
    executar.mockRejectedValue(new Error('No tab with id: 7.'))
    await expect(inserirNoCampo(7, 0, 'cpf')).rejects.toThrow(
      'No tab with id: 7.',
    )
  })
})
