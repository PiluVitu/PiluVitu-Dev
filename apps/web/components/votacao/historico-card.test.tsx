import { renderEstatico } from '@/lib/render-estatico'
import {
  roletaDoHistorico,
  sessaoDoHistorico,
} from '@/lib/votacao/historico.fixtures'
import { HistoricoCard } from './historico-card'

const texto = (raiz: Element) => (raiz.textContent ?? '').replace(/\s+/g, ' ')

describe('HistoricoCard', () => {
  it('título, data, filmes, participantes e o vencedor, com o link recebido', () => {
    const raiz = renderEstatico(
      <HistoricoCard sessao={sessaoDoHistorico()} href="/anteriores/12" />,
    )
    expect(raiz.querySelector('a')?.getAttribute('href')).toBe('/anteriores/12')
    const t = texto(raiz)
    expect(t).toContain('Sexta 22/05')
    expect(t).toContain('22 de maio de 2026')
    expect(t).toContain('3 filmes')
    expect(t).toContain('4 participantes')
    expect(t).toContain('🏆 Vencedor: A Coisa')
  })

  it('a roleta de Halloween mostra o sorteado, sem contar participantes', () => {
    const raiz = renderEstatico(
      <HistoricoCard sessao={roletaDoHistorico()} href="/anteriores/13" />,
    )
    expect(raiz.querySelector('a')?.dataset.halloween).toBe('true')
    expect(texto(raiz)).toContain('🎃 Sorteado na roleta: Hereditário')
    expect(texto(raiz)).not.toContain('participantes')
  })

  it('sem vencedor (empate sem desempate), diz isso', () => {
    const raiz = renderEstatico(
      <HistoricoCard
        sessao={sessaoDoHistorico({
          winner_movie_id: null,
          winner_method: null,
          movies: [],
        })}
        href="/x"
      />,
    )
    expect(texto(raiz)).toContain('Sem vencedor')
  })
})
