import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { aplicarTema, temaSalvo } from './lib/theme'
import './styles.css'

// index.html já aplicou a classe .dark antes do paint (evita flash); esta
// chamada reconcilia o estado e, no modo "sistema", registra o listener de
// matchMedia que mantém o tema reagindo a mudanças do SO enquanto a aba
// ficar aberta (o script inline só roda uma vez, no parse).
//
// M5 (fix final): `temaSalvo()`/`aplicarTema()` leem E ESCREVEM
// `localStorage` (ver src/lib/theme.ts), que pode lançar (storage
// particionado/privado) em vez de só faltar. Esta chamada roda ANTES de
// `createRoot(...).render(...)` — sem o try/catch, uma exceção aqui
// impede o React de montar NADA: não é "perde o tema", é a tela inteira
// em branco. Falhando, segue pro render sem mexer no tema (o que
// `index.html` já aplicou via classe `.dark` continua valendo).
try {
  aplicarTema(temaSalvo())
} catch {
  // localStorage indisponível — sem tema dinâmico nesta sessão, mas o
  // app monta.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
