import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  DocumentoPdfProvider,
  useDocumentoPdf,
  type DocumentoPdf,
} from './documento-pdf'

let container: HTMLDivElement
let root: Root

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
  jest.restoreAllMocks()
})

// Dois "modos" lendo o mesmo provider, como /tools/pdf/mesclar e /tools/pdf/organizar sob o layout.
const vistos: Record<string, DocumentoPdf> = {}
const ver = (nome: string, documento: DocumentoPdf) => {
  vistos[nome] = documento
}

function Modo({ nome }: { nome: string }) {
  const documento = useDocumentoPdf()
  useEffect(() => ver(nome, documento))
  return null
}

function montarEditor(modos = ['mesclar', 'organizar']) {
  act(() =>
    root.render(
      <DocumentoPdfProvider>
        {modos.map((nome) => (
          <Modo key={nome} nome={nome} />
        ))}
      </DocumentoPdfProvider>,
    ),
  )
}

const pdf = (nome: string) =>
  new File(['%PDF-1.7'], nome, { type: 'application/pdf' })

it('começa sem arquivo', () => {
  montarEditor()
  expect(vistos.mesclar.arquivo).toBeNull()
})

it('o arquivo guardado num modo é o mesmo que o outro modo lê', () => {
  montarEditor()
  const arquivo = pdf('mesclado.pdf')

  act(() => vistos.mesclar.guardar(arquivo))

  expect(vistos.organizar.arquivo).toBe(arquivo)
})

it('trocar de modo dentro do editor mantém o arquivo', () => {
  montarEditor(['mesclar'])
  const arquivo = pdf('contrato.pdf')
  act(() => vistos.mesclar.guardar(arquivo))

  montarEditor(['organizar'])

  expect(vistos.organizar.arquivo).toBe(arquivo)
})

it('soltar esquece o arquivo', () => {
  montarEditor()
  act(() => vistos.mesclar.guardar(pdf('a.pdf')))

  act(() => vistos.organizar.soltar())

  expect(vistos.mesclar.arquivo).toBeNull()
})

it('sair do editor solta o arquivo: um provider novo começa vazio', () => {
  montarEditor()
  act(() => vistos.mesclar.guardar(pdf('a.pdf')))

  act(() => root.unmount())
  root = createRoot(container)
  montarEditor()

  expect(vistos.organizar.arquivo).toBeNull()
})

it('não grava nada no armazenamento do navegador', () => {
  const gravar = jest.spyOn(Storage.prototype, 'setItem')
  montarEditor()

  act(() => vistos.mesclar.guardar(pdf('a.pdf')))

  expect(gravar).not.toHaveBeenCalled()
})

it('fora do provider, o hook avisa em vez de devolver um documento vazio', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  expect(() => act(() => root.render(<Modo nome="solto" />))).toThrow(
    'useDocumentoPdf precisa do DocumentoPdfProvider',
  )
})
