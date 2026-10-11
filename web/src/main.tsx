import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './design/base.css'

const root = createRoot(document.getElementById('root')!)
const render = (screen: ReactNode) => root.render(<StrictMode>{screen}</StrictMode>)

// A demonstração só entra no pacote quando compilada no modo `demo`. A comparação fica
// escrita aqui, por extenso, para o empacotador conseguir descartar o ramo nos outros modos.
if (import.meta.env.MODE === 'demo') void import('./demo/DemoSite').then(({ DemoSite }) => render(<DemoSite />))
else render(<App />)
