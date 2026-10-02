import { Landing } from '@/components/landing'
import { lerUrlsDasLojas } from '@/lib/cms'
import { modeloDaLanding } from '@/lib/modelo'

export default function Home() {
  return <Landing {...modeloDaLanding(lerUrlsDasLojas())} />
}
