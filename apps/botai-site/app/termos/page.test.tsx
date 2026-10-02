import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen, within } from '@testing-library/react'
import TermosPage from './page'

const PESSOA = join(__dirname, '../../../../packages/tools/src/pessoa.ts')

// Cada gerador que monta a pessoa (packages/tools/src/pessoa.ts) e o dado dele que
// pode ser de alguém de verdade. Os documentos saem com dígito verificador válido e
// sem faixa de teste; o celular tem DDD real; o número da casa é sorteado na
// numeração real do CEP. null: não sorteia documento, telefone nem endereço (o
// cartão é o de teste da Stripe; o e-mail tem seção própria).
const PODE_SER_DE_ALGUEM: Record<string, string | null> = {
  CPF: 'CPF',
  Empresa: 'CNPJ',
  RG: 'RG',
  PIS: 'PIS/NIS',
  TituloEleitor: 'título de eleitor',
  Celular: 'celular',
  Endereco: 'endereço',
  Nome: null,
  Nascimento: null,
  Email: null,
  Senha: null,
  Cartao: null,
}
const DADOS_QUE_PODEM_EXISTIR = Object.values(PODE_SER_DE_ALGUEM).filter(
  (dado): dado is string => dado !== null,
)
const mencao = (dado: string) =>
  new RegExp(`(?<!\\p{L})${dado}(?!\\p{L})`, 'iu')

describe('/termos', () => {
  beforeEach(() => {
    render(<TermosPage />)
  })

  it('o título e a data de vigência', () => {
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Termos de uso do Botaí',
    )
    const data = screen.getByText('2 de outubro de 2026')
    expect(data.tagName).toBe('TIME')
    expect(data).toHaveAttribute('dateTime', '2026-10-02')
  })

  it('as seções, na ordem', () => {
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Aceitação',
      'O que é o Botaí',
      'A licença do código',
      'Para que serve',
      'O que é proibido',
      'Dados que podem ser de alguém',
      'A caixa de e-mail pública',
      'Sem garantia',
      'Limite de responsabilidade',
      'Marcas de terceiros',
      'Privacidade',
      'Mudanças',
      'Lei e foro',
      'Contato',
    ])
  })

  // Review Focus 5: os termos não podem tirar o que a MIT dá sobre o código.
  it('a MIT, com o link para o LICENSE, vale sobre o código', () => {
    expect(screen.getByRole('link', { name: 'licença MIT' })).toHaveAttribute(
      'href',
      'https://github.com/PiluVitu/PiluVitu-Dev/blob/main/apps/botai/LICENSE',
    )
    expect(document.body).toHaveTextContent(
      'Se algum trecho destes termos parecer limitar o que a MIT permite fazer com o código, vale a MIT.',
    )
  })

  it('as proibições pedidas pelo dono', () => {
    const itens = within(screen.getByRole('list', { name: 'Proibições' }))
      .getAllByRole('listitem')
      .map((li) => li.textContent)
      .join('\n')
    expect(itens).toMatch(/falsidade ideológica/)
    expect(itens).toMatch(/cadastro, conta, compra/)
    expect(itens).toMatch(/verificação de identidade/)
    expect(itens).toMatch(/SMS/)
  })

  it('todo gerador da pessoa foi classificado em PODE_SER_DE_ALGUEM', () => {
    const geradores = [
      ...readFileSync(PESSOA, 'utf8').matchAll(/\bgerar(\w+)\(rng[,)]/g),
    ].map((m) => m[1])
    expect(geradores.sort()).toEqual(Object.keys(PODE_SER_DE_ALGUEM).sort())
  })

  // O revisor achou só CPF, CNPJ e celular aqui, e "o número da casa e o resto
  // da pessoa são inventados": RG, PIS/NIS e título saem iguais ao CPF, e o
  // número cai na faixa real do CEP.
  it('"Dados que podem ser de alguém" cita cada dado que pode existir', () => {
    const paragrafo = screen.getByRole('heading', {
      level: 2,
      name: 'Dados que podem ser de alguém',
    }).nextElementSibling
    for (const dado of DADOS_QUE_PODEM_EXISTIR)
      expect(paragrafo?.textContent).toMatch(mencao(dado))
    expect(paragrafo).toHaveTextContent('numeração daquele CEP')
    expect(paragrafo).not.toHaveTextContent(/inventad/)
  })

  it('o limite de responsabilidade cobre os mesmos dados', () => {
    const item = within(
      screen.getByRole('list', { name: 'Limites de responsabilidade' }),
    )
      .getAllByRole('listitem')
      .find((li) => li.textContent?.includes('pertença a alguém'))
    for (const dado of DADOS_QUE_PODEM_EXISTIR)
      expect(item?.textContent).toMatch(mencao(dado))
  })

  it('foro de Teresina/PI, com a ressalva do CDC', () => {
    expect(document.body).toHaveTextContent('comarca de Teresina/PI')
    expect(document.body).toHaveTextContent(
      'propor a ação no foro do próprio domicílio (CDC, art. 101, I)',
    )
  })

  it('as marcas de terceiros, com os titulares', () => {
    for (const titular of [
      'Google LLC',
      'Mozilla Foundation',
      'Microsoft Corporation',
      'Opera Norway AS',
      'Stripe, Inc.',
    ])
      expect(document.body).toHaveTextContent(titular)
  })

  it('privacidade, contato e histórico', () => {
    for (const link of screen.getAllByRole('link', {
      name: 'política de privacidade',
    }))
      expect(link).toHaveAttribute('href', '/privacidade')
    expect(
      screen.getByRole('link', { name: 'pilutechinformatica@gmail.com' }),
    ).toHaveAttribute('href', 'mailto:pilutechinformatica@gmail.com')
    expect(
      screen.getByRole('link', { name: 'histórico do código-fonte do site' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/PiluVitu/PiluVitu-Dev/commits/main/apps/botai-site/app/termos/page.tsx',
    )
  })

  // O Botaí ainda está "Em breve": o texto vale antes e depois das lojas.
  it('não diz que já está nas lojas', () => {
    expect(document.body).not.toHaveTextContent(
      /dispon[ií]vel|publicad[oa] nas lojas/i,
    )
  })
})
