import { api } from '../api'
import { emVoo } from './em-voo'

/**
 * Junta chamadas CONCORRENTES ao mesmo `path` numa requisição só.
 *
 * ⚠️ **Existe por causa da faixa de KPIs da home, e é o que a torna de
 * graça.** Os quatro números da faixa (comprometido, gasto do mês, total
 * devido, reserva) saem das MESMAS rotas que os blocos da home já buscam —
 * sem isto, montar a faixa somaria 4 requisições à primeira tela do app, no
 * Android e muitas vezes em rede ruim.
 *
 * ⚠️ **Não é cache — a entrada morre quando a promessa assenta.** Um cache
 * de verdade faria a home mostrar número velho depois de um lançamento
 * novo; aqui, duas montagens no mesmo tick compartilham a resposta e
 * qualquer busca posterior vai à rede como antes. Os blocos continuam
 * autônomos: cada um trata seu próprio erro, e um `path` que falha rejeita
 * para todos os que o pediram juntos, sem derrubar os demais.
 */
export function buscarUmaVez<T>(path: string): Promise<T> {
  const jaEmVoo = emVoo.get(path)
  if (jaEmVoo) return jaEmVoo as Promise<T>

  const promessa = api<T>(path).finally(() => {
    emVoo.delete(path)
  })
  emVoo.set(path, promessa)
  return promessa
}
