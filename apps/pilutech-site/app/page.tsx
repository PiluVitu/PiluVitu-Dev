import { CabecalhoSecao } from '@/components/cabecalho-secao'

export default function Home() {
  return (
    <main className="dark bg-background text-foreground min-h-svh px-6 py-16">
      <h1 className="text-4xl font-extrabold">PiluTech</h1>
      <CabecalhoSecao
        id="esqueleto-titulo"
        rotulo="Em construção"
        contagem={0}
        titulo="Landing da PiluTech"
      />
    </main>
  )
}
