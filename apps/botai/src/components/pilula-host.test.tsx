import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PilulaHost } from './pilula-host'

describe('PilulaHost', () => {
  it('mostra o host com o ponto ok', () => {
    const { container } = render(
      <PilulaHost host="localhost:3000" status="ok" />,
    )
    expect(screen.getByText('localhost:3000')).toBeInTheDocument()
    expect(container.querySelector('.bg-ok')).not.toBeNull()
  })

  it('usa o ponto warn', () => {
    const { container } = render(
      <PilulaHost host="staging.app.dev" status="warn" />,
    )
    expect(container.querySelector('.bg-warn')).not.toBeNull()
  })

  it('troca o ponto pelo cadeado na página proibida', () => {
    const { container } = render(
      <PilulaHost host="chrome://settings" status="lock" />,
    )
    expect(container.querySelector('svg[data-icon="lock"]')).not.toBeNull()
    expect(container.querySelector('.bg-ok, .bg-warn')).toBeNull()
  })

  it('guarda o host inteiro no title, porque o texto trunca', () => {
    const host = 'homologacao-do-cliente-com-nome-comprido.empresa.com.br:8443'
    render(<PilulaHost host={host} status="ok" />)
    expect(screen.getByTitle(host)).toBeInTheDocument()
  })
})
