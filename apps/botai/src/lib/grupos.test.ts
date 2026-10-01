import { describe, expect, it } from 'vitest'
import { PESSOA_DOURADA as P } from '../test/pessoa-dourada'
import { CHIPS, gruposDaPessoa } from './grupos'

describe('gruposDaPessoa', () => {
  it('monta os 6 grupos do 1b, na ordem e com as contagens do design', () => {
    expect(
      gruposDaPessoa(P).map((g) => [g.id, g.rotulo, g.linhas.length]),
    ).toEqual([
      ['pessoais', 'Pessoais', 6],
      ['email', 'E-mail', 1],
      ['endereco', 'Endereço', 7],
      ['empresa', 'Empresa', 3],
      ['cartao', 'Cartão', 5],
      ['docs', 'Documentos', 2],
    ])
  })

  it('tira cada valor da pessoa aninhada', () => {
    expect(gruposDaPessoa(P).flatMap((g) => g.linhas)).toEqual([
      { rotulo: 'Nome', valor: P.nome.completo },
      { rotulo: 'Nascimento', valor: P.nascimento.br },
      { rotulo: 'CPF', valor: P.cpf },
      { rotulo: 'RG', valor: P.rg.numero },
      { rotulo: 'Celular', valor: P.celular.formatado },
      { rotulo: 'Senha', valor: P.senha },
      { rotulo: 'E-mail', valor: P.email.endereco },
      { rotulo: 'CEP', valor: P.endereco.cep },
      { rotulo: 'Rua', valor: P.endereco.logradouro },
      { rotulo: 'Número', valor: P.endereco.numero },
      { rotulo: 'Complemento', valor: P.endereco.complemento },
      { rotulo: 'Bairro', valor: P.endereco.bairro },
      { rotulo: 'Cidade', valor: P.endereco.cidade },
      { rotulo: 'UF', valor: P.endereco.uf },
      { rotulo: 'Razão social', valor: P.empresa.razaoSocial },
      { rotulo: 'Fantasia', valor: P.empresa.nomeFantasia },
      { rotulo: 'CNPJ', valor: P.empresa.cnpj },
      {
        rotulo: 'Bandeira',
        valor: P.cartao.bandeira === 'visa' ? 'Visa' : 'Mastercard',
      },
      { rotulo: 'Número', valor: P.cartao.numeroFormatado },
      { rotulo: 'Nome impresso', valor: P.cartao.titular },
      { rotulo: 'Validade', valor: P.cartao.validade },
      { rotulo: 'CVV', valor: P.cartao.cvv },
      { rotulo: 'PIS/NIS', valor: P.pis },
      { rotulo: 'Título', valor: P.tituloEleitor },
    ])
  })

  it('escreve a bandeira com nome próprio', () => {
    const comMaster = {
      ...P,
      cartao: { ...P.cartao, bandeira: 'mastercard' as const },
    }
    expect(gruposDaPessoa(comMaster)[4].linhas[0]).toEqual({
      rotulo: 'Bandeira',
      valor: 'Mastercard',
    })
  })
})

describe('CHIPS', () => {
  it('é "Tudo" e um chip por grupo, na ordem do design', () => {
    expect(CHIPS.map((c) => c.rotulo)).toEqual([
      'Tudo',
      'Pessoais',
      'E-mail',
      'Endereço',
      'Empresa',
      'Cartão',
      'Documentos',
    ])
  })
})
