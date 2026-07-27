import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Bloco } from './Bloco'

describe('Bloco', () => {
  it('estado carregando: mostra o título, não mostra o conteúdo', () => {
    render(
      <Bloco titulo="Comprometido" carregando>
        <p>conteúdo real</p>
      </Bloco>,
    )
    expect(
      screen.getByRole('heading', { name: 'Comprometido' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('conteúdo real')).not.toBeInTheDocument()
  })

  it('estado erro: renderiza a mensagem DENTRO do card, com role="alert", sem propagar (sem lançar/sem conteúdo)', () => {
    render(
      <Bloco titulo="Comprometido" erro="não consegui buscar os dados">
        <p>conteúdo real</p>
      </Bloco>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'não consegui buscar os dados',
    )
    // ainda mostra o título do bloco — o erro não derruba o card inteiro
    expect(
      screen.getByRole('heading', { name: 'Comprometido' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('conteúdo real')).not.toBeInTheDocument()
  })

  it('estado vazio: mostra a mensagem de vazio, não mostra o conteúdo', () => {
    render(
      <Bloco titulo="Comprometido" vazio vazioMensagem="nada por aqui ainda">
        <p>conteúdo real</p>
      </Bloco>,
    )
    expect(screen.getByText('nada por aqui ainda')).toBeInTheDocument()
    expect(screen.queryByText('conteúdo real')).not.toBeInTheDocument()
  })

  it('estado conteúdo: sem carregando/erro/vazio, renderiza os children', () => {
    render(
      <Bloco titulo="Comprometido">
        <p>conteúdo real</p>
      </Bloco>,
    )
    expect(screen.getByText('conteúdo real')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('erro tem prioridade sobre carregando/vazio', () => {
    render(
      <Bloco titulo="X" carregando vazio erro="prioridade do erro">
        <p>conteúdo real</p>
      </Bloco>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('prioridade do erro')
  })

  // Task 5 (ajuda contextual): `ajuda` é opcional — sem ele (todos os
  // testes acima), nada novo aparece ao lado do título. Passado, some junto
  // do título mesmo nos estados carregando/erro/vazio (a pergunta que a
  // ajuda responde não depende do bloco ter dado certo).
  it('ajuda: sem a prop, nada extra aparece ao lado do título', () => {
    render(
      <Bloco titulo="Comprometido">
        <p>conteúdo real</p>
      </Bloco>,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('ajuda: com a prop, o gatilho aparece ao lado do título', () => {
    render(
      <Bloco
        titulo="Comprometido"
        ajuda={<button aria-label="Ajuda sobre Comprometido">?</button>}
      >
        <p>conteúdo real</p>
      </Bloco>,
    )
    expect(
      screen.getByRole('button', { name: 'Ajuda sobre Comprometido' }),
    ).toBeInTheDocument()
  })
})
