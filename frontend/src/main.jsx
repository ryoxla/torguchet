import React from 'react'
import ReactDOM from 'react-dom/client'
import { loadConfig, useAppearance } from './utils/globals.jsx'
// Шрифты стилей A/B/C лежат в сборке (assets) — работают без интернета.
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/manrope'
import './index.css'

// Сначала /api/config (режим и версия), затем отдельный чанк App — как в сборке ноября 2026.
loadConfig().then(() => import('./App.jsx')).then(({ default: App }) => {
  // Корень подписан на смену оформления: перерисовывает приложение без перезагрузки,
  // состояние экранов (открытый документ, фильтры) сохраняется.
  function Root(){
    useAppearance();
    return <App />;
  }
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  )
})
