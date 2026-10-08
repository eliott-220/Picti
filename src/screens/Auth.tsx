import { useState, type FormEvent } from 'react'
import { Icon, Logo } from '../components/Icon'
import { authErrorMessage, authLinkErrorMessage } from '../data/auth'
import { rememberInvite } from '../data/invite'
import { authLinkError, supabase } from '../data/supabase'
import { authRedirectUrl, isNative } from '../native'
import { parseHash } from '../router'

const STEPS = [
  {
    icon: 'scan',
    title: 'Géocadrez en direct',
    text: 'Chaque photo prise avec PICTI garde la position et l’angle exacts de la prise de vue.',
  },
  {
    icon: 'pin',
    title: 'Partagez-la sur place',
    text: 'Elle attend, invisible, à l’endroit où vous l’avez prise : ceux qui passent par là peuvent la découvrir.',
  },
  {
    icon: 'flag',
    title: 'Chassez celles des autres',
    text: 'Retrouvez leur point de vue exact : l’écran devient une fenêtre sur le passé.',
  },
] as const

type Mode = 'inscription' | 'connexion' | 'oubli'

/** Lien d'invitation ouvert sans être connecté : le code est gardé pour après la connexion. */
function invitationInLink(): boolean {
  const route = parseHash(window.location.hash)
  if (route.name !== 'ami') return false
  rememberInvite(route.code)
  return true
}

/** Première connexion : présentation du géocadrage, création de compte ou connexion. */
export function Auth() {
  // Lien de l'e-mail expiré : on revient directement sur la demande d'un nouveau lien.
  const [mode, setMode] = useState<Mode>(authLinkError ? 'oubli' : 'inscription')
  const [invited] = useState(invitationInLink)
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(
    authLinkError ? { text: authLinkErrorMessage(authLinkError), error: true } : null,
  )

  function switchMode(next: Mode) {
    setMode(next)
    setMessage(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      if (mode === 'inscription') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim(), city: city.trim() },
            emailRedirectTo: authRedirectUrl(),
          },
        })
        if (error) throw error
        if (!data.session) {
          setMessage({
            text: 'Compte créé ! Ouvrez le lien de confirmation reçu par e-mail, puis connectez-vous.',
            error: false,
          })
          setMode('connexion')
        }
      } else if (mode === 'oubli') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: authRedirectUrl(),
        })
        if (error) throw error
        // Même message que le compte existe ou non : on ne révèle pas qui est inscrit.
        // Dans la coque, le lien s'ouvre dans le navigateur (picti.vercel.app), pas dans l'app.
        setMessage({
          text: isNative()
            ? 'Si un compte existe avec cette adresse, vous allez recevoir un e-mail : son lien ouvre PICTI dans le navigateur pour choisir un nouveau mot de passe. Revenez ensuite ici pour vous connecter.'
            : 'Si un compte existe avec cette adresse, vous allez recevoir un e-mail : ouvrez le lien qu’il contient sur ce téléphone pour choisir un nouveau mot de passe.',
          error: false,
        })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      }
    } catch (err) {
      setMessage({ text: authErrorMessage(err instanceof Error ? err.message : String(err)), error: true })
    } finally {
      setBusy(false)
    }
  }

  const signup = mode === 'inscription'
  const forgot = mode === 'oubli'

  return (
    <main className="welcome">
      <header className="welcome-hero">
        <Logo size={72} />
        <h1>PICTI</h1>
        <p>Redécouvrez chaque photo à l’endroit précis et sous l’angle exact où elle a été prise.</p>
      </header>

      <section className="card salmon welcome-steps">
        {STEPS.map((s) => (
          <div className="step" key={s.title}>
            <span className="step-icon">
              <Icon name={s.icon} />
            </span>
            <div>
              <h2>{s.title}</h2>
              <p>{s.text}</p>
            </div>
          </div>
        ))}
      </section>

      <form className="card white welcome-form" onSubmit={submit}>
        {invited && (
          <p className="form-message">
            Un ami vous invite sur PICTI : créez votre compte (ou connectez-vous), son invitation vous attendra.
          </p>
        )}
        <div className="chips auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={signup}
            className={`chip ${signup ? 'selected' : ''}`}
            onClick={() => switchMode('inscription')}
          >
            Créer un compte
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!signup}
            className={`chip ${!signup ? 'selected' : ''}`}
            onClick={() => switchMode('connexion')}
          >
            Se connecter
          </button>
        </div>

        {forgot && (
          <p className="form-intro">Indiquez l’adresse de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
        )}
        {signup && (
          <>
            <label>
              Prénom
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
            </label>
            <label>
              Ville
              <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
            </label>
          </>
        )}
        <label>
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            required
          />
        </label>
        {!forgot && (
          <label>
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={signup ? 'new-password' : 'current-password'}
              minLength={6}
              required
            />
          </label>
        )}

        {message && <p className={`form-message ${message.error ? 'error' : ''}`}>{message.text}</p>}

        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Un instant…' : signup ? 'Créer mon compte' : forgot ? 'Recevoir le lien' : 'Me connecter'}
        </button>
        {mode === 'connexion' && (
          <button type="button" className="text-link" onClick={() => switchMode('oubli')}>
            Mot de passe oublié ?
          </button>
        )}
        {forgot && (
          <button type="button" className="text-link" onClick={() => switchMode('connexion')}>
            Retour à la connexion
          </button>
        )}
        {signup && <p className="fine">Vos photos sont réservées à vos amis par défaut ; vous pouvez les rendre publiques ou les garder privées.</p>}
      </form>
    </main>
  )
}
