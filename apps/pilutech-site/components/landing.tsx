import type { Fase } from '@piluvitu/tools/pilulabs'
import { ComoFunciona } from './como-funciona'
import { Duvidas } from './duvidas'
import { Hero } from './hero'
import { Planos } from './planos'
import { Projetos } from './projetos'
import { Servicos } from './servicos'
import { Tecnologias } from './tecnologias'

export type ModeloDaLanding = { faseDoBotai: Fase }

export function Landing({ faseDoBotai }: ModeloDaLanding) {
  return (
    <>
      <Hero />
      <main>
        <Servicos />
        <ComoFunciona />
        <Projetos faseDoBotai={faseDoBotai} />
        <Tecnologias />
        <Planos />
        <Duvidas />
      </main>
    </>
  )
}
