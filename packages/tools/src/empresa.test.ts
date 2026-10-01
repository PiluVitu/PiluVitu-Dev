import { gerarEmpresa } from './empresa'
import { validarCNPJ } from './cnpj'
import { sementes } from './rng-teste'

describe('empresa', () => {
  test('razão social e fantasia saem dos sobrenomes, CNPJ válido', () => {
    for (const r of sementes(200)) {
      const e = gerarEmpresa(r, ['Souza', 'Ribeiro'])
      expect(e.razaoSocial).toMatch(
        /^Souza & Ribeiro (Tecnologia|Comércio|Serviços Digitais|Soluções|Consultoria|Logística|Engenharia) Ltda$/,
      )
      expect(e.nomeFantasia).toMatch(
        /^Ribeiro (Dev|Labs|Store|Digital|Tech|Hub)$/,
      )
      expect(validarCNPJ(e.cnpj)).toBe(true)
    }
  })
})
