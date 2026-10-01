import { renderEstatico } from '@/lib/render-estatico'
import { CapturasGaleria } from './capturas-galeria'

const CAPTURAS = [
  {
    arquivo: '01-pagina-preenchida-escuro.png',
    src: '/pilulabs/botai/capturas/01-pagina-preenchida-escuro.png',
    alt: 'Captura de tela: página preenchida (tema escuro)',
  },
  {
    arquivo: '02-popup-claro.png',
    src: '/pilulabs/botai/capturas/02-popup-claro.png',
    alt: 'Captura de tela: popup (tema claro)',
  },
]

describe('CapturasGaleria', () => {
  it('sem captura não renderiza nada', () => {
    expect(renderEstatico(<CapturasGaleria capturas={[]} />).innerHTML).toBe('')
  })

  it('uma imagem por captura, com o alt, e o link para o PNG inteiro', () => {
    const raiz = renderEstatico(<CapturasGaleria capturas={CAPTURAS} />)
    expect(
      [...raiz.querySelectorAll('img')].map((i) => i.getAttribute('alt')),
    ).toEqual(CAPTURAS.map((c) => c.alt))
    expect(
      [...raiz.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    ).toEqual(CAPTURAS.map((c) => c.src))
  })
})
