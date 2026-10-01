import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Browser } from 'wxt/browser'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { pessoaItem } from '../../lib/armazenamento'
import { hojeISO, idadeEm } from '../../lib/hoje'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import { App } from './App'

let atalho = 'Alt+Shift+P'
let urlDaAba = 'http://localhost:3000/cadastro'

beforeEach(() => {
  atalho = 'Alt+Shift+P'
  urlDaAba = 'http://localhost:3000/cadastro'
  Object.assign(fakeBrowser.commands, {
    getAll: vi.fn(async () => [
      {
        name: 'preencher-pagina',
        shortcut: atalho,
        description: 'Preencher esta página',
      },
    ]),
  })
  vi.spyOn(fakeBrowser.tabs, 'query').mockImplementation(async () => [
    { id: 7, url: urlDaAba } as Browser.tabs.Tab,
  ])
})

afterEach(() => vi.restoreAllMocks())

const botaoPreencher = () =>
  screen.findByRole('button', { name: /Preencher esta página/ })

describe('App do popup', () => {
  it('sem pessoa mostra o 1a, e "Gerar pessoa" leva ao 1b', async () => {
    render(<App />)
    expect(
      await screen.findByRole('heading', {
        name: 'Ainda não há pessoa de teste',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('localhost:3000')).toBeInTheDocument()
    expect(screen.getByText('preenche sem abrir o popup')).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Gerar pessoa' }))
    const gerada = await vi.waitFor(async () => {
      const pessoa = await pessoaItem.getValue()
      if (!pessoa) throw new Error('ainda sem pessoa')
      return pessoa
    })
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: gerada.nome.completo,
      }),
    ).toBeInTheDocument()
  })

  it('com pessoa mostra o 1b com a idade de hoje e o rodapé com "alterar"', async () => {
    await pessoaItem.setValue(P)
    render(<App />)
    expect(
      await screen.findByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
    const idade = idadeEm(P.nascimento.iso, hojeISO())
    expect(
      screen.getByText(
        `${idade} anos · ${P.endereco.cidade}, ${P.endereco.uf}`,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('preenche sem abrir')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'alterar' })).toBeInTheDocument()
  })

  it('"Preencher esta página" manda a mensagem para a aba-alvo e o popup continua no 1b', async () => {
    const recebidas: unknown[] = []
    fakeBrowser.runtime.onMessage.addListener(
      (mensagem, _remetente, responder) => {
        recebidas.push(mensagem)
        responder(undefined)
        return true
      },
    )
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent.setup().click(await botaoPreencher())
    await vi.waitFor(() =>
      expect(recebidas).toEqual([{ tipo: 'preencher', tabId: 7 }]),
    )
    expect(
      screen.getByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
  })

  it('página proibida: pílula com o host e Preencher desabilitado', async () => {
    urlDaAba = 'chrome://settings'
    await pessoaItem.setValue(P)
    render(<App />)
    expect(await botaoPreencher()).toBeDisabled()
    expect(screen.getByText('chrome://settings')).toBeInTheDocument()
  })

  it('sem atalho, o rodapé vira "definir atalho", que abre a página de atalhos', async () => {
    atalho = ''
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    expect((await botaoPreencher()).querySelector('kbd')).toBeNull()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'definir atalho' }))
    expect(abrir).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' })
  })

  it('"alterar" abre a página de atalhos', async () => {
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'alterar' }))
    expect(abrir).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' })
  })

  it('"Caixa de entrada" abre a caixa pública da pessoa', async () => {
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Caixa de entrada' }))
    expect(abrir).toHaveBeenCalledWith({ url: P.email.caixaUrl })
  })

  it('"Nova pessoa" troca a pessoa guardada', async () => {
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Nova pessoa' }))
    await vi.waitFor(async () =>
      expect(await pessoaItem.getValue()).not.toEqual(P),
    )
  })

  it('copiar usa a área de transferência', async () => {
    const user = userEvent.setup()
    const escrever = vi.spyOn(navigator.clipboard, 'writeText')
    await pessoaItem.setValue(P)
    render(<App />)
    const pessoais = within(
      await screen.findByRole('region', { name: 'Pessoais' }),
    )
    await user.click(pessoais.getByRole('button', { name: 'Copiar CPF' }))
    expect(escrever).toHaveBeenCalledWith(P.cpf)
  })
})
