import { useEffect, useState } from 'react'
import { useStore } from './storeContext'
import type { PublicProfile } from './types'

/** Profils publics déjà lus pendant cette visite : `<moi>:<lui>` → profil (null : inexistant). */
const cache = new Map<string, PublicProfile | null>()

/**
 * Profil public d'un auteur (ville, inscription), lu une fois par visite pour la fiche des photos.
 * `undefined` pendant le chargement ; l'amitié, elle, se lit dans la liste d'amis du store.
 */
export function usePublicProfile(personId: string | null): PublicProfile | null | undefined {
  const { userId, fetchPublicProfile } = useStore()
  const key = personId ? `${userId}:${personId}` : null
  const [, setLoaded] = useState(0)

  useEffect(() => {
    if (!key || !personId || cache.has(key)) return
    let alive = true
    fetchPublicProfile(personId)
      .then((p) => cache.set(key, p))
      .catch(() => cache.set(key, null))
      .finally(() => alive && setLoaded((n) => n + 1))
    return () => {
      alive = false
    }
  }, [key, personId, fetchPublicProfile])

  return key ? cache.get(key) : null
}

/** Profil public relu (profil d'une personne) : la fiche des photos profite de la version à jour. */
export function rememberPublicProfile(userId: string, profile: PublicProfile) {
  cache.set(`${userId}:${profile.id}`, profile)
}
