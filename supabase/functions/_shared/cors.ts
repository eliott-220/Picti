// En-têtes CORS des Edge Functions : appelées depuis le site (picti.vercel.app) et l'app (capacitor://localhost).
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
