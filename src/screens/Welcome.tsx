import { useState, type FormEvent } from 'react'
import { Icon, Logo } from '../components/Icon'
import { useStore } from '../data/storeContext'

const STEPS = [
  {
    icon: 'scan',
    title: 'Géocadrez en direct',
    text: 'Chaque photo prise avec PICTI garde la position et l’angle exacts de la prise de vue.',
  },
  {
    icon: 'image',
    title: 'Ou en différé',
    text: 'Importez vos anciennes photos : PICTI lit leurs données, ou vous les recalez sur place.',
  },
  {
    icon: 'flag',
    title: 'Chassez-les in situ',
    text: 'Retournez sur les lieux : l’écran devient une fenêtre sur le passé.',
  },
] as const

/** Première connexion : présentation du géocadrage et création du profil. */
export function Welcome() {
  const { saveProfile } = useStore()
  const [name, setName] = useState('')
  const [city, setCity] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    saveProfile({ name: name.trim(), city: city.trim() })
  }

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
        <h2>Faisons connaissance</h2>
        <label>
          Prénom
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required />
        </label>
        <label>
          Ville
          <input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
        </label>
        <button type="submit" className="btn" disabled={!name.trim()}>
          Commencer
        </button>
        <p className="fine">Vos photos restent sur cet appareil.</p>
      </form>
    </main>
  )
}
