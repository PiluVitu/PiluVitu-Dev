import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  agendarSegundaPassada,
  regravarAlterados,
  SEGUNDA_PASSADA_MS,
  type Escrito,
} from './segunda-passada'

beforeEach(() => {
  document.body.innerHTML =
    '<input name="complemento"><input name="rua"><input name="cep">'
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const campo = (nome: string) =>
  document.querySelector(`[name="${nome}"]`) as HTMLInputElement

// Simula o que preencherDocumento entrega: o campo já escrito, com o valor lido logo depois.
function escrito(nome: string, valor: string): Escrito {
  campo(nome).value = valor
  return { el: campo(nome), valor, lido: campo(nome).value }
}

describe('regravarAlterados', () => {
  it('regrava o campo que o site mudou depois da nossa escrita, com os eventos de input', () => {
    const complemento = escrito('complemento', 'Apto 81')
    const ouvinte = vi.fn()
    campo('complemento').addEventListener('input', ouvinte)
    campo('complemento').value = 'de 612 a 1510 - lado par'
    regravarAlterados([complemento])
    expect(campo('complemento').value).toBe('Apto 81')
    expect(ouvinte).toHaveBeenCalledTimes(1)
  })

  it('não toca no campo que ficou como estava, nem dispara de novo a busca de CEP', () => {
    const cep = escrito('cep', '01310-100')
    const busca = vi.fn()
    campo('cep').addEventListener('input', busca)
    regravarAlterados([cep])
    expect(busca).not.toHaveBeenCalled()
  })

  it('compara com o valor lido, não com o escrito: máscara que reformatou na hora não conta como mudança', () => {
    campo('cep').value = '01310-100'
    const cep: Escrito = {
      el: campo('cep'),
      valor: '01310100',
      lido: '01310-100',
    }
    const busca = vi.fn()
    campo('cep').addEventListener('input', busca)
    regravarAlterados([cep])
    expect(busca).not.toHaveBeenCalled()
    expect(campo('cep').value).toBe('01310-100')
  })

  it('ignora campo que saiu da página ou ficou desabilitado', () => {
    const rua = escrito('rua', 'Avenida Paulista')
    const complemento = escrito('complemento', 'Apto 81')
    const ruaSolta = campo('rua')
    ruaSolta.value = 'outra'
    ruaSolta.remove()
    campo('complemento').value = 'outro'
    campo('complemento').disabled = true
    expect(() => regravarAlterados([rua, complemento])).not.toThrow()
    expect(ruaSolta.value).toBe('outra')
    expect(campo('complemento').value).toBe('outro')
  })

  it('ignora campo que o site travou depois da busca: fieldset desabilitado ou readonly', () => {
    // el.disabled só reflete o atributo do próprio campo; o <fieldset disabled> desabilita sem tocá-lo
    // (a mesma armadilha do preenchivel). Readonly também fica de fora: a 1ª passada nem escreveria ali.
    const complemento = escrito('complemento', 'Apto 81')
    const rua = escrito('rua', 'Avenida Paulista')
    const fieldset = document.createElement('fieldset')
    document.body.append(fieldset)
    fieldset.append(campo('complemento'))
    campo('complemento').value = 'de 612 a 1510 - lado par'
    fieldset.disabled = true
    campo('rua').value = 'Av. Paulista'
    campo('rua').readOnly = true
    const ouvinte = vi.fn()
    document.body.addEventListener('input', ouvinte)
    regravarAlterados([complemento, rua])
    expect(campo('complemento').value).toBe('de 612 a 1510 - lado par')
    expect(campo('rua').value).toBe('Av. Paulista')
    expect(ouvinte).not.toHaveBeenCalled()
  })
})

describe('agendarSegundaPassada', () => {
  it('agenda uma passada só, ~1 s depois', () => {
    vi.useFakeTimers()
    const complemento = escrito('complemento', 'Apto 81')
    agendarSegundaPassada([complemento], (acao, ms) => setTimeout(acao, ms))
    campo('complemento').value = 'de 612 a 1510 - lado par'
    vi.advanceTimersByTime(SEGUNDA_PASSADA_MS - 1)
    expect(campo('complemento').value).toBe('de 612 a 1510 - lado par')
    vi.advanceTimersByTime(1)
    expect(campo('complemento').value).toBe('Apto 81')
  })

  it('sem nada escrito não agenda nada', () => {
    const agendar = vi.fn()
    agendarSegundaPassada([], agendar)
    expect(agendar).not.toHaveBeenCalled()
  })
})
