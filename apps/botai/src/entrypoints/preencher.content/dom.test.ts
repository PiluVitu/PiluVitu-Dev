import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { retangulo, simularLayout } from '../../test/layout'
import {
  cabe,
  campos,
  descrever,
  elementoEmFoco,
  escrever,
  leuDeVolta,
  preenchivel,
  seletor,
  visivel,
  type Campo,
} from './dom'

// chrome.dom.openOrClosedShadowRoot não existe no fakeBrowser; o stub devolve as raízes fechadas registradas aqui.
const fechadas = new Map<Element, ShadowRoot>()
let desfazerLayout: () => void

beforeEach(() => {
  fechadas.clear()
  Object.assign(fakeBrowser.dom, {
    openOrClosedShadowRoot: (el: HTMLElement) =>
      el.shadowRoot ?? fechadas.get(el) ?? null,
  })
  desfazerLayout = simularLayout()
})

afterEach(() => {
  desfazerLayout()
  document.body.innerHTML = ''
})

function montar(html: string) {
  document.body.innerHTML = html
}

function q<T extends Element = HTMLInputElement>(
  css: string,
  raiz: ParentNode = document,
): T {
  const el = raiz.querySelector<T>(css)
  if (!el) throw new Error(`nada em ${css}`)
  return el
}

function sombraFechada(host: Element, html: string): ShadowRoot {
  const raiz = host.attachShadow({ mode: 'closed' })
  raiz.innerHTML = html
  fechadas.set(host, raiz)
  return raiz
}

describe('campos', () => {
  it('acha input, select e textarea na ordem do DOM, entrando em shadow root aberta e fechada', () => {
    montar(
      '<input name="a"><div id="aberta"></div><select name="b"></select><div id="fechada"></div><textarea name="c"></textarea>',
    )
    q<HTMLElement>('#aberta').attachShadow({ mode: 'open' }).innerHTML =
      '<input name="dentro-aberta">'
    sombraFechada(q<HTMLElement>('#fechada'), '<input name="dentro-fechada">')
    expect(
      Array.from(campos(document), (el) => el.getAttribute('name')),
    ).toEqual(['a', 'dentro-aberta', 'b', 'dentro-fechada', 'c'])
  })
})

describe('preenchivel', () => {
  it.each([
    'hidden',
    'checkbox',
    'radio',
    'file',
    'submit',
    'button',
    'reset',
    'image',
    'range',
    'color',
  ])('input type=%s não carrega dado da pessoa', (tipo) => {
    montar(`<input type="${tipo}">`)
    expect(preenchivel(q('input'))).toBe(false)
  })

  it.each([
    'text',
    'email',
    'tel',
    'password',
    'number',
    'date',
    'month',
    'search',
  ])('input type=%s pode receber valor', (tipo) => {
    montar(`<input type="${tipo}">`)
    expect(preenchivel(q('input'))).toBe(true)
  })

  it('disabled, readonly e select múltiplo ficam de fora; select comum e textarea entram', () => {
    montar(
      '<input id="d" disabled><input id="r" readonly><select id="m" multiple></select><select id="s"></select><textarea id="t"></textarea><textarea id="tr" readonly></textarea>',
    )
    expect(
      ['d', 'r', 'm', 's', 't', 'tr'].map((id) =>
        preenchivel(q<Campo>(`#${id}`)),
      ),
    ).toEqual([false, false, false, true, true, false])
  })

  it('campo dentro de fieldset disabled fica de fora, mesmo sem o atributo próprio', () => {
    // el.disabled só reflete o atributo do próprio campo; o fieldset desabilita sem tocá-lo.
    montar(
      '<fieldset disabled><input id="i"><select id="s"></select><textarea id="t"></textarea></fieldset>',
    )
    expect(
      ['i', 's', 't'].map((id) => preenchivel(q<Campo>(`#${id}`))),
    ).toEqual([false, false, false])
  })

  it('campo na legend do fieldset disabled continua habilitado', () => {
    // Regra do HTML: o primeiro <legend> do fieldset não herda o disabled.
    montar(
      '<fieldset disabled><legend><input id="na-legenda"></legend><input id="fora"></fieldset>',
    )
    expect(preenchivel(q('#na-legenda'))).toBe(true)
    expect(preenchivel(q('#fora'))).toBe(false)
  })
})

