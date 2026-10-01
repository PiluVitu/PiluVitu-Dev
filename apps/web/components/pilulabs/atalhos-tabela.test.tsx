import { ATALHOS } from '@/lib/pilulabs'
import { renderEstatico } from '@/lib/render-estatico'
import { AtalhosTabela } from './atalhos-tabela'

function tabela() {
  return renderEstatico(<AtalhosTabela atalhos={ATALHOS} />)
}

describe('AtalhosTabela', () => {
  it('colunas de navegador, Windows, macOS e Linux', () => {
    expect(
      [...tabela().querySelectorAll('thead th')].map((th) => th.textContent),
    ).toEqual(['Navegador', 'Windows', 'macOS', 'Linux'])
  })

  // É o que a página publica: o Firefox no Linux é a exceção do wxt.config.ts.
  it('uma linha por navegador, com o atalho de cada sistema', () => {
    const linhas = [...tabela().querySelectorAll('tbody tr')].map((tr) => [
      tr.querySelector('th')?.textContent,
      ...[...tr.querySelectorAll('td')].map((td) => td.textContent),
    ])
    expect(linhas).toEqual([
      ['Chrome', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Edge', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Opera', 'Ctrl+Shift+Y', '⌥⇧P', 'Ctrl+Shift+Y'],
      ['Firefox', 'Ctrl+Shift+Y', '⌥⇧P', 'Alt+Shift+P'],
    ])
  })
})
