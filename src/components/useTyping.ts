import { useEffect, useState } from 'react'

/** Champs qui ouvrent le clavier (pas les cases, curseurs ni boutons). */
const TEXT_FIELDS =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="file"]), textarea, select, [contenteditable="true"]'

const typingIn = (el: Element | null) => !!el?.matches?.(TEXT_FIELDS)

/** Vrai pendant une saisie au clavier (un champ de texte a le focus) : la barre du bas se cache. */
export function useTyping(): boolean {
  const [typing, setTyping] = useState(() => typingIn(document.activeElement))
  useEffect(() => {
    // Au départ du focus, le suivant n'est pas encore connu : relu juste après.
    const update = () => window.setTimeout(() => setTyping(typingIn(document.activeElement)), 0)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])
  return typing
}
