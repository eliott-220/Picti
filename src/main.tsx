import '@fontsource-variable/outfit'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ToastProvider } from './components/toast'
import { UpdateBanner } from './components/UpdateBanner'
import { listenForAppLinks } from './native'
import './styles.css'

void listenForAppLinks()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <App />
      <UpdateBanner />
    </ToastProvider>
  </StrictMode>,
)
