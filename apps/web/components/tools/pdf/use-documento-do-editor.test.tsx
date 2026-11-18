import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  TETO_DE_BYTES_COM_MINIATURAS,
  TETO_DE_PAGINAS,
} from '@piluvitu/tools/pdf-regras'
import type { DocumentoDoEditor } from './documento-do-editor'
import { criarMotorFalso } from './motor-falso'
import { criarRenderizadorFalso } from './renderizador-falso'
import { useDocumentoDoEditor } from './use-documento-do-editor'

jest.mock('./novo-worker-pdfjs', () => ({ novoWorkerDoPdfjs: jest.fn() }))

type Retorno = ReturnType<typeof useDocumentoDoEditor>

let container: HTMLDivElement
let root: Root
let ultimo: Retorno
let motor: ReturnType<typeof criarMotorFalso>
let renderizador: ReturnType<typeof criarRenderizadorFalso>
let abertos: { documento: DocumentoDoEditor; nome: string }[]
let recusados: number
let brancas: number

function Sonda({ arquivo }: { arquivo: File | null }) {
  const retorno = useDocumentoDoEditor(arquivo, {
    motor: () => motor,
    renderizador: () => renderizador,
    aoAbrir: (documento, doArquivo) =>
      abertos.push({ documento, nome: doArquivo.name }),
    aoRecusar: () => {
      recusados += 1
    },
    brancas: () => brancas,
  })
  useEffect(() => {
    ultimo = retorno
  })
  return null
}

function pdf(nome: string, bytes?: number): File {
  const arquivo = new File(['%PDF-1.7'], nome, { type: 'application/pdf' })
  if (bytes !== undefined)
    Object.defineProperty(arquivo, 'size', { value: bytes })
  return arquivo
}

async function esperarAte(condicao: () => boolean) {
  for (let vez = 0; !condicao(); vez++) {
    if (vez > 200) throw new Error('a condição não chegou no prazo')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5))
    })
  }
}

async function abrir(arquivo: File) {
  act(() => root.render(<Sonda arquivo={arquivo} />))
  await esperarAte(() => ultimo.atual !== null)
}

async function adicionar(arquivo: File) {
  let resultado!: Awaited<ReturnType<Retorno['adicionar']>>
  await act(async () => {
    resultado = await ultimo.adicionar(arquivo)
  })
  return resultado
}

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  motor = criarMotorFalso()
  renderizador = criarRenderizadorFalso()
  abertos = []
  recusados = 0
  brancas = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('o primeiro arquivo', () => {
  it('abre como o documento da sessão, com um arquivo, e avisa quem usa', async () => {
    await abrir(pdf('contrato-assinado-3p.pdf'))

    const { documento, atual, avisos } = ultimo
    expect(atual?.ok).toBe(true)
    expect(documento?.arquivos.map((a) => a?.paginas)).toEqual([3])
    expect(avisos).toEqual(['assinatura_digital'])
    expect(abertos).toEqual([{ documento, nome: 'contrato-assinado-3p.pdf' }])
    expect(renderizador.workers).toBe(1)
  })

  it('acima do teto de bytes nem é lido', async () => {
    act(() =>
      root.render(
        <Sonda
          arquivo={pdf('scan-3p.pdf', TETO_DE_BYTES_COM_MINIATURAS + 1)}
        />,
      ),
    )
    await act(async () => {})

    expect(ultimo.grandeDemais).toBe(true)
    expect(motor.analisadas).toEqual([])
    expect(renderizador.abertos).toEqual([])
  })

  it('com páginas demais: recusado, e o pdf.js nem abre', async () => {
    await abrir(pdf('livro-600p.pdf'))

    expect(ultimo.atual).toMatchObject({
      ok: false,
      recusa: { paginasDemais: 600 },
    })
    expect(ultimo.documento).toBeNull()
    expect(renderizador.abertos).toEqual([])
    expect(recusados).toBe(1)
  })

  it('trocar o arquivo fecha a sessão anterior inteira, e desmontar fecha a atual', async () => {
    await abrir(pdf('a-2p.pdf'))
    await adicionar(pdf('b-1p.pdf'))

    await abrir(pdf('c-3p.pdf'))
    await esperarAte(() => ultimo.atual?.arquivo.name === 'c-3p.pdf')

    expect(renderizador.fechados).toBe(2)
    expect(ultimo.documento?.arquivos).toHaveLength(1)
    expect(ultimo.documento?.sessao).not.toBe(abertos[0].documento.sessao)

    act(() => root.unmount())
    expect(renderizador.fechados).toBe(3)
    expect(renderizador.workersVivos).toBe(0)
    root = createRoot(container)
  })

  // Era do organizar.test, que saiu no PR 6 (achado da revisão): o documento atrasado ficava aberto no
  // pdf.js, com a cópia do arquivo, sem nunca aparecer.
  it('PDF que termina de abrir depois de a pessoa trocar de arquivo é fechado sem aparecer', async () => {
    motor.prenderAnalises()
    act(() => root.render(<Sonda arquivo={pdf('lento-9p.pdf')} />))
    await esperarAte(() => motor.analisadas.includes('lento-9p.pdf'))

    act(() => root.render(<Sonda arquivo={pdf('b-2p.pdf')} />))
    await esperarAte(() => motor.analisadas.includes('b-2p.pdf'))
    motor.soltarAnalises()
    await esperarAte(
      () =>
        renderizador.abertos.length === 2 &&
        ultimo.atual?.arquivo.name === 'b-2p.pdf',
    )
    await act(async () => {})

    expect(renderizador.abertos).toEqual(['lento-9p.pdf', 'b-2p.pdf'])
    expect(renderizador.fechados).toBe(1)
    expect(abertos.map(({ nome }) => nome)).toEqual(['b-2p.pdf'])
    expect(ultimo.documento?.arquivos.map((a) => a?.arquivo.name)).toEqual([
      'b-2p.pdf',
    ])
  })
})

