import { RoundButton } from '../components/ui'
import { CONTACT_EMAIL, TERMS_VERSION } from '../config'
import { goBack, navigate } from '../router'

/**
 * Conditions d'utilisation et confidentialité (0.24.0, exigées par Apple : règles 1.2 et 5.1.1) — Paramètres
 * › À propos, la case de l'inscription, et le site (`/cgu`, `/confidentialite`, pour App Store Connect).
 * BROUILLON à faire valider par Eliott. Lisible sans compte.
 */
export function Legal({ privacy = false }: { privacy?: boolean }) {
  const back = () => (window.history.length > 1 ? goBack() : navigate('/', { replace: true }))
  return (
    <main className="screen page legal-page">
      <header className="card red page-header compact">
        <RoundButton icon="back" label="Retour" onClick={back} className="back-btn" />
        <h1 className="display">{privacy ? 'Confidentialité' : 'Conditions d’utilisation'}</h1>
        <p className="subtitle">Version du {TERMS_VERSION.split('-').reverse().join('/')}</p>
      </header>
      <article className="card white legal-text">
        <p className="legal-draft">Brouillon — à faire valider</p>
        {privacy ? <PrivacyText /> : <TermsText />}
        <h2>Contact</h2>
        <p>
          Pour toute question, demande d’accès ou d’effacement : <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <p className="legal-links">
          <a href={privacy ? '#/cgu' : '#/confidentialite'}>{privacy ? 'Conditions d’utilisation' : 'Politique de confidentialité'}</a>
        </p>
      </article>
    </main>
  )
}

function TermsText() {
  return (
    <>
      <h2>Qui édite PICTI ?</h2>
      <p>
        PICTI est édité par Eliott Devin, à La Rochelle (France), d’après le concept de Yannick Devin et Denis Servais.
        L’application est en phase de test.
      </p>
      <h2>Ce que fait PICTI</h2>
      <p>
        PICTI pose tes photos dans le monde réel, à l’endroit et dans la direction exacts où tu les as prises, et te
        permet de retrouver celles des autres sur place. Un compte (e-mail et mot de passe) est nécessaire.
      </p>
      <h2>Tes photos</h2>
      <p>
        Tu gardes tous les droits sur tes photos. En les publiant, tu nous autorises à les héberger et à les montrer
        selon la visibilité que tu choisis : tout le monde (Public), tes amis (Amis) ou toi seul (Privé). Une photo
        publique est visible par tous, à l’endroit exact où elle a été prise. Ne publie que des images que tu as le
        droit de partager.
      </p>
      <h2>Tolérance zéro</h2>
      <p>
        Sont interdits : les contenus illégaux, sexuels ou pornographiques, violents ou haineux, le harcèlement, les
        menaces, le spam, et les photos qui exposent la vie privée d’autrui (visage reconnaissable, plaque
        d’immatriculation, intérieur d’une maison) sans son accord. Tout contenu de ce type est retiré et les
        utilisateurs abusifs sont exclus, sans préavis.
      </p>
      <h2>Signaler et bloquer</h2>
      <p>
        Depuis la fiche d’une photo ou le profil d’un utilisateur, « ⋯ » › « Signaler ». La photo signalée disparaît
        aussitôt pour toi ; après trois signalements de comptes différents, elle est masquée pour tout le monde en
        attendant notre décision. Nous examinons chaque signalement sous 24 heures. « Bloquer » coupe tout lien entre
        vos deux comptes (photos, notifications, amitié) ; la personne n’est pas prévenue.
      </p>
      <h2>Prudence sur place</h2>
      <p>
        Chasser une photo se fait à pied, dans l’espace public. Reste attentif à la circulation et à ce qui
        t’entoure, respecte les propriétés privées et les règles locales.
      </p>
      <h2>Ton compte</h2>
      <p>
        Tu peux supprimer ton compte à tout moment : Paramètres › Compte › « Supprimer mon compte ». Tes photos, tes
        captures et tes données sont alors effacées. Les reproductions faites par d’autres à partir de tes photos
        restent à eux.
      </p>
      <h2>Évolution</h2>
      <p>
        Ces conditions peuvent changer ; une nouvelle version te sera présentée à l’ouverture de l’app. Les offres
        payantes (Premium) seront décrites avant leur mise en vente.
      </p>
    </>
  )
}

function PrivacyText() {
  return (
    <>
      <h2>Responsable</h2>
      <p>Eliott Devin, éditeur de PICTI (La Rochelle, France).</p>
      <h2>Données collectées et à quoi elles servent</h2>
      <ul>
        <li>
          <strong>Compte</strong> : e-mail et mot de passe (chiffré), pseudo, ville facultative — pour te connecter et
          te présenter aux autres.
        </li>
        <li>
          <strong>Photos</strong> : l’image et sa vignette, la date de prise de vue, la position, la direction et
          l’inclinaison du téléphone — pour les poser dans le monde et les faire retrouver. Les métadonnées des
          fichiers (EXIF, GPS, modèle du téléphone) sont retirées avant l’envoi.
        </li>
        <li>
          <strong>Activité</strong> : amis, captures, likes, notifications, signalements et blocages, date
          d’acceptation des conditions.
        </li>
        <li>
          <strong>Capteurs</strong> : caméra, position, boussole et mouvements, utilisés sur ton téléphone pendant la
          prise de vue et la chasse. Ta position n’est envoyée qu’avec une photo que tu publies ou pour chercher les
          photos autour de toi.
        </li>
        <li>
          <strong>Versions de test</strong> : des journaux de position, de boussole et de suivi visuel peuvent être
          enregistrés sur le téléphone de test pour améliorer la précision ; ils ne sont pas envoyés.
        </li>
      </ul>
      <h2>Où elles sont hébergées</h2>
      <p>
        Supabase (base de données, comptes et images, serveurs à Paris) et Vercel (site web). Aucune donnée n’est
        vendue ni utilisée pour de la publicité.
      </p>
      <h2>Qui les voit</h2>
      <p>
        Selon la visibilité de chaque photo : tout le monde, tes amis ou toi seul. Ton e-mail n’est jamais montré aux
        autres utilisateurs.
      </p>
      <h2>Durée</h2>
      <p>
        Tant que ton compte existe. Quand tu le supprimes, tout est effacé (base et fichiers) ; les copies de
        sauvegarde de l’hébergeur disparaissent ensuite selon ses délais.
      </p>
      <h2>Tes droits</h2>
      <p>
        Accès, rectification, effacement (« Supprimer mon compte », dans Paramètres › Compte), opposition et
        portabilité : écris-nous à l’adresse ci-dessous. Tu peux aussi saisir la CNIL (cnil.fr).
      </p>
    </>
  )
}
