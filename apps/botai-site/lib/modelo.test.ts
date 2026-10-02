import { botoesDasLojas, modeloDaLanding, notaDasLojas } from './modelo'

const SEM_LOJA = { chromeUrl: '', firefoxUrl: '', edgeUrl: '', operaUrl: '' }
const URL_CHROME = 'https://chromewebstore.google.com/detail/botai/abc'
const URL_FIREFOX = 'https://addons.mozilla.org/pt-BR/firefox/addon/botai/'

describe('botoesDasLojas', () => {
  it('as 4 lojas, na ordem fixa, sem URL antes da aprovação', () => {
    expect(botoesDasLojas(SEM_LOJA)).toEqual([
      { loja: 'chrome', url: null },
      { loja: 'firefox', url: null },
      { loja: 'edge', url: null },
      { loja: 'opera', url: null },
    ])
  })

  it('a loja publicada leva a URL dela, aparada', () => {
    expect(
      botoesDasLojas({ ...SEM_LOJA, firefoxUrl: ` ${URL_FIREFOX} ` }),
    ).toEqual([
      { loja: 'chrome', url: null },
      { loja: 'firefox', url: URL_FIREFOX },
      { loja: 'edge', url: null },
      { loja: 'opera', url: null },
    ])
  })

  // O dono cola o link pelo /admin/pilulabs: um link de outra loja ou em http não vira botão.
  it('URL de outro host ou sem https fica sem link', () => {
    expect(
      botoesDasLojas({
        ...SEM_LOJA,
        chromeUrl: URL_FIREFOX,
        edgeUrl: 'http://microsoftedge.microsoft.com/addons/detail/botai/x',
      }).map((b) => b.url),
    ).toEqual([null, null, null, null])
  })
})

describe('notaDasLojas', () => {
  it('sem loja: a promessa, sem dizer que saiu', () => {
    expect(notaDasLojas([])).toBe(
      'Chegando às lojas do Chrome, do Firefox, do Edge e do Opera',
    )
  })

  it('nas quatro', () => {
    expect(notaDasLojas(['chrome', 'firefox', 'edge', 'opera'])).toBe(
      'Chrome, Firefox, Edge e Opera · grátis e de código aberto',
    )
  })

  // As aprovações chegam em datas diferentes: a nota só cita as que saíram.
  it('só as publicadas', () => {
    expect(notaDasLojas(['firefox'])).toBe(
      'Firefox · grátis e de código aberto',
    )
    expect(notaDasLojas(['chrome', 'edge'])).toBe(
      'Chrome e Edge · grátis e de código aberto',
    )
  })
})

describe('modeloDaLanding', () => {
  it('em breve', () => {
    expect(modeloDaLanding(SEM_LOJA)).toEqual({
      fase: 'em-breve',
      lojas: botoesDasLojas(SEM_LOJA),
      notaDasLojas:
        'Chegando às lojas do Chrome, do Firefox, do Edge e do Opera',
    })
  })

  it('com o Chrome publicado', () => {
    const urls = { ...SEM_LOJA, chromeUrl: URL_CHROME }
    expect(modeloDaLanding(urls)).toEqual({
      fase: 'disponivel',
      lojas: botoesDasLojas(urls),
      notaDasLojas: 'Chrome · grátis e de código aberto',
    })
  })

  it('URL errada não muda a fase', () => {
    expect(modeloDaLanding({ ...SEM_LOJA, chromeUrl: URL_FIREFOX }).fase).toBe(
      'em-breve',
    )
  })
})
