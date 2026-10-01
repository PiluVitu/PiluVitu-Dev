import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Browser } from 'wxt/browser'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { pessoaItem } from '../../lib/armazenamento'
import { hojeISO, idadeEm } from '../../lib/hoje'
import type { RespostaPreencher } from '../../lib/mensagens'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import { LINHAS_DO_DESIGN, resumoDe } from '../../test/resumos'
import { App } from './App'

let atalho = 'Ctrl+Shift+Y'
let urlDaAba = 'http://localhost:3000/cadastro'

beforeEach(() => {
  atalho = 'Ctrl+Shift+Y'
  urlDaAba = 'http://localhost:3000/cadastro'
  Object.assign(fakeBrowser.commands, {
    getAll: vi.fn(async () => [
      {
        name: 'botai-preencher',
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

  it('sem resposta do background (erro inesperado), o Preencher deixa o popup no 1b', async () => {
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

function simularBackground(resposta: RespostaPreencher | undefined) {
  const recebidas: { tipo: string }[] = []
  fakeBrowser.runtime.onMessage.addListener(
    (mensagem, _remetente, responder) => {
      recebidas.push(mensagem as { tipo: string })
      responder(
        (mensagem as { tipo: string }).tipo === 'preencher' ? resposta : true,
      )
      return true
    },
  )
  return recebidas
}

const cabecalho = () => screen.getByRole('banner')
const temCadeado = () =>
  cabecalho().querySelector('svg[data-icon="lock"]') !== null

describe('App do popup: retorno do Preencher', () => {
  it('com campos preenchidos mostra o 1c com o caminho, a lista e o rodapé "preenche de novo"', async () => {
    simularBackground({ ok: true, resumo: resumoDe(12, LINHAS_DO_DESIGN) })
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent.setup().click(await botaoPreencher())
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: '12 de 14 campos preenchidos',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`/cadastro · com ${P.nome.completo}`),
    ).toBeInTheDocument()
    expect(screen.getByText('preenche de novo')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'alterar' })).toBeNull()
    expect(cabecalho().querySelector('.bg-ok')).not.toBeNull()
  })

  it('a mira do 1c pede ao background para mostrar aquele campo, naquele documento', async () => {
    const recebidas = simularBackground({
      ok: true,
      resumo: resumoDe(12, LINHAS_DO_DESIGN),
    })
    await pessoaItem.setValue(P)
    render(<App />)
    const user = userEvent.setup()
    await user.click(await botaoPreencher())
    await user.click(
      await screen.findByRole('button', {
        name: 'Mostrar na página: Código de indicação',
      }),
    )
    await vi.waitFor(() =>
      expect(recebidas).toContainEqual({
        tipo: 'mostrar',
        tabId: 7,
        documentId: 'doc-0',
        idx: 13,
      }),
    )
  })

  it('"Ver os dados" do 1c volta ao 1b, e "Caixa de entrada" abre a caixa da pessoa', async () => {
    simularBackground({ ok: true, resumo: resumoDe(12, LINHAS_DO_DESIGN) })
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    const user = userEvent.setup()
    await user.click(await botaoPreencher())
    await user.click(
      await screen.findByRole('button', { name: 'Caixa de entrada' }),
    )
    expect(abrir).toHaveBeenCalledWith({ url: P.email.caixaUrl })
    await user.click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
  })

  it('nenhum campo reconhecido: 1d com pílula warn; "Tentar de novo" preenche outra vez; o warn fica no 1b', async () => {
    const recebidas = simularBackground({
      ok: true,
      resumo: resumoDe(0, LINHAS_DO_DESIGN),
    })
    await pessoaItem.setValue(P)
    render(<App />)
    const user = userEvent.setup()
    await user.click(await botaoPreencher())
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Nenhum campo reconhecido nesta página',
      }),
    ).toBeInTheDocument()
    expect(cabecalho().querySelector('.bg-warn')).not.toBeNull()
    expect(screen.getByText('preenche sem abrir')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'alterar' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await vi.waitFor(() =>
      expect(recebidas.filter((m) => m.tipo === 'preencher')).toHaveLength(2),
    )
    await user.click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
    expect(cabecalho().querySelector('.bg-warn')).not.toBeNull()
  })

  it('página sem formulário (Y = 0): 1d "Nenhum formulário nesta página"', async () => {
    simularBackground({ ok: true, resumo: resumoDe(0) })
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent.setup().click(await botaoPreencher())
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Nenhum formulário nesta página',
      }),
    ).toBeInTheDocument()
    expect(cabecalho().querySelector('.bg-warn')).not.toBeNull()
  })

  it('Preencher recusado pelo Chrome: 1e sem rodapé; "Ver os dados" leva ao 1b com Preencher desabilitado e cadeado', async () => {
    simularBackground({ ok: false, motivo: 'proibida' })
    await pessoaItem.setValue(P)
    render(<App />)
    const user = userEvent.setup()
    await user.click(await botaoPreencher())
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'O Chrome não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).toBeNull()
    expect(temCadeado()).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Ver os dados' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
    expect(await botaoPreencher()).toBeDisabled()
    expect(temCadeado()).toBe(true)
  })

  it('Preencher em file: sem acesso vira o 1e de arquivo', async () => {
    simularBackground({ ok: false, motivo: 'arquivo-sem-acesso' })
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent.setup().click(await botaoPreencher())
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Falta liberar o acesso a arquivos',
      }),
    ).toBeInTheDocument()
  })

  it('aberto numa página proibida pela URL, vai direto ao 1e, sem rodapé e com cadeado', async () => {
    urlDaAba = 'chrome://settings'
    await pessoaItem.setValue(P)
    render(<App />)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'O Chrome não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(P.nome.completo)).toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).toBeNull()
    expect(temCadeado()).toBe(true)
  })

  it('1e sem pessoa: "Gerar pessoa" guarda uma e o cartão passa a mostrar o nome', async () => {
    urlDaAba = 'chrome://settings'
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Gerar pessoa' }))
    const gerada = await vi.waitFor(async () => {
      const pessoa = await pessoaItem.getValue()
      if (!pessoa) throw new Error('ainda sem pessoa')
      return pessoa
    })
    expect(await screen.findByText(gerada.nome.completo)).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'O Chrome não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
  })

  it('aberto num file: sem acesso liberado, mostra o 1e de arquivo', async () => {
    urlDaAba = 'file:///Users/eu/form.html'
    Object.assign(fakeBrowser.extension, {
      isAllowedFileSchemeAccess: vi.fn(async () => false),
    })
    await pessoaItem.setValue(P)
    render(<App />)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Falta liberar o acesso a arquivos',
      }),
    ).toBeInTheDocument()
    expect(within(cabecalho()).getByText('arquivo local')).toBeInTheDocument()
  })
})