describe('adicionar outro PDF', () => {
  it('entra como o arquivo seguinte da sessão, no mesmo Worker do pdf.js, sem trocar a sessão', async () => {
    await abrir(pdf('a-3p.pdf'))
    const antes = ultimo.documento!

    const adicao = await adicionar(pdf('b-xfa-2p.pdf'))

    expect(adicao).toEqual({
      ok: true,
      arquivo: 1,
      documento: ultimo.documento,
    })
    expect(ultimo.documento!.sessao).toBe(antes.sessao)
    expect(
      ultimo.documento!.arquivos.map((a) => [
        a?.arquivo.name,
        a?.paginas,
        a?.avisos,
      ]),
    ).toEqual([
      ['a-3p.pdf', 3, []],
      ['b-xfa-2p.pdf', 2, ['xfa_puro']],
    ])
    expect(renderizador.workers).toBe(1)
    expect(abertos).toHaveLength(1)
  })

  it('quem pede recebe o documento emendado na hora da emenda, antes de renderizar: a tela põe as páginas no mesmo lote', async () => {
    await abrir(pdf('a-3p.pdf'))
    const recebidos: { arquivo: number; jaNaTela: boolean }[] = []

    let emendado!: DocumentoDoEditor
    await act(async () => {
      await ultimo.adicionar(pdf('b-2p.pdf'), (documento, arquivo) => {
        emendado = documento
        recebidos.push({ arquivo, jaNaTela: ultimo.documento === documento })
      })
    })

    expect(recebidos).toEqual([{ arquivo: 1, jaNaTela: false }])
    expect(ultimo.documento).toBe(emendado)
  })

  it('a recusa não chama quem pediu', async () => {
    await abrir(pdf('a-3p.pdf'))
    const aoEntrar = jest.fn()

    await act(async () => {
      await ultimo.adicionar(pdf('b-senha.pdf'), aoEntrar)
    })

    expect(aoEntrar).not.toHaveBeenCalled()
  })

  it('acima dos bytes somados: recusado com o que ainda cabe, sem ler o novo', async () => {
    await abrir(pdf('a-3p.pdf', 40_000_000))

    const adicao = await adicionar(pdf('b-2p.pdf', 10_000_001))

    expect(adicao).toEqual({
      ok: false,
      recusa: {
        passou: 'bytes',
        bytes: 10_000_001,
        restam: {
          bytes: TETO_DE_BYTES_COM_MINIATURAS - 40_000_000,
          paginas: TETO_DE_PAGINAS - 3,
        },
      },
    })
    expect(motor.analisadas).toEqual(['a-3p.pdf'])
  })

  it('acima das páginas somadas: recusado pela contagem do pdf-lib, e o pdf.js nem abre o novo', async () => {
    await abrir(pdf('a-450p.pdf'))

    const adicao = await adicionar(pdf('b-51p.pdf'))

    expect(adicao).toMatchObject({
      ok: false,
      recusa: {
        passou: 'paginas',
        paginas: 51,
        restam: { paginas: 50 },
      },
    })
    expect(renderizador.abertos).toEqual(['a-450p.pdf'])
  })

  // PR 5: as páginas em branco que existem (na lista ou no desfazer) contam no teto somado.
  it('as páginas em branco contam no teto de páginas, na hora da contagem', async () => {
    await abrir(pdf('a-450p.pdf'))
    brancas = 3

    const recusada = await adicionar(pdf('b-48p.pdf'))
    const aceita = await adicionar(pdf('c-47p.pdf'))

    expect(recusada).toMatchObject({
      ok: false,
      recusa: { passou: 'paginas', paginas: 48, restam: { paginas: 47 } },
    })
    expect(aceita).toMatchObject({ ok: true, arquivo: 1 })
  })

  it.each([
    ['com senha', 'b-senha.pdf', 'protegido'],
    ['corrompido', 'b-quebrado.pdf', 'corrompido'],
    ['que não é PDF', 'b.png', 'nao_e_pdf'],
  ])(
    'o %s é recusado sem mexer no documento aberto',
    async (_, nome, motivo) => {
      await abrir(pdf('a-3p.pdf'))
      const antes = ultimo.documento

      const adicao = await adicionar(pdf(nome))

      expect(adicao).toEqual({ ok: false, recusa: { motivo } })
      expect(ultimo.documento).toBe(antes)
      expect(renderizador.fechados).toBe(0)
    },
  )

  it('com a contagem do pdf.js diferente da do pdf-lib: recusado como corrompido, e só ele fecha', async () => {
    await abrir(pdf('a-3p.pdf'))
    const antes = ultimo.documento
    const abrirDeVerdade = renderizador.abrir
    renderizador.abrir = async (arquivo) => ({
      ...(await abrirDeVerdade(arquivo)),
      paginas: 9,
    })

    const adicao = await adicionar(pdf('b-2p.pdf'))

    expect(adicao).toEqual({ ok: false, recusa: { motivo: 'corrompido' } })
    expect(ultimo.documento).toBe(antes)
  })

  it('um por vez (D5): outro pedido enquanto o primeiro abre é ignorado', async () => {
    motor = criarMotorFalso({ atraso: 30 })
    await abrir(pdf('a-3p.pdf'))

    let primeira!: Promise<unknown>
    let segunda!: unknown
    await act(async () => {
      primeira = ultimo.adicionar(pdf('b-2p.pdf'))
      segunda = await ultimo.adicionar(pdf('c-1p.pdf'))
    })
    expect(ultimo.adicionando?.name).toBe('b-2p.pdf')
    await act(async () => {
      await primeira
    })

    expect(segunda).toBeNull()
    expect(ultimo.adicionando).toBeNull()
    expect(ultimo.documento?.arquivos).toHaveLength(2)
    expect(motor.analisadas).toEqual(['a-3p.pdf', 'b-2p.pdf'])
  })

  it('trocar o arquivo enquanto o novo abre: ele fecha e não entra na sessão nova', async () => {
    renderizador = criarRenderizadorFalso({ atraso: 30 })
    await abrir(pdf('a-3p.pdf'))

    let adicao!: Promise<unknown>
    act(() => {
      adicao = ultimo.adicionar(pdf('b-2p.pdf'))
    })
    await abrir(pdf('c-1p.pdf'))
    await act(async () => {
      await adicao
    })
    await esperarAte(() => ultimo.atual?.arquivo.name === 'c-1p.pdf')

    await expect(adicao).resolves.toBeNull()
    expect(ultimo.documento?.arquivos.map((a) => a?.arquivo.name)).toEqual([
      'c-1p.pdf',
    ])
    expect(renderizador.fechados).toBe(2)
  })
})

describe('fechar o arquivo inalcançável', () => {
  it('fecha o documento do pdf.js dele, abre espaço no teto e deixa o Worker para os outros', async () => {
    await abrir(pdf('a-3p.pdf', 30_000_000))
    await adicionar(pdf('b-2p.pdf', 15_000_000))

    act(() => ultimo.fecharInalcancaveis(new Set([0])))

    expect(renderizador.fechados).toBe(1)
    expect(renderizador.workersVivos).toBe(1)
    expect(
      ultimo.documento?.arquivos.map((a) => a?.arquivo.name ?? null),
    ).toEqual(['a-3p.pdf', null])
    expect((await adicionar(pdf('c-1p.pdf', 20_000_000)))?.ok).toBe(true)
  })

  it('nenhum alcançável (a tela ainda sem páginas) não fecha nada', async () => {
    await abrir(pdf('a-3p.pdf'))
    const antes = ultimo.documento

    act(() => ultimo.fecharInalcancaveis(new Set()))

    expect(ultimo.documento).toBe(antes)
    expect(renderizador.fechados).toBe(0)
  })
})
