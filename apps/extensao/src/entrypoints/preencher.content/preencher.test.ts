import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { simularLayout } from '../../test/layout'
import { PESSOA_DOURADA as P } from '../../test/pessoa-dourada'
import { criarContornos } from './contornos'
import { contarIframesDeFora, preencherDocumento } from './preencher'
import { criarRegistro } from './registro'

const HOJE = '2026-10-01'
const FORMULARIO = `
<form>
  <fieldset><legend>Seus dados</legend>
    <label>Nome completo <input name="nome"></label>
    <label>E-mail <input type="email" name="email"></label>
    <label for="cpf">CPF</label><input id="cpf" name="cpf" maxlength="11">
    <label>Senha <input type="password" name="senha" maxlength="6"></label>
  </fieldset>
  <label>Código de indicação <input name="ref_code" placeholder="opcional"></label>
  <div aria-hidden="true" style="position:absolute;left:-5000px"><input name="b_isca" tabindex="-1"></div>
  <input type="hidden" name="csrf" value="x">
  <input type="search" name="q" placeholder="Buscar">
  <label>Cidade <input name="cidade" disabled></label>
  <label><input type="checkbox" name="termos"> Aceito os termos</label>
</form>`

let desfazerLayout: () => void

beforeEach(() => {
  Object.assign(fakeBrowser.dom, {
    openOrClosedShadowRoot: (el: HTMLElement) => el.shadowRoot,
  })
  desfazerLayout = simularLayout()
  document.body.innerHTML = FORMULARIO
})

afterEach(() => {
  desfazerLayout()
  document.body.innerHTML = ''
})

const campo = (nome: string) =>
  document.querySelector(`[name="${nome}"]`) as HTMLInputElement
const semIdx = (linhas: { rotulo: string; seletor: string }[]) =>
  linhas.map(({ rotulo, seletor }) => ({ rotulo, seletor }))

function preencher() {
  const registro = criarRegistro()
  const contornos = criarContornos((acao, ms) => setTimeout(acao, ms))
  return {
    resultado: preencherDocumento(P, HOJE, registro, contornos),
    registro,
  }
}

describe('preencherDocumento', () => {
  it('conta X de Y: preenche os reconhecidos, recusa a senha que não cabe e lista o não reconhecido', () => {
    const { resultado } = preencher()
    expect(semIdx(resultado.preenchidos)).toEqual([
      { rotulo: 'Nome completo', seletor: 'input[name="nome"]' },
      { rotulo: 'E-mail', seletor: 'input[name="email"]' },
      { rotulo: 'CPF', seletor: 'input#cpf' },
    ])
    expect(semIdx(resultado.recusados)).toEqual([
      { rotulo: 'Senha', seletor: 'input[name="senha"]' },
    ])
    expect(semIdx(resultado.naoReconhecidos)).toEqual([
      { rotulo: 'Código de indicação', seletor: 'input[name="ref_code"]' },
    ])
    expect(resultado).toMatchObject({
      contentType: 'text/html',
      iframesDeFora: 0,
    })
    expect(campo('nome').value).toBe(P.nome.completo)
    expect(campo('email').value).toBe(P.email.endereco)
  })

  it('CPF com maxlength 11 recebe só os dígitos', () => {
    preencher()
    expect(campo('cpf').value).toBe(P.cpf.replace(/\D/g, ''))
  })

  it('senha maior que o maxlength não é truncada nem escrita', () => {
    preencher()
    expect(campo('senha').value).toBe('')
  })

  it('honeypot, hidden, busca, desabilitado e checkbox ficam fora da conta e intocados', () => {
    const { resultado } = preencher()
    expect([
      ...resultado.preenchidos,
      ...resultado.naoReconhecidos,
      ...resultado.recusados,
    ]).toHaveLength(5)
    expect(campo('b_isca').value).toBe('')
    expect(campo('csrf').value).toBe('x')
    expect(campo('q').value).toBe('')
    expect(campo('cidade').value).toBe('')
    expect(campo('termos').checked).toBe(false)
  })

  it('campo que já tem o valor certo não recebe input de novo e conta como preenchido', () => {
    campo('nome').value = P.nome.completo
    const ouvinte = vi.fn()
    campo('nome').addEventListener('input', ouvinte)
    const { resultado } = preencher()
    expect(ouvinte).not.toHaveBeenCalled()
    expect(resultado.preenchidos.map((l) => l.rotulo)).toContain(
      'Nome completo',
    )
  })

  it('campo cuja página desfaz o valor vai para recusados', () => {
    campo('email').addEventListener('input', () => {
      campo('email').value = ''
    })
    const { resultado } = preencher()
    expect(semIdx(resultado.recusados)).toContainEqual({
      rotulo: 'E-mail',
      seletor: 'input[name="email"]',
    })
  })

  it('idx segue a ordem do DOM e o registro devolve o elemento', () => {
    const { resultado, registro } = preencher()
    const linhas = [
      ...resultado.preenchidos,
      ...resultado.recusados,
      ...resultado.naoReconhecidos,
    ].sort((a, b) => a.idx - b.idx)
    expect(linhas.map((l) => l.seletor)).toEqual([
      'input[name="nome"]',
      'input[name="email"]',
      'input#cpf',
      'input[name="senha"]',
      'input[name="ref_code"]',
    ])
    expect(registro.buscar(linhas[0].idx)).toBe(campo('nome'))
  })

  it('contorna em ciano os preenchidos e em âmbar os demais, sem tirar o foco de onde está', () => {
    preencher()
    expect(campo('nome').style.getPropertyValue('outline')).toBe(
      '2px solid #38bdf8',
    )
    expect(campo('senha').style.getPropertyValue('outline')).toBe(
      '2px dashed #f5b82e',
    )
    expect(campo('ref_code').style.getPropertyValue('outline')).toBe(
      '2px dashed #f5b82e',
    )
    expect(campo('csrf').style.getPropertyValue('outline')).toBe('')
    expect(document.activeElement).toBe(document.body)
  })

  it('entra em shadow root e prefixa o seletor com o host', () => {
    document.body.innerHTML = '<x-campo></x-campo>'
    const raiz = (
      document.querySelector('x-campo') as HTMLElement
    ).attachShadow({ mode: 'open' })
    raiz.innerHTML = '<label>CPF <input name="cpf"></label>'
    const { resultado } = preencher()
    expect(semIdx(resultado.preenchidos)).toEqual([
      { rotulo: 'CPF', seletor: 'x-campo › input[name="cpf"]' },
    ])
    expect((raiz.querySelector('input') as HTMLInputElement).value).toBe(P.cpf)
  })
})

describe('contarIframesDeFora', () => {
  it('conta os iframes cujo documento o script não alcança', () => {
    document.body.innerHTML =
      '<iframe id="mesma"></iframe><iframe id="outra"></iframe>'
    Object.defineProperty(document.getElementById('outra'), 'contentDocument', {
      value: null,
    })
    expect(contarIframesDeFora(document)).toBe(1)
  })
})
