import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { aplicarTema, temaSalvo } from './lib/theme'
import './styles.css'

// index.html já aplicou a classe .dark antes do paint (evita flash); esta
// chamada reconcilia o estado e, no modo "sistema", registra o listener de
// matchMedia que mantém o tema reagindo a mudanças do SO enquanto a aba
// ficar aberta (o script inline só roda uma vez, no parse).
aplicarTema(temaSalvo())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
