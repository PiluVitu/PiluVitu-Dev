import { renderEstatico } from '@/lib/render-estatico'
import { BotoesLoja } from './botoes-loja'

const FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'

describe('BotoesLoja', () => {
  it('sem loja publicada não renderiza nada', () => {
    expect(renderEstatico(<BotoesLoja lojas={[]} />).innerHTML).toBe('')
  })

  it('um link por loja publicada, com o nome da loja, em aba nova', () => {
    const raiz = renderEstatico(
      <BotoesLoja lojas={[{ loja: 'firefox', url: FIREFOX }]} />,
    )
    const links = [...raiz.querySelectorAll('a')]
    expect(links.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Firefox Add-ons', FIREFOX],
    ])
    expect(links[0].getAttribute('target')).toBe('_blank')
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('usa o nome de cada uma das 4 lojas, na ordem recebida', () => {
    const raiz = renderEstatico(
      <BotoesLoja
        lojas={[
          {
            loja: 'chrome',
            url: 'https://chromewebstore.google.com/detail/b/a',
          },
          { loja: 'firefox', url: FIREFOX },
          {
            loja: 'edge',
            url: 'https://microsoftedge.microsoft.com/addons/detail/b/a',
          },
          {
            loja: 'opera',
            url: 'https://addons.opera.com/pt-br/extensions/details/b/',
          },
        ]}
      />,
    )
    expect([...raiz.querySelectorAll('a')].map((a) => a.textContent)).toEqual([
      'Chrome Web Store',
      'Firefox Add-ons',
      'Microsoft Edge Add-ons',
      'Opera add-ons',
    ])
  })
})
