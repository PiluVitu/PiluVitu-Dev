/**
 * @jest-environment-options {"url": "http://votai.localhost:3333/12"}
 */
import { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { useBaseDaVotacao } from './use-base-da-votacao'

function Link() {
  const base = useBaseDaVotacao()
  return <a href={`${base}/anteriores`}>Votações anteriores</a>
}

beforeAll(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
})

it('o servidor renderiza /votacao: ele não lê o host, para a página seguir estática', () => {
  expect(renderToString(<Link />)).toContain('href="/votacao/anteriores"')
})

it('no host do Votaí, a hidratação troca para a raiz sem erro de hidratação', async () => {
  const div = document.createElement('div')
  div.innerHTML = renderToString(<Link />)
  const erros: unknown[] = []
  await act(async () => {
    hydrateRoot(div, <Link />, {
      onRecoverableError: (e) => erros.push(e),
    })
  })
  expect(window.location.hostname).toBe('votai.localhost')
  expect(div.querySelector('a')?.getAttribute('href')).toBe('/anteriores')
  expect(erros).toEqual([])
})
