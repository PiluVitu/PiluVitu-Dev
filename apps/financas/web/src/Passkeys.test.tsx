import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { addPasskey, deletePasskey, useListPasskeys } = vi.hoisted(() => ({
  addPasskey: vi.fn(),
  deletePasskey: vi.fn(),
  useListPasskeys: vi.fn(),
}))

vi.mock('./auth-client', () => ({
  authClient: {
    passkey: { addPasskey, deletePasskey },
    useListPasskeys,
  },
}))

import { PasskeysCard } from './Passkeys'

const LISTA = [
  {
    id: 'pk1',
    name: 'iPhone',
    createdAt: new Date('2026-10-20T15:00:00Z'),
  },
  { id: 'pk2', name: null, createdAt: new Date('2026-10-21T15:00:00Z') },
]

function listaCom(estado: {
  data?: unknown
  error?: unknown
  isPending?: boolean
}) {
  useListPasskeys.mockReturnValue({
    data: null,
    error: null,
    isPending: false,
    ...estado,
  })
}

beforeEach(() => {
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {})
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('PasskeysCard', () => {
  test('carregando', () => {
    listaCom({ isPending: true })
    render(<PasskeysCard />)
    expect(
      screen.getByRole('heading', { name: 'Passkeys' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Carregando passkeys…')).toBeInTheDocument()
  })

  test('vazio', () => {
    listaCom({ data: [] })
    render(<PasskeysCard />)
    expect(screen.getByText('Nenhuma passkey cadastrada.')).toBeInTheDocument()
  })

  test('erro ao listar aparece em role="alert"', () => {
    listaCom({ error: { message: 'falhou', status: 503 } })
    render(<PasskeysCard />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não consegui carregar suas passkeys.',
    )
  })

  test('lista com nome e data; sem nome vira "Passkey"', () => {
    listaCom({ data: LISTA })
    render(<PasskeysCard />)
    const itens = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(itens).toHaveLength(2)
    expect(itens[0]).toHaveTextContent('iPhone')
    expect(itens[0]).toHaveTextContent('20/10/2026')
    expect(itens[1]).toHaveTextContent('Passkey')
  })

  test('cadastrar chama addPasskey com o nome digitado', async () => {
    listaCom({ data: [] })
    addPasskey.mockResolvedValue({ data: { id: 'novo' }, error: null })
    render(<PasskeysCard />)
    await userEvent.type(screen.getByLabelText('Nome (opcional)'), 'Notebook')
    await userEvent.click(
      screen.getByRole('button', { name: 'Cadastrar passkey' }),
    )
    expect(addPasskey).toHaveBeenCalledWith({ name: 'Notebook' })
    await waitFor(() =>
      expect(screen.getByLabelText('Nome (opcional)')).toHaveValue(''),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('cadastrar sem nome não manda name', async () => {
    listaCom({ data: [] })
    addPasskey.mockResolvedValue({ data: { id: 'novo' }, error: null })
    render(<PasskeysCard />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Cadastrar passkey' }),
    )
    expect(addPasskey).toHaveBeenCalledWith({})
  })

  test('erro no cadastro aparece traduzido', async () => {
    listaCom({ data: [] })
    addPasskey.mockResolvedValue({
      data: null,
      error: { code: 'email_not_allowed', status: 403 },
    })
    render(<PasskeysCard />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Cadastrar passkey' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este e-mail não tem acesso a este aplicativo.',
    )
  })

  test('cadastro que lança (rede fora) também vira mensagem, não tela quebrada', async () => {
    listaCom({ data: [] })
    addPasskey.mockRejectedValue(new Error('rede fora'))
    render(<PasskeysCard />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Cadastrar passkey' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível concluir (rede fora).',
    )
    expect(
      screen.getByRole('button', { name: 'Cadastrar passkey' }),
    ).toBeEnabled()
  })

  test('remover chama deletePasskey com o id certo', async () => {
    listaCom({ data: LISTA })
    deletePasskey.mockResolvedValue({ data: { status: true }, error: null })
    render(<PasskeysCard />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Remover passkey iPhone' }),
    )
    expect(deletePasskey).toHaveBeenCalledWith({ id: 'pk1' })
  })

  test('erro ao remover aparece em role="alert"', async () => {
    listaCom({ data: LISTA })
    deletePasskey.mockResolvedValue({
      data: null,
      error: { code: 'PASSKEY_NOT_FOUND', status: 404 },
    })
    render(<PasskeysCard />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Remover passkey iPhone' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta passkey não está cadastrada aqui.',
    )
  })

  test('navegador sem WebAuthn: sem botão de cadastrar, com aviso; a lista continua', () => {
    vi.unstubAllGlobals()
    listaCom({ data: LISTA })
    render(<PasskeysCard />)
    expect(
      screen.queryByRole('button', { name: 'Cadastrar passkey' }),
    ).toBeNull()
    expect(
      screen.getByText('Este navegador não suporta passkey.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remover passkey iPhone' }),
    ).toBeInTheDocument()
  })
})
