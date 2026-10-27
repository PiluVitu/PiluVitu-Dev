import { renderEstatico } from '@/lib/render-estatico'
import {
  filmeDoHistorico,
  roletaDoHistorico,
  sessaoDoHistorico,
} from '@/lib/votacao/historico.fixtures'
import { HistoricoResultado } from './historico-resultado'

const texto = (raiz: Element) => (raiz.textContent ?? '').replace(/\s+/g, ' ')

describe('HistoricoResultado', () => {
  it('cada filme com a contagem e o percentual, e o vencedor marcado', () => {
    const raiz = renderEstatico(
      <HistoricoResultado sessao={sessaoDoHistorico()} />,
    )
    const linhas = [...raiz.querySelectorAll('li')].map(texto)
    expect(linhas).toHaveLength(3)
    expect(linhas[0]).toContain('A Coisa')
    expect(linhas[0]).toContain('🏆 Vencedor')
    expect(linhas[0]).toContain('4 (57%)')
    expect(linhas[2]).toContain('ficção · série')
    expect(texto(raiz)).toContain('Total de votos: 7')
    expect(texto(raiz)).toContain('4 participantes')
  })

  it('empate resolvido pela roleta de desempate', () => {
    const raiz = renderEstatico(
      <HistoricoResultado
        sessao={sessaoDoHistorico({
          winner_movie_id: 2,
          winner_method: 'roulette',
          total_votes: 4,
          movies: [
            filmeDoHistorico(1, 'A Coisa', 2),
            filmeDoHistorico(2, 'Forrest Gump', 2),
          ],
        })}
      />,
    )
    expect(texto(raiz)).toContain('resolvido pela roleta de desempate')
    const linhas = [...raiz.querySelectorAll('li')].map(texto)
    expect(linhas[1]).toContain('🎲 Vencedor no desempate')
    expect(linhas[0]).toContain('Empate')
  })

  it('Halloween por votos usa a abóbora', () => {
    const raiz = renderEstatico(
      <HistoricoResultado sessao={sessaoDoHistorico({ theme: 'halloween' })} />,
    )
    expect(texto(raiz)).toContain('🎃 Vencedor')
  })

  it('a roleta mostra o sorteado e os candidatos, sem contagem', () => {
    const raiz = renderEstatico(
      <HistoricoResultado sessao={roletaDoHistorico()} />,
    )
    expect(
      texto(raiz.querySelector('[data-testid="historico-vencedor"]')!),
    ).toContain('Hereditário')
    expect(texto(raiz)).toContain('3 filmes na roleta')
    expect(texto(raiz)).not.toContain('Total de votos')
  })

  it('a roleta sem giro não inventa vencedor', () => {
    const raiz = renderEstatico(
      <HistoricoResultado
        sessao={roletaDoHistorico({
          winner_movie_id: null,
          winner_method: null,
        })}
      />,
    )
    expect(raiz.querySelector('[data-testid="historico-vencedor"]')).toBeNull()
    expect(texto(raiz)).toContain('não chegou a ser girada')
  })
})