describe('App do popup: crédito da PiluTech', () => {
  const chegarEm: [string, () => Promise<void>][] = [
    [
      '1a',
      async () => {
        render(<App />)
        await screen.findByRole('heading', {
          name: 'Ainda não há pessoa de teste',
        })
      },
    ],
    [
      '1b',
      async () => {
        await pessoaItem.setValue(P)
        render(<App />)
        await screen.findByRole('heading', {
          level: 1,
          name: P.nome.completo,
        })
      },
    ],
    [
      '1c',
      async () => {
        simularBackground({ ok: true, resumo: resumoDe(12, LINHAS_DO_DESIGN) })
        await pessoaItem.setValue(P)
        render(<App />)
        await userEvent.setup().click(await botaoPreencher())
        await screen.findByRole('heading', {
          level: 1,
          name: '12 de 14 campos preenchidos',
        })
      },
    ],
    [
      '1d',
      async () => {
        simularBackground({ ok: true, resumo: resumoDe(0, LINHAS_DO_DESIGN) })
        await pessoaItem.setValue(P)
        render(<App />)
        await userEvent.setup().click(await botaoPreencher())
        await screen.findByRole('heading', {
          level: 1,
          name: 'Nenhum campo reconhecido nesta página',
        })
      },
    ],
    [
      '1e',
      async () => {
        urlDaAba = 'chrome://settings'
        await pessoaItem.setValue(P)
        render(<App />)
        await screen.findByRole('heading', {
          level: 1,
          name: 'O Chrome não deixa extensões mexerem nesta página',
        })
      },
    ],
  ]

  it.each(chegarEm)(
    'no %s, "Powered by PiluTech" é o último botão do popup e abre pilutech.com.br numa aba nova',
    async (_estado, chegar) => {
      const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
      await chegar()
      const credito = screen.getByRole('button', {
        name: 'Powered by PiluTech (abre pilutech.com.br)',
      })
      expect(screen.getAllByRole('button').at(-1)).toBe(credito)
      await userEvent.setup().click(credito)
      expect(abrir).toHaveBeenCalledWith({ url: 'https://pilutech.com.br' })
    },
  )
})

describe('App do popup: por navegador', () => {
  // O App.test precisa do navigator real (o user-event pendura nele o clipboard):
  // o Edge entra só pela propriedade que o detector lê.
  const comMarcasDoEdge = () =>
    Object.defineProperty(navigator, 'userAgentData', {
      value: { brands: [{ brand: 'Microsoft Edge', version: '141' }] },
      configurable: true,
    })

  afterEach(() => {
    vi.unstubAllEnvs()
    Reflect.deleteProperty(navigator, 'userAgentData')
  })

  it('no Firefox, "alterar" abre a tela de atalhos do próprio Firefox, sem criar aba', async () => {
    vi.stubEnv('FIREFOX', 'true')
    const abrirAtalhos = vi.fn(async () => undefined)
    Object.assign(fakeBrowser.commands, { openShortcutSettings: abrirAtalhos })
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'alterar' }))
    expect(abrirAtalhos).toHaveBeenCalledTimes(1)
    expect(abrir).not.toHaveBeenCalled()
  })

  it('no Firefox, o 1e fala do Firefox', async () => {
    vi.stubEnv('FIREFOX', 'true')
    urlDaAba = 'about:addons'
    await pessoaItem.setValue(P)
    render(<App />)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'O Firefox não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
  })

  it('no Edge (o zip do Chrome), o 1e fala do Edge', async () => {
    comMarcasDoEdge()
    urlDaAba = 'edge://settings'
    await pessoaItem.setValue(P)
    render(<App />)
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'O Edge não deixa extensões mexerem nesta página',
      }),
    ).toBeInTheDocument()
  })

  it('no Edge, "alterar" abre a página de atalhos do Chromium', async () => {
    comMarcasDoEdge()
    const abrir = vi.spyOn(fakeBrowser.tabs, 'create')
    await pessoaItem.setValue(P)
    render(<App />)
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'alterar' }))
    expect(abrir).toHaveBeenCalledWith({
      url: 'chrome://extensions/shortcuts',
    })
  })
})
