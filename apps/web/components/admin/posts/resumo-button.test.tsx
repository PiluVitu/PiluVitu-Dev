import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '@/lib/votacao/api-client'
import { atelierApi } from '@/lib/admin/atelier/api'
import { renderEstatico } from '@/lib/render-estatico'
import type { Resumo } from '@/lib/admin/atelier/types'
import { ResumoButton } from './resumo-button'

jest.mock('@/lib/admin/atelier/api', () => ({
  atelierApi: { resumo: jest.fn() },
}))

const resumoMock = atelierApi.resumo as jest.MockedFunction<
  typeof atelierApi.resumo
>

const sugerido: Resumo = {
  tldr: 'Eu mostro como configurar o Husky em dois passos.',
  metaDescription:
    'Como configurar o Husky com lint-staged num monorepo pnpm, passo a passo.',
  tags: ['git', 'husky'],
}

let container: HTMLDivElement
let root: Root

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  resumoMock.mockReset()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function montar(props: {
  tags: string[]
  onAplicar: (r: Resumo) => void
  body?: string
}) {
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <ResumoButton
          title="Como usar o Husky"
          body={props.body ?? '# Husky\n\nUm texto.'}
          tags={props.tags}
          onAplicar={props.onAplicar}
        />
      </QueryClientProvider>,
    )
  })
}

function botao(nome: RegExp): HTMLButtonElement {
  const b = [...container.querySelectorAll('button')].find((x) =>
    nome.test(x.textContent ?? ''),
  )
  if (!b) throw new Error(`botão ${nome} não encontrado`)
  return b
}

async function clicar(nome: RegExp) {
  await act(async () => {
    botao(nome).click()
  })
}

describe('ResumoButton', () => {
  it('mostra o botão de gerar, desabilitado com o corpo vazio', () => {
    const raiz = renderEstatico(
      <QueryClientProvider client={new QueryClient()}>
        <ResumoButton title="T" body="  " tags={[]} onAplicar={() => {}} />
      </QueryClientProvider>,
    )
    const b = raiz.querySelector('button')
    expect(b?.textContent).toBe('Gerar resumo')
    expect(b?.hasAttribute('disabled')).toBe(true)
  })

  it('clique chama a API com título e corpo e aplica tudo quando não há tags', async () => {
    resumoMock.mockResolvedValue(sugerido)
    const onAplicar = jest.fn()
    montar({ tags: [], onAplicar })

    await clicar(/gerar resumo/i)

    expect(resumoMock).toHaveBeenCalledWith(
      'Como usar o Husky',
      '# Husky\n\nUm texto.',
    )
    expect(onAplicar).toHaveBeenCalledWith(sugerido)
    expect(container.textContent).toMatch(/revise e salve/i)
  })

  it('com tags já preenchidas, pede confirmação antes de trocar e aplica as sugeridas', async () => {
    resumoMock.mockResolvedValue(sugerido)
    const onAplicar = jest.fn()
    montar({ tags: ['devops'], onAplicar })

    await clicar(/gerar resumo/i)

    expect(onAplicar).not.toHaveBeenCalled()
    const texto = container.textContent ?? ''
    expect(texto).toContain('devops')
    expect(texto).toContain('git')
    expect(texto).toContain('husky')

    await clicar(/usar as sugeridas/i)
    expect(onAplicar).toHaveBeenCalledWith(sugerido)
    expect(container.textContent).not.toMatch(/usar as sugeridas/i)
  })

  it('manter as tags atuais aplica o tldr e a meta sem trocar as tags', async () => {
    resumoMock.mockResolvedValue(sugerido)
    const onAplicar = jest.fn()
    montar({ tags: ['devops'], onAplicar })

    await clicar(/gerar resumo/i)
    await clicar(/manter as atuais/i)

    expect(onAplicar).toHaveBeenCalledWith({ ...sugerido, tags: ['devops'] })
  })

  it('não pede confirmação quando as sugeridas são as mesmas tags, em outra ordem', async () => {
    resumoMock.mockResolvedValue(sugerido)
    const onAplicar = jest.fn()
    montar({ tags: ['husky', 'git'], onAplicar })

    await clicar(/gerar resumo/i)

    expect(onAplicar).toHaveBeenCalledWith(sugerido)
    expect(container.textContent).not.toMatch(/usar as sugeridas/i)
  })

  // A resposta leva segundos; o dono pode editar o post enquanto isso. O que
  // chega tem de ser aplicado sobre os props atuais, não os do clique.
  it('aplica com o onAplicar e as tags da renderização atual, não da do clique', async () => {
    let responder: (r: Resumo) => void = () => {}
    resumoMock.mockReturnValue(
      new Promise<Resumo>((res) => {
        responder = res
      }),
    )
    const antigo = jest.fn()
    const atual = jest.fn()
    montar({ tags: [], onAplicar: antigo })
    await clicar(/gerar resumo/i)

    montar({ tags: [], onAplicar: atual })
    await act(async () => responder(sugerido))

    expect(antigo).not.toHaveBeenCalled()
    expect(atual).toHaveBeenCalledWith(sugerido)
  })

  it('pede confirmação quando o dono pôs tags enquanto a resposta não chegava', async () => {
    let responder: (r: Resumo) => void = () => {}
    resumoMock.mockReturnValue(
      new Promise<Resumo>((res) => {
        responder = res
      }),
    )
    const onAplicar = jest.fn()
    montar({ tags: [], onAplicar })
    await clicar(/gerar resumo/i)

    montar({ tags: ['devops'], onAplicar })
    await act(async () => responder(sugerido))

    expect(onAplicar).not.toHaveBeenCalled()
    expect(container.textContent).toMatch(/usar as sugeridas/i)
  })

  it('erro mostra a mensagem da primeira notificação e não aplica nada', async () => {
    resumoMock.mockRejectedValue(
      new ApiError(429, [
        {
          type: 'error',
          code: 'teto_atingido',
          message: 'O teto de gasto do resumo neste mês foi atingido.',
        },
      ]),
    )
    const onAplicar = jest.fn()
    montar({ tags: [], onAplicar })

    await clicar(/gerar resumo/i)

    const alerta = container.querySelector('[role="alert"]')
    expect(alerta?.textContent).toBe(
      'O teto de gasto do resumo neste mês foi atingido.',
    )
    expect(onAplicar).not.toHaveBeenCalled()
    expect(botao(/gerar resumo/i).hasAttribute('disabled')).toBe(false)
  })
})
