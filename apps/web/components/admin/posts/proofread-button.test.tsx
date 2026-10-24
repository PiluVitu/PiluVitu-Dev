import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderEstatico } from '@/lib/render-estatico'
import { ProofreadButton } from './proofread-button'

function botao(body: string) {
  return renderEstatico(
    <QueryClientProvider client={new QueryClient()}>
      <ProofreadButton body={body} onApply={() => {}} />
    </QueryClientProvider>,
  )
}

describe('ProofreadButton', () => {
  it('mostra só o botão de corrigir, sem a opção de revisão cuidadosa', () => {
    const raiz = botao('Um txeto com erro.')
    const botoes = [...raiz.querySelectorAll('button')]
    expect(botoes.map((b) => b.textContent)).toEqual(['Corrigir texto'])
    expect(raiz.querySelector('input[type="checkbox"]')).toBeNull()
    expect(raiz.textContent).not.toMatch(/cuidadosa/i)
  })

  it('fica desabilitado com o corpo vazio', () => {
    const raiz = botao('   ')
    expect(raiz.querySelector('button')?.hasAttribute('disabled')).toBe(true)
  })
})
