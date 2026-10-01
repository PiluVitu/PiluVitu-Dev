import { sfc32 } from './prng'
import {
  gerarNome,
  gerarEmail,
  nomeNoCartao,
  removerAcentos,
  slugNome,
  DOMINIO_EMAIL,
} from './nome'
import { sementes } from './rng-teste'

describe('nome', () => {
  test('remove acentos e cedilha', () => {
    expect(removerAcentos('Conceição Araújo Tânia Júlia')).toBe(
      'Conceicao Araujo Tania Julia',
    )
    expect(slugNome('Luíza')).toBe('luiza')
  })

  test('nome impresso: primeiro nome, iniciais do meio, último sobrenome', () => {
    expect(nomeNoCartao('Maria Eduarda', ['Souza', 'Ribeiro'])).toBe(
      'MARIA E S RIBEIRO',
    )
    expect(nomeNoCartao('Beatriz', ['Araújo', 'Conceição'])).toBe(
      'BEATRIZ A CONCEICAO',
    )
  })

  test('2000 sementes: sobrenomes distintos, completo = prenome + S1 + S2, cartão ≤ 26', () => {
    for (const r of sementes(2000)) {
      const n = gerarNome(r)
      expect(n.sobrenomes[0]).not.toBe(n.sobrenomes[1])
      expect(n.completo).toBe(`${n.prenome} ${n.sobrenomes.join(' ')}`)
      expect(n.noCartao.length).toBeLessThanOrEqual(26)
      expect(['F', 'M']).toContain(n.sexo)
    }
  })

  test('e-mail: usuario = 1ª palavra do prenome . S2 . 4 dígitos, na caixa pública', () => {
    const nome = gerarNome(sfc32(1, 2, 3, 4))
    const e = gerarEmail(sfc32(5, 5, 5, 5), nome)
    expect(e.usuario).toMatch(
      new RegExp(
        `^${slugNome(nome.prenome.split(' ')[0])}\\.${slugNome(nome.sobrenomes[1])}\\.\\d{4}$`,
      ),
    )
    expect(e.endereco).toBe(`${e.usuario}@${DOMINIO_EMAIL}`)
    expect(e.caixaUrl).toBe(`https://tuamaeaquelaursa.com/${e.usuario}`)
  })
})
