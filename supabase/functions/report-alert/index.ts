// Edge Function `report-alert` (0.24.0) : prévient Eliott à chaque signalement (Apple attend une réaction
// sous 24 h). Appelée par l'app juste après un signalement, avec le jeton de celui qui signale : elle relit
// le signalement par la clé de service (il doit exister et être le sien), puis envoie un e-mail par Resend.
// Sans clé `RESEND_API_KEY` (secret de la fonction), rien n'est envoyé : la vue SQL `reports_ouverts`
// reste la liste de référence (voir la note de session du 13/10/2026).
// PAS DÉPLOYÉE : à déployer avec l'accord d'Eliott, après la migration du socle.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const REASONS: Record<string, string> = {
  sexual: 'Nudité ou contenu sexuel',
  violence: 'Violence',
  harassment: 'Harcèlement',
  privacy: 'Vie privée',
  spam: 'Spam',
  other: 'Autre',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  const { data: who } = jwt ? await admin.auth.getUser(jwt) : { data: null }
  const reporter = who?.user?.id
  if (!reporter) return json({ sent: false }, 401)
  const { report_id: id } = (await req.json().catch(() => ({}))) as { report_id?: string }
  if (!id) return json({ sent: false }, 400)

  const { data: report } = await admin
    .from('reports_ouverts')
    .select('id, reporter, photo_id, user_id, reason, details, created_at, photo_owner, photo_hidden_at')
    .eq('id', id)
    .eq('reporter', reporter)
    .maybeSingle()
  if (!report) return json({ sent: false }, 404)

  const key = Deno.env.get('RESEND_API_KEY')
  const to = Deno.env.get('ALERT_EMAIL') ?? 'devineliott@gmail.com'
  if (!key) return json({ sent: false, reason: 'RESEND_API_KEY absente' })
  const target = report.photo_id ? `la photo ${report.photo_id} (de ${report.photo_owner})` : `l'utilisateur ${report.user_id}`
  const text = [
    `Nouveau signalement PICTI : ${REASONS[report.reason] ?? report.reason}`,
    `Cible : ${target}${report.photo_hidden_at ? ' — masquée pour tous (3 signalements)' : ''}`,
    report.details ? `Précisions : ${report.details}` : '',
    `Signalé par ${report.reporter} le ${report.created_at}`,
    '',
    'À traiter sous 24 h : Supabase › SQL Editor › select * from reports_ouverts order by created_at;',
  ]
    .filter(Boolean)
    .join('\n')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'PICTI <onboarding@resend.dev>', to: [to], subject: `PICTI · signalement (${REASONS[report.reason] ?? report.reason})`, text }),
  })
  return json({ sent: res.ok })
})
