import { renderEstatico } from '@/lib/render-estatico'
import { TextField } from './fields'

const nada = () => {}

describe('TextField', () => {
  it('sem type, o input de texto de sempre', () => {
    const input = renderEstatico(
      <TextField label="Nome" value="Botaí" onChange={nada} />,
    ).querySelector('input')
    expect(input?.hasAttribute('type')).toBe(false)
    expect(input?.getAttribute('value')).toBe('Botaí')
  })

  it('type date vira o input de data, com o valor AAAA-MM-DD', () => {
    const input = renderEstatico(
      <TextField
        label="Lançamento"
        type="date"
        value="2026-10-01"
        onChange={nada}
      />,
    ).querySelector('input')
    expect(input?.getAttribute('type')).toBe('date')
    expect(input?.getAttribute('value')).toBe('2026-10-01')
  })

  it('mostra o erro junto do campo', () => {
    expect(
      renderEstatico(
        <TextField
          label="Site"
          value=""
          onChange={nada}
          error="Use uma URL https://"
        />,
      ).textContent,
    ).toContain('Use uma URL https://')
  })
})
