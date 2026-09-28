import { createContext, useContext } from 'react'

export interface ToastAction {
  label: string
  to: string
}

export type ShowToast = (text: string, action?: ToastAction) => void

export const ToastContext = createContext<ShowToast>(() => undefined)

export const useToast = () => useContext(ToastContext)
