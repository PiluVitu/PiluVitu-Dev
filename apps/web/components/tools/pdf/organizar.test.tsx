import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DocumentoPdfProvider, useDocumentoPdf } from './documento-pdf'
import { OrganizarPdf } from './organizar'
import { criarRenderizadorFalso } from './renderizador-falso'

// O renderizador real carrega o pdf.js por import() e cria um Worker com import.meta; aqui ele vem injetado.
jest.mock('./novo-worker-pdfjs', () => ({ novoWorkerDoPdfjs: jest.fn() }))

let container: HTMLDivElement
let root: Root
let documentoAtual: File | null = null

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const ver = (arquivo: File | null) => {
  documentoAtual = arquivo
}

function Espiao() {
  const { arquivo } = useDocumentoPdf()
  useEffect(() => ver(arquivo))
  return null
}

function montar(
  renderizador = criarRenderizadorFalso(),
  arquivoInicial: File | null = null,
) {
  act(() =>
    root.render(
      <DocumentoPdfProvider arquivoInicial={arquivoInicial}>
        <OrganizarPdf renderizador={renderizador} />
        <Espiao />
      </DocumentoPdfProvider>,
    ),
  )
  return renderizador
}

const q = (testId: string) =>
  container.querySelector<HTMLElement>(`[data-testid="${testId}"]`)

const pdf = (nome: string) =>
  new File(['%PDF-1.7'], nome, { type: 'application/pdf' })

async function esperar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20))
  })
}

async function escolher(arquivo: File) {
  const input = q('pdf-input') as HTMLInputElement
  Object.defineProperty(input, 'files', {
    value: Object.assign([arquivo], { item: () => arquivo }),
    configurable: true,
  })
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await esperar()
}

it('sem documento: diz que nada sai do aparelho, pede um PDF só e ainda não abre o pdf.js', () => {
  const renderizador = montar()

  expect(container.textContent).toContain('Seus arquivos não saem do aparelho')
  expect(q('pdf-escolher')!.textContent).toBe('Escolher PDF')
  expect((q('pdf-input') as HTMLInputElement).multiple).toBe(false)
  expect(renderizador.abertos).toEqual([])
})

it('chegando do mesclar com o PDF no editor, abre esse PDF e mostra nome e páginas', async () => {
  const renderizador = montar(criarRenderizadorFalso(), pdf('mesclado-5p.pdf'))
  await esperar()

  expect(renderizador.abertos).toEqual(['mesclado-5p.pdf'])
  expect(q('organizar-pdf-documento')!.textContent).toBe(
    'mesclado-5p.pdf · 5 páginas',
  )
})

it('escolher um PDF guarda no editor (para os outros modos) e abre', async () => {
  const renderizador = montar()

  await escolher(pdf('contrato-3p.pdf'))

  expect(documentoAtual?.name).toBe('contrato-3p.pdf')
  expect(renderizador.abertos).toEqual(['contrato-3p.pdf'])
  expect(q('organizar-pdf-documento')!.textContent).toBe(
    'contrato-3p.pdf · 3 páginas',
  )
})

it('enquanto abre, anuncia; quando abre, anuncia o que abriu', async () => {
  montar(criarRenderizadorFalso({ atraso: 50 }), pdf('a-2p.pdf'))

  expect(q('organizar-pdf-anuncio')!.textContent).toBe('Abrindo a-2p.pdf…')
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80))
  })
  expect(q('organizar-pdf-anuncio')!.textContent).toBe('a-2p.pdf · 2 páginas')
})

it('PDF que não abre: alerta com o motivo e o que fazer', async () => {
  montar(criarRenderizadorFalso(), pdf('extrato-senha.pdf'))
  await esperar()

  const alerta = q('organizar-pdf-erro')!
  expect(alerta.getAttribute('role')).toBe('alert')
  expect(alerta.textContent).toBe(
    'Não deu para abrir extrato-senha.pdf. Está protegido por senha ou contra cópia. Tire a proteção no programa que criou o PDF e adicione de novo.',
  )
  expect(q('organizar-pdf-documento')).toBeNull()
})

it('trocar de PDF fecha o anterior, e sair da página fecha o aberto', async () => {
  const renderizador = montar(criarRenderizadorFalso(), pdf('a.pdf'))
  await esperar()

  await escolher(pdf('b-4p.pdf'))
  expect(renderizador.fechados).toBe(1)

  act(() => root.unmount())
  root = createRoot(container)
  expect(renderizador.fechados).toBe(2)
})

it('PDF que termina de abrir depois de a pessoa trocar de arquivo é fechado sem aparecer', async () => {
  const renderizador = montar(
    criarRenderizadorFalso({ atraso: 40 }),
    pdf('lento-9p.pdf'),
  )

  await escolher(pdf('b-2p.pdf'))
  await act(async () => {
    await new Promise((r) => setTimeout(r, 100))
  })

  expect(renderizador.fechados).toBe(1)
  expect(q('organizar-pdf-documento')!.textContent).toBe('b-2p.pdf · 2 páginas')
})
