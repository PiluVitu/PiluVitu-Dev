import './tema'
import { config } from '@fortawesome/fontawesome-svg-core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../styles.css'
import { App } from './App'

config.autoAddCss = false

const raiz = document.getElementById('root')
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
