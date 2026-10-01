import { Button } from '@piluvitu/ui/button'
import { useEffect, useState } from 'react'
import { obterOuGerarPessoa, type Pessoa } from '../../lib/pessoa'

export function App() {
  const [pessoa, setPessoa] = useState<Pessoa | null>(null)
  useEffect(() => {
    obterOuGerarPessoa().then(setPessoa)
  }, [])
  return (
    <main className="w-[360px] p-4">
      <p data-testid="cpf">{pessoa?.cpf ?? '...'}</p>
      <Button>Preencher página</Button>
    </main>
  )
}
