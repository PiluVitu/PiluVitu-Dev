import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { caminhoDoModo } from '@/lib/rotas-publicas'
import { DocumentoPdfProvider, useDocumentoPdf } from './documento-pdf'
import { MesclarPdf } from './mesclar'
import { criarMotorFalso } from './motor-falso'

// O motor real usa import.meta (Worker), que o Jest não compila; aqui ele sempre vem injetado.
jest.mock('./novo-worker', () => ({ novoWorkerDePdf: jest.fn() }))

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

let documentoDoEditor: File | null = null
const ver = (arquivo: File | null) => {
  documentoDoEditor = arquivo
}

function Espiao() {
  const { arquivo } = useDocumentoPdf()
  useEffect(() => ver(arquivo))
  return null
}

let container: HTMLDivElement
let root: Root

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  window.matchMedia = (() => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  URL.createObjectURL = jest.fn(() => 'blob:pdf-mesclado')
  URL.revokeObjectURL = jest.fn()
})

beforeEach(() => {
  mockPush.mockClear()
  documentoDoEditor = null
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function montar(motor = criarMotorFalso()) {
  act(() =>
    root.render(
      <DocumentoPdfProvider>
        <MesclarPdf motor={motor} />
        <Espiao />
      </DocumentoPdfProvider>,
    ),
  )
  return motor
}

const q = <T extends Element = HTMLElement>(testId: string) =>
  container.querySelector<T & Element>(`[data-testid="${testId}"]`)
const todos = (testId: string) => [
  ...container.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`),
]
const nomes = () => todos('mesclar-pdf-nome-do-item').map((n) => n.textContent)
const anuncio = () => q('mesclar-pdf-anuncio')!.textContent!.trim()
const mesclarBotao = () => q<HTMLButtonElement>('mesclar-pdf-mesclar')!

function pdf(nome: string, tamanho = 10) {
  return new File([new Uint8Array(tamanho)], nome, { type: 'application/pdf' })
}

function lista(arquivos: File[]): FileList {
  return Object.assign([...arquivos], {
    item: (i: number) => arquivos[i] ?? null,
  }) as unknown as FileList
}

async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

async function escolher(...arquivos: File[]) {
  const input = q<HTMLInputElement>('pdf-input')!
  Object.defineProperty(input, 'files', {
    value: lista(arquivos),
    configurable: true,
  })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await esperar()
}

function botaoDo(nome: string, acao: 'Subir' | 'Descer' | 'Remover') {
  return container.querySelector<HTMLButtonElement>(
    `button[aria-label="${acao} ${nome}"]`,
  )!
}

async function clicar(botao: HTMLElement) {
  await act(async () => {
    botao.click()
  })
}

function digitar(input: HTMLInputElement, valor: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

it('diz na tela que nada sai do aparelho e qual é o limite', () => {
  montar()
  expect(container.textContent).toContain('Seus arquivos não saem do aparelho')
  expect(container.textContent).toContain('Nenhum PDF é enviado')
  expect(container.textContent).toContain(
    'Até 100 MB somando todos os arquivos',
  )
})

it('lista cada PDF escolhido com nome, páginas e tamanho, e resume a lista', async () => {
  montar()

  await escolher(pdf('a-2p.pdf', 1500), pdf('b-3p.pdf', 500))

  expect(nomes()).toEqual(['a-2p.pdf', 'b-3p.pdf'])
  const linhas = todos('mesclar-pdf-item').map((l) => l.textContent)
  expect(linhas[0]).toContain('2 páginas · 1,5 kB')
  expect(linhas[1]).toContain('3 páginas · 500 bytes')
  expect(q('mesclar-pdf-resumo')!.textContent).toBe(
    '2 arquivos · 5 páginas · 2 kB',
  )
  expect(container.querySelector('ol')).not.toBeNull()
})

it('Mesclar só habilita com 2 PDFs lidos, e a dica ligada ao botão diz por quê', async () => {
  montar()
  const dica = () =>
    document.getElementById(mesclarBotao().getAttribute('aria-describedby')!)

  expect(mesclarBotao().disabled).toBe(true)
  expect(dica()!.textContent).toBe('Adicione pelo menos 2 PDFs para mesclar.')

  await escolher(pdf('a.pdf'))
  expect(mesclarBotao().disabled).toBe(true)

  await escolher(pdf('b.pdf'))
  expect(mesclarBotao().disabled).toBe(false)
  expect(mesclarBotao().hasAttribute('aria-describedby')).toBe(false)
})

it('PDF com senha fica na lista com o erro escrito, é anunciado e trava o Mesclar', async () => {
  montar()

  await escolher(pdf('a.pdf'), pdf('contrato-senha.pdf'))

  expect(q('mesclar-pdf-erro-do-item')!.textContent).toMatch(
    /protegido por senha.*Tire a proteção/,
  )
  expect(anuncio()).toMatch(/^contrato-senha\.pdf: Está protegido/)
  expect(mesclarBotao().disabled).toBe(true)
  expect(container.textContent).toContain(
    'Remova os arquivos com erro para mesclar.',
  )

  await clicar(botaoDo('contrato-senha.pdf', 'Remover'))
  expect(mesclarBotao().disabled).toBe(true)
  await escolher(pdf('c.pdf'))
  expect(mesclarBotao().disabled).toBe(false)
})

it('arquivo que não é PDF e PDF corrompido também dizem o que fazer', async () => {
  montar()

  await escolher(new File(['oi'], 'notas.docx'), pdf('quebrado.pdf'))

  expect(todos('mesclar-pdf-erro-do-item').map((e) => e.textContent)).toEqual([
    'Não é um PDF. Escolha um arquivo .pdf.',
    'Está corrompido ou incompleto. Baixe o arquivo de novo e tente outra vez.',
  ])
})

it('arrastar sobre a zona muda o texto e soltar adiciona os arquivos', async () => {
  montar()
  const zona = q('pdf-zona')!
  const evento = (tipo: string, arquivos: File[] = []) => {
    const e = new Event(tipo, { bubbles: true, cancelable: true })
    Object.defineProperty(e, 'dataTransfer', {
      value: { types: ['Files'], files: lista(arquivos), dropEffect: 'none' },
    })
    return e
  }

  act(() => {
    zona.dispatchEvent(evento('dragenter'))
  })
  expect(zona.dataset.sobre).toBe('true')
  expect(zona.textContent).toContain('Solte para adicionar')

  await act(async () => {
    zona.dispatchEvent(evento('drop', [pdf('x.pdf'), pdf('y.pdf')]))
  })
  await esperar()

  expect(zona.dataset.sobre).toBeUndefined()
  expect(nomes()).toEqual(['x.pdf', 'y.pdf'])
})

it('o que passaria de 100 MB não entra, e o aviso diz o tamanho e o que fazer', async () => {
  const motor = montar()
  const grande = pdf('scan.pdf')
  Object.defineProperty(grande, 'size', { value: 150_000_000 })

  await escolher(pdf('a.pdf'), grande)

  expect(nomes()).toEqual(['a.pdf'])
  expect(motor.analisadas).toEqual(['a.pdf'])
  const aviso = q('mesclar-pdf-avisos')!
  expect(aviso.getAttribute('role')).toBe('alert')
  expect(aviso.textContent).toBe(
    'scan.pdf (150 MB) não entrou: passaria de 100 MB no total. Remova algum arquivo ou escolha um menor.',
  )
})

it('Subir e Descer mudam a ordem, anunciam a posição e o foco acompanha o arquivo', async () => {
  montar()
  await escolher(pdf('a.pdf'), pdf('b.pdf'), pdf('c.pdf'))

  await clicar(botaoDo('c.pdf', 'Subir'))

  expect(nomes()).toEqual(['a.pdf', 'c.pdf', 'b.pdf'])
  expect(anuncio()).toBe('c.pdf agora está na posição 2 de 3.')
  expect(document.activeElement).toBe(botaoDo('c.pdf', 'Subir'))

  await clicar(botaoDo('a.pdf', 'Descer'))
  expect(nomes()).toEqual(['c.pdf', 'a.pdf', 'b.pdf'])
  expect(document.activeElement).toBe(botaoDo('a.pdf', 'Descer'))
})

it('chegando na ponta, o foco passa para o botão do outro sentido', async () => {
  montar()
  await escolher(pdf('a.pdf'), pdf('b.pdf'))

  await clicar(botaoDo('b.pdf', 'Subir'))

  expect(nomes()).toEqual(['b.pdf', 'a.pdf'])
  expect(botaoDo('b.pdf', 'Subir').disabled).toBe(true)
  expect(document.activeElement).toBe(botaoDo('b.pdf', 'Descer'))
})

it('Remover leva o foco ao vizinho e, sem vizinho, ao Escolher PDFs', async () => {
  montar()
  await escolher(pdf('a.pdf'), pdf('b.pdf'))

  await clicar(botaoDo('a.pdf', 'Remover'))
  expect(nomes()).toEqual(['b.pdf'])
  expect(anuncio()).toBe('a.pdf removido.')
  expect(document.activeElement).toBe(botaoDo('b.pdf', 'Remover'))

  await clicar(botaoDo('b.pdf', 'Remover'))
  expect(container.querySelector('ol')).toBeNull()
  expect(document.activeElement).toBe(q('pdf-escolher'))
})

it('Limpar lista esvazia, anuncia e devolve o foco ao Escolher PDFs', async () => {
  montar()
  await escolher(pdf('a.pdf'), pdf('b.pdf'))

  await clicar(q('mesclar-pdf-limpar')!)

  expect(nomes()).toEqual([])
  expect(anuncio()).toBe('Lista limpa.')
  expect(document.activeElement).toBe(q('pdf-escolher'))
})

it('Mesclar manda os arquivos na ordem da tela e oferece o download com o nome escolhido', async () => {
  const motor = montar()
  await escolher(pdf('a-2p.pdf'), pdf('b-3p.pdf'))
  await clicar(botaoDo('b-3p.pdf', 'Subir'))
  digitar(q<HTMLInputElement>('mesclar-pdf-nome')!, 'contrato/final')

  await clicar(mesclarBotao())
  await esperar()

  expect(motor.mescladas).toEqual([['b-3p.pdf', 'a-2p.pdf']])
  const baixar = q<HTMLAnchorElement>('mesclar-pdf-baixar')!
  expect(baixar.getAttribute('href')).toBe('blob:pdf-mesclado')
  expect(baixar.getAttribute('download')).toBe('contrato final.pdf')
  expect(baixar.textContent).toBe('Baixar contrato final.pdf')
  expect(q('mesclar-pdf-resultado')!.textContent).toContain('5 páginas')
  expect(anuncio()).toMatch(/^PDF pronto: 5 páginas, 8 bytes\.$/)
  expect(document.activeElement).toBe(baixar)
})

it('pronto o PDF, Organizar as páginas leva o resultado, com o nome final, para o modo organizar', async () => {
  montar()
  await escolher(pdf('a-2p.pdf'), pdf('b-3p.pdf'))
  digitar(q<HTMLInputElement>('mesclar-pdf-nome')!, 'contrato')
  await clicar(mesclarBotao())
  await esperar()
  expect(documentoDoEditor).toBeNull()

  const organizar = q<HTMLButtonElement>('mesclar-pdf-organizar')!
  expect(organizar.tagName).toBe('BUTTON')
  expect(organizar.textContent).toBe('Organizar as páginas deste PDF')
  await clicar(organizar)

  expect(documentoDoEditor).toBeInstanceOf(File)
  expect(documentoDoEditor!.name).toBe('contrato.pdf')
  expect(documentoDoEditor!.type).toBe('application/pdf')
  expect(documentoDoEditor!.size).toBe(8)
  expect(mockPush).toHaveBeenCalledWith(caminhoDoModo('pdf', 'organizar'))
})

it('antes de mesclar não há o que organizar', async () => {
  montar()
  await escolher(pdf('a.pdf'), pdf('b.pdf'))

  expect(q('mesclar-pdf-organizar')).toBeNull()
})

it('o nome vazio vira mesclado.pdf', async () => {
  montar()
  await escolher(pdf('a.pdf'), pdf('b.pdf'))
  digitar(q<HTMLInputElement>('mesclar-pdf-nome')!, '   ')

  await clicar(mesclarBotao())
  await esperar()

  expect(q('mesclar-pdf-baixar')!.getAttribute('download')).toBe('mesclado.pdf')
})

it('mexer na lista depois de mesclar descarta o PDF pronto e libera a URL', async () => {
  montar()
  await escolher(pdf('a.pdf'), pdf('b.pdf'))
  await clicar(mesclarBotao())
  await esperar()
  expect(q('mesclar-pdf-baixar')).not.toBeNull()

  await clicar(botaoDo('b.pdf', 'Subir'))

  expect(q('mesclar-pdf-baixar')).toBeNull()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:pdf-mesclado')
})

it('falha num arquivo durante a mesclagem: alerta com o nome e o motivo', async () => {
  montar(criarMotorFalso({ mesclagem: { motivo: 'corrompido', indice: 1 } }))
  await escolher(pdf('a.pdf'), pdf('b.pdf'))

  await clicar(mesclarBotao())
  await esperar()

  const falha = q('mesclar-pdf-falha')!
  expect(falha.getAttribute('role')).toBe('alert')
  expect(falha.textContent).toBe(
    'Não deu para mesclar: b.pdf. Está corrompido ou incompleto. Baixe o arquivo de novo e tente outra vez.',
  )
})

it('falha sem arquivo culpado (memória, Worker) explica e sugere o que tentar', async () => {
  montar(criarMotorFalso({ mesclagem: { motivo: 'inesperado' } }))
  await escolher(pdf('a.pdf'), pdf('b.pdf'))

  await clicar(mesclarBotao())
  await esperar()

  expect(q('mesclar-pdf-falha')!.textContent).toMatch(
    /talvez por falta de memória\. Tente com menos arquivos/,
  )
})

it('ao começar a mesclagem o foco vai para o Cancelar, sem cair no body', async () => {
  montar(criarMotorFalso({ mesclagem: 'nunca' }))
  await escolher(pdf('a.pdf'), pdf('b.pdf'))
  mesclarBotao().focus()

  await clicar(mesclarBotao())

  expect(document.activeElement).toBe(q('mesclar-pdf-cancelar'))
})

it('se a mesclagem falha, o foco volta ao Mesclar, com o alerta logo depois', async () => {
  montar(criarMotorFalso({ mesclagem: { motivo: 'corrompido', indice: 0 } }))
  await escolher(pdf('a.pdf'), pdf('b.pdf'))

  await clicar(mesclarBotao())
  await esperar()

  expect(q('mesclar-pdf-falha')).not.toBeNull()
  expect(document.activeElement).toBe(mesclarBotao())
})

it('arquivo que o navegador não conseguiu ler não é acusado de corrompido', async () => {
  montar()

  await escolher(pdf('a.pdf'), pdf('enorme-pesado.pdf'))

  const erro = q('mesclar-pdf-erro-do-item')!.textContent!
  expect(erro).toMatch(/navegador não conseguiu ler/)
  expect(erro).not.toMatch(/corrompido/)
})

it('durante a mesclagem: barra de progresso com valor, lista travada e Cancelar devolve o foco', async () => {
  montar(criarMotorFalso({ mesclagem: 'nunca' }))
  await escolher(pdf('a.pdf'), pdf('b.pdf'))

  await clicar(mesclarBotao())
  await esperar()

  const barra = container.querySelector('[role="progressbar"]')!
  expect(barra.getAttribute('aria-label')).toBe('Progresso da mesclagem')
  expect(barra.getAttribute('aria-valuenow')).toBe('45')
  expect(q('mesclar-pdf-andamento')!.textContent).toContain(
    'Lendo 2 de 2: b.pdf',
  )
  expect(botaoDo('a.pdf', 'Remover').disabled).toBe(true)
  expect(q<HTMLButtonElement>('pdf-escolher')!.disabled).toBe(true)
  expect(mesclarBotao()).toBeNull()

  await clicar(q('mesclar-pdf-cancelar')!)

  expect(q('mesclar-pdf-andamento')).toBeNull()
  expect(anuncio()).toBe('Mesclagem cancelada.')
  expect(document.activeElement).toBe(mesclarBotao())
  expect(nomes()).toEqual(['a.pdf', 'b.pdf'])
})

it('encerra o motor ao sair da página', () => {
  const motor = montar()
  act(() => root.unmount())
  root = createRoot(container)
  expect(motor.encerrado).toBe(true)
})

// O pdf-lib só pode chegar pelo Worker: um import de '@piluvitu/tools/pdf' na UI o põe no bundle da página.
it('só o Worker importa @piluvitu/tools/pdf', () => {
  const pasta = __dirname
  const fontes = readdirSync(pasta).filter(
    (f) => /\.tsx?$/.test(f) && !/\.test\.|\.stories\.|\.worker\./.test(f),
  )
  expect(fontes.length).toBeGreaterThan(4)
  for (const fonte of fontes) {
    const codigo = readFileSync(join(pasta, fonte), 'utf8')
    expect([fonte, /from '@piluvitu\/tools\/pdf'/.test(codigo)]).toEqual([
      fonte,
      false,
    ])
  }
})