describe('visivel', () => {
  it('campo comum é visível', () => {
    montar('<input>')
    expect(visivel(q('input'))).toBe(true)
  })

  it('checkVisibility falso (display, opacity, visibility) esconde', () => {
    montar('<input>')
    const el = q('input')
    Object.defineProperty(el, 'checkVisibility', { value: () => false })
    expect(visivel(el)).toBe(false)
  })

  it('ancestral aria-hidden esconde (honeypot do Mailchimp)', () => {
    montar(
      '<div aria-hidden="true" style="position:absolute;left:-5000px"><input name="b_isca" tabindex="-1"></div>',
    )
    expect(visivel(q('input'))).toBe(false)
  })

  it('menos de 2 px esconde', () => {
    montar('<input>')
    const el = q('input')
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => retangulo(0, 0, 1, 1),
    })
    expect(visivel(el)).toBe(false)
  })

  it('fora do documento, à esquerda ou acima, esconde', () => {
    montar('<input id="e"><input id="c">')
    Object.defineProperty(q('#e'), 'getBoundingClientRect', {
      value: () => retangulo(-5000, 10, 150, 20),
    })
    Object.defineProperty(q('#c'), 'getBoundingClientRect', {
      value: () => retangulo(10, -900, 150, 20),
    })
    expect(visivel(q('#e'))).toBe(false)
    expect(visivel(q('#c'))).toBe(false)
  })

  it('select escondido de 1 px conta, porque o select2 escuta o change dele', () => {
    montar('<select></select>')
    const el = q<HTMLSelectElement>('select')
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => retangulo(0, 0, 1, 1),
    })
    expect(visivel(el)).toBe(true)
  })

  it('aria-hidden acima do host esconde o campo de dentro da shadow root', () => {
    // closest() para na fronteira da shadow root: a isca embrulhada num web component passaria.
    montar(
      '<div aria-hidden="true"><x-isca id="a"></x-isca><x-isca id="f"></x-isca></div>',
    )
    const aberta = q<HTMLElement>('#a').attachShadow({ mode: 'open' })
    aberta.innerHTML = '<input name="aberta">'
    const fechada = sombraFechada(
      q<HTMLElement>('#f'),
      '<input name="fechada">',
    )
    expect(visivel(q('input', aberta))).toBe(false)
    expect(visivel(q('input', fechada))).toBe(false)
  })

  it('shadow root aninhada sem aria-hidden acima segue visível', () => {
    montar('<x-fora></x-fora>')
    const fora = q<HTMLElement>('x-fora').attachShadow({ mode: 'open' })
    fora.innerHTML = '<div aria-hidden="false"><x-dentro></x-dentro></div>'
    const dentro = q<HTMLElement>('x-dentro', fora).attachShadow({
      mode: 'open',
    })
    dentro.innerHTML = '<input>'
    expect(visivel(q('input', dentro))).toBe(true)
  })

  it('elemento fora da árvore não é visível', () => {
    expect(visivel(document.createElement('input'))).toBe(false)
  })
})

describe('descrever', () => {
  it('lê label for, name, id, autocomplete, placeholder, maxlength, inputmode e pattern', () => {
    montar(
      '<label for="cpf">CPF</label><input id="cpf" name="doc" autocomplete="off" placeholder="000.000.000-00" maxlength="14" inputmode="numeric" pattern="[0-9.-]*">',
    )
    expect(descrever(q('#cpf'))).toEqual({
      tag: 'input',
      type: 'text',
      name: 'doc',
      id: 'cpf',
      autocomplete: 'off',
      placeholder: '000.000.000-00',
      label: 'CPF',
      ariaLabel: '',
      maxLength: 14,
      inputMode: 'numeric',
      pattern: '[0-9.-]*',
      options: undefined,
      section: '',
    })
  })

  it('label que envolve o select não carrega o texto das opções; opções e seção vêm junto', () => {
    montar(
      '<fieldset><legend>Endereço</legend><label>Estado <select name="uf"><option value="">--</option><option value="SP">São Paulo</option></select></label></fieldset>',
    )
    expect(descrever(q<HTMLSelectElement>('select'))).toMatchObject({
      tag: 'select',
      type: 'select-one',
      label: 'Estado',
      maxLength: null,
      section: 'Endereço',
      options: [
        { value: '', text: '--' },
        { value: 'SP', text: 'São Paulo' },
      ],
    })
  })

  it('aria-labelledby é resolvido dentro da shadow root do campo', () => {
    montar('<div id="host"></div>')
    const raiz = q<HTMLElement>('#host').attachShadow({ mode: 'open' })
    raiz.innerHTML =
      '<span id="r">Número do cartão</span><input aria-labelledby="r" aria-label="cc">'
    expect(descrever(q('input', raiz))).toMatchObject({
      label: 'Número do cartão',
      ariaLabel: 'cc',
    })
  })

  it('textarea sem maxlength vira maxLength null', () => {
    montar('<label>Observações <textarea name="obs"></textarea></label>')
    expect(descrever(q<HTMLTextAreaElement>('textarea'))).toMatchObject({
      tag: 'textarea',
      type: 'textarea',
      maxLength: null,
      label: 'Observações',
    })
  })
})

