import type { Fase } from '@piluvitu/tools/pilulabs'
import { Barra } from './barra'
import { ComoFunciona } from './como-funciona'
import { Contato } from './contato'
import { Duvidas } from './duvidas'
import { Hero } from './hero'
import { Planos } from './planos'
import { Projetos } from './projetos'
import { Rodape } from './rodape'
import { Servicos } from './servicos'
import { Tecnologias } from './tecnologias'
import { WhatsappFlutuante } from './whatsapp-flutuante'

export type ModeloDaLanding = { faseDoBotai: Fase; ano: number }

export function Landing({ faseDoBotai, ano }: ModeloDaLanding) {
  return (
    <>
      <Barra />
      <Hero />
      <main>
        <Servicos />
        <ComoFunciona />
        <Projetos faseDoBotai={faseDoBotai} />
        <Tecnologias />
        <Planos />
        <Duvidas />
        <Contato />
      </main>
      <Rodape ano={ano} />
      <WhatsappFlutuante />
    </>
  )
}
