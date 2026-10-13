// Edge Function `delete-account` (0.24.0) : Paramètres › Compte › « Supprimer mon compte ».
// Appelée par l'app avec le jeton de l'utilisateur ; la clé de service ne quitte jamais le serveur.
// Logique : `../_shared/accountDeletion.ts`. PAS DÉPLOYÉE : à déployer avec l'accord d'Eliott, après la
// migration `20261013150000_socle_testeurs` (table `storage_cleanup`).

import { createClient } from 'npm:@supabase/supabase-js@2'
import { deleteAccount, type DeletionBackend } from '../_shared/accountDeletion.ts'
import { corsHeaders } from '../_shared/cors.ts'

const BUCKET = 'photos'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Méthode non permise', { status: 405, headers: corsHeaders })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null

  const backend: DeletionBackend = {
    async userOf(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    async photoPaths(userId) {
      const { data, error } = await admin.from('photos').select('image_path, thumb_path').eq('owner', userId)
      if (error) throw error
      return (data ?? []).flatMap((r) => [r.image_path as string, r.thumb_path as string])
    },
    async storageFiles(userId) {
      const paths: string[] = []
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.storage.from(BUCKET).list(userId, { limit: 1000, offset })
        if (error) throw error
        paths.push(...(data ?? []).map((f) => `${userId}/${f.name}`))
        if (!data || data.length < 1000) return paths
      }
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw error
    },
    async removeFiles(paths) {
      // Un fichier déjà absent n'est pas une erreur ; une erreur du lot : tout le lot est à réessayer.
      const { error } = await admin.storage.from(BUCKET).remove(paths)
      return error ? paths : []
    },
    async queueCleanup(paths) {
      const { error } = await admin.from('storage_cleanup').upsert(paths.map((path) => ({ path })))
      if (error) throw error
    },
    async pendingCleanup(limit) {
      const { data, error } = await admin.from('storage_cleanup').select('path').order('created_at').limit(limit)
      if (error) throw error
      return (data ?? []).map((r) => r.path as string)
    },
    async clearCleanup(paths) {
      if (!paths.length) return
      const { error } = await admin.from('storage_cleanup').delete().in('path', paths)
      if (error) throw error
    },
    log: (message) => console.error(`[delete-account] ${message}`),
  }

  const result = await deleteAccount(backend, jwt)
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
