import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import '@fontsource/b612/400.css'
import '@fontsource/b612/700.css'
import '@fontsource/b612-mono/400.css'
import '@fontsource/b612-mono/700.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
