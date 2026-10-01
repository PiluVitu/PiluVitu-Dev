import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PESSOA_DOURADA as P } from '../test/pessoa-dourada'
import { iniciais, PessoaPronta, type PessoaProntaProps } from './pessoa-pronta'

function props(extra: Partial<PessoaProntaProps> = {}): PessoaProntaProps {
  return {
    pessoa: P,
    idade: 33,
    atalho: '⌥⇧P',
    preencherDesabilitado: false,
    onPreencher: vi.fn(),
    onNovaPessoa: vi.fn(),
    onAbrirCaixa: vi.fn(),
    onCopiar: vi
      .fn<(valor: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    ...extra,
  }
}

const botaoPreencher = () =>
  screen.getByRole('button', { name: /Preencher esta página/ })

describe('iniciais', () => {
  it('pega a primeira letra do primeiro e do último nome', () => {
    expect(iniciais('Maria Eduarda Souza')).toBe('MS')
    expect(iniciais('  vinícius oliveira costa ')).toBe('VC')
  })
})

describe('PessoaPronta (1b)', () => {
  it('mostra iniciais, nome, idade e cidade da pessoa', () => {
    render(<PessoaPronta {...props()} />)
    expect(
      screen.getByRole('heading', { level: 1, name: P.nome.completo }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(`33 anos · ${P.endereco.cidade}, ${P.endereco.uf}`),
    ).toBeInTheDocument()
    expect(screen.getByText(iniciais(P.nome.completo))).toBeInTheDocument()
  })

  it('"Preencher esta página" mostra o atalho num kbd e chama onPreencher', async () => {
    const preencher = vi.fn()
    render(<PessoaPronta {...props({ onPreencher: preencher })} />)
    expect(within(botaoPreencher()).getByText('⌥⇧P').tagName).toBe('KBD')
    await userEvent.setup().click(botaoPreencher())
    expect(preencher).toHaveBeenCalledTimes(1)
  })

  it('sem atalho o chip some do botão', () => {
    render(<PessoaPronta {...props({ atalho: '' })} />)
    expect(botaoPreencher().querySelector('kbd')).toBeNull()
  })

  it('"Preencher" fica desabilitado quando a página é proibida', () => {
    render(<PessoaPronta {...props({ preencherDesabilitado: true })} />)
    expect(botaoPreencher()).toBeDisabled()
  })

  it('"Nova pessoa", "Caixa de entrada" e "abrir caixa →" chamam os callbacks', async () => {
    const nova = vi.fn()
    const caixa = vi.fn()
    const user = userEvent.setup()
    render(
      <PessoaPronta {...props({ onNovaPessoa: nova, onAbrirCaixa: caixa })} />,
    )
    await user.click(screen.getByRole('button', { name: 'Nova pessoa' }))
    await user.click(screen.getByRole('button', { name: 'Caixa de entrada' }))
    await user.click(screen.getByRole('button', { name: 'abrir caixa →' }))
    expect(nova).toHaveBeenCalledTimes(1)
    expect(caixa).toHaveBeenCalledTimes(2)
  })

  it('lista os 6 grupos e o filtro mostra só o escolhido, com a nota nova do cartão', async () => {
    render(<PessoaPronta {...props()} />)
    const rotulosDosGrupos = () =>
      screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(rotulosDosGrupos()).toEqual([
      'Pessoais',
      'E-mail',
      'Endereço',
      'Empresa',
      'Cartão',
      'Documentos',
    ])
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Cartão' }))
    expect(screen.getByRole('button', { name: 'Cartão' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(rotulosDosGrupos()).toEqual(['Cartão'])
    expect(
      screen.getByText(
        'Número de teste documentado da Stripe. Passa no Luhn; só aprova em sandbox.',
      ),
    ).toBeInTheDocument()
  })

  it('o grupo do e-mail avisa que a caixa é pública', () => {
    render(<PessoaPronta {...props()} />)
    const email = within(screen.getByRole('region', { name: 'E-mail' }))
    expect(email.getByText('Caixa pública.')).toBeInTheDocument()
    expect(email.getByText(P.email.endereco)).toBeInTheDocument()
  })

  it('copiar manda o valor para onCopiar e marca "copiado" naquela linha', async () => {
    const copiar = vi
      .fn<(valor: string) => Promise<void>>()
      .mockResolvedValue(undefined)
    render(<PessoaPronta {...props({ onCopiar: copiar })} />)
    const pessoais = within(screen.getByRole('region', { name: 'Pessoais' }))
    await userEvent
      .setup()
      .click(pessoais.getByRole('button', { name: 'Copiar CPF' }))
    expect(copiar).toHaveBeenCalledWith(P.cpf)
    expect(await pessoais.findByText('copiado')).toBeInTheDocument()
  })
})
