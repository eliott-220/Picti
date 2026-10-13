// Suppression d'un compte (0.24.0, Edge Function `delete-account`) — logique sans dépendance, testée par
// Vitest (`accountDeletion.test.ts`) ; le branchement à Supabase est dans `../delete-account/index.ts`.
//
// Tout ou rien côté base : l'utilisateur `auth` est effacé en une seule transaction, et toutes ses lignes
// partent avec lui (clés étrangères `on delete cascade` : profil, photos, captures, likes, amitiés,
// notifications, abonnements push, signalements, blocages ; les reproductions faites par d'autres gardent
// leur photo, sans lien vers l'originale). Les fichiers du stockage ne sont pas liés à la base : ils sont
// listés AVANT (si la liste échoue, rien n'est effacé), puis supprimés APRÈS la base ; un fichier qui
// résiste est noté (`storage_cleanup`) et réessayé à chaque appel suivant.

export interface DeletionBackend {
  /** Identifiant du compte du jeton, null s'il est invalide ou expiré. */
  userOf(jwt: string): Promise<string | null>
  /** Chemins des images connues de la base (photos et vignettes). */
  photoPaths(userId: string): Promise<string[]>
  /** Fichiers du dossier du compte dans le stockage. */
  storageFiles(userId: string): Promise<string[]>
  /** Efface l'utilisateur (et, en cascade, toutes ses lignes) — une transaction. */
  deleteUser(userId: string): Promise<void>
  /** Efface des fichiers ; renvoie ceux qui n'ont pas pu l'être. */
  removeFiles(paths: string[]): Promise<string[]>
  /** Note des fichiers à réessayer. */
  queueCleanup(paths: string[]): Promise<void>
  /** Fichiers notés par un appel précédent. */
  pendingCleanup(limit: number): Promise<string[]>
  /** Retire des fichiers de la liste à réessayer. */
  clearCleanup(paths: string[]): Promise<void>
  log(message: string): void
}

export interface DeletionResult {
  status: number
  body: { deleted: boolean; files?: number; pending?: number; error?: string }
}

/** Fichiers effacés par lot (limite de l'API du stockage). */
export const REMOVE_BATCH = 100

const unique = (paths: string[]) => [...new Set(paths.filter(Boolean))]

/** Un chemin du stockage appartient-il bien au compte (son dossier) ? Garde-fou contre toute erreur. */
export function ownsPath(userId: string, path: string): boolean {
  return path.startsWith(`${userId}/`) && !path.includes('..')
}

async function removeAll(backend: DeletionBackend, paths: string[]): Promise<string[]> {
  const failed: string[] = []
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    try {
      failed.push(...(await backend.removeFiles(paths.slice(i, i + REMOVE_BATCH))))
    } catch {
      failed.push(...paths.slice(i, i + REMOVE_BATCH))
    }
  }
  return failed
}

export async function deleteAccount(backend: DeletionBackend, jwt: string | null): Promise<DeletionResult> {
  if (!jwt) return { status: 401, body: { deleted: false, error: 'Connexion requise' } }
  const userId = await backend.userOf(jwt).catch(() => null)
  if (!userId) return { status: 401, body: { deleted: false, error: 'Connexion requise' } }

  // 1. Ce qu'il faudra effacer du stockage : si on ne peut pas le savoir, on n'efface rien.
  let files: string[]
  try {
    const [known, stored] = await Promise.all([backend.photoPaths(userId), backend.storageFiles(userId)])
    files = unique([...known, ...stored]).filter((p) => ownsPath(userId, p))
  } catch (e) {
    backend.log(`liste des fichiers impossible : ${String(e)}`)
    return { status: 500, body: { deleted: false, error: 'Rien n’a été effacé' } }
  }

  // 2. La base, en une transaction : échec = rien d'effacé.
  try {
    await backend.deleteUser(userId)
  } catch (e) {
    backend.log(`suppression du compte impossible : ${String(e)}`)
    return { status: 500, body: { deleted: false, error: 'Rien n’a été effacé' } }
  }

  // 3. Les fichiers : ceux qui résistent sont notés et réessayés plus tard.
  const failed = await removeAll(backend, files)
  if (failed.length) {
    await backend.queueCleanup(failed).catch((e) => backend.log(`fichiers à réessayer non notés : ${failed.join(', ')} (${String(e)})`))
  }

  // 4. Au passage, les fichiers laissés par un appel précédent.
  try {
    const pending = await backend.pendingCleanup(REMOVE_BATCH)
    if (pending.length) {
      const still = new Set(await removeAll(backend, pending))
      await backend.clearCleanup(pending.filter((p) => !still.has(p)))
    }
  } catch (e) {
    backend.log(`nettoyage des fichiers en attente : ${String(e)}`)
  }

  return { status: 200, body: { deleted: true, files: files.length - failed.length, pending: failed.length } }
}
