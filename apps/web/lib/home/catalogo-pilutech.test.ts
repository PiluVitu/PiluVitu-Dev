import {
  APPS_PILUTECH,
  buscarAppsPiluTech,
  lerCatalogo,
} from './catalogo-pilutech'

const catalogo = {
  versao: 1,
  apps: [
    {
      slug: 'orai',
      nome: 'Oraí',
      status: 'no ar',
      estado: 'ativo',
      url: 'https://pilutech.com.br/apps/orai',
      icone: 'https://pilutech.com.br/icones/orai.png',
    },
    {
      slug: 'novo',
      nome: 'Novo',
      status: 'em desenvolvimento',
      estado: 'desenvolvimento',
      url: 'https://pilutech.com.br/apps/novo',
      icone: null,
    },
  ],
}

const responder = (corpo: unknown, ok = true) =>
  jest.fn().mockResolvedValue({ ok, json: async () => corpo })

describe('lerCatalogo', () => {
  it('aceita o formato do apps.json', () => {
    expect(lerCatalogo(catalogo)).toEqual(catalogo.apps)
  })

  it.each([
    ['versão errada', { ...catalogo, versao: 2 }],
    ['lista vazia', { versao: 1, apps: [] }],
    [
      'estado desconhecido',
      { versao: 1, apps: [{ ...catalogo.apps[0], estado: 'x' }] },
    ],
    [
      'url javascript:',
      {
        versao: 1,
        apps: [{ ...catalogo.apps[0], url: 'javascript:alert(1)' }],
      },
    ],
    ['não é objeto', 'oi'],
  ])('rejeita %s', (_, corpo) => {
    expect(lerCatalogo(corpo)).toBeNull()
  })

  it('ícone fora de https://pilutech.com.br vira a letra', () => {
    const outro = {
      versao: 1,
      apps: [{ ...catalogo.apps[0], icone: 'https://outro.site/x.png' }],
    }
    expect(lerCatalogo(outro)?.[0].icone).toBeNull()
  })
})

describe('buscarAppsPiluTech', () => {
  it('usa o catálogo, revalidando a cada 1h', async () => {
    const f = responder(catalogo)
    expect(await buscarAppsPiluTech(f)).toEqual(catalogo.apps)
    expect(f).toHaveBeenCalledWith('https://pilutech.com.br/apps.json', {
      next: { revalidate: 3600 },
    })
  })

  it('erro de rede cai na lista atual', async () => {
    const f = jest.fn().mockRejectedValue(new TypeError('fetch failed'))
    expect(await buscarAppsPiluTech(f)).toBe(APPS_PILUTECH)
  })

  it('HTTP de erro cai na lista atual', async () => {
    expect(await buscarAppsPiluTech(responder({}, false))).toBe(APPS_PILUTECH)
  })

  it('formato inválido cai na lista atual', async () => {
    expect(await buscarAppsPiluTech(responder({ versao: 1, apps: [{}] }))).toBe(
      APPS_PILUTECH,
    )
  })
})
