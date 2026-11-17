import { useState } from 'react'
import type {
  CampoDoFormulario,
  Formulario,
  ValorDoCampo,
} from '@piluvitu/tools/pdf-regras'
import {
  obrigatoriosVazios,
  valoresIniciais,
  valoresMudados,
  type FocoNoCampo,
  type ValoresDoFormulario,
} from './formulario'
import { TEXTOS } from './textos'

const SEM_CAMPOS: readonly CampoDoFormulario[] = []

export function camposDo(
  formulario: Formulario | null,
): readonly CampoDoFormulario[] {
  return formulario?.tipo === 'acroform' ? formulario.campos : SEM_CAMPOS
}

type Estado = {
  formulario: Formulario | null
  valores: ValoresDoFormulario
  erros: ReadonlyMap<number, string>
  foco: FocoNoCampo | null
  achatar: boolean
}

const inicial = (formulario: Formulario | null): Estado => ({
  formulario,
  valores: valoresIniciais(camposDo(formulario)),
  erros: new Map(),
  foco: null,
  achatar: false,
})

/**
 * O estado do formulário do PDF aberto: os valores, os erros de cada campo, o campo focado e o achatar.
 * Recomeça a cada formulário (outro documento) e fica fora do desfazer da cena: cada controle já mostra
 * o valor, e o campo de texto tem o desfazer do navegador.
 */
export function useFormularioDoPdf(formulario: Formulario | null) {
  const [guardado, setGuardado] = useState(() => inicial(formulario))
  let estado = guardado
  if (guardado.formulario !== formulario) {
    estado = inicial(formulario)
    setGuardado(estado)
  }
  const campos = camposDo(formulario)

  function mudar(valor: ValorDoCampo, recusados: readonly string[] = []) {
    setGuardado((atual) => {
      if (atual.formulario !== formulario) return atual
      const erros = new Map(atual.erros)
      if (recusados.length) {
        erros.set(valor.id, TEXTOS.formulario.foraDoWinAnsi(recusados))
      } else {
        erros.delete(valor.id)
      }
      return {
        ...atual,
        valores: new Map(atual.valores).set(valor.id, valor),
        erros,
      }
    })
  }

  return {
    campos,
    valores: estado.valores,
    erros: estado.erros,
    foco: estado.foco,
    achatar: estado.achatar,
    mudados: valoresMudados(campos, estado.valores),
    vazios: obrigatoriosVazios(campos, estado.valores),
    mudar,
    focar: (foco: FocoNoCampo | null) =>
      setGuardado((atual) => ({ ...atual, foco })),
    mudarAchatar: (achatar: boolean) =>
      setGuardado((atual) => ({ ...atual, achatar })),
  }
}
