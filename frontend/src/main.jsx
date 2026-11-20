import React from 'react'
import ReactDOM from 'react-dom/client'
import { loadConfig } from './utils/globals.jsx'
import './index.css'

// Сначала /api/config (режим и версия), затем отдельный чанк App — как в сборке ноября 2026.
loadConfig().then(() => import('./App.jsx')).then(({ default: App }) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
