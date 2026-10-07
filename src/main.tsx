import '@fontsource-variable/outfit'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/toast'
import { UpdateBanner } from './components/UpdateBanner'
import { applyPlatform } from './platform'
import './styles.css'

applyPlatform()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
      <UpdateBanner />
    </ToastProvider>
  </StrictMode>,
)
