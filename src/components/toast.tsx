import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { navigate } from '../router'
import { ToastContext, type ShowToast, type ToastAction } from './toastContext'

interface ToastMessage {
  id: number
  text: string
  action?: ToastAction
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Un toast proposant une action concerne l'écran qui l'a émis : on le retire en changeant d'écran.
  useEffect(() => {
    const onNavigate = () => setToast((t) => (t?.action ? null : t))
    window.addEventListener('hashchange', onNavigate)
    return () => window.removeEventListener('hashchange', onNavigate)
  }, [])

  const show = useCallback<ShowToast>((text, action) => {
    clearTimeout(timer.current)
    const id = Date.now()
    setToast({ id, text, action })
    timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), action ? 5000 : 3500)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status" key={toast.id}>
          <span>{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                setToast(null)
                navigate(toast.action!.to)
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  )
}