describe('seletor', () => {
  it('usa tag#id quando o id é único', () => {
    montar('<select id="origem"></select>')
    expect(seletor(q<HTMLSelectElement>('select'))).toBe('select#origem')
  })

  it('senão tag[name] quando o name é único', () => {
    montar('<input name="ref_code" placeholder="opcional">')
    expect(seletor(q('input'))).toBe('input[name="ref_code"]')
  })

  it('id repetido cai para o name', () => {
    montar('<input id="x" name="a"><input id="x" name="b">')
    expect(seletor(document.querySelectorAll('input')[1])).toBe(
      'input[name="b"]',
    )
  })

  it('senão tag:nth-of-type entre os irmãos', () => {
    montar(
      '<form><input name="dup"><input name="dup"><span></span><input></form>',
    )
    expect(
      Array.from(document.querySelectorAll('input'), (el) => seletor(el)),
    ).toEqual([
      'input:nth-of-type(1)',
      'input:nth-of-type(2)',
      'input:nth-of-type(3)',
    ])
  })

  it('nth-of-type conta só os irmãos do mesmo pai, não a raiz inteira', () => {
    // :nth-of-type é relativo ao pai; contar na raiz daria input:nth-of-type(3), que não casa com nada.
    montar('<form><input name="d"><input name="d"><div><input></div></form>')
    const aninhado = q('div > input')
    expect(seletor(aninhado)).toBe('input:nth-of-type(1)')
    expect(aninhado.matches('input:nth-of-type(1)')).toBe(true)
  })

  it('dentro de shadow root ganha o prefixo do host', () => {
    montar('<x-campo></x-campo>')
    const raiz = q<HTMLElement>('x-campo').attachShadow({ mode: 'open' })
    raiz.innerHTML = '<input name="cpf">'
    expect(seletor(q('input', raiz))).toBe('x-campo › input[name="cpf"]')
  })
})

describe('escrever', () => {
  it('dispara foco sintético, input, change e blur nessa ordem, sem mexer no foco real', () => {
    montar('<input name="nome">')
    const el = q('input')
    const eventos: string[] = []
    for (const tipo of [
      'focus',
      'focusin',
      'input',
      'change',
      'blur',
      'focusout',
    ]) {
      el.addEventListener(tipo, (e) =>
        eventos.push(`${tipo}:${e.bubbles}:${e.composed}`),
      )
    }
    const focar = vi.spyOn(el, 'focus')
    const desfocar = vi.spyOn(el, 'blur')
    escrever(el, 'Maria')
    expect(eventos).toEqual([
      'focus:false:false',
      'focusin:true:true',
      'input:true:true',
      'change:true:true',
      'blur:false:false',
      'focusout:true:true',
    ])
    expect(el.value).toBe('Maria')
    expect(focar).not.toHaveBeenCalled()
    expect(desfocar).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(document.body)
  })

  it('grava pelo setter do protótipo, por cima do setter que a página pôs na instância', () => {
    // É o que o React faz no mundo MAIN para rastrear o valor: o setter da instância não pode ser o caminho.
    montar('<input name="nome">')
    const el = q('input')
    const setterDaPagina = vi.fn()
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: () => 'antigo',
      set: setterDaPagina,
    })
    escrever(el, 'novo')
    expect(setterDaPagina).not.toHaveBeenCalled()
    expect(
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.get?.call(el),
    ).toBe('novo')
  })

  it('funciona em select e textarea', () => {
    montar(
      '<select><option value="">-</option><option value="F">Feminino</option></select><textarea></textarea>',
    )
    escrever(q<HTMLSelectElement>('select'), 'F')
    escrever(q<HTMLTextAreaElement>('textarea'), 'linha')
    expect(q<HTMLSelectElement>('select').value).toBe('F')
    expect(q<HTMLTextAreaElement>('textarea').value).toBe('linha')
  })
})

describe('leuDeVolta e cabe', () => {
  it('aceita o mesmo valor ou os mesmos dígitos que uma máscara reformatou', () => {
    montar('<input>')
    const el = q('input')
    el.value = '529.982.247-25'
    expect(leuDeVolta(el, '529.982.247-25')).toBe(true)
    expect(leuDeVolta(el, '52998224725')).toBe(true)
    expect(leuDeVolta(el, '111.444.777-35')).toBe(false)
    el.value = ''
    expect(leuDeVolta(el, 'Maria')).toBe(false)
  })

  it('cabe respeita o maxLength', () => {
    expect(cabe('123456789012', { maxLength: 6 })).toBe(false)
    expect(cabe('123456', { maxLength: 6 })).toBe(true)
    expect(cabe('qualquer coisa', { maxLength: null })).toBe(true)
  })
})

describe('elementoEmFoco', () => {
  it('sem foco em campo devolve null', () => {
    montar('<input>')
    expect(elementoEmFoco(document)).toBeNull()
  })

  it('devolve o campo focado', () => {
    montar('<input name="cep">')
    q('input').focus()
    expect(elementoEmFoco(document)).toBe(q('input'))
  })

  it('atravessa shadow root aberta e fechada', () => {
    montar('<div id="a"></div><div id="f"></div>')
    const aberta = q<HTMLElement>('#a').attachShadow({ mode: 'open' })
    aberta.innerHTML = '<input name="aberta">'
    q('input', aberta).focus()
    expect(elementoEmFoco(document)).toBe(q('input', aberta))
    const fechada = sombraFechada(
      q<HTMLElement>('#f'),
      '<input name="fechada">',
    )
    q('input', fechada).focus()
    expect(elementoEmFoco(document)).toBe(q('input', fechada))
  })
})
