import type {
  Caixa,
  CampoDoFormulario,
  Ponto,
  ValorDoCampo,
} from '@piluvitu/tools/pdf-regras'

/** O controle focado no formulário: o campo (id) e o widget dele (posição em `widgets`) que a página destaca. */
export type FocoNoCampo = { readonly campo: number; readonly widget: number }

export type ValoresDoFormulario = ReadonlyMap<number, ValorDoCampo>

export type CampoPreenchivel = Extract<
  CampoDoFormulario,
  { tipo: ValorDoCampo['tipo'] }
>

const TIPOS_COM_VALOR: readonly CampoDoFormulario['tipo'][] = [
  'texto',
  'caixa',
  'opcoes',
  'suspensa',
  'lista',
]

export function ehPreenchivel(
  campo: CampoDoFormulario,
): campo is CampoPreenchivel {
  return !campo.naoPreenchivel && TIPOS_COM_VALOR.includes(campo.tipo)
}

/** Os campos que viram controle no formulário da tela: os preenchíveis e o texto somente leitura. */
export function temControle(campo: CampoDoFormulario): boolean {
  return (
    (campo.tipo === 'texto' && campo.naoPreenchivel === 'somente_leitura') ||
    ehPreenchivel(campo)
  )
}

function valorDoArquivo(campo: CampoPreenchivel): ValorDoCampo {
  const { id, nome } = campo
  switch (campo.tipo) {
    case 'texto':
      return { id, nome, tipo: 'texto', valor: campo.valor }
    case 'caixa':
      return { id, nome, tipo: 'caixa', marcada: campo.marcada }
    case 'lista':
      return { id, nome, tipo: 'lista', valores: campo.valores }
    default:
      return { id, nome, tipo: campo.tipo, valor: campo.valor }
  }
}

export function valoresIniciais(
  campos: readonly CampoDoFormulario[],
): Map<number, ValorDoCampo> {
  return new Map(
    campos
      .filter(ehPreenchivel)
      .map((campo) => [campo.id, valorDoArquivo(campo)]),
  )
}

function iguais(a: ValorDoCampo, b: ValorDoCampo): boolean {
  if (a.tipo !== b.tipo) return false
  switch (a.tipo) {
    case 'texto':
    case 'opcoes':
    case 'suspensa':
      return a.valor === (b as typeof a).valor
    case 'caixa':
      return a.marcada === (b as typeof a).marcada
    case 'lista': {
      const outros = (b as typeof a).valores
      return (
        a.valores.length === outros.length &&
        a.valores.every((valor) => outros.includes(valor))
      )
    }
  }
}

/** Só os valores que diferem do arquivo, na ordem dos campos: é o que vai ao Worker. */
export function valoresMudados(
  campos: readonly CampoDoFormulario[],
  valores: ValoresDoFormulario,
): ValorDoCampo[] {
  return campos.filter(ehPreenchivel).flatMap((campo) => {
    const valor = valores.get(campo.id)
    return valor && !iguais(valor, valorDoArquivo(campo)) ? [valor] : []
  })
}

function vazio(valor: ValorDoCampo | undefined): boolean {
  if (!valor) return true
  switch (valor.tipo) {
    case 'texto':
      return valor.valor.trim() === ''
    case 'caixa':
      return !valor.marcada
    case 'lista':
      return valor.valores.length === 0
    default:
      return valor.valor === null || valor.valor === ''
  }
}

export function obrigatoriosVazios(
  campos: readonly CampoDoFormulario[],
  valores: ValoresDoFormulario,
): CampoPreenchivel[] {
  return campos
    .filter(ehPreenchivel)
    .filter((campo) => campo.obrigatorio && vazio(valores.get(campo.id)))
}

/** Os botões de opção, sem repetir: primeiro na ordem dos widgets, depois os que só a lista tem e, por fim, o valor do arquivo que não está nela. */
export function opcoesNaOrdem(
  campo: Extract<CampoDoFormulario, { tipo: 'opcoes' | 'suspensa' }>,
): string[] {
  const ordem = new Set<string>()
  for (const { opcao } of campo.widgets) {
    if (opcao !== undefined && campo.opcoes.includes(opcao)) ordem.add(opcao)
  }
  for (const opcao of campo.opcoes) ordem.add(opcao)
  if (campo.valor !== null) ordem.add(campo.valor)
  return [...ordem]
}

const contem = (caixa: Caixa, { x, y }: Ponto) =>
  x >= caixa.x &&
  x <= caixa.x + caixa.largura &&
  y >= caixa.y &&
  y <= caixa.y + caixa.altura

/** O widget de menor área que contém o ponto, entre os campos que têm controle na tela. */
export function campoNoPonto(
  campos: readonly CampoDoFormulario[],
  pagina: number,
  ponto: Ponto,
): FocoNoCampo | null {
  let achado: FocoNoCampo | null = null
  let menor = Infinity
  for (const campo of campos) {
    if (!temControle(campo)) continue
    campo.widgets.forEach((widget, indice) => {
      const area = widget.caixa.largura * widget.caixa.altura
      if (
        widget.pagina === pagina &&
        contem(widget.caixa, ponto) &&
        area < menor
      ) {
        menor = area
        achado = { campo: campo.id, widget: indice }
      }
    })
  }
  return achado
}

function widgetDoFoco(
  campos: readonly CampoDoFormulario[],
  foco: FocoNoCampo | null,
) {
  if (!foco) return null
  const campo = campos.find((c) => c.id === foco.campo)
  const widget = campo?.widgets[foco.widget]
  return campo && widget ? { campo, widget } : null
}

export function paginaDoFoco(
  campos: readonly CampoDoFormulario[],
  foco: FocoNoCampo | null,
): number | null {
  return widgetDoFoco(campos, foco)?.widget.pagina ?? null
}

/** O que a página destaca: os widgets do campo nela; no botão de opção, só os da opção focada. */
export function caixasDoFoco(
  campos: readonly CampoDoFormulario[],
  foco: FocoNoCampo | null,
  pagina: number,
): Caixa[] {
  const focado = widgetDoFoco(campos, foco)
  if (!focado) return []
  const { campo, widget } = focado
  return campo.widgets
    .filter(
      (outro) =>
        outro.pagina === pagina &&
        (campo.tipo !== 'opcoes' || outro.opcao === widget.opcao),
    )
    .map((outro) => outro.caixa)
}

function eixo(
  inicio: number,
  tamanho: number,
  vistaInicio: number,
  vistaTamanho: number,
  margem: number,
): number {
  const de = inicio - margem
  const ate = inicio + tamanho + margem
  if (ate - de >= vistaTamanho || de < vistaInicio) return Math.max(0, de)
  if (ate > vistaInicio + vistaTamanho) return ate - vistaTamanho
  return vistaInicio
}

/** A rolagem que põe a caixa à vista com a margem, ou `null` quando ela já está; a vista é a parte que aparece. */
export function rolagemParaMostrar(
  caixa: Caixa,
  vista: Caixa,
  margem: number,
): Ponto | null {
  const x = eixo(caixa.x, caixa.largura, vista.x, vista.largura, margem)
  const y = eixo(caixa.y, caixa.altura, vista.y, vista.altura, margem)
  return x === vista.x && y === vista.y ? null : { x, y }
}
