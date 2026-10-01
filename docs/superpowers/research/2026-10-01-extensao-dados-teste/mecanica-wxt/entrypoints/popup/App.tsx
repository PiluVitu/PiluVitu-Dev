import { Button } from '@piluvitu/ui/button'
import { useEffect, useState } from 'react'
import {
  pessoaItem,
  type Pessoa,
  type ResultadoPreencher,
} from '@/utils/pessoa'

export function App() {
  const [pessoa, setPessoa] = useState<Pessoa | null>(null)
  const [resultado, setResultado] = useState<ResultadoPreencher | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    void pessoaItem.getValue().then(setPessoa)
    return pessoaItem.watch(setPessoa)
  }, [])

  async function gerar() {
    await pessoaItem.setValue({
      nome: 'Maria Eduarda Souza',
      cpf: '384.529.176-19',
      cep: '01310-100',
      email: 'maria.souza.4821@tuamaeaquelaursa.com',
      user: 'maria.souza.4821',
    })
  }

  async function preencher() {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    if (tab?.id == null) return
    try {
      const [res] = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['/content-scripts/preencher.js'],
      })
      setResultado(res?.result as ResultadoPreencher)
    } catch (e) {
      setErro(String(e))
    }
  }

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-sm font-bold">piluvitu</h1>
      {pessoa ? (
        <p data-testid="nome">{pessoa.nome}</p>
      ) : (
        <p>Ainda não há pessoa de teste</p>
      )}
      <Button onClick={gerar}>Gerar pessoa</Button>
      <Button onClick={preencher} disabled={!pessoa}>
        Preencher esta página
      </Button>
      {resultado && (
        <p data-testid="resultado">
          {resultado.preenchidos} de {resultado.total}
        </p>
      )}
      {erro && <p role="alert">{erro}</p>}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault()
          void browser.tabs.create({ url: 'chrome://extensions/shortcuts' })
        }}
      >
        alterar
      </a>
    </main>
  )
}
