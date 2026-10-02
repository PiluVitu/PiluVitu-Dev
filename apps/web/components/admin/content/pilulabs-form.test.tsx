import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PiluLabsEntry } from '@/lib/admin/content-schemas'
import { renderEstatico } from '@/lib/render-estatico'
import { PiluLabsForm } from './pilulabs-form'

const BOTAI: PiluLabsEntry = {
  slug: 'botai',
  order: 0,
  nome: 'Botaí',
  subtitulo: 'Gerador de dados fake para formulários (CPF, CNPJ, CEP)',
  descricao: 'Extensão que preenche formulários.',
  tipo: 'extensao',
  tags: ['QA'],
  logo: '/pilulabs/botai/icone-128.png',
  sigla: '',
  site: 'https://botai.pilutech.com.br',
  repo: '',
  chromeUrl: '',
  firefoxUrl: '',
  edgeUrl: '',
  operaUrl: '',
  destaque: true,
  data: '2026-10-01',
  listado: true,
  paginaPropria: true,
}

// O ImageField monta o seletor de mídia, que usa TanStack Query.
function formulario(initial?: PiluLabsEntry) {
  return renderEstatico(
    <QueryClientProvider client={new QueryClient()}>
      <PiluLabsForm initial={initial} onSubmit={() => {}} />
    </QueryClientProvider>,
  )
}

const switches = (raiz: HTMLElement) =>
  [...raiz.querySelectorAll('[role="switch"]')].map((s) => [
    s.getAttribute('aria-label'),
    s.getAttribute('aria-checked'),
  ])

describe('PiluLabsForm', () => {
  it('novo: os 4 tipos na ordem da vitrine, com web selecionado', () => {
    const raiz = formulario()
    expect(
      [...raiz.querySelectorAll('select option')].map((o) =>
        o.getAttribute('value'),
      ),
    ).toEqual(['extensao', 'mobile', 'web', 'cli'])
    expect(raiz.querySelector('option[selected]')?.getAttribute('value')).toBe(
      'web',
    )
  })

  it('novo: destaque, listado e página própria desligados', () => {
    expect(switches(formulario())).toEqual([
      ['Destaque na home', 'false'],
      ['Listado', 'false'],
      ['Página própria no site', 'false'],
    ])
  })

  it('editando: os valores vêm do item, e a data num input de data', () => {
    const raiz = formulario(BOTAI)
    expect(
      [...raiz.querySelectorAll('input:not([type])')].map((i) =>
        i.getAttribute('value'),
      ),
    ).toEqual(
      expect.arrayContaining([
        'Botaí',
        'botai',
        'https://botai.pilutech.com.br',
      ]),
    )
    expect(
      raiz.querySelector('input[type="date"]')?.getAttribute('value'),
    ).toBe('2026-10-01')
    expect(raiz.querySelector('option[selected]')?.getAttribute('value')).toBe(
      'extensao',
    )
    expect(switches(raiz)).toEqual([
      ['Destaque na home', 'true'],
      ['Listado', 'true'],
      ['Página própria no site', 'true'],
    ])
  })

  it('um campo por URL de loja, com o nome da loja', () => {
    const texto = formulario().textContent
    for (const loja of [
      'Chrome Web Store',
      'Firefox Add-ons',
      'Microsoft Edge Add-ons',
      'Opera add-ons',
    ])
      expect(texto).toContain(loja)
  })
})
