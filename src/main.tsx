import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css'
// Sistema visual del módulo de Consolidación (Fase 2K.1), separado del
// index.css general para poder evolucionarlo sin tocar el resto.
import './styles/consolidacion.css'

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </StrictMode>
)
