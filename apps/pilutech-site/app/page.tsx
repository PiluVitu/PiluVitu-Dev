import { Landing } from '@/components/landing'
import { lerFaseDoBotai } from '@/lib/cms'

export default function Home() {
  return (
    <Landing faseDoBotai={lerFaseDoBotai()} ano={new Date().getFullYear()} />
  )
}
