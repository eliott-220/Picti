import '@fontsource-variable/outfit'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/toast'
import { UpdateBanner } from './components/UpdateBanner'
import './styles.css'
import { startUpdateChecks } from './update'

startUpdateChecks()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
      <UpdateBanner />
    </ToastProvider>
  </StrictMode>,
)
