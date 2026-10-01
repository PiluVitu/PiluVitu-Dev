import { describe, expect, it } from 'vitest'
import {
  CAPTURAS,
  CENAS_DA_OPERA,
  COPIAS_PARA_O_SITE,
  PECAS_DA_LOJA,
} from './pecas'

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

  it('o site recebe o ícone e as capturas de 1280×800 em capturas/<NN>-<nome>.png', () => {
    expect(COPIAS_PARA_O_SITE[0]).toEqual({
      origem: 'icone-128.png',
      destino: 'icone-128.png',
    })
    for (const { origem, destino } of COPIAS_PARA_O_SITE.slice(1)) {
      expect(origem).toMatch(/^capturas\/1280x800\/\d{2}-[a-z-]+\.png$/)
      expect(destino).toMatch(/^capturas\/\d{2}-[a-z-]+\.png$/)
    }
    expect(COPIAS_PARA_O_SITE).toHaveLength(1 + CAPTURAS.length)
  })
})
