import { useState, type FormEvent } from 'react'
import { Icon, Logo } from '../components/Icon'
import { authErrorMessage } from '../data/auth'
import { supabase } from '../data/supabase'

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

type Mode = 'inscription' | 'connexion'

/** Première connexion : présentation du géocadrage, création de compte ou connexion. */
export function Auth() {
  const [mode, setMode] = useState<Mode>('inscription')
  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

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
            emailRedirectTo: window.location.origin,
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
        <div className="chips auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={signup}
            className={`chip ${signup ? 'selected' : ''}`}
            onClick={() => setMode('inscription')}
          >
            Créer un compte
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!signup}
            className={`chip ${!signup ? 'selected' : ''}`}
            onClick={() => setMode('connexion')}
          >
            Se connecter
          </button>
        </div>

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

        {message && <p className={`form-message ${message.error ? 'error' : ''}`}>{message.text}</p>}

        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Un instant…' : signup ? 'Créer mon compte' : 'Me connecter'}
        </button>
        {signup && <p className="fine">Vos photos sont publiques par défaut ; vous pouvez les réserver à vos amis ou les garder privées.</p>}
      </form>
    </main>
  )
}
