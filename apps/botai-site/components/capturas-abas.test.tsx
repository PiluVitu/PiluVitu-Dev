import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { CAPTURAS } from '@/lib/capturas'
import { CapturasAbas } from './capturas-abas'

function renderizar() {
  render(<CapturasAbas capturas={CAPTURAS} rotuladoPor="capturas-heading" />)
  return screen.getAllByRole('tab')
}

// O Google não interage com a página ("Google Search does not interact with your page", Search Central,
// "Fix lazy-loaded content"): o texto das cenas 02 e 03 só é indexado se vier no HTML, mesmo escondido.
it('os três painéis vêm no HTML do servidor, e só o ativo aparece', () => {
  const raiz = document.createElement('div')
  raiz.innerHTML = renderToString(
    <CapturasAbas capturas={CAPTURAS} rotuladoPor="capturas-heading" />,
  )
  const paineis = [...raiz.querySelectorAll('[role="tabpanel"]')]
  expect(paineis.map((p) => p.querySelector('h3')?.textContent)).toEqual(
    CAPTURAS.map((c) => c.titulo),
  )
  paineis.forEach((painel, indice) =>
    expect(painel.textContent).toContain(CAPTURAS[indice].texto),
  )
  expect(paineis.map((p) => p.hasAttribute('hidden'))).toEqual([
    false,
    true,
    true,
  ])
})

describe('CapturasAbas', () => {
  it('3 abas; a primeira selecionada e a única no Tab', () => {
    const abas = renderizar()
    expect(abas.map((a) => a.textContent)).toEqual([
      '01 · Página preenchida',
      '02 · Pessoa de teste',
      '03 · Resultado',
    ])
    expect(abas.map((a) => a.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ])
    expect(abas.map((a) => a.tabIndex)).toEqual([0, -1, -1])
    expect(screen.getByRole('tablist')).toHaveAttribute(
      'aria-labelledby',
      'capturas-heading',
    )
  })

  it('cada aba controla o próprio painel', () => {
    const abas = renderizar()
    expect(abas.map((a) => a.getAttribute('aria-controls'))).toEqual([
      'painel-captura-01',
      'painel-captura-02',
      'painel-captura-03',
    ])
  })

  // O painel escondido (atributo hidden) sai da árvore de acessibilidade: getByRole só acha o ativo.
  it('o painel visível é o da aba ativa, rotulado por ela, com a cena dela', async () => {
    const abas = renderizar()
    await userEvent.click(abas[1])
    const painel = screen.getByRole('tabpanel')
    expect(painel).toHaveAttribute('aria-labelledby', abas[1].id)
    expect(abas[1]).toHaveAttribute('aria-controls', painel.id)
    expect(
      screen.getByRole('heading', { level: 3, name: 'Pessoa de teste' }),
    ).toBeInTheDocument()
    expect(painel).toHaveTextContent('02 / 03')
  })

  it('setas, Home e End mudam a aba e o foco, dando a volta', async () => {
    const usuario = userEvent.setup()
    const abas = renderizar()
    await usuario.click(abas[0])
    await usuario.keyboard('{ArrowRight}')
    expect(abas[1]).toHaveFocus()
    expect(abas[1]).toHaveAttribute('aria-selected', 'true')
    await usuario.keyboard('{End}')
    expect(abas[2]).toHaveFocus()
    await usuario.keyboard('{ArrowRight}')
    expect(abas[0]).toHaveFocus()
    await usuario.keyboard('{ArrowLeft}')
    expect(abas[2]).toHaveFocus()
    await usuario.keyboard('{Home}')
    expect(abas[0]).toHaveAttribute('aria-selected', 'true')
  })

  it('Tab sai das abas para o painel', async () => {
    const usuario = userEvent.setup()
    const abas = renderizar()
    await usuario.click(abas[0])
    await usuario.tab()
    expect(screen.getByRole('tabpanel')).toHaveFocus()
  })
})
