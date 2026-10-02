import { describe, expect, it } from 'vitest'
import { CAPTURAS, CENAS_DA_OPERA, COPIAS, PECAS_DA_LOJA } from './pecas'

describe('peças da loja', () => {
  it('seis capturas, cada cena nos dois temas, na ordem que o site mostra', () => {
    expect(CAPTURAS.map((c) => c.nome)).toEqual([
      '01-pagina-preenchida-escuro',
      '02-pagina-preenchida-claro',
      '03-pessoa-de-teste-escuro',
      '04-pessoa-de-teste-claro',
      '05-resultado-escuro',
      '06-resultado-claro',
    ])
  })

  it('o Opera recebe ao menos duas capturas', () => {
    expect(CENAS_DA_OPERA.length).toBeGreaterThanOrEqual(2)
  })

  it('nenhum arquivo repetido', () => {
    const arquivos = PECAS_DA_LOJA.map((p) => p.arquivo)
    expect(new Set(arquivos).size).toBe(arquivos.length)
  })

  // O apps/web só usa o ícone (o logo do card); a landing usa o ícone, os ícones do app e as capturas de 1280×800.
  it('as cópias para os sites: o card do portfólio e a landing', () => {
    expect(COPIAS.slice(0, 4)).toEqual([
      {
        origem: 'icone-128.png',
        destino: 'web/public/pilulabs/botai/icone-128.png',
      },
      { origem: 'icone-128.png', destino: 'botai-site/public/icone-128.png' },
      { origem: 'edge-logo-300.png', destino: 'botai-site/app/icon.png' },
      { origem: 'edge-logo-300.png', destino: 'botai-site/app/apple-icon.png' },
    ])
    expect(COPIAS.slice(4)).toEqual(
      CAPTURAS.map((captura) => ({
        origem: `capturas/1280x800/${captura.nome}.png`,
        destino: `botai-site/public/capturas/${captura.nome}.png`,
      })),
    )
  })
})
